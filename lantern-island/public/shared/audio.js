// Sound effects, made with Web Audio (no sound files). One mute switch per device, remembered.
// Browsers only allow sound after the first tap or click on the page.
const KEY = 'li-mute';
let ctx = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }

export const isMuted = () => muted;
export function setMuted(on) {
  muted = !!on;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* private mode */ }
}

// Each sound is a few notes: [frequency in Hz, start in seconds, length in seconds].
const SOUNDS = {
  tap:  { wave: 'triangle', notes: [[660, 0, 0.07]] },
  item: { wave: 'triangle', notes: [[523, 0, 0.08], [784, 0.08, 0.12]] },
  good: { wave: 'triangle', notes: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.2]] },
  bad:  { wave: 'sawtooth', notes: [[220, 0, 0.12], [175, 0.12, 0.2]], gain: 0.5 },
  mail: { wave: 'sine', notes: [[880, 0, 0.09], [1175, 0.1, 0.16]] },
  join: { wave: 'sine', notes: [[440, 0, 0.08], [660, 0.09, 0.14]] },
  stun: { wave: 'square', notes: [[330, 0, 0.08], [247, 0.08, 0.08], [196, 0.16, 0.22]], gain: 0.4 },
  heal: { wave: 'sine', notes: [[392, 0, 0.1], [523, 0.1, 0.1], [659, 0.2, 0.25]] },
  beam: { wave: 'sawtooth', notes: [[900, 0, 0.05], [600, 0.05, 0.05], [300, 0.1, 0.25]], gain: 0.45 },
  warn: { wave: 'square', notes: [[740, 0, 0.1], [740, 0.18, 0.1]], gain: 0.35 },
  win:  { wave: 'triangle', notes: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.4]] },
};

export function play(name) {
  const s = SOUNDS[name];
  if (muted || !s) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    for (const [freq, at, len] of s.notes) {
      const osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime + at, vol = 0.16 * (s.gain || 1);
      osc.type = s.wave; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t); osc.stop(t + len + 0.02);
    }
  } catch { /* no sound on this device: the game works without it */ }
}
