import { describe, expect, it } from "vitest";
import {
  buildEmberSession,
  BLAST_POINT,
  createEmberRuleset,
  emberEntries,
  emberSchemas,
  type EmberSpell,
  GOBLIN_1,
  GOBLIN_2,
  WIZARD,
} from "@ttrpg-engine/example-ember";
import { createEngine, type SessionState } from "@ttrpg-engine/interactions";
import { createCompendium } from "@ttrpg-engine/rules";
import { vec3, wall } from "@ttrpg-engine/spatial";

import {
  areaFor,
  createPipeline,
  createSessionRegistry,
  name,
  seededEntropy,
  tokensFromState,
  type EntropyProvider,
} from "../src/index.js";

function compendium() {
  const c = createCompendium();
  for (const schema of emberSchemas) c.registerSchema(schema);
  return c.register(emberEntries);
}

const spells = compendium();
const ruleset = createEmberRuleset((id) => spells.get("spell", id) as EmberSpell | undefined);

function pipeline(session: SessionState = buildEmberSession(), entropy?: EntropyProvider) {
  return createPipeline({ engine: createEngine({ ruleset, session }), spells, entropy });
}

const DICE = [[5, 3, 1, 6, 4, 2, 4, 3]];
const SAVES = { [GOBLIN_1]: 12, [GOBLIN_2]: 19 };

function blast(p = pipeline(), extra: object = {}) {
  return p.castSpell({
    intent_id: "req_88a9f",
    source: WIZARD,
    spell_id: "fireball",
    targeting: { mode: "area", at: BLAST_POINT, ...extra },
    entropy: { damage: { dice: DICE }, target_saves: SAVES },
  });
}

