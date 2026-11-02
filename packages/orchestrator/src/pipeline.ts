/**
 * The fireball-style pipeline (PRD §6.3):
 *
 *   rulesQuery → targetSelect (spatial area | pre-picked ids) → entropyBind → dispatch
 *
 * The orchestrator is the only package that knows the others. It never makes
 * its own randomness: dice arrive injected (a physics roller on the client) or
 * come from an `EntropyProvider` the host supplies (e.g. a seeded server RNG).
 */
import {
  parseNotation,
  Prng,
  type Engine,
  type EntropyInput,
  type Intent,
  type Response,
  type SessionState,
} from "@ttrpg-engine/interactions";
import type { CompendiumEntry } from "@ttrpg-engine/rules";
import {
  cone,
  cube,
  referenceBackend,
  sphere,
  type Area,
  type Obstacle,
  type SpatialBackend,
  type Token,
  type Vec3,
} from "@ttrpg-engine/spatial";

/** The spell fields the pipeline reads. Everything else is the ruleset's business. */
export interface SpellShape {
  readonly area?: { readonly shape: string; readonly size: number };
  readonly damage?: { readonly dice: string };
  readonly save?: { readonly ability: string };
}

/** Where to read spells from: a `CompendiumStore` satisfies this. */
export interface SpellSource {
  get(type: string, id: string): CompendiumEntry | undefined;
}

export type Targeting =
  /** Targets already chosen (grid cell selection, theater of the mind). */
  | { readonly mode: "ids"; readonly ids: readonly string[] }
  /**
   * Everything inside the spell's area placed at `at`. Cones also need a
   * `direction` (apex → base). `tokens` default to every entity with a
   * `position` component; `obstacles` give cover via line of sight from `at`.
   */
  | {
      readonly mode: "area";
      readonly at: Vec3;
      readonly direction?: Vec3;
      readonly tokens?: readonly Token[];
      readonly obstacles?: readonly Obstacle[];
    };

/** Randomness already rolled elsewhere (e.g. 3D dice on the caster's client). */
export interface InjectedEntropy {
  readonly damage?: EntropyInput;
  /** Saving-throw totals per target id. */
  readonly target_saves?: Readonly<Record<string, number>>;
}

/** Host-supplied randomness for whatever was not injected. */
export interface EntropyProvider {
  /** Per-die faces for a notation, one array per dice group. */
  dice(notation: string): number[][];
  /** A saving-throw total for `target` (d20 + bonus). */
  save(target: string, ability: string, bonus: number): number;
}

export interface CastRequest {
  readonly intent_id: string;
  readonly source: string;
  readonly spell_id: string;
  readonly targeting: Targeting;
  readonly entropy?: InjectedEntropy;
}

export interface CastResult {
  /** The exact intent dispatched (absent when the pipeline refused before dispatch). */
  readonly intent?: Intent;
  readonly targets: readonly string[];
  readonly response: Response;
}

export interface PipelineOptions {
  readonly engine: Engine;
  readonly spells: SpellSource;
  readonly spatial?: SpatialBackend;
  readonly entropy?: EntropyProvider;
  /** Compendium type holding spells. Default "spell". */
  readonly spellType?: string;
}

export interface Pipeline {
  readonly engine: Engine;
  castSpell(request: CastRequest): CastResult;
}

/** A seeded provider: same seed → same rolls. Saves are d20 + bonus. */
export function seededEntropy(seed: number | string): EntropyProvider {
  const rng = new Prng(seed);
  return {
    dice(notation) {
      return parseNotation(notation).dice.map((d) => Array.from({ length: d.count }, () => rng.die(d.faces)));
    },
    save(_target, _ability, bonus) {
      return rng.die(20) + bonus;
    },
  };
}

