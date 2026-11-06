import { describe, expect, it } from "vitest";

import {
  applyPatchOp, cloneJson, escapePointerToken, RejectionError, tokenize, type JsonPatchOp,
} from "../src/index.js";

function rejectionCode(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(RejectionError);
    return (err as RejectionError).code;
  }
  throw new Error("expected a RejectionError");
}

describe("JSON pointers", () => {
  it("escape and tokenize RFC 6901 reference tokens", () => {
    expect(escapePointerToken("a/b~c")).toBe("a~1b~0c");
    expect(tokenize("")).toEqual([]);
    expect(tokenize("/")).toEqual([""]);
    expect(tokenize("/a~1b~0c/0")).toEqual(["a/b~c", "0"]);
    expect(tokenize("/~01")).toEqual(["~1"]); // ~0 is unescaped last
  });

  it("rejects pointers without a leading slash", () => {
    expect(rejectionCode(() => tokenize("a/b"))).toBe("bad_path");
  });
});

describe("applyPatchOp on objects", () => {
  it("adds, replaces and removes nested keys in place", () => {
    const state = { entities: { x: { hp: 6 } } };
    expect(applyPatchOp(state, { op: "add", path: "/entities/y", value: { hp: 3 } })).toBe(state);
    applyPatchOp(state, { op: "replace", path: "/entities/x/hp", value: 0 });
    applyPatchOp(state, { op: "remove", path: "/entities/y" });
    expect(state).toEqual({ entities: { x: { hp: 0 } } });
  });

  it("refuses __proto__ and unsupported ops", () => {
    const state: Record<string, unknown> = {};
    expect(rejectionCode(() => applyPatchOp(state, { op: "add", path: "/__proto__", value: { polluted: true } })))
      .toBe("bad_path");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    for (const op of ["move", "copy", "test"] as const) {
      expect(rejectionCode(() => applyPatchOp(state, { op, path: "/a", from: "/b", value: 1 }))).toBe("bad_path");
    }
    expect(state).toEqual({});
  });
});

describe("applyPatchOp on arrays", () => {
  it("appends with -, inserts, replaces and removes by index", () => {
    const state = { list: [1, 2, 3] };
    applyPatchOp(state, { op: "add", path: "/list/-", value: 4 });
    applyPatchOp(state, { op: "add", path: "/list/0", value: 0 });
    applyPatchOp(state, { op: "add", path: "/list/5", value: 5 }); // index === length appends
    applyPatchOp(state, { op: "replace", path: "/list/2", value: 20 });
    applyPatchOp(state, { op: "remove", path: "/list/1" });
    expect(state).toEqual({ list: [0, 20, 3, 4, 5] });
  });

  it("traverses through array elements", () => {
    const state = { rows: [{ hp: 1 }, { hp: 2 }] };
    applyPatchOp(state, { op: "replace", path: "/rows/1/hp", value: 9 });
    expect(state).toEqual({ rows: [{ hp: 1 }, { hp: 9 }] });
  });

  it("rejects bad indices, out-of-range edits and unsupported ops", () => {
    const state = { list: [1, 2] };
    const bad: JsonPatchOp[] = [
      { op: "replace", path: "/list/-", value: 9 },
      { op: "remove", path: "/list/-" },
      { op: "replace", path: "/list/one", value: 9 },
      { op: "add", path: "/list/1.5", value: 9 },
      { op: "add", path: "/list/3", value: 9 },
      { op: "remove", path: "/list/2" },
      { op: "move", path: "/list/0", from: "/list/1" },
      { op: "replace", path: "/list/x/hp", value: 9 }, // bad index while traversing
    ];
    for (const op of bad) {
      expect(rejectionCode(() => applyPatchOp(state, op)), `${op.op} ${op.path}`).toBe("bad_path");
    }
    expect(state).toEqual({ list: [1, 2] });
  });
});

describe("applyPatchOp path failures", () => {
  it("rejects traversal into primitives and missing parents", () => {
    const state = { hp: 5, entities: {} };
    expect(rejectionCode(() => applyPatchOp(state, { op: "replace", path: "/hp/max/value", value: 1 })))
      .toBe("bad_path");
    expect(rejectionCode(() => applyPatchOp(state, { op: "add", path: "/entities/missing/hp", value: 1 })))
      .toBe("bad_path");
    expect(rejectionCode(() => applyPatchOp(state, { op: "add", path: "/hp/max", value: 1 })))
      .toBe("bad_path");
    expect(state).toEqual({ hp: 5, entities: {} });
  });

  it("replaces the whole document at the root and rejects unsupported root ops", () => {
    const state = { a: 1 };
    expect(applyPatchOp(state, { op: "replace", path: "", value: { b: 2 } })).toEqual({ b: 2 });
    expect(rejectionCode(() => applyPatchOp(state, { op: "copy", path: "", from: "/a" }))).toBe("bad_path");
    expect(state).toEqual({ a: 1 });
  });
});

describe("cloneJson", () => {
  it("returns an independent deep copy", () => {
    const original = { entities: { x: { tags: ["a"] } }, round: 1 };
    const copy = cloneJson(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    copy.entities.x.tags.push("b");
    expect(original.entities.x.tags).toEqual(["a"]);
  });
});
