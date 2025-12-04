// ABOUTME: BLoC for managing map visualization state.
// ABOUTME: Handles adding/removing geographic features and auto-framing.

import { Bloc } from "@granite-crisp/react-bloc";
import type { MapEvent } from "./map_event";
import {
  type MapState,
  type MapMarker,
  type LatLng,
  type LatLngBounds,
  createInitialMapState,
} from "./map_state";

// Auto-frame thresholds
const SINGLE_POINT_THRESHOLD = 0.0001; // ~11 meters at equator
const SINGLE_POINT_PADDING = 0.02; // ~2km view for single points
const NORMAL_BOUNDS_PADDING = 0.25; // 25% padding for feature collections
const VIEW_ADJUSTMENT_THRESHOLD = 0.3; // Adjust if new features extend >30% beyond view
const MIN_RANGE_FOR_CALCULATION = 0.000001; // Prevent division by zero

export class MapBloc extends Bloc<MapEvent, MapState> {
  constructor() {
    super(createInitialMapState());
  }

  add(event: MapEvent): void {
    switch (event.type) {
      case "addGeoFeature":
        this.handleAddGeoFeature(event.feature);
        break;
      case "removeGeoFeature":
        this.handleRemoveGeoFeature(event.featureId);
        break;
      case "clearMap":
        this.emitState(createInitialMapState());
        break;
      case "zoomIn":
        this.emit({
          zoom: this.state.zoom + 1,
          autoFrameEnabled: false,
        });
        break;
      case "zoomOut":
        this.emit({
          zoom: this.state.zoom - 1,
          autoFrameEnabled: false,
        });
        break;
      case "setZoom":
        this.emit({ zoom: event.zoom });
        break;
      case "updateMapPosition":
        this.emit({
          center: event.center,
          zoom: event.zoom,
        });
        break;
      case "disableAutoFrame":
        this.emit({ autoFrameEnabled: false });
        break;
      case "enableAutoFrame":
        this.handleEnableAutoFrame();
        break;
    }
  }

  private handleAddGeoFeature(feature: {
    id: string;
    lat: number;
    lon: number;
    label?: string;
  }): void {
    const marker: MapMarker = {
      id: feature.id,
      position: { lat: feature.lat, lng: feature.lon },
      label: feature.label,
    };

    const updatedMarkers = [...this.state.markers, marker];
    const allPoints = updatedMarkers.map((m) => m.position);
    const newPoints = [marker.position];

    this.handleAutoFrame(updatedMarkers, allPoints, newPoints);
  }

  private handleRemoveGeoFeature(featureId: string): void {
    const updatedMarkers = this.state.markers.filter((m) => m.id !== featureId);
    this.emit({ markers: updatedMarkers });
  }

  private handleAutoFrame(
    updatedMarkers: MapMarker[],
    allPoints: LatLng[],
    newPoints: LatLng[]
  ): void {
    if (!this.state.autoFrameEnabled || newPoints.length === 0) {
      this.emit({ markers: updatedMarkers });
      return;
    }

    const allBounds = this.calculateBoundsFromPoints(allPoints);
    const newBounds = this.calculateBoundsFromPoints(newPoints);

    if (!allBounds || !newBounds) {
      this.emit({ markers: updatedMarkers });
      return;
    }

    // Adjust view if: (1) first features in conversation, or (2) new features significantly outside current view
    const shouldFit =
      this.state.conversationBounds === null ||
      this.shouldAdjustView(newBounds);

    if (shouldFit) {
      const paddedBounds = this.padBounds(allBounds);
      const center = {
        lat: (paddedBounds.southWest.lat + paddedBounds.northEast.lat) / 2,
        lng: (paddedBounds.southWest.lng + paddedBounds.northEast.lng) / 2,
      };

      this.emit({
        markers: updatedMarkers,
        conversationBounds: allBounds,
        center,
        fitBoundsVersion: this.state.fitBoundsVersion + 1,
      });
    } else {
      this.emit({
        markers: updatedMarkers,
        conversationBounds: allBounds,
      });
    }
  }

