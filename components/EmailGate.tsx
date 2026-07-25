"use client";

import { useState } from "react";
import { motion } from "framer-motion";

type UnlockResult = {
  name: string;
  praise: string;
  revealTimes: string[];
  matchCount: number;
  nextWindow: string | null;
};

export default function EmailGate({
  onUnlock,
}: {
  onUnlock: (data: UnlockResult, email: string, firstName: string) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Try again.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as UnlockResult;
      const normEmail = email.trim().toLowerCase();
      const normFirst = firstName.trim();
      try {
        sessionStorage.setItem("cs_unlock_email", normEmail);
        sessionStorage.setItem("cs_unlock_name", normFirst);
      } catch {
        /* ignore storage errors */
      }
      onUnlock(data, normEmail, normFirst);
    } catch {
      setError("Network hiccup. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="glass rounded-2xl max-w-md w-full p-8 sm:p-10 text-center"
    >
      <div className="text-xs uppercase tracking-[0.35em] text-gold/80 mb-3">
        Crazy Souls
      </div>
      <h1 className="font-display text-3xl sm:text-4xl mb-3 tracking-wide">
        <span className="gradient-text">Someone&apos;s waiting.</span>
      </h1>
      <div className="rule w-20 mx-auto mb-5" />
      <p className="text-beige mb-7 leading-relaxed">
        Enter your first name and the email you signed up with, and we&apos;ll
        unlock what we found for you.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <input
          className="field"
          type="text"
          autoComplete="given-name"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          disabled={loading}
          autoFocus
        />
        <input
          className="field"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-gold"
          >
            {error}
          </motion.p>
        )}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Unlocking…" : "Unlock my match ✦"}
        </button>
      </form>

      <p className="text-beige/60 text-xs mt-6">
        Private &amp; just for you. Nothing is shared without you.
      </p>
    </motion.div>
  );
}
