import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  COMPENDIUM_MIGRATIONS,
  CompendiumError,
  createCompendium,
  createMemoryBackend,
  migrateSqlite,
  openIndexedDbBackend,
  openSqliteBackend,
  type CompendiumBackend,
  type IdbFactoryLike,
  type SqliteDatabase,
  type SqliteStatement,
} from "../src/index.js";

const fireball = { type: "spell", id: "fireball", name: "Fireball", level: 3, tags: ["Fire", "evocation"] };
const shield = { type: "spell", id: "shield", name: "Shield", level: 1, tags: ["abjuration"] };
const goblin = { type: "npc", id: "goblin", name: "Goblin", hp: 7 };

function sqliteDb(): DatabaseSync & SqliteDatabase {
  return new DatabaseSync(":memory:") as DatabaseSync & SqliteDatabase;
}
const idb = () => new IDBFactory() as unknown as IdbFactoryLike;

// Every backend must behave exactly like the memory backend.
const makers: [string, () => Promise<CompendiumBackend>][] = [
  ["memory", async () => createMemoryBackend()],
  ["sqlite", async () => openSqliteBackend(sqliteDb())],
  ["indexeddb", () => openIndexedDbBackend({ indexedDB: idb() })],
];

describe.each(makers)("%s backend contract", (_name, make) => {
  it("starts empty", async () => {
    const b = await make();
    expect(b.types()).toEqual([]);
    expect(b.list("spell")).toEqual([]);
    expect(b.get("spell", "fireball")).toBeUndefined();
    expect(b.delete("spell", "fireball")).toBe(false);
  });

  it("stores, lists in insertion order, keeps position on replace, deletes", async () => {
    const c = createCompendium({ backend: await make() });
    c.register([fireball, goblin, shield]);
    c.register({ ...fireball, level: 4 });
    expect(c.query("spell").map((e) => [e.id, e.level])).toEqual([["fireball", 4], ["shield", 1]]);
    expect(c.types()).toEqual(["npc", "spell"]);
    expect(c.query("spell", { where: { level: { gte: 2 } } }).map((e) => e.id)).toEqual(["fireball"]);
    expect(c.delete("spell", "fireball")).toBe(true);
    expect(c.get("spell", "fireball")).toBeUndefined();
    expect(Object.isFrozen(c.require("spell", "shield"))).toBe(true);
  });
});

