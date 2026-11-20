import { Redis } from "@upstash/redis";

/**
 * One place that decides whether there is a Redis to talk to.
 *
 * This used to be duplicated in store.ts, pulses.ts and push.ts, and the
 * copies had drifted from the client they were guarding: each checked only
 * `KV_REST_API_*`, while `Redis.fromEnv()` accepts either `UPSTASH_REDIS_REST_*`
 * or `KV_REST_API_*`. A provider that set the Upstash-named pair therefore
 * passed the client's own check but failed ours, and the app fell back to its
 * in-memory store without saying anything — guests appearing and vanishing
 * depending on which serverless instance answered.
 *
 * Note this client speaks HTTP, not the Redis wire protocol. A `REDIS_URL`
 * (redis:// or rediss://) is a TCP connection string and cannot be used here,
 * which is a very easy thing to provision by mistake — hence `redisHint`.
 */

const url =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

/** True when a REST-capable Redis is configured. */
export const redisConfigured = Boolean(url && token);

export const redis = redisConfigured ? new Redis({ url, token }) : null;

/**
 * Why there's no Redis, in words a human can act on. Null when all is well.
 * Shown in the host console, so the failure explains itself instead of
 * presenting as data that mysteriously disappears.
 */
export const redisHint: string | null = (() => {
  if (redisConfigured) return null;

  if (process.env.REDIS_URL) {
    return (
      "A REDIS_URL is set, but this app talks to Redis over HTTP and needs " +
      "REST credentials. Provision a REST-capable Redis (Upstash) so the " +
      "project gets UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or " +
      "KV_REST_API_URL and KV_REST_API_TOKEN. A TCP REDIS_URL cannot be used."
    );
  }
  if (url && !token) return "Found a Redis REST URL but no token.";
  if (token && !url) return "Found a Redis REST token but no URL.";
  return (
    "No Redis is connected. Add a REST-capable Redis (Upstash) to the Vercel " +
    "project so it sets UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN " +
    "(or KV_REST_API_URL and KV_REST_API_TOKEN), then redeploy."
  );
})();
