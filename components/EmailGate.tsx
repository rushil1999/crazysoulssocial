"use client";

import { useState } from "react";
import { motion } from "framer-motion";

type UnlockResult = {
  name: string;
  praise: string;
  revealTimes: string[];
  matchCount: number;
};

export default function EmailGate({
  token,
  onUnlock,
}: {
  token: string;
  onUnlock: (data: UnlockResult, email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Try again.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as UnlockResult;
      const normEmail = email.trim().toLowerCase();
      try {
        sessionStorage.setItem(`unlock:${token}`, normEmail);
      } catch {
        /* ignore storage errors */
      }
      onUnlock(data, normEmail);
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
      className="glass rounded-3xl max-w-md w-full p-8 sm:p-10 text-center"
    >
      <div className="text-4xl mb-4 animate-floaty">🔮</div>
      <h1 className="font-display text-3xl sm:text-4xl mb-3">
        <span className="gradient-text">Someone&apos;s waiting.</span>
      </h1>
      <p className="text-white/70 mb-7 leading-relaxed">
        This link is yours and yours alone. Confirm the email you signed up with
        to unlock what we found for you.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <input
          className="field"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          autoFocus
        />
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-blush"
          >
            {error}
          </motion.p>
        )}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Unlocking…" : "Unlock my matches ✨"}
        </button>
      </form>

      <p className="text-white/40 text-xs mt-6">
        Private &amp; just for you. Nothing is shared without you.
      </p>
    </motion.div>
  );
}
