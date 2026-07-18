"use client";

import { useEffect, useState } from "react";
import EmailGate from "@/components/EmailGate";
import Praise from "@/components/Praise";
import Countdown from "@/components/Countdown";
import MatchReveal from "@/components/MatchReveal";

type UnlockResult = {
  name: string;
  praise: string;
  revealTimes: string[];
  matchCount: number;
};

type Phase = "gate" | "praise" | "countdown" | "reveal" | "done";

export default function TokenPage({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
  const [phase, setPhase] = useState<Phase>("gate");
  const [data, setData] = useState<UnlockResult | null>(null);
  const [email, setEmail] = useState<string>("");
  const [index, setIndex] = useState(0);
  const [restoring, setRestoring] = useState(true);

  // Auto-restore an already-unlocked session (no need to re-enter email).
  useEffect(() => {
    let cancelled = false;
    const stored =
      typeof window !== "undefined"
        ? sessionStorage.getItem(`unlock:${token}`)
        : null;
    if (!stored) {
      setRestoring(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, email: stored }),
        });
        if (res.ok && !cancelled) {
          const d = (await res.json()) as UnlockResult;
          setData(d);
          setEmail(stored);
          setPhase("praise");
        }
      } catch {
        /* fall back to the gate */
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const revealTimeFor = (i: number) => {
    if (!data) return "";
    return data.revealTimes[i] ?? data.revealTimes[data.revealTimes.length - 1];
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-12">
      {restoring ? (
        <div className="text-beige/70 animate-pulse font-display text-xl tracking-wide">
          Loading…
        </div>
      ) : phase === "gate" ? (
        <EmailGate
          token={token}
          onUnlock={(d, e) => {
            setData(d);
            setEmail(e);
            setPhase("praise");
          }}
        />
      ) : phase === "praise" && data ? (
        <Praise
          name={data.name}
          praise={data.praise}
          matchCount={data.matchCount}
          onContinue={() => {
            setIndex(0);
            setPhase("countdown");
          }}
        />
      ) : phase === "countdown" && data ? (
        <Countdown
          key={`cd-${index}`}
          targetIso={revealTimeFor(index)}
          index={index}
          matchCount={data.matchCount}
          onComplete={() => setPhase("reveal")}
        />
      ) : phase === "reveal" && data ? (
        <MatchReveal
          key={`rv-${index}`}
          token={token}
          email={email}
          index={index}
          matchCount={data.matchCount}
          onNext={() => {
            const next = index + 1;
            if (next >= data.matchCount) {
              setPhase("done");
            } else {
              setIndex(next);
              setPhase("countdown");
            }
          }}
        />
      ) : phase === "done" && data ? (
        <div className="glass rounded-2xl max-w-lg w-full p-10 text-center">
          <div className="text-3xl mb-5 text-gold animate-floaty">✦</div>
          <h1 className="font-display text-3xl sm:text-4xl mb-4 tracking-wide">
            <span className="gradient-text">
              {data.matchCount === 1
                ? `There they are, ${data.name}.`
                : `That's everyone, ${data.name}.`}
            </span>
          </h1>
          <div className="rule w-24 mx-auto mb-5" />
          <p className="text-cream/85 leading-relaxed mb-2">
            {data.matchCount === 1
              ? "That's your match for tonight. The rest is up to you — go find them, say hi, and enjoy yourself."
              : "You've met all your matches for tonight. The rest is up to you — go find them, say hi, and enjoy yourself."}
          </p>
          <p className="text-beige/70 text-sm mt-6">
            You can revisit this page anytime tonight to check{" "}
            {data.matchCount === 1 ? "the name" : "names"}, ice breakers, and
            talking points.
          </p>
          <button
            className="btn-ghost mt-8"
            onClick={() => {
              setIndex(0);
              setPhase("countdown");
            }}
          >
            {data.matchCount === 1 ? "Revisit my match" : "Revisit my matches"}
          </button>
        </div>
      ) : null}
    </main>
  );
}
