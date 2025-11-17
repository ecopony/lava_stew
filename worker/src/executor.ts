// ABOUTME: Executes Python geospatial tools via uv and child_process.
// ABOUTME: Handles tool invocation, result parsing, and error handling with structured logging.

import { execFileSync } from "child_process";
import path from "path";

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ToolInvocation {
  conversationId: string;
  toolName: string;
  input: any;
  output: ToolResult;
  durationMs: number;
}

function logToolInvocation(invocation: ToolInvocation) {
  const inputStr = JSON.stringify(invocation.input);
  const outputStr = invocation.output.success
    ? JSON.stringify(invocation.output.data)
    : `ERROR: ${invocation.output.error}`;

  console.log(
    `[TOOL] ${invocation.conversationId} | ${invocation.toolName} | ${inputStr} | ${outputStr} | ${invocation.durationMs}ms`
  );
}

function parseErrorMessage(error: any): string {
  const errorMessage = error.stderr?.toString() || error.message;

  try {
    const errorJson = JSON.parse(errorMessage);
    return errorJson.error || errorMessage;
  } catch {
    return errorMessage;
  }
}

function executePythonTool(
  conversationId: string,
  toolName: string,
  scriptName: string,
  scriptArgs: string[],
  input: any
): ToolResult {
  const startTime = Date.now();

  try {
    const scriptPath = path.join(process.cwd(), "scripts", scriptName);

    const output = execFileSync("uv", ["run", "python", scriptPath, ...scriptArgs], {
      encoding: "utf-8",
      env: { ...process.env },
      timeout: 10000,
    });

    const data = JSON.parse(output.trim());
    const result: ToolResult = { success: true, data };

    logToolInvocation({
      conversationId,
      toolName,
      input,
      output: result,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error: any) {
    const result: ToolResult = { success: false, error: parseErrorMessage(error) };

    logToolInvocation({
      conversationId,
      toolName,
      input,
      output: result,
      durationMs: Date.now() - startTime,
    });

    return result;
  }
}

export async function executeGeocode(
  conversationId: string,
  args: { location: string }
): Promise<ToolResult> {
  return executePythonTool(
    conversationId,
    "geocode",
    "geocode.py",
    [args.location],
    args
  );
}

export async function executeCalculateDistance(
  conversationId: string,
  args: {
    point1: { lat: number; lng: number };
    point2: { lat: number; lng: number };
  }
): Promise<ToolResult> {
  const point1Str = `${args.point1.lat},${args.point1.lng}`;
  const point2Str = `${args.point2.lat},${args.point2.lng}`;

  return executePythonTool(
    conversationId,
    "calculate_distance",
    "calculate_distance.py",
    [point1Str, point2Str],
    args
  );
}
