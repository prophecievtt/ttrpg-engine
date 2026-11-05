# ARCHITECTURE — Headless TTRPG State-Machine Ecosystem

## 1. Overview

A **TypeScript-first hybrid architecture**: all game logic, rule parsing, and state management are TypeScript; spatial geometry is Rust compiled to `wasm32-unknown-unknown` behind a strongly-typed TypeScript API. Rendering is strictly external: the engine exposes data + events only.

### Confirmed architectural decisions

| Topic | Decision |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| First slice | Fireball vertical slice through all packages |
| Sandboxing | Declarative JSON logic trees (default) behind a pluggable `Validator` interface |
| Rust phasing | TS reference implementation first; wasm behind the same API; TS retained as test oracle |
| Deltas | Reducers append RFC 6902 ops directly (no after-the-fact diffing) |
| Dice | Roll-plan compilation; injected entropy as totals and/or per-die faces; full per-die breakdown always emitted |
| License / builds | MIT; TS 5.x strict; dual ESM/CJS; no Node-specific APIs in core packages |

## 2. Repo Layout

```
ttrpg-engine/
├── package.json                # root; pnpm workspace + turbo orchestration
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── vitest.workspace.ts
├── docs/
│   ├── PRD.md
│   └── ARCHITECTURE.md
├── packages/
│   ├── rules/                  # @ttrpg-engine/rules
│   ├── interactions/           # @ttrpg-engine/interactions
│   ├── grid/                   # @ttrpg-engine/grid
│   ├── spatial/                # @ttrpg-engine/spatial  (TS API + TS reference impl)
│   ├── spatial-core/           # Rust crate → wasm32-unknown-unknown (wasm-pack)
│   └── orchestrator/           # @ttrpg-engine/orchestrator
├── examples/
│   ├── ember/                  # example system pack (fireball slice content)
│   └── fireball/               # headless demo consumer
└── .github/workflows/ci.yml
```

### Dependency direction (strict)

- `grid` → no deps (stdlib math only).
- `interactions` → no runtime deps. May consume type-only imports from `rules` if needed; v1 keeps it standalone.
- `rules` → no runtime deps; schema validation via a bundled minimal JSON Schema subset interpreter.
- `orchestrator` → the only package that depends on all of `rules`, `grid`, `spatial`, `interactions`.
- `spatial` → self-contained; optionally loads `spatial-core` wasm; falls back to the TS reference implementation.

No cycles permitted; enforced by Turborepo task graph and a lint rule list.

## 3. Core Data Model

### 3.1 Session State (`interactions`)

```ts
interface SessionState {
  version: 1;
  session_id: string;
  phase: "exploration" | "combat" | "social" | (string & {});   // extensible
  round: number;
  turn_index: number;
  initiative_roster: InitEntry[];        // { uuid, group, roll, order }
  entities: Record<EntityId, Entity>;
  effects: Effect[];                     // { id, target, source, name, expires_on_round }
  resources: Record<string, unknown>;    // scene-level counters, slotted spell slots, etc.
  log?: string[];                        // optional append-only narrative trail
}

type EntityId = string;                  // UUID v4

interface Entity {
  id: EntityId;
  kind?: string;                         // "player" | "npc" | "monster" | ...
  components: Record<string, unknown>;   // arbitrary key-value ECS components
}
```

Rules of the state model:
- State is a **plain JSON value**, trivially serializable, immutable by convention (structural sharing allowed).
- All entity meaning lives inside `components`; the engine core never hardcodes game fields (no bespoke `hp` in core — the fireball system pack does that in its reducers).
- Clinical facts (effects with `expires_on_round`) are first-class so `NEXT_TURN` can purge deterministically.

### 3.2 Temporal Model

- `phase` describes the macro-clock; `round` and `turn_index` the micro-clock; `initiative_roster` owns turn order.
- `NEXT_TURN` advances `turn_index` (wrapping at roster end increments `round`), purges every effect where `expires_on_round <= round`, and returns that purge itself as delta ops (`remove` per expired effect).

### 3.3 Determinism Guarantees

- No `Math.random()` anywhere in `grid`, `interactions`, `rules`, or `spatial` cores. No `Date.now()` in logic paths (only explicit `now` passed by the boundary).
- PRNG: an LCG/xoshiro implementation lives behind the entropy-injection interface; seeded by the authority, used by tests/replays — never auto-seeded.
- Dragonism also requires iteration order stability: entities/effects iterate in insertion order; all collections that reach deltas are ordered (arrays), never raw object-key iteration for logic.

## 4. The Event Loop & Delta Protocol

### 4.1 Dispatch pipeline

```
Intent ──> orchestrator/engine.dispatch(intent)
  1. validate intent shape + target existence + permission stamps (boundary concern)
  2. resolve rule content from rules (spell schema, effects)
  3. validate injected entropy (die faces in range, sums consistent, save DCs applied)
  4. run reducers in order: f(state, intent, entropy) -> { state', ops[] }
  5. emit Response { response_to, status, delta: ops[], meta? }
```

