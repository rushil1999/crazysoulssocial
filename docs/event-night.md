# Running the night

What used to happen: export the form responses, paste them into an LLM, paste
the JSON back into `data/matches_N.json`, commit, wait for Vercel, then tell the
room to refresh. Every late arrival meant doing it again, and you spent the
evening behind a laptop.

What happens now: guests fill the form, you tap **Preview**, you tap **Commit**,
and the introductions are on their phones. Late arrivals are handled without you
touching anything.

The old path still works — `data/matches.json` and friends are untouched, and
July's links still resolve. Nothing here breaks what's already there.

---

## Setup, once

### 1. Environment variables

In Vercel → Settings → Environment Variables. The first three you already have.

| Variable | Needed? | What it's for |
|---|---|---|
| `REDIS_URL`<br>*or* a REST pair | **required** | Redis — now holds the live event too |
| `PULSE_ADMIN_SECRET` | already set | gates `/host` and both new APIs |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | already set | web push |
| `VAPID_PRIVATE_KEY` | already set | " |
| `VAPID_SUBJECT` | already set | " |
| `ANTHROPIC_API_KEY` | **add this** | writes the match cards |
| `EVENT_ID` | **add this** | e.g. `devils-acre-2026-11-22`. Change it for each event — that's what keeps one night's data separate from the next |
| `ANTHROPIC_MODEL` | optional | defaults to `claude-sonnet-5-5` |
| `TALLY_SIGNING_SECRET` | optional | rejects anything that isn't really from Tally |

Without `ANTHROPIC_API_KEY` everything still runs — cards get built from the
form answers directly. They're accurate, just flatter. Roughly 20 pairs of
written cards costs a few cents.

**The Redis one is not optional.** Either kind works:

- a `REDIS_URL` (`redis://…` or `rediss://…`), which is what most "add Redis"
  buttons give you, or
