// ABOUTME: Executes Python geospatial tools via uv and child_process.
// ABOUTME: Handles tool invocation, result parsing, and error handling with structured logging.

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { ensureConversation } from "./models/conversation.js";
import { findAndDeleteFeatureByLabel } from "./models/geoFeature.js";
import { getRpcClient } from "./rabbitmq.js";

const execFileAsync = promisify(execFile);

// Timeout constants
// Script execution timeout: time allowed for Python script to run
const SCRIPT_TIMEOUT_MS = 35000;
// RPC timeout: must account for script timeout + queue time + rate limiting + network latency
// Buffer: 15s for queue time, rate limiting (1-2s), and network overhead
const RPC_TIMEOUT_MS = 50000;

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  errorMetadata?: {
    rate_limited?: boolean;
    timeout?: boolean;
    details?: string;
  };
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

function parseErrorMessage(error: any): {
  message: string;
  metadata?: ToolResult["errorMetadata"];
} {
  const errorMessage = error.stderr?.toString() || error.message;

  try {
    const errorJson = JSON.parse(errorMessage);

    // Extract structured error metadata if present
    const metadata: ToolResult["errorMetadata"] = {};
    if (errorJson.rate_limited) {
      metadata.rate_limited = true;
    }
    if (errorJson.timeout) {
      metadata.timeout = true;
    }
    if (errorJson.details) {
      metadata.details = errorJson.details;
    }

    return {
      message: errorJson.error || errorMessage,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  } catch {
    return { message: errorMessage };
  }
}

async function executePythonTool(
  conversationId: string,
  toolName: string,
  scriptName: string,
  scriptArgs: string[],
  input: any
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    const scriptPath = path.join(process.cwd(), "scripts", scriptName);

    const { stdout, stderr } = await execFileAsync(
      "uv",
      ["run", "python", scriptPath, ...scriptArgs],
      {
        encoding: "utf-8",
        env: { ...process.env },
        timeout: SCRIPT_TIMEOUT_MS,
      }
    );

    // Log stderr output if present (Python logging goes here)
    if (stderr && stderr.trim()) {
      console.error(stderr.trim());
    }

    const data = JSON.parse(stdout.trim());
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
    // Log stderr if present (may contain Python logging or error details)
    if (error.stderr && error.stderr.trim()) {
      console.error(error.stderr.trim());
    }

    const parsedError = parseErrorMessage(error);
    const result: ToolResult = {
      success: false,
      error: parsedError.message,
      errorMetadata: parsedError.metadata,
    };

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

async function executeViaApiWorker(
  conversationId: string,
  toolName: string,
  queueName: string,
  scriptName: string,
  scriptArgs: string[],
  input: any,
  timeoutMs: number = RPC_TIMEOUT_MS
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    console.log(
      `[EXECUTOR] Routing to ${queueName} | ${conversationId} | ${toolName}`
    );

    const rpcClient = await getRpcClient();
    const response = await rpcClient.sendRpcRequest(
      queueName,
      {
        scriptName,
        scriptArgs,
        conversationId,
      },
      timeoutMs
    );

    logToolInvocation({
      conversationId,
      toolName,
      input,
      output: response,
      durationMs: Date.now() - startTime,
    });

    return response;
  } catch (error: any) {
    const result: ToolResult = {
      success: false,
      error: error.message,
      errorMetadata: { timeout: error.message.includes("timed out") },
    };

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
  return executeViaApiWorker(
    conversationId,
    "geocode",
    "google_maps.requests",
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

  return await executePythonTool(
    conversationId,
    "calculate_distance",
    "calculate_distance.py",
    [point1Str, point2Str],
    args
  );
}

export async function executeRemoveFeature(
  conversationId: string,
  args: { location: string }
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    // Look up conversation UUID from session_key
    const conversation = await ensureConversation(conversationId);

    const deletedFeature = await findAndDeleteFeatureByLabel(
      conversation.id,
      args.location
    );

    if (!deletedFeature) {
      const result: ToolResult = {
        success: false,
        error: `No feature matching "${args.location}" found in this conversation`,
      };

      logToolInvocation({
        conversationId,
        toolName: "remove_feature",
        input: args,
        output: result,
        durationMs: Date.now() - startTime,
      });

      return result;
    }

    const data = {
      id: deletedFeature.id,
      label: deletedFeature.properties?.label || "Unknown",
      message: `Removed feature "${deletedFeature.properties?.label}" from the map`,
    };

    const result: ToolResult = { success: true, data };

    logToolInvocation({
      conversationId,
      toolName: "remove_feature",
      input: args,
      output: result,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error: any) {
    const result: ToolResult = {
      success: false,
      error: error.message || "Failed to remove feature",
    };

    logToolInvocation({
      conversationId,
      toolName: "remove_feature",
      input: args,
      output: result,
      durationMs: Date.now() - startTime,
    });

    return result;
  }
}

export async function executeFetchPoisOsm(
  conversationId: string,
  args: {
    lat: number;
    lon: number;
    radius_meters: number;
    categories: string[];
  }
): Promise<ToolResult> {
  return executeViaApiWorker(
    conversationId,
    "fetch_pois_osm",
    "overpass.requests",
    "fetch_pois_osm.py",
    [JSON.stringify(args)],
    args
  );
}

export async function executeFetchTransitOsm(
  conversationId: string,
  args: { lat: number; lon: number; radius_meters: number }
): Promise<ToolResult> {
  return executeViaApiWorker(
    conversationId,
    "fetch_transit_osm",
    "overpass.requests",
    "fetch_transit_osm.py",
    [JSON.stringify(args)],
    args
  );
}

export async function executeFetchAmenitiesOsm(
  conversationId: string,
  args: { lat: number; lon: number; radius_meters: number }
): Promise<ToolResult> {
  return executeViaApiWorker(
    conversationId,
    "fetch_amenities_osm",
    "overpass.requests",
    "fetch_amenities_osm.py",
    [JSON.stringify(args)],
    args
  );
}

export async function executeGenerateIsochrone(
  conversationId: string,
  args: { lat: number; lon: number; time_intervals: number[] }
): Promise<ToolResult> {
  return executeViaApiWorker(
    conversationId,
    "generate_isochrone",
    "openroute.requests",
    "generate_isochrone.py",
    [JSON.stringify(args)],
    args
  );
}

export async function executeAnalyzeLocationData(
  conversationId: string,
  args: {
    pois_geojson: any;
    transit_geojson: any;
    amenities_geojson: any;
    isochrones_geojson: any;
    center_lat: number;
    center_lon: number;
    radius_meters: number;
  }
): Promise<ToolResult> {
  // Convert validated GeoJSON objects to strings for Python script
  const pythonArgs = {
    pois_geojson: JSON.stringify(args.pois_geojson),
    transit_geojson: JSON.stringify(args.transit_geojson),
    amenities_geojson: JSON.stringify(args.amenities_geojson),
    isochrones_geojson: JSON.stringify(args.isochrones_geojson),
    center_lat: args.center_lat,
    center_lon: args.center_lon,
    radius_meters: args.radius_meters,
  };

  return await executePythonTool(
    conversationId,
    "analyze_location_data",
    "analyze_location_data.py",
    [JSON.stringify(pythonArgs)],
    args
  );
}
