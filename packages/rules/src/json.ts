/** Small JSON helpers shared by the rules engine. Deterministic, prototype-safe. */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Validation / evaluation issue, addressed by an RFC 6901 JSON pointer into the document. */
export interface Issue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly Issue[];
}

export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function hasOwn(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

/** Own keys in a locale-independent sorted order (never rely on insertion order for logic). */
export function sortedKeys(o: object): string[] {
  return Object.keys(o).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function pointer(base: string, token: string | number): string {
  return `${base}/${String(token).replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

/** Structural JSON equality (key order irrelevant). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = sortedKeys(a);
    const kb = sortedKeys(b);
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deepEqual(a[k], b[k]));
  }
  return false;
}

/** Deep clone + freeze plain JSON. Throws on non-JSON values (functions, class instances, NaN). */
export function freezeJson<T>(value: T, path = ""): T {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`non-finite number at ${path || "/"}`);
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((v, i) => freezeJson(v, pointer(path, i)))) as T;
  }
  if (isPlainObject(value) && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(k)) throw new TypeError(`forbidden key "${k}" at ${path || "/"}`);
      out[k] = freezeJson(value[k], pointer(path, k));
    }
    return Object.freeze(out) as T;
  }
  throw new TypeError(`not a JSON value at ${path || "/"}`);
}

/**
 * Read a dotted path (`"damage.dice"`, `"levels.0.name"`) from JSON data.
 * Only own properties are visible; prototype keys are refused. Missing → undefined.
 */
export function getPath(data: unknown, path: string): unknown {
  if (path === "") return data;
  let cur: unknown = data;
  for (const seg of path.split(".")) {
    if (FORBIDDEN_KEYS.has(seg)) throw new TypeError(`forbidden path segment "${seg}"`);
    if (Array.isArray(cur)) {
      if (!/^(0|[1-9]\d*)$/.test(seg)) return undefined;
      cur = cur[Number(seg)];
    } else if (isPlainObject(cur)) {
      if (!hasOwn(cur, seg)) return undefined;
      cur = cur[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}
