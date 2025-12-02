# Lava Stew Architecture

High-level technical overview of the geospatial agent system.

## System Components

### Infrastructure Services

1. **PostGIS** (port 5433): PostgreSQL with PostGIS extensions for spatial data
2. **RabbitMQ** (ports 5672, 15672): Message broker for request/response patterns
3. **API Server** (port 3001): HTTP endpoint with SSE streaming
4. **Agent Worker**: Main Agent SDK integration maintaining stateful sessions
5. **API Workers** (3 specialized workers):
   - **Google Maps Worker**: Geocoding with 1-second rate limiting
   - **Overpass Worker**: OpenStreetMap POI/transit/amenity data with 2-second rate limiting
   - **OpenRoute Worker**: Isochrone generation

## Request Flow: Client → Server → Agent → Tools

### 1. Client POST to /chat

**File**: `api_server/src/server.ts`

```
POST /chat
Body: { conversationId: string, message: string }
```

**What happens**:
1. API server creates **exclusive reply queue** (auto-deletes on disconnect)
2. Publishes request to `chat.requests` queue with `replyTo` header
3. Sets up SSE stream headers and consumer for reply queue
4. Waits for messages on reply queue, streams to client as SSE

**RabbitMQ Pattern**: Classic RPC with exclusive reply queues
- **Request Queue**: `chat.requests` (durable)
- **Reply Queue**: Anonymous exclusive queue (auto-delete)
- **Correlation**: Via `replyTo` property

### 2. Agent Worker Processes Request

**File**: `agent_worker/src/server.ts`

The agent worker:
1. Consumes from `chat.requests` with `prefetch=1`
2. Checks for existing session ID in memory map: `sessionIds.get(conversationId)`
3. Creates/resumes Agent SDK session with stateful context
4. Executes query with:
   - Model: `claude-opus-4-5` (configurable)
   - MCP Tools: Geo tools wrapped via `mcpServer.ts`
   - Agents: Sub-agent definitions from `agent-definitions.ts`
   - System prompt with map context awareness

**Session Management**:
```typescript
// In-memory session storage
const sessionIds = new Map<string, string>();

// Resume existing or create new
const response = query({
  resume: existingSessionId,  // SDK maintains full context
  // ...
});
```

**Key insight**: The SDK's `session_id` is stored in memory, enabling true stateful conversations with automatic context management.

### 3. Event Transformation & Streaming

**File**: `agent_worker/src/eventTransformer.ts`

The `transformToAgentEvents()` function converts raw SDK events into domain events:

**SDK Events → Domain Events**:
- `assistant` → `assistant_thinking`, `assistant_message_chunk`, `assistant_message_complete`
- `tool_use` (with `Task` + `subagent_type`) → `subagent_started`, `subagent_completed`
- `tool_use` (regular) → `tool_start`, `tool_result`, `geo_feature`
- `tool_result` → Extracts features via `featureExtractor.ts`

**Sub-agent Detection**:
```typescript
const isSubagent = toolBlock.name === "Task" &&
                   toolBlock.input?.subagent_type;

if (isSubagent) {
  activeSubagents.set(toolBlock.id, agentName);
  yield { type: "subagent_started", toolId, agentName };
}
```

Events are published to the reply queue as they're generated, creating true streaming.

## Sub-Agent System

**File**: `agent_worker/src/agent-definitions.ts`

One specialized agent for location intelligence workflows:

### location-intelligence
- **Model**: Sonnet
- **Tools**: geocode, fetch_pois_osm, fetch_transit_osm, fetch_amenities_osm, generate_isochrone, analyze_location_data
- **Role**: Comprehensive location intelligence - gather geospatial data, analyze it, and provide actionable insights
- **Prompt Focus**:
  - Step 1: Geocode the location and determine appropriate search radius
  - Step 2: Gather focused data (POIs, transit, amenities, isochrones)
  - Step 3: Analyze collected data with analyze_location_data tool
  - Step 4: Interpret metrics and provide specific insights about walkability, accessibility, patterns, and gaps
- **Use When**: User asks about a specific location's characteristics or surroundings
- **Parallel Execution**: Can be invoked multiple times in parallel for comparing multiple locations

