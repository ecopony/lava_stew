// ABOUTME: Creates MCP server wrapping Python geospatial tools for Claude Agent SDK.
// ABOUTME: Translates between SDK tool interface and Python script execution.

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { geocodeSchema, calculateDistanceSchema } from "./tools";
import { executeGeocode, executeCalculateDistance } from "./executor";

export function createGeoTools(conversationId: string) {
  return createSdkMcpServer({
    name: "geo-tools",
    version: "1.0.0",
    tools: [
      tool(
        "geocode",
        "Convert a location name (city, address, etc.) to geographic coordinates (latitude/longitude)",
        geocodeSchema,
        async (args) => {
          const result = await executeGeocode(conversationId, args);

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
                  text: `Error: ${result.error}`,
                },
              ],
              isError: true,
            };
          }
        }
      ),
      tool(
        "calculate_distance",
        "Calculate the geodesic (great circle) distance between two geographic points",
        calculateDistanceSchema,
        async (args) => {
          const result = await executeCalculateDistance(conversationId, args);

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
                  text: `Error: ${result.error}`,
                },
              ],
              isError: true,
            };
          }
        }
      ),
    ],
  });
}
