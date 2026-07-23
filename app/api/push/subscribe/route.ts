import { NextResponse } from "next/server";
import { addSubscription, removeSubscription, pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

type Body = {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  endpoint?: string;
};

/** POST /api/push/subscribe — store a guest's push subscription. */
export async function POST(request: Request) {
  if (!pushConfigured) {
    return NextResponse.json(
      { error: "Push isn't configured on the server (VAPID keys missing)." },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await addSubscription({
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/push/subscribe — forget a subscription (guest opted out). */
export async function DELETE(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const endpoint = body.endpoint || body.subscription?.endpoint;
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  await removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
