/**
 * Entropy injection and roll resolution.
 *
 * The engine never rolls dice: the authoritative side injects either the
 * per-die faces (physics roller) and/or the total (server RNG), and this
 * module validates strict consistency before any math proceeds.
 */
import { RejectionError } from "../types.js";
import type { DieRoll, RollResult } from "../types.js";
import type { RollPlan } from "./notation.js";

export interface EntropyInput {
  /** Per-die faces, one array per plan slot, e.g. [[5,3,1,6,4,2,4,3]]. */
  dice?: number[][];
  /** Authoritative total. When dice are also given it must match exactly. */
  total?: number;
}

/** Indices (into the flat face array) that survive keep/drop rules. */
export function keepIndices(plan: RollPlan, faces: readonly number[]): Set<number> {
  if (!plan.keep) return new Set(faces.map((_, i) => i));
  const { op, n } = plan.keep;
  // Sort is stable (ES2019+): equal faces preserve original index order.
  const ranked = faces.map((face, index) => ({ face, index }));
  if (op === "kh" || op === "dh") ranked.sort((a, b) => b.face - a.face);
  else ranked.sort((a, b) => a.face - b.face);

  const kept = new Set<number>();
  const total = faces.length;
  switch (op) {
    case "kh":
      for (let i = 0; i < n && i < total; i++) kept.add(ranked[i]!.index);
      break;
    case "kl":
      for (let i = 0; i < n && i < total; i++) kept.add(ranked[i]!.index);
      break;
    case "dh":
      for (let i = n; i < total; i++) kept.add(ranked[i]!.index);
      break;
    case "dl":
      for (let i = n; i < total; i++) kept.add(ranked[i]!.index);
      break;
  }
  return kept;
}

export function applyModifiers(total: number, modifiers: RollPlan["modifiers"]): number {
  let t = total;
  for (const m of modifiers) t += m.op === "add" ? m.value : -m.value;
  return t;
}

/** Validate dice: integer faces within [1, faces] per slot. Throws otherwise. */
export function validateDice(plan: RollPlan, dice: number[][]): void {
  for (let i = 0; i < plan.dice.length; i++) {
    const spec = plan.dice[i]!;
    const slot = dice[i];
    if (!slot || slot.length !== spec.count) {
      throw new RejectionError(
        "entropy_mismatch",
        `roll ${plan.notation}: expected ${spec.count} dice in slot ${i}, got ${slot?.length ?? 0}`,
      );
    }
    for (const face of slot) {
      if (!Number.isInteger(face) || face < 1 || face > spec.faces) {
        throw new RejectionError(
          "entropy_mismatch",
          `roll ${plan.notation}: die face out of range: ${face}`,
        );
      }
    }
  }
}

/** Resolve a plan against injected entropy → full per-die RollResult. */
export function resolveRoll(plan: RollPlan, entropy: EntropyInput): RollResult {
  if (!entropy) throw new RejectionError("entropy_required", `roll ${plan.notation}: no entropy injected`);
  const hasDice = entropy.dice !== undefined;
  const hasTotal = entropy.total !== undefined;
  if (!hasDice && !hasTotal) {
    throw new RejectionError("entropy_required", `roll ${plan.notation}: no entropy injected`);
  }

  const dice: DieRoll[] = [];
  let total: number;

  if (hasDice) {
    validateDice(plan, entropy.dice!);
    const faces = entropy.dice!.flat();
    const kept = keepIndices(plan, faces);
    let slotStart = 0;
    for (const spec of plan.dice) {
      for (let k = 0; k < spec.count; k++) {
        const face = faces[slotStart + k]!;
        dice.push({ die: `d${spec.faces}`, face, value: face, kept: kept.has(slotStart + k) });
      }
      slotStart += spec.count;
    }
    const keptValues = dice.filter((d) => d.kept).map((d) => d.value);
    total = applyModifiers(
      keptValues.reduce((sum, v) => sum + v, 0),
      plan.modifiers,
    );

    if (hasTotal && entropy.total !== total) {
      throw new RejectionError(
        "entropy_mismatch",
        `roll ${plan.notation}: injected total ${entropy.total} != computed ${total}`,
      );
    }
  } else {
    // Totals-only injection (server RNG): no per-die faces to replay.
    total = entropy.total!;
    if (!Number.isFinite(total)) {
      throw new RejectionError("entropy_mismatch", `roll ${plan.notation}: non-finite total`);
    }
  }

  return { plan: plan.notation, dice, modifiers: [...plan.modifiers], total };
}