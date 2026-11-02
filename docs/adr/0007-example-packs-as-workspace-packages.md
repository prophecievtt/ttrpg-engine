# 7. Game systems live in example packs, not the engine

Status: accepted (2026-11-01)

## Context
The engine must stay system-agnostic, but needs a real system to prove itself.

## Decision
Example systems live in `examples/*` as private workspace packages: content is data (compendium entries, schemas), game logic is a `Ruleset`. The orchestrator reads only `area`, `damage.dice` and `save.ability` from a spell.

## Consequences
- Core packages contain no 5e (or any) rules; the Ember pack shows how a system plugs in.
- Examples are never published; `orchestrator` uses Ember only as a dev dependency for tests.
