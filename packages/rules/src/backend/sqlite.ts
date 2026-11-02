/**
 * SQLite compendium backend for desktop apps, bots and servers.
 *
 * Bring your own connection: anything with `exec` and `prepare(sql).run/.all`
 * works, e.g. Node's built-in `node:sqlite` (`new DatabaseSync(file)`) or
 * `better-sqlite3`. The package itself has no SQLite dependency. Opening runs
 * any pending migrations (migrations/*.sql) and loads the system's entries.
 */
import { CompendiumError, type CompendiumEntry } from "../store.js";
import { createMemoryBackend } from "./memory.js";
import { COMPENDIUM_MIGRATIONS } from "./migrations.js";
import { DEFAULT_SYSTEM, checkSystem, loadEntry, searchableText, type PersistentBackend } from "./persistent.js";

export interface SqliteStatement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqliteDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): SqliteStatement;
}

export interface SqliteBackendOptions {
  /** Defaults to "default". */
  readonly system?: string;
}

/** Apply pending compendium migrations; returns the versions it applied. */
export function migrateSqlite(db: SqliteDatabase): number[] {
  const hasTable =
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").all().length > 0;
  const applied = new Set(
    hasTable
      ? db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number((r as { version: unknown }).version))
      : [],
  );
  const known = COMPENDIUM_MIGRATIONS[COMPENDIUM_MIGRATIONS.length - 1]!.version;
  for (const v of applied) {
    if (v > known) {
      throw new CompendiumError(`database is at migration ${v}, newer than this package knows (${known}); upgrade @ttrpg-engine/rules`);
    }
  }
  const ran: number[] = [];
  for (const m of COMPENDIUM_MIGRATIONS) {
    if (applied.has(m.version)) continue;
    transaction(db, () => db.exec(m.sql));
    ran.push(m.version);
  }
  return ran;
}

function transaction(db: SqliteDatabase, fn: () => void): void {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function openSqliteBackend(db: SqliteDatabase, options: SqliteBackendOptions = {}): PersistentBackend {
  const system = checkSystem(options.system ?? DEFAULT_SYSTEM);
  migrateSqlite(db);
  const cache = createMemoryBackend();
  for (const row of db
    .prepare("SELECT type, id, document FROM compendium_items WHERE system = ? ORDER BY rowid")
    .all(system) as { type: string; id: string; document: string }[]) {
    let doc: unknown;
    try {
      doc = JSON.parse(row.document);
    } catch {
      throw new CompendiumError(`stored ${row.type} "${row.id}" is not valid JSON`);
    }
    cache.put(loadEntry(doc, row.type, row.id));
  }

  // Upsert (not INSERT OR REPLACE) keeps the rowid, so re-registering keeps list order.
  const upsert = db.prepare(
    "INSERT INTO compendium_items (system, type, id, document, searchable) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT (system, type, id) DO UPDATE SET document = excluded.document, searchable = excluded.searchable",
  );
  const remove = db.prepare("DELETE FROM compendium_items WHERE system = ? AND type = ? AND id = ?");
  const write = (e: CompendiumEntry) => upsert.run(system, e.type, e.id, JSON.stringify(e), searchableText(e));

  return {
    id: "sqlite",
    system,
    put(entry) {
      write(entry);
      cache.put(entry);
    },
    putAll(entries) {
      transaction(db, () => entries.forEach(write));
      for (const e of entries) cache.put(e);
    },
    get: (type, id) => cache.get(type, id),
    delete(type, id) {
      remove.run(system, type, id);
      return cache.delete(type, id);
    },
    list: (type) => cache.list(type),
    types: () => cache.types(),
    flush: () => Promise.resolve(),
  };
}
