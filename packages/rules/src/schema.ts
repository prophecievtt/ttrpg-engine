/**
 * SchemaRegistry + a minimal JSON Schema subset validator.
 *
 * Supported assertion keywords (v1): `type` (incl. "integer", and arrays of types),
 * `properties`, `required`, `enum`, `items`, `$ref`, `additionalProperties`.
 * `$ref` is registry-local only: `"#/definitions/x"` within the same schema,
 * `"<schemaId>"` or `"<schemaId>#/definitions/x"` for another registered schema.
 *
 * Annotation keywords are kept for UI form generation but not enforced:
 * `$id $schema title description default examples $comment definitions $defs
 * readOnly writeOnly format deprecated`, plus any `x-*` extension key.
 * Any other keyword is rejected at registration, so authors never believe an
 * unsupported assertion (e.g. `minimum`) is being enforced.
 */
import {
  type Issue, type ValidationResult, deepEqual, hasOwn, isPlainObject, pointer, sortedKeys,
  freezeJson,
} from "./json.js";

export interface JsonSchema {
  readonly $id?: string;
  readonly [keyword: string]: unknown;
}

const ASSERTIONS = new Set(["type", "properties", "required", "enum", "items", "$ref", "additionalProperties"]);
const ANNOTATIONS = new Set([
  "$id", "$schema", "title", "description", "default", "examples", "$comment",
  "definitions", "$defs", "readOnly", "writeOnly", "format", "deprecated",
]);
const TYPES = new Set(["null", "boolean", "number", "integer", "string", "array", "object"]);
/** Max consecutive $ref hops without descending into data (catches ref cycles). */
const MAX_REF_DEPTH = 64;

