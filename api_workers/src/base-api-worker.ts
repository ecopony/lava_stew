// ABOUTME: Shared base class for rate-limited API workers using RabbitMQ RPC pattern.
// ABOUTME: Instantiate with config to handle specific APIs with configurable rate limits and queue names.

import amqp, { Channel, ChannelModel } from "amqplib";
import { execFileSync } from "child_process";
import path from "path";

export interface WorkerRequest {
  scriptName: string;
  scriptArgs: string[];
  conversationId: string;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  errorMetadata?: {
    rate_limited?: boolean;
    timeout?: boolean;
    details?: string;
  };
}

export interface WorkerConfig {
  queueName: string;
  minDelayMs: number;
  logPrefix: string;
}

export class BaseApiWorker {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private lastCallTime: number = 0;
  private readonly config: WorkerConfig;

  constructor(config: WorkerConfig) {
    this.config = config;
  }

  async connect() {
    const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://localhost:5672";
    console.log(
      `[${this.config.logPrefix}] Connecting to RabbitMQ: ${rabbitmqUrl}`
    );

    this.connection = await amqp.connect(rabbitmqUrl);
    this.channel = await this.connection.createChannel();

    // Create queue and set prefetch to 1 for guaranteed serialization
    await this.channel.assertQueue(this.config.queueName, { durable: true });
    await this.channel.prefetch(1);

    console.log(
      `[${this.config.logPrefix}] Connected. Waiting for requests on ${this.config.queueName}`
    );
  }

  private async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.config.minDelayMs) {
      const waitTime = this.config.minDelayMs - timeSinceLastCall;
      console.log(
        `[${this.config.logPrefix}] Rate limiting: waiting ${waitTime}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  private parseErrorMessage(error: any): {
    message: string;
    metadata?: ToolResult["errorMetadata"];
  } {
    const errorMessage = error.stderr?.toString() || error.message;

    try {
      const errorJson = JSON.parse(errorMessage);

      const metadata: ToolResult["errorMetadata"] = {};
      if (errorJson.rate_limited) {
        metadata.rate_limited = true;
      }
      if (errorJson.timeout) {
        metadata.timeout = true;
      }
      if (errorJson.details) {
        metadata.details = errorJson.details;
      }

      return {
        message: errorJson.error || errorMessage,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
    } catch {
      return { message: errorMessage };
    }
  }

  private async executeScript(request: WorkerRequest): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Enforce rate limit before making the call
      await this.enforceRateLimit();

      const scriptsDir =
        process.env.SCRIPTS_PATH || path.join(process.cwd(), "scripts");
      const scriptPath = path.join(scriptsDir, request.scriptName);

      console.log(
        `[${this.config.logPrefix}] ${request.conversationId} | Executing ${
          request.scriptName
        } with args: ${JSON.stringify(request.scriptArgs)}`
      );

      const output = execFileSync(
        "uv",
        ["run", "python", scriptPath, ...request.scriptArgs],
        {
          encoding: "utf-8",
          env: { ...process.env },
          timeout: 35000, // Script execution timeout (RPC timeout is 50s to allow buffer)
        }
      );

      // Update last call time after successful execution
      this.lastCallTime = Date.now();

      const data = JSON.parse(output.trim());
      const duration = Date.now() - startTime;

      console.log(
        `[${this.config.logPrefix}] ${request.conversationId} | ${request.scriptName} | SUCCESS | ${duration}ms`
      );

      return { success: true, data };
    } catch (error: any) {
      // Update last call time even on error (API call was still made)
      this.lastCallTime = Date.now();

      const parsedError = this.parseErrorMessage(error);
      const duration = Date.now() - startTime;

      console.log(
        `[${this.config.logPrefix}] ${request.conversationId} | ${request.scriptName} | ERROR: ${parsedError.message} | ${duration}ms`
      );

      return {
        success: false,
        error: parsedError.message,
        errorMetadata: parsedError.metadata,
      };
    }
  }

  async startConsuming() {
    if (!this.channel) {
      throw new Error("Channel not initialized. Call connect() first.");
    }

    this.channel.consume(
      this.config.queueName,
      async (msg) => {
        if (!msg) return;

        try {
          const request: WorkerRequest = JSON.parse(msg.content.toString());
          const result = await this.executeScript(request);

          // Send response back via reply-to queue
          if (msg.properties.replyTo) {
            this.channel!.sendToQueue(
              msg.properties.replyTo,
              Buffer.from(JSON.stringify(result)),
              {
                correlationId: msg.properties.correlationId,
              }
            );
          }

          // Acknowledge message
          this.channel!.ack(msg);
        } catch (error: any) {
          console.error(
            `[${this.config.logPrefix}] Error processing message: ${error.message}`
          );

          // Send error response
          if (msg.properties.replyTo) {
            const errorResult: ToolResult = {
              success: false,
              error: `Worker error: ${error.message}`,
            };

            this.channel!.sendToQueue(
              msg.properties.replyTo,
              Buffer.from(JSON.stringify(errorResult)),
              {
                correlationId: msg.properties.correlationId,
              }
            );
          }

          // Acknowledge message even on error to remove from queue
          this.channel!.ack(msg);
        }
      },
      { noAck: false }
    );
  }

  async close() {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }

  async run() {
    try {
      await this.connect();
      await this.startConsuming();

      // Handle graceful shutdown
      process.on("SIGINT", async () => {
        console.log(`\n[${this.config.logPrefix}] Shutting down gracefully...`);
        await this.close();
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        console.log(`\n[${this.config.logPrefix}] Shutting down gracefully...`);
        await this.close();
        process.exit(0);
      });
    } catch (error: any) {
      console.error(`[${this.config.logPrefix}] Fatal error: ${error.message}`);
      process.exit(1);
    }
  }
}