Reducers append ops directly to an op buffer while producing the next state. The delta is therefore exact and minimal by construction. A dev-tooling API can diff `state`→`state'` to *assert* the emitted ops are complete/consistent (test-only helper).

### 4.2 Intent envelope

```ts
interface Intent<I extends string = string, P = unknown> {
  intent_id: string;             // client-generated; echoed back
  type: I;                       // CAST_SPELL, MOVE, ATTACK, NEXT_TURN, APPLY_DAMAGE, ...
  source: EntityId;              // acting entity (or "system")
  payload: P;                    // discriminated by `type`
}

interface Response {
  response_to: string;
  status: "success" | "rejected" | "error";
  delta: JsonPatchOp[];          // RFC 6902; [] when rejected
  meta?: Record<string, unknown>;
}
```

### 4.3 Entropy & the dice pipeline (confirmed design)

1. Notation string (`"8d6"`, `"2d20kh1"`, `"1d8+3"`) parses into an immutable **RollPlan**: die count, faces(s), modifiers, keep/drop rules. Faces must be a whole number from 1 to 100 (no die above d100, ADR 12); `dicePool` applies the same checks to each group. Parser is hand-rolled, ~150 lines, zero deps; accepted syntax is a strict subset of `rpg-dice-roller` public notation.
2. Entropy injection accepts, per plan slot: `{ total }` only, or `{ dice: number[] }` (per-die faces), or both. Validation rejects wrong die counts, out-of-range faces, and inconsistent sums.
3. The resolved roll is emitted in the delta as a **RollResult** with the full per-die breakdown:

```ts
interface RollResult {
  plan: string;                    // canonical notation
  dice: Array<{ die: string; face: number; value: number }>;
  modifiers: Array<{ op: "add" | "sub" | "keeph" | "keepl" | "..."; value: number }>;
  total: number;
}
```

Every client therefore renders identical numbers *and* may steer 3D dice to land on the exact faces in `dice` (the physics roller on the initiator side produces that injection; everyone else replays it).

### 4.4 Op conventions

- Entity paths: `/entities/{uuid}/{componentKey}` and `/entities/{uuid}/components/{key}`.
- Appends into arrays (conditions, log): `{ "op": "add", "path": ".../conditions/-" }`.
- Effect expiry: `remove` at `/effects/{index}` (indices stable because ops apply in order on each client).
- Response `status: "rejected"` always has `delta: []`.

## 5. Package-by-Package Design

### 5.1 `@ttrpg-engine/grid` (pure TS, zero deps)

```
src/
  square/    coords, distances (chebyshev | manhattan | altDiagonal), pixel↔cell,
             cell-line (supercover), fill (square/cube regions)
  hex/       axial (+cube) coords, cube_distance, ring, spiral, filled regions,
             pixel↔hex (pointy & flat, cuboid sizes), cell-line, neighbors
  aoe/       cone, sphere-onto-cells, cube, line — all return cell arrays
  los/       in-cell line walk over blockers
  index.ts   public API surface
```

Implementation source of truth: Red Blob Games hex grid formulations (axial/cube, `cube_distance = max(abs…)`, ring/spiral generation, pixel conversion matrices, rounding). Square metrics follow standard TTRPG references (5e DMG diagonal shortcuts etc.).

### 5.2 `@ttrpg-engine/interactions`

```
src/
  state.ts          SessionState types + createSession()
  engine.ts         dispatch(intent, deps) — 4-step pipeline (validation→rules→entropy→reduce)
  reducer.ts        op-emitting reducer scaffolding (helpers to append ops atomically)
  effects.ts        temporal model: expiry registration, NEXT_TURN purge
  dice/
    notation.ts     parser + RollPlan
    entropy.ts      injection validation
    prng.ts         xoshiro/LCG, seedable
  ops.ts            JsonPatchOp builders
  diff.ts           test-only state diff (asserts op completeness/consistency)
  index.ts
```

