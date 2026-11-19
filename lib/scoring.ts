import type { Guest } from "@/lib/store";

/**
 * Deterministic compatibility scoring.
 *
 * This is the part that used to be done by pasting a spreadsheet into an LLM.
 * Doing it in code instead means pairing is instant, reproducible, and
 * reviewable before you commit it — the LLM's job shrinks to *writing* the card
 * for a pair that has already been chosen (see lib/cards.ts).
 *
 * Nothing here invents facts. Every signal comes from a form answer.
 */

export type Gender = "man" | "woman" | "nonbinary" | "unknown";

/** Map whatever the form captured onto a small set of tokens. */
export function normalizeGender(raw?: string): Gender {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (/\b(non[\s-]?binary|nb|enby|genderqueer)\b/.test(s)) return "nonbinary";
  // Plurals matter: a "who are you open to meeting?" question offers "Men" and
  // "Women", not "man" and "woman". Missing those made openTo parse to nothing
  // for every guest, which silently disables the orientation constraint.
  // Woman is tested first so "women" can never be read as "men" — \b prevents
  // that anyway, but the ordering makes it true by construction rather than by
  // a regex subtlety.
  if (/\b(woman|women|female|females|f|girl|girls|lady|ladies)\b/.test(s))
    return "woman";
  if (/\b(man|men|male|males|m|guy|guys|gentleman|gentlemen)\b/.test(s))
    return "man";
  return "unknown";
}

const ALL: Gender[] = ["man", "woman", "nonbinary"];

/** Which genders a guest is open to meeting. Empty set means "no answer". */
export function normalizeOpenTo(raw?: string[] | string): Set<Gender> {
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out = new Set<Gender>();
  for (const item of items) {
    const s = item.trim().toLowerCase();
    if (!s) continue;
    // "Open to more than one gender" names no gender token, so without this it
    // would parse to nothing and be read as "didn't answer" — penalising the
    // most flexible guests and matching them last, which is backwards.
    if (
      /\b(everyone|everybody|any|all|anyone|no preference)\b/.test(s) ||
      /more than one|multiple|both|any gender|all genders/.test(s)
    ) {
      ALL.forEach((g) => out.add(g));
      continue;
    }
    // A multi-select answer may arrive as one comma-joined string.
    for (const part of s.split(/[,/&]|\band\b/)) {
      const g = normalizeGender(part);
      if (g !== "unknown") out.add(g);
    }
  }
  return out;
}

export type Eligibility =
  | { ok: true; confident: boolean }
  | { ok: false; reason: "orientation" | "repeat" | "self" | "inactive" };

/**
 * Can these two be introduced at all?
 *
 * Orientation is enforced whenever both sides answered. When either side left
 * it blank we allow the pair but mark it `confident: false`, so the solver
 * prefers known-good pairings and only falls back on unknowns to avoid leaving
 * someone with nobody.
 */
export function eligible(
  a: Guest,
  b: Guest,
  history: Set<string>
): Eligibility {
  const ea = a.email.toLowerCase();
  const eb = b.email.toLowerCase();
  if (ea === eb) return { ok: false, reason: "self" };
  if (!a.active || !b.active) return { ok: false, reason: "inactive" };
  if (history.has([ea, eb].sort().join("|")))
    return { ok: false, reason: "repeat" };

  const ga = normalizeGender(a.gender);
  const gb = normalizeGender(b.gender);
  const oa = normalizeOpenTo(a.openTo);
  const ob = normalizeOpenTo(b.openTo);

  const aKnows = ga !== "unknown" && oa.size > 0;
  const bKnows = gb !== "unknown" && ob.size > 0;

  if (aKnows && bKnows) {
    const mutual = oa.has(gb) && ob.has(ga);
    if (!mutual) return { ok: false, reason: "orientation" };
    return { ok: true, confident: true };
  }

  // One or both didn't answer — allowed, but deprioritized.
  return { ok: true, confident: false };
}

export type Score = {
  /** 0–100, the number that lands on the card as `compatibility`. */
  value: number;
  /** Choice questions where they answered the same — feeds commonAttributes. */
  shared: { key: string; answer: string }[];
  /** How many choice questions they both answered, for context. */
  compared: number;
};

const LONG_FIELDS: (keyof Guest)[] = [
  "unexpectedFlex",
  "canTeach",
  "freeMonth",
  "howToSpot",
];

function filledLongAnswers(g: Guest): number {
  return LONG_FIELDS.filter((f) => {
    const v = g[f];
    return typeof v === "string" && v.trim().length > 2;
  }).length;
}

/**
 * How well two guests fit, from their answers alone.
 *
 *   50  floor — any eligible pair is a plausible introduction
 *   +32 shared multiple-choice answers (the dominant signal)
 *   +12 age proximity, tapering to zero at a 15-year gap
 *   +6  both wrote real long-form answers (more for the card to work with)
 *
 * Pairs whose orientation data is incomplete take a flat penalty so the solver
 * only reaches for them when it has to.
 */
export function score(a: Guest, b: Guest, confident = true): Score {
  const keys = Object.keys(a.choices).filter((key) => key in b.choices);
  const shared: { key: string; answer: string }[] = [];
  for (const key of keys) {
    const va = (a.choices[key] ?? "").trim().toLowerCase();
    const vb = (b.choices[key] ?? "").trim().toLowerCase();
    if (va && va === vb) shared.push({ key, answer: a.choices[key] });
  }

  const overlap = keys.length ? shared.length / keys.length : 0;

  let ageCloseness = 0.5; // neutral when an age is missing
  if (typeof a.age === "number" && typeof b.age === "number") {
    ageCloseness = 1 - Math.min(Math.abs(a.age - b.age) / 15, 1);
  }

  const depth = Math.min(filledLongAnswers(a), filledLongAnswers(b)) / 4;

  let value = 50 + 32 * overlap + 12 * ageCloseness + 6 * depth;
  if (!confident) value -= 18;

  return {
    value: Math.max(0, Math.min(100, Math.round(value))),
    shared,
    compared: keys.length,
  };
}

/**
 * The full pairwise table for a roster: eligibility plus score, once, so the
 * solver can read it many times without recomputing.
 */
export type Matrix = {
  ids: string[];
  /** `weight[i][j]` is the score, or `null` when the pair is ineligible. */
  weight: (number | null)[][];
  /** Parallel to `weight` — the shared answers behind each score. */
  detail: (Score | null)[][];
};

export function buildMatrix(guests: Guest[], history: Set<string>): Matrix {
  const ids = guests.map((g) => g.email.toLowerCase());
  const n = guests.length;
  const weight: (number | null)[][] = Array.from({ length: n }, () =>
    Array<number | null>(n).fill(null)
  );
  const detail: (Score | null)[][] = Array.from({ length: n }, () =>
    Array<Score | null>(n).fill(null)
  );

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const e = eligible(guests[i], guests[j], history);
      if (!e.ok) continue;
      const s = score(guests[i], guests[j], e.confident);
      weight[i][j] = weight[j][i] = s.value;
      detail[i][j] = detail[j][i] = s;
    }
  }

  return { ids, weight, detail };
}
