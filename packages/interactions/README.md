# @ttrpg-engine/interactions

The live-session state machine for TTRPGs. Strict **Intents** in, [RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902) **JSON Patch deltas** out. Pure TypeScript, **zero runtime dependencies**, deterministic by construction.

It knows nothing about any game system: your rules plug in as a `Ruleset`. The engine handles state threading, op emission, turn order, effect expiry and dice validation.

## Install

```bash
pnpm add @ttrpg-engine/interactions
```

## Quickstart

```ts
import { createEngine, createSession, addEntity, replayOps, RejectionError, type Ruleset } from "@ttrpg-engine/interactions";

// Your game's rules: handle the intent types you own, return false for the rest.
const ruleset: Ruleset = {
  id: "my-game",
  handle(type, ctx) {
    if (type !== "ATTACK") return false;
    const { target, entropy } = ctx.intent.payload as { target: string; entropy: { dice: number[][] } };
    const hit = ctx.roll("1d20+5", entropy);          // validates the injected die, records it in the delta
    if (hit.total < 12) throw new RejectionError("miss", `rolled ${hit.total}`);
    ctx.setComponent(target, "hp", (ctx.getComponent(target, "hp") as number) - 3);
    return true;
  },
};

let state = createSession({ sessionId: "demo" });
state = addEntity(state, { id: "hero", components: { hp: 10 } });
state = addEntity(state, { id: "orc", components: { hp: 8 } });
const engine = createEngine({ ruleset, session: state });

const clientState = structuredClone(engine.getState()); // what a client holds

const res = engine.dispatch({
  intent_id: "req_1",
  type: "ATTACK",
  source: "hero",
  payload: { target: "orc", entropy: { dice: [[14]] } }, // the d20 was rolled elsewhere
});

res.status; // "success"
res.delta;  // [{ op: "add", path: "/history/rolls/-", … }, { op: "replace", path: "/entities/orc/components/hp", value: 5 }]

// Every client applies the same delta and ends up byte-identical to the host:
replayOps(clientState, res.delta);
```

A rejected intent (`RejectionError`, unknown type, unknown source) returns `status: "rejected"`, an empty delta and `meta.code`. State is untouched: each dispatch is a transaction.

## Intents

```ts
{ intent_id: string; type: string; source: EntityId | "system"; payload: unknown }
```

`source` must be `"system"` or an existing entity. Built-in types:

| Type | Payload |
|---|---|
| `NEXT_TURN` | `{}`; advances the turn, rolls the round over, purges expired effects |
| `ADD_ENTITY` | `{ id, kind?, components? }` |
| `REMOVE_ENTITY` | `{ id }`; also removes effects it is the target or source of |
| `SET_COMPONENT` | `{ entity, key, value }` |
| `REGISTER_EFFECT` | `{ id, target, source, name, duration_rounds }` |

Any other type goes to your `Ruleset`. Inside `handle`, `ctx` offers `roll`, `getComponent`, `setComponent`, `addCondition`, `haveCondition`, `log`, plus the raw `ctx.tx` (`add`/`replace`/`remove`) for anything else.

## Dice: the engine never rolls

Randomness is **injected** with the intent, so a physics roller on one client, a server RNG or a Discord bot all produce the same result everywhere.

```ts
ctx.roll("4d6kh3", { dice: [[5, 3, 1, 6]] });   // per-die faces → total 14 (the 1 is dropped)
ctx.roll("1d20", { total: 17 });                // or an authoritative total only
```

Faces are checked against the notation (count, range, and the total when both are given). The full per-die breakdown lands at `/history/rolls/-` so every client can render the same dice. Notation is a strict subset of [rpg-dice-roller](https://dice-roller.github.io/documentation/) syntax: one `XdY` group (faces 1–100: no die above d100), an optional `+N`/`-N`, then optional `khN klN dhN dlN` (e.g. `8d6`, `1d8+3`, `2d20kh1`). For mixed pools like 2d6+1d4, build a plan with `dicePool([{ count: 2, faces: 6 }, { count: 1, faces: 4 }])` and pass it to `ctx.roll` (same limits: count 1–10000, whole-number faces 1–100). Need rolls on the host? `new Prng(seed)` is a seedable generator.

## Determinism guarantees

- Same starting state + same intents + same injected entropy = byte-identical state and deltas.
- No `Math.random`, no `Date.now` anywhere in the package.
- Reducers emit ops directly (no after-the-fact diffing); collections keep insertion order.

## License

MIT.
