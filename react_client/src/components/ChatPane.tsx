// ABOUTME: Chat interface pane with message list and input field.
// ABOUTME: Displays user and assistant messages, tool calls, and errors.

import { useRef, useEffect } from "react";
import { useChatBloc, useChatBlocState } from "../blocs";
import { MessageBubble } from "./MessageBubble";

export function ChatPane() {
  const chatBloc = useChatBloc();
  const state = useChatBlocState();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages]);

  const handleSend = () => {
    chatBloc.add({ type: "sendMessage" });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isProcessing = state.status !== "idle" && state.status !== "error";

  const statusText =
    state.status === "assistantThinking"
      ? "Assistant is thinking..."
      : state.status === "toolExecuting" && state.currentToolCall
      ? `Using ${state.currentToolCall}...`
      : state.status === "subagentExecuting" && state.currentSubagent
      ? `Sub-agent working: ${state.currentSubagent}...`
      : null;

  return (
    <div className="flex flex-col h-full bg-base2">
      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4">
        {state.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Status indicator */}
        {statusText && (
          <div className="flex items-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-blue border-t-transparent rounded-full animate-spin" />
            <span className="text-blue italic">{statusText}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Divider */}
      <div className="h-px bg-base1" />

      {/* Input area */}
      <div className="p-4 flex gap-2">
        <input
          type="text"
          value={state.inputText}
          onChange={(e) =>
            chatBloc.add({ type: "setInputText", text: e.target.value })
          }
          onKeyDown={handleKeyDown}
          placeholder="Ask about locations or distances..."
          className="flex-1 px-4 py-2 border border-base1 rounded-lg bg-base3 text-base00 placeholder:text-base1 focus:outline-none focus:border-blue"
        />
        <button
          onClick={handleSend}
          disabled={isProcessing}
          className="px-4 py-2 bg-blue text-base3 rounded-lg hover:bg-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}
