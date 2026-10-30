// Teacher window ↔ game server, for phone mode. Opens a room, keeps it after a
// refresh (the room code and key are kept in localStorage), reconnects by
// itself, and passes phone messages to the teacher page. See server/index.js.

const ROOM_KEY = 'sp-city-room-v1';

// Is this page served by the game server (npm start, or online)?
export async function serverInfo() {
  try {
    const res = await fetch('api/info', { cache: 'no-store' });
    if (!res.ok) return null;
    const info = await res.json();
    return info && info.phones ? info : null;
  } catch { return null; }
}

// handlers: { onHosted(info), onPhone({token, name, on}), onAct(token, action), onStatus(connected) }
export function createPhones(handlers) {
  let ws = null;
  let wanted = false;
  let retry = 0;
  let timer = null;
  const phones = new Map();          // token → { name, on }
  const api = { phones, info: null, connected: false };

  const saved = () => { try { return JSON.parse(localStorage.getItem(ROOM_KEY) || 'null') || {}; } catch { return {}; } };

  function connect() {
    if (!wanted || ws) return;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    ws = new WebSocket(url);
    ws.onopen = () => {
      retry = 0;
      const { code, key } = saved();
      ws.send(JSON.stringify({ t: 'host', code, key }));
    };
    ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'hosted') {
        try { localStorage.setItem(ROOM_KEY, JSON.stringify({ code: m.code, key: m.key })); } catch { /* ignore */ }
        api.info = { code: m.code, joinUrl: m.joinUrl, qr: m.qr };
        api.connected = true;
        phones.clear();
        for (const p of m.phones) phones.set(p.token, { name: p.name, on: p.on });
        handlers.onStatus?.(true);
        handlers.onHosted?.(api.info);
      } else if (m.t === 'phone') {
        phones.set(m.token, { name: m.name, on: m.on });
        handlers.onPhone?.(m);
      } else if (m.t === 'act') {
        handlers.onAct?.(m.token, m.action);
      } else if (m.t === 'replaced') {
        wanted = false;      // the room was opened in another teacher window
        handlers.onReplaced?.();
      }
    };
    ws.onclose = () => {
      ws = null;
      api.connected = false;
      handlers.onStatus?.(false);
      if (wanted) {
        clearTimeout(timer);
        timer = setTimeout(connect, Math.min(10000, 1000 * 2 ** retry++));
      }
    };
  }

  api.start = () => { wanted = true; connect(); };
  api.stop = () => { wanted = false; clearTimeout(timer); if (ws) ws.close(); };
  api.send = (token, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'send', to: token, msg })); };
  api.kick = token => { phones.delete(token); if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'kick', to: token })); };
  return api;
}