export class SchemaError extends Error {
  constructor(
    message: string,
    readonly issues: readonly Issue[] = [],
  ) {
    super(message);
    this.name = "SchemaError";
  }
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function matchesType(v: unknown, t: string): boolean {
  const actual = typeOf(v);
  return actual === t || (t === "number" && actual === "integer");
}

/** Statically check a schema's keywords; returns issues addressed into the schema. */
function lintSchema(node: unknown, path: string, issues: Issue[]): void {
  if (typeof node === "boolean") return; // true / false schemas
  if (!isPlainObject(node)) {
    issues.push({ path: path || "/", code: "schema_type", message: "schema must be an object or boolean" });
    return;
  }
  for (const k of sortedKeys(node)) {
    if (!ASSERTIONS.has(k) && !ANNOTATIONS.has(k) && !k.startsWith("x-")) {
      issues.push({ path: pointer(path, k), code: "unsupported_keyword", message: `unsupported keyword "${k}"` });
    }
  }
  const t = node.type;
  if (t !== undefined) {
    const list = Array.isArray(t) ? t : [t];
    if (list.length === 0 || !list.every((x) => typeof x === "string" && TYPES.has(x))) {
      issues.push({ path: pointer(path, "type"), code: "bad_type", message: `invalid type ${JSON.stringify(t)}` });
    }
  }
  if (node.required !== undefined && !(Array.isArray(node.required) && node.required.every((x) => typeof x === "string"))) {
    issues.push({ path: pointer(path, "required"), code: "bad_required", message: "required must be a string array" });
  }
  if (node.enum !== undefined && !Array.isArray(node.enum)) {
    issues.push({ path: pointer(path, "enum"), code: "bad_enum", message: "enum must be an array" });
  }
  if (node.$ref !== undefined && typeof node.$ref !== "string") {
    issues.push({ path: pointer(path, "$ref"), code: "bad_ref", message: "$ref must be a string" });
  }
  for (const group of ["properties", "definitions", "$defs"] as const) {
    const g = node[group];
    if (g === undefined) continue;
    if (!isPlainObject(g)) {
      issues.push({ path: pointer(path, group), code: "schema_type", message: `${group} must be an object` });
      continue;
    }
    for (const k of sortedKeys(g)) lintSchema(g[k], pointer(pointer(path, group), k), issues);
  }
  if (node.items !== undefined) lintSchema(node.items, pointer(path, "items"), issues);
  if (node.additionalProperties !== undefined) {
    lintSchema(node.additionalProperties, pointer(path, "additionalProperties"), issues);
  }
}

function resolvePointer(root: unknown, frag: string): unknown {
  if (frag === "" || frag === "/") return root;
  let cur: unknown = root;
  for (const raw of frag.slice(1).split("/")) {
    const seg = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isPlainObject(cur) || !hasOwn(cur, seg)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

export class SchemaRegistry {
  private readonly schemas = new Map<string, JsonSchema>();

  /** Register (or replace) a schema under its `$id`. Throws SchemaError on unsupported keywords. */
  register(schema: JsonSchema): void {
    const id = schema.$id;
    if (typeof id !== "string" || id === "" || id.includes("#")) {
      throw new SchemaError("schema needs a string $id without '#'");
    }
    const issues: Issue[] = [];
    lintSchema(schema, "", issues);
    if (issues.length > 0) throw new SchemaError(`invalid schema "${id}": ${issues[0]!.message}`, issues);
    this.schemas.set(id, freezeJson(schema));
  }

  has(id: string): boolean {
    return this.schemas.has(id);
  }

  /** The frozen schema document (for UI form generation), or undefined. */
  get(id: string): JsonSchema | undefined {
    return this.schemas.get(id);
  }

  /** Registered ids, sorted. */
  ids(): string[] {
    return [...this.schemas.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /** Validate `value` against schema `id`. Unknown schema id → SchemaError. */
  validate(id: string, value: unknown): ValidationResult {
    const root = this.schemas.get(id);
    if (!root) throw new SchemaError(`unknown schema "${id}"`);
    const errors: Issue[] = [];
    this.check(root, root, value, "", errors, 0);
    return { valid: errors.length === 0, errors };
  }

  private resolveRef(ref: string, currentRoot: JsonSchema): { root: JsonSchema; node: unknown } {
    const hash = ref.indexOf("#");
    const idPart = hash === -1 ? ref : ref.slice(0, hash);
    const frag = hash === -1 ? "" : ref.slice(hash + 1);
    const root = idPart === "" ? currentRoot : this.schemas.get(idPart);
    if (!root) throw new SchemaError(`unresolvable $ref "${ref}" (unknown schema "${idPart}")`);
    const node = resolvePointer(root, frag);
    if (node === undefined) throw new SchemaError(`unresolvable $ref "${ref}"`);
    return { root, node };
  }

  private check(
    root: JsonSchema, schema: unknown, value: unknown, path: string, errors: Issue[], depth: number,
  ): void {
    if (schema === true) return;
    if (schema === false) {
      errors.push({ path: path || "/", code: "false_schema", message: "no value is allowed here" });
      return;
    }
    if (!isPlainObject(schema)) return;
    const at = path || "/";

    if (typeof schema.$ref === "string") {
      if (depth >= MAX_REF_DEPTH) throw new SchemaError(`$ref depth exceeded at ${at}`);
      const { root: r, node } = this.resolveRef(schema.$ref, root);
      this.check(r, node, value, path, errors, depth + 1);
    }

    if (schema.type !== undefined) {
      const types = (Array.isArray(schema.type) ? schema.type : [schema.type]) as string[];
      if (!types.some((t) => matchesType(value, t))) {
        errors.push({ path: at, code: "type", message: `expected ${types.join(" | ")}, got ${typeOf(value)}` });
        return; // further keywords would only add noise
      }
    }

    if (Array.isArray(schema.enum) && !schema.enum.some((e) => deepEqual(e, value))) {
      errors.push({ path: at, code: "enum", message: `must be one of ${JSON.stringify(schema.enum)}` });
    }

    if (isPlainObject(value)) {
      const props = isPlainObject(schema.properties) ? schema.properties : {};
      if (Array.isArray(schema.required)) {
        for (const key of schema.required as string[]) {
          if (!hasOwn(value, key)) {
            errors.push({ path: pointer(path, key), code: "required", message: `missing required property "${key}"` });
          }
        }
      }
      for (const key of sortedKeys(value)) {
        const child = pointer(path, key);
        if (hasOwn(props, key)) {
          this.check(root, props[key], value[key], child, errors, 0);
        } else if (schema.additionalProperties === false) {
          errors.push({ path: child, code: "additional", message: `unexpected property "${key}"` });
        } else if (schema.additionalProperties !== undefined) {
          this.check(root, schema.additionalProperties, value[key], child, errors, 0);
        }
      }
    }

    if (Array.isArray(value) && schema.items !== undefined) {
      value.forEach((item, i) => this.check(root, schema.items, item, pointer(path, i), errors, 0));
    }
  }
}
