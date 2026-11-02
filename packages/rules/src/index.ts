/**
 * @ttrpg-engine/rules — static knowledge engine.
 *
 * Compendium store (register/get/query with typed filters), a JSON Schema
 * subset for content validation and homebrew form generation, and declarative
 * logic-tree rules behind a pluggable `Validator`. Zero runtime dependencies.
 *
 * @example
 * ```ts
 * import { createCompendium } from "@ttrpg-engine/rules";
 *
 * const compendium = createCompendium()
 *   .registerSchema({ $id: "spell", type: "object", required: ["type", "id", "level"],
 *     properties: { type: { type: "string" }, id: { type: "string" }, level: { type: "integer" } } })
 *   .register({ type: "spell", id: "fireball", level: 3 });
 *
 * compendium.query("spell", { where: { level: { gte: 3 } } }); // [fireball]
 * ```
 */
export const name = "@ttrpg-engine/rules" as const;
export const version = "0.2.0" as const;

export * from "./json.js";
export * from "./schema.js";
export * from "./logic-tree.js";
export * from "./validator.js";
export * from "./store.js";
export { createMemoryBackend } from "./backend/memory.js";
export { openSqliteBackend, migrateSqlite } from "./backend/sqlite.js";
export type { SqliteDatabase, SqliteStatement, SqliteBackendOptions } from "./backend/sqlite.js";
export { openIndexedDbBackend } from "./backend/indexeddb.js";
export type { IndexedDbBackend, IndexedDbBackendOptions, IdbFactoryLike } from "./backend/indexeddb.js";
export type { PersistentBackend } from "./backend/persistent.js";
export { COMPENDIUM_MIGRATIONS, type Migration } from "./backend/migrations.js";
