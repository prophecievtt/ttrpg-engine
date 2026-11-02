/**
 * Shared numeric test-vector suite: test/vectors/spatial.json.
 *
 * Each case is { name, fn, args, expected }, where `fn` is a SpatialBackend
 * method and `expected` is the TS reference's output. The Rust/wasm core must
 * reproduce every `expected` exactly. Numbers are compared via their shortest
 * round-trip JSON text, which is equivalent to bit equality for finite f64
 * (outputs never contain -0: normals are canonicalised).
 *
 * The cases are generated deterministically below. If the reference math
 * changes on purpose, regenerate with UPDATE_VECTORS=1 and review the diff:
 * every changed number is a contract change for the wasm core.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  cone, cuboid, plane, referenceBackend, sphere, vec3, wall,
  type Obstacle, type SpatialBackend, type Token,
} from "../src/index.js";
import { mulberry32, uniform } from "./rng.js";

const vectorsPath = fileURLToPath(new URL("./vectors/spatial.json", import.meta.url));

interface VectorCase {
  name: string;
  fn: keyof Omit<SpatialBackend, "id">;
  args: unknown[];
}

function buildCases(): VectorCase[] {
  const rand = mulberry32(0x5eed);
  const u = (lo: number, hi: number) => uniform(rand, lo, hi);
  const v = (s = 50) => vec3(u(-s, s), u(-s, s), u(0, s / 2));
  const cases: VectorCase[] = [];

  const obstacles: Obstacle[] = [
    sphere(vec3(20, 0, 5), 4),
    cuboid(vec3(-15, -15, 0), vec3(-5, -5, 10)),
    plane(vec3(0, 0, 1), 0),
    wall(vec3(0, 20, 0), vec3(30, 25, 0), 0, 8),
    wall(vec3(-30, 0, 0), vec3(-30, 40, 0), 0, 3),
  ];

  for (let i = 0; i < 40; i++) {
    const origin = v();
    const dir = vec3(u(-1, 1), u(-1, 1), u(-1, 0.5));
    cases.push({ name: `raycast-${i}`, fn: "raycast", args: [{ origin, dir }, obstacles] });
    cases.push({ name: `raycastAll-${i}`, fn: "raycastAll", args: [{ origin, dir }, obstacles, 200] });
  }
  for (let i = 0; i < 40; i++) {
    cases.push({ name: `los-${i}`, fn: "los", args: [v(), v(), obstacles] });
  }
  const shapes = [
    sphere(vec3(1, 2, 3), 10),
    cone(vec3(0, 0, 5), vec3(15, 5, -2), 0.5),
    cuboid(vec3(-5, -5, 0), vec3(5, 5, 10)),
    plane(vec3(1, 1, 0), 3),
  ];
  for (let i = 0; i < 40; i++) {
    const p = v(20);
    shapes.forEach((s, k) => cases.push({ name: `contains-${k}-${i}`, fn: "containsPoint", args: [s, p] }));
    const probe = sphere(v(20), u(0, 6));
    for (let k = 0; k < 3; k++) {
      cases.push({ name: `intersect-${k}-${i}`, fn: "intersectShape", args: [probe, shapes[k]] });
    }
  }
  const walls = obstacles.filter((o) => o.kind === "wall");
  walls.push(wall(vec3(5, -10, 0), vec3(5, 10, 0), 0, 10));
  for (let i = 0; i < 40; i++) {
    cases.push({
      name: `slide-${i}`,
      fn: "slide",
      args: [vec3(u(-20, 20), u(-20, 20), u(0, 2)), vec3(u(-40, 40), u(-40, 40), 0), u(0.5, 3), walls],
    });
  }
  for (let i = 0; i < 20; i++) {
    for (const mode of ["euclidean", "horizontal", "vertical"] as const) {
      cases.push({ name: `measure-${mode}-${i}`, fn: "measure", args: [v(), v(), mode] });
    }
  }
  const tokens: Token[] = Array.from({ length: 100 }, (_, i) => ({
    id: `t${i}`, position: v(40), radius: u(0, 3),
  }));
  cases.push({ name: "select-fireball", fn: "selectTargets", args: [sphere(vec3(0, 0, 5), 20), tokens, { obstacles }] });
  cases.push({ name: "select-cone", fn: "selectTargets", args: [cone(vec3(-10, 0, 2), vec3(30, 0, 0), 0.5), tokens] });
  cases.push({ name: "select-cube", fn: "selectTargets", args: [cuboid(vec3(-10, -10, 0), vec3(10, 10, 20)), tokens] });
  const lights = [
    { id: "torch", position: vec3(0, 0, 4), bright: 20, dim: 40 },
    { id: "candle", position: vec3(-20, 10, 2), bright: 0, dim: 5 },
    { id: "lantern", position: vec3(15, 30, 5), bright: 30, dim: 60 },
  ];
  for (let i = 0; i < 40; i++) {
    cases.push({ name: `illumination-${i}`, fn: "illumination", args: [v(40), lights, obstacles] });
  }
  cases.push({ name: "illumination-ambient", fn: "illumination", args: [vec3(100, 100, 0), lights, obstacles, { ambient: "dim" }] });
  for (const light of lights) {
    cases.push({ name: `lightBoundary-${light.id}`, fn: "lightBoundary", args: [light, obstacles] });
  }
  return cases;
}

function run(backend: SpatialBackend, c: VectorCase): unknown {
  const fn = backend[c.fn] as (...args: unknown[]) => unknown;
  return fn(...c.args);
}

describe("shared numeric vector suite", () => {
  it("TS reference reproduces every committed vector exactly", () => {
    const fresh = buildCases().map((c) => ({ ...c, expected: run(referenceBackend, c) }));
    // One case per line keeps diffs reviewable.
    const text =
      `{"version":1,"backend":"ts-reference","cases":[\n` +
      fresh.map((c) => JSON.stringify(c)).join(",\n") +
      "\n]}\n";
    if (process.env.UPDATE_VECTORS === "1" || !existsSync(vectorsPath)) writeFileSync(vectorsPath, text);

    const committed = JSON.parse(readFileSync(vectorsPath, "utf8")) as {
      cases: (VectorCase & { expected: unknown })[];
    };
    expect(committed.cases.length).toBe(fresh.length);
    // Replay from the committed inputs (as another backend would) and compare text.
    for (const c of committed.cases) {
      expect(JSON.stringify(run(referenceBackend, c)), c.name).toBe(JSON.stringify(c.expected));
    }
  });

  it("covers hits and misses for every function", () => {
    const committed = JSON.parse(readFileSync(vectorsPath, "utf8")) as {
      cases: { fn: string; expected: unknown }[];
    };
    const by = (fn: string) => committed.cases.filter((c) => c.fn === fn).map((c) => c.expected);
    expect(by("raycast").some((e) => e === null)).toBe(true);
    expect(by("raycast").some((e) => e !== null)).toBe(true);
    expect(new Set(by("los").map((e) => (e as { visible: boolean }).visible)).size).toBe(2);
    expect(new Set(by("containsPoint")).size).toBe(2);
    expect(new Set(by("intersectShape")).size).toBe(2);
    expect(by("slide").some((e) => (e as { collided: boolean }).collided)).toBe(true);
    expect(by("slide").some((e) => !(e as { collided: boolean }).collided)).toBe(true);
    expect(new Set(by("illumination").map((e) => (e as { level: string }).level)).size).toBe(3);
  });
});
