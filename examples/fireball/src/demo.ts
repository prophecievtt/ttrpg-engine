/**
 * The fireball demo: the ember encounter run end to end, printed in the
 * DESIGN_SYSTEM §4 log style. Output is deterministic (no colour, stable field
 * order), so it doubles as a golden file: see expected.log.
 */
import { BLAST_POINT, buildEmberSession, GOBLIN_1, GOBLIN_2, WIZARD } from "@ttrpg-engine/example-ember";
import type { Intent, Response, RollResult, SessionState } from "@ttrpg-engine/interactions";
import type { CastResult } from "@ttrpg-engine/orchestrator";

import { createEmberHost } from "./host.js";

/** The physics roller's result for 8d6 (ARCHITECTURE §6 contract 3): total 28. */
export const DEMO_DICE = [[5, 3, 1, 6, 4, 2, 4, 3]];
/** Saving-throw totals the goblins' clients rolled: goblin-1 fails DC 15, goblin-2 passes. */
export const DEMO_SAVES = { [GOBLIN_1]: 12, [GOBLIN_2]: 19 };

export function runFireballDemo(): string {
  const { registry } = createEmberHost({ seed: "ember-demo" });
  const pipeline = registry.open("ember-session-1", buildEmberSession());
  const lines: string[] = [];

  const before = pipeline.engine.getState();
  const cast = pipeline.castSpell({
    intent_id: "req_88a9f",
    source: WIZARD,
    spell_id: "fireball",
    targeting: { mode: "area", at: BLAST_POINT },
    entropy: { damage: { dice: DEMO_DICE }, target_saves: DEMO_SAVES },
  });
  lines.push(...formatCast(cast, "fireball", WIZARD, before, pipeline.engine.getState()));

  for (let i = 1; i <= 3; i++) {
    const prev = pipeline.engine.getState();
    const intent: Intent = { intent_id: `req_turn_${i}`, type: "NEXT_TURN", source: "system", payload: {} };
    lines.push(...formatTurn(intent, pipeline.engine.dispatch(intent), prev, pipeline.engine.getState()));
  }
  return lines.join("\n") + "\n";
}

export function formatCast(
  result: CastResult,
  spellId: string,
  source: string,
  before: SessionState,
  after: SessionState,
): string[] {
  const id = result.response.response_to;
  const lines = [`[${id}] CAST_SPELL ${spellId} by ${source}`];
  if (result.response.status !== "success") {
    lines.push(`  ${result.response.status}: ${String(result.response.meta?.code ?? "unknown")}`);
    return lines;
  }

  const targets = result.targets.map((t) => `${t} (${describeChange(before, after, t)})`);
  if (targets.length === 0) lines.push("  targets: none");
  targets.forEach((t, i) => lines.push(`${i === 0 ? "  targets: " : "           "}${t}`));

  const saves = (result.intent?.payload as { injected_entropy?: { target_saves?: Record<string, number> } })
    ?.injected_entropy?.target_saves;
  if (saves && Object.keys(saves).length > 0) {
    lines.push(`  saves: ${Object.entries(saves).map(([t, v]) => `${t} ${v}`).join(", ")}`);
  }

  for (const op of result.response.delta) {
    if (op.path !== "/history/rolls/-") continue;
    const roll = op.value as RollResult;
    lines.push(`  roll ${roll.plan} [${roll.dice.map((d) => d.face).join(",")}] = ${roll.total}`);
  }

  const bytes = new TextEncoder().encode(JSON.stringify(result.response.delta)).length;
  lines.push(`  delta ops: ${result.response.delta.length} (${bytes} bytes JSON Patch)`);

  // Resources the caster spent: any numeric component other than hp that changed.
  const was = before.entities[source]?.components ?? {};
  const now = after.entities[source]?.components ?? {};
  const label = typeof now.template === "string" ? now.template : source;
  for (const [key, value] of Object.entries(now)) {
    if (key !== "hp" && typeof value === "number" && was[key] !== value) {
      lines.push(`  ${label} ${key}: ${String(was[key])} → ${value}`);
    }
  }
  return lines;
}

export function formatTurn(intent: Intent, response: Response, before: SessionState, after: SessionState): string[] {
  const lines = [`[${intent.intent_id}] ${intent.type}`];
  if (response.status !== "success") {
    lines.push(`  ${response.status}: ${String(response.meta?.code ?? "unknown")}`);
    return lines;
  }
  const actor = after.initiative_roster[after.turn_index]?.id ?? "nobody";
  lines.push(`  round ${after.round}, turn ${after.turn_index}: ${actor}`);
  const left = new Set(after.effects.map((e) => e.id));
  for (const effect of before.effects) {
    if (!left.has(effect.id)) lines.push(`  effect expired: ${effect.name} on ${effect.target}`);
  }
  return lines;
}

function describeChange(before: SessionState, after: SessionState, id: string): string {
  const was = before.entities[id]?.components ?? {};
  const now = after.entities[id]?.components ?? {};
  const parts = [`hp ${String(was.hp)} → ${String(now.hp)}`];
  const had = new Set(asStrings(was.conditions));
  parts.push(...asStrings(now.conditions).filter((c) => !had.has(c)));
  return parts.join(", ");
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
