// The room: tiles, pickups, chest and machine, switches, gates and the exit.
// No drawing and no browser APIs in here, so the rules can be tested in node.

import { PICKUP_CHARS, STATIONS } from './levels.js';
import { NEAR, newGateState, participants, missingForStart, doTransfers } from './trade.js';
import { fmt, dist, joinNames } from './util.js';

export const TILE = 16;
const SPEED = 62;        // pixels per second
const HALF = 5;          // half the player's collision box
const PICKUP_REACH = 14;
const STATION_REACH = 24;

export function createWorld(level, players, settings, text) {
  const world = {
    level, settings, text,
    w: level.map[0].length,
    h: level.map.length,
    tiles: level.map.map((row) => row.split('')),
    pickups: [], gates: [], stations: [], plates: [], bars: [], doors: [], exits: [],
    barsOpen: false, switchT: 0, switchSecond: 0,
    doorOpen: false, won: false,
    activeGate: null,
    floats: [],          // short messages that drift up: { x, y, text, color, t }
    events: [],          // sound names, emptied by main.js every frame
    stats: { time: 0, trades: 0, hints: 0, bonus: 0 },
    byId: Object.fromEntries(players.map((p) => [p.id, p])),
  };

  const spawns = [];
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      const c = world.tiles[ty][tx];
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      let floor = true;
      if (PICKUP_CHARS[c]) {
        world.pickups.push({ res: PICKUP_CHARS[c], x, y, taken: false, timer: 0 });
      } else if (/[1-9]/.test(c)) {
        const def = level.gates.find((g) => g.char === c);
        if (def) world.gates.push({ def, x, y, tx, ty, ...newGateState() });
      } else if (c === STATIONS.chest || c === STATIONS.machine) {
        const kind = c === STATIONS.chest ? 'chest' : 'machine';
        const needs = level.goal[kind];
        if (needs) {
          const have = Object.fromEntries(Object.keys(needs).map((r) => [r, 0]));
          world.stations.push({ kind, x, y, tx, ty, needs, have });
          floor = false;
        }
      } else if (c === 'S') world.plates.push({ x, y, tx, ty, down: false });
      else if (c === 'B') { world.bars.push({ tx, ty }); floor = false; }
      else if (c === 'X') { world.doors.push({ tx, ty }); floor = false; }
      else if (c === 'E') world.exits.push({ tx, ty });
      else if (c === 'p') spawns.push({ x, y });
      else if (c === '#') floor = false;
      if (floor) world.tiles[ty][tx] = '.';
    }
  }

  world.gates.sort((a, b) => a.def.number - b.def.number);

  players.forEach((p, i) => {
    const s = spawns[i % Math.max(1, spawns.length)] || { x: 24, y: 24 };
    Object.assign(p, { x: s.x, y: s.y, ready: null, moving: false, walk: 0, face: 1 });
    p.inv = Object.fromEntries(Object.values(PICKUP_CHARS).map((r) => [r, 0]));
  });
  return world;
}

export function isSolid(world, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return true;
  const c = world.tiles[ty][tx];
  if (c === '.') return false;
  if (c === 'B') return !world.barsOpen;
  if (c === 'X') return !world.doorOpen;
  return true; // walls, chest, machine
}

function blocked(world, x, y) {
  const e = HALF - 0.01;
  for (const [cx, cy] of [[x - e, y - e], [x + e, y - e], [x - e, y + e], [x + e, y + e]]) {
    if (isSolid(world, Math.floor(cx / TILE), Math.floor(cy / TILE))) return true;
  }
  return false;
}

const stationFull = (s) => Object.keys(s.needs).every((r) => s.have[r] >= s.needs[r]);

export function goalProgress(world) {
  let have = 0, need = 0;
  for (const s of world.stations) {
    for (const r of Object.keys(s.needs)) { have += Math.min(s.have[r], s.needs[r]); need += s.needs[r]; }
  }
  return { have, need };
}

function say(world, p, key, vars) {
  world.floats.push({ x: p.x, y: p.y - 16, text: fmt(world.text[key], vars), color: '#f4f4f4', t: 2.5 });
}

function nearest(list, p, reach) {
  let best = null, bestD = reach;
  for (const item of list) {
    const d = dist(item, p);
    if (d <= bestD) { best = item; bestD = d; }
  }
  return best;
}

// A button: pick up what is here, or put something into the chest / machine.
function interact(world, players, p) {
  const pickup = nearest(world.pickups.filter((k) => !k.taken), p, PICKUP_REACH);
  if (pickup) {
    if (p.collects === pickup.res) {
      pickup.taken = true;
      pickup.timer = world.settings.pickupRespawnSeconds;
      p.inv[pickup.res]++;
      world.events.push('pickup');
    } else {
      const who = players.find((q) => q.collects === pickup.res);
      say(world, p, 'cantCollect', { who: who ? who.name : '?', res: pickup.res });
      world.events.push('deny');
    }
    return;
  }

  const station = nearest(world.stations.filter((s) => !stationFull(s)), p, STATION_REACH);
  if (!station) return;
  const wanted = Object.keys(station.needs).filter((r) => station.have[r] < station.needs[r]);
  if (wanted.includes(p.spends)) {
    if (p.inv[p.spends] > 0) {
      p.inv[p.spends]--;
      station.have[p.spends]++;
      world.events.push(stationFull(station) ? 'full' : 'deposit');
    } else {
      say(world, p, 'needRes', { res: p.spends });
      world.events.push('deny');
    }
  } else {
    const who = players.find((q) => q.spends === wanted[0]);
    say(world, p, 'cantSpend', { who: who ? who.name : '?', res: wanted[0] });
    world.events.push('deny');
  }
}

