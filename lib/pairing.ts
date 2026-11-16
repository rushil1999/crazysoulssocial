import type { Guest } from "@/lib/store";
import { buildMatrix, type Matrix, type Score } from "@/lib/scoring";

/**
 * Pairing solver.
 *
 * We need a maximum-weight matching on a *general* graph (not bipartite — a
 * mixer can contain same-gender interest, so the roster doesn't split into two
 * clean sides). The exact algorithm for that is Edmonds' blossom, which is
 * several hundred lines and easy to get subtly wrong.
 *
 * For a 20–60 person room a randomized greedy with local search gets the same
 * answer in practice: it runs hundreds of restarts in a few milliseconds, then
 * improves each one until no single swap helps. The objective is lexicographic
 * — first pair as many people as possible, then maximize total compatibility —
 * because leaving a guest with nobody is far worse than a pairing two points
 * below optimal.
 *
 * The RNG is seeded, so previewing a round and then committing it produces the
 * same pairings.
 */

export type Pair = {
  a: string;
  b: string;
  score: number;
  shared: { key: string; answer: string }[];
};

export type Solution = {
  pairs: Pair[];
  /** Emails nobody could be found for this round. */
  unmatched: string[];
  /** Sum of pair scores — only meaningful next to `pairs.length`. */
  total: number;
};

/** Small deterministic PRNG (mulberry32) so runs are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `null` means the pairing isn't allowed at all. */
function w(m: Matrix, i: number, j: number): number | null {
  return m.weight[i]?.[j] ?? null;
}

/** Objective: cardinality dominates, total score breaks ties. */
function objective(partner: Int32Array, m: Matrix): number {
  let pairs = 0;
  let total = 0;
  for (let i = 0; i < partner.length; i++) {
    const j = partner[i];
    if (j > i) {
      pairs++;
      total += w(m, i, j) ?? 0;
    }
  }
  return pairs * 1_000_000 + total;
}

/** One greedy pass in a random order, each person taking their best free option. */
function greedy(m: Matrix, next: () => number): Int32Array {
  const n = m.ids.length;
  const partner = new Int32Array(n).fill(-1);

  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  for (const i of order) {
    if (partner[i] !== -1) continue;
    let best = -1;
    let bestScore = -1;
    for (let j = 0; j < n; j++) {
      if (j === i || partner[j] !== -1) continue;
      const weight = w(m, i, j);
      if (weight === null) continue;
      // Tiny jitter breaks ties differently across restarts.
      const jittered = weight + next() * 0.5;
      if (jittered > bestScore) {
        bestScore = jittered;
        best = j;
      }
    }
    if (best !== -1) {
      partner[i] = best;
      partner[best] = i;
    }
  }
  return partner;
}

/**
 * Try to pair up leftovers by breaking one existing pair: if x and y are both
 * unmatched and some pair (a,b) can be split so that (a,x) and (b,y) are both
 * legal, we trade one pair for two.
 */
