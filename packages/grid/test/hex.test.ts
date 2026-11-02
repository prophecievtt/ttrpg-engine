import { describe, expect, it } from "vitest";

import {
  HEX_DIAGONALS,
  HEX_DIRECTIONS,
  cubeToHex,
  hexDiagonalNeighbors,
  hexDistance,
  hexLine,
  hexNeighbors,
  hexRing,
  hexRound,
  hexSpiral,
  hexToCube,
  hexToPixel,
  hexToUnitVector,
  pixelToHex,
} from "../src/index.js";

const O = { q: 0, r: 0 };

describe("hex coordinates", () => {
  it("converts between axial and cube with the invariant", () => {
    for (const [q, r] of [
      [0, 0],
      [3, -2],
      [-1, 5],
      [7, 7],
    ] as const) {
      const c = hexToCube({ q, r });
      expect(c.q + c.r + c.s).toBe(0);
      expect(cubeToHex(c)).toEqual({ q, r });
    }
  });

  it("keeps all direction vectors on the q+r+s=0 plane", () => {
    for (const d of [...HEX_DIRECTIONS, ...HEX_DIAGONALS]) {
      expect(d.q + d.r + d.s).toBe(0);
    }
  });

  it("computes distance as max of cube deltas", () => {
    expect(hexDistance(O, { q: 0, r: 0 })).toBe(0);
    expect(hexDistance(O, { q: 3, r: -2 })).toBe(3);
    expect(hexDistance({ q: -1, r: 5 }, { q: 2, r: 1 })).toBe(4);
  });
});

describe("hex neighbors", () => {
  it("returns 6 adjacent hexes at distance 1", () => {
    const n = hexNeighbors(O);
    expect(n).toHaveLength(6);
    for (const h of n) expect(hexDistance(O, h)).toBe(1);
    expect(new Set(n.map((h) => `${h.q},${h.r}`)).size).toBe(6);
  });

  it("returns 6 diagonals at distance 2", () => {
    const d = hexDiagonalNeighbors(O);
    expect(d).toHaveLength(6);
    for (const h of d) expect(hexDistance(O, h)).toBe(2);
  });
});

describe("hex rings and spirals", () => {
  it("ring radius 2 has 12 cells, all at distance 2", () => {
    const ring = hexRing(O, 2);
    expect(ring).toHaveLength(12);
    for (const h of ring) expect(hexDistance(O, h)).toBe(2);
    expect(new Set(ring.map((h) => `${h.q},${h.r}`)).size).toBe(12);
  });

  it("spiral count follows 1 + 3r(r+1)", () => {
    for (const r of [0, 1, 2, 3]) {
      expect(hexSpiral(O, r)).toHaveLength(1 + 3 * r * (r + 1));
    }
  });

  it("radius 0 and negative edges", () => {
    expect(hexRing({ q: 2, r: 1 }, 0)).toEqual([{ q: 2, r: 1 }]);
    expect(hexRing(O, -1)).toEqual([]);
    expect(hexSpiral(O, -1)).toEqual([]);
  });
});

describe("hex lines", () => {
  it("line between identical hexes is a singleton", () => {
    expect(hexLine(O, O)).toEqual([O]);
  });

  it("line length is distance + 1 and steps are adjacent", () => {
    const a = { q: -2, r: 1 };
    const b = { q: 3, r: 2 };
    const line = hexLine(a, b);
    expect(line).toHaveLength(hexDistance(a, b) + 1);
    for (let i = 1; i < line.length; i++) {
      expect(hexDistance(line[i - 1]!, line[i]!)).toBe(1);
    }
  });
});

describe("hex rounding", () => {
  it("rounds fractional cubes to the nearest hex", () => {
    expect(hexRound({ q: 0.2, r: -0.1, s: -0.1 })).toEqual({ q: 0, r: 0, s: 0 });
    expect(hexRound({ q: 1.6, r: 0.4, s: -2.0 })).toEqual({ q: 2, r: 0, s: -2 });
  });

  it("always restores the q+r+s=0 invariant", () => {
    for (const c of [
      { q: 0.49, r: 0.51, s: -1.0 },
      { q: -1.5, r: 0.5, s: 1.0 },
      { q: 2.5, r: 2.5, s: -5.0 },
      { q: 0.9, r: -1.1, s: 0.2 },
    ]) {
      const r = hexRound(c);
      expect(r.q + r.r + r.s).toBe(0);
    }
  });
});

describe("hex pixel conversion", () => {
  it("round-trips axial → pixel → axial for pointy layout", () => {
    const layout = { orientation: "pointy" as const, size: 25, origin: { x: 0, y: 0 } };
    for (const h of hexSpiral(O, 3)) {
      expect(pixelToHex(hexToPixel(h, layout), layout)).toEqual(h);
    }
  });

  it("round-trips axial → pixel → axial for flat layout with origin", () => {
    const layout = {
      orientation: "flat" as const,
      size: 40,
      origin: { x: 500, y: -300 },
    };
    for (const h of hexSpiral(O, 3)) {
      expect(pixelToHex(hexToPixel(h, layout), layout)).toEqual(h);
    }
  });

  it("projects axial to unit vectors as expected", () => {
    expect(hexToUnitVector(O)).toEqual({ x: 0, y: 0 });
    // Adjacent r-step moves 1.5 in unit space (pointy vertical spacing).
    expect(hexToUnitVector({ q: 0, r: 1 }).y).toBeCloseTo(1.5, 10);
  });
});