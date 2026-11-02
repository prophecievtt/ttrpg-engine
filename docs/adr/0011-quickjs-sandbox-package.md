# 11. Author JS validators: opt-in QuickJS package with step budgets

Status: accepted (2026-11-02)

## Context
ADR 4 kept validation to logic trees and left an escape hatch: a separate
package running author JavaScript behind the same `Validator` interface. It
must run untrusted code in browsers and Node, keep the engine deterministic,
and not add dependencies to the core packages.

## Decision
- New package `@ttrpg-engine/sandbox`, depending on `quickjs-emscripten`
  (sync release build). Core packages stay dependency-free; sandbox imports
  only types from rules (peer dependency) and wraps a caller-supplied base
  validator, running schema → rules → scripts.
- Scripts define a global `validate(entry)`; each run gets a fresh context,
  the entry as JSON, and only JSON comes back, sanitized into `Issue`s.
- No `Date`, `eval`, `Math.random`; QuickJS has no host APIs by default.
- CPU limit is a step budget (interrupt-handler calls), not wall-clock, so
  results are identical across machines. Memory 32 MiB, stack 128 KiB.
- If a host exception escapes QuickJS (host stack overflow), the runtime is
  abandoned, not freed (freeing aborts), and the validator refuses further use.

## Consequences
- ~1 MB extra install for apps that opt in; nothing for others.
- Fresh context per run costs well under a millisecond per entry (tested
  < 5 ms on CI as a bound).
- QuickJS stack checks don't see the host stack: caps above ~256 KiB let deep
  recursion overflow Node's stack first. The default stays at 128 KiB.
- `pnpm check:pack` now installs third-party deps from npm (needs network).
