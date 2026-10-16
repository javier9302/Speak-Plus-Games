// Items with their own pictures, a pack's sprites ("skin"), and the barrier kind: any blocking object that says what
// opens it ("requires": an item, a code or word, an ability, players on plates). Run with: npm test, or node test/requires.js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.js';
import { loadContent } from '../server/content.js';
import { loadAbilities, dealPreset } from '../server/abilities.js';
import { normalizeMission, zoneFor } from '../server/missions.js';
import { solve } from '../server/solver.js';
import { zoneProblems } from '../server/validate.js';
import { itemProblems } from '../server/items.js';
import { spriteProblems } from '../server/art.js';
import { client } from './client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const square = (c) => Array.from({ length: 16 }, (_, y) => (y > 3 && y < 12 ? '.'.repeat(4) + c.repeat(8) + '.'.repeat(4) : '.'.repeat(16)));
const card = { id: 'id-card', name: 'ID card', art: ['................', ...square('a').slice(1)], pal: { a: '#ffffff' } };
const door = { pal: { a: '#9db4e0', b: '#1f2f5c' }, states: { default: square('a'), open: square('b') } };

// Four sections cut by walls of water; a barrier stands in each wall; the lamp is behind the last one.
const rows = Array.from({ length: 13 }, (_, y) => (y === 0 || y === 12 ? '~'.repeat(26) : `~${','.repeat(24)}~`)).map((r, y) => {
  if (y === 0 || y === 12) return r;
  const a = [...r];
  for (const x of [14, 17, 20]) if (y !== 6) a[x] = '~';
  if (y === 6) a.splice(3, 6, ...'pppppp');
  return a.join('');
});
const zone = {
  id: 'req-field', name: 'Barrier field', theme: 'day', rows,
  goal: { type: 'restore', story: 'Get through the barriers.' },
  places: [], landmarks: [],
  objects: [
    { id: 'card1', kind: 'item', name: 'ID card', x: 3, y: 3, item: 'id-card' },
    { id: 'b1', kind: 'barrier', name: 'Shop door', x: 14, y: 6, skin: 'shop-door', requires: { item: 'id-card' } },
    { id: 'b2', kind: 'barrier', name: 'Vine wall', x: 17, y: 6, requires: [{ word: 'OPEN' }, { ability: 'fix' }] },
    { id: 'n1', kind: 'sign', name: 'Sign', x: 15, y: 3, clues: { read: 'Letters 1 and 2: {code:b2:1} {code:b2:2}.' } },
    { id: 'n2', kind: 'bottle', name: 'Bottle', x: 16, y: 3, clues: { look: 'Letters 3 and 4: {code:b2:3} {code:b2:4}.' } },
    { id: 'pa', kind: 'plate', name: 'North stone', x: 18, y: 2 },
    { id: 'pb', kind: 'plate', name: 'South stone', x: 18, y: 10 },
    { id: 'b3', kind: 'barrier', name: 'Laser', x: 20, y: 6, finish: 'auto', requires: { playersOn: ['pa', 'pb'] } },
    { id: 'lamp', kind: 'machine', name: 'Lamp', x: 23, y: 6 },
    { id: 't1', kind: 'station', name: 'Tablet', x: 23, y: 9 },
  ],
};
const mission = { id: 'rq-all', title: 'All barriers', zone: 'req-field', stations: [{ at: 't1' }], goal: { type: 'restore', machines: ['lamp'] } };

