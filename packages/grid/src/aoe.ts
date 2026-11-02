/**
 * Area-of-effect cell sets for square and hex grids.
 *
 * Cells are tested by their centers: a cell is inside when its center falls
 * inside the template. All functions are pure and deterministic.
 */
import type { AxialHex, Cell2D, HexLayout } from "./types.js";
import { hexDistance, hexToUnitVector, hexSpiral } from "./hex.js";
import { ANGLE_EPSILON, euclideanDistance, squareRegion } from "./square.js";

/** Half-angle of a D&D 5e-style cone (width equals length at the far end):
 * exactly atan(0.5), derived rather than a rounded decimal literal so boundary
 * cells at the 2:1 slope stay deterministic. */
export const DEFAULT_CONE_HALF_ANGLE_DEG = (Math.atan(0.5) * 180) / Math.PI;

/**
 * Cells covered by a cone on a square grid.
 *
 * `dir` is a grid direction vector, e.g. { x: 1, y: 0 } for east;
 * `length` is the cone's reach in cells; the cone half-angle is configurable
 * (TTRPG default: width == length at the far end). Includes the origin cell.
 */
export function coneSq(
  origin: Cell2D,
  dir: Cell2D,
  length: number,
  halfAngleDeg = DEFAULT_CONE_HALF_ANGLE_DEG,
): Cell2D[] {
  const dirLen = Math.hypot(dir.x, dir.y);
  if (dirLen === 0) return [];
  const ux = dir.x / dirLen;
  const uy = dir.y / dirLen;
  const minCos = Math.cos((halfAngleDeg * Math.PI) / 180);
  const window = squareRegion(origin, Math.ceil(length));
  const cells: Cell2D[] = [];
  for (const c of window) {
    const vx = c.x - origin.x;
    const vy = c.y - origin.y;
    const dist = Math.hypot(vx, vy);
    if (dist > length) continue;
    if (dist === 0) {
      cells.push(c); // origin cell: angle undefined, always inside
      continue;
    }
    const cosAngle = (vx * ux + vy * uy) / dist;
    if (cosAngle + ANGLE_EPSILON >= minCos) cells.push(c);
  }
  return cells;
}

/**
 * Cells covered by a cone on a hex grid.
 *
 * `dir` is an axial direction vector (e.g. { q: 1, r: 0 }); the reach
 * `length` is measured in hex steps (cube distance); the angular test uses
 * the pointy-top Euclidean projection of axial coordinates.
 */
export function coneHex(
  origin: AxialHex,
  dir: AxialHex,
  length: number,
  halfAngleDeg = DEFAULT_CONE_HALF_ANGLE_DEG,
): AxialHex[] {
  const dv = hexToUnitVector(dir);
  const dirLen = Math.hypot(dv.x, dv.y);
  if (dirLen === 0) return [];
  const ux = dv.x / dirLen;
  const uy = dv.y / dirLen;
  const minCos = Math.cos((halfAngleDeg * Math.PI) / 180);
  const window = hexSpiral(origin, Math.ceil(length));
  const cells: AxialHex[] = [];
  for (const c of window) {
    const steps = hexDistance(origin, c);
    if (steps > length) continue;
    if (steps === 0) {
      cells.push(c);
      continue;
    }
    const v = hexToUnitVector({ q: c.q - origin.q, r: c.r - origin.r });
    const dist = Math.hypot(v.x, v.y);
    const cosAngle = (v.x * ux + v.y * uy) / dist;
    if (cosAngle + ANGLE_EPSILON >= minCos) cells.push(c);
  }
  return cells;
}

/** Euclidean circle on a square grid: cells whose center is within `radius`. */
export function circleSq(center: Cell2D, radius: number): Cell2D[] {
  if (radius < 0) return [];
  const cells: Cell2D[] = [];
  const window = squareRegion(center, Math.ceil(radius));
  for (const c of window) {
    if (euclideanDistance(center, c) <= radius) cells.push(c);
  }
  return cells;
}

/** Hex step-circle: cells within cube-distance `radius` (a hexagon of steps). */
export function circleHex(center: AxialHex, radius: number): AxialHex[] {
  return hexSpiral(center, radius);
}

/**
 * True Euclidean circle on a hex grid, testing hex centers in world units
 * against a real circle of the given world-unit `radius` under `layout`.
 */
export function circleHexEuclid(
  center: AxialHex,
  radius: number,
  layout: HexLayout,
): AxialHex[] {
  if (radius < 0) return [];
  // Max world distance per cube step is √3·size (either orientation); cover it.
  const ringReach = Math.ceil(radius / layout.size / Math.sqrt(3)) + 1;
  const cells: AxialHex[] = [];
  const window = hexSpiral(center, ringReach);
  for (const c of window) {
    const p = hexCenterInUnitAxial(c);
    const pc = hexCenterInUnitAxial(center);
    const dx = (p.x - pc.x) * layout.size;
    const dy = (p.y - pc.y) * layout.size;
    if (Math.sqrt(dx * dx + dy * dy) <= radius) cells.push(c);
  }
  return cells;
}

// unit-size pointy projection of a hex center (layout-independent shape)
function hexCenterInUnitAxial(h: AxialHex) {
  return hexToUnitVector(h);
}

/** Square-grid cube (area): alias of `squareRegion` (5e cubes cover squares). */
export function cubeCells(center: Cell2D, radius: number): Cell2D[] {
  return squareRegion(center, radius);
}

export { lineCells, supercoverLine } from "./square.js";