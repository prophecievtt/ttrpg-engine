import { describe, expect, it } from "vitest";

import {
  cuboid, los, plane, raycast, raycastAll, sphere, vec2, vec3, wall,
} from "../src/index.js";

const ray = (o: [number, number, number], d: [number, number, number]) => ({
  origin: vec3(...o), dir: vec3(...d),
});

describe("raycast", () => {
  it("hits the near side of a sphere with an outward normal", () => {
    const hit = raycast(ray([0, 0, 0], [1, 0, 0]), [sphere(vec3(10, 0, 0), 2)]);
    expect(hit).toEqual({ t: 8, point: vec3(8, 0, 0), normal: vec3(-1, 0, 0), index: 0 });
  });
  it("ignores solids the ray starts inside", () => {
    expect(raycast(ray([10, 0, 0], [1, 0, 0]), [sphere(vec3(10, 0, 0), 2)])).toBeNull();
    expect(raycast(ray([5, 5, 5], [1, 0, 0]), [cuboid(vec3(0, 0, 0), vec3(10, 10, 10))])).toBeNull();
  });
  it("slab test for cuboids, with the entry face as normal", () => {
    const box = cuboid(vec3(5, -1, -1), vec3(7, 1, 1));
    expect(raycast(ray([0, 0, 0], [1, 0, 0]), [box])).toMatchObject({ t: 5, normal: vec3(-1, 0, 0) });
    expect(raycast(ray([6, 0, 10], [0, 0, -1]), [box])).toMatchObject({ t: 9, normal: vec3(0, 0, 1) });
    expect(raycast(ray([0, 2, 0], [1, 0, 0]), [box])).toBeNull(); // parallel, outside slab
  });
  it("planes and walls are hit from either side; normals face the ray", () => {
    const floor = plane(vec3(0, 0, 1), 0);
    expect(raycast(ray([0, 0, 10], [0, 0, -2]), [floor])).toMatchObject({ t: 5, normal: vec3(0, 0, 1) });
    expect(raycast(ray([0, 0, -10], [0, 0, 1]), [floor])).toMatchObject({ t: 10, normal: vec3(0, 0, -1) });
    const w = wall(vec2(5, -5), vec2(5, 5), 0, 10);
    expect(raycast(ray([0, 0, 1], [1, 0, 0]), [w])).toMatchObject({ t: 5, normal: vec3(-1, 0, 0) });
    expect(raycast(ray([9, 0, 1], [-1, 0, 0]), [w])).toMatchObject({ t: 4, normal: vec3(1, 0, 0) });
  });
  it("walls have height: rays can pass over a low wall", () => {
    const low = wall(vec2(5, -5), vec2(5, 5), 0, 3);
    expect(raycast(ray([0, 0, 1], [1, 0, 0]), [low])).not.toBeNull();
    expect(raycast(ray([0, 0, 4], [1, 0, 0]), [low])).toBeNull();
    expect(raycast(ray([0, 0, 5], [10, 0, -5]), [low])).toMatchObject({ t: 0.5 }); // z = 2.5 at the wall
  });
  it("nearest hit wins; ties go to the lower index; maxT limits range", () => {
    const a = wall(vec2(5, -1), vec2(5, 1), 0, 1);
    const b = wall(vec2(3, -1), vec2(3, 1), 0, 1);
    const r = ray([0, 0, 0.5], [1, 0, 0]);
    expect(raycast(r, [a, b])?.index).toBe(1);
    expect(raycast(r, [a, a])?.index).toBe(0);
    expect(raycast(r, [a], 4)).toBeNull();
    expect(raycastAll(r, [a, b]).map((h) => h.index)).toEqual([1, 0]);
  });
});

describe("los", () => {
  const w = wall(vec2(5, -5), vec2(5, 5), 0, 3);
  it("blocked by a wall between the points", () => {
    const res = los(vec3(0, 0, 1), vec3(10, 0, 1), [w]);
    expect(res.visible).toBe(false);
    expect(res.blocker?.index).toBe(0);
  });
  it("elevation: seeing over a low wall", () => {
    expect(los(vec3(0, 0, 6), vec3(10, 0, 6), [w]).visible).toBe(true);
  });
  it("obstacles beyond the target or touching an endpoint do not block", () => {
    expect(los(vec3(0, 0, 1), vec3(4, 0, 1), [w]).visible).toBe(true);
    expect(los(vec3(5, 0, 1), vec3(10, 0, 1), [w]).visible).toBe(true);
  });
  it("is symmetric", () => {
    const blockers = [w, sphere(vec3(20, 0, 1), 1)];
    for (const [a, b] of [[vec3(0, 0, 1), vec3(30, 0, 1)], [vec3(0, 3, 2), vec3(8, -4, 1)]] as const) {
      expect(los(a, b, blockers).visible).toBe(los(b, a, blockers).visible);
    }
  });
});