  private handleEnableAutoFrame(): void {
    const allPoints = this.state.markers.map((m) => m.position);
    const conversationBounds = this.calculateBoundsFromPoints(allPoints);

    if (conversationBounds) {
      const paddedBounds = this.padBounds(conversationBounds);
      const center = {
        lat: (paddedBounds.southWest.lat + paddedBounds.northEast.lat) / 2,
        lng: (paddedBounds.southWest.lng + paddedBounds.northEast.lng) / 2,
      };

      this.emit({
        autoFrameEnabled: true,
        conversationBounds,
        center,
        fitBoundsVersion: this.state.fitBoundsVersion + 1,
      });
    } else {
      this.emit({ autoFrameEnabled: true });
    }
  }

  private calculateBoundsFromPoints(points: LatLng[]): LatLngBounds | null {
    if (points.length === 0) return null;

    let minLat = points[0].lat;
    let maxLat = points[0].lat;
    let minLng = points[0].lng;
    let maxLng = points[0].lng;

    for (const point of points) {
      minLat = Math.min(minLat, point.lat);
      maxLat = Math.max(maxLat, point.lat);
      minLng = Math.min(minLng, point.lng);
      maxLng = Math.max(maxLng, point.lng);
    }

    return {
      southWest: { lat: minLat, lng: minLng },
      northEast: { lat: maxLat, lng: maxLng },
    };
  }

  private shouldAdjustView(newFeatureBounds: LatLngBounds): boolean {
    if (!this.state.conversationBounds) return true;

    const currentBounds = this.state.conversationBounds;
    const latRange = currentBounds.northEast.lat - currentBounds.southWest.lat;
    const lngRange = currentBounds.northEast.lng - currentBounds.southWest.lng;

    // If current view is essentially a point, always adjust
    if (
      Math.abs(latRange) < MIN_RANGE_FOR_CALCULATION ||
      Math.abs(lngRange) < MIN_RANGE_FOR_CALCULATION
    ) {
      return true;
    }

    const latOutside =
      (newFeatureBounds.southWest.lat < currentBounds.southWest.lat
        ? currentBounds.southWest.lat - newFeatureBounds.southWest.lat
        : 0) +
      (newFeatureBounds.northEast.lat > currentBounds.northEast.lat
        ? newFeatureBounds.northEast.lat - currentBounds.northEast.lat
        : 0);

    const lngOutside =
      (newFeatureBounds.southWest.lng < currentBounds.southWest.lng
        ? currentBounds.southWest.lng - newFeatureBounds.southWest.lng
        : 0) +
      (newFeatureBounds.northEast.lng > currentBounds.northEast.lng
        ? newFeatureBounds.northEast.lng - currentBounds.northEast.lng
        : 0);

    return (
      latOutside / latRange > VIEW_ADJUSTMENT_THRESHOLD ||
      lngOutside / lngRange > VIEW_ADJUSTMENT_THRESHOLD
    );
  }

  private padBounds(bounds: LatLngBounds): LatLngBounds {
    const latRange = bounds.northEast.lat - bounds.southWest.lat;
    const lngRange = bounds.northEast.lng - bounds.southWest.lng;

    if (
      latRange < SINGLE_POINT_THRESHOLD &&
      lngRange < SINGLE_POINT_THRESHOLD
    ) {
      // Single point or very tight cluster
      const centerLat = (bounds.northEast.lat + bounds.southWest.lat) / 2;
      const centerLng = (bounds.northEast.lng + bounds.southWest.lng) / 2;

      return {
        southWest: {
          lat: centerLat - SINGLE_POINT_PADDING,
          lng: centerLng - SINGLE_POINT_PADDING,
        },
        northEast: {
          lat: centerLat + SINGLE_POINT_PADDING,
          lng: centerLng + SINGLE_POINT_PADDING,
        },
      };
    }

    // Normal case - add padding
    const latPadding = latRange * NORMAL_BOUNDS_PADDING;
    const lngPadding = lngRange * NORMAL_BOUNDS_PADDING;

    return {
      southWest: {
        lat: bounds.southWest.lat - latPadding,
        lng: bounds.southWest.lng - lngPadding,
      },
      northEast: {
        lat: bounds.northEast.lat + latPadding,
        lng: bounds.northEast.lng + lngPadding,
      },
    };
  }

  /** Get padded bounds for the map component to fit */
  getPaddedBounds(): LatLngBounds | null {
    if (!this.state.conversationBounds) return null;
    return this.padBounds(this.state.conversationBounds);
  }
}
