import { NextResponse } from "next/server";
import { addPulse, getPulsesSince, getRecent, clearPulses } from "@/lib/pulses";

// Never cache — guests poll this for live updates.
export const dynamic = "force-dynamic";

const MAX_LEN = 200;

/**
 * GET /api/pulses[?since=<ms>]
 * Public, read-only. With `since`, returns pulses fired after that timestamp;
 * without it, returns the recent feed for initial hydration. `now` lets clients
 * advance their cursor off the server clock, sidestepping device clock skew.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sinceRaw = searchParams.get("since");
  const since = sinceRaw !== null ? Number(sinceRaw) : NaN;

  const pulses = Number.isFinite(since)
    ? await getPulsesSince(since)
    : await getRecent();

  return NextResponse.json({ pulses, now: Date.now() });
}

/**
 * POST /api/pulses  { text, secret }
 * Host-only (validated against PULSE_ADMIN_SECRET). Fires a pulse to the room.
 */
export async function POST(request: Request) {
  let body: { text?: string; secret?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const secret = process.env.PULSE_ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Pulses aren't set up on the server yet — PULSE_ADMIN_SECRET is missing. Add it (Vercel env vars, or .env.local for local dev) and restart/redeploy.",
      },
      { status: 503 }
    );
  }
  if (body.secret !== secret) {
    return NextResponse.json({ error: "Wrong admin secret." }, { status: 401 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Empty pulse" }, { status: 400 });
  }
  if (text.length > MAX_LEN) {
    return NextResponse.json(
      { error: `Too long (max ${MAX_LEN} characters)` },
      { status: 400 }
    );
  }

  const pulse = await addPulse(text);
  return NextResponse.json({ pulse });
}

/**
 * DELETE /api/pulses  { secret }
 * Host-only reset — clears every pulse (e.g. before the event starts).
 */
export async function DELETE(request: Request) {
  let body: { secret?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const secret = process.env.PULSE_ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "PULSE_ADMIN_SECRET is not configured on the server." },
      { status: 503 }
    );
  }
  if (body.secret !== secret) {
    return NextResponse.json({ error: "Wrong admin secret." }, { status: 401 });
  }

  await clearPulses();
  return NextResponse.json({ ok: true });
}
