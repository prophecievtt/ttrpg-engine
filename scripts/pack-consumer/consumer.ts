// Type-level check: the published .d.ts files resolve under Node16 module rules.
import { createEngine, createSession, type Ruleset, type Response } from "@ttrpg-engine/interactions";
import { createCompendium } from "@ttrpg-engine/rules";
import { createPipeline, type CastResult } from "@ttrpg-engine/orchestrator";
import { hexDistance, type AxialHex } from "@ttrpg-engine/grid";
import { referenceBackend, type Vec3 } from "@ttrpg-engine/spatial";
import { createJsValidator, type JsValidator } from "@ttrpg-engine/sandbox";

const ruleset: Ruleset = { id: "typed", handle: () => false };
const engine = createEngine({ ruleset, session: createSession() });
const res: Response = engine.dispatch({ intent_id: "a", type: "NEXT_TURN", source: "system", payload: {} });
const pipeline = createPipeline({ engine, spells: createCompendium(), spatial: referenceBackend });
const at: Vec3 = { x: 0, y: 0, z: 0 };
const cast: CastResult = pipeline.castSpell({
  intent_id: "b",
  source: "system",
  spell_id: "none",
  targeting: { mode: "area", at },
});
const origin: AxialHex = { q: 0, r: 0 };
export const results = [res.status, cast.response.status, hexDistance(origin, origin)];
export const sandboxed: Promise<JsValidator> = createJsValidator({
  base: createCompendium().validator,
  scripts: [{ id: "s", type: "t", source: "function validate() { return true }" }],
});
