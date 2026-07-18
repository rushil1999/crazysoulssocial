"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import type { Match } from "@/lib/data";
import MatchCard from "./MatchCard";

function fireConfetti() {
  const colors = ["#B99043", "#D8B878", "#F1E6D4", "#BFB3A2"];
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.35 }, colors });
  setTimeout(
    () => confetti({ particleCount: 60, angle: 60, spread: 65, origin: { x: 0 }, colors }),
    180
  );
  setTimeout(
    () => confetti({ particleCount: 60, angle: 120, spread: 65, origin: { x: 1 }, colors }),
    320
  );
}

export default function MatchReveal({
  token,
  email,
  index,
  matchCount,
  onNext,
}: {
  token: string;
  email: string;
  index: number;
  matchCount: number;
  onNext: () => void;
}) {
  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, email, index }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!cancelled)
            setError(
              data.error === "not_yet"
                ? "Almost — this one isn't quite ready. Hang tight a moment."
                : "Couldn't load this match. Refresh and try again."
            );
          return;
        }
        const data = await res.json();
        if (!cancelled) setMatch(data.match as Match);
      } catch {
        if (!cancelled) setError("Network hiccup. Refresh to try again.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, email, index]);

  const isLast = index === matchCount - 1;

  return (
    <div className="w-full flex flex-col items-center">
      <AnimatePresence mode="wait">
        {!revealed ? (
          <motion.div
            key="curtain"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.4 }}
            className="glass rounded-2xl max-w-md w-full p-10 text-center"
          >
            <div className="text-2xl mb-5 text-gold animate-floaty">✦</div>
            <h2 className="font-display text-3xl mb-3 tracking-wide">
              <span className="gradient-text">It&apos;s time.</span>
            </h2>
            <p className="text-beige mb-8">
              {matchCount === 1
                ? "Your match is ready. Take a breath."
                : isLast
                  ? "Your final match is ready. Take a breath."
                  : `Match ${index + 1} is ready to meet you.`}
            </p>
            <button
              className="btn-primary"
              disabled={!match && !error}
              onClick={() => {
                setRevealed(true);
                if (match && !firedRef.current) {
                  firedRef.current = true;
                  setTimeout(fireConfetti, 250);
                }
              }}
            >
              {!match && !error ? "Preparing…" : "Reveal ✦"}
            </button>
            {error && <p className="text-sm text-gold mt-5">{error}</p>}
          </motion.div>
        ) : match ? (
          <motion.div
            key="card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full flex flex-col items-center"
          >
            <MatchCard match={match} index={index} matchCount={matchCount} />
            <button className="btn-primary mt-8" onClick={onNext}>
              {isLast ? "See you tonight 🥂" : "Next match →"}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="err"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass rounded-2xl max-w-md w-full p-10 text-center"
          >
            <p className="text-cream/85">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
