# Crazy Souls — Staged Match Reveal

An elegant, suspense-building web app for a singles mixer. Each guest opens a
**private link**, confirms the **email they signed up with**, reads a
personalized note about their answers, then unlocks their matches **one at a
time** behind live countdowns — full with why-you-matched, shared interests,
ice breakers, talking points, and a quirky comment.

Built with Next.js (App Router), Tailwind, Framer Motion, and canvas-confetti.
Data lives in static JSON — no database, no external API.

---

## Quick start (local)

```bash
npm install
npm run dev
```

Open <http://localhost:3000/m/AB12CD> and enter `alice@example.com` (sample
data) to walk through the whole experience.

> The plain `/` landing page just tells guests to open their personal link.
> The real experience lives at `/m/<token>`.

---

## How the data works

Two files under `data/`:

### `data/schedule.json` — when matches unlock (same for everyone)

```json
{
  "revealTimes": [
    "2026-07-18T19:00:00-04:00",
    "2026-07-18T19:20:00-04:00",
    "2026-07-18T19:40:00-04:00"
  ]
}
```

- Times are **ISO 8601 with a timezone offset** (`-04:00` = US Eastern DST).
  Use your event's offset. This guarantees everyone reveals at the same real
  moment regardless of their device timezone.
- `revealTimes[0]` gates match #1, `[1]` gates #2, `[2]` gates #3.

### `data/matches.json` — the people, keyed by email

```json
{
  "alice@example.com": {
    "token": "AB12CD",
    "name": "Alice",
    "praise": "A warm, personal note about their questionnaire answers…",
    "matches": [
      {
        "name": "Bob",
        "photo": "",
        "whyMatched": "Why the AI paired them…",
        "commonAttributes": ["Hiking", "Sci-fi", "Bad puns"],
        "iceBreakers": ["Ask about…", "Find out…"],
        "whatToTalkAbout": "Topics that'll land…",
        "quirkyComment": "A fun one-liner shown at the bottom of the card."
      }
    ]
  }
}
```

- The **email is the key** and is what the guest types to unlock (case-insensitive).
- `token` is the secret in their link: `…/m/AB12CD`.
- `matches` order = reveal order. 3 is the default; more/fewer also works
  (extra matches reuse the last reveal time).
- Paste your AI output straight into these fields.

---

## Generating everyone's links

Make a CSV of participants:

```csv
email,name
alice@example.com,Alice
bob@example.com,Bob
```

Then:

```bash
node scripts/gen-links.mjs participants.csv https://your-app.vercel.app
```

This will:

- give each **new** person a unique token + 3 empty match slots in `matches.json`
  (existing people keep their token and data),
- write `scripts/output/links.csv` with each person's shareable link,
- print the links to your terminal.

Send each guest their own link (SMS, email, or a QR code per link).

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
3. Run `gen-links.mjs` to produce everyone's links.
4. `git push` → confirm the live site loads.
5. Test one real link end-to-end (unlock → praise → countdown → reveal).
6. Distribute links. Enjoy the event. 🥂
