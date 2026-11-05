/**
 * Dice notation parser → immutable RollPlan.
 *
 * Supported notation is a strict, deterministic subset of the public
 * rpg-dice-roller syntax, so systems can adopt that library at the boundary
 * later without content changes:
 *
 *   XdY        e.g. 3d6, d20 (implicit 1d20); faces 1–100 (no die above d100)
 *   +N / -N    flat modifiers, immediately after the dice spec
 *   khN / klN  keep highest/lowest N (or dhN / dlN drop highest/lowest)
 *
 *   e.g. "8d6", "2d20kh1", "1d8+3", "4d6dl1"
 *
 * Not supported (subset!): exploding dice, rerolls, fudge dice, mixed dice
 * pools, percentile. Those belong at the orchestrator boundary if ever needed.
 */
import { RejectionError } from "../types.js";

export interface DiceSpec {
  count: number;
  faces: number;
}

export interface RollPlan {
  /** Canonical notation, normalized (e.g. "d20" → "1d20"). */
  notation: string;
  dice: DiceSpec[];
  modifiers: Array<{ op: "add" | "sub"; value: number }>;
  keep?: { op: "kh" | "kl" | "dh" | "dl"; n: number };
}

// Faces take any digit run so oversized dice get the clear "faces out of
// range" rejection below instead of "cannot parse".
const NOTATION =
  /^(\d*)d(\d+)([+-]\d+)?((?:kh|kl|dh|dl)\d+)?$/i;

/** Largest die the engine supports (decision 2026-11-04: nothing above d100). */
const MAX_FACES = 100;
const MAX_COUNT = 10000;
const MAX_MOD = 10_000_000;

/** Shared by `parseNotation` and `dicePool`: whole-number count and faces in range. */
function checkDice(count: number, faces: number): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new RejectionError(
      "bad_notation",
      `dice count out of range: ${count} (must be a whole number from 1 to ${MAX_COUNT})`,
    );
  }
  if (!Number.isInteger(faces) || faces < 1 || faces > MAX_FACES) {
    throw new RejectionError(
      "bad_notation",
      `dice faces out of range: ${faces} (must be a whole number from 1 to ${MAX_FACES})`,
    );
  }
}

export function parseNotation(notation: string): RollPlan {
  const m = NOTATION.exec(notation.trim());
  if (!m) throw new RejectionError("bad_notation", `cannot parse dice notation: ${notation}`);

  const count = m[1] === "" ? 1 : Number(m[1]);
  const faces = Number(m[2]);
  checkDice(count, faces);

  const modifiers: Array<{ op: "add" | "sub"; value: number }> = [];
  if (m[3]) {
    const value = Math.abs(Number(m[3]));
    if (value > MAX_MOD) throw new RejectionError("bad_notation", `modifier out of range: ${m[3]}`);
    modifiers.push({ op: m[3]!.startsWith("-") ? "sub" : "add", value });
  }

  let keep: RollPlan["keep"];
  if (m[4]) {
    const op = m[4].slice(0, 2).toLowerCase() as "kh" | "kl" | "dh" | "dl";
    const n = Number(m[4].slice(2));
    if (n < 1 || n > count) {
      throw new RejectionError("bad_notation", `keep count out of range: ${n}`);
    }
    keep = { op, n };
  }

  const canonical =
    `${count}d${faces}` +
    modifiers.map((mod) => `${mod.op === "add" ? "+" : "-"}${mod.value}`).join("") +
    (keep ? `${keep.op}${keep.n}` : "");

  return { notation: canonical, dice: [{ count, faces }], modifiers, keep };
}

/**
 * A dice pool plan with explicit per-die faces (used by injected roll tables).
 * Each group gets the same checks as `parseNotation`: count 1–10000, faces 1–100.
 */
export function dicePool(
  dice: Array<{ count: number; faces: number }>,
  options: {
    modifiers?: Array<{ op: "add" | "sub"; value: number }>;
    keep?: RollPlan["keep"];
    notation?: string;
  } = {},
): RollPlan {
  for (const d of dice) checkDice(d.count, d.faces);
  const totalDice = dice.reduce((sum, d) => sum + d.count, 0);
  const keep = options.keep;
  if (keep && (keep.n < 1 || keep.n > totalDice)) {
    throw new RejectionError("bad_notation", `keep count out of range for pool: ${keep.n}`);
  }
  const notation =
    options.notation ??
    dice.map((d) => `${d.count}d${d.faces}`).join("+") +
      (options.modifiers ?? [])
        .map((m) => `${m.op === "add" ? "+" : "-"}${m.value}`)
        .join("") +
      (keep ? `${keep.op}${keep.n}` : "");
  return { notation, dice, modifiers: options.modifiers ?? [], keep };
}