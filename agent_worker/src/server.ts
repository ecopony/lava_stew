// ABOUTME: Worker process that consumes from RabbitMQ, maintains stateful SDK sessions in memory.
// ABOUTME: Processes messages with Agent SDK and publishes streaming responses to reply queues.

// Tracing must initialize before other modules are imported.
import "./tracing.js";
import { trace, context, propagation } from "@opentelemetry/api";
import { query } from "@anthropic-ai/claude-agent-sdk";
import amqp, { Channel, ChannelModel, ConsumeMessage } from "amqplib";
import dotenv from "dotenv";
import { agentDefinitions } from "./agent-definitions.js";
import {
  ToolResultForPersistence,
  transformToAgentEvents,
} from "./eventTransformer.js";
import { getPool } from "./database.js";
import { GeoFeatureExtractor } from "./featureExtractor.js";
import { createToolAuditHook } from "./hooks.js";
import { createGeoTools } from "./mcpServer.js";
import {
  createMessage,
  ensureConversation,
  getSessionId,
  setSessionId,
} from "./models/conversation.js";
import { createGeoFeature } from "./models/geoFeature.js";
import { calculateCost } from "./pricing.js";
import { PostgresSessionStore } from "./sessionStore.js";
import type { UsageMetrics } from "./types.js";

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  "ANTHROPIC_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "OPENROUTESERVICE_API_KEY",
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

console.log(
  `[WORKER] Loaded ${Object.keys(agentDefinitions).length} agent definitions`
);

const RABBITMQ_URL = process.env.RABBITMQ_URL!;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-7";
const CLAUDE_FALLBACK_MODEL =
  process.env.CLAUDE_FALLBACK_MODEL || "claude-sonnet-4-6";
const MAX_BUDGET_USD = process.env.MAX_BUDGET_USD
  ? parseFloat(process.env.MAX_BUDGET_USD)
  : undefined;

// Queue configuration
const REQUESTS_QUEUE = "chat.requests";

// Stateful session storage - maps conversationId to SDK session_id.
// Backed by the conversations.session_id column so it survives a worker restart.
const sessionIds = new Map<string, string>();

// Mirrors session transcripts to Postgres so a resumed session can be
// re-materialized after a restart (the local subprocess transcript may be gone).
const sessionStore = new PostgresSessionStore(getPool());

const tracer = trace.getTracer("agent-worker");

// Feature extractor for geo tools
const featureExtractor = new GeoFeatureExtractor();

