# Agent SDK Upgrade: 0.1.42 → 0.3.143

## Context

The agent worker depends on `@anthropic-ai/claude-agent-sdk@^0.1.0` and has
`0.1.42` (Nov 14, 2025) installed. The latest release is `0.3.143` (May 15,
2026) — roughly six months and ~100 releases of drift, spanning two minor
version bumps (0.1 → 0.2 → 0.3).

This plan captures the breaking changes that affect this codebase, the stale
references to fix, and the new capabilities worth adopting.

## Current state (resume here)

Branch: **`sdk-upgrade`** (not pushed/merged; 8 commits ahead of `main`).
Phases 1, 2, and 3 are all implemented. Most of Phase 3 is verified end-to-end
on the running stack; one item still needs a visual verification (Jaeger).

### Committed (top first)
- `cd04b94` hallucination placeholder (`docs/features/hallucination-prevention.md`)
- `6455836` Phase 3 progress + outputFormat verdict (plan doc)
- `1dfb83c` client sub-agent text rendering
- `a335b70` worker Phase 3 SDK adoptions + tool-use audit hook
- `0bc5e42` non-breaking npm audit fixes
- `acfd04a` Phase 2 findings (plan doc)
- `f5bfdc6` SDK 0.1.42 → 0.3.153 + Zod 4 migration
- `414e5ed` initial plan + CLAUDE.md TodoWrite → task-tools rename

### Uncommitted in the working tree
Suggested commit grouping (4 commits, isolated by concern):

