// ABOUTME: Geographic feature model for markers and spatial data.
// ABOUTME: Extracted from tool results and displayed on the map.

export interface GeoFeature {
  id: string;
  type: string;
  lat: number;
  lon: number;
  label?: string;
}

export function parseGeoFeature(json: Record<string, unknown>): GeoFeature {
  return {
    id: json.id as string,
    type: (json.type as string) ?? "marker",
    lat: (json.lat as number) ?? 0.0,
    lon: (json.lon as number) ?? 0.0,
    label: json.label as string | undefined,
  };
}
