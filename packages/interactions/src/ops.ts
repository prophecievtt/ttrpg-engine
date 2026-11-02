/**
 * RFC 6902 subset applier. Supports add/remove/replace over nested objects
 * and arrays. `applyPatchOp` MUTATES its `target` in place (callers own a
 * working copy), matching the engine's transactional reducer model.
 */
import type { JsonPatchOp } from "./types.js";
import { RejectionError } from "./types.js";

/** Escape one RFC 6901 reference token (`~` → `~0`, `/` → `~1`). */
export function escapePointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Tokenize an RFC 6901 pointer into segments (un-escaping ~1 and ~0). */
export function tokenize(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) throw new RejectionError("bad_path", `paths must start with "/": ${path}`);
  return path
    .slice(1)
    .split("/")
    .map((seg) => seg.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function parentFor(root: unknown, path: string) {
  const segs = tokenize(path);
  if (segs.length === 0) return { parent: null as null | object | unknown[], key: "" };
  let node: unknown = root;
  for (let i = 0; i < segs.length - 1; i++) {
    node = readKey(node, segs[i]!);
  }
  return { parent: node as object | unknown[], key: segs[segs.length - 1]! };
}

function readKey(node: unknown, key: string): unknown {
  if (Array.isArray(node)) {
    const idx = key === "-" ? node.length : Number(key);
    if (!Number.isInteger(idx)) throw new RejectionError("bad_path", `bad array index: ${key}`);
    return node[idx];
  }
  if (node && typeof node === "object") {
    return (node as Record<string, unknown>)[key];
  }
  throw new RejectionError("bad_path", `cannot traverse into ${typeof node} at key ${key}`);
}

/** Mutate `target` per one op. */
export function applyPatchOp(target: unknown, op: JsonPatchOp): unknown {
  const { parent, key } = parentFor(target, op.path);
  if (parent === null) {
    return applyAtRoot(target, op);
  }
  if (Array.isArray(parent)) {
    if (key === "-") {
      if (op.op !== "add") throw new RejectionError("bad_path", `"-" only valid with add: ${op.path}`);
      parent.push(op.value);
      return target;
    }
    const idx = Number(key);
    if (!Number.isInteger(idx)) throw new RejectionError("bad_path", `bad array index: ${key}`);
    switch (op.op) {
      case "add":
        if (idx > parent.length) throw new RejectionError("bad_path", `array add index out of range: ${idx}`);
        parent.splice(idx, 0, op.value);
        break;
      case "replace":
        parent[idx] = op.value;
        break;
      case "remove":
        if (idx >= parent.length) throw new RejectionError("bad_path", `array remove index out of range: ${idx}`);
        parent.splice(idx, 1);
        break;
      default:
        throw new RejectionError("bad_path", `unsupported op on array: ${op.op}`);
    }
    return target;
  }
  if (parent && typeof parent === "object") {
    const obj = parent as Record<string, unknown>;
    if (key === "__proto__") throw new RejectionError("bad_path", "refusing __proto__");
    switch (op.op) {
      case "add":
      case "replace":
        obj[key] = op.value;
        break;
      case "remove":
        delete obj[key];
        break;
      default:
        throw new RejectionError("bad_path", `unsupported op on object: ${op.op}`);
    }
    return target;
  }
  throw new RejectionError("bad_path", `cannot apply op at ${op.path}`);
}

function applyAtRoot(target: unknown, op: JsonPatchOp): unknown {
  switch (op.op) {
    case "replace":
      return op.value;
    case "add":
    case "remove":
      return target;
    default:
      throw new RejectionError("bad_path", `unsupported root op: ${op.op}`);
  }
}

/** Deep clone of plain JSON state (deterministic everywhere, no structuredClone variance). */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}