// Logic tests. Run with:  node tests/run.mjs
// They cover the role circle, level data, the collecting / spending rules, the
// gate flow, and a full play-through of every level with 2, 3 and 4 players.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assignRoles } from '../js/roles.js';
import { resolveLevel, validateLevel } from '../js/levels.js';
import { createWorld, updateWorld, isSolid, goalProgress, TILE } from '../js/world.js';
import { updateGateUI, participants, releaseHint, cancelGate, completeGate } from '../js/trade.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const json = (p) => JSON.parse(readFileSync(root + p, 'utf8'));
const config = json('data/config.json');
const levels = config.levels.map((id) => json(`data/levels/${id}.json`));
const order = config.resourceOrder;

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) passed++;
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}
const eq = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), `\n        got      ${JSON.stringify(a)}\n        expected ${JSON.stringify(b)}`);

// ---------- helpers ----------
const idle = () => ({ move: { x: 0, y: 0 }, pressed: {}, down: {}, nav: { x: 0, y: 0 } });
const noKeys = { digits: [], backspace: false };

function setup(level, count, settings = {}) {
  const roles = assignRoles(count, order);
  const players = roles.map((r, i) => ({ ...r, index: i, name: config.players[i].name }));
  const resolved = resolveLevel(level, count, order);
  const world = createWorld(resolved, players, { ...config.settings, ...settings }, config.text);
  return { world, players, roles, resolved };
}
// One frame. `acts` maps a player id to a partial input.
function step(world, players, acts = {}, dt = 1 / 60) {
  const inputs = players.map((p) => ({ ...idle(), ...(acts[p.id] || {}) }));
  if (world.activeGate) updateGateUI(world, players, inputs, acts.keys || noKeys, dt);
  else updateWorld(world, players, inputs, dt);
  world.events.length = 0;
}
const press = (b) => ({ pressed: { [b]: true }, down: { [b]: true } });
const put = (p, at) => { p.x = at.x; p.y = at.y; };
const typeCode = (world, players, code) => step(world, players, { keys: { digits: code.split(''), backspace: false } });
function besideStation(world, s) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    if (!isSolid(world, s.tx + dx, s.ty + dy)) return { x: s.x + dx * TILE, y: s.y + dy * TILE };
  }
  throw new Error('station is walled in');
}

// ---------- 1. roles ----------
console.log('Roles');
eq('4 players', assignRoles(4, order).map((r) => [r.id, r.collects, r.spends]), [
  ['P1', 'gold', 'gears'], ['P2', 'wood', 'gold'], ['P3', 'gems', 'wood'], ['P4', 'gears', 'gems'],
]);
eq('3 players', assignRoles(3, order).map((r) => [r.collects, r.spends]), [['gold', 'gems'], ['wood', 'gold'], ['gems', 'wood']]);
eq('2 players', assignRoles(2, order).map((r) => [r.collects, r.spends]), [['gold', 'wood'], ['wood', 'gold']]);
for (const n of [2, 3, 4]) {
  const roles = assignRoles(n, order);
  check(`${n}: nobody spends what they collect`, roles.every((r) => r.collects !== r.spends));
  check(`${n}: every resource has one collector and one spender`,
    order.slice(0, n).every((res) => roles.filter((r) => r.collects === res).length === 1 && roles.filter((r) => r.spends === res).length === 1));
}
let threw = false;
try { assignRoles(1, order); } catch { threw = true; }
check('1 player is refused', threw);

// ---------- 2. level data ----------
console.log('Level data');
const allCodes = [];
for (const level of levels) {
  level.gates.forEach((g) => allCodes.push(g.teacher.code));
  for (let n = 2; n <= 4; n++) {
    const resolved = resolveLevel(level, n, order);
    const problems = validateLevel(resolved, assignRoles(n, order));
    check(`${level.id} with ${n} players is valid`, problems.length === 0, problems.join('; '));
    check(`${level.id} with ${n}: map is 24 x 11`, resolved.map.length === 11 && resolved.map.every((r) => r.length === 24));
  }
}
check('codes differ across all levels', new Set(allCodes).size === allCodes.length);
eq('gate counts per level', levels.map((l) => l.gates.length), [1, 2, 3]);

