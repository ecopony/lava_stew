// ABOUTME: API server that receives chat requests and streams responses via SSE.
// ABOUTME: Uses RabbitMQ RPC pattern with exclusive reply queues for request-reply messaging.

import amqp, { Channel, ChannelModel } from "amqplib";
import dotenv from "dotenv";
import express, { Request, Response } from "express";

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ["RABBITMQ_URL"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(
    `[API] Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
  console.error(
    "[API] Please check your .env file and ensure all required variables are set"
  );
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.API_SERVER_PORT || "3001");
const RABBITMQ_URL = process.env.RABBITMQ_URL!;

// Queue names
const REQUESTS_QUEUE = "chat.requests";

// Global RabbitMQ connection and channel
let connection: ChannelModel;
let channel: Channel;

async function setupRabbitMQ(): Promise<void> {
  connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();

  // Ensure request queue exists
  await channel.assertQueue(REQUESTS_QUEUE, { durable: true });

  console.log(`[API] Connected to RabbitMQ at ${RABBITMQ_URL}`);
}

app.use(express.json());

interface ChatRequest {
  conversationId: string;
  message: string;
}

app.post("/chat", async (req: Request, res: Response) => {
  const { conversationId, message } = req.body as ChatRequest;

  if (!conversationId || !message) {
    res.status(400).json({ error: "conversationId and message are required" });
    return;
  }

  console.log(
    `[API] Received chat request for conversation: ${conversationId}`
  );

  // Set SSE headers FIRST to keep connection alive
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send initial SSE comment to establish stream
  res.write(": connected\n\n");

  let consumerTag: string | undefined;

  try {
    // Create exclusive reply queue that auto-deletes when we disconnect
    const { queue: replyQueue } = await channel.assertQueue("", {
      exclusive: true,
      autoDelete: true,
    });

    // Handle client disconnect
    req.on("close", () => {
      console.log(
        `[API] Client disconnected for conversation: ${conversationId}`
      );
      if (consumerTag) {
        channel.cancel(consumerTag).catch((err) => {
          console.error(`[API] Error canceling consumer:`, err);
        });
      }
    });

    // Consume from reply queue
    const { consumerTag: tag } = await channel.consume(
      replyQueue,
      (msg) => {
        if (!msg) return;

        try {
          const event = JSON.parse(msg.content.toString());

          if (event.type === "done") {
            console.log(
              `[API] Received completion marker for conversation: ${conversationId}`
            );
            res.end();
            if (consumerTag) {
              channel.cancel(consumerTag).catch((err) => {
                console.error(`[API] Error canceling consumer:`, err);
              });
            }
            return;
          }

          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch (e) {
          // If parsing fails, write raw data
          res.write(`data: ${msg.content.toString()}\n\n`);
        }
      },
      { noAck: true }
    );

    consumerTag = tag;

    // Publish request to the requests queue
    channel.sendToQueue(
      REQUESTS_QUEUE,
      Buffer.from(
        JSON.stringify({
          conversationId,
          message,
        })
      ),
      {
        replyTo: replyQueue,
        persistent: true,
      }
    );

    console.log(
      `[API] Published request to queue for conversation: ${conversationId}`
    );
  } catch (error: any) {
    console.error(`[API] Error handling chat request:`, error);
    const errorEvent = {
      type: "error",
      error: error.message || "Unknown error occurred",
    };
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    res.end();

    if (consumerTag) {
      channel.cancel(consumerTag).catch((err) => {
        console.error(`[API] Error canceling consumer:`, err);
      });
    }
  }
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Start server after RabbitMQ connection is established
setupRabbitMQ()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[API] Server listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("[API] Failed to connect to RabbitMQ:", error);
    process.exit(1);
  });

// Handle shutdown gracefully
const shutdown = async () => {
  console.log("[API] Shutting down gracefully...");
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
  } catch (error) {
    console.error("[API] Error during shutdown:", error);
  }
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
