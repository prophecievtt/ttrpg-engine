# 12. Dice: no die above d100

Status: accepted (2026-11-04)

## Context
`parseNotation` allowed faces up to 10,000, but its pattern only read four
digits, so `1d10000` failed as "cannot parse" while `1d9999` passed.
`dicePool` (explicit per-die faces) checked nothing. A weekly code-health scan
found the mismatch. No tests, examples or docs used a die above d100, and
tabletop systems top out at d100 (percentile).

## Decision
- Ethan (2026-11-04): the engine supports no die above d100. Faces must be a
  whole number from 1 to 100.
- `parseNotation` reads any digit run for faces, so oversized dice get the
  clear "dice faces out of range" rejection.
- `dicePool` runs the same shared check per group (whole-number count
  1–10000, faces 1–100), throwing `RejectionError("bad_notation")`.

## Consequences
- Behaviour change after 0.2.0: notation or roll tables with dice above d100,
  or fractional/zero faces in `dicePool`, are now rejected. Noted in the
  CHANGELOG.
- Bigger random ranges (e.g. 1–1000 tables) must be built from several dice
  or rolled on the host and injected as a total.