function logUsageAndCost(conversationId: string, usage: UsageMetrics): void {
  const cost = calculateCost(CLAUDE_MODEL, usage);
  if (!cost) {
    console.warn(
      `[WORKER] Unknown model pricing for ${CLAUDE_MODEL}, cost calculation skipped`
    );
    return;
  }

  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  const cache5mTokens = usage.cache_creation?.ephemeral_5m_input_tokens || 0;
  const cache1hTokens = usage.cache_creation?.ephemeral_1h_input_tokens || 0;

  console.log(
    `[WORKER] Usage for ${conversationId}: ` +
      `${inputTokens} input + ${outputTokens} output + ` +
      `${cacheReadTokens} cache read + ` +
      `${cache5mTokens} cache write (5m) + ${cache1hTokens} cache write (1h) = ` +
      `$${cost.totalCost.toFixed(4)}`
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

    // Check if we have an existing session for this conversation.
    // Fall back to the persisted session id so resume survives a worker restart.
    let existingSessionId = sessionIds.get(conversationId);
    if (!existingSessionId) {
      try {
        const persistedSessionId = await getSessionId(conversationId);
        if (persistedSessionId) {
          existingSessionId = persistedSessionId;
          sessionIds.set(conversationId, persistedSessionId);
        }
      } catch (lookupError) {
        console.error(
          `[WORKER] Failed to load persisted session for ${conversationId}:`,
          lookupError
        );
      }
    }

    if (existingSessionId) {
      console.log(
        `[WORKER] Resuming session ${existingSessionId} for conversation ${conversationId}`
      );
    } else {
      console.log(`[WORKER] Creating new session for ${conversationId}`);
    }

    // Create geo tools MCP server for this conversation
    const geoTools = createGeoTools(conversationId);

    const systemPrompt = `You are a GIS (Geographic Information Systems) processing assistant.

    You help users with geospatial data analysis, manipulation, and transformation tasks.

    The user is viewing a map interface. When you use tools that return GeoFeature objects,
    those features will automatically appear on the map. The user may reference "the map"
    when asking questions or giving commands about the displayed geographic data.

    For location intelligence queries (analyzing characteristics of locations), you have access
    to a location-intelligence sub-agent that can:
    - Gather comprehensive geospatial data for a location
    - Analyze the data using deterministic Python tools
    - Return insights about walkability, amenities, and accessibility

    When comparing multiple locations, spawn multiple location-intelligence agents in parallel
    (one per location) and synthesize their results into a comparison.

    IMPORTANT: Sub-agents automatically geocode locations and add features to the map.
    You do NOT need to re-geocode locations that sub-agents have already processed.

    If a user asks for a simple feature to be added to the map (not analysis), just use the
    geocode tool directly - that is enough to get it mapped.
    `;

    // Propagate the active trace context into the SDK subprocess so its
    // interaction span nests under this request's chat.request span. The SDK
    // reads TRACEPARENT/TRACESTATE from its environment at span start. Passing
    // options.env replaces the subprocess environment, so process.env is
    // spread in to preserve the credentials and telemetry config it inherits.
    const subprocessEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) subprocessEnv[key] = value;
    }
    const traceCarrier: Record<string, string> = {};
    propagation.inject(context.active(), traceCarrier);
    if (traceCarrier.traceparent) subprocessEnv.TRACEPARENT = traceCarrier.traceparent;
    if (traceCarrier.tracestate) subprocessEnv.TRACESTATE = traceCarrier.tracestate;

    // Query the Claude Agent SDK
    const response = query({
      prompt: message,
      options: {
        env: subprocessEnv,
        model: CLAUDE_MODEL,
        mcpServers: {
          "geo-tools": geoTools,
        },
        allowedTools: [
          "mcp__geo-tools__geocode",
          "mcp__geo-tools__calculate_distance",
          "mcp__geo-tools__remove_feature",
          "mcp__geo-tools__fetch_pois_osm",
          "mcp__geo-tools__fetch_transit_osm",
          "mcp__geo-tools__fetch_amenities_osm",
          "mcp__geo-tools__generate_isochrone",
          "mcp__geo-tools__analyze_location_data",
        ],
        agents: agentDefinitions,
        systemPrompt: systemPrompt,
        fallbackModel: CLAUDE_FALLBACK_MODEL,
        maxBudgetUsd: MAX_BUDGET_USD,
        forwardSubagentText: true,
        hooks: {
          PreToolUse: [{ hooks: [createToolAuditHook(conversationId)] }],
        },
        sessionStore,
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
          // Persist so resume survives a worker restart
          setSessionId(conversationId, sdkMessage.session_id).catch((err) => {
            console.error(
              `[WORKER] Failed to persist session ID for ${conversationId}:`,
              err
            );
          });
        }

        // Surface transcript-mirror failures so we are not silent on data loss
        if (
          sdkMessage.type === "system" &&
          sdkMessage.subtype === "mirror_error"
        ) {
          console.error(
            `[WORKER] Session transcript mirror failed for ${conversationId}: ${sdkMessage.error}`
          );
        }

        // Capture usage from the result message
        // SDK doesn't export explicit usage types, so we validate existence and cast to our interface
        // The logUsageAndCost function handles missing/partial fields gracefully
        if (sdkMessage.type === "result" && sdkMessage.usage) {
          stepUsages.push({
            messageId: "final_result",
            timestamp: new Date().toISOString(),
            usage: sdkMessage.usage as UsageMetrics,
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
      Object.keys(agentDefinitions),
      (toolResult) => {
        // Collect tool results for async persistence after streaming
        toolResults.push(toolResult);
      },
      conversationId,
      (agentName, usage) => {
        // Log sub-agent usage and cost
        console.log(`[WORKER] Sub-agent usage: ${agentName}`);
        logUsageAndCost(conversationId, usage as UsageMetrics);
      },
      (usage) => {
        // Log orchestrator usage and cost
        console.log(`[WORKER] Orchestrator usage`);
        logUsageAndCost(conversationId, usage as UsageMetrics);
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
          `[WORKER] Saved geo feature for message ${messageId}: ${feature.properties.label ?? feature.id}`
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

      // Process the request inside a span so the SDK subprocess's spans nest
      // under this request's trace (SDK forwards the active trace context).
      await tracer.startActiveSpan("chat.request", async (span) => {
        span.setAttribute("conversation.id", conversationId);
        try {
          await processRequest(channel, replyTo, conversationId, message);
        } finally {
          span.end();
        }
      });

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
