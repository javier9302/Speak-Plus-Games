// Timed doors with levers, trading chains and shopping. Run with: npm test, or node test/mechanics.js
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
import { KINDS } from '../server/kinds/index.js';
import { goalOf } from '../server/goals/index.js';
import { client } from './client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const picture = (c) => Array.from({ length: 16 }, (_, y) => (y > 3 && y < 12 ? '.'.repeat(4) + c.repeat(8) + '.'.repeat(4) : '.'.repeat(16)));
const food = (id, name, color) => ({ id, name, art: picture('a'), pal: { a: color } });

// A field with one wall of water at x = 14 (a timed door in it) and one at x = 17 (open sea beyond).
const rows = Array.from({ length: 13 }, (_, y) => (y === 0 || y === 12 ? '~'.repeat(26) : `~${','.repeat(24)}~`)).map((r, y) => {
  if (y === 0 || y === 12) return r;
  const a = [...r];
  if (y !== 6) a[14] = '~';
  if (y === 6) a.splice(3, 6, ...'pppppp');
  return a.join('');
});
const zone = {
  id: 'mech-field', name: 'Mechanics field', theme: 'day', rows,
  goal: { type: 'collect', items: { plank: 1 }, story: 'Trade for a plank.' },
  places: [], landmarks: [],
  objects: [
    { id: 'td1', kind: 'timed-door', name: 'Iron door', x: 14, y: 6 },
    { id: 'lv1', kind: 'lever', name: 'Lever', x: 2, y: 10, target: 'td1', seconds: 3 },
    { id: 'letter1', kind: 'item', name: 'Letter', x: 4, y: 9, item: 'letter' },
    { id: 'tom', kind: 'trader', name: 'Old Tom', x: 15, y: 3, wants: 'letter', gives: 'key', says: 'I have a key, but I want a letter. Can you help?' },
    { id: 'lee', kind: 'trader', name: 'Mrs Lee', x: 16, y: 3, wants: 'key', gives: 'plank' },
    { id: 's1', kind: 'shop', name: 'Bakery', x: 4, y: 2, sells: 'bread', price: 3 },
    { id: 's2', kind: 'shop', name: 'Market', x: 8, y: 2, sells: 'bread', price: 2 },
    { id: 's3', kind: 'shop', name: 'Dairy', x: 6, y: 10, sells: 'milk', price: 4 },
    { id: 't1', kind: 'station', name: 'Tablet', x: 10, y: 10 },
  ],
};
const missions = {
  'mt-chain': { goal: { type: 'collect', items: { plank: 1 } } },
  'mt-shop': { goal: { type: 'shopping', list: { bread: 2, milk: 1 }, coins: 9 } },
};

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-mech-'));
  for (const f of ['items.json', 'abilities.json', 'monster.json', 'seed-cards.json', 'themes.json']) await fs.copyFile(path.join(root, 'data', f), path.join(dir, f));
  await fs.cp(path.join(root, 'data', 'scenarios'), path.join(dir, 'scenarios'), { recursive: true });
  const pack = path.join(dir, 'scenarios', 'mechtest');
  await fs.mkdir(path.join(pack, 'zones'), { recursive: true });
  await fs.mkdir(path.join(pack, 'missions'), { recursive: true });
  await fs.writeFile(path.join(pack, 'pack.json'), JSON.stringify({ id: 'mechtest', name: 'Mechanics test', order: 9, items: [food('bread', 'Bread', '#d9b27a'), food('milk', 'Milk', '#ffffff')] }));
  await fs.writeFile(path.join(pack, 'zones', 'mech-field.json'), JSON.stringify(zone));
  for (const [id, m] of Object.entries(missions)) await fs.writeFile(path.join(pack, 'missions', `${id}.json`), JSON.stringify({ id, title: id, zone: 'mech-field', stations: [{ at: 't1' }], ...m }));

  console.log('\nThe map file');
  const abilities = await loadAbilities(dir);
  const it = JSON.parse(await fs.readFile(path.join(dir, 'items.json'), 'utf8'));
  const items = { list: it.items, byId: Object.fromEntries(it.items.map((i) => [i.id, i])) };
  const content = await loadContent(dir, { abilities, items });
  check('the pack loads: lever, timed door, traders, shops, a shopping goal', !content.errors.length && content.missions.filter((m) => m.pack === 'mechtest').length === 2, content.errors.join(' | '));
  const deps = { items: items.list.map((i) => i.id), abilities: abilities.ids };
  const bad = (id, patch) => zoneProblems({ ...zone, objects: zone.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) }, deps).join(' | ');
  check('a lever needs a target that can be held open', bad('lv1', { target: 'tom' }).includes('something a lever can open') && bad('lv1', { target: undefined }).includes('needs "target"'));
  check('a lever stays open 3 to 60 seconds', bad('lv1', { seconds: 1 }).includes('3 to 60') && bad('lv1', { seconds: 99 }).includes('3 to 60'));
  check('a trader needs two different items', bad('tom', { gives: 'letter' }).includes('the same item') && bad('tom', { wants: 'lanter' }).includes('not an item'));
  check('a trader and a shop speak by themselves, so no talk clue', bad('tom', { clues: { talk: 'x' } }).includes('remove the "talk" clue') && bad('s1', { clues: { talk: 'x' } }).includes('remove the "talk" clue'));
  check('a shop needs a price and a possible stock', bad('s1', { price: 0 }).includes('1 to 99') && bad('s1', { stock: 50 }).includes('1 to 20'));
  check('a door that no lever opens is reported by the check', KINDS['timed-door'].rules({ name: 'Door', id: 'td1' }, []).includes('no lever') && KINDS['timed-door'].rules({ name: 'Door', id: 'td1' }, [{ kind: 'lever', def: { target: 'td1' } }]) === null);

  console.log('\nThe solver');
  const norm = (id, patch = {}) => { const raw = content.missions.find((x) => x.id === id); return normalizeMission({ ...raw, ...patch }, content.zones, items); };
  const chain = norm('mt-chain'), shop = norm('mt-shop'), z = zoneFor(chain, content.zones);
  check('the trading chain can be finished with 2 to 6 players', [2, 3, 4, 5, 6].every((n) => solve(z, chain, dealPreset(abilities, n)).ok), [2, 3, 4, 5, 6].map((n) => solve(z, chain, dealPreset(abilities, n)).problems.join(';')).join(' | '));
  check('one player alone cannot cross a timed door (somebody else pulls the lever)', !solve(z, chain, [abilities.ids]).ok);
  check('nobody with Use: the lever stays still', !solve(z, chain, dealPreset(abilities, 3), { without: ['use'] }).ok);
  check('nobody with Talk: the traders stay silent', !solve(z, chain, dealPreset(abilities, 3), { without: ['talk'] }).ok);
  check('the log shows the trades', solve(z, chain, dealPreset(abilities, 3)).log.some((l) => l.includes('letter to the old tom')) && solve(z, chain, dealPreset(abilities, 3)).log.some((l) => l.includes('key to the mrs lee')));
  const zs = zoneFor(shop, content.zones);
  check('shopping can be finished with 2 to 6 players, buying at the cheapest shops', [2, 3, 4, 5, 6].every((n) => solve(zs, shop, dealPreset(abilities, n)).ok) && solve(zs, shop, dealPreset(abilities, 3)).log.filter((l) => l.startsWith('Use: buy bread') && l.includes('market')).length === 2 && !solve(zs, shop, dealPreset(abilities, 3)).log.some((l) => l.includes('bakery')));
  const poor = norm('mt-shop', { goal: { type: 'shopping', list: { bread: 2, milk: 1 }, coins: 7 } }), poorSolve = solve(zoneFor(poor, content.zones), poor, dealPreset(abilities, 3));
  check('too few coins: it cannot be finished, and the report says how many are needed', !poorSolve.ok && poorSolve.problems.some((p) => p.includes('not enough coins') && p.includes('cheapest costs 4')), poorSolve.problems.join(' | '));
  check('the shopping goal needs Talk (the price) and Use (to pay)', !solve(zs, shop, dealPreset(abilities, 3), { without: ['talk'] }).ok && !solve(zs, shop, dealPreset(abilities, 3), { without: ['use'] }).ok);
  check('a list item nobody sells is found', (() => { try { norm('mt-shop', { goal: { type: 'shopping', list: { plank: 1 }, coins: 5 } }); return false; } catch (e) { return e.message.includes('nobody sells "plank"'); } })());
  check('the check warns when prices do not matter', goalOf(shop.goal).notes(zs, shop.goal).length === 0 && goalOf(shop.goal).notes(zs, { ...shop.goal, coins: 40 })[0].includes('prices do not matter'));

  console.log('\nPlaying the trading chain and the timed door');
  const app = await createApp({ port: 0, contentDir: dir, dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-mech-saves-')), publicUrl: '', pin: '2468', quiet: true, watch: false });
  const api = async (p, method = 'GET', body) => (await fetch(`http://127.0.0.1:${app.port}/api${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).json();
  const group = await api('/groups', 'POST', { name: 'Mechanics testers' });
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
  const start = async (id) => { cmd('mission', { mission: lib.find((m) => m.id === id) }); await host.next('roster', (x) => x.phase === 'play' && x.mission.id === id); await sleep(100); };
  const player = (c) => r.players.find((p) => p.id === c.me.id);
  const who = (a) => [A, B].find((c) => player(c).abilities.includes(a));
  const tp = async (c, x, y) => { cmd('tp', { p: c.me.id, x, y }); await sleep(80); };
  const act = async (c, a) => { await sleep(260); c.send({ t: 'act', a }); await sleep(120); };
  const thing = (id) => r.things.find((t) => t.id === id);
  const last = (c, type, key) => c.all.filter((x) => x.t === type).at(-1)?.[key] || '';

  await start('mt-chain');
  const talker = who('talk'), picker = who('pickup'), puller = who('use');
  await tp(talker, 15, 4); await act(talker, 'talk');
  check('a trader without its item says what it wants, in its own words', last(talker, 'nope', 'msg') === 'I have a key, but I want a letter. Can you help?', last(talker, 'nope', 'msg'));
  await tp(picker, 4, 10); await act(picker, 'pickup');
  check('the letter is picked up', player(picker).items.some((i) => i.item === 'letter'));
  if (picker !== talker) { cmd('give', { p: talker.me.id, item: 'letter' }); await sleep(100); }
  else { /* the same player */ }

  // The timed door: a lever far away opens it for 3 seconds.
  await tp(puller, 2, 11); await act(puller, 'use');
  check('the lever opens the door at once, and tells the player to call Go', thing('td1').held === true && last(puller, 'say', 'msg').includes('3 seconds') && last(puller, 'say', 'msg').includes('Go'), last(puller, 'say', 'msg'));
  check('the screens see the door open, and nobody is blocked at it', host.last.things.list.find((t) => t.id === 'td1').held === true && !r.block.has('14,6'));
  await act(puller, 'use');
  check('pulling again while it is open does nothing', thing('lv1').st === 'on');
  await sleep(3600);
  check('after 3 seconds it shuts again', thing('td1').held === false && thing('td1').st === 'closed' && r.block.has('14,6') && thing('lv1').st === 'x');
  await act(puller, 'use');
  check('and the lever can be pulled again', thing('td1').held === true);

  // The chain: letter to Old Tom for a key, key to Mrs Lee for a plank.
  await tp(talker, 15, 4); await act(talker, 'talk');
  check('Talk with the letter makes the trade', thing('tom').st === 'paid' && thing('tom').holds === 'key' && !player(talker).items.some((i) => i.item === 'letter'), last(talker, 'say', 'msg'));
  await tp(picker, 15, 4); await act(picker, 'pickup');
  check('then Pick up the key', player(picker).items.some((i) => i.item === 'key') && thing('tom').st === 'done');
  if (picker !== talker) { cmd('give', { p: talker.me.id, item: 'key' }); await sleep(100); }
  await tp(talker, 16, 4); await act(talker, 'talk');
  check('the key buys the plank from Mrs Lee', thing('lee').st === 'paid' && thing('lee').holds === 'plank');
  await tp(picker, 16, 4); await act(picker, 'pickup');
  const ended = host.last.roster.phase === 'done' ? host.last.roster : await host.next('roster', (x) => x.phase === 'done', 2000).catch(() => null);
  check('the plank ends the mission', !!ended && ended.result?.completed === true, JSON.stringify(ended?.result));

  console.log('\nPlaying the shopping');
  await start('mt-shop');
  check('the screens see the coins', host.last.roster.progress.coins === 9 && host.last.roster.progress.need === 3);
  const buyer = who('use'), asker = who('talk');
  await tp(asker, 4, 3); await act(asker, 'talk');
  const price = (c) => c.all.filter((x) => x.t === 'clue').at(-1)?.text;
  check('Talk at the Bakery tells the price and the coins', price(asker) === 'Bread: 3 coins. The team has 9 coins.', price(asker));
  await tp(asker, 8, 3); await act(asker, 'talk');
  check('the Market is cheaper', price(asker) === 'Bread: 2 coins. The team has 9 coins.', price(asker));
  await tp(buyer, 6, 9); r.goalState.coins = 3; await act(buyer, 'use');
  check('not enough coins: nothing is bought, and the player is told', !player(buyer).items.length && last(buyer, 'nope', 'msg').includes('costs 4 coins') && last(buyer, 'nope', 'msg').includes('has 3 coins'), last(buyer, 'nope', 'msg'));
  r.goalState.coins = 9;
  await tp(buyer, 8, 3); await act(buyer, 'use'); await act(buyer, 'use');
  check('two breads at 2 coins leave 5', player(buyer).items.filter((i) => i.item === 'bread').length === 2 && r.goalState.coins === 5);
  await tp(buyer, 6, 9); await act(buyer, 'use');
  const done = host.last.roster.phase === 'done' ? host.last.roster : await host.next('roster', (x) => x.phase === 'done', 2000).catch(() => null);
  check('the milk completes the list (1 coin left)', r.goalState.coins === 1 && !!done && done.result?.completed === true, JSON.stringify(done?.result));

  await app.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
