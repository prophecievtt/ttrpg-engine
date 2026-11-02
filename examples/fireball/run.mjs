#!/usr/bin/env node
// Prints the fireball demo log from the built dist (run `pnpm build` first).
import { runFireballDemo } from "./dist/index.js";

process.stdout.write(runFireballDemo());
