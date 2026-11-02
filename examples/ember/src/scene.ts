/**
 * The ember demo encounter: one wizard, two goblins, positioned in feet on a
 * flat battlefield (z is up). Positions and radii are plain components, so the
 * orchestrator can hand them to the spatial engine without any extra mapping.
 */
import { createSession, type Entity, type SessionState } from "@ttrpg-engine/interactions";

import { emberCreatures, type EmberCreature } from "./content.js";

export const WIZARD = "uuid-wizard-1";
export const GOBLIN_1 = "uuid-goblin-1";
export const GOBLIN_2 = "uuid-goblin-2";

/** Where the demo fireball lands: both goblins are inside the 20-ft globe, the wizard is not. */
export const BLAST_POINT = { x: 65, y: 5, z: 0 } as const;

function creature(id: string): EmberCreature {
  const found = emberCreatures.find((c) => c.id === id);
  if (!found) throw new Error(`ember: no creature ${id}`);
  return found;
}

/** Turn a compendium creature into a session entity (components are copies). */
export function spawn(id: string, from: EmberCreature, position: { x: number; y: number; z: number }): Entity {
  const components: Record<string, unknown> = {
    template: from.id,
    hp: from.hp,
    ac: from.ac,
    saves: { ...from.saves },
    position: { ...position },
    radius: 2.5,
  };
  if (from.spell_save_dc !== undefined) components.spell_save_dc = from.spell_save_dc;
  for (const [level, count] of Object.entries(from.spell_slots ?? {})) {
    components[`spell_slots_${level}`] = count;
  }
  return { id, kind: from.type === "npc" ? "monster" : "player", components };
}

export function buildEmberSession(): SessionState {
  const s = createSession({ sessionId: "ember-session-1", phase: "combat", round: 1, turnIndex: 0 });
  s.initiative_roster = [
    { id: WIZARD, group: "party", roll: 18, order: 0 },
    { id: GOBLIN_1, group: "foes", roll: 12, order: 1 },
    { id: GOBLIN_2, group: "foes", roll: 8, order: 2 },
  ];
  s.entities[WIZARD] = spawn(WIZARD, creature("wizard"), { x: 0, y: 0, z: 0 });
  s.entities[GOBLIN_1] = spawn(GOBLIN_1, creature("goblin"), { x: 60, y: 0, z: 0 });
  s.entities[GOBLIN_2] = spawn(GOBLIN_2, creature("goblin-chief"), { x: 70, y: 10, z: 0 });
  return s;
}
