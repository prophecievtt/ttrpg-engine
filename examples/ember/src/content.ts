/**
 * Ember content: schemas and compendium entries as plain JSON-shaped data.
 *
 * Shapes are structural (no dependency on @ttrpg-engine/rules) so a consumer
 * can load them into any compendium: `compendium.registerSchema(s)` for each
 * of `emberSchemas`, then `compendium.register(emberEntries)`.
 */

export interface EmberSpell {
  readonly type: "spell";
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly school: string;
  readonly area?: { readonly shape: "sphere" | "cone" | "cube"; readonly size: number };
  readonly damage?: { readonly dice: string; readonly kind: string };
  readonly save?: { readonly ability: "str" | "dex" | "con" | "wis"; readonly onSuccess: "half" | "none" };
  /** A short-lived effect placed on every target still standing after the spell. */
  readonly effect?: { readonly name: string; readonly duration_rounds: number };
  readonly tags?: readonly string[];
  /** Open for extra fields, so entries fit any compendium. */
  readonly [key: string]: unknown;
}

export interface EmberCreature {
  readonly type: "npc" | "character";
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  readonly ac: number;
  /** Bonus added to a d20 for each saving throw ability. */
  readonly saves: Readonly<Record<string, number>>;
  readonly spell_save_dc?: number;
  readonly spell_slots?: Readonly<Record<string, number>>;
  readonly [key: string]: unknown;
}

const dice = { type: "string", description: "Dice notation, e.g. 8d6", "x-ui": { widget: "dice" } };

export const spellSchema = {
  $id: "spell",
  title: "Spell",
  type: "object",
  required: ["type", "id", "name", "level", "school"],
  additionalProperties: false,
  properties: {
    type: { enum: ["spell"] },
    id: { type: "string" },
    name: { type: "string", title: "Name" },
    level: { type: "integer", title: "Level" },
    school: { enum: ["abjuration", "evocation", "illusion", "necromancy"] },
    area: {
      type: "object",
      required: ["shape", "size"],
      properties: { shape: { enum: ["sphere", "cone", "cube"] }, size: { type: "number" } },
    },
    damage: {
      type: "object",
      required: ["dice", "kind"],
      properties: { dice, kind: { type: "string" } },
    },
    save: {
      type: "object",
      required: ["ability", "onSuccess"],
      properties: { ability: { enum: ["str", "dex", "con", "wis"] }, onSuccess: { enum: ["half", "none"] } },
    },
    effect: {
      type: "object",
      required: ["name", "duration_rounds"],
      properties: { name: { type: "string" }, duration_rounds: { type: "integer" } },
    },
    tags: { type: "array", items: { type: "string" } },
  },
} as const;

const creatureSchema = (id: "npc" | "character") =>
  ({
    $id: id,
    title: id === "npc" ? "NPC" : "Character",
    type: "object",
    required: ["type", "id", "name", "hp", "ac", "saves"],
    properties: {
      type: { enum: [id] },
      id: { type: "string" },
      name: { type: "string" },
      hp: { type: "integer" },
      ac: { type: "integer" },
      saves: { type: "object" },
      spell_save_dc: { type: "integer" },
      spell_slots: { type: "object" },
    },
  }) as const;

export const emberSchemas = [spellSchema, creatureSchema("npc"), creatureSchema("character")] as const;

export const fireball: EmberSpell = {
  type: "spell",
  id: "fireball",
  name: "Fireball",
  level: 3,
  school: "evocation",
  area: { shape: "sphere", size: 20 },
  damage: { dice: "8d6", kind: "fire" },
  save: { ability: "dex", onSuccess: "half" },
  effect: { name: "scorched", duration_rounds: 1 },
  tags: ["aoe", "fire"],
};

export const emberSpells: readonly EmberSpell[] = [fireball];

export const emberCreatures: readonly EmberCreature[] = [
  {
    type: "character", id: "wizard", name: "Ember Wizard", hp: 20, ac: 12,
    saves: { dex: 2, wis: 4 }, spell_save_dc: 15, spell_slots: { "3": 2 },
  },
  { type: "npc", id: "goblin", name: "Goblin", hp: 6, ac: 15, saves: { dex: 2 } },
  { type: "npc", id: "goblin-chief", name: "Goblin Chief", hp: 28, ac: 17, saves: { dex: 2 } },
];

export const emberEntries = [...emberSpells, ...emberCreatures];
