"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function remaining(targetMs: number) {
  const diff = Math.max(0, targetMs - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { diff, days, hours, minutes, seconds };
}

function Unit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="glass rounded-2xl w-[4.5rem] sm:w-28 py-4 sm:py-6 grid place-items-center shadow-[0_0_50px_-10px_rgba(185,144,67,0.4)]">
        {/* Re-mounts on each change → a subtle pop as the number ticks. */}
        <motion.span
          key={value}
          initial={{ scale: 0.6, opacity: 0, y: -6 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="block font-display text-4xl sm:text-6xl tabular-nums gradient-text leading-none"
        >
          {value}
        </motion.span>
      </div>
      <span className="text-[11px] sm:text-xs uppercase tracking-[0.28em] text-beige/70 mt-3">
        {label}
      </span>
    </div>
  );
}

export default function Countdown({
  targetIso,
  index,
  matchCount,
  onComplete,
}: {
  targetIso: string;
  index: number;
  matchCount: number;
  onComplete: () => void;
}) {
  const targetMs = new Date(targetIso).getTime();
  const [time, setTime] = useState(() => remaining(targetMs));

  useEffect(() => {
    if (time.diff <= 0) {
      onComplete();
      return;
    }
    const id = setInterval(() => {
      const next = remaining(targetMs);
      setTime(next);
      if (next.diff <= 0) {
        clearInterval(id);
        onComplete();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMs]);

  const isLast = index === matchCount - 1;
  const label =
    matchCount === 1
      ? "Your match unlocks in…"
      : isLast
        ? "Your final match unlocks in…"
        : `Match ${index + 1} of ${matchCount} unlocks in…`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="glass rounded-[26px] max-w-xl w-full p-8 sm:p-12 text-center"
    >
      <div className="text-3xl mb-5 text-gold animate-floaty">✦</div>
      <p className="text-cream/90 mb-9 text-xl sm:text-2xl font-display tracking-wide">
        {label}
      </p>

      <div className="flex items-start justify-center gap-2.5 sm:gap-4 mb-9">
        {time.days > 0 && <Unit value={pad(time.days)} label="days" />}
        <Unit value={pad(time.hours)} label="hrs" />
        <Unit value={pad(time.minutes)} label="min" />
        <Unit value={pad(time.seconds)} label="sec" />
      </div>

      <p className="text-beige/70 text-sm">
        Keep this page open — it&apos;ll reveal automatically. Grab a drink, look
        around the room.
      </p>
    </motion.div>
  );
}
