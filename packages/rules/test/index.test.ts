import { describe, expect, it } from "vitest";

import { name, version } from "../src/index.js";

describe("@ttrpg-engine/rules scaffold", () => {
  it("exposes its package identity", () => {
    expect(name).toBe("@ttrpg-engine/rules");
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});