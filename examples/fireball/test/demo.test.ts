import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildEmberSession, BLAST_POINT, GOBLIN_1, GOBLIN_2, WIZARD } from "@ttrpg-engine/example-ember";
import { describe, expect, it } from "vitest";

import { createEmberHost, handleIntent, name, runFireballDemo } from "../src/index.js";

const expectedPath = fileURLToPath(new URL("../expected.log", import.meta.url));

describe("fireball demo", () => {
  it("exposes its identity", () => {
    expect(name).toBe("@ttrpg-engine/example-fireball");
  });

  it("matches expected.log byte for byte (UPDATE_GOLDEN=1 to change it)", () => {
    const actual = runFireballDemo();
    if (process.env.UPDATE_GOLDEN === "1" || !existsSync(expectedPath)) writeFileSync(expectedPath, actual);
    expect(actual).toBe(readFileSync(expectedPath, "utf8"));
  });

  it("logs the PRD outcomes in plain text (no ANSI colour)", () => {
    const log = runFireballDemo();
    expect(log).toContain("uuid-goblin-1 (hp 6 → 0, dead)");
    expect(log).toContain("roll 8d6 [5,3,1,6,4,2,4,3] = 28");
    expect(log).toContain("wizard spell_slots_3: 2 → 1");
    expect(log).toContain("effect expired: scorched on uuid-goblin-2");
    expect(log).not.toMatch(/\u001b\[/);
  });
});

describe("handleIntent (server wire format)", () => {
  function host() {
    const h = createEmberHost({ seed: "test" });
    h.registry.open("s1", buildEmberSession());
    return h;
  }
  const cast = (payload: unknown, intent_id = "c1") => ({ intent_id, type: "CAST_SPELL", source: WIZARD, payload });

  it("casts at an area, rolling dice and saves with the host's seeded entropy", () => {
    const { registry } = host();
    const res = handleIntent(registry, "s1", cast({ spell_id: "fireball", at: BLAST_POINT }));
    expect(res.status).toBe("success");
    expect(res.delta[0]?.path).toBe("/history/rolls/-");
    expect(registry.get("s1")!.engine.getState().entities[WIZARD]!.components.spell_slots_3).toBe(1);
  });

  it("is deterministic per seed and session", () => {
    const run = () => JSON.stringify(handleIntent(host().registry, "s1", cast({ spell_id: "fireball", at: { x: 65, y: 5 } })));
    expect(run()).toBe(run());
  });

  it("uses injected entropy and pre-picked targets when given", () => {
    const { registry } = host();
    const res = handleIntent(
      registry,
      "s1",
      cast({
        spell_id: "fireball",
        targets: [GOBLIN_2],
        injected_entropy: { damage: { dice: [[6, 6, 6, 6, 6, 6, 6, 6]] }, target_saves: { [GOBLIN_2]: 1 } },
      }),
    );
    expect(res.status).toBe("success");
    const state = registry.get("s1")!.engine.getState();
    expect(state.entities[GOBLIN_1]!.components.hp).toBe(6);
    expect(state.entities[GOBLIN_2]!.components.hp).toBe(0);
  });

  it("rejects bad payloads with a reason and no delta", () => {
    const { registry } = host();
    const before = registry.get("s1")!.engine.getState();
    for (const [payload, code] of [
      [undefined, "bad_payload"],
      [{ spell_id: 3 }, "bad_payload"],
      [{ spell_id: "fireball" }, "bad_targeting"],
      [{ spell_id: "fireball", at: { x: "1", y: 0 } }, "bad_targeting"],
      [{ spell_id: "fireball", at: BLAST_POINT, direction: { x: Infinity, y: 0 } }, "bad_targeting"],
      [{ spell_id: "fireball", targets: [1] }, "bad_targeting"],
      [{ spell_id: "nope", at: BLAST_POINT }, "unknown_spell"],
    ] as const) {
      const res = handleIntent(registry, "s1", cast(payload));
      expect(res).toMatchObject({ response_to: "c1", status: "rejected", delta: [], meta: { code } });
    }
    expect(registry.get("s1")!.engine.getState()).toBe(before);
  });

  it("rejects unknown sessions and passes other intents straight to the engine", () => {
    const { registry } = host();
    expect(handleIntent(registry, "nope", cast({ spell_id: "fireball", at: BLAST_POINT })).meta).toEqual({
      code: "unknown_session",
    });
    const turn = handleIntent(registry, "s1", { intent_id: "t1", type: "NEXT_TURN", source: "system", payload: {} });
    expect(turn.status).toBe("success");
    expect(registry.get("s1")!.engine.getState().turn_index).toBe(1);
  });
});
