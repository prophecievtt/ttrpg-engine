/**
 * @ttrpg-engine/spatial — physics & geometry engine (scaffold).
 *
 * The locked 3D API (Vec3, Ray, shapes, raycasting, LoS) with the pure-TS
 * reference implementation lands in the `spatial` slice; the wasm core
 * (`@ttrpg-engine/spatial-core`) swaps in behind it later.
 */
export const name = "@ttrpg-engine/spatial" as const;
export const version = "0.1.0" as const;