"use client";

import { useEffect } from "react";

type Sentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
};

/**
 * Keep the screen on while a guest is waiting for their match.
 *
 * A phone that has gone dark in someone's pocket needs two deliberate acts to
 * check — wake it, unlock it — and at a party neither happens. Holding the
 * screen awake while they're waiting means a glance is enough.
 *
 * The lock drops whenever the tab is hidden, by specification, so it is
 * re-requested on every return to visibility. Unsupported browsers (and a
 * refusal, which happens on low battery) simply do nothing.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;

    let sentinel: Sentinel | null = null;
    let released = false;

    async function request() {
      if (released || document.visibilityState !== "visible") return;
      try {
        sentinel = (await nav.wakeLock!.request("screen")) ?? null;
      } catch {
        /* denied — usually battery saver. Nothing to do. */
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void request();
    }

    void request();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
