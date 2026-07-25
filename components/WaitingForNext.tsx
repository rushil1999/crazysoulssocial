"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import InlineCountdown from "./InlineCountdown";

const POLL_MS = 12_000;
const MAX_POLLS = 20; // ~4 min of auto-checking before it goes quiet

/**
 * Shown when a guest has seen every match currently assigned to them but a
 * later reveal window is still scheduled (e.g. round 2's matches file gets
 * filled in during the event). Counts down to that window, then quietly polls
 * for the freshly-added match and hands off via onCheck.
 *
 * `onCheck` re-fetches the profile and returns true if a new match arrived (the
 * parent then advances and this component unmounts).
 */
export default function WaitingForNext({
  name,
  praise,
  nextWindow,
  firstMatch,
  onCheck,
}: {
  name: string;
  praise?: string;
  nextWindow: string;
  firstMatch: boolean;
  onCheck: () => Promise<boolean>;
}) {
  const [passed, setPassed] = useState(
    () => Date.now() >= new Date(nextWindow).getTime()
  );
  const [checking, setChecking] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const pollsRef = useRef(0);

  // Once the reveal time passes, poll for the (possibly late-filled) match.
  useEffect(() => {
    if (!passed || exhausted) return;
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      setChecking(true);
      const found = await onCheck();
      if (cancelled) return;
      setChecking(false);
      if (found) return; // parent advances → we unmount
      pollsRef.current += 1;
      if (pollsRef.current >= MAX_POLLS) setExhausted(true);
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passed, exhausted]);

  async function manualCheck() {
    setChecking(true);
    const found = await onCheck();
    if (!found) {
      setChecking(false);
      pollsRef.current = 0;
      setExhausted(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass rounded-[26px] max-w-xl w-full p-8 sm:p-12 text-center"
    >
      <div className="text-3xl mb-5 text-gold animate-floaty">✦</div>
      <h1 className="font-display text-3xl sm:text-4xl mb-4 tracking-wide">
        {firstMatch ? (
          <>
            Hang tight, <span className="gradient-text">{name}</span>.
          </>
        ) : (
          <>
            The night isn&apos;t over, <span className="gradient-text">{name}</span>.
          </>
        )}
      </h1>

      {firstMatch && praise && (
        <p className="text-cream/85 leading-relaxed mb-6">{praise}</p>
      )}

      <p className="text-cream/85 leading-relaxed mb-9">
        {firstMatch
          ? "We're still finding the right person for you — the next reveal is coming up."
          : "You've met your match so far. There may be someone new for you at the next reveal."}{" "}
        Keep this page open.
      </p>

      {!passed ? (
        <>
          <p className="text-xs uppercase tracking-[0.28em] text-gold/90 mb-3">
            ✦ Next match unlocks in
          </p>
          <p className="font-display text-5xl sm:text-6xl tabular-nums gradient-text leading-none">
            <InlineCountdown
              targetIso={nextWindow}
              onComplete={() => setPassed(true)}
            />
          </p>
        </>
      ) : (
        <p className="text-beige/80 text-lg">
          {checking
            ? "Checking for your next match…"
            : exhausted
              ? "No new match just yet — enjoy the night, and check back anytime."
              : "Any moment now…"}
        </p>
      )}

      <button
        className="btn-ghost mt-8"
        onClick={manualCheck}
        disabled={checking}
      >
        {checking ? "Checking…" : "Check again"}
      </button>
    </motion.div>
  );
}
