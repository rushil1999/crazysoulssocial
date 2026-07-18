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
      <div className="glass rounded-2xl w-16 sm:w-20 py-3 font-display text-3xl sm:text-4xl tabular-nums">
        {value}
      </div>
      <span className="text-[11px] uppercase tracking-widest text-white/50 mt-2">
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
  const label = isLast
    ? "Your final match unlocks in…"
    : `Match ${index + 1} of ${matchCount} unlocks in…`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="glass rounded-3xl max-w-lg w-full p-8 sm:p-10 text-center"
    >
      <div className="text-4xl mb-4 animate-floaty">⏳</div>
      <p className="text-white/75 mb-7 text-lg font-display">{label}</p>

      <div className="flex items-start justify-center gap-3 sm:gap-4 mb-7">
        {time.days > 0 && <Unit value={pad(time.days)} label="days" />}
        <Unit value={pad(time.hours)} label="hrs" />
        <Unit value={pad(time.minutes)} label="min" />
        <Unit value={pad(time.seconds)} label="sec" />
      </div>

      <p className="text-white/50 text-sm">
        Keep this page open — it&apos;ll reveal automatically. Grab a drink, look
        around the room. 👀
      </p>
    </motion.div>
  );
}
