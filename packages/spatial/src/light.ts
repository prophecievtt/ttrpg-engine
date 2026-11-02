/**
 * Lighting: how lit a point is, and the outline of a light's lit region.
 *
 * Light travels in straight lines, so both queries are built on raycasting:
 * - `illumination` is exact in 3D: a light reaches a point within its `dim`
 *   radius when nothing in `obstacles` blocks the sight line (same rules as `los`).
 * - `lightBoundary` is the 2D visibility polygon a renderer masks a light with
 *   (the horizontal slice at the light's height). Walls and cuboids that span
 *   that height cast shadows; spheres and planes are ignored there (use
 *   `illumination` for exact per-point answers).
 *
 * Same determinism contract as the rest of the package: only `+ - * /`,
 * `Math.abs` and `Math.sqrt`. Angles are sorted by a pseudo-angle, never atan2.
 */
import type {
  Illumination,
  IlluminationOptions,
  LightBoundary,
  LightLevel,
  LightSource,
  Obstacle,
  Vec3,
} from "./api.js";
import { los } from "./raycast.js";
import { distanceSq } from "./vec.js";

const RANK: Record<LightLevel, number> = { dark: 0, dim: 1, bright: 2 };

/** Light level at `p`: the brightest of `ambient` and every light that reaches it. */
export function illumination(
  p: Vec3,
  lights: readonly LightSource[],
  obstacles: readonly Obstacle[],
  options: IlluminationOptions = {},
): Illumination {
  let level: LightLevel = options.ambient ?? "dark";
  const sources: { id: string; level: LightLevel }[] = [];
  for (const light of lights) {
    const d2 = distanceSq(light.position, p);
    if (!(light.dim > 0) || d2 > light.dim * light.dim) continue; // dim 0 = switched off
    if (!los(light.position, p, obstacles).visible) continue;
    const l: LightLevel = d2 <= light.bright * light.bright ? "bright" : "dim";
    sources.push({ id: light.id, level: l });
    if (RANK[l] > RANK[level]) level = l;
  }
  return { level, sources };
}

/** Relative sideways nudge for the rays cast just past each corner. */
const NUDGE = 1e-4;

type Hit = { angle: number; d2: number; point: Vec3 };

type Seg = { ax: number; ay: number; bx: number; by: number };

/** Liang–Barsky clip of a segment to the square [x0,x1]×[y0,y1]; null if outside. */
function clip(s: Seg, x0: number, y0: number, x1: number, y1: number): Seg | null {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, s.ax - x0],
    [dx, x1 - s.ax],
    [-dy, s.ay - y0],
    [dy, y1 - s.ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return { ax: s.ax + dx * t0, ay: s.ay + dy * t0, bx: s.ax + dx * t1, by: s.ay + dy * t1 };
}

/** Monotonic counter-clockwise angle substitute in [0, 4), starting at +x. */
function pseudoAngle(dx: number, dy: number): number {
  const p = dx / (Math.abs(dx) + Math.abs(dy));
  return dy < 0 ? 3 + p : 1 - p;
}

/**
 * The lit region of `light` as a counter-clockwise polygon at the light's height.
 * Unblocked directions end on the square of half-side `dim` around the light,
 * so a renderer should also clip the polygon with the `dim` circle.
 */
export function lightBoundary(light: LightSource, obstacles: readonly Obstacle[]): LightBoundary {
  const c = light.position;
  const r = light.dim;
  const base = { id: light.id, center: c, bright: light.bright, dim: r };
  if (!(r > 0)) return { ...base, points: [] };

  const x0 = c.x - r;
  const y0 = c.y - r;
  const x1 = c.x + r;
  const y1 = c.y + r;
  const raw: Seg[] = [
    { ax: x0, ay: y0, bx: x1, by: y0 },
    { ax: x1, ay: y0, bx: x1, by: y1 },
    { ax: x1, ay: y1, bx: x0, by: y1 },
    { ax: x0, ay: y1, bx: x0, by: y0 },
  ];
  for (const o of obstacles) {
    if (o.kind === "wall") {
      if (c.z < o.bottom || c.z > o.top) continue;
      raw.push({ ax: o.a.x, ay: o.a.y, bx: o.b.x, by: o.b.y });
    } else if (o.kind === "cuboid") {
      if (c.z < o.min.z || c.z > o.max.z) continue;
      const { min: m, max: M } = o;
      // A light inside a solid ignores it, as rays do.
      if (c.x > m.x && c.x < M.x && c.y > m.y && c.y < M.y) continue;
      raw.push(
        { ax: m.x, ay: m.y, bx: M.x, by: m.y },
        { ax: M.x, ay: m.y, bx: M.x, by: M.y },
        { ax: M.x, ay: M.y, bx: m.x, by: M.y },
        { ax: m.x, ay: M.y, bx: m.x, by: m.y },
      );
    }
  }

  const segs: Seg[] = [];
  for (const s of raw) {
    const k = clip(s, x0, y0, x1, y1);
    if (k) segs.push(k);
  }
  // Flat copy of the segments for the hot loop: [ax, ay, ex, ey] per segment,
  // with e = b - a. Same arithmetic as raycast's wall test, so results match it.
  const n = segs.length;
  const flat = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const s = segs[i]!;
    flat[i * 4] = s.ax;
    flat[i * 4 + 1] = s.ay;
    flat[i * 4 + 2] = s.bx - s.ax;
    flat[i * 4 + 3] = s.by - s.ay;
  }

  const hits: Hit[] = [];
  const cast = (dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    let best = Infinity;
    for (let i = 0; i < n * 4; i += 4) {
      const ex = flat[i + 2]!;
      const ey = flat[i + 3]!;
      const denom = dx * ey - dy * ex;
      if (denom === 0) continue;
      const ax = flat[i]! - c.x;
      const ay = flat[i + 1]! - c.y;
      const t = (ax * ey - ay * ex) / denom;
      if (t < 0 || t >= best) continue;
      const u = (ax * dy - ay * dx) / denom;
      if (u < 0 || u > 1) continue;
      best = t;
    }
    if (best === Infinity) return;
    const point = { x: c.x + dx * best, y: c.y + dy * best, z: c.z };
    hits.push({ angle: pseudoAngle(dx, dy), d2: distanceSq(point, c), point });
  };
  // Shared corners (rooms, pillars) cast the same three rays: cast them once
  // and re-push the cached hits, so the output is the same as casting again.
  const cache = new Map<string, Hit[]>();
  for (const s of segs) {
    for (const [ex, ey] of [
      [s.ax, s.ay],
      [s.bx, s.by],
    ] as const) {
      const key = `${ex},${ey}`;
      const cached = cache.get(key);
      if (cached) {
        hits.push(...cached);
        continue;
      }
      const start = hits.length;
      const dx = ex - c.x;
      const dy = ey - c.y;
      cast(dx, dy);
      cast(dx - dy * NUDGE, dy + dx * NUDGE);
      cast(dx + dy * NUDGE, dy - dx * NUDGE);
      cache.set(key, hits.slice(start));
    }
  }
  hits.sort((a, b) => a.angle - b.angle || a.d2 - b.d2);

  const points: Vec3[] = [];
  for (const h of hits) {
    const last = points[points.length - 1];
    if (last && last.x === h.point.x && last.y === h.point.y) continue;
    points.push(h.point);
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 1 && first!.x === last!.x && first!.y === last!.y) points.pop();
  return { ...base, points };
}
