// ABOUTME: Chat message model for displaying conversation history.
// ABOUTME: Uses discriminated unions for type-safe content handling.

import type { GeoFeature } from "./geo_feature";

export type MessageKind =
  | "user"
  | "assistant"
  | "toolCall"
  | "toolResult"
  | "subagentCall"
  | "subagentText"
  | "subagentResult"
  | "geoFeature"
  | "error";

export type MessageContent =
  | { type: "text"; text: string }
  | { type: "toolCall"; toolName: string; input: Record<string, unknown> }
  | {
      type: "toolResult";
      toolName: string;
      result?: Record<string, unknown>;
      error?: string;
    }
  | { type: "subagentCall"; agentName: string }
  | { type: "subagentText"; agentName: string; text: string }
  | { type: "subagentResult"; agentName: string; error?: string }
  | { type: "geoFeature"; feature: GeoFeature };

export interface Message {
  id: string;
  kind: MessageKind;
  content: MessageContent;
  timestamp: Date;
}

export function createTextMessage(
  id: string,
  kind: MessageKind,
  text: string
): Message {
  return {
    id,
    kind,
    content: { type: "text", text },
    timestamp: new Date(),
  };
}

export function createToolCallMessage(
  id: string,
  toolName: string,
  input: Record<string, unknown>
): Message {
  return {
    id,
    kind: "toolCall",
    content: { type: "toolCall", toolName, input },
    timestamp: new Date(),
  };
}

export function createToolResultMessage(
  id: string,
  toolName: string,
  result?: Record<string, unknown>,
  error?: string
): Message {
  return {
    id,
    kind: "toolResult",
    content: { type: "toolResult", toolName, result, error },
    timestamp: new Date(),
  };
}

export function createSubagentCallMessage(
  id: string,
  agentName: string
): Message {
  return {
    id,
    kind: "subagentCall",
    content: { type: "subagentCall", agentName },
    timestamp: new Date(),
  };
}

export function createSubagentTextMessage(
  id: string,
  agentName: string,
  text: string
): Message {
  return {
    id,
    kind: "subagentText",
    content: { type: "subagentText", agentName, text },
    timestamp: new Date(),
  };
}

export function createSubagentResultMessage(
  id: string,
  agentName: string,
  error?: string
): Message {
  return {
    id,
    kind: "subagentResult",
    content: { type: "subagentResult", agentName, error },
    timestamp: new Date(),
  };
}

export function createGeoFeatureMessage(
  id: string,
  feature: GeoFeature
): Message {
  return {
    id,
    kind: "geoFeature",
    content: { type: "geoFeature", feature },
    timestamp: new Date(),
  };
}
