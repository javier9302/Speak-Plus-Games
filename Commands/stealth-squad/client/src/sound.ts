/**
 * Tiny synthesized sound effects (Web Audio oscillators — no audio files).
 * Browsers only allow sound after a tap, so `unlock()` runs on the first
 * pointer press. Muting is remembered per device.
 */

type Wave = OscillatorType;
interface Note {
  freq: number;
  /** Seconds from the start of the sound. */
  at: number;
  dur: number;
  wave?: Wave;
  vol?: number;
  /** Slide to this frequency over the note. */
  to?: number;
}

const SOUNDS: Record<string, Note[]> = {
  // Alarm: two-tone siren.
  spotted: [0, 0.18, 0.36, 0.54].map((at, i) => ({ freq: i % 2 ? 660 : 880, at, dur: 0.17, wave: "square" as Wave, vol: 0.12 })),
  // Guard noticing something: short rising "huh?".
  alert: [{ freq: 500, to: 800, at: 0, dur: 0.12, wave: "triangle", vol: 0.15 }],
  checkpoint: [
    { freq: 523, at: 0, dur: 0.12 },
    { freq: 659, at: 0.1, dur: 0.12 },
    { freq: 784, at: 0.2, dur: 0.22 },
  ],
  won: [
    { freq: 523, at: 0, dur: 0.15 },
    { freq: 659, at: 0.15, dur: 0.15 },
    { freq: 784, at: 0.3, dur: 0.15 },
    { freq: 1047, at: 0.45, dur: 0.45 },
  ],
  news: [
    { freq: 880, at: 0, dur: 0.08, vol: 0.12 },
    { freq: 1175, at: 0.08, dur: 0.12, vol: 0.12 },
  ],
  hint: [{ freq: 300, at: 0, dur: 0.12, wave: "triangle", vol: 0.12 }],
  ping: [{ freq: 1400, to: 1000, at: 0, dur: 0.25, vol: 0.12 }],
  dart: [{ freq: 1200, to: 300, at: 0, dur: 0.15, wave: "sawtooth", vol: 0.06 }],
  noise: [0, 0.12, 0.24].map((at) => ({ freq: 700 + at * 1000, at, dur: 0.1, wave: "square" as Wave, vol: 0.06 })),
  tie: [{ freq: 200, to: 120, at: 0, dur: 0.12, wave: "triangle", vol: 0.2 }],
  click: [{ freq: 900, at: 0, dur: 0.03, wave: "square", vol: 0.05 }],
};

let ctx: AudioContext | undefined;
let muted = false;
try {
  muted = localStorage.getItem("ss-muted") === "1";
} catch {}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function isMuted() {
  return muted;
}

export function setMuted(on: boolean) {
  muted = on;
  try {
    localStorage.setItem("ss-muted", on ? "1" : "0");
  } catch {}
}

export function play(name: keyof typeof SOUNDS) {
  if (muted || !ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime + 0.01;
  for (const n of SOUNDS[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.wave ?? "sine";
    osc.frequency.setValueAtTime(n.freq, t0 + n.at);
    if (n.to) osc.frequency.linearRampToValueAtTime(n.to, t0 + n.at + n.dur);
    // Quick fade in/out so notes don't click.
    const vol = n.vol ?? 0.15;
    gain.gain.setValueAtTime(0, t0 + n.at);
    gain.gain.linearRampToValueAtTime(vol, t0 + n.at + 0.01);
    gain.gain.linearRampToValueAtTime(0, t0 + n.at + n.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.02);
  }
}

// First tap anywhere unlocks audio (required on iOS / Chrome).
window.addEventListener("pointerdown", unlock, { capture: true });