describe("orchestrator fireball pipeline", () => {
  it("exposes its identity", () => {
    expect(name).toBe("@ttrpg-engine/orchestrator");
  });

  it("1. resolves fireball from a validated compendium", () => {
    expect(spells.get("spell", "fireball")).toMatchObject({
      area: { shape: "sphere", size: 20 },
      damage: { dice: "8d6", kind: "fire" },
      save: { ability: "dex", onSuccess: "half" },
    });
  });

  it("2. picks every token inside the 20-ft globe, and not the caster", () => {
    const { targets } = blast();
    expect(targets).toEqual([GOBLIN_1, GOBLIN_2]);
  });

  it("2. respects elevation: a goblin flying 40 ft up is out of the blast", () => {
    const s = buildEmberSession();
    s.entities[GOBLIN_2]!.components.position = { x: 70, y: 10, z: 40 };
    expect(blast(pipeline(s)).targets).toEqual([GOBLIN_1]);
  });

  it("2. respects cover: a wall between the blast and a goblin shields it", () => {
    const shield = [wall(vec3(68, -20, 0), vec3(68, 30, 0), 0, 10)]; // x = 68, between centre (65) and goblin-2 (70)
    expect(blast(pipeline(), { obstacles: shield }).targets).toEqual([GOBLIN_1]);
  });

  it("3+4. dispatches the injected dice and emits the full delta", () => {
    const { intent, response } = blast();
    expect(intent?.payload).toEqual({
      spell_id: "fireball",
      targets: [GOBLIN_1, GOBLIN_2],
      injected_entropy: { damage: { dice: DICE, roll: "8d6" }, target_saves: SAVES },
    });
    expect(response.status).toBe("success");
    const roll = response.delta[0]!.value as { dice: Array<{ face: number }>; total: number };
    expect(roll.dice.map((d) => d.face)).toEqual(DICE[0]);
    expect(roll.total).toBe(28);
    expect(response.delta.slice(1).map((op) => [op.op, op.path, op.value])).toEqual([
      ["replace", `/entities/${GOBLIN_1}/components/hp`, 0],
      ["add", `/entities/${GOBLIN_1}/components/conditions`, ["dead"]],
      ["replace", `/entities/${GOBLIN_2}/components/hp`, 14],
      ["add", "/effects/-", expect.objectContaining({ target: GOBLIN_2, name: "scorched", expires_on_round: 2 })],
      ["replace", `/entities/${WIZARD}/components/spell_slots_3`, 1],
    ]);
  });

  it("5. NEXT_TURN purges the spell's 1-round effect exactly once", () => {
    const p = pipeline();
    blast(p);
    const removes = [1, 2, 3, 4].map(
      (i) =>
        p.engine
          .dispatch({ intent_id: `t${i}`, type: "NEXT_TURN", source: "system", payload: {} })
          .delta.filter((op) => op.op === "remove" && op.path.startsWith("/effects/")).length,
    );
    expect(removes).toEqual([0, 0, 1, 0]);
  });

  it("6. seeded entropy is deterministic: same seed → byte-identical state and delta", () => {
    const run = (seed: string) => {
      const p = pipeline(buildEmberSession(), seededEntropy(seed));
      const res = p.castSpell({ intent_id: "r", source: WIZARD, spell_id: "fireball", targeting: { mode: "area", at: BLAST_POINT } });
      return JSON.stringify([res, p.engine.getState()]);
    };
    expect(run("ember-1")).toBe(run("ember-1"));
    expect(run("ember-1")).not.toBe(run("ember-2"));
  });

  it("seeded saves add the target's save bonus and stay in d20 range", () => {
    const p = pipeline(buildEmberSession(), seededEntropy(7));
    const { intent } = p.castSpell({ intent_id: "r", source: WIZARD, spell_id: "fireball", targeting: { mode: "ids", ids: [GOBLIN_1, GOBLIN_2] } });
    const saves = (intent!.payload as { injected_entropy: { target_saves: Record<string, number> } }).injected_entropy.target_saves;
    expect(Object.keys(saves)).toEqual([GOBLIN_1, GOBLIN_2]);
    for (const v of Object.values(saves)) {
      expect(v).toBeGreaterThanOrEqual(3); // d20 + 2
      expect(v).toBeLessThanOrEqual(22);
    }
  });

  it("injected values win; the provider only fills gaps", () => {
    const p = pipeline(buildEmberSession(), seededEntropy(1));
    const { intent } = p.castSpell({
      intent_id: "r", source: WIZARD, spell_id: "fireball",
      targeting: { mode: "ids", ids: [GOBLIN_1, GOBLIN_2] },
      entropy: { damage: { dice: DICE }, target_saves: { [GOBLIN_1]: 3 } },
    });
    const e = (intent!.payload as { injected_entropy: { damage: { dice: number[][] }; target_saves: Record<string, number> } }).injected_entropy;
    expect(e.damage.dice).toEqual(DICE);
    expect(e.target_saves[GOBLIN_1]).toBe(3);
    expect(e.target_saves[GOBLIN_2]).toEqual(expect.any(Number));
  });

  it("accepts pre-picked targets (grid selection / theater of the mind)", () => {
    const res = pipeline().castSpell({
      intent_id: "r", source: WIZARD, spell_id: "fireball",
      targeting: { mode: "ids", ids: [GOBLIN_2] },
      entropy: { damage: { dice: DICE }, target_saves: { [GOBLIN_2]: 1 } },
    });
    expect(res.targets).toEqual([GOBLIN_2]);
    expect(res.response.delta[1]).toEqual({ op: "replace", path: `/entities/${GOBLIN_2}/components/hp`, value: 0 });
  });

  it("an empty blast still spends the slot", () => {
    const res = pipeline().castSpell({
      intent_id: "r", source: WIZARD, spell_id: "fireball",
      targeting: { mode: "area", at: vec3(500, 500, 0) },
      entropy: { damage: { dice: DICE } },
    });
    expect(res.targets).toEqual([]);
    expect(res.response.delta.at(-1)).toEqual({ op: "replace", path: `/entities/${WIZARD}/components/spell_slots_3`, value: 1 });
  });

  it("refuses before dispatch, with an empty delta and unchanged state", () => {
    const p = pipeline();
    const before = JSON.stringify(p.engine.getState());
    const cases = [
      [{ spell_id: "wish", targeting: { mode: "ids", ids: [] } }, "unknown_spell"],
      [{ spell_id: "fireball", targeting: { mode: "ids", ids: [GOBLIN_1] } }, "entropy_required"],
    ] as const;
    for (const [req, code] of cases) {
      const res = p.castSpell({ intent_id: "r", source: WIZARD, ...req });
      expect(res.intent).toBeUndefined();
      expect(res.response).toMatchObject({ response_to: "r", status: "rejected", delta: [], meta: { code } });
    }
    expect(JSON.stringify(p.engine.getState())).toBe(before);
  });

  it("passes engine rejections through (bad injected dice)", () => {
    const res = pipeline().castSpell({
      intent_id: "r", source: WIZARD, spell_id: "fireball",
      targeting: { mode: "ids", ids: [] },
      entropy: { damage: { dice: [[7, 7, 7, 7, 7, 7, 7, 7]] } },
    });
    expect(res.response).toMatchObject({ status: "rejected", delta: [] });
  });
});

