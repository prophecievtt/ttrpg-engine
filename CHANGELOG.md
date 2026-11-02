# Changelog

All packages share a version for now. Format: [Keep a Changelog](https://keepachangelog.com), [Semver](https://semver.org).

## 0.2.0 (2026-11-02)

- sandbox (new, opt-in): `createJsValidator` runs author-written JS validators in QuickJS/wasm with no host access, a deterministic step budget, memory and stack caps; plugs into `CompendiumStore` as a `Validator` (ADR 11).
- rules: persistent compendium storage: `openSqliteBackend(db)` (bring `node:sqlite` or `better-sqlite3`; runs migrations) and `openIndexedDbBackend()` (browser, offline; `flush()`/`close()`), plus optional `CompendiumBackend.putAll` for atomic batches (ADR 10).
- spatial: `lightBoundary` ~2.4× and `los` faster (no output change); lighting benchmark scenes + gate (ADR 9).

## 0.1.0 (2026-11-01)

First public version.

- `@ttrpg-engine/grid`: square and hex distances, lines, neighbours, pixel conversion, AoE cells (cones, circles, cubes).
- `@ttrpg-engine/interactions`: deterministic session state machine; intents in, RFC 6902 deltas out; built-in turn/entity/effect intents; pluggable `Ruleset`; injected-entropy dice with per-die results.
- `@ttrpg-engine/rules`: compendium with typed queries, JSON Schema subset for homebrew forms, logic-tree validators.
- `@ttrpg-engine/spatial`: 3D shapes, raycasting, sliding movement, line of sight, target selection, point-light `illumination` and `lightBoundary`.
- `@ttrpg-engine/orchestrator`: `createPipeline().castSpell` (rules → targeting → entropy → dispatch), `seededEntropy`, `createSessionRegistry`.