- a REST pair — `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or
  `KV_REST_API_URL` + `KV_REST_API_TOKEN`.

If both are present the REST pair is used, because it suits serverless better.

Without either, the app does not crash — it falls back to an in-memory store
that lives inside a single serverless instance, so guests appear and vanish
depending on which instance answers, and a refresh loses the room. `/host`
says so in red at the top when this is the case. **If that banner is showing
on the night, stop and fix it before doors.** It is the one check worth making
every single time.

### 2. Point Tally at the app

In your form → **Integrations → Webhooks → Add webhook**:

```
https://beyondsmalltalk.vercel.app/api/intake
```

**Not `crazysouls.social`.** That domain points at GitHub Pages, which serves
static files and cannot run an API route — the webhook would be accepted by
Tally, reported as configured, and silently deliver nothing. The app, and
every route in this repo, lives on the Vercel deployment. If you later want
the app on your own domain, add it to the Vercel project (a subdomain such as
`app.crazysouls.social` works, and leaves the marketing site where it is) and
then update this URL.

If you set `TALLY_SIGNING_SECRET`, put the same value in Tally's signing-secret
field.

### 3. Check the form's questions land in the right place

Submit your own form once, then open:

```
https://beyondsmalltalk.vercel.app/api/intake?secret=YOUR_SECRET&debug=1
```

You'll get back every question label and the slot it went to. You're looking for
these five to be recognised:

- `email`
- `name`
- `gender`
- `openTo` — who they're open to meeting
- `howToSpot` — what they're wearing / where they'll be

Everything else is useful but optional. If one of those says `extra` or
`choice:` instead, the question's wording doesn't match what the mapper looks
for — either reword the question, or add a pattern to `SLOTS` in `lib/tally.ts`.

**`gender` and `openTo` are the ones that matter most.** They're the only hard
constraint in matching; when both guests have answered, nobody is introduced to
someone outside what they asked for. If a guest leaves them blank they can still
be matched, but they're matched last.

---

## The week before

Run the night against made-up guests:

```bash
npx tsx scripts/simulate.ts 35 3
```

It builds a 35-person roster, runs three rounds through the real matching code,
drips in late arrivals, and checks for the things that would actually ruin an
evening — someone matched to the same person twice, someone in two pairs at
once, an orientation mismatch, someone left out who had an available option.

Then rehearse the real thing: open `/host`, submit a handful of test forms,
preview, commit, and open the guest page on your own phone to see what they'll
see. Afterwards, **Reset this event** at the bottom of the host console wipes it
clean.

Reset before doors. Not after.

---

## The night

Everything happens at **`/host`**, on your phone. The **Introductions** tab is
new; **Pulses** is what you already had.

### Doors open

Guests scan the Tally form and fill it in. The roster counter on `/host` ticks
up on its own. Nothing else to do — go talk to people.

### First introduction

Two or three minutes before you want it to land:

1. **Preview pairing.** You'll see every pair with a compatibility score, and
   anyone who couldn't be paired. This writes nothing — preview as often as you
   like.
2. Glance down the list. If something looks wrong, this is the moment.
3. Pick a reveal time — **Now**, **+5 min**, **+15 min**. Choosing +15 lets you
   commit while people are still mingling; the cards unlock by themselves at the
   right moment, and nobody can peek early (the server refuses to hand over a
   card before its time, so there's nothing to screenshot).
4. **Commit.**

Their phones buzz if they allowed notifications, and the card appears whether
they did or not.

### Late arrivals — you do nothing

Someone fills the form at 8:20, after round one is live:

- If anyone else is waiting unpaired, the two are introduced **immediately** —
  cards written, both phones buzzed, within seconds.
- If nobody's waiting, they go on the bench and their page says so, counting
  down to the next round. Their phone checks for them; they don't have to.

Either way they can open the app and see where they stand. They're never told
"we couldn't find you", which is what used to happen before a redeploy.

### Later rounds

Same two taps. Nobody is ever introduced to someone they've already met
tonight — that's enforced in the data, not by you remembering.

Anyone who was benched is first in line.

### End of the night

**Close the event.** Late form submissions stop being paired; everyone keeps
their cards and can reread them.

---

## When something goes wrong

**"Cards written 11/14."** The round is already live and all fourteen pairs can
see their match — the remaining three are on the plain version. Tap **Finish
cards** to complete the writing. Nobody is blocked while you do.

**A guest says they can't get in.** They must use the exact email and first name
they signed up with. Check **Who's here** on the host console for the spelling.

**A guest has no match.** If the room is an odd size, one person sits out each
round — they're first up next round, and their page says so. If it's a
persistent orientation imbalance, the preview screen names them.

**Someone's answers are thin.** The roster list flags guests with no
multiple-choice answers. They'll still be matched, just on less.

**Preview shows fewer pairs than you expect.** Usually the gender ratio, or
people who've already met each other in earlier rounds. The unmatched names are
listed.

**You committed the wrong thing.** A committed round can't be unwound from the
console — that's deliberate, because guests may already be reading it. You can
run the next round immediately to give everyone someone new.

**Everything looks broken.** Pulses, push and matches all sit on the same Redis
store. If it's unreachable, guests holding cards from the bundled JSON still get
in, and `/host` will show the error rather than failing silently.

---

## Two things to decide before the 22nd

1. **The time.** Eventbrite says the first introduction is at 8:00 PM; you said
   7:15 in planning. The app doesn't care, but the room will — pick one and make
   the listing and the agenda agree.

2. **How the form reaches people.** A QR code on the table beats a link in an
   email every time — people are already holding a drink. Whoever's at the door
   can point at it.

---

## What the system guarantees

- Nobody is introduced to the same person twice.
- Nobody appears in two introductions at once.
- When both guests have answered, nobody is introduced outside what they asked
  for.
- No card is readable before its reveal time, from any device.
- A guest always has a card at reveal time, even if the writing step fails.
- A late arrival is never told they don't exist.

Each of these is checked by `scripts/simulate.ts`, which runs the production
matching code rather than a copy of it.
