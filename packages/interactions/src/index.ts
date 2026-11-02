/**
 * @ttrpg-engine/interactions — the live-session state machine.
 *
 * Strict Intents in, RFC 6902 deltas out. Deterministic by construction:
 * no unseeded entropy, injected dice only, reducers emit ops directly.
 *
 * @example
 * ```ts
 * import { createSession, createEngine } from "@ttrpg-engine/interactions";
 *
 * const engine = createEngine({ session: createSession() });
 * const res = engine.dispatch({
 *   intent_id: "req_1", type: "NEXT_TURN", source: "system", payload: {},
 * });
 * res.delta; // [{ op: "replace", path: "/round", value: 2 }, …]
 * ```
 */
export const name = "@ttrpg-engine/interactions" as const;
export const version = "0.1.0" as const;

export * from "./types.js";
export * from "./session.js";
export * from "./engine.js";
export * from "./reducer.js";
export * from "./temporal.js";
export * from "./ops.js";
export * from "./diff.js";
export * from "./dice/notation.js";
export * from "./dice/entropy.js";
export * from "./dice/prng.js";