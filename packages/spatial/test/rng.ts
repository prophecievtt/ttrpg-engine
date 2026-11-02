/** Seeded PRNG for reproducible test scenes (mulberry32). Tests only. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform in [lo, hi), quantised to 1/1024 so scenes are exactly representable. */
export function uniform(rand: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rand() * (hi - lo) * 1024) / 1024;
}
