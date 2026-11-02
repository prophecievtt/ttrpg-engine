/**
 * @ttrpg-engine/sandbox — run author-written JavaScript validators (e.g.
 * `validate_level_up.js`) inside QuickJS compiled to WebAssembly.
 *
 * Scripts get plain JavaScript only: no file system, network, timers, `Date`,
 * `eval` or `Math.random`. Every run gets a fresh context, a step budget and a
 * memory cap, so the same document and scripts always give the same result.
 * The validator implements the rules package's `Validator` interface and wraps
 * a base validator (normally `createLogicTreeValidator`) for schemas and rules.
 */
import type { Issue, ValidationResult, ValidationRule, Validator } from "@ttrpg-engine/rules";
import {
  DefaultIntrinsics,
  getQuickJS,
  type QuickJSContext,
  type QuickJSRuntime,
  type QuickJSWASMModule,
} from "quickjs-emscripten";

export const name = "@ttrpg-engine/sandbox" as const;
export const version = "0.1.0" as const;

/** An author script. Its source must define a global `validate(entry)` function. */
export interface JsScript {
  /** Unique id; the default issue code and the file name in error messages. */
  readonly id: string;
  /** Entry `type` this script validates (matches `document.type`). */
  readonly type: string;
  readonly source: string;
}

export interface SandboxLimits {
  /**
   * Interpreter step budget per script run. QuickJS checks in roughly every
   * few thousand operations; each check is one step. Deterministic, unlike a
   * timeout. Default 2000 (well under a second on a laptop).
   */
  readonly maxSteps?: number;
  /** Memory cap for the sandbox, in bytes. Default 32 MiB. */
  readonly memoryBytes?: number;
  /**
   * Call-stack cap, in bytes. Default 128 KiB (about 700 nested calls). Larger
   * values can let deep recursion overflow the host's own stack first, which
   * shuts the validator down (see `JsValidator.validate`).
   */
  readonly stackBytes?: number;
}

export interface JsValidatorOptions {
  /** Handles schemas and logic-tree rules first, e.g. `createLogicTreeValidator(schemas)`. */
  readonly base: Validator;
  readonly scripts: readonly JsScript[];
  readonly limits?: SandboxLimits;
  /**
   * A preloaded `QuickJSWASMModule` (e.g. a bundler-specific variant). Defaults
   * to `getQuickJS()`. Typed structurally so this package's public types don't
   * pull in quickjs-emscripten's (which need `lib: esnext.disposable`).
   */
  readonly quickjs?: { newRuntime(): unknown };
}

/**
 * `validate` throws SandboxError only if the validator was disposed or crashed
 * (the host's own stack overflowed mid-script); script failures are issues.
 */
export interface JsValidator extends Validator {
  /** Free the WebAssembly runtime. The validator must not be used afterwards. */
  dispose(): void;
}

export class SandboxError extends Error {
  constructor(
    message: string,
    readonly issues: readonly Issue[] = [],
  ) {
    super(message);
    this.name = "SandboxError";
  }
}

const DEFAULTS = { maxSteps: 2000, memoryBytes: 32 * 1024 * 1024, stackBytes: 128 * 1024 };
const INPUT = "__ttrpg_input";

// Runs after the author's script, in the same context. Returns JSON (or null) so
// nothing but plain data ever leaves the sandbox.
const HARNESS = `(function () {
  if (typeof validate !== "function") throw new TypeError("script must define a validate(entry) function");
  var input = JSON.parse(globalThis.${INPUT});
  delete globalThis.${INPUT};
  var out = validate(input);
  if (out !== null && typeof out === "object" && typeof out.then === "function") {
    throw new TypeError("validate must return synchronously (no async/Promise)");
  }
  var json = JSON.stringify(out === undefined ? null : out);
  return json === undefined ? null : json;
})()`;

type RunOutcome = { ok: true; value: unknown } | { ok: false; issue: Issue };

/**
 * Load QuickJS and check every script compiles and defines `validate`.
 * Throws SandboxError (one issue per bad script, addressed by index) otherwise.
 */
