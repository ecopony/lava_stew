// ABOUTME: Map visualization pane using MapLibre GL JS and deck.gl.
// ABOUTME: Displays geographic features with GPU-accelerated rendering and handles auto-framing.

import { WebMercatorViewport } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import DeckGL from "@deck.gl/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Map } from "react-map-gl/maplibre";
import { useMapBloc, useMapBlocState } from "../blocs";
import { getFeatureColorRGBA } from "../utils";

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

const INITIAL_VIEW_STATE: ViewState = {
  longitude: -122.4194,
  latitude: 37.7749,
  zoom: 5,
  pitch: 0,
  bearing: 0,
};

export function MapPane() {
  const state = useMapBlocState();
  const mapBloc = useMapBloc();
  const [viewState, setViewState] = useState<ViewState>(INITIAL_VIEW_STATE);
  const [hoverInfo, setHoverInfo] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastFitVersionRef = useRef(0);

  // Sort features so larger isochrones render underneath smaller ones
  const sortedFeatures = [...state.features].sort((a, b) => {
    const aIsIsochrone = a.properties.featureCategory === "isochrone";
    const bIsIsochrone = b.properties.featureCategory === "isochrone";

    // Non-isochrones render on top of isochrones
    if (aIsIsochrone && !bIsIsochrone) return -1;
    if (!aIsIsochrone && bIsIsochrone) return 1;

    // Among isochrones, larger time values render first (underneath)
    if (aIsIsochrone && bIsIsochrone) {
      const aTime = (a.properties.time_minutes as number) ?? 0;
      const bTime = (b.properties.time_minutes as number) ?? 0;
      return bTime - aTime;
    }

    return 0;
  });

  // Build deck.gl GeoJSON layer from features
  const layers = [
    new GeoJsonLayer({
      id: "features",
      data: {
        type: "FeatureCollection" as const,
        features: sortedFeatures.map((f) => ({
          type: "Feature" as const,
          geometry: f.geometry,
          properties: { ...f.properties, id: f.id },
        })),
      },
      pickable: true,
      stroked: true,
      filled: true,
      extruded: false,
      pointType: "circle",
      lineWidthScale: 1,
      lineWidthMinPixels: 2,
      getFillColor: (d) => getFeatureColorRGBA(d.properties ?? {}),
      getLineColor: [80, 80, 80, 180],
      getPointRadius: 50,
      getLineWidth: 2,
      pointRadiusMinPixels: 4,
      pointRadiusMaxPixels: 12,
      onHover: (info) => {
        if (info.object) {
          const label =
            (info.object.properties?.label as string) ?? "Unnamed feature";
          setHoverInfo({ label, x: info.x, y: info.y });
        } else {
          setHoverInfo(null);
        }
      },
    }),
  ];

  // Handle fit bounds when version changes
  useEffect(() => {
    if (state.fitBoundsVersion <= lastFitVersionRef.current) return;
    lastFitVersionRef.current = state.fitBoundsVersion;

    const paddedBounds = mapBloc.getPaddedBounds();
    if (!paddedBounds) return;

    // Get container dimensions
    const width = containerRef.current?.clientWidth ?? window.innerWidth * 0.5;
    const height = containerRef.current?.clientHeight ?? window.innerHeight;

    try {
      const viewport = new WebMercatorViewport({ width, height });

      const { longitude, latitude, zoom } = viewport.fitBounds(
        [
          [paddedBounds.southWest.lng, paddedBounds.southWest.lat],
          [paddedBounds.northEast.lng, paddedBounds.northEast.lat],
        ],
        { padding: 40 }
      );

      setViewState((vs) => ({
        ...vs,
        longitude,
        latitude,
        zoom: Math.min(zoom, 16),
      }));
    } catch (e) {
      console.error("Failed to fit bounds:", e);
    }
  }, [state.fitBoundsVersion, mapBloc]);

  const handleViewStateChange = useCallback(
    (params: { viewState: Record<string, unknown> }) => {
      const vs = params.viewState as unknown as ViewState;
      setViewState(vs);
    },
    []
  );

  const handleDragStart = useCallback(() => {
    if (state.autoFrameEnabled) {
      mapBloc.add({ type: "disableAutoFrame" });
    }
  }, [state.autoFrameEnabled, mapBloc]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <DeckGL
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        controller={{ dragPan: true, dragRotate: false, scrollZoom: true }}
        layers={layers}
        onDragStart={handleDragStart}
      >
        <Map mapStyle={MAP_STYLE} />
      </DeckGL>

      {/* Tooltip */}
      {hoverInfo && (
        <div
          className="absolute pointer-events-none bg-base02 text-base2 px-2 py-1 rounded shadow-lg text-sm max-w-xs"
          style={{ left: hoverInfo.x + 10, top: hoverInfo.y + 10 }}
        >
          {hoverInfo.label}
        </div>
      )}

      {/* Map controls */}
      <MapControls
        setViewState={setViewState}
        autoFrameEnabled={state.autoFrameEnabled}
        hasFeatures={state.features.length > 0}
      />
    </div>
  );
}

function MapControls({
  setViewState,
  autoFrameEnabled,
  hasFeatures,
}: {
  setViewState: (vs: ViewState | ((prev: ViewState) => ViewState)) => void;
  autoFrameEnabled: boolean;
  hasFeatures: boolean;
}) {
  const mapBloc = useMapBloc();

  const handleZoomIn = () => {
    setViewState((vs) => ({ ...vs, zoom: vs.zoom + 1 }));
    mapBloc.add({ type: "disableAutoFrame" });
  };

  const handleZoomOut = () => {
    setViewState((vs) => ({ ...vs, zoom: vs.zoom - 1 }));
    mapBloc.add({ type: "disableAutoFrame" });
  };

  const handleRecenter = () => {
    mapBloc.add({ type: "enableAutoFrame" });
  };

  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
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
      {!autoFrameEnabled && hasFeatures && (
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
