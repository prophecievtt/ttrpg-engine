# @ttrpg-engine/spatial

Grid-agnostic 3D geometry for tabletop RPGs: volumetric templates, raycasting,
line of sight with cover, lighting (light level at a point, lit-region polygons),
token↔wall sliding, and tape-measure distance.
Zero runtime dependencies. Works in browsers, workers, Node, Deno/Bun, and bots.

This is the pure-TypeScript **reference implementation**. A Rust/WebAssembly core
(`spatial-core`) will slot in behind the same `SpatialBackend` contract and must
reproduce the shared vector suite (`test/vectors/spatial.json`) bit for bit.

## Conventions

- Everything is 3D (`Vec3`, f64) with **Z up**. 2D consumers keep `z = 0` (`vec2`, `lockZ`).
- Spheres are true globes: elevation matters.
- Walls are zero-thickness vertical segments in XY spanning `[bottom, top]`, so low walls give cover only to things behind and below them.
- Cones take `spread` = tan(half-angle). A cone as wide as it is long (the common TTRPG cone) has `spread: 0.5`.
- Rays starting inside a solid ignore it, so a token's own bounds never block its sight.
- Determinism: only `+ - * /` and `Math.sqrt` on the numeric path (a test enforces this). Ties resolve by input order.

## Usage

```ts
import {
  cone, illumination, lightBoundary, los, measure, selectTargets, slide, sphere, vec3, wall,
} from "@ttrpg-engine/spatial";

const tokens = [
  { id: "goblin-1", position: vec3(5, 0, 0), radius: 2.5 },
  { id: "goblin-2", position: vec3(0, 15, 0), radius: 2.5 },
];
const walls = [wall(vec3(-10, 10, 0), vec3(10, 10, 0), 0, 3)]; // a 3-ft low wall

// 20-ft fireball centred 1 ft off the ground: goblin-2 is behind the wall.
selectTargets(sphere(vec3(0, 0, 1), 20), tokens, { obstacles: walls }); // ["goblin-1"]

// 15-ft cone
selectTargets(cone(vec3(0, 0, 0), vec3(15, 0, 0), 0.5), tokens); // ["goblin-1"]

los(vec3(0, 0, 6), vec3(0, 20, 6), walls).visible; // true: seeing over the wall
measure(vec3(0, 0, 0), vec3(3, 4, 12)); // 13
measure(vec3(0, 0, 0), vec3(3, 4, 12), "horizontal"); // 5

// Move a 2.5-ft-radius token; it stops at the wall and slides along it.
slide(vec3(0, 0, 0), vec3(20, 20, 0), 2.5, walls).position;

// A torch: bright light to 20 ft, dim to 40 ft; walls cast shadows.
const torch = { id: "torch", position: vec3(0, 0, 4), bright: 20, dim: 40 };
illumination(vec3(30, 0, 4), [torch], walls).level; // "dim" (or "dark" behind a wall)
lightBoundary(torch, walls).points; // polygon to mask the light with when drawing
```

## API

| Function | What it does |
|---|---|
| `vec3`, `vec2`, `add`, `sub`, `scale`, `dot`, `cross`, `length`, `normalize`, `distance`, `lerp`, `lockZ` | Vector math |
| `sphere`, `cone`, `cuboid`, `cube`, `plane`, `wall` | Validated shape constructors |
| `containsPoint(shape, p)` | Point inside a solid (walls have no volume) |
| `intersectShape(a, b)` | Overlap test: sphere–sphere, sphere–cuboid, sphere–cone, cuboid–cuboid |
| `raycast(ray, obstacles, maxT?)` / `raycastAll` | Nearest hit / all hits sorted by distance, with unit normals |
| `los(from, to, obstacles)` | Line of sight; returns the first blocker |
| `slide(position, move, radius, walls, options?)` | Collide-and-slide movement against walls |
| `measure(a, b, mode?)` / `measurePath(points, mode?)` | Euclidean, horizontal, or vertical distance |
| `selectTargets(area, tokens, options?)` | Tokens caught by a sphere/cone/cuboid template, with optional cover |
| `illumination(p, lights, obstacles, options?)` | `"bright"`/`"dim"`/`"dark"` at a point (exact 3D, with `ambient`), plus which lights reach it |
| `lightBoundary(light, obstacles)` | Lit region at the light's height as a CCW polygon (walls + cuboids cast shadows; clip with the `dim` circle when drawing) |
| `referenceBackend` | All of the above as a `SpatialBackend` object |

## Benchmarks

`pnpm --filter @ttrpg-engine/spatial bench`. On a typical laptop the fireball
selection over 1,000 tokens with 50 walls takes about 0.15 ms (budget: 5 ms).
