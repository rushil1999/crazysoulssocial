# Crazy Souls — Staged Match Reveal

An elegant, suspense-building web app for a singles mixer. You share **one
common link** with everyone; each guest enters the **email they signed up
with**, reads a personalized note about their answers, then unlocks their
matches **one at a time** behind live countdowns — full with why-you-matched,
shared interests, ice breakers, talking points, and a quirky comment.

Built with Next.js (App Router), Tailwind, Framer Motion, and canvas-confetti.
Data lives in static JSON — no database, no external API.

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
        "location": "Downtown",
        "role": "Software Engineer",
        "tagline": "Big questions, bad puns, good coffee.",
        "compatibility": 91,
        "photo": "",
        "howToSpot": "What they're wearing / where they'll be, so guests can find each other.",
        "whyMatched": "Why the AI paired them…",
        "commonAttributes": ["Both chase curiosity", "Weekend hikers", "Coffee first"],
        "interests": [
          { "label": "Hiking", "icon": "hiking" },
          { "label": "Sci-Fi", "icon": "book" },
          { "label": "Coffee", "icon": "coffee" }
        ],
        "iceBreakers": ["Ask about…", "Find out…"],
        "whatToTalkAbout": "Topics that'll land…",
        "quirkyComment": "A fun one-liner shown at the bottom of the card."
      }
    ]
  }
}
```

- The **email is the key** and is what the guest types to unlock (case-insensitive).
- **Required per match:** `name`, `whyMatched`, `commonAttributes`, `iceBreakers`,
  `whatToTalkAbout`, `quirkyComment`.
- **Optional (shown only if present):** `age`, `location`, `role`, `tagline`
  (italic quote), `compatibility` (number → "NN% COMPATIBILITY" pill), `photo`
  (URL → avatar), `howToSpot`, `interests`.
- `interests` is a grid of icon tiles. `icon` keywords: `wine`, `music`, `book`,
  `poetry`, `camera`, `photography`, `travel`, `plane`, `garden`, `hiking`,
  `coffee`, `film`, `heart`, `star`. If omitted or unknown, it matches a keyword
  in the label, then falls back to a sparkle.
- `matches` order = reveal order. Round one uses **one** match; more also works
  (extra matches reuse the last reveal time).
- Paste your AI output straight into these fields.

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

1. Finalize `data/schedule.json` reveal times (correct date + timezone offset).
2. Paste real AI matches into `data/matches.json` (or scaffold with `gen-links`).
3. `git push` → confirm the live site loads.
4. Test with a real email end-to-end (enter email → praise → countdown → reveal).
5. Share the one common link (message / QR / slide). Enjoy the event. 🥂
