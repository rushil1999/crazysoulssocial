import type { Guest } from "@/lib/store";

/**
 * Turning a Tally submission into a Guest.
 *
 * Two things about Tally's webhook payload are easy to get wrong:
 *
 *  1. Choice answers (MULTIPLE_CHOICE, CHECKBOXES, DROPDOWN) arrive as arrays
 *     of *option ids*, not the text the guest saw. The readable text is in the
 *     field's own `options` array and has to be looked up.
 *  2. Labels are whatever you typed into the form builder, so nothing here can
 *     hard-code them. Fields are classified by matching the label against the
 *     patterns below, and anything unrecognised is still kept — choice-style
 *     answers feed matching, long text goes to the card writer as context.
 *
 * To check the mapping against your real form, POST a test submission and then
 * GET /api/intake?secret=…&debug=1 — it echoes the last payload's labels next
 * to the slot each one landed in.
 */

export type TallyField = {
  key?: string;
  label?: string;
  type?: string;
  value?: unknown;
  options?: { id?: string; text?: string }[];
};

export type TallyPayload = {
  eventType?: string;
  data?: {
    submissionId?: string;
    respondentId?: string;
    createdAt?: string;
    fields?: TallyField[];
  };
};

/**
 * Questions that are operational rather than personal. These are kept on the
 * guest record but never become matching signals — everyone ticks a consent
 * box, so counting it as a shared answer adds a constant to every pair and
 * compresses the score range, and "you both consented to text updates" is not
 * a conversation starter to put on a card.
 */
const NOT_A_SIGNAL = [
  /consent/i,
  /\bterms\b/i,
  /privacy/i,
  /subscribe/i,
  // Narrow on purpose: a bare /phone/ also swallows "Your phone is
  // confiscated for an entire Saturday", which is a real signal.
  /phone number/i,
];

/** Label patterns, most specific first — the first match wins. */
const SLOTS: { slot: string; test: RegExp }[] = [
  { slot: "email", test: /e-?mail/i },
  // "stopped aging … what number is technically on record" is an age question
  // that says neither "age" nor "how old".
  {
    slot: "age",
    test: /\bage\b|how old|stopped aging|on record|what number is technically/i,
  },
  { slot: "gender", test: /gender|identify as|you identify/i },
  {
    slot: "openTo",
    test: /open to|interested in meeting|introduced to|looking to meet|who.*meet/i,
  },
  { slot: "howToSpot", test: /spot you|find you|wearing|recognise|recognize/i },
  { slot: "unexpectedFlex", test: /flex/i },
  { slot: "canTeach", test: /teach/i },
  { slot: "freeMonth", test: /sabbatical|free month|thirty days|30 days|month off/i },
  { slot: "name", test: /\bname\b/i },
];

const CHOICE_TYPES = new Set([
  "MULTIPLE_CHOICE",
  "CHECKBOXES",
  "DROPDOWN",
  "LINEAR_SCALE",
  "RATING",
  "RANKING",
  "MULTI_SELECT",
]);

/**
 * Optional overrides for how a question is named in a match card's
 * `commonAttributes` and in the card prompt. Keys are matched as
 * case-insensitive substrings of the question label; edit freely.
 */
const CHOICE_LABELS: { test: RegExp; as: string }[] = [
  // Tally sends the whole scenario as the label, not the page heading, so
  // these match the scenario text. Without them a key becomes the first five
  // words ("a rare bay area sunset"), which reads badly on a card.
  { test: /empty seat|rare bay area sunset/i, as: "who gets the empty seat" },
  { test: /rooftop party|40 minutes late/i, as: "walking in alone" },
  { test: /phone is confiscated/i, as: "ideal free Saturday" },
  { test: /join only one table/i, as: "conversation they'd pick" },
  { test: /conversation is visibly dying/i, as: "rescuing a conversation" },
  { test: /social superpower/i, as: "social superpower" },
  { test: /free trip leaves tomorrow|work opportunity/i, as: "travel vs work" },
  { test: /compliment/i, as: "valued compliment" },
  { test: /only one dinner|sitting across/i, as: "ideal dinner guest" },
  { test: /which introduction/i, as: "who they're curious about" },
  { test: /worth leaving home/i, as: "what makes a night worth it" },
  { test: /stuck at an airport/i, as: "airport companion" },
  { test: /twenty minutes/i, as: "leaving a conversation" },
  { test: /natural rhythm/i, as: "natural rhythm" },
  { test: /difficult choice|unnecessarily difficult/i, as: "difficult choices" },
  { test: /reveal more/i, as: "reveals more than intended" },
];

