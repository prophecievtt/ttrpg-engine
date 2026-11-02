/**
 * The ember game logic: a `Ruleset` that resolves CAST_SPELL intents.
 *
 * Spells are looked up by id (from any compendium), so content stays data.
 * All randomness arrives in the intent: the damage dice and each target's
 * saving-throw total. The ruleset only checks and applies the math.
 */
import { makeEffect, RejectionError, type Ruleset } from "@ttrpg-engine/interactions";

import type { EmberSpell } from "./content.js";

export interface CastSpellPayload {
  spell_id: string;
  targets: string[];
  injected_entropy: {
    /** `roll` must equal the spell's damage notation. */
    damage?: { roll: string; dice?: number[][]; total?: number };
    /** Saving-throw totals (d20 + bonus), one per target. */
    target_saves?: Record<string, number>;
  };
}

export type SpellLookup = (id: string) => EmberSpell | undefined;

export function createEmberRuleset(getSpell: SpellLookup): Ruleset {
  return {
    id: "ember",
    handle(type, ctx) {
      if (type !== "CAST_SPELL") return false;
      const payload = ctx.intent.payload as Partial<CastSpellPayload> | null;
      if (!payload || typeof payload.spell_id !== "string" || !Array.isArray(payload.targets)) {
        throw new RejectionError("invalid_payload", "expected { spell_id, targets, injected_entropy }");
      }
      const spell = getSpell(payload.spell_id);
      if (!spell) throw new RejectionError("unknown_spell", `no spell: ${payload.spell_id}`);

      const state = ctx.tx.getState();
      const caster = ctx.intent.source;
      if (!state.entities[caster]) throw new RejectionError("unknown_entity", `no caster: ${caster}`);
      const slotKey = `spell_slots_${spell.level}`;
      const slots = Number(ctx.getComponent(caster, slotKey) ?? 0);
      if (spell.level > 0 && !(slots > 0)) throw new RejectionError("no_spell_slot", slotKey);

      const targets = payload.targets;
      if (new Set(targets).size !== targets.length) throw new RejectionError("duplicate_target");
      for (const id of targets) {
        if (typeof id !== "string" || !state.entities[id]) {
          throw new RejectionError("unknown_entity", `no target: ${String(id)}`);
        }
      }

      const entropy = payload.injected_entropy ?? {};
      let damage = 0;
      if (spell.damage) {
        const injected = entropy.damage;
        if (!injected || injected.roll !== spell.damage.dice) {
          throw new RejectionError("bad_entropy", `damage roll must be ${spell.damage.dice}`);
        }
        damage = ctx.roll(spell.damage.dice, { dice: injected.dice, total: injected.total }).total;
      }

      const dc = Number(ctx.getComponent(caster, "spell_save_dc") ?? 10);
      const survivors: string[] = [];
      for (const id of targets) {
        let taken = damage;
        if (spell.save) {
          const save = entropy.target_saves?.[id];
          if (save === undefined || !Number.isInteger(save)) {
            throw new RejectionError("bad_entropy", `missing save for ${id}`);
          }
          if (save >= dc) taken = spell.save.onSuccess === "half" ? Math.floor(damage / 2) : 0;
        }
        const hpBefore = Number(ctx.getComponent(id, "hp") ?? 0);
        const hpAfter = Math.max(0, hpBefore - taken);
        if (taken > 0) ctx.setComponent(id, "hp", hpAfter);
        if (hpAfter === 0) ctx.addCondition(id, "dead");
        else survivors.push(id);
      }

      if (spell.effect) {
        for (const id of survivors) {
          const effect = makeEffect(
            { id: `${ctx.intent.intent_id}:${id}`, target: id, source: caster, name: spell.effect.name, duration_rounds: spell.effect.duration_rounds },
            state.round,
          );
          ctx.tx.add("/effects/-", effect);
        }
      }

      if (spell.level > 0) ctx.setComponent(caster, slotKey, slots - 1);
      return true;
    },
  };
}
