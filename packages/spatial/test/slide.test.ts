import { describe, expect, it } from "vitest";

import { slide, vec2, vec3, wall } from "../src/index.js";

const r = 2.5;

describe("slide", () => {
  const w = wall(vec2(10, -50), vec2(10, 50), 0, 10);

  it("moves freely when nothing is in the way", () => {
    expect(slide(vec3(0, 0, 0), vec3(5, 3, 1), r, [w])).toEqual({
      position: vec3(5, 3, 1), collided: false, contacts: [],
    });
  });
  it("stops a head-on move one radius short of the wall", () => {
    const res = slide(vec3(0, 0, 0), vec3(20, 0, 0), r, [w]);
    expect(res.collided).toBe(true);
    expect(res.contacts).toEqual([0]);
    expect(res.position.x).toBeCloseTo(7.5, 6);
    expect(res.position.x).toBeLessThan(7.5);
    expect(res.position.y).toBe(0);
  });
  it("slides along the wall on a diagonal move", () => {
    const res = slide(vec3(0, 0, 0), vec3(20, 20, 0), r, [w]);
    expect(res.position.x).toBeCloseTo(7.5, 6);
    expect(res.position.y).toBeCloseTo(20, 9); // tangential component preserved
  });
  it("rounds wall ends (endpoint caps)", () => {
    const stub = wall(vec2(10, 0), vec2(10, 10), 0, 10);
    // Pass just below the wall's lower end: the cap deflects the token.
    const res = slide(vec3(0, -2, 0), vec3(20, 0, 0), r, [stub]);
    expect(res.collided).toBe(true);
    // Pass well below: no contact.
    expect(slide(vec3(0, -3, 0), vec3(20, 0, 0), r, [stub]).collided).toBe(false);
  });
  it("steps over walls that do not overlap the token's height", () => {
    const low = wall(vec2(10, -50), vec2(10, 50), 0, 1);
    expect(slide(vec3(0, 0, 2), vec3(20, 0, 0), r, [low]).collided).toBe(false);
    expect(slide(vec3(0, 0, 0), vec3(20, 0, 0), r, [low]).collided).toBe(true);
  });
  it("never tunnels through a corner of two walls", () => {
    const corner = [wall(vec2(10, -50), vec2(10, 10), 0, 10), wall(vec2(-50, 10), vec2(10, 10), 0, 10)];
    const res = slide(vec3(0, 0, 0), vec3(40, 40, 0), r, corner);
    expect(res.position.x).toBeLessThanOrEqual(7.5);
    expect(res.position.y).toBeLessThanOrEqual(7.5);
  });
});
