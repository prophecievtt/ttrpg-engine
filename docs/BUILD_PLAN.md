# ttrpg-engine
## Status & Next
All 9 slices done + v0.1.0 PUBLISHED on npm (2026-11-01): @ttrpg-engine/{grid,interactions,rules,spatial,orchestrator}, verified by clean install (ESM + CJS). Code on GitHub prophecievtt/ttrpg-engine, CI green on main (tag v0.1.0 sits 2 commits before CI-only fixes; package code identical). Publish method (passkey 2FA, pnpm pack + npm publish) is in docs/RELEASE.md step 6.
Spatial benchmark gate done (ADR 9). Compendium storage done (2026-11-01, ADR 10): `openSqliteBackend(db)` + `openIndexedDbBackend()` in rules. Unreleased: spatial speedups + storage backends (CHANGELOG); release as 0.2.0 when convenient (new API → minor; docs/RELEASE.md).
Next: 1) QuickJS sandbox for author JS validators (opt-in package, no file/network access, step/time limit). ~1–2 sessions. Then start Ethan's VTT (separate project, research Alchemy first); 3D dice comes after the VTT starts.
In progress: nothing

## Vision
Ethan: "this project is primarily for me - I'd like to build a VTT app similar to Alchemy - but I also want these tools to be usable by other developers/designers to build apps that better suit the needs of their games." So: Ethan's own Alchemy-like VTT is the first real consumer; the engine stays general enough for others' apps.
From Ethan's design brief (docs/ARCHITECTURE_BRIEF.md, the source of PRD.md): a headless, system-agnostic TTRPG engine built for maximum community adoption, open-source contribution and modularity. TypeScript for logic, Rust→wasm for heavy 3D geometry. Data fully separated from rendering; deterministic and multiplayer-ready, emitting tiny JSON Patch deltas. One engine for a Discord bot, a 2D character creator or a cinematic 3D VTT. Developers bundle only the packages they need.

## You asked for
- Set the project up with guided-build (2026-11-01)
- Follow docs/ARCHITECTURE_BRIEF.md as the overall vision (2026-11-01)
- Four strictly decoupled packages: rules, interactions, grid, spatial (brief)
- Engine never makes its own randomness; dice come in with the Intent (brief)
- npm org `ttrpg-engine` + GitHub repo prophecievtt/ttrpg-engine for publishing (2026-11-01)
- Order: storage backends, then JS sandbox, then start the VTT; 3D dice after the VTT starts (2026-11-01)
- Supports grid play (D&D/PF, all packages), gridless 3D (drop grid) and theater of the mind (rules + interactions only) (brief)

## What it is
A headless, system-agnostic tabletop RPG engine library (TypeScript; optional Rust/wasm geometry later if benchmarks need it). Frontends (Discord bot, 2D web app, 3D VTT) send Intents and get back JSON Patch deltas. No UI of its own.

## Features
First version (build order, PRD §10):
- [x] Scaffold (pnpm/Turborepo, CI, MIT)
- [x] grid — square/hex math, AoE shapes
- [x] interactions — session state machine, dice pipeline
- [x] spatial — locked 3D API + TS reference
- [x] rules — compendium, JSON Schema subset, logic-tree validators
- [x] Fireball vertical slice — end-to-end demo
- [x] spatial lighting — `illumination` + `lightBoundary` (packages/spatial/src/light.ts)
- [x] Hardening — READMEs, ADRs (docs/adr), `pnpm check:pack`, RELEASE.md
- [x] Publish v0.1.0 to npm
- [x] Spatial benchmark gate — TS passed, wasm not needed (ADR 9)
- [x] Compendium storage: IndexedDB + SQLite backends (ADR 10)
- [ ] QuickJS sandbox for author JS validators (e.g. validate_level_up.js) — ~1–2 sessions
Later (in this order): Ethan's own Alchemy-like VTT app (separate project, built on this engine; research Alchemy before starting it); 3D dice roller package (after the VTT is started; likely built alongside it, needs design round).
Not doing (v1): rendered UI/VTT, 3D dice physics, hosted server, full rule content.

## How to run & test
`pnpm install` · `pnpm test` · `pnpm typecheck` · `pnpm lint` · `pnpm check:invariants` · `pnpm smoke` · `pnpm check:pack` (release dry-run: packs, installs tarballs in a temp project, runs README examples ESM/CJS/types; needs build) · `pnpm dev:server` (HTTP host for the ember session; needs `pnpm build`). `node examples/fireball/run.mjs` prints the demo log.