**System extensibility contract**: game-specific reducers (e.g. the example pack's `CAST_SPELL/fireball` resolver) plug in at the engine boundary. The core provides: state threading, op emission, temporal bookkeeping, entropy validation, and delta framing. This keeps the engine system-agnostic (meets the brief) while remaining useful out of the box with the example system.

### 5.3 `@ttrpg-engine/rules`

```
src/
  json.ts           JSON helpers: freezing, prototype-safe path get, deep equality, Issue type
  store.ts          CompendiumStore: register(content), get(type, id), query(type, filter)
  schema.ts         SchemaRegistry + minimal JSON Schema subset validator
  logic-tree.ts     interpreter: {if,then,else, all, any, not, comparisons, arithmetic, path get}
  validator.ts      Validator interface: validate(document, schemaId?, rules?) => Result
  backend/
    memory.ts       v1 default
    (indexeddb.ts   future)
  index.ts
```

- Compendium content: static JSON, indexed by `type` (spell/class/npc/item/…) and `id`; queries by simple typed filters.
- Schemas are exposed to UI layers to generate homebrew forms dynamically (per brief), so schemas are themselves indexed, versioned documents.
- `Validator` interface: `{ id, validate }`. Default implementation = logic trees (deterministic, serializable, safe by construction). A separate optional package may provide a QuickJS-WASM implementation later without touching core.

### 5.4 `@ttrpg-engine/spatial` + `spatial-core`

```
packages/spatial/            (TypeScript)
  src/
    api.ts        locked types: Vec3, Ray, Sphere, Cone, Cuboid, Plane, Wall,
                  RayHit, Token, … and the SpatialBackend contract
    vec.ts        vector math (only + - * / and Math.sqrt)
    shapes.ts     constructors, containsPoint(), intersectShape()
    raycast.ts    raycast(), raycastAll(), los()
    slide.ts      slide() collide-and-slide against walls
    query.ts      measure(), measurePath(), selectTargets()
    wasm/
      loader.ts   (spatial-wasm slice) async init of spatial-core; feature-identical wrapper
    index.ts      exports the TS reference as `referenceBackend` (the permanent oracle)
  test/vectors/spatial.json   shared numeric vector suite (inputs + expected outputs)
  bench/                      vitest bench scenes, run against every backend

packages/spatial-core/       (Rust, wasm-pack → wasm32-unknown-unknown)
  src/lib.rs     Vec3 (f64), ray/sphere/AABB/cone intersections,
                 raycast segments, sliding, los; serde-serializable outputs
  tests/         Rust unit tests mirror ../spatial/test vectors
```

- Everything is 3D by default; Z locked to `0` in 2D mode. Volumetric truthful shapes (spheres are globes).
- No transcendental Math functions on the numeric path (they are implementation-defined and would break TS⇄wasm bit identity); cones therefore take `spread` = tan(half-angle). Normals are canonicalised so outputs never contain `-0`.
- **Determinism**: both implementations must produce bit-identical results for the shared test vector suite (`f64` IEEE-754; TS reference is the oracle). Benchmarks published in `spatial/bench/`.
- wasm loading is asynchronous and optional; sync path (TS ref) keeps bots/tests simple.

### 5.5 `@ttrpg-engine/orchestrator`

```
src/
  pipeline.ts    fireball-style pipeline: rulesQuery → targetSelect (spatial|grid) →
                 entropyBind → dispatch
  sessions.ts    thin session registry for consumers
  index.ts
```

Delivers the vertical slice (PRD §6.3) and the example `examples/fireball` consumer (headless, log-style output; no rendering).

## 6. Vertical Slice Test Contracts (fireball)

Golden-file behavior locked by tests:
1. `rules` resolves `fireball` (radius 20-ft globe, `8d6` fire, DEX save half).
2. `spatial` volumetric query over 1,000 randomized tokens finds exactly the expected UUID set (elevation respected; cover blocks behind low walls via raycast) — cross-checked bit-identical between TS ref and (later) wasm.
3. Intent with injected `dice` array `[5,3,1,6,4,2,4,3]` (total 28) + save results dispatches.
4. Delta ops replay: goblin-1 `hp→0` + `conditions+="dead"`, goblin-2 `hp→14`, wizard `resources/spell_slots_3→1`, plus full RollResult emission.
5. `NEXT_TURN` after the blast purges a 1-round effect registered by the spell, exactly once.
6. Determinism: byte-identical serialized state + delta across Node and a browser-polyfilled runner and across repeated runs.

## 7. Testing Strategy

| Layer | Tooling | Focus |
|---|---|---|
| `grid` | vitest + property tests (fast-check) | metric identities, ring symmetry, pixel↔cell round-trips |
| `interactions` | vitest, golden files | reducer purity, op stream exactness, temporal purge, entropy validation rejects |
| `rules` | vitest | schema subset validator conformance, logic-tree semantics, query filters |
| `spatial` | vitest (TS ref) + `cargo test` | shared numeric vector suite; wasm↔TS bitwise equality |
| orchestrator | integration | end-to-end slice, determinism across runtimes |

CI: pnpm install (frozen lockfile), lint, typecheck, `turbo run test build`, Rust: `cargo test --target wasm32-unknown-unknown` (via wasm-bindgen-test when wasm lands) or host-native unit tests until then.

## 8. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Rust toolchain friction for contributors | TS reference implementations cover all spatial APIs; wasm optional; CI builds wasm independently |
| Determinism drift between TS ref and wasm | Shared numeric test-vector suite; wasm adopt only when bit-identical |
| Schema subset validator scope creep | v1 subset: `type`, `properties`, `required`, `enum`, `items`, `$ref` (registry-local), `additionalProperties` — no remote refs |
| Entropy injection abuse (clients forging rolls) | Authority-side injection only; engine validates and stamps `meta.entropy_source`; docs mark client-rolled entropy as insecure for untrusted tables |
| Logic-tree expressiveness gaps | `Validator` interface escape hatch (optional QuickJS package) |

## 9. Milestone Mapping (matches PRD §10)

1. Scaffold — monorepo tooling, configs, CI.
2. `grid` complete.
3. `interactions` core + dice pipeline.
4. `spatial` TS reference (+ `spatial-core` skeleton crate).
5. `rules` store + schemas + logic trees.
6. Fireball slice + demo consumer.
7. Hardening — benchmarks, docs polish, release config.