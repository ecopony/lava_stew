// ABOUTME: State for the map visualization.
// ABOUTME: Contains geographic features and view configuration.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LatLngBounds {
  southWest: LatLng;
  northEast: LatLng;
}

export interface MapMarker {
  id: string;
  position: LatLng;
  label?: string;
  category?: string;
}

export interface MapPolygon {
  id: string;
  coordinates: [number, number][][];
  label?: string;
  category?: string;
}

export interface MapState {
  markers: MapMarker[];
  polygons: MapPolygon[];
  zoom: number;
  center: LatLng;
  autoFrameEnabled: boolean;
  conversationBounds: LatLngBounds | null;
  /** Incremented when bounds should be fit by the map component */
  fitBoundsVersion: number;
}

// San Francisco as default center
const DEFAULT_CENTER: LatLng = { lat: 37.7749, lng: -122.4194 };
const DEFAULT_ZOOM = 5.0;

export function createInitialMapState(): MapState {
  return {
    markers: [],
    polygons: [],
    zoom: DEFAULT_ZOOM,
    center: DEFAULT_CENTER,
    autoFrameEnabled: true,
    conversationBounds: null,
    fitBoundsVersion: 0,
  };
}
