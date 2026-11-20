"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * Round console — the host's half of the night.
 *
 * Replaces the old loop of exporting form responses, pasting them into an LLM,
 * committing JSON, and waiting for a Vercel redeploy. Preview a pairing, commit
 * it, and guests see it immediately.
 *
 * Built to be used one-handed, on a phone, in a dark bar: few controls, big
 * targets, and anything destructive asks first.
 */

type RosterGuest = {
  email: string;
  name: string;
  age?: number;
  gender?: string;
  answered: number;
  rounds: number[];
  active: boolean;
};

type Roster = {
  count: number;
  bench: string[];
  state: {
    currentRound: number;
    revealAt: Record<string, string>;
    upcoming: string[];
    closed?: boolean;
  };
  guests: RosterGuest[];
  /** False when no Redis is configured — nothing will survive a refresh. */
  storeConfigured?: boolean;
  /** Why it isn't configured, in words. */
  storeHint?: string | null;
};

type PreviewPair = {
  a: string;
  b: string;
  score: number;
  shared: string[];
};

type Preview = {
  round: number;
  rosterSize: number;
  pairs: PreviewPair[];
  unmatched: string[];
  averageScore: number | null;
  cardsConfigured?: boolean;
  note?: string;
  totalGuests?: number;
  neverMatchApplied?: number;
};

type Commit = {
  round: number;
  revealAt: string;
  pairs: number;
  cardsWritten: number;
  cardsPending: number;
  cardError?: string | null;
  unmatched: string[];
  notified: number;
  cardsConfigured?: boolean;
};

