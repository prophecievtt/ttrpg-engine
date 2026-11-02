import { describe, expect, it } from "vitest";

import { parseNotation, RejectionError } from "../src/index.js";

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
});