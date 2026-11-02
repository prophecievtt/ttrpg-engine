/**
 * Bit-identity guard: the wasm core can only match the TS reference exactly if
 * the numeric path avoids implementation-defined Math functions. Only + - * /,
 * Math.sqrt (correctly rounded by IEEE-754), and exact helpers are allowed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
const ALLOWED = new Set(["sqrt", "abs", "min", "max", "floor", "ceil", "round", "trunc", "sign"]);

describe("spatial source portability", () => {
  it("uses no transcendental or implementation-defined Math functions", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(srcDir)) {
      if (!file.endsWith(".ts")) continue;
      const text = readFileSync(srcDir + file, "utf8");
      for (const m of text.matchAll(/Math\.(\w+)/g)) {
        if (!ALLOWED.has(m[1]!)) offenders.push(`${file}: Math.${m[1]}`);
      }
      if (/\*\*/.test(text.replace(/\/\*\*[\s\S]*?\*\//g, ""))) offenders.push(`${file}: ** operator`);
    }
    expect(offenders).toEqual([]);
  });
});
