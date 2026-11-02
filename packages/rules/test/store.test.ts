import { describe, expect, it } from "vitest";

import { CompendiumError, createCompendium, createMemoryBackend, type CompendiumEntry } from "../src/index.js";
import { npcs, spellRules, spellSchema, spells } from "./fixtures/ember.js";

function ember() {
  return createCompendium().registerSchema(spellSchema).registerRules("spell", spellRules).register(spells).register(npcs);
}
const ids = (es: CompendiumEntry[]) => es.map((e) => e.id);

describe("CompendiumStore: register / get", () => {
  it("indexes by type and id", () => {
    const c = ember();
    expect(c.get("spell", "fireball")?.name).toBe("Fireball");
    expect(c.get("npc", "fireball")).toBeUndefined();
    expect(c.types()).toEqual(["npc", "spell"]);
    expect(() => c.require("spell", "wish")).toThrow(/no spell "wish"/);
  });

  it("freezes stored entries and does not alias caller objects", () => {
    const entry = { type: "npc", id: "kobold", hp: 5, tags: ["small"] };
    const c = createCompendium().register(entry);
    entry.hp = 99;
    const stored = c.require("npc", "kobold");
    expect(stored.hp).toBe(5);
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored.tags)).toBe(true);
  });

  it("validates against the type's schema and rules; batches are all-or-nothing", () => {
    const c = ember();
    const bad = [
      { type: "spell", id: "ok", name: "Ok", level: 1, school: "evocation" },
      { type: "spell", id: "wish", name: "Wish", level: 10, school: "conjuration" },
    ];
    try {
      c.register(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CompendiumError);
      expect((e as CompendiumError).issues).toEqual([
        { path: "/1/school", code: "enum", message: 'must be one of ["abjuration","evocation","illusion","necromancy"]' },
      ]);
    }
    expect(c.get("spell", "ok")).toBeUndefined();

    expect(() => c.register({ type: "spell", id: "wish", name: "Wish", level: 10, school: "illusion" })).toThrow(
      /spell level must be 0–9/,
    );
    expect(() =>
      c.register({ type: "spell", id: "x", name: "X", level: 1, school: "illusion", save: { onSuccess: "half" } }),
    ).toThrow(/a save needs an ability/);
  });

  it("rejects malformed entries and non-JSON values", () => {
    const c = createCompendium();
    expect(() => c.register({ type: "", id: "x" })).toThrow(/non-empty string/);
    expect(() => c.register({ type: "npc", id: "x", hp: NaN })).toThrow(/non-finite/);
    expect(() => c.register({ type: "npc", id: "x", at: new Date(0) } as unknown as CompendiumEntry)).toThrow(/not a JSON value/);
    expect(() => c.register(JSON.parse('{"type":"npc","id":"x","__proto__":{"admin":true}}'))).toThrow(/forbidden key/);
  });

  it("rejects malformed rules up front", () => {
    expect(() => createCompendium().registerRules("spell", [{ id: "r", message: "m", check: { nope: 1 } }])).toThrow(
      /unknown operator/,
    );
  });

  it("accepts a custom backend", () => {
    const backend = createMemoryBackend();
    const c = createCompendium({ backend }).register(npcs);
    expect(backend.list("npc")).toHaveLength(2);
    expect(c.delete("npc", "goblin")).toBe(true);
    expect(ids(c.query("npc"))).toEqual(["goblin-boss"]);
  });
});

describe("CompendiumStore: query", () => {
  const c = ember();

  it("equality, comparisons, membership", () => {
    expect(ids(c.query("spell", { where: { level: 0 } }))).toEqual(["ray-of-frost", "minor-illusion"]);
    expect(ids(c.query("spell", { where: { level: { gte: 1, lt: 5 } } }))).toEqual(["fireball", "burning-hands"]);
    expect(ids(c.query("spell", { where: { school: { in: ["illusion"] } } }))).toEqual(["minor-illusion"]);
    expect(ids(c.query("spell", { where: { "damage.kind": "cold" } }))).toEqual(["ray-of-frost", "cone-of-cold"]);
    expect(ids(c.query("spell", { where: { tags: { contains: "aoe" }, "area.shape": { ne: "sphere" } } }))).toEqual([
      "burning-hands", "cone-of-cold",
    ]);
    expect(ids(c.query("spell", { where: { save: { exists: false } } }))).toEqual(["ray-of-frost", "minor-illusion"]);
  });

  it("logic-tree match filters", () => {
    const res = c.query("spell", {
      match: { all: [{ "==": [{ get: "save.onSuccess" }, "half"] }, { ">": [{ get: "area.size" }, 15] }] },
    });
    expect(ids(res)).toEqual(["fireball", "cone-of-cold"]);
    expect(() => c.query("spell", { match: { get: "level" } })).toThrow(/boolean/);
  });

  it("stable multi-key sort, offset, limit", () => {
    const sorted = c.query("spell", { sort: [{ by: "school", order: "desc" }, { by: "level" }] });
    expect(ids(sorted)).toEqual(["minor-illusion", "ray-of-frost", "burning-hands", "fireball", "cone-of-cold"]);
    expect(ids(c.query("spell", { sort: { by: "level", order: "desc" }, offset: 1, limit: 2 }))).toEqual([
      "fireball", "burning-hands",
    ]);
  });

  it("schemas type queries: unknown fields and operators are rejected", () => {
    expect(() => c.query("spell", { where: { lvl: 3 } })).toThrow(/"lvl" is not a field of schema "spell"/);
    expect(() => c.query("spell", { sort: { by: "damage.dice.x" } })).toThrow(/not a field/);
    expect(() => c.query("spell", { where: { level: { approx: 3 } as never } })).toThrow(/unknown filter operator/);
    // Types without a schema accept any path.
    expect(ids(c.query("npc", { where: { "abilities.dex": 14, hp: { gt: 10 } } }))).toEqual(["goblin-boss"]);
  });

  it("returns the same frozen objects and no results for unknown types", () => {
    expect(c.query("spell", { where: { id: "fireball" } })[0]).toBe(c.get("spell", "fireball"));
    expect(c.query("item")).toEqual([]);
  });
});