/** Tokens for every entity with a `position` ({x, y, z}) component, in insertion order. */
export function tokensFromState(state: SessionState): Token[] {
  const tokens: Token[] = [];
  for (const entity of Object.values(state.entities)) {
    const p = entity.components.position as Partial<Vec3> | undefined;
    if (!p || !isFiniteNum(p.x) || !isFiniteNum(p.y)) continue;
    const radius = entity.components.radius;
    tokens.push({
      id: entity.id,
      position: { x: p.x, y: p.y, z: isFiniteNum(p.z) ? p.z : 0 },
      radius: isFiniteNum(radius) && radius > 0 ? radius : 0,
    });
  }
  return tokens;
}

/** Build the spatial template for a spell's area placed at `at`. */
export function areaFor(spell: SpellShape, at: Vec3, direction?: Vec3): Area | string {
  const area = spell.area;
  if (!area || !isFiniteNum(area.size) || area.size < 0) return "no_area";
  switch (area.shape) {
    case "sphere":
      return sphere(at, area.size);
    case "cube":
      return cube(at, area.size);
    case "cone": {
      if (!direction) return "cone_needs_direction";
      const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
      if (!(len > 0) || !Number.isFinite(len)) return "cone_needs_direction";
      const k = area.size / len;
      // 5e-style cone: as wide as it is long → tan(half-angle) = 0.5.
      return cone(at, { x: direction.x * k, y: direction.y * k, z: direction.z * k }, 0.5);
    }
    default:
      return "unsupported_area";
  }
}

export function createPipeline(options: PipelineOptions): Pipeline {
  const { engine, spells } = options;
  const spatial = options.spatial ?? referenceBackend;
  const spellType = options.spellType ?? "spell";

  function castSpell(request: CastRequest): CastResult {
    // 1. Rules query.
    const spell = spells.get(spellType, request.spell_id) as (CompendiumEntry & SpellShape) | undefined;
    if (!spell) return refuse(request, "unknown_spell", `no ${spellType}: ${request.spell_id}`);

    // 2. Target selection.
    const state = engine.getState();
    let targets: string[];
    const t = request.targeting;
    if (t.mode === "ids") {
      targets = [...t.ids];
    } else {
      const area = areaFor(spell, t.at, t.direction);
      if (typeof area === "string") return refuse(request, area);
      targets = spatial.selectTargets(area, t.tokens ?? tokensFromState(state), {
        obstacles: t.obstacles,
        origin: t.at,
      });
    }

    // 3. Entropy binding: injected values win; the provider fills the gaps.
    const injected = request.entropy ?? {};
    let damage: (EntropyInput & { roll: string }) | undefined;
    if (spell.damage) {
      const roll = spell.damage.dice;
      if (injected.damage) damage = { ...injected.damage, roll };
      else if (options.entropy) damage = { roll, dice: options.entropy.dice(roll) };
      else return refuse(request, "entropy_required", `no dice for ${roll}`);
    }
    const target_saves: Record<string, number> = {};
    if (spell.save) {
      const ability = spell.save.ability;
      for (const id of targets) {
        const given = injected.target_saves?.[id];
        if (given !== undefined) target_saves[id] = given;
        else if (options.entropy) target_saves[id] = options.entropy.save(id, ability, saveBonus(state, id, ability));
        else return refuse(request, "entropy_required", `no save for ${id}`);
      }
    }

    // 4. Dispatch.
    const intent: Intent = {
      intent_id: request.intent_id,
      type: "CAST_SPELL",
      source: request.source,
      payload: {
        spell_id: request.spell_id,
        targets,
        injected_entropy: damage ? { damage, target_saves } : { target_saves },
      },
    };
    return { intent, targets, response: engine.dispatch(intent) };
  }

  return { engine, castSpell };
}

function saveBonus(state: SessionState, id: string, ability: string): number {
  const saves = state.entities[id]?.components.saves as Record<string, unknown> | undefined;
  const bonus = saves?.[ability];
  return isFiniteNum(bonus) ? bonus : 0;
}

function refuse(request: CastRequest, code: string, detail?: string): CastResult {
  return {
    targets: [],
    response: {
      response_to: typeof request.intent_id === "string" ? request.intent_id : "",
      status: "rejected",
      delta: [],
      meta: detail ? { code, detail } : { code },
    },
  };
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
