/**
 * Shared pieces of the persistent backends (SQLite, IndexedDB). Both keep a
 * full in-memory copy of one system's entries, loaded when opened, so the
 * compendium API stays synchronous and queries behave exactly like the memory
 * backend; writes go through to storage.
 */
import { freezeJson, isPlainObject } from "../json.js";
import { CompendiumError, type CompendiumBackend, type CompendiumEntry } from "../store.js";

export interface PersistentBackend extends CompendiumBackend {
  /** The system key every entry is stored under (lets one database hold several systems). */
  readonly system: string;
  /** Resolves once every write so far is stored; rejects with the first failed write. */
  flush(): Promise<void>;
}

export const DEFAULT_SYSTEM = "default";

export function checkSystem(system: string): string {
  if (typeof system !== "string" || system === "") throw new CompendiumError("`system` must be a non-empty string");
  return system;
}

/** Freeze a stored document, checking it is an entry whose type/id match its key. */
export function loadEntry(doc: unknown, type: string, id: string): CompendiumEntry {
  if (!isPlainObject(doc) || doc.type !== type || doc.id !== id) {
    throw new CompendiumError(`stored ${type} "${id}" is not a valid compendium entry`);
  }
  return freezeJson(doc as CompendiumEntry);
}

/** Lower-cased text of every string in the entry, for the SQLite `searchable` column. */
export function searchableText(entry: unknown): string {
  const parts: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (isPlainObject(v)) for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(entry);
  return parts.join(" ").toLowerCase();
}
