import { describe, expect, it } from "vitest";

import {
  cuboid, illumination, lightBoundary, sphere, vec2, vec3, wall,
  type LightSource, type Vec3,
} from "../src/index.js";
import { mulberry32, uniform } from "./rng.js";

const torch: LightSource = { id: "torch", position: vec3(0, 0, 4), bright: 20, dim: 40 };

/** Even-odd point-in-polygon (test oracle only). */
function inside(poly: readonly Vec3[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function signedArea(poly: readonly Vec3[]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += poly[j]!.x * poly[i]!.y - poly[i]!.x * poly[j]!.y;
  }
  return s / 2;
}

describe("illumination", () => {
  it("gives bright inside the bright radius, dim out to the dim radius, then dark", () => {
    expect(illumination(vec3(10, 0, 4), [torch], []).level).toBe("bright");
    expect(illumination(vec3(20, 0, 4), [torch], []).level).toBe("bright"); // boundary inclusive
    expect(illumination(vec3(30, 0, 4), [torch], []).level).toBe("dim");
    expect(illumination(vec3(40, 0, 4), [torch], []).level).toBe("dim");
    expect(illumination(vec3(41, 0, 4), [torch], [])).toEqual({ level: "dark", sources: [] });
  });

  it("measures in 3D: a point far below the light is further away", () => {
    expect(illumination(vec3(0, 0, -30), [torch], []).level).toBe("dim");
    expect(illumination(vec3(0, 0, -40), [torch], []).level).toBe("dark");
  });

  it("is blocked by walls, but a wall too low to reach the sight line is not", () => {
    const tall = wall(vec2(5, -10), vec2(5, 10), 0, 10);
    const low = wall(vec2(5, -10), vec2(5, 10), 0, 1);
    expect(illumination(vec3(10, 0, 4), [torch], [tall]).level).toBe("dark");
    expect(illumination(vec3(10, 0, 4), [torch], [low]).level).toBe("bright");
  });

  it("takes the brightest source and reports every source that reaches", () => {
    const candle: LightSource = { id: "candle", position: vec3(12, 0, 4), bright: 0, dim: 5 };
    const r = illumination(vec3(30, 0, 4), [torch, candle], []);
    expect(r).toEqual({ level: "dim", sources: [{ id: "torch", level: "dim" }] });
    const both = illumination(vec3(14, 0, 4), [torch, candle], []);
    expect(both.level).toBe("bright");
    expect(both.sources).toEqual([
      { id: "torch", level: "bright" },
      { id: "candle", level: "dim" },
    ]);
  });

  it("respects ambient light and never lowers it", () => {
    expect(illumination(vec3(100, 0, 0), [torch], [], { ambient: "bright" }).level).toBe("bright");
    expect(illumination(vec3(30, 0, 4), [torch], [], { ambient: "bright" }).level).toBe("bright");
    expect(illumination(vec3(10, 0, 4), [torch], [], { ambient: "dim" }).level).toBe("bright");
  });

  it("handles no lights and zero-radius lights", () => {
    expect(illumination(vec3(0, 0, 0), [], []).level).toBe("dark");
    const off: LightSource = { id: "off", position: vec3(0, 0, 0), bright: 0, dim: 0 };
    expect(illumination(vec3(0, 0, 0), [off], []).level).toBe("dark"); // dim 0 = switched off
    expect(illumination(vec3(1, 0, 0), [off], []).level).toBe("dark");
  });
});

describe("lightBoundary", () => {
  it("is the bounding square of the dim radius in an empty room", () => {
    const b = lightBoundary(torch, []);
    expect(b).toMatchObject({ id: "torch", center: torch.position, bright: 20, dim: 40 });
    // Corners plus the nudged rays' points beside them, all on the square's edge.
    for (const [x, y] of [[40, 40], [-40, 40], [-40, -40], [40, -40]]) {
      expect(b.points).toContainEqual(vec3(x!, y!, 4));
    }
    expect(b.points.every((p) => Math.abs(p.x) === 40 || Math.abs(p.y) === 40)).toBe(true);
    expect(b.points.every((p) => p.z === 4)).toBe(true);
    expect(signedArea(b.points)).toBeCloseTo(80 * 80, 6);
  });

  it("returns no points for a light with no radius", () => {
    expect(lightBoundary({ ...torch, dim: 0 }, []).points).toEqual([]);
  });

  it("casts a shadow behind a wall and stays counter-clockwise", () => {
    const w = wall(vec2(10, -5), vec2(10, 5), 0, 10);
    const b = lightBoundary(torch, [w]);
    expect(signedArea(b.points)).toBeGreaterThan(0);
    expect(inside(b.points, 5, 0)).toBe(true); // in front of the wall
    expect(inside(b.points, 30, 0)).toBe(false); // in its shadow
    expect(inside(b.points, 30, 30)).toBe(true); // around the side
  });

  it("ignores walls and cuboids that don't span the light's height, and spheres", () => {
    const low = wall(vec2(10, -5), vec2(10, 5), 0, 3);
    const box = cuboid(vec3(10, -5, 5), vec3(15, 5, 9));
    const ball = sphere(vec3(10, 0, 4), 3);
    expect(lightBoundary(torch, [low, box, ball]).points).toEqual(lightBoundary(torch, []).points);
  });

  it("lets a light inside a cuboid ignore it, as rays do", () => {
    const room = cuboid(vec3(-5, -5, 0), vec3(5, 5, 10));
    expect(lightBoundary(torch, [room]).points).toEqual(lightBoundary(torch, []).points);
  });

  it("clips walls crossing the edge of the lit square", () => {
    const w = wall(vec2(20, -100), vec2(20, 100), 0, 10);
    const b = lightBoundary(torch, [w]);
    expect(Math.max(...b.points.map((p) => p.x))).toBe(20);
    expect(signedArea(b.points)).toBeCloseTo(60 * 80, 6);
  });

  it("matches illumination on random scenes (polygon ⇔ line of sight)", () => {
    const rand = mulberry32(42);
    for (let scene = 0; scene < 20; scene++) {
      const obstacles = [
        ...Array.from({ length: 5 }, () =>
          wall(vec2(uniform(rand, -40, 40), uniform(rand, -40, 40)), vec2(uniform(rand, -40, 40), uniform(rand, -40, 40)), 0, 10),
        ),
        cuboid(vec3(uniform(rand, -30, 0), uniform(rand, -30, 0), 0), vec3(uniform(rand, 2, 30), uniform(rand, -30, 0) + 5, 10)),
      ];
      const light: LightSource = { id: "l", position: vec3(uniform(rand, -5, 5), uniform(rand, -5, 5), 4), bright: 10, dim: 35 };
      const b = lightBoundary(light, obstacles);
      expect(signedArea(b.points)).toBeGreaterThan(0);
      let checked = 0;
      for (let i = 0; i < 200; i++) {
        const x = uniform(rand, -34, 34);
        const y = uniform(rand, -34, 34);
        const p = vec3(light.position.x + x, light.position.y + y, 4);
        if (x * x + y * y > 34 * 34) continue;
        const lit = illumination(p, [light], obstacles).level !== "dark";
        // Skip points hugging a shadow edge, where the corner nudge rounds.
        if (lit !== inside(b.points, p.x, p.y)) {
          const near = [0.05, -0.05].some((d) =>
            inside(b.points, p.x + d, p.y) !== lit || inside(b.points, p.x, p.y + d) !== lit,
          );
          expect(near, `scene ${scene} point ${p.x},${p.y}`).toBe(true);
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(100);
    }
  });
});
