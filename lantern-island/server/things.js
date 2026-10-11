// Things on the map and what each ability does to them.
//
// Kinds (set in the zone file) and their states:
//   sign statue shell bottle npc stump bell   only clues
//   item      here -> gone                    Pick up
//   chest     closed <-> open                 Open, Close; Pick up what it holds when open
//   gate      locked -> closed <-> open       Use unlocks: with its key, or (code gate) by typing its code; Open, Close
//   gap       broken -> fixed                 Jump over it; Fix it (if it names the item it needs)
//   plate     (no state)                      while a player stands on it, its target (a gap or a gate) lets everybody pass
//   sluice    broken -> open <-> closed       Fix (with the item it needs), then Close: the tiles it floods fall dry
//   boulder   a <-> b                         Push moves it aside and back
//   station   new -> open -> solved           its "by" ability shows the card; Pick up the reward when solved
// Any thing may also have "clues": { look | read | listen | talk: text }.
import { REACH } from './world.js';

const CLUE_KINDS = ['sign', 'statue', 'shell', 'bottle', 'npc', 'stump', 'bell'];
export const KINDS = [...CLUE_KINDS, 'item', 'chest', 'gate', 'gap', 'boulder', 'station', 'plate', 'sluice'];

// Checks one object from a zone file. Returns a list of problems (empty = fine).
export function checkObject(o, itemIds, abilityIds) {
  const bad = [];
  if (!KINDS.includes(o.kind)) bad.push(`unknown kind "${o.kind}"`);
  const item = (v, what) => { if (!itemIds.includes(v)) bad.push(`${what} "${v}" is not in items.json`); };
  if (o.kind === 'item') item(o.item, 'item');
  if (o.kind === 'chest' && o.holds) item(o.holds, 'holds');
  if (o.kind === 'gate' && o.locked && !o.code) item(o.key || 'key', 'key');
  if (o.kind === 'gate' && o.code && !(o.code >= 2 && o.code <= 6)) bad.push('"code" is the number of digits, 2 to 6');
  if (o.kind === 'gap' && o.needs) item(o.needs, 'needs');
  if (o.kind === 'sluice') { item(o.needs, 'needs'); if (!Array.isArray(o.floods) || !o.floods.length) bad.push('a sluice needs "floods": [{ x, y }, ...]'); }
  if (o.kind === 'plate' && !o.target) bad.push('a plate needs "target": the id of a gap or a gate');
  if (o.kind === 'boulder' && !(Number.isInteger(o.to?.x) && Number.isInteger(o.to?.y))) bad.push('a boulder needs "to": { x, y }');
  if (o.kind === 'station') {
    if (!abilityIds.includes(o.by || 'use')) bad.push(`"by" must be an ability`);
    if (o.reward?.item) item(o.reward.item, 'reward item');
  }
  for (const a of Object.keys(o.clues || {})) if (!abilityIds.includes(a)) bad.push(`clue for unknown ability "${a}"`);
  return bad;
}

// Fresh state for every object of the zone (mission start, zone reset).
// `stations`: ids of the stations this mission uses; the other tablets are left out.
export function buildThings(zone, stations = null) {
  return zone.objects.filter((def) => def.kind !== 'station' || !stations || stations.includes(def.id)).map((def) => ({
    def, id: def.id, kind: def.kind, name: def.name, x: def.x, y: def.y,
    st: { item: 'here', chest: 'closed', gate: def.locked ? 'locked' : 'closed', gap: 'broken', boulder: 'a', station: 'new', sluice: 'broken' }[def.kind] || 'x',
    held: false,                           // a plate is holding this gap or gate open right now
    holds: def.kind === 'item' ? def.item : def.kind === 'chest' ? def.holds || null : null,
    card: null, wrong: 0, by: null, hints: 0,
  }));
}

export const solid = (t) => !(t.kind === 'plate' || t.held || (t.kind === 'item' && t.st === 'gone') || (t.kind === 'gate' && t.st === 'open') || (t.kind === 'gap' && t.st === 'fixed'));
// The teacher's rescue button: move a thing one step forward without the ability.
// Returns a short description, or null if there is nothing to do.
export function forceThing(t) {
  switch (t.kind) {
    case 'gate': case 'chest': t.st = t.st === 'open' ? 'closed' : 'open'; return t.st === 'open' ? 'opened' : 'closed';
    case 'sluice': t.st = t.st === 'closed' ? 'open' : 'closed'; return t.st;
    case 'gap': if (t.st === 'fixed') return null; t.st = 'fixed'; return 'fixed';
    case 'boulder': { const to = t.st === 'a' ? t.def.to : t.def; t.x = to.x; t.y = to.y; t.st = t.st === 'a' ? 'b' : 'a'; return 'moved'; }
    default: return null;
  }
}

// The tiles nobody can walk on right now: under solid things, and where an open sluice lets the sea in.
export function blockSet(things) {
  const set = new Set(things.filter(solid).map((t) => `${t.x},${t.y}`));
  for (const t of things) if (t.kind === 'sluice' && t.st !== 'closed') for (const f of t.def.floods) set.add(`${f.x},${f.y}`);
  return set;
}

