# AI Orchestration Architecture Roadmap

## Current Assessment

The current backend entry point is `nutrition-proxy/src/server.js`, with AI coaching in
`src/coach`, deterministic scoring in `src/deterministic`, home summaries in `src/home`,
and Redis helpers in `src/redisCache.js`.

Reusable foundations already exist:

- `src/deterministic/*` contains scoring, trend, state, memory, and decision functions.
- `src/coach/context.js` centralizes Firestore context loading and normalization.
- `src/redisCache.js` provides a Redis cache wrapper for existing read-through caching.
- `src/coach/conversationStore.js` isolates chat persistence.

Main bottlenecks:

- `src/coach/routes.js` does request validation, Firestore loading, prompt assembly, AI calls,
  LLM output parsing, persistence, and response shaping in one synchronous request path.
- `src/coach/context.js` performs many Firestore reads per AI request and can include broad
  historical context.
- Profile history was loaded but not previously returned as part of the coach context, while
  prompt instructions and deterministic memory expected it.
- `src/coach/prompt.js` stringifies large raw context JSON, increasing token cost and latency.
- Deterministic scoring exists but is not yet used as the primary AI prompt substrate.
- LLM JSON outputs were parsed with manual normalization instead of reusable boundary contracts.
- No queue layer exists yet, so recomputation happens on demand rather than from events.
- Observability is limited to console logging and HTTP response status.

Large-file targets:

- `src/server.js` is over 1,000 lines and mixes nutrition search, plate analysis, cache, and routes.
- `src/coach/context.js` is the main Firestore read and normalization hotspot.
- `src/coach/routes.js` is the main orchestration hotspot.
- Frontend `app/AICoachScreen.tsx` is large and will need careful streaming integration later.

## Dependency Graph

```text
React Native app
  -> services/aiCoach.ts
  -> nutrition-proxy Express routes
    -> Firebase auth middleware
    -> Firestore context/conversation stores
    -> deterministic scoring/context builder
    -> prompt builder
    -> Gemini/Vertex client
    -> Redis cache
```

Target graph:

```text
App event
  -> event schema validation
  -> BullMQ queue
  -> deterministic intelligence engine
  -> Redis + Firestore signal state
  -> intent-aware retrieval
  -> compressed prompt packet
  -> provider abstraction
  -> SSE stream
  -> validated final/persisted output
```

## Quick Wins

1. Validate request, response, Firestore-derived, event, and AI-output boundaries with Zod.
2. Reuse the existing deterministic modules as the signal engine instead of creating a parallel system.
3. Route chat prompts through compact deterministic signal packets before adding vector or semantic retrieval.
4. Add SSE as a backward-compatible `/chat/stream` endpoint before replacing the existing `/chat`.
5. Cache deterministic context signatures and compact signal packets, not raw prompt strings.

## Migration Strategy

Phase 1 keeps behavior stable while adding contracts and validation. Phase 2 moves expensive context and
signal computation to events and queues. Phase 3 changes the AI request path to retrieve warmed deterministic
state, compress it, then stream provider output.

Each phase should preserve existing endpoints until the frontend has adopted the replacement endpoint.

## Phased Implementation Roadmap

1. Zod schemas and validators: complete initial contracts under `src/schemas`.
2. Redis + BullMQ: add queue events for workout, meal, hydration, sleep, profile, and AI chat requests.
3. Streaming: add SSE response path and frontend incremental rendering.
4. Token budgeting: add token counting, prioritization, and prompt compression.
5. Deterministic signal packets: promote `src/deterministic` outputs to cached user signal state.
6. Selective retrieval: replace load-everything chat context with intent-aware retrieval.
7. State machines: add explicit coaching states with deterministic transitions.
8. Observability: add structured logs, latency metrics, cache metrics, queue metrics, and `/metrics`.
9. Provider abstraction: wrap Gemini/Vertex behind a streaming-capable provider interface.
10. Safety validators: enforce deterministic guardrails before AI formatting.

## Incremental Upgrade Plan

- Keep `/api/coach/chat` stable while adding validation and compact signal support behind it.
- Add `/api/coach/chat/stream` for SSE, then switch the frontend once stable.
- Introduce events from existing write paths without changing user-facing logging flows.
- Warm caches from queue workers first; only then reduce synchronous Firestore reads.
- Move shared schemas to `packages/shared` after the backend contracts settle.

## Implemented Migration Notes

- `src/schemas` now validates API payloads, LLM outputs, Firestore-derived context, queue events,
  deterministic engine outputs, and signal packets.
- `src/events` and `src/queues` provide validated intelligence event publishing with BullMQ when
  Redis is available and an inline asynchronous fallback for local development.
- `src/intelligence` wraps the existing deterministic scoring modules into a reusable signal packet
  engine with Firestore persistence, Redis cache, in-memory cache, state-machine classification, and
  safety validation.
- `src/ai` now contains intent classification, selective retrieval, token counting, semantic prompt
  compression, compressed coach prompts, and provider abstraction.
- `/api/coach/chat` preserves the legacy JSON contract while using compressed deterministic context.
- `/api/coach/chat/stream` streams SSE tokens and emits a validated final response payload.
- The React Native coach screen uses streaming responses with abort support and falls back to the
  legacy non-streaming endpoint if streaming is unavailable before tokens arrive.
- Frontend workout, nutrition, hydration, sleep/recovery, step-goal, and profile writes publish
  intelligence events after successful Firestore writes.
- Prometheus metrics are exposed at `/metrics`, and structured logging is available through Pino.
