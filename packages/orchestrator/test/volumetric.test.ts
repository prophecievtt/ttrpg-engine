/**
 * ARCHITECTURE §6 contract 2: a fireball over 1,000 randomized tokens picks
 * exactly the ids a brute-force check picks. The brute force is written
 * independently of spatial's geometry (squared distances, plus an analytic
 * segment-vs-wall test for low walls on x = const), so the two can only agree
 * if both are right. Elevation and cover both matter in this scene.
 */
import { buildEmberSession, createEmberRuleset, emberEntries, emberSchemas, type EmberSpell, WIZARD } from "@ttrpg-engine/example-ember";
import { createEngine, Prng } from "@ttrpg-engine/interactions";
import { createCompendium } from "@ttrpg-engine/rules";
import { vec3, wall, type Token, type Vec3 } from "@ttrpg-engine/spatial";
import { describe, expect, it } from "vitest";

import { createPipeline, seededEntropy } from "../src/index.js";

const RADIUS = 20; // fireball's 20-ft globe
const CENTER: Vec3 = { x: 0, y: 0, z: 0 };

/** Low walls (5 ft tall), all on x = const so the brute force stays analytic. */
const LOW_WALLS = [
  { x: 8, y0: -15, y1: 15, bottom: 0, top: 5 },
  { x: -12, y0: 0, y1: 30, bottom: 0, top: 5 },
  { x: 15, y0: -30, y1: -5, bottom: 0, top: 5 },
];
const obstacles = LOW_WALLS.map((w) => wall(vec3(w.x, w.y0, 0), vec3(w.x, w.y1, 0), w.bottom, w.top));

function randomTokens(seed: string, n: number): Token[] {
  const rng = new Prng(seed);
  // Quarter-foot grid keeps coordinates exact in binary floating point.
  const coord = (span: number) => (rng.int(span * 8 + 1) - span * 4) / 4;
  const radii = [0, 2.5, 5];
  return Array.from({ length: n }, (_, i) => ({
    id: `tok-${String(i).padStart(4, "0")}`,
    position: { x: coord(40), y: coord(40), z: rng.int(40 * 4 + 1) / 4 },
    radius: radii[rng.int(radii.length)]!,
  }));
}

function bruteForce(tokens: readonly Token[]): string[] {
  return tokens
    .filter((t) => {
      const dx = t.position.x - CENTER.x;
      const dy = t.position.y - CENTER.y;
      const dz = t.position.z - CENTER.z;
      const reach = RADIUS + t.radius;
      return dx * dx + dy * dy + dz * dz <= reach * reach;
    })
    .filter((t) => !LOW_WALLS.some((w) => blocks(w, CENTER, t.position)))
    .map((t) => t.id);
}

/** Does the segment from → to cross the wall strictly between its ends? */
function blocks(w: (typeof LOW_WALLS)[number], from: Vec3, to: Vec3): boolean {
  if (!((from.x - w.x) * (to.x - w.x) < 0)) return false;
  const s = (w.x - from.x) / (to.x - from.x);
  const y = from.y + s * (to.y - from.y);
  const z = from.z + s * (to.z - from.z);
  return y >= w.y0 && y <= w.y1 && z >= w.bottom && z <= w.top;
}

function pipeline() {
  const spells = createCompendium();
  for (const schema of emberSchemas) spells.registerSchema(schema);
  spells.register(emberEntries);
  const ruleset = createEmberRuleset((id) => spells.get("spell", id) as EmberSpell | undefined);
  return createPipeline({
    engine: createEngine({ ruleset, session: buildEmberSession() }),
    spells,
    entropy: seededEntropy("volumetric"),
  });
}

describe("contract 2: volumetric fireball over 1,000 random tokens", () => {
  for (const seed of ["vol-1", "vol-2", "vol-3"]) {
    it(`pipeline targets equal the brute-force set (seed ${seed})`, () => {
      const tokens = randomTokens(seed, 1000);
      const { targets } = pipeline().castSpell({
        intent_id: "vol",
        source: WIZARD,
        spell_id: "fireball",
        targeting: { mode: "area", at: CENTER, tokens, obstacles },
      });
      const expected = bruteForce(tokens);
      expect(targets).toEqual(expected);

      // The scene must actually exercise elevation and cover, not pass vacuously.
      const inReach = new Set(bruteForceInReachOnly(tokens));
      const covered = [...inReach].filter((id) => !expected.includes(id));
      const highUp = tokens.filter((t) => t.position.z > RADIUS + t.radius && Math.hypot(t.position.x, t.position.y) < 5);
      expect(expected.length).toBeGreaterThan(20);
      expect(covered.length).toBeGreaterThan(5);
      expect(highUp.length).toBeGreaterThan(0);
      expect(targets.some((id) => highUp.some((t) => t.id === id))).toBe(false);
    });
  }
});

function bruteForceInReachOnly(tokens: readonly Token[]): string[] {
  return tokens
    .filter((t) => {
      const { x, y, z } = t.position;
      const reach = RADIUS + t.radius;
      return x * x + y * y + z * z <= reach * reach;
    })
    .map((t) => t.id);
}
