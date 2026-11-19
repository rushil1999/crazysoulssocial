import { NextResponse } from "next/server";
import {
  allGuests,
  addToBench,
  appendMatch,
  getBench,
  getGuest,
  getHistory,
  getState,
  markRoundPlayed,
  putDebug,
  putGuest,
  recordPairs,
  removeFromBench,
  getDebug,
  type Guest,
} from "@/lib/store";
import { bestPartner } from "@/lib/pairing";
import { writeCards } from "@/lib/cards";
import { mapSubmission, verifySignature, type TallyPayload } from "@/lib/tally";
import { sendPushToEmails } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * POST /api/intake — the Tally webhook.
 *
 * Point your form's webhook (Tally → Integrations → Webhooks) at
 * https://<your-domain>/api/intake. Every submission lands here and becomes a
 * guest in the live roster, with no commit and no redeploy.
 *
 * Two paths:
 *
 *  • Before round 1 has been run, a submission just joins the roster. The
 *    round-1 solve will include everyone who's checked in by then.
 *
 *  • After a round has been committed, a new submission is a late arrival. We
 *    look for someone on the bench — guests who arrived since the last round
 *    and haven't been introduced to anyone yet — and if there's an eligible
 *    one, the two are paired immediately, cards are written, and both phones
 *    are notified. If the bench is empty they go on it, and they're first in
 *    line when the next round runs.
 *
 * This always answers 200 for a submission it understood, even if pairing
 * failed. Tally retries non-2xx responses, and a guest arriving twice in the
 * roster is worse than a guest who has to wait for the next round.
 */
export async function POST(request: Request) {
  const raw = await request.text();

  const signingSecret = process.env.TALLY_SIGNING_SECRET;
  if (signingSecret) {
    const sig =
      request.headers.get("tally-signature") ??
      request.headers.get("Tally-Signature");
    const ok = await verifySignature(raw, sig, signingSecret);
    if (!ok) {
      return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }
  }

  let payload: TallyPayload;
  try {
    payload = JSON.parse(raw) as TallyPayload;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const { guest, problem, mapping } = mapSubmission(payload);

  // Keep the mapping around so it can be checked against the live form.
  await putDebug("intake", {
    at: new Date().toISOString(),
    mapping,
    problem: problem ?? null,
  }).catch(() => {});

  if (!guest) {
    // 200 on purpose: retrying won't add an email that was never there.
    return NextResponse.json({ ok: false, problem, mapping }, { status: 200 });
  }

  // Re-submission: keep the rounds they've already played.
  const existing = await getGuest(guest.email);
  if (existing) {
    guest.rounds = existing.rounds;
    guest.arrivedAt = existing.arrivedAt;
    guest.active = existing.active;
  }
  await putGuest(guest);

  const state = await getState();

  // Round 1 hasn't run yet — the solve will pick them up.
  if (state.currentRound < 1 || state.closed) {
    return NextResponse.json({
      ok: true,
      name: guest.name,
      status: "in_roster",
      waitingFor: state.upcoming[0] ?? null,
    });
  }

  // ── Late arrival ───────────────────────────────────────────────────────────
  const round = state.currentRound;
  const history = await getHistory();
  const benchEmails = (await getBench()).filter((e) => e !== guest.email);

  const benchGuests = (
    await Promise.all(benchEmails.map((e) => getGuest(e)))
  ).filter((g): g is Guest => Boolean(g) && g!.active);

  const found = bestPartner(guest, benchGuests, history);

  if (!found) {
    await addToBench(guest.email);
    return NextResponse.json({
      ok: true,
      name: guest.name,
      status: "benched",
      waitingFor: state.upcoming[0] ?? null,
    });
  }

  const partner = found.partner;

  try {
    const cards = await writeCards(guest, partner, found.score, found.shared);

    await appendMatch(
      round,
      guest.email,
      guest.name,
      cards.praiseA,
      cards.aSeesB
    );
    await appendMatch(
      round,
      partner.email,
      partner.name,
      cards.praiseB,
      cards.bSeesA
    );

    await recordPairs([[guest.email, partner.email]]);
    await removeFromBench([partner.email, guest.email]);
    await markRoundPlayed(guest.email, round);
    await markRoundPlayed(partner.email, round);

    // Only these two phones buzz — the rest of the room is mid-conversation.
    await sendPushToEmails([guest.email, partner.email], {
      title: "Crazy Souls · Your introduction is ready",
      body: "Open the app to see who you're meeting.",
      url: "/",
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      name: guest.name,
      status: "paired",
      with: partner.name,
      compatibility: found.score,
      generated: cards.generated,
    });
  } catch (err) {
    // Pairing failed mid-write — bench them so the next round picks them up
    // rather than losing them entirely.
    await addToBench(guest.email).catch(() => {});
    return NextResponse.json(
      {
        ok: true,
        name: guest.name,
        status: "benched",
        problem: err instanceof Error ? err.message : "Pairing failed",
      },
      { status: 200 }
    );
  }
}

/**
 * GET /api/intake?secret=…&debug=1 — host-only.
 *
 * Without `debug`, returns the live roster. With it, also returns how the last
 * submission's labels were mapped, which is the fastest way to confirm the
 * form's questions are landing in the right slots.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = process.env.PULSE_ADMIN_SECRET;

  if (!secret) {
    // Distinguish "server isn't configured" from "you got the password wrong".
    // Returning the same message for both sends you hunting for a typo in a
    // password that was never going to work.
    return NextResponse.json(
      { error: "PULSE_ADMIN_SECRET isn't set on the server." },
      { status: 503 }
    );
  }

  // Accept the secret from a header as well as the query string. A secret
  // containing &, #, + or a space survives a header intact but is mangled in a
  // URL — # truncates the rest, & starts a new parameter — which looks exactly
  // like a wrong password. Both sides are trimmed because a value pasted into
  // Vercel's env var box often carries a trailing newline.
  const supplied = (
    request.headers.get("x-admin-secret") ??
    searchParams.get("secret") ??
    ""
  ).trim();

  if (supplied !== secret.trim()) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const [guests, bench, state] = await Promise.all([
    allGuests(),
    getBench(),
    getState(),
  ]);

  const body: Record<string, unknown> = {
    count: guests.length,
    state,
    bench,
    guests: guests
      .slice()
      .sort((a, b) => a.arrivedAt - b.arrivedAt)
      .map((g) => ({
        email: g.email,
        name: g.name,
        age: g.age,
        gender: g.gender,
        openTo: g.openTo,
        answered: Object.keys(g.choices).length,
        rounds: g.rounds,
        active: g.active,
      })),
  };

  if (searchParams.get("debug")) {
    body.lastIntake = await getDebug("intake");
  }

  return NextResponse.json(body);
}
