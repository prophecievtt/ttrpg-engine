/**
 * Big-scene regression for the lighting hot loops: the bench scenes'
 * full results must stay byte-identical (hashes taken from the original,
 * unoptimised implementation).
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { dungeonScene, openHallScene } from "../bench/scenes.js";
import { illumination, lightBoundary, los } from "../src/index.js";

function digest(scene: ReturnType<typeof dungeonScene>): string {
  const h = createHash("sha256");
  for (const l of scene.lights) h.update(JSON.stringify(lightBoundary(l, scene.obstacles)));
  for (const t of scene.tokens) {
    h.update(JSON.stringify(illumination(t, scene.lights, scene.obstacles)));
    h.update(JSON.stringify(los(scene.lights[0]!.position, t, scene.obstacles)));
  }
  return h.digest("hex").slice(0, 16);
}

describe("bench scenes", () => {
  it("dungeon results are unchanged", () => {
    expect(digest(dungeonScene())).toBe("a6375ac8756d7dfd");
  });
  it("open hall results are unchanged", () => {
    expect(digest(openHallScene())).toBe("4fb42296caf87613");
  });
});
