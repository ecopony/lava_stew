// ABOUTME: SDK hook callbacks for tool-use observability at the MCP boundary.
// ABOUTME: Complements executor.ts logging by capturing every tool call, including subagent Task dispatches.

import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

export function createToolAuditHook(conversationId: string): HookCallback {
  return async (input) => {
    if (input.hook_event_name === "PreToolUse") {
      console.log(
        `[HOOK] ${conversationId} | PreToolUse | ${input.tool_name} | ${JSON.stringify(
          input.tool_input
        )}`
      );
    }
    return { continue: true };
  };
}
