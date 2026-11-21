"use client";

import { motion } from "framer-motion";

/**
 * The screen a guest sees the instant a match lands on them.
 *
 * Deliberately not in the house style. Every other screen is dark, gold on
 * near-black, which is lovely to read and invisible from four feet away in a
 * dim bar. This one inverts the whole display to gold so that a phone lying
 * face-up on a table changes colour across the room, and the words are large
 * enough to read without picking it up.
 *
 * The entire screen is the button. Someone holding a drink, mid-sentence,
 * should not have to aim.
 */
export default function MatchAlert({
  name,
  onOpen,
}: {
  name: string;
  onOpen: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      aria-label="Open your match"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center cursor-pointer"
      style={{ backgroundColor: "#B99043" }}
    >
      {/* A slow brightness pulse. Peripheral vision answers to change, not to
          brightness — a static gold screen stops being noticed in seconds. */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundColor: "#F1E6D4" }}
        animate={{ opacity: [0, 0.55, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative">
        <motion.div
          className="text-5xl mb-6"
          style={{ color: "#0D0C0B" }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          ✦
        </motion.div>

        <p
          className="text-xs uppercase tracking-[0.35em] mb-5 font-semibold"
          style={{ color: "#0D0C0B", opacity: 0.7 }}
        >
          {name}
        </p>

        {/* Not "your match is ready" — that is what the reveal curtain says on
            the very next screen, and hearing it twice in two taps makes the
            first one feel like a page that failed to load. This one summons;
            that one performs. */}
        <h1
          className="font-display leading-[0.95] tracking-tight"
          style={{ color: "#0D0C0B", fontSize: "clamp(2.75rem, 13vw, 5.5rem)" }}
        >
          You&apos;ve been
          <br />
          matched
        </h1>

        <p
          className="mt-10 text-lg font-semibold"
          style={{ color: "#0D0C0B", opacity: 0.75 }}
        >
          Tap anywhere
        </p>
      </div>
    </motion.button>
  );
}
