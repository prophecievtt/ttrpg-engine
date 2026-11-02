/** In-memory compendium backend (v1 default). Insertion-ordered per type. */
import type { CompendiumBackend, CompendiumEntry } from "../store.js";

export function createMemoryBackend(): CompendiumBackend {
  const byType = new Map<string, Map<string, CompendiumEntry>>();
  return {
    id: "memory",
    put(entry) {
      let m = byType.get(entry.type);
      if (!m) byType.set(entry.type, (m = new Map()));
      m.set(entry.id, entry);
    },
    get(type, id) {
      return byType.get(type)?.get(id);
    },
    delete(type, id) {
      return byType.get(type)?.delete(id) ?? false;
    },
    list(type) {
      return [...(byType.get(type)?.values() ?? [])];
    },
    types() {
      return [...byType.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    },
  };
}
