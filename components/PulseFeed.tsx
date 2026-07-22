"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Pulse = {
  id: string;
  text: string;
  at: number;
};

const POLL_MS = 15_000;
const CURSOR_KEY = "cs_pulse_cursor";

/**
 * Ambient "pulses" overlay for guests. Polls /api/pulses on a timer and keeps
 * the MOST RECENT pulse permanently visible in a bar at the bottom of the
 * screen — so nobody has to tap to see what's happening in the room. A button
 * on the bar opens the history of earlier pulses. Independent of the reveal
 * flow — mounted as a fixed overlay.
 *
 * `active` gates it so nothing shows on the entry gate; once a guest is past the
 * gate it runs for the rest of the night.
 */
export default function PulseFeed({ active }: { active: boolean }) {
  // Newest-first list of every pulse this device has seen.
  const [feed, setFeed] = useState<Pulse[]>([]);
  const [open, setOpen] = useState(false);

  const cursorRef = useRef<number>(0);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    // Restore the last-seen cursor so a mid-event refresh re-hydrates without
    // re-fetching everything from scratch.
    function persistCursor(now: number) {
      cursorRef.current = now;
      try {
        sessionStorage.setItem(CURSOR_KEY, String(now));
      } catch {
        /* ignore storage errors */
      }
    }

    function ingest(pulses: Pulse[], now: number) {
      const fresh = pulses.filter((p) => !seenRef.current.has(p.id));
      if (fresh.length) {
        fresh.forEach((p) => seenRef.current.add(p.id));
        // Feed is newest-first; server returns oldest-first.
        setFeed((f) => [...[...fresh].reverse(), ...f]);
      }
      persistCursor(now);
    }

    async function load(url: string) {
      try {
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { pulses: Pulse[]; now: number };
        ingest(data.pulses, data.now);
      } catch {
        /* transient — the next poll retries */
      }
    }

    // Initial hydrate (recent feed), then poll for anything newer.
    load("/api/pulses");
    const interval = setInterval(
      () => load(`/api/pulses?since=${cursorRef.current}`),
      POLL_MS
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active]);

  if (!active) return null;

  const latest = feed[0] ?? null;
  const earlier = feed.slice(1);

  // Nothing to show until the first pulse of the night arrives.
  if (!latest) return null;

  return (
    <>
      {/* History panel — sits just below the bar */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-x-0 top-[5.5rem] z-50 px-3 pointer-events-none"
          >
            <div className="glass rounded-2xl max-w-2xl mx-auto max-h-[50vh] flex flex-col overflow-hidden pointer-events-auto">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gold/20">
                <div className="eyebrow">From the room</div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-beige/70 hover:text-cream text-xl leading-none"
                  aria-label="Close pulses"
                >
                  ×
                </button>
              </div>
              <div className="overflow-y-auto px-4 py-3 space-y-2">
                {feed.map((p, i) => (
                  <div key={p.id} className="tile rounded-xl px-4 py-3">
                    <p className="text-cream/90 leading-snug">{p.text}</p>
                    {i === 0 && (
                      <span className="text-gold/70 text-[0.7rem] tracking-wide">
                        most recent
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent bar — always shows the latest pulse */}
      <div className="fixed inset-x-0 top-0 z-50 px-3 pt-3">
        <div className="glass rounded-2xl max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <motion.span
            key={`icon-${latest.id}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="text-gold text-lg shrink-0"
            aria-hidden
          >
            ✦
          </motion.span>

          <div className="flex-1 min-w-0">
            <div className="eyebrow mb-0.5">From the room</div>
            <AnimatePresence mode="wait">
              <motion.p
                key={latest.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="text-cream leading-snug line-clamp-2"
              >
                {latest.text}
              </motion.p>
            </AnimatePresence>
          </div>

          {earlier.length > 0 && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="chip shrink-0 cursor-pointer"
              aria-label="View earlier pulses"
            >
              {open ? "Hide" : `Earlier · ${earlier.length}`}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
