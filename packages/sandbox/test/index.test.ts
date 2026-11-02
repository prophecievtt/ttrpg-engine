import { CompendiumError, CompendiumStore, SchemaRegistry, createLogicTreeValidator } from "@ttrpg-engine/rules";
import { afterEach, describe, expect, it } from "vitest";
import { SandboxError, createJsValidator, type JsScript, type JsValidator, type JsValidatorOptions } from "../src/index.js";

const LEVEL_UP = `
function validate(entry) {
  var errors = [];
  if (entry.level > 20) errors.push({ path: "/level", code: "max_level", message: "level cannot exceed 20" });
  var total = 0;
  for (var i = 0; i < entry.classes.length; i++) total += entry.classes[i].levels;
  if (total !== entry.level) errors.push({ path: "/classes", message: "class levels must add up to level" });
  return errors;
}`;

const schemas = new SchemaRegistry();
schemas.register({
  $id: "character",
  type: "object",
  required: ["id", "type", "level", "classes"],
  properties: {
    id: { type: "string" },
    type: { type: "string" },
    level: { type: "integer" },
    classes: { type: "array", items: { type: "object" } },
  },
});

const open: JsValidator[] = [];
afterEach(() => {
  while (open.length) open.pop()!.dispose();
});

async function make(scripts: JsScript[], extra: Partial<JsValidatorOptions> = {}): Promise<JsValidator> {
  const v = await createJsValidator({ base: createLogicTreeValidator(schemas), scripts, ...extra });
  open.push(v);
  return v;
}

const script = (source: string, id = "check"): JsScript => ({ id, type: "character", source });
const hero = (over: Record<string, unknown> = {}) => ({
  id: "hero",
  type: "character",
  level: 3,
  classes: [{ name: "wizard", levels: 3 }],
  ...over,
});

