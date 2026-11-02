/**
 * Seeded PRNG (xoshiro128** + splitmix64 seeding).
 *
 * Deterministic on every JS engine: multiplication via Math.imul, rotations
 * via >>> shifts — no float state. Used for tests, replays, and boundary
 * entropy providers that want a seeded stream. Never auto-seeded.
 */
export class Prng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number | string) {
    const sm = splitmix(seed);
    this.s0 = sm[0];
    this.s1 = sm[1];
    this.s2 = sm[2];
    this.s3 = sm[3];
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) {
      // Splitmix can't produce all-zero from a non-trivial string, but keep the
      // invariant guarded so a zero state can never lock the generator.
      this.s0 = 0x9e3779b9;
    }
  }

  /** Next 32-bit unsigned integer. */
  next(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9);
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result >>> 0;
  }

  /** Uniform integer in [0, max). Rejection-sampled (no modulo bias). */
  int(max: number): number {
    if (!Number.isInteger(max) || max <= 0) throw new RangeError("max must be a positive integer");
    const limit = Math.floor(0x100000000 / max) * max;
    for (;;) {
      const v = this.next();
      if (v < limit) return v % max;
    }
  }

  /** Uniform die face in [1, faces]. */
  die(faces: number): number {
    return this.int(faces) + 1;
  }

  /** UUID v4-shaped id drawn from the seeded stream (form, not crypto). */
  uuid(): string {
    const bytes: number[] = [];
    for (let i = 0; i < 4; i++) bytes.push(this.next());
    const hex = bytes
      .map((b) => b.toString(16).padStart(8, "0"))
      .join("");
    return (
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-` +
      `4${hex.slice(13, 16)}-` +
      `${"89ab"[this.int(4)]}${hex.slice(17, 20)}-` +
      `${hex.slice(20, 32)}`
    );
  }

  /** Deterministic Fisher–Yates shuffle (returns a copy). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  }

  /** Independent stream for a named subspace, e.g. prng.fork("dice"). */
  fork(label: string): Prng {
    // Mix the label into a fresh 32-bit word and XOR into state — keeps forks
    // deterministic and decorrelated.
    const words = splitmix(label);
    const p = new Prng(this.next() ^ words[0]);
    p.s1 ^= words[1];
    p.s2 ^= words[2];
    p.s3 ^= words[3];
    return p;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

function splitmix(seed: number | string): [number, number, number, number] {
  let h: number;
  if (typeof seed === "number") {
    h = seed >>> 0;
  } else {
    h = 0x9e3779b9;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 0x85ebca6b);
      h ^= h >>> 13;
    }
  }
  h = h >>> 0;
  const out: number[] = new Array(4);
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    out[i] = h;
    h = (h + 0x9e3779b9) >>> 0;
  }
  return [out[0]!, out[1]!, out[2]!, out[3]!];
}