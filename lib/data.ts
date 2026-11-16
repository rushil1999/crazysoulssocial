import roundConfig from "@/data/round.json";
import scheduleData from "@/data/schedule.json";
import matches1 from "@/data/matches.json";
import matches2 from "@/data/matches_2.json";
import {
  getCard,
  getGuest,
  getState,
  type Person as StoredPerson,
} from "@/lib/store";

/**
 * Reading a guest's profile.
 *
 * There are two sources, tried in order:
 *
 *  1. The live store (lib/store.ts), written during the event by /api/round
 *     and /api/intake. This is the path a running event uses — new matches
 *     appear the moment they're committed, with no commit and no redeploy.
 *
 *  2. The static JSON in data/, imported at build time. This is how the July
 *     event worked, and it still resolves exactly as it did, so past events
 *     and their links keep working untouched.
 *
 * The static imports below are what forced a redeploy for every change: a
 * bundled import is frozen into the build. They're kept deliberately, as the
 * fallback, and are no longer on the path for a live event.
 *
 * Every field is derivable from the "Beyond Small Talk" intake form — a direct
 * answer or an AI synthesis of the personality answers. (The form also collects
 * gender and SMS consent, which feed matching/ops, not the card.)
 */
export type Match = {
  name: string;
  age?: number;
  /** One-line read on how they move socially, distilled from the "Natural
   *  Rhythm" scenario answers (e.g. "Finds the person standing alone and makes
   *  them the center of the night"). */
  vibe?: string;
  /** How to physically find them in the room — the form's "how can someone spot
   *  you during the event?" answer. Optional; hidden if absent. */
  howToSpot?: string;
  compatibility?: number;
  whyMatched: string;
  commonAttributes: string[];
  /** From the form's open-text "most unexpected flex". */
  unexpectedFlex?: string;
  /** From the form's "what could you confidently teach someone in 1 hour". */
  canTeach?: string;
  /** From the form's "one-month sabbatical, travel banned — what are you doing
   *  with thirty responsibility-free days?" */
  freeMonth?: string;
  iceBreakers: string[];
  whatToTalkAbout: string;
  quirkyComment: string;
};

/** A person's raw entry within a single round's matches file. */
export type Person = {
  token?: string;
  name: string;
  praise: string;
  matches: Match[];
};

/**
 * A guest's combined view across every round: all their matches merged into
 * one timeline, each with its own reveal time, sorted chronologically.
 */
export type Profile = {
  name: string;
  praise: string;
  matches: Match[];
  revealTimes: string[]; // parallel to `matches`
  /**
   * The next scheduled reveal time beyond this guest's current matches, if any.
   * Lets the client show a "next match unlocks in…" countdown for a round
   * that hasn't been run yet. Null when there's no upcoming window.
   */
  nextWindow: string | null;
  /**
   * True when this guest is in the roster but has no matches yet — they've
   * filled the form and are waiting for the next round. The reveal UI uses
   * this to show a countdown instead of "we couldn't find you".
   */
  waiting?: boolean;
};

type MatchesFile = Record<string, Person>;

// ── Static fallback (pre-Redis events) ──────────────────────────────────────

/**
 * Registry of matching rounds from the bundled JSON. Only used for events that
 * predate the live store; a running event never reaches this.
 */
const roundMatches: Record<number, MatchesFile> = {
  1: matches1 as MatchesFile,
  2: matches2 as MatchesFile,
};

const scheduleRounds: Record<string, string[]> =
  (scheduleData as { rounds?: Record<string, string[]> }).rounds ?? {};

const enabledRounds: number[] = (roundConfig.enabledRounds ?? [1]).slice();

// Normalize each round's email keys once for case/whitespace-insensitive lookup.
const roundIndex: Record<number, Record<string, Person>> = {};
for (const [r, file] of Object.entries(roundMatches)) {
  const idx: Record<string, Person> = {};
  for (const [email, person] of Object.entries(file)) {
    idx[email.trim().toLowerCase()] = person;
  }
  roundIndex[Number(r)] = idx;
}