// The abilities that do something to this thing right now.
export function needsOf(t) {
  const n = Object.keys(t.def.clues || {});
  const add = (...a) => { for (const x of a) if (!n.includes(x)) n.push(x); };
  if (t.kind === 'item' && t.st === 'here') add('pickup');
  if (t.kind === 'chest') { if (t.st === 'closed') add('open'); else { add('close'); if (t.holds) add('pickup'); } }
  if (t.kind === 'gate') add({ locked: 'use', closed: 'open', open: 'close' }[t.st]);
  if (t.kind === 'gap' && t.st === 'broken') { add('jump'); if (t.def.needs) add('fix'); }
  if (t.kind === 'sluice') add({ broken: 'fix', open: 'close', closed: 'open' }[t.st]);
  if (t.kind === 'boulder') add('push');
  if (t.kind === 'station') { if (t.st !== 'solved') add(t.def.by || 'use'); else if (t.holds) add('pickup'); }
  return n;
}

// What every screen may know. No clue text, no card.
export const publicThings = (things) => things
  .filter((t) => !(t.kind === 'item' && t.st === 'gone'))
  .map((t) => ({ id: t.id, kind: t.kind, name: t.name, x: t.x, y: t.y, st: t.st, needs: needsOf(t), holds: (t.kind === 'chest' && t.st === 'closed') ? null : t.holds,
    held: t.held || undefined, keypad: t.def.code ? true : undefined, floods: t.kind === 'sluice' && t.st !== 'closed' ? t.def.floods : undefined }));

const dist = (t, p) => Math.hypot(t.x + 0.5 - p.x, t.y + 0.5 - (p.y - 0.1));
export function nearestThing(things, p, wanted = () => true) {
  let best = null, bestD = REACH;
  for (const t of things) {
    if (t.kind === 'item' && t.st === 'gone') continue;
    const d = dist(t, p);
    if (d <= bestD && wanted(t)) { best = t; bestD = d; }
  }
  return best;
}
const tileOf = (p) => `${Math.floor(p.x)},${Math.floor(p.y)}`;

// {d1} {d2} ... in a clue become the digits of this mission's gate code.
export const fillCode = (text, code) => String(text).replace(/\{d(\d)\}/g, (m, n) => code?.[n - 1] ?? '?');

// Plates: a gap or gate is held open while a player stands on its plate. Returns true if something changed.
export function pressPlates(room) {
  let changed = false;
  for (const plate of room.things) {
    if (plate.kind !== 'plate') continue;
    const target = room.things.find((t) => t.id === plate.def.target);
    if (!target) continue;
    const down = room.players.some((p) => tileOf(p) === `${plate.x},${plate.y}`);
    if (down !== target.held) { target.held = down; plate.st = down ? 'down' : 'x'; changed = true; }
  }
  return changed;
}

