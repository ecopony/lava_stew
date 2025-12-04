import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
  type ComponentType,
} from "react";
import type { Bloc } from "./bloc";

/**
 * Entry for MultiBlocProvider - pairs a Provider component with its bloc instance.
 *
 * Uses `any` to allow typed providers (e.g., MapBlocProvider expects MapBloc)
 * to be composed together. Type safety is enforced at the call site by the
 * typed hooks (useMapBlocState, etc.), not at the composition root.
 */
export type BlocProviderEntry = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Provider: ComponentType<{ bloc: any; children: ReactNode }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bloc: any;
};

/**
 * Composes multiple bloc providers to avoid deeply nested JSX.
 *
 * Providers are applied in array order — first entry wraps outermost.
 * Uses reduceRight internally so the visual order matches the nesting order.
 *
 * @example
 * <MultiBlocProvider
 *   blocs={[
 *     { Provider: MapBlocProvider, bloc: mapBloc },
 *     { Provider: AirQualityBlocProvider, bloc: airQualityBloc },
 *   ]}
 * >
 *   <App />
 * </MultiBlocProvider>
 */
export function MultiBlocProvider({
  blocs,
  children,
}: {
  blocs: BlocProviderEntry[];
  children: ReactNode;
}) {
  return blocs.reduceRight<ReactNode>(
    (acc, { Provider, bloc }) => <Provider bloc={bloc}>{acc}</Provider>,
    children
  );
}

/**
 * Factory function to create a typed Bloc Provider system.
 *
 * This follows Flutter's BlocProvider pattern, adapted for React:
 * - Provider component injects a bloc instance into the React tree
 * - useBloc() retrieves the bloc for dispatching events
 * - useBlocState() subscribes to state changes
 *
 * The factory approach eliminates boilerplate — one call creates all three.
 *
 * @example
 * // Create provider for MapBloc
 * const { Provider: MapBlocProvider, useBloc: useMapBloc, useBlocState: useMapBlocState } =
 *   createBlocProvider<MapBloc>("MapBloc");
 *
 * // In app root
 * <MapBlocProvider bloc={new MapBloc()}>
 *   <App />
 * </MapBlocProvider>
 *
 * // In any child component
 * const mapBloc = useMapBloc();           // Get bloc to dispatch events
 * const state = useMapBlocState();        // Subscribe to state
 * mapBloc.add({ type: "setZoom", zoom: 10 });
 */
export function createBlocProvider<B extends Bloc<unknown, unknown>>(
  displayName: string
) {
  // Create context with undefined default - we'll throw if used outside provider
  const BlocContext = createContext<B | undefined>(undefined);
  BlocContext.displayName = `${displayName}Context`;

  /**
   * Provider component that injects a bloc into the React tree.
   *
   * Key design choice: The bloc is passed as a prop, not created inside.
   * This allows:
   * - Different instances per subtree
   * - Pre-configured blocs (e.g., with injected services)
   * - Testing with mock blocs
   */
  function Provider({ bloc, children }: { bloc: B; children: ReactNode }) {
    return <BlocContext.Provider value={bloc}>{children}</BlocContext.Provider>;
  }
  Provider.displayName = `${displayName}Provider`;

  /**
   * Hook to retrieve the bloc instance for dispatching events.
   *
   * Use this when you need to call bloc.add() but don't need to subscribe
   * to state changes (e.g., event handlers, callbacks).
   *
   * @throws Error if used outside of Provider
   */
  function useBloc(): B {
    const bloc = useContext(BlocContext);
    if (bloc === undefined) {
      throw new Error(
        `use${displayName} must be used within a ${displayName}Provider`
      );
    }
    return bloc;
  }

  /**
   * Hook to subscribe to the bloc's state.
   *
   * Uses useSyncExternalStore for tear-resistant subscriptions.
   * Component re-renders whenever the bloc emits new state.
   */
  function useBlocState(): B extends Bloc<unknown, infer S> ? S : never {
    const bloc = useBloc();
    return useSyncExternalStore(
      (callback) => bloc.subscribe(callback),
      () => bloc.state
    ) as B extends Bloc<unknown, infer S> ? S : never;
  }

  /**
   * Hook to subscribe to a selected slice of the bloc's state.
   *
   * Use this for performance when you only need part of the state.
   * The selector should return a stable reference for objects/arrays.
   *
   * @example
   * const zoom = useBlocSelector((state) => state.viewState.zoom);
   */
  function useBlocSelector<T>(
    selector: (state: B extends Bloc<unknown, infer S> ? S : never) => T
  ): T {
    const bloc = useBloc();
    return useSyncExternalStore(
      (callback) => bloc.subscribe(callback),
      () => selector(bloc.state as B extends Bloc<unknown, infer S> ? S : never)
    );
  }

  return {
    Provider,
    useBloc,
    useBlocState,
    useBlocSelector,
    // Export context for advanced use cases (testing, nested providers)
    Context: BlocContext,
  };
}
