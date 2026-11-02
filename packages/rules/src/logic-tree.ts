/**
 * Logic trees: a tiny, declarative, JSON-serializable expression language for
 * system-provided rules. Safe by construction: no code execution, no prototype
 * access, bounded depth and evaluation steps. Deterministic: pure functions of
 * (tree, data), no clocks, no randomness, no locale-dependent comparisons.
 *
 * Grammar (a node is one of):
 *   literal            null | boolean | finite number | string
 *   [n1, n2, …]        array: each element evaluated
 *   {"lit": json}      a literal JSON value, not evaluated
 *   {"get": "a.b.0", "default"?: node}   dotted path into the data
 *   {"if": c, "then": a, "else"?: b}     ("else" defaults to null)
 *   {"all": [..]} {"any": [..]} {"not": n}           boolean logic (short-circuit)
 *   {"==": [a, b]} {"!=": [a, b]}                    deep JSON equality
 *   {"<": [a, b]} {"<=": …} {">": …} {">=": …}       numbers, or strings (code-unit order)
 *   {"+": [..]} {"*": [..]} {"-": [a, b]} {"/": [a, b]} {"%": [a, b]}
 *   {"min": [..]} {"max": [..]} {"floor": n} {"ceil": n} {"abs": n}
 *   {"in": [x, arrayOrString]} {"len": arrayOrString}
 *
 * `all`/`any`/`not`/`if` use strict booleans: a non-boolean condition is an error,
 * not "truthy", so rule authors get loud failures instead of silent coercion.
 */
import { type JsonValue, deepEqual, getPath, hasOwn, isPlainObject } from "./json.js";

export type LogicTree =
  | null
  | boolean
  | number
  | string
  | LogicTree[]
  | { readonly [op: string]: unknown };

export class LogicError extends Error {
  constructor(
    message: string,
    /** JSON pointer into the tree where the problem is. */
    readonly at: string,
  ) {
    super(`${message} (at ${at || "/"})`);
    this.name = "LogicError";
  }
}

export interface EvaluateOptions {
  /** Maximum evaluation steps (node visits). Default 10,000. */
  readonly maxSteps?: number;
  /** Maximum nesting depth. Default 64. */
  readonly maxDepth?: number;
}

const UNARY = new Set(["not", "floor", "ceil", "abs", "len"]);
const BINARY = new Set(["==", "!=", "<", "<=", ">", ">=", "-", "/", "%", "in"]);
const VARIADIC = new Set(["all", "any", "+", "*", "min", "max"]);

interface Ctx {
  data: unknown;
  steps: number;
  maxSteps: number;
  maxDepth: number;
}

function opOf(node: Record<string, unknown>, at: string): string {
  if (hasOwn(node, "if")) {
    for (const k of Object.keys(node)) {
      if (k !== "if" && k !== "then" && k !== "else") throw new LogicError(`unexpected key "${k}" in if`, at);
    }
    if (!hasOwn(node, "then")) throw new LogicError(`if needs "then"`, at);
    return "if";
  }
  if (hasOwn(node, "get")) {
    for (const k of Object.keys(node)) {
      if (k !== "get" && k !== "default") throw new LogicError(`unexpected key "${k}" in get`, at);
    }
    return "get";
  }
  const keys = Object.keys(node);
  if (keys.length !== 1) throw new LogicError(`operator node must have exactly one key, got ${keys.length}`, at);
  const op = keys[0]!;
  if (op !== "lit" && !UNARY.has(op) && !BINARY.has(op) && !VARIADIC.has(op)) {
    throw new LogicError(`unknown operator "${op}"`, at);
  }
  return op;
}

function num(v: unknown, at: string): number {
  if (typeof v !== "number") throw new LogicError(`expected number, got ${v === null ? "null" : typeof v}`, at);
  return v;
}

