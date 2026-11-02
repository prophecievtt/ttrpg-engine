import { describe, expect, it } from "vitest";

import { LogicError, checkTree, evaluate, type LogicTree } from "../src/index.js";

const data = {
  level: 3,
  name: "Fireball",
  school: "evocation",
  damage: { dice: "8d6", type: "fire" },
  tags: ["aoe", "fire"],
  components: [{ kind: "V" }, { kind: "S" }],
};

describe("logic tree semantics", () => {
  const cases: [string, LogicTree, unknown][] = [
    ["literals", 5, 5],
    ["arrays evaluate elements", [1, { get: "level" }], [1, 3]],
    ["lit is not evaluated", { lit: { get: "level" } }, { get: "level" }],
    ["get nested", { get: "damage.type" }, "fire"],
    ["get array index", { get: "components.1.kind" }, "S"],
    ["get missing → null", { get: "range" }, null],
    ["get missing with default", { get: "range", default: 150 }, 150],
    ["if/then/else", { if: { ">=": [{ get: "level" }, 3] }, then: "high", else: "low" }, "high"],
    ["if without else → null", { if: false, then: 1 }, null],
    ["all", { all: [true, { "==": [{ get: "school" }, "evocation"] }] }, true],
    ["all of nothing is true", { all: [] }, true],
    ["any", { any: [false, { in: ["fire", { get: "tags" }] }] }, true],
    ["any of nothing is false", { any: [] }, false],
    ["not", { not: { "==": [1, 2] } }, true],
    ["== is deep", { "==": [{ get: "damage" }, { lit: { type: "fire", dice: "8d6" } }] }, true],
    ["!=", { "!=": [1, "1"] }, true],
    ["< on strings is code-unit order", { "<": ["B", "a"] }, true],
    ["arithmetic", { "+": [1, { "*": [2, { get: "level" }] }, { "-": [10, 4] }] }, 13],
    ["division and modulo", [{ "/": [7, 2] }, { "%": [7, 2] }], [3.5, 1]],
    ["min/max", [{ min: [3, 1, 2] }, { max: [3, 1, 2] }], [1, 3]],
    ["floor/ceil/abs", [{ floor: 2.7 }, { ceil: 2.1 }, { abs: -4 }], [2, 3, 4]],
    ["half damage rounded down", { floor: { "/": [28, 2] } }, 14],
    ["len", [{ len: { get: "tags" } }, { len: "abc" }], [2, 3]],
    ["in on strings", { in: ["ball", { get: "name" }] }, true],
    ["in deep-equals array members", { in: [{ lit: { kind: "V" } }, { get: "components" }] }, true],
  ];
  for (const [name, tree, expected] of cases) {
    it(name, () => expect(evaluate(tree, data)).toEqual(expected));
  }

  it("short-circuits all/any/if", () => {
    expect(evaluate({ all: [false, { "/": [1, 0] }] })).toBe(false);
    expect(evaluate({ any: [true, { "/": [1, 0] }] })).toBe(true);
    expect(evaluate({ if: true, then: 1, else: { "/": [1, 0] } })).toBe(1);
  });
});

describe("logic tree errors are loud and located", () => {
  const bad: [string, LogicTree, RegExp][] = [
    ["unknown operator", { exec: "rm -rf" }, /unknown operator "exec"/],
    ["two operators in one node", { "+": [1], "-": [1, 2] }, /exactly one key/],
    ["wrong arity", { "-": [1] }, /exactly 2 arguments/],
    ["non-boolean condition", { if: 1, then: 2 }, /expected boolean/],
    ["truthiness is not allowed in all", { all: [1] }, /expected boolean/],
    ["type mismatch in arithmetic", { "+": [1, "2"] }, /expected number/],
    ["mixed comparison", { "<": [1, "2"] }, /two numbers or two strings/],
    ["division by zero", { "/": [1, 0] }, /division by zero/],
    ["overflow", { "*": [1e308, 10] }, /non-finite/],
    ["prototype access", { get: "__proto__.polluted" }, /forbidden path segment/],
    ["constructor access", { get: "a.constructor" }, /forbidden/],
  ];
  for (const [name, tree, re] of bad) {
    it(name, () => expect(() => evaluate(tree, { a: {} })).toThrow(re));
  }

  it("errors carry a JSON pointer into the tree", () => {
    try {
      evaluate({ all: [true, { "+": [1, "x"] }] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LogicError);
      expect((e as LogicError).at).toBe("/all/1/+/1");
    }
  });

  it("bounds evaluation steps and depth", () => {
    const wide = { "+": Array.from({ length: 20_000 }, () => 1) };
    expect(() => evaluate(wide)).toThrow(/step limit/);
    expect(evaluate(wide, null, { maxSteps: 30_000 })).toBe(20_000);
    let deep: LogicTree = 1;
    for (let i = 0; i < 100; i++) deep = { abs: deep };
    expect(() => evaluate(deep)).toThrow(/depth limit/);
  });

  it("checkTree finds structural problems without evaluating", () => {
    expect(checkTree({ if: { "==": [1, 1] }, then: { "/": [1, 0] } })).toEqual([]);
    const errs = checkTree({ all: [{ nope: 1 }, { "-": [1] }, { get: 5 }] });
    expect(errs.map((e) => e.at)).toEqual(["/all/0", "/all/1", "/all/2"]);
  });

  it("is deterministic and never mutates its inputs", () => {
    const tree = { "+": [{ get: "level" }, 1] };
    const snapshot = JSON.stringify([tree, data]);
    const runs = Array.from({ length: 5 }, () => evaluate(tree, data));
    expect(new Set(runs).size).toBe(1);
    expect(JSON.stringify([tree, data])).toBe(snapshot);
  });
});
