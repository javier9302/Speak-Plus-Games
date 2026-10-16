// The solver: can this mission be finished with these abilities?
//
// It plays the zone the way a perfect team would, without positions or time: who can walk
// where, who can reach what, and which ability moves the puzzle forward. It repeats until
// the goal is reached or nothing more can be done. Nothing in the game destroys progress,
// so this is enough to prove there is no dead end.
//
// Used by `npm run check` (every zone and mission template, 2 to 6 players), and by the
// server before a mission starts and before abilities are reshuffled.
//
// It follows the same rules as the game: each kind's file in server/kinds/ (its actions, what blocks
// the way, what it needs). A new kind needs nothing here.
import { buildThings } from './things.js';
import { kindOf, abilityOf, progressOf } from './kinds/index.js';
import { goalOf } from './goals/index.js';
import { clueTokens, isKnown } from './codes.js';

const NAMES = { look: 'Look', read: 'Read', talk: 'Talk', listen: 'Listen', pickup: 'Pick up', give: 'Give', open: 'Open', close: 'Close', jump: 'Jump', push: 'Push', use: 'Use', fix: 'Fix' };

// sets: one list of abilities per player. without: abilities to pretend nobody has.
// explore: keep going after the goal is reached, to see everything a team can get to (npm run check).
// skipClues: clues ("<object id>:<ability>") nobody gets to read, to find out which clues a mission cannot do without.
export function solve(zone, mission, sets, { without = [], explore = false, skipClues = null } = {}) {
  const n = sets.length;
  const has = (i, a) => sets[i].includes(a) && !without.includes(a);
  const owners = (a) => sets.map((s, i) => i).filter((i) => has(i, a));
  const things = buildThings(zone, mission.stations.map((s) => s.at));
  const byId = Object.fromEntries(things.map((t) => [t.id, t]));
  const pool = [];                       // items picked up: { item, holder }
  const clues = new Set();               // "thing:ability" found
  const used = new Set(), log = [];
  let done = false;

  const key = (x, y) => `${x},${y}`;
  const ground = (x, y) => x >= 0 && y >= 0 && x < zone.w && y < zone.h && !zone.solidTiles.has(zone.rows[y][x]) && !zone.fixed.has(key(x, y));
  const starts = zone.spawns.map((s) => [Math.floor(s.x), Math.floor(s.y)]);

  // Where each player can walk. A plate lets the *other* players through its gap or gate
  // while one player stands on it, so the regions depend on each other: compute until stable.
  function regions() {
    let regs = sets.map(() => new Set());
    for (let round = 0; round < 6; round++) {
      const at = new Map(things.map((t) => [key(t.x, t.y), t]));
      const flooded = new Set(things.flatMap((t) => (kindOf(t).floods?.(t) || []).map((f) => key(f.x, f.y))));
      // Held open: somebody else stands on a plate (any kind with holdsOpen) that targets it.
      const held = (i, t) => things.some((p) => kindOf(p).holdsOpen?.(p) === t.id && regs.some((r, j) => j !== i && r.has(key(p.x, p.y))))
        // A lever: somebody else with its ability can get to it and pull it while player i waits at the door.
        || things.some((p) => kindOf(p).opens?.(p) === t.id && owners(kindOf(p).opensWith(p)).some((j) => j !== i && reach(regs, j, p)));
      const s = { has, held };
      const free = (i, x, y) => {
        if (!ground(x, y) || flooded.has(key(x, y))) return false;
        const t = at.get(key(x, y));
        if (!t) return true;
        const k = kindOf(t);
        return k.pass ? k.pass(t, i, s) : !k.solid(t) || (!!k.holdable && held(i, t));
      };
      const next = sets.map((s, i) => {
        const seen = new Set(), todo = starts.map((p) => [...p]);
        while (todo.length) {
          const [x, y] = todo.pop();
          if (seen.has(key(x, y)) || !free(i, x, y)) continue;
          seen.add(key(x, y));
          todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
          const to = zone.links?.get(key(x, y));                  // an exit to another map (atlas.js)
          if (to) todo.push([to.x, to.y]);
        }
        return seen;
      });
      const same = next.every((r, i) => r.size === regs[i].size);
      regs = next;
      if (same) break;
    }
    return regs;
  }
  // A player reaches a thing from any of the 8 tiles around it.
  const reach = (regs, i, t) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && regs[i].has(key(t.x + dx, t.y + dy))) return true; return false; };
  // An item is in the pocket of whoever picked it up. It gets to another player only if the holder has Give.
  const canGet = (i, item) => pool.some((it) => it.item === item && (it.holder === i || has(it.holder, 'give')));
  const take = (i, item) => { const k = pool.findIndex((it) => it.item === item && (it.holder === i || has(it.holder, 'give'))); if (pool[k].holder !== i) used.add('give'); return pool.splice(k, 1)[0]; };
  const ctx = { byId: (id) => byId[id] || null, itemName: (id) => id };
  // What an action needs, besides a player with its ability who can get there.
  const allowed = (step, t, i) => {
    if (step.needs?.item) return canGet(i, step.needs.item(t));
    if (step.needs?.code) return codeKnown(t);
    if (step.needs?.card) {
      const courier = mission.stations.find((s) => s.at === t.id)?.filter?.type === 'courier';   // a letter needs somebody to carry it, and a second player
      return !courier || (owners('give').length > 0 && n >= 2);
    }
    return true;
  };
  // A code is known when the clues found so far give every piece of its answer (codes.js).
  const codeKnown = (t) => {
    const found = new Set();
    for (const c of things) for (const [a, text] of Object.entries(c.def.clues || {})) if (clues.has(`${c.id}:${a}`)) for (const k of clueTokens(text)) found.add(k);
    return isKnown(t.def, t.id, found, zone.logic);
  };

  // Where something with no abilities can walk from `tiles` (a character that follows a player): it cannot
  // jump or swim, but a plate that any player stands on lets it through. Its own tile counts as free.
  function walkFrom(tiles) {
    const at = new Map(things.map((t) => [key(t.x, t.y), t]));
    const flooded = new Set(things.flatMap((t) => (kindOf(t).floods?.(t) || []).map((f) => key(f.x, f.y))));
    const held = (t) => things.some((p) => kindOf(p).holdsOpen?.(p) === t.id && (s.regs || []).some((r) => r.has(key(p.x, p.y))));
    const ns = { has: () => false, held: (i, t) => held(t) };
    const start = new Set(tiles.map(([x, y]) => key(x, y)));
    const free = (x, y) => {
      if (start.has(key(x, y))) return true;
      if (!ground(x, y) || flooded.has(key(x, y))) return false;
      const t = at.get(key(x, y));
      if (!t) return true;
      const k = kindOf(t);
      return k.pass ? k.pass(t, -1, ns) : !k.solid(t) || (!!k.holdable && held(t));
    };
    const seen = new Set(), todo = tiles.map((p) => [...p]);
    while (todo.length) {
      const [x, y] = todo.pop();
      if (seen.has(key(x, y)) || !free(x, y)) continue;
      seen.add(key(x, y));
      todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      const to = zone.links?.get(key(x, y));                      // it follows its leader through exits
      if (to) todo.push([to.x, to.y]);
    }
    return seen;
  }
  // What a goal type's solver part may use (server/goals/<type>.js, "solver").
  const s = { mission, things, byId, pool, used, log, clues, owners, has, canGet, take, key, zone, regs: null, regions, walkFrom,
    reach: (i, t) => reach(s.regs, i, t) };
  const goal = goalOf(mission.goal).solver(s);

  for (let turn = 0; turn < 400 && !done; turn++) {
    const regs = regions();
    s.regs = regs;
    let progress = false;
    // The owner of ability `a` does something to thing `t`, if they can get to it (and `ok` agrees).
    const act = (a, t, what, effect, ok = () => true) => {
      for (const i of owners(a)) {
        if (!reach(regs, i, t) || !ok(i)) continue;
        effect(i); used.add(a); log.push(`${NAMES[a]}: ${what}`); progress = true;
        return true;
      }
      return false;
    };
    for (const t of things) {
      for (const a of Object.keys(t.def.clues || {})) if (!clues.has(`${t.id}:${a}`) && !skipClues?.has(`${t.id}:${a}`)) act(a, t, `clue on the ${t.name.toLowerCase()}`, () => clues.add(`${t.id}:${a}`));
      // The kind's next step forward, done the way the game does it.
      const step = progressOf(t);
      if (!step) continue;
      const what = step.log ? step.log(t) : step.gives ? `the ${t.holds} from the ${t.name.toLowerCase()}` : `the ${t.name.toLowerCase()}`;
      act(abilityOf(step, t), t, what, (i) => {
        if (step.gives) pool.push({ item: t.holds, holder: i });
        if (step.needs?.item) { const it = take(i, step.needs.item(t)); if (step.needs.keep) pool.push({ ...it, holder: i }); }
        step.do(t, ctx);
      }, (i) => allowed(step, t, i));
    }
    // Things that settle by themselves once players are in place (players standing on plates).
    for (const t of things) { const did = kindOf(t).settle?.(t, { regs, byId }); if (did) { log.push(`Stand: ${did}`); progress = true; } }
    // Abilities used just by walking somewhere (jumping over a gap).
    for (const t of things) for (const a of kindOf(t).markUsed?.(t, { owners, regs }) || []) used.add(a);

    // The goal type's own steps (delivering, escorting...), then: is it reached?
    if (goal.step?.()) progress = true;
    if (!explore && goal.done()) done = true;
    if (!progress && !done) break;
  }

  // Not finished: say what is in the way, in words a teacher can use.
  const problems = [];
  if (!done) {
    const regs = regions();
    const why = (a, t) => {
      const who = owners(a);
      if (!who.length) return `nobody has ${NAMES[a]}`;
      return who.some((i) => reach(regs, i, t)) ? null : `the player with ${NAMES[a]} cannot get to it`;
    };
    for (const t of things) {
      const name = `the ${t.name.toLowerCase()}`;
      for (const w of kindOf(t).stuck?.(t, { owners, regs }) || []) problems.push(`${name}: ${w}`);
      const step = progressOf(t);
      if (!step || !step.explain) continue;
      const a = abilityOf(step, t);
      const extra = step.needs?.item ? `the ${step.needs.item(t)} cannot get to the player with ${NAMES[a]}`
        : step.needs?.code ? 'the pieces of its code were not all found'
        : step.needs?.card ? 'it needs a player with Give to carry its letter' : null;
      const w = why(a, t) || extra;
      if (w) problems.push(`${name}: ${w}`);
    }
    s.regs = regions();
    problems.push(...goal.why(problems));
  }
  return { ok: done, used, log, problems, things, clues };
}

