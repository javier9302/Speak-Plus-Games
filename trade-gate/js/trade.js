// Trade Gates: the only way a resource can move from one player to another.
//
// A gate goes through three states:
//   locked -> active (card on screen, waiting for the teacher's code) -> open
// To start a locked gate, everyone in the trade stands at it and presses Ask,
// and each giver must hold at least the "give" amount.
// When the code is entered, each giver hands over ALL they hold of that
// resource. The gate then stays open: pressing Ask there again trades with no
// new question.

import { fmt } from './util.js';

export const NEAR = 28; // pixels: how close counts as "at the gate"

// On-screen number pad for controllers. "<" = delete, "C" = clear.
export const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['<', '0', 'C'],
];

export function newGateState() {
  return {
    status: 'locked',
    hints: 0,          // how many hints the teacher has released (0-3)
    entry: '',         // digits typed so far
    wrong: 0,          // wrong codes (for the shake effect)
    shake: 0,
    cursor: { x: 1, y: 1 },
    picked: 0,         // describe gates: option under the cursor
    pickOk: false,     // describe gates: the right card was chosen
    pickMsg: 0,        // seconds left to show "not that one"
    peek: false,       // describe gates: secret card is showing
  };
}

// Everyone who gives or receives at this gate.
export function participants(def) {
  return [...new Set(def.transfers.flatMap((t) => [t.from, t.to]))];
}

// Givers who do not hold enough yet: [{ player, res, need, have }]
export function missingForStart(def, byId) {
  return def.transfers
    .map((t) => ({ player: t.from, res: t.res, need: t.amount, have: byId[t.from]?.inv[t.res] ?? 0 }))
    .filter((m) => m.have < m.need);
}

// Move everything the giver holds. `only` can limit which transfers happen.
export function doTransfers(def, byId, only = () => true) {
  let moved = 0;
  for (const t of def.transfers) {
    const from = byId[t.from], to = byId[t.to];
    if (!from || !to || !only(t)) continue;
    const n = from.inv[t.res];
    from.inv[t.res] = 0;
    to.inv[t.res] += n;
    moved += n;
  }
  return moved;
}

export function completeGate(world, gate) {
  doTransfers(gate.def, world.byId);
  gate.status = 'open';
  gate.entry = '';
  if (world.activeGate === gate) world.activeGate = null;
  world.stats.trades++;
  world.events.push('trade');
  world.floats.push({ x: gate.x, y: gate.y - 14, text: world.text.traded, color: '#a7f070', t: 2.5 });
}

// Teacher "skip": close the card without trading. Hints stay released.
export function cancelGate(world) {
  const gate = world.activeGate;
  if (!gate) return;
  gate.status = 'locked';
  gate.entry = '';
  gate.pickOk = false;
  world.activeGate = null;
}

export function releaseHint(world, gate, n) {
  const max = gate.def.teacher.hints.length;
  n = Math.min(n, max);
  if (n <= gate.hints) return;
  world.stats.hints += n - gate.hints;
  gate.hints = n;
  world.events.push('hint');
  if (world.settings.hintCostsResource) {
    // The cost comes out of what the first giver is holding.
    const t = gate.def.transfers[0];
    const giver = world.byId[t.from];
    if (giver && giver.inv[t.res] > 0) {
      giver.inv[t.res]--;
      world.floats.push({
        x: gate.x, y: gate.y - 14, t: 3, color: '#ffcd75',
        text: fmt(world.text.hintCost, { res: t.res }),
      });
    }
  }
}

function pressKey(world, gate, key) {
  const code = gate.def.teacher.code;
  if (key === '<') gate.entry = gate.entry.slice(0, -1);
  else if (key === 'C') gate.entry = '';
  else if (gate.entry.length < code.length) gate.entry += key;
  world.events.push('key');
  if (gate.entry.length < code.length) return;
  if (gate.entry === code) {
    completeGate(world, gate);
  } else {
    gate.entry = '';
    gate.wrong++;
    gate.shake = 0.5;
    world.events.push('deny');
  }
}

// Runs every frame while a gate card is on screen.
//   inputs: one entry per player (same order as players): { nav, pressed, down }
//   keys:   { digits: ['4', '8'], backspace: bool } typed on the keyboard
export function updateGateUI(world, players, inputs, keys, dt) {
  const gate = world.activeGate;
  const def = gate.def;
  gate.shake = Math.max(0, gate.shake - dt);
  gate.pickMsg = Math.max(0, gate.pickMsg - dt);

  if (def.type === 'describe' && !gate.pickOk) {
    const idx = (id) => players.findIndex((p) => p.id === id);
    const describer = inputs[idx(def.card.describer)];
    const picker = inputs[idx(def.card.picker)];
    gate.peek = !!(describer && describer.down.a);
    if (picker && !gate.peek) {
      const n = def.card.options.length;
      if (picker.nav.x) {
        gate.picked = (gate.picked + picker.nav.x + n) % n;
        world.events.push('key');
      }
      if (picker.pressed.a) {
        if (gate.picked === def.card.target) {
          gate.pickOk = true;
          world.events.push('pickOk');
        } else {
          gate.pickMsg = 2.5;
          world.events.push('deny');
        }
      }
    }
    return;
  }

  // Code entry: any player may move the cursor and press keys.
  gate.peek = false;
  for (const input of inputs) {
    if (input.nav.x) gate.cursor.x = Math.max(0, Math.min(2, gate.cursor.x + input.nav.x));
    if (input.nav.y) gate.cursor.y = Math.max(0, Math.min(3, gate.cursor.y + input.nav.y));
    if (input.pressed.a && world.activeGate === gate) {
      pressKey(world, gate, KEYPAD[gate.cursor.y][gate.cursor.x]);
    }
  }
  for (const d of keys.digits) if (world.activeGate === gate) pressKey(world, gate, d);
  if (keys.backspace && world.activeGate === gate) pressKey(world, gate, '<');
}
