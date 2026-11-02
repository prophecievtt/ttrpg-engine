/**
 * Hexagonal-grid mathematics using axial storage + cube coordinates.
 *
 * Formulas from Red Blob Games, "Hexagonal Grids"
 * (https://www.redblobgames.com/grids/hexagons/) — axial q,r with s = -q-r.
 * All functions are pure and deterministic.
 */
import type { AxialHex, CubeHex, HexLayout, Point } from "./types.js";

/** The six cube direction vectors (clockwise). */
export const HEX_DIRECTIONS: readonly CubeHex[] = [
  { q: 1, r: 0, s: -1 },
  { q: 1, r: -1, s: 0 },
  { q: 0, r: -1, s: 1 },
  { q: -1, r: 0, s: 1 },
  { q: -1, r: 1, s: 0 },
  { q: 0, r: 1, s: -1 },
];

/** The six cube diagonal vectors (clockwise). */
export const HEX_DIAGONALS: readonly CubeHex[] = [
  { q: 2, r: -1, s: -1 },
  { q: 1, r: -2, s: 1 },
  { q: -1, r: -1, s: 2 },
  { q: -2, r: 1, s: 1 },
  { q: -1, r: 2, s: -1 },
  { q: 1, r: 1, s: -2 },
];

export function hexToCube(h: AxialHex): CubeHex {
  return { q: h.q, r: h.r, s: -h.q - h.r };
}

export function cubeToHex(c: CubeHex): AxialHex {
  return { q: c.q, r: c.r };
}

export function cubeAdd(a: CubeHex, b: CubeHex): CubeHex {
  return { q: a.q + b.q, r: a.r + b.r, s: a.s + b.s };
}

export function cubeSub(a: CubeHex, b: CubeHex): CubeHex {
  return { q: a.q - b.q, r: a.r - b.r, s: a.s - b.s };
}

export function cubeScale(a: CubeHex, k: number): CubeHex {
  return { q: a.q * k, r: a.r * k, s: a.s * k };
}

/** Six adjacent hexes in stable clockwise order. */
export function hexNeighbors(h: AxialHex): AxialHex[] {
  const c = hexToCube(h);
  return HEX_DIRECTIONS.map((d) => cubeToHex(cubeAdd(c, d)));
}

/** Six diagonal-adjacent hexes in stable clockwise order. */
export function hexDiagonalNeighbors(h: AxialHex): AxialHex[] {
  const c = hexToCube(h);
  return HEX_DIAGONALS.map((d) => cubeToHex(cubeAdd(c, d)));
}

/** Hex-grid step distance: max(|dq|, |dr|, |ds|) over cube coordinates. */
export function hexDistance(a: AxialHex, b: AxialHex): number {
  const ca = hexToCube(a);
  const cb = hexToCube(b);
  return Math.max(
    Math.abs(ca.q - cb.q),
    Math.abs(ca.r - cb.r),
    Math.abs(ca.s - cb.s),
  );
}

/**
 * Round a fractional cube coordinate to the nearest hex, restoring the
 * q + r + s === 0 invariant by resetting the axis with the largest error.
 */
export function hexRound(c: CubeHex): CubeHex {
  // `+ 0` normalizes negative zero so results compare equal across encoders.
  let q = Math.round(c.q) + 0;
  let r = Math.round(c.r) + 0;
  let s = Math.round(c.s) + 0;
  const dq = Math.abs(q - c.q);
  const dr = Math.abs(r - c.r);
  const ds = Math.abs(s - c.s);
  if (dq > dr && dq > ds) {
    q = -r - s + 0;
  } else if (dr > ds) {
    r = -q - s + 0;
  } else {
    s = -q - r + 0;
  }
  return { q, r, s };
}

/** All hexes at exactly cube-distance `radius` from center (radius 0 → [center]). */
export function hexRing(center: AxialHex, radius: number): AxialHex[] {
  if (radius < 0) return [];
  if (radius === 0) return [center];
  const cc = hexToCube(center);
  const results: AxialHex[] = [];
  let hex = cubeAdd(cc, cubeScale(HEX_DIRECTIONS[4]!, radius));
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      results.push(cubeToHex(hex));
      hex = cubeAdd(hex, HEX_DIRECTIONS[i]!);
    }
  }
  return results;
}

/**
 * Filled hex region: center plus all rings out to `radius`.
 * Count = 1 + 3 * radius * (radius + 1).
 */
export function hexSpiral(center: AxialHex, radius: number): AxialHex[] {
  if (radius < 0) return [];
  const results: AxialHex[] = [center];
  for (let k = 1; k <= radius; k++) {
    results.push(...hexRing(center, k));
  }
  return results;
}

/**
 * Hex line from `a` to `b` via linear interpolation + rounding:
 * includes both endpoints; every step moves exactly one cell.
 */
export function hexLine(a: AxialHex, b: AxialHex): AxialHex[] {
  const n = hexDistance(a, b);
  if (n === 0) return [a];
  const ca = hexToCube(a);
  const cb = hexToCube(b);
  const results: AxialHex[] = [a];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    results.push(
      cubeToHex(
        hexRound({
          q: ca.q + (cb.q - ca.q) * t,
          r: ca.r + (cb.r - ca.r) * t,
          s: ca.s + (cb.s - ca.s) * t,
        }),
      ),
    );
  }
  return results;
}

/** Hex center → world pixel, per Red Blob Games layout formulas + origin. */
export function hexToPixel(h: AxialHex, layout: HexLayout): Point {
  const { orientation, size, origin } = layout;
  let x: number;
  let y: number;
  if (orientation === "pointy") {
    x = size * (Math.sqrt(3) * h.q + (Math.sqrt(3) / 2) * h.r);
    y = size * ((3 / 2) * h.r);
  } else {
    x = size * ((3 / 2) * h.q);
    y = size * ((Math.sqrt(3) / 2) * h.q + Math.sqrt(3) * h.r);
  }
  return { x: origin.x + x, y: origin.y + y };
}

/** World pixel → nearest hex (inverse of `hexToPixel`, with rounding). */
export function pixelToHex(p: Point, layout: HexLayout): AxialHex {
  const { orientation, size, origin } = layout;
  const x = (p.x - origin.x) / size;
  const y = (p.y - origin.y) / size;
  const frac: CubeHex =
    orientation === "pointy"
      ? {
          q: (Math.sqrt(3) / 3) * x - (1 / 3) * y,
          r: (2 / 3) * y,
          s: 0,
        }
      : {
          q: (2 / 3) * x,
          r: (-1 / 3) * x + (Math.sqrt(3) / 3) * y,
          s: 0,
        };
  frac.s = -frac.q - frac.r; // s is only meaningful via rounding; set for consistency
  return cubeToHex(hexRound(frac));
}

/** Euclidean position of a hex in unit axial space (pointy-top projection, size 1). */
export function hexToUnitVector(h: AxialHex): { x: number; y: number } {
  return {
    x: Math.sqrt(3) * h.q + (Math.sqrt(3) / 2) * h.r,
    y: (3 / 2) * h.r,
  };
}