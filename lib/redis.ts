import { Redis } from "@upstash/redis";
import { createClient, type RedisClientType } from "redis";

/**
 * One place that decides whether there is a Redis to talk to, and how.
 *
 * Two kinds of credential exist in the wild and they are not interchangeable:
 *
 *  • REST — a URL and a token (`UPSTASH_REDIS_REST_*` or `KV_REST_API_*`).
 *    Spoken over HTTP, stateless, ideal for serverless. Preferred.
 *  • TCP — a single `REDIS_URL` (`redis://` / `rediss://`). This is what most
 *    "add Redis" buttons hand you, and what `@upstash/redis` *cannot* use.
 *
 * Supporting both means whichever database the project ends up with, the app
 * works. This previously supported only REST while the project had a
 * REDIS_URL, so the store silently fell back to an in-memory map that lives
 * inside one serverless instance — guests appearing and vanishing depending
 * on which instance answered a request.
 *
 * The check and the client are derived from the same values here, so they
 * cannot drift apart the way three hand-written copies of this logic did.
 */

const restUrl =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const restToken =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const tcpUrl =
  process.env.REDIS_URL || process.env.REDIS_URL_URL || "";

/** The subset of Redis this app uses, as @upstash/redis shapes it. */
export type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  hget<T = unknown>(key: string, field: string): Promise<T | null>;
  hset(key: string, kv: Record<string, string>): Promise<number>;
  hgetall<T = unknown>(key: string): Promise<T | null>;
  hmget<T = unknown>(key: string, ...fields: string[]): Promise<T | null>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers<T = string[]>(key: string): Promise<T>;
  lpush(key: string, ...values: string[]): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
};

/**
 * node-redis over TCP, wrapped to look like the REST client.
 *
 * Connection is lazy and shared: a serverless instance handles many requests,
 * so the client is created once per instance and reconnected if it drops. The
 * in-flight connect is memoised so concurrent requests on a cold instance
 * don't each open a socket.
 */
function tcpClient(url: string): RedisLike {
  const g = globalThis as unknown as {
    __redisTcp?: RedisClientType;
    __redisTcpConnecting?: Promise<unknown> | null;
  };

  async function c(): Promise<RedisClientType> {
    if (!g.__redisTcp) {
      g.__redisTcp = createClient({ url }) as RedisClientType;
      // node-redis throws on unhandled 'error' events. Swallow them here;
      // each command still rejects on its own, which the callers handle.
      g.__redisTcp.on("error", () => {});
    }
    const client = g.__redisTcp;
    if (!client.isOpen) {
      g.__redisTcpConnecting ??= client
        .connect()
        .finally(() => (g.__redisTcpConnecting = null));
      await g.__redisTcpConnecting;
    }
    return client;
  }

  return {
    async get(key) {
      return (await (await c()).get(key)) as never;
    },
    async set(key, value, opts) {
      const client = await c();
      return opts?.ex
        ? client.set(key, value, { EX: opts.ex })
        : client.set(key, value);
    },
    async del(...keys) {
      return keys.length ? (await c()).del(keys) : 0;
    },
    async hget(key, field) {
      const v = await (await c()).hGet(key, field);
      return (v === undefined ? null : v) as never;
    },
    async hset(key, kv) {
      return (await c()).hSet(key, kv);
    },
    async hgetall(key) {
      const v = await (await c()).hGetAll(key);
      // Upstash answers null for a missing hash; node-redis answers {}.
      return (v && Object.keys(v).length ? v : null) as never;
    },
    async hmget(key, ...fields) {
      const vals = await (await c()).hmGet(key, fields);
      // Upstash returns a field->value record; node-redis returns an array.
      const out: Record<string, unknown> = {};
      fields.forEach((f, i) => {
        if (vals[i] !== null && vals[i] !== undefined) out[f] = vals[i];
      });
      return (Object.keys(out).length ? out : null) as never;
    },
    async hdel(key, ...fields) {
      return (await c()).hDel(key, fields);
    },
    async sadd(key, ...members) {
      return (await c()).sAdd(key, members);
    },
    async srem(key, ...members) {
      return (await c()).sRem(key, members);
    },
    async smembers(key) {
      return (await (await c()).sMembers(key)) as never;
    },
    async lpush(key, ...values) {
      return (await c()).lPush(key, values);
    },
    async ltrim(key, start, stop) {
      return (await c()).lTrim(key, start, stop);
    },
    async lrange(key, start, stop) {
      return (await (await c()).lRange(key, start, stop)) as never;
    },
  };
}

/** Which transport is in use, for diagnostics. */
export const redisTransport: "rest" | "tcp" | null =
  restUrl && restToken ? "rest" : tcpUrl ? "tcp" : null;

export const redisConfigured = redisTransport !== null;

export const redis: RedisLike | null =
  redisTransport === "rest"
    ? (new Redis({ url: restUrl, token: restToken }) as unknown as RedisLike)
    : redisTransport === "tcp"
      ? tcpClient(tcpUrl)
      : null;

/**
 * Why there's no Redis, in words a human can act on. Null when all is well.
 * Shown in the host console, so the failure explains itself rather than
 * presenting as data that mysteriously disappears.
 */
export const redisHint: string | null = (() => {
  if (redisConfigured) return null;
  if (restUrl && !restToken) return "Found a Redis REST URL but no token.";
  if (restToken && !restUrl) return "Found a Redis REST token but no URL.";
  return (
    "No Redis is connected. Add one to the Vercel project — either a " +
    "REDIS_URL, or a REST pair (UPSTASH_REDIS_REST_URL and " +
    "UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL and KV_REST_API_TOKEN) — " +
    "then redeploy."
  );
})();