const REVEAL_CHOICES = [
  { label: "Now", minutes: 0 },
  { label: "+5 min", minutes: 5 },
  { label: "+15 min", minutes: 15 },
];

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HostRounds({
  secret,
  onAuthFail,
}: {
  secret: string;
  onAuthFail: () => void;
}) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [commit, setCommit] = useState<Commit | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealIn, setRevealIn] = useState(0);
  const [confirming, setConfirming] = useState<"commit" | "reset" | null>(null);
  const [showRoster, setShowRoster] = useState(false);
  const [neverText, setNeverText] = useState<string | null>(null);
  const [neverResult, setNeverResult] = useState<{
    resolved: number;
    problems: { line: string; reason: string }[];
  } | null>(null);

  // The secret goes in a header, not the query string: it keeps it out of
  // browser history and Vercel's request logs, and a password containing
  // &, # or a space survives a header intact where a URL would mangle it.
  const loadRoster = useCallback(async () => {
    setBusy("roster");
    setError(null);
    try {
      const res = await fetch("/api/intake", {
        headers: { "x-admin-secret": secret },
      });
      if (res.status === 401) {
        onAuthFail();
        return;
      }
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "The server isn't configured.");
        return;
      }
      if (!res.ok) throw new Error("Couldn't load the roster.");
      setRoster((await res.json()) as Roster);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the roster.");
    } finally {
      setBusy(null);
    }
  }, [secret, onAuthFail]);

  useEffect(() => {
    loadRoster();
    // Keep the count fresh while guests are filling the form.
    const id = setInterval(() => loadRoster(), 20_000);
    return () => clearInterval(id);
  }, [loadRoster]);

  // Pull the never-match list once on load, so a refresh mid-event doesn't
  // leave the box looking empty when the server still has it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, action: "neverMatch" }),
      }).catch(() => null);
      if (!res || !res.ok || cancelled) return;
      const data = await res.json().catch(() => null);
      if (data && !cancelled) setNeverText(data.text ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [secret]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, action, ...extra }),
      });
      const data = await res.json();
      if (res.status === 401) {
        onAuthFail();
        return null;
      }
      if (!res.ok) {
        setError(data.error || "That didn't work.");
        return null;
      }
      return data;
    } catch {
      setError("Network hiccup. Try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function doPreview() {
    const data = await act("preview");
    if (data) {
      setPreview(data as Preview);
      setCommit(null);
    }
  }

  async function doCommit() {
    setConfirming(null);
    const data = await act("commit", { revealInMinutes: revealIn });
    if (data) {
      setCommit(data as Commit);
      setPreview(null);
      await loadRoster();
    }
  }

  async function doFinish() {
    const data = await act("finish");
    if (data && commit) {
      setCommit({
        ...commit,
        cardsWritten: commit.cardsWritten + (data.cardsWritten ?? 0),
        cardsPending: data.cardsPending ?? 0,
        cardError: data.cardError ?? null,
      });
    }
  }

  async function saveNeverMatch() {
    const data = await act("neverMatch", { neverMatch: neverText ?? "" });
    if (data) {
      setNeverText(data.text ?? "");
      setNeverResult({
        resolved: data.resolved ?? 0,
        problems: data.problems ?? [],
      });
    }
  }

  async function doReset() {
    setConfirming(null);
    await act("reset");
    setPreview(null);
    setCommit(null);
    await loadRoster();
  }

  const nextRound = (roster?.state.currentRound ?? 0) + 1;
  const benched = roster?.bench.length ?? 0;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-gold">{error}</p>}

      {/*
        Without Redis the store falls back to an in-memory map that lives
        inside a single serverless instance, so guests appear and vanish
        depending on which instance answers. That has to be impossible to miss
        rather than something you discover on the night.
      */}
      {roster && roster.storeConfigured === false && (
        <div className="glass rounded-2xl p-5 ring-1 ring-gold/50">
          <div className="eyebrow mb-2 text-gold">Nothing is being saved</div>
          <p className="text-cream/90 text-sm leading-relaxed">
            Guests are being held in memory, so they are lost on a refresh and
            can differ between requests. Everything below will appear to work
            until then — but nothing is being kept.
          </p>
          {roster.storeHint && (
            <p className="text-beige/80 text-sm leading-relaxed mt-3">
              {roster.storeHint}
            </p>
          )}
        </div>
      )}

      {/* ── The room ──────────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="eyebrow mb-1">In the room</div>
            <p className="font-display text-4xl leading-none gradient-text tabular-nums">
              {roster?.count ?? "—"}
            </p>
          </div>
          <div className="text-right text-sm text-beige/75 leading-relaxed">
            <p>
              Round{" "}
              <span className="text-cream tabular-nums">
                {roster?.state.currentRound ?? 0}
              </span>{" "}
              done
            </p>
            {benched > 0 && (
              <p className="text-gold">
                {benched} waiting{benched === 1 ? "" : ""}
              </p>
            )}
            {roster?.state.closed && <p className="text-beige/60">closed</p>}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="btn-ghost flex-1"
            onClick={() => loadRoster()}
            disabled={busy === "roster"}
          >
            {busy === "roster" ? "…" : "Refresh"}
          </button>
          <button
            className="btn-ghost flex-1"
            onClick={() => setShowRoster((s) => !s)}
          >
            {showRoster ? "Hide list" : "Who's here"}
          </button>
        </div>

        {showRoster && roster && (
          <div className="mt-4 space-y-1.5 max-h-72 overflow-y-auto">
            {roster.guests.length === 0 && (
              <p className="text-beige/60 text-sm">
                Nobody's filled the form yet.
              </p>
            )}
            {roster.guests.map((g) => (
              <div
                key={g.email}
                className="flex items-center gap-2 text-sm py-1 border-b border-white/5 last:border-0"
              >
                <span className="text-cream/90 flex-1 truncate">{g.name}</span>
                {roster.bench.includes(g.email) && (
                  <span className="text-gold text-xs">waiting</span>
                )}
                <span className="text-beige/55 text-xs tabular-nums">
                  {g.rounds.length}×
                </span>
                {g.answered === 0 && (
                  <span
                    className="text-gold text-xs"
                    title="No multiple-choice answers — matching has little to go on"
                  >
                    thin
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Preview ───────────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-5">
        <div className="eyebrow mb-3">Round {nextRound}</div>

        <button
          className="btn-primary w-full mb-3"
          onClick={doPreview}
          disabled={busy === "preview" || (roster?.count ?? 0) < 2}
        >
          {busy === "preview" ? "Pairing…" : "Preview pairing"}
        </button>

        <p className="text-beige/60 text-xs leading-relaxed">
          Preview changes nothing. Nobody is matched to someone they&apos;ve
          already met tonight.
        </p>

        {preview && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5"
          >
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-cream">
                <span className="tabular-nums">{preview.pairs.length}</span>{" "}
                pairs
              </p>
              {preview.averageScore !== null && (
                <p className="text-beige/70 text-sm">
                  avg{" "}
                  <span className="tabular-nums">{preview.averageScore}</span>
                </p>
              )}
            </div>

            {preview.note && (
              <p className="text-gold text-sm mb-3 leading-relaxed">
                {preview.note}
              </p>
            )}

            {!!preview.neverMatchApplied && (
              <p className="text-beige/70 text-sm mb-3">
                {preview.neverMatchApplied} pair
                {preview.neverMatchApplied === 1 ? "" : "s"} kept apart.
              </p>
            )}

            <div className="space-y-1 max-h-64 overflow-y-auto mb-4">
              {preview.pairs.map((p) => (
                <div
                  key={`${p.a}-${p.b}`}
                  className="flex items-center gap-2 text-sm py-1.5 border-b border-white/5 last:border-0"
                >
                  <span className="text-cream/90 flex-1 truncate">
                    {p.a} <span className="text-beige/40">+</span> {p.b}
                  </span>
                  <span className="text-beige/60 text-xs tabular-nums shrink-0">
                    {p.score}
                  </span>
                </div>
              ))}
            </div>

            {preview.unmatched.length > 0 && (
              <p className="text-gold text-sm mb-4">
                No one left for {preview.unmatched.join(", ")} this round
                {preview.unmatched.length === 1
                  ? " — they'll be first up next round."
                  : " — they'll be first up next round."}
              </p>
            )}

            {preview.cardsConfigured === false && (
              <p className="text-gold text-sm mb-4">
                ANTHROPIC_API_KEY isn&apos;t set, so cards will be built from
                the form answers alone. They&apos;ll work, they just read
                flatter.
              </p>
            )}

            <div className="eyebrow mb-2">Reveal</div>
            <div className="flex gap-2 mb-4">
              {REVEAL_CHOICES.map((c) => (
                <button
                  key={c.label}
                  onClick={() => setRevealIn(c.minutes)}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm transition ${
                    revealIn === c.minutes
                      ? "bg-gold/20 text-cream ring-1 ring-gold/50"
                      : "tile text-beige/80"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {confirming === "commit" ? (
              <div className="tile rounded-xl p-4">
                <p className="text-cream/90 text-sm mb-3 leading-relaxed">
                  Commit {preview.pairs.length} pairs for round{" "}
                  {preview.round}, revealing{" "}
                  {revealIn === 0 ? "immediately" : `in ${revealIn} minutes`}?
                  This can&apos;t be undone.
                </p>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" onClick={doCommit}>
                    Yes, commit
                  </button>
                  <button
                    className="btn-ghost flex-1"
                    onClick={() => setConfirming(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn-primary w-full"
                onClick={() => setConfirming("commit")}
                disabled={busy === "commit" || preview.pairs.length === 0}
              >
                {busy === "commit"
                  ? "Committing…"
                  : `Commit round ${preview.round}`}
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/*
        Rounds already committed, read from the server rather than from this
        page's memory — so a refresh mid-event (or picking the console up on a
        second device) still shows where the night is.
      */}
      {!commit && roster && roster.state.currentRound >= 1 && (
        <div className="glass rounded-2xl p-5">
          <div className="eyebrow mb-2">
            Round {roster.state.currentRound} is live
          </div>
          <p className="text-cream/90 leading-relaxed">
            {roster.guests.filter((g) => g.rounds.length > 0).length} guests
            have been introduced
            {roster.state.revealAt[String(roster.state.currentRound)] &&
              `, revealed at ${clock(
                roster.state.revealAt[String(roster.state.currentRound)]
              )}`}
            .
          </p>
          {benched > 0 && (
            <p className="text-gold text-sm mt-2">
              {benched} waiting for the next round.
            </p>
          )}
        </div>
      )}

      {/* ── Result ────────────────────────────────────────────────────────── */}
      {commit && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-5"
        >
          <div className="eyebrow mb-2">Round {commit.round} is live</div>
          <p className="text-cream/90 leading-relaxed mb-1">
            {commit.pairs} introductions, revealing at {clock(commit.revealAt)}.
          </p>
          <p className="text-beige/70 text-sm">
            Cards written {commit.cardsWritten}/{commit.pairs}
            {commit.notified > 0 && ` · ${commit.notified} phones notified`}
          </p>

          {commit.cardError && (
            <p className="text-gold text-sm mt-3 leading-relaxed">
              Card writing fell back: {commit.cardError}
            </p>
          )}

          {commit.cardsPending > 0 && (
            <>
              <p className="text-gold text-sm mt-3 leading-relaxed">
                {commit.cardsPending} card
                {commit.cardsPending === 1 ? "" : "s"} still on the plain
                version. Everyone can already see their match — tap below to
                finish the writing.
              </p>
              <button
                className="btn-ghost w-full mt-3"
                onClick={doFinish}
                disabled={busy === "finish"}
              >
                {busy === "finish" ? "Writing…" : "Finish cards"}
              </button>
            </>
          )}

          {commit.unmatched.length > 0 && (
            <p className="text-beige/70 text-sm mt-3">
              Waiting for next round: {commit.unmatched.join(", ")}
            </p>
          )}
        </motion.div>
      )}

      {/* ── Never match ───────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-5">
        <div className="eyebrow mb-3">Never match</div>
        <p className="text-beige/70 text-sm leading-relaxed mb-3">
          Two people per line. Names or emails — whatever you have at the door.
          They will never be introduced to each other.
        </p>
        <textarea
          value={neverText ?? ""}
          onChange={(e) => setNeverText(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={"Priya, Sam\nalex@example.com, jordan@example.com"}
          className="field w-full font-mono text-sm mb-3"
        />
        <button
          className="btn-ghost w-full"
          onClick={saveNeverMatch}
          disabled={busy === "neverMatch" || neverText === null}
        >
          {busy === "neverMatch" ? "Saving…" : "Save"}
        </button>

        {neverResult && (
          <div className="mt-4 space-y-2">
            <p className="text-cream/90 text-sm">
              {neverResult.resolved} pair
              {neverResult.resolved === 1 ? "" : "s"} will be kept apart.
            </p>
            {neverResult.problems.map((p, i) => (
              <p key={i} className="text-gold text-sm leading-relaxed">
                &ldquo;{p.line}&rdquo; — {p.reason}
              </p>
            ))}
          </div>
        )}

        <p className="text-beige/60 text-xs leading-relaxed mt-4">
          Safe to fill in before doors: a name starts working the moment that
          guest fills the form. Kept when you reset the event.
        </p>
      </div>

      {/* ── End of night ──────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-5">
        <div className="eyebrow mb-3">End of night</div>
        <button
          className="btn-ghost w-full mb-2"
          onClick={() => act("close").then(loadRoster)}
          disabled={busy === "close" || roster?.state.closed}
        >
          {roster?.state.closed ? "Event closed" : "Close the event"}
        </button>
        <p className="text-beige/60 text-xs leading-relaxed mb-4">
          Stops new form submissions being paired. Guests keep their cards.
        </p>

        {confirming === "reset" ? (
          <div className="tile rounded-xl p-4">
            <p className="text-cream/90 text-sm mb-3 leading-relaxed">
              This deletes every guest, pairing and card for this event. Only do
              this before doors open.
            </p>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={doReset}>
                Yes, wipe it
              </button>
              <button
                className="btn-ghost flex-1"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="text-beige/50 hover:text-gold text-xs underline"
            onClick={() => setConfirming("reset")}
          >
            Reset this event
          </button>
        )}
      </div>
    </div>
  );
}
