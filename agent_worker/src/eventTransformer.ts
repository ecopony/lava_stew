// ABOUTME: Transforms Agent SDK events into clean domain events for the client.
// ABOUTME: Abstracts SDK implementation details, emitting only what the client needs.

import type { GeoFeature, UsageMetrics } from "./types.js";

// SDK Event Types
// The Agent SDK doesn't export these types, so we define them based on observed structure
interface SdkContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface SdkMessage {
  id?: string;
  content?: SdkContentBlock[];
  usage?: UsageMetrics;
}

interface SdkAssistantEvent {
  type: "assistant";
  message: SdkMessage;
}

interface SdkUserEvent {
  type: "user";
  message: SdkMessage;
}

interface SdkSystemEvent {
  type: "system";
}

interface SdkErrorEvent {
  type: "error";
  error?: {
    message: string;
  };
}

interface SdkResultEvent {
  type: "result";
  session_id?: string;
  usage?: UsageMetrics;
}

type SdkEvent =
  | SdkAssistantEvent
  | SdkUserEvent
  | SdkSystemEvent
  | SdkErrorEvent
  | SdkResultEvent;

// Feature Extractor Interface
export interface IFeatureExtractor {
  extractFeatures(
    toolName: string,
    result: string,
    toolArguments: unknown
  ): GeoFeature[];
}

// Domain Event Types
interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

interface ToolUseBlock {
  id: string;
  name: string;
  input: unknown;
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
  input: unknown;
  features?: GeoFeature[];
}

interface SubagentExecution {
  agentName: string;
  toolId: string;
  startTime: number;
  endTime?: number;
  usage?: UsageMetrics;
}

/**
 * Transforms Agent SDK streaming events into domain events for the client.
 * This isolates the client from SDK implementation details.
 *
 * Note: sdkStream uses 'any' because the Agent SDK doesn't export its event types.
 * The SDK's internal types are opaque, so we accept any and validate at runtime.
 */
