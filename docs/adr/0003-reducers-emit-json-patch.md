# 3. Reducers emit JSON Patch ops directly

Status: accepted (2026-11-01)

## Context
Every state change must reach clients as a small RFC 6902 delta. Options: reducers emit ops as they change state, or diff old vs new state afterwards.

## Decision
Reducers write through a transaction (`Tx`) that applies and records each op. `diffState` exists for tests only.

## Consequences
- Zero diffing cost, exact op order, trivially deterministic.
- Reducer authors must go through `ctx`/`tx` helpers; mutating state any other way would not reach clients (tests replay deltas to catch this).
- Delta paths follow PRD §6: `/entities/<id>/components/<key>`, rolls appended at `/history/rolls/-`.
