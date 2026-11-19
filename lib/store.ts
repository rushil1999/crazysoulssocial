import { Redis } from "@upstash/redis";

/**
 * Live event store.
 *
 * Everything that changes *during* an event lives here instead of in
 * `data/*.json`. The JSON files are baked into the build by `lib/data.ts`'s
 * static imports, which is why changing them used to need a git commit and a
 * Vercel redeploy. Redis is already wired for pulses and push subscriptions
 * (KV_REST_API_URL / KV_REST_API_TOKEN), so this adds no new infrastructure.
 *
 * Keys, all namespaced by event so a new event starts clean and old events
 * stay readable:
 *
 *   ev:<id>:guests        HASH    email -> Guest
 *   ev:<id>:state         STRING  EventState (current round, reveal times)
 *   ev:<id>:r<N>:cards    HASH    email -> Person (name, praise, matches[])
 *   ev:<id>:history       SET     "a@x|b@y" (sorted) — every pair ever made
 *   ev:<id>:bench         SET     emails arrived but not yet in a round
 */

export const EVENT_ID = process.env.EVENT_ID || "devils-acre-2026-11-22";

const hasRedis = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);

/** True on a real deploy. False for `npm run dev` with no store provisioned. */
export const storeConfigured = hasRedis;

const redis = hasRedis ? Redis.fromEnv() : null;

/**
 * Dev-only in-memory store, pinned to globalThis so it survives Next.js dev
 * recompilation — same approach as lib/pulses.ts. Per-process, NOT for
 * production.
 */
type Mem = {
  guests: Map<string, Guest>;
  state: EventState | null;
  cards: Map<number, Map<string, Person>>;
  pairs: Map<number, StoredPair[]>;
  debug: Map<string, unknown>;
  history: Set<string>;
  bench: Set<string>;
};
function freshMem(): Mem {
  return {
    guests: new Map(),
    state: null,
    cards: new Map(),
    pairs: new Map(),
    debug: new Map(),
    history: new Set(),
    bench: new Set(),
  };
}

const globalForStore = globalThis as unknown as { __eventMemory?: Mem };

/**
 * Merge onto fresh defaults rather than reusing whatever is pinned, so a
 * process that was warm before a field was added to `Mem` can't come back with
 * that field undefined.
 */
const mem: Mem = Object.assign(freshMem(), globalForStore.__eventMemory ?? {});
globalForStore.__eventMemory = mem;

// ── Types ────────────────────────────────────────────────────────────────────

/** A guest as captured by the intake form, before any matching happens. */
export type Guest = {
  email: string;
  name: string;
  age?: number;
  /** Lowercased, e.g. "man" | "woman" | "non-binary". Free text is tolerated. */
  gender?: string;
  /** Genders this guest is open to being introduced to, lowercased. */
  openTo?: string[];
  /** Multiple-choice answers, keyed by a short stable id. Drives scoring. */
  choices: Record<string, string>;
  /** Long-form answers that go on the card verbatim. */
  howToSpot?: string;
  unexpectedFlex?: string;
  canTeach?: string;
  freeMonth?: string;
  /** Anything else the form collected, kept for the card writer's context. */
  extra?: Record<string, string>;
  /** ms since epoch — when their form landed. Drives late-arrival handling. */
  arrivedAt: number;
  /** Rounds this guest has been paired in. */
  rounds: number[];
  /** Set false to keep someone in the roster but out of the next solve. */
  active: boolean;
};

/** One match card, as rendered by components/MatchCard.tsx. */
export type Match = {
  name: string;
  age?: number;
  vibe?: string;
  howToSpot?: string;
  compatibility?: number;
  whyMatched: string;
  commonAttributes: string[];
  unexpectedFlex?: string;
  canTeach?: string;
  freeMonth?: string;
  iceBreakers: string[];
  whatToTalkAbout: string;
  quirkyComment: string;
};

/** A guest's entry in one round — identical shape to data/matches*.json. */
export type Person = {
  name: string;
  praise: string;
  matches: Match[];
};

export type EventState = {
  /** Highest round committed so far. 0 before the first round runs. */
  currentRound: number;
  /** Reveal time (ISO) per round, keyed by round number as a string. */
  revealAt: Record<string, string>;
  /** Planned reveal times not yet run, ISO, ascending — powers countdowns. */
  upcoming: string[];
  /** Set by the host when the event is over; stops intake auto-pairing. */
  closed?: boolean;
};

const EMPTY_STATE: EventState = { currentRound: 0, revealAt: {}, upcoming: [] };

// ── Helpers ──────────────────────────────────────────────────────────────────

const k = {
  guests: (id: string) => `ev:${id}:guests`,
  state: (id: string) => `ev:${id}:state`,
  cards: (id: string, r: number) => `ev:${id}:r${r}:cards`,
  pairs: (id: string, r: number) => `ev:${id}:r${r}:pairs`,
  debug: (id: string, name: string) => `ev:${id}:debug:${name}`,
  history: (id: string) => `ev:${id}:history`,
  bench: (id: string) => `ev:${id}:bench`,
};

