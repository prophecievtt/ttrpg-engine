# PRD — Headless TTRPG State-Machine Ecosystem

## 1. Product Summary

A headless, system-agnostic Tabletop Roleplaying Game (TTRPG) engine published as a set of four strictly decoupled TypeScript packages plus an orchestrator package. Game logic, rule parsing, and state management run in TypeScript; computationally expensive spatial geometry runs in Rust compiled to WebAssembly.

The engine is **renderer-agnostic**: it exposes a strict, deterministic, Redux-style event loop and emits standardized RFC 6902 JSON Patch deltas, so any frontend — an async Discord bot, a 2D web character creator, a cinematic 3D volumetric Virtual Tabletop (VTT) — can consume the same engine without bundling what it doesn't need.

## 2. Goals

- **Maximum community adoption**: MIT license, TypeScript-first (world's largest developer ecosystem), zero runtime dependencies in deterministic core packages, boring standard tooling (pnpm + Turborepo).
- **Determinism by construction**: identical Intents + identical injected entropy produce bit-identical state and bit-identical deltas on every device. This makes multiplayer sync, replays, and tests trivial.
- **Modularity**: developers bundle only the packages they need (see System Agnosticism, §7).
- **Multiplayer-ready out of the box**: minimal bandwidth via state deltas rather than monolithic state syncs.
- **Homebrew-friendly**: generic JSON Schemas drive dynamic UI form generation; system creators supply validation logic as declarative, sandboxed logic trees.

## 3. Non-Goals (v1)

- A rendered UI or VTT frontend (the engine has no opinions about pixels; a future docs/demo site may carry the paper/ember design language).
- Full graphical 3D dice physics — v1 defines the injection contract such a roller will feed; the roller itself is a separate future package.
- A hosted game server or discovery service. v1 ships a library; websocket fan-out is a consumer concern, guided by the delta broadcast protocol in §6.
- Exhaustive system rule content. v1 ships the engine plus a tiny example system pack sufficient to run the fireball vertical slice.

## 4. Personas

1. **The System Author** — publishes a game system (e.g. D&D-like, PbtA): writes compendium JSON (spells, classes, NPCs, items), JSON Schemas, and declarative validators.
2. **The VTT Developer** — builds a grid-based, gridless, or theater-of-the-mind frontend that dispatches Intents and consumes deltas.
3. **The Bot Developer** — drives a session from a Discord bot or test harness using only `rules` + `interactions`.
4. **The Contributor** — lands engine improvements without needing Rust installed (TS reference implementations exist for every spatial API).

## 5. Functional Requirements

### 5.1 `@ttrpg-engine/rules` — Static Knowledge Engine
- Index and query static system data (spells, classes, NPCs, items) with fast lookups (by id, and simple typed filters); in-memory backend at v1, an IndexedDB adapter later.
- Expose generic JSON Schemas for system content so UIs can render homebrew input forms dynamically.
- Execute system-provided validation logic safely. Default engine: deterministic JSON logic trees (`if`/`then`/`else`, comparisons, arithmetic, `all`/`any`/`not`, path extraction). A pluggable `Validator` interface permits an optional, separate QuickJS-WASM adapter for authors who need arbitrary JS.
- Enforce "the universe of possibilities": schemas both validate content and type queries.

### 5.2 `@ttrpg-engine/interactions` — Live Session Engine
- Track transient session state as an immutable object: entities keyed by UUID with arbitrary key-value components (pure ECS).
- Temporal state: current `phase` (e.g. `combat`, `exploration`), an `initiative_roster`, and effect conditions with `expires_on_round` timestamps. The `NEXT_TURN` intent advances the clock and auto-purges expired effects.
- Process a strict `Intent` (action request) through system-defined resolution logic and emit an immutable result `{ response_to, status, delta[] }` where `delta` is an RFC 6902 JSON Patch.
- Generate **zero unseeded entropy**. All randomness enters via injected entropy in the Intent payload (dice results from a physics roller, server RNG, or bot crypto RNG) and is strictly validated before use.
- Dice pipeline (confirmed design): compile notation (e.g. `8d6`) into a **roll plan**; accept injected entropy as totals and/or per-die faces; validate count/faces/sum; **always emit the full per-die breakdown plus totals in the delta**, so number-only UIs and steered 3D dice animations stay identical across all connected clients. Notation is a strict subset of the `rpg-dice-roller` public syntax for a clean future upgrade path.
- Deterministic, seedable PRNG utilities for tests and replay (used only at explicit boundaries; never silently).

### 5.3 `@ttrpg-engine/grid` — Tactical Mathematics Engine
- Pure TypeScript, zero dependencies, fully synchronous.
- Distance metrics per TTRPG convention: Chebyshev, Manhattan, alternating diagonals (square); axial/cube distance (hex).
- Grid coordinate ↔ pixel translations for square and hex (pointy- and flat-top).
- Cell-based area-of-effect arrays: squares/cubes, hex rings and filled hex regions, lines, cones-as-cell-sets.
- Grid-agnostic LoS-in-cells helpers (line-walk over cells).

### 5.4 `@ttrpg-engine/spatial` — Physics & Geometry Engine
- 3D vector math by default (X, Y, Z). Volumetric shapes: a 20-ft sphere is a true globe, not a flat circle. Z lockable to 0 for 2D consumers.
- Dynamic raycasting (2D/3D): line-of-sight and light boundary queries.
- Vector collisions: token↔wall, sliding across planes.
- Geometric intersections for gridless play: tape-measure distance, sphere/cone/cube template overlaps, shape↔shape intersections.
- **Phased delivery (confirmed)**: the TypeScript package ships a pure-TS reference implementation of the full API first; the Rust crate (`spatial-core`, compiled to `wasm32-unknown-unknown` via wasm-pack) implements the same math behind that same API and becomes the default when complete. The TS reference is retained permanently as a cross-check test oracle.

### 5.5 `@ttrpg-engine/orchestrator` — Glue
- Bundles rules retrieval, tactical evaluation, entropy binding, and interaction dispatch into a single pipeline for consumers who want all four packages.
- Demo vertical slice: the fireball end-to-end flow (see §6.3).

## 6. Multiplayer Synchronization & State Diffing

### 6.1 Intent Payload (client → engine)
Strict, versioned, discriminated-union schema. Entropy is always injected by the authoritative side:

```json
{
  "intent_id": "req_88a9f",
  "type": "CAST_SPELL",
  "source": "uuid-wizard-1",
  "payload": {
    "spell_id": "fireball",
    "targets": ["uuid-goblin-1", "uuid-goblin-2"],
    "injected_entropy": {
      "damage": { "roll": "8d6", "dice": [[5, 3, 1, 6, 4, 2, 4, 3]], "total": 28 },
      "target_saves": { "uuid-goblin-1": 12, "uuid-goblin-2": 19 }
    }
  }
}
```

### 6.2 Patch Payload (engine → all clients)
The engine processes the Intent against validated rules and emits a minimal delta array for broadcast to every websocket peer:

```json
{
  "response_to": "req_88a9f",
  "status": "success",
  "delta": [
    { "op": "add", "path": "/history/rolls/-", "value": { "plan": "8d6", "dice": [ /* 8 × { die, face, value, kept } */ ], "modifiers": [], "total": 28 } },
    { "op": "replace", "path": "/entities/uuid-goblin-1/components/hp", "value": 0 },
    { "op": "add", "path": "/entities/uuid-goblin-1/components/conditions", "value": ["dead"] },
    { "op": "replace", "path": "/entities/uuid-goblin-2/components/hp", "value": 14 },
    { "op": "replace", "path": "/entities/uuid-wizard-1/components/spell_slots_3", "value": 1 }
  ]
}
```

Entity data lives under `/entities/<id>/components/<key>`; ids and keys are RFC 6901-escaped (`~` → `~0`, `/` → `~1`). The first condition creates the `conditions` array; later ones append with `/conditions/-`. The authoritative golden output is `packages/interactions/test/golden/ember-scenario.json`.

### 6.3 The Orchestration Pipeline (fireball vertical slice)
1. **Rules Query** — `rules` resolves the `fireball` schema (radius 20-ft globe, `8d6` damage).
2. **Tactical Evaluation** — `spatial` picks every UUID inside the volumetric blast (elevation + cover via raycast LoS), or accepts pre-targeted UUIDs from `grid` cell selection.
3. **Interaction Dispatch** — the orchestrator binds injected entropy (physics roller or server RNG), packages spell schema + targeted UUIDs + dice results into an Intent, and dispatches to `interactions`.
4. **State Delta** — reducers apply validated math and emit an immutable JSON Patch delta (reducers append ops directly; no after-the-fact diffing).
5. **UI Render** — the frontend consumes the delta: cinematic particles, health bar updates, per-die dice results — identical on every client.

## 7. System Agnosticism & Flexibility

- **Grid-based combat (D&D/PF)**: all packages — `grid` for cell math, `spatial` for LoS/templates.
- **Gridless 3D VTT (TaleSpire-like)**: drop `grid`; `spatial` with unlocked Z for volumetric measurement.
- **Theater of the mind (Vampire/PbtA)**: only `rules` + `interactions`; a very lightweight app.

## 8. Non-Functional Requirements

- **Determinism**: same input → same output everywhere. Enforced by tests that compare byte-identical serialized state across Node and browser runners.
- **Dependency discipline**: `grid` and `interactions` cores ship zero runtime dependencies; wasm loads are async and optional (TS oracle available).
- **Portability**: no Node-specific APIs in core packages; dual ESM/CJS builds; browser, Node, Deno/Bun, and worker targets.
- **Performance budgets** (v1 sanity bars): state dispatch + delta emission < 1 ms for a 1,000-entity session; fireball target selection over 1,000 tokens < 5 ms (TS) — the wasm goal is strictly lower with a published benchmark.
- **Testability**: every reducer is a pure function of `(state, intent, entropy)`; golden-file tests for the fireball slice; property tests for grid; Rust unit tests plus TS-oracle cross-check for spatial.

## 9. Example System Pack (v1)

A tiny, clearly-labeled example system (`examples/ember/`) proving the engine: the `fireball` spell (20-ft globe, `8d6` fire, DEX save for half), two monster stats, one wizard with spell slots, initiative rules, and a `NEXT_TURN` purge example. Not intended as published game content.

## 10. Milestones (each lands with green tests)

1. **Scaffold** — pnpm + Turborepo monorepo, TS 5.x strict configs, lint, vitest, CI, LICENSE (MIT), CONTRIBUTING.
2. **`grid`** — complete package, zero deps.
3. **`interactions`** — session state machine, op-emitting reducers, temporal model, dice pipeline.
4. **`spatial`** — TS reference implementation, API locked for wasm swap-in.
5. **`rules`** — compendium store, schema registry, logic-tree validators.
6. **Fireball slice** — end-to-end demo through the orchestrator.
7. **Hardening** — docs, benchmarks, release/publish setup.

## 11. Success Criteria

- The fireball slice runs headlessly end-to-end and its delta is JSON-stable across runs and platforms.
- A developer can implement a Discord-bot dice command using only `rules` + `interactions` in under 50 lines.
- All four packages install independently (`pnpm add @ttrpg-engine/grid` alone works).
- The wasm build of `spatial-core` passes the same oracle tests as the TS reference.