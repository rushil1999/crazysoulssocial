"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Pulse = { id: string; text: string; at: number };

const POLL_MS = 8_000;

/**
 * Venue big-screen view (open on a TV/projector if one is available). Polls the
 * same pulse feed and shows the latest one large, with recent ones beneath.
 * No auth, no interaction — just a display.
 */
export default function ScreenPage() {
  const [feed, setFeed] = useState<Pulse[]>([]);
  const cursorRef = useRef<number>(0);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load(url: string) {
      try {
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { pulses: Pulse[]; now: number };
        const fresh = data.pulses.filter((p) => !seenRef.current.has(p.id));
        if (fresh.length) {
          fresh.forEach((p) => seenRef.current.add(p.id));
          setFeed((f) => [...[...fresh].reverse(), ...f]);
        }
        cursorRef.current = data.now;
      } catch {
        /* transient */
      }
    }

    load("/api/pulses");
    const interval = setInterval(
      () => load(`/api/pulses?since=${cursorRef.current}`),
      POLL_MS
    );
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const latest = feed[0] ?? null;
  const earlier = feed.slice(1, 5);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-8 py-12 text-center">
      <div className="eyebrow text-base sm:text-lg mb-10 flex items-center gap-3">
        <span className="text-gold">✦</span> From the room
      </div>

      {latest ? (
        <AnimatePresence mode="wait">
          <motion.h1
            key={latest.id}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="font-display text-5xl sm:text-7xl lg:text-8xl leading-tight max-w-6xl gradient-text"
          >
            {latest.text}
          </motion.h1>
        </AnimatePresence>
      ) : (
        <p className="font-display text-3xl sm:text-4xl text-beige/60">
          The night is just getting started…
        </p>
      )}

      {earlier.length > 0 && (
        <div className="mt-16 flex flex-col items-center gap-3">
          <div className="rule w-32 mb-2" />
          {earlier.map((p) => (
            <p
              key={p.id}
              className="text-beige/55 text-lg sm:text-2xl leading-snug"
            >
              {p.text}
            </p>
          ))}
        </div>
      )}
    </main>
  );
}
