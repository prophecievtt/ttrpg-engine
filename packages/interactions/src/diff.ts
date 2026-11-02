/**
 * Structural state diff — a TEST ORACLE, not the production path.
 *
 * Production deltas are emitted by reducers as they mutate state. This module
 * independently diffs two plain-JSON states so tests can assert the emitted
 * ops are complete and consistent: applyPatchOp(diff(a,b)) must rebuild b.
 */
import type { JsonPatchOp } from "./types.js";
import { applyPatchOp, cloneJson } from "./ops.js";

export function diffState(a: unknown, b: unknown, basePath = ""): JsonPatchOp[] {
  if (a === b) return [];
  const ops: JsonPatchOp[] = [];

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      // Length changes: replace the whole array (correct, not minimal).
      ops.push({ op: "replace", path: basePath, value: cloneJson(b) });
      return ops;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        ops.push(...diffValue(a[i], b[i], `${basePath}/${i}`));
      }
    }
    return ops;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    for (const key of Object.keys(a)) {
      const path = `${basePath}/${escapeKey(key)}`;
      if (!Object.prototype.hasOwnProperty.call(b, key)) {
        ops.push({ op: "remove", path });
      } else if (a[key] !== b[key]) {
        ops.push(...diffValue(a[key], b[key], path));
      }
    }
    for (const key of Object.keys(b)) {
      if (!Object.prototype.hasOwnProperty.call(a, key)) {
        ops.push({
          op: "add",
          path: `${basePath}/${escapeKey(key)}`,
          value: cloneJson(b[key]),
        });
      }
    }
    return ops;
  }

  return [{ op: "replace", path: basePath, value: cloneJson(b) }];
}

function diffValue(a: unknown, b: unknown, path: string): JsonPatchOp[] {
  if (a === b) return [];
  if (isPlainObject(a) && isPlainObject(b)) return diffState(a, b, path);
  if (Array.isArray(a) && Array.isArray(b)) return diffState(a, b, path);
  return [{ op: "replace", path, value: cloneJson(b) }];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function escapeKey(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Rebuild `after` from `before` by replaying ops; throws on inconsistency. */
export function replayOps(before: unknown, ops: readonly JsonPatchOp[]): unknown {
  let state = cloneJson(before);
  for (const op of ops) state = applyPatchOp(state, op) as typeof state;
  return state;
}