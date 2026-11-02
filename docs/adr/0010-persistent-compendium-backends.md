# 10. Persistent compendium backends: memory cache + write-through

Status: accepted (2026-11-01)

## Context
PRD §5.1 wants the compendium backed by IndexedDB (browser, offline) and SQLite
(desktop, bot, server). The compendium API is synchronous, IndexedDB is async,
and the core packages must keep zero runtime dependencies.

## Decision
- Both backends (`openSqliteBackend`, `openIndexedDbBackend`) load one system's
  entries into memory when opened and write changes through. Reads and queries
  run on the in-memory copy, so the `CompendiumStore` API stays sync and query
  results are identical to the memory backend (one contract test runs all three).
- SQLite: the caller passes its own connection (`node:sqlite` or
  `better-sqlite3`; only `exec` and `prepare().run/.all` are used). Opening
  runs pending migrations from `migrations/*.sql`, embedded in the package.
  Writes are synchronous; a `register` batch is one transaction.
- IndexedDB: changes made in one tick are batched into one transaction in the
  background; `flush()` awaits them and reports the first failure. Minimal
  structural IDB types, so no DOM lib.
- A `system` key lets one database hold several game systems.
- Backends gain an optional `putAll` so a batch is atomic in storage too.

## Consequences
- Memory use equals the compendium size; fine for rulebook-scale content (tens
  of thousands of entries). Very large libraries would need query push-down
  into SQL/indexes later, behind the same interface.
- Schemas and validator rules are code: apps re-register them at startup; the
  `schemas` table in 0001 stays unused for now.
- Loaded entries are trusted (they were validated when registered); corrupt
  rows fail loudly on open.
- IndexedDB writes can fail after `register` returned; apps that care await
  `flush()`.
