# ttrpg-engine

> A headless, system-agnostic Tabletop Roleplaying Game engine.
> TypeScript logic. Rust geometry. Deterministic, multiplayer-ready, renderer-free.

The engine isolates **data from rendering** behind a strict Redux-style event loop. Frontends dispatch a typed *Intent*; the engine applies validated math and emits a minimal RFC 6902 JSON Patch *delta* — consumed identically by a Discord bot, a 2D web character creator, or a cinematic 3D virtual tabletop.

```mermaid
graph LR
  subgraph Frontends
    BOT[Discord bot] --> ORCH
    WEB[2D web app] --> ORCH
    VTT[3D volumetric VTT] --> ORCH
  end
  subgraph Ecosystem
    ORCH[orchestrator] --> RULES[rules<br/>static knowledge]
    ORCH --> SPAT[spatial<br/>Rust → wasm]
    ORCH --> GRID[grid<br/>pure TS]
    ORCH --> INTR[interactions<br/>live state machine]
    INTR -- "JSON Patch deltas" --> ORCH
  end
  ORCH -- "Intent / delta" --> BOT & WEB & VTT
```

## Packages

| Package | Purpose | Runtime deps |
|---|---|---|
| [`@ttrpg-engine/rules`](packages/rules) | Static knowledge engine: compendiums, JSON Schemas, sandboxed validators | none |
| [`@ttrpg-engine/interactions`](packages/interactions) | Live-session state machine: intents in, RFC 6902 deltas out, injected-entropy dice | none |
| [`@ttrpg-engine/grid`](packages/grid) | Tactical grid math: square/hex distances, pixel conversions, AoE cells | none |
| [`@ttrpg-engine/spatial`](packages/spatial) | Grid-agnostic 3D geometry: volumetric shapes, raycasting, LoS (Rust/wasm core) | none (wasm optional) |
| [`@ttrpg-engine/orchestrator`](packages/orchestrator) | Glue pipeline + the fireball vertical-slice demo | the four above |

Bundle only what you need:

- **Theater of the mind** (PbtA, Vampire): `rules` + `interactions` only.
- **Gridless 3D** (TaleSpire-like): drop `grid`, keep `spatial` with unlocked Z.
- **Grid combat** (D&D/PF): all four.

## Determinism, by construction

- The engine **never generates unseeded entropy**. The authoritative side (physics dice roller, server RNG, bot crypto RNG) injects dice results into the Intent; the engine validates and applies them.
- Every client receives the **full per-die breakdown** in the delta — same numbers *and* the exact faces a 3D dice animation should land on, everywhere.
- Same Intent + same entropy ⇒ byte-identical state and deltas on every device. Multiplayer sync, replays, and tests fall out for free.

## Quickstart

```ts
import { createSession, dispatch, NEXT_TURN } from "@ttrpg-engine/interactions";
```

Full end-to-end flow (fireball slice) lives in [`examples/fireball`](examples/fireball). See `docs/PRD.md` and `docs/ARCHITECTURE.md` for the complete contracts.

## Status

🚧 **In progress** — `grid`, `interactions`, and the `spatial` TS reference are complete; `rules` and the fireball slice are next. Features land slice-by-slice per `docs/PRD.md` §10:

1. ✅ Scaffold — pnpm + Turborepo, TS strict, ESLint, Vitest, CI, MIT, contributor guide
2. ✅ `grid` — square/hex math
3. ✅ `interactions` — state machine + dice pipeline
4. ✅ `spatial` — locked 3D API + TS reference
5. ⬜ `rules` — compendium + schemas + logic trees
6. ⬜ Fireball vertical slice
7. ⬜ `spatial-core` wasm swap-in
8. ⬜ Hardening + release

## Contributing

MIT-licensed and dependency-light by design. See [`CONTRIBUTING.md`](CONTRIBUTING.md).