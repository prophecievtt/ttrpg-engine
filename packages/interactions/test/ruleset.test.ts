import { describe, expect, it } from "vitest";

import {
  createEngine,
  createSession,
  RejectionError,
  type ReducerContext,
  type Ruleset,
} from "../src/index.js";

/**
 * A tiny example ruleset: "BURN" applies fire damage from injected entropy.
 * Demonstrates the system-extension contract (handles non-builtin intent types).
 */
const pyreRuleset: Ruleset = {
  id: "pyre",
  handle(type, ctx: ReducerContext): boolean {
    if (type !== "BURN") return false;
    const payload = ctx.intent.payload as {
      target: string;
      roll_notation: string;
      dice: number[][];
    };
    const result = ctx.roll(payload.roll_notation, { dice: payload.dice });
    const target = ctx.tx.getState().entities[payload.target];
    if (!target) throw new Error("ruleset bug: unknown target");
    const hp = Number(target.components.hp ?? 0);
    ctx.setComponent(payload.target, "hp", hp - result.total);
    if (hp - result.total <= 0) ctx.addCondition(payload.target, "dead");
    return true;
  },
};

function setup() {
  const s = createSession({ sessionId: "pyre" });
  s.entities["torch"] = { id: "torch", components: { hp: 6 } };
  return createEngine({ ruleset: pyreRuleset, session: s });
}

describe("ruleset extension contract", () => {
  it("routes non-builtin intents to the registered ruleset", () => {
    const engine = setup();
    const res = engine.dispatch({
      intent_id: "burn-1",
      type: "BURN",
      source: "system",
      payload: { target: "torch", roll_notation: "8d6", dice: [[4, 4, 4, 4, 4, 4, 4, 4]] },
    });
    expect(res.status).toBe("success");
    expect(engine.getState().entities["torch"]?.components.hp).toBe(6 - 32);
    expect(engine.getState().log).toEqual([]);
  });

  it("emits the full per-die roll breakdown into the delta", () => {
    const engine = setup();
    const res = engine.dispatch({
      intent_id: "burn-1",
      type: "BURN",
      source: "system",
      payload: { target: "torch", roll_notation: "2d6kh1", dice: [[2, 5]] },
    });
    expect(res.status).toBe("success");
    const rollOp = res.delta.find(
      (op) => op.op === "add" && op.path === "/history/rolls/-",
    );
    expect(rollOp).toMatchObject({
      value: {
        plan: "2d6kh1",
        total: 5,
        dice: [
          { die: "d6", face: 2, value: 2, kept: false },
          { die: "d6", face: 5, value: 5, kept: true },
        ],
      },
    });
  });

  it("applies death condition when hp reaches zero", () => {
    const engine = setup();
    const res = engine.dispatch({
      intent_id: "burn-1",
      type: "BURN",
      source: "system",
      payload: { target: "torch", roll_notation: "1d6", dice: [[6]] },
    });
    expect(res.status).toBe("success");
    expect(engine.getState().entities["torch"]?.components.conditions).toEqual(["dead"]);
    expect(res.delta).toContainEqual({
      op: "add",
      path: "/entities/torch/components/conditions",
      value: ["dead"],
    });
  });

  it("rejects bad injected entropy from inside a ruleset roll", () => {
    const engine = setup();
    const res = engine.dispatch({
      intent_id: "burn-bad",
      type: "BURN",
      source: "system",
      payload: { target: "torch", roll_notation: "2d6", dice: [[7, 1]] },
    });
    expect(res.status).toBe("rejected");
    expect(res.delta).toEqual([]);
    expect(res.meta).toMatchObject({ code: "entropy_mismatch" });
  });

  it("unknown ruleset types stay rejected", () => {
    const engine = setup();
    const res = engine.dispatch({
      intent_id: "x",
      type: "FREEZE",
      source: "system",
      payload: {},
    });
    expect(res.status).toBe("rejected");
    expect(res.meta).toMatchObject({ code: "unknown_type" });
  });
});

describe("RejectionError surface", () => {
  it("reducers can signal semantic rejections via RejectionError", () => {
    const refuse: Ruleset = {
      id: "refuse",
      handle(type) {
        if (type !== "VAULT") return false;
        throw new RejectionError("vault_locked", "the vault will not open");
      },
    };
    const engine = createEngine({ ruleset: refuse, session: createSession() });
    const res = engine.dispatch({ intent_id: "v", type: "VAULT", source: "system", payload: {} });
    expect(res.status).toBe("rejected");
    expect(res.meta).toMatchObject({ code: "vault_locked" });
  });
});