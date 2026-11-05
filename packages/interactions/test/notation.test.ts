import { describe, expect, it } from "vitest";

import { dicePool, parseNotation, RejectionError } from "../src/index.js";

describe("parseNotation", () => {
  const cases: Array<[string, string]> = [
    ["8d6", "8d6"],
    ["d20", "1d20"],
    [" 3d6 ", "3d6"],
    ["1d8+3", "1d8+3"],
    ["2d20kh1", "2d20kh1"],
    ["4d6dl1", "4d6dl1"],
    ["2d20KH1", "2d20kh1"],
    ["1d12-2", "1d12-2"],
    ["3d8kl2", "3d8kl2"],
  ];

  for (const [input, canonical] of cases) {
    it(`parses ${input} → ${canonical}`, () => {
      expect(parseNotation(input).notation).toBe(canonical);
    });
  }

  it("captures dice, modifiers, and keep rules", () => {
    expect(parseNotation("2d20kh1")).toMatchObject({
      dice: [{ count: 2, faces: 20 }],
      keep: { op: "kh", n: 1 },
      modifiers: [],
    });
    expect(parseNotation("1d8+3")).toMatchObject({
      dice: [{ count: 1, faces: 8 }],
      modifiers: [{ op: "add", value: 3 }],
      keep: undefined,
    });
  });

  const bad = ["", "d", "8d", "d0", "0d6", "1d6kh0", "3d4kh4", "d6+foo", "6", "d6!"];
  for (const input of bad) {
    it(`rejects malformed ${JSON.stringify(input)}`, () => {
      expect(() => parseNotation(input)).toThrow(RejectionError);
    });
  }

  it("accepts the largest supported die, d100", () => {
    expect(parseNotation("1d100").dice).toEqual([{ count: 1, faces: 100 }]);
  });

  for (const input of ["1d101", "1d1000", "1d10000", "2d99999"]) {
    it(`rejects ${input}: no die above d100`, () => {
      expect(() => parseNotation(input)).toThrow(RejectionError);
      expect(() => parseNotation(input)).toThrow(/dice faces out of range/);
    });
  }

  it("rejects d0 as out of range", () => {
    expect(() => parseNotation("d0")).toThrow(/dice faces out of range/);
  });
});

describe("dicePool", () => {
  it("builds a mixed pool", () => {
    const plan = dicePool([{ count: 2, faces: 6 }, { count: 1, faces: 100 }]);
    expect(plan.notation).toBe("2d6+1d100");
    expect(plan.dice).toEqual([{ count: 2, faces: 6 }, { count: 1, faces: 100 }]);
  });

  for (const faces of [101, 0, 1.5, -6, Number.NaN]) {
    it(`rejects faces ${faces}`, () => {
      const pool = () => dicePool([{ count: 1, faces: 6 }, { count: 1, faces }]);
      expect(pool).toThrow(RejectionError);
      expect(pool).toThrow(/dice faces out of range/);
    });
  }

  for (const count of [0, 10001, 2.5]) {
    it(`rejects count ${count}`, () => {
      expect(() => dicePool([{ count, faces: 6 }])).toThrow(/dice count out of range/);
    });
  }

  it("rejects with the bad_notation code", () => {
    try {
      dicePool([{ count: 1, faces: 101 }]);
      expect.unreachable();
    } catch (err) {
      expect((err as RejectionError).code).toBe("bad_notation");
    }
  });
});
