import { NextResponse } from "next/server";
import { verify, getRevealTimes } from "@/lib/data";

export async function POST(request: Request) {
  let body: { token?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { token, email } = body;
  if (!token || !email) {
    return NextResponse.json(
      { error: "Missing token or email" },
      { status: 400 }
    );
  }

  const person = verify(token, email);
  if (!person) {
    // Do not reveal whether it was the token or the email that was wrong.
    return NextResponse.json(
      { error: "That email doesn't match this invite. Double-check the address you signed up with." },
      { status: 401 }
    );
  }

  // Return only what the reveal experience needs up front — never the match
  // details themselves (those are fetched per-match, time-gated, from /api/match).
  return NextResponse.json({
    name: person.name,
    praise: person.praise,
    revealTimes: getRevealTimes(),
    matchCount: person.matches.length,
  });
}
