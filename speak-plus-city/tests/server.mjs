// Tests for the game server (server/index.js): pages, rooms, phones joining,
// messages passed both ways, rejoining, and what it must never serve.
// Run: node tests/server.mjs
import { WebSocket } from 'ws';
import { createServer } from '../server/index.js';

let passed = 0, failed = 0;
const check = (name, ok) => { if (ok) { passed++; console.log('  ✔', name); } else { failed++; console.log('  ✘', name); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A WebSocket client that can wait for the next message of a given type.
function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const got = [];
  const waiters = [];
  ws.on('message', d => {
    const m = JSON.parse(d);
    const i = waiters.findIndex(w => w.t === m.t);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else got.push(m);
  });
  return {
    ws,
    opened: new Promise(r => ws.once('open', r)),
    send: m => ws.send(JSON.stringify(m)),
    next(t, ms = 2000) {
      const i = got.findIndex(m => m.t === t);
      if (i >= 0) return Promise.resolve(got.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        waiters.push({ t, resolve });
        setTimeout(() => reject(new Error(`no "${t}" message`)), ms);
      });
    },
    close: () => ws.close()
  };
}

const app = await createServer({ port: 0, publicUrl: '', quiet: true });
const base = `http://127.0.0.1:${app.port}`;

console.log('Pages');
check('the start page and the game pages are served', (await fetch(base + '/')).status === 200 && (await fetch(base + '/teacher.html')).status === 200 && (await fetch(base + '/phone.html')).status === 200);
check('scripts and content are served', (await fetch(base + '/js/state.js')).status === 200 && (await fetch(base + '/data/content.json')).status === 200);
const hidden = ['/server/index.js', '/package.json', '/tests/run.mjs', '/node_modules/ws/package.json', '/js/../server/index.js', '/%2e%2e/README.md'];
let none = true;
for (const p of hidden) if ((await fetch(base + p)).status !== 404) { none = false; console.log('     served:', p); }
check('never the server code, tests, package files or node_modules', none);
const info = await (await fetch(base + '/api/info')).json();
check('/api/info says phones work', info.phones === true && info.hosted === false);

console.log('Rooms and phones');
const host = client(app.port); await host.opened;
host.send({ t: 'host' });
const room = await host.next('hosted');
check('the teacher gets a room code, a join link and a QR code', /^[A-Z]{4}$/.test(room.code) && room.joinUrl.endsWith(`/phone.html?room=${room.code}`) && room.qr.startsWith('data:image/png'));

const bad = client(app.port); await bad.opened;
bad.send({ t: 'join', room: 'ZZZZ', name: 'Ken' });
check('a wrong room code gets a clear error', (await bad.next('error')).code === 'room');
bad.close();

const a = client(app.port); await a.opened;
a.send({ t: 'join', room: room.code.toLowerCase(), name: '  Aiko  ' });
const ja = await a.next('joined');
check('a phone joins with a lower-case code; the name is tidied', ja.room === room.code && ja.name === 'Aiko' && /^[a-z0-9]{16,40}$/.test(ja.token));
const seen = await host.next('phone');
check('the teacher hears about it', seen.token === ja.token && seen.name === 'Aiko' && seen.on === true);
check('the phone knows the teacher is there', (await a.next('host')).on === true);

a.send({ t: 'act', action: { type: 'roll' } });
const act = await host.next('act');
check('a button press reaches the teacher, with the phone\'s token', act.token === ja.token && act.action.type === 'roll');

host.send({ t: 'send', to: ja.token, msg: { t: 'view', view: { kind: 'game', secret: 1 } } });
check('the teacher\'s message reaches that phone', (await a.next('view')).view.secret === 1);

const b = client(app.port); await b.opened;
b.send({ t: 'join', room: room.code, name: 'Ken' });
const jb = await b.next('joined');
await host.next('phone');
host.send({ t: 'send', to: ja.token, msg: { t: 'view', view: { only: 'aiko' } } });
await a.next('view');
let leaked = false;
try { await b.next('view', 300); leaked = true; } catch { /* expected: nothing */ }
check('…and no other phone', !leaked && jb.token !== ja.token);

a.close();
const off = await host.next('phone');
check('a phone that closes shows as offline', off.token === ja.token && off.on === false);
const a2 = client(app.port); await a2.opened;
a2.send({ t: 'join', room: room.code, name: 'Aiko', token: ja.token });
check('it comes back with the same token', (await a2.next('joined')).token === ja.token && (await host.next('phone')).on === true);
await a2.next('host');     // "the teacher is here", sent on joining

console.log('Teacher window');
host.close();
check('phones are told when the teacher window closes', (await a2.next('host')).on === false);
const host2 = client(app.port); await host2.opened;
host2.send({ t: 'host', code: room.code, key: room.key });
const back = await host2.next('hosted');
check('a refreshed teacher window gets the same room and its phones', back.code === room.code && back.phones.length === 2);
check('…and the phones hear the teacher is back', (await a2.next('host')).on === true);
const thief = client(app.port); await thief.opened;
thief.send({ t: 'host', code: room.code, key: 'f'.repeat(32) });
check('a wrong key can\'t take the room', (await thief.next('hosted')).code !== room.code);

host2.send({ t: 'kick', to: jb.token });
check('the teacher can remove a phone', (await b.next('kicked')).t === 'kicked');

console.log('After a server restart');
await app.close();
const app2 = await createServer({ port: 0, publicUrl: 'https://city.example.com/', quiet: true });
const h3 = client(app2.port); await h3.opened;
h3.send({ t: 'host', code: room.code, key: room.key });
const again = await h3.next('hosted');
check('the teacher window opens its old room code again', again.code === room.code);
check('online, the QR code points to the public address', again.joinUrl === `https://city.example.com/phone.html?room=${room.code}`);
const p3 = client(app2.port); await p3.opened;
p3.send({ t: 'join', room: room.code, name: 'Aiko', token: ja.token });
check('a phone keeps its token, so it is still the same player', (await p3.next('joined')).token === ja.token);
for (const c of [h3, p3, a2, thief, host2]) c.close();
await app2.close();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
