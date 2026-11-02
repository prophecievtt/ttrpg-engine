/**
 * Cross-runtime determinism: the built CommonJS bundle, evaluated in a bare
 * ECMAScript realm (node:vm context with no Node globals: no process, Buffer,
 * timers, structuredClone, or crypto), must produce byte-identical output to
 * the source run. This guards the portability invariant: core code may only
 * rely on language built-ins, as in a browser, worker, Deno/Bun, or bot.
 *
 * Requires `dist/` (turbo runs this package's build before test; CI builds
 * before testing). A real-browser runner is part of the hardening slice.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

import { runScenario, type ScenarioApi } from "./scenario.js";

const bundlePath = fileURLToPath(new URL("../dist/index.cjs", import.meta.url));

function loadBundleInBareRealm(): ScenarioApi {
  const code = readFileSync(bundlePath, "utf8");
  const module = { exports: {} as Record<string, unknown> };
  const sandbox = { module, exports: module.exports };
  runInNewContext(`(function (module, exports) {\n${code}\n})(module, exports);`, sandbox, {
    filename: bundlePath,
  });
  return module.exports as unknown as ScenarioApi;
}

describe("determinism across realms", () => {
  it("dist bundle exists (run `pnpm build` first)", () => {
    expect(existsSync(bundlePath)).toBe(true);
  });

  it("bare-realm bundle output is byte-identical to the source run", () => {
    const api = loadBundleInBareRealm();
    expect(typeof api.createEngine).toBe("function");
    const fromBundle = JSON.stringify(runScenario(api));
    const fromSource = JSON.stringify(runScenario());
    expect(fromBundle).toBe(fromSource);
  });

  it("is stable across repeated runs", () => {
    const runs = Array.from({ length: 5 }, () => JSON.stringify(runScenario()));
    expect(new Set(runs).size).toBe(1);
  });
});
