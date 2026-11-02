/** Seeded benchmark scenes shared by the bench and the gate test. */
import { cuboid, vec3, wall, type LightSource, type Obstacle, type Vec3 } from "../src/index.js";
import { mulberry32, uniform } from "../test/rng.js";

export interface Scene {
  lights: LightSource[];
  obstacles: Obstacle[];
  tokens: Vec3[];
}

const ROOMS = 10;
const ROOM = 30; // ft
const DOOR = 5; // ft gap in the middle of each wall

/**
 * A realistic dungeon: a 10×10 grid of 30-ft rooms (300 × 300 ft), each wall
 * split by a 5-ft doorway (440 wall segments) plus 60 pillars, 50 torches.
 */
export function dungeonScene(): Scene {
  const rand = mulberry32(7);
  const obstacles: Obstacle[] = [];
  const half = (ROOM - DOOR) / 2;
  for (let i = 0; i <= ROOMS; i++) {
    for (let j = 0; j < ROOMS; j++) {
      const a = i * ROOM;
      const b = j * ROOM;
      // Horizontal wall at y = a, vertical wall at x = a, each with a door.
      obstacles.push(
        wall(vec3(b, a, 0), vec3(b + half, a, 0), 0, 10),
        wall(vec3(b + half + DOOR, a, 0), vec3(b + ROOM, a, 0), 0, 10),
        wall(vec3(a, b, 0), vec3(a, b + half, 0), 0, 10),
        wall(vec3(a, b + half + DOOR, 0), vec3(a, b + ROOM, 0), 0, 10),
      );
    }
  }
  for (let k = 0; k < 60; k++) {
    const x = uniform(rand, 5, ROOMS * ROOM - 8);
    const y = uniform(rand, 5, ROOMS * ROOM - 8);
    obstacles.push(cuboid(vec3(x, y, 0), vec3(x + 2.5, y + 2.5, 10)));
  }
  return { obstacles, lights: lights(rand, 0, ROOMS * ROOM), tokens: tokens(rand, 0, ROOMS * ROOM) };
}

/** Worst case: 500 random walls packed in a 100-ft hall; every 60-ft light sees them all. */
export function openHallScene(): Scene {
  const rand = mulberry32(11);
  const obstacles: Obstacle[] = Array.from({ length: 500 }, () => {
    const x = uniform(rand, 0, 100);
    const y = uniform(rand, 0, 100);
    return wall(vec3(x, y, 0), vec3(x + uniform(rand, -8, 8), y + uniform(rand, -8, 8), 0), 0, 10);
  });
  return {
    obstacles,
    lights: lights(rand, 0, 100, 60),
    tokens: tokens(rand, 0, 100),
  };
}

function lights(rand: () => number, lo: number, hi: number, dim?: number): LightSource[] {
  return Array.from({ length: 50 }, (_, i) => {
    const d = dim ?? uniform(rand, 20, 60);
    return { id: `l${i}`, position: vec3(uniform(rand, lo, hi), uniform(rand, lo, hi), 5), bright: d / 2, dim: d };
  });
}

function tokens(rand: () => number, lo: number, hi: number): Vec3[] {
  return Array.from({ length: 200 }, () => vec3(uniform(rand, lo, hi), uniform(rand, lo, hi), 3));
}
