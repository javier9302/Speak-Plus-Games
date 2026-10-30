// Speak Plus City server: needed only to play with phones. Run with: npm start
//
// It serves the game's pages and passes messages between the teacher window
// and the students' phones. It knows nothing about the game: the teacher
// window keeps the game state and decides everything, as without phones.
//
// Messages (JSON over WebSocket at /ws):
//   teacher → server  host {code?, key?}      open a room, or take back the one this window had
//                     send {to, msg}          a message for one phone (its private view, an error…)
//                     kick {to}               disconnect a phone and forget it
//   server → teacher  hosted {code, key, joinUrl, qr, phones}
//                     phone {token, name, on} a phone joined, came back or left
//                     act {token, action}     a phone pressed a button
//   phone → server    join {room, name, token?}
//                     act {action}
//   server → phone    joined {token, room, name} · host {on} · kicked · error {code, text}
//                     and whatever the teacher sends it
//
// Settings (environment): PORT (default 8080), PUBLIC_URL (the address phones
// use when the server is on the internet; on Render, RENDER_EXTERNAL_URL is used).

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PHONES = 12;
const ROOM_TTL_MS = 12 * 3600 * 1000;      // an empty room is forgotten after 12 hours
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';  // no I or O: they look like 1 and 0
const TOKEN = /^[a-z0-9]{16,40}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};
// Only the game's pages are served: never the server code, the tests or node_modules.
const PUBLIC = /^\/(?:[a-z-]+\.html|(?:css|js|data)\/[a-z0-9._-]+)$/;

// IPv4 addresses of this computer on the local network, Wi-Fi first.
function lanAddresses() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) found.push(a.address);
  }
  const rank = ip => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  return found.sort((a, b) => rank(a) - rank(b));
}

