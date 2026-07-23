"use client";

import { motion } from "framer-motion";
import type { Match } from "@/lib/data";
import { Ornament, FooterTag } from "./Ornament";
import { QuoteIcon, SparkleGlyph } from "./icons";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="text-center">
      <Ornament className="mb-5" />
      <h3 className="font-display text-3xl tracking-wide">{title}</h3>
      {subtitle && <p className="text-beige/70 mt-2">{subtitle}</p>}
    </div>
  );
}

export default function MatchCard({
  match,
  index,
  matchCount,
}: {
  match: Match;
  index: number;
  matchCount: number;
}) {
  const initial = match.name.trim().charAt(0).toUpperCase();
  const funFacts = [
    match.unexpectedFlex && {
      label: "Unexpected flex",
      value: match.unexpectedFlex,
    },
    match.canTeach && {
      label: "Can teach you in an hour",
      value: match.canTeach,
    },
    match.freeMonth && {
      label: "With a free month, they'd…",
      value: match.freeMonth,
    },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full max-w-lg space-y-6"
    >
      {/* — Match header — */}
      <motion.div variants={item} className="glass rounded-[26px] p-8 sm:p-10 text-center">
        <Ornament className="mb-6" />
        <p className="eyebrow">You&apos;ve been matched with</p>

        <div className="mt-6 mb-5 flex justify-center">
          <div className="w-28 h-28 rounded-full ring grid place-items-center">
            <span className="font-display text-5xl text-gold">{initial}</span>
          </div>
        </div>

        <h2 className="font-display text-4xl sm:text-5xl tracking-wide">
          {match.name}
        </h2>

        {typeof match.compatibility === "number" && (
          <div className="mt-7 inline-flex items-center gap-2.5 rounded-full ring px-6 py-2.5">
            <span className="font-display text-xl text-gold">
              {match.compatibility}%
            </span>
            <span className="text-[11px] tracking-[0.22em] uppercase text-beige/70">
              Compatibility
            </span>
          </div>
        )}
      </motion.div>

      {/* — Their rhythm (social style) — */}
      {match.vibe && (
        <motion.div variants={item} className="glass rounded-[22px] p-7">
          <div className="eyebrow flex items-center gap-2 mb-4">
            <SparkleGlyph size={15} className="text-gold/80" /> Their Rhythm
          </div>
          <p className="font-display text-xl leading-relaxed text-cream/95">
            {match.vibe}
          </p>
        </motion.div>
      )}

      {/* — Why you two — */}
      <motion.div variants={item} className="pt-2">
        <SectionHeading title="Why You Two" />
        <p className="mt-5 text-center font-display text-lg leading-relaxed text-cream/90">
          {match.whyMatched}
        </p>
      </motion.div>

      {/* — Common ground — */}
      {match.commonAttributes.length > 0 && (
        <motion.div variants={item}>
          <p className="eyebrow mb-3">Common Ground</p>
          <div className="space-y-3">
            {match.commonAttributes.map((c, i) => (
              <div
                key={i}
                className="tile rounded-2xl px-5 py-3.5 flex items-center gap-3.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
                <span className="text-cream/90">{c}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* — Fun facts (unexpected flex + can-teach) — */}
      {funFacts.length > 0 && (
        <motion.div variants={item} className="grid sm:grid-cols-2 gap-3">
          {funFacts.map((f, i) => (
            <div key={i} className="tile rounded-2xl p-5">
              <div className="eyebrow flex items-center gap-2 mb-2.5">
                <SparkleGlyph size={13} className="text-gold/80" /> {f.label}
              </div>
              <p className="font-display text-lg leading-snug text-cream/95">
                {f.value}
              </p>
            </div>
          ))}
        </motion.div>
      )}

      {/* — Ice breakers — */}
      {match.iceBreakers.length > 0 && (
        <motion.div variants={item} className="pt-2">
          <SectionHeading
            title="Ice Breakers"
            subtitle="A few nudges past the small talk."
          />
          <div className="mt-6 space-y-4">
            {match.iceBreakers.map((ib, i) => (
              <div
                key={i}
                className="tile rounded-2xl p-5 flex items-center gap-4"
              >
                <span className="shrink-0 w-11 h-11 rounded-full ring grid place-items-center text-gold text-xs tracking-wider tabular-nums">
                  {pad2(i + 1)}
                </span>
                <QuoteIcon className="text-gold/70 shrink-0" />
                <p className="font-display text-lg leading-snug text-cream/95">
                  {ib}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* — What to talk about — */}
      {match.whatToTalkAbout && (
        <motion.div variants={item}>
          <p className="eyebrow mb-3">What to Talk About</p>
          <div className="glass rounded-[22px] p-7">
            <p className="text-cream/90 leading-relaxed">{match.whatToTalkAbout}</p>
          </div>
        </motion.div>
      )}

      {/* — Quirky closer — */}
      {match.quirkyComment && (
        <motion.div
          variants={item}
          className="rounded-2xl px-6 py-4 text-center italic text-cream/90 bg-gradient-to-r from-gold/12 to-gold/5 border border-gold/25"
        >
          {match.quirkyComment}
        </motion.div>
      )}

      <motion.div variants={item} className="pt-2">
        <FooterTag />
      </motion.div>
    </motion.div>
  );
}
