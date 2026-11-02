// The timer's sound, on the host's phone only: a soft tick for each of the last 5 seconds,
// then a short chime and a buzz at 0. Browsers only allow audio after a tap, so the host's
// Start (and +30 s) tap unlocks it. Off/on is remembered on this device.
const PREF = "doppel.timerSound";

let ctx: AudioContext | null = null;

export function soundOn() {
  try {
    return localStorage.getItem(PREF) !== "off";
  } catch {
    return true;
  }
}
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? "on" : "off");
  } catch {
    // Private mode: on for this visit.
  }
}

/** Call from the tap itself (Start, +30 s). */
export function unlockSound() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    // No Web Audio: the vibration and the "Time's up" text still show.
  }
}

function tone(freq: number, at: number, length: number, volume: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

export function play(kind: "tick" | "chime") {
  // Test hook: the end-to-end tests listen for this instead of real audio.
  window.dispatchEvent(new CustomEvent("doppel:sound", { detail: kind }));
  if (kind === "chime") navigator.vibrate?.([180, 90, 180]);
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime;
  if (kind === "tick") tone(1400, t, 0.06, 0.08);
  else {
    tone(784, t, 0.5, 0.22);
    tone(1175, t + 0.14, 0.7, 0.18);
  }
}
