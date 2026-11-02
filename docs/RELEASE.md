# Releasing

What gets published: `@ttrpg-engine/{grid,interactions,rules,spatial,orchestrator}`. Never published: `examples/*` (private), `packages/spatial-core` (Rust crate, no package.json), the repo root (private).

## One-time setup (owner only)

1. **npm account** with 2FA on, at npmjs.com.
2. **The `@ttrpg-engine` scope**: create a free npm organization named `ttrpg-engine` (npmjs.com → Add Organization). Without it, publishing scoped packages fails. If the name is taken, pick a new scope and rename every package (the invariants script enforces `@<scope>/<dir>`).
3. **A public GitHub repository** (done: prophecievtt/ttrpg-engine), then add to each package's `package.json`:
   `"repository": { "type": "git", "url": "git+https://github.com/<owner>/ttrpg-engine.git", "directory": "packages/<name>" }`
   plus `"homepage"` and `"bugs"`. npm shows these as the package's links.
4. `npm login` on the machine you publish from.

## Every release

1. Working tree clean, on `main`, CI green.
2. Bump `version` in each changed package's `package.json` **and** the `version` constant in its `src/index.ts` (`check:pack` fails if they differ). Packages that depend on each other use `workspace:*`, which pnpm turns into the exact version at publish.
3. Add a section to `CHANGELOG.md`.
4. Run everything:
   ```bash
   pnpm install --frozen-lockfile && pnpm check:invariants && pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm smoke && pnpm check:pack
   ```
   `check:pack` packs each package, checks the tarball (dist, README, LICENSE, manifest fields, no src/tests, no leftover `workspace:`), installs the tarballs into a fresh project and runs the README examples in ESM, CJS and a TypeScript typecheck.
5. Save point + tag: `git commit -am "release: vX.Y.Z"` then `git tag vX.Y.Z`.
6. Publish in dependency order, with **pnpm** (npm would not rewrite `workspace:*` or add the root LICENSE):
   ```bash
   pnpm -r --filter "./packages/*" publish --access public
   ```
   Add `--dry-run` first to see exactly what would go up.
7. `git push && git push --tags`, then check each package page on npmjs.com.

## Versioning

Semver. Until 1.0, a minor bump (0.2.0) may break APIs; patch bumps (0.1.1) never do. Session-state shape changes bump `SessionStateV1` → `V2` with a migration note in the changelog.
