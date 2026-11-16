"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const DISMISS_KEY = "cs_push_dismissed";
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type Status = "hidden" | "prompt" | "ios-install" | "working" | "done";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari uses this non-standard flag when launched from the home screen.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * A dismissible prompt that lets a guest turn on web-push alerts so they hear
 * about new pulses even when the tab is backgrounded or the phone is locked.
 *
 * - Android / desktop Chrome/Firefox/Edge: one tap to enable.
 * - iPhone: Safari only delivers push to an INSTALLED app, so if we're in a
 *   plain Safari tab we show an "Add to Home Screen" hint instead.
 */
/**
 * `email`, when known, tags this device's subscription with the guest it
 * belongs to, so a single introduction can notify just those two phones
 * instead of buzzing the whole room. Untagged devices still get room-wide
 * pulses.
 */
export default function PushOptIn({
  active,
  email,
}: {
  active: boolean;
  email?: string;
}) {
  const [status, setStatus] = useState<Status>("hidden");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !VAPID) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    (async () => {
      try {
        if (localStorage.getItem(DISMISS_KEY)) return;
      } catch {
        /* ignore */
      }

      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      // iPhone in a normal Safari tab can't do push until it's installed.
      if (!supported) {
        if (isIos() && !isStandalone() && !cancelled) setStatus("ios-install");
        return;
      }

      if (Notification.permission === "denied") return; // can't re-ask

      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const existing = await reg.pushManager.getSubscription();
        if (existing) return; // already subscribed on this device
      } catch {
        /* registration issues — fall through to showing the prompt */
      }

      if (!cancelled) setStatus("prompt");
    })();

    return () => {
      cancelled = true;
    };
  }, [active]);

  async function enable() {
    setError(null);
    setStatus("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("No worries — you can still watch the bar up top.");
        setStatus("prompt");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID as string),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), email }),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setStatus("done");
      setTimeout(() => setStatus("hidden"), 2500);
    } catch {
      setError("Couldn't turn on alerts. Try again.");
      setStatus("prompt");
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setStatus("hidden");
  }

  if (!active || status === "hidden") return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3"
      >
        <div className="glass rounded-2xl max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-gold text-lg shrink-0" aria-hidden>
            🔔
          </span>
          <div className="flex-1 min-w-0">
            {status === "done" ? (
              <p className="text-cream text-sm leading-snug">
                You&apos;re set — we&apos;ll buzz you when there&apos;s news.
              </p>
            ) : status === "ios-install" ? (
              <p className="text-cream/90 text-sm leading-snug">
                On iPhone? Tap <span className="text-gold">Share → Add to Home
                Screen</span>, open it from there, and you&apos;ll get alerts.
              </p>
            ) : (
              <p className="text-cream/90 text-sm leading-snug">
                {error || "Get a heads-up when there's news in the room."}
              </p>
            )}
          </div>

          {status === "prompt" && (
            <button
              onClick={enable}
              className="chip shrink-0 cursor-pointer text-gold border-gold/60"
            >
              Enable
            </button>
          )}
          {status === "working" && (
            <span className="text-beige/70 text-xs shrink-0">Enabling…</span>
          )}
          <button
            onClick={dismiss}
            className="text-beige/60 hover:text-cream text-xl leading-none shrink-0"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
