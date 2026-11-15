/**
 * Dry-run the whole night without a venue, a guest, or a redeploy.
 *
 *   npx tsx scripts/simulate.ts [guestCount] [rounds]
 *
 * Builds a synthetic roster, runs the real scoring and pairing code over it,
 * drips in late arrivals between rounds, and then checks the things that would
 * actually ruin an evening: somebody matched to the same person twice, somebody
 * matched to themselves, an orientation mismatch, or a guest left with nobody.
 *
 * This runs the production solver, not a copy of it. If this passes, the
 * engine is sound; what's left to go wrong on the night is network and nerves.
 */

import type { Guest } from "../lib/store";
import { pairKey } from "../lib/store";
import { solve, bestPartner } from "../lib/pairing";
import { eligible, normalizeGender, normalizeOpenTo } from "../lib/scoring";

const COUNT = Number(process.argv[2] ?? 30);
const ROUNDS = Number(process.argv[3] ?? 3);

// Deterministic PRNG so a failure is reproducible.
let seed = 42;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function pick<T>(xs: T[]): T {
  return xs[Math.floor(rand() * xs.length)];
}

const QUESTIONS: Record<string, string[]> = {
  "natural rhythm": ["host", "observer", "connector", "instigator"],
  "travel vs work": ["six months off", "the promotion"],
  "valued compliment": ["you make people feel seen", "you're the funniest", "you're fearless"],
  "ideal dinner": ["six strangers", "two close friends", "one person, four hours"],
  "difficult choice": ["always early", "always late"],
  "reveals more": ["playlist", "search history", "camera roll"],
};

const FLEX = ["Can name any song in two seconds", "Competitive pierogi eater", "Taught myself to juggle", ""];
const TEACH = ["How to order wine badly but confidently", "Basic knife skills", "Reading a room", ""];
const MONTH = ["Build a synth", "Learn to surf", "Read every book I own", ""];
const SPOT = ["Green jacket, near the bar", "Tallest person there", "Red lipstick, by the window", ""];

function makeGuest(i: number, arrivedAt: number): Guest {
  const genderRoll = rand();
  const gender = genderRoll < 0.46 ? "Man" : genderRoll < 0.94 ? "Woman" : "Non-binary";
  // Mostly straight, some not, and ~8% leave it blank.
  const orientRoll = rand();
  let openTo: string[] | undefined;
  if (orientRoll < 0.08) openTo = undefined;
  else if (orientRoll < 0.78) openTo = [gender === "Man" ? "Women" : "Men"];
  else if (orientRoll < 0.9) openTo = ["Everyone"];
  else openTo = [gender === "Man" ? "Men" : "Women"];

  const choices: Record<string, string> = {};
  for (const [q, options] of Object.entries(QUESTIONS)) {
    if (rand() > 0.07) choices[q] = pick(options);
  }

  return {
    email: `guest${i}@example.com`,
    name: `Guest${i}`,
    age: 25 + Math.floor(rand() * 20),
    gender,
    openTo,
    choices,
    unexpectedFlex: pick(FLEX),
    canTeach: pick(TEACH),
    freeMonth: pick(MONTH),
    howToSpot: pick(SPOT),
    arrivedAt,
    rounds: [],
    active: true,
  };
}

// ── Build the night ──────────────────────────────────────────────────────────

const t0 = Date.UTC(2026, 10, 23, 3, 0); // 7:00pm PST
const roster = new Map<string, Guest>();
for (let i = 0; i < COUNT; i++) {
  const g = makeGuest(i, t0 + Math.floor(rand() * 15 * 60_000));
  roster.set(g.email, g);
}

const history = new Set<string>();
let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

console.log(`\nSimulating ${COUNT} guests over ${ROUNDS} rounds\n`);

