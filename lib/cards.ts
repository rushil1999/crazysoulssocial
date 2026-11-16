import type { Guest, Match } from "@/lib/store";

/**
 * Card writing.
 *
 * Pairing is already decided by the time we get here (lib/pairing.ts), so the
 * model's only job is prose: why these two fit, what to talk about, two
 * openers. That split matters on the night — pairing is instant and
 * deterministic, and this step is the only one that can be slow or flaky.
 *
 * If ANTHROPIC_API_KEY is missing, or the call fails, or the model returns
 * something unparseable, we fall back to a card built straight from the form
 * answers. It reads a little flatter, but it is never wrong and it never
 * blocks the room. Nothing in either path invents a fact the form didn't
 * capture.
 *
 * Mirrors docs/matching-prompt.md — keep the two in sync.
 */

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export const cardsConfigured = Boolean(API_KEY);

export type CardPair = {
  /** What A sees about B. */
  aSeesB: Match;
  /** What B sees about A. */
  bSeesA: Match;
  /** Warm line for A about A's own answers. */
  praiseA: string;
  /** Warm line for B about B's own answers. */
  praiseB: string;
  /** True when this came from the model rather than the fallback. */
  generated: boolean;
};

function firstName(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || name;
}

function clean(v?: string): string | undefined {
  const s = (v ?? "").trim();
  return s.length > 1 ? s : undefined;
}

/** Guest answers as the model should see them — labelled, nothing invented. */
function describe(g: Guest, label: string): string {
  const lines: string[] = [`### ${label}`, `First name: ${firstName(g.name)}`];
  if (typeof g.age === "number") lines.push(`Age: ${g.age}`);

  const choices = Object.entries(g.choices).filter(([, v]) => clean(v));
  if (choices.length) {
    lines.push("Multiple-choice answers:");
    for (const [key, value] of choices) lines.push(`  - ${key}: ${value}`);
  }

  const long: [string, string | undefined][] = [
    ["Most unexpected flex", clean(g.unexpectedFlex)],
    ["Could teach in 1 hour", clean(g.canTeach)],
    ["One free month, travel banned", clean(g.freeMonth)],
    ["How to spot them at the event", clean(g.howToSpot)],
  ];
  for (const [k, v] of long) if (v) lines.push(`${k}: ${v}`);

  for (const [k, v] of Object.entries(g.extra ?? {})) {
    if (clean(v)) lines.push(`${k}: ${v}`);
  }
  return lines.join("\n");
}

function buildPrompt(
  a: Guest,
  b: Guest,
  compatibility: number,
  shared: { key: string; answer: string }[]
): string {
  const sharedText = shared.length
    ? shared.map((s) => `  - ${s.key}: both answered "${s.answer}"`).join("\n")
    : "  (none — lean on contrast and complementary answers instead)";

  return `You are writing reveal cards for "Crazy Souls," a small in-person singles mixer. Two guests have already been matched to each other by a scoring system. Your job is only to write the two cards they each see.

Everything you write must come from the answers below — a direct answer or a faithful synthesis. Do NOT invent appearance, job, hobbies, location, or anything else the form did not capture. If an answer is missing, omit that field rather than guessing.

${describe(a, "Guest A")}

${describe(b, "Guest B")}

Answers they gave identically:
${sharedText}

Their compatibility score is ${compatibility}. Use exactly this number.

Write warm, specific, grown-up prose. No emoji. No pick-up-artist tone. Address the reader as "you". Cite their actual answers — a card that could have been written about anyone has failed.

Return ONLY a JSON object, no prose around it, no markdown fence:

{
  "praiseA": "2 sentences to Guest A about GUEST A'S OWN answers — what their answers suggest about them. Never mentions Guest B.",
  "praiseB": "2 sentences to Guest B about GUEST B'S OWN answers. Never mentions Guest A.",
  "aSeesB": {
    "name": "<Guest B first name>",
    "age": <Guest B age, omit if unknown>,
    "vibe": "<one line on how Guest B moves socially, from their choice answers>",
    "howToSpot": "<Guest B's spot answer, near-verbatim; omit the field if they didn't answer>",
    "compatibility": ${compatibility},
    "whyMatched": "<2-3 sentences on why A and B fit, citing their actual overlapping answers>",
    "commonAttributes": ["<3-4 short shared traits, each drawn from a real overlap>"],
    "unexpectedFlex": "<Guest B's flex, verbatim; omit if blank>",
    "canTeach": "<Guest B's teach answer, verbatim; omit if blank>",
    "freeMonth": "<Guest B's free-month answer, verbatim; omit if blank>",
    "iceBreakers": ["<2 openers A can actually say out loud, grounded in B's answers>"],
    "whatToTalkAbout": "<1-2 sentences of topics that will land>",
    "quirkyComment": "<1 playful closing line about the pairing — the only place flavor is allowed>"
  },
  "bSeesA": { ...same shape, but about Guest A, written for Guest B... }
}`;
}

type RawCard = Partial<Match> & Record<string, unknown>;

function coerce(raw: RawCard, subject: Guest, compatibility: number): Match {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;

  return {
    name: str(raw.name) ?? firstName(subject.name),
    age: typeof raw.age === "number" ? raw.age : subject.age,
    vibe: str(raw.vibe),
    // Never let the model rewrite how to find someone in a dark bar.
    howToSpot: clean(subject.howToSpot) ?? str(raw.howToSpot),
    compatibility,
    whyMatched: str(raw.whyMatched) ?? "You answered a lot of the same things.",
    commonAttributes: arr(raw.commonAttributes).slice(0, 4),
    unexpectedFlex: clean(subject.unexpectedFlex),
    canTeach: clean(subject.canTeach),
    freeMonth: clean(subject.freeMonth),
    iceBreakers: arr(raw.iceBreakers).slice(0, 2),
    whatToTalkAbout: str(raw.whatToTalkAbout) ?? "",
    quirkyComment: str(raw.quirkyComment) ?? "",
  };
}

