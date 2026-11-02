/**
 * The canonical deterministic scenario: a fireball-shaped CAST_SPELL through
 * a minimal "ember" ruleset, followed by two NEXT_TURNs.
 *
 * Used by golden.test.ts (byte-stable contract) and determinism.test.ts
 * (identical across module systems). Do not change its math without updating
 * the golden file via UPDATE_GOLDEN=1.
 */
import * as srcApi from "../src/index.js";
import {
  RejectionError,
  type ReducerContext,
  type Response,
  type Ruleset,
  type SessionState,
} from "../src/index.js";

const FIREBALL_DC = 15;

/** The subset of the package API the scenario needs (src or a built bundle). */
export interface ScenarioApi {
  createEngine: typeof srcApi.createEngine;
  createSession: typeof srcApi.createSession;
  RejectionError: typeof RejectionError;
}

export const emberRuleset: Ruleset = makeEmberRuleset(RejectionError);

export function makeEmberRuleset(Rejection: typeof RejectionError): Ruleset {
  return {
  id: "ember",
  handle(type, ctx: ReducerContext): boolean {
    if (type !== "CAST_SPELL") return false;
    const payload = ctx.intent.payload as {
      spell_id: string;
      targets: string[];
      injected_entropy: {
        damage: { roll: string; dice: number[][] };
        target_saves: Record<string, number>;
      };
    };
    if (payload.spell_id !== "fireball") throw new Rejection("unknown_spell");

    // One resolved damage roll, emitted into the delta as a RollResult.
    const damage = ctx.roll(payload.injected_entropy.damage.roll, {
      dice: payload.injected_entropy.damage.dice,
    });

    for (const targetId of payload.targets) {
      const target = ctx.tx.getState().entities[targetId];
      if (!target) throw new Rejection("unknown_entity", `no target: ${targetId}`);
      const save = payload.injected_entropy.target_saves[targetId];
      if (save === undefined || !Number.isInteger(save)) {
        throw new Rejection("bad_entropy", `missing save for ${targetId}`);
      }
      const hpBefore = Number(target.components.hp);
      const hpAfter = hpBefore - (save >= FIREBALL_DC ? Math.floor(damage.total / 2) : damage.total);
      ctx.setComponent(targetId, "hp", Math.max(0, hpAfter));
      if (hpAfter <= 0) ctx.addCondition(targetId, "dead");
    }

    // The caster spends a level-3 spell slot.
    const caster = payload.targets.length > 0 ? ctx.intent.source : "system";
    const sourceEntity = ctx.tx.getState().entities[caster];
    if (sourceEntity) {
      const slots: number = Number(sourceEntity.components.spell_slots_3 ?? 0);
      ctx.setComponent(caster, "spell_slots_3", Math.max(0, slots - 1));
    }
    return true;
  },
  };
}

export interface ScenarioOutput {
  state: SessionState;
  responses: Response[];
}

export function buildInitialSession(api: ScenarioApi = srcApi): SessionState {
  const s = api.createSession({
    sessionId: "ember-session-1",
    phase: "combat",
    round: 1,
    turnIndex: 0,
  });
  s.initiative_roster = [
    { id: "uuid-wizard-1", group: "party", roll: 18, order: 0 },
    { id: "uuid-goblin-1", group: "foes", roll: 12, order: 1 },
    { id: "uuid-goblin-2", group: "foes", roll: 8, order: 2 },
  ];
  s.entities["uuid-wizard-1"] = {
    id: "uuid-wizard-1",
    kind: "player",
    components: { hp: 20, spell_slots_3: 2 },
  };
  s.entities["uuid-goblin-1"] = {
    id: "uuid-goblin-1",
    kind: "monster",
    components: { hp: 6 },
  };
  s.entities["uuid-goblin-2"] = {
    id: "uuid-goblin-2",
    kind: "monster",
    components: { hp: 28 },
  };

  return s;
}

export function runScenario(api: ScenarioApi = srcApi): ScenarioOutput {
  const engine = api.createEngine({
    ruleset: api === srcApi ? emberRuleset : makeEmberRuleset(api.RejectionError),
    session: buildInitialSession(api),
  });
  const responses: Response[] = [];

  responses.push(
    engine.dispatch({
      intent_id: "req_88a9f",
      type: "CAST_SPELL",
      source: "uuid-wizard-1",
      payload: {
        spell_id: "fireball",
        targets: ["uuid-goblin-1", "uuid-goblin-2"],
        injected_entropy: {
          damage: { roll: "8d6", dice: [[5, 3, 1, 6, 4, 2, 4, 3]] },
          target_saves: { "uuid-goblin-1": 12, "uuid-goblin-2": 19 },
        },
      },
    }),
  );

  responses.push(
    engine.dispatch({ intent_id: "turn_1", type: "NEXT_TURN", source: "system", payload: {} }),
  );
  responses.push(
    engine.dispatch({ intent_id: "turn_2", type: "NEXT_TURN", source: "system", payload: {} }),
  );

  return { state: engine.getState(), responses };
}