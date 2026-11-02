/**
 * A fresh third-party project using the packed tarballs (ESM).
 * Mirrors the quickstarts in packages/interactions and packages/orchestrator
 * READMEs; if this breaks, update the READMEs too.
 */
import assert from "node:assert/strict";
import {
  createEngine,
  createSession,
  addEntity,
  replayOps,
  RejectionError,
  resolveRoll,
  parseNotation,
  dicePool,
  Prng,
} from "@ttrpg-engine/interactions";
import { createCompendium } from "@ttrpg-engine/rules";
import { createPipeline, seededEntropy } from "@ttrpg-engine/orchestrator";
import { hexDistance } from "@ttrpg-engine/grid";
import { referenceBackend } from "@ttrpg-engine/spatial";

// --- interactions README: a tiny ruleset with one custom intent ---------------
const ruleset = {
  id: "my-game",
  handle(type, ctx) {
    if (type !== "ATTACK") return false;
    const { target, entropy } = ctx.intent.payload;
    const hit = ctx.roll("1d20+5", entropy);
    if (hit.total < 12) throw new RejectionError("miss", `rolled ${hit.total}`);
    const hp = ctx.getComponent(target, "hp");
    ctx.setComponent(target, "hp", hp - 3);
    return true;
  },
};

let state = createSession({ sessionId: "demo" });
state = addEntity(state, { id: "hero", components: { hp: 10 } });
state = addEntity(state, { id: "orc", components: { hp: 8 } });
const engine = createEngine({ ruleset, session: state });

const client = structuredClone(engine.getState());
const res = engine.dispatch({
  intent_id: "req_1",
  type: "ATTACK",
  source: "hero",
  payload: { target: "orc", entropy: { dice: [[14]] } },
});
assert.equal(res.status, "success");
assert.deepEqual(replayOps(client, res.delta), engine.getState());
assert.equal(engine.getState().entities.orc.components.hp, 5);

const miss = engine.dispatch({
  intent_id: "req_2",
  type: "ATTACK",
  source: "hero",
  payload: { target: "orc", entropy: { dice: [[2]] } },
});
assert.equal(miss.status, "rejected");
assert.equal(miss.meta.code, "miss");
assert.deepEqual(miss.delta, []);

// --- interactions README: dice section ------------------------------------------
assert.equal(resolveRoll(parseNotation("4d6kh3"), { dice: [[5, 3, 1, 6]] }).total, 14);
assert.equal(resolveRoll(parseNotation("1d20"), { total: 17 }).total, 17);
const pool = dicePool([{ count: 2, faces: 6 }, { count: 1, faces: 4 }]);
assert.equal(resolveRoll(pool, { dice: [[6, 5], [3]] }).total, 14);
assert.equal(typeof new Prng("seed").die(20), "number");

// --- orchestrator README: a spell cast through the pipeline -------------------
const spells = createCompendium().register([
  { type: "spell", id: "burst", name: "Burst", area: { shape: "sphere", size: 10 }, damage: { dice: "2d6" } },
]);
let arena = createSession();
arena = addEntity(arena, { id: "mage", components: { position: { x: 0, y: 0, z: 0 } } });
arena = addEntity(arena, { id: "rat", components: { hp: 7, position: { x: 30, y: 0, z: 0 } } });
arena = addEntity(arena, { id: "far-rat", components: { hp: 7, position: { x: 90, y: 0, z: 0 } } });

const spellRuleset = {
  id: "my-game",
  handle(type, ctx) {
    if (type !== "CAST_SPELL") return false;
    const { targets, injected_entropy } = ctx.intent.payload;
    const dmg = ctx.roll(injected_entropy.damage.roll, injected_entropy.damage);
    for (const id of targets) ctx.setComponent(id, "hp", ctx.getComponent(id, "hp") - dmg.total);
    return true;
  },
};
const pipeline = createPipeline({
  engine: createEngine({ ruleset: spellRuleset, session: arena }),
  spells,
  entropy: seededEntropy("table-1"),
});
const cast = pipeline.castSpell({
  intent_id: "req_3",
  source: "mage",
  spell_id: "burst",
  targeting: { mode: "area", at: { x: 30, y: 0, z: 0 } },
  entropy: { damage: { dice: [[4, 2]] } },
});
assert.deepEqual(cast.targets, ["rat"]);
assert.equal(cast.response.status, "success");
assert.equal(pipeline.engine.getState().entities.rat.components.hp, 1);

// --- grid + spatial load and work -----------------------------------------------
assert.equal(hexDistance({ q: 0, r: 0 }, { q: 3, r: -2 }), 3);
assert.equal(typeof referenceBackend.selectTargets, "function");

console.log("consumer (esm): ok");
