# ttrpg-engine
## Status & Next
Slice 5 of 8 done: scaffold, grid, interactions, spatial (TS reference), rules. 247 tests + typecheck + lint + invariants + smoke all green (2026-11-01).
Next: 1) Fireball slice: create `examples/ember/` (fireball, wizard, 2 goblins) + `examples/fireball/` demo; wire `packages/orchestrator` pipeline (rules → spatial targets → dice → dispatch); golden delta per PRD §6.3 / ARCHITECTURE §6. Wire `server.js` POST /intent to the real pipeline. Likely 2 sessions: content + pipeline, then golden-delta + demo. 2) spatial-core Rust→wasm. 3) Hardening + release.
In progress: nothing

## Vision
(to fill in, in Ethan's words)

## You asked for
- Set the project up with guided-build (2026-11-01)

## What it is
A headless, system-agnostic tabletop RPG engine library (TypeScript + Rust/wasm geometry). Frontends (Discord bot, 2D web app, 3D VTT) send Intents and get back JSON Patch deltas. No UI of its own.

## Features
First version (build order, PRD §10):
- [x] Scaffold (pnpm/Turborepo, CI, MIT)
- [x] grid — square/hex math, AoE shapes
- [x] interactions — session state machine, dice pipeline
- [x] spatial — locked 3D API + TS reference
- [x] rules — compendium, JSON Schema subset, logic-tree validators
- [ ] Fireball vertical slice — end-to-end demo — ~2 sessions
- [ ] spatial-core wasm swap-in — ~1–2 sessions
- [ ] Hardening — READMEs, ADRs, pnpm pack dry-run — ~1 session
Not doing (v1): rendered UI/VTT, 3D dice physics, hosted server, full rule content.

## How to run & test
`pnpm install` · `pnpm test` · `pnpm typecheck` · `pnpm lint` · `pnpm check:invariants` · `pnpm smoke` · `pnpm dev:server` (stub HTTP endpoint).

## Where things are
- packages/{grid,interactions,rules,spatial,spatial-core,orchestrator} — the packages
- docs/PRD.md — requirements, §6 delta protocol, §10 milestones
- docs/ARCHITECTURE.md — contracts; §6 fireball test contracts
- docs/DESIGN_SYSTEM.md — demo log output style (§4)
- docs/STATE.json, DECISIONS.json — older workflow's slice list + decisions (full definitions of done)
- server.js — stub transport; migrations/ — compendium SQL; scripts/ — invariants, smoke

## Design
No UI. Demo output follows DESIGN_SYSTEM.md §4 (log style).

## Decisions
- pnpm + Turborepo monorepo; fireball end-to-end as first slice
- Reducers emit JSON Patch ops directly (no diffing)
- Validation = declarative logic trees + pluggable Validator (QuickJS later, optional)
- Spatial: TS reference first, Rust wasm behind the same API, TS kept as oracle
- Dice: roll plan + per-die results, rpg-dice-roller-compatible subset, zero deps
Full rationale: docs/DECISIONS.json.

## Tech
- TypeScript 5 strict, Vitest, ESLint, Node ≥20; Rust + wasm-pack for spatial-core
- Core packages have zero runtime deps (checked by invariants script)

## Known issues & gotchas
- README Quickstart links `examples/fireball`, which doesn't exist yet (fireball slice creates it).
- Determinism is a hard rule: same Intents + injected entropy → byte-identical state/deltas. No Math.random/Date in core.
- Only orchestrator may depend on other packages; no cycles.
