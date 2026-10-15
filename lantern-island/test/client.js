// A test client for the simulated classroom tests (sim.js, compete.js).
import WebSocket from 'ws';

// A test client: remembers the last message of each type, and can wait for one.
export function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const last = {}, waiting = [], all = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    last[m.t] = m;
    all.push(m);
    for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i].test(m)) waiting.splice(i, 1)[0].resolve(m);
  });
  ws.on('error', () => {});
  return {
    ws, last, all,
    opened: new Promise((r) => ws.once('open', r)),
    send: (m) => ws.send(JSON.stringify(m)),
    next: (t, test = () => true, ms = 2000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for "${t}"`)), ms);
      waiting.push({ test: (m) => m.t === t && test(m), resolve: (m) => { clearTimeout(timer); resolve(m); } });
    }),
    close: () => new Promise((r) => { ws.once('close', r); ws.close(); }),
  };
}