function bool(v: unknown, at: string): boolean {
  if (typeof v !== "boolean") throw new LogicError(`expected boolean, got ${v === null ? "null" : typeof v}`, at);
  return v;
}

function finite(n: number, at: string): number {
  if (!Number.isFinite(n)) throw new LogicError("arithmetic produced a non-finite number", at);
  return n;
}

function args(node: Record<string, unknown>, op: string, at: string): unknown[] {
  const a = node[op];
  if (UNARY.has(op)) return [a];
  if (!Array.isArray(a)) throw new LogicError(`"${op}" takes an array of arguments`, at);
  if (BINARY.has(op) && a.length !== 2) throw new LogicError(`"${op}" takes exactly 2 arguments`, at);
  if (VARIADIC.has(op) && a.length === 0 && (op === "min" || op === "max")) {
    throw new LogicError(`"${op}" needs at least 1 argument`, at);
  }
  return a;
}

function compare(op: string, a: unknown, b: unknown, at: string): boolean {
  if (!((typeof a === "number" && typeof b === "number") || (typeof a === "string" && typeof b === "string"))) {
    throw new LogicError(`"${op}" compares two numbers or two strings`, at);
  }
  switch (op) {
    case "<": return a < b;
    case "<=": return a <= b;
    case ">": return a > b;
    default: return a >= b;
  }
}

function evalNode(node: unknown, ctx: Ctx, at: string, depth: number): unknown {
  if (++ctx.steps > ctx.maxSteps) throw new LogicError(`step limit ${ctx.maxSteps} exceeded`, at);
  if (depth > ctx.maxDepth) throw new LogicError(`depth limit ${ctx.maxDepth} exceeded`, at);
  if (node === null || typeof node === "boolean" || typeof node === "string") return node;
  if (typeof node === "number") return finite(node, at);
  if (Array.isArray(node)) return node.map((n, i) => evalNode(n, ctx, `${at}/${i}`, depth + 1));
  if (!isPlainObject(node)) throw new LogicError("not a logic node", at);

  const op = opOf(node, at);
  const sub = (n: unknown, key: string) => evalNode(n, ctx, `${at}/${key}`, depth + 1);

  switch (op) {
    case "lit":
      return node.lit;
    case "get": {
      if (typeof node.get !== "string") throw new LogicError(`"get" takes a dotted path string`, at);
      let v: unknown;
      try {
        v = getPath(ctx.data, node.get);
      } catch (e) {
        throw new LogicError((e as Error).message, at);
      }
      if (v === undefined) return hasOwn(node, "default") ? sub(node.default, "default") : null;
      return v;
    }
    case "if": {
      const c = bool(sub(node.if, "if"), `${at}/if`);
      if (c) return sub(node.then, "then");
      return hasOwn(node, "else") ? sub(node.else, "else") : null;
    }
    case "not":
      return !bool(sub(node.not, "not"), `${at}/not`);
  }

  const list = args(node, op, at);
  const argAt = (i: number) => `${at}/${op.replace(/~/g, "~0").replace(/\//g, "~1")}${UNARY.has(op) ? "" : `/${i}`}`;
  const ev = (i: number) => evalNode(list[i], ctx, argAt(i), depth + 1);

  switch (op) {
    case "all":
      for (let i = 0; i < list.length; i++) if (!bool(ev(i), argAt(i))) return false;
      return true;
    case "any":
      for (let i = 0; i < list.length; i++) if (bool(ev(i), argAt(i))) return true;
      return false;
    case "==":
      return deepEqual(ev(0), ev(1));
    case "!=":
      return !deepEqual(ev(0), ev(1));
    case "<": case "<=": case ">": case ">=":
      return compare(op, ev(0), ev(1), at);
    case "+": {
      let s = 0;
      for (let i = 0; i < list.length; i++) s += num(ev(i), argAt(i));
      return finite(s, at);
    }
    case "*": {
      let p = 1;
      for (let i = 0; i < list.length; i++) p *= num(ev(i), argAt(i));
      return finite(p, at);
    }
    case "-":
      return finite(num(ev(0), argAt(0)) - num(ev(1), argAt(1)), at);
    case "/": case "%": {
      const a = num(ev(0), argAt(0));
      const b = num(ev(1), argAt(1));
      if (b === 0) throw new LogicError(`division by zero`, at);
      return finite(op === "/" ? a / b : a % b, at);
    }
    case "min": case "max": {
      let r = num(ev(0), argAt(0));
      for (let i = 1; i < list.length; i++) {
        const v = num(ev(i), argAt(i));
        if (op === "min" ? v < r : v > r) r = v;
      }
      return r;
    }
    case "floor": return Math.floor(num(ev(0), argAt(0)));
    case "ceil": return Math.ceil(num(ev(0), argAt(0)));
    case "abs": return Math.abs(num(ev(0), argAt(0)));
    case "len": {
      const v = ev(0);
      if (typeof v !== "string" && !Array.isArray(v)) throw new LogicError(`"len" takes an array or string`, at);
      return v.length;
    }
    case "in": {
      const x = ev(0);
      const coll = ev(1);
      if (typeof coll === "string") {
        if (typeof x !== "string") throw new LogicError(`"in" on a string needs a string needle`, at);
        return coll.includes(x);
      }
      if (!Array.isArray(coll)) throw new LogicError(`"in" takes an array or string`, at);
      return coll.some((c) => deepEqual(c, x));
    }
  }
  throw new LogicError(`unknown operator "${op}"`, at);
}