export async function createJsValidator(options: JsValidatorOptions): Promise<JsValidator> {
  const limits = { ...DEFAULTS, ...options.limits };
  for (const [k, v] of Object.entries(limits)) {
    if (!Number.isInteger(v) || v <= 0) throw new SandboxError(`limits.${k} must be a positive integer`);
  }

  const issues: Issue[] = [];
  const seen = new Set<string>();
  options.scripts.forEach((s, i) => {
    if (typeof s?.id !== "string" || s.id === "" || typeof s.type !== "string" || s.type === "" ||
        typeof s.source !== "string") {
      issues.push({ path: `/${i}`, code: "bad_script", message: "script needs non-empty string `id` and `type`, and a string `source`" });
    } else if (seen.has(s.id)) {
      issues.push({ path: `/${i}/id`, code: "duplicate_script", message: `duplicate script id "${s.id}"` });
    } else {
      seen.add(s.id);
    }
  });
  if (issues.length > 0) throw new SandboxError(`invalid scripts: ${issues[0]!.message}`, issues);

  const quickjs = (options.quickjs as QuickJSWASMModule | undefined) ?? (await getQuickJS());
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setMaxStackSize(limits.stackBytes);
  let steps = 0;
  let stepsExceeded = false;
  runtime.setInterruptHandler(() => {
    steps += 1;
    if (steps > limits.maxSteps) stepsExceeded = true;
    return stepsExceeded;
  });

  // Set when a host exception escapes QuickJS. Its memory may then be
  // inconsistent, so the runtime is abandoned rather than freed.
  let crashed = false;
  const run = (script: JsScript, setup: (ctx: QuickJSContext) => void, code: string): RunOutcome => {
    steps = 0;
    stepsExceeded = false;
    const ctx = newContext(runtime);
    try {
      setup(ctx);
      const loaded = ctx.evalCode(script.source, `${script.id}.js`);
      if (loaded.error) return { ok: false, issue: failure(ctx, script, loaded.error, stepsExceeded) };
      loaded.value.dispose();
      const result = ctx.evalCode(code, `${script.id}:harness`);
      if (result.error) return { ok: false, issue: failure(ctx, script, result.error, stepsExceeded) };
      const value: unknown = ctx.dump(result.value);
      result.value.dispose();
      return { ok: true, value };
    } catch (e) {
      crashed = true;
      throw new SandboxError(`sandbox crashed running "${script.id}": ${(e as Error)?.message ?? String(e)}`);
    } finally {
      if (!crashed) ctx.dispose();
    }
  };

  // Compile check: the script loads within limits and defines validate.
  try {
    options.scripts.forEach((s, i) => {
      const out = run(s, () => {}, `if (typeof validate !== "function") throw new TypeError("script must define a validate(entry) function"); null`);
      if (!out.ok) issues.push({ path: `/${i}/source`, code: out.issue.code, message: out.issue.message });
    });
  } catch (e) {
    if (!crashed) runtime.dispose();
    throw e;
  }
  if (issues.length > 0) {
    if (!crashed) runtime.dispose();
    throw new SandboxError(`invalid scripts: ${issues[0]!.message}`, issues);
  }

  const byType = new Map<string, JsScript[]>();
  for (const s of options.scripts) byType.set(s.type, [...(byType.get(s.type) ?? []), s]);
  let disposed = false;

  return {
    id: `quickjs+${options.base.id}`,
    validate(document: unknown, schemaId?: string, rules: readonly ValidationRule[] = []): ValidationResult {
      if (disposed) throw new SandboxError("validator was disposed");
      if (crashed) throw new SandboxError("validator crashed earlier; create a new one");
      if (schemaId !== undefined) {
        const res = options.base.validate(document, schemaId, []);
        if (!res.valid) return res; // rules and scripts assume schema-valid input
      }
      const errors: Issue[] = [...options.base.validate(document, undefined, rules).errors];
      const type = isRecord(document) && typeof document.type === "string" ? document.type : undefined;
      const scripts = type === undefined ? [] : (byType.get(type) ?? []);
      if (scripts.length > 0) {
        const json = JSON.stringify(document);
        if (json === undefined) {
          errors.push({ path: "/", code: "script_input", message: "document is not JSON-serializable" });
        } else {
          for (const script of scripts) {
            const out = run(script, (ctx) => {
              const handle = ctx.newString(json);
              ctx.setProp(ctx.global, INPUT, handle);
              handle.dispose();
            }, HARNESS);
            if (out.ok) errors.push(...toIssues(script, out.value));
            else errors.push(out.issue);
          }
        }
      }
      return { valid: errors.length === 0, errors };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!crashed) runtime.dispose();
    },
  };
}

function newContext(runtime: QuickJSRuntime): QuickJSContext {
  const ctx = runtime.newContext({ intrinsics: { ...DefaultIntrinsics, Date: false } });
  // The host needs the Eval intrinsic for evalCode, so scripts lose the global
  // `eval` here instead. Math.random comes with Math; remove it for determinism.
  const res = ctx.evalCode("delete globalThis.eval; delete Math.random; undefined");
  if (res.error) {
    res.error.dispose();
    ctx.dispose();
    throw new SandboxError("could not prepare sandbox context (is limits.stackBytes too large?)");
  }
  res.value.dispose();
  return ctx;
}

function failure(ctx: QuickJSContext, script: JsScript, handle: { dispose(): void }, stepsExceeded: boolean): Issue {
  const err: unknown = ctx.dump(handle as Parameters<QuickJSContext["dump"]>[0]);
  handle.dispose();
  const name = isRecord(err) && typeof err.name === "string" ? err.name : "Error";
  const message = isRecord(err) && typeof err.message === "string" ? err.message : String(err);
  if (stepsExceeded) {
    return { path: "/", code: "script_limit", message: `script "${script.id}" ran too long (step limit reached)` };
  }
  if (/out of memory/i.test(message)) {
    return { path: "/", code: "script_limit", message: `script "${script.id}" used too much memory` };
  }
  if (/stack overflow/i.test(message)) {
    return { path: "/", code: "script_limit", message: `script "${script.id}" recursed too deeply (stack overflow)` };
  }
  return { path: "/", code: "script_error", message: `script "${script.id}": ${name}: ${message}` };
}

/**
 * Turn validate()'s return value into issues:
 * `undefined`/`null`/`true`/`[]` → valid; `false` → one generic issue;
 * a string → one issue with that message; an array of strings or
 * `{ path?, code?, message }` objects → one issue each.
 */
function toIssues(script: JsScript, json: unknown): Issue[] {
  const bad: Issue = {
    path: "/",
    code: "script_error",
    message: `script "${script.id}": validate must return true, false, a message, or a list of messages/{ path, code, message }`,
  };
  let value: unknown;
  try {
    value = typeof json === "string" ? JSON.parse(json) : json; // harness output; a script may have replaced JSON
  } catch {
    return [bad];
  }
  if (value === null || value === undefined || value === true) return [];
  if (value === false) return [{ path: "/", code: script.id, message: `failed ${script.id}` }];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item: unknown): Issue => {
    if (typeof item === "string") return { path: "/", code: script.id, message: item };
    if (isRecord(item) && typeof item.message === "string") {
      const path = typeof item.path === "string" && (item.path === "" || item.path.startsWith("/")) ? item.path : "/";
      const code = typeof item.code === "string" && item.code !== "" ? item.code : script.id;
      return { path, code, message: item.message };
    }
    return bad;
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
