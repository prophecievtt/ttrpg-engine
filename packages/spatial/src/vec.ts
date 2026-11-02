/** Vector math. Only + - * / and Math.sqrt (see api.ts determinism contract). */
import type { Vec3 } from "./api.js";

export const EPSILON = 1e-9;

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}
/** A 2D point embedded at z = 0. */
export function vec2(x: number, y: number): Vec3 {
  return { x, y, z: 0 };
}
/** Project onto the z = 0 plane (2D mode). */
export function lockZ(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: 0 };
}
export const ZERO: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
export function scale(v: Vec3, k: number): Vec3 {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}
/** a + b * k */
export function addScaled(a: Vec3, b: Vec3, k: number): Vec3 {
  return { x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k };
}
export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
export function lengthSq(v: Vec3): number {
  return dot(v, v);
}
export function length(v: Vec3): number {
  return Math.sqrt(dot(v, v));
}
export function distanceSq(a: Vec3, b: Vec3): number {
  return lengthSq(sub(a, b));
}
export function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(distanceSq(a, b));
}
/** Unit vector; the zero vector stays zero. */
export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  return len === 0 ? ZERO : scale(v, 1 / len);
}
export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return addScaled(a, sub(b, a), t);
}
export function equals(a: Vec3, b: Vec3, eps = 0): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;
}
