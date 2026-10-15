// Checks scenario pack files and says what is wrong in plain English, with a suggestion when a name looks
// like a typo. Every problem is listed, not only the first. Used when packs load (content.js) and by
// npm run check. Fields whose name ends in "Help" are notes for authors and are always allowed.
import { KINDS } from './kinds/index.js';
import { checkObject } from './things.js';
import { TILES, SOLID_TILES } from './world.js';
import { didYouMean } from './words.js';
import { normalizeGoal } from './missions.js';

export { didYouMean };

// Fields a record may have. Reports the others, with a suggestion.
export function unknownFields(rec, allowed, where, out) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return;
  for (const k of Object.keys(rec)) if (!allowed.includes(k) && !k.endsWith('Help')) out.push(`${where}: unknown field "${k}".${didYouMean(k, allowed)}`);
}

const isInt = (v) => Number.isInteger(v);
const OBJECT_FIELDS = ['id', 'kind', 'name', 'x', 'y', 'slot', 'clues'];
export const ZONE_FIELDS = ['id', 'name', 'legend', 'goal', 'rows', 'places', 'landmarks', 'objects', 'slots', 'shuffle'];
// What a shuffle can swap between objects, each run (run.js).
export const SHUFFLE_FIELDS = ['holds', 'reward', 'item', 'clues', 'name'];
// Clue placeholders filled in each run (besides {d1}... the code digits): {where:<id>} {name:<id>}, and the goal's.
export const GOAL_PLACEHOLDERS = ['order', 'odd', 'deliveries'];
export const PACK_FIELDS = ['id', 'name', 'order', 'story', 'unlock'];

