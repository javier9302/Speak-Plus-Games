// npm run check
// For every scenario pack (data/scenarios), every map and every mission template, with 2 to 6 players: can it be finished, does
// every player have something they are needed for, and are the design rules respected?
// Prints a report and ends with an error if anything is wrong.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadContent } from './content.js';
import { loadAbilities, dealPreset } from './abilities.js';
import { normalizeMission } from './missions.js';
import { inspect, zoneRules } from './solver.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function runCheck(contentDir = path.join(root, 'data'), dataDir = contentDir) {
  const lines = [], errors = [];
  const say = (s = '') => lines.push(s);
  const fail = (s) => { errors.push(s); lines.push(`  FAIL  ${s}`); };

  const abilities = await loadAbilities(contentDir);
  const itemFile = JSON.parse(await fs.readFile(path.join(contentDir, 'items.json'), 'utf8'));
  const items = { list: itemFile.items, byId: Object.fromEntries(itemFile.items.map((i) => [i.id, i])) };
  const name = (a) => abilities.byId[a].name;
  const content = await loadContent(contentDir, { abilities, items });
  for (const e of content.errors) fail(e);
  const zones = content.zones;

  // The packs' missions, and the teacher's own templates (storage, data/missions) that do not share an id with one.
  const readAll = async (dir) => { try { return Promise.all((await fs.readdir(dir)).filter((f) => f.endsWith('.json')).map(async (f) => JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')))); } catch { return []; } };
  const templates = [...content.missions, ...(await readAll(path.join(dataDir, 'missions'))).filter((t) => !content.missions.some((m) => m.id === t.id))];

  for (const zone of Object.values(zones)) {
    say(`PACK ${zone.pack}, MAP: ${zone.name}  (${zone.objects.length} objects, ${zone.landmarks.length} landmarks)`);

    const all = normalizeMission({ id: 'whole-zone', title: `Whole zone: every tablet of ${zone.name}`, zone: zone.id, goal: { ...zone.goal, items: Object.fromEntries(Object.keys(zone.goal.items).map((k) => [k, 99])) }, stations: zone.objects.filter((o) => o.kind === 'station').map((o) => ({ at: o.id })) }, zones, items);
    const missions = [all];
    for (const t of templates.filter((m) => (m.zone || Object.keys(zones)[0]) === zone.id)) { try { missions.push(normalizeMission(t, zones, items)); } catch (e) { fail(`${t.file || 'data/missions/' + t.id + '.json'}: ${e.message}`); } }

    for (const mission of missions) {
      say();
      say(`  ${mission.title}  (${mission.stations.length} tablets, goal: ${Object.values(mission.goal.items)[0]} ${Object.keys(mission.goal.items)[0]}s)`);
      for (let n = 2; n <= 6; n++) {
        const sets = dealPreset(abilities, n);
        const r = inspect(zone, mission, sets, abilities.ids);
        if (!r.ok) { fail(`${mission.title}, ${n} players: cannot be finished. ${r.problems.join('; ')}`); continue; }
        const notes = [];
        if (r.idle.length) fail(`${mission.title}, ${n} players: player ${r.idle.map((i) => i + 1).join(' and ')} (${r.idle.map((i) => sets[i].map(name).join('/')).join('; ')}) is never needed`);
        if (mission === all && r.required.length < abilities.ids.length) fail(`${zone.name}, ${n} players: the zone can be finished without ${abilities.ids.filter((a) => !r.required.includes(a)).map(name).join(', ')}`);
        else if (r.required.length < abilities.ids.length) notes.push(`not needed here: ${abilities.ids.filter((a) => !r.required.includes(a)).map(name).join(', ')}`);
        for (const rule of mission === all ? zoneRules(zone, all, sets, abilities.ids) : []) fail(`${zone.name}, ${n} players: ${rule}`);
        say(`    ok    ${n} players: can be finished in ${r.log.length} steps; every player is needed${notes.length ? '  (' + notes.join('; ') + ')' : ''}`);
      }
    }
    say();
    say('  The shortest way through the whole zone, for 3 players:');
    for (const step of inspect(zone, all, dealPreset(abilities, 3), abilities.ids).log) say(`    - ${step}`);
    say();
  }
  say(errors.length ? `${errors.length} PROBLEM${errors.length > 1 ? 'S' : ''} FOUND` : `All packs (${Object.keys(content.packs).join(', ')}), maps and missions are fine for 2 to 6 players.`);
  return { ok: !errors.length, errors, report: lines.join('\n') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await runCheck(path.join(root, 'data'), process.env.DATA_DIR || path.join(root, 'data'));
  console.log('\n' + r.report + '\n');
  process.exit(r.ok ? 0 : 1);
}
