// Fog of war and the Navigator. Run with: npm test, or node test/fog.js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.js';
import { loadContent } from '../server/content.js';
import { loadAbilities } from '../server/abilities.js';
import { normalizeMission } from '../server/missions.js';
import { client } from './client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = Array.from({ length: 13 }, (_, y) => (y === 0 || y === 12 ? '~'.repeat(24) : `~${','.repeat(22)}~`)).map((r, y) => (y === 6 ? r.slice(0, 3) + 'pppppp' + r.slice(9) : r));
const zone = {
  id: 'fog-field', name: 'Fog field', theme: 'day', rows,
  goal: { type: 'collect', items: { lantern: 1 }, story: 'Find the lantern.' },
  places: [], landmarks: [],
  objects: [{ id: 'sign', kind: 'sign', name: 'Sign', x: 5, y: 3, clues: { read: 'Hello.' } }, { id: 't1', kind: 'station', name: 'Tablet', x: 18, y: 9, reward: { item: 'lantern' } }],
};

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-fog-'));
  for (const f of ['items.json', 'abilities.json', 'monster.json', 'seed-cards.json', 'themes.json']) await fs.copyFile(path.join(root, 'data', f), path.join(dir, f));
  await fs.cp(path.join(root, 'data', 'scenarios'), path.join(dir, 'scenarios'), { recursive: true });
  const pack = path.join(dir, 'scenarios', 'fogtest');
  await fs.mkdir(path.join(pack, 'zones'), { recursive: true });
  await fs.mkdir(path.join(pack, 'missions'), { recursive: true });
  await fs.writeFile(path.join(pack, 'pack.json'), JSON.stringify({ id: 'fogtest', name: 'Fog test', order: 9 }));
  await fs.writeFile(path.join(pack, 'zones', 'fog-field.json'), JSON.stringify(zone));
  await fs.writeFile(path.join(pack, 'missions', 'fg-clear.json'), JSON.stringify({ id: 'fg-clear', title: 'Clear', zone: 'fog-field', stations: [{ at: 't1' }] }));
  await fs.writeFile(path.join(pack, 'missions', 'fg-dark.json'), JSON.stringify({ id: 'fg-dark', title: 'Dark', zone: 'fog-field', fog: 4, stations: [{ at: 't1' }] }));

  console.log('\nThe mission field');
  const abilities = await loadAbilities(dir);
  const it = JSON.parse(await fs.readFile(path.join(dir, 'items.json'), 'utf8'));
  const items = { list: it.items, byId: Object.fromEntries(it.items.map((i) => [i.id, i])) };
  const content = await loadContent(dir, { abilities, items });
  check('the pack with a foggy mission loads', !content.errors.length && content.missions.find((m) => m.id === 'fg-dark').fog === 4, content.errors.join(' | '));
  const norm = (patch) => { try { return normalizeMission({ ...content.missions.find((m) => m.id === 'fg-clear'), ...patch }, content.zones, items); } catch (e) { return e; } };
  check('fog is 3 to 9 tiles, or 0', norm({ fog: 4 }).fog === 4 && norm({ fog: 0 }).fog === 0 && norm({ fog: 2 }).message?.includes('3 to 9') && norm({ fog: 12 }).message?.includes('3 to 9'));

  console.log('\nPlaying it');
  const app = await createApp({ port: 0, contentDir: dir, dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-fog-saves-')), publicUrl: '', pin: '2468', quiet: true, watch: false });
  const api = async (p, method = 'GET', body) => (await fetch(`http://127.0.0.1:${app.port}/api${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).json();
  const group = await api('/groups', 'POST', { name: 'Fog testers' });
  await api(`/groups/${group.id}`, 'PATCH', { settings: { monster: 'off' } });
  const host = client(app.port); await host.opened;
  host.send({ t: 'host' });
  const room = await host.next('room');
  host.send({ t: 'group', id: group.id });
  const [A, B] = [client(app.port), client(app.port)];
  for (const [c, name] of [[A, 'Aki'], [B, 'Ben']]) { await c.opened; c.send({ t: 'join', room: room.code, name }); c.me = await c.next('joined'); }
  const teacher = client(app.port); await teacher.opened;
  teacher.send({ t: 'teacher', room: room.code });
  await teacher.next('watching');
  const r = app.rooms.rooms.get(room.code);
  const cmd = (extra) => teacher.send({ t: 'cmd', ...extra });
  const lib = (await api('/missions')).missions;
  const start = async (id) => { cmd({ c: 'mission', mission: lib.find((m) => m.id === id) }); await host.next('roster', (x) => x.phase === 'play' && x.mission.id === id); await sleep(100); };
  const act = async (c, a) => { await sleep(260); c.send({ t: 'act', a }); await sleep(120); };

  await start('fg-clear');
  check('no fog unless the teacher turns it on', host.last.roster.fog === 0);
  cmd({ c: 'set', key: 'fog', value: 1 }); await sleep(150);
  check('the teacher\'s fog is at least 3 tiles', host.last.roster.fog === 3 && A.last.roster.fog === 3);
  cmd({ c: 'set', key: 'fog', value: 6 }); await sleep(150);
  check('and every screen gets the radius', host.last.roster.fog === 6 && B.last.roster.fog === 6);
  await start('fg-dark');
  check('a foggy mission keeps its own fog, whatever the teacher chose', host.last.roster.fog === 4);
  cmd({ c: 'set', key: 'fog', value: 0 }); await sleep(150);
  await start('fg-clear');

  console.log('\nThe Navigator');
  const withTwo = () => teacher.all.filter((x) => x.t === 'error').at(-1)?.msg || '';
  cmd({ c: 'navigator', p: B.me.id }); await sleep(150);
  check('a Navigator needs a third player', host.last.roster.navigator === null && withTwo().includes('at least 3 players'), withTwo());
  const C = client(app.port); await C.opened; C.send({ t: 'join', room: room.code, name: 'Cleo' }); C.me = await C.next('joined');
  await start('fg-clear');
  const player = (c) => r.players.find((p) => p.id === c.me.id);
  cmd({ c: 'navigator', p: C.me.id }); await sleep(250);
  check('the teacher names the Navigator, and every screen knows', host.last.roster.navigator === C.me.id && A.last.roster.navigator === C.me.id);
  check('the Navigator has no ability; the other two share all twelve', player(C).abilities.length === 0 && new Set([...player(A).abilities, ...player(B).abilities]).size === 12 && player(A).abilities.length === 6);
  const before = { x: player(C).x, y: player(C).y };
  C.send({ t: 'input', x: 1, y: 0 }); await sleep(500); C.send({ t: 'input', x: 0, y: 0 }); await sleep(100);
  check('the Navigator cannot walk', player(C).x === before.x && player(C).y === before.y);
  const aStart = player(A).x;
  A.send({ t: 'input', x: 1, y: 0 }); await sleep(400); A.send({ t: 'input', x: 0, y: 0 });
  check('the others can', player(A).x > aStart + 0.5);
  await act(C, 'read');
  check('the Navigator cannot use an ability, and is told to guide', C.all.filter((x) => x.t === 'nope').at(-1)?.msg.includes('Navigator'));
  cmd({ c: 'navigator', p: null }); await sleep(250);
  check('no Navigator: three players share the abilities again', host.last.roster.navigator === null && player(C).abilities.length === 4);
  cmd({ c: 'navigator', p: C.me.id }); await sleep(200);
  cmd({ c: 'kick', p: C.me.id }); await sleep(250);
  check('if the Navigator leaves, the team is whole again', host.last.roster.navigator === null && r.players.length === 2 && new Set([...player(A).abilities, ...player(B).abilities]).size === 12, JSON.stringify(host.last.roster.navigator));

  await app.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
