# Crazy Souls — Staged Match Reveal

An elegant, suspense-building web app for a singles mixer. You share **one
common link** with everyone; each guest enters the **email they signed up
with**, reads a personalized note about their answers, then unlocks their
matches **one at a time** behind live countdowns — full with why-you-matched,
shared interests, ice breakers, talking points, and a quirky comment.

Built with Next.js (App Router), Tailwind, Framer Motion, and canvas-confetti.

---

## Two ways to run an event

**Live (use this).** Guests fill the Tally form, the submissions arrive by
webhook, and you pair the room from `/host` on your phone: preview, commit,
done. Matches appear on guests' phones immediately — no commit, no redeploy.
Late arrivals are paired automatically against whoever is still waiting.

→ **[docs/event-night.md](docs/event-night.md)** is the runbook. Start there.

```
Tally form ──▶ /api/intake ──▶ roster (Redis)
                                  │
             /host ── preview ────┤  deterministic pairing: orientation
                   └─ commit ─────┤  respected, nobody repeated
                                  ▼
                        cards (Redis) ──▶ /api/unlock, /api/match
                                  │              (time-gated)
                                  └──▶ web push to the two phones involved
```

**Static (what July ran on).** Matches hand-written into `data/matches*.json`
and shipped with a redeploy. Everything below the "How the data works" heading
describes this path. It still works, unchanged — those files are read whenever
a guest has no live data, so past events and their links keep resolving. You
only need it as a fallback.

The thing that forced a redeploy was never the design, it was the static
`import` in `lib/data.ts`: a bundled JSON file is frozen into the build. The
live path reads the same shapes out of the Redis store that already powers
pulses and push.

---

## Quick start (local)

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and enter `alice@example.com` (sample data) to
walk through the whole experience.

> Access is by **email only** — the site root (`/`) is the shared entry point
> for everyone. Old per-person links (`/m/<anything>`) still work and show the
> same email prompt, so nothing breaks if you'd already shared one.

---

## How the data works

Two files under `data/`:

### `data/schedule.json` — when matches unlock (one file, per round)

```json
{
  "_comment": "California/Pacific time. See below.",
  "rounds": {
    "1": ["2026-07-19T19:00:00-07:00"],
    "2": ["2026-07-20T00:40:00-07:00", "2026-07-20T01:10:00-07:00"]
  }
}
```

- **One schedule file**, with reveal times grouped by round. Within a round,
  index 0 gates that round's match 1, index 1 gates match 2, etc.
- Times are **California / Pacific** ISO 8601: use `-07:00` in summer (PDT) and
  `-08:00` in winter (PST). The offset makes everyone reveal at the same real
  moment regardless of their device timezone.
- Give each round at least as many times as the most matches any one person has
  in that round.
- The `_comment` key is ignored by the app — it's just a reminder in the file.

### `data/matches.json` — the people, keyed by email

```json
{
  "alice@example.com": {
    "name": "Alice",
    "praise": "A warm, personal note about their questionnaire answers…",
    "matches": [
      {
        "name": "Bob",
        "age": 30,
        "vibe": "The one who finds the person standing alone and makes them the center of the night.",
        "howToSpot": "Navy linen shirt and tortoise-shell glasses, near the record player.",
        "compatibility": 91,
        "whyMatched": "Why the AI paired them…",
        "commonAttributes": ["Both chase curiosity", "Would take the 6am road trip", "Value feeling seen"],
        "unexpectedFlex": "Can name almost any song in the first two seconds.",
        "canTeach": "How to order wine without pretending to know anything about wine.",
        "freeMonth": "Build the analog synth he's been collecting parts for and record an album.",
        "iceBreakers": ["Ask about…", "Find out…"],
        "whatToTalkAbout": "Topics that'll land…",
        "quirkyComment": "A fun one-liner shown at the bottom of the card."
      }
    ]
  }
}
```

