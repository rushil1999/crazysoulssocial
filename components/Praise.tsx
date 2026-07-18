"use client";

import { motion } from "framer-motion";

export default function Praise({
  name,
  praise,
  matchCount,
  onContinue,
}: {
  name: string;
  praise: string;
  matchCount: number;
  onContinue: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="glass rounded-2xl max-w-lg w-full p-8 sm:p-10 text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        className="text-3xl mb-5 text-gold"
      >
        ✦
      </motion.div>
      <h1 className="font-display text-3xl sm:text-4xl mb-5 tracking-wide">
        Hi <span className="gradient-text">{name}</span>.
      </h1>
      <p className="text-lg text-cream/90 leading-relaxed mb-8">{praise}</p>

      <div className="rule w-full mb-7" />
      <div>
        <p className="text-beige mb-6">
          We found{" "}
          <span className="text-gold font-semibold">
            {matchCount === 1
              ? "someone"
              : `${matchCount} people`}
          </span>{" "}
          we think you should meet tonight.{" "}
          {matchCount === 1
            ? "When the moment arrives, they'll be revealed — a little anticipation never hurt anyone."
            : "They'll be revealed one at a time — a little anticipation never hurt anyone."}
        </p>
        <button className="btn-primary" onClick={onContinue}>
          I&apos;m ready →
        </button>
      </div>
    </motion.div>
  );
}
