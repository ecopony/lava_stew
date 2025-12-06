// ABOUTME: Events for map state management.
// ABOUTME: Handle adding/removing geographic features from the map.

import type { GeoFeature } from "../../models";
import type { LatLng } from "./map_state";

export type MapEvent =
  | { type: "addGeoFeature"; feature: GeoFeature }
  | { type: "removeGeoFeature"; featureId: string }
  | { type: "clearMap" }
  | { type: "zoomIn" }
  | { type: "zoomOut" }
  | { type: "setZoom"; zoom: number }
  | { type: "updateMapPosition"; center: LatLng; zoom: number }
  | { type: "disableAutoFrame" }
  | { type: "enableAutoFrame" };
