// A fresh third-party project using the packed tarballs (CommonJS).
const assert = require("node:assert/strict");

for (const name of ["grid", "interactions", "rules", "spatial", "orchestrator"]) {
  const mod = require(`@ttrpg-engine/${name}`);
  assert.equal(mod.name, `@ttrpg-engine/${name}`);
}
const { createEngine, createSession } = require("@ttrpg-engine/interactions");
const res = createEngine({ session: createSession() }).dispatch({
  intent_id: "req_1",
  type: "NEXT_TURN",
  source: "system",
  payload: {},
});
assert.equal(res.status, "success");

console.log("consumer (cjs): ok");
