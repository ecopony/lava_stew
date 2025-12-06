// ABOUTME: React provider and hooks for MapBloc.
// ABOUTME: Enables components to access map state and dispatch events.

import { createBlocProvider } from "@granite-crisp/react-bloc";
import type { MapBloc } from "./map_bloc";

export const {
  Provider: MapBlocProvider,
  useBloc: useMapBloc,
  useBlocState: useMapBlocState,
  useBlocSelector: useMapBlocSelector,
} = createBlocProvider<MapBloc>("MapBloc");