/** A readable, stable key for a choice question. */
function choiceKey(label: string): string {
  for (const { test, as } of CHOICE_LABELS) if (test.test(label)) return as;
  return label
    .replace(/[?:.!]/g, "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
}

/** Resolve a field's value to readable text, following option ids. */
function readable(field: TallyField): string {
  const { value, options } = field;
  if (value === null || value === undefined) return "";

  const lookup = (v: unknown): string => {
    const s = String(v);
    const hit = options?.find((o) => o.id === s);
    return (hit?.text ?? s).trim();
  };

  if (Array.isArray(value)) {
    return value.map(lookup).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    // Tally occasionally nests ({ url, name } for uploads, etc.)
    const obj = value as Record<string, unknown>;
    return String(obj.text ?? obj.name ?? obj.url ?? "").trim();
  }
  if (typeof value === "boolean") return value ? "yes" : "";
  return lookup(value);
}

export type Mapped = {
  guest: Guest | null;
  /** Why we couldn't build a guest — surfaced to the host, not the webhook. */
  problem?: string;
  /** label -> slot, for debugging the mapping against a real form. */
  mapping: Record<string, string>;
};

/**
 * Build a Guest from a Tally payload. Returns `problem` rather than throwing
 * when the submission has no usable email — on the night, one malformed
 * submission must not take the endpoint down.
 */
export function mapSubmission(payload: TallyPayload, now = Date.now()): Mapped {
  const fields = payload.data?.fields ?? [];
  const mapping: Record<string, string> = {};

  let email = "";
  let name = "";
  let age: number | undefined;
  let gender: string | undefined;
  let openTo: string[] | undefined;
  let howToSpot: string | undefined;
  let unexpectedFlex: string | undefined;
  let canTeach: string | undefined;
  let freeMonth: string | undefined;
  const choices: Record<string, string> = {};
  const extra: Record<string, string> = {};

  for (const field of fields) {
    const label = (field.label ?? field.key ?? "").trim();
    const text = readable(field);
    const type = (field.type ?? "").toUpperCase();

    // An email-typed field wins regardless of what the label says.
    if (type === "INPUT_EMAIL" && text.includes("@")) {
      email = text;
      mapping[label] = "email";
      continue;
    }

    const slot = SLOTS.find((s) => s.test.test(label))?.slot;

    if (slot && text) {
      mapping[label] = slot;
      switch (slot) {
        case "email":
          email = text;
          continue;
        case "name":
          // Don't let a later "name" question overwrite the first one.
          if (!name) name = text;
          continue;
        case "age": {
          const n = parseInt(text.replace(/\D/g, ""), 10);
          if (Number.isFinite(n) && n > 0 && n < 120) age = n;
          continue;
        }
        case "gender":
          gender = text;
          continue;
        case "openTo":
          openTo = text.split(/,\s*/).filter(Boolean);
          continue;
        case "howToSpot":
          howToSpot = text;
          continue;
        case "unexpectedFlex":
          unexpectedFlex = text;
          continue;
        case "canTeach":
          canTeach = text;
          continue;
        case "freeMonth":
          freeMonth = text;
          continue;
      }
    }

    if (!text) {
      if (label) mapping[label] = "(blank)";
      continue;
    }

    if (NOT_A_SIGNAL.some((re) => re.test(label))) {
      extra[label] = text;
      mapping[label] = "kept, not used for matching";
    } else if (CHOICE_TYPES.has(type)) {
      choices[choiceKey(label)] = text;
      mapping[label] = `choice: ${choiceKey(label)}`;
    } else {
      extra[label] = text;
      mapping[label] = "extra (card context)";
    }
  }

  if (!email || !email.includes("@")) {
    return {
      guest: null,
      problem: "Submission had no email address, so there's nothing to key it to.",
      mapping,
    };
  }

  return {
    guest: {
      email: email.trim().toLowerCase(),
      name: name || email.split("@")[0],
      age,
      gender,
      openTo,
      choices,
      howToSpot,
      unexpectedFlex,
      canTeach,
      freeMonth,
      extra: Object.keys(extra).length ? extra : undefined,
      arrivedAt: now,
      rounds: [],
      active: true,
    },
    mapping,
  };
}

/**
 * Verify Tally's `tally-signature` header: base64 HMAC-SHA256 of the raw body.
 * Only enforced when TALLY_SIGNING_SECRET is set.
 */
export async function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody)
  );
  const expected = Buffer.from(mac).toString("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim());
  if (a.length !== b.length) return false;
  // Constant-time compare.
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