| Group | Files |
| --- | --- |
| **sessionStore** (Phase 3 #6, verified working) | `agent_worker/migrations/002_session_persistence.sql`, `agent_worker/src/sessionStore.ts`, `agent_worker/src/models/conversation.ts`, `agent_worker/src/server.ts` |
| **OpenTelemetry + Jaeger** (Phase 3 #7) | `agent_worker/src/tracing.ts`, `agent_worker/src/server.ts`, `agent_worker/package.json`, `agent_worker/package-lock.json`, `docker-compose.yml` |
| **api_workers Dockerfile idempotency fix** (unrelated bug; see note below) | `api_workers/Dockerfile` |
| **Plan doc updates** (Phase 3 #6/#7 findings + this resume section) | `docs/features/sdk-upgrade-0.1-to-0.3.md` |

Note: `server.ts` is touched by both the sessionStore and OTEL commits. The
edits are in distinct regions (resume lookup / session capture for the first,
top-of-file tracing import + `chat.request` span wrap for the second), so they
can be staged separately with `git add -p` if you want strictly atomic commits;
otherwise group the file with whichever commit you sequence first.

### Verified end-to-end on the running stack
- Phase 1: pricing + Opus 4.7 default (`tsc` + 4 unit tests).
- Phase 2 upgrade: full smoke test passed (geocode, POI/transit/amenity,
  isochrone, analyze, `location-intelligence` subagent, SSE streaming, feature
  extraction). No MCP startup race observed (in-process server, as predicted).
- Phase 3 #1 `fallbackModel` / #2 `maxBudgetUsd` / #4 `hooks` / #5 `outputFormat`
  verdict: in via the smoke test above.
- Phase 3 #3 `forwardSubagentText`: confirmed rendering during a comparison query.
- Phase 3 #6 `sessionStore`: confirmed sessions survive a worker restart. Tucson
  placed → workers restarted → context-dependent follow-up correctly resumed.
  `project_key` in `session_entries` is the sanitized cwd `"-app"` (shared
  across all conversations); this is expected — the `conversations.session_id`
  column does the conversation-to-session mapping that `projectKey` can't.

### Verified — Phase 3 #7 OpenTelemetry (span nesting)
Confirmed in Jaeger: one trace, 18 spans, correctly nested —
`chat.request` (our manual span) → `claude_code.interaction` (SDK subprocess)
→ `claude_code.tool` / `claude_code.tool.execution` / `claude_code.llm_request`.

**Assumption correction.** The original note ("the SDK subprocess's spans nest
under it via the SDK's trace-context propagation") was wrong on two counts, and
nesting did not happen until both were fixed:

1. **Subprocess span tracing is off by default and beta-gated.** Claude Code
   only emits trace spans when its environment has `CLAUDE_CODE_ENABLE_TELEMETRY=1`,
   `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` (the span-tracing beta switch), and
   `OTEL_TRACES_EXPORTER=otlp`. `CLAUDE_CODE_ENABLE_TELEMETRY` alone enables
   metrics/events, not the Jaeger-visible spans. Added these to the
   `agent_worker` service in `docker-compose.yml` (plus
   `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf` since we only expose Jaeger's HTTP
   port 4318). The subprocess inherits the worker's env.
2. **Trace context is pull-based, not pushed.** The SDK reparents only when it
   reads `TRACEPARENT`/`TRACESTATE` from its own environment at interaction-span
   start. `server.ts` now `propagation.inject()`s the active `chat.request`
   context into a carrier and passes `TRACEPARENT`/`TRACESTATE` via
   `options.env`. Because `options.env` *replaces* the subprocess environment,
   `process.env` is spread in first to preserve credentials + telemetry config
   (same constraint as `executor.ts`). Per-request `options.env` is used rather
   than mutating `process.env` so concurrent requests don't race on the carrier.

Source: Claude Code monitoring docs, "Traces (beta)" section
(https://code.claude.com/docs/en/monitoring-usage). Files touched by this fix
beyond the original OTEL commit: `agent_worker/src/server.ts` (env injection),
`docker-compose.yml` (telemetry env vars) — fold into the OTEL+Jaeger commit.

**Known limitation — intermittent span fragmentation (SDK beta).** Span nesting
is not reliable: across repeated identical requests, roughly two of three runs
fragment, with every SDK span landing in its own trace (each `claude_code.tool`
becomes a root; `claude_code.llm_request` spans reference a parent span id under
a non-matching trace id). The remaining runs produce the clean single-trace tree
above. The failure happens *inside* the subprocess — even `tool → interaction`
nesting breaks, which our `TRACEPARENT` injection cannot influence — so this is a
`CLAUDE_CODE_ENHANCED_TELEMETRY_BETA` context-propagation race, not a config or
injection bug on our side. Documented as a beta rough edge; no mitigation
available from the embedding process.

**Tool telemetry tiers (and why tool args aren't on the spans).** Claude Code's
OTel has three tiers, not two: (1) `CLAUDE_CODE_ENABLE_TELEMETRY` → metrics +
events; (2) `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA` → the span tree (tool *names*,
durations, status) — our tier; (3) `ENABLE_BETA_TRACING_DETAILED=1` +
`BETA_TRACING_ENDPOINT` → tool *args/content* (`tool_input`, `tool.output`) on
spans. `OTEL_LOG_TOOL_DETAILS` / `OTEL_LOG_TOOL_CONTENT` are consent switches
that only take effect once tier 3 is active; at our tier they are no-ops for
Jaeger spans (verified: no content tags/events even with both set), so they were
reverted. Tool arguments are instead read from the worker's existing `PreToolUse`
audit hook + executor logs (`[HOOK]` / `[TOOL]` lines), which already carry full
input and output. Tier 3 was not pursued: `BETA_TRACING_ENDPOINT` is unprefixed
and may route detailed traces off-box (possible egress to Anthropic), and the log
channel already covers the need.

### Pending decisions / housekeeping
- Push the branch / open a PR when ready.
- The deferred `vitest@4` major bump (5 dev-only moderate audit warnings)
  remains open; orthogonal to this upgrade.

### Side fix in the working tree (not part of the SDK upgrade)
`api_workers/Dockerfile`: the `CMD` ran `uv venv .venv` unconditionally, which
failed with "already exists" any time the container was restarted (rather than
recreated). Guarded creation behind `[ -d .venv ]` so the venv setup is
idempotent across restarts. Discovered while debugging Phase 3; unrelated to
the SDK upgrade but worth keeping. Commit it on its own.

### How to come back up after a worker restart
1. `docker compose up --build` (foreground; rebuilds images whose source or
   Dockerfile changed and recreates their containers).
2. Watch for `[WORKER] OpenTelemetry tracing started` — proves the new code is
   live (it only exists post-Phase 3).
3. If you re-run migrations: `cd agent_worker && npm run migrate`. Migration
   `002` adds `conversations.session_id` and the `session_entries` table.

## Findings from the changelog audit

### Breaking changes that affect us

1. **MCP servers connect in the background by default (0.3.142).**
   `createGeoTools()` will report `status: "pending"` in the `init` event until
   it finishes connecting, and the session starts immediately rather than
   blocking. **Resolved (Phase 2):** for an in-process server there is no
   transport to connect, so no race. Accepted the new default; no mitigation
   applied. (Documented mitigations if ever needed: env
   `MCP_CONNECTION_NONBLOCKING=0`, or `alwaysLoad: true` on the server.)

2. **`options.env` replaces `process.env` for the subprocess (settled at
   0.2.113).** `executor.ts` already spreads `{ ...process.env }`, so the
   Python tool execution path is safe. No change required, but noted so we
   don't regress it.

### Breaking changes that do NOT affect us (verified)

- **`unstable_v2_*` session API removed (0.3.142).** We use `query()` +
  `options.resume`, which is the supported path. No action.
- **Native binary spawning via optional deps (0.2.113).** The Dockerfile uses
  `npm ci` (installs `optionalDependencies` by default), so the per-platform
  native binary will be installed. Verify after upgrade; no change expected.

### Stale references to fix (independent of the upgrade)

1. **Model names + pricing table (`agent_worker/src/server.ts`).** 🔴
   - `CLAUDE_MODEL` defaults to `claude-opus-4-5`; current is Opus 4.7.
   - `MODEL_PRICING` only contains Opus 4.5 and Sonnet 4.5 — missing Opus 4.7
     and Sonnet 4.6.
   - Consequence today: with a newer model set, `logUsageAndCost` hits the
     "Unknown model pricing" branch and silently skips cost logging.

2. **`TodoWrite` references in `CLAUDE.md` (lines 182, 340, 341).**
   `TodoWrite` was renamed to the Task tools (`TaskCreate` / `TaskUpdate` /
   `TaskGet` / `TaskList`) — deprecated 0.2.136, removed 0.3.142. These lines
   instruct Claude Code (the dev tool) rather than the lava_stew runtime, so
   they do not affect the application, but they name a tool that no longer
   exists. Update the wording to refer to the task tools.

## Plan

### Phase 1 — Model + pricing refresh (no SDK upgrade required)

Confirmed current rates (per MTok, USD) from the Anthropic pricing page —
identical to the 4.5 generation:

| Model key            | input | output | cacheWrite5m | cacheWrite1h | cacheRead |
| -------------------- | ----- | ------ | ------------ | ------------ | --------- |
| `claude-opus-4-7`    | 5.0   | 25.0   | 6.25         | 10.0         | 0.5       |
| `claude-sonnet-4-6`  | 3.0   | 15.0   | 3.75         | 6.0          | 0.3       |

- [x] Add `claude-opus-4-7` and `claude-sonnet-4-6` entries to `MODEL_PRICING`.
- [x] Update the `CLAUDE_MODEL` default from `claude-opus-4-5` to
      `claude-opus-4-7`.
- [x] Confirm cost logging produces non-zero output for the new default model.

Done (test-first): extracted `MODEL_PRICING` + cost math from `server.ts` into
`src/pricing.ts` (`calculateCost(model, usage)`), covered by `src/pricing.test.ts`
(4 tests). `server.ts` now imports `calculateCost`; `logUsageAndCost` keeps the
same log line. The 4.5-generation entries were retained alongside the new ones.

### Phase 2 — SDK upgrade (0.1.42 → 0.3.153)

Landed at `0.3.153` (latest patch; `^0.3.143` resolves to it).

- [x] Bump `@anthropic-ai/claude-agent-sdk` in `agent_worker/package.json` and
      reinstall.
- [x] **Zod 3 → 4 (unplanned, required).** The new SDK declares
      `zod@^4.0.0` as a peer dependency; install failed against `zod@^3.24.1`.
      Bumped `zod` to `^4.0.0` (resolves to 4.4.3, deduped). Only code break was
      `z.record(z.any())` → `z.record(z.string(), z.any())` in `tools.ts` (Zod 4
      requires an explicit key type). Zod is used only in `agent_worker/tools.ts`;
      `api_workers` and `react_client` do not use it.
- [x] Native binary optional dependency: `darwin-arm64` installed locally; the
      Linux variants are in the SDK's `optionalDependencies`, so `npm ci` in the
      Docker build will fetch `linux-x64`. No Dockerfile change needed.
- [x] Type-check (`tsc --noEmit`) clean; unit suite 40/40. NOTE: the unit tests
      feed mock event streams into `transformToAgentEvents` — they do not exercise
      the live SDK (`query()`, MCP server, native binary). Type-check is the real
      signal that our SDK API usage is still compatible.
- [x] MCP startup decision: **no mitigation needed.** `geo-tools` is an
      in-process `McpSdkServerConfigWithInstance` — the live `McpServer` is in the
      config, so there is no transport to connect and no connection race. The
      background-connection breaking change only affects stdio/http/sse servers.
- [x] Runtime smoke test passed (Ed): full flow including the
      `location-intelligence` subagent, SSE streaming, and feature extraction.
      The agent did reach for the geo tools — no tool-search deferral observed,
      so `alwaysLoad: true` was not needed.

### Phase 3 — Adopt new capabilities

- [x] `fallbackModel` — env-configurable (`CLAUDE_FALLBACK_MODEL`, default
      `claude-sonnet-4-6`) auto-fallback on primary model failure. server.ts.
- [x] `maxBudgetUsd` — env-configurable per-query cost cap (`MAX_BUDGET_USD`,
      unset = no cap). The `error_max_budget_usd` result subtype (and siblings
      `error_max_turns` / `error_during_execution` /
      `error_max_structured_output_retries`) is surfaced to the client as an
      `error` domain event. eventTransformer + 3 tests.
- [x] `forwardSubagentText` — enabled; eventTransformer routes sub-agent text
      (assistant messages with `parent_tool_use_id`) to a new
      `subagent_text_chunk` event instead of the main answer. Client: new
      `subagentText` message kind, bloc accumulates per Task tool id, rendered
      in MessageBubble. Worker tests added; visual rendering confirmed in the
      smoke test.
- [x] `hooks` — **augment, not replace** (decided with Ed). Added a `PreToolUse`
      audit hook (`hooks.ts`) that logs every tool call at the MCP boundary,
      including subagent `Task` dispatches that `executor.ts` never sees. Kept
      `executor.ts` logging for Python/RPC-execution detail (different layer).
- [x] `outputFormat` (json_schema) — **evaluated, not adopted.** Verdict below.
- [x] `sessionStore` (alpha) — persist session state so a session survives a
      worker restart. **Design correction:** `projectKey` is not settable per
      query (the SDK derives it from `cwd`), and `sessionStore` keys transcripts
      by `sessionId` with no knowledge of our `conversationId` — so it cannot
      recover "which session belongs to this conversation." The viable design
      uses both: (1) persist `conversationId → sessionId` in a new
      `conversations.session_id` column (migration 002) to drive resume lookup;
      (2) a Postgres `SessionStore` (`sessionStore.ts`) mirrors transcript
      content so resume works even if the worker's local transcript was wiped.
      `mirror_error` system messages are logged. Per Ed: no store unit test
      (real-DB only, and the no-mock rule). **Verified end-to-end:** Tucson →
      workers restarted → context-dependent follow-up resumed correctly.
      Migration `002` has been applied; `project_key` lands as `"-app"` (the
      sanitized container cwd, shared across conversations — expected).
- [x] OpenTelemetry trace propagation — added a Jaeger service to
      docker-compose (UI :16686, OTLP :4318) and a tracing bootstrap
      (`tracing.ts`, imported first) exporting via OTLP. Each request runs in a
      `chat.request` span (`server.ts`), so the SDK subprocess's spans nest under
      it via the SDK's trace-context propagation. Manual span only — node
      auto-instrumentation (pg/amqplib/http) was skipped to avoid the ESM loader
      setup; can be added later. Verify by opening Jaeger at localhost:16686
      after a request. OTEL deps added to agent_worker.

#### outputFormat verdict (not adopted)

`outputFormat: { type: 'json_schema', schema }` forces the agent's **final
result** into a schema-validated JSON object. It does not fit lava_stew:

- The main agent streams conversational markdown to the chat; forcing a JSON
  final result would replace that conversational answer and break the chat UX.
- It would **not** help feature extraction — the original plan premise. Features
  are extracted per-tool-result by `featureExtractor`, not from the final
  message, so structuring the final output is orthogonal to feature extraction.
- The `location-intelligence` subagent likewise returns natural-language
  analysis the orchestrator synthesizes — also conversational.

Where it *would* fit: a non-interactive/batch endpoint that returns typed
results (e.g., walkability metrics as JSON with no chat). lava_stew has no such
surface today. Left unadopted; revisit if a structured API endpoint is added.

## Open questions

- ~~Which MCP startup mitigation do we want?~~ Resolved: none needed for the
  in-process server (no transport to connect). See Phase 2.
- ~~Manual cost-tracking vs `maxBudgetUsd`?~~ Resolved: kept both — manual
  per-agent cost logging for observability, `maxBudgetUsd` as a hard safety cap.
- ~~`sessionStore` alpha vs roll our own?~~ Resolved: use the SDK's alpha
  `sessionStore` (exercising the real feature is the goal for the blog).

## References

- SDK changelog: https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md
- Local SDK docs: `context/agent_sdk_documentation/`
