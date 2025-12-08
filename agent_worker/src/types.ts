// ABOUTME: Type definitions for geographic features and database models
// ABOUTME: Defines GeoFeature structure used throughout the worker

import type { Point, LineString, Polygon } from "geojson";

// The Agent SDK re-exports the Anthropic SDK's BetaUsage as Usage
// We can't import it directly, so we'll redefine based on the SDK's structure
type SdkUsage = {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

// Geometry types we support for rendering and persistence
export type GeoJSONGeometryType = Point | LineString | Polygon;

export interface GeoFeature {
  id: string;
  geometry: GeoJSONGeometryType;
  properties: {
    label?: string;
    [key: string]: unknown;
  };
}

export interface StoredGeoFeature {
  id: string;
  message_id: string;
  feature_type: string;
  geometry: GeoJSONGeometryType;
  properties: Record<string, unknown>;
  created_at: Date;
}

// Agent SDK usage metrics - extends the SDK's Usage type with our additional fields
// SDK's Usage has: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens (all nullable)
export interface UsageMetrics extends SdkUsage {
  // We add the granular cache creation breakdown that comes from the SDK
  cache_creation?: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  };
  service_tier?: string;
}
