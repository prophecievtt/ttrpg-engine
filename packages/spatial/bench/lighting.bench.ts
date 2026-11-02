/**
 * Lighting benchmark gate (ADR 6): `pnpm --filter @ttrpg-engine/spatial bench`.
 *
 * Budget: a full lighting recompute (every light's `lightBoundary`) for 50
 * lights and 500 walls stays under 16 ms (one 60 fps frame) on the TS
 * reference. If it misses, the wasm spatial-core gets built.
 */
import { bench, describe } from "vitest";

import { illumination, lightBoundary } from "../src/index.js";
import { dungeonScene, openHallScene } from "./scenes.js";

for (const [name, scene] of [
  ["dungeon: 10×10 rooms, 500 walls, 50 lights", dungeonScene()],
  ["worst case: open hall, every light sees all 500 walls", openHallScene()],
] as const) {
  describe(name, () => {
    bench("full recompute: lightBoundary × 50", () => {
      for (const l of scene.lights) lightBoundary(l, scene.obstacles);
    });
    bench("illumination: 200 tokens × 50 lights", () => {
      for (const t of scene.tokens) illumination(t, scene.lights, scene.obstacles);
    });
  });
}