describe("areaFor", () => {
  const at = vec3(0, 0, 0);
  it("builds spheres, cubes and cones", () => {
    expect(areaFor({ area: { shape: "sphere", size: 20 } }, at)).toMatchObject({ kind: "sphere", radius: 20 });
    expect(areaFor({ area: { shape: "cube", size: 10 } }, at)).toMatchObject({ kind: "cuboid" });
    expect(areaFor({ area: { shape: "cone", size: 15 } }, at, vec3(3, 4, 0))).toEqual({
      kind: "cone", apex: at, axis: { x: 9, y: 12, z: 0 }, spread: 0.5,
    });
  });
  it("explains what is missing", () => {
    expect(areaFor({}, at)).toBe("no_area");
    expect(areaFor({ area: { shape: "sphere", size: Number.NaN } }, at)).toBe("no_area");
    expect(areaFor({ area: { shape: "cone", size: 15 } }, at)).toBe("cone_needs_direction");
    expect(areaFor({ area: { shape: "cone", size: 15 } }, at, vec3(0, 0, 0))).toBe("cone_needs_direction");
    expect(areaFor({ area: { shape: "line", size: 60 } }, at)).toBe("unsupported_area");
  });
});

describe("tokensFromState", () => {
  it("reads position + radius components and skips entities without a position", () => {
    const s = buildEmberSession();
    s.entities.ghost = { id: "ghost", components: { position: { x: "nope" } } };
    s.entities.flat = { id: "flat", components: { position: { x: 1, y: 2 }, radius: -1 } };
    expect(tokensFromState(s)).toEqual([
      { id: WIZARD, position: { x: 0, y: 0, z: 0 }, radius: 2.5 },
      { id: GOBLIN_1, position: { x: 60, y: 0, z: 0 }, radius: 2.5 },
      { id: GOBLIN_2, position: { x: 70, y: 10, z: 0 }, radius: 2.5 },
      { id: "flat", position: { x: 1, y: 2, z: 0 }, radius: 0 },
    ]);
  });
});

describe("session registry", () => {
  it("opens, dispatches to and closes independent sessions", () => {
    const reg = createSessionRegistry({ ruleset, spells, entropy: (id) => seededEntropy(id) });
    const a = reg.open("a", buildEmberSession());
    reg.open("b", buildEmberSession());
    expect(() => reg.open("a", buildEmberSession())).toThrow(/already open/);
    expect(reg.ids()).toEqual(["a", "b"]);

    a.castSpell({ intent_id: "r", source: WIZARD, spell_id: "fireball", targeting: { mode: "area", at: BLAST_POINT } });
    expect(reg.get("a")!.engine.getState().entities[WIZARD]!.components.spell_slots_3).toBe(1);
    expect(reg.get("b")!.engine.getState().entities[WIZARD]!.components.spell_slots_3).toBe(2);

    expect(reg.dispatch("b", { intent_id: "n", type: "NEXT_TURN", source: "system", payload: {} }).status).toBe("success");
    expect(reg.dispatch("zzz", { intent_id: "n", type: "NEXT_TURN", source: "system", payload: {} })).toEqual({
      response_to: "n", status: "rejected", delta: [], meta: { code: "unknown_session" },
    });
    expect(reg.close("a")).toBe(true);
    expect(reg.get("a")).toBeUndefined();
  });
});
