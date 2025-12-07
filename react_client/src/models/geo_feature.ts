// ABOUTME: Geographic feature model using standard GeoJSON types.
// ABOUTME: Extracted from tool results and displayed on the map.

import type { Point, LineString, Polygon } from "geojson";

export type GeoJSONGeometry = Point | LineString | Polygon;

export interface GeoFeature {
  id: string;
  geometry: GeoJSONGeometry;
  properties: {
    label?: string;
    featureCategory?: string;
    [key: string]: unknown;
  };
}

export function parseGeoFeature(json: Record<string, unknown>): GeoFeature {
  const geometry = json.geometry as GeoJSONGeometry | undefined;
  const properties = (json.properties as Record<string, unknown>) ?? {};

  // Handle legacy format with lat/lon at top level
  if (
    !geometry &&
    typeof json.lat === "number" &&
    typeof json.lon === "number"
  ) {
    return {
      id: json.id as string,
      geometry: {
        type: "Point",
        coordinates: [json.lon as number, json.lat as number],
      },
      properties: {
        label: (json.label as string) ?? undefined,
        ...properties,
      },
    };
  }

  return {
    id: json.id as string,
    geometry: geometry ?? { type: "Point", coordinates: [0, 0] },
    properties: {
      label: properties.label as string | undefined,
      ...properties,
    },
  };
}
