// ABOUTME: Creates MCP server wrapping Python geospatial tools for Claude Agent SDK.
// ABOUTME: Translates between SDK tool interface and Python script execution.

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import {
  executeAnalyzeLocationData,
  executeCalculateDistance,
  executeFetchAmenitiesOsm,
  executeFetchPoisOsm,
  executeFetchTransitOsm,
  executeGenerateIsochrone,
  executeGeocode,
  executeRemoveFeature,
  type ToolResult,
} from "./executor.js";
import {
  analyzeLocationDataSchema,
  calculateDistanceSchema,
  fetchAmenitiesOsmSchema,
  fetchPoisOsmSchema,
  fetchTransitOsmSchema,
  generateIsochroneSchema,
  geocodeSchema,
  removeFeatureSchema,
} from "./tools.js";

function formatErrorMessage(result: ToolResult): string {
  let message = `Error: ${result.error}`;

  if (result.errorMetadata) {
    const metadata = result.errorMetadata;
    if (metadata.rate_limited) {
      message +=
        "\nRate Limited: This is a temporary error. Please wait before retrying.";
    }
    if (metadata.timeout) {
      message +=
        "\nTimeout: The request took too long. Try using a smaller radius or fewer categories.";
    }
    if (metadata.details) {
      message += `\nDetails: ${metadata.details}`;
    }
  }

  return message;
}

function formatToolResult(result: ToolResult) {
  if (result.success) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  } else {
    return {
      content: [
        {
          type: "text" as const,
          text: formatErrorMessage(result),
        },
      ],
      isError: true,
    };
  }
}

function createGeocodeTool(conversationId: string) {
  return tool(
    "geocode",
    "Convert a location name (city, address, etc.) to geographic coordinates (latitude/longitude)",
    geocodeSchema,
    async (args) => formatToolResult(await executeGeocode(conversationId, args))
  );
}

function createCalculateDistanceTool(conversationId: string) {
  return tool(
    "calculate_distance",
    "Calculate the geodesic (great circle) distance between two geographic points",
    calculateDistanceSchema,
    async (args) =>
      formatToolResult(await executeCalculateDistance(conversationId, args))
  );
}

function createRemoveFeatureTool(conversationId: string) {
  return tool(
    "remove_feature",
    "Remove a geographic feature from the map by its location name or label. Only removes features that were added during this conversation.",
    removeFeatureSchema,
    async (args) =>
      formatToolResult(await executeRemoveFeature(conversationId, args))
  );
}

function createFetchPoisOsmTool(conversationId: string) {
  return tool(
    "fetch_pois_osm",
    "Fetch points of interest (restaurants, cafes, bars, shops) from OpenStreetMap within a radius",
    fetchPoisOsmSchema,
    async (args) =>
      formatToolResult(await executeFetchPoisOsm(conversationId, args))
  );
}

function createFetchTransitOsmTool(conversationId: string) {
  return tool(
    "fetch_transit_osm",
    "Fetch transit infrastructure (bus stops, train stations, tram stops) from OpenStreetMap",
    fetchTransitOsmSchema,
    async (args) =>
      formatToolResult(await executeFetchTransitOsm(conversationId, args))
  );
}

function createFetchAmenitiesOsmTool(conversationId: string) {
  return tool(
    "fetch_amenities_osm",
    "Fetch amenities (parks, attractions, museums, playgrounds) from OpenStreetMap",
    fetchAmenitiesOsmSchema,
    async (args) =>
      formatToolResult(await executeFetchAmenitiesOsm(conversationId, args))
  );
}

function createGenerateIsochroneTool(conversationId: string) {
  return tool(
    "generate_isochrone",
    "Generate walking time isochrone polygons showing areas reachable within specified time intervals",
    generateIsochroneSchema,
    async (args) =>
      formatToolResult(await executeGenerateIsochrone(conversationId, args))
  );
}

function createAnalyzeLocationDataTool(conversationId: string) {
  return tool(
    "analyze_location_data",
    "Analyze geospatial data to compute location intelligence metrics (density, walkability, isochrone coverage, clusters)",
    analyzeLocationDataSchema,
    async (args) =>
      formatToolResult(await executeAnalyzeLocationData(conversationId, args))
  );
}

export function createGeoTools(conversationId: string) {
  return createSdkMcpServer({
    name: "geo-tools",
    version: "1.0.0",
    tools: [
      createGeocodeTool(conversationId),
      createCalculateDistanceTool(conversationId),
      createRemoveFeatureTool(conversationId),
      createFetchPoisOsmTool(conversationId),
      createFetchTransitOsmTool(conversationId),
      createFetchAmenitiesOsmTool(conversationId),
      createGenerateIsochroneTool(conversationId),
      createAnalyzeLocationDataTool(conversationId),
    ],
  });
}