## Where things are
- packages/{grid,interactions,rules,spatial,spatial-core,orchestrator} — the packages
- packages/orchestrator/src/pipeline.ts — `createPipeline().castSpell` (rules → spatial/ids → entropy → dispatch), `seededEntropy`, `tokensFromState`; sessions.ts — `createSessionRegistry`
- examples/fireball — private pkg `@ttrpg-engine/example-fireball`: host.ts `createEmberHost` + `handleIntent` (wire format for CAST_SPELL: spell_id + at|targets + injected_entropy), demo.ts `runFireballDemo` (log), run.mjs, expected.log (golden; UPDATE_GOLDEN=1)
- packages/orchestrator/test: golden.test.ts + golden/fireball.json (full pipeline delta), volumetric.test.ts (contract 2, brute force)
- examples/ember — private workspace pkg `@ttrpg-engine/example-ember`: content (schemas, fireball, wizard, goblins), `createEmberRuleset`, `buildEmberSession` scene + `BLAST_POINT`
- packages/rules/src/backend/ — memory, sqlite, indexeddb, persistent.ts (shared), migrations.ts (embeds migrations/*.sql; test keeps them identical); test/backends.test.ts runs one contract over all three
- docs/ARCHITECTURE_BRIEF.md — Ethan's original vision brief (read only if PRD seems to contradict it)
- docs/PRD.md — requirements, §6 delta protocol, §10 milestones
- docs/ARCHITECTURE.md — contracts; §6 fireball test contracts
- docs/DESIGN_SYSTEM.md — demo log output style (§4)
- docs/adr — decision records (index in README); docs/RELEASE.md — publish steps; CHANGELOG.md
- scripts/pack-check.mjs + scripts/pack-consumer/ — consumer.mjs mirrors interactions/orchestrator README quickstarts: change both together
- docs/STATE.json, DECISIONS.json — older workflow's records (superseded by docs/adr)
- server.js — HTTP host (imports examples/*/dist; GET /state, POST /intent?session=); migrations/ — compendium SQL; scripts/ — invariants, smoke

## Design
No UI. Demo output follows DESIGN_SYSTEM.md §4 (log style).

## Decisions
In docs/adr (1 pnpm+Turborepo · 2 fireball-first · 3 reducers emit JSON Patch · 4 logic-tree validators · 5 injected dice · 6 TS spatial, wasm only if benchmarked · 9 gate passed, no wasm · 7 systems in examples/* · 8 point lights). New decision → new ADR file + index row.

## Tech
- TypeScript 5 strict, Vitest, ESLint, Node ≥20; Rust + wasm-pack for spatial-core (optional, deferred)
- Core packages have zero runtime deps (checked by invariants script)

## Known issues & gotchas
- Spatial perf: bench/scenes.ts + test/scenes.test.ts pin big-scene results by hash; speedups must keep output byte-identical (vectors + hashes). lightBoundary is O(walls²) per light (worst case 215 ms; fix would be a sweep, not wasm).
- Lighting: `illumination` is exact 3D (los rules; `dim` 0 = off). `lightBoundary` is a 2D slice at the light's height: only walls/cuboids spanning that height cast shadows (spheres/planes ignored); polygon ends on the dim-radius square, consumers clip with the circle; corners use ±1e-4 nudged rays and a pseudo-angle sort (no atan2), so polygons include extra collinear points. No magical darkness, cone lights or vision/darkvision yet (VTT-level, later).
- PRD deliberately refines the brief: delta paths are /entities/<id>/components/<key>, entropy carries per-die faces, the delta adds a /history/rolls entry. PRD wins.
- Determinism is a hard rule: same Intents + injected entropy → byte-identical state/deltas. No Math.random/Date in core.
- Only orchestrator (and examples/*) may depend on other packages; no cycles. Cross-package imports resolve to dist, so turbo builds deps before test/typecheck; when running vitest directly in one package, build its deps first.
- rules' JSON Schema subset rejects unknown keywords (e.g. `minimum`/`maximum`): put numeric ranges in logic-tree rules instead.
- Entity positions are components: `position {x,y,z}` (feet, z up) + `radius`; the pipeline turns them into spatial tokens.
- server.js and smoke import built dist by relative path (root can't resolve workspace packages); rebuild after changing src.
- Ember ruleset still gives dead creatures their turn (demo log shows goblin-1's turn). Fine for the demo; real systems decide skip rules.
- Root .gitignore ignores *.log; golden logs are re-included with `!examples/*/expected.log`.
- Publish with pnpm, not npm: pnpm rewrites `workspace:*` and adds the root LICENSE to each tarball. Exported `version` in src/index.ts must match package.json (check:pack enforces).
- Persistent backends cache all entries in memory and write through (sync API kept). SQLite takes an injected connection (no dep); IDB batches writes per tick, `flush()` surfaces failures. New migration = new migrations/000N_*.sql that inserts its own schema_migrations row, plus an entry in backend/migrations.ts. Rules tests need Node ≥22.13 (node:sqlite) and use fake-indexeddb.
- Dice notation is ONE `XdY` group + optional `±N` + optional kh/kl/dh/dl; mixed pools need `dicePool()`.
- Ember fireball: DC from caster `spell_save_dc`, slot key `spell_slots_<level>`, survivors get a 1-round "scorched" effect (purged when round 2 begins). Ruleset rejects a damage `roll` that differs from the spell's dice.
