#!/usr/bin/env node
/**
 * Public-API smoke test — the library's equivalent of an endpoint check.
 *
 * Exercises every package's published entry point in both module systems:
 *   - ESM  import of the built dist/index.js
 *   - CJS  require of the built dist/index.cjs
 *
 * Fail fast if any package cannot be loaded. Run in CI after `pnpm build`.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const packages = ["grid", "interactions", "rules", "spatial", "orchestrator"];

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

if (failures > 0) {
  console.error(`${failures} entry-point failure(s)`);
  process.exit(1);
}
console.log("✓ all package entry points respond");