function staticProfile(key: string): Profile | null {
  const entries: { time: string; match: Match }[] = [];
  let name = "";
  let praise = "";
  let found = false;

  for (const r of [...enabledRounds].sort((a, b) => a - b)) {
    const person = roundIndex[r]?.[key];
    if (!person) continue;
    if (!found) {
      name = person.name;
      praise = person.praise;
      found = true;
    }
    const times = scheduleRounds[String(r)] ?? [];
    person.matches.forEach((match, j) => {
      entries.push({ time: times[j] ?? times[times.length - 1] ?? "", match });
    });
  }

  if (!found) return null;

  entries.sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );
  const revealTimes = entries.map((e) => e.time);

  const lastMatchMs = revealTimes.reduce(
    (max, t) => Math.max(max, new Date(t).getTime()),
    0
  );
  const graceMs = Date.now() - 30 * 60 * 1000;
  const nextWindow =
    [...enabledRounds]
      .flatMap((r) => scheduleRounds[String(r)] ?? [])
      .map((t) => ({ t, ms: new Date(t).getTime() }))
      .filter((x) => x.ms > lastMatchMs && x.ms > graceMs)
      .sort((a, b) => a.ms - b.ms)[0]?.t ?? null;

  return { name, praise, matches: entries.map((e) => e.match), revealTimes, nextWindow };
}

// ── Live store ───────────────────────────────────────────────────────────────

async function liveProfile(key: string): Promise<Profile | null> {
  const state = await getState();
  const guest = await getGuest(key);

  // Nothing live for this event at all — let the static path answer.
  if (!guest && state.currentRound < 1) return null;

  const entries: { time: string; match: Match }[] = [];
  let name = guest?.name ?? "";
  let praise = "";

  for (let r = 1; r <= state.currentRound; r++) {
    const card: StoredPerson | null = await getCard(r, key);
    if (!card) continue;
    if (!name) name = card.name;
    // The most recent round's praise wins — it was written about them most
    // recently and with the most answers in hand.
    if (card.praise) praise = card.praise;
    const time = state.revealAt[String(r)] ?? "";
    card.matches.forEach((match) => entries.push({ time, match }));
  }

  // In the roster but nothing yet — a late arrival waiting for the next round.
  if (!entries.length) {
    if (!guest) return null;
    return {
      name: guest.name,
      praise: "",
      matches: [],
      revealTimes: [],
      nextWindow: state.upcoming[0] ?? null,
      waiting: true,
    };
  }

  entries.sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );
  const revealTimes = entries.map((e) => e.time);
  const lastMatchMs = revealTimes.reduce(
    (max, t) => Math.max(max, new Date(t).getTime()),
    0
  );

  const nextWindow =
    state.upcoming
      .map((t) => ({ t, ms: new Date(t).getTime() }))
      .filter((x) => x.ms > lastMatchMs)
      .sort((a, b) => a.ms - b.ms)[0]?.t ?? null;

  return {
    name,
    praise: praise || "Your answers were specific, which is rarer than it sounds.",
    matches: entries.map((e) => e.match),
    revealTimes,
    nextWindow,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * A guest's combined profile across every round, live store first and the
 * bundled JSON as fallback. Returns null when the email isn't known at all.
 */
export async function getProfileByEmail(email: string): Promise<Profile | null> {
  if (!email) return null;
  const key = email.trim().toLowerCase();

  // Always try live first. With Redis absent (local `npm run dev`) the store
  // falls back to its in-process map, so the whole flow still works end to end
  // locally — and either way this returns null when there's no live data for
  // the email, which hands over to the bundled JSON below.
  try {
    const live = await liveProfile(key);
    if (live) return live;
  } catch {
    // Store unreachable mid-event — fall through rather than locking everyone
    // out. Guests with bundled data still get in.
  }

  return staticProfile(key);
}

/**
 * Light two-factor identity check: the email must be known AND the supplied
 * first name must match the first name on file (case-insensitive). Returns the
 * combined Profile only on a full match — otherwise null.
 */
export async function verify(
  email: string,
  firstName: string
): Promise<Profile | null> {
  const profile = await getProfileByEmail(email);
  if (!profile || !firstName) return null;
  const onFileFirst = (profile.name || "").trim().split(/\s+/)[0].toLowerCase();
  if (!onFileFirst) return null;
  return onFileFirst === firstName.trim().toLowerCase() ? profile : null;
}
