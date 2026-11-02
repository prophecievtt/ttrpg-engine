/** A tiny example system ("ember") used by the tests. Not published game content. */
import type { CompendiumEntry, JsonSchema, ValidationRule } from "../../src/index.js";

export const spellSchema: JsonSchema = {
  $id: "spell",
  title: "Spell",
  type: "object",
  required: ["type", "id", "name", "level", "school"],
  additionalProperties: false,
  definitions: {
    dice: { type: "string", description: "Dice notation, e.g. 8d6", "x-ui": { widget: "dice" } },
  },
  properties: {
    type: { enum: ["spell"] },
    id: { type: "string" },
    name: { type: "string", title: "Name" },
    level: { type: "integer", title: "Level" },
    school: { enum: ["abjuration", "evocation", "illusion", "necromancy"] },
    area: {
      type: "object",
      required: ["shape", "size"],
      properties: { shape: { enum: ["sphere", "cone", "cube", "line"] }, size: { type: "number" } },
    },
    damage: {
      type: "object",
      required: ["dice", "kind"],
      properties: { dice: { $ref: "#/definitions/dice" }, kind: { type: "string" } },
    },
    save: { type: "object", properties: { ability: { enum: ["str", "dex", "con", "wis"] }, onSuccess: { enum: ["half", "none"] } } },
    tags: { type: "array", items: { type: "string" } },
  },
};

export const spellRules: ValidationRule[] = [
  {
    id: "level_range",
    message: "spell level must be 0–9",
    path: "/level",
    check: { all: [{ ">=": [{ get: "level" }, 0] }, { "<=": [{ get: "level" }, 9] }] },
  },
  {
    id: "save_needs_ability",
    message: "a save needs an ability",
    path: "/save",
    when: { "!=": [{ get: "save" }, null] },
    check: { "!=": [{ get: "save.ability" }, null] },
  },
];

export const spells: CompendiumEntry[] = [
  {
    type: "spell", id: "fireball", name: "Fireball", level: 3, school: "evocation",
    area: { shape: "sphere", size: 20 }, damage: { dice: "8d6", kind: "fire" },
    save: { ability: "dex", onSuccess: "half" }, tags: ["aoe", "fire"],
  },
  {
    type: "spell", id: "burning-hands", name: "Burning Hands", level: 1, school: "evocation",
    area: { shape: "cone", size: 15 }, damage: { dice: "3d6", kind: "fire" },
    save: { ability: "dex", onSuccess: "half" }, tags: ["aoe", "fire"],
  },
  {
    type: "spell", id: "ray-of-frost", name: "Ray of Frost", level: 0, school: "evocation",
    damage: { dice: "1d8", kind: "cold" }, tags: ["cantrip"],
  },
  { type: "spell", id: "minor-illusion", name: "Minor Illusion", level: 0, school: "illusion", tags: ["cantrip"] },
  {
    type: "spell", id: "cone-of-cold", name: "Cone of Cold", level: 5, school: "evocation",
    area: { shape: "cone", size: 60 }, damage: { dice: "8d8", kind: "cold" },
    save: { ability: "con", onSuccess: "half" }, tags: ["aoe"],
  },
];

export const npcs: CompendiumEntry[] = [
  { type: "npc", id: "goblin", name: "Goblin", hp: 7, ac: 15, abilities: { dex: 14 } },
  { type: "npc", id: "goblin-boss", name: "Goblin Boss", hp: 21, ac: 17, abilities: { dex: 14 } },
];
