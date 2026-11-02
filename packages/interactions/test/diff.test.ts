import { describe, expect, it } from "vitest";

import { diffState, replayOps } from "../src/index.js";

describe("diffState (test oracle)", () => {
  it("produces an empty diff for identical states", () => {
    expect(diffState({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual([]);
  });

  it("captures add/remove/replace on nested objects", () => {
    const before = { entities: { x: { hp: 6 } } };
    const after = { entities: { x: { hp: 0 }, y: { hp: 3 } } };
    const ops = diffState(before, after);
    expect(ops).toEqual([
      { op: "replace", path: "/entities/x/hp", value: 0 },
      { op: "add", path: "/entities/y", value: { hp: 3 } },
    ]);
  });

  it("rebuilds the after-state on replay for every case", () => {
    const cases: Array<[unknown, unknown]> = [
      [{}, { a: 1 }],
      [{ a: 1 }, {}],
      [{ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } }],
      [{ list: [1, 2, 3] }, { list: [1, 9, 3] }],
      [{ list: [1, 2, 3] }, { list: [1, 2] }], // length change → array replace
      [{ list: [1, 2] }, { list: [1, 2, 3] }],
      [null, { x: 1 }],
      [{ x: 1 }, null],
    ];
    for (const [before, after] of cases) {
      expect(replayOps(before, diffState(before, after))).toEqual(after);
    }
  });

  it("escapes keys containing / and ~ in pointers", () => {
    const before = { ["we/ird~key"]: 1 };
    const after = { ["we/ird~key"]: 2 };
    const ops = diffState(before, after);
    expect(replayOps(before, ops)).toEqual(after);
  });
});