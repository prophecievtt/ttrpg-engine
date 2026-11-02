import { describe, expect, it } from "vitest";

import { SchemaError, SchemaRegistry, type JsonSchema } from "../src/index.js";

function reg(...schemas: JsonSchema[]): SchemaRegistry {
  const r = new SchemaRegistry();
  for (const s of schemas) r.register(s);
  return r;
}

/** [description, schema, value, valid, expected error codes?] */
const conformance: [string, JsonSchema, unknown, boolean, string[]?][] = [
  ["type string ok", { $id: "s", type: "string" }, "x", true],
  ["type string fails on number", { $id: "s", type: "string" }, 1, false, ["type"]],
  ["integer accepts 3", { $id: "s", type: "integer" }, 3, true],
  ["integer rejects 3.5", { $id: "s", type: "integer" }, 3.5, false, ["type"]],
  ["number accepts integers", { $id: "s", type: "number" }, 3, true],
  ["null type", { $id: "s", type: "null" }, null, true],
  ["array is not object", { $id: "s", type: "object" }, [], false, ["type"]],
  ["null is not object", { $id: "s", type: "object" }, null, false, ["type"]],
  ["type union", { $id: "s", type: ["string", "null"] }, null, true],
  ["enum hit", { $id: "s", enum: ["fire", "cold"] }, "fire", true],
  ["enum miss", { $id: "s", enum: ["fire", "cold"] }, "acid", false, ["enum"]],
  ["enum deep-equals objects", { $id: "s", enum: [{ a: [1, 2] }] }, { a: [1, 2] }, true],
  ["required present", { $id: "s", type: "object", required: ["id"] }, { id: "x" }, true],
  ["required missing", { $id: "s", type: "object", required: ["id", "level"] }, { id: "x" }, false, ["required"]],
  [
    "properties validate children",
    { $id: "s", type: "object", properties: { level: { type: "integer" } } },
    { level: "3" },
    false,
    ["type"],
  ],
  ["additionalProperties false", { $id: "s", type: "object", properties: {}, additionalProperties: false }, { x: 1 }, false, ["additional"]],
  ["additionalProperties schema", { $id: "s", type: "object", additionalProperties: { type: "number" } }, { a: 1, b: "2" }, false, ["type"]],
  ["items", { $id: "s", type: "array", items: { type: "integer" } }, [1, 2, "3", 4.5], false, ["type", "type"]],
  ["false schema", { $id: "s", type: "object", properties: { x: false } }, { x: 1 }, false, ["false_schema"]],
  ["annotations are ignored", { $id: "s", type: "string", title: "Name", description: "d", default: "a", "x-ui": { widget: "text" } }, "a", true],
  [
    "local $ref to definitions",
    { $id: "s", definitions: { dice: { type: "string" } }, type: "object", properties: { damage: { $ref: "#/definitions/dice" } } },
    { damage: 8 },
    false,
    ["type"],
  ],
];

describe("JSON Schema subset conformance", () => {
  for (const [name, schema, value, valid, codes] of conformance) {
    it(name, () => {
      const res = reg(schema).validate("s", value);
      expect(res.valid).toBe(valid);
      if (codes) expect(res.errors.map((e) => e.code)).toEqual(codes);
    });
  }

  it("reports JSON-pointer paths, sorted deterministically", () => {
    const r = reg({
      $id: "spell",
      type: "object",
      required: ["level"],
      properties: { "a/b": { type: "string" }, list: { type: "array", items: { type: "integer" } } },
    });
    const res = r.validate("spell", { "a/b": 1, list: [1, "x"] });
    expect(res.errors.map((e) => e.path)).toEqual(["/level", "/a~1b", "/list/1"]);
  });

  it("$ref across registered schemas, including recursive schemas", () => {
    const r = reg(
      { $id: "dice", type: "string" },
      {
        $id: "tree",
        type: "object",
        properties: { roll: { $ref: "dice" }, children: { type: "array", items: { $ref: "#" } } },
      },
    );
    expect(r.validate("tree", { roll: "1d6", children: [{ roll: "2d6", children: [] }] }).valid).toBe(true);
    const bad = r.validate("tree", { children: [{ children: [{ roll: 3 }] }] });
    expect(bad.errors).toEqual([
      { path: "/children/0/children/0/roll", code: "type", message: "expected string, got integer" },
    ]);
  });

  it("deeply nested data through a recursive $ref is fine; ref cycles are caught", () => {
    const r = reg({ $id: "list", type: "object", properties: { next: { $ref: "#" } } });
    let v: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) v = { next: v };
    expect(r.validate("list", v).valid).toBe(true);
    const loop = reg({ $id: "loop", $ref: "#" });
    expect(() => loop.validate("loop", 1)).toThrow(SchemaError);
  });

  it("rejects unsupported keywords and bad schemas at registration", () => {
    expect(() => reg({ $id: "s", type: "integer", minimum: 0 })).toThrow(/unsupported keyword "minimum"/);
    expect(() => reg({ $id: "s", properties: { a: { pattern: "x" } } })).toThrow(SchemaError);
    expect(() => reg({ $id: "s", type: "decimal" })).toThrow(/invalid type/);
    expect(() => reg({ type: "string" } as JsonSchema)).toThrow(/\$id/);
    expect(() => reg({ $id: "a#b" })).toThrow(SchemaError);
  });

  it("unresolvable refs and unknown schemas throw", () => {
    expect(() => reg({ $id: "s", $ref: "nope" }).validate("s", 1)).toThrow(/unknown schema "nope"/);
    expect(() => reg({ $id: "s", $ref: "#/definitions/x" }).validate("s", 1)).toThrow(/unresolvable/);
    expect(() => new SchemaRegistry().validate("missing", 1)).toThrow(SchemaError);
  });

  it("stores schemas frozen and lists ids sorted", () => {
    const r = reg({ $id: "spell", type: "object" }, { $id: "class", type: "object" });
    expect(r.ids()).toEqual(["class", "spell"]);
    expect(Object.isFrozen(r.get("spell"))).toBe(true);
  });
});