// B button: "I'm ready to trade" at the nearest gate (press again to cancel).
function ask(world, p) {
  const gate = nearest(world.gates, p, NEAR);
  if (!gate) return;
  const people = participants(gate.def);
  if (!people.includes(p.id)) {
    const names = people.map((id) => world.byId[id]?.name).filter(Boolean);
    say(world, p, 'gateNotYours', { who: joinNames(names) });
    world.events.push('deny');
    return;
  }
  p.ready = p.ready === gate.def.id ? null : gate.def.id;
  world.events.push('ask');
}

function updateGates(world, players) {
  for (const gate of world.gates) {
    const id = gate.def.id;
    const ready = (pid) => world.byId[pid] && world.byId[pid].ready === id;

    if (gate.status === 'locked') {
      const people = participants(gate.def);
      if (!people.length || !people.every(ready)) continue;
      people.forEach((pid) => { world.byId[pid].ready = null; });
      const missing = missingForStart(gate.def, world.byId);
      if (missing.length) {
        const m = missing[0];
        world.floats.push({
          x: gate.x, y: gate.y - 14, t: 3, color: '#ffcd75',
          text: fmt(world.text.needFirst, { who: world.byId[m.player].name, n: m.need, res: m.res }),
        });
        world.events.push('deny');
      } else {
        gate.status = 'active';
        gate.entry = '';
        gate.picked = 0;
        world.activeGate = gate;
        world.events.push('gate');
      }
    } else if (gate.status === 'open') {
      // Unlocked gate: each pair that is ready trades straight away.
      const pairs = gate.def.transfers.filter((t) => ready(t.from) && ready(t.to));
      if (!pairs.length) continue;
      const moved = doTransfers(gate.def, world.byId, (t) => pairs.includes(t));
      pairs.forEach((t) => { world.byId[t.from].ready = null; world.byId[t.to].ready = null; });
      if (moved > 0) world.stats.trades++;
      world.events.push(moved > 0 ? 'trade' : 'deny');
      world.floats.push({
        x: gate.x, y: gate.y - 14, t: 2.5, color: moved > 0 ? '#a7f070' : '#ffcd75',
        text: moved > 0 ? world.text.traded : world.text.nothingToTrade,
      });
    }
  }
}

// One step of the room. `inputs[i]` belongs to `players[i]`:
//   { move: { x, y }, pressed: { a, b } }
export function updateWorld(world, players, inputs, dt) {
  players.forEach((p, i) => {
    const input = inputs[i];
    let { x: mx, y: my } = input.move;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    p.moving = len > 0.01;
    if (p.moving) {
      p.walk += dt;
      if (mx) p.face = mx > 0 ? 1 : -1;
      const nx = p.x + mx * SPEED * dt;
      if (!blocked(world, nx, p.y)) p.x = nx;
      const ny = p.y + my * SPEED * dt;
      if (!blocked(world, p.x, ny)) p.y = ny;
    }
    if (p.ready) {
      const gate = world.gates.find((g) => g.def.id === p.ready);
      if (!gate || dist(gate, p) > NEAR) p.ready = null; // walked away
    }
    if (input.pressed.a) interact(world, players, p);
    if (input.pressed.b) ask(world, p);
  });

  for (const k of world.pickups) {
    if (k.taken && (k.timer -= dt) <= 0) k.taken = false;
  }

  // Two-person switch: two different players on two plates, held together.
  if (world.plates.length && !world.barsOpen) {
    for (const plate of world.plates) {
      plate.down = players.some((p) => Math.floor(p.x / TILE) === plate.tx && Math.floor(p.y / TILE) === plate.ty);
    }
    if (world.plates.filter((pl) => pl.down).length >= 2) {
      world.switchT += dt;
      if (Math.floor(world.switchT) !== world.switchSecond) {
        world.switchSecond = Math.floor(world.switchT);
        world.events.push('tick');
      }
      if (world.switchT >= world.settings.switchHoldSeconds) {
        world.barsOpen = true;
        world.events.push('door');
        const b = world.bars[0];
        if (b) world.floats.push({ x: b.tx * TILE + 8, y: b.ty * TILE - 6, text: world.text.barsOpen, color: '#a7f070', t: 2.5 });
      }
    } else {
      world.switchT = 0;
      world.switchSecond = 0;
    }
  }

  updateGates(world, players);

  if (!world.doorOpen && world.stations.every(stationFull)) {
    world.doorOpen = true;
    world.events.push('door');
  }
  if (world.doorOpen && world.exits.length) {
    const onExit = (p) => world.exits.some((e) => e.tx === Math.floor(p.x / TILE) && e.ty === Math.floor(p.y / TILE));
    if (players.every(onExit)) { world.won = true; world.events.push('win'); }
  }

  updateFloats(world, dt);
}

export function updateFloats(world, dt) {
  for (const f of world.floats) { f.t -= dt; f.y -= 6 * dt; }
  world.floats = world.floats.filter((f) => f.t > 0);
}
