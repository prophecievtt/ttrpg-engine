# 6. Spatial: TypeScript by default, Rust/wasm only if a benchmark demands it

Status: accepted (2026-11-01). Supersedes the original plan of making wasm the default.

## Context
The brief called for Rust→wasm geometry. The TypeScript reference backend is complete and fast for typical maps, while wasm adds a Rust toolchain for contributors, packaging complexity, a determinism-parity burden and JS↔wasm call overhead on small queries.

## Decision
`referenceBackend` (TS) is the default `SpatialBackend`. A wasm backend is built only if `packages/spatial/bench` shows TS missing its budget, as an optional add-on package behind the same interface, with TS as the test oracle.

## Consequences
- v0.1 ships TS only; `packages/spatial-core` is an unpublished Rust crate.
- Swapping in wasm later stays cheap because callers only see `SpatialBackend`.
