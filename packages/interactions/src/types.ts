/**
 * Core types of the live-session engine.
 *
 * State is plain JSON (serializable anywhere), entities are pure ECS
 * (UUID → arbitrary components), and all communication happens through
 * Intents (in) and RFC 6902 deltas (out).
 */

/** String UUID identifying an entity. */
export type EntityId = string;

/** One active element (player, npc, monster, …): arbitrary key-value components. */
export interface Entity {
  id: EntityId;
  kind?: string;
  components: Record<string, unknown>;
}

/** Initiative roster entry (turn order). */
export interface InitEntry {
  id: EntityId;
  group: string;
  roll: number;
  order: number;
}

/** A clinical effect with a mandatory expiry round (purged by NEXT_TURN). */
export interface Effect {
  id: string;
  target: EntityId;
  source: EntityId | "system";
  name: string;
  /** First round during which the effect no longer applies. */
  expires_on_round: number;
}

/** A resolved dice roll (per-die breakdown — rendered identically everywhere). */
export interface DieRoll {
  die: string; // e.g. "d6"
  face: number; // 1..faces
  value: number;
  kept: boolean;
}

export interface RollResult {
  plan: string; // canonical notation, e.g. "2d20kh1"
  dice: DieRoll[];
  modifiers: Array<{ op: "add" | "sub"; value: number }>;
  total: number;
}

/** Immutable session state. Plain JSON; insertion-ordered collections. */
export interface SessionStateV1 {
  version: 1;
  session_id: string;
  phase: string;
  round: number;
  turn_index: number;
  initiative_roster: InitEntry[];
  entities: Record<EntityId, Entity>;
  effects: Effect[];
  resources: Record<string, unknown>;
  history: {
    rolls: RollResult[];
  };
  log: string[];
}

export type SessionState = SessionStateV1;

/** RFC 6902 JSON Patch operation. */
export interface JsonPatchOp {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

/** A strict action request from a client. Entropy is always injected. */
export interface Intent<T extends string = string, P = unknown> {
  intent_id: string;
  type: T;
  source: EntityId | "system";
  payload: P;
}

/** The engine's reply: the exact delta every client should apply. */
export interface Response<T extends "success" | "rejected" | "error" = "success" | "rejected" | "error"> {
  response_to: string;
  status: T;
  delta: JsonPatchOp[];
  meta?: Record<string, unknown>;
}

/** Rejection raised by reducers/validation; maps to status "rejected". */
export class RejectionError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "RejectionError";
    this.code = code;
  }
}