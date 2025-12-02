// ABOUTME: Extracts geographic features from tool results
// ABOUTME: Converts geocoding and distance tool outputs into GeoFeature objects

import { randomUUID } from "crypto";
import type { GeoFeature } from "./types.js";
import type { IFeatureExtractor } from "./eventTransformer.js";

export class GeoFeatureExtractor implements IFeatureExtractor {
  extractFeatures(
    toolName: string,
    result: string,
    toolArguments: unknown
  ): GeoFeature[] {
    // Handle both MCP-prefixed names (mcp__geo-tools__geocode) and bare names
    if (toolName.includes("geocode")) {
      return this.extractGeocodeFeature(result, toolArguments);
    } else if (toolName.includes("calculate_distance")) {
      return this.extractDistanceFeatures(result, toolArguments);
    } else if (toolName.includes("remove_feature")) {
      // no-op for remove_feature tool
      return [];
    }
    return [];
  }

  private extractGeocodeFeature(
    result: string,
    toolArguments: unknown
  ): GeoFeature[] {
    try {
      const geocodeResult = JSON.parse(result);
      const lat = parseFloat(geocodeResult.lat);
      // Handle both 'lng' (from geocode script) and 'lon' (internal format)
      const lon = parseFloat(geocodeResult.lng || geocodeResult.lon);

      // Type guard: check if toolArguments has location property
      const location =
        toolArguments &&
        typeof toolArguments === "object" &&
        "location" in toolArguments &&
        typeof toolArguments.location === "string"
          ? toolArguments.location
          : undefined;

      const label = geocodeResult.formatted_address || location || "Unknown";

      return [
        {
          id: randomUUID(),
          type: "marker",
          lat,
          lon,
          label,
        },
      ];
    } catch (e) {
      console.error("Failed to extract geocode feature:", e);
      return [];
    }
  }

  private extractDistanceFeatures(
    result: string,
    toolArguments: unknown
  ): GeoFeature[] {
    try {
      const distanceResult = JSON.parse(result);
      const features: GeoFeature[] = [];

      // Extract start point if coordinates provided
      if (distanceResult.start_lat && distanceResult.start_lon) {
        // Type guard: check if toolArguments has start_location property
        const startLocation =
          toolArguments &&
          typeof toolArguments === "object" &&
          "start_location" in toolArguments &&
          typeof toolArguments.start_location === "string"
            ? toolArguments.start_location
            : undefined;

        features.push({
          id: randomUUID(),
          type: "marker",
          lat: parseFloat(distanceResult.start_lat),
          lon: parseFloat(distanceResult.start_lon),
          label: startLocation || "Start",
        });
      }

      // Extract end point if coordinates provided
      if (distanceResult.end_lat && distanceResult.end_lon) {
        // Type guard: check if toolArguments has end_location property
        const endLocation =
          toolArguments &&
          typeof toolArguments === "object" &&
          "end_location" in toolArguments &&
          typeof toolArguments.end_location === "string"
            ? toolArguments.end_location
            : undefined;

        features.push({
          id: randomUUID(),
          type: "marker",
          lat: parseFloat(distanceResult.end_lat),
          lon: parseFloat(distanceResult.end_lon),
          label: endLocation || "End",
        });
      }

      return features;
    } catch (e) {
      console.error("Failed to extract distance features:", e);
      return [];
    }
  }
}
