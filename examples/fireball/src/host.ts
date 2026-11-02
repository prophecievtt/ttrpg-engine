/**
 * Host wiring for the ember system: a validated compendium, the ember ruleset
 * and a session registry with seeded server entropy. server.js and the demo
 * both build on this, so the wire format below is tested here, not in the server.
 */
import {
  createEmberRuleset,
  emberEntries,
  emberSchemas,
  type EmberSpell,
} from "@ttrpg-engine/example-ember";
import type { Intent, Response } from "@ttrpg-engine/interactions";
import {
  createSessionRegistry,
  seededEntropy,
  type InjectedEntropy,
  type SessionRegistry,
  type Targeting,
} from "@ttrpg-engine/orchestrator";
import { createCompendium, type CompendiumStore } from "@ttrpg-engine/rules";

export interface EmberHost {
  readonly spells: CompendiumStore;
  readonly registry: SessionRegistry;
}

export interface EmberHostOptions {
  /** Seed for server-side dice; each session gets `${seed}:${sessionId}`. Default "ember". */
  readonly seed?: string | number;
}

export function createEmberHost(options: EmberHostOptions = {}): EmberHost {
  const spells = createCompendium();
  for (const schema of emberSchemas) spells.registerSchema(schema);
  spells.register(emberEntries);
  const seed = options.seed ?? "ember";
  const registry = createSessionRegistry({
    ruleset: createEmberRuleset((id) => spells.get("spell", id) as EmberSpell | undefined),
    spells,
    entropy: (sessionId) => seededEntropy(`${seed}:${sessionId}`),
  });
  return { spells, registry };
}

/**
 * Wire payload for a CAST_SPELL intent sent by a client. Give `at` (and
 * `direction` for cones) to target an area, or `targets` for pre-picked ids.
 * Anything not in `injected_entropy` is rolled by the host's seeded entropy.
 */
export interface CastPayload {
  readonly spell_id: string;
  readonly at?: { x: number; y: number; z?: number };
  readonly direction?: { x: number; y: number; z?: number };
  readonly targets?: readonly string[];
  readonly injected_entropy?: InjectedEntropy;
}

/**
 * Route one client intent into a session: CAST_SPELL goes through the
 * orchestrator pipeline (rules → targets → entropy → dispatch), everything
 * else is dispatched to the engine as is.
 */
export function handleIntent(registry: SessionRegistry, sessionId: string, intent: Intent): Response {
  if (intent?.type !== "CAST_SPELL") return registry.dispatch(sessionId, intent);
  const pipeline = registry.get(sessionId);
  if (!pipeline) return registry.dispatch(sessionId, intent); // rejects unknown_session
  const payload = (intent.payload ?? {}) as Partial<CastPayload>;
  if (typeof payload.spell_id !== "string") return reject(intent, "bad_payload", "spell_id must be a string");
  const targeting = toTargeting(payload);
  if (typeof targeting === "string") return reject(intent, "bad_targeting", targeting);
  return pipeline.castSpell({
    intent_id: intent.intent_id,
    source: intent.source,
    spell_id: payload.spell_id,
    targeting,
    entropy: payload.injected_entropy,
  }).response;
}

function toTargeting(p: Partial<CastPayload>): Targeting | string {
  if (p.at !== undefined) {
    const at = toVec(p.at);
    if (!at) return "at must be {x, y, z?} with finite numbers";
    if (p.direction === undefined) return { mode: "area", at };
    const direction = toVec(p.direction);
    if (!direction) return "direction must be {x, y, z?} with finite numbers";
    return { mode: "area", at, direction };
  }
  if (Array.isArray(p.targets) && p.targets.every((t) => typeof t === "string")) {
    return { mode: "ids", ids: p.targets };
  }
  return "give either at (an area) or targets (entity ids)";
}

function toVec(v: unknown): { x: number; y: number; z: number } | undefined {
  if (!v || typeof v !== "object") return undefined;
  const { x, y, z = 0 } = v as Record<string, unknown>;
  return isFiniteNum(x) && isFiniteNum(y) && isFiniteNum(z) ? { x, y, z } : undefined;
}

function reject(intent: Intent, code: string, detail: string): Response {
  return { response_to: intent.intent_id, status: "rejected", delta: [], meta: { code, detail } };
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
