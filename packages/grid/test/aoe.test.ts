import { describe, expect, it } from "vitest";

import {
  circleHex,
  circleHexEuclid,
  circleSq,
  coneHex,
  coneSq,
  cubeCells,
  hexDistance,
  hexSpiral,
  hexToPixel,
  squareRegion,
} from "../src/index.js";

describe("square AoE", () => {
  it("casts an east cone containing the origin and far center, excluding flanks", () => {
    const cone = coneSq({ x: 0, y: 0 }, { x: 1, y: 0 }, 3);
    expect(cone).toContainEqual({ x: 0, y: 0 });
    expect(cone).toContainEqual({ x: 3, y: 0 });
    // At axial distance 2 the half-width is 1 → (2,1) lies on the boundary (inside).
    expect(cone).toContainEqual({ x: 2, y: 1 });
    // Cell (3,1) exceeds the cone's length cap (√10 > 3): center outside template.
    expect(cone).not.toContainEqual({ x: 3, y: 1 });
    // (1,1) is outside the 26.565° half-angle from the apex.
    expect(cone).not.toContainEqual({ x: 1, y: 1 });
    // Behind the origin: not inside.
    expect(cone).not.toContainEqual({ x: -1, y: 0 });
  });

  it("rejects a zero direction vector", () => {
    expect(coneSq({ x: 0, y: 0 }, { x: 0, y: 0 }, 3)).toEqual([]);
  });

  it("returns a square region alias for cubeCells", () => {
    expect(cubeCells({ x: 1, y: 1 }, 2)).toEqual(squareRegion({ x: 1, y: 1 }, 2));
  });

  it("circle radius 2 covers a classic plus-filled disk of ≤ r euclidean", () => {
    const cells = circleSq({ x: 0, y: 0 }, 2);
    expect(cells).toContainEqual({ x: 0, y: 2 });
    expect(cells).toContainEqual({ x: 2, y: 0 });
    expect(cells).toContainEqual({ x: 1, y: 1 }); // sqrt2 ≤ 2
    expect(cells).not.toContainEqual({ x: 2, y: 2 }); // sqrt8 > 2
  });
});

describe("hex AoE", () => {
  it("casts a hex cone with step reach and angular cutoff", () => {
    const cone = coneHex({ q: 0, r: 0 }, { q: 1, r: 0 }, 3);
    expect(cone).toContainEqual({ q: 0, r: 0 });
    expect(cone).toContainEqual({ q: 3, r: 0 });
    // Reach limit: nothing beyond 3 steps.
    for (const c of cone) expect(hexDistance({ q: 0, r: 0 }, c)).toBeLessThanOrEqual(3);
  });

  it("hex step circle equals the filled spiral", () => {
    expect(circleHex({ q: 1, r: -1 }, 2)).toEqual(hexSpiral({ q: 1, r: -1 }, 2));
    expect(circleHex({ q: 0, r: 0 }, 2)).toHaveLength(19);
  });

  it("euclidean hex circle is a subset of the step circle and respects world radius", () => {
    const layout = { orientation: "pointy" as const, size: 10, origin: { x: 0, y: 0 } };
    const cells = circleHexEuclid({ q: 0, r: 0 }, 25, layout);
    for (const c of cells) {
      const p = hexToPixel(c, layout);
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(25 + 1e-9);
    }
    // Center is included.
    expect(cells).toContainEqual({ q: 0, r: 0 });
  });
});