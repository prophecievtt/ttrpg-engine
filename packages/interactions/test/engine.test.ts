import { describe, expect, it } from "vitest";

import {
  createEngine,
  createSession,
  replayOps,
  type Intent,
  type SessionState,
} from "../src/index.js";

function makeState(): SessionState {
  const s = createSession({ sessionId: "test" });
  s.entities["wizard-1"] = { id: "wizard-1", kind: "player", components: { resources: { spell_slots_3: 2 } } };
  return s;
}

function intent(type: string, payload: unknown, opts: Partial<Intent> = {}): Intent {
  return { intent_id: "req_1", type, source: opts.source ?? "system", payload };
}

describe("engine dispatch", () => {
  it("reduces a delta twice on the same inputs (determinism)", () => {
    const a = createEngine({ session: makeState() });
    const b = createEngine({ session: makeState() });
    const i = intent("SET_COMPONENT", { entity: "wizard-1", key: "mana", value: 5 });
    expect(a.dispatch(i)).toEqual(b.dispatch(i));
  });

  it("ADD_ENTITY → exact add op at the entity path", () => {
    const engine = createEngine({ session: makeState() });
    const res = engine.dispatch(
      intent("ADD_ENTITY", { id: "goblin-1", kind: "monster", components: { hp: 6 } }),
    );
    expect(res.status).toBe("success");
    expect(res.delta).toEqual([
      {
        op: "add",
        path: "/entities/goblin-1",
        value: { id: "goblin-1", kind: "monster", components: { hp: 6 } },
      },
      { op: "add", path: "/log/-", value: "ADD_ENTITY goblin-1" },
    ]);
    expect(engine.getState().entities["goblin-1"]?.components.hp).toBe(6);
  });

  it("escapes `/` and `~` in ids and keys per RFC 6901 (no path injection)", () => {
    const engine = createEngine({ session: makeState() });
    const added = engine.dispatch(
      intent("ADD_ENTITY", { id: "a/b~c", kind: "monster", components: {} }),
    );
    expect(added.delta[0]).toMatchObject({ op: "add", path: "/entities/a~1b~0c" });
    const set = engine.dispatch(
      intent("SET_COMPONENT", { entity: "a/b~c", key: "x/y", value: 1 }),
    );
    expect(set.delta[0]).toMatchObject({ op: "add", path: "/entities/a~1b~0c/components/x~1y" });
    expect(engine.getState().entities["a/b~c"]?.components["x/y"]).toBe(1);
  });

  it("rejects duplicate entities", () => {
    const engine = createEngine({ session: makeState() });
    engine.dispatch(intent("ADD_ENTITY", { id: "goblin-1", components: {} }));
    const res = engine.dispatch(intent("ADD_ENTITY", { id: "goblin-1", components: {} }));
    expect(res.status).toBe("rejected");
    expect(res.delta).toEqual([]);
    expect(res.meta).toMatchObject({ code: "duplicate_entity" });
  });

  it("SET_COMPONENT replaces existing keys and adds new ones", () => {
    const engine = createEngine({ session: makeState() });
    const replace = engine.dispatch(
      intent("SET_COMPONENT", { entity: "wizard-1", key: "resources", value: {} }),
    );
    expect(replace.delta[0]).toMatchObject({ op: "replace", path: "/entities/wizard-1/components/resources" });

    const add = engine.dispatch(
      intent("SET_COMPONENT", { entity: "wizard-1", key: "mana", value: 5 }),
    );
    expect(add.delta[0]).toMatchObject({ op: "add", path: "/entities/wizard-1/components/mana" });
  });

  it("REMOVE_ENTITY removes the entity and its effects (index-safe)", () => {
    const s = makeState();
    s.effects = [
      { id: "fx-a", target: "wizard-1", source: "system", name: "a", expires_on_round: 9 },
      { id: "fx-b", target: "wizard-1", source: "system", name: "b", expires_on_round: 9 },
      { id: "fx-c", target: "other", source: "system", name: "c", expires_on_round: 9 },
    ];
    const engine = createEngine({ session: s });
    const res = engine.dispatch(intent("REMOVE_ENTITY", { id: "wizard-1" }));
    expect(res.status).toBe("success");
    const removes = res.delta.filter((o) => o.op === "remove");
    expect(removes.map((o) => o.path)).toEqual([
      "/effects/1",
      "/effects/0",
      "/entities/wizard-1",
    ]);
    expect(engine.getState().entities["wizard-1"]).toBeUndefined();
    expect(engine.getState().effects).toHaveLength(1);
  });

  it("REGISTER_EFFECT computes expiry from the current round", () => {
    const engine = createEngine({ session: makeState() });
    const res = engine.dispatch(
      intent("REGISTER_EFFECT", {
        id: "fx-1",
        target: "wizard-1",
        source: "system",
        name: "bless",
        duration_rounds: 2,
      }),
    );
    expect(res.status).toBe("success");
    expect(res.delta[0]).toMatchObject({
      op: "add",
      path: "/effects/-",
      value: { id: "fx-1", expires_on_round: 3 }, // round 1 + 2
    });
  });

  it("unknown / malformed intents are rejected with empty deltas", () => {
    const engine = createEngine({ session: makeState() });
    expect(engine.dispatch(intent("NO_SUCH_INTENT", {}))).toMatchObject({
      status: "rejected",
      delta: [],
      meta: { code: "unknown_type" },
    });
    expect(
      engine.dispatch({ intent_id: "x", type: "SET_COMPONENT", source: "ghost", payload: {} }),
    ).toMatchObject({ status: "rejected", delta: [], meta: { code: "unknown_source" } });
    expect(
      engine.dispatch({ intent_id: "", type: "SET_COMPONENT", source: "system", payload: {} }),
    ).toMatchObject({ status: "rejected", delta: [], meta: { code: "invalid_intent" } });
  });

  it("every emitted delta replays onto the before-state exactly", () => {
    const engine = createEngine({ session: makeState() });
    const steps: Intent[] = [
      intent("ADD_ENTITY", { id: "g1", components: { hp: 6 } }),
      intent("ADD_ENTITY", { id: "g2", components: { hp: 12 } }),
      intent("SET_COMPONENT", { entity: "g1", key: "hp", value: 0 }),
      intent("REMOVE_ENTITY", { id: "g2" }),
    ];
    for (const step of steps) {
      const before = engine.getState();
      const res = engine.dispatch(step);
      expect(res.status).toBe("success");
      expect(replayOps(before, res.delta)).toEqual(engine.getState());
    }
  });
});