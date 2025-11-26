// ABOUTME: Worker process that consumes from RabbitMQ, maintains stateful SDK sessions in memory.
// ABOUTME: Processes messages with Agent SDK and publishes streaming responses to reply queues.

import { query } from "@anthropic-ai/claude-agent-sdk";
import amqp, { Channel, ChannelModel, ConsumeMessage } from "amqplib";
import dotenv from "dotenv";
import {
  ToolResultForPersistence,
  transformToAgentEvents,
} from "./eventTransformer.js";
import { GeoFeatureExtractor } from "./featureExtractor.js";
import { createGeoTools } from "./mcpServer.js";
import { createMessage, ensureConversation } from "./models/conversation.js";
import { createGeoFeature } from "./models/geoFeature.js";

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  "ANTHROPIC_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "RABBITMQ_URL",
];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(
    `[WORKER] Missing required environment variables: ${missingEnvVars.join(
      ", "
    )}`
  );
  console.error(
    "[WORKER] Please check your .env file and ensure all required variables are set"
  );
  process.exit(1);
}

const RABBITMQ_URL = process.env.RABBITMQ_URL!;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-5";

// Queue configuration
const REQUESTS_QUEUE = "chat.requests";

// Model pricing (per million tokens, in USD)
// Source: https://docs.anthropic.com/en/docs/about-claude/pricing
const MODEL_PRICING: Record<
  string,
  {
    input: number;
    output: number;
    cacheWrite5m: number;
    cacheWrite1h: number;
    cacheRead: number;
  }
> = {
  "claude-opus-4-5": {
    input: 5.0,
    output: 25.0,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10.0,
    cacheRead: 0.5,
  },
  "claude-sonnet-4-5": {
    input: 3.0,
    output: 15.0,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6.0,
    cacheRead: 0.3,
  },
};

// Stateful session storage - maps conversationId to SDK session_id
const sessionIds = new Map<string, string>();

// Feature extractor for geo tools
const featureExtractor = new GeoFeatureExtractor();

interface UsageMetrics {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cache_creation?: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  };
  service_tier?: string;
}

