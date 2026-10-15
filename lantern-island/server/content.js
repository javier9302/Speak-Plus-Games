// Scenario packs: the game's adventures, one folder per pack, data only.
//
//   data/scenarios/<pack>/pack.json          { id (= folder name), name, order?, story?, unlock?: { landmarks: N } }
//   data/scenarios/<pack>/zones/<id>.json    maps with their objects, clues, places and landmarks (world.js parseZone)
//   data/scenarios/<pack>/missions/<id>.json quest templates (missions.js normalizeMission)
//   data/scenarios/<pack>/cards/<id>.json    challenge cards for this pack (cards.js validateCard)
//
// Pack content is edited in these files only. The teacher panel shows pack missions and cards but cannot
// change them; the teacher's own templates and cards stay in storage, as before.
// A pack with a mistake is left out, and the mistake is reported with the file it is in.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseZone } from './world.js';
import { validateCard } from './cards.js';
import { normalizeMission } from './missions.js';
import { zoneProblems, packProblems } from './validate.js';

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

  const loaded = [];
  for (const id of folders) {
    const where = (f) => `scenarios/${id}/${f}`;
    const problems = [];                               // every mistake in this pack, each with its file
    const read = async (f) => { try { return await readJson(path.join(dir, id, f), where(f)); } catch (e) { problems.push(e.message); return null; } };
    if (!ID.test(id)) { errors.push(`scenarios/${id}: a pack folder name uses small letters, numbers and dashes only`); continue; }
    const meta = await read('pack.json');
    if (meta) for (const p of packProblems(meta, id)) problems.push(`${where('pack.json')}: ${p}`);
    const pack = { id, name: String(meta?.name || id), story: String(meta?.story || ''), order: Number(meta?.order) || 0, unlock: Math.max(0, Number(meta?.unlock?.landmarks) || 0), zones: [] };
    const zones = [], missions = [], cards = [];
    for (const f of await jsonFiles(path.join(dir, id, 'zones'))) {
      const raw = await read(`zones/${f}`);
      if (!raw) continue;
      const found = zoneProblems(raw, { items: items.list.map((i) => i.id), abilities: abilities.ids });
      if (raw.id !== f.slice(0, -5)) found.unshift(`"id" must be "${f.slice(0, -5)}", the name of the file`);
      if (found.length) { problems.push(...found.map((p) => `${where(`zones/${f}`)}: ${p}`)); continue; }
      zones.push(Object.assign(parseZone(raw), { pack: id, unlock: pack.unlock }));
      pack.zones.push(raw.id);
    }
    if (!zones.length && !problems.length) problems.push(`scenarios/${id}: a pack needs at least one map in zones/`);
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
    if (problems.length) errors.push(...problems);
    else loaded.push({ pack, zones, missions, cards });
  }

  // Ids that the game keys on must be unique across packs: maps, missions, cards and landmarks
  // (a group's saved island lists the landmarks it restored by id).
  const out = { packs: {}, zones: {}, missions: [], cards: [], errors };
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
    if (bad.some(Boolean)) continue;
    out.packs[pack.id] = pack;
    for (const z of zones) out.zones[z.id] = z;
    out.missions.push(...missions);
    out.cards.push(...cards);
  }
  if (!Object.keys(out.zones).length && !errors.length) errors.push('scenarios: no pack found');
  return out;
}
