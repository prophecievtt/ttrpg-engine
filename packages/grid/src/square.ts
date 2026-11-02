/**
 * Square-grid mathematics. Cell centers live at integer coordinates.
 * All functions are pure and deterministic.
 */
import type { Cell2D, DistanceMetric, Point } from "./types.js";

/** Chebyshev (king's-move) distance: max(|dx|, |dy|). */
export function chebyshevDistance(a: Cell2D, b: Cell2D): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Manhattan (rook's-move) distance: |dx| + |dy|. */
export function manhattanDistance(a: Cell2D, b: Cell2D): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Boundary tolerance for angular tests: cells whose center sits exactly on the
 * template edge are included (deterministic, immune to float rounding ulps). */
export const ANGLE_EPSILON = 1e-12;

/**
 * Alternating-diagonal distance (the "every other diagonal costs double"
 * convention, e.g. D&D 5e grid movement): max(|dx|,|dy|) + floor(min(|dx|,|dy|)/2).
 */
export function altDiagonalDistance(a: Cell2D, b: Cell2D): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
}

/** Euclidean distance between cell centers. */
export function euclideanDistance(a: Cell2D, b: Cell2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance dispatch by metric. */
export function squareDistance(a: Cell2D, b: Cell2D, metric: DistanceMetric): number {
  switch (metric) {
    case "chebyshev":
      return chebyshevDistance(a, b);
    case "manhattan":
      return manhattanDistance(a, b);
    case "altDiagonal":
      return altDiagonalDistance(a, b);
    case "euclidean":
      return euclideanDistance(a, b);
  }
}

/** Orthogonal (4) or full (8) neighbors, in a stable clockwise order. */
export function squareNeighbors(a: Cell2D, diagonal = false): Cell2D[] {
  const cells: Cell2D[] = [
    { x: a.x + 1, y: a.y },
    { x: a.x, y: a.y + 1 },
    { x: a.x - 1, y: a.y },
    { x: a.x, y: a.y - 1 },
  ];
  if (diagonal) {
    cells.push(
      { x: a.x + 1, y: a.y + 1 },
      { x: a.x - 1, y: a.y + 1 },
      { x: a.x - 1, y: a.y - 1 },
      { x: a.x + 1, y: a.y - 1 },
    );
  }
  return cells;
}

/**
 * All cells at exactly Chebyshev distance `radius` from `center`
 * (the border of a square region). Radius 0 returns the center itself.
 */
export function squareRing(center: Cell2D, radius: number): Cell2D[] {
  if (radius < 0) return [];
  if (radius === 0) return [center];
  const cells: Cell2D[] = [];
  for (let x = center.x - radius; x <= center.x + radius; x++) {
    for (let y = center.y - radius; y <= center.y + radius; y++) {
      if (chebyshevDistance({ x, y }, center) === radius) cells.push({ x, y });
    }
  }
  return cells;
}

/** Filled square (cube) region: every cell within Chebyshev distance `radius`. */
export function squareRegion(center: Cell2D, radius: number): Cell2D[] {
  if (radius < 0) return [];
  const cells: Cell2D[] = [];
  for (let x = center.x - radius; x <= center.x + radius; x++) {
    for (let y = center.y - radius; y <= center.y + radius; y++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * Grid line via Bresenham between cell centers. Endpoints included.
 * Ideal for token movement paths; for the full "every touched cell" line
 * (LoS/cover concerns) prefer `supercoverLine`.
 */
export function lineCells(a: Cell2D, b: Cell2D): Cell2D[] {
  const cells: Cell2D[] = [];
  let x0 = a.x;
  let y0 = a.y;
  const x1 = b.x;
  const y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return cells;
}

/**
 * Supercover line: every cell the segment touches, including corner cases.
 * Endpoints included; consecutive cells are 8-connected with no duplicates.
 */
export function supercoverLine(a: Cell2D, b: Cell2D): Cell2D[] {
  const cells: Cell2D[] = [];
  let x = a.x;
  let y = a.y;
  const x1 = b.x;
  const y1 = b.y;
  const sx = x1 > x ? 1 : -1;
  const sy = y1 > y ? 1 : -1;
  const dx = x1 - x;
  const dy = y1 - y;
  cells.push({ x, y });
  while (x !== x1 || y !== y1) {
    // Relative t at which the ray crosses the next vertical/horizontal cell border.
    const tX =
      dx === 0 ? Infinity : (x + 0.5 * sx - a.x) / dx;
    const tY =
      dy === 0 ? Infinity : (y + 0.5 * sy - a.y) / dy;
    if (tX < tY) x += sx;
    else if (tX > tY) y += sy;
    else {
      x += sx;
      y += sy; // exact corner crossing: step diagonally
    }
    cells.push({ x, y });
  }
  return cells;
}

/**
 * Center (or top-left, when `center = false`) pixel position of a cell for a
 * grid whose cell (0,0) has its top-left corner at `origin`, with `cellSize`
 * world units per cell.
 */
export function cellToPixel(
  cell: Cell2D,
  origin: Point,
  cellSize: number,
  center = true,
): Point {
  const offset = center ? 0.5 : 0;
  return {
    x: origin.x + (cell.x + offset) * cellSize,
    y: origin.y + (cell.y + offset) * cellSize,
  };
}

/** Cell containing a world point (floor division). Inverse of the non-center mode. */
export function pixelToCell(p: Point, origin: Point, cellSize: number): Cell2D {
  return {
    x: Math.floor((p.x - origin.x) / cellSize),
    y: Math.floor((p.y - origin.y) / cellSize),
  };
}