import { describe, expect, it } from "vitest";

import {
  cone, containsPoint, cube, cuboid, intersectShape, plane, sphere, vec2, vec3, wall,
} from "../src/index.js";

describe("constructors", () => {
  it("validate their inputs", () => {
    expect(() => sphere(vec3(0, 0, 0), -1)).toThrow(RangeError);
    expect(() => cone(vec3(0, 0, 0), vec3(0, 0, 0), 0.5)).toThrow(RangeError);
    expect(() => plane(vec3(0, 0, 0), 1)).toThrow(RangeError);
    expect(() => wall(vec3(0, 0, 0), vec3(1, 0, 0), 5, 1)).toThrow(RangeError);
  });
  it("cuboid normalises corner order; cube is centred", () => {
    expect(cuboid(vec3(2, 0, 5), vec3(0, 3, 1))).toEqual({
      kind: "cuboid", min: vec3(0, 0, 1), max: vec3(2, 3, 5),
    });
    expect(cube(vec3(0, 0, 0), 10)).toEqual(cuboid(vec3(-5, -5, -5), vec3(5, 5, 5)));
  });
});

describe("containsPoint", () => {
  it("sphere is a true globe (elevation matters)", () => {
    const s = sphere(vec3(0, 0, 0), 20);
    expect(containsPoint(s, vec3(20, 0, 0))).toBe(true); // boundary
    expect(containsPoint(s, vec3(0, 0, 20))).toBe(true);
    expect(containsPoint(s, vec3(15, 0, 15))).toBe(false); // inside the circle, outside the globe
    expect(containsPoint(s, vec3(15, 0, 0))).toBe(true);
  });
  it("cone: 5e 15-ft cone (spread 0.5)", () => {
    const c = cone(vec3(0, 0, 0), vec3(15, 0, 0), 0.5);
    expect(containsPoint(c, vec3(0, 0, 0))).toBe(true); // apex
    expect(containsPoint(c, vec3(10, 5, 0))).toBe(true); // on the edge
    expect(containsPoint(c, vec3(10, 5.01, 0))).toBe(false);
    expect(containsPoint(c, vec3(15, 0, 7.5))).toBe(true); // base rim, vertical
    expect(containsPoint(c, vec3(15.01, 0, 0))).toBe(false); // past the base
    expect(containsPoint(c, vec3(-1, 0, 0))).toBe(false); // behind the apex
  });
  it("cuboid, plane half-space, wall (no volume)", () => {
    const b = cuboid(vec3(0, 0, 0), vec3(10, 10, 10));
    expect(containsPoint(b, vec3(10, 0, 5))).toBe(true);
    expect(containsPoint(b, vec3(10.0001, 0, 5))).toBe(false);
    expect(containsPoint(plane(vec3(0, 0, 1), 0), vec3(5, 5, -1))).toBe(true);
    expect(containsPoint(plane(vec3(0, 0, 1), 0), vec3(5, 5, 1))).toBe(false);
    expect(containsPoint(wall(vec2(0, 0), vec2(1, 0), 0, 10), vec2(0.5, 0))).toBe(false);
  });
});

describe("intersectShape", () => {
  it("sphere–sphere touches at exactly r1 + r2", () => {
    expect(intersectShape(sphere(vec3(0, 0, 0), 2), sphere(vec3(5, 0, 0), 3))).toBe(true);
    expect(intersectShape(sphere(vec3(0, 0, 0), 2), sphere(vec3(5.001, 0, 0), 3))).toBe(false);
  });
  it("sphere–cuboid uses closest-point distance (corners are round)", () => {
    const b = cuboid(vec3(0, 0, 0), vec3(10, 10, 10));
    expect(intersectShape(sphere(vec3(12, 5, 5), 2), b)).toBe(true);
    expect(intersectShape(b, sphere(vec3(12, 12, 5), 2))).toBe(false); // corner distance 2.83
  });
  it("sphere–cone: a token whose edge clips the cone counts", () => {
    const c = cone(vec3(0, 0, 0), vec3(15, 0, 0), 0.5);
    // Centre outside the cone, but within 2.5 ft of its slanted side.
    expect(containsPoint(c, vec3(10, 7, 0))).toBe(false);
    expect(intersectShape(sphere(vec3(10, 7, 0), 2.5), c)).toBe(true);
    expect(intersectShape(c, sphere(vec3(10, 9, 0), 2.5))).toBe(false);
    // Behind the apex: nearest point is the apex.
    expect(intersectShape(sphere(vec3(-2, 0, 0), 2), c)).toBe(true);
    expect(intersectShape(sphere(vec3(-2.01, 0, 0), 2), c)).toBe(false);
    // Beyond the base disc.
    expect(intersectShape(sphere(vec3(17, 3, 0), 2), c)).toBe(true);
  });
  it("cuboid–cuboid overlap, unsupported pairs throw", () => {
    expect(intersectShape(cuboid(vec3(0, 0, 0), vec3(1, 1, 1)), cuboid(vec3(1, 1, 1), vec3(2, 2, 2)))).toBe(true);
    expect(intersectShape(cuboid(vec3(0, 0, 0), vec3(1, 1, 1)), cuboid(vec3(1.1, 0, 0), vec3(2, 1, 1)))).toBe(false);
    const c = cone(vec3(0, 0, 0), vec3(1, 0, 0), 1);
    expect(() => intersectShape(c, c)).toThrow(TypeError);
    expect(() => intersectShape(c, cube(vec3(0, 0, 0), 1))).toThrow(TypeError);
  });
});