export async function createServer({ port = Number(process.env.PORT || 8080), publicUrl = process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? '', quiet = false } = {}) {
  publicUrl = String(publicUrl || '').replace(/\/+$/, '');
  const rooms = new Map();   // code → { code, key, host: ws|null, phones: Map(token → {name, ws}), seen }

  const joinBase = () => publicUrl || (lanAddresses()[0] ? `http://${lanAddresses()[0]}:${server.address().port}` : `http://localhost:${server.address().port}`);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/info') {
      res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ phones: true, hosted: !!publicUrl, joinBase: joinBase() }));
    }
    let rel = url.pathname;
    if (rel === '/') rel = '/index.html';
    if (rel === '/phone' || rel === '/join') { res.writeHead(302, { location: '/phone.html' + url.search }); return res.end(); }
    if (!PUBLIC.test(rel)) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    try {
      const body = await fs.readFile(path.join(ROOT, rel));
      res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://x').pathname !== '/ws') return socket.destroy();
    wss.handleUpgrade(req, socket, head, ws => connection(ws));
  });

  const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const toHost = (room, msg) => send(room.host, msg);
  const phoneList = room => [...room.phones].map(([token, p]) => ({ token, name: p.name, on: !!p.ws }));

  function newCode() {
    for (let i = 0; i < 1000; i++) {
      const code = Array.from({ length: 4 }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join('');
      if (!rooms.has(code)) return code;
    }
    throw new Error('No free room code.');
  }

  async function hosted(ws, room) {
    const joinUrl = `${joinBase()}/phone.html?room=${room.code}`;
    const qr = await QRCode.toDataURL(joinUrl, { margin: 1, scale: 8, color: { dark: '#1F2F5C', light: '#FFFFFF' } });
    send(ws, { t: 'hosted', code: room.code, key: room.key, joinUrl, qr, phones: phoneList(room) });
    for (const p of room.phones.values()) send(p.ws, { t: 'host', on: true });
  }

  function connection(ws) {
    let role = null;       // 'host' or 'phone'
    let room = null;
    let token = null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', raw => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m.t !== 'string') return;

      if (m.t === 'host' && !role) {
        // Take back the room this teacher window had (also after a server restart), or open a new one.
        const code = String(m.code || '').toUpperCase();
        const key = String(m.key || '');
        let r = rooms.get(code);
        if (r && r.key !== key) r = null;
        if (!r && /^[A-Z]{4}$/.test(code) && TOKEN.test(key) && !rooms.has(code)) {
          r = { code, key, host: null, phones: new Map(), seen: Date.now() };
          rooms.set(code, r);
        }
        if (!r) {
          r = { code: newCode(), key: crypto.randomBytes(16).toString('hex'), host: null, phones: new Map(), seen: Date.now() };
          rooms.set(r.code, r);
        }
        if (r.host && r.host !== ws) { send(r.host, { t: 'replaced' }); r.host.close(); }
        r.host = ws;
        role = 'host';
        room = r;
        hosted(ws, r).catch(() => {});
        return;
      }

      if (m.t === 'join' && !role) {
        const r = rooms.get(String(m.room || '').trim().toUpperCase());
        if (!r) return send(ws, { t: 'error', code: 'room', text: 'No game with that code. Check the code on the big screen.' });
        const name = String(m.name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
        if (!name) return send(ws, { t: 'error', code: 'name', text: 'Type your name.' });
        let tk = TOKEN.test(String(m.token || '')) ? String(m.token) : null;
        if (!tk || (!r.phones.has(tk) && r.phones.size >= MAX_PHONES)) {
          if (r.phones.size >= MAX_PHONES) return send(ws, { t: 'error', code: 'full', text: 'This game is full.' });
          tk = crypto.randomBytes(12).toString('hex');
        }
        const old = r.phones.get(tk);
        if (old && old.ws && old.ws !== ws) old.ws.close();       // the same phone opened the page again
        r.phones.set(tk, { name, ws });
        role = 'phone'; room = r; token = tk;
        r.seen = Date.now();
        send(ws, { t: 'joined', token: tk, room: r.code, name });
        send(ws, { t: 'host', on: !!(r.host && r.host.readyState === 1) });
        toHost(r, { t: 'phone', token: tk, name, on: true });
        return;
      }

      if (role === 'phone' && m.t === 'act' && m.action && typeof m.action === 'object') {
        room.seen = Date.now();
        toHost(room, { t: 'act', token, action: m.action });
        return;
      }

      if (role === 'host') {
        room.seen = Date.now();
        if (m.t === 'send') {
          const p = room.phones.get(String(m.to));
          if (p) send(p.ws, m.msg);
        } else if (m.t === 'kick') {
          const p = room.phones.get(String(m.to));
          if (p) { send(p.ws, { t: 'kicked' }); p.ws?.close(); room.phones.delete(String(m.to)); }
        }
      }
    });

    ws.on('close', () => {
      if (!room) return;
      room.seen = Date.now();
      if (role === 'host' && room.host === ws) {
        room.host = null;
        for (const p of room.phones.values()) send(p.ws, { t: 'host', on: false });
      } else if (role === 'phone') {
        const p = room.phones.get(token);
        if (p && p.ws === ws) { p.ws = null; toHost(room, { t: 'phone', token, name: p.name, on: false }); }
      }
    });
  }

  // Keep connections alive through proxies, and forget rooms nobody has used for a long time.
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
    const now = Date.now();
    for (const [code, r] of rooms) {
      const busy = r.host || [...r.phones.values()].some(p => p.ws);
      if (!busy && now - r.seen > ROOM_TTL_MS) rooms.delete(code);
    }
  }, 25000);

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, resolve); });

  if (!quiet) {
    const p = server.address().port;
    console.log('\n  SPEAK PLUS CITY\n');
    if (publicUrl) console.log(`  Online at:  ${publicUrl}/`);
    else {
      console.log(`  Teacher window (open this on the laptop):  http://localhost:${p}/teacher.html`);
      const ips = lanAddresses();
      if (ips.length) console.log(`  Phones join at:                            http://${ips[0]}:${p}/phone.html  (same Wi-Fi or hotspot)`);
      else console.log('  No network found: phones can\'t join. Connect this computer to Wi-Fi or a hotspot.');
    }
    console.log('\n  Press Ctrl+C to stop.\n');
  }

  return {
    port: server.address().port,
    rooms,
    close: () => new Promise(r => { clearInterval(timer); for (const ws of wss.clients) ws.terminate(); server.close(() => r()); })
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  createServer().catch(e => {
    if (e.code === 'EADDRINUSE') console.error(`\nPort ${process.env.PORT || 8080} is already in use. Close the other copy, or run:  PORT=8081 npm start\n`);
    else console.error(e);
    process.exit(1);
  });
}
