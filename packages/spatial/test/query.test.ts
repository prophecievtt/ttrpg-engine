import { describe, expect, it } from "vitest";

import {
  cone, cube, distance, los, measure, measurePath, selectTargets, sphere, vec3, wall,
  type Token,
} from "../src/index.js";
import { mulberry32, uniform } from "./rng.js";

describe("measure", () => {
  it("euclidean, horizontal, vertical", () => {
    expect(measure(vec3(0, 0, 0), vec3(3, 4, 12))).toBe(13);
    expect(measure(vec3(0, 0, 0), vec3(3, 4, 12), "horizontal")).toBe(5);
    expect(measure(vec3(0, 0, 10), vec3(3, 4, 2), "vertical")).toBe(8);
    expect(measurePath([vec3(0, 0, 0), vec3(3, 4, 0), vec3(3, 4, 12)])).toBe(17);
    expect(measurePath([])).toBe(0);
  });
});

describe("selectTargets", () => {
  const tokens: Token[] = [
    { id: "goblin-1", position: vec3(5, 0, 0), radius: 2.5 },
    { id: "goblin-2", position: vec3(0, 18, 0), radius: 2.5 },
    { id: "bat", position: vec3(0, 0, 21), radius: 1 }, // overhead, clipped by the globe
    { id: "roof-bat", position: vec3(0, 0, 24), radius: 1 }, // too high
    { id: "far", position: vec3(30, 0, 0), radius: 2.5 },
  ];

  it("volumetric sphere respects elevation; output keeps input order", () => {
    expect(selectTargets(sphere(vec3(0, 0, 0), 20), tokens)).toEqual(["goblin-1", "goblin-2", "bat"]);
  });
  it("cover: a full-height wall shields a token from the blast centre", () => {
    const shield = [wall(vec3(-10, 10, 0), vec3(10, 10, 0), -5, 30)];
    expect(selectTargets(sphere(vec3(0, 0, 0), 20), tokens, { obstacles: shield })).toEqual([
      "goblin-1", "bat",
    ]);
  });
  it("cover: a low wall only shields when the blast is low enough", () => {
    const low = [wall(vec3(-10, 10, 0), vec3(10, 10, 0), 0, 3)];
    const target: Token[] = [{ id: "g", position: vec3(0, 15, 1), radius: 2.5 }];
    expect(selectTargets(sphere(vec3(0, 0, 1), 20), target, { obstacles: low })).toEqual([]);
    expect(selectTargets(sphere(vec3(0, 0, 10), 20), target, { obstacles: low })).toEqual(["g"]);
  });
  it("cone and cube templates; point tokens use containment", () => {
    const pts: Token[] = [
      { id: "in", position: vec3(10, 4, 0), radius: 0 },
      { id: "out", position: vec3(10, 6, 0), radius: 0 },
    ];
    expect(selectTargets(cone(vec3(0, 0, 0), vec3(15, 0, 0), 0.5), pts)).toEqual(["in"]);
    expect(selectTargets(cube(vec3(10, 4, 0), 2), pts)).toEqual(["in"]);
    expect(selectTargets(cube(vec3(10, 5, 0), 4), pts)).toEqual(["in", "out"]);
  });

  it("fireball over 1,000 random tokens matches a brute-force oracle", () => {
    const rand = mulberry32(0xf12eba11);
    const many: Token[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `t${i}`,
      position: vec3(uniform(rand, -60, 60), uniform(rand, -60, 60), uniform(rand, 0, 30)),
      radius: 2.5,
    }));
    const walls = [wall(vec3(-20, 8, 0), vec3(20, 8, 0), 0, 4), wall(vec3(12, -30, 0), vec3(12, 0, 0), 0, 40)];
    const center = vec3(0, 0, 5);
    const picked = selectTargets(sphere(center, 20), many, { obstacles: walls });

    const expected = many
      .filter((t) => distance(t.position, center) <= 22.5)
      .filter((t) => los(center, t.position, walls).visible)
      .map((t) => t.id);
    expect(picked).toEqual(expected);
    expect(picked.length).toBeGreaterThan(10);
    expect(picked.length).toBeLessThan(200);
  });
});
