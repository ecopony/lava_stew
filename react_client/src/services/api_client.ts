// ABOUTME: Client for communicating with the API server.
// ABOUTME: Handles SSE streaming for real-time agent responses.

import { type AgentEvent, parseAgentEventFromSSE } from "../models";

export class ApiException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiException";
  }
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Sends a message and yields agent events as they arrive via SSE.
   */
  async *sendMessage(
    conversationId: string,
    message: string
  ): AsyncGenerator<AgentEvent> {
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversationId, message }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ApiException(`Failed to send message: ${body}`);
    }

    if (!response.body) {
      throw new ApiException("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let data: string | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            data = line.substring(6).trim();
          } else if (line === "" && data !== null) {
            try {
              const event = parseAgentEventFromSSE(data);
              yield event;
            } catch (e) {
              console.error("Error parsing agent event:", e);
              yield {
                type: "error" as const,
                errorType: "parse_error",
                message: `Failed to parse event: ${
                  e instanceof Error ? e.message : String(e)
                }`,
              };
            }
            data = null;
          }
        }
      }

      // Handle any remaining data in buffer
      if (data !== null) {
        try {
          yield parseAgentEventFromSSE(data);
        } catch (e) {
          console.error("Error parsing final agent event:", e);
          yield {
            type: "error" as const,
            errorType: "parse_error",
            message: `Failed to parse event: ${
              e instanceof Error ? e.message : String(e)
            }`,
          };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// Default API URL - empty string uses relative URLs (works with Vite proxy)
const API_SERVER_URL = import.meta.env.VITE_API_SERVER_URL ?? "";

export const apiClient = new ApiClient(API_SERVER_URL);
