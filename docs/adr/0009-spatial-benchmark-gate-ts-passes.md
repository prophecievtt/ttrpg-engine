# 9. Spatial benchmark gate: TS passes, wasm stays deferred

Status: accepted (2026-11-01)

## Context
ADR 6 said build the Rust→wasm spatial core only if the TS reference misses a
realistic budget. Budget: a full lighting recompute (`lightBoundary` for every
light) for 50 lights and 500 walls in ≤16 ms (one 60 fps frame).

## Decision
Scenes live in `packages/spatial/bench/scenes.ts` (dungeon: 10×10 rooms of
30 ft with doorways, 440 walls + 60 pillars, 50 torches; worst case: 500 walls
packed in a 100-ft hall, every light sees all of them). After tightening the
TS hot loops (flat 2D ray loop in `lightBoundary`, cached rays for shared
corners, allocation-free `los`) with byte-identical output:

| Scene (Ethan's Mac, Node 26) | before | after |
|---|---|---|
| dungeon: full recompute | 17.8 ms | 7.3 ms |
| dungeon: illumination, 200 tokens | 5.2 ms | 4.7 ms |
| worst case: full recompute | 630 ms | 215 ms |

The realistic scene passes with room to spare, so no wasm core.

## Consequences
- spatial-core (Rust) stays a deferred placeholder.
- The worst case is O(walls²) per light. wasm would give maybe 2–3×, not the
  ~15× needed; if a real map ever gets there, the fix is algorithmic (angular
  sweep or a spatial index), still in TS.
- `test/scenes.test.ts` pins the bench scenes' results by hash, so future
  speedups must stay byte-identical.
