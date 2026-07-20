import roundConfig from "@/data/round.json";
import scheduleData from "@/data/schedule.json";
import matches1 from "@/data/matches.json";
import matches2 from "@/data/matches_2.json";

export type Interest = {
  label: string;
  /** Optional icon keyword (e.g. "wine", "music", "travel"). Falls back to
   *  matching a keyword inside the label, then to a sparkle. */
  icon?: string;
};

export type Match = {
  name: string;
  age?: number;
  location?: string;
  role?: string;
  tagline?: string;
  compatibility?: number;
  photo?: string;
  howToSpot?: string;
  whyMatched: string;
  commonAttributes: string[];
  interests?: Interest[];
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
 * A guest's combined view across every enabled round: all their matches merged
 * into one timeline, each with its own reveal time, sorted chronologically.
 */
export type Profile = {
  name: string;
  praise: string;
  matches: Match[];
  revealTimes: string[]; // parallel to `matches`
};

type MatchesFile = Record<string, Person>;

/**
 * Registry of matching rounds (matches only). To add round 3, drop in
 * data/matches_3.json, import it above, and add a `3:` entry here — then add a
 * "3" entry to schedule.json and list 3 in data/round.json's enabledRounds.
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

/**
 * Build a guest's combined profile by merging their matches from every enabled
 * round into a single, time-sorted timeline. Returns null if the email isn't in
 * any enabled round.
 */
export function getProfileByEmail(email: string): Profile | null {
  if (!email) return null;
  const key = email.trim().toLowerCase();

  const entries: { time: string; match: Match }[] = [];
  let name = "";
  let praise = "";
  let found = false;

  for (const r of [...enabledRounds].sort((a, b) => a - b)) {
    const person = roundIndex[r]?.[key];
    if (!person) continue;
    if (!found) {
      // Greet with the earliest round they appear in.
      name = person.name;
      praise = person.praise;
      found = true;
    }
    const times = scheduleRounds[String(r)] ?? [];
    person.matches.forEach((match, j) => {
      const time = times[j] ?? times[times.length - 1] ?? "";
      entries.push({ time, match });
    });
  }

  if (!found) return null;

  entries.sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  return {
    name,
    praise,
    matches: entries.map((e) => e.match),
    revealTimes: entries.map((e) => e.time),
  };
}

/**
 * Light two-factor identity check: the email must exist in an enabled round AND
 * the supplied first name must match the first name on file (case-insensitive).
 * Returns the combined Profile only on a full match — otherwise null.
 */
export function verify(email: string, firstName: string): Profile | null {
  const profile = getProfileByEmail(email);
  if (!profile || !firstName) return null;
  const onFileFirst = (profile.name || "").trim().split(/\s+/)[0].toLowerCase();
  if (!onFileFirst) return null;
  return onFileFirst === firstName.trim().toLowerCase() ? profile : null;
}
