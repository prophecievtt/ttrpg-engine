# ttrpg-engine
## Status & Next
Slice 6 of 8 done (fireball vertical slice complete). 284 tests + typecheck + lint + invariants + smoke all green (2026-11-01).
Next: 1) spatial light-boundary queries (missing, see Known issues) — must land before wasm so the API locks with it. Design it first: light sources (point + radius, maybe bright/dim bands), which obstacles block light, query = "light level at point" and/or "lit region boundary"; add to SpatialBackend + TS reference + test vectors. 2) spatial-core Rust→wasm (also cross-check contract 2 in orchestrator/test/volumetric.test.ts against wasm). 3) Hardening + release.
In progress: nothing

## Vision
Ethan: "this project is primarily for me - I'd like to build a VTT app similar to Alchemy - but I also want these tools to be usable by other developers/designers to build apps that better suit the needs of their games." So: Ethan's own Alchemy-like VTT is the first real consumer; the engine stays general enough for others' apps.
From Ethan's design brief (docs/ARCHITECTURE_BRIEF.md, the source of PRD.md): a headless, system-agnostic TTRPG engine built for maximum community adoption, open-source contribution and modularity. TypeScript for logic, Rust→wasm for heavy 3D geometry. Data fully separated from rendering; deterministic and multiplayer-ready, emitting tiny JSON Patch deltas. One engine for a Discord bot, a 2D character creator or a cinematic 3D VTT. Developers bundle only the packages they need.

## You asked for
- Set the project up with guided-build (2026-11-01)
- Follow docs/ARCHITECTURE_BRIEF.md as the overall vision (2026-11-01)
- Four strictly decoupled packages: rules, interactions, grid, spatial (brief)
- Engine never makes its own randomness; dice come in with the Intent (brief)
- Supports grid play (D&D/PF, all packages), gridless 3D (drop grid) and theater of the mind (rules + interactions only) (brief)

## What it is
A headless, system-agnostic tabletop RPG engine library (TypeScript + Rust/wasm geometry). Frontends (Discord bot, 2D web app, 3D VTT) send Intents and get back JSON Patch deltas. No UI of its own.

## Features
First version (build order, PRD §10):
- [x] Scaffold (pnpm/Turborepo, CI, MIT)
- [x] grid — square/hex math, AoE shapes
- [x] interactions — session state machine, dice pipeline
- [x] spatial — locked 3D API + TS reference
- [x] rules — compendium, JSON Schema subset, logic-tree validators
- [x] Fireball vertical slice — end-to-end demo
- [ ] spatial light-boundary queries (raycast lighting) — ~1 session
- [ ] spatial-core wasm swap-in — ~1–2 sessions
- [ ] Hardening — READMEs, ADRs, pnpm pack dry-run — ~1 session
Later: Ethan's own Alchemy-like VTT app (separate project, built on this engine; research Alchemy before starting it); IndexedDB and SQLite compendium backends (brief names both; v1 is in-memory); optional QuickJS sandbox for author JS validators (e.g. validate_level_up.js); 3D dice roller package.
Not doing (v1): rendered UI/VTT, 3D dice physics, hosted server, full rule content.

## How to run & test
`pnpm install` · `pnpm test` · `pnpm typecheck` · `pnpm lint` · `pnpm check:invariants` · `pnpm smoke` · `pnpm dev:server` (HTTP host for the ember session; needs `pnpm build`). `node examples/fireball/run.mjs` prints the demo log.

## Where things are
- packages/{grid,interactions,rules,spatial,spatial-core,orchestrator} — the packages
- packages/orchestrator/src/pipeline.ts — `createPipeline().castSpell` (rules → spatial/ids → entropy → dispatch), `seededEntropy`, `tokensFromState`; sessions.ts — `createSessionRegistry`
- examples/fireball — private pkg `@ttrpg-engine/example-fireball`: host.ts `createEmberHost` + `handleIntent` (wire format for CAST_SPELL: spell_id + at|targets + injected_entropy), demo.ts `runFireballDemo` (log), run.mjs, expected.log (golden; UPDATE_GOLDEN=1)
- packages/orchestrator/test: golden.test.ts + golden/fireball.json (full pipeline delta), volumetric.test.ts (contract 2, brute force)
- examples/ember — private workspace pkg `@ttrpg-engine/example-ember`: content (schemas, fireball, wizard, goblins), `createEmberRuleset`, `buildEmberSession` scene + `BLAST_POINT`
- docs/ARCHITECTURE_BRIEF.md — Ethan's original vision brief (read only if PRD seems to contradict it)
- docs/PRD.md — requirements, §6 delta protocol, §10 milestones
- docs/ARCHITECTURE.md — contracts; §6 fireball test contracts
- docs/DESIGN_SYSTEM.md — demo log output style (§4)
- docs/STATE.json, DECISIONS.json — older workflow's slice list + decisions (full definitions of done)
- server.js — HTTP host (imports examples/*/dist; GET /state, POST /intent?session=); migrations/ — compendium SQL; scripts/ — invariants, smoke

## Design
No UI. Demo output follows DESIGN_SYSTEM.md §4 (log style).

## Decisions
- pnpm + Turborepo monorepo; fireball end-to-end as first slice
- Reducers emit JSON Patch ops directly (no diffing)
- Validation = declarative logic trees + pluggable Validator (QuickJS later, optional)
- Example system packs live in examples/* as workspace packages: content is data, game logic is a `Ruleset`; orchestrator stays system-agnostic (reads only spell area/damage.dice/save.ability)
- Spatial: TS reference first, Rust wasm behind the same API, TS kept as oracle
- Dice: roll plan + per-die results, rpg-dice-roller-compatible subset, zero deps
Full rationale: docs/DECISIONS.json.

## Tech
- TypeScript 5 strict, Vitest, ESLint, Node ≥20; Rust + wasm-pack for spatial-core
- Core packages have zero runtime deps (checked by invariants script)

## Known issues & gotchas
- spatial has raycast/LoS but no light-boundary query, though brief + PRD §5.4 require "LoS and lighting boundaries". Slice was marked done without it.
- PRD deliberately refines the brief: delta paths are /entities/<id>/components/<key>, entropy carries per-die faces, the delta adds a /history/rolls entry. PRD wins.
- Determinism is a hard rule: same Intents + injected entropy → byte-identical state/deltas. No Math.random/Date in core.
- Only orchestrator (and examples/*) may depend on other packages; no cycles. Cross-package imports resolve to dist, so turbo builds deps before test/typecheck; when running vitest directly in one package, build its deps first.
- rules' JSON Schema subset rejects unknown keywords (e.g. `minimum`/`maximum`): put numeric ranges in logic-tree rules instead.
- Entity positions are components: `position {x,y,z}` (feet, z up) + `radius`; the pipeline turns them into spatial tokens.
- server.js and smoke import built dist by relative path (root can't resolve workspace packages); rebuild after changing src.
- Ember ruleset still gives dead creatures their turn (demo log shows goblin-1's turn). Fine for the demo; real systems decide skip rules.
- Ember fireball: DC from caster `spell_save_dc`, slot key `spell_slots_<level>`, survivors get a 1-round "scorched" effect (purged when round 2 begins). Ruleset rejects a damage `roll` that differs from the spell's dice.
