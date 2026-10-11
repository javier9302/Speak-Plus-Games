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
// It follows the same rules as things.js. If you add a kind of object there, add it here.
import { buildThings } from './things.js';

const TERRAIN_SOLID = new Set(['~', 'T', 'R']);
const NAMES = { look: 'Look', read: 'Read', talk: 'Talk', listen: 'Listen', pickup: 'Pick up', give: 'Give', open: 'Open', close: 'Close', jump: 'Jump', push: 'Push', use: 'Use', fix: 'Fix' };

// sets: one list of abilities per player. without: abilities to pretend nobody has.
export function solve(zone, mission, sets, { without = [] } = {}) {
  const n = sets.length;
  const has = (i, a) => sets[i].includes(a) && !without.includes(a);
  const owners = (a) => sets.map((s, i) => i).filter((i) => has(i, a));
  const things = buildThings(zone, mission.stations.map((s) => s.at));
  const byId = Object.fromEntries(things.map((t) => [t.id, t]));
  const [goalItem, need] = Object.entries(mission.goal.items)[0];
  const pool = [];                       // items picked up: { item, holder }
  const clues = new Set();               // "thing:ability" found
  const used = new Set(), log = [];
  let done = false;

  const key = (x, y) => `${x},${y}`;
  const ground = (x, y) => x >= 0 && y >= 0 && x < zone.w && y < zone.h && !TERRAIN_SOLID.has(zone.rows[y][x]) && !zone.fixed.has(key(x, y));
  const starts = zone.spawns.map((s) => [Math.floor(s.x), Math.floor(s.y)]);

  // Where each player can walk. A plate lets the *other* players through its gap or gate
  // while one player stands on it, so the regions depend on each other: compute until stable.
  function regions() {
    let regs = sets.map(() => new Set());
    for (let round = 0; round < 6; round++) {
      const at = new Map(things.map((t) => [key(t.x, t.y), t]));
      const flooded = new Set(things.filter((t) => t.kind === 'sluice' && t.st !== 'closed').flatMap((t) => t.def.floods.map((f) => key(f.x, f.y))));
      const held = (i, t) => things.some((p) => p.kind === 'plate' && p.def.target === t.id && regs.some((r, j) => j !== i && r.has(key(p.x, p.y))));
      const free = (i, x, y) => {
        if (!ground(x, y) || flooded.has(key(x, y))) return false;
        const t = at.get(key(x, y));
        if (!t || t.kind === 'plate') return true;
        if ((t.kind === 'item' && t.st === 'gone') || (t.kind === 'gate' && t.st === 'open') || (t.kind === 'gap' && t.st === 'fixed')) return true;
        if (t.kind === 'gap') return has(i, 'jump') || held(i, t);
        if (t.kind === 'gate') return held(i, t);
        return false;
      };
      const next = sets.map((s, i) => {
        const seen = new Set(), todo = starts.map((p) => [...p]);
        while (todo.length) {
          const [x, y] = todo.pop();
          if (seen.has(key(x, y)) || !free(i, x, y)) continue;
          seen.add(key(x, y));
          todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
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
  const codeKnown = (t) => Array.from({ length: t.def.code }, (_, d) => d + 1).every((d) => things.some((c) => Object.entries(c.def.clues || {}).some(([a, text]) => text.includes(`{d${d}}`) && clues.has(`${c.id}:${a}`))));

  for (let turn = 0; turn < 400 && !done; turn++) {
    const regs = regions();
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
    const pickup = (t) => act('pickup', t, `the ${t.holds} from the ${t.name.toLowerCase()}`, (i) => { pool.push({ item: t.holds, holder: i }); t.holds = null; if (t.kind === 'item') t.st = 'gone'; });

    for (const t of things) {
      for (const a of Object.keys(t.def.clues || {})) if (!clues.has(`${t.id}:${a}`)) act(a, t, `clue on the ${t.name.toLowerCase()}`, () => clues.add(`${t.id}:${a}`));
      const name = t.name.toLowerCase();
      if (t.kind === 'item' && t.st === 'here') pickup(t);
      else if (t.kind === 'boulder' && t.st === 'a') act('push', t, `the ${name}`, () => { t.st = 'b'; t.x = t.def.to.x; t.y = t.def.to.y; });
      else if (t.kind === 'chest') { if (t.st === 'closed') act('open', t, `the ${name}`, () => { t.st = 'open'; }); else if (t.holds) pickup(t); }
      else if (t.kind === 'gate' && t.st === 'locked') {
        if (t.def.code) act('use', t, `the code of the ${name}`, () => { t.st = 'closed'; }, () => codeKnown(t));
        else act('use', t, `the ${t.def.key || 'key'} on the ${name}`, (i) => { const it = take(i, t.def.key || 'key'); pool.push({ ...it, holder: i }); t.st = 'closed'; }, (i) => canGet(i, t.def.key || 'key'));
      } else if (t.kind === 'gate' && t.st === 'closed') act('open', t, `the ${name}`, () => { t.st = 'open'; });
      else if (t.kind === 'sluice' && t.st === 'broken') act('fix', t, `the ${name}`, (i) => { take(i, t.def.needs); t.st = 'open'; }, (i) => canGet(i, t.def.needs));
      else if (t.kind === 'sluice' && t.st === 'open') act('close', t, `the ${name}`, () => { t.st = 'closed'; });
      else if (t.kind === 'gap' && t.st === 'broken' && t.def.needs) act('fix', t, `the ${name}`, (i) => { take(i, t.def.needs); t.st = 'fixed'; }, (i) => canGet(i, t.def.needs));
      else if (t.kind === 'station' && t.st !== 'solved') {
        const entry = mission.stations.find((s) => s.at === t.id);
        const courier = entry?.filter?.type === 'courier';              // a letter needs somebody to carry it, and a second player
        act(t.def.by || 'use', t, `the ${name}`, () => { t.st = 'solved'; t.holds = t.def.reward?.item || null; if (t.def.reward?.open && byId[t.def.reward.open]) byId[t.def.reward.open].st = 'open'; }, () => !courier || (owners('give').length > 0 && n >= 2));
      } else if (t.kind === 'station' && t.holds) pickup(t);
    }
    // Jumping over a gap, and standing on a plate for the others, count as using Jump.
    for (const t of things) if (t.kind === 'gap' && t.st === 'broken') for (const i of owners('jump')) if (regs[i].has(key(t.x, t.y))) used.add('jump');

    // The goal: enough items, and (if the zone asks for it) one player carries them all to a character.
    if (pool.filter((it) => it.item === goalItem).length >= need) {
      const npc = byId[mission.goal.deliver];
      if (!npc) done = true;
      else for (const i of owners('talk')) {
        if (!reach(regs, i, npc) || !pool.filter((it) => it.item === goalItem).every((it) => it.holder === i || has(it.holder, 'give'))) continue;
        if (pool.some((it) => it.item === goalItem && it.holder !== i)) used.add('give');
        used.add('talk'); log.push(`Talk: the ${npc.name.toLowerCase()}, with the ${goalItem}s`); done = true;
        break;
      }
    }
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
      const say = (a, extra) => { const w = why(a, t) || extra; if (w) problems.push(`${name}: ${w}`); };
      if (t.kind === 'boulder' && t.st === 'a') say('push');
      if (t.kind === 'chest' && t.st === 'closed') say('open');
      if (t.kind === 'gate' && t.st === 'locked') say('use', t.def.code ? 'the numbers of its code were not all found' : `the ${t.def.key || 'key'} cannot get to the player with Use`);
      if (t.kind === 'gate' && t.st === 'closed') say('open');
      if (t.kind === 'sluice' && t.st === 'broken') say('fix', `the ${t.def.needs} cannot get to the player with Fix`);
      if (t.kind === 'sluice' && t.st === 'open') say('close');
      if (t.kind === 'gap' && t.st === 'broken' && !owners('jump').length) problems.push(`${name}: nobody has Jump`);
      if (t.kind === 'station' && t.st !== 'solved') say(t.def.by || 'use', 'it needs a player with Give to carry its letter');
      if ((t.kind === 'station' || t.kind === 'chest' || t.kind === 'item') && t.holds && (t.kind !== 'chest' || t.st === 'open') && (t.kind !== 'station' || t.st === 'solved')) say('pickup');
    }
    const have = pool.filter((it) => it.item === goalItem).length;
    if (have >= need) problems.push(`the ${goalItem}s cannot be carried to the ${byId[mission.goal.deliver]?.name.toLowerCase()}: ${!owners('talk').length ? 'nobody has Talk' : !owners('give').length ? 'the player with Talk is not the one who picks them up, and nobody has Give' : 'the player with Talk cannot get there'}`);
    else if (!problems.length) problems.push(`only ${have} of ${need} ${goalItem}s can be collected`);
  }
  return { ok: done, used, log, problems, things };
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
  const passed = (t) => ({ chest: t.st === 'open' && !t.holds, gate: t.st === 'open', sluice: t.st === 'closed', station: t.st === 'solved' && !t.holds }[t.kind]);
  const base = solve(zone, mission, sets);
  const without = Object.fromEntries(abilityIds.map((a) => [a, solve(zone, mission, sets, { without: [a] }).things]));
  for (const t of base.things) {
    if (t.kind === 'gap' && !t.def.needs && !base.things.some((p) => p.kind === 'plate' && p.def.target === t.id)) out.push(`${t.name}: only a jumper can cross, and there is no plate that lets the others follow`);
    if (passed(t) === undefined) continue;
    if (!passed(t)) { out.push(`${t.name}: the team never gets past it`); continue; }
    const needs = abilityIds.filter((a) => !passed(without[a].find((x) => x.id === t.id)));
    if (new Set(needs.map(owner)).size < 2) out.push(`${t.name}: one player can do it alone (${needs.map((a) => NAMES[a]).join(', ') || 'no ability needed'})`);
  }
  return out;
}
