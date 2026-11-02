/**
 * @ttrpg-engine/example-ember — a tiny example game system.
 *
 * Content (schemas + entries) is data; `createEmberRuleset` is the game logic
 * the interactions engine runs. Not intended as published game content; it
 * exists to prove the engine end to end (PRD §9) and as a model for system packs.
 */
export const name = "@ttrpg-engine/example-ember" as const;
export const version = "0.1.0" as const;

export * from "./content.js";
export * from "./ruleset.js";
export * from "./scene.js";
