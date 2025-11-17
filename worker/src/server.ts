// ABOUTME: Worker process that consumes from RabbitMQ, maintains stateful SDK sessions in memory.
// ABOUTME: Processes messages with Agent SDK and publishes streaming responses to reply queues.

import { query } from "@anthropic-ai/claude-agent-sdk";
import amqp, { Channel, ChannelModel, ConsumeMessage } from "amqplib";
import dotenv from "dotenv";
import { transformToAgentEvents } from "./eventTransformer";
import { createGeoTools } from "./mcpServer";

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
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";

// Queue configuration
const REQUESTS_QUEUE = "chat.requests";

// Stateful session storage - maps conversationId to SDK session_id
const sessionIds = new Map<string, string>();

async function processRequest(
  channel: Channel,
  replyTo: string,
  conversationId: string,
  message: string
): Promise<void> {
  console.log(
    `[WORKER] Processing request for conversation: ${conversationId}`
  );

  try {
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
        ],
        systemPrompt: `You are a geospatial analyst assistant. You help users with geographic queries using geocoding and distance calculation tools. When users ask about locations or distances, use your tools to provide accurate answers.`,
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
        yield sdkMessage;
      }
    })();

    // Transform SDK events to domain events and publish to reply queue
    for await (const agentEvent of transformToAgentEvents(
      responseWithSessionTracking
    )) {
      channel.sendToQueue(replyTo, Buffer.from(JSON.stringify(agentEvent)));
    }

    // Send completion marker
    channel.sendToQueue(replyTo, Buffer.from(JSON.stringify({ type: "done" })));

    console.log(
      `[WORKER] Completed request for conversation: ${conversationId}`
    );
  } catch (error: any) {
    console.error(
      `[WORKER] Error processing conversation ${conversationId}:`,
      error
    );

    const errorEvent = {
      type: "error",
      error: error.message || "Unknown error occurred",
    };

    channel.sendToQueue(replyTo, Buffer.from(JSON.stringify(errorEvent)));
    channel.sendToQueue(replyTo, Buffer.from(JSON.stringify({ type: "done" })));
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
