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
- Memory use equals the compendium size. Measured (SQLite, Node 26, Mac,
  ~2.4 KB stat-block-sized entries): 5k entries open in 40 ms / 12 MB heap /
  0.6 ms query; 30k (≈ all of PF2e) 0.3 s / 71 MB / 2.8 ms; 100k 1.0 s /
  237 MB / 9.5 ms. Fine for rulebook-scale content; only the opened system loads.
- Revisit trigger: switch to lazy loading (fetch on demand, query push-down
  into SQL/indexes) if the VTT needs >~30k entries in one system, or opening
  feels slow on a phone. SQLite can go lazy behind the same sync interface
  (~1 session); IndexedDB would need an async compendium API.
- The SQLite `searchable` column duplicates each entry's text, roughly doubling
  file size. Harmless now; drop or slim it if file size matters.
- Schemas and validator rules are code: apps re-register them at startup; the
  `schemas` table in 0001 stays unused for now.
- Loaded entries are trusted (they were validated when registered); corrupt
  rows fail loudly on open.
- IndexedDB writes can fail after `register` returned; apps that care await
  `flush()`.