for (let round = 1; round <= ROUNDS; round++) {
  const pool = [...roster.values()].filter((g) => g.active);
  const t = Date.now();
  const sol = solve(pool, history);
  const ms = Date.now() - t;

  const avg = sol.pairs.length
    ? (sol.total / sol.pairs.length).toFixed(1)
    : "–";
  console.log(
    `Round ${round}: ${pool.length} in the room → ${sol.pairs.length} pairs, ` +
      `${sol.unmatched.length} unmatched, avg score ${avg}, solved in ${ms}ms`
  );

  // ── The checks that matter ────────────────────────────────────────────────
  const seen = new Set<string>();
  for (const p of sol.pairs) {
    if (p.a === p.b) fail(`${p.a} matched to themselves`);

    const key = pairKey(p.a, p.b);
    if (history.has(key)) fail(`repeat pair: ${p.a} + ${p.b} (already met)`);

    if (seen.has(p.a)) fail(`${p.a} appears in two pairs this round`);
    if (seen.has(p.b)) fail(`${p.b} appears in two pairs this round`);
    seen.add(p.a);
    seen.add(p.b);

    // Orientation, checked independently of the solver's own gate.
    const ga = roster.get(p.a)!;
    const gb = roster.get(p.b)!;
    const oa = normalizeOpenTo(ga.openTo);
    const ob = normalizeOpenTo(gb.openTo);
    const na = normalizeGender(ga.gender);
    const nb = normalizeGender(gb.gender);
    if (oa.size && ob.size && na !== "unknown" && nb !== "unknown") {
      if (!oa.has(nb) || !ob.has(na)) {
        fail(`orientation mismatch: ${ga.gender}/${ga.openTo} + ${gb.gender}/${gb.openTo}`);
      }
    }
  }

  // Was anyone left out who actually had an available option?
  for (const email of sol.unmatched) {
    const me = roster.get(email)!;
    const others = sol.unmatched.filter((e) => e !== email).map((e) => roster.get(e)!);
    const option = others.find((o) => eligible(me, o, history).ok);
    if (option) {
      fail(`${email} left unmatched but could have taken ${option.email}`);
    }
  }

  sol.pairs.forEach((p) => history.add(pairKey(p.a, p.b)));
  sol.pairs.forEach((p) => {
    roster.get(p.a)!.rounds.push(round);
    roster.get(p.b)!.rounds.push(round);
  });

  // ── Late arrivals, the way they actually happen ───────────────────────────
  if (round < ROUNDS) {
    const bench: Guest[] = [];
    const arrivals = 1 + Math.floor(rand() * 3);
    for (let n = 0; n < arrivals; n++) {
      const g = makeGuest(roster.size, t0 + round * 25 * 60_000);
      roster.set(g.email, g);

      const match = bestPartner(g, bench, history);
      if (match) {
        const key = pairKey(g.email, match.partner.email);
        if (history.has(key)) fail(`late pair repeats: ${key}`);
        history.add(key);
        bench.splice(bench.indexOf(match.partner), 1);
        console.log(
          `  late: ${g.name} arrived → paired with ${match.partner.name} ` +
            `off the bench (${match.score})`
        );
      } else {
        bench.push(g);
        console.log(`  late: ${g.name} arrived → benched, first up for round ${round + 1}`);
      }
    }
  }
}

// ── How many distinct people did each guest meet? ────────────────────────────
const met = new Map<string, number>();
for (const key of history) {
  for (const email of key.split("|")) {
    met.set(email, (met.get(email) ?? 0) + 1);
  }
}
const counts = [...roster.keys()].map((e) => met.get(e) ?? 0);
const zero = counts.filter((c) => c === 0).length;
console.log(
  `\nIntroductions per guest: min ${Math.min(...counts)}, ` +
    `max ${Math.max(...counts)}, ` +
    `mean ${(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1)}` +
    (zero ? `  — ${zero} guest(s) met nobody` : "")
);

console.log(
  failures === 0
    ? `\n✓ All checks passed — no repeats, no double-bookings, no orientation mismatches.\n`
    : `\n✗ ${failures} check(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
