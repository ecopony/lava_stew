// ABOUTME: Unit tests for SDK tool-use audit hook.
// ABOUTME: Verifies PreToolUse logging and the continue result.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createToolAuditHook } from "./hooks.js";

describe("createToolAuditHook", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("logs the tool name and conversation id, and returns continue", async () => {
    const hook = createToolAuditHook("conv-1");

    const result = await hook(
      {
        hook_event_name: "PreToolUse",
        tool_name: "mcp__geo-tools__geocode",
        tool_input: { location: "Seattle" },
        tool_use_id: "t1",
      } as any,
      "t1",
      { signal: new AbortController().signal }
    );

    expect(result).toEqual({ continue: true });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("mcp__geo-tools__geocode")
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("conv-1"));
  });
});
