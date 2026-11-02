# 5. Dice: injected entropy with per-die results

Status: accepted (2026-11-01)

## Context
The engine must be deterministic and multiplayer-safe, yet frontends roll dice very differently (3D physics, server RNG, chat bots). Options: roll plan + per-die emission in core, totals-only injection, rpg-dice-roller at the boundary now.

## Decision
The engine never generates randomness. Intents carry per-die faces and/or a total; core parses notation into a `RollPlan`, validates the injected faces and emits the full per-die `RollResult` into the delta. Notation is a strict subset of rpg-dice-roller syntax.

## Consequences
- Numeric UIs and animated dice show identical faces on every client.
- Zero dependencies in the deterministic core; a future bridge to rpg-dice-roller needs no content changes.
- Exploding dice, rerolls and fudge dice are out of scope for core.
