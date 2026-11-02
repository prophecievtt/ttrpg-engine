import { describe, expect, it } from "vitest";

import { Prng } from "../src/index.js";

describe("Prng", () => {
  it("same seed → same stream; different seed → different stream", () => {
    const a = new Prng(42);
    const b = new Prng(42);
    const c = new Prng(43);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
    expect([b.next()]).not.toEqual([c.next()]);
  });

  it("string seeds are deterministic", () => {
    const a = new Prng("fireball");
    const b = new Prng("fireball");
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });

  it("die(faces) stays in range over many rolls", () => {
    const p = new Prng("d6s");
    for (let i = 0; i < 5000; i++) {
      const f = p.die(6);
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(6);
      expect(Number.isInteger(f)).toBe(true);
    }
  });

  it("die distribution is roughly uniform (loose chi-style check)", () => {
    const p = new Prng("uniform");
    const counts = new Array(6).fill(0) as number[];
    const N = 12000;
    for (let i = 0; i < N; i++) counts[p.die(6) - 1]!++;
    for (const c of counts) {
      // Expect ~2000 per face; allow ±12% slack (deterministic seed, so stable).
      expect(c).toBeGreaterThan(N / 6 - N * 0.12);
      expect(c).toBeLessThan(N / 6 + N * 0.12);
    }
  });

  it("int(max) is uniform integer in [0, max)", () => {
    const p = new Prng("ints");
    for (let i = 0; i < 2000; i++) {
      const v = p.int(7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
    expect(() => p.int(0)).toThrow(RangeError);
    expect(() => p.int(1.5)).toThrow(RangeError);
  });

  it("uuid() produces v4-shaped ids", () => {
    const p = new Prng("ids");
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = p.uuid();
      expect(re.test(id)).toBe(true);
      ids.add(id);
    }
    expect(ids.size).toBe(200); // all distinct in a seeded stream
  });

  it("shuffle is a deterministic permutation", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const p1 = new Prng("shuffle");
    const p2 = new Prng("shuffle");
    const out1 = p1.shuffle(input);
    const out2 = p2.shuffle(input);
    expect(out1).toEqual(out2);
    expect([...out1].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // original untouched
  });

  it("fork() derives deterministic substreams from parent + label", () => {
    const rootA = new Prng("root");
    const rootB = new Prng("root");
    const diceA = rootA.fork("dice");
    const diceB = rootB.fork("dice");
    // Same-seed parents + same label → identical substreams.
    expect([diceA.next(), diceA.next()]).toEqual([diceB.next(), diceB.next()]);
    // Different labels → different substreams.
    const cards = rootB.fork("cards");
    expect(cards.next()).not.toEqual(diceB.next());
    // Forking consumes parent state: a second same-label fork differs from the first.
    const rootC = new Prng("root");
    const first = rootC.fork("dice");
    const second = rootC.fork("dice");
    expect(first.next()).not.toEqual(second.next());
  });
});