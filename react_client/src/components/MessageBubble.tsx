// ABOUTME: Individual message bubble component.
// ABOUTME: Renders different message types with appropriate styling.

import type { Message, MessageContent } from "../models";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  // Don't display geoFeature messages in chat (they're for the map only)
  if (message.kind === "geoFeature") {
    return null;
  }

  const isUser = message.kind === "user";
  const isError = message.kind === "error";

  return (
    <div className={`py-1 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[500px] px-4 py-3 rounded-xl border ${
          isError
            ? "bg-red/10 border-red"
            : isUser
              ? "bg-blue/10 border-blue"
              : "bg-base3 border-base1"
        }`}
      >
        <MessageContentRenderer content={message.content} />
      </div>
    </div>
  );
}

function MessageContentRenderer({ content }: { content: MessageContent }) {
  switch (content.type) {
    case "text":
      return <p className="text-base00 whitespace-pre-wrap">{content.text}</p>;

    case "toolCall":
      return (
        <div>
          <div className="flex items-center gap-2">
            <span className="text-cyan">🔧</span>
            <span className="font-bold text-cyan">
              Using {content.toolName}
            </span>
          </div>
          <p className="text-xs text-base00/70 mt-1">
            {JSON.stringify(content.input, null, 2)}
          </p>
        </div>
      );

    case "toolResult":
      return (
        <div>
          <div className="flex items-center gap-2">
            <span className={content.error ? "text-red" : "text-cyan"}>
              {content.error ? "❌" : "✓"}
            </span>
            <span
              className={`font-bold ${content.error ? "text-red" : "text-cyan"}`}
            >
              {content.toolName} result
            </span>
          </div>
          <p className="text-xs text-base00/70 mt-1">
            {content.error ?? JSON.stringify(content.result, null, 2)}
          </p>
        </div>
      );

    case "subagentCall":
      return (
        <div className="flex items-center gap-2">
          <span className="text-violet">🧠</span>
          <span className="font-bold text-violet">
            Sub-agent: {content.agentName}
          </span>
        </div>
      );

    case "subagentResult":
      return (
        <div className="flex items-center gap-2">
          <span className={content.error ? "text-red" : "text-violet"}>
            {content.error ? "❌" : "✓"}
          </span>
          <span
            className={`font-bold ${content.error ? "text-red" : "text-violet"}`}
          >
            {content.agentName} {content.error ? "failed" : "completed"}
          </span>
        </div>
      );

    case "geoFeature":
      return null;

    default:
      return <p className="text-base00">Unknown message type</p>;
  }
}
