import { describe, expect, it } from "vitest";

import { createSession, addEntity, computeExpiry, makeEffect, getEntity, removeEntity } from "../src/index.js";

describe("createSession", () => {
  it("builds the v1 state with defaults", () => {
    const s = createSession();
    expect(s).toEqual({
      version: 1,
      session_id: "session",
      phase: "exploration",
      round: 1,
      turn_index: 0,
      initiative_roster: [],
      entities: {},
      effects: [],
      resources: {},
      history: { rolls: [] },
      log: [],
    });
  });

  it("accepts explicit identity and clocks", () => {
    const s = createSession({ sessionId: "abc", phase: "combat", round: 3, turnIndex: 1 });
    expect(s.session_id).toBe("abc");
    expect(s.phase).toBe("combat");
    expect(s.round).toBe(3);
    expect(s.turn_index).toBe(1);
  });
});

describe("entity helpers", () => {
  it("adds, finds, and removes entities (including their effects)", () => {
    const s = createSession();
    addEntity(s, { id: "e1", kind: "goblin", components: { hp: 7 } });
    expect(getEntity(s, "e1")?.components.hp).toBe(7);

    s.effects.push({
      id: "fx1",
      target: "e1",
      source: "system",
      name: "burning",
      expires_on_round: 3,
    });
    removeEntity(s, "e1");
    expect(getEntity(s, "e1")).toBeUndefined();
    expect(s.effects).toHaveLength(0);
  });
});

describe("effect expiry math", () => {
  it("computes expiry as currentRound + duration", () => {
    expect(computeExpiry(1, 1)).toBe(2);
    expect(computeExpiry(4, 3)).toBe(7);
  });

  it("builds complete effects", () => {
    const e = makeEffect(
      { id: "fx", target: "t", source: "system", name: "bless", duration_rounds: 2 },
      2,
    );
    expect(e).toEqual({ id: "fx", target: "t", source: "system", name: "bless", expires_on_round: 4 });
  });
});