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
import { checkObject } from './things.js';
import { validateCard } from './cards.js';

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
    try {
      if (!ID.test(id)) throw new Error(`scenarios/${id}: a pack folder name uses small letters, numbers and dashes only`);
      const meta = await readJson(path.join(dir, id, 'pack.json'), where('pack.json'));
      if (meta.id !== id) throw new Error(`${where('pack.json')}: "id" must be "${id}", the name of its folder`);
      const pack = { id, name: String(meta.name || id), story: String(meta.story || ''), order: Number(meta.order) || 0, unlock: Math.max(0, Number(meta.unlock?.landmarks) || 0), zones: [] };
      const zones = [], missions = [], cards = [];
      for (const f of await jsonFiles(path.join(dir, id, 'zones'))) {
        const raw = await readJson(path.join(dir, id, 'zones', f), where(`zones/${f}`));
        if (raw.id !== f.slice(0, -5)) throw new Error(`${where(`zones/${f}`)}: "id" must be "${f.slice(0, -5)}", the name of the file`);
        let zone;
        try { zone = parseZone(raw); } catch (e) { throw new Error(`${where(`zones/${f}`)}: ${e.message}`); }
        for (const o of zone.objects) {
          const bad = checkObject(o, items.list.map((i) => i.id), abilities.ids);
          if (bad.length) throw new Error(`${where(`zones/${f}`)}, object "${o.id}": ${bad.join('; ')}`);
        }
        zones.push(Object.assign(zone, { pack: id, unlock: pack.unlock }));
        pack.zones.push(zone.id);
      }
      if (!zones.length) throw new Error(`scenarios/${id}: a pack needs at least one map in zones/`);
      for (const f of await jsonFiles(path.join(dir, id, 'missions'))) {
        const raw = await readJson(path.join(dir, id, 'missions', f), where(`missions/${f}`));
        if (raw.id !== f.slice(0, -5)) throw new Error(`${where(`missions/${f}`)}: "id" must be "${f.slice(0, -5)}", the name of the file`);
        if (raw.zone && !pack.zones.includes(raw.zone)) throw new Error(`${where(`missions/${f}`)}: "zone" must be one of this pack's maps: ${pack.zones.join(', ')}`);
        missions.push({ ...raw, zone: raw.zone || pack.zones[0], pack: id, file: where(`missions/${f}`) });
      }
      for (const f of await jsonFiles(path.join(dir, id, 'cards'))) {
        const r = validateCard(await readJson(path.join(dir, id, 'cards', f), where(`cards/${f}`)));
        if (r.error) throw new Error(`${where(`cards/${f}`)}: ${r.error}`);
        cards.push({ ...r.card, pack: id });
      }
      loaded.push({ pack, zones, missions, cards });
    } catch (e) { errors.push(e.message); }
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
