/**
 * Pluggable validation. A `Validator` checks a document against a schema id
 * and a list of system rules. The default implementation runs the JSON Schema
 * subset first, then logic-tree rules. An optional QuickJS-backed validator can
 * implement the same interface in a separate package without touching core.
 */
import type { Issue, ValidationResult } from "./json.js";
import { LogicError, checkTree, evaluate, type LogicTree } from "./logic-tree.js";
import type { SchemaRegistry } from "./schema.js";

/** A declarative rule: when `when` (default true) holds, `check` must evaluate to true. */
export interface ValidationRule {
  readonly id: string;
  readonly message: string;
  readonly check: LogicTree;
  readonly when?: LogicTree;
  /** JSON pointer the failure is reported at. Default "/". */
  readonly path?: string;
}

export interface Validator {
  readonly id: string;
  validate(document: unknown, schemaId?: string, rules?: readonly ValidationRule[]): ValidationResult;
}

/** Statically check rules (well-formed trees, unique ids). Returns issues addressed by rule index. */
export function checkRules(rules: readonly ValidationRule[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  rules.forEach((r, i) => {
    if (seen.has(r.id)) issues.push({ path: `/${i}/id`, code: "duplicate_rule", message: `duplicate rule id "${r.id}"` });
    seen.add(r.id);
    for (const key of ["check", "when"] as const) {
      if (r[key] === undefined) continue;
      for (const e of checkTree(r[key])) {
        issues.push({ path: `/${i}/${key}${e.at}`, code: "bad_rule", message: e.message });
      }
    }
  });
  return issues;
}

function expectBool(v: unknown, at: string): boolean {
  if (typeof v !== "boolean") throw new LogicError(`rule must evaluate to a boolean, got ${JSON.stringify(v)}`, at);
  return v;
}

export function createLogicTreeValidator(schemas?: SchemaRegistry): Validator {
  return {
    id: "logic-tree",
    validate(document, schemaId, rules = []) {
      if (schemaId !== undefined && schemas) {
        const res = schemas.validate(schemaId, document);
        if (!res.valid) return res; // rules assume schema-valid input
      }
      const errors: Issue[] = [];
      for (const rule of rules) {
        try {
          if (rule.when !== undefined && !expectBool(evaluate(rule.when, document), "/when")) continue;
          if (!expectBool(evaluate(rule.check, document), "/check")) {
            errors.push({ path: rule.path ?? "/", code: rule.id, message: rule.message });
          }
        } catch (e) {
          if (!(e instanceof LogicError)) throw e;
          errors.push({ path: rule.path ?? "/", code: "rule_error", message: `rule "${rule.id}": ${e.message}` });
        }
      }
      return { valid: errors.length === 0, errors };
    },
  };
}
