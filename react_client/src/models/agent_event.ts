// ABOUTME: Domain events emitted by the agent for client consumption.
// ABOUTME: Uses discriminated unions for type-safe event handling.

import { type GeoFeature, parseGeoFeature } from "./geo_feature";

export type AgentEvent =
  | { type: "assistant_thinking" }
  | { type: "assistant_message_chunk"; chunk: string }
  | { type: "assistant_message_complete" }
  | {
      type: "tool_start";
      toolId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      toolId: string;
      toolName: string;
      result?: Record<string, unknown>;
      error?: string;
    }
  | { type: "subagent_started"; toolId: string; agentName: string }
  | {
      type: "subagent_text_chunk";
      toolId: string;
      agentName: string;
      chunk: string;
    }
  | {
      type: "subagent_completed";
      toolId: string;
      agentName: string;
      error?: string;
    }
  | { type: "geo_feature"; feature: GeoFeature }
  | { type: "feature_removed"; featureId: string; label: string }
  | { type: "error"; errorType: string; message: string }
  | { type: "done" }
  | { type: "unknown"; eventType: string; data: Record<string, unknown> };

export function parseAgentEvent(json: Record<string, unknown>): AgentEvent {
  const eventType = json.type as string | undefined;

  switch (eventType) {
    case "assistant_thinking":
      return { type: "assistant_thinking" };

    case "assistant_message_chunk":
      return {
        type: "assistant_message_chunk",
        chunk: (json.chunk as string) ?? "",
      };

    case "assistant_message_complete":
      return { type: "assistant_message_complete" };

    case "tool_start":
      return {
        type: "tool_start",
        toolId: json.toolId as string,
        toolName: json.toolName as string,
        input: (json.input as Record<string, unknown>) ?? {},
      };

    case "tool_result":
      return {
        type: "tool_result",
        toolId: json.toolId as string,
        toolName: json.toolName as string,
        result: json.result as Record<string, unknown> | undefined,
        error: json.error as string | undefined,
      };

    case "subagent_started":
      return {
        type: "subagent_started",
        toolId: json.toolId as string,
        agentName: json.agentName as string,
      };

    case "subagent_text_chunk":
      return {
        type: "subagent_text_chunk",
        toolId: json.toolId as string,
        agentName: json.agentName as string,
        chunk: (json.chunk as string) ?? "",
      };

    case "subagent_completed":
      return {
        type: "subagent_completed",
        toolId: json.toolId as string,
        agentName: json.agentName as string,
        error: json.error as string | undefined,
      };

    case "geo_feature":
      return {
        type: "geo_feature",
        feature: parseGeoFeature(json),
      };

    case "feature_removed":
      return {
        type: "feature_removed",
        featureId: json.featureId as string,
        label: (json.label as string) ?? "Unknown",
      };

    case "error":
      return {
        type: "error",
        errorType: (json.errorType as string) ?? "unknown",
        message: (json.message as string) ?? "Unknown error",
      };

    case "done":
      return { type: "done" };

    default:
      return {
        type: "unknown",
        eventType: eventType ?? "unknown",
        data: json,
      };
  }
}

export function parseAgentEventFromSSE(data: string): AgentEvent {
  const json = JSON.parse(data) as Record<string, unknown>;
  return parseAgentEvent(json);
}
