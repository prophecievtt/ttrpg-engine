-- 0001_compendium.sql
-- SQLite schema for the future `rules` compendium backend (see docs/ARCHITECTURE.md §5.3
-- and docs/PRD.md §5.1: the engine "wraps a fast querying engine (IndexedDB/SQLite)").
-- v1 ships the in-memory backend; this migration is the forward-compatible schema the
-- SQLite adapter will use once implemented. It is not referenced by any code yet.

PRAGMA journal_mode = WAL;

-- Baked-in schema/bookkeeping so client versioning is queryable.
CREATE TABLE IF NOT EXISTS schema_migrations (
    version      INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    applied_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Static compendium content, keyed by system + type + id.
CREATE TABLE IF NOT EXISTS compendium_items (
    system       TEXT NOT NULL,                 -- e.g. "ember"
    type         TEXT NOT NULL,                 -- "spell" | "class" | "npc" | "item" | ...
    id           TEXT NOT NULL,
    document     TEXT NOT NULL,                 -- canonical JSON document
    searchable   TEXT NOT NULL,                 -- flattened text for LIKE/FTS queries
    PRIMARY KEY (system, type, id)
);

CREATE INDEX IF NOT EXISTS idx_compendium_type
    ON compendium_items (system, type);

-- JSON Schemas exposed to UI layers for dynamic homebrew form generation.
CREATE TABLE IF NOT EXISTS schemas (
    system       TEXT NOT NULL,
    schema_id    TEXT NOT NULL,                 -- e.g. "spell"
    document     TEXT NOT NULL,                 -- JSON Schema draft
    PRIMARY KEY (system, schema_id)
);

INSERT INTO schema_migrations (version, name) VALUES (1, 'compendium');