import { describe, expect, it } from "vitest";

import {
  createEngine,
  createSession,
  expiredEffectIndices,
  nextTurnPosition,
} from "../src/index.js";

describe("nextTurnPosition", () => {
  it("walks the roster and wraps around to a new round", () => {
    const roster = [1, 2, 3].map((n) => ({ id: `e${n}`, group: "pc", roll: n, order: n }));
    expect(nextTurnPosition(roster, 1, 0)).toEqual({ round: 1, turn_index: 1 });
    expect(nextTurnPosition(roster, 1, 1)).toEqual({ round: 1, turn_index: 2 });
    expect(nextTurnPosition(roster, 1, 2)).toEqual({ round: 2, turn_index: 0 });
  });

  it("advances rounds even with an empty roster", () => {
    expect(nextTurnPosition([], 1, 0)).toEqual({ round: 2, turn_index: 0 });
    expect(nextTurnPosition([], 7, 0)).toEqual({ round: 8, turn_index: 0 });
  });
});

describe("expiredEffectIndices", () => {
  it("lists expired effects descending (replay-safe removal order)", () => {
    const s = createSession({ round: 3 });
    s.effects = [
      { id: "a", target: "t", source: "system", name: "a", expires_on_round: 2 }, // expired
      { id: "b", target: "t", source: "system", name: "b", expires_on_round: 4 },
      { id: "c", target: "t", source: "system", name: "c", expires_on_round: 3 }, // expired at round 3
      { id: "d", target: "t", source: "system", name: "d", expires_on_round: 9 },
    ];
    expect(expiredEffectIndices(s, 3)).toEqual([2, 0]);
  });
});

describe("NEXT_TURN", () => {
  function setup() {
    const s = createSession({ sessionId: "t", phase: "combat", round: 1, turnIndex: 0 });
    s.initiative_roster = [
      { id: "hero", group: "pc", roll: 18, order: 0 },
      { id: "gob", group: "foe", roll: 9, order: 1 },
    ];
    s.entities["hero"] = { id: "hero", components: {} };
    s.entities["gob"] = { id: "gob", components: {} };
    return createEngine({ session: s });
  }

  it("advances turn → turn → round, replacing the clock fields", () => {
    const engine = setup();
    const r1 = engine.dispatch({ intent_id: "a", type: "NEXT_TURN", source: "system", payload: {} });
    expect(r1.delta).toContainEqual({ op: "replace", path: "/round", value: 1 });
    expect(r1.delta).toContainEqual({ op: "replace", path: "/turn_index", value: 1 });

    const r2 = engine.dispatch({ intent_id: "b", type: "NEXT_TURN", source: "system", payload: {} });
    expect(engine.getState().round).toBe(2);
    expect(engine.getState().turn_index).toBe(0);
    expect(r2.delta).toContainEqual({ op: "replace", path: "/round", value: 2 });
  });

  it("purges each expired effect exactly once, removals descending", () => {
    const engine = setup();
    engine.dispatch({
      intent_id: "fx",
      type: "REGISTER_EFFECT",
      source: "system",
      payload: { id: "fx-1", target: "hero", source: "system", name: "bless", duration_rounds: 1 },
    });
    // expires_on_round = 1 + 1 = 2 → expires the moment round becomes 2.
    engine.dispatch({ intent_id: "t1", type: "NEXT_TURN", source: "system", payload: {} });
    expect(engine.getState().round).toBe(1); // first step: same round, other turn
    expect(engine.getState().effects).toHaveLength(1);
    const r2 = engine.dispatch({ intent_id: "t2", type: "NEXT_TURN", source: "system", payload: {} });
    expect(engine.getState().round).toBe(2);
    expect(engine.getState().effects).toHaveLength(0);
    const removals = r2.delta.filter((o) => o.path === "/effects/0" && o.op === "remove");
    expect(removals).toHaveLength(1);
  });

  it("logs deterministic turn entries", () => {
    const engine = setup();
    engine.dispatch({ intent_id: "a", type: "NEXT_TURN", source: "system", payload: {} });
    expect(engine.getState().log.at(-1)).toBe("NEXT_TURN → round 1, turn 1 (gob)");
  });
});