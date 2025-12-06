# React Client

Web client for Lava Stew geospatial agent, built with React and the BLoC pattern.

## Architecture

This client implements the **BLoC (Business Logic Component)** pattern, adapted from Flutter's `flutter_bloc`. The pattern cleanly separates business logic from UI:

- **Events** flow IN via `bloc.add(event)`
- **State** flows OUT via subscriptions
- **All business logic** lives in blocs, not React hooks

### Why BLoC?

React's hooks-based state management often scatters logic across components. BLoC centralizes it:

```
┌─────────────┐     events      ┌─────────┐     state      ┌─────────────┐
│  Component  │ ───────────────▶│  Bloc   │───────────────▶│  Component  │
└─────────────┘                 └─────────┘                └─────────────┘
                                     │
                                     ▼
                              Business Logic
```

## Directory Structure

```
src/
├── blocs/                    # BLoC implementations
│   ├── chat/                 # Chat state management
│   │   ├── chat_bloc.ts      # Business logic
│   │   ├── chat_event.ts     # Event types
│   │   ├── chat_state.ts     # State types
│   │   └── chat_provider.tsx # React context provider
│   └── map/                  # Map state management
│       └── ...
├── components/               # React UI components
│   ├── ChatPane.tsx
│   ├── MapPane.tsx
│   └── MessageBubble.tsx
├── models/                   # Data types
│   ├── agent_event.ts        # SSE event parsing
│   ├── geo_feature.ts        # GeoJSON features
│   └── message.ts            # Chat messages
├── services/
│   └── api_client.ts         # SSE streaming to API server
└── App.tsx                   # Root component with MultiBlocProvider
```

## The react-bloc Package

The BLoC infrastructure lives in `packages/react-bloc` as a reusable library:

- **`Bloc<E, S>`** - Abstract base class with Zustand-backed state
- **`createBlocProvider()`** - Factory creating typed Provider, useBloc, and useBlocState
- **`MultiBlocProvider`** - Composes multiple providers without nesting

Usage:

```tsx
// Define a bloc
class CounterBloc extends Bloc<CounterEvent, CounterState> {
  add(event: CounterEvent) {
    if (event.type === "increment") {
      this.emit({ count: this.state.count + 1 });
    }
  }
}

// Create provider and hooks
const { Provider, useBloc, useBlocState } = createBlocProvider<CounterBloc>("CounterBloc");

// In components
const bloc = useBloc();           // Get bloc to dispatch
const state = useBlocState();     // Subscribe to state
bloc.add({ type: "increment" });
```

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Type check
pnpm exec tsc --noEmit

# Lint
pnpm lint

# Build
pnpm build
```

## Tech Stack

- **React 19** with TypeScript
- **Vite** for bundling
- **Tailwind CSS v4** for styling
- **Leaflet** via react-leaflet for maps
- **Zustand** (vanilla) for bloc state management
- **Server-Sent Events** for streaming responses