function logUsageAndCost(conversationId: string, usage: UsageMetrics): void {
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  const cache5mTokens = usage.cache_creation?.ephemeral_5m_input_tokens || 0;
  const cache1hTokens = usage.cache_creation?.ephemeral_1h_input_tokens || 0;

  const pricing = MODEL_PRICING[CLAUDE_MODEL];
  if (!pricing) {
    console.warn(
      `[WORKER] Unknown model pricing for ${CLAUDE_MODEL}, cost calculation skipped`
    );
    return;
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const cacheWrite5mCost = (cache5mTokens / 1_000_000) * pricing.cacheWrite5m;
  const cacheWrite1hCost = (cache1hTokens / 1_000_000) * pricing.cacheWrite1h;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cacheRead;
  const totalCost =
    inputCost +
    outputCost +
    cacheWrite5mCost +
    cacheWrite1hCost +
    cacheReadCost;

  console.log(
    `[WORKER] Usage for ${conversationId}: ` +
      `${inputTokens} input + ${outputTokens} output + ` +
      `${cacheReadTokens} cache read + ` +
      `${cache5mTokens} cache write (5m) + ${cache1hTokens} cache write (1h) = ` +
      `$${totalCost.toFixed(4)}`
  );
}

async function processRequest(
  channel: Channel,
  replyTo: string,
  conversationId: string,
  message: string
): Promise<void> {
  console.log(
    `[WORKER] Processing request for conversation: ${conversationId}`
  );

  // Collect tool results for async persistence
  const toolResults: ToolResultForPersistence[] = [];

  // Collect complete assistant response for database persistence
  // For typical geospatial agent responses (under ~100KB) this is fine;
  // if responses regularly exceed ~1MB, consider streaming writes to database instead
  let assistantResponse = "";

  // We'll create the assistant message after collecting the response
  let assistantMessage: any = null;
  let userMessage: any = null;
  let conversation: any = null;

  // Track usage for cost monitoring
  const stepUsages: Array<{
    messageId: string;
    timestamp: string;
    usage: UsageMetrics;
  }> = [];

  try {
    // Ensure conversation exists in database and get its UUID
    try {
      conversation = await ensureConversation(conversationId);
      // Create user message record (sequence number computed atomically in database)
      // Use the UUID from the database, not the session key
      userMessage = await createMessage(conversation.id, "user", message);
    } catch (dbError: any) {
      console.error(
        `[WORKER] Database error for conversation ${conversationId}:`,
        dbError
      );
      // Send error event to client but continue processing
      // The agent can still respond even if persistence fails
      channel.sendToQueue(
        replyTo,
        Buffer.from(
          JSON.stringify({
            type: "error",
            error: "Database unavailable - conversation will not be persisted",
          })
        )
      );
    }

    // Check if we have an existing session for this conversation
    const existingSessionId = sessionIds.get(conversationId);

    if (existingSessionId) {
      console.log(
        `[WORKER] Resuming session ${existingSessionId} for conversation ${conversationId}`
      );
    } else {
      console.log(`[WORKER] Creating new session for ${conversationId}`);
    }

    // Create geo tools for this conversation
    const geoTools = createGeoTools(conversationId);

    const systemPrompt = `You are a GIS (Geographic Information Systems) processing assistant.

    You help users with geospatial data analysis, manipulation, and transformation tasks.

    The user is viewing a map interface. When you use tools that return GeoFeature objects,
    those features will automatically appear on the map. The user may reference "the map"
    when asking questions or giving commands about the displayed geographic data.

    If a user asks for a feature to be added to the map you only need to geolocate it. That is
    enough to get it mapped.
    `;

    // Query the Claude Agent SDK
    const response = query({
      prompt: message,
      options: {
        model: CLAUDE_MODEL,
        mcpServers: {
          "geo-tools": geoTools,
        },
        allowedTools: [
          "mcp__geo-tools__geocode",
          "mcp__geo-tools__calculate_distance",
          "mcp__geo-tools__remove_feature",
        ],
        systemPrompt: systemPrompt,
        // Resume existing session if we have one
        resume: existingSessionId,
      },
    });

    // Extract and store session_id before transforming events
    const responseWithSessionTracking = (async function* () {
      for await (const sdkMessage of response) {
        if (sdkMessage.session_id && !sessionIds.has(conversationId)) {
          sessionIds.set(conversationId, sdkMessage.session_id);
          console.log(
            `[WORKER] Storing session ID ${sdkMessage.session_id} for conversation ${conversationId}`
          );
        }

        // Capture usage from the result message
        if (sdkMessage.type === "result" && sdkMessage.usage) {
          stepUsages.push({
            messageId: "final_result",
            timestamp: new Date().toISOString(),
            usage: sdkMessage.usage,
          });
        }

        yield sdkMessage;
      }
    })();

    // Transform SDK events to domain events and publish to reply queue
    // We collect the assistant response during streaming but only persist after completion
    for await (const agentEvent of transformToAgentEvents(
      responseWithSessionTracking,
      featureExtractor,
      (toolResult) => {
        // Collect tool results for async persistence after streaming
        toolResults.push(toolResult);
      }
    )) {
      // Collect assistant response text chunks as they stream
      if (agentEvent.type === "assistant_message_chunk" && agentEvent.chunk) {
        assistantResponse += agentEvent.chunk;
      }
      channel.sendToQueue(replyTo, Buffer.from(JSON.stringify(agentEvent)));
    }

    // Streaming completed successfully - now persist the complete assistant message
    // Only attempt if user message was successfully created
    if (userMessage && conversation) {
      try {
        assistantMessage = await createMessage(
          conversation.id,
          "assistant",
          assistantResponse
        );
      } catch (dbError: any) {
        console.error(
          `[WORKER] Failed to save assistant message for conversation ${conversationId}:`,
          dbError
        );
        // Already warned client about database issues, continue
      }
    }

    // Send completion marker
    channel.sendToQueue(replyTo, Buffer.from(JSON.stringify({ type: "done" })));

    // Log total usage and cost for the request
    if (stepUsages.length > 0) {
      logUsageAndCost(conversationId, stepUsages[0].usage);
    }

    console.log(
      `[WORKER] Completed request for conversation: ${conversationId}`
    );

    // Async: Save geo features to database (don't await)
    // Only attempt if assistant message was created
    if (assistantMessage) {
      saveFeaturesAsync(assistantMessage.id, toolResults).catch((err) => {
        console.error(
          `[WORKER] Error saving features for conversation ${conversationId}:`,
          err
        );
      });
    }
  } catch (error: any) {
    console.error(
      `[WORKER] Error processing conversation ${conversationId}:`,
      error
    );

    // If we collected any assistant response before the error, try to save it
    if (userMessage && conversation && assistantResponse && !assistantMessage) {
      try {
        assistantMessage = await createMessage(
          conversation.id,
          "assistant",
          assistantResponse + "\n\n[Error: Response was interrupted]"
        );
        console.log(
          `[WORKER] Saved partial assistant response for conversation ${conversationId}`
        );
      } catch (dbError: any) {
        console.error(
          `[WORKER] Failed to save partial assistant message:`,
          dbError
        );
      }
    }

    const errorEvent = {
      type: "error",
      error: error.message || "Unknown error occurred",
    };

    channel.sendToQueue(replyTo, Buffer.from(JSON.stringify(errorEvent)));
    channel.sendToQueue(replyTo, Buffer.from(JSON.stringify({ type: "done" })));
  }
}

async function saveFeaturesAsync(
  messageId: string,
  toolResults: ToolResultForPersistence[]
): Promise<void> {
  for (const toolResult of toolResults) {
    try {
      // Use pre-extracted features from streaming (with UUIDs already generated)
      const features = toolResult.features || [];

      for (const feature of features) {
        await createGeoFeature(messageId, feature);
        console.log(
          `[WORKER] Saved geo feature for message ${messageId}: ${feature.label}`
        );
      }
    } catch (error) {
      console.error(
        `[WORKER] Error saving feature from tool ${toolResult.toolName}:`,
        error
      );
    }
  }
}

async function main() {
  console.log("[WORKER] Starting worker process...");
  console.log(`[WORKER] Connecting to RabbitMQ at ${RABBITMQ_URL}`);

  const connection: ChannelModel = await amqp.connect(RABBITMQ_URL);
  const channel: Channel = await connection.createChannel();

  // Ensure request queue exists
  await channel.assertQueue(REQUESTS_QUEUE, { durable: true });

  // Prefetch 1 for fair dispatch across multiple workers
  channel.prefetch(1);

  console.log(`[WORKER] Listening on queue '${REQUESTS_QUEUE}'`);
  console.log("[WORKER] Worker ready to process messages");

  // Consume messages from the requests queue
  channel.consume(REQUESTS_QUEUE, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    try {
      const { conversationId, message } = JSON.parse(msg.content.toString());
      const replyTo = msg.properties.replyTo;

      if (!conversationId || !message) {
        console.error(
          `[WORKER] Invalid message format, missing conversationId or message`
        );
        channel.ack(msg);
        return;
      }

      if (!replyTo) {
        console.error(`[WORKER] No replyTo queue specified in message`);
        channel.ack(msg);
        return;
      }

      console.log(
        `[WORKER] Received request for conversation: ${conversationId}`
      );

      // Process the request
      await processRequest(channel, replyTo, conversationId, message);

      // Acknowledge the message
      channel.ack(msg);

      console.log(
        `[WORKER] Acknowledged message for conversation: ${conversationId}`
      );
    } catch (error: any) {
      console.error(`[WORKER] Error processing message:`, error);
      // Acknowledge even on error to prevent infinite requeue
      // The error has already been sent to the reply queue
      channel.ack(msg);
    }
  });

  // Handle shutdown gracefully
  const shutdown = async () => {
    console.log("[WORKER] Shutting down gracefully...");
    try {
      await channel.close();
      await connection.close();
    } catch (error) {
      console.error("[WORKER] Error during shutdown:", error);
    }
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error("[WORKER] Fatal error:", error);
  process.exit(1);
});
