import { describe, expect, it } from "vitest";

import {
  applyModifiers,
  keepIndices,
  parseNotation,
  RejectionError,
  resolveRoll,
} from "../src/index.js";

describe("keepIndices", () => {
  it("keeps the highest n for kh", () => {
    const plan = parseNotation("2d20kh1");
    expect([...keepIndices(plan, [8, 19])]).toEqual([1]);
    expect([...keepIndices(plan, [19, 8])]).toEqual([0]);
  });

  it("handles ties deterministically (stable order → earlier index kept)", () => {
    const plan = parseNotation("3d6kh1");
    expect([...keepIndices(plan, [4, 4, 4])]).toEqual([0]);
  });

  it("drops lowest for dl", () => {
    const plan = parseNotation("4d6dl1");
    expect([...keepIndices(plan, [3, 5, 1, 6])]).toEqual([0, 1, 3]);
  });
});

describe("resolveRoll", () => {
  it("8d6 with faces resolves to the exact sum", () => {
    const plan = parseNotation("8d6");
    const result = resolveRoll(plan, { dice: [[5, 3, 1, 6, 4, 2, 4, 3]] });
    expect(result.total).toBe(28);
    expect(result.plan).toBe("8d6");
    expect(result.dice.map((d) => d.face)).toEqual([5, 3, 1, 6, 4, 2, 4, 3]);
    expect(result.dice.every((d) => d.kept)).toBe(true);
  });

  it("2d20kh1 keeps only the high die", () => {
    const plan = parseNotation("2d20kh1");
    const result = resolveRoll(plan, { dice: [[8, 19]] });
    expect(result.total).toBe(19);
    expect(result.dice.map((d) => [d.face, d.kept])).toEqual([
      [8, false],
      [19, true],
    ]);
  });

  it("1d8+3 applies the modifier", () => {
    const plan = parseNotation("1d8+3");
    const result = resolveRoll(plan, { dice: [[5]] });
    expect(result.total).toBe(8);
    expect(result.modifiers).toEqual([{ op: "add", value: 3 }]);
  });

  it("totals-only injection is accepted (no per-die breakdown)", () => {
    const plan = parseNotation("8d6");
    const result = resolveRoll(plan, { total: 28 });
    expect(result.total).toBe(28);
    expect(result.dice).toEqual([]);
  });

  it("rejects mismatched totals, bad counts, and bad faces", () => {
    const plan = parseNotation("8d6");
    expect(() => resolveRoll(plan, { dice: [[5, 3]], total: 8 })).toThrow(RejectionError);
    expect(() => resolveRoll(plan, { dice: [[1, 2]] })).toThrow(RejectionError);
    expect(() => resolveRoll(plan, { dice: [[7, 0, 1, 1, 1, 1, 1, 1]] })).toThrow(RejectionError);
    expect(() => resolveRoll(plan, { dice: [], total: 28 })).toThrow(RejectionError);
    expect(() => resolveRoll(plan, {})).toThrow(RejectionError);
  });

  it("rejects a total that disagrees with the injected faces", () => {
    const plan = parseNotation("8d6");
    expect(() =>
      resolveRoll(plan, { dice: [[5, 3, 1, 6, 4, 2, 4, 3]], total: 27 }),
    ).toThrow(RejectionError);
  });
});

describe("applyModifiers", () => {
  it("adds and subtracts in order", () => {
    expect(
      applyModifiers(10, [
        { op: "add", value: 3 },
        { op: "sub", value: 2 },
      ]),
    ).toBe(11);
  });
});