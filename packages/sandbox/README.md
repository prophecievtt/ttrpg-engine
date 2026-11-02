# @ttrpg-engine/sandbox

Opt-in sandbox for **author-written JavaScript validators** (say,
`validate_level_up.js` in a game system pack). Scripts run inside
[QuickJS](https://github.com/justjake/quickjs-emscripten) compiled to
WebAssembly, so the same package works in browsers, Node, bots and servers.

Most rules fit the declarative logic trees in `@ttrpg-engine/rules`; reach for
this package only when a rule is awkward as a tree. It is the only engine
package with a runtime dependency (`quickjs-emscripten`, about 1 MB unpacked).

## What a script can and cannot do

- Plain JavaScript only: no file system, network, timers, `require`/`import`,
  `console`, `Date`, `eval` or `Math.random`.
- Every run starts in a fresh context with its own copy of the entry, so
  scripts cannot keep state between entries or change the host's data.
- A step budget, a memory cap and a stack cap stop runaway scripts. The step
  budget counts interpreter work, not time, so the same entry always passes or
  fails the same way on every machine.

## Usage

```ts
import { createCompendium, createLogicTreeValidator, SchemaRegistry } from "@ttrpg-engine/rules";
import { createJsValidator } from "@ttrpg-engine/sandbox";

const schemas = new SchemaRegistry();
const validator = await createJsValidator({
  base: createLogicTreeValidator(schemas), // schemas + logic-tree rules still run first
  scripts: [{
    id: "validate_level_up",
    type: "character", // runs for entries whose `type` is "character"
    source: `function validate(entry) {
      if (entry.level > 20) return { path: "/level", message: "level cannot exceed 20" };
      return true;
    }`,
  }],
});

const compendium = createCompendium({ schemas, validator });
compendium.validate({ type: "character", id: "a", level: 25 }).errors;
// [{ path: "/level", code: "validate_level_up", message: "level cannot exceed 20" }]

validator.dispose(); // when done
```

`createJsValidator` is async (it loads the WebAssembly once); `validate` is
synchronous after that. Pass `quickjs` to supply your own loaded module (for
example a single-file variant for a bundler that can't serve `.wasm` files).

### The `validate(entry)` contract

A script must define a global `validate(entry)` function that returns:

| Return | Meaning |
|---|---|
| `true`, `undefined`, `null`, `[]` | valid |
| `false` | one issue, `failed <script id>` |
| `"message"` | one issue with that message |
| `{ path?, code?, message }` or an array of these / strings | one issue each |

`path` is a JSON pointer (default `/`), `code` defaults to the script id.
Async functions and other return values become a `script_error` issue.

Order: schema check (stops here if it fails), then logic-tree rules, then each
script for the entry's type. All rule and script issues are reported together.

### Problems become issues, not crashes

| Code | When |
|---|---|
| `script_error` | the script threw, or returned something unexpected |
| `script_limit` | step budget, memory cap or stack cap reached |
| `script_input` | the entry isn't JSON-serializable |

Bad scripts fail early: `createJsValidator` throws a `SandboxError` whose
`issues` point at each broken script (`/0/source`: syntax error, no
`validate`, top-level loop; `/1/id`: duplicate id).

### Limits

`limits: { maxSteps, memoryBytes, stackBytes }` — defaults 2000 steps (well
under a second on a laptop; one step is a few thousand operations), 32 MiB and
128 KiB (about 700 nested calls). Raising `stackBytes` much higher can let deep
recursion overflow the host's own stack first; the validator then throws
`SandboxError("sandbox crashed …")` and must be replaced with a new one.
