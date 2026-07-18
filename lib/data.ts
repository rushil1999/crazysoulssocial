import matchesData from "@/data/matches.json";
import scheduleData from "@/data/schedule.json";

export type Match = {
  name: string;
  photo?: string;
  whyMatched: string;
  commonAttributes: string[];
  iceBreakers: string[];
  whatToTalkAbout: string;
  quirkyComment: string;
};

export type Person = {
  token: string;
  name: string;
  praise: string;
  matches: Match[];
};

type MatchesFile = Record<string, Person>;

const matches = matchesData as MatchesFile;

// Build a token -> email index once at module load.
const tokenIndex: Record<string, string> = {};
for (const [email, person] of Object.entries(matches)) {
  tokenIndex[person.token.toLowerCase()] = email.toLowerCase();
}

export function getRevealTimes(): string[] {
  return scheduleData.revealTimes;
}

/** Look up a person purely by their unique link token. */
export function getPersonByToken(token: string): Person | null {
  const email = tokenIndex[token.trim().toLowerCase()];
  if (!email) return null;
  return matches[email] ?? null;
}

/**
 * Confirm the token belongs to the person, AND that the supplied email
 * matches the email on file (case-insensitive, trimmed). Returns the Person
 * only on a full match — otherwise null.
 */
export function verify(token: string, email: string): Person | null {
  const person = getPersonByToken(token);
  if (!person) return null;
  const onFile = tokenIndex[token.trim().toLowerCase()];
  if (!onFile) return null;
  if (onFile !== email.trim().toLowerCase()) return null;
  return person;
}
