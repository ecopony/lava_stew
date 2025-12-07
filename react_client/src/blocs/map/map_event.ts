// ABOUTME: Events for map state management.
// ABOUTME: Handle adding/removing geographic features and auto-framing.

import type { GeoFeature } from "../../models";

export type MapEvent =
  | { type: "addGeoFeature"; feature: GeoFeature }
  | { type: "removeGeoFeature"; featureId: string }
  | { type: "clearMap" }
  | { type: "disableAutoFrame" }
  | { type: "enableAutoFrame" };