/**
 * How many rounds a reset sweeps. An evening runs three or four
 * introductions; this is deliberately generous so a reset can never leave a
 * stale round behind, and deleting a key that doesn't exist costs nothing.
 */
const MAX_ROUNDS = 16;

/** Upstash auto-deserializes JSON, but not always — accept either shape. */
function parse<T>(v: T | string | null | undefined): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Order-independent key for a pair, so A–B and B–A are the same record. */
export function pairKey(a: string, b: string): string {
  return [normalizeEmail(a), normalizeEmail(b)].sort().join("|");
}

// ── Guests ───────────────────────────────────────────────────────────────────

export async function putGuest(guest: Guest, eventId = EVENT_ID): Promise<void> {
  const email = normalizeEmail(guest.email);
  // Coerce `active` so it is always a real boolean on the way in. JSON.stringify
  // drops undefined keys, so an undefined here would come back missing and read
  // as "not active" to anything testing it for truthiness.
  const record = { ...guest, email, active: guest.active !== false };
  if (redis) {
    await redis.hset(k.guests(eventId), { [email]: JSON.stringify(record) });
  } else {
    mem.guests.set(email, record);
  }
}

export async function getGuest(
  email: string,
  eventId = EVENT_ID
): Promise<Guest | null> {
  const key = normalizeEmail(email);
  if (redis) {
    const v = await redis.hget<Guest | string>(k.guests(eventId), key);
    return parse<Guest>(v);
  }
  return mem.guests.get(key) ?? null;
}

export async function allGuests(eventId = EVENT_ID): Promise<Guest[]> {
  if (redis) {
    const map =
      (await redis.hgetall<Record<string, Guest | string>>(k.guests(eventId))) ||
      {};
    return Object.values(map)
      .map((v) => parse<Guest>(v))
      .filter((g): g is Guest => Boolean(g));
  }
  return [...mem.guests.values()];
}

/** Record that a guest took part in a round (so they aren't double-booked). */
export async function markRoundPlayed(
  email: string,
  round: number,
  eventId = EVENT_ID
): Promise<void> {
  const guest = await getGuest(email, eventId);
  if (!guest) return;
  if (!guest.rounds.includes(round)) {
    guest.rounds = [...guest.rounds, round].sort((a, b) => a - b);
    await putGuest(guest, eventId);
  }
}

// ── Event state ──────────────────────────────────────────────────────────────

export async function getState(eventId = EVENT_ID): Promise<EventState> {
  if (redis) {
    const v = await redis.get<EventState | string>(k.state(eventId));
    return parse<EventState>(v) ?? { ...EMPTY_STATE };
  }
  return mem.state ?? { ...EMPTY_STATE };
}

export async function putState(
  state: EventState,
  eventId = EVENT_ID
): Promise<void> {
  if (redis) {
    await redis.set(k.state(eventId), JSON.stringify(state));
  } else {
    mem.state = state;
  }
}

// ── Round cards ──────────────────────────────────────────────────────────────

/** Write (or overwrite) one guest's card set for a round. */
export async function putCard(
  round: number,
  email: string,
  person: Person,
  eventId = EVENT_ID
): Promise<void> {
  const key = normalizeEmail(email);
  if (redis) {
    await redis.hset(k.cards(eventId, round), { [key]: JSON.stringify(person) });
  } else {
    const r = mem.cards.get(round) ?? new Map<string, Person>();
    r.set(key, person);
    mem.cards.set(round, r);
  }
}

export async function getRoundCards(
  round: number,
  eventId = EVENT_ID
): Promise<Record<string, Person>> {
  if (redis) {
    const map =
      (await redis.hgetall<Record<string, Person | string>>(
        k.cards(eventId, round)
      )) || {};
    const out: Record<string, Person> = {};
    for (const [email, v] of Object.entries(map)) {
      const p = parse<Person>(v);
      if (p) out[normalizeEmail(email)] = p;
    }
    return out;
  }
  const r = mem.cards.get(round);
  return r ? Object.fromEntries(r) : {};
}

/** One guest's card set for a round, or null if they weren't in it. */
export async function getCard(
  round: number,
  email: string,
  eventId = EVENT_ID
): Promise<Person | null> {
  const key = normalizeEmail(email);
  if (redis) {
    const v = await redis.hget<Person | string>(k.cards(eventId, round), key);
    return parse<Person>(v);
  }
  return mem.cards.get(round)?.get(key) ?? null;
}

/**
 * Append a match to a guest's existing card set for a round, creating the
 * entry if they weren't in it. Used when a late arrival is paired into a round
 * that has already been committed.
 */
export async function appendMatch(
  round: number,
  email: string,
  name: string,
  praise: string,
  match: Match,
  eventId = EVENT_ID
): Promise<void> {
  const existing = await getCard(round, email, eventId);
  const person: Person = existing ?? { name, praise, matches: [] };
  person.matches = [...person.matches, match];
  await putCard(round, email, person, eventId);
}

