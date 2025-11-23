// ABOUTME: Type definitions for geographic features and database models
// ABOUTME: Defines GeoFeature structure used throughout the worker

export interface GeoFeature {
  id: string;
  type: 'marker' | 'line' | 'polygon';
  lat: number;
  lon: number;
  label: string;
}

// GeoJSON geometry representation from PostGIS ST_AsGeoJSON
export interface GeoJSONGeometry {
  type: string;
  coordinates: number[] | number[][] | number[][][];
}

export interface StoredGeoFeature {
  id: string;
  message_id: string;
  feature_type: string;
  geometry: GeoJSONGeometry;
  properties: Record<string, any>;
  created_at: Date;
}
