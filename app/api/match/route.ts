import { NextResponse } from "next/server";
import { verify, getRevealTimes } from "@/lib/data";

export async function POST(request: Request) {
  let body: { token?: string; email?: string; index?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { token, email, index } = body;
  if (!token || !email || typeof index !== "number") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const person = verify(token, email);
  if (!person) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  if (index < 0 || index >= person.matches.length) {
    return NextResponse.json({ error: "No such match" }, { status: 404 });
  }

  const revealTimes = getRevealTimes();
  // Fall back to the last defined time if there are more matches than times.
  const revealAt = revealTimes[index] ?? revealTimes[revealTimes.length - 1];
  const revealMs = new Date(revealAt).getTime();

  // Server-side time gate — the actual anti-spoiler guarantee.
  if (Date.now() < revealMs) {
    return NextResponse.json(
      { error: "not_yet", revealAt },
      { status: 403 }
    );
  }

  return NextResponse.json({ match: person.matches[index] });
}
