import { NextResponse } from "next/server";
import { verify } from "@/lib/data";

export async function POST(request: Request) {
  let body: { email?: string; firstName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { email, firstName } = body;
  if (!email || !firstName) {
    return NextResponse.json(
      { error: "Missing first name or email" },
      { status: 400 }
    );
  }

  const person = await verify(email, firstName);
  if (!person) {
    return NextResponse.json(
      {
        error:
          "We couldn't find you with that name and email. Use the exact details you signed up with — and check for typos.",
      },
      { status: 404 }
    );
  }

  // Return only what the reveal experience needs up front — never the match
  // details themselves (those are fetched per-match, time-gated, from /api/match).
  // `revealTimes` is this person's merged, time-sorted timeline across rounds.
  return NextResponse.json({
    name: person.name,
    praise: person.praise,
    revealTimes: person.revealTimes,
    matchCount: person.matches.length,
    nextWindow: person.nextWindow,
    // True for a guest who's filled the form but has no introduction yet —
    // the client shows a countdown rather than an empty reveal.
    waiting: person.waiting ?? false,
  });
}
