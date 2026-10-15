// Quest overrides: a mission can change its map for itself, without touching the map file.
//
//   "rename": { "<object id>": "New name" }
//   "texts":  { "<object id>": { "<ability>": "new clue text", "<ability>": null (removes that clue) } }
//   "lines":  { "<character id>": ["sentences the teacher can send as it"] }
//   "move":   { "<object id>": { "x": 3, "y": 4 } }
//   "remove": ["<object id>", ...]
//   "add":    [ { a whole object, as in a map file } ]
//   "slots":  { "<name>": [[x, y], ...] }   more slots, or other tiles for a slot (see run.js)
//   "shuffle": [{ "objects": [...], "field": "holds" }]   more shuffles (added to the map's)
//
// The changed map is checked exactly like a map file (validate.js), so a mission cannot put a sign in the sea
// or point a plate at nothing. Missions without overrides use their map as it is.
import { parseZone } from './world.js';
import { zoneProblems } from './validate.js';
import { didYouMean } from './words.js';

export const OVERRIDE_FIELDS = ['rename', 'texts', 'lines', 'move', 'remove', 'add', 'slots', 'shuffle'];
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export const hasOverrides = (raw) => OVERRIDE_FIELDS.some((k) => raw?.[k] !== undefined);

// The map this mission plays on, and the clean overrides. Mistakes go to `fail`. Returns { zone, overrides }.
export function applyOverrides(zone, raw, fail) {
  if (!hasOverrides(raw)) return { zone, overrides: null };
  if (!zone.raw) { fail('this map cannot be changed by a mission'); return { zone, overrides: null }; }
  const objects = zone.raw.objects.map((o) => structuredClone(o));
  const ids = () => objects.map((o) => o.id);
  const find = (id, field) => {
    const o = objects.find((x) => x.id === id);
    if (!o) fail(`"${field}": "${id}" is not an object of ${zone.name}.${didYouMean(id, ids())}`);
    return o;
  };
  const clean = {};
  if (raw.remove !== undefined) {
    if (!Array.isArray(raw.remove)) fail('"remove" is a list of object ids');
    else for (const id of raw.remove) { const o = find(id, 'remove'); if (o) objects.splice(objects.indexOf(o), 1); }
    clean.remove = raw.remove;
  }
  if (raw.rename !== undefined) {
    if (!isObj(raw.rename)) fail('"rename" is { "<object id>": "New name" }');
    else for (const [id, name] of Object.entries(raw.rename)) {
      const o = find(id, 'rename');
      if (o && (typeof name !== 'string' || !name.trim())) fail(`"rename": the new name of "${id}" is empty`);
      else if (o) o.name = name.trim().slice(0, 40);
    }
    clean.rename = raw.rename;
  }
  if (raw.texts !== undefined) {
    if (!isObj(raw.texts)) fail('"texts" is { "<object id>": { "<ability>": "clue text" } }');
    else for (const [id, clues] of Object.entries(raw.texts)) {
      const o = find(id, 'texts');
      if (!o) continue;
      if (!isObj(clues)) { fail(`"texts": "${id}" needs { "<ability>": "clue text" }`); continue; }
      o.clues = { ...(o.clues || {}) };
      for (const [a, text] of Object.entries(clues)) { if (text === null) delete o.clues[a]; else o.clues[a] = text; }
      if (!Object.keys(o.clues).length) delete o.clues;
    }
    clean.texts = raw.texts;
  }
  if (raw.lines !== undefined) {
    if (!isObj(raw.lines)) fail('"lines" is { "<character id>": ["sentence", ...] }');
    else for (const [id, lines] of Object.entries(raw.lines)) {
      const o = find(id, 'lines');
      if (o && (!Array.isArray(lines) || !lines.every((l) => typeof l === 'string'))) fail(`"lines": "${id}" needs a list of sentences`);
      else if (o) o.lines = lines;
    }
    clean.lines = raw.lines;
  }
  if (raw.move !== undefined) {
    if (!isObj(raw.move)) fail('"move" is { "<object id>": { "x": 3, "y": 4 } }');
    else for (const [id, to] of Object.entries(raw.move)) {
      const o = find(id, 'move');
      if (o && !(Number.isInteger(to?.x) && Number.isInteger(to?.y))) fail(`"move": "${id}" needs { "x", "y" }`);
      else if (o) { o.x = to.x; o.y = to.y; }
    }
    clean.move = raw.move;
  }
  if (raw.add !== undefined) {
    if (!Array.isArray(raw.add)) fail('"add" is a list of objects, written as in a map file');
    else objects.push(...raw.add.map((o) => structuredClone(o)));
    clean.add = raw.add;
  }
  let slots = zone.raw.slots, shuffle = zone.raw.shuffle;
  if (raw.slots !== undefined) {
    if (!isObj(raw.slots)) fail('"slots" is { "<name>": [[x, y], ...] }');
    else { slots = { ...(slots || {}), ...raw.slots }; clean.slots = raw.slots; }
  }
  if (raw.shuffle !== undefined) {
    if (!Array.isArray(raw.shuffle)) fail('"shuffle" is a list: [{ "objects": [...], "field": "holds" }]');
    else { shuffle = [...(shuffle || []), ...raw.shuffle]; clean.shuffle = raw.shuffle; }
  }
  // The changed map must be as good as a map file.
  const changed = { ...zone.raw, objects, ...(slots ? { slots } : {}), ...(shuffle ? { shuffle } : {}) };
  const problems = zoneProblems(changed, zone.deps);
  for (const p of problems) fail(`with this mission's changes, ${p}`);
  if (problems.length) return { zone, overrides: clean };
  const out = Object.assign(parseZone(changed), { pack: zone.pack, unlock: zone.unlock });
  Object.defineProperties(out, { raw: { value: changed }, deps: { value: zone.deps } });
  return { zone: out, overrides: clean };
}