**Agent Invocation**: The main agent uses `Task` tool with `subagent_type: "location-intelligence"` input. The event transformer detects this pattern and emits sub-agent events (`subagent_started`, `subagent_completed`).

## Data Persistence

### Database Schema

**File**: `agent_worker/migrations/001_initial_schema.sql`

```sql
conversations
  - id: UUID (internal)
  - session_key: TEXT (from API, maps to SDK session)
  - created_at, updated_at

messages
  - id: UUID
  - conversation_id: UUID → conversations
  - role: 'user' | 'assistant'
  - content: TEXT
  - sequence_number: INTEGER (atomic via SELECT FOR UPDATE)

geo_features
  - id: UUID
  - message_id: UUID → messages
  - feature_type: 'marker' | 'line' | 'polygon'
  - geometry: GEOMETRY(Geometry, 4326) -- PostGIS type
  - properties: JSONB
  - CONSTRAINT: Validates geometry type matches feature_type
```

**Spatial Index**: `GIST(geometry)` for efficient spatial queries

### Persistence Flow

**File**: `agent_worker/src/server.ts`

**Synchronous** (blocks streaming):
1. `ensureConversation(conversationId)` → Gets/creates conversation UUID
2. `createMessage(conversation.id, 'user', message)` → Atomically assigns sequence number

**Asynchronous** (after streaming completes):
1. Collect assistant response during streaming
2. Create assistant message after `done` event
3. `saveFeaturesAsync()` → Persists extracted GeoFeatures to database

**Critical**: Features extracted during streaming are saved with UUIDs already generated, ensuring map updates match database records.

## RabbitMQ Queue Architecture

### Queue: `chat.requests`
- **Type**: Durable
- **Publisher**: API Server
- **Consumer**: Agent Worker (prefetch=1)
- **Pattern**: RPC with exclusive reply queues

### Queue: `google_maps.requests`
- **Type**: Durable
- **Consumer**: Google Maps Worker (prefetch=1)
- **Rate Limiting**: 1-second minimum delay between calls
- **Scripts**: `geocode.py`

### Queue: `overpass.requests`
- **Type**: Durable
- **Consumer**: Overpass Worker (prefetch=1)
- **Rate Limiting**: 2-second minimum delay between calls
- **Scripts**: `fetch_pois_osm.py`, `fetch_transit_osm.py`, `fetch_amenities_osm.py`

### Queue: `openroute.requests`
- **Type**: Durable
- **Consumer**: OpenRoute Worker (prefetch=1)
- **Scripts**: `generate_isochrone.py`

### Reply Queues
- **Type**: Exclusive, auto-delete
- **Lifetime**: Tied to API server connection
- **Correlation**: Via `correlationId` and `replyTo` properties

## Tool Execution Patterns

**File**: `agent_worker/src/executor.ts`

### Synchronous (in agent_worker via execFileSync):
- **calculate_distance**: Direct Python execution, no external API
- **remove_feature**: Database operation
- **analyze_location_data**: Python spatial analytics

### Asynchronous via RPC (delegated to API workers):
- **geocode** → google_maps.requests
- **fetch_pois_osm** → overpass.requests
- **fetch_transit_osm** → overpass.requests
- **fetch_amenities_osm** → overpass.requests
- **generate_isochrone** → openroute.requests

### Why Separate Workers?

**Rate Limiting Strategy**:
1. **API Rate Limits**: Google Maps, Overpass, OpenRoute have strict rate limits
2. **Serialization**: prefetch=1 + per-worker state ensures sequential execution
3. **Isolation**: Rate limit failures don't affect agent worker or other APIs

**Implementation Pattern**:
```typescript
private async enforceRateLimit() {
  const timeSinceLastCall = Date.now() - this.lastCallTime;
  if (timeSinceLastCall < this.MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}
```

## SSE Streaming Back to Clients

**File**: `api_server/src/server.ts`

### Stream Setup:
```typescript
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");
res.flushHeaders();
res.write(": connected\n\n");  // Initial keepalive
```

### Event Flow:
1. Consumer set up on reply queue
2. For each message: Parse JSON, write as SSE `data:` event
3. On `{type: "done"}`: End stream and cancel consumer
4. Client disconnect: Cancel consumer, queue auto-deletes

