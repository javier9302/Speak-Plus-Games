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
import { makeRun } from '../server/run.js';
import { runCheck } from '../server/check.js';
import { zoneFor } from '../server/missions.js';
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
// One tile nobody can reach (21,12), water all around: a slot that includes it makes some runs impossible.
rows[11] = `${rows[11].slice(0, 20)}~~~${rows[11].slice(23)}`;
rows[12] = `${rows[12].slice(0, 20)}~,~${rows[12].slice(23)}`;
const testbed = {
  id: 'testbed', name: 'Test field', theme: 'winter', rows,
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
  'tb-random-odd': {
    goal: { type: 'odd-one-out', answer: 'random' },
    slots: { corner: [[2, 4], [3, 4], [4, 4], [2, 5]] },
    add: [{ id: 'hint', kind: 'sign', name: 'Hint', slot: 'corner', clues: { read: 'Choose the {odd}.' } }],
  },
  'tb-random-seq': { goal: { type: 'sequence', order: ['moon', 'sun', 'star'], shuffle: true }, texts: { board: { read: 'Press {order}.' } } },
  'tb-fixed': { goal: { type: 'sequence', order: ['moon', 'sun', 'star'], shuffle: true }, seed: 5 },
  'tb-reroll': {
    goal: { type: 'odd-one-out', answer: 'q2' },
    remove: ['c1', 'c2', 'c3'],
    slots: { pots: [[21, 12], [13, 11], [14, 11], [15, 11]] },
    add: [1, 2, 3].map((n) => ({ id: `q${n}`, kind: 'candidate', name: `Pot ${n}`, slot: 'pots' })),
  },
  'tb-night': { goal: { type: 'restore' }, theme: 'night' },
  'tb-override': { goal: { type: 'restore' }, rename: { board: 'Notice board' }, texts: { board: { read: 'TODAY: fix the pump first.' } }, add: [{ id: 'extra', kind: 'sign', name: 'New sign', x: 4, y: 4, clues: { read: 'Hello from the mission.' } }] },
};

async function main() {
  // A content folder with the real packs and the test pack.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-goals-'));
  for (const f of ['items.json', 'abilities.json', 'monster.json', 'seed-cards.json', 'themes.json']) await fs.copyFile(path.join(root, 'data', f), path.join(dir, f));
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
  check('the test pack loads, with every goal type', !content.errors.length && content.missions.filter((m) => m.pack === 'testbed').length === 11, content.errors.join(' | '));
  const zone = content.zones.testbed;
  for (const id of ['tb-restore', 'tb-sequence', 'tb-odd', 'tb-order', 'tb-escort']) {
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

  console.log('\nReplayability: slots, shuffles, seeds');
  const nm = (id) => normalizeMission(content.missions.find((x) => x.id === id), content.zones, items);
  const odd = nm('tb-random-odd'), oddZone = zoneFor(odd, content.zones);
  const runs = Array.from({ length: 20 }, (_, i) => makeRun(oddZone, odd, i + 1));
  const at = (run, id) => { const o = run.zone.objects.find((x) => x.id === id); return `${o.x},${o.y}`; };
  check('seed 0 is the layout as written', at(makeRun(oddZone, odd, 0), 'hint') === '2,4' && makeRun(oddZone, odd, 0).mission.goal.answer === 'c1');
  check('the same seed always gives the same run', JSON.stringify(makeRun(oddZone, odd, 7)) === JSON.stringify(makeRun(oddZone, odd, 7)));
  check('different seeds move objects in slots, and change the odd one', new Set(runs.map((r) => at(r, 'hint'))).size >= 3 && new Set(runs.map((r) => r.mission.goal.answer)).size === 3);
  check('the base map is never changed by a run', at({ zone: oddZone }, 'hint') === '2,4');
  const seq = nm('tb-random-seq');
  check('a shuffled sequence has a new order in different runs', new Set(Array.from({ length: 12 }, (_, i) => makeRun(zoneFor(seq, content.zones), seq, i + 1).mission.goal.order.join())).size >= 3);
  const checked = await runCheck(dir, dir, 'testbed');
  check('npm run check finds the runs that cannot be finished, with their seed', checked.errors.some((e) => e.includes('tb-reroll') && e.includes('shuffled runs cannot be finished') && /seed \d+/.test(e)), checked.errors.filter((e) => e.includes('tb-')).join(' | '));
  check('and the other shuffled missions pass', !checked.errors.some((e) => e.includes('shuffled runs') && !e.includes('tb-reroll')));

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

  // a new run each time: the clue tells this run's odd one; the server never starts a run that cannot be finished
  await start('tb-random-odd');
  const answer = r.mission.goal.answer, hint = thing('hint');
  check('a mission gets a seed, and its random parts are chosen', r.seed > 0 && ['c1', 'c2', 'c3'].includes(answer));
  const reader2 = who('read');
  await tp(reader2, hint.x, hint.y + 1 <= 12 ? hint.y + 1 : hint.y - 1); await act(reader2, 'read');
  check('a clue placeholder gives this run\'s answer', reader2.all.filter((m) => m.t === 'clue').at(-1)?.text === `Choose the ${thing(answer).name.toLowerCase()}.`);
  const chooser2 = who('use');
  await tp(chooser2, thing(answer).x, thing(answer).y - 1); await act(chooser2, 'use');
  check('choosing this run\'s answer completes the mission', (await ended())?.result.completed === true);
  await start('tb-random-seq');
  const runOrder = r.mission.goal.order;
  await tp(reader2, 2, 3); await act(reader2, 'read');
  check('{order} gives this run\'s order', reader2.all.filter((m) => m.t === 'clue').at(-1)?.text === `Press ${runOrder.map((id) => `the ${thing(id).name.toLowerCase()}`).join(', then ')}.`);
  const pusher2 = who('push');
  for (const id of runOrder) { await tp(pusher2, thing(id).x, thing(id).y); await act(pusher2, 'push'); }
  check('pressing in this run\'s order completes the mission', (await ended())?.result.completed === true);
  await start('tb-fixed');
  const fixed1 = r.mission.goal.order.join();
  await start('tb-fixed');
  check('a mission with a "seed" plays the same run every time', r.seed === 5 && r.mission.goal.order.join() === fixed1);
  let safe = true;
  for (let i = 0; i < 8; i++) { await start('tb-reroll'); safe &&= !(thing('q2').x === 21 && thing('q2').y === 12); }
  check('runs that cannot be finished are never started', safe);

  // themes reach the screens with the map
  check('the map\'s theme comes with the map', host.last.world.zone.theme.id === 'winter' && host.last.world.zone.theme.weather === 'snow' && host.last.world.zone.theme.palette['#6abe45']);
  await start('tb-night');
  check('a mission can choose another theme', host.last.world.zone.theme.id === 'night' && host.last.world.zone.theme.tint);

  // a mission's overrides reach the phones
  await start('tb-override');
  const reader = who('read');
  check('overrides: the renamed object and the added one are on the map', host.last.things.list.some((t) => t.id === 'board' && t.name === 'Notice board') && host.last.things.list.some((t) => t.id === 'extra'));
  await tp(reader, 2, 3); await act(reader, 'read');
  check('overrides: the clue has the mission\'s text', reader.all.filter((m) => m.t === 'clue').at(-1)?.text === 'TODAY: fix the pump first.');

  await app.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