/** Evaluate a logic tree against JSON data. Throws LogicError on malformed trees or type errors. */
export function evaluate(tree: LogicTree, data: unknown = null, options: EvaluateOptions = {}): JsonValue {
  const ctx: Ctx = {
    data,
    steps: 0,
    maxSteps: options.maxSteps ?? 10_000,
    maxDepth: options.maxDepth ?? 64,
  };
  return evalNode(tree, ctx, "", 0) as JsonValue;
}

/**
 * Statically check a tree's shape (operators, arities) without evaluating it.
 * Returns the problems found; an empty array means the tree is well-formed.
 */
export function checkTree(tree: unknown, maxDepth = 64): LogicError[] {
  const errors: LogicError[] = [];
  const walk = (node: unknown, at: string, depth: number): void => {
    if (depth > maxDepth) {
      errors.push(new LogicError(`depth limit ${maxDepth} exceeded`, at));
      return;
    }
    if (node === null || typeof node === "boolean" || typeof node === "string") return;
    if (typeof node === "number") {
      if (!Number.isFinite(node)) errors.push(new LogicError("non-finite number", at));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, `${at}/${i}`, depth + 1));
      return;
    }
    if (!isPlainObject(node)) {
      errors.push(new LogicError("not a logic node", at));
      return;
    }
    let op: string;
    try {
      op = opOf(node, at);
    } catch (e) {
      errors.push(e as LogicError);
      return;
    }
    if (op === "lit") return;
    if (op === "get") {
      if (typeof node.get !== "string") errors.push(new LogicError(`"get" takes a dotted path string`, at));
      if (hasOwn(node, "default")) walk(node.default, `${at}/default`, depth + 1);
      return;
    }
    if (op === "if") {
      for (const k of ["if", "then", "else"]) if (hasOwn(node, k)) walk(node[k], `${at}/${k}`, depth + 1);
      return;
    }
    if (UNARY.has(op)) {
      walk(node[op], `${at}/${op}`, depth + 1);
      return;
    }
    let list: unknown[];
    try {
      list = args(node, op, at);
    } catch (e) {
      errors.push(e as LogicError);
      return;
    }
    list.forEach((n, i) => walk(n, `${at}/${op}/${i}`, depth + 1));
  };
  walk(tree, "", 0);
  return errors;
}
