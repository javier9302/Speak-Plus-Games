// WebSocket that reconnects by itself, and the teacher's API helper.

// onOpen runs on every (re)connection: send your hello / join there.
export function connect({ onOpen, onMessage, onStatus }) {
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  let ws, delay = 400, stopped = false;
  const api = {
    send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    close() { stopped = true; if (ws) ws.close(); },
  };
  function open() {
    ws = new WebSocket(url);
    ws.onopen = () => { delay = 400; onStatus?.(true); onOpen?.(api); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMessage(m); };
    ws.onclose = () => {
      onStatus?.(false);
      if (!stopped) setTimeout(open, delay);
      delay = Math.min(delay * 1.6, 4000);
    };
    ws.onerror = () => ws.close();
  }
  open();
  return api;
}

// ---------- teacher PIN ----------
// Not needed on the computer that runs the server. Other devices are asked once per tab.
const PIN_KEY = 'li-pin';
export const getPin = () => { try { return sessionStorage.getItem(PIN_KEY) || ''; } catch { return ''; } };
export function askPin(message = 'Teacher PIN (shown in the window where the game server runs):') {
  const pin = (window.prompt(message) || '').trim();
  try { sessionStorage.setItem(PIN_KEY, pin); } catch { /* private mode */ }
  return pin;
}

// fetch for /api/...: sends the PIN, asks for it on 401, throws an Error with the server's message.
export async function api(path, { method = 'GET', body } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('/api' + path, {
      method,
      headers: { 'x-pin': getPin(), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && attempt < 2 && askPin()) continue;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
    return data;
  }
}

// Sends a sound or picture file for a card. Returns its address, like "/media/abc123.webm".
export async function upload(blob) {
  const res = await fetch('/api/media', { method: 'POST', headers: { 'x-pin': getPin(), 'content-type': blob.type || 'application/octet-stream' }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data.url;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