/** Card built from answers alone — used when the model isn't available. */
export function fallbackCard(
  subject: Guest,
  compatibility: number,
  shared: { key: string; answer: string }[]
): Match {
  const name = firstName(subject.name);
  const ice: string[] = [];
  if (clean(subject.unexpectedFlex)) {
    ice.push(`Ask about this: "${subject.unexpectedFlex!.trim()}"`);
  }
  if (clean(subject.canTeach)) {
    ice.push(
      `${name} said they could teach someone "${subject.canTeach!.trim()}" in an hour — get them to try.`
    );
  }
  if (ice.length < 2 && clean(subject.freeMonth)) {
    ice.push(
      `Ask what they'd really do with a free month: "${subject.freeMonth!.trim()}"`
    );
  }
  if (!ice.length) ice.push(`Start with what brought ${name} out tonight.`);

  const commonAttributes = shared.slice(0, 4).map((s) => s.key);
  const why = shared.length
    ? `You two answered the same way on ${shared
        .slice(0, 3)
        .map((s) => s.key)
        .join(", ")} — that's where to start.`
    : `Different answers across the board, which usually makes for the better conversation.`;

  const topics = [
    clean(subject.canTeach) && `what ${name} can teach`,
    clean(subject.freeMonth) && `how they'd spend a free month`,
    shared[0] && shared[0].key,
  ].filter(Boolean);

  return {
    name,
    age: subject.age,
    vibe: undefined,
    howToSpot: clean(subject.howToSpot),
    compatibility,
    whyMatched: why,
    commonAttributes,
    unexpectedFlex: clean(subject.unexpectedFlex),
    canTeach: clean(subject.canTeach),
    freeMonth: clean(subject.freeMonth),
    iceBreakers: ice.slice(0, 2),
    whatToTalkAbout: topics.length
      ? `Try ${topics.join(", ")}.`
      : `Find out what you have in common — the form says you're worth each other's time.`,
    quirkyComment: `Go find ${name}.`,
  };
}

function fallbackPair(
  a: Guest,
  b: Guest,
  compatibility: number,
  shared: { key: string; answer: string }[]
): CardPair {
  return {
    aSeesB: fallbackCard(b, compatibility, shared),
    bSeesA: fallbackCard(a, compatibility, shared),
    praiseA: `Your answers were specific, which is rarer than it sounds.`,
    praiseB: `Your answers were specific, which is rarer than it sounds.`,
    generated: false,
  };
}

function extractJson(text: string): RawCard | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as RawCard;
  } catch {
    return null;
  }
}

/**
 * Write both cards for one pair. Never throws and never leaves you without a
 * card — a failure degrades to the deterministic version.
 */
export async function writeCards(
  a: Guest,
  b: Guest,
  compatibility: number,
  shared: { key: string; answer: string }[],
  opts: { timeoutMs?: number; attempts?: number } = {}
): Promise<CardPair> {
  if (!API_KEY) return fallbackPair(a, b, compatibility, shared);

  const timeoutMs = opts.timeoutMs ?? 45_000;
  const attempts = opts.attempts ?? 2;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          messages: [
            { role: "user", content: buildPrompt(a, b, compatibility, shared) },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // 429 and 5xx are worth another go; a 400 won't fix itself.
        if (res.status === 429 || res.status >= 500) continue;
        break;
      }

      const data = (await res.json()) as {
        content?: { type: string; text?: string }[];
      };
      const text =
        data.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("\n") ?? "";

      const parsed = extractJson(text);
      const aSeesB = parsed?.aSeesB as RawCard | undefined;
      const bSeesA = parsed?.bSeesA as RawCard | undefined;
      if (!parsed || !aSeesB || !bSeesA) continue;

      const praiseA =
        typeof parsed.praiseA === "string" && parsed.praiseA.trim()
          ? parsed.praiseA.trim()
          : `Your answers were specific, which is rarer than it sounds.`;
      const praiseB =
        typeof parsed.praiseB === "string" && parsed.praiseB.trim()
          ? parsed.praiseB.trim()
          : `Your answers were specific, which is rarer than it sounds.`;

      return {
        aSeesB: coerce(aSeesB, b, compatibility),
        bSeesA: coerce(bSeesA, a, compatibility),
        praiseA,
        praiseB,
        generated: true,
      };
    } catch {
      /* abort or network — retry, then fall back */
    } finally {
      clearTimeout(timer);
    }
  }

  return fallbackPair(a, b, compatibility, shared);
}

/**
 * Write every pair's cards, a few at a time. Bounded concurrency keeps us
 * under the API's rate limit while still finishing a 15-pair round in roughly
 * the time of three sequential calls.
 */
export async function writeAllCards(
  jobs: {
    a: Guest;
    b: Guest;
    compatibility: number;
    shared: { key: string; answer: string }[];
  }[],
  concurrency = 5
): Promise<CardPair[]> {
  const out = new Array<CardPair>(jobs.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= jobs.length) return;
      const job = jobs[i];
      out[i] = await writeCards(job.a, job.b, job.compatibility, job.shared);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, worker)
  );
  return out;
}
