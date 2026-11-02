/**
 * @ttrpg-engine/spatial — grid-agnostic 3D geometry for TTRPGs.
 *
 * Volumetric shapes, raycasting, line of sight, wall sliding, tape-measure
 * distance, area-of-effect target selection, and lighting (light level at a point,
 * lit-region polygons). This is the pure-TS
 * reference implementation; the Rust/wasm core (`spatial-core`) will slot in
 * behind the same `SpatialBackend` contract and must match it bit for bit.
 *
 * @example
 * ```ts
 * import { selectTargets, sphere, vec3, wall } from "@ttrpg-engine/spatial";
 *
 * const blast = sphere(vec3(30, 30, 5), 20); // a 20-ft globe
 * const cover = [wall(vec3(40, 0, 0), vec3(40, 60, 0), 0, 3)]; // a 3-ft low wall
 * selectTargets(blast, tokens, { obstacles: cover }); // ["goblin-1", …]
 * ```
 */
import type { SpatialBackend } from "./api.js";
import { raycast, raycastAll, los } from "./raycast.js";
import { containsPoint, intersectShape } from "./shapes.js";
import { slide } from "./slide.js";
import { measure, selectTargets } from "./query.js";
import { illumination, lightBoundary } from "./light.js";

export const name = "@ttrpg-engine/spatial" as const;
export const version = "0.1.0" as const;

export type * from "./api.js";
export * from "./vec.js";
export * from "./shapes.js";
export * from "./raycast.js";
export * from "./slide.js";
export * from "./query.js";
export * from "./light.js";

/** The pure-TS reference backend (the permanent oracle for the wasm core). */
export const referenceBackend: SpatialBackend = Object.freeze({
  id: "ts-reference",
  raycast,
  raycastAll,
  los,
  containsPoint,
  intersectShape,
  slide,
  measure,
  selectTargets,
  illumination,
  lightBoundary,
});
