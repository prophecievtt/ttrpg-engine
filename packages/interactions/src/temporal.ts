/**
 * The flow of time: turns, rounds, initiative, and effect expiry.
 */
import type { InitEntry, SessionState } from "./types.js";

/**
 * Compute the next (round, turn_index) pair.
 *
 * - With a roster: advance the turn; wrapping past the last entry increments
 *   the round (1-based).
 * - With an empty roster: rounds still advance (e.g. theater-of-the-mind
 *   clocks), turn_index stays 0.
 */
export function nextTurnPosition(
  roster: readonly InitEntry[],
  round: number,
  turnIndex: number,
): { round: number; turn_index: number } {
  const n = roster.length;
  if (n === 0) return { round: round + 1, turn_index: 0 };
  const next = (turnIndex + 1) % n;
  return { round: next === 0 ? round + 1 : round, turn_index: next };
}

/**
 * Indices of effects that must be purged, sorted DESCENDING so sequential
 * removal ops keep every lower index valid when clients replay the delta.
 */
export function expiredEffectIndices(state: SessionState, round: number): number[] {
  const indices: number[] = [];
  for (let i = state.effects.length - 1; i >= 0; i--) {
    if (state.effects[i]!.expires_on_round <= round) indices.push(i);
  }
  return indices;
}

/** The combatant whose turn is now (or null with an empty roster). */
export function currentCombatant(state: SessionState): InitEntry | null {
  const { initiative_roster, turn_index } = state;
  return initiative_roster[turn_index] ?? null;
}