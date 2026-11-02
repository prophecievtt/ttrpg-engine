/**
 * IndexedDB compendium backend for browsers (offline play).
 *
 * `openIndexedDbBackend` is async because IndexedDB is; once open, the backend
 * serves reads from memory and writes in the background, batching every change
 * made in the same tick into one transaction. Await `flush()` before relying on
 * a write being on disk (e.g. before closing a tab you control).
 */
import { CompendiumError, type CompendiumEntry } from "../store.js";
import { createMemoryBackend } from "./memory.js";
import { DEFAULT_SYSTEM, checkSystem, loadEntry, type PersistentBackend } from "./persistent.js";

// Minimal structural IndexedDB types, so the package needs no DOM lib.
interface IdbRequest<T = unknown> {
  readonly result: T;
  readonly error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}
interface IdbOpenRequest extends IdbRequest<IdbDatabase> {
  onupgradeneeded: (() => void) | null;
  onblocked: (() => void) | null;
}
interface IdbObjectStore {
  put(value: unknown): unknown;
  delete(key: unknown): unknown;
  createIndex(name: string, keyPath: string): unknown;
  index(name: string): { getAll(query?: unknown): IdbRequest<unknown[]> };
}
interface IdbTransaction {
  readonly error: unknown;
  objectStore(name: string): IdbObjectStore;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  abort(): void;
}
interface IdbDatabase {
  readonly objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, options: { keyPath: string[] }): IdbObjectStore;
  transaction(names: string, mode: "readonly" | "readwrite"): IdbTransaction;
  close(): void;
}
export interface IdbFactoryLike {
  open(name: string, version: number): IdbOpenRequest;
}

export interface IndexedDbBackendOptions {
  /** Database name. Defaults to "ttrpg-engine-compendium". */
  readonly name?: string;
  /** Defaults to "default". */
  readonly system?: string;
  /** Defaults to `globalThis.indexedDB`. */
  readonly indexedDB?: IdbFactoryLike;
}

export interface IndexedDbBackend extends PersistentBackend {
  /** Flush pending writes, then close the database. */
  close(): Promise<void>;
}

interface StoredRecord {
  system: string;
  type: string;
  id: string;
  /** Insertion order; kept when an entry is replaced, like the memory backend. */
  seq: number;
  document: unknown;
}

const STORE = "compendium_items";
const DB_VERSION = 1;

type Op = { kind: "put"; record: StoredRecord } | { kind: "delete"; key: [string, string, string] };

function request<T>(req: IdbRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IdbTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new CompendiumError("IndexedDB transaction aborted"));
  });
}

function openDb(factory: IdbFactoryLike, name: string): Promise<IdbDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: ["system", "type", "id"] }).createIndex("system", "system");
      }
    };
    req.onblocked = () => reject(new CompendiumError(`IndexedDB "${name}" is blocked by another open connection`));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function openIndexedDbBackend(options: IndexedDbBackendOptions = {}): Promise<IndexedDbBackend> {
  const system = checkSystem(options.system ?? DEFAULT_SYSTEM);
  const factory = options.indexedDB ?? (globalThis as { indexedDB?: IdbFactoryLike }).indexedDB;
  if (!factory) throw new CompendiumError("IndexedDB is not available here; pass `indexedDB` or use another backend");
  const db = await openDb(factory, options.name ?? "ttrpg-engine-compendium");

  const records = (await request(
    db.transaction(STORE, "readonly").objectStore(STORE).index("system").getAll(system),
  )) as StoredRecord[];
  records.sort((a, b) => a.seq - b.seq);
  const cache = createMemoryBackend();
  const seqs = new Map<string, number>();
  const keyOf = (type: string, id: string) => `${type}\u0000${id}`;
  for (const r of records) {
    cache.put(loadEntry(r.document, r.type, r.id));
    seqs.set(keyOf(r.type, r.id), r.seq);
  }
  let nextSeq = records.length > 0 ? records[records.length - 1]!.seq + 1 : 0;

  let queue: Op[] = [];
  let inFlight: Promise<void> = Promise.resolve();
  let failure: unknown = undefined;
  let closed = false;

  const commit = () => {
    const ops = queue;
    queue = [];
    if (ops.length === 0) return;
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const finished = done(tx);
    try {
      for (const op of ops) {
        if (op.kind === "put") store.put(op.record);
        else store.delete(op.key);
      }
    } catch (err) {
      // e.g. a value IndexedDB can't clone: drop the whole batch, report via flush().
      failure ??= err;
      tx.abort();
    }
    inFlight = Promise.all([inFlight, finished]).then(
      () => undefined,
      (err: unknown) => {
        failure ??= err;
      },
    );
  };
  const ensureOpen = () => {
    if (closed) throw new CompendiumError("IndexedDB backend is closed");
  };
  const enqueue = (op: Op) => {
    if (queue.length === 0) queueMicrotask(commit);
    queue.push(op);
  };
  const put = (entry: CompendiumEntry) => {
    ensureOpen();
    const k = keyOf(entry.type, entry.id);
    let seq = seqs.get(k);
    if (seq === undefined) seqs.set(k, (seq = nextSeq++));
    enqueue({ kind: "put", record: { system, type: entry.type, id: entry.id, seq, document: entry } });
    cache.put(entry);
  };
  const flush = async () => {
    commit();
    await inFlight;
    if (failure !== undefined) {
      const err = failure;
      failure = undefined;
      throw err;
    }
  };

  return {
    id: "indexeddb",
    system,
    put,
    putAll: (entries) => entries.forEach(put),
    get: (type, id) => cache.get(type, id),
    delete(type, id) {
      ensureOpen();
      const existed = cache.delete(type, id);
      if (existed) {
        seqs.delete(keyOf(type, id));
        enqueue({ kind: "delete", key: [system, type, id] });
      }
      return existed;
    },
    list: (type) => cache.list(type),
    types: () => cache.types(),
    flush,
    async close() {
      try {
        await flush();
      } finally {
        closed = true;
        db.close();
      }
    },
  };
}
