// Scenario packs: the game's adventures, one folder per pack, data only.
//
//   data/scenarios/<pack>/pack.json          { id (= folder name), name, order?, story?, unlock?: { landmarks: N },
//                                             theme?, tiles?, themes? (tiles.js) }
//   data/themes.json                         the built-in themes, for every pack
//   data/scenarios/<pack>/zones/<id>.json    maps with their objects, clues, places and landmarks (world.js parseZone)
//   data/scenarios/<pack>/missions/<id>.json quest templates (missions.js normalizeMission)
//   data/scenarios/<pack>/cards/<id>.json    challenge cards for this pack (cards.js validateCard)
//
// Pack content is edited in these files only. The teacher panel shows pack missions and cards but cannot
// change them; the teacher's own templates and cards stay in storage, as before.
// A pack with a mistake is left out, and the mistake is reported with the file it is in.
import fs from 'node:fs/promises';
import { watch as watchFiles } from 'node:fs';
import path from 'node:path';
import { parseZone } from './world.js';
import { validateCard } from './cards.js';
import { normalizeMission } from './missions.js';
import { zoneProblems, packProblems } from './validate.js';
import { tileSet, tileProblems, themeProblems } from './tiles.js';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

async function readJson(file, where) {
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch { throw new Error(`${where}: file not found`); }
  try { return JSON.parse(text); } catch (e) { throw new Error(`${where}: this is not valid JSON (${e.message})`); }
}
async function jsonFiles(dir) {
  try { return (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort(); } catch { return []; }
}

// Reads every pack. Returns { packs, zones, missions, cards, errors }; zones are in pack order.
export async function loadContent(contentDir, { abilities, items }) {
  const dir = path.join(contentDir, 'scenarios');
  const errors = [];
  let folders = [];
  try { folders = (await fs.readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory() && !/^[._]/.test(d.name)).map((d) => d.name); }
  catch { errors.push(`scenarios: the folder ${dir} is missing`); }

  // The built-in themes (data/themes.json).
  let builtIn = { day: { name: 'Day' } };
  try {
    builtIn = Object.fromEntries(Object.entries(JSON.parse(await fs.readFile(path.join(contentDir, 'themes.json'), 'utf8'))).filter(([k]) => !k.endsWith('Help')));
    for (const [name, def] of Object.entries(builtIn)) for (const p of themeProblems(name, def, tileSet())) errors.push(`themes.json: ${p}`);
  } catch (e) { if (e.code !== 'ENOENT') errors.push(`themes.json: ${e.message}`); }

  const loaded = [], failed = new Set();
  for (const id of folders) {
    const where = (f) => `scenarios/${id}/${f}`;
    const problems = [];                               // every mistake in this pack, each with its file
    const read = async (f) => { try { return await readJson(path.join(dir, id, f), where(f)); } catch (e) { problems.push(e.message); return null; } };
    if (!ID.test(id)) { errors.push(`scenarios/${id}: a pack folder name uses small letters, numbers and dashes only`); continue; }
    const meta = await read('pack.json');
    if (meta) for (const p of packProblems(meta, id)) problems.push(`${where('pack.json')}: ${p}`);
    const pack = { id, name: String(meta?.name || id), story: String(meta?.story || ''), order: Number(meta?.order) || 0, unlock: Math.max(0, Number(meta?.unlock?.landmarks) || 0), strictClues: meta?.strictClues === true, zones: [] };
    // Its tiles (the base ones and its own) and the themes its maps and missions may use (the built-in ones and its own).
    for (const p of tileProblems(meta?.tiles)) problems.push(`${where('pack.json')}: ${p}`);
    const tiles = tileSet(tileProblems(meta?.tiles).length ? {} : meta?.tiles || {});
    const themes = { ...builtIn, ...(meta?.themes && typeof meta.themes === 'object' ? meta.themes : {}) };
    for (const [name, def] of Object.entries(meta?.themes || {})) for (const p of themeProblems(name, def, tiles)) problems.push(`${where('pack.json')}: ${p}`);
    if (meta?.theme !== undefined && !themes[meta.theme]) problems.push(`${where('pack.json')}: "theme" is "${meta.theme}", which is not a theme. Themes: ${Object.keys(themes).join(', ')}`);
    const zones = [], missions = [], cards = [];
    for (const f of await jsonFiles(path.join(dir, id, 'zones'))) {
      const raw = await read(`zones/${f}`);
      if (!raw) continue;
      const found = zoneProblems(raw, { items: items.list.map((i) => i.id), abilities: abilities.ids, tiles, themes: Object.keys(themes) });
      if (raw.id !== f.slice(0, -5)) found.unshift(`"id" must be "${f.slice(0, -5)}", the name of the file`);
      if (found.length) { problems.push(...found.map((p) => `${where(`zones/${f}`)}: ${p}`)); continue; }
      const zone = Object.assign(parseZone(raw, tiles), { pack: id, unlock: pack.unlock, themeName: raw.theme || meta?.theme || 'day' });
      // A mission's overrides start from the map file and are checked the same way (overrides.js).
      Object.defineProperties(zone, {
        raw: { value: raw }, themes: { value: themes },
        deps: { value: { items: items.list.map((i) => i.id), abilities: abilities.ids, tiles, themes: Object.keys(themes) } },
      });
      zones.push(zone);
      pack.zones.push(raw.id);
    }
    if (!zones.length && !problems.length) problems.push(`scenarios/${id}: a pack needs at least one map in zones/`);
    if (zones.length && !zones.some((z) => z.spawns.length)) problems.push(`scenarios/${id}: no map has player starts ("p"). At least one map needs 6 or more.`);
    // Maps linked by exits become one atlas (atlas.js): exits must lead somewhere, and object ids must be unique in the pack.
    const owner = new Map();
    for (const z of zones) for (const o of z.objects) {
      const file = where(`zones/${z.id}.json`);
      if (owner.has(o.id)) problems.push(`${file}: the object id "${o.id}" is also used in the map "${owner.get(o.id)}". Object ids must be unique in a pack.`);
      else owner.set(o.id, z.id);
      if (o.kind !== 'exit') continue;
      const to = zones.find((x) => x.id === o.to);
      if (!to) problems.push(`${file}, object "${o.id}": "to" is "${o.to}", which is not a map of this pack. Maps: ${zones.map((x) => x.id).join(', ')}`);
      else if (!to.objects.some((x) => x.id === o.arrive && x.kind === 'exit')) problems.push(`${file}, object "${o.id}": "arrive" is "${o.arrive}", which is not an exit of the map "${o.to}"`);
    }
    const own = Object.fromEntries(zones.map((z) => [z.id, z]));
    for (const f of await jsonFiles(path.join(dir, id, 'missions'))) {
      const raw = await read(`missions/${f}`);
      if (!raw) continue;
      if (raw.id !== f.slice(0, -5)) { problems.push(`${where(`missions/${f}`)}: "id" must be "${f.slice(0, -5)}", the name of the file`); continue; }
      if (raw.zone && !own[raw.zone] && zones.length) { problems.push(`${where(`missions/${f}`)}: "zone" must be one of this pack's maps: ${pack.zones.join(', ')}`); continue; }
      const m = { ...raw, zone: raw.zone || pack.zones[0], pack: id, file: where(`missions/${f}`) };
      if (zones.length) { try { normalizeMission(m, own, items); } catch (e) { problems.push(`${m.file}: ${e.message}`); continue; } }
      missions.push(m);
    }
    for (const f of await jsonFiles(path.join(dir, id, 'cards'))) {
      const raw = await read(`cards/${f}`);
      if (!raw) continue;
      const r = validateCard(raw);
      if (r.error) problems.push(`${where(`cards/${f}`)}: ${r.error}`);
      else if (raw.id !== f.slice(0, -5)) problems.push(`${where(`cards/${f}`)}: "id" must be "${f.slice(0, -5)}", the name of the file`);
      else cards.push({ ...r.card, pack: id });
    }
    if (problems.length) { errors.push(...problems); failed.add(id); }
    else loaded.push({ pack, zones, missions, cards });
  }

  // Ids that the game keys on must be unique across packs: maps, missions, cards and landmarks
  // (a group's saved island lists the landmarks it restored by id).
  const out = { packs: {}, zones: {}, missions: [], cards: [], errors, failed };
  const seen = { zone: new Map(), mission: new Map(), card: new Map(), landmark: new Map() };
  const clash = (kind, key, pack) => {
    const other = seen[kind].get(key);
    if (other && other !== pack) { errors.push(`scenarios/${pack}: the ${kind} id "${key}" is already used in the pack "${other}". Ids must be unique across packs.`); return true; }
    seen[kind].set(key, pack);
    return false;
  };
  for (const { pack, zones, missions, cards } of loaded.sort((a, b) => a.pack.order - b.pack.order || a.pack.id.localeCompare(b.pack.id))) {
    const bad = [...zones.map((z) => clash('zone', z.id, pack.id)), ...zones.flatMap((z) => z.landmarks.map((l) => clash('landmark', l.id, pack.id))),
      ...missions.map((m) => clash('mission', m.id, pack.id)), ...cards.map((c) => clash('card', c.id, pack.id))];
    if (bad.some(Boolean)) { failed.add(pack.id); continue; }
    out.packs[pack.id] = pack;
    for (const z of zones) out.zones[z.id] = z;
    out.missions.push(...missions);
    out.cards.push(...cards);
  }
  if (!Object.keys(out.zones).length && !errors.length) errors.push('scenarios: no pack found');
  return out;
}

// Reads the packs again and updates `content` in place, so everything that holds it sees the new version.
// A pack that now has a mistake keeps its last good version (its mistakes are in content.errors and its id
// in content.kept). Missions that are running keep the maps they started with.
export async function reloadContent(content, contentDir, deps) {
  const next = await loadContent(contentDir, deps);
  const kept = [];
  for (const id of next.failed) {
    if (!content.packs[id] || next.packs[id]) continue;
    kept.push(id);
    next.packs[id] = content.packs[id];
    for (const z of Object.values(content.zones)) if (z.pack === id) next.zones[z.id] = z;
    next.missions.push(...content.missions.filter((m) => m.pack === id));
    next.cards.push(...content.cards.filter((c) => c.pack === id));
  }
  // Maps in pack order: the first pack's first map is where every group starts.
  const order = Object.values(next.packs).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const zones = order.flatMap((p) => p.zones.map((id) => next.zones[id]).filter(Boolean));
  for (const k of Object.keys(content.zones)) delete content.zones[k];
  for (const z of zones) content.zones[z.id] = z;
  for (const k of Object.keys(content.packs)) delete content.packs[k];
  for (const p of order) content.packs[p.id] = p;
  content.missions.splice(0, content.missions.length, ...next.missions);
  content.cards.splice(0, content.cards.length, ...next.cards);
  content.errors = next.errors;
  content.kept = kept;
  content.version = (content.version || 0) + 1;
  return content;
}

// Watches data/scenarios and reloads after a change (a short pause first: editors save in several steps).
// Where the system cannot watch a folder tree, it looks every 2 seconds instead. Returns { close }.
export function watchContent(content, contentDir, deps, onReload) {
  const dir = path.join(contentDir, 'scenarios');
  let timer = null, closed = false, busy = Promise.resolve();
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { busy = busy.then(async () => { if (!closed) onReload(await reloadContent(content, contentDir, deps)); }).catch(console.error); }, 300);
  };
  let watcher = null, poll = null;
  try { watcher = watchFiles(dir, { recursive: true }, changed); watcher.on('error', () => {}); }
  catch {
    let last = '';
    const stamp = async () => {
      const files = await fs.readdir(dir, { recursive: true }).catch(() => []);
      const parts = await Promise.all(files.map(async (f) => { const s = await fs.stat(path.join(dir, f)).catch(() => null); return s ? `${f}:${s.mtimeMs}:${s.size}` : ''; }));
      return parts.sort().join('|');
    };
    stamp().then((s) => { last = s; });
    poll = setInterval(async () => { const s = await stamp(); if (s !== last) { last = s; changed(); } }, 2000);
  }
  return { close() { closed = true; clearTimeout(timer); watcher?.close(); clearInterval(poll); } };
}
