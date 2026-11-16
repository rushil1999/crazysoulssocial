# AI matching prompt

> **This is now automated.** The app writes cards itself — see
> [event-night.md](event-night.md). Two things changed in the move:
>
> 1. **Who gets paired is decided in code, not by the model** (`lib/scoring.ts`
>    and `lib/pairing.ts`). Pairing is instant, reproducible, and previewable
>    before you commit it, and it enforces what the model can't be trusted to —
>    no repeats across rounds, no double-bookings, and no introduction outside
>    what both guests said they were open to.
> 2. **The model only writes the card** for a pair that's already chosen. That
>    prompt lives in `lib/cards.ts` and is the one below, adapted to produce
>    both directions of a pair in one call.
>
> Keep this file, `lib/cards.ts`, and the `Match` type in `lib/data.ts` in sync.
> The manual recipe below still works if you ever need to hand-build a round.

Copy everything in the **Prompt** block below into your LLM (ChatGPT/Claude),
then paste in each pair of guests' "Beyond Small Talk" form answers. The model
returns JSON you drop straight into `data/matches.json` (round 1) or
`data/matches_N.json` (later rounds).

Keep this file in sync with the `Match` type in `lib/data.ts` and the schema
section of the `README`. **Every field must trace back to a form answer** — a
direct answer or a faithful synthesis of the two people's answers. The form asks
no job, hobby, or photo questions, so there is no `role`, `location`, `interests`,
or `photo`.

---

## Prompt

You are matching guests at "Crazy Souls," a small in-person singles mixer. Each
guest filled out the "Beyond Small Talk" form. I will give you two guests' answers.
Produce ONE JSON object for the reveal card that **Guest A** sees about **Guest B**
(their match). Everything you write must come from the form answers — either a
direct answer or a faithful summary of the two people's answers. Do NOT invent
facts (appearance, job, hobbies) that the form did not capture.

### The form answers you'll receive, per guest

Identity: first name, age, gender, who they're open to meeting.
Multiple-choice personality scenarios ("What's Your Natural Rhythm?",
"Unnecessarily difficult choices", "This May Reveal More Than Intended").
Open-text answers:
- **most unexpected flex**
- **what they could confidently teach someone in 1 hour**
- **one-month sabbatical, travel banned — what they'd do with 30 free days**
- **how can someone spot you during the event?**

### Output — a single JSON object, no prose around it

```json
{
  "<guestB_email>": {
    "name": "<Guest B first name>",
    "praise": "<2–3 warm sentences to Guest B about their OWN answers>",
    "matches": [
      {
        "name": "<Guest B first name>",
        "age": <number>,
        "vibe": "<one line on how Guest B moves socially, from their Natural-Rhythm picks>",
        "howToSpot": "<Guest B's own answer to 'how can someone spot you during the event?'>",
        "compatibility": <0-100 integer match score>,
        "whyMatched": "<2–3 sentences on why A and B fit, citing their actual overlapping answers>",
        "commonAttributes": ["<3–4 short shared traits drawn from overlapping answers>"],
        "unexpectedFlex": "<Guest B's 'most unexpected flex' answer>",
        "canTeach": "<Guest B's 'teach in 1 hour' answer>",
        "freeMonth": "<Guest B's sabbatical-month answer>",
        "iceBreakers": ["<2 openers grounded in B's answers or the A–B overlap>"],
        "whatToTalkAbout": "<1–2 sentences of topics that will land, from their answers>",
        "quirkyComment": "<1 fun closing line about the pairing — the ONE field allowed light flavor>"
      }
    ]
  }
}
```

### Field rules

- **Required:** `name`, `whyMatched`, `commonAttributes`, `iceBreakers`,
  `whatToTalkAbout`, `quirkyComment`.
- **Direct copies of Guest B's answers** (do not paraphrase away their voice):
  `howToSpot`, `unexpectedFlex`, `canTeach`, `freeMonth`, `age`. If a guest left
  one blank, **omit that field** (don't invent it) — the card hides absent fields.
- **`howToSpot`** is exactly Guest B's spot answer (what they're wearing / where
  they'll be). This is how A physically finds B — never guess it; if B didn't
  answer, omit it.
- **Synthesized (must stay grounded in the answers):** `vibe`, `whyMatched`,
  `commonAttributes`, `iceBreakers`, `whatToTalkAbout`, `compatibility`.
- **`quirkyComment`** is the only field where light, playful flavor is allowed —
  and even then it should riff on their actual shared answers.
- Gender, "open to being introduced to," and SMS consent are for MATCHING and
  ops only. **Never put them in the card JSON.**
- Output only the JSON. To produce both sides of a pair, run it twice (A-sees-B,
  then B-sees-A) or return both keyed entries in one object.

---

## Example output

```json
{
  "bob@example.com": {
    "name": "Bob",
    "praise": "You read a room the way most people read a menu — quickly, and with a plan. Warm, curious, and just mischievous enough.",
    "matches": [
      {
        "name": "Bob",
        "age": 30,
        "vibe": "The one who finds the person standing alone and quietly makes them the center of the night.",
        "howToSpot": "Navy linen shirt and tortoise-shell glasses — near the record player.",
        "compatibility": 91,
        "whyMatched": "You both chase curiosity over comfort, and you both said the compliment you'd secretly value most is 'you make people feel seen.'",
        "commonAttributes": ["Both chase curiosity over comfort", "Would take the 6am road trip", "Value being made to feel seen"],
        "unexpectedFlex": "Can name almost any song within the first two seconds.",
        "canTeach": "How to order wine without pretending to know anything about wine.",
        "freeMonth": "Build the analog synth he's been collecting parts for and record an album.",
        "iceBreakers": ["Ask which song he can name in two seconds flat — then try to stump him.", "Compare the boldest decision you each made without knowing it would work."],
        "whatToTalkAbout": "The boldest decisions you each made, comfort books, and the best cheap eats in town.",
        "quirkyComment": "Fair warning: you two might out-pun the entire room by 8pm."
      }
    ]
  }
}
```