**Every field is sourced from the "Beyond Small Talk" intake form** — either a
direct answer or an AI synthesis of the personality answers — because at the
event the AI has *only* the form to work from. The form covers social style,
values, curiosity, a few open-text answers, and "how can someone spot you during
the event?" It asks **no** job, hobby, or photo questions, so the schema has no
`role`, `location`, `interests`, or `photo` (the avatar is the guest's initial).
The form also collects **gender** and **SMS consent**, which feed matching and
ops — not the card.

- The **email is the key** and is what the guest types to unlock (case-insensitive).
- **Required per match:** `name`, `whyMatched`, `commonAttributes`, `iceBreakers`,
  `whatToTalkAbout`, `quirkyComment`.
- **Direct from a form answer:** `unexpectedFlex` ("most unexpected flex"),
  `canTeach` ("teach someone in 1 hour"), `freeMonth` (the "one-month sabbatical,
  travel banned" question) — each a **fun-fact tile** — plus `howToSpot` (the "how
  can someone spot you during the event?" answer → a **"How to spot them"** panel)
  and `age`.
- **AI-synthesized from the personality answers:**
  - `vibe` — one-line read on how they move socially (from the "Natural Rhythm"
    scenarios), shown in a **"Their Rhythm"** panel.
  - `whyMatched`, `commonAttributes`, `iceBreakers`, `whatToTalkAbout` — grounded
    in the two people's actual answers.
  - `quirkyComment` — a fun closer (the one field allowed light AI flavor).
  - `compatibility` — the AI's match score (number → "NN% COMPATIBILITY" pill).
- **Gender**, **"open to being introduced to"**, and **SMS consent** are matching
  and ops signals, **not display fields** — don't put them in the per-match JSON.
- `matches` order = reveal order. Round one uses **one** match; more also works
  (extra matches reuse the last reveal time).
- Paste your AI output straight into these fields. A ready-to-use LLM prompt that
  emits exactly this schema (with `howToSpot` and the fun-fact fields) lives in
  [`docs/matching-prompt.md`](docs/matching-prompt.md) — keep the two in sync.

---

## One shared link (no per-person links)

Everyone uses the **same URL** — your deployed site's base address (e.g.
`https://crazysoulssocial.vercel.app`). Share it however you like: a single
message, a QR code on the wall, a slide. Each guest just enters their signup
email to see their own matches.

To scaffold empty entries in `matches.json` from a guest list, make a CSV:

```csv
email,name
alice@example.com,Alice
bob@example.com,Bob
```

Then:

```bash
# 3rd arg = matches per person (default 1); 4th = your base URL for the printout
node scripts/gen-links.mjs participants.csv 1 https://crazysoulssocial.vercel.app
```

This creates an empty, email-keyed entry for each **new** person (existing
people are left untouched) and prints the one shared link.

### A note on access

Access is **email-only** — anyone who enters a valid participant email sees
that person's matches. That's the tradeoff for the convenience of a single
link, and it's fine for a low-stakes social event. If you ever want a second
factor (e.g. a name or PIN check), it's a small addition to `/api/unlock`.

---

## Running multiple rounds

> Describes the static path. Running live, you tap **Commit** on `/host` and the
> round is published — see [docs/event-night.md](docs/event-night.md). Rounds
> behave the same either way.

Rounds are **additive**: a guest sees their matches from *every* enabled round,
merged into one time-sorted timeline. Nothing is replaced — round 2 simply adds
to what they already have, and each match unlocks at its own scheduled time.

Each round is its own **matches** file; the **schedule** is one shared file
(`data/schedule.json`) with times grouped by round.

| Round | Matches file |
|-------|--------------|
| 1     | `data/matches.json`   |
| 2     | `data/matches_2.json` |
| N     | `data/matches_N.json` |

`data/round.json` lists which rounds are in play:

```json
{ "enabledRounds": [1, 2] }
```

A guest's matches from all enabled rounds are combined and sorted by reveal
time. Someone in round 1 and round 2 sees, in order: their round-1 match (at its
time), then their round-2 matches (at theirs) — with the live countdown bridging
the gap. Someone only in round 2 sees just their round-2 matches.

**To run round 2:** fill in `data/matches_2.json` (a ready-to-test round 2 with
three people and two matches each already ships), add the `"2"` reveal times in
`data/schedule.json`, ensure `2` is in `enabledRounds`, commit, and push. Same
shared link — round 2 now accumulates on top of round 1.

Scaffold a new round's file from a guest list with the `round` argument:

```bash
node scripts/gen-links.mjs participants.csv 2 https://crazysoulssocial.vercel.app 2
#                                           │                                    └ round → data/matches_2.json
#                                           └ matches per person
```

**Adding round 3+:** drop in `data/matches_3.json`, register it in `lib/data.ts`
(import it and add a `3:` entry to the `roundMatches` map), add a `"3"` entry to
`data/schedule.json`, and add `3` to `enabledRounds`.

---

## Why matches can't be spoiled early

Match details are **never sent to the browser before their reveal time**. The
page only fetches a match from `/api/match` once `schedule.json`'s time has
passed — the server returns `403 not_yet` otherwise. So even a guest poking at
devtools can't peek ahead.

---

## Live audience "pulses"

Alongside the per-person match reveal, you can fire **anonymous room broadcasts**
in real time — e.g. *"Someone in the room knows how to surf 🏄"*. Guests don't
swipe or refresh: their phones **poll** every ~15s and the latest pulse stays in a
prominent bar pinned to the top of the screen (with an "Earlier" button for the
history), flashing gold when a new one lands.

Unlike the match data (static JSON, redeploy to update), pulses are **spontaneous**,
so they live in a small shared store instead of the repo.

### Host console — `/host`

Open `/host` on your phone, enter the admin secret, then:

- **Load the queue** — paste your AI output (one pulse per line) or add single
  lines. The queue lives on your device (localStorage).
- **Send one-by-one** — tap **Send** on a queued line to broadcast it instantly;
  it moves to the "Sent" list. Meter them out as the night unfolds.

Guests never see `/host`, and nothing sends without the secret (validated
server-side).

### Reaching phones that aren't watching

The top bar only helps a guest who's looking. Two extra channels reach further:

- **Web push notifications.** After unlocking, guests get a "🔔 Get a heads-up"
  prompt; tapping **Enable** subscribes them, and every fired pulse then sends an
  OS notification — even when the tab is backgrounded or the phone is locked.
  - ✅ Android + desktop Chrome/Firefox/Edge: works after one tap.
  - ⚠️ **iPhone:** Safari only delivers push to an **installed** app, so the prompt
    instead tells iPhone users to **Share → Add to Home Screen** and open it from
    there. A plain Safari tab can't get push — an Apple limitation, not ours.
- **Venue screen — `/screen`.** Open this on a TV/projector if one's available. It
  shows the latest pulse large with recent ones beneath — no phones needed. (The
  event this was built for had no screen, so this is a backup.)

### Setup

1. **Add a store.** In Vercel: **Storage → add Redis** (Upstash-backed). Vercel
   injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically — no code change.
2. **Set the host password.** Add `PULSE_ADMIN_SECRET` in the Vercel project's
   Environment Variables.
3. **Enable web push.** Generate a VAPID key pair once with
   `node -e "console.log(require('web-push').generateVAPIDKeys())"`, then set three
   env vars: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and
   `VAPID_SUBJECT` (a `mailto:` address). Redeploy. (Push subscriptions are stored
   in the same Redis.)

Locally, put `PULSE_ADMIN_SECRET=dev123` plus the three `VAPID_*` vars in
`.env.local`. With no Redis env vars, both pulses and push subscriptions fall back
to an **in-memory store** so `npm run dev` works end-to-end (single-process only —
not for production).

> Scale note: ~20 guests polling every 15s is a handful of Redis reads per second —
> comfortably within Upstash's free tier for an evening event.

### Reset before an event

Clear any test pulses with a secret-gated request:

```bash
curl -X DELETE https://your-site/api/pulses \
  -H 'Content-Type: application/json' -d '{"secret":"YOUR_SECRET"}'
```

---

## Deploy (GitHub → Vercel)

1. Push this repo to GitHub:
   ```bash
   git init
   git add -A
   git commit -m "Crazy Souls match reveal app"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo →
   **Deploy** (framework auto-detected as Next.js, no config needed).
3. You'll get a URL like `https://crazy-souls.vercel.app`.

### Updating data after it's live

> Only for the static path. A live event never needs this — that's the point of
> [docs/event-night.md](docs/event-night.md).

Static data means an update = a quick redeploy:

```bash
# edit data/matches.json or data/schedule.json, then:
git add data/
git commit -m "Update match data"
git push
```

Vercel auto-rebuilds in ~1 minute. Git also keeps a history of every data change.

> There's **no virtual environment** — Node keeps all dependencies inside this
> project's `node_modules/` folder, isolated from your system.

---

## Event-day checklist

**Running live** — the full version is in
[docs/event-night.md](docs/event-night.md):

1. Set `EVENT_ID` to this event, and confirm `ANTHROPIC_API_KEY` is set.
2. Point the Tally webhook at `/api/intake`, submit one test form, and check
   `/api/intake?secret=…&debug=1` maps `email`, `name`, `gender`, `openTo` and
   `howToSpot`.
3. `npx tsx scripts/simulate.ts 35 3` — rehearse the night end to end.
4. **Reset this event** on `/host` before doors open.
5. During: preview → commit, once per round. Late arrivals handle themselves.
6. **Close the event** at the end.

**Running static:**

1. Finalize `data/schedule.json` reveal times (correct date + timezone offset).
2. Paste real AI matches into `data/matches.json` (or scaffold with `gen-links`).
3. `git push` → confirm the live site loads.
4. Test with a real email end-to-end (enter email → praise → countdown → reveal).
5. Share the one common link (message / QR / slide). Enjoy the event. 🥂