// ── Round pair list ──────────────────────────────────────────────────────────

/**
 * The pairs that make up a round, stored separately from the cards so a
 * commit that's interrupted can be resumed: the pairs are written in one fast
 * call, and card writing — the slow part — can be re-run against this list
 * without solving again and getting a different answer.
 */
export type StoredPair = {
  a: string;
  b: string;
  score: number;
  shared: { key: string; answer: string }[];
  /** True once the model has written this pair's cards. */
  written?: boolean;
};

export async function putRoundPairs(
  round: number,
  pairs: StoredPair[],
  eventId = EVENT_ID
): Promise<void> {
  if (redis) {
    await redis.set(k.pairs(eventId, round), JSON.stringify(pairs));
  } else {
    mem.pairs.set(round, pairs);
  }
}

export async function getRoundPairs(
  round: number,
  eventId = EVENT_ID
): Promise<StoredPair[]> {
  if (redis) {
    return (
      parse<StoredPair[]>(
        await redis.get<StoredPair[] | string>(k.pairs(eventId, round))
      ) ?? []
    );
  }
  return mem.pairs.get(round) ?? [];
}

// ── Pair history ─────────────────────────────────────────────────────────────

export async function recordPairs(
  pairs: [string, string][],
  eventId = EVENT_ID
): Promise<void> {
  if (!pairs.length) return;
  const keys = pairs.map(([a, b]) => pairKey(a, b));
  if (redis) {
    await redis.sadd(k.history(eventId), keys[0], ...keys.slice(1));
  } else {
    keys.forEach((key) => mem.history.add(key));
  }
}

/** Every pair ever made at this event, as order-independent keys. */
export async function getHistory(eventId = EVENT_ID): Promise<Set<string>> {
  if (redis) {
    const keys = await redis.smembers<string[]>(k.history(eventId));
    return new Set(keys ?? []);
  }
  return new Set(mem.history);
}

// ── Bench (arrived, not yet matched) ─────────────────────────────────────────

export async function addToBench(
  email: string,
  eventId = EVENT_ID
): Promise<void> {
  const key = normalizeEmail(email);
  if (redis) {
    await redis.sadd(k.bench(eventId), key);
  } else {
    mem.bench.add(key);
  }
}

export async function removeFromBench(
  emails: string[],
  eventId = EVENT_ID
): Promise<void> {
  if (!emails.length) return;
  const keys = emails.map(normalizeEmail);
  if (redis) {
    await redis.srem(k.bench(eventId), keys[0], ...keys.slice(1));
  } else {
    keys.forEach((key) => mem.bench.delete(key));
  }
}

export async function getBench(eventId = EVENT_ID): Promise<string[]> {
  if (redis) {
    return (await redis.smembers<string[]>(k.bench(eventId))) ?? [];
  }
  return [...mem.bench];
}

export async function clearBench(eventId = EVENT_ID): Promise<void> {
  if (redis) {
    await redis.del(k.bench(eventId));
  } else {
    mem.bench.clear();
  }
}

// ── Debug slot ───────────────────────────────────────────────────────────────

/**
 * One-slot scratch space, used to keep the last intake payload's field mapping
 * so you can check it against the real form without redeploying. Host-gated on
 * read; never shown to guests.
 */
export async function putDebug(
  name: string,
  value: unknown,
  eventId = EVENT_ID
): Promise<void> {
  if (redis) {
    await redis.set(k.debug(eventId, name), JSON.stringify(value), {
      ex: 60 * 60 * 24,
    });
  } else {
    mem.debug.set(name, value);
  }
}

export async function getDebug<T>(
  name: string,
  eventId = EVENT_ID
): Promise<T | null> {
  if (redis) {
    return parse<T>(await redis.get<T | string>(k.debug(eventId, name)));
  }
  return (mem.debug.get(name) as T) ?? null;
}

// ── Reset ────────────────────────────────────────────────────────────────────

/**
 * Wipe an event back to empty. Host-only, and deliberately explicit — this
 * destroys every guest, card and pair record for the event.
 */
export async function resetEvent(eventId = EVENT_ID): Promise<void> {
  if (redis) {
    const rounds = Array.from({ length: MAX_ROUNDS }, (_, i) => i);
    await redis.del(
      k.guests(eventId),
      k.state(eventId),
      k.history(eventId),
      k.bench(eventId),
      k.debug(eventId, "intake"),
      ...rounds.map((r) => k.cards(eventId, r)),
      // Easy to forget, and the one that bites: a surviving pair list makes
      // the next commit refuse the round as already run.
      ...rounds.map((r) => k.pairs(eventId, r))
    );
  } else {
    mem.guests.clear();
    mem.state = null;
    mem.cards.clear();
    mem.pairs.clear();
    mem.debug.clear();
    mem.history.clear();
    mem.bench.clear();
  }
}
