// Loading level data, adapting a level to the number of players, and checking it.
//
// MAP LEGEND (each row is a string, one character per 16x16 tile)
//   #  wall            .  floor            p  player start (put 4 in every map)
//   o  gold   w  wood   d  gems   k  gears   (pickups)
//   1-9  Trade Gate (1 = first gate in "gates", 2 = second, ...)
//   C  chest (needs goal.chest)      M  machine (needs goal.machine)
//   S  two-person switch plate       B  bars opened by the switch
//   X  exit door (opens when the goal is complete)     E  exit pad

export const PICKUP_CHARS = { o: 'gold', w: 'wood', d: 'gems', k: 'gears' };
const CHAR_OF = Object.fromEntries(Object.entries(PICKUP_CHARS).map(([c, r]) => [r, c]));
export const STATIONS = { chest: 'C', machine: 'M' };

async function loadJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json();
}

export async function loadAll(base = 'data/') {
  const config = await loadJSON(`${base}config.json`);
  const levels = await Promise.all(config.levels.map((id) => loadJSON(`${base}levels/${id}.json`)));
  return { config, levels };
}

// A gate may be written the short way (from / to / give) or with a list of
// "transfers" for trades between more than two players. Either way we end up
// with a flat list: [{ from, to, res, amount }].
export function normalizeGate(gate, index) {
  const raw = gate.transfers || [{ from: gate.from, to: gate.to, give: gate.give }];
  const transfers = [];
  for (const t of raw) {
    for (const [res, amount] of Object.entries(t.give || {})) {
      transfers.push({ from: t.from, to: t.to, res, amount });
    }
  }
  return { ...gate, char: gate.char || String(index + 1), number: index + 1, transfers };
}

// Returns the level as it will be played with `count` players.
//  - If the level has "variants": { "3": {...} } for this count, those fields win.
//  - If there are fewer players than the level was made for, players and
//    resources are folded onto the smaller circle (P3 -> P1, gems -> gold with
//    two players, and so on). Trades that would go from a player to themselves
//    disappear, and so do gates left with nothing to trade.
export function resolveLevel(level, count, order) {
  const variant = level.variants && level.variants[count];
  let lv = level;
  if (variant) {
    lv = { ...level, ...variant, players: count };
    // "gates" in a variant may be a full list, or { "g2": { ...changes } }.
    if (variant.gates && !Array.isArray(variant.gates)) {
      lv.gates = level.gates.map((g) => {
        const change = variant.gates[g.id];
        if (!change) return g;
        const merged = { ...g, ...change, card: { ...g.card, ...change.card } };
        if (change.transfers) { delete merged.from; delete merged.to; delete merged.give; }
        return merged;
      });
    }
  }
  const authored = lv.players;

  let gates = lv.gates.map(normalizeGate);
  let map = lv.map.slice();
  let goal = JSON.parse(JSON.stringify(lv.goal || {}));

  if (count < authored) {
    const foldP = (id) => `P${((Number(id.slice(1)) - 1) % count) + 1}`;
    const foldR = (r) => order[order.indexOf(r) % count];

    gates = gates
      .map((g) => {
        const merged = new Map();
        for (const t of g.transfers) {
          const from = foldP(t.from), to = foldP(t.to), res = foldR(t.res);
          if (from === to) continue;
          const key = `${from}>${to}>${res}`;
          const prev = merged.get(key);
          if (prev) prev.amount += t.amount;
          else merged.set(key, { from, to, res, amount: t.amount });
        }
        const transfers = [...merged.values()];
        const people = [...new Set(transfers.flatMap((t) => [t.from, t.to]))];
        const card = { ...g.card };
        for (const [a, b] of [['asker', 'answerer'], ['describer', 'picker']]) {
          if (!card[a]) continue;
          card[a] = foldP(card[a]);
          card[b] = foldP(card[b]);
          if (card[a] === card[b]) card[b] = people.find((p) => p !== card[a]) || card[b];
        }
        return { ...g, transfers, card };
      })
      .filter((g) => g.transfers.length > 0);

    map = map.map((row) => row.replace(/[owdk]/g, (c) => CHAR_OF[foldR(PICKUP_CHARS[c])]));

    for (const station of Object.keys(goal)) {
      const folded = {};
      for (const [res, n] of Object.entries(goal[station])) {
        folded[foldR(res)] = (folded[foldR(res)] || 0) + n;
      }
      goal[station] = folded;
    }
  }

  return { ...lv, map, goal, gates, authoredPlayers: authored, playedWith: count };
}

// Returns a list of problems (empty = fine). Used by the tests and shown in
// the browser console, so a typo in a level file is easy to find.
export function validateLevel(level, roles) {
  const problems = [];
  const role = Object.fromEntries(roles.map((r) => [r.id, r]));
  const width = level.map[0].length;
  level.map.forEach((row, i) => {
    if (row.length !== width) problems.push(`map row ${i} has ${row.length} tiles, expected ${width}`);
  });
  const all = level.map.join('');
  const countOf = (c) => all.split(c).length - 1;
  if (countOf('p') < roles.length) problems.push(`needs at least ${roles.length} player starts (p)`);
  if (countOf('E') < 1) problems.push('needs an exit pad (E)');

  const codes = new Set();
  for (const g of level.gates) {
    if (!all.includes(g.char)) problems.push(`gate ${g.id}: "${g.char}" is not on the map`);
    for (const t of g.transfers) {
      if (!role[t.from] || !role[t.to]) { problems.push(`gate ${g.id}: unknown player`); continue; }
      if (role[t.from].collects !== t.res) problems.push(`gate ${g.id}: ${t.from} does not collect ${t.res}`);
      if (role[t.to].spends !== t.res) problems.push(`gate ${g.id}: ${t.to} cannot spend ${t.res}`);
    }
    const code = g.teacher && g.teacher.code;
    if (!/^\d{3,6}$/.test(code || '')) problems.push(`gate ${g.id}: code must be 3 to 6 digits`);
    if (codes.has(code)) problems.push(`gate ${g.id}: code ${code} is used twice`);
    codes.add(code);
    if (!g.teacher || (g.teacher.hints || []).length !== 3) problems.push(`gate ${g.id}: needs 3 hints`);
    if (g.type === 'describe' && !(g.card.options || [])[g.card.target]) {
      problems.push(`gate ${g.id}: target is not one of the options`);
    }
  }

  for (const [station, needs] of Object.entries(level.goal)) {
    if (!STATIONS[station]) { problems.push(`unknown goal "${station}"`); continue; }
    if (!all.includes(STATIONS[station])) problems.push(`goal.${station} is set but "${STATIONS[station]}" is not on the map`);
    for (const res of Object.keys(needs)) {
      if (!all.includes(CHAR_OF[res])) problems.push(`goal needs ${res} but the map has none`);
      if (!level.gates.some((g) => g.transfers.some((t) => t.res === res))) {
        problems.push(`goal needs ${res} but no gate trades it`);
      }
    }
  }
  return problems;
}
