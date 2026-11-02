/** Measurement and area-of-effect target selection. */
import type { Area, MeasureMode, SelectOptions, Token, Vec3 } from "./api.js";
import { los } from "./raycast.js";
import { containsPoint, intersectShape } from "./shapes.js";

/**
 * Tape-measure distance. `horizontal` ignores elevation (2D map distance);
 * `vertical` is the elevation difference only.
 */
export function measure(a: Vec3, b: Vec3, mode: MeasureMode = "euclidean"): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  switch (mode) {
    case "euclidean":
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    case "horizontal":
      return Math.sqrt(dx * dx + dy * dy);
    case "vertical":
      return Math.abs(dz);
  }
}

/** Total length of a polyline (waypointed movement). */
export function measurePath(points: readonly Vec3[], mode: MeasureMode = "euclidean"): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += measure(points[i - 1]!, points[i]!, mode);
  return total;
}

function areaOrigin(area: Area): Vec3 {
  switch (area.kind) {
    case "sphere":
      return area.center;
    case "cone":
      return area.apex;
    case "cuboid":
      return {
        x: (area.min.x + area.max.x) / 2,
        y: (area.min.y + area.max.y) / 2,
        z: (area.min.z + area.max.z) / 2,
      };
  }
}

/**
 * Ids of tokens caught by an area template, in input order. A token is caught
 * when its sphere overlaps the area (radius 0 → its centre must be inside) and,
 * if `obstacles` are given, the area origin can see the token's centre (cover).
 */
export function selectTargets(
  area: Area,
  tokens: readonly Token[],
  options: SelectOptions = {},
): string[] {
  const origin = options.origin ?? areaOrigin(area);
  const out: string[] = [];
  for (const token of tokens) {
    const inside =
      token.radius > 0
        ? intersectShape(area, { kind: "sphere", center: token.position, radius: token.radius })
        : containsPoint(area, token.position);
    if (!inside) continue;
    if (options.obstacles && !los(origin, token.position, options.obstacles).visible) continue;
    out.push(token.id);
  }
  return out;
}
