/**
 * Spatial benchmarks: `pnpm --filter @ttrpg-engine/spatial bench`.
 *
 * The same scenes will be run against the wasm core in the spatial-wasm slice
 * so the two backends can be compared side by side. PRD §8 budget: fireball
 * target selection over 1,000 tokens < 5 ms on the TS reference.
 */
import { bench, describe } from "vitest";

import {
  cone, los, referenceBackend, slide, sphere, vec3, wall,
  type SpatialBackend, type Token,
} from "../src/index.js";
import { mulberry32, uniform } from "../test/rng.js";

const rand = mulberry32(42);
const tokens: Token[] = Array.from({ length: 1000 }, (_, i) => ({
  id: `t${i}`,
  position: vec3(uniform(rand, -60, 60), uniform(rand, -60, 60), uniform(rand, 0, 30)),
  radius: 2.5,
}));
const walls = Array.from({ length: 50 }, () =>
  wall(
    vec3(uniform(rand, -60, 60), uniform(rand, -60, 60), 0),
    vec3(uniform(rand, -60, 60), uniform(rand, -60, 60), 0),
    0,
    uniform(rand, 2, 20),
  ),
);

const backends: SpatialBackend[] = [referenceBackend];

for (const b of backends) {
  describe(b.id, () => {
    bench("fireball: 20-ft globe, 1,000 tokens, 50 walls (cover)", () => {
      b.selectTargets(sphere(vec3(0, 0, 5), 20), tokens, { obstacles: walls });
    });
    bench("cone: 60-ft cone, 1,000 tokens, no cover", () => {
      b.selectTargets(cone(vec3(-30, 0, 2), vec3(60, 0, 0), 0.5), tokens);
    });
    bench("los: 1,000 sight lines vs 50 walls", () => {
      for (const t of tokens) los(vec3(0, 0, 5), t.position, walls);
    });
    bench("slide: 1,000 moves vs 50 walls", () => {
      for (const t of tokens) slide(t.position, vec3(10, 7, 0), 2.5, walls);
    });
  });
}
