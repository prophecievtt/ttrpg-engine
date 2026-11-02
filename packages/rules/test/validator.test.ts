import { describe, expect, it } from "vitest";

import {
  SchemaRegistry, checkRules, createLogicTreeValidator, type ValidationRule, type Validator,
} from "../src/index.js";
import { spellRules, spellSchema } from "./fixtures/ember.js";

describe("logic-tree Validator", () => {
  const schemas = new SchemaRegistry();
  schemas.register(spellSchema);
  const v = createLogicTreeValidator(schemas);
  const fireball = { type: "spell", id: "fireball", name: "Fireball", level: 3, school: "evocation" };

  it("passes valid documents", () => {
    expect(v.validate(fireball, "spell", spellRules)).toEqual({ valid: true, errors: [] });
  });
  it("schema errors short-circuit rules", () => {
    const res = v.validate({ ...fireball, level: "3" }, "spell", spellRules);
    expect(res.errors.map((e) => e.code)).toEqual(["type"]);
  });
  it("rule failures report the rule id, message, and path", () => {
    expect(v.validate({ ...fireball, level: 12 }, "spell", spellRules).errors).toEqual([
      { path: "/level", code: "level_range", message: "spell level must be 0–9" },
    ]);
  });
  it("rules that error at runtime become rule_error issues, not crashes", () => {
    const rules: ValidationRule[] = [{ id: "r", message: "m", check: { "+": [{ get: "name" }, 1] } }];
    const res = v.validate(fireball, undefined, rules);
    expect(res.errors[0]?.code).toBe("rule_error");
    const nonBool: ValidationRule[] = [{ id: "r", message: "m", check: { get: "level" } }];
    expect(v.validate(fireball, undefined, nonBool).errors[0]?.message).toMatch(/must evaluate to a boolean/);
  });
  it("checkRules catches duplicate ids and malformed trees", () => {
    const issues = checkRules([
      { id: "a", message: "", check: true },
      { id: "a", message: "", check: { "-": [1] }, when: { bogus: [] } },
    ]);
    expect(issues.map((i) => [i.path, i.code])).toEqual([
      ["/1/id", "duplicate_rule"],
      ["/1/check", "bad_rule"],
      ["/1/when", "bad_rule"],
    ]);
  });
  it("the Validator interface is pluggable", () => {
    const strict: Validator = {
      id: "always-no",
      validate: () => ({ valid: false, errors: [{ path: "/", code: "no", message: "no" }] }),
    };
    expect(strict.validate({}).valid).toBe(false);
  });
});
