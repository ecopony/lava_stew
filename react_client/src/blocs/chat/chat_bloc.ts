// ABOUTME: BLoC managing chat state and API server communication.
// ABOUTME: Consumes agent event streams from API server for real-time updates.

import { Bloc } from "@granite-crisp/react-bloc";
import type { ChatEvent } from "./chat_event";
import { type ChatState, createInitialChatState } from "./chat_state";
import type { MapBloc } from "../map/map_bloc";
import { ApiClient } from "../../services/api_client";
import {
  type Message,
  createTextMessage,
  createToolCallMessage,
  createToolResultMessage,
  createSubagentCallMessage,
  createSubagentTextMessage,
  createSubagentResultMessage,
  createGeoFeatureMessage,
} from "../../models";

export class ChatBloc extends Bloc<ChatEvent, ChatState> {
  private readonly apiClient: ApiClient;
  private readonly mapBloc: MapBloc;

  constructor(apiClient: ApiClient, mapBloc: MapBloc) {
    super(createInitialChatState());
    this.apiClient = apiClient;
    this.mapBloc = mapBloc;
  }

  add(event: ChatEvent): void {
    switch (event.type) {
      case "setInputText":
        this.emit({ inputText: event.text });
        break;
      case "sendMessage":
        this.handleSendMessage();
        break;
    }
  }

  private async handleSendMessage(): Promise<void> {
    const messageText = this.state.inputText.trim();
    if (!messageText) return;

    // Add user message and clear input
    const userMessage = createTextMessage(
      String(Date.now()),
      "user",
      messageText
    );

    let messages: Message[] = [...this.state.messages, userMessage];

    this.emit({
      messages,
      inputText: "",
      status: "loading",
    });

    try {
      const eventStream = this.apiClient.sendMessage(
        this.state.conversationId,
        messageText
      );

      // Buffer for building up assistant message text
      let currentAssistantMessageId: string | null = null;
      let assistantTextBuffer = "";
      let messageCounter = 0;

      // Per-subagent streamed-text buffers, keyed by Task tool id
      // (subagents can run in parallel, so chunks interleave)
      const subagentTextBuffers = new Map<string, { id: string; text: string }>();

      for await (const event of eventStream) {
        switch (event.type) {
          case "assistant_thinking":
            this.emit({ status: "assistantThinking" });
            break;

          case "assistant_message_chunk":
            assistantTextBuffer += event.chunk;

            if (currentAssistantMessageId === null) {
              messageCounter++;
              currentAssistantMessageId = `assistant_${Date.now()}_${messageCounter}`;

              messages = [
                ...messages,
                createTextMessage(
                  currentAssistantMessageId,
                  "assistant",
                  assistantTextBuffer
                ),
              ];
            } else {
              // Update the last message with accumulated text
              const lastIndex = messages.length - 1;
              if (
                lastIndex >= 0 &&
                messages[lastIndex].id === currentAssistantMessageId
              ) {
                messages = [
                  ...messages.slice(0, lastIndex),
                  createTextMessage(
                    currentAssistantMessageId,
                    "assistant",
                    assistantTextBuffer
                  ),
                ];
              }
            }

            this.emit({
              messages,
              status: "assistantTyping",
            });
            break;

          case "assistant_message_complete":
            currentAssistantMessageId = null;
            assistantTextBuffer = "";
            this.emit({ status: "idle" });
            break;

          case "tool_start":
            messages = [
              ...messages,
              createToolCallMessage(event.toolId, event.toolName, event.input),
            ];
            this.emit({
              messages,
              currentToolCall: event.toolName,
              status: "toolExecuting",
            });
            break;

          case "tool_result":
            messages = [
              ...messages,
              createToolResultMessage(
                `${event.toolId}_result`,
                event.toolName,
                event.result,
                event.error
              ),
            ];
            this.emit({
              messages,
              currentToolCall: undefined,
              status: "assistantThinking",
            });
            break;

          case "subagent_started":
            messages = [
              ...messages,
              createSubagentCallMessage(event.toolId, event.agentName),
            ];
            this.emit({
              messages,
              currentSubagent: event.agentName,
              status: "subagentExecuting",
            });
            break;

          case "subagent_text_chunk": {
            let entry = subagentTextBuffers.get(event.toolId);
            if (!entry) {
              messageCounter++;
              entry = {
                id: `subagent_text_${event.toolId}_${messageCounter}`,
                text: event.chunk,
              };
              subagentTextBuffers.set(event.toolId, entry);
              messages = [
                ...messages,
                createSubagentTextMessage(
                  entry.id,
                  event.agentName,
                  entry.text
                ),
              ];
            } else {
              entry.text += event.chunk;
              const idx = messages.findIndex((m) => m.id === entry!.id);
              if (idx >= 0) {
                messages = [
                  ...messages.slice(0, idx),
                  createSubagentTextMessage(
                    entry.id,
                    event.agentName,
                    entry.text
                  ),
                  ...messages.slice(idx + 1),
                ];
              }
            }
            this.emit({ messages, status: "subagentExecuting" });
            break;
          }

          case "subagent_completed":
            messages = [
              ...messages,
              createSubagentResultMessage(
                `${event.toolId}_result`,
                event.agentName,
                event.error
              ),
            ];
            this.emit({
              messages,
              currentSubagent: undefined,
              status: "assistantThinking",
            });
            break;

          case "geo_feature":
            this.mapBloc.add({ type: "addGeoFeature", feature: event.feature });
            messages = [
              ...messages,
              createGeoFeatureMessage(event.feature.id, event.feature),
            ];
            this.emit({ messages });
            break;

          case "feature_removed":
            this.mapBloc.add({
              type: "removeGeoFeature",
              featureId: event.featureId,
            });
            break;

          case "error":
            throw new Error(`${event.errorType}: ${event.message}`);

          case "done":
            // Stream complete
            break;

          case "unknown":
            console.warn("Unknown event type:", event.eventType);
            break;
        }
      }

      this.emit({
        messages,
        status: "idle",
        currentToolCall: undefined,
        currentSubagent: undefined,
      });
    } catch (e) {
      console.error("Error during message send:", e);

      const errorMessage = createTextMessage(
        String(Date.now()),
        "error",
        `Error: ${e instanceof Error ? e.message : String(e)}`
      );

      this.emit({
        messages: [...messages, errorMessage],
        status: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
        currentToolCall: undefined,
        currentSubagent: undefined,
      });
    }
  }
}
