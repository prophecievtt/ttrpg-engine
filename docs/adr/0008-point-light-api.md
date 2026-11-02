# 8. Lighting: point lights with three levels

Status: accepted (2026-11-01)

## Context
VTTs need "can this token see / is it lit" and a lit-area polygon to draw.

## Decision
Lights are points `{ position, bright, dim }`; levels are `dark | dim | bright`. Both queries (`illumination`, `lightBoundary`) sit on `SpatialBackend`.

## Consequences
- `illumination` is exact 3D; `lightBoundary` is a 2D slice at the light's height (spheres/planes ignored, consumers clip with the dim circle).
- Cone lights, magical darkness and darkvision are VTT-level features for later.
