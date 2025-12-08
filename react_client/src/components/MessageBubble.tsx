// ABOUTME: Individual message bubble component.
// ABOUTME: Renders different message types with appropriate styling.

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
      return (
        <div className="text-base00">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => (
                <ul className="list-disc ml-4 mb-2">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal ml-4 mb-2">{children}</ol>
              ),
              li: ({ children }) => <li className="mb-1">{children}</li>,
              strong: ({ children }) => (
                <strong className="font-semibold">{children}</strong>
              ),
              em: ({ children }) => <em className="italic">{children}</em>,
              code: ({ children }) => (
                <code className="bg-base1/30 px-1 py-0.5 rounded text-sm font-mono">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="bg-base1/30 p-2 rounded overflow-x-auto mb-2 text-sm">
                  {children}
                </pre>
              ),
              h1: ({ children }) => (
                <h1 className="text-lg font-bold mb-2">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-base font-bold mb-2">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-sm font-bold mb-1">{children}</h3>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  className="text-blue underline hover:text-blue/80"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto mb-2">
                  <table className="min-w-full text-sm border-collapse">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-base1/20">{children}</thead>
              ),
              tbody: ({ children }) => <tbody>{children}</tbody>,
              tr: ({ children }) => (
                <tr className="border-b border-base1/50">{children}</tr>
              ),
              th: ({ children }) => (
                <th className="px-2 py-1 text-left font-semibold border-b border-base1">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-2 py-1 border-b border-base1/30">
                  {children}
                </td>
              ),
            }}
          >
            {content.text}
          </Markdown>
        </div>
      );

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
              className={`font-bold ${
                content.error ? "text-red" : "text-cyan"
              }`}
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
            className={`font-bold ${
              content.error ? "text-red" : "text-violet"
            }`}
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
