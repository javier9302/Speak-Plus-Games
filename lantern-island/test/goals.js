// Goal types and the kinds they use (machine, pad, candidate, characters that follow), on a small test map:
// the solver can finish every mission with 2 to 6 players, and each one plays out in a real room, wrong moves
// included. Run with: npm test, or node test/goals.js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.js';
import { loadContent } from '../server/content.js';
import { loadAbilities, dealPreset } from '../server/abilities.js';
import { normalizeMission } from '../server/missions.js';
import { inspect, solve } from '../server/solver.js';
import { client } from './client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The test map: grass with water around it, 24 x 14.
const rows = Array.from({ length: 14 }, (_, y) => (y === 0 || y === 13 ? '~'.repeat(24) : `~${','.repeat(22)}~`));
rows[6] = `~,,pppppp${','.repeat(14)}~`;
const testbed = {
  id: 'testbed', name: 'Test field', rows,
  goal: { type: 'restore', story: 'Make the machines work.' },
  places: [{ id: 'harbor', name: 'the harbor', x: 14.5, y: 4.5 }, { id: 'field', name: 'the field', x: 5, y: 8 }],
  landmarks: [],
  objects: [
    { id: 'board', kind: 'sign', name: 'Board', x: 2, y: 2, clues: { read: 'Press the moon, then the sun, then the star. The right pot has a red mark.' } },
    { id: 'm1', kind: 'machine', name: 'Water pump', x: 12, y: 2, needs: 'plank' },
    { id: 'm2', kind: 'machine', name: 'Old clock', x: 16, y: 2 },
    { id: 't1', kind: 'station', name: 'Tablet', x: 10, y: 10, reward: { item: 'plank' } },
    { id: 'sun', kind: 'pad', name: 'Sun stone', x: 12, y: 8 },
    { id: 'moon', kind: 'pad', name: 'Moon stone', x: 15, y: 8 },
    { id: 'star', kind: 'pad', name: 'Star stone', x: 18, y: 8 },
    { id: 'c1', kind: 'candidate', name: 'Blue pot', x: 5, y: 11, clues: { look: 'A plain pot.' } },
    { id: 'c2', kind: 'candidate', name: 'Brown pot', x: 8, y: 11, clues: { look: 'This pot has a red mark.' } },
    { id: 'c3', kind: 'candidate', name: 'Grey pot', x: 11, y: 11, clues: { look: 'A plain pot.' } },
    { id: 'cook', kind: 'npc', name: 'Cook', x: 20, y: 4, clues: { talk: '"Please take me to the harbor!"' } },
    { id: 'farmer', kind: 'npc', name: 'Farmer', x: 20, y: 10 },
    { id: 'key', kind: 'item', name: 'Key', x: 2, y: 9, item: 'key' },
    { id: 'letter', kind: 'item', name: 'Letter', x: 3, y: 11, item: 'letter' },
  ],
};
const missions = {
  'tb-restore': { goal: { type: 'restore' } },
  'tb-sequence': { goal: { type: 'sequence', order: ['moon', 'sun', 'star'] } },
  'tb-odd': { goal: { type: 'odd-one-out', answer: 'c2' } },
  'tb-order': { goal: { type: 'deliver-order', order: [{ to: 'farmer', item: 'key' }, { to: 'cook', item: 'letter' }] } },
  'tb-escort': { goal: { type: 'escort', npc: 'cook', to: 'harbor' } },
};

