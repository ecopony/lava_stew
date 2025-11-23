// ABOUTME: Transforms Agent SDK events into clean domain events for the client.
// ABOUTME: Abstracts SDK implementation details, emitting only what the client needs.

import type { GeoFeature } from './types.js';

interface AgentEvent {
  type: string;
  [key: string]: any;
}

interface ToolUseBlock {
  id: string;
  name: string;
  input: any;
}

interface ToolResultItem {
  type: string;
  tool_use_id?: string;
  content?: Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

export interface ToolResultForPersistence {
  toolName: string;
  result: string;
  input: any;
  features?: GeoFeature[];
}

/**
 * Transforms Agent SDK streaming events into domain events for the client.
 * This isolates the client from SDK implementation details.
 */
export async function* transformToAgentEvents(
  sdkStream: AsyncIterable<any>,
  featureExtractor: any,
  onToolResult?: (toolResult: ToolResultForPersistence) => void
): AsyncIterable<AgentEvent> {
  // Track tool calls to match results
  const pendingTools = new Map<string, ToolUseBlock>();

  let assistantMessageStarted = false;

  for await (const sdkEvent of sdkStream) {
    const eventType = sdkEvent.type;

    // Skip system init events
    if (eventType === "system") {
      continue;
    }

    // Handle complete assistant messages from query()
    if (eventType === "assistant") {
      const message = sdkEvent.message;
      const content = message?.content;

      if (!content || content.length === 0) {
        continue;
      }

      // Emit thinking indicator on first assistant message
      if (!assistantMessageStarted) {
        yield { type: "assistant_thinking" };
        assistantMessageStarted = true;
      }

      let hasTextContent = false;

      // Process each content block
      for (const block of content) {
        if (block.type === "text") {
          hasTextContent = true;
          // Emit text as a single chunk (query doesn't stream)
          yield {
            type: "assistant_message_chunk",
            chunk: block.text,
          };
        } else if (block.type === "tool_use") {
          const toolBlock: ToolUseBlock = {
            id: block.id,
            name: block.name,
            input: block.input || {},
          };

          // Store for matching with result later
          pendingTools.set(toolBlock.id, toolBlock);

          // Emit tool start event
          yield {
            type: "tool_start",
            toolId: toolBlock.id,
            toolName: toolBlock.name,
            input: toolBlock.input,
          };
        }
      }

      // Emit message complete after each assistant message with text
      if (hasTextContent) {
        yield { type: "assistant_message_complete" };
      }

      continue;
    }

    // Tool results come in 'user' type messages
    if (eventType === "user") {
      const userMessage = sdkEvent.message;
      if (userMessage?.content) {
        for (const item of userMessage.content as ToolResultItem[]) {
          if (item.type === "tool_result" && item.tool_use_id) {
            const toolCall = pendingTools.get(item.tool_use_id);
            if (!toolCall) {
              console.warn(
                `[WORKER] Received tool result for unknown tool: ${item.tool_use_id}`
              );
              continue;
            }

            // Parse tool result content
            const resultText = item.content?.[0]?.text;
            let parsedResult: any = null;
            let error: string | undefined = undefined;

            if (item.is_error) {
              error = resultText || "Tool execution failed";
            } else if (resultText) {
              try {
                parsedResult = JSON.parse(resultText);
              } catch {
                // Not JSON, use raw text
                parsedResult = { result: resultText };
              }
            }

            // Emit tool result event
            yield {
              type: "tool_result",
              toolId: item.tool_use_id,
              toolName: toolCall.name,
              result: parsedResult,
              error: error,
            };

            // Extract features and emit geo_feature events
            const extractedFeatures = featureExtractor.extractFeatures(
              toolCall.name,
              resultText || '',
              toolCall.input
            );

            // Emit geo_feature events for each extracted feature
            for (const feature of extractedFeatures) {
              yield {
                type: "geo_feature",
                id: feature.id,
                lat: feature.lat,
                lon: feature.lon,
                label: feature.label,
              };
            }

            // Notify about tool result for async persistence
            if (onToolResult && !item.is_error && resultText) {
              onToolResult({
                toolName: toolCall.name,
                result: resultText,
                input: toolCall.input,
                features: extractedFeatures,
              });
            }

            // Emit feature_removed if this is a remove_feature result
            if (
              toolCall.name.includes("remove_feature") &&
              parsedResult &&
              parsedResult.id
            ) {
              yield {
                type: "feature_removed",
                featureId: parsedResult.id,
                label: parsedResult.label || "Unknown",
              };
            }

            // Clean up
            pendingTools.delete(item.tool_use_id);
          }
        }
      }
      continue;
    }

    // Handle SDK errors
    if (eventType === "error") {
      yield {
        type: "error",
        errorType: "api_error",
        message: sdkEvent.error?.message || "Unknown error occurred",
      };
      continue;
    }
  }
}
