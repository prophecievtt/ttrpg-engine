import { describe, expect, it } from "vitest";

import {
  altDiagonalDistance,
  cellToPixel,
  chebyshevDistance,
  euclideanDistance,
  lineCells,
  manhattanDistance,
  pixelToCell,
  squareDistance,
  squareNeighbors,
  squareRegion,
  squareRing,
  supercoverLine,
} from "../src/index.js";

describe("square distances", () => {
  it("computes each metric on a diagonal", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 3, y: 3 };
    expect(chebyshevDistance(a, b)).toBe(3);
    expect(manhattanDistance(a, b)).toBe(6);
    expect(altDiagonalDistance(a, b)).toBe(4); // 3 orth + floor(3/2) = 3+1
    expect(euclideanDistance(a, b)).toBeCloseTo(Math.sqrt(18), 10);
  });

  it("hands known cases to squareDistance dispatch", () => {
    const a = { x: 1, y: 1 };
    const b = { x: 5, y: 2 };
    expect(squareDistance(a, b, "chebyshev")).toBe(chebyshevDistance(a, b));
    expect(squareDistance(a, b, "manhattan")).toBe(manhattanDistance(a, b));
    expect(squareDistance(a, b, "altDiagonal")).toBe(altDiagonalDistance(a, b));
    expect(squareDistance(a, b, "euclidean")).toBeCloseTo(euclideanDistance(a, b), 10);
  });

  it("handles alternate-diagonal movement like the 5e grid rule", () => {
    // Two diagonal steps cost 3: (0,0)->(2,2) = 2 + floor(2/2) = 3.
    expect(altDiagonalDistance({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(3);
    // One diagonal step costs 1.
    expect(altDiagonalDistance({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(1);
  });
});

describe("square neighbors and regions", () => {
  it("lists 4 then 8 neighbors in stable order", () => {
    expect(squareNeighbors({ x: 0, y: 0 })).toHaveLength(4);
    expect(squareNeighbors({ x: 0, y: 0 }, true)).toHaveLength(8);
    expect(squareNeighbors({ x: 0, y: 0 })[0]).toEqual({ x: 1, y: 0 });
  });

  it("builds a 5x5 region and its border ring", () => {
    const region = squareRegion({ x: 0, y: 0 }, 2);
    expect(region).toHaveLength(25);
    const ring = squareRing({ x: 0, y: 0 }, 2);
    expect(ring).toHaveLength(16);
    for (const c of ring) expect(chebyshevDistance({ x: 0, y: 0 }, c)).toBe(2);
  });

  it("returns only the center for radius 0 and nothing for negative", () => {
    expect(squareRegion({ x: 2, y: 3 }, 0)).toEqual([{ x: 2, y: 3 }]);
    expect(squareRing({ x: 0, y: 0 }, -1)).toEqual([]);
    expect(squareRegion({ x: 0, y: 0 }, -1)).toEqual([]);
  });
});

describe("square lines", () => {
  it("draws a straight horizontal Bresenham line", () => {
    expect(lineCells({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it("draws a diagonal supercover line touching every crossed cell", () => {
    const line = supercoverLine({ x: 0, y: 0 }, { x: 3, y: 3 });
    expect(line[0]).toEqual({ x: 0, y: 0 });
    expect(line[line.length - 1]).toEqual({ x: 3, y: 3 });
    // Every consecutive pair is 8-connected.
    for (let i = 1; i < line.length; i++) {
      const dx = Math.abs(line[i]!.x - line[i - 1]!.x);
      const dy = Math.abs(line[i]!.y - line[i - 1]!.y);
      expect(dx <= 1 && dy <= 1 && dx + dy >= 1).toBe(true);
    }
  });

  it("degenerate line is a single cell", () => {
    expect(lineCells({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
    expect(supercoverLine({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });
});

describe("square pixel conversion", () => {
  it("maps cell centers to pixels and back (floor mode)", () => {
    const origin = { x: 100, y: 200 };
    const center = cellToPixel({ x: 2, y: 3 }, origin, 50);
    expect(center).toEqual({ x: 100 + 2.5 * 50, y: 200 + 3.5 * 50 });
    // Top-left mode inverts exactly with pixelToCell.
    const tl = cellToPixel({ x: 2, y: 3 }, origin, 50, false);
    expect(pixelToCell({ x: tl.x + 1, y: tl.y + 1 }, origin, 50)).toEqual({
      x: 2,
      y: 3,
    });
  });
});