describe("sqlite backend", () => {
  it("embeds migrations identical to migrations/*.sql", () => {
    expect(COMPENDIUM_MIGRATIONS.map((m) => m.version)).toEqual([1]);
    const file = readFileSync(new URL("../../../migrations/0001_compendium.sql", import.meta.url), "utf8");
    expect(COMPENDIUM_MIGRATIONS[0]!.sql).toBe(file);
  });

  it("migrates once and refuses a database from a newer version", () => {
    const db = sqliteDb();
    expect(migrateSqlite(db)).toEqual([1]);
    expect(migrateSqlite(db)).toEqual([]);
    db.exec("INSERT INTO schema_migrations (version, name) VALUES (99, 'future')");
    expect(() => openSqliteBackend(db)).toThrow(/migration 99/);
  });

  it("persists across reopen, in order, with systems kept apart", () => {
    const db = sqliteDb();
    createCompendium({ backend: openSqliteBackend(db, { system: "ember" }) }).register([shield, fireball, goblin]);
    createCompendium({ backend: openSqliteBackend(db, { system: "other" }) }).register(goblin);
    openSqliteBackend(db, { system: "ember" }).delete("npc", "goblin");

    const again = createCompendium({ backend: openSqliteBackend(db, { system: "ember" }) });
    expect(again.query("spell").map((e) => e.id)).toEqual(["shield", "fireball"]);
    expect(again.get("spell", "fireball")).toEqual(fireball);
    expect(Object.isFrozen(again.get("spell", "fireball"))).toBe(true);
    expect(again.types()).toEqual(["spell"]);
    expect(openSqliteBackend(db, { system: "other" }).list("npc")).toEqual([goblin]);
  });

  it("fills the searchable column with lower-cased text", () => {
    const db = sqliteDb();
    openSqliteBackend(db).put(fireball);
    const rows = db.prepare("SELECT searchable FROM compendium_items WHERE searchable LIKE ?").all("%fire%");
    expect(rows).toEqual([{ searchable: "spell fireball fireball fire evocation" }]);
  });

  it("writes a batch in one transaction: a failure stores nothing", () => {
    const db = sqliteDb();
    let calls = 0;
    const flaky: SqliteDatabase = {
      exec: (sql) => db.exec(sql),
      prepare(sql) {
        const st = db.prepare(sql);
        if (!sql.startsWith("INSERT INTO compendium_items")) return st as unknown as SqliteStatement;
        return {
          run: (...p: unknown[]) => {
            if (++calls === 2) throw new Error("disk full");
            return st.run(...(p as string[]));
          },
          all: (...p: unknown[]) => st.all(...(p as string[])),
        };
      },
    };
    const c = createCompendium({ backend: openSqliteBackend(flaky) });
    expect(() => c.register([fireball, shield])).toThrow("disk full");
    expect(c.query("spell")).toEqual([]);
    expect(openSqliteBackend(db).list("spell")).toEqual([]);
  });

  it("reports a corrupt stored document", () => {
    const db = sqliteDb();
    migrateSqlite(db);
    db.prepare("INSERT INTO compendium_items VALUES ('default', 'spell', 'bad', '{oops', '')").run();
    expect(() => openSqliteBackend(db)).toThrow(CompendiumError);
    db.prepare("UPDATE compendium_items SET document = ? WHERE id = 'bad'").run(JSON.stringify({ type: "spell", id: "other" }));
    expect(() => openSqliteBackend(db)).toThrow(/not a valid compendium entry/);
  });

  it("rejects an empty system name", () => {
    expect(() => openSqliteBackend(sqliteDb(), { system: "" })).toThrow(CompendiumError);
  });
});

describe("indexeddb backend", () => {
  it("persists across reopen, in order, with systems kept apart", async () => {
    const factory = idb();
    const a = await openIndexedDbBackend({ indexedDB: factory, system: "ember" });
    createCompendium({ backend: a }).register([shield, fireball, goblin]);
    a.put({ ...shield, level: 2 });
    a.delete("npc", "goblin");
    await a.close();
    const other = await openIndexedDbBackend({ indexedDB: factory, system: "other" });
    other.put(goblin);
    await other.close();

    const b = await openIndexedDbBackend({ indexedDB: factory, system: "ember" });
    expect(b.list("spell").map((e) => [e.id, e.level])).toEqual([["shield", 2], ["fireball", 3]]);
    expect(b.types()).toEqual(["spell"]);
    expect(Object.isFrozen(b.get("spell", "fireball"))).toBe(true);
    b.put(goblin);
    await b.flush();
    await b.close();
    const c = await openIndexedDbBackend({ indexedDB: factory, system: "ember" });
    expect(c.list("npc")).toEqual([goblin]);
    expect(c.list("spell").map((e) => e.id)).toEqual(["shield", "fireball"]);
    await c.close();
  });

  it("refuses writes after close", async () => {
    const b = await openIndexedDbBackend({ indexedDB: idb() });
    await b.close();
    expect(() => b.put(fireball)).toThrow(/closed/);
    expect(() => b.delete("spell", "fireball")).toThrow(/closed/);
  });

  it("explains when IndexedDB is missing", async () => {
    await expect(openIndexedDbBackend()).rejects.toThrow(/IndexedDB is not available/);
  });

  it("surfaces a failed write through flush", async () => {
    const b = await openIndexedDbBackend({ indexedDB: idb() });
    // A function can't be structured-cloned, so IndexedDB rejects the write.
    b.put({ type: "spell", id: "broken", run: () => 1 } as never);
    await expect(b.flush()).rejects.toBeDefined();
    await expect(b.flush()).resolves.toBeUndefined();
  });
});
