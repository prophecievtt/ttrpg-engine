# Contributing to ttrpg-engine

Thanks for contributing! This is a headless, system-agnostic TTRPG engine split into four decoupled packages plus an orchestrator. `docs/PRD.md` and `docs/ARCHITECTURE.md` are the source of truth — read them first.

## Setup

Requirements: Node ≥ 20, pnpm ≥ 12. Rust is only needed for `packages/spatial-core` (and until the wasm slice you never need it to contribute to TypeScript packages).

```bash
pnpm install
pnpm dev        # watch mode for all packages
```

## Commands

| Command | What it does |
|---|---|
| `pnpm lint` | ESLint (flat config) across all packages |
| `pnpm typecheck` | `tsc --noEmit` per package (strict mode) |
| `pnpm build` | Turbo build → `dist/` (ESM + CJS + types) per package |
| `pnpm test` | Vitest across the workspace |
| `cargo test --workspace` | Rust unit tests (`packages/spatial-core`) |
| `cargo fmt --all --check` / `cargo clippy --workspace --all-targets -- -D warnings` | Rust hygiene |

Turbo caches task results; add `--force` to bypass: `pnpm build --force`.

## Architecture invariants (enforced by CI/review)

- **Dependency direction** (see ARCHITECTURE §2.1): `grid` → nothing; `interactions`/`rules`/`spatial` → no runtime deps; `orchestrator` is the only package that imports all four. Adding a runtime dependency to a core package requires an ADR discussion.
- **Determinism**: no `Math.random()`, no `Date.now()`, no object-key iteration used for logic in core packages. Entropy always enters via the injection boundary.
- **Deltas**: reducers append RFC 6902 ops directly; never build deltas by diffing state after the fact (diffing exists only as a test oracle).
- **Portability**: no Node-specific APIs in core packages. Should work in browsers, workers, Deno/Bun, and bots.

## Adding code

1. Work in a slice-sized change with tests (`vitest` colocated in `test/` or `src/*.test.ts`).
2. Keep public APIs typed and documented (they feed TypeDoc later).
3. Golden files: if a test relies on a snapshot, keep it small and reviewable.
4. Update the relevant doc in `docs/` when a contract changes.

## Style

- TypeScript strict; `verbatimModuleSyntax` — use `import type` for type-only imports.
- Prefer plain objects and pure functions in core packages.
- Rust: standard `rustfmt`/`clippy` defaults; `f64` everywhere in the spatial core (IEEE-754 bit-identical contract with the TS reference).

## Commit & PR

- Conventional-commit-style prefixes are welcome (`feat:`, `fix:`, `docs:`).
- PRs must pass CI: lint, typecheck, build, tests, and Rust checks.
- The fireball vertical slice golden tests are the project's regression tripwire — never "fix" them without updating `docs/PRD.md`.

## Questions

Open a discussion before large architectural proposals. When you do, note which package(s) and which invariant are affected.