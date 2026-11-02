#!/usr/bin/env node
/**
 * Public-API smoke test — the library's equivalent of an endpoint check.
 *
 * Exercises every package's published entry point in both module systems:
 *   - ESM  import of the built dist/index.js
 *   - CJS  require of the built dist/index.cjs
 *
 * Then runs the fireball demo from its built dist in both module systems and
 * checks the log against examples/fireball/expected.log.
 *
 * Fail fast if any package cannot be loaded. Run in CI after `pnpm build`.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const packages = ["grid", "interactions", "rules", "spatial", "orchestrator", "sandbox"];

let failures = 0;

for (const name of packages) {
  const expected = `@ttrpg-engine/${name}`;

  // ESM
  try {
    const mod = await import(join(root, "packages", name, "dist", "index.js"));
    if (mod.name !== expected || mod.version === undefined) {
      console.error(`✗ ${name}: unexpected ESM export surface`);
      failures += 1;
    } else {
      console.log(`✓ ${name}: ESM entry responds (${mod.name}@${mod.version})`);
    }
  } catch (err) {
    console.error(`✗ ${name}: ESM entry failed — ${err.message}`);
    failures += 1;
  }

  // CJS
  try {
    const mod = require(join(root, "packages", name, "dist", "index.cjs"));
    if (mod.name !== expected || mod.version === undefined) {
      console.error(`✗ ${name}: unexpected CJS export surface`);
      failures += 1;
    } else {
      console.log(`✓ ${name}: CJS entry responds (${mod.name}@${mod.version})`);
    }
  } catch (err) {
    console.error(`✗ ${name}: CJS entry failed — ${err.message}`);
    failures += 1;
  }
}

// The fireball demo, run from the built dist, must print expected.log exactly.
try {
  const { readFileSync } = await import("node:fs");
  const expected = readFileSync(join(root, "examples", "fireball", "expected.log"), "utf8");
  const esm = await import(join(root, "examples", "fireball", "dist", "index.js"));
  const cjs = require(join(root, "examples", "fireball", "dist", "index.cjs"));
  if (esm.runFireballDemo() !== expected || cjs.runFireballDemo() !== expected) {
    console.error("✗ fireball demo: output differs from examples/fireball/expected.log");
    failures += 1;
  } else {
    console.log("✓ fireball demo: ESM + CJS output match expected.log");
  }
} catch (err) {
  console.error(`✗ fireball demo failed — ${err.message}`);
  failures += 1;
}

if (failures > 0) {
  console.error(`${failures} entry-point failure(s)`);
  process.exit(1);
}
console.log("✓ all package entry points respond");