function augment(partner: Int32Array, m: Matrix): boolean {
  const n = partner.length;
  const free: number[] = [];
  for (let i = 0; i < n; i++) if (partner[i] === -1) free.push(i);
  if (free.length < 2) return false;

  for (let fi = 0; fi < free.length; fi++) {
    for (let fj = fi + 1; fj < free.length; fj++) {
      const x = free[fi];
      const y = free[fj];
      // Easiest case: they can simply take each other.
      if (w(m, x, y) !== null) {
        partner[x] = y;
        partner[y] = x;
        return true;
      }
      for (let a = 0; a < n; a++) {
        const b = partner[a];
        if (b <= a) continue;
        const ax = w(m, a, x);
        const by = w(m, b, y);
        if (ax !== null && by !== null) {
          partner[a] = x;
          partner[x] = a;
          partner[b] = y;
          partner[y] = b;
          return true;
        }
        const ay = w(m, a, y);
        const bx = w(m, b, x);
        if (ay !== null && bx !== null) {
          partner[a] = y;
          partner[y] = a;
          partner[b] = x;
          partner[x] = b;
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Swap partners between two pairs whenever it raises the objective.
 *
 * Note the `break` after each successful swap: `b` is read once per outer
 * iteration, so once a swap reassigns `partner[a]` that cached value is stale
 * and reusing it would corrupt the matching (it writes through `partner[b]`
 * for a `b` that is no longer a's partner). Breaking out re-reads it.
 */
function twoOpt(partner: Int32Array, m: Matrix): void {
  const n = partner.length;
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let a = 0; a < n; a++) {
      const b = partner[a];
      if (b <= a) continue;
      for (let c = a + 1; c < n; c++) {
        const d = partner[c];
        if (d <= c || c === b || d === a) continue;

        const current = (w(m, a, b) ?? 0) + (w(m, c, d) ?? 0);

        const ac = w(m, a, c);
        const bd = w(m, b, d);
        if (ac !== null && bd !== null && ac + bd > current + 1e-9) {
          partner[a] = c;
          partner[c] = a;
          partner[b] = d;
          partner[d] = b;
          improved = true;
          break;
        }

        const ad = w(m, a, d);
        const bc = w(m, b, c);
        if (ad !== null && bc !== null && ad + bc > current + 1e-9) {
          partner[a] = d;
          partner[d] = a;
          partner[b] = c;
          partner[c] = b;
          improved = true;
          break;
        }
      }
    }
  }
}

function toSolution(partner: Int32Array, m: Matrix): Solution {
  const pairs: Pair[] = [];
  const unmatched: string[] = [];
  let total = 0;
  for (let i = 0; i < partner.length; i++) {
    const j = partner[i];
    if (j === -1) {
      unmatched.push(m.ids[i]);
    } else if (j > i) {
      const detail = m.detail[i][j] as Score | null;
      const value = w(m, i, j) ?? 0;
      pairs.push({
        a: m.ids[i],
        b: m.ids[j],
        score: value,
        shared: detail?.shared ?? [],
      });
      total += value;
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  return { pairs, unmatched, total };
}

/**
 * Pair up a roster.
 *
 * @param guests   everyone eligible for this round
 * @param history  every pair already made at this event (order-independent keys)
 * @param seed     fixed by default so preview and commit agree
 */
export function solve(
  guests: Guest[],
  history: Set<string>,
  seed = 20261122,
  restarts = 400
): Solution {
  if (guests.length < 2) {
    return {
      pairs: [],
      unmatched: guests.map((g) => g.email.toLowerCase()),
      total: 0,
    };
  }

  const m = buildMatrix(guests, history);
  const next = rng(seed);

  let best: Int32Array | null = null;
  let bestObjective = -1;

  for (let r = 0; r < restarts; r++) {
    const partner = greedy(m, next);
    let guard = 0;
    while (augment(partner, m) && guard++ < guests.length) {
      /* keep augmenting while leftovers can be absorbed */
    }
    twoOpt(partner, m);
    const value = objective(partner, m);
    if (value > bestObjective) {
      bestObjective = value;
      best = Int32Array.from(partner);
    }
  }

  return toSolution(best!, m);
}

/**
 * Find the best partner for one person out of a candidate pool — the
 * late-arrival path. Returns null when nobody in the pool is eligible.
 */
export function bestPartner(
  guest: Guest,
  pool: Guest[],
  history: Set<string>
): { partner: Guest; score: number; shared: { key: string; answer: string }[] } | null {
  const candidates = pool.filter(
    (p) => p.email.toLowerCase() !== guest.email.toLowerCase()
  );
  if (!candidates.length) return null;

  const m = buildMatrix([guest, ...candidates], history);
  let best = -1;
  let bestScore = -1;
  for (let j = 1; j < m.ids.length; j++) {
    const weight = w(m, 0, j);
    if (weight !== null && weight > bestScore) {
      bestScore = weight;
      best = j;
    }
  }
  if (best === -1) return null;
  return {
    partner: candidates[best - 1],
    score: bestScore,
    shared: m.detail[0][best]?.shared ?? [],
  };
}
