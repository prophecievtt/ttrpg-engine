/** Shape constructors, point containment, and shape↔shape intersection tests. */
import type { Area, Cone, Cuboid, Plane, Shape, Sphere, Vec3, Wall } from "./api.js";
import { dot, lengthSq, sub } from "./vec.js";

export function sphere(center: Vec3, radius: number): Sphere {
  if (!(radius >= 0)) throw new RangeError(`sphere radius must be >= 0, got ${radius}`);
  return { kind: "sphere", center, radius };
}
export function cone(apex: Vec3, axis: Vec3, spread: number): Cone {
  if (!(spread >= 0)) throw new RangeError(`cone spread must be >= 0, got ${spread}`);
  if (lengthSq(axis) === 0) throw new RangeError("cone axis must be non-zero");
  return { kind: "cone", apex, axis, spread };
}
/** Cuboid from two opposite corners (any order). */
export function cuboid(c1: Vec3, c2: Vec3): Cuboid {
  return {
    kind: "cuboid",
    min: { x: Math.min(c1.x, c2.x), y: Math.min(c1.y, c2.y), z: Math.min(c1.z, c2.z) },
    max: { x: Math.max(c1.x, c2.x), y: Math.max(c1.y, c2.y), z: Math.max(c1.z, c2.z) },
  };
}
/** Axis-aligned cube centred on `center` with edge length `size`. */
export function cube(center: Vec3, size: number): Cuboid {
  const h = size / 2;
  return cuboid(
    { x: center.x - h, y: center.y - h, z: center.z - h },
    { x: center.x + h, y: center.y + h, z: center.z + h },
  );
}
export function plane(normal: Vec3, offset: number): Plane {
  if (lengthSq(normal) === 0) throw new RangeError("plane normal must be non-zero");
  return { kind: "plane", normal, offset };
}
export function wall(a: Vec3, b: Vec3, bottom: number, top: number): Wall {
  if (!(top >= bottom)) throw new RangeError(`wall top (${top}) must be >= bottom (${bottom})`);
  return { kind: "wall", a, b, bottom, top };
}

/** True when `p` is inside or on the boundary of the shape. Walls have no volume. */
export function containsPoint(shape: Shape, p: Vec3): boolean {
  switch (shape.kind) {
    case "sphere": {
      const r = shape.radius;
      return lengthSq(sub(p, shape.center)) <= r * r;
    }
    case "cuboid":
      return (
        p.x >= shape.min.x && p.x <= shape.max.x &&
        p.y >= shape.min.y && p.y <= shape.max.y &&
        p.z >= shape.min.z && p.z <= shape.max.z
      );
    case "cone": {
      // v·a = t·L where t = axial distance. Inside iff 0 <= v·a <= L² and
      // radial² <= (t·s)², i.e. |v|²·L² <= (v·a)²·(1 + s²). No sqrt needed.
      const v = sub(p, shape.apex);
      const L2 = lengthSq(shape.axis);
      const va = dot(v, shape.axis);
      if (va < 0 || va > L2) return false;
      return lengthSq(v) * L2 <= va * va * (1 + shape.spread * shape.spread);
    }
    case "plane":
      return dot(shape.normal, p) <= shape.offset;
    case "wall":
      return false;
  }
}

/** Squared distance from a point to an axis-aligned box (0 when inside). */
export function cuboidDistanceSq(box: Cuboid, p: Vec3): number {
  let d = 0;
  for (const k of ["x", "y", "z"] as const) {
    const v = p[k];
    if (v < box.min[k]) d += (box.min[k] - v) * (box.min[k] - v);
    else if (v > box.max[k]) d += (v - box.max[k]) * (v - box.max[k]);
  }
  return d;
}

function segDistSq2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  let u = len2 === 0 ? 0 : ((px - ax) * ex + (py - ay) * ey) / len2;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  const dx = px - (ax + ex * u);
  const dy = py - (ay + ey * u);
  return dx * dx + dy * dy;
}

/**
 * Squared distance from a point to the solid finite cone. The cone is rotationally
 * symmetric, so the problem reduces to the half-plane (axial t, radial ρ ≥ 0) where
 * the cone is the triangle (0,0), (L,0), (L, L·s).
 */
export function coneDistanceSq(c: Cone, p: Vec3): number {
  const L = Math.sqrt(lengthSq(c.axis));
  const v = sub(p, c.apex);
  const t = dot(v, c.axis) / L;
  const rho2 = lengthSq(v) - t * t;
  const rho = rho2 > 0 ? Math.sqrt(rho2) : 0;
  const R = L * c.spread;
  if (t >= 0 && t <= L && rho <= t * c.spread) return 0;
  return Math.min(
    segDistSq2(t, rho, 0, 0, L, R), // slanted side
    segDistSq2(t, rho, L, 0, L, R), // base disc
    segDistSq2(t, rho, 0, 0, L, 0), // axis (only matters at ρ = 0)
  );
}

function sphereVs(a: Sphere, b: Exclude<Area, Sphere> | Sphere): boolean {
  const r2 = a.radius * a.radius;
  switch (b.kind) {
    case "sphere": {
      const r = a.radius + b.radius;
      return lengthSq(sub(a.center, b.center)) <= r * r;
    }
    case "cuboid":
      return cuboidDistanceSq(b, a.center) <= r2;
    case "cone":
      return coneDistanceSq(b, a.center) <= r2;
  }
}

/**
 * Whether two solid shapes overlap (touching counts). Supported pairs:
 * sphere–sphere, sphere–cuboid, sphere–cone, cuboid–cuboid. Model tokens as
 * spheres to test them against any template. Other pairs throw.
 */
export function intersectShape(a: Shape, b: Shape): boolean {
  if (a.kind === "sphere" && (b.kind === "sphere" || b.kind === "cuboid" || b.kind === "cone")) {
    return sphereVs(a, b);
  }
  if (b.kind === "sphere" && (a.kind === "cuboid" || a.kind === "cone")) return sphereVs(b, a);
  if (a.kind === "cuboid" && b.kind === "cuboid") {
    return (
      a.min.x <= b.max.x && a.max.x >= b.min.x &&
      a.min.y <= b.max.y && a.max.y >= b.min.y &&
      a.min.z <= b.max.z && a.max.z >= b.min.z
    );
  }
  throw new TypeError(`intersectShape: unsupported pair ${a.kind}/${b.kind}`);
}
