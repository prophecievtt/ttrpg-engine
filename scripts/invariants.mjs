#!/usr/bin/env node
/**
 * Workspace invariants — enforce the structural contracts from docs/ARCHITECTURE.md §2.
 *
 * 1. Every npm package under packages/ is named `@ttrpg-engine/<dir>`.
 * 2. Deterministic core packages (grid, interactions, rules, spatial) declare no
 *    runtime `dependencies`.
 * 3. Deterministic core packages contain no unseeded entropy (`Math.random`) and
 *    no wall-clock reads (`Date.now`) in their source.
 *
 * Exit code 0 = invariants hold. Run in CI after install, before tests.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corePackages = ["grid", "interactions", "rules", "spatial"];

const failures = [];

const packageDirs = readdirSync(join(root, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// 1. Naming: every npm package must be @ttrpg-engine/<dirname>
for (const dir of packageDirs) {
  const manifestPath = join(root, "packages", dir, "package.json");
  if (!readFileOrNull(manifestPath)) continue; // spatial-core has no package.json (Rust crate)
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.name !== `@ttrpg-engine/${dir}`) {
    failures.push(`${dir}: package name ${manifest.name} != @ttrpg-engine/${dir}`);
  }
}

// 2. Zero runtime dependencies in deterministic cores
for (const dir of corePackages) {
  const manifest = JSON.parse(
    readFileSync(join(root, "packages", dir, "package.json"), "utf8"),
  );
  if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
    failures.push(`${dir}: core package must not declare runtime dependencies`);
  }
}

// 3. No unseeded entropy / wall-clock in core sources
const forbidden = { "Math.random": "unseeded entropy", "Date.now": "wall-clock time" };
for (const dir of corePackages) {
  const srcDir = join(root, "packages", dir, "src");
  for (const file of walk(srcDir)) {
    if (!file.endsWith(".ts")) continue;
    const text = readFileSync(file, "utf8");
    for (const [pattern, why] of Object.entries(forbidden)) {
      if (text.includes(pattern)) {
        failures.push(`${dir}/src: found ${pattern} (${why}) in ${file}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Invariant failures:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`✓ workspace invariants hold (${packageDirs.length} packages scanned)`);

function readFileOrNull(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}