"use client";

import { useEffect, useRef, useState } from "react";
import EmailGate from "@/components/EmailGate";
import Praise from "@/components/Praise";
import Countdown from "@/components/Countdown";
import MatchReveal from "@/components/MatchReveal";
import PulseFeed from "@/components/PulseFeed";
import PushOptIn from "@/components/PushOptIn";
import WaitingForNext from "@/components/WaitingForNext";

type UnlockResult = {
  name: string;
  praise: string;
  revealTimes: string[];
  matchCount: number;
  nextWindow: string | null;
};

type Phase = "gate" | "praise" | "countdown" | "reveal" | "waiting" | "done";

export default function RevealExperience() {
  const [phase, setPhase] = useState<Phase>("gate");
  const [data, setData] = useState<UnlockResult | null>(null);
  const [email, setEmail] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [index, setIndex] = useState(0);
  const [restoring, setRestoring] = useState(true);
  const [rechecking, setRechecking] = useState(false);

  // Latest data available synchronously (for the poll comparison below).
  const dataRef = useRef<UnlockResult | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Re-fetch the profile. Rounds are additive and later rounds' matches files
  // (matches_2.json, …) get filled *during* the event, so a re-fetch can turn up
  // a newly-assigned match. Returns the fresh profile (or null).
  async function recheck(): Promise<UnlockResult | null> {
    if (!email || !firstName) return null;
    setRechecking(true);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, firstName }),
      });
      if (res.ok) {
        const d = (await res.json()) as UnlockResult;
        setData(d);
        return d;
      }
    } catch {
      /* leave current state in place */
    } finally {
      setRechecking(false);
    }
    return null;
  }

  // Re-fetch and, if the guest has gained a match since, jump into revealing it.
  // Returns true when a new match arrived (the waiting screen then unmounts).
  async function checkForNext(): Promise<boolean> {
    const prev = dataRef.current?.matchCount ?? 0;
    const d = await recheck();
    if (d && d.matchCount > prev) {
      setIndex(prev); // first not-yet-seen match
      setPhase("countdown"); // its time has passed → reveals right away
      return true;
    }
    return false;
  }

  // Auto-restore an already-unlocked session (no need to re-enter details).
  useEffect(() => {
    let cancelled = false;
    const storedEmail =
      typeof window !== "undefined"
        ? sessionStorage.getItem("cs_unlock_email")
        : null;
    const storedName =
      typeof window !== "undefined"
        ? sessionStorage.getItem("cs_unlock_name")
        : null;
    if (!storedEmail || !storedName) {
      setRestoring(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: storedEmail, firstName: storedName }),
        });
        if (res.ok && !cancelled) {
          const d = (await res.json()) as UnlockResult;
          setData(d);
          setEmail(storedEmail);
          setFirstName(storedName);
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
  }, []);

  // A guest with no match and no scheduled window is usually a late arrival:
  // they filled the form after a round was committed and are waiting to be
  // paired off the bench, which can happen within a minute. WaitingForNext
  // polls on its own, but that screen only renders when a window is scheduled
  // — so poll here too rather than leaving them on a static page.
  //
  // Backs off (10s → 60s) and pauses while the tab is hidden, because every
  // check is a round trip to the store and the event runs for hours.
  const waitingForFirst =
    phase !== "gate" && !!data && data.matchCount === 0 && !data.nextWindow;

  useEffect(() => {
    if (!waitingForFirst) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempt = 0;

    const delay = () => {
      const steps = [10_000, 10_000, 15_000, 20_000, 30_000];
      return steps[Math.min(attempt, steps.length - 1)] ?? 60_000;
    };

    async function tick() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, 15_000);
        return;
      }
      const found = await checkForNext();
      if (cancelled || found) return; // found → parent advances, effect tears down
      attempt += 1;
      timer = setTimeout(tick, delay());
    }

    timer = setTimeout(tick, delay());
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForFirst]);

  const revealTimeFor = (i: number) => {
    if (!data) return "";
    return data.revealTimes[i] ?? data.revealTimes[data.revealTimes.length - 1];
  };

  const doneScreen = data && (
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
        {data.matchCount === 1 ? "the name" : "names"}, ice breakers, and talking
        points.
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
  );

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-12">
      <PulseFeed active={phase !== "gate"} />
      <PushOptIn active={phase !== "gate"} email={email || undefined} />
      {restoring ? (
        <div className="text-beige/70 animate-pulse font-display text-xl tracking-wide">
          Loading…
        </div>
      ) : phase === "gate" ? (
        <EmailGate
          onUnlock={(d, e, fn) => {
            setData(d);
            setEmail(e);
            setFirstName(fn);
            setPhase("praise");
          }}
        />
      ) : data && data.matchCount === 0 ? (
        // Person exists but has no match assigned yet (skewed ratio, or a later
        // round not filled in). If a reveal window is still coming, count down to
        // it; otherwise show a warm, non-breaking holding screen.
        data.nextWindow ? (
          <WaitingForNext
            name={data.name}
            praise={data.praise}
            nextWindow={data.nextWindow}
            firstMatch
            onCheck={checkForNext}
          />
        ) : (
          <div className="glass rounded-2xl max-w-lg w-full p-8 sm:p-10 text-center">
            <div className="text-3xl mb-5 text-gold animate-floaty">✦</div>
            <h1 className="font-display text-3xl sm:text-4xl mb-4 tracking-wide">
              Hi <span className="gradient-text">{data.name}</span>.
            </h1>
            {data.praise && (
              <p className="text-cream/90 leading-relaxed mb-6">{data.praise}</p>
            )}
            <div className="rule w-full mb-6" />
            <p className="text-cream/85 leading-relaxed mb-2">
              We don&apos;t have a match to reveal for you just yet — the
              night&apos;s still unfolding.
            </p>
            <p className="text-beige/75 leading-relaxed">
              So make it yours: grab a drink, start a conversation, and keep this
              page handy. If we find someone for you tonight, they&apos;ll appear
              right here.
            </p>
            <button
              className="btn-ghost mt-8"
              disabled={rechecking}
              onClick={recheck}
            >
              {rechecking ? "Checking…" : "Check again"}
            </button>
          </div>
        )
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
          email={email}
          firstName={firstName}
          index={index}
          matchCount={data.matchCount}
          nextRevealIso={
            index + 1 < data.matchCount ? revealTimeFor(index + 1) : null
          }
          moreComing={index + 1 >= data.matchCount && !!data.nextWindow}
          onNext={() => {
            const next = index + 1;
            if (next < data.matchCount) {
              // The inline timer on the reveal screen already handled the wait,
              // so go straight to the next reveal.
              setIndex(next);
              setPhase("reveal");
            } else if (data.nextWindow) {
              // Last currently-assigned match, but a later window is scheduled.
              setPhase("waiting");
            } else {
              setPhase("done");
            }
          }}
        />
      ) : phase === "waiting" && data && data.nextWindow ? (
        <WaitingForNext
          name={data.name}
          nextWindow={data.nextWindow}
          firstMatch={false}
          onCheck={checkForNext}
        />
      ) : (phase === "done" || phase === "waiting") && data ? (
        doneScreen
      ) : null}
    </main>
  );
}
