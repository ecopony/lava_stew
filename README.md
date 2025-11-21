# Lava Stew

Geospatial analyst agent built with the Anthropic Agent SDK.

## Overview

Lava Stew shows how to deploy the Claude Agent SDK in a stateful, production-ready architecture.

- **Stateful Worker Pattern**: Long-running containerized processes maintain Agent SDK session state in memory
- **Python Tools via TypeScript**: TypeScript infrastructure invoking Python geospatial scripts
- **SSE Streaming**: Real-time response streaming from agent to client
- **Custom MCP Tools**: Geocoding and distance calculation tools wrapped for the Agent SDK

## Architecture

```
Client (curl/Flutter)
    ↓ HTTP POST
API Server (Express on port 3001)
    ↓ Publish to chat.requests queue
RabbitMQ (port 5672, management UI on 15672)
    ↓ Consume from queue
Worker Process (Anthropic SDK)
    → Python tools (geocoding, distance via uv)
    ↓ Publish events to reply queue
RabbitMQ
    ↓ Consume from reply queue
API Server converts to SSE
    ↓ SSE stream back to client
```

The RabbitMQ RPC pattern uses exclusive reply queues per request that auto-delete on disconnect.

## Prerequisites

- Node.js 20+
- Python 3.11+ with uv (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Anthropic API key (from [Anthropic Console](https://console.anthropic.com/))
- Google Maps API key (from [Google Cloud Console](https://console.cloud.google.com/))
- Docker and Docker Compose (optional, for containerized deployment)

## Setup

### 1. Environment Configuration

Copy the example environment file and add your API keys:

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY and GOOGLE_MAPS_API_KEY
```

Your `.env` file should contain:

```bash
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_MAPS_API_KEY=...
API_SERVER_PORT=3001
RABBITMQ_URL=amqp://lava:stew@localhost:5672
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Python dependencies are managed by uv and installed on-demand
```

## Running Locally

### Start Services with Docker Compose

```bash
# Start all services (RabbitMQ, API server, Worker)
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

You should see:

```
[API] Connected to RabbitMQ at amqp://lava:stew@rabbitmq:5672
[API] Server listening on port 3001
[WORKER] Connected to RabbitMQ at amqp://lava:stew@rabbitmq:5672
[WORKER] Listening on queue 'chat.requests'
[WORKER] Worker ready to process messages
```

### RabbitMQ Management UI

Access the RabbitMQ management interface at http://localhost:15672 (login: lava/stew) to observe message flow.

### Test the Agent

```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "test-123", "message": "What is the distance between Seattle and Portland?"}'
```

**Expected output**: SSE stream showing the agent:

1. Geocoding Seattle → `{"lat": 47.6061389, "lng": -122.3328481, ...}`
2. Geocoding Portland → `{"lat": 45.515232, "lng": -122.6783853, ...}`
3. Calculating distance → `{"distance_km": 233.93, "distance_miles": 145.36}`
4. Responding with natural language answer

### Check Worker Logs

The worker logs show tool invocations with timing:

```
[TOOL] test-123 | geocode | {"location":"Seattle, WA"} | {...} | 607ms
[TOOL] test-123 | geocode | {"location":"Portland, Oregon"} | {...} | 486ms
[TOOL] test-123 | calculate_distance | {...} | {...} | 146ms
```

## Running for Development

For local development without Docker, start RabbitMQ first:

```bash
# Start RabbitMQ only
docker compose up rabbitmq -d

# In separate terminals:
cd api_server && npm run dev
cd worker && npm run dev
```

## Project Structure

```
lava_stew/
├── api_server/
│   └── src/
│       └── server.ts           # API server with SSE streaming
├── worker/
│   ├── src/
│   │   ├── server.ts           # Worker process with SDK integration
│   │   ├── mcpServer.ts        # MCP server wrapper for tools
│   │   ├── tools.ts            # Tool schema definitions
│   │   └── executor.ts         # Python tool execution
│   └── scripts/
│       ├── geocode.py          # Google Maps geocoding
│       └── calculate_distance.py  # Geodesic distance calculation
├── flutter_client/             # Flutter client (Phase 2)
├── docker-compose.yml          # Container orchestration with RabbitMQ
└── .env                        # Environment variables
```

## Testing

### Manual Test Cases

1. **Basic distance query**:

```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "test-1", "message": "What is the distance between Seattle and Portland?"}'
```

2. **Single geocoding**:

```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "test-2", "message": "Where is San Francisco?"}'
```

3. **Conversation continuity** (same conversationId):

```bash
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "test-3", "message": "Where is Seattle?"}'

curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "test-3", "message": "How far is it from there to Portland?"}'
```

## Tools

### geocode

- **Input**: `{ location: string }`
- **Output**: `{ lat: number, lng: number, formatted_address: string }`
- **Example**: `"Seattle, WA"` → `{"lat": 47.6061, "lng": -122.3328, ...}`

### calculate_distance

- **Input**: `{ point1: {lat, lng}, point2: {lat, lng} }`
- **Output**: `{ distance_km: number, distance_miles: number }`
- **Example**: Seattle to Portland → `{"distance_km": 233.93, "distance_miles": 145.36}`

## Phase 1 Limitations

This is a minimal viable implementation demonstrating the architecture. Known limitations:

- **No session persistence**: Worker restart loses all conversation history
- **Single worker**: No load balancing or high availability
- **No database**: Tool results logged to stdout only, not persisted
- **No authentication**: Open endpoint
- **Memory unbounded**: Session map grows without eviction
- **No rate limiting**: Can overwhelm Google Maps API

## Development

### Python Tools

Test Python tools directly:

```bash
# Test geocoding
cd scripts
uv run python geocode.py "Seattle, WA"

# Test distance calculation (Seattle to Portland coordinates)
uv run python calculate_distance.py "47.6061,-122.3328" "45.5152,-122.6784"
```

### Health Checks

```bash
# Check API server
curl http://localhost:3001/health
```

## License

ISC
