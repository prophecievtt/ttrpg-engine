#!/usr/bin/env node
/**
 * Release dry-run — what an npm user would actually download.
 *
 * For every public package:
 *   1. `pnpm pack` into a temp dir (pnpm rewrites `workspace:*` to versions).
 *   2. Check the tarball: dist (esm + cjs + d.ts), README.md, LICENSE and a
 *      complete manifest; no src/test files; no leftover `workspace:` specs.
 * Then unpack every tarball into a fresh project's node_modules (core packages
 * have zero runtime deps, so that is exactly what an install produces) and run
 * scripts/pack-consumer: an ESM script mirroring the README quickstarts, a CJS
 * script, and a Node16-resolution typecheck.
 *
 * Needs `pnpm build` first. Publishes nothing.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packages = ["grid", "interactions", "rules", "spatial", "orchestrator"];
const requiredFiles = [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/index.js",
  "dist/index.cjs",
  "dist/index.d.ts",
  "dist/index.d.cts",
];
const requiredFields = ["name", "version", "description", "license", "repository", "homepage", "bugs", "keywords", "engines", "exports", "types"];

const work = mkdtempSync(join(tmpdir(), "ttrpg-pack-"));
const failures = [];
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

try {
  const tarDir = join(work, "tarballs");
  const consumer = join(work, "consumer");
  mkdirSync(tarDir);
  mkdirSync(join(consumer, "node_modules", "@ttrpg-engine"), { recursive: true });

  for (const name of packages) {
    const before = new Set(readdirSync(tarDir));
    run("pnpm", ["pack", "--pack-destination", tarDir], join(root, "packages", name));
    const tarball = readdirSync(tarDir).find((f) => !before.has(f));
    if (!tarball) {
      failures.push(`${name}: pnpm pack produced no tarball`);
      continue;
    }

    const files = run("tar", ["-tzf", join(tarDir, tarball)], root)
      .split("\n")
      .filter(Boolean)
      .map((f) => f.replace(/^package\//, ""));
    for (const f of requiredFiles) if (!files.includes(f)) failures.push(`${name}: tarball missing ${f}`);
    for (const f of files) {
      if (/^(src|test|bench)\//.test(f) || /\.test\./.test(f)) failures.push(`${name}: tarball ships ${f}`);
    }

    const dest = join(consumer, "node_modules", "@ttrpg-engine", name);
    mkdirSync(dest);
    run("tar", ["-xzf", join(tarDir, tarball), "-C", dest, "--strip-components=1"], root);

    const manifestText = readFileSync(join(dest, "package.json"), "utf8");
    const manifest = JSON.parse(manifestText);
    if (manifestText.includes("workspace:")) failures.push(`${name}: packed manifest still has workspace: specs`);
    const exported = createRequire(import.meta.url)(join(dest, "dist", "index.cjs")).version;
    if (exported !== manifest.version) {
      failures.push(`${name}: src/index.ts version ${exported} != package.json ${manifest.version}`);
    }
    for (const field of requiredFields) {
      if (manifest[field] === undefined) failures.push(`${name}: package.json missing "${field}"`);
    }
    const kb = (files.length && Number(run("gzip", ["-l", join(tarDir, tarball)], root).trim().split(/\s+/)[4])) / 1024;
    console.log(`  ${tarball.padEnd(42)} ${String(files.length).padStart(3)} files  ${kb.toFixed(0)} kB unpacked`);
  }

  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  cpSync(join(root, "scripts", "pack-consumer"), consumer, { recursive: true });
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, module: "node16", moduleResolution: "node16", target: "es2022", noEmit: true, skipLibCheck: false },
      files: ["consumer.ts"],
    }),
  );

  for (const script of ["consumer.mjs", "consumer.cjs"]) {
    try {
      process.stdout.write("  " + run(process.execPath, [script], consumer));
    } catch (err) {
      failures.push(`${script}: ${err.stderr || err.message}`);
    }
  }
  try {
    run(process.execPath, [join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "."], consumer);
    console.log("  consumer (types): ok");
  } catch (err) {
    failures.push(`consumer.ts typecheck: ${err.stdout || err.message}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`pack check FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`pack check OK (${packages.length} packages)`);
