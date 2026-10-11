// Short sound effects made with the Web Audio API (no audio files).

let ac = null;
let muted = false;

// Browsers only allow sound after a key press or click, so the audio context
// is created the first time a sound is asked for.
function context() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(freq, at, dur, type = 'square', vol = 0.07) {
  const c = context();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = c.currentTime + at;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur);
}

// name -> list of [frequency, start, length, wave]
const SOUNDS = {
  pickup: [[660, 0, 0.07], [990, 0.06, 0.1]],
  deposit: [[330, 0, 0.08], [440, 0.07, 0.1]],
  full: [[440, 0, 0.08], [554, 0.08, 0.08], [659, 0.16, 0.16]],
  deny: [[160, 0, 0.16, 'sawtooth'], [120, 0.1, 0.18, 'sawtooth']],
  ask: [[520, 0, 0.06], [700, 0.07, 0.08]],
  gate: [[392, 0, 0.1], [494, 0.1, 0.1], [587, 0.2, 0.2]],
  key: [[880, 0, 0.04]],
  hint: [[784, 0, 0.1, 'triangle'], [988, 0.1, 0.2, 'triangle']],
  pickOk: [[659, 0, 0.08], [880, 0.08, 0.16]],
  trade: [[523, 0, 0.09], [659, 0.09, 0.09], [784, 0.18, 0.09], [1047, 0.27, 0.25]],
  tick: [[440, 0, 0.08, 'triangle']],
  door: [[196, 0, 0.15, 'triangle'], [262, 0.12, 0.15, 'triangle'], [392, 0.24, 0.3, 'triangle']],
  bonus: [[988, 0, 0.08], [1319, 0.08, 0.08], [1568, 0.16, 0.2]],
  join: [[440, 0, 0.08], [660, 0.08, 0.12]],
  win: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.12], [784, 0.48, 0.12], [1047, 0.6, 0.4]],
};

export function play(name) {
  if (muted || !SOUNDS[name]) return;
  for (const [freq, at, dur, type] of SOUNDS[name]) tone(freq, at, dur, type);
}

export function setMuted(value) { muted = !!value; }
