/**
 * Check the Tally field mapper against the real "Beyond Small Talk" form.
 *
 *   npx tsx scripts/check-mapping.ts
 *
 * The labels below are copied verbatim from the live form. If you reword a
 * question, run this: it tells you immediately whether the answer still lands
 * where matching expects it, instead of you finding out from a guest's face.
 *
 * The five that matter are email, name, gender, openTo and howToSpot. Of
 * those, gender and openTo are the only hard constraint in matching — if they
 * stop being recognised, pairing still produces pairs, it just quietly ignores
 * who people said they wanted to meet.
 */

import { mapSubmission, type TallyField } from "../lib/tally";
import { normalizeOpenTo, normalizeGender, eligible } from "../lib/scoring";
import type { Guest } from "../lib/store";

let failures = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

const choice = (label: string, options: string[], chosen: string): TallyField => ({
  key: label.slice(0, 12),
  label,
  type: "MULTIPLE_CHOICE",
  value: [`opt_${options.indexOf(chosen)}`],
  options: options.map((text, i) => ({ id: `opt_${i}`, text })),
});

const text = (label: string, value: string, type = "TEXTAREA"): TallyField => ({
  key: label.slice(0, 12),
  label,
  type,
  value,
});

// ── The real form, page by page ──────────────────────────────────────────────

const fields: TallyField[] = [
  text("First Name", "Testguest", "INPUT_TEXT"),
  text("Last Name", "Mapping", "INPUT_TEXT"),
  text("Phone Number", "+1 415-555-0123", "INPUT_PHONE_NUMBER"),
  {
    key: "consent",
    label: "Consent for text updates",
    type: "CHECKBOXES",
    value: ["c_0"],
    options: [{ id: "c_0", text: "I consent to receive text updates about this event." }],
  },
  text("Email", "testguest.mapping@example.com", "INPUT_EMAIL"),
  text(
    "You clearly stopped aging years ago—but what number is technically on record?",
    "31",
    "INPUT_NUMBER"
  ),
  choice("Gender", ["Man", "Woman", "Prefer not to answer"], "Man"),
  choice(
    "Who are you open to being introduced to tonight?",
    ["Men", "Women", "Open to more than one gender"],
    "Women"
  ),

  choice(
    "A rare Bay Area sunset appears, your playlist is flawless, and there’s only one empty seat. Who gets it—knowing every choice comes with a catch?",
    ["Someone I barely know", "My closest friend", "A career-changing colleague", "A complete stranger"],
    "My closest friend"
  ),
  choice(
    "Your friend invited you to a rooftop party and is now “only 40 minutes late.” You know nobody there. What do you do?",
    ["Walk up to the loudest group", "Find the one person standing alone", "Start talking to the bartender", "Pretend I already know someone"],
    "Find the one person standing alone"
  ),
  choice(
    "Your phone is confiscated for an entire Saturday. You must choose one plan.",
    ["A 6 AM road trip", "Host dinner for eight", "A city crawl", "Learn a useless skill"],
    "A 6 AM road trip"
  ),
  choice(
    "You can join only one table tonight. Which conversation are you choosing?",
    ["The boldest decision", "A debate about ambition", "The strangest thing", "Unwritten rules of friendship"],
    "The boldest decision"
  ),
  choice(
    "A conversation is visibly dying in front of you. How do you rescue it?",
    ["Ask an oddly specific question", "Tell a story", "Pull another person in"],
    "Ask an oddly specific question"
  ),
  choice(
    "You may keep only one Social Superpower",
    ["Make anyone feel comfortable", "Make anyone laugh", "Make anyone open up", "Remember every detail"],
    "Make anyone open up"
  ),

  choice(
    "A free trip leaves tomorrow. Monday is your biggest work opportunity of the year. Pick one.",
    ["Take the trip. Work will survive", "Stay. Some opportunities are worth being boring for"],
    "Take the trip. Work will survive"
  ),
  choice(
    "Pick the compliment you would secretly value most.",
    ["You’re the most interesting person here.", "You make people feel seen.", "You always follow through.", "You make everything more fun."],
    "You make people feel seen."
  ),
  choice(
    "You can attend only one dinner. Who is sitting across from you?",
    ["Someone who built something from nothing", "Someone who has lived in five places", "Someone who changed their life"],
    "Someone who built something from nothing"
  ),
  choice(
    "Which introduction would make you most curious tonight?",
    ["Someone surprisingly similar to me", "Someone whose life looks completely different", "Someone who knows things I don't", "Someone whose energy pulls me out"],
    "Someone whose life looks completely different"
  ),
  choice(
    "What would make tonight genuinely worth leaving home for?",
    ["One conversation I’m still thinking about tomorrow", "Meeting someone new", "Finding people I’d make plans with", "A story worth retelling"],
    "One conversation I’m still thinking about tomorrow"
  ),

  choice(
    "You’re stuck at an airport for four hours. You can spend the time with only one stranger.",
    ["A founder", "A retired traveler", "A comedian", "A scientist"],
    "A founder"
  ),
  choice(
    "You have been speaking to the same person for twenty minutes at a social event. The conversation is good, but you also want to meet others. What do you do?",
    ["Suggest we join another group together", "End it warmly", "Introduce them to someone nearby"],
    "Suggest we join another group together"
  ),
  text("What is your most unexpected flex?", "Can identify any Bollywood song in two seconds"),
  text("What could you confidently teach someone in 1 hour?", "How to beatmatch two tracks"),
  text(
    "Work has unexpectedly granted you a one-month sabbatical. Travel is banned. What are you doing with thirty responsibility-free days?",
    "Build a synth and learn to play it badly"
  ),
  text(
    "And finally, I know your cute smile and personality will make you stand out, but other than that how can someone spot you during the event?",
    "Green corduroy jacket, near the bar"
  ),
];

