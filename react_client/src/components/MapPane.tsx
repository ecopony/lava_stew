// ABOUTME: Map visualization pane using React-Leaflet.
// ABOUTME: Displays geographic features (points, lines, polygons) and handles auto-framing.

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Polygon,
  Polyline,
  useMap,
} from "react-leaflet";
import { useMapBloc, useMapBlocState } from "../blocs";
import type { GeoFeature, GeoJSONGeometry } from "../models";

// Color palette for different feature categories
const CATEGORY_COLORS: Record<string, string> = {
  isochrone: "#2563eb", // blue
  transit: "#dc2626", // red
  amenity: "#16a34a", // green
  poi: "#9333ea", // purple
  default: "#3b82f6", // blue
};

function getFeatureColor(feature: GeoFeature): string {
  const category = feature.properties.featureCategory as string | undefined;
  return CATEGORY_COLORS[category ?? "default"] ?? CATEGORY_COLORS.default;
}

// Isochrone opacity varies by time (larger = more transparent)
function getIsochroneOpacity(feature: GeoFeature): number {
  const timeMinutes = feature.properties.time_minutes as number | undefined;
  if (typeof timeMinutes !== "number") return 0.3;
  // 5 min = 0.4, 10 min = 0.3, 15 min = 0.2
  return Math.max(0.15, 0.5 - timeMinutes * 0.02);
}

export function MapPane() {
  const state = useMapBlocState();

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={[state.center.lat, state.center.lng]}
        zoom={state.zoom}
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Render features */}
        {state.features.map((feature) => (
          <FeatureRenderer key={feature.id} feature={feature} />
        ))}

        {/* Auto-framing handler */}
        <MapController />

        {/* Map controls - inside MapContainer so useMap() works */}
        <MapControls />
      </MapContainer>
    </div>
  );
}

/** Renders a GeoFeature based on its geometry type */
function FeatureRenderer({ feature }: { feature: GeoFeature }) {
  const geometry = feature.geometry;
  const label = feature.properties.label;
  const color = getFeatureColor(feature);

  switch (geometry.type) {
    case "Point":
      return (
        <CircleMarker
          center={[geometry.coordinates[1], geometry.coordinates[0]]}
          radius={8}
          pathOptions={{
            color: color,
            fillColor: color,
            fillOpacity: 0.8,
            weight: 2,
          }}
        >
          {label && <Popup>{label}</Popup>}
        </CircleMarker>
      );

    case "LineString":
      return (
        <Polyline
          positions={geometry.coordinates.map((coord) => [coord[1], coord[0]])}
          pathOptions={{ color, weight: 3 }}
        >
          {label && <Popup>{label}</Popup>}
        </Polyline>
      );

    case "Polygon":
      const isIsochrone = feature.properties.featureCategory === "isochrone";
      const fillOpacity = isIsochrone ? getIsochroneOpacity(feature) : 0.3;

      return (
        <Polygon
          positions={geometry.coordinates.map((ring) =>
            ring.map((coord) => [coord[1], coord[0]] as [number, number])
          )}
          pathOptions={{
            color,
            fillColor: color,
            fillOpacity,
            weight: 2,
          }}
        >
          {label && <Popup>{label}</Popup>}
        </Polygon>
      );

    default: {
      const _exhaustiveCheck: never = geometry;
      console.warn("Unknown geometry type:", _exhaustiveCheck);
      return null;
    }
  }
}

/** Handles map manipulation based on bloc state changes */
function MapController() {
  const map = useMap();
  const mapBloc = useMapBloc();
  const state = useMapBlocState();
  const lastFitVersionRef = useRef(0);

  // Handle fit bounds when version changes
  useEffect(() => {
    if (state.fitBoundsVersion > lastFitVersionRef.current) {
      lastFitVersionRef.current = state.fitBoundsVersion;

      const paddedBounds = mapBloc.getPaddedBounds();
      if (paddedBounds) {
        map.fitBounds([
          [paddedBounds.southWest.lat, paddedBounds.southWest.lng],
          [paddedBounds.northEast.lat, paddedBounds.northEast.lng],
        ]);
      }
    }
  }, [state.fitBoundsVersion, mapBloc, map]);

  // Disable auto-frame when user drags the map
  useEffect(() => {
    const handleDragStart = () => {
      mapBloc.add({ type: "disableAutoFrame" });
    };

    map.on("dragstart", handleDragStart);

    return () => {
      map.off("dragstart", handleDragStart);
    };
  }, [map, mapBloc]);

  return null;
}

/** Zoom controls and auto-frame toggle - must be inside MapContainer */
function MapControls() {
  const map = useMap();
  const mapBloc = useMapBloc();
  const state = useMapBlocState();

  const handleZoomIn = () => {
    map.zoomIn();
    mapBloc.add({ type: "disableAutoFrame" });
  };

  const handleZoomOut = () => {
    map.zoomOut();
    mapBloc.add({ type: "disableAutoFrame" });
  };

  const handleRecenter = () => {
    mapBloc.add({ type: "enableAutoFrame" });
  };

  return (
    <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
      <button
        onClick={handleZoomIn}
        className="w-8 h-8 bg-base3 border border-base1 rounded shadow hover:bg-base2 flex items-center justify-center text-base00"
      >
        +
      </button>
      <button
        onClick={handleZoomOut}
        className="w-8 h-8 bg-base3 border border-base1 rounded shadow hover:bg-base2 flex items-center justify-center text-base00"
      >
        −
      </button>

      {/* Show re-enable auto-frame button when disabled */}
      {!state.autoFrameEnabled && state.features.length > 0 && (
        <button
          onClick={handleRecenter}
          className="w-8 h-8 bg-blue text-base3 rounded shadow hover:bg-blue/90 flex items-center justify-center"
          title="Re-center on features"
        >
          ⊙
        </button>
      )}
    </div>
  );
}
