/**
 * Session creation and entity-level helpers.
 *
 * No unseeded entropy here: callers provide ids or derive them from a seeded
 * PRNG at the boundary (see dice/prng.js).
 */
import type { Effect, Entity, EntityId, SessionState } from "./types.js";

export function createSession(options: {
  sessionId?: string;
  phase?: string;
  round?: number;
  turnIndex?: number;
} = {}): SessionState {
  return {
    version: 1,
    session_id: options.sessionId ?? "session",
    phase: options.phase ?? "exploration",
    round: options.round ?? 1,
    turn_index: options.turnIndex ?? 0,
    initiative_roster: [],
    entities: {},
    effects: [],
    resources: {},
    history: { rolls: [] },
    log: [],
  };
}

export function addEntity(state: SessionState, entity: Entity): SessionState {
  state.entities[entity.id] = entity;
  return state;
}

export function getEntity(state: SessionState, id: EntityId): Entity | undefined {
  return state.entities[id];
}

export function removeEntity(state: SessionState, id: EntityId): SessionState {
  delete state.entities[id];
  state.effects = state.effects.filter((e) => e.target !== id && e.source !== id);
  return state;
}

/**
 * Compute expiry for a NEW effect: `duration_rounds` 1 on round 1 expires on
 * round 2 (purged the moment `round >= expires_on_round` — see temporal.js).
 */
export function computeExpiry(currentRound: number, durationRounds: number): number {
  return currentRound + durationRounds;
}

export function makeEffect(
  effect: Omit<Effect, "expires_on_round"> & { duration_rounds: number },
  currentRound: number,
): Effect {
  return {
    id: effect.id,
    target: effect.target,
    source: effect.source,
    name: effect.name,
    expires_on_round: computeExpiry(currentRound, effect.duration_rounds),
  };
}