**SSE Format**:
```
data: {"type":"assistant_thinking"}\n\n
data: {"type":"tool_start","toolName":"geocode","input":{...}}\n\n
data: {"type":"geo_feature","lat":47.6,"lon":-122.3,"label":"Seattle"}\n\n
data: {"type":"done"}\n\n
```

## MCP Server Integration

**File**: `agent_worker/src/mcpServer.ts`

The `createGeoTools(conversationId)` function wraps Python tools in SDK's MCP format:

**Tool Schema** (from `agent_worker/src/tools.ts`):
- Zod schemas for input validation
- GeoJSON schemas for structured spatial data
- Tool descriptions optimized for Claude

**Tool Handler Pattern**:
```typescript
tool(
  "geocode",
  "Convert location name to coordinates",
  geocodeSchema,
  async (args) => {
    const result = await executeGeocode(conversationId, args);
    if (result.success) {
      return { content: [{ type: "text", text: JSON.stringify(result.data) }] };
    } else {
      return { content: [{ type: "text", text: formatErrorMessage(result) }], isError: true };
    }
  }
)
```

## Feature Extraction

**File**: `agent_worker/src/featureExtractor.ts`

The `GeoFeatureExtractor` class:
- Parses tool results to extract geographic coordinates
- Generates UUIDs for features during streaming
- Handles both `geocode` (single point) and `calculate_distance` (two points)
- Returns `GeoFeature[]` with `{id, type, lat, lon, label}`

**Feature Flow**:
1. Emitted immediately as `geo_feature` events (for real-time map updates)
2. Collected for async database persistence after streaming completes

## Token Usage & Cost Tracking

**File**: `agent_worker/src/server.ts`

### Model Pricing:
Tracks per-million-token costs for:
- Input tokens, output tokens
- Cache write (5-minute and 1-hour TTL)
- Cache read tokens

### Usage Logging:
```typescript
function logUsageAndCost(conversationId: string, usage: UsageMetrics) {
  // Calculates cost from token counts
  // Logs: "${inputTokens} input + ${outputTokens} output + ... = $${totalCost}"
}
```

Captured from SDK's `result` message and logged after completion.

## Key Architectural Decisions

1. **Stateful Sessions in Memory**: SDK session IDs stored in `Map<conversationId, session_id>` for context preservation
2. **Two-tier RabbitMQ**: Main request queue + specialized API worker queues for rate limiting
3. **Async Persistence**: Stream-first, persist-later for low latency
4. **Event Transformation Layer**: Abstracts SDK details from clients
5. **Sub-agent Detection**: Pattern matching on `Task` tool with `subagent_type` input
6. **Spatial Database**: PostGIS for future geospatial queries
7. **Exclusive Reply Queues**: Auto-cleanup, no orphaned responses
8. **prefetch=1 Everywhere**: Fair dispatch, guaranteed serialization for rate-limited APIs

## File Reference Map

### Core Architecture
- **API Server**: `api_server/src/server.ts`
- **Agent Worker**: `agent_worker/src/server.ts`
- **Event Transformer**: `agent_worker/src/eventTransformer.ts`

### Sub-Agent System
- **Agent Definitions**: `agent_worker/src/agent-definitions.ts`

### Tool Execution
- **Executor**: `agent_worker/src/executor.ts`
- **MCP Server**: `agent_worker/src/mcpServer.ts`
- **Tool Schemas**: `agent_worker/src/tools.ts`

### API Workers
- **Base Worker**: `api_workers/src/base-api-worker.ts`
- **Entry Point**: `api_workers/src/worker.ts` (configured via env vars: `QUEUE_NAME`, `MIN_DELAY_MS`, `LOG_PREFIX`)

### Data Models
- **Conversation**: `agent_worker/src/models/conversation.ts`
- **GeoFeature**: `agent_worker/src/models/geoFeature.ts`
- **Types**: `agent_worker/src/types.ts`
- **Schema**: `agent_worker/migrations/001_initial_schema.sql`

### Infrastructure
- **RabbitMQ RPC**: `agent_worker/src/rabbitmq.ts`
- **Database**: `agent_worker/src/database.ts`
- **Migrations**: `agent_worker/src/utils/migrate.ts`
- **Docker Compose**: `docker-compose.yml`
