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
      className="glass rounded-3xl max-w-lg w-full p-8 sm:p-10 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        className="text-5xl mb-5"
      >
        🌟
      </motion.div>
      <h1 className="font-display text-3xl sm:text-4xl mb-5">
        Hi <span className="gradient-text">{name}</span>.
      </h1>
      <p className="text-lg text-white/85 leading-relaxed mb-8">{praise}</p>

      <div className="border-t border-white/10 pt-7">
        <p className="text-white/70 mb-5">
          We found{" "}
          <span className="text-blush font-semibold">
            {matchCount} {matchCount === 1 ? "person" : "people"}
          </span>{" "}
          we think you should meet tonight. They&apos;ll be revealed one at a
          time — a little anticipation never hurt anyone. 😉
        </p>
        <button className="btn-primary" onClick={onContinue}>
          I&apos;m ready →
        </button>
      </div>
    </motion.div>
  );
}
