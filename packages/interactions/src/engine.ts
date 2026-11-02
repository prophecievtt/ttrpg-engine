/**
 * The engine: strict Intent → validated delta dispatch.
 *
 * - Built-in system-agnostic intents (NEXT_TURN, ADD_ENTITY, REMOVE_ENTITY,
 *   SET_COMPONENT, REGISTER_EFFECT) are handled by the core.
 * - Everything else routes to the registered `Ruleset` (game systems plug in
 *   here); unknown types are rejected with an empty delta.
 */
import type { Entity, EntityId, Intent, Response, SessionState } from "./types.js";
import { RejectionError } from "./types.js";
import { makeEffect } from "./session.js";
import { createContext, Tx, type ReducerContext, type Ruleset } from "./reducer.js";
import { escapePointerToken as esc } from "./ops.js";
import { expiredEffectIndices, nextTurnPosition } from "./temporal.js";

export type { Ruleset };

export interface Engine {
  readonly rulesetId: string;
  getState(): SessionState;
  dispatch(intent: Intent): Response;
}

export interface EngineOptions {
  ruleset?: Ruleset;
  session?: SessionState;
}

const BUILTIN_TYPES = new Set([
  "NEXT_TURN",
  "ADD_ENTITY",
  "REMOVE_ENTITY",
  "SET_COMPONENT",
  "REGISTER_EFFECT",
]);

export function createEngine(options: EngineOptions = {}): Engine {
  const ruleset: Ruleset = options.ruleset ?? { id: "none", handle: () => false };
  if (!options.session) {
    throw new Error("engine requires an existing session state");
  }
  let state: SessionState = cloneState(options.session);

  function cloneState(session: SessionState): SessionState {
    return JSON.parse(JSON.stringify(session)) as SessionState;
  }

  function dispatch(intent: Intent): Response {
    // 1. Shape validation (strict envelopes only).
    // Intents arrive from untrusted frontends; re-check the envelope at runtime.
    if (!intent || typeof intent !== "object") {
      return rejected(undefined, "invalid_intent");
    }
    if (typeof intent.intent_id !== "string" || intent.intent_id === "") {
      return rejected(undefined, "invalid_intent");
    }
    if (typeof intent.type !== "string" || intent.type === "") {
      return rejected(intent.intent_id, "invalid_intent");
    }

    const tx = new Tx(state);
    const ctx = createContext(tx, intent);

    try {
      if (!validateSource(tx.getState(), intent)) {
        return rejected(intent.intent_id, "unknown_source");
      }

      let handled: boolean;
      if (BUILTIN_TYPES.has(intent.type)) {
        handled = runBuiltin(ctx);
      } else {
        handled = ruleset.handle(intent.type, ctx);
      }

      if (!handled) {
        return rejected(intent.intent_id, "unknown_type", intent.type);
      }

      state = tx.getState();
      return {
        response_to: intent.intent_id,
        status: "success",
        delta: tx.ops,
        meta: { ruleset: ruleset.id, ops: tx.ops.length },
      };
    } catch (err) {
      if (err instanceof RejectionError) {
        return rejected(intent.intent_id, err.code, err.message);
      }
      return {
        response_to: intent.intent_id,
        status: "error",
        delta: [],
        meta: { error: err instanceof Error ? err.message : "unknown_error" },
      };
    }
  }

  function validateSource(state: SessionState, intent: Intent): boolean {
    return intent.source === "system" || state.entities[intent.source] !== undefined;
  }

  return { rulesetId: ruleset.id, getState: () => state, dispatch };
}

function rejected(intentId: string | undefined, code: string, detail?: string): Response {
  return {
    response_to: intentId ?? "",
    status: "rejected",
    delta: [],
    meta: detail ? { code, detail } : { code },
  };
}

function runBuiltin(ctx: ReducerContext): boolean {
  const { tx, intent } = ctx;
  const state = tx.getState();
  switch (intent.type) {
    case "NEXT_TURN":
      return nextTurn(ctx);
    case "ADD_ENTITY": {
      const p = intent.payload as {
        id: EntityId;
        kind?: string;
        components?: Record<string, unknown>;
      };
      if (!p || typeof p.id !== "string") throw new RejectionError("bad_payload", "ADD_ENTITY requires id");
      if (state.entities[p.id]) throw new RejectionError("duplicate_entity", `entity exists: ${p.id}`);
      const entity: Entity = {
        id: p.id,
        kind: p.kind,
        components: p.components ?? {},
      };
      tx.add(`/entities/${esc(entity.id)}`, entity);
      ctx.log(`ADD_ENTITY ${entity.id}`);
      return true;
    }
    case "REMOVE_ENTITY": {
      const p = intent.payload as { id: EntityId };
      if (!p || typeof p.id !== "string") throw new RejectionError("bad_payload", "REMOVE_ENTITY requires id");
      if (!state.entities[p.id]) throw new RejectionError("unknown_entity", `no entity: ${p.id}`);
      // Effects referencing the entity go first, descending (index-safe).
      const doomed: number[] = [];
      const effects = tx.getState().effects;
      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i]!;
        if (e.target === p.id || e.source === p.id) doomed.push(i);
      }
      for (const i of doomed) tx.remove(`/effects/${i}`);
      tx.remove(`/entities/${esc(p.id)}`);
      ctx.log(`REMOVE_ENTITY ${p.id}`);
      return true;
    }
    case "SET_COMPONENT": {
      const p = intent.payload as { entity: EntityId; key: string; value: unknown };
      if (!p || typeof p.entity !== "string" || typeof p.key !== "string") {
        throw new RejectionError("bad_payload", "SET_COMPONENT requires entity + key");
      }
      ctx.setComponent(p.entity, p.key, p.value);
      return true;
    }
    case "REGISTER_EFFECT": {
      const p = intent.payload as {
        id: string;
        target: EntityId;
        source: EntityId | "system";
        name: string;
        duration_rounds: number;
      };
      if (!p || typeof p.id !== "string" || typeof p.target !== "string") {
        throw new RejectionError("bad_payload", "REGISTER_EFFECT requires id + target");
      }
      if (!state.entities[p.target]) {
        throw new RejectionError("unknown_entity", `no entity: ${p.target}`);
      }
      if (p.source !== "system" && !state.entities[p.source]) {
        throw new RejectionError("unknown_entity", `no entity: ${p.source}`);
      }
      if (!Number.isInteger(p.duration_rounds) || p.duration_rounds < 1) {
        throw new RejectionError("bad_payload", "duration_rounds must be a positive integer");
      }
      const effect = makeEffect(
        {
          id: p.id,
          target: p.target,
          source: p.source,
          name: p.name,
          duration_rounds: p.duration_rounds,
        },
        tx.getState().round,
      );
      tx.add("/effects/-", effect);
      return true;
    }
    default:
      return false;
  }
}

function nextTurn(ctx: ReducerContext): boolean {
  const { tx } = ctx;
  const state = tx.getState();
  const { round, turn_index } = nextTurnPosition(
    state.initiative_roster,
    state.round,
    state.turn_index,
  );
  const expired = expiredEffectIndices(state, round);
  // Removals are already sorted descending → replay-safe.
  for (const i of expired) tx.remove(`/effects/${i}`);
  tx.replace("/round", round);
  tx.replace("/turn_index", turn_index);
  const combatant = state.initiative_roster[turn_index];
  ctx.log(
    `NEXT_TURN → round ${round}, turn ${turn_index}` +
      (combatant ? ` (${combatant.id})` : ""),
  );
  return true;
}