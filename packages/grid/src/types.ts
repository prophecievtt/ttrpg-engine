/**
 * Shared grid types.
 *
 * Coordinate conventions:
 * - `Cell2D`: square grid cell, x = column, y = row (centers at integer coords).
 * - `AxialHex`: axial hex coordinate pair (q, r); the third cube axis s = -q - r.
 * - `CubeHex`: cube hex coordinate; invariant q + r + s === 0.
 *
 * Hex formulas follow the canonical Red Blob Games formulations
 * (https://www.redblobgames.com/grids/hexagons/).
 */
export interface Cell2D {
  readonly x: number;
  readonly y: number;
}

export interface AxialHex {
  readonly q: number;
  readonly r: number;
}

export interface CubeHex {
  readonly q: number;
  readonly r: number;
  readonly s: number;
}

/** World-space 2D point (pixels, world units). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Distance metrics with TTRPG conventions. */
export type DistanceMetric = "chebyshev" | "manhattan" | "altDiagonal" | "euclidean";

/**
 * Hex layout for pixel conversion. `size` is the hex circumradius in world
 * units (center to corner); `origin` is the world position of hex (0,0)'s center.
 */
export interface HexLayout {
  readonly orientation: "pointy" | "flat";
  readonly size: number;
  readonly origin: Point;
}