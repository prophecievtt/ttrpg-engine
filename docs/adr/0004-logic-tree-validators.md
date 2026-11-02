# 4. Declarative logic trees + a pluggable Validator

Status: accepted (2026-11-01)

## Context
Homebrew content needs validation rules written by authors, which means running untrusted logic in browsers, bots and servers. Options: logic trees + pluggable `Validator` interface, trees only, QuickJS as a core dependency.

## Decision
Rules are serializable logic trees evaluated by `@ttrpg-engine/rules`; the `Validator` interface lets a host plug in something stronger later.

## Consequences
- Safe by construction, deterministic, JSON-serializable, no platform friction.
- Some rules are awkward as trees; an optional QuickJS sandbox package is on the "later" list for author JS validators.
- The JSON Schema subset rejects unknown keywords; numeric ranges go in logic-tree rules.
