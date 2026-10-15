// Things on the map and what each ability does to them. What each kind does is in server/kinds/
// (one file per kind); this file runs those rules in the game. The solver (solver.js) runs the same rules.
// Any thing may also have "clues": { look | read | listen | talk: text }: the text goes to the player who used the ability.
import { REACH } from './world.js';
import { KINDS as REGISTRY, kindOf, abilityOf, actionFor } from './kinds/index.js';
import { didYouMean } from './words.js';
import { goalOf } from './goals/index.js';

export const KINDS = Object.keys(REGISTRY);

// Checks one object from a zone file. Returns a list of problems (empty = fine).
// `objects`: the other objects of its map, to check what it points to (a plate's target...).
export function checkObject(o, itemIds, abilityIds, objects = null) {
  const bad = [];
  if (!REGISTRY[o.kind]) return [`unknown kind "${o.kind}".${didYouMean(o.kind, KINDS)} Kinds: ${KINDS.join(', ')}`];
  const v = {
    item: (id, what) => { if (!itemIds.includes(id)) bad.push(`${what} "${id}" is not an item.${didYouMean(id, itemIds)} Items: ${itemIds.join(', ')}`); },
    ability: (id, what) => { if (!abilityIds.includes(id)) bad.push(`"${what}" is "${id}", which is not an ability.${didYouMean(id, abilityIds)} Abilities: ${abilityIds.join(', ')}`); },
    problem: (text) => bad.push(text),
    // Another object of the map, optionally of a kind that passes `want`.
    object(id, what, want = null, wanted = '') {
      if (!objects) return;
      const other = objects.find((x) => x?.id === id);
      if (!other) bad.push(`"${what}" is "${id}", which is not an object of this map.${didYouMean(id, objects.map((x) => x?.id).filter(Boolean))}`);
      else if (want && !(REGISTRY[other.kind] && want(REGISTRY[other.kind]))) bad.push(`"${what}" is "${id}", a ${other.kind}; it must be ${wanted}`);
    },
  };
  REGISTRY[o.kind].check?.(o, v);
  for (const a of Object.keys(o.clues && typeof o.clues === 'object' ? o.clues : {})) if (!abilityIds.includes(a)) bad.push(`a clue for "${a}", which is not an ability.${didYouMean(a, abilityIds)}`);
  return bad;
}

// Fresh state for every object of the zone (mission start, zone reset).
// `stations`: ids of the tablets this mission uses; the other tablets are left out.
export function buildThings(zone, stations = null) {
  return zone.objects.filter((def) => !REGISTRY[def.kind].card || !stations || stations.includes(def.id)).map((def) => ({
    def, id: def.id, kind: def.kind, name: def.name, x: def.x, y: def.y,
    st: 'x', holds: null, ...REGISTRY[def.kind].start(def),
    held: false,                           // a plate is holding this gap or gate open right now
    card: null, wrong: 0, by: null, hints: 0,
  }));
}

export const solid = (t) => !t.held && kindOf(t).solid(t);
// The teacher's rescue button: move a thing one step forward without the ability.
// Returns a short description, or null if there is nothing to do.
export const forceThing = (t) => kindOf(t).force?.(t) ?? null;
export const canForce = (t) => !!kindOf(t).force;

// The tiles nobody can walk on right now: under solid things, and where something floods the ground.
export function blockSet(things) {
  const set = new Set(things.filter(solid).map((t) => `${t.x},${t.y}`));
  for (const t of things) for (const f of kindOf(t).floods?.(t) || []) set.add(`${f.x},${f.y}`);
  return set;
}

// The abilities that do something to this thing right now: its clues, then its kind's actions.
export function needsOf(t) {
  const n = Object.keys(t.def.clues || {});
  for (const a of kindOf(t).actions) { const id = abilityOf(a, t); if (a.when(t) && !n.includes(id)) n.push(id); }
  return n;
}

const hidden = (t) => !!kindOf(t).hidden?.(t);
// What every screen may know. No clue text, no card.
export const publicThings = (things) => things
  .filter((t) => !hidden(t))
  .map((t) => ({ id: t.id, kind: t.kind, name: t.name, x: t.x, y: t.y, st: t.st, needs: needsOf(t), holds: kindOf(t).hidesHolds?.(t) ? null : t.holds,
    held: t.held || undefined, ...kindOf(t).view?.(t) }));

const dist = (t, p) => Math.hypot(t.x + 0.5 - p.x, t.y + 0.5 - (p.y - 0.1));
export function nearestThing(things, p, wanted = () => true) {
  let best = null, bestD = REACH;
  for (const t of things) {
    if (hidden(t)) continue;
    const d = dist(t, p);
    if (d <= bestD && wanted(t)) { best = t; bestD = d; }
  }
  return best;
}
const tileOf = (p) => `${Math.floor(p.x)},${Math.floor(p.y)}`;

