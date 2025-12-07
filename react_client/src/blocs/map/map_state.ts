// ABOUTME: State for the map visualization.
// ABOUTME: Contains geographic features and auto-framing configuration.

import type { GeoFeature } from "../../models";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LatLngBounds {
  southWest: LatLng;
  northEast: LatLng;
}

export interface MapState {
  features: GeoFeature[];
  autoFrameEnabled: boolean;
  /** Bounds encompassing all features in the conversation */
  conversationBounds: LatLngBounds | null;
  /** Incremented when bounds should be fit by the map component */
  fitBoundsVersion: number;
}

export function createInitialMapState(): MapState {
  return {
    features: [],
    autoFrameEnabled: true,
    conversationBounds: null,
    fitBoundsVersion: 0,
  };
}
