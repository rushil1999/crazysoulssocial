"use client";

import { useEffect, useState } from "react";

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

/** A small ticking timer meant to sit inline (e.g. under a match card). */
export default function InlineCountdown({
  targetIso,
  onComplete,
}: {
  targetIso: string;
  onComplete?: () => void;
}) {
  const targetMs = new Date(targetIso).getTime();
  const [t, setT] = useState(() => remaining(targetMs));

  useEffect(() => {
    if (t.diff <= 0) {
      onComplete?.();
      return;
    }
    const id = setInterval(() => {
      const next = remaining(targetMs);
      setT(next);
      if (next.diff <= 0) {
        clearInterval(id);
        onComplete?.();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMs]);

  const parts = t.days > 0 ? [t.days, t.hours, t.minutes, t.seconds] : [t.hours, t.minutes, t.seconds];
  return <span className="tabular-nums">{parts.map(pad).join(":")}</span>;
}