// For the server: a short reason, or null if the mission can be finished.
export function whyNot(zone, mission, sets) {
  const r = solve(zone, mission, sets);
  return r.ok ? null : r.problems.slice(0, 3).join('; ');
}

// The design rules, for one mission and one way of sharing the abilities.
//   required: abilities without which the mission cannot be finished
//   idle:     players (by index) who have no required ability
export function inspect(zone, mission, sets, abilityIds) {
  const base = solve(zone, mission, sets);
  if (!base.ok) return { ok: false, problems: base.problems, required: [], unused: [], idle: [], log: base.log };
  const required = abilityIds.filter((a) => !solve(zone, mission, sets, { without: [a] }).ok);
  return {
    ok: true, problems: [], log: base.log, required,
    unused: abilityIds.filter((a) => !base.used.has(a)),
    idle: sets.map((s, i) => i).filter((i) => !sets[i].some((a) => required.includes(a))),
  };
}

// The design rules of a zone, checked on the mission that uses everything in it.
//   Handshake rule: every obstacle needs abilities from at least two different players. An
//     obstacle "needs" an ability if, without it, the team never gets past that obstacle
//     (so the rock in front of a chest counts for the chest).
//   Pressure-plate rule: whoever jumps a gap can let the others follow.
export function zoneRules(zone, mission, sets, abilityIds) {
  const out = [];
  const owner = (a) => sets.findIndex((s) => s.includes(a));
  const passed = (t) => kindOf(t).passed?.(t);
  const base = solve(zone, mission, sets);
  const without = Object.fromEntries(abilityIds.map((a) => [a, solve(zone, mission, sets, { without: [a] }).things]));
  for (const t of base.things) {
    const rule = kindOf(t).rules?.(t, base.things);
    if (rule) out.push(rule);
    if (passed(t) === undefined) continue;
    if (!passed(t)) { out.push(`${t.name}: the team never gets past it`); continue; }
    const needs = abilityIds.filter((a) => !passed(without[a].find((x) => x.id === t.id)));
    if (new Set(needs.map(owner)).size < 2) out.push(`${t.name}: one player can do it alone (${needs.map((a) => NAMES[a]).join(', ') || 'no ability needed'})`);
  }
  return out;
}
