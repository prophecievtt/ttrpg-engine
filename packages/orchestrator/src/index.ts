/**
 * @ttrpg-engine/orchestrator — the glue between the engine packages.
 *
 * Runs the fireball-style pipeline: rules query → target selection (spatial
 * area or pre-picked ids) → entropy binding → interactions dispatch, and
 * offers a thin session registry for hosts.
 *
 * @example
 * ```ts
 * import { createPipeline } from "@ttrpg-engine/orchestrator";
 *
 * const pipeline = createPipeline({ engine, spells: compendium });
 * const { targets, response } = pipeline.castSpell({
 *   intent_id: "req_1", source: "uuid-wizard-1", spell_id: "fireball",
 *   targeting: { mode: "area", at: { x: 65, y: 5, z: 0 } },
 *   entropy: { damage: { dice: [[5, 3, 1, 6, 4, 2, 4, 3]] }, target_saves: { … } },
 * });
 * ```
 */
export const name = "@ttrpg-engine/orchestrator" as const;
export const version = "0.1.0" as const;

export * from "./pipeline.js";
export * from "./sessions.js";
