// Keeps the game window and the teacher window (?teacher=1) in step.
// No server: BroadcastChannel talks between tabs of the same site, with
// localStorage "storage" events as a fallback for older browsers.

const NAME = 'trade-gate-sync';

export function createSync() {
  const listeners = [];
  const emit = (msg) => listeners.forEach((fn) => fn(msg));
  let channel = null;

  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(NAME);
    channel.onmessage = (e) => emit(e.data);
  } else {
    window.addEventListener('storage', (e) => {
      if (e.key !== NAME || !e.newValue) return;
      try { emit(JSON.parse(e.newValue).msg); } catch { /* ignore bad data */ }
    });
  }

  return {
    send(msg) {
      if (channel) channel.postMessage(msg);
      else {
        try { localStorage.setItem(NAME, JSON.stringify({ msg, t: Date.now() + Math.random() })); } catch { /* storage off */ }
      }
    },
    on(fn) { listeners.push(fn); },
  };
}
