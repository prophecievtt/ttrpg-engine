/**
 * Token ↔ wall collision with sliding. The token is a circle of `radius` in XY;
 * walls whose z-span overlaps the token's [z, z + height] block it. The token
 * moves to the first contact, then the rest of the move is projected onto the
 * wall tangent ("sliding"), up to `maxIterations` times. Z moves freely.
 */
import type { SlideOptions, SlideResult, Vec3, Wall } from "./api.js";
import { EPSILON } from "./vec.js";

/** Gap kept between token and wall after contact so the next iteration starts clear. */
const SKIN = 1e-7;

interface Contact {
  t: number;
  nx: number;
  ny: number;
}

/** Earliest t in [0, 1] at which a moving circle touches a point (endpoint cap). */
function sweepPoint(
  px: number, py: number, dx: number, dy: number, r: number, cx: number, cy: number,
): Contact | null {
  const ox = px - cx;
  const oy = py - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = ox * dx + oy * dy;
  if (b >= 0) return null; // moving away
  const c = ox * ox + oy * oy - r * r;
  let t: number;
  if (c <= 0) {
    t = 0; // already touching/overlapping and moving inward
  } else {
    const disc = b * b - a * c;
    if (disc < 0) return null;
    t = (-b - Math.sqrt(disc)) / a;
  }
  if (t > 1) return null;
  const hx = ox + dx * t;
  const hy = oy + dy * t;
  const len = Math.sqrt(hx * hx + hy * hy);
  if (len === 0) return null;
  return { t, nx: hx / len, ny: hy / len };
}

function sweepWall(px: number, py: number, dx: number, dy: number, r: number, w: Wall): Contact | null {
  const ex = w.b.x - w.a.x;
  const ey = w.b.y - w.a.y;
  const elen = Math.sqrt(ex * ex + ey * ey);
  let best: Contact | null = null;
  if (elen > 0) {
    const nx0 = -ey / elen;
    const ny0 = ex / elen;
    const dist0 = (px - w.a.x) * nx0 + (py - w.a.y) * ny0;
    const side = dist0 >= 0 ? 1 : -1;
    const nx = nx0 * side;
    const ny = ny0 * side;
    const approach = dx * nx + dy * ny; // < 0 when moving toward the face
    if (approach < 0) {
      const gap = dist0 * side - r;
      const t = gap <= 0 ? 0 : gap / -approach;
      if (t <= 1) {
        const cx = px + dx * t - w.a.x;
        const cy = py + dy * t - w.a.y;
        const u = (cx * ex + cy * ey) / (elen * elen);
        // A face contact only if the touch point lies beside the segment; past
        // its ends, the endpoint caps below take over.
        if (u >= 0 && u <= 1) best = { t, nx, ny };
      }
    }
  }
  for (const [cx, cy] of [[w.a.x, w.a.y], [w.b.x, w.b.y]] as const) {
    const c = sweepPoint(px, py, dx, dy, r, cx, cy);
    if (c && (best === null || c.t < best.t)) best = c;
  }
  return best;
}

export function slide(
  position: Vec3,
  move: Vec3,
  radius: number,
  walls: readonly Wall[],
  options: SlideOptions = {},
): SlideResult {
  const height = options.height ?? radius * 2;
  const maxIterations = options.maxIterations ?? 4;
  const zLo = position.z;
  const zHi = position.z + height;
  const active: number[] = [];
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i]!;
    if (w.top > zLo && w.bottom < zHi) active.push(i);
  }

  let px = position.x;
  let py = position.y;
  let dx = move.x;
  let dy = move.y;
  const contacts: number[] = [];

  for (let iter = 0; iter < maxIterations; iter++) {
    if (dx * dx + dy * dy <= EPSILON * EPSILON) break;
    let hit: Contact | null = null;
    let hitIndex = -1;
    for (const i of active) {
      const c = sweepWall(px, py, dx, dy, radius, walls[i]!);
      if (c && (hit === null || c.t < hit.t)) {
        hit = c;
        hitIndex = i;
      }
    }
    if (hit === null) {
      px += dx;
      py += dy;
      dx = 0;
      dy = 0;
      break;
    }
    contacts.push(hitIndex);
    px += dx * hit.t + hit.nx * SKIN;
    py += dy * hit.t + hit.ny * SKIN;
    const rx = dx * (1 - hit.t);
    const ry = dy * (1 - hit.t);
    const into = rx * hit.nx + ry * hit.ny;
    dx = into < 0 ? rx - hit.nx * into : rx;
    dy = into < 0 ? ry - hit.ny * into : ry;
  }

  return {
    position: { x: px, y: py, z: position.z + move.z },
    collided: contacts.length > 0,
    contacts,
  };
}
