import { describe, expect, it } from "vitest";

import { name, version } from "../src/index.js";

describe("@ttrpg-engine/orchestrator scaffold", () => {
  it("exposes its package identity", () => {
    expect(name).toBe("@ttrpg-engine/orchestrator");
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});