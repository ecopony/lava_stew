// ABOUTME: Map visualization pane using React-Leaflet.
// ABOUTME: Displays geographic features and handles auto-framing.

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useMapBloc, useMapBlocState } from "../blocs";

// Fix default marker icon issue with Vite/bundlers
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

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

        {/* Markers */}
        {state.markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.position.lat, marker.position.lng]}
            icon={markerIcon}
          >
            {marker.label && <Popup>{marker.label}</Popup>}
          </Marker>
        ))}

        {/* Auto-framing handler */}
        <MapController />

        {/* Map controls - inside MapContainer so useMap() works */}
        <MapControls />
      </MapContainer>
    </div>
  );
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

  // Track user interactions to disable auto-frame
  useEffect(() => {
    const handleMoveEnd = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();

      mapBloc.add({
        type: "updateMapPosition",
        center: { lat: center.lat, lng: center.lng },
        zoom,
      });
    };

    const handleDragStart = () => {
      mapBloc.add({ type: "disableAutoFrame" });
    };

    map.on("moveend", handleMoveEnd);
    map.on("dragstart", handleDragStart);

    return () => {
      map.off("moveend", handleMoveEnd);
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
      {!state.autoFrameEnabled && state.markers.length > 0 && (
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
