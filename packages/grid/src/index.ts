/**
 * @ttrpg-engine/grid — tactical grid mathematics for TTRPGs.
 *
 * Square and hexagonal grid metrics, pixel conversions, line and area-of-effect
 * cell sets. Pure TypeScript, zero runtime dependencies, fully deterministic.
 *
 * @example
 * ```ts
 * import { hexDistance, hexSpiral, altDiagonalDistance } from "@ttrpg-engine/grid";
 *
 * hexDistance({ q: 0, r: 0 }, { q: 3, r: -2 });        // step distance
 * hexSpiral({ q: 0, r: 0 }, 2).length;                 // 19 cells
 * altDiagonalDistance({ x: 0, y: 0 }, { x: 3, y: 3 }); // 4 (alternating diagonals)
 * ```
 */
export const name = "@ttrpg-engine/grid" as const;
export const version = "0.2.0" as const;

export * from "./types.js";
export * from "./square.js";
export * from "./hex.js";
export * from "./aoe.js";