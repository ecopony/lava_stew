// ABOUTME: Geographic feature model for markers and spatial data.
// ABOUTME: Extracted from tool results and displayed on the map.

export interface GeoFeature {
  id: string;
  type: "marker" | "polygon";
  // For markers (points)
  lat?: number;
  lon?: number;
  // For polygons
  coordinates?: [number, number][][];
  // Common
  label?: string;
  category?: string;
}

export function parseGeoFeature(json: Record<string, unknown>): GeoFeature {
  return {
    id: json.id as string,
    type: (json.featureType as "marker" | "polygon") ?? "marker",
    lat: json.lat as number | undefined,
    lon: json.lon as number | undefined,
    coordinates: json.coordinates as [number, number][][] | undefined,
    label: json.label as string | undefined,
    category: json.category as string | undefined,
  };
}
