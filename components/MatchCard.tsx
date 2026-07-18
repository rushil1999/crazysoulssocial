"use client";

import { motion } from "framer-motion";
import type { Match } from "@/lib/data";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={item} className="text-left">
      <h3 className="flex items-center gap-2 text-sm uppercase tracking-widest text-beige/70 mb-2">
        <span>{icon}</span> {title}
      </h3>
      {children}
    </motion.div>
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
  const initials = match.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="glass rounded-2xl max-w-lg w-full p-8 sm:p-10"
    >
      <motion.div variants={item} className="text-center mb-6">
        <span className="text-xs uppercase tracking-[0.25em] text-gold/80">
          {matchCount === 1
            ? "Your match"
            : index === matchCount - 1
              ? "Your final match"
              : `Match ${index + 1} of ${matchCount}`}
        </span>
        <div className="flex flex-col items-center mt-4">
          {match.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={match.photo}
              alt={match.name}
              className="w-24 h-24 rounded-full object-cover border border-gold/50 shadow-lg"
            />
          ) : (
            <div className="w-24 h-24 rounded-full grid place-items-center font-display text-3xl text-cream bg-gradient-to-br from-gold/25 to-gold/5 border border-gold/45">
              {initials}
            </div>
          )}
          <h2 className="font-display text-4xl mt-4 tracking-wide">
            <span className="gradient-text">{match.name}</span>
          </h2>
        </div>
      </motion.div>

      <div className="space-y-6">
        <Section icon="✦" title="Why you two">
          <p className="text-cream/90 leading-relaxed">{match.whyMatched}</p>
        </Section>

        <Section icon="❧" title="What you share">
          <div className="flex flex-wrap gap-2">
            {match.commonAttributes.map((attr, i) => (
              <span key={i} className="chip">
                {attr}
              </span>
            ))}
          </div>
        </Section>

        <Section icon="❝" title="Ice breakers">
          <ul className="space-y-2">
            {match.iceBreakers.map((ib, i) => (
              <li key={i} className="flex gap-2 text-cream/90 leading-relaxed">
                <span className="text-gold">→</span>
                <span>{ib}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon="✧" title="What to talk about">
          <p className="text-cream/90 leading-relaxed">{match.whatToTalkAbout}</p>
        </Section>

        <motion.div
          variants={item}
          className="rounded-xl px-5 py-4 bg-gradient-to-r from-gold/12 to-gold/5 border border-gold/30 text-center italic text-cream/90"
        >
          {match.quirkyComment}
        </motion.div>
      </div>
    </motion.div>
  );
}