// Everything wrong with one zone file. `items`: the item ids; `abilities`: the ability ids.
export function zoneProblems(raw, { items, abilities }) {
  const out = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['a zone file is one JSON object: { "id": ..., "rows": [...], ... }'];
  unknownFields(raw, ZONE_FIELDS, 'zone', out);
  if (typeof raw.name !== 'string' || !raw.name.trim()) out.push('"name" is missing: the name players see (for example "The Beach")');

  // The map
  const rows = raw.rows;
  let mapOk = false;
  if (!Array.isArray(rows) || !rows.length || !rows.every((r) => typeof r === 'string')) out.push('"rows" must be a list of text lines, one letter per tile');
  else {
    const w = rows[0].length, odd = rows.map((r, y) => [r.length, y]).filter(([n]) => n !== w);
    for (const [n, y] of odd.slice(0, 5)) out.push(`rows: line ${y} is ${n} tiles wide, but line 0 is ${w}. Every line must be the same width.`);
    const bad = new Map();
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (!TILES.has(ch) && !bad.has(ch)) bad.set(ch, `${x},${y}`); }));
    for (const [ch, at] of bad) out.push(`rows: unknown tile "${ch}" (first at ${at}). Tiles: ${[...TILES].join(' ')}`);
    const starts = rows.join('').split('p').length - 1;
    if (starts < 6) out.push(`rows: the map needs at least 6 player starts ("p"), it has ${starts}`);
    mapOk = !odd.length && !bad.size;
  }
  const tile = (x, y) => (mapOk ? rows[y]?.[x] : undefined);
  const inside = (x, y) => isInt(x) && isInt(y) && x >= 0 && y >= 0 && mapOk && y < rows.length && x < rows[0].length;
  const ground = (x, y) => inside(x, y) && !SOLID_TILES.has(tile(x, y));

  // Slots: named lists of tiles; an object with "slot" gets one of them, a different one each run.
  const slots = raw.slots === undefined ? {} : raw.slots;
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) out.push('"slots" is { "<name>": [[x, y], [x, y], ...] }');
  const slotTiles = new Map();                          // "x,y" -> slot name
  for (const [name, tiles] of Object.entries(slots && typeof slots === 'object' ? slots : {})) {
    if (!Array.isArray(tiles) || !tiles.length || !tiles.every((t) => Array.isArray(t) && t.length === 2)) { out.push(`slot "${name}": a list of tiles, [[x, y], [x, y], ...]`); continue; }
    for (const [x, y] of tiles) {
      if (!mapOk) break;
      if (!inside(x, y)) out.push(`slot "${name}": ${x},${y} is outside the map`);
      else if (!ground(x, y) || tile(x, y) === 'p') out.push(`slot "${name}": ${x},${y} is ${tile(x, y) === 'p' ? 'a player start' : `"${tile(x, y)}", which blocks the way`}`);
      else if (slotTiles.has(`${x},${y}`)) out.push(`slot "${name}": ${x},${y} is also in the slot "${slotTiles.get(`${x},${y}`)}"`);
      else slotTiles.set(`${x},${y}`, name);
    }
  }
  // Objects
  const objects = Array.isArray(raw.objects) ? raw.objects : [];
  if (!Array.isArray(raw.objects)) out.push('"objects" must be a list');
  const ids = new Map(), taken = new Map();
  for (const [name, tiles] of Object.entries(slots && typeof slots === 'object' ? slots : {})) {
    const users = objects.filter((o) => o?.slot === name).length;
    if (Array.isArray(tiles) && users > tiles.length) out.push(`slot "${name}": ${users} objects use it, but it has only ${tiles.length} tiles`);
  }
  const kinds = Object.keys(KINDS);
  for (const [i, o] of objects.entries()) {
    const where = `object ${o?.id ? `"${o.id}"` : `#${i + 1}`}`;
    if (!o || typeof o !== 'object') { out.push(`${where}: must be an object { "id", "kind", "x", "y", ... }`); continue; }
    if (typeof o.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(o.id)) out.push(`${where}: "id" must use small letters, numbers and dashes (for example "old-sign")`);
    else if (ids.has(o.id)) out.push(`${where}: two objects have this id. Every object needs its own.`);
    else ids.set(o.id, o);
    const kind = KINDS[o.kind];
    if (!kind) { out.push(`${where}: unknown kind "${o.kind}".${didYouMean(o.kind, kinds)} Kinds: ${kinds.join(', ')}`); continue; }
    unknownFields(o, [...OBJECT_FIELDS, ...Object.keys(kind.fields)], where, out);
    if (o.slot !== undefined) {
      if (!slots?.[o.slot]) { out.push(`${where}: there is no slot "${o.slot}".${didYouMean(o.slot, Object.keys(slots || {}))}`); continue; }
      if (o.to || o.floods) { out.push(`${where}: a ${o.kind} cannot use a slot (its "to" or "floods" tiles depend on where it stands)`); continue; }
    } else if (!(isInt(o.x) && isInt(o.y))) out.push(`${where}: needs "x" and "y" (or a "slot")`);
    // Where it stands (and where a rock can be pushed to): free ground, one object per tile. A slot's tiles are checked above.
    for (const [at, label] of o.slot !== undefined ? [] : [[o, 'its place'], [o.to, '"to"']]) {
      if (!at || (at === o.to && kind.kind !== 'boulder')) continue;
      if (!inside(at.x, at.y)) { if (mapOk) out.push(`${where}: ${label} ${at.x},${at.y} is outside the map (${rows[0].length} x ${rows.length})`); continue; }
      if (!ground(at.x, at.y)) out.push(`${where}: ${label} ${at.x},${at.y} is "${tile(at.x, at.y)}", which blocks the way. Put it on ground.`);
      else if (tile(at.x, at.y) === 'p') out.push(`${where}: ${label} ${at.x},${at.y} is a player start. Move it, or move the start.`);
      else if (taken.has(`${at.x},${at.y}`)) out.push(`${where}: ${label} ${at.x},${at.y} is taken by "${taken.get(`${at.x},${at.y}`)}". One object per tile.`);
      else if (slotTiles.has(`${at.x},${at.y}`)) out.push(`${where}: ${label} ${at.x},${at.y} is a tile of the slot "${slotTiles.get(`${at.x},${at.y}`)}". One object per tile.`);
      else taken.set(`${at.x},${at.y}`, o.id);
    }
    for (const f of mapOk && Array.isArray(o.floods) ? o.floods : []) if (!ground(f.x, f.y)) out.push(`${where}: the flooded tile ${f.x},${f.y} must be ground`);
    for (const p of checkObject(o, items, abilities, objects)) out.push(`${where}: ${p}`);
    if (o.clues !== undefined && (typeof o.clues !== 'object' || Array.isArray(o.clues))) out.push(`${where}: "clues" is { "ability": "text", ... }, for example { "read": "WELCOME!" }`);
    for (const [a, text] of Object.entries(o.clues && typeof o.clues === 'object' ? o.clues : {})) if (typeof text !== 'string' || !text.trim()) out.push(`${where}: its "${a}" clue has no text`);
  }

  // Clue placeholders: {d1}... are the digits of the code gate; the code needs every one of its digits in some clue.
  const texts = objects.flatMap((o) => Object.values(o?.clues && typeof o.clues === 'object' ? o.clues : {}).filter((t) => typeof t === 'string').map((t) => [o.id, t]));
  const longest = Math.max(0, ...objects.filter((o) => o?.code).map((o) => Number(o.code) || 0));
  for (const [id, text] of texts) for (const [, ph] of text.matchAll(/\{([^}]*)\}/g)) {
    const d = /^d(\d)$/.exec(ph), ref = /^(where|name):(.*)$/.exec(ph);
    if (ref) { if (!objects.some((o) => o?.id === ref[2])) out.push(`object "${id}": {${ph}} in a clue, but "${ref[2]}" is not an object of this map.${didYouMean(ref[2], objects.map((o) => o?.id))}`); }
    else if (GOAL_PLACEHOLDERS.includes(ph)) { /* filled by the mission's goal; npm run check makes sure the goal gives it */ }
    else if (!d) out.push(`object "${id}": unknown placeholder {${ph}} in a clue. Placeholders: {d1}... (code digits), {where:<id>}, {name:<id>}, ${GOAL_PLACEHOLDERS.map((p) => `{${p}}`).join(' ')}`);
    else if (Number(d[1]) < 1 || Number(d[1]) > longest) out.push(`object "${id}": {${ph}} in a clue, but ${longest ? `the code has only ${longest} digits` : 'this map has no code gate'}`);
  }
  for (const g of objects.filter((o) => o?.code >= 2 && o.code <= 6)) {
    for (let n = 1; n <= g.code; n++) if (!texts.some(([, t]) => t.includes(`{d${n}}`))) out.push(`object "${g.id}": its code has ${g.code} digits, but no clue gives digit ${n} ({d${n}}). Players could never open it.`);
  }

  // Shuffles: each run, these objects swap one of their fields.
  if (raw.shuffle !== undefined && !Array.isArray(raw.shuffle)) out.push('"shuffle" is a list: [{ "objects": ["<id>", "<id>"], "field": "holds" }]');
  for (const [i, sh] of (Array.isArray(raw.shuffle) ? raw.shuffle : []).entries()) {
    const where = `shuffle #${i + 1}`;
    unknownFields(sh, ['objects', 'field'], where, out);
    if (!SHUFFLE_FIELDS.includes(sh?.field)) out.push(`${where}: "field" must be one of ${SHUFFLE_FIELDS.join(', ')}.${didYouMean(sh?.field, SHUFFLE_FIELDS)}`);
    if (!Array.isArray(sh?.objects) || sh.objects.length < 2) { out.push(`${where}: "objects" lists 2 or more object ids`); continue; }
    for (const oid of sh.objects) if (!ids.has(oid)) out.push(`${where}: "${oid}" is not an object of this map.${didYouMean(oid, [...ids.keys()])}`);
  }

  // Places, landmarks, the goal
  const named = (list, field, extra) => {
    if (list === undefined) return [];
    if (!Array.isArray(list)) { out.push(`"${field}" must be a list`); return []; }
    const seen = new Set();
    for (const [i, p] of list.entries()) {
      const where = `${field.slice(0, -1)} ${p?.id ? `"${p.id}"` : `#${i + 1}`}`;
      unknownFields(p, ['id', 'name', 'x', 'y', ...extra], where, out);
      if (!p?.id || !p.name) out.push(`${where}: needs "id" and "name"`);
      if (p?.id && seen.has(p.id)) out.push(`${where}: two ${field} have this id`);
      seen.add(p?.id);
      if (mapOk && !inside(Math.floor(p?.x), Math.floor(p?.y))) out.push(`${where}: ${p?.x},${p?.y} is outside the map`);
    }
    return list;
  };
  named(raw.places, 'places', []);
  named(raw.landmarks, 'landmarks', ['art', 'w', 'h', 'solid']);
  // The map's goal (the default for its missions), checked by its goal type (server/goals/).
  if (!raw.goal || typeof raw.goal !== 'object') out.push('"goal" is missing: what the team must do, for example { "type": "collect", "items": { "lantern": 3 }, "story": "..." }');
  else {
    const fail = (why) => out.push(why);
    fail.problems = out;
    normalizeGoal(raw.goal, { zone: { ...raw, objects, landmarks: Array.isArray(raw.landmarks) ? raw.landmarks : [], goal: null }, items: { byId: Object.fromEntries(items.map((i) => [i, { id: i, name: i }])) }, stations: null, fail });
  }
  return out;
}

// Everything wrong with pack.json.
export function packProblems(raw, folder) {
  const out = [];
  if (!raw || typeof raw !== 'object') return ['pack.json is one JSON object: { "id", "name" }'];
  unknownFields(raw, PACK_FIELDS, 'pack.json', out);
  if (raw.id !== folder) out.push(`"id" must be "${folder}", the name of its folder`);
  if (typeof raw.name !== 'string' || !raw.name.trim()) out.push('"name" is missing: the name teachers see');
  if (raw.order !== undefined && !Number.isFinite(raw.order)) out.push('"order" is a number: packs are listed in this order');
  if (raw.unlock !== undefined) {
    unknownFields(raw.unlock, ['landmarks'], 'unlock', out);
    if (!(isInt(raw.unlock?.landmarks) && raw.unlock.landmarks >= 0)) out.push('"unlock" is { "landmarks": N }: the pack opens for a group once it has restored N landmarks');
  }
  return out;
}
