import { NextResponse } from "next/server";
import {
  allGuests,
  clearBench,
  getGuest,
  getHistory,
  getRoundPairs,
  getState,
  markRoundPlayed,
  putCard,
  putRoundPairs,
  putState,
  recordPairs,
  resetEvent,
  type EventState,
  type Guest,
  type StoredPair,
} from "@/lib/store";
import { solve } from "@/lib/pairing";
import { fallbackCard, writeCards, cardsConfigured } from "@/lib/cards";
import { sendPushToEmails } from "@/lib/push";

export const dynamic = "force-dynamic";
// Card writing is the slow part. 60s is the Hobby-plan ceiling; a commit that
// runs out of time is resumable (see `finish` below), so this is a soft limit.
export const maxDuration = 60;

type Action = "preview" | "commit" | "finish" | "schedule" | "close" | "reset";

type Body = {
  secret?: string;
  action?: Action;
  /** Which round to act on. Defaults to the next one for commit. */
  round?: number;
  /** ISO time the round's matches unlock. Defaults to now. */
  revealAt?: string;
  /** Convenience alternative to `revealAt`. */
  revealInMinutes?: number;
  /** For `schedule`: the planned reveal times, ISO. */
  times?: string[];
  /** Re-run a committed round's pairing from scratch. Dangerous; off by default. */
  force?: boolean;
};

function authorized(body: Body): string | null {
  const secret = process.env.PULSE_ADMIN_SECRET;
  if (!secret) return "PULSE_ADMIN_SECRET isn't set on the server.";
  if (body.secret !== secret) return "Wrong admin secret.";
  return null;
}

/** Guests eligible for a solve: present and not withdrawn. */
function roster(guests: Guest[]): Guest[] {
  return guests.filter((g) => g.active);
}

