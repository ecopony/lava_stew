// ABOUTME: State model for chat BLoC.
// ABOUTME: Tracks messages, loading status, and current conversation.

import type { Message } from "../../models";

export type ChatStatus =
  | "idle"
  | "loading"
  | "assistantThinking"
  | "assistantTyping"
  | "toolExecuting"
  | "subagentExecuting"
  | "error";

export interface ChatState {
  conversationId: string;
  messages: Message[];
  status: ChatStatus;
  inputText: string;
  errorMessage?: string;
  currentToolCall?: string;
  currentSubagent?: string;
}

function generateConversationId(): string {
  return `conv_${Date.now()}`;
}

export function createInitialChatState(): ChatState {
  return {
    conversationId: generateConversationId(),
    messages: [],
    status: "idle",
    inputText: "",
  };
}
