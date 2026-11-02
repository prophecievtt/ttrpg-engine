# @ttrpg-engine/orchestrator

The glue between the engine packages. One call runs a spell-style action end to end:

**rules query** (`@ttrpg-engine/rules`) → **target selection** (`@ttrpg-engine/spatial` area, or ids you already picked) → **entropy binding** → **dispatch** (`@ttrpg-engine/interactions`).

It stays system-agnostic: from a spell it reads only `area`, `damage.dice` and `save.ability`. What damage *means* is your `Ruleset`'s job.

## Install

```bash
pnpm add @ttrpg-engine/orchestrator @ttrpg-engine/interactions @ttrpg-engine/rules
```

## Quickstart

```ts
import { createEngine, createSession, addEntity, type Ruleset } from "@ttrpg-engine/interactions";
import { createCompendium } from "@ttrpg-engine/rules";
import { createPipeline, seededEntropy } from "@ttrpg-engine/orchestrator";

const spells = createCompendium().register([
  { type: "spell", id: "burst", name: "Burst", area: { shape: "sphere", size: 10 }, damage: { dice: "2d6" } },
]);

let state = createSession();
state = addEntity(state, { id: "mage", components: { position: { x: 0, y: 0, z: 0 } } });
state = addEntity(state, { id: "rat", components: { hp: 7, position: { x: 30, y: 0, z: 0 } } });
state = addEntity(state, { id: "far-rat", components: { hp: 7, position: { x: 90, y: 0, z: 0 } } });

// The pipeline dispatches CAST_SPELL { spell_id, targets, injected_entropy }; your ruleset resolves it.
const ruleset: Ruleset = {
  id: "my-game",
  handle(type, ctx) {
    if (type !== "CAST_SPELL") return false;
    const { targets, injected_entropy } = ctx.intent.payload as any;
    const dmg = ctx.roll(injected_entropy.damage.roll, injected_entropy.damage);
    for (const id of targets) ctx.setComponent(id, "hp", (ctx.getComponent(id, "hp") as number) - dmg.total);
    return true;
  },
};

const pipeline = createPipeline({
  engine: createEngine({ ruleset, session: state }),
  spells,
  entropy: seededEntropy("table-1"), // fills in any dice the request didn't inject
});

const { targets, response } = pipeline.castSpell({
  intent_id: "req_1",
  source: "mage",
  spell_id: "burst",
  targeting: { mode: "area", at: { x: 30, y: 0, z: 0 } },
  entropy: { damage: { dice: [[4, 2]] } },
});

targets;         // ["rat"]  (far-rat is outside the 10 ft sphere)
response.delta;  // the JSON Patch every client applies
```

## Targeting

| Mode | Use it for |
|---|---|
| `{ mode: "area", at, direction?, tokens?, obstacles? }` | 3D / gridless play. Supports `sphere`, `cube` and `cone` (needs `direction`). Tokens default to every entity with a `position` `{x, y, z}` (feet, z up) and optional `radius`; `obstacles` block line of sight from `at`. |
| `{ mode: "ids", ids }` | Grid play where the frontend already picked cells/targets (e.g. with `@ttrpg-engine/grid`), or theater of the mind. |

## Entropy

Injected values always win: `entropy.damage` (per-die faces or a total) and `entropy.target_saves` (save totals per target id). For anything not injected, the pipeline asks the `EntropyProvider` you passed. `seededEntropy(seed)` gives repeatable rolls; saves use d20 + the target's `saves[ability]` component. With no provider and missing dice, the cast is rejected with `entropy_required`.

## Hosting many sessions

```ts
import { createSessionRegistry, seededEntropy } from "@ttrpg-engine/orchestrator";

const registry = createSessionRegistry({ ruleset, spells, entropy: (id) => seededEntropy(id) });
registry.open("table-1", state);
registry.get("table-1")?.castSpell({ … });
registry.dispatch("table-1", intent); // any raw intent
```

For a full worked example (a 5e-flavoured fireball with saves, slots and a golden delta), see `examples/fireball` in the repository.

## License

MIT.
