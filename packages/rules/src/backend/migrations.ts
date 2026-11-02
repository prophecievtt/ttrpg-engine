/**
 * SQLite migrations for the compendium, embedded so the published package needs
 * no file access. Source of truth: migrations/*.sql at the repo root (a test
 * keeps them identical). Each migration inserts its own schema_migrations row.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const COMPENDIUM_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "compendium",
    sql: "-- 0001_compendium.sql\n-- SQLite schema for the `rules` compendium backend (see docs/ARCHITECTURE.md §5.3\n-- and docs/PRD.md §5.1: the engine \"wraps a fast querying engine (IndexedDB/SQLite)\").\n-- Applied by `openSqliteBackend` (packages/rules/src/backend/migrations.ts embeds this file;\n-- a test keeps the two identical). Each migration runs in one transaction and records itself\n-- in schema_migrations. Journal mode (e.g. WAL) is the app's choice, set on its connection.\n\n-- Baked-in schema/bookkeeping so client versioning is queryable.\nCREATE TABLE IF NOT EXISTS schema_migrations (\n    version      INTEGER PRIMARY KEY,\n    name         TEXT NOT NULL,\n    applied_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\n);\n\n-- Static compendium content, keyed by system + type + id.\nCREATE TABLE IF NOT EXISTS compendium_items (\n    system       TEXT NOT NULL,                 -- e.g. \"ember\"\n    type         TEXT NOT NULL,                 -- \"spell\" | \"class\" | \"npc\" | \"item\" | ...\n    id           TEXT NOT NULL,\n    document     TEXT NOT NULL,                 -- canonical JSON document\n    searchable   TEXT NOT NULL,                 -- flattened text for LIKE/FTS queries\n    PRIMARY KEY (system, type, id)\n);\n\nCREATE INDEX IF NOT EXISTS idx_compendium_type\n    ON compendium_items (system, type);\n\n-- JSON Schemas exposed to UI layers for dynamic homebrew form generation.\nCREATE TABLE IF NOT EXISTS schemas (\n    system       TEXT NOT NULL,\n    schema_id    TEXT NOT NULL,                 -- e.g. \"spell\"\n    document     TEXT NOT NULL,                 -- JSON Schema draft\n    PRIMARY KEY (system, schema_id)\n);\n\nINSERT INTO schema_migrations (version, name) VALUES (1, 'compendium');",
  },
];
