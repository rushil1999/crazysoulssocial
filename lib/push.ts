import webpush from "web-push";
import { Redis } from "@upstash/redis";

/** A browser Push API subscription (what PushManager.subscribe() returns). */
export type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const KEY = "push:subs";
/** email -> endpoints, so one guest's phone can be notified on its own. */
const BY_EMAIL = "push:byEmail";

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
  __pushByEmail?: Map<string, Set<string>>;
};
const memory: Map<string, PushSub> = (globalForPush.__pushSubs ??= new Map());
const memoryByEmail: Map<string, Set<string>> = (globalForPush.__pushByEmail ??=
  new Map());

/**
 * Store (or refresh) a subscription, keyed by its endpoint.
 *
 * `email` is optional and backwards compatible: subscriptions stored without
 * one still receive room-wide pulses, they just can't be addressed
 * individually. Guests who unlocked their matches do supply it, which is what
 * lets a late arrival's own phone buzz without waking the whole bar.
 */
export async function addSubscription(
  sub: PushSub,
  email?: string
): Promise<void> {
  if (redis) {
    await redis.hset(KEY, { [sub.endpoint]: JSON.stringify(sub) });
  } else {
    memory.set(sub.endpoint, sub);
  }
  if (!email) return;

  const key = email.trim().toLowerCase();
  if (redis) {
    const existing =
      (await redis.hget<string[] | string>(BY_EMAIL, key)) ?? null;
    const list =
      typeof existing === "string"
        ? (JSON.parse(existing) as string[])
        : existing ?? [];
    if (!list.includes(sub.endpoint)) {
      await redis.hset(BY_EMAIL, {
        [key]: JSON.stringify([...list, sub.endpoint]),
      });
    }
  } else {
    const set = memoryByEmail.get(key) ?? new Set<string>();
    set.add(sub.endpoint);
    memoryByEmail.set(key, set);
  }
}

async function endpointsFor(emails: string[]): Promise<string[]> {
  const keys = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!keys.length) return [];
  const out = new Set<string>();
  if (redis) {
    const rows = await redis.hmget<Record<string, string[] | string>>(
      BY_EMAIL,
      ...keys
    );
    for (const v of Object.values(rows ?? {})) {
      const list = typeof v === "string" ? (JSON.parse(v) as string[]) : v;
      (list ?? []).forEach((e) => out.add(e));
    }
  } else {
    for (const key of keys) {
      memoryByEmail.get(key)?.forEach((e) => out.add(e));
    }
  }
  return [...out];
}

async function subsFor(endpoints: string[]): Promise<PushSub[]> {
  if (!endpoints.length) return [];
  if (redis) {
    const rows = await redis.hmget<Record<string, PushSub | string>>(
      KEY,
      ...endpoints
    );
    return Object.values(rows ?? {})
      .map((v) => (typeof v === "string" ? (JSON.parse(v) as PushSub) : v))
      .filter(Boolean);
  }
  return endpoints
    .map((e) => memory.get(e))
    .filter((s): s is PushSub => Boolean(s));
}

/**
 * Notify specific guests — used when a round lands, or when a late arrival is
 * paired off the bench. Silently delivers to nobody if those guests never
 * granted push (they'll still see it when the app next polls).
 */
export async function sendPushToEmails(
  emails: string[],
  payload: { title: string; body: string; url?: string }
): Promise<{ sent: number; pruned: number }> {
  if (!pushConfigured) return { sent: 0, pruned: 0 };
  const subs = await subsFor(await endpointsFor(emails));
  return deliver(subs, payload);
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
  return deliver(await allSubscriptions(), payload);
}

/** Shared delivery path for both broadcast and targeted sends. */
async function deliver(
  subs: PushSub[],
  payload: { title: string; body: string; url?: string }
): Promise<{ sent: number; pruned: number }> {
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
