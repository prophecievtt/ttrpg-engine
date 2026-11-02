import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  altDiagonalDistance,
  chebyshevDistance,
  euclideanDistance,
  hexDistance,
  hexRing,
  hexSpiral,
  hexToPixel,
  lineCells,
  manhattanDistance,
  pixelToCell,
  pixelToHex,
  squareNeighbors,
  supercoverLine,
} from "../src/index.js";

type Cell = { x: number; y: number };

const cell = fc.record({ x: fc.integer({ min: -20, max: 20 }), y: fc.integer({ min: -20, max: 20 }) });
const hex = fc.record({ q: fc.integer({ min: -20, max: 20 }), r: fc.integer({ min: -20, max: 20 }) });
const triples = fc.tuple(cell, cell, cell);

describe("metric laws (property)", () => {
  const metrics: Array<[string, (a: Cell, b: Cell) => number]> = [
    ["chebyshev", chebyshevDistance],
    ["manhattan", manhattanDistance],
    ["altDiagonal", altDiagonalDistance],
    ["euclidean", euclideanDistance],
  ];

  for (const [name, dist] of metrics) {
    it(`${name}: symmetric and zero iff identical`, () => {
      fc.assert(
        fc.property(cell, cell, (a, b) => {
          expect(dist(a, b)).toBe(dist(b, a));
          expect(dist(a, b)).toBeGreaterThanOrEqual(0);
          expect(dist(a, a)).toBe(0);
          if (a.x !== b.x || a.y !== b.y) expect(dist(a, b)).toBeGreaterThan(0);
        }),
      );
    });
  }

  it("chebyshev/manhattan/euclidean satisfy the triangle inequality", () => {
    for (const dist of [chebyshevDistance, manhattanDistance, euclideanDistance]) {
      fc.assert(
        fc.property(triples, ([a, b, c]) => {
          expect(dist(a, c)).toBeLessThanOrEqual(dist(a, b) + dist(b, c));
        }),
      );
    }
  });
});

describe("hex laws (property)", () => {
  it("hexDistance is symmetric, zero iff identical, and triangle-bounded", () => {
    fc.assert(
      fc.property(hex, hex, hex, (a, b, c) => {
        expect(hexDistance(a, b)).toBe(hexDistance(b, a));
        expect(hexDistance(a, a)).toBe(0);
        if (a.q !== b.q || a.r !== b.r) expect(hexDistance(a, b)).toBeGreaterThan(0);
        expect(hexDistance(a, c)).toBeLessThanOrEqual(hexDistance(a, b) + hexDistance(b, c));
      }),
    );
  });

  it("every ring member of radius r is at distance r and rings are unique", () => {
    fc.assert(
      fc.property(hex, fc.integer({ min: 1, max: 6 }), (c, r) => {
        const ring = hexRing(c, r);
        expect(ring).toHaveLength(6 * r);
        for (const h of ring) expect(hexDistance(c, h)).toBe(r);
        expect(new Set(ring.map((h) => `${h.q},${h.r}`)).size).toBe(6 * r);
      }),
    );
  });

  it("spiral size formula holds for every radius", () => {
    fc.assert(
      fc.property(hex, fc.integer({ min: 0, max: 8 }), (c, r) => {
        expect(hexSpiral(c, r)).toHaveLength(1 + 3 * r * (r + 1));
      }),
    );
  });
});

describe("line laws (property)", () => {
  it("Bresenham and supercover lines include both endpoints", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        for (const line of [lineCells(a, b), supercoverLine(a, b)]) {
          expect(line[0]).toEqual(a);
          expect(line[line.length - 1]).toEqual(b);
        }
      }),
    );
  });

  it("supercover lines stay 8-connected with no repeats", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        const line = supercoverLine(a, b);
        const seen = new Set<string>();
        for (let i = 0; i < line.length; i++) {
          const key = `${line[i]!.x},${line[i]!.y}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
          if (i > 0) {
            const dx = Math.abs(line[i]!.x - line[i - 1]!.x);
            const dy = Math.abs(line[i]!.y - line[i - 1]!.y);
            expect(dx <= 1 && dy <= 1 && dx + dy >= 1).toBe(true);
          }
        }
      }),
    );
  });
});

describe("pixel round-trips (property)", () => {
  it("square top-left conversion inverts exactly", () => {
    const anyOrigin = fc.record({
      x: fc.integer({ min: -1000, max: 1000 }),
      y: fc.integer({ min: -1000, max: 1000 }),
    });
    const anySize = fc.integer({ min: 1, max: 200 });
    fc.assert(
      fc.property(cell, anyOrigin, anySize, (c, origin, size) => {
        const p = { x: origin.x + c.x * size + 0.1, y: origin.y + c.y * size + 0.1 };
        expect(pixelToCell(p, origin, size)).toEqual(c);
      }),
    );
  });

  it("hex pixel conversion round-trips for both orientations", () => {
    const sizeOption = fc.integer({ min: 1, max: 100 });
    fc.assert(
      fc.property(hex, sizeOption, (h, size) => {
        for (const orientation of ["pointy", "flat"] as const) {
          const layout = { orientation, size, origin: { x: 77, y: -42 } };
          expect(pixelToHex(hexToPixel(h, layout), layout)).toEqual(h);
        }
      }),
    );
  });
});

describe("neighborhood sanity (property)", () => {
  it("every listed neighbor is adjacent by the matching metric", () => {
    fc.assert(
      fc.property(cell, (c) => {
        for (const n of squareNeighbors(c, true)) {
          expect(chebyshevDistance(c, n)).toBe(1);
        }
      }),
    );
  });
});