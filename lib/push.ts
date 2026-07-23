import webpush from "web-push";
import { Redis } from "@upstash/redis";

/** A browser Push API subscription (what PushManager.subscribe() returns). */
export type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const KEY = "push:subs";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

/** Web push is only usable once VAPID keys are configured. */
export const pushConfigured = Boolean(publicKey && privateKey);
if (pushConfigured) {
  webpush.setVapidDetails(subject, publicKey!, privateKey!);
}

// Same Redis-or-in-memory story as lib/pulses.ts: real deploys have the Vercel
// Redis env vars; local dev without them falls back to a globalThis-pinned map
// (survives Next dev recompiles).
const hasRedis = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);
const redis = hasRedis ? Redis.fromEnv() : null;

const globalForPush = globalThis as unknown as {
  __pushSubs?: Map<string, PushSub>;
};
const memory: Map<string, PushSub> = (globalForPush.__pushSubs ??= new Map());

/** Store (or refresh) a subscription, keyed by its endpoint. */
export async function addSubscription(sub: PushSub): Promise<void> {
  if (redis) {
    await redis.hset(KEY, { [sub.endpoint]: JSON.stringify(sub) });
  } else {
    memory.set(sub.endpoint, sub);
  }
}

/** Forget a subscription (e.g. after the browser reports it's gone). */
export async function removeSubscription(endpoint: string): Promise<void> {
  if (redis) {
    await redis.hdel(KEY, endpoint);
  } else {
    memory.delete(endpoint);
  }
}

async function allSubscriptions(): Promise<PushSub[]> {
  if (redis) {
    const map = (await redis.hgetall<Record<string, PushSub | string>>(KEY)) || {};
    return Object.values(map).map((v) =>
      typeof v === "string" ? (JSON.parse(v) as PushSub) : v
    );
  }
  return [...memory.values()];
}

/**
 * Fan a notification out to every stored subscription. Dead subscriptions
 * (404/410 from the push service) are pruned. Never throws — a push failure
 * must not break firing the pulse.
 */
export async function sendPushToAll(payload: {
  title: string;
  body: string;
  url?: string;
}): Promise<{ sent: number; pruned: number }> {
  if (!pushConfigured) return { sent: 0, pruned: 0 };
  const subs = await allSubscriptions();
  const data = JSON.stringify(payload);

  let sent = 0;
  let pruned = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, data);
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await removeSubscription(sub.endpoint);
          pruned++;
        }
        // Other errors (network, 5xx) are ignored — best-effort delivery.
      }
    })
  );
  return { sent, pruned };
}
