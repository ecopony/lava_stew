// ABOUTME: Defines geospatial tool schemas for the Claude Agent SDK.
// ABOUTME: Tools invoke Python scripts for geocoding and distance calculations.

import { z } from "zod";

// GeoJSON schemas for structured validation
const pointGeometrySchema = z.object({
  type: z.literal("Point"),
  coordinates: z
    .tuple([z.number(), z.number()])
    .describe("Longitude, Latitude"),
});

const polygonGeometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z
    .array(z.array(z.tuple([z.number(), z.number()])))
    .describe("Array of linear rings (array of coordinate pairs)"),
});

const geometrySchema = z.union([pointGeometrySchema, polygonGeometrySchema]);

const featureSchema = z.object({
  type: z.literal("Feature"),
  geometry: geometrySchema,
  properties: z.record(z.any()).optional(),
});

const featureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(featureSchema),
});

export const geocodeSchema = {
  location: z
    .string()
    .describe(
      "Location name to geocode (e.g., 'Seattle, WA', 'Portland, Oregon')"
    ),
};

export const calculateDistanceSchema = {
  point1: z.object({
    lat: z.number().describe("Latitude of first point"),
    lng: z.number().describe("Longitude of first point"),
  }),
  point2: z.object({
    lat: z.number().describe("Latitude of second point"),
    lng: z.number().describe("Longitude of second point"),
  }),
};

export const removeFeatureSchema = {
  location: z
    .string()
    .describe(
      "Name or label of the feature to remove from the map (e.g., 'Seattle', 'Portland')"
    ),
};

export const fetchPoisOsmSchema = {
  lat: z.number().describe("Latitude of center point"),
  lon: z.number().describe("Longitude of center point"),
  radius_meters: z.number().describe("Search radius in meters"),
  categories: z
    .array(z.string())
    .describe("POI categories to fetch (e.g., ['restaurant', 'cafe', 'bar'])"),
};

export const fetchTransitOsmSchema = {
  lat: z.number().describe("Latitude of center point"),
  lon: z.number().describe("Longitude of center point"),
  radius_meters: z.number().describe("Search radius in meters"),
};

export const fetchAmenitiesOsmSchema = {
  lat: z.number().describe("Latitude of center point"),
  lon: z.number().describe("Longitude of center point"),
  radius_meters: z.number().describe("Search radius in meters"),
};

export const generateIsochroneSchema = {
  lat: z.number().describe("Latitude of center point"),
  lon: z.number().describe("Longitude of center point"),
  time_intervals: z
    .array(z.number())
    .describe(
      "Time intervals in minutes for isochrone generation (e.g., [5, 10, 15])"
    ),
};

export const analyzeLocationDataSchema = {
  pois_geojson: featureCollectionSchema.describe(
    "GeoJSON FeatureCollection with POIs from fetch_pois_osm"
  ),
  transit_geojson: featureCollectionSchema.describe(
    "GeoJSON FeatureCollection with transit data from fetch_transit_osm"
  ),
  amenities_geojson: featureCollectionSchema.describe(
    "GeoJSON FeatureCollection with amenities from fetch_amenities_osm"
  ),
  isochrones_geojson: featureCollectionSchema.describe(
    "GeoJSON FeatureCollection with isochrones from generate_isochrone"
  ),
  center_lat: z.number().describe("Latitude of analysis center point"),
  center_lon: z.number().describe("Longitude of analysis center point"),
  radius_meters: z.number().describe("Analysis radius in meters"),
};