export async function* transformToAgentEvents(
  sdkStream: AsyncIterable<any>,
  featureExtractor: IFeatureExtractor,
  agentNames: string[],
  onToolResult?: (toolResult: ToolResultForPersistence) => void,
  conversationId?: string,
  onSubagentUsage?: (agentName: string, usage: UsageMetrics) => void
): AsyncIterable<AgentEvent> {
  // Track tool calls to match results
  const pendingTools = new Map<string, ToolUseBlock>();

  // Track active sub-agents by tool_use_id
  const activeSubagents = new Map<string, string>();

  // Track sub-agent pipeline for observability
  const subagentExecutions: SubagentExecution[] = [];
  let pipelineStartTime: number | null = null;

  // Track processed message IDs to avoid double-counting usage
  const processedMessageIds = new Set<string>();

  // Track which sub-agent is currently active (if any)
  let currentSubagentToolId: string | null = null;

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

          // Check if this is a sub-agent invocation
          // SDK uses "Task" tool with subagent_type in input
          const isSubagent =
            toolBlock.name === "Task" &&
            toolBlock.input &&
            typeof toolBlock.input === "object" &&
            "subagent_type" in toolBlock.input;

          if (isSubagent) {
            const agentName = (toolBlock.input as any).subagent_type;

            // Validate that this is a known agent type
            if (!agentNames.includes(agentName)) {
              console.warn(
                `[WORKER] Unknown sub-agent type: ${agentName}. Known agents: ${agentNames.join(
                  ", "
                )}`
              );
              // Emit as regular tool call instead
              yield {
                type: "tool_start",
                toolId: toolBlock.id,
                toolName: toolBlock.name,
                input: toolBlock.input,
              };
              continue;
            }

            activeSubagents.set(toolBlock.id, agentName);

            // Track sub-agent execution for pipeline observability
            const startTime = Date.now();
            subagentExecutions.push({
              agentName,
              toolId: toolBlock.id,
              startTime,
            });

            // Set current sub-agent for usage tracking
            currentSubagentToolId = toolBlock.id;

            // Log pipeline start on first sub-agent
            if (pipelineStartTime === null) {
              pipelineStartTime = startTime;
              const logPrefix = conversationId
                ? `[WORKER] Sub-agent pipeline started for conversation: ${conversationId}`
                : `[WORKER] Sub-agent pipeline started`;
              console.log(logPrefix);
            }

            yield {
              type: "subagent_started",
              toolId: toolBlock.id,
              agentName: agentName,
            };
          } else {
            // Emit tool start event for regular tools
            yield {
              type: "tool_start",
              toolId: toolBlock.id,
              toolName: toolBlock.name,
              input: toolBlock.input,
            };
          }
        }
      }

      // Capture usage from assistant message (deduplicate by message ID)
      if (message.usage && message.id && !processedMessageIds.has(message.id)) {
        processedMessageIds.add(message.id);

        // If we're currently inside a sub-agent, attribute this usage to it
        if (currentSubagentToolId) {
          const execution = subagentExecutions.find(
            (e) => e.toolId === currentSubagentToolId
          );
          if (execution) {
            // Accumulate usage for pipeline summary (store last usage seen)
            execution.usage = message.usage;

            // Notify about sub-agent usage for each step
            if (onSubagentUsage) {
              onSubagentUsage(execution.agentName, message.usage);
            }
          }
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
            }

            // Check if this was a sub-agent first (sub-agents return natural language, not JSON)
            const agentName = activeSubagents.get(item.tool_use_id);
            if (agentName) {
              // Track sub-agent completion time and duration
              const execution = subagentExecutions.find(
                (e) => e.toolId === item.tool_use_id
              );
              if (execution) {
                execution.endTime = Date.now();
                const durationMs = execution.endTime - execution.startTime;
                const durationSec = (durationMs / 1000).toFixed(1);
                console.log(
                  `[WORKER] Sub-agent completed: ${agentName} (${durationSec}s)`
                );
              }

              // Log sub-agent result
              if (resultText) {
                const preview = resultText.substring(0, 200);
                console.log(
                  `[WORKER] Sub-agent result: ${preview}${
                    resultText.length > 200 ? "..." : ""
                  }`
                );
              }

              yield {
                type: "subagent_completed",
                toolId: item.tool_use_id,
                agentName: agentName,
                result: resultText,
                error: error,
              };
              activeSubagents.delete(item.tool_use_id);

              // Clear current sub-agent tracking if this was the active one
              if (currentSubagentToolId === item.tool_use_id) {
                currentSubagentToolId = null;
              }
            } else {
              // Parse JSON for regular tools (not sub-agents)
              if (resultText) {
                try {
                  parsedResult = JSON.parse(resultText);
                } catch (parseError: any) {
                  // Log JSON parsing failures to help diagnose malformed tool responses
                  const preview = resultText.substring(0, 100);
                  console.warn(
                    `[WORKER] Tool ${
                      toolCall.name
                    } returned non-JSON result: ${preview}${
                      resultText.length > 100 ? "..." : ""
                    } | Parse error: ${parseError.message}`
                  );
                  // Treat non-JSON as raw text result
                  parsedResult = { result: resultText };
                }
              }

              // Emit tool result event for regular tools
              yield {
                type: "tool_result",
                toolId: item.tool_use_id,
                toolName: toolCall.name,
                result: parsedResult,
                error: error,
              };

              // Extract features and emit geo_feature events (only for regular tools with results)
              if (resultText) {
                const extractedFeatures = featureExtractor.extractFeatures(
                  toolCall.name,
                  resultText,
                  toolCall.input
                );

                // Emit geo_feature events for each extracted feature
                for (const feature of extractedFeatures) {
                  yield {
                    type: "geo_feature",
                    id: feature.id,
                    featureType: feature.type,
                    lat: feature.lat,
                    lon: feature.lon,
                    coordinates: feature.coordinates,
                    label: feature.label,
                    category: feature.category,
                  };
                }

                // Notify about tool result for async persistence
                if (onToolResult && !item.is_error) {
                  onToolResult({
                    toolName: toolCall.name,
                    result: resultText,
                    input: toolCall.input,
                    features: extractedFeatures,
                  });
                }
              }
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

  // Log pipeline summary if any sub-agents were executed
  if (subagentExecutions.length > 0 && pipelineStartTime !== null) {
    const completedExecutions = subagentExecutions.filter((e) => e.endTime);

    if (completedExecutions.length > 0) {
      // Build pipeline chain visualization
      const agentChain = completedExecutions
        .map((e) => e.agentName)
        .join(" → ");

      // Calculate total duration
      const lastEndTime = Math.max(
        ...completedExecutions.map((e) => e.endTime!)
      );
      const totalDurationMs = lastEndTime - pipelineStartTime;
      const totalDurationSec = (totalDurationMs / 1000).toFixed(1);

      console.log(
        `[WORKER] Sub-agent pipeline completed: ${agentChain} (total: ${totalDurationSec}s)`
      );
    }
  }
}
