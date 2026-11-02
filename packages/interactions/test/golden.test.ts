/**
 * Golden-file contract for the canonical scenario (see scenario.ts).
 *
 * The serialized responses + final state must match test/golden/ember-scenario.json
 * byte for byte. To intentionally change the contract, run with UPDATE_GOLDEN=1
 * and review the JSON diff in the PR.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { replayOps } from "../src/index.js";
import { buildInitialSession, runScenario } from "./scenario.js";

const goldenPath = fileURLToPath(new URL("./golden/ember-scenario.json", import.meta.url));

function serializeScenario(out: ReturnType<typeof runScenario>): string {
  return JSON.stringify(out, null, 2) + "\n";
}

describe("golden: ember scenario", () => {
  it("matches the committed golden file byte for byte", () => {
    const actual = serializeScenario(runScenario());
    if (process.env.UPDATE_GOLDEN === "1" || !existsSync(goldenPath)) {
      writeFileSync(goldenPath, actual);
    }
    expect(actual).toBe(readFileSync(goldenPath, "utf8"));
  });

  it("fireball delta carries the PRD §6.2 outcomes and the full per-die roll", () => {
    const [cast] = runScenario().responses;
    expect(cast?.status).toBe("success");
    const delta = cast!.delta;
    expect(delta).toContainEqual({
      op: "replace",
      path: "/entities/uuid-goblin-1/components/hp",
      value: 0,
    });
    expect(delta).toContainEqual({
      op: "add",
      path: "/entities/uuid-goblin-1/components/conditions",
      value: ["dead"],
    });
    expect(delta).toContainEqual({
      op: "replace",
      path: "/entities/uuid-goblin-2/components/hp",
      value: 14,
    });
    expect(delta).toContainEqual({
      op: "replace",
      path: "/entities/uuid-wizard-1/components/spell_slots_3",
      value: 1,
    });
    const roll = delta.find((op) => op.path === "/history/rolls/-");
    expect(roll?.op).toBe("add");
    const result = (roll as { value: { total: number; dice: { face: number }[] } }).value;
    expect(result.total).toBe(28);
    expect(result.dice.map((d) => d.face)).toEqual([5, 3, 1, 6, 4, 2, 4, 3]);
  });

  it("replaying every delta onto the initial state reproduces the final state", () => {
    const out = runScenario();
    const ops = out.responses.flatMap((r) => r.delta);
    expect(replayOps(buildInitialSession(), ops)).toEqual(out.state);
  });
});
