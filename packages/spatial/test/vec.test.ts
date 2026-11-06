import { describe, expect, it } from "vitest";

import {
  add, addScaled, cross, distance, distanceSq, dot, EPSILON, equals, length, lengthSq,
  lerp, lockZ, normalize, scale, sub, vec2, vec3, ZERO,
} from "../src/index.js";

describe("vector constructors", () => {
  it("build 3D points, 2D points at z = 0, and z-locked projections", () => {
    expect(vec3(1, -2, 3)).toEqual({ x: 1, y: -2, z: 3 });
    expect(vec2(4, 5)).toEqual({ x: 4, y: 5, z: 0 });
    const v = vec3(6, 7, 8);
    expect(lockZ(v)).toEqual(vec3(6, 7, 0));
    expect(v).toEqual(vec3(6, 7, 8)); // input untouched
  });

  it("exposes a frozen zero vector and a tiny epsilon", () => {
    expect(ZERO).toEqual(vec3(0, 0, 0));
    expect(Object.isFrozen(ZERO)).toBe(true);
    expect(EPSILON).toBe(1e-9);
  });
});

describe("vector arithmetic", () => {
  const a = vec3(1, 2, 3);
  const b = vec3(4, -5, 6);

  it("adds, subtracts, scales and adds scaled vectors component-wise", () => {
    expect(add(a, b)).toEqual(vec3(5, -3, 9));
    expect(sub(a, b)).toEqual(vec3(-3, 7, -3));
    expect(scale(a, -2)).toEqual(vec3(-2, -4, -6));
    expect(addScaled(a, b, 0.5)).toEqual(vec3(3, -0.5, 6));
  });

  it("computes dot and right-handed cross products", () => {
    expect(dot(a, b)).toBe(12);
    expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual(vec3(0, 0, 1));
    expect(cross(a, b)).toEqual(vec3(27, 6, -13));
    expect(dot(cross(a, b), a)).toBe(0);
    expect(dot(cross(a, b), b)).toBe(0);
  });

  it("measures lengths and distances", () => {
    expect(lengthSq(vec3(2, 3, 6))).toBe(49);
    expect(length(vec3(2, 3, 6))).toBe(7);
    expect(distanceSq(vec3(1, 1, 1), vec3(4, 5, 1))).toBe(25);
    expect(distance(vec3(1, 1, 1), vec3(4, 5, 1))).toBe(5);
  });

  it("normalizes non-zero vectors and keeps the zero vector zero", () => {
    expect(normalize(vec3(0, 0, -4))).toEqual(vec3(0, 0, -1));
    expect(equals(normalize(vec3(0, 3, 4)), vec3(0, 0.6, 0.8), EPSILON)).toBe(true);
    expect(length(normalize(vec3(-7, 2, 9)))).toBeCloseTo(1, 12);
    expect(normalize(vec3(0, 0, 0))).toBe(ZERO);
  });

  it("interpolates between endpoints, including extrapolation", () => {
    expect(lerp(a, b, 0)).toEqual(a);
    expect(lerp(a, b, 1)).toEqual(b);
    expect(lerp(a, b, 0.5)).toEqual(vec3(2.5, -1.5, 4.5));
    expect(lerp(a, b, 2)).toEqual(vec3(7, -12, 9));
  });
});

describe("equals", () => {
  it("is exact by default and tolerant per component with eps", () => {
    expect(equals(vec3(1, 2, 3), vec3(1, 2, 3))).toBe(true);
    expect(equals(vec3(1, 2, 3), vec3(1, 2, 3 + EPSILON))).toBe(false);
    expect(equals(vec3(1, 2, 3), vec3(1.05, 1.95, 3), 0.1)).toBe(true);
    expect(equals(vec3(1, 2, 3), vec3(1, 2.2, 3), 0.1)).toBe(false);
    expect(equals(vec3(1, 2, 3), vec3(1, 2, 3.2), 0.1)).toBe(false);
  });
});
