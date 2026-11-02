import { describe, expect, it } from "vitest";

import { name, version } from "../src/index.js";

describe("@ttrpg-engine/spatial scaffold", () => {
  it("exposes its package identity", () => {
    expect(name).toBe("@ttrpg-engine/spatial");
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});