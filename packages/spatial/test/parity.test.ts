/**
 * 2D ⇄ 3D parity: a flat scene (all z = 0) must give the same answers as the
 * equivalent 2D geometry, and lifting the whole scene by a constant z must
 * not change any answer (translation invariance in elevation).
 */
import { describe, expect, it } from "vitest";

import {
  cone, los, measure, selectTargets, slide, sphere, vec2, vec3, wall,
  type Token, type Vec3, type Wall,
} from "../src/index.js";
import { mulberry32, uniform } from "./rng.js";

const lift = (v: Vec3, dz: number): Vec3 => vec3(v.x, v.y, v.z + dz);
const liftWall = (w: Wall, dz: number): Wall => wall(w.a, w.b, w.bottom + dz, w.top + dz);

function scene(seed: number) {
  const rand = mulberry32(seed);
  const tokens: Token[] = Array.from({ length: 200 }, (_, i) => ({
    id: `t${i}`,
    position: vec2(uniform(rand, -40, 40), uniform(rand, -40, 40)),
    radius: uniform(rand, 0, 3),
  }));
  const walls = Array.from({ length: 6 }, () =>
    wall(vec2(uniform(rand, -40, 40), uniform(rand, -40, 40)), vec2(uniform(rand, -40, 40), uniform(rand, -40, 40)), -1, 1),
  );
  return { tokens, walls };
}

describe("2D/3D parity", () => {
  it("flat-scene distances equal the 2D formula and the horizontal tape", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const a = vec2(uniform(rand, -50, 50), uniform(rand, -50, 50));
      const b = vec2(uniform(rand, -50, 50), uniform(rand, -50, 50));
      const d2 = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      expect(measure(a, b)).toBe(d2);
      expect(measure(lift(a, 3), lift(b, 9), "horizontal")).toBe(d2);
    }
  });

  for (const seed of [1, 2, 3]) {
    it(`selection, LoS and sliding are invariant under an elevation shift (seed ${seed})`, () => {
      const { tokens, walls } = scene(seed);
      const dz = 37;
      const up = tokens.map((t) => ({ ...t, position: lift(t.position, dz) }));
      const upWalls = walls.map((w) => liftWall(w, dz));
      for (const area of [sphere(vec2(0, 0), 20), cone(vec2(-30, 0), vec2(40, 10), 0.5)]) {
        const upArea = area.kind === "sphere"
          ? sphere(lift(area.center, dz), area.radius)
          : cone(lift(area.apex, dz), area.axis, area.spread);
        expect(selectTargets(upArea, up, { obstacles: upWalls })).toEqual(
          selectTargets(area, tokens, { obstacles: walls }),
        );
      }
      for (let i = 0; i + 1 < tokens.length; i += 2) {
        const a = tokens[i]!.position;
        const b = tokens[i + 1]!.position;
        expect(los(lift(a, dz), lift(b, dz), upWalls).visible).toBe(los(a, b, walls).visible);
        const flat = slide(a, vec2(b.x - a.x, b.y - a.y), 1, walls, { height: 0.5 });
        const raised = slide(lift(a, dz), vec2(b.x - a.x, b.y - a.y), 1, upWalls, { height: 0.5 });
        expect(raised.position.x).toBe(flat.position.x);
        expect(raised.position.y).toBe(flat.position.y);
        expect(raised.contacts).toEqual(flat.contacts);
      }
    });
  }
});