// Everything can be reached on foot (bars and the exit door count as open).
for (const level of levels) {
  const { world, players } = setup(level, level.players);
  world.barsOpen = world.doorOpen = true;
  const seen = new Set();
  const queue = [[Math.floor(players[0].x / TILE), Math.floor(players[0].y / TILE)]];
  while (queue.length) {
    const [x, y] = queue.pop();
    if (seen.has(`${x},${y}`) || isSolid(world, x, y)) continue;
    seen.add(`${x},${y}`);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const at = (o) => seen.has(`${Math.floor(o.x / TILE)},${Math.floor(o.y / TILE)}`);
  check(`${level.id}: pickups reachable`, world.pickups.every(at));
  check(`${level.id}: gates reachable`, world.gates.every(at));
  check(`${level.id}: stations reachable`, world.stations.every((s) => at(besideStation(world, s))));
  check(`${level.id}: exit reachable`, world.exits.every((e) => seen.has(`${e.tx},${e.ty}`)));
  check(`${level.id}: players start apart`, new Set(players.map((p) => `${p.x},${p.y}`)).size === players.length);
}

// ---------- 3. collecting, spending and the gate flow (level 1) ----------
console.log('Rules and gate flow');
{
  const { world, players } = setup(levels[0], 2);
  const [p1, p2] = players;
  const gold = world.pickups.filter((k) => k.res === 'gold');
  const gate = world.gates[0], chest = world.stations[0];

  put(p2, gold[0]); step(world, players, { P2: press('a') });
  check('the spender cannot pick up', p2.inv.gold === 0 && !gold[0].taken);
  check('...and is told who can', world.floats.some((f) => f.text.includes('RED')));

  put(p1, gold[0]); step(world, players, { P1: press('a') });
  put(p1, gold[1]); step(world, players, { P1: press('a') });
  check('the collector picks up', p1.inv.gold === 2 && gold[0].taken);

  put(p1, besideStation(world, chest)); step(world, players, { P1: press('a') });
  check('the collector cannot spend', p1.inv.gold === 2 && chest.have.gold === 0);

  put(p1, gate); put(p2, gate);
  step(world, players, { P1: press('b') });
  check('one player asking is not enough', !world.activeGate && p1.ready === 'g1');
  step(world, players, { P2: press('b') });
  check('gate stays shut without enough gold', !world.activeGate && gate.status === 'locked');

  put(p1, gold[2]); step(world, players, { P1: press('a') });
  put(p1, gate); step(world, players, { P1: press('b') });
  put(p1, { x: gate.x + 80, y: gate.y }); step(world, players);
  check('walking away cancels the ask', p1.ready === null);
  put(p1, gate); step(world, players, { P1: press('b'), P2: press('b') });
  check('both ask with 3 gold: card opens', world.activeGate === gate && gate.status === 'active');
  check('nothing moves before the code', p1.inv.gold === 3 && p2.inv.gold === 0);

  releaseHint(world, gate, 1); releaseHint(world, gate, 1);
  check('a hint is counted once', gate.hints === 1 && world.stats.hints === 1);

  typeCode(world, players, '0000');
  check('wrong code: still waiting', world.activeGate === gate && p2.inv.gold === 0 && gate.entry === '');
  typeCode(world, players, '48');
  step(world, players, { keys: { digits: [], backspace: true } });
  check('backspace removes a digit', gate.entry === '4');
  step(world, players, { keys: { digits: [], backspace: true } });
  // Controller entry: move the cursor to "4" (left, already on row 2) and press A.
  step(world, players, { P1: { nav: { x: -1, y: 0 } } });
  step(world, players, { P1: press('a') });
  check('d-pad number pad types a digit', gate.entry === '4');
  typeCode(world, players, '821');
  check('right code: gold moves', !world.activeGate && gate.status === 'open' && p1.inv.gold === 0 && p2.inv.gold === 3);
  check('trade is counted', world.stats.trades === 1);

  put(p2, besideStation(world, chest));
  for (let i = 0; i < 3; i++) step(world, players, { P2: press('a') });
  check('the spender fills the chest', chest.have.gold === 3 && p2.inv.gold === 0);
  eq('goal progress', goalProgress(world), { have: 3, need: 3 });
  check('the exit opens', world.doorOpen);

  put(p1, { x: world.exits[0].tx * TILE + 8, y: world.exits[0].ty * TILE + 8 });
  step(world, players);
  check('one player on the exit is not a win', !world.won);
  put(p2, p1); step(world, players);
  check('everyone on the exit wins', world.won);
}

// An open gate trades again with no question; skip and force-open work.
{
  const { world, players } = setup(levels[0], 2);
  const [p1, p2] = players, gate = world.gates[0];
  p1.inv.gold = 3; put(p1, gate); put(p2, gate);
  step(world, players, { P1: press('b'), P2: press('b') });
  cancelGate(world);
  check('skip closes the card without trading', !world.activeGate && gate.status === 'locked' && p1.inv.gold === 3);
  completeGate(world, gate);
  check('force-open trades', gate.status === 'open' && p2.inv.gold === 3);
  p1.inv.gold = 2;
  step(world, players, { P1: press('b'), P2: press('b') });
  check('open gate trades again at once', !world.activeGate && p2.inv.gold === 5 && world.stats.trades === 2);
}

// Hint cost and pickup respawn.
{
  const { world, players } = setup(levels[0], 2, { hintCostsResource: true, pickupRespawnSeconds: 5 });
  const [p1] = players, gate = world.gates[0];
  p1.inv.gold = 3;
  releaseHint(world, gate, 1);
  check('a hint can cost one resource', p1.inv.gold === 2);
  const k = world.pickups[0];
  put(p1, k); step(world, players, { P1: press('a') });
  step(world, players, {}, 4);
  check('pickup is gone for a while', k.taken);
  step(world, players, {}, 2);
  check('pickup comes back', !k.taken);
}

// Walls stop players.
{
  const { world, players } = setup(levels[0], 2);
  const p1 = players[0];
  for (let i = 0; i < 600; i++) step(world, players, { P1: { move: { x: -1, y: -1 } } });
  check('players stay inside the walls', p1.x >= TILE + 5 - 0.1 && p1.y >= TILE + 5 - 0.1, `${p1.x},${p1.y}`);
}

// ---------- 4. two-person switch (level 2) ----------
console.log('Switch, three-way gate, secret card');
{
  const { world, players } = setup(levels[1], 3);
  const [p1, p2, p3] = players;
  put(p1, world.plates[0]);
  for (let i = 0; i < 300; i++) step(world, players);
  check('one player cannot open the bars', !world.barsOpen);
  put(p2, world.plates[1]);
  for (let i = 0; i < 120; i++) step(world, players);
  check('two players must hold for 3 seconds', !world.barsOpen && world.switchT > 1.9);
  put(p2, { x: p2.x + 40, y: p2.y }); step(world, players);
  check('stepping off resets the count', world.switchT === 0);
  put(p2, world.plates[1]);
  for (let i = 0; i < 200; i++) step(world, players);
  check('holding together opens the bars', world.barsOpen);

  // Three-way gate: needs all three, moves wood and gems in one go.
  const g2 = world.gates.find((g) => g.def.id === 'g2');
  eq('g2 is a three-person trade', participants(g2.def), ['P2', 'P3', 'P1']);
  p2.inv.wood = 2; p3.inv.gems = 2;
  players.forEach((p) => put(p, g2));
  step(world, players, { P2: press('b'), P3: press('b') });
  check('two of three is not enough', !world.activeGate);
  step(world, players, { P1: press('b') });
  check('all three open the card', world.activeGate === g2);
  typeCode(world, players, g2.def.teacher.code);
  check('wood and gems both move', p3.inv.wood === 2 && p1.inv.gems === 2 && p2.inv.wood === 0);
}

// ---------- 5. describe gate (level 3) ----------
{
  const { world, players } = setup(levels[2], 4);
  const p4 = players[3], p1 = players[0];
  const g3 = world.gates.find((g) => g.def.id === 'g3');
  p4.inv.gears = 2; put(p4, g3); put(p1, g3);
  step(world, players, { P1: press('b'), P4: press('b') });
  check('describe card opens', world.activeGate === g3);
  step(world, players, { P4: { down: { a: true } } });
  check('describer holds A to see the secret card', g3.peek);
  step(world, players, { P1: { nav: { x: 1, y: 0 } } });
  check('card hides again and the picker can move', !g3.peek && g3.picked === 1);
  typeCode(world, players, g3.def.teacher.code);
  check('no code before the card is chosen', world.activeGate === g3 && p1.inv.gears === 0);
  step(world, players, { P1: press('a') });
  check('wrong card is refused', !g3.pickOk);
  step(world, players, { P1: { nav: { x: -1, y: 0 } } });
  step(world, players, { P1: press('a') });
  check('right card is accepted', g3.pickOk);
  typeCode(world, players, g3.def.teacher.code);
  check('then the code moves the gears', p1.inv.gears === 2 && g3.status === 'open');
}

// ---------- 6. full play-through of every level with every player count ----------
console.log('Play-throughs');
function playThrough(level, count) {
  const { world, players } = setup(level, count);
  for (let round = 0; round < 6 && !world.doorOpen; round++) {
    for (const p of players) {
      for (const k of world.pickups.filter((q) => q.res === p.collects && !q.taken)) {
        put(p, k); step(world, players, { [p.id]: press('a') });
      }
    }
    for (const gate of world.gates) {
      const people = participants(gate.def).map((id) => world.byId[id]);
      people.forEach((p) => put(p, gate));
      step(world, players, Object.fromEntries(people.map((p) => [p.id, press('b')])));
      if (world.activeGate !== gate) continue;
      if (gate.def.type === 'describe') {
        gate.picked = gate.def.card.target;
        step(world, players, { [gate.def.card.picker]: press('a') });
      }
      typeCode(world, players, gate.def.teacher.code);
    }
    for (const s of world.stations) {
      for (const p of players) {
        put(p, besideStation(world, s));
        for (let i = 0; i < 6; i++) step(world, players, { [p.id]: press('a') });
      }
    }
    step(world, players, {}, 25); // wait for pickups to come back
  }
  const exit = world.exits[0];
  players.forEach((p) => put(p, { x: exit.tx * TILE + 8, y: exit.ty * TILE + 8 }));
  step(world, players);
  return world;
}
for (const level of levels) {
  for (let n = 2; n <= 4; n++) {
    const world = playThrough(level, n);
    const g = goalProgress(world);
    check(`${level.id} can be won with ${n} players`, world.won, `(goal ${g.have}/${g.need})`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
