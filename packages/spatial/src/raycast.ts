/**
 * Raycasting and line of sight.
 *
 * Rays that start inside a solid (sphere, cuboid) ignore it, so a token's own
 * bounds never block its sight. Planes and walls are thin surfaces hit from either side.
 * Ties on `t` resolve to the lower obstacle index (deterministic).
 */
import type { Cuboid, LosResult, Obstacle, Plane, Ray, RayHit, Sphere, Vec3, Wall } from "./api.js";
import { EPSILON, addScaled, dot, normalize, sub } from "./vec.js";

type Partial = { t: number; normal: Vec3 } | null;

/**
 * Unit normal pointing against `dir`. `+ 0` canonicalises -0 to +0 so outputs
 * are bit-stable (the wasm core must do the same).
 */
function facing(normal: Vec3, dir: Vec3): Vec3 {
  const n = normalize(normal);
  const k = dot(n, dir) > 0 ? -1 : 1;
  return { x: n.x * k + 0, y: n.y * k + 0, z: n.z * k + 0 };
}

function hitSphere(ray: Ray, s: Sphere): Partial {
  const oc = sub(ray.origin, s.center);
  const a = dot(ray.dir, ray.dir);
  if (a === 0) return null;
  const c = dot(oc, oc) - s.radius * s.radius;
  if (c < 0) return null; // origin inside
  const b = dot(oc, ray.dir);
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  if (t < 0) return null;
  return { t, normal: normalize(sub(addScaled(ray.origin, ray.dir, t), s.center)) };
}

const AXES = ["x", "y", "z"] as const;

function hitCuboid(ray: Ray, box: Cuboid): Partial {
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis: 0 | 1 | 2 = 0;
  let sign = -1;
  for (let i = 0; i < 3; i++) {
    const k = AXES[i]!;
    const o = ray.origin[k];
    const d = ray.dir[k];
    if (d === 0) {
      if (o < box.min[k] || o > box.max[k]) return null;
      continue;
    }
    let t1 = (box.min[k] - o) / d;
    let t2 = (box.max[k] - o) / d;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = i as 0 | 1 | 2;
      sign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin < 0) return null; // origin inside (or box behind)
  const normal: Vec3 = {
    x: axis === 0 ? sign : 0,
    y: axis === 1 ? sign : 0,
    z: axis === 2 ? sign : 0,
  };
  return { t: tmin, normal };
}

function hitPlane(ray: Ray, p: Plane): Partial {
  const denom = dot(p.normal, ray.dir);
  if (denom === 0) return null;
  const t = (p.offset - dot(p.normal, ray.origin)) / denom;
  if (t < 0) return null;
  return { t, normal: facing(p.normal, ray.dir) };
}

function hitWall(ray: Ray, w: Wall): Partial {
  const ex = w.b.x - w.a.x;
  const ey = w.b.y - w.a.y;
  const dx = ray.dir.x;
  const dy = ray.dir.y;
  const denom = dx * ey - dy * ex;
  if (denom === 0) return null; // parallel (or vertical ray)
  const ax = w.a.x - ray.origin.x;
  const ay = w.a.y - ray.origin.y;
  const t = (ax * ey - ay * ex) / denom;
  const u = (ax * dy - ay * dx) / denom;
  if (t < 0 || u < 0 || u > 1) return null;
  const z = ray.origin.z + ray.dir.z * t;
  if (z < w.bottom || z > w.top) return null;
  return { t, normal: facing({ x: -ey, y: ex, z: 0 }, ray.dir) };
}

function hitObstacle(ray: Ray, o: Obstacle): Partial {
  switch (o.kind) {
    case "sphere":
      return hitSphere(ray, o);
    case "cuboid":
      return hitCuboid(ray, o);
    case "plane":
      return hitPlane(ray, o);
    case "wall":
      return hitWall(ray, o);
  }
}

/** Every hit with t <= maxT, sorted by t then obstacle index. */
export function raycastAll(ray: Ray, obstacles: readonly Obstacle[], maxT = Infinity): RayHit[] {
  const hits: RayHit[] = [];
  for (let i = 0; i < obstacles.length; i++) {
    const h = hitObstacle(ray, obstacles[i]!);
    if (h && h.t <= maxT) {
      hits.push({ t: h.t, point: addScaled(ray.origin, ray.dir, h.t), normal: h.normal, index: i });
    }
  }
  return hits.sort((a, b) => a.t - b.t || a.index - b.index);
}

/** Nearest hit with t <= maxT, or null. */
export function raycast(ray: Ray, obstacles: readonly Obstacle[], maxT = Infinity): RayHit | null {
  let best: RayHit | null = null;
  for (let i = 0; i < obstacles.length; i++) {
    const h = hitObstacle(ray, obstacles[i]!);
    if (h && h.t <= maxT && (best === null || h.t < best.t)) {
      best = { t: h.t, point: addScaled(ray.origin, ray.dir, h.t), normal: h.normal, index: i };
    }
  }
  return best;
}

/**
 * Line of sight between two points. Blocked by any obstacle strictly between
 * them; surfaces touching either endpoint (within EPSILON of the segment's
 * ends) do not block, so a token standing against a wall can still see out.
 */
export function los(from: Vec3, to: Vec3, obstacles: readonly Obstacle[]): LosResult {
  // Same answer as scanning raycastAll(ray, obstacles, 1) in order, without
  // allocating or sorting every hit: keep the nearest blocking hit (t, then index).
  const ray: Ray = { origin: from, dir: sub(to, from) };
  let best: { t: number; normal: Vec3; index: number } | null = null;
  for (let i = 0; i < obstacles.length; i++) {
    const h = hitObstacle(ray, obstacles[i]!);
    if (h && h.t > EPSILON && h.t < 1 - EPSILON && (best === null || h.t < best.t)) {
      best = { t: h.t, normal: h.normal, index: i };
    }
  }
  if (best === null) return { visible: true };
  const blocker: RayHit = {
    t: best.t,
    point: addScaled(ray.origin, ray.dir, best.t),
    normal: best.normal,
    index: best.index,
  };
  return { visible: false, blocker };
}
