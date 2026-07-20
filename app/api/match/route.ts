import { NextResponse } from "next/server";
import { verify } from "@/lib/data";

export async function POST(request: Request) {
  let body: { email?: string; firstName?: string; index?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { email, firstName, index } = body;
  if (!email || !firstName || typeof index !== "number") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const person = verify(email, firstName);
  if (!person) {
    return NextResponse.json({ error: "Not authorized" }, { status: 404 });
  }

  if (index < 0 || index >= person.matches.length) {
    return NextResponse.json({ error: "No such match" }, { status: 404 });
  }

  // This person's merged timeline holds the reveal time for each match index.
  const revealAt = person.revealTimes[index];
  const revealMs = new Date(revealAt).getTime();

  // Server-side time gate — the actual anti-spoiler guarantee.
  if (Date.now() < revealMs) {
    return NextResponse.json({ error: "not_yet", revealAt }, { status: 403 });
  }

  return NextResponse.json({ match: person.matches[index] });
}