async function main() {
  console.log('\nItems and sprites in data');
  check('a good item and a good sprite have no problems', itemProblems([card], 'x').length === 0 && spriteProblems('shop-door', door).length === 0);
  check('an item needs 16 rows of 16 letters, and colours for its letters', itemProblems([{ ...card, art: ['..'] }], 'x')[0]?.includes('16 rows of 16') && itemProblems([{ ...card, pal: {} }], 'x')[0]?.includes('needs a colour'));
  check('item ids must be new', itemProblems([card], 'x', new Set(['id-card']))[0]?.includes('already has this id'));
  check('a sprite needs a default picture', spriteProblems('d', { pal: {}, states: { open: square('k') } })[0]?.includes('states.default'));

  console.log('\nThe barrier in a map file');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-req-'));
  for (const f of ['items.json', 'abilities.json', 'monster.json', 'seed-cards.json', 'themes.json']) await fs.copyFile(path.join(root, 'data', f), path.join(dir, f));
  await fs.cp(path.join(root, 'data', 'scenarios'), path.join(dir, 'scenarios'), { recursive: true });
  const pack = path.join(dir, 'scenarios', 'reqtest');
  await fs.mkdir(path.join(pack, 'zones'), { recursive: true });
  await fs.mkdir(path.join(pack, 'missions'), { recursive: true });
  await fs.writeFile(path.join(pack, 'pack.json'), JSON.stringify({ id: 'reqtest', name: 'Requires test', order: 9, items: [card], sprites: { 'shop-door': door } }));
  await fs.writeFile(path.join(pack, 'zones', 'req-field.json'), JSON.stringify(zone));
  await fs.writeFile(path.join(pack, 'missions', 'rq-all.json'), JSON.stringify(mission));
  const abilities = await loadAbilities(dir);
  const it = JSON.parse(await fs.readFile(path.join(dir, 'items.json'), 'utf8'));
  const items = { list: it.items, byId: Object.fromEntries(it.items.map((i) => [i.id, i])) };
  const content = await loadContent(dir, { abilities, items });
  check('the pack loads, and its item is in the registry', !content.errors.length && !!items.byId['id-card'] && items.byId['id-card'].pack === 'reqtest', content.errors.join(' | '));
  check('the base items keep their pictures (they are data now)', ['lantern', 'key', 'plank', 'letter', 'crystal'].every((id) => items.byId[id].art.length === 16));
  const again = await loadContent(dir, { abilities, items });
  check('loading again does not add the pack item twice', !again.errors.length && items.list.filter((i) => i.id === 'id-card').length === 1);
  const deps = { items: items.list.map((i) => i.id), abilities: abilities.ids, sprites: ['shop-door'] };
  check('the test map is valid', zoneProblems(zone, deps).length === 0, zoneProblems(zone, deps).join(' | '));
  const withObj = (id, patch) => ({ ...zone, objects: zone.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const bad = (id, patch) => zoneProblems(withObj(id, patch), deps).join(' | ');
  check('an unknown skin is found, with the sprites to choose from', bad('b1', { skin: 'shop-dor' }).includes('Did you mean "shop-door"'));
  check('a barrier without requires, or with two things in one rule', bad('b1', { requires: [] }).includes('needs "requires"') && bad('b1', { requires: { item: 'key', ability: 'fix' } }).includes('exactly one'));
  check('an unknown item and an unknown ability are found', bad('b1', { requires: { item: 'idcard' } }).includes('"idcard" is not an item') && bad('b2', { requires: { ability: 'fly' } }).includes('not an ability'));
  check('plates must be plates', bad('b3', { requires: { playersOn: ['pa', 'n1'] } }).includes('must be a plate'));
  check('a barrier asks for one code at most', bad('b2', { requires: [{ word: 'OPEN' }, { code: { type: 'symbols', length: 3 } }] }).includes('only one code'));
  check('its code needs every letter in some clue', bad('n2', { clues: {} }).includes('piece 3'));

  console.log('\nThe solver');
  const m = normalizeMission(content.missions.find((x) => x.id === 'rq-all'), content.zones, items), z = zoneFor(m, content.zones);
  check('2 to 6 players can get through every barrier', [2, 3, 4, 5, 6].every((n) => solve(z, m, dealPreset(abilities, n)).ok), [2, 3, 4, 5, 6].map((n) => solve(z, m, dealPreset(abilities, n)).problems.join(';')).join(' | '));
  check('one player cannot stand on two plates', !solve(z, m, [abilities.ids]).ok);
  check('without Fix the vine wall stays shut', !solve(z, m, dealPreset(abilities, 3), { without: ['fix'] }).ok);
  check('without one clue of the word it cannot', !solve(z, m, dealPreset(abilities, 3), { skipClues: new Set(['n2:look']) }).ok);

  console.log('\nPlaying it');
  const app = await createApp({ port: 0, contentDir: dir, dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-req-saves-')), publicUrl: '', pin: '2468', quiet: true, watch: false });
  const api = async (p, method = 'GET', body) => (await fetch(`http://127.0.0.1:${app.port}/api${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).json();
  const group = await api('/groups', 'POST', { name: 'Barrier testers' });
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
  cmd('mission', { mission: lib.find((x) => x.id === 'rq-all') });
  await host.next('roster', (x) => x.phase === 'play' && x.mission.id === 'rq-all');
  await sleep(100);
  const player = (c) => r.players.find((p) => p.id === c.me.id);
  const who = (a) => [A, B].find((c) => player(c).abilities.includes(a));
  const tp = async (c, x, y) => { cmd('tp', { p: c.me.id, x, y }); await sleep(80); };
  const act = async (c, a) => { await sleep(260); c.send({ t: 'act', a }); await sleep(120); };
  const thing = (id) => r.things.find((t) => t.id === id);
  const lastSay = (c) => c.all.filter((x) => x.t === 'say').at(-1)?.msg || '';
  const keypad = (c, o) => c.all.filter((x) => x.t === 'keypad' && x.o === o).at(-1);
  const answer = async (c, o, value) => { await sleep(1300); c.send({ t: 'answer', o, value }); return (await c.next('result', (x) => x.o === o)).msg; };

  const world = host.last.world.zone;
  check('the screens get the pack\'s sprites and the items\' pictures', world.skins['shop-door'].states.open.length === 16 && world.itemArt.find((i) => i.id === 'id-card')?.art.length === 16 && world.itemArt.length === 6 && !!world.art.barrier);
  check('and a thing says which skin it wears', host.last.things.list.find((t) => t.id === 'b1').skin === 'shop-door' && host.last.things.list.find((t) => t.id === 'b2').skin === undefined);

  // Barrier 1: an item.
  const picker = who('pickup'), user = who('use'), fixer = who('fix'), opener = who('open');
  await tp(picker, 3, 4); await act(picker, 'pickup');
  check('the ID card can be picked up', player(picker).items.some((i) => i.item === 'id-card'));
  cmd('give', { p: user.me.id, item: 'id-card' }); await sleep(100);
  await tp(user, 13, 6); await act(opener, 'open');
  check('Open does nothing while it is locked', thing('b1').st === 'locked');
  await tp(opener, 13, 6); await act(user, 'use');
  check('Use with the card unlocks the door, and the card stays', thing('b1').st === 'closed' && player(user).items.some((i) => i.item === 'id-card'), lastSay(user));
  await act(opener, 'open');
  check('then Open opens it', thing('b1').st === 'open');

  // Barrier 2: a word, then an ability.
  const reader = who('read'), looker = who('look');
  await tp(reader, 15, 4); await act(reader, 'read'); await tp(looker, 16, 4); await act(looker, 'look');
  const word = r.secrets.answers.b2;
  const clues = reader.all.filter((x) => x.t === 'clue').map((x) => x.text);
  check('the clues show pieces of the word', clues.includes(`Letters 1 and 2: ${word[0]} ${word[1]}.`) && clues.includes(`Letters 3 and 4: ${word[2]} ${word[3]}.`), clues.join(' / ') + word);
  await tp(user, 16, 6); await act(fixer, 'fix');
  check('Fix does nothing before the word', thing('b2').st === 'locked' && thing('b2').met.length === 0);
  await act(user, 'use');
  check('Use asks for the word', keypad(user, 'b2')?.kind === 'word' && keypad(user, 'b2').length === 4);
  check('a wrong word is refused', (await answer(user, 'b2', 'OPAL')).includes('not the code'));
  check('the right word is accepted', (await answer(user, 'b2', word.toLowerCase())).includes('Unlocked') && thing('b2').st === 'locked' && thing('b2').met.length === 1);
  await tp(fixer, 16, 6); await act(fixer, 'fix');
  check('then Fix unlocks the vine wall', thing('b2').st === 'closed', lastSay(fixer));
  await act(opener, 'open');
  check('and Open opens it', thing('b2').st === 'open');

  // Barrier 3: two players on two plates at the same time.
  await tp(A, 18, 2); await sleep(150);
  check('one player on one plate is not enough', thing('b3').st === 'locked');
  await tp(B, 18, 10); await sleep(250);
  check('two players on two plates open the laser by itself', thing('b3').st === 'open');

  await app.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
