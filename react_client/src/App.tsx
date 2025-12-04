// ABOUTME: Main application component with two-pane layout.
// ABOUTME: Wires up blocs and providers for chat and map functionality.

import { MultiBlocProvider } from "@granite-crisp/react-bloc";
import { ChatPane, MapPane } from "./components";
import {
  ChatBloc,
  ChatBlocProvider,
  MapBloc,
  MapBlocProvider,
} from "./blocs";
import { apiClient } from "./services/api_client";

// Create blocs at module level (singleton pattern)
const mapBloc = new MapBloc();
const chatBloc = new ChatBloc(apiClient, mapBloc);

export default function App() {
  return (
    <MultiBlocProvider
      blocs={[
        { Provider: MapBlocProvider, bloc: mapBloc },
        { Provider: ChatBlocProvider, bloc: chatBloc },
      ]}
    >
      <div className="h-screen flex flex-col bg-base2">
        {/* Header */}
        <header className="h-12 bg-base3 border-b border-base1 flex items-center px-4">
          <h1 className="text-lg font-semibold text-base01">
            Lava Stew - Geospatial Agent
          </h1>
        </header>

        {/* Main content - two panes */}
        <main className="flex-1 flex min-h-0">
          {/* Chat pane */}
          <div className="flex-1 border-r border-base1">
            <ChatPane />
          </div>

          {/* Map pane */}
          <div className="flex-1">
            <MapPane />
          </div>
        </main>
      </div>
    </MultiBlocProvider>
  );
}
