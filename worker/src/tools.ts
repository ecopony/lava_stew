// ABOUTME: Defines geospatial tool schemas for the Claude Agent SDK.
// ABOUTME: Tools invoke Python scripts for geocoding and distance calculations.

import { z } from "zod";

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
