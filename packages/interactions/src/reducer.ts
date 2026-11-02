/**
 * Transactional reducer layer: reducers mutate a working copy and append RFC
 * 6902 ops *while* they go — the delta is exact by construction, never diffed.
 */
import type { EntityId, Intent, JsonPatchOp, RollResult, SessionState } from "./types.js";
import { RejectionError } from "./types.js";
import { resolveRoll } from "./dice/entropy.js";
import type { EntropyInput } from "./dice/entropy.js";
import { parseNotation, type RollPlan } from "./dice/notation.js";
import { applyPatchOp, cloneJson, escapePointerToken as esc } from "./ops.js";

export class Tx {
  private state: SessionState;
  readonly ops: JsonPatchOp[] = [];

  constructor(initial: SessionState) {
    this.state = cloneJson(initial);
  }

  getState(): SessionState {
    return this.state;
  }

  replace(path: string, value: unknown): void {
    this.push({ op: "replace", path, value });
  }

  add(path: string, value: unknown): void {
    this.push({ op: "add", path, value });
  }

  remove(path: string): void {
    this.push({ op: "remove", path });
  }

  private push(op: JsonPatchOp): void {
    applyPatchOp(this.state, op);
    this.ops.push(op);
  }
}

/**
 * A game-system plug-in. The engine routes every non-builtin intent type to
 * `handle`; return `true` when the type was handled (ops emitted through
 * `ctx`), `false` for "not mine" (the engine rejects with `unknown_type`),
 * or throw a `RejectionError` for a semantic refusal (empty delta).
 */
export interface Ruleset {
  readonly id: string;
  handle(type: string, ctx: ReducerContext): boolean;
}

export interface ReducerContext {
  /** The working transaction: read state, and emit ops through the helpers. */
  tx: Tx;
  /** The intent being reduced. */
  intent: Intent;
  /**
   * Validate injected entropy and resolve a dice roll. Emits the full
   * per-die RollResult into the delta (append at /history/rolls/-) and
   * returns it for the rule math.
   */
  roll(notation: string | RollPlan, entropy: EntropyInput): RollResult;
  setComponent(entity: EntityId, key: string, value: unknown): void;
  getComponent(entity: EntityId, key: string): unknown;
  /** Push onto `components.conditions` (created if absent). */
  addCondition(entity: EntityId, condition: string): void;
  haveCondition(entity: EntityId, condition: string): boolean;
  log(message: string): void;
}

export function createContext(tx: Tx, intent: Intent): ReducerContext {
  return {
    tx,
    intent,
    roll(notation, entropy) {
      const plan = typeof notation === "string" ? parseNotation(notation) : notation;
      const result = resolveRoll(plan, entropy);
      this.tx.add("/history/rolls/-", result);
      return result;
    },
    setComponent(entity, key, value) {
      if (key === "__proto__") throw new RejectionError("bad_key", "refusing __proto__");
      const path = `/entities/${esc(entity)}`;
      const ent = this.tx.getState().entities[entity];
      if (!ent) throw new RejectionError("unknown_entity", `no entity: ${entity}`);
      const exists = Object.prototype.hasOwnProperty.call(ent.components, key);
      this.tx[exists ? "replace" : "add"](`${path}/components/${esc(key)}`, value);
    },
    getComponent(entity, key) {
      return this.tx.getState().entities[entity]?.components[key];
    },
    addCondition(entity, condition) {
      const ent = this.tx.getState().entities[entity];
      if (!ent) throw new RejectionError("unknown_entity", `no entity: ${entity}`);
      const conditions = Array.isArray(ent.components.conditions)
        ? (ent.components.conditions as unknown[])
        : null;
      if (conditions === null) {
        this.tx.add(`/entities/${esc(entity)}/components/conditions`, [condition]);
      } else {
        if (conditions.includes(condition)) return;
        this.tx.add(`/entities/${esc(entity)}/components/conditions/-`, condition);
      }
    },
    haveCondition(entity, condition) {
      const conditions = this.tx.getState().entities[entity]?.components.conditions;
      return Array.isArray(conditions) && conditions.includes(condition);
    },
    log(message) {
      this.tx.add("/log/-", message);
    },
  };
}