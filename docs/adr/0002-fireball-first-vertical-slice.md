# 2. Fireball end-to-end as the first slice

Status: accepted (2026-11-01)

## Context
Building each package in isolation risks contracts that don't fit together. Options: fireball end-to-end, skeletons of all four packages, depth-first interactions + rules.

## Decision
Build towards a single fireball cast that crosses every package: rules lookup → spatial targeting → injected dice → interactions dispatch → JSON Patch delta.

## Consequences
- The architecture was proven early; `examples/fireball` and the golden delta (`packages/orchestrator/test/golden/fireball.json`) pin the whole pipeline.
- Packages were shaped by one real use case first; later systems may push on the `Ruleset` and pipeline seams.
