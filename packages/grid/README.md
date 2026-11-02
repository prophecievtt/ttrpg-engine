# @ttrpg-engine/grid

Tactical grid mathematics for TTRPGs. Pure TypeScript, **zero runtime dependencies**, fully deterministic.

Square and hex grids: distance metrics, neighbors, lines, pixel conversions, and area-of-effect cell sets. Hex math follows the canonical Red Blob Games formulations (axial storage, cube algorithm space).

## Install

```bash
pnpm add @ttrpg-engine/grid
```

## Square grids

```ts
import { altDiagonalDistance, supercoverLine, cellToPixel } from "@ttrpg-engine/grid";

// D&D 5e-style movement: every other diagonal costs double.
altDiagonalDistance({ x: 0, y: 0 }, { x: 3, y: 3 }); // 4

// Every cell a line-of-sight segment touches:
supercoverLine({ x: 0, y: 0 }, { x: 3, y: 2 });

// Pixel conversion (origin = top-left corner of cell (0,0), 50px cells):
cellToPixel({ x: 2, y: 3 }, { x: 0, y: 0 }, 50); // { x: 125, y: 175 }
```

| Result | Distance metric |
|---|---|
| `chebyshevDistance` | king's move |
| `manhattanDistance` | rook's move |
| `altDiagonalDistance` | alternating diagonals (5e) |
| `euclideanDistance` | center-to-center |

## Hex grids

```ts
import { hexDistance, hexSpiral, hexRing, pixelToHex } from "@ttrpg-engine/grid";

const origin = { q: 0, r: 0 };

hexDistance(origin, { q: 3, r: -2 }); // 3 steps
hexSpiral(origin, 2).length;          // 19 (1 + 3·2·3)
hexRing(origin, 2).length;            // 12

const layout = { orientation: "pointy", size: 25, origin: { x: 0, y: 0 } };
pixelToHex({ x: 130, y: 42 }, layout); // nearest hex
```

Pixel conversion supports `pointy` and `flat` orientations with configurable hex `size` and grid `origin`.

## Area of effect

```ts
import { coneSq, coneHex, circleSq, circleHex, cubeCells } from "@ttrpg-engine/grid";

coneSq({ x: 0, y: 0 }, { x: 1, y: 0 }, 3);  // 5e-style 15ft cone, east
circleSq({ x: 0, y: 0 }, 2);                 // Euclid disk, radius 2 cells
cubeCells({ x: 0, y: 0 }, 2);                // 5x5 area

coneHex({ q: 0, r: 0 }, { q: 1, r: 0 }, 3);  // hex cone, 3-step reach
circleHex({ q: 0, r: 0 }, 2);                // hex step-circle (19 cells)
```

Cones use the 5e default (width equals length at the far end, half-angle `atan(0.5)`) and accept a custom `halfAngleDeg`. Cells are tested by center inclusion; boundary cells are consistently included.

## Determinism guarantees

- No `Math.random`, no `Date.now`, no object-key iteration in logic paths.
- Stable iteration order everywhere; `hexRing`/`hexSpiral` layouts are exact.
- Same inputs produce identical output on every platform.

## License

MIT.