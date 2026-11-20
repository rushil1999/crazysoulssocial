/**
 * A tiny Upstash-REST-compatible server for local testing. Dev only.
 *
 *   node scripts/redis-shim.cjs &
 *   UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079 \
 *   UPSTASH_REDIS_REST_TOKEN=shim \
 *   PULSE_ADMIN_SECRET=dev npm run dev
 *
 * Why this exists: without it, `npm run dev` has no Redis, so the app falls
 * back to its in-memory store — which holds the live JavaScript object and
 * therefore never exercises serialisation. A field that does not survive the
 * round-trip looks perfect locally and breaks in production. That is exactly
 * how `Guest.active` came to be dropped, emptying the room on the night while
 * every local test passed.
 *
 * Values are stored as strings, as Redis does, so the round-trip is faithful.
 */
const http = require("http");

const kv = new Map();     // string -> string
const hashes = new Map(); // string -> Map<string,string>
const sets = new Map();   // string -> Set<string>
const lists = new Map();  // string -> string[]

const s = (v) => (typeof v === "string" ? v : JSON.stringify(v));

function run(cmd) {
  const [rawName, ...a] = cmd;
  const name = String(rawName).toUpperCase();
  switch (name) {
    case "GET":
      return kv.has(s(a[0])) ? kv.get(s(a[0])) : null;
    case "SET":
      kv.set(s(a[0]), s(a[1]));
      return "OK";
    case "DEL": {
      let n = 0;
      for (const k of a.map(s)) {
        if (kv.delete(k)) n++;
        if (hashes.delete(k)) n++;
        if (sets.delete(k)) n++;
        if (lists.delete(k)) n++;
      }
      return n;
    }
    case "EXISTS":
      return a.map(s).filter((k) => kv.has(k) || hashes.has(k)).length;
    case "HSET": {
      const key = s(a[0]);
      const h = hashes.get(key) ?? new Map();
      for (let i = 1; i < a.length; i += 2) h.set(s(a[i]), s(a[i + 1]));
      hashes.set(key, h);
      return (a.length - 1) / 2;
    }
    case "HGET": {
      const h = hashes.get(s(a[0]));
      return h && h.has(s(a[1])) ? h.get(s(a[1])) : null;
    }
    case "HGETALL": {
      const h = hashes.get(s(a[0]));
      if (!h) return [];
      const out = [];
      for (const [k, v] of h) out.push(k, v);
      return out;
    }
    case "HMGET": {
      const h = hashes.get(s(a[0]));
      return a.slice(1).map((f) => (h && h.has(s(f)) ? h.get(s(f)) : null));
    }
    case "HDEL": {
      const h = hashes.get(s(a[0]));
      if (!h) return 0;
      let n = 0;
      for (const f of a.slice(1).map(s)) if (h.delete(f)) n++;
      return n;
    }
    case "SADD": {
      const key = s(a[0]);
      const set = sets.get(key) ?? new Set();
      let n = 0;
      for (const m of a.slice(1).map(s)) if (!set.has(m)) { set.add(m); n++; }
      sets.set(key, set);
      return n;
    }
    case "SREM": {
      const set = sets.get(s(a[0]));
      if (!set) return 0;
      let n = 0;
      for (const m of a.slice(1).map(s)) if (set.delete(m)) n++;
      return n;
    }
    case "SMEMBERS":
      return [...(sets.get(s(a[0])) ?? [])];
    case "LPUSH": {
      const key = s(a[0]);
      const l = lists.get(key) ?? [];
      for (const v of a.slice(1).map(s)) l.unshift(v);
      lists.set(key, l);
      return l.length;
    }
    case "LTRIM": {
      const key = s(a[0]);
      const l = lists.get(key) ?? [];
      lists.set(key, l.slice(Number(a[1]), Number(a[2]) + 1));
      return "OK";
    }
    case "LRANGE": {
      const l = lists.get(s(a[0])) ?? [];
      const stop = Number(a[2]);
      return l.slice(Number(a[1]), stop === -1 ? undefined : stop + 1);
    }
    default:
      throw new Error(`shim does not implement ${name}`);
  }
}

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      try {
        const parsed = JSON.parse(body || "[]");
        const isPipeline = req.url.includes("pipeline") || Array.isArray(parsed[0]);
        const out = isPipeline
          ? parsed.map((c) => ({ result: run(c) }))
          : { result: run(parsed) };
        res.end(JSON.stringify(out));
      } catch (e) {
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
  })
  .listen(8079, () => console.log("upstash-rest shim on :8079"));
