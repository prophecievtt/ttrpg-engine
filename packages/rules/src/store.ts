/**
 * CompendiumStore: register static system content (spells, classes, NPCs,
 * items, …), look it up by (type, id), and query it with typed filters.
 *
 * - Entries are plain JSON with string `type` and `id`; they are deep-frozen on
 *   registration, so consumers can never mutate shared compendium data.
 * - If a schema with `$id === type` is registered, entries of that type are
 *   validated on registration (plus any rules registered for the type), and
 *   query filter paths are checked against the schema ("schemas type queries").
 * - Query results are deterministic: insertion order, then a stable sort.
 */
import { type Issue, freezeJson, getPath, isPlainObject, deepEqual, hasOwn } from "./json.js";
import { evaluate, type LogicTree } from "./logic-tree.js";
import { SchemaRegistry, type JsonSchema } from "./schema.js";
import { createLogicTreeValidator, checkRules, type ValidationRule, type Validator } from "./validator.js";
import { createMemoryBackend } from "./backend/memory.js";

export interface CompendiumEntry {
  readonly type: string;
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface CompendiumBackend {
  readonly id: string;
  put(entry: CompendiumEntry): void;
  get(type: string, id: string): CompendiumEntry | undefined;
  delete(type: string, id: string): boolean;
  /** Entries of a type in insertion order. */
  list(type: string): CompendiumEntry[];
  /** Known types, sorted. */
  types(): string[];
}

type Scalar = string | number | boolean | null;

/** A condition on one field. A bare scalar means equality. */
export type Condition =
  | Scalar
  | {
      readonly eq?: unknown;
      readonly ne?: unknown;
      readonly lt?: number | string;
      readonly lte?: number | string;
      readonly gt?: number | string;
      readonly gte?: number | string;
      /** Field value is one of these. */
      readonly in?: readonly unknown[];
      /** Field (array or string) contains this. */
      readonly contains?: unknown;
      readonly exists?: boolean;
    };

export interface Query {
  /** Dotted field path → condition. All must hold. */
  readonly where?: Readonly<Record<string, Condition>>;
  /** Arbitrary logic tree evaluated against each entry; must return true. */
  readonly match?: LogicTree;
  readonly sort?: { readonly by: string; readonly order?: "asc" | "desc" } | readonly { readonly by: string; readonly order?: "asc" | "desc" }[];
  readonly offset?: number;
  readonly limit?: number;
}

export class CompendiumError extends Error {
  constructor(
    message: string,
    readonly issues: readonly Issue[] = [],
  ) {
    super(message);
    this.name = "CompendiumError";
  }
}

export interface CompendiumOptions {
  readonly backend?: CompendiumBackend;
  readonly schemas?: SchemaRegistry;
  /** Defaults to the logic-tree validator over `schemas`. */
  readonly validator?: Validator;
}

const OPS = new Set(["eq", "ne", "lt", "lte", "gt", "gte", "in", "contains", "exists"]);

function order(a: unknown, b: unknown): number {
  // Deterministic cross-type ordering: undefined/null < booleans < numbers < strings < others.
  const rank = (v: unknown) =>
    v === undefined || v === null ? 0 : typeof v === "boolean" ? 1 : typeof v === "number" ? 2 : typeof v === "string" ? 3 : 4;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 1 || ra === 2 || ra === 3) {
    const x = a as number | string | boolean;
    const y = b as number | string | boolean;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return 0;
}

function cmp(op: "lt" | "lte" | "gt" | "gte", v: unknown, bound: number | string): boolean {
  if (typeof v !== typeof bound) return false;
  const x = v as number | string;
  switch (op) {
    case "lt": return x < bound;
    case "lte": return x <= bound;
    case "gt": return x > bound;
    case "gte": return x >= bound;
  }
}

function matches(v: unknown, cond: Condition): boolean {
  if (!isPlainObject(cond)) return deepEqual(v, cond);
  const c = cond as Exclude<Condition, Scalar>;
  if (c.exists !== undefined && (v !== undefined) !== c.exists) return false;
  if (hasOwn(c, "eq") && !deepEqual(v, c.eq)) return false;
  if (hasOwn(c, "ne") && deepEqual(v, c.ne)) return false;
  for (const op of ["lt", "lte", "gt", "gte"] as const) {
    const b = c[op];
    if (b !== undefined && !cmp(op, v, b)) return false;
  }
  if (c.in !== undefined && !c.in.some((x) => deepEqual(x, v))) return false;
  if (hasOwn(c, "contains")) {
    if (typeof v === "string") {
      if (typeof c.contains !== "string" || !v.includes(c.contains)) return false;
    } else if (!Array.isArray(v) || !v.some((x) => deepEqual(x, c.contains))) {
      return false;
    }
  }
  return true;
}

/** Does a dotted path exist in the schema's declared properties? ($ref-aware) */
function schemaHasPath(schemas: SchemaRegistry, rootId: string, path: string): boolean {
  let node: unknown = schemas.get(rootId);
  let root: unknown = node;
  for (const seg of path.split(".")) {
    for (let hops = 0; isPlainObject(node) && typeof node.$ref === "string" && hops < 16; hops++) {
      const ref: string = node.$ref;
      const hash = ref.indexOf("#");
      const id = hash === -1 ? ref : ref.slice(0, hash);
      if (id !== "") root = schemas.get(id);
      node = root;
      if (hash !== -1) {
        for (const raw of ref.slice(hash + 2).split("/").filter(Boolean)) {
          node = isPlainObject(node) ? node[raw.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined;
        }
      }
    }
    if (!isPlainObject(node)) return false;
    if (/^(0|[1-9]\d*)$/.test(seg) && node.items !== undefined) {
      node = node.items;
      continue;
    }
    const props = node.properties;
    if (isPlainObject(props) && hasOwn(props, seg)) {
      node = props[seg];
    } else if (node.additionalProperties !== undefined && node.additionalProperties !== false) {
      node = node.additionalProperties;
    } else {
      return false;
    }
  }
  return true;
}

export class CompendiumStore {
  readonly backend: CompendiumBackend;
  readonly schemas: SchemaRegistry;
  readonly validator: Validator;
  private readonly rules = new Map<string, readonly ValidationRule[]>();

  constructor(options: CompendiumOptions = {}) {
    this.backend = options.backend ?? createMemoryBackend();
    this.schemas = options.schemas ?? new SchemaRegistry();
    this.validator = options.validator ?? createLogicTreeValidator(this.schemas);
  }

  /** Register a schema; entries whose `type` equals its `$id` are validated against it. */
  registerSchema(schema: JsonSchema): this {
    this.schemas.register(schema);
    return this;
  }

  /** Attach declarative rules to a content type (replaces previous rules for that type). */
  registerRules(type: string, rules: readonly ValidationRule[]): this {
    const issues = checkRules(rules);
    if (issues.length > 0) throw new CompendiumError(`invalid rules for "${type}": ${issues[0]!.message}`, issues);
    this.rules.set(type, freezeJson(rules));
    return this;
  }

  /** Validate an entry without storing it. */
  validate(entry: unknown): { valid: boolean; errors: readonly Issue[] } {
    if (!isPlainObject(entry) || typeof entry.type !== "string" || typeof entry.id !== "string" ||
        entry.type === "" || entry.id === "") {
      return {
        valid: false,
        errors: [{ path: "/", code: "entry_shape", message: "entry needs non-empty string `type` and `id`" }],
      };
    }
    const schemaId = this.schemas.has(entry.type) ? entry.type : undefined;
    return this.validator.validate(entry, schemaId, this.rules.get(entry.type) ?? []);
  }

  /**
   * Register one entry or many. All-or-nothing: if any entry is invalid, nothing
   * is stored and a CompendiumError lists every issue (paths prefixed by index
   * when registering an array). Re-registering an id replaces it.
   */
  register(entries: CompendiumEntry | readonly CompendiumEntry[]): this {
    const list = Array.isArray(entries) ? entries : [entries as CompendiumEntry];
    const frozen: CompendiumEntry[] = [];
    const issues: Issue[] = [];
    list.forEach((e, i) => {
      const prefix = Array.isArray(entries) ? `/${i}` : "";
      let f: CompendiumEntry;
      try {
        f = freezeJson(e);
      } catch (err) {
        issues.push({ path: prefix || "/", code: "not_json", message: (err as Error).message });
        return;
      }
      const res = this.validate(f);
      for (const is of res.errors) {
        issues.push({ ...is, path: prefix + (is.path === "/" && prefix ? "" : is.path) });
      }
      frozen.push(f);
    });
    if (issues.length > 0) {
      throw new CompendiumError(`compendium entry rejected: ${issues[0]!.path} ${issues[0]!.message}`, issues);
    }
    for (const f of frozen) this.backend.put(f);
    return this;
  }

  get<T extends CompendiumEntry = CompendiumEntry>(type: string, id: string): T | undefined {
    return this.backend.get(type, id) as T | undefined;
  }

  /** Like `get`, but throws when missing. */
  require<T extends CompendiumEntry = CompendiumEntry>(type: string, id: string): T {
    const e = this.get<T>(type, id);
    if (!e) throw new CompendiumError(`no ${type} "${id}" in the compendium`);
    return e;
  }

  delete(type: string, id: string): boolean {
    return this.backend.delete(type, id);
  }

  types(): string[] {
    return this.backend.types();
  }

  query<T extends CompendiumEntry = CompendiumEntry>(type: string, q: Query = {}): T[] {
    const where = q.where ?? {};
    const paths = Object.keys(where);
    for (const p of paths) {
      const cond = where[p];
      if (isPlainObject(cond)) {
        for (const k of Object.keys(cond)) {
          if (!OPS.has(k)) throw new CompendiumError(`unknown filter operator "${k}" on "${p}"`);
        }
      }
    }
    const sorts = q.sort === undefined ? [] : Array.isArray(q.sort) ? q.sort : [q.sort];
    if (this.schemas.has(type)) {
      for (const p of [...paths, ...sorts.map((s) => s.by)]) {
        if (p !== "type" && p !== "id" && !schemaHasPath(this.schemas, type, p)) {
          throw new CompendiumError(`"${p}" is not a field of schema "${type}"`);
        }
      }
    }

    let out = this.backend.list(type).filter((e) =>
      paths.every((p) => matches(getPath(e, p), where[p] as Condition)),
    );
    if (q.match !== undefined) {
      const tree = q.match;
      out = out.filter((e) => {
        const r = evaluate(tree, e);
        if (typeof r !== "boolean") throw new CompendiumError(`query "match" must evaluate to a boolean`);
        return r;
      });
    }
    if (sorts.length > 0) {
      // Array.prototype.sort is stable (ES2019), so ties keep insertion order.
      out = [...out].sort((a, b) => {
        for (const s of sorts) {
          const c = order(getPath(a, s.by), getPath(b, s.by));
          if (c !== 0) return s.order === "desc" ? -c : c;
        }
        return 0;
      });
    }
    const start = q.offset ?? 0;
    const end = q.limit === undefined ? undefined : start + q.limit;
    return out.slice(start, end) as T[];
  }
}

export function createCompendium(options: CompendiumOptions = {}): CompendiumStore {
  return new CompendiumStore(options);
}
