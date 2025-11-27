// ABOUTME: RabbitMQ RPC client for communicating with API workers.
// ABOUTME: Manages connections, channels, and request/response correlation.

import amqp, { Channel, ChannelModel, ConsumeMessage } from "amqplib";

interface RpcRequest {
  scriptName: string;
  scriptArgs: string[];
  conversationId: string;
}

interface RpcResponse {
  success: boolean;
  data?: any;
  error?: string;
  errorMetadata?: {
    rate_limited?: boolean;
    timeout?: boolean;
    details?: string;
  };
}

class RabbitMQRpcClient {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private replyQueue: string | null = null;
  private connectingPromise: Promise<void> | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (value: RpcResponse) => void; reject: (error: Error) => void; timeoutId: NodeJS.Timeout }
  >();

  private async resetState() {
    // Close existing connections before nulling references
    try {
      if (this.channel) {
        await this.channel.close().catch(() => {}); // Ignore errors if already closed
      }
    } catch (e) {
      // Ignore - channel may already be closed
    }

    try {
      if (this.connection) {
        await this.connection.close().catch(() => {}); // Ignore errors if already closed
      }
    } catch (e) {
      // Ignore - connection may already be closed
    }

    this.connection = null;
    this.channel = null;
    this.replyQueue = null;
    this.connectingPromise = null;

    // Reject all pending requests
    for (const [correlationId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("RabbitMQ connection closed"));
    }
    this.pendingRequests.clear();
  }

  async connect() {
    // If already connected, return immediately
    if (this.connection && this.channel && this.replyQueue) {
      return;
    }

    // If currently connecting, wait for that connection to complete
    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    // Create new connection promise
    this.connectingPromise = this.doConnect();

    try {
      await this.connectingPromise;
    } finally {
      // Clear connecting promise when done (success or failure)
      this.connectingPromise = null;
    }
  }

  private async doConnect() {
    const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://localhost:5672";

    console.log(`[RABBITMQ_RPC] Connecting to RabbitMQ: ${rabbitmqUrl}`);
    this.connection = await amqp.connect(rabbitmqUrl);
    this.channel = await this.connection.createChannel();

    // Handle connection errors
    this.connection.on("error", (err) => {
      console.error("[RABBITMQ_RPC] Connection error:", err);
      this.resetState().catch((e) =>
        console.error("[RABBITMQ_RPC] Error during resetState:", e)
      );
    });

    this.connection.on("close", () => {
      console.log("[RABBITMQ_RPC] Connection closed");
      this.resetState().catch((e) =>
        console.error("[RABBITMQ_RPC] Error during resetState:", e)
      );
    });

    // Handle channel errors
    this.channel.on("error", (err) => {
      console.error("[RABBITMQ_RPC] Channel error:", err);
      this.resetState().catch((e) =>
        console.error("[RABBITMQ_RPC] Error during resetState:", e)
      );
    });

    this.channel.on("close", () => {
      console.log("[RABBITMQ_RPC] Channel closed");
      this.resetState().catch((e) =>
        console.error("[RABBITMQ_RPC] Error during resetState:", e)
      );
    });

    // Create exclusive reply queue for this client
    const { queue } = await this.channel.assertQueue("", { exclusive: true });
    this.replyQueue = queue;

    // Start consuming responses
    this.channel.consume(
      this.replyQueue,
      (msg) => {
        if (!msg) return;

        const correlationId = msg.properties.correlationId;
        const pending = this.pendingRequests.get(correlationId);

        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pendingRequests.delete(correlationId);

          try {
            const response: RpcResponse = JSON.parse(msg.content.toString());
            pending.resolve(response);
          } catch (error: any) {
            pending.reject(new Error(`Failed to parse response: ${error.message}`));
          }
        }
      },
      { noAck: true }
    );

    console.log(`[RABBITMQ_RPC] Connected with reply queue: ${this.replyQueue}`);
  }

  async sendRpcRequest(
    queueName: string,
    request: RpcRequest,
    timeoutMs: number = 40000
  ): Promise<RpcResponse> {
    if (!this.channel || !this.replyQueue) {
      await this.connect();
    }

    // Capture channel and replyQueue references to avoid race conditions
    const channel = this.channel;
    const replyQueue = this.replyQueue;

    if (!channel || !replyQueue) {
      throw new Error("Failed to establish RabbitMQ connection");
    }

    const correlationId = this.generateCorrelationId();

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`RPC request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store pending request
      this.pendingRequests.set(correlationId, { resolve, reject, timeoutId });

      try {
        // Send request with captured references
        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(request)), {
          correlationId,
          replyTo: replyQueue,
        });

        console.log(
          `[RABBITMQ_RPC] Sent request to ${queueName} | correlationId: ${correlationId} | script: ${request.scriptName}`
        );
      } catch (error: any) {
        // Clean up pending request if send fails
        clearTimeout(timeoutId);
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Failed to send RPC request: ${error.message}`));
      }
    });
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  async close() {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
}

// Singleton instance
let rpcClient: RabbitMQRpcClient | null = null;
let handlersRegistered = false;

export async function getRpcClient(): Promise<RabbitMQRpcClient> {
  if (!rpcClient) {
    rpcClient = new RabbitMQRpcClient();
    await rpcClient.connect();
  }

  // Register shutdown handlers only once
  if (!handlersRegistered) {
    handlersRegistered = true;

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      if (rpcClient) {
        await rpcClient.close();
      }
    });

    process.on("SIGTERM", async () => {
      if (rpcClient) {
        await rpcClient.close();
      }
    });
  }

  return rpcClient;
}
