import { createStore, type StoreApi } from "zustand/vanilla";

/**
 * Base Bloc class implementing the BLoC (Business Logic Component) pattern.
 *
 * This provides a clean separation between business logic and UI:
 * - Events flow IN via add()
 * - State flows OUT via subscribe()
 * - All business logic lives in the bloc, not in React hooks
 *
 * @template E - The event type (typically a discriminated union)
 * @template S - The state type
 */
export abstract class Bloc<E, S> {
  private store: StoreApi<S>;
  private subscriptions: (() => void)[] = [];

  constructor(initialState: S) {
    this.store = createStore<S>(() => initialState);
  }

  /** Current state snapshot */
  get state(): S {
    return this.store.getState();
  }

  /**
   * Emit new state (partial, will be merged with existing state).
   * Use for object-shaped states where you want to update specific fields.
   */
  protected emit(state: Partial<S>): void {
    this.store.setState(state);
  }

  /**
   * Replace the entire state.
   * Use for union/discriminated types where the shape changes between states.
   */
  protected emitState(state: S): void {
    this.store.setState(state, true);
  }

  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe(listener: (state: S) => void): () => void {
    return this.store.subscribe(listener);
  }

  /**
   * Register a subscription for cleanup on dispose.
   * Use this when subscribing to other blocs.
   */
  protected addSubscription(unsubscribe: () => void): void {
    this.subscriptions.push(unsubscribe);
  }

  /**
   * Clean up all subscriptions.
   * Call this when the bloc is no longer needed.
   */
  dispose(): void {
    this.subscriptions.forEach((unsub) => unsub());
    this.subscriptions = [];
  }

  /** Handle an incoming event - implement in subclass */
  abstract add(event: E): void;
}