// A player uses an ability. `room` gives things, players, zone; `items` the item list.
// Returns one of:
//   { nope: message }                          nothing happened
//   { clue: { key, o, a, name, text } }        private text for this player
//   { changed: true, say: message }            the world changed (say = short private message)
//   { card: thing }                            show this station's card to the player
//   { keypad: thing }                          ask the player for this gate's code
export function useAbility(room, p, ability, items, msg = {}) {
  const itemName = (id) => (items.byId[id]?.name || id).toLowerCase();
  const lower = ability.name.toLowerCase();

  // Give goes to a teammate, not to a thing.
  if (ability.id === 'give') {
    if (!p.items.length) return { nope: 'You have nothing to give.' };
    const sel = Number.isInteger(msg.item) && p.items[msg.item] ? msg.item : 0;
    if (p.items[sel].courier) return room.giveLetter(p, p.items[sel]);    // a courier's letter has its own rules (chat.js)
    const others = room.players.filter((q) => q !== p && q.ws);
    const to = others.map((q) => [Math.hypot(q.x - p.x, q.y - p.y), q]).filter(([d]) => d <= REACH).sort((a, b) => a[0] - b[0])[0]?.[1];
    if (!to) return { nope: 'Nobody is close enough. Meet your teammate first.' };
    if (to.items.length >= items.maxCarry) return { nope: `${to.name} cannot carry more.` };
    const i = Number.isInteger(msg.item) && p.items[msg.item] ? msg.item : 0;
    const [it] = p.items.splice(i, 1);
    to.items.push(it);
    return { changed: true, say: `You gave the ${itemName(it.item)} to ${to.name}.`, tell: [to, `${p.name} gave you the ${itemName(it.item)}.`] };
  }

  const t = nearestThing(room.things, p, (x) => needsOf(x).includes(ability.id));
  // Pick up also takes an item back from a teammate's hands, so nothing handed to the
  // wrong player is ever stuck. ("Can I have the key back, please?")
  if (!t && ability.id === 'pickup') {
    const from = room.players.filter((q) => q !== p && q.items.some((it) => !it.courier)).map((q) => [Math.hypot(q.x - p.x, q.y - p.y), q]).filter(([d]) => d <= REACH).sort((a, b) => a[0] - b[0])[0]?.[1];
    if (from) {
      if (p.items.length >= items.maxCarry) return { nope: 'Your hands are full. Give something to a teammate.' };
      const it = from.items.find((x) => !x.courier);
      from.items = from.items.filter((x) => x !== it);
      p.items.push(it);
      return { changed: true, say: `You took the ${itemName(it.item)} from ${from.name}.`, tell: [from, `${p.name} took the ${itemName(it.item)} from you.`] };
    }
  }
  if (!t) {
    const close = nearestThing(room.things, p, (x) => needsOf(x).length);
    return { nope: close ? `${ability.name} does nothing on the ${close.name.toLowerCase()}.` : `Nothing to ${lower} here. Go closer to something.` };
  }

  if (t.def.clues?.[ability.id]) {
    return { clue: { key: `${t.id}:${ability.id}`, o: t.id, a: ability.id, name: t.name, text: fillCode(t.def.clues[ability.id], room.gateCode) } };
  }

  switch (`${t.kind}/${ability.id}`) {
    case 'item/pickup': case 'chest/pickup': case 'station/pickup': {
      if (p.items.length >= items.maxCarry) return { nope: 'Your hands are full. Give something to a teammate.' };
      const item = t.holds;
      p.items.push({ item, from: t.id });
      t.holds = null;
      if (t.kind === 'item') t.st = 'gone';
      return { changed: true, say: `You have the ${itemName(item)}.` };
    }
    case 'chest/open': t.st = 'open'; return { changed: true, say: t.holds ? `There is a ${itemName(t.holds)} inside!` : 'It is empty.' };
    case 'chest/close': t.st = 'closed'; return { changed: true };
    case 'gate/use': {
      if (t.def.code) return { keypad: t };
      const key = t.def.key || 'key';
      if (!p.items.some((it) => it.item === key)) return { nope: `It is locked. You need the ${itemName(key)}.` };
      t.st = 'closed';
      return { changed: true, say: 'Unlocked! Now somebody can open it.' };
    }
    case 'gate/open': t.st = 'open'; return { changed: true };
    case 'gate/close':
      if (room.players.some((q) => tileOf(q) === `${t.x},${t.y}`)) return { nope: 'Somebody is standing in the gate.' };
      t.st = 'closed';
      return { changed: true };
    case 'sluice/fix': {
      const i = p.items.findIndex((it) => it.item === t.def.needs);
      if (i < 0) return { nope: `It is broken. You need a ${itemName(t.def.needs)} to fix it.` };
      t.used = p.items.splice(i, 1)[0];
      t.st = 'open';
      return { changed: true, say: 'Fixed! Now somebody can close it.' };
    }
    case 'sluice/close': t.st = 'closed'; return { changed: true, say: 'The sea goes down!' };
    case 'sluice/open':
      if (room.players.some((q) => t.def.floods.some((f) => tileOf(q) === `${f.x},${f.y}`))) return { nope: 'Somebody is walking there. Wait!' };
      t.st = 'open';
      return { changed: true };
    case 'gap/fix': {
      const i = p.items.findIndex((it) => it.item === t.def.needs);
      if (i < 0) return { nope: `You need a ${itemName(t.def.needs)} to fix it.` };
      t.used = p.items.splice(i, 1)[0];          // the item is now part of the bridge
      t.st = 'fixed';
      return { changed: true, say: 'Fixed! Everybody can cross now.' };
    }
    case 'gap/jump': {
      // Land on the far side, straight across from where the player stands.
      const dx = t.x + 0.5 - p.x, dy = t.y + 0.5 - (p.y - 0.1);
      const step = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      const lx = t.x + step[0], ly = t.y + step[1];
      if (room.solid(lx + 0.5, ly + 0.5)) return { nope: 'There is no place to land on the other side.' };
      p.x = lx + 0.5; p.y = ly + 0.6;
      return { changed: true, say: 'You jumped across!' };
    }
    case 'boulder/push': {
      const dest = t.st === 'a' ? t.def.to : { x: t.def.x, y: t.def.y };
      if (room.players.some((q) => tileOf(q) === `${dest.x},${dest.y}`)) return { nope: 'Somebody is in the way.' };
      t.x = dest.x; t.y = dest.y; t.st = t.st === 'a' ? 'b' : 'a';
      return { changed: true, say: 'You moved it.' };
    }
    default:
      if (t.kind === 'station') return { card: t };
      return { nope: `${ability.name} does nothing on the ${t.name.toLowerCase()}.` };
  }
}

// A player leaves the game for good: what they carry goes back where it came from.
export function returnItems(room, p) {
  for (const it of p.items) {
    const t = room.things.find((x) => x.id === it.from);
    if (!t) continue;
    t.holds = it.item;
    if (t.kind === 'item') t.st = 'here';
  }
  p.items = [];
}
