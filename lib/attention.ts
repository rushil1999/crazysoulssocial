/**
 * Getting a guest to look at their phone, in a dark bar, mid-conversation.
 *
 * Push notifications do not solve this. Apple delivers web push only to Home
 * Screen web apps, so every iPhone with this page open in a Safari tab gets
 * nothing at all — and nobody adds a form to their Home Screen at a party.
 * What is left is the page itself: when a match lands it makes a sound, buzzes
 * where it can, and takes over the screen.
 *
 * All of it is best-effort by design. Audio needs a prior tap, vibration is
 * Android-only, and a backgrounded iOS tab is frozen regardless. Every call
 * here fails quietly, because none of it is load-bearing: the match is on the
 * screen whether or not the phone made a noise.
 */

type Ctor = typeof AudioContext;

let ctx: AudioContext | null = null;

/**
 * Unlock audio. Must run inside a real user gesture — Safari refuses to start
 * an AudioContext otherwise, and a context created outside one stays mute
 * forever rather than erroring, which is the kind of failure nobody notices
 * until the room is full.
 */
export function primeAttention(): void {
  try {
    const win = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    const Ctx = win.AudioContext ?? win.webkitAudioContext;
    if (!Ctx) return;
    ctx ??= new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* no audio tonight */
  }
}

/** True once a gesture has unlocked audio. */
export function attentionPrimed(): boolean {
  return ctx !== null;
}

/**
 * Three rising notes, about a second. Chosen to carry over conversation
 * without sounding like an alarm — this is good news arriving, not a warning.
 */
export function chime(): void {
  buzz();
  const c = ctx;
  if (!c) return;
  try {
    if (c.state === "suspended") void c.resume();
    const now = c.currentTime;
    const notes = [587.33, 880, 1174.66]; // D5, A5, D6
    notes.forEach((freq, i) => {
      const at = now + i * 0.17;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      // Ramp rather than switch: an instant start on a sine is a click.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.3, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
      osc.connect(gain).connect(c.destination);
      osc.start(at);
      osc.stop(at + 0.6);
    });
  } catch {
    /* ignore */
  }
}

/** Android buzzes; iOS Safari has no Vibration API and simply won't. */
function buzz(): void {
  try {
    navigator.vibrate?.([120, 90, 120, 90, 260]);
  } catch {
    /* ignore */
  }
}