async function main() {
  // A content folder with the real packs and the test pack.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-goals-'));
  for (const f of ['items.json', 'abilities.json', 'monster.json', 'seed-cards.json']) await fs.copyFile(path.join(root, 'data', f), path.join(dir, f));
  await fs.cp(path.join(root, 'data', 'scenarios'), path.join(dir, 'scenarios'), { recursive: true });
  const pack = path.join(dir, 'scenarios', 'testbed');
  await fs.mkdir(path.join(pack, 'zones'), { recursive: true });
  await fs.mkdir(path.join(pack, 'missions'), { recursive: true });
  await fs.writeFile(path.join(pack, 'pack.json'), JSON.stringify({ id: 'testbed', name: 'Test pack', order: 9 }));
  await fs.writeFile(path.join(pack, 'zones', 'testbed.json'), JSON.stringify(testbed));
  for (const [id, m] of Object.entries(missions)) await fs.writeFile(path.join(pack, 'missions', `${id}.json`), JSON.stringify({ id, title: id, zone: 'testbed', stations: [{ at: 't1' }], ...m }));

  console.log('\nThe solver');
  const abilities = await loadAbilities(dir);
  const it = JSON.parse(await fs.readFile(path.join(dir, 'items.json'), 'utf8'));
  const items = { list: it.items, byId: Object.fromEntries(it.items.map((i) => [i.id, i])) };
  const content = await loadContent(dir, { abilities, items });
  check('the test pack loads, with every goal type', !content.errors.length && content.missions.filter((m) => m.pack === 'testbed').length === 5, content.errors.join(' | '));
  const zone = content.zones.testbed;
  for (const id of Object.keys(missions)) {
    const m = normalizeMission(content.missions.find((x) => x.id === id), content.zones, items);
    const results = [2, 3, 4, 5, 6].map((n) => inspect(zone, m, dealPreset(abilities, n), abilities.ids));
    check(`${m.goal.type}: can be finished with 2 to 6 players`, results.every((r) => r.ok), results.map((r) => r.problems.join(';')).join(' | '));
  }
  // Dead ends the solver must see.
  const norm = (goal) => normalizeMission({ id: 'x', zone: 'testbed', stations: [{ at: 't1' }], goal }, content.zones, items);
  const two = dealPreset(abilities, 2);
  check('restore: without Fix, a machine never works', !solve(zone, norm({ type: 'restore' }), two, { without: ['fix'] }).ok);
  const walled = { ...zone, rows: zone.rows.map((r, y) => (y >= 1 && y <= 12 ? `${r.slice(0, 17)}~${r.slice(18)}` : r)), fixed: zone.fixed };
  const esc = solve(walled, norm({ type: 'escort', npc: 'cook', to: 'harbor' }), two);
  check('escort: a character behind water cannot be brought, and the report says why', !esc.ok && esc.problems.some((p) => p.includes('nobody with Talk can get to the cook') || p.includes('cannot walk')), esc.problems.join(' | '));
  const order = solve(zone, norm({ type: 'deliver-order', order: [{ to: 'farmer', item: 'crystal' }] }), two);
  check('deliver-order: an item the map never gives is a dead end', !order.ok && order.problems.some((p) => p.includes('never gets the crystal')));

  console.log('\nPlaying each goal');
  const app = await createApp({ port: 0, contentDir: dir, dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-goal-saves-')), publicUrl: '', pin: '2468', quiet: true, watch: false });
  const api = async (p, method = 'GET', body) => (await fetch(`http://127.0.0.1:${app.port}/api${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).json();
  const group = await api('/groups', 'POST', { name: 'Goal testers' });
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
  const cmd = (c, extra = {}) => teacher.send({ t: 'cmd', c, ...extra });
  const lib = (await api('/missions')).missions;
  async function start(id) {
    cmd('mission', { mission: lib.find((m) => m.id === id) });
    await host.next('roster', (m) => m.phase === 'play' && m.mission.id === id);
    await sleep(100);
  }
  const player = (c) => r.players.find((p) => p.id === c.me.id);
  // The player with this ability (2 players: Aki has look/read/talk/listen/pickup/give, Ben the rest).
  const who = (a) => [A, B].find((c) => player(c).abilities.includes(a));
  const tp = async (c, x, y) => { cmd('tp', { p: c.me.id, x, y }); await sleep(80); };
  const act = async (c, a) => { await sleep(260); c.send({ t: 'act', a }); await sleep(120); };
  const thing = (id) => r.things.find((t) => t.id === id);
  const lastSay = (c) => c.all.filter((m) => m.t === 'say').at(-1)?.msg || '';
  const lastNpc = (c) => c.all.filter((m) => m.t === 'npc').at(-1)?.text || '';
  // The roster that ended the mission (it may already have arrived).
  const ended = async (ms = 2000) => (host.last.roster.phase === 'done' ? host.last.roster : host.next('roster', (m) => m.phase === 'done', ms).catch(() => null));

  // restore
  await start('tb-restore');
  const fixer = who('fix');
  cmd('give', { p: fixer.me.id, item: 'plank' });
  await tp(fixer, 12, 3); await act(fixer, 'fix');
  check('restore: Fix with the part makes a machine work, and the goal counts it', thing('m1').st === 'running' && host.last.roster.progress.have === 1 && host.last.roster.progress.need === 2);
  await tp(fixer, 16, 3); await act(fixer, 'fix');
  check('restore: when every machine works, the mission is complete', (await ended())?.result.completed === true);

  // sequence
  await start('tb-sequence');
  const pusher = who('push');
  await tp(pusher, 15, 8); await act(pusher, 'push');
  check('sequence: the right first stone lights up', thing('moon').st === 'on' && host.last.roster.progress.have === 1);
  await tp(pusher, 18, 8); await act(pusher, 'push');
  check('sequence: a wrong stone makes them all go dark, nothing else', thing('moon').st === 'off' && thing('star').st === 'off' && host.last.roster.progress.have === 0 && lastSay(pusher).includes('Wrong order'));
  for (const [x, y] of [[15, 8], [12, 8], [18, 8]]) { await tp(pusher, x, y); await act(pusher, 'push'); }
  check('sequence: the right order completes the mission', (await ended())?.result.completed === true);

  // odd one out
  await start('tb-odd');
  const chooser = who('use');
  await tp(chooser, 5, 10); await act(chooser, 'use');
  check('odd-one-out: a wrong pot says so, costs nothing and can be chosen again', lastSay(chooser).includes('Not this one') && thing('c1').st === 'x' && r.phase === 'play');
  await tp(chooser, 8, 10); await act(chooser, 'use');
  check('odd-one-out: the right pot completes the mission', (await ended())?.result.completed === true);

  // deliveries in order
  await start('tb-order');
  const talker = who('talk');
  cmd('give', { p: talker.me.id, item: 'key' }); cmd('give', { p: talker.me.id, item: 'letter' });
  await tp(talker, 20, 5); await act(talker, 'talk');
  check('deliver-order: a character whose turn has not come says so', lastNpc(talker).includes('Not yet') && player(talker).items.length === 2);
  await tp(talker, 20, 9); await act(talker, 'talk');
  check('deliver-order: the first delivery is taken', lastNpc(talker).includes('Thank you') && host.last.roster.progress.have === 1 && !player(talker).items.some((x) => x.item === 'key'));
  await tp(talker, 20, 5); await act(talker, 'talk');
  check('deliver-order: the last delivery completes the mission', (await ended())?.result.completed === true);

  // escort
  await start('tb-escort');
  const guide = who('talk');
  await tp(guide, 19, 4); await act(guide, 'talk');
  check('escort: after Talk, the character follows', lastNpc(guide).includes('follow') && thing('cook').following === true);
  guide.send({ t: 'input', x: -1, y: 0 });
  const done = await ended(9000);
  guide.send({ t: 'input', x: 0, y: 0 });
  check('escort: walking to the place with it completes the mission', done?.result.completed === true, `cook at ${thing('cook').x},${thing('cook').y}`);

  await app.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
