/**
 * @ttrpg-engine/example-fireball — the fireball vertical slice as a consumer
 * would write it: host wiring (compendium + ruleset + session registry) and a
 * headless demo that logs the blast. `pnpm --filter @ttrpg-engine/example-fireball demo`
 * prints it; server.js serves the same host over HTTP.
 */
export const name = "@ttrpg-engine/example-fireball" as const;
export const version = "0.1.0" as const;

export * from "./demo.js";
export * from "./host.js";
