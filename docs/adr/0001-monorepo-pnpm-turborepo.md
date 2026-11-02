# 1. pnpm + Turborepo monorepo

Status: accepted (2026-11-01)

## Context
The engine is several small packages that consumers install separately, but they are developed and tested together. Options: pnpm + Turborepo, Nx, plain npm workspaces.

## Decision
pnpm workspaces with Turborepo for task orchestration.

## Consequences
- Fast installs and per-package task caching; `turbo` builds dependencies before test/typecheck.
- Cross-package imports resolve to `dist`, so running vitest in one package directly needs its deps built first.
- Publish with `pnpm publish` (it rewrites `workspace:*` to real versions); see docs/RELEASE.md.
