# Changelog

All packages share a version for now. Format: [Keep a Changelog](https://keepachangelog.com), [Semver](https://semver.org).

## Unreleased

- interactions: **behaviour change** — no die above d100. `parseNotation` now rejects faces over 100 (0.2.0 accepted up to d9999) with `bad_notation` "dice faces out of range"; `1d10000` and up, which 0.2.0 reported as "cannot parse", get the same out-of-range message. `dicePool` now validates each group like `parseNotation` (whole-number count 1–10000, faces 1–100) and throws `RejectionError("bad_notation")`; 0.2.0 accepted any numbers there. Content or tables using larger or fractional dice must change before upgrading (ADR 12).

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