// {d1} {d2} ... in a clue become the digits of this mission's gate code.
export const fillCode = (text, code) => String(text).replace(/\{d(\d)\}/g, (m, n) => code?.[n - 1] ?? '?');

// A clue's text for this run: {d1}... the code's digits, {where:<id>} "near <the closest named place>",
// {name:<id>} an object's name, and the goal's own ({order}, {odd}, {deliveries}).
export function fillText(text, room, items) {
  const find = (id) => room.things.find((t) => t.id === id) || room.zone.objects.find((o) => o.id === id);
  const c = { name: (id) => (find(id)?.name || id).toLowerCase(), itemName: (id) => (items?.byId[id]?.name || id).toLowerCase() };
  const goal = room.mission?.goal, own = goal ? goalOf(goal).placeholders?.(goal, c) || {} : {};
  return String(text).replace(/\{([^}]*)\}/g, (m, ph) => {
    const d = /^d(\d)$/.exec(ph);
    if (d) return room.gateCode?.[d[1] - 1] ?? '?';
    const ref = /^(where|name):(.*)$/.exec(ph);
    if (ref) {
      const t = find(ref[2]);
      if (!t) return '?';
      if (ref[1] === 'name') return t.name;
      const place = (room.zone.places || []).map((p) => [Math.hypot(p.x - (t.x + 0.5), p.y - (t.y + 0.5)), p]).sort((a, b) => a[0] - b[0])[0]?.[1];
      return place ? `near ${place.name}` : 'somewhere on the island';
    }
    return Object.hasOwn(own, ph) ? own[ph] : m;
  });
}

// What a kind's rules may look at in a running game.
export function gameCtx(room, items, player = null) {
  return {
    room, player,
    byId: (id) => room.things.find((x) => x.id === id) || null,
    itemName: (id) => (items?.byId[id]?.name || id).toLowerCase(),
    someoneOn: (x, y) => room.players.some((q) => tileOf(q) === `${x},${y}`),
  };
}

// Every tick: kinds that react to players standing on them (plates). Returns true if something changed.
export function pressPlates(room) {
  let changed = false;
  const ctx = gameCtx(room);
  for (const t of room.things) if (kindOf(t).tick?.(t, ctx)) changed = true;
  return changed;
}

// A player uses an ability. `room` gives things, players, zone; `items` the item list.
// Returns one of:
//   { nope: message }                          nothing happened
//   { clue: { key, o, a, name, text } }        private text for this player
//   { changed: true, say: message, thing }     the world changed (say = short private message; thing = what it acted on)
//   { card: thing }                            show this thing's card to the player
//   { keypad: thing }                          ask the player for this thing's code
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
    return { clue: { key: `${t.id}:${ability.id}`, o: t.id, a: ability.id, name: t.name, text: fillText(t.def.clues[ability.id], room, items) } };
  }

  const act = actionFor(t, ability.id);
  if (!act) return { nope: `${ability.name} does nothing on the ${t.name.toLowerCase()}.` };
  const ctx = gameCtx(room, items, p);
  if (act.run) return { ...act.run(t, ctx), thing: t };
  const why = act.guard?.(t, ctx);
  if (why) return { nope: why };
  if (act.needs?.code) return { keypad: t };
  if (act.needs?.card) return { card: t };
  if (act.gives) {
    if (p.items.length >= items.maxCarry) return { nope: 'Your hands are full. Give something to a teammate.' };
    const item = t.holds;
    p.items.push({ item, from: t.id });
    act.do(t, ctx);
    return { changed: true, say: `You have the ${itemName(item)}.`, thing: t };
  }
  if (act.needs?.item) {
    const id = act.needs.item(t), i = p.items.findIndex((it) => it.item === id);
    if (i < 0) return { nope: act.missing ? act.missing(t, ctx) : `You need the ${itemName(id)}.` };
    if (!act.needs.keep) t.used = p.items.splice(i, 1)[0];       // the item is now part of the thing
  }
  act.do(t, ctx);
  return { changed: true, say: act.say?.(t, ctx), thing: t };
}

// A code or a card was answered right: the action that waited for it happens. Returns false if nothing waited.
export function completeAction(room, t, items, kind) {
  const act = kindOf(t).actions.find((a) => a.needs?.[kind] && a.when(t));
  if (!act) return false;
  act.do(t, gameCtx(room, items));
  return true;
}
// The ability a thing's code or card is opened with, if it has one waiting.
export function waitingAbility(t, kind) {
  const act = kindOf(t).actions.find((a) => a.needs?.[kind] && a.when(t));
  return act ? abilityOf(act, t) : null;
}

// A player leaves the game for good: what they carry goes back where it came from.
export function returnItems(room, p) {
  for (const it of p.items) {
    const t = room.things.find((x) => x.id === it.from);
    if (!t) continue;
    t.holds = it.item;
    kindOf(t).returned?.(t);
  }
  p.items = [];
}
