# @ttrpg-engine/rules

The static knowledge engine for a TTRPG system: a compendium of content
(spells, classes, NPCs, items, …), JSON Schemas that validate that content and
drive homebrew form generation, and declarative **logic-tree** rules for
system-specific validation. Zero runtime dependencies; deterministic; safe to
run untrusted system packs (no code execution).

## Compendium

```ts
import { createCompendium } from "@ttrpg-engine/rules";

const compendium = createCompendium()
  .registerSchema({
    $id: "spell",
    type: "object",
    required: ["type", "id", "name", "level"],
    properties: {
      type: { enum: ["spell"] },
      id: { type: "string" },
      name: { type: "string", title: "Name" },
      level: { type: "integer", title: "Level" },
      damage: { type: "object", properties: { dice: { type: "string" }, kind: { type: "string" } } },
      tags: { type: "array", items: { type: "string" } },
    },
  })
  .registerRules("spell", [
    { id: "level_range", message: "spell level must be 0–9", path: "/level",
      check: { all: [{ ">=": [{ get: "level" }, 0] }, { "<=": [{ get: "level" }, 9] }] } },
  ])
  .register([
    { type: "spell", id: "fireball", name: "Fireball", level: 3, damage: { dice: "8d6", kind: "fire" }, tags: ["aoe"] },
  ]);

compendium.get("spell", "fireball");
compendium.query("spell", {
  where: { level: { gte: 3 }, "damage.kind": "fire", tags: { contains: "aoe" } },
  sort: { by: "level", order: "desc" },
  limit: 10,
});
```

- Entries are plain JSON with string `type` and `id`, deep-frozen on registration.
- If a schema's `$id` equals an entry's `type`, the entry is validated against it (and the type's rules). Batches are all-or-nothing and errors carry JSON-pointer paths.
- Filter operators: bare value (equality), `eq ne lt lte gt gte in contains exists`, plus `match` for an arbitrary logic tree.
- When a type has a schema, query and sort paths must exist in it, so typos fail loudly.
- Results are deterministic: insertion order, then a stable sort.
- Storage is pluggable (`CompendiumBackend`). Default is in memory; see below to save it.

### Saving the compendium (SQLite, IndexedDB)

```ts
// Desktop, bot or server: bring your own SQLite connection.
import { DatabaseSync } from "node:sqlite"; // or: new (require("better-sqlite3"))(file)
import { createCompendium, openSqliteBackend } from "@ttrpg-engine/rules";

const compendium = createCompendium({
  backend: openSqliteBackend(new DatabaseSync("compendium.db"), { system: "ember" }),
});

// Browser, offline:
import { openIndexedDbBackend } from "@ttrpg-engine/rules";
const backend = await openIndexedDbBackend({ system: "ember" });
const browserCompendium = createCompendium({ backend });
await backend.flush(); // wait until writes are stored
```

- Both load the system's entries into memory when opened and write changes through, so queries behave exactly as in memory (ADR 10).
- SQLite runs pending migrations on open and writes each `register` batch in one transaction. It refuses a database made by a newer version.
- IndexedDB writes in the background, one transaction per tick; `flush()` reports the first failed write, `close()` flushes then closes.
- `system` (default `"default"`) lets one database hold several game systems.
- Schemas and rules aren't stored: register them at startup, as with the memory backend.

## JSON Schema subset

Assertions: `type` (incl. `integer` and type arrays), `properties`, `required`,
`enum`, `items`, `$ref` (registry-local: `#/definitions/x`, `otherSchemaId`, or
`otherSchemaId#/definitions/x`), `additionalProperties`.

Annotations kept for UI form generation but not enforced: `title`,
`description`, `default`, `examples`, `definitions`/`$defs`, `format`,
`readOnly`, `writeOnly`, `deprecated`, `$comment`, and any `x-*` key.

Anything else (e.g. `minimum`, `pattern`) is **rejected at registration**, so an
author never believes an unsupported constraint is enforced. Express such
constraints as rules instead.

## Logic trees

JSON expressions, evaluated with `evaluate(tree, data)`:

| Node | Meaning |
|---|---|
| `null`, `true`, `3`, `"x"` | literals |
| `[a, b]` | array of evaluated nodes |
| `{"lit": json}` | a JSON value, not evaluated |
| `{"get": "damage.dice", "default": n}` | dotted path into the data (missing → default or `null`) |
| `{"if": c, "then": a, "else": b}` | conditional |
| `{"all": [..]}`, `{"any": [..]}`, `{"not": n}` | boolean logic, short-circuiting |
| `{"==": [a, b]}`, `{"!=": [a, b]}` | deep JSON equality |
| `{"<": [a, b]}`, `<=`, `>`, `>=` | two numbers, or two strings |
| `{"+": [..]}`, `{"*": [..]}`, `{"-": [a, b]}`, `{"/": [a, b]}`, `{"%": [a, b]}` | arithmetic |
| `{"min": [..]}`, `{"max": [..]}`, `{"floor": n}`, `{"ceil": n}`, `{"abs": n}` | numeric helpers |
| `{"in": [x, arrayOrString]}`, `{"len": arrayOrString}` | collections |

Conditions must be real booleans (no truthiness), arithmetic must stay finite,
division by zero is an error, and `__proto__`/`constructor`/`prototype` path
segments are refused. Evaluation is bounded (10,000 steps, depth 64 by
default). Errors are `LogicError`s with a JSON pointer into the tree.
`checkTree(tree)` validates structure without evaluating.

## Validators

`Validator` is `{ id, validate(document, schemaId?, rules?) }`. The default,
`createLogicTreeValidator(schemas)`, runs the schema first and then each rule
(`{ id, message, check, when?, path? }`). A rule that throws becomes a
`rule_error` issue rather than crashing registration. For rules that are
awkward as trees, the opt-in [`@ttrpg-engine/sandbox`](../sandbox) package runs
author-written JavaScript in QuickJS behind the same interface.
