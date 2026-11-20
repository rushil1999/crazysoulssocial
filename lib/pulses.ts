import { redis } from "@/lib/redis";

/**
 * A single audience "pulse" — an anonymous fun fact broadcast to the whole room
 * (e.g. "Someone in the room knows how to surf 🏄"). Not tied to any guest.
 */
export type Pulse = {
  id: string;
  text: string;
  at: number; // ms since epoch when it was fired
};

const KEY = "pulses";
const MAX = 50; // keep only the most recent N

/**
 * Redis client from the Vercel Redis integration's injected env vars
 * (KV_REST_API_URL / KV_REST_API_TOKEN). If they're absent — e.g. local
 * `npm run dev` with no store provisioned — we fall back to an in-process
 * array so the feature still works end-to-end locally.
 *
 * NOTE: the in-memory fallback is per-process and NOT for production. Real
 * deploys have the env vars and use Redis (shared across serverless instances).
 */


// Dev-only in-memory store, newest-first to mirror the Redis LPUSH order.
// Pinned to globalThis so it survives Next.js dev module recompilation/HMR
// (a fresh module eval would otherwise reset a plain module-level array).
const globalForPulses = globalThis as unknown as { __pulseMemory?: Pulse[] };
const memory: Pulse[] = (globalForPulses.__pulseMemory ??= []);

/** Fire a new pulse to the room. Returns the stored pulse. */
export async function addPulse(text: string): Promise<Pulse> {
  const pulse: Pulse = {
    id: crypto.randomUUID(),
    text,
    at: Date.now(),
  };
  if (redis) {
    await redis.lpush(KEY, JSON.stringify(pulse));
    await redis.ltrim(KEY, 0, MAX - 1);
  } else {
    memory.unshift(pulse);
    memory.length = Math.min(memory.length, MAX);
  }
  return pulse;
}

/** Read the newest-first list of stored pulses (up to MAX). */
async function readAll(): Promise<Pulse[]> {
  if (redis) {
    // Upstash auto-deserializes JSON strings back into objects.
    const raw = await redis.lrange<Pulse | string>(KEY, 0, MAX - 1);
    return raw.map((p) => (typeof p === "string" ? (JSON.parse(p) as Pulse) : p));
  }
  return memory.slice();
}

/** Pulses fired strictly after `sinceMs`, returned oldest-first for the client. */
export async function getPulsesSince(sinceMs: number): Promise<Pulse[]> {
  const all = await readAll();
  return all.filter((p) => p.at > sinceMs).sort((a, b) => a.at - b.at);
}

/** The latest `n` pulses (oldest-first) for initial feed hydration. */
export async function getRecent(n = 30): Promise<Pulse[]> {
  const all = await readAll();
  return all.slice(0, n).sort((a, b) => a.at - b.at);
}

/** Clear every pulse (host reset before an event). */
export async function clearPulses(): Promise<void> {
  if (redis) {
    await redis.del(KEY);
  } else {
    memory.length = 0;
  }
}
