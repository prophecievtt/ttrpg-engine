/**
 * Golden-file contract for the ember fireball through the full pipeline:
 * the dispatched intent, the delta, the state after the blast and the three
 * NEXT_TURNs that purge its effect must match test/golden/fireball.json byte
 * for byte. To change the contract on purpose, run with UPDATE_GOLDEN=1 and
 * review the JSON diff.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BLAST_POINT,
  buildEmberSession,
  createEmberRuleset,
  emberEntries,
  emberSchemas,
  type EmberSpell,
  GOBLIN_1,
  GOBLIN_2,
  WIZARD,
} from "@ttrpg-engine/example-ember";
import { createEngine, replayOps } from "@ttrpg-engine/interactions";
import { createCompendium } from "@ttrpg-engine/rules";
import { describe, expect, it } from "vitest";

import { createPipeline } from "../src/index.js";

const goldenPath = fileURLToPath(new URL("./golden/fireball.json", import.meta.url));

function run() {
  const spells = createCompendium();
  for (const schema of emberSchemas) spells.registerSchema(schema);
  spells.register(emberEntries);
  const ruleset = createEmberRuleset((id) => spells.get("spell", id) as EmberSpell | undefined);
  const pipeline = createPipeline({ engine: createEngine({ ruleset, session: buildEmberSession() }), spells });
  const cast = pipeline.castSpell({
    intent_id: "req_88a9f",
    source: WIZARD,
    spell_id: "fireball",
    targeting: { mode: "area", at: BLAST_POINT },
    entropy: { damage: { dice: [[5, 3, 1, 6, 4, 2, 4, 3]] }, target_saves: { [GOBLIN_1]: 12, [GOBLIN_2]: 19 } },
  });
  const after_cast = pipeline.engine.getState();
  const turns = [1, 2, 3].map((i) =>
    pipeline.engine.dispatch({ intent_id: `req_turn_${i}`, type: "NEXT_TURN", source: "system", payload: {} }),
  );
  return { cast, after_cast, turns, final: pipeline.engine.getState() };
}

describe("golden: orchestrator fireball", () => {
  it("matches the committed golden file byte for byte", () => {
    const actual = JSON.stringify(run(), null, 2) + "\n";
    if (process.env.UPDATE_GOLDEN === "1" || !existsSync(goldenPath)) writeFileSync(goldenPath, actual);
    expect(actual).toBe(readFileSync(goldenPath, "utf8"));
  });

  it("replaying every delta onto the initial state reproduces the final state", () => {
    const out = run();
    const ops = [out.cast.response, ...out.turns].flatMap((r) => r.delta);
    expect(replayOps(buildEmberSession(), ops)).toEqual(out.final);
  });
});
