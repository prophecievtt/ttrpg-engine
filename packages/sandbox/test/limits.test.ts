import { createLogicTreeValidator } from "@ttrpg-engine/rules";
import { newQuickJSWASMModule } from "quickjs-emscripten";
import { expect, it } from "vitest";
import { createJsValidator } from "../src/index.js";

it("explains an oversized stack cap instead of failing obscurely", async () => {
  await expect(
    createJsValidator({
      base: createLogicTreeValidator(),
      scripts: [{ id: "a", type: "t", source: "function validate() {}" }],
      limits: { stackBytes: 64 * 1024 * 1024 },
    }),
  ).rejects.toThrow(/stackBytes too large/);
});

it("accepts a caller-supplied QuickJS module", async () => {
  const v = await createJsValidator({
    base: createLogicTreeValidator(),
    scripts: [{ id: "a", type: "t", source: "function validate() { return false }" }],
    quickjs: await newQuickJSWASMModule(),
  });
  expect(v.validate({ type: "t" }).errors[0]?.code).toBe("a");
  v.dispose();
});