describe("createJsValidator", () => {
  it("passes a valid entry and reports every issue from a script", async () => {
    const v = await make([script(LEVEL_UP, "validate_level_up")]);
    expect(v.validate(hero(), "character")).toEqual({ valid: true, errors: [] });
    expect(v.validate(hero({ level: 21 }), "character").errors).toEqual([
      { path: "/level", code: "max_level", message: "level cannot exceed 20" },
      { path: "/classes", code: "validate_level_up", message: "class levels must add up to level" },
    ]);
  });

  it("accepts true/undefined/[] as valid and false/strings as failures", async () => {
    const cases: [string, unknown[]][] = [
      ["return true", []],
      ["return undefined", []],
      ["return []", []],
      ["return null", []],
      ["return false", [{ path: "/", code: "check", message: "failed check" }]],
      ['return "nope"', [{ path: "/", code: "check", message: "nope" }]],
      ['return ["a", { message: "b", path: "bad-path", code: 7 }]', [
        { path: "/", code: "check", message: "a" },
        { path: "/", code: "check", message: "b" },
      ]],
    ];
    for (const [body, errors] of cases) {
      const v = await make([script(`function validate(e) { ${body} }`)]);
      expect(v.validate(hero(), "character").errors, body).toEqual(errors);
    }
  });

  it("rejects odd return values with a clear message", async () => {
    for (const body of ["return 5", "return [42]", "return { nope: 1 }", "return async function(){}()"]) {
      const v = await make([script(`function validate(e) { ${body} }`)]);
      const [issue] = v.validate(hero(), "character").errors;
      expect(issue?.code, body).toBe("script_error");
    }
  });

  it("runs schema first, then logic-tree rules, then scripts", async () => {
    const v = await make([script('function validate() { return "from script" }')]);
    const rules = [{ id: "low", message: "too high", check: { "<=": [{ get: "level" }, 10] } }];
    // schema failure short-circuits everything else
    expect(v.validate(hero({ level: "x" }), "character", rules).errors.map((e) => e.code)).toEqual(["type"]);
    expect(v.validate(hero({ level: 12 }), "character", rules).errors.map((e) => e.message)).toEqual([
      "too high",
      "from script",
    ]);
  });

  it("only runs scripts for the entry's type", async () => {
    const v = await make([{ id: "s", type: "spell", source: "function validate() { return false }" }]);
    expect(v.validate(hero(), "character").valid).toBe(true);
    expect(v.validate({ id: "f", type: "spell" }).valid).toBe(false);
    expect(v.validate("not an object").valid).toBe(true);
  });

  it("works as a CompendiumStore validator", async () => {
    const v = await make([script(LEVEL_UP)]);
    const store = new CompendiumStore({ schemas, validator: v });
    store.register(hero());
    expect(() => store.register(hero({ id: "bad", level: 4 }))).toThrow(CompendiumError);
    expect(store.get("character", "bad")).toBeUndefined();
  });

  it("gives every run a fresh context (no state leaks between entries)", async () => {
    const v = await make([script("var calls = 0; function validate() { calls++; globalThis.leak = 1; return calls === 1 && typeof leak === 'number' }")]);
    for (let i = 0; i < 3; i++) expect(v.validate(hero(), "character").valid).toBe(true);
  });

  it("cannot mutate the host's document", async () => {
    const v = await make([script("function validate(e) { e.level = 99; e.classes.length = 0; return true }")]);
    const doc = hero();
    v.validate(doc, "character");
    expect(doc).toEqual(hero());
  });

  it("is deterministic: no Date, Math.random, eval or host APIs", async () => {
    const v = await make([script(`function validate() {
      return [typeof Date, typeof Math.random, typeof eval, typeof require, typeof process,
              typeof fetch, typeof setTimeout, typeof std, typeof os, typeof console].join(",");
    }`)]);
    const msg = "undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined";
    expect(v.validate(hero(), "character").errors[0]?.message).toBe(msg);
    expect(v.validate(hero(), "character")).toEqual(v.validate(hero(), "character"));
  });

  it("blocks Function-constructor escapes to host globals", async () => {
    const v = await make([script(`function validate() {
      var g = (function(){}).constructor("return this")();
      return typeof g.process + "," + typeof g.require;
    }`)]);
    // Function() still works inside QuickJS but only sees the sandbox's own globals
    expect(v.validate(hero(), "character").errors[0]?.message).toBe("undefined,undefined");
  });

  it("stops infinite loops at the step limit, every time, and recovers", async () => {
    const v = await make([
      script("function validate() { for (;;) {} }", "spin"),
      script("function validate() { return true }", "ok"),
    ]);
    const first = v.validate(hero(), "character");
    expect(first.errors).toEqual([{ path: "/", code: "script_limit", message: 'script "spin" ran too long (step limit reached)' }]);
    expect(v.validate(hero(), "character")).toEqual(first);
  });

  it("step limit is deterministic: same work passes or fails the same way", async () => {
    const loop = (n: number) => `function validate() { var x = 0; for (var i = 0; i < ${n}; i++) x += i; return true }`;
    const v = await make([script(loop(20_000))], { limits: { maxSteps: 5 } });
    const results = Array.from({ length: 3 }, () => v.validate(hero(), "character").valid);
    expect(new Set(results).size).toBe(1);
    const heavy = await make([script(loop(50_000_000))], { limits: { maxSteps: 5 } });
    expect(heavy.validate(hero(), "character").errors[0]?.code).toBe("script_limit");
  });

  it("stops memory bombs and runaway recursion", async () => {
    const v = await make([
      script('function validate() { var a = []; for (;;) a.push("xxxxxxxxxxxxxxxx" + a.length); }', "mem"),
      script("function validate() { function f() { return f() + 1 } return f() }", "deep"),
    ], { limits: { memoryBytes: 4 * 1024 * 1024, maxSteps: 1_000_000 } });
    const errors = v.validate(hero(), "character").errors;
    expect(errors.map((e) => e.code)).toEqual(["script_limit", "script_limit"]);
    expect(errors[0]?.message).toMatch(/memory/);
    expect(errors[1]?.message).toMatch(/stack overflow/);
    expect(v.validate(hero(), "character").errors).toEqual(errors);
  });

  it("allows ordinary recursion under the default stack cap", async () => {
    const v = await make([script("function validate() { function f(n) { return n ? f(n - 1) + 1 : 0 } return f(300) === 300 }")]);
    expect(v.validate(hero(), "character").valid).toBe(true);
  });

  it("shuts down cleanly if the host stack overflows", async () => {
    const v = await make([script("function validate() { function f() { return f() + 1 } return f() }")], {
      limits: { stackBytes: 1024 * 1024 },
    });
    expect(() => v.validate(hero(), "character")).toThrow(/sandbox crashed/);
    expect(() => v.validate(hero(), "character")).toThrow(/create a new one/);
    // other validators sharing the QuickJS module keep working
    const ok = await make([script(LEVEL_UP)]);
    expect(ok.validate(hero(), "character").valid).toBe(true);
  });

  it("reports runtime errors as issues instead of throwing", async () => {
    const v = await make([script("function validate(e) { return e.missing.deep }")]);
    const [issue] = v.validate(hero(), "character").errors;
    expect(issue?.code).toBe("script_error");
    expect(issue?.message).toMatch(/^script "check": TypeError/);
  });

  it("handles very large and unicode documents", async () => {
    const v = await make([script("function validate(e) { return e.note.length === 100000 && e.name === 'Zoë 🐉' }")]);
    expect(v.validate(hero({ note: "a".repeat(100_000), name: "Zoë 🐉" }), "character").valid).toBe(true);
  });

  it("rejects bad scripts up front, addressed by index", async () => {
    const bad = async (scripts: JsScript[]) => {
      try {
        await createJsValidator({ base: createLogicTreeValidator(schemas), scripts });
      } catch (e) {
        expect(e).toBeInstanceOf(SandboxError);
        return (e as SandboxError).issues;
      }
      throw new Error("expected SandboxError");
    };
    expect(await bad([script("function validate( {")])).toMatchObject([{ path: "/0/source", code: "script_error" }]);
    expect(await bad([script("var x = 1")])).toMatchObject([{ path: "/0/source", message: expect.stringMatching(/validate\(entry\)/) }]);
    expect(await bad([script("for(;;){}")])).toMatchObject([{ path: "/0/source", code: "script_limit" }]);
    expect(await bad([script("function validate(){}"), script("function validate(){}")])).toMatchObject([
      { path: "/1/id", code: "duplicate_script" },
    ]);
    expect(await bad([{ id: "", type: "x", source: "" }])).toMatchObject([{ path: "/0", code: "bad_script" }]);
    await expect(createJsValidator({ base: createLogicTreeValidator(), scripts: [], limits: { maxSteps: 0 } })).rejects.toThrow(/maxSteps/);
  });

  it("throws if used after dispose", async () => {
    const v = await createJsValidator({ base: createLogicTreeValidator(schemas), scripts: [script(LEVEL_UP)] });
    v.dispose();
    v.dispose(); // idempotent
    expect(() => v.validate(hero(), "character")).toThrow(/disposed/);
  });

  it("is fast enough for bulk imports", async () => {
    const v = await make([script(LEVEL_UP)]);
    const start = performance.now();
    for (let i = 0; i < 500; i++) v.validate(hero(), "character");
    const perEntry = (performance.now() - start) / 500;
    expect(perEntry).toBeLessThan(5); // ms; generous for slow CI
  });
});
