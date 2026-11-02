import { describe, expect, it } from "vitest";
import { createEngine, type Intent } from "@ttrpg-engine/interactions";

import {
  buildEmberSession,
  createEmberRuleset,
  emberSpells,
  fireball,
  GOBLIN_1,
  GOBLIN_2,
  name,
  WIZARD,
} from "../src/index.js";

const getSpell = (id: string) => emberSpells.find((s) => s.id === id);

function engine() {
  return createEngine({ ruleset: createEmberRuleset(getSpell), session: buildEmberSession() });
}

function cast(overrides: Partial<Intent> & { payload?: unknown } = {}): Intent {
  return {
    intent_id: "req_88a9f",
    type: "CAST_SPELL",
    source: WIZARD,
    payload: {
      spell_id: "fireball",
      targets: [GOBLIN_1, GOBLIN_2],
      injected_entropy: {
        damage: { roll: "8d6", dice: [[5, 3, 1, 6, 4, 2, 4, 3]] },
        target_saves: { [GOBLIN_1]: 12, [GOBLIN_2]: 19 },
      },
    },
    ...overrides,
  };
}

describe("ember pack", () => {
  it("exposes its identity and the fireball content", () => {
    expect(name).toBe("@ttrpg-engine/example-ember");
    expect(fireball).toMatchObject({ level: 3, area: { shape: "sphere", size: 20 }, damage: { dice: "8d6" } });
  });

  it("resolves fireball: full damage on a failed save, half on a success", () => {
    const e = engine();
    const res = e.dispatch(cast());
    expect(res.status).toBe("success");
    expect(res.delta).toEqual([
      { op: "add", path: "/history/rolls/-", value: expect.objectContaining({ plan: "8d6", total: 28 }) },
      { op: "replace", path: `/entities/${GOBLIN_1}/components/hp`, value: 0 },
      { op: "add", path: `/entities/${GOBLIN_1}/components/conditions`, value: ["dead"] },
      { op: "replace", path: `/entities/${GOBLIN_2}/components/hp`, value: 14 },
      {
        op: "add",
        path: "/effects/-",
        value: { id: `req_88a9f:${GOBLIN_2}`, target: GOBLIN_2, source: WIZARD, name: "scorched", expires_on_round: 2 },
      },
      { op: "replace", path: `/entities/${WIZARD}/components/spell_slots_3`, value: 1 },
    ]);
  });

  it("purges the 1-round effect exactly once, when round 2 begins", () => {
    const e = engine();
    e.dispatch(cast());
    const purges = [1, 2, 3, 4].map((i) =>
      e.dispatch({ intent_id: `t${i}`, type: "NEXT_TURN", source: "system", payload: {} })
        .delta.filter((op) => op.op === "remove" && op.path.startsWith("/effects/")).length,
    );
    expect(purges).toEqual([0, 0, 1, 0]);
    expect(e.getState().effects).toEqual([]);
  });

  it("rejects with an empty delta and leaves state untouched", () => {
    const cases: Array<[unknown, string]> = [
      [{ spell_id: "wish", targets: [] }, "unknown_spell"],
      [{ spell_id: "fireball" }, "invalid_payload"],
      [{ spell_id: "fireball", targets: ["nobody"], injected_entropy: {} }, "unknown_entity"],
      [{ spell_id: "fireball", targets: [GOBLIN_1, GOBLIN_1], injected_entropy: {} }, "duplicate_target"],
      [{ spell_id: "fireball", targets: [GOBLIN_1], injected_entropy: { damage: { roll: "1d4", dice: [[4]] } } }, "bad_entropy"],
      [{ spell_id: "fireball", targets: [GOBLIN_1], injected_entropy: { damage: { roll: "8d6", dice: [[9, 9, 9, 9, 9, 9, 9, 9]] } } }, "entropy_mismatch"],
      [{ spell_id: "fireball", targets: [GOBLIN_1], injected_entropy: { damage: { roll: "8d6", total: 20 } } }, "bad_entropy"],
    ];
    for (const [payload, code] of cases) {
      const e = engine();
      const before = JSON.stringify(e.getState());
      const res = e.dispatch(cast({ payload }));
      expect(res.status, code).toBe("rejected");
      expect(res.delta).toEqual([]);
      expect(res.meta?.code, JSON.stringify(payload)).toBe(code);
      expect(JSON.stringify(e.getState())).toBe(before);
    }
  });

  it("refuses to cast without a spell slot", () => {
    const e = engine();
    e.dispatch(cast());
    e.dispatch(cast({ intent_id: "again", payload: { spell_id: "fireball", targets: [], injected_entropy: { damage: { roll: "8d6", total: 8 } } } }));
    const res = e.dispatch(cast({ intent_id: "third", payload: { spell_id: "fireball", targets: [], injected_entropy: { damage: { roll: "8d6", total: 8 } } } }));
    expect(res.meta?.code).toBe("no_spell_slot");
  });

  it("leaves other intent types to the engine", () => {
    const res = engine().dispatch({ intent_id: "x", type: "DANCE", source: WIZARD, payload: {} });
    expect(res.meta?.code).toBe("unknown_type");
  });
});