const { guest, problem, mapping } = mapSubmission({
  eventType: "FORM_RESPONSE",
  data: { submissionId: "test", fields },
});

console.log("\nMapping the live form:\n");

check(!problem, problem ? `no problem reported (got: ${problem})` : "submission accepted");
if (!guest) {
  console.log("\n✗ No guest was built — nothing else can be checked.\n");
  process.exit(1);
}

console.log("The five that matter:");
check(guest.email === "testguest.mapping@example.com", `email → ${guest.email}`);
check(guest.name === "Testguest", `name → ${guest.name} (first name, not last)`);
check(guest.gender === "Man", `gender → ${guest.gender}`);
check(
  Array.isArray(guest.openTo) && guest.openTo.includes("Women"),
  `openTo → ${JSON.stringify(guest.openTo)}`
);
check(
  /green corduroy/i.test(guest.howToSpot ?? ""),
  `howToSpot → ${guest.howToSpot?.slice(0, 40)}…`
);

console.log("\nCard content:");
check(guest.age === 31, `age → ${guest.age} (the question never says "age" or "how old")`);
check(/bollywood/i.test(guest.unexpectedFlex ?? ""), "unexpectedFlex captured");
check(/beatmatch/i.test(guest.canTeach ?? ""), "canTeach captured");
check(/synth/i.test(guest.freeMonth ?? ""), "freeMonth captured");

console.log("\nMatching signals:");
const keys = Object.keys(guest.choices);
check(keys.length === 13, `13 scenario questions became signals (got ${keys.length})`);
check(
  !keys.some((k) => /consent/i.test(k)),
  "the consent checkbox is NOT a matching signal"
);
check(
  !keys.some((k) => /phone/i.test(k)),
  "the phone number is NOT a matching signal"
);
check(
  keys.every((k) => k.length < 40),
  "every signal has a readable name"
);

console.log("\nOrientation parsing:");
const flexible = normalizeOpenTo(["Open to more than one gender"]);
check(flexible.size === 3, `"Open to more than one gender" → ${[...flexible].join(", ") || "(nothing)"}`);
check(normalizeGender("Prefer not to answer") === "unknown", `"Prefer not to answer" → unknown (allowed, matched last)`);
check(normalizeOpenTo(["Men"]).has("man"), `"Men" → man`);
check(normalizeOpenTo(["Women"]).has("woman"), `"Women" → woman`);

// A guest whose `active` flag didn't survive the store round-trip must still be
// pairable. This shipped broken: `filter(g => g.active)` and `if (!a.active)`
// both read a missing flag as "withdrawn", so every guest dropped out and the
// host saw "not enough guests checked in" beside a roster showing several.
console.log("\nResilience:");
{
  const a = { ...guest } as Guest;
  const b: Guest = {
    ...guest,
    email: "other@example.com",
    name: "Other",
    gender: "Woman",
    openTo: ["Men"],
  };
  // Simulate the flag going missing in storage.
  delete (a as Partial<Guest>).active;
  delete (b as Partial<Guest>).active;

  const e = eligible(a, b, new Set<string>());
  check(e.ok, `a guest with no "active" flag is still eligible${e.ok ? "" : ` (got ${e.reason})`}`);

  const withdrawn: Guest = { ...b, active: false };
  const e2 = eligible(a, withdrawn, new Set<string>());
  check(
    !e2.ok && e2.reason === "inactive",
    `an explicitly withdrawn guest is still excluded`
  );
}

console.log("\nEvery question, and where it landed:");
for (const [label, slot] of Object.entries(mapping)) {
  console.log(`  ${slot.padEnd(32)} ${label.slice(0, 68)}${label.length > 68 ? "…" : ""}`);
}

console.log(
  failures === 0
    ? `\n✓ The form maps cleanly — matching has everything it needs.\n`
    : `\n✗ ${failures} check(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
