"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import HostRounds from "@/components/HostRounds";

const SECRET_KEY = "cs_pulse_secret";
const QUEUE_KEY = "cs_pulse_queue";

type QueueItem = { id: string; text: string };
type SentItem = { id: string; text: string; at: number };

function newId() {
  // Host-side only; crypto.randomUUID is available in modern browsers.
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

export default function HostConsole() {
  const [secret, setSecret] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [sent, setSent] = useState<SentItem[]>([]);
  const [draft, setDraft] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Rounds first: on the night, running introductions is the job, and pulses
  // are the garnish.
  const [tab, setTab] = useState<"rounds" | "pulses">("rounds");

  // Restore secret + queue from this device.
  useEffect(() => {
    try {
      const s = sessionStorage.getItem(SECRET_KEY);
      if (s) setSecret(s);
      const q = localStorage.getItem(QUEUE_KEY);
      if (q) setQueue(JSON.parse(q) as QueueItem[]);
    } catch {
      /* ignore */
    }
  }, []);

  // Persist queue on change.
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      /* ignore */
    }
  }, [queue]);

  function unlock(e: React.FormEvent) {
    e.preventDefault();
    const s = secretInput.trim();
    if (!s) return;
    try {
      sessionStorage.setItem(SECRET_KEY, s);
    } catch {
      /* ignore */
    }
    setSecret(s);
    setSecretInput("");
  }

  // One box handles both a single pulse and a pasted batch (one per line).
  function addToQueue() {
    const lines = draft
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    setQueue((q) => [...q, ...lines.map((text) => ({ id: newId(), text }))]);
    setDraft("");
  }

  function remove(id: string) {
    setQueue((q) => q.filter((item) => item.id !== id));
  }

  async function send(item: QueueItem) {
    if (!secret) return;
    setSendingId(item.id);
    setError(null);
    try {
      const res = await fetch("/api/pulses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text, secret }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't send. Try again.");
        // Only a genuinely wrong secret sends us back to the gate; a server
        // config problem (503) keeps the secret so re-typing it doesn't loop.
        if (res.status === 401) {
          setSecret(null);
          try {
            sessionStorage.removeItem(SECRET_KEY);
          } catch {
            /* ignore */
          }
        }
        return;
      }
      const data = (await res.json()) as { pulse: SentItem };
      setSent((s) => [{ ...data.pulse }, ...s]);
      remove(item.id);
    } catch {
      setError("Network hiccup. Check your connection and try again.");
    } finally {
      setSendingId(null);
    }
  }

  // ── Secret gate ────────────────────────────────────────────────────────────
  if (!secret) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5 py-12">
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          onSubmit={unlock}
          className="glass rounded-2xl max-w-sm w-full p-8 text-center"
        >
          <div className="eyebrow mb-3">Crazy Souls · Host</div>
          <h1 className="font-display text-2xl mb-5 tracking-wide">
            <span className="gradient-text">Host console</span>
          </h1>
          <input
            className="field mb-4"
            type="password"
            placeholder="Admin secret"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            autoFocus
          />
          <button className="btn-primary w-full">Enter</button>
        </motion.form>
      </main>
    );
  }

  // ── Console ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen px-5 py-10">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="eyebrow">Crazy Souls · Host</div>
            <h1 className="font-display text-2xl tracking-wide">
              <span className="gradient-text">Host console</span>
            </h1>
          </div>
          <span className="chip">✦ live</span>
        </div>

        {/* Two jobs, one phone. */}
        <div className="flex gap-2 mb-6">
          {(["rounds", "pulses"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm capitalize transition ${
                tab === t
                  ? "bg-gold/20 text-cream ring-1 ring-gold/50"
                  : "tile text-beige/80"
              }`}
            >
              {t === "rounds" ? "Introductions" : "Pulses"}
            </button>
          ))}
        </div>

        {tab === "rounds" ? (
          <HostRounds
            secret={secret}
            onAuthFail={() => {
              setSecret(null);
              try {
                sessionStorage.removeItem(SECRET_KEY);
              } catch {
                /* ignore */
              }
            }}
          />
        ) : (
          <>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-gold mb-4"
          >
            {error}
          </motion.p>
        )}

        {/* Compose — one box, one line or many */}
        <div className="glass rounded-2xl p-5 mb-6">
          <textarea
            className="field mb-3"
            rows={3}
            placeholder={"Type a pulse, or paste several — one per line.\nSomeone in the room knows how to surf 🏄"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Cmd/Ctrl+Enter = quick add without leaving the keyboard.
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                addToQueue();
              }
            }}
            autoFocus
          />
          <button
            className="btn-primary w-full"
            onClick={addToQueue}
            disabled={!draft.trim()}
          >
            Add to queue
          </button>
        </div>

        {/* Queue — release one by one */}
        <div className="mb-6">
          <div className="eyebrow mb-3">Queued · {queue.length}</div>
          {queue.length === 0 ? (
            <p className="text-beige/60 text-sm">
              Nothing queued. Add a line above, then tap Send to broadcast it.
            </p>
          ) : (
            <div className="space-y-2">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="tile rounded-xl px-4 py-3 flex items-center gap-3"
                >
                  <p className="text-cream/90 leading-snug flex-1">
                    {item.text}
                  </p>
                  <button
                    className="btn-primary shrink-0 px-4 py-2"
                    disabled={sendingId === item.id}
                    onClick={() => send(item)}
                  >
                    {sendingId === item.id ? "Sending…" : "Send"}
                  </button>
                  <button
                    className="text-beige/60 hover:text-cream text-xl leading-none shrink-0"
                    aria-label="Remove"
                    onClick={() => remove(item.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recently sent */}
        {sent.length > 0 && (
          <div>
            <div className="eyebrow mb-3">Sent · {sent.length}</div>
            <div className="space-y-2">
              {sent.map((item) => (
                <div
                  key={item.id}
                  className="tile rounded-xl px-4 py-3 flex items-center gap-3 opacity-70"
                >
                  <span className="text-gold shrink-0">✓</span>
                  <p className="text-cream/80 leading-snug flex-1">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </main>
  );
}
