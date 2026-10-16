// Items: what players carry. data/items.json has the base ones; a pack adds its own in pack.json, "items":
//   [{ "id": "id-card", "name": "ID card", "art": [16 rows of 16 letters], "pal": { "a": "#ffffff" } }]
// An item id works in every pack once its pack is loaded; ids must be unique. Pack items are added to the
// same registry the game uses ({ list, byId, maxCarry }) and replaced when the packs are read again.
import { pictureProblems } from './art.js';

const ID = /^[a-z][a-z0-9-]{0,30}$/;

// Everything wrong with a list of items. `taken`: ids that are already used.
export function itemProblems(list, where, taken = new Set(), needArt = true) {
  if (!Array.isArray(list)) return [`${where}: "items" is a list: [{ "id", "name", "art", "pal" }]`];
  const out = [], seen = new Set();
  for (const [i, it] of list.entries()) {
    const w = `${where}, item ${it?.id ? `"${it.id}"` : `#${i + 1}`}`;
    if (!it || typeof it !== 'object') { out.push(`${w}: must be { "id", "name", "art", "pal" }`); continue; }
    for (const k of Object.keys(it)) if (!['id', 'name', 'art', 'pal', 'pack'].includes(k) && !k.endsWith('Help')) out.push(`${w}: unknown field "${k}". Fields: id, name, art, pal`);
    if (!ID.test(it.id || '')) out.push(`${w}: "id" uses small letters, numbers and dashes, starting with a letter`);
    else if (taken.has(it.id) || seen.has(it.id)) out.push(`${w}: another item already has this id`);
    seen.add(it.id);
    if (typeof it.name !== 'string' || !it.name.trim()) out.push(`${w}: needs "name", what players read ("ID card")`);
    if (it.art !== undefined || needArt) out.push(...pictureProblems(it.art, it.pal, w));
  }
  return out;
}

// Takes the previous packs' items out of the registry.
export function dropPackItems(items) {
  items.list = items.list.filter((i) => !i.pack);
  items.byId = Object.fromEntries(items.list.map((i) => [i.id, i]));
}
// Adds a pack's items (the ones without mistakes) and returns their ids.
export function addPackItems(items, packId, list, where, problems) {
  const taken = new Set(items.list.map((i) => i.id));
  const bad = itemProblems(list, where, taken);
  problems.push(...bad);
  const added = [];
  for (const it of Array.isArray(list) ? list : []) {
    if (!it || bad.some((b) => b.includes(`item "${it.id}"`)) ) continue;
    const rec = { id: it.id, name: it.name, art: it.art, pal: it.pal || {}, pack: packId };
    items.list.push(rec); items.byId[rec.id] = rec; added.push(rec.id);
  }
  return added;
}
// What every screen needs to draw items: [{ id, art, pal }].
export const itemArt = (items) => items.list.filter((i) => i.art).map(({ id, art, pal }) => ({ id, art, pal }));
