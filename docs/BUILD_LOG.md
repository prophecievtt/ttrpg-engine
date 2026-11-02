# Build log

- 2026-11-01 — Switched to guided-build notes. Slices 1–5 (scaffold, grid, interactions, spatial TS reference, rules) were built under the earlier STATE.json workflow; see git history and docs/STATE.json for detail.
- 2026-11-01 — Added Ethan's design brief as docs/ARCHITECTURE_BRIEF.md; checked it against PRD. Gaps: spatial light-boundary queries not built; SQLite backend not planned (added to Later).

- 2026-11-01 — Fireball slice session 1: examples/ember pack (content, ruleset, scene) + orchestrator pipeline (castSpell, seeded entropy, session registry); 25 new tests. Ember schemas dropped minimum/maximum (unsupported by the schema subset).
- 2026-11-01 — Fireball slice session 2: examples/fireball (host wiring, wire-format handleIntent, log demo + expected.log), orchestrator golden + contract 2 (1,000 random tokens vs brute force, 3 seeds), server.js wired to the registry (GET /state, 1 MB body cap), smoke runs the demo, CI casts a fireball, README quickstart fixed to the real API. Fireball slice done.

- 2026-11-01: spatial lighting — `illumination` (exact 3D light level, ambient, per-source) and `lightBoundary` (2D lit-region polygon) added to SpatialBackend + TS reference + vectors; zero-radius lights count as off.
- 2026-11-01: hardening — READMEs for interactions + orchestrator (examples executed by check:pack; caught a wrong `4d6kh3+2` example), npm metadata (author/keywords/engines), docs/adr 0001–0008 from DECISIONS.json, `pnpm check:pack` in CI (tarball contents, workspace: rewrite, version drift, fresh-project ESM/CJS/types), docs/RELEASE.md, CHANGELOG.md, stale wasm wording fixed in root + spatial README.