function nameOf(guests: Guest[], email: string): string {
  return guests.find((g) => g.email === email)?.name ?? email;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const denied = authorized(body);
  if (denied) {
    return NextResponse.json(
      { error: denied },
      { status: denied.startsWith("Wrong") ? 401 : 503 }
    );
  }

  const action: Action = body.action ?? "preview";
  const state = await getState();
  const guests = await allGuests();
  const pool = roster(guests);

  // ── Housekeeping actions ───────────────────────────────────────────────────

  if (action === "reset") {
    await resetEvent();
    return NextResponse.json({ ok: true, reset: true });
  }

  if (action === "close") {
    await putState({ ...state, closed: true });
    return NextResponse.json({ ok: true, closed: true });
  }

  if (action === "schedule") {
    const times = (body.times ?? [])
      .map((t) => new Date(t))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())
      .map((d) => d.toISOString());
    await putState({ ...state, upcoming: times });
    return NextResponse.json({ ok: true, upcoming: times });
  }

  // ── Preview: solve and show, write nothing ─────────────────────────────────

  if (action === "preview") {
    if (pool.length < 2) {
      return NextResponse.json({
        ok: true,
        round: state.currentRound + 1,
        rosterSize: pool.length,
        pairs: [],
        unmatched: pool.map((g) => g.name),
        note: "Not enough guests checked in yet.",
      });
    }

    const history = await getHistory();
    const sol = solve(pool, history);

    return NextResponse.json({
      ok: true,
      round: state.currentRound + 1,
      rosterSize: pool.length,
      cardsConfigured,
      pairs: sol.pairs.map((p) => ({
        a: nameOf(pool, p.a),
        b: nameOf(pool, p.b),
        aEmail: p.a,
        bEmail: p.b,
        score: p.score,
        shared: p.shared.map((s) => s.key),
      })),
      unmatched: sol.unmatched.map((e) => nameOf(pool, e)),
      averageScore: sol.pairs.length
        ? Math.round(sol.total / sol.pairs.length)
        : null,
    });
  }

  // ── Commit: pair the room and publish ─────────────────────────────────────

  if (action === "commit") {
    const round = body.round ?? state.currentRound + 1;

    const alreadyRun = await getRoundPairs(round);
    if (alreadyRun.length && !body.force) {
      return NextResponse.json(
        {
          error: `Round ${round} has already been committed (${alreadyRun.length} pairs). Use "finish" to complete its cards, or pass force to re-pair it.`,
        },
        { status: 409 }
      );
    }

    if (pool.length < 2) {
      return NextResponse.json(
        { error: "Need at least two guests checked in." },
        { status: 400 }
      );
    }

    const revealAt = body.revealAt
      ? new Date(body.revealAt)
      : new Date(Date.now() + (body.revealInMinutes ?? 0) * 60_000);
    if (Number.isNaN(revealAt.getTime())) {
      return NextResponse.json({ error: "Bad revealAt" }, { status: 400 });
    }

    const history = await getHistory();
    const sol = solve(pool, history);

    const stored: StoredPair[] = sol.pairs.map((p) => ({
      a: p.a,
      b: p.b,
      score: p.score,
      shared: p.shared,
      written: false,
    }));

    // Step 1 — publish cards built from the form answers alone. These are
    // instant and never wrong, so from this moment the round works even if
    // everything below fails.
    for (const p of stored) {
      const ga = await getGuest(p.a);
      const gb = await getGuest(p.b);
      if (!ga || !gb) continue;
      await putCard(round, p.a, {
        name: ga.name,
        praise: "Your answers were specific, which is rarer than it sounds.",
        matches: [fallbackCard(gb, p.score, p.shared)],
      });
      await putCard(round, p.b, {
        name: gb.name,
        praise: "Your answers were specific, which is rarer than it sounds.",
        matches: [fallbackCard(ga, p.score, p.shared)],
      });
    }

    // Step 2 — record the round. Pairs go to history so no one repeats.
    await putRoundPairs(round, stored);
    await recordPairs(stored.map((p) => [p.a, p.b] as [string, string]));
    await clearBench();
    for (const p of stored) {
      await markRoundPlayed(p.a, round);
      await markRoundPlayed(p.b, round);
    }

    const upcoming = state.upcoming.filter(
      (t) => new Date(t).getTime() > revealAt.getTime()
    );
    const next: EventState = {
      currentRound: Math.max(state.currentRound, round),
      revealAt: { ...state.revealAt, [String(round)]: revealAt.toISOString() },
      upcoming,
      closed: state.closed,
    };
    await putState(next);

    // Step 3 — upgrade the cards with written prose, as far as time allows.
    const written = await upgrade(round, stored);

    // Step 4 — tell the room, once.
    const emails = stored.flatMap((p) => [p.a, p.b]);
    const atReveal = revealAt.getTime() <= Date.now() + 5_000;
    if (atReveal) {
      await sendPushToEmails(emails, {
        title: "Crazy Souls · Your introduction is ready",
        body: "Open the app to see who you're meeting.",
        url: "/",
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      round,
      revealAt: revealAt.toISOString(),
      rosterSize: pool.length,
      pairs: stored.length,
      cardsWritten: written,
      cardsPending: stored.length - written,
      unmatched: sol.unmatched.map((e) => nameOf(pool, e)),
      notified: atReveal ? emails.length : 0,
      cardsConfigured,
    });
  }

  // ── Finish: resume card writing for a committed round ─────────────────────

  if (action === "finish") {
    const round = body.round ?? state.currentRound;
    const stored = await getRoundPairs(round);
    if (!stored.length) {
      return NextResponse.json(
        { error: `Round ${round} hasn't been committed.` },
        { status: 404 }
      );
    }
    const written = await upgrade(round, stored);
    const remaining = (await getRoundPairs(round)).filter((p) => !p.written);
    return NextResponse.json({
      ok: true,
      round,
      cardsWritten: written,
      cardsPending: remaining.length,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/**
 * Replace the deterministic cards with written ones, pair by pair, marking
 * each as it lands. Safe to call repeatedly — it only touches pairs that
 * haven't been written yet, so an interrupted commit is resumed by calling
 * `finish` rather than by re-pairing the room.
 */
async function upgrade(round: number, stored: StoredPair[]): Promise<number> {
  const pending = stored.filter((p) => !p.written);
  if (!pending.length || !cardsConfigured) return 0;

  // Leave headroom under maxDuration so the response itself isn't cut off.
  const deadline = Date.now() + 45_000;
  let done = 0;
  const concurrency = 6;
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= pending.length) return;
      if (Date.now() > deadline) return;

      const p = pending[i];
      const [ga, gb] = await Promise.all([getGuest(p.a), getGuest(p.b)]);
      if (!ga || !gb) continue;

      const cards = await writeCards(ga, gb, p.score, p.shared);
      if (!cards.generated) continue; // fell back; leave it for another pass

      await putCard(round, p.a, {
        name: ga.name,
        praise: cards.praiseA,
        matches: [cards.aSeesB],
      });
      await putCard(round, p.b, {
        name: gb.name,
        praise: cards.praiseB,
        matches: [cards.bSeesA],
      });
      p.written = true;
      done++;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, worker)
  );

  await putRoundPairs(round, stored);
  return done;
}
