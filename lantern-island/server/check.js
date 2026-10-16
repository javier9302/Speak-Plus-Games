// npm run check
// For every scenario pack (data/scenarios), every map and every mission template, with 2 to 6 players: can it be finished, does
// every player have something they are needed for, and are the design rules respected?
// Prints a report and ends with an error if anything is wrong.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadContent } from './content.js';
import { loadAbilities, dealPreset } from './abilities.js';
import { normalizeMission, zoneFor } from './missions.js';
import { inspect, zoneRules, solve } from './solver.js';
import { KINDS, progressOf, abilityOf } from './kinds/index.js';
import { goalOf } from './goals/index.js';
import { makeRun, isRandom } from './run.js';
import { atlasFor } from './atlas.js';
import { GOAL_PLACEHOLDERS } from './validate.js';

const CLUE_PLAYERS = 4;                   // players dealt when each clue is taken away in turn (a clue that matters matters for any number)
const SEEDS = 30;                         // shuffled runs tried for each mission whose runs can differ

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// only: a pack id, to check that pack alone (npm run check -- beach).
export async function runCheck(contentDir = path.join(root, 'data'), dataDir = contentDir, only = null) {
  const lines = [], errors = [];
  const say = (s = '') => lines.push(s);
  const fail = (s) => { errors.push(s); lines.push(`  FAIL  ${s}`); };

  const abilities = await loadAbilities(contentDir);
  const itemFile = JSON.parse(await fs.readFile(path.join(contentDir, 'items.json'), 'utf8'));
  const items = { list: itemFile.items, byId: Object.fromEntries(itemFile.items.map((i) => [i.id, i])) };
  const name = (a) => abilities.byId[a].name;
  const content = await loadContent(contentDir, { abilities, items });
  for (const e of content.errors) if (!only || e.startsWith(`scenarios/${only}/`) || e.startsWith(`scenarios/${only}:`)) fail(e);
  const zones = content.zones;
  if (only && !content.packs[only] && !errors.length) fail(`there is no pack "${only}" (packs: ${Object.keys(content.packs).join(', ')})`);
  // Cards a mission can name: the packs', the samples, and the teacher's own (storage, data/cards).
  const cardIds = new Set([...content.cards.map((c) => c.id), ...JSON.parse(await fs.readFile(path.join(contentDir, 'seed-cards.json'), 'utf8')).map((c) => c.id)]);
  for (const f of await fs.readdir(path.join(dataDir, 'cards')).catch(() => [])) if (f.endsWith('.json')) cardIds.add(f.slice(0, -5));

  // The packs' missions, and the teacher's own templates (storage, data/missions) that do not share an id with one.
  const readAll = async (dir) => { try { return Promise.all((await fs.readdir(dir)).filter((f) => f.endsWith('.json')).map(async (f) => JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')))); } catch { return []; } };
  const templates = [...content.missions, ...(await readAll(path.join(dataDir, 'missions'))).filter((t) => !content.missions.some((m) => m.id === t.id))];

  // Maps with player starts are checked with every map their exits lead to (one atlas, atlas.js).
  const reached = new Set();
  for (const zone of Object.values(zones).filter((z) => (!only || z.pack === only) && z.spawns.length)) {
    const atlas = atlasFor(zone, zones), tablets = atlas.objects.filter((o) => KINDS[o.kind].card).map((o) => ({ at: o.id }));
    for (const r of atlas.regions || [zone]) reached.add(r.id);
    say(`PACK ${zone.pack}, MAP: ${zone.name}${atlas.regions ? ` (with ${atlas.regions.slice(1).map((r) => r.name).join(', ')}, through exits)` : ''}  (${atlas.objects.length} objects, ${atlas.landmarks.length} landmarks)`);

    // Reachability: two players who have every ability must be able to read every clue and finish every object.
    // With slots or shuffles, every run is checked the same way (the seed in a message reproduces it).
    const reachMission = normalizeMission({ id: 'reach', zone: zone.id, goal: goalOf(zone.goal).wholeZone(zone.goal), stations: tablets }, zones, items);
    const unreached = new Set();
    for (const seed of isRandom(atlas, reachMission) ? [0, ...Array.from({ length: SEEDS }, (_, i) => i + 1)] : [0]) {
      const run = makeRun(atlas, reachMission, seed), at = seed ? ` with seed ${seed}` : '';
      const reach = solve(run.zone, run.mission, [abilities.ids, abilities.ids], { explore: true });
      for (const t of reach.things) {
        const say1 = (msg) => { if (!unreached.has(t.id)) { unreached.add(t.id); fail(msg); } };
        for (const a of Object.keys(t.def.clues || {})) if (!reach.clues.has(`${t.id}:${a}`)) say1(`${zone.id}: object "${t.id}" (at ${t.x},${t.y}${at}): its ${name(a)} clue can never be reached`);
        const step = progressOf(t);
        if (step) say1(`${zone.id}: object "${t.id}" (at ${t.x},${t.y}${at}): the team can never ${name(abilityOf(step, t))} it (it cannot be reached, or what it needs never turns up)`);
      }
    }

    const all = normalizeMission({ id: 'whole-zone', title: `Whole zone: every tablet of ${zone.name}`, zone: zone.id, goal: goalOf(zone.goal).wholeZone(zone.goal), stations: tablets }, zones, items);
    const missions = [all];
    for (const t of templates.filter((m) => (m.zone || Object.keys(zones)[0]) === zone.id)) { try { missions.push(normalizeMission(t, zones, items)); } catch (e) { fail(`${t.file || 'data/missions/' + t.id + '.json'}: ${e.message}`); } }

    const neededClues = new Set();
    for (const mission of missions) {
      for (const s of mission.stations) if (s.card && !cardIds.has(s.card)) fail(`${mission.title}: tablet "${s.at}" asks for the card "${s.card}", which does not exist`);
      say();
      say(`  ${mission.title}  (${mission.stations.length} tablets, goal: ${goalOf(mission.goal).describe(mission.goal)})`);
      const base = zoneFor(mission, zones), written = makeRun(base, mission, 0);   // the map as this mission changes it, as written
      // Goal placeholders in clues ({order}...) must be ones this mission's goal fills in.
      const gives = Object.keys(goalOf(written.mission.goal).placeholders?.(written.mission.goal, { name: (x) => x, itemName: (x) => x }) || {});
      for (const o of written.zone.objects) for (const text of Object.values(o.clues || {})) for (const [, ph] of String(text).matchAll(/\{([^}]*)\}/g)) {
        if (GOAL_PLACEHOLDERS.includes(ph) && !gives.includes(ph)) fail(`${mission.title}: the clue of "${o.id}" uses {${ph}}, but this mission's goal (${written.mission.goal.type}) does not fill it in`);
      }
      for (let n = 2; n <= 6; n++) {
        const sets = dealPreset(abilities, n);
        const r = inspect(written.zone, written.mission, sets, abilities.ids);
        if (!r.ok) { fail(`${mission.title}, ${n} players: cannot be finished. ${r.problems.join('; ')}`); continue; }
        const notes = [];
        if (r.idle.length) fail(`${mission.title}, ${n} players: player ${r.idle.map((i) => i + 1).join(' and ')} (${r.idle.map((i) => sets[i].map(name).join('/')).join('; ')}) is never needed`);
        if (mission === all && r.required.length < abilities.ids.length) fail(`${zone.name}, ${n} players: the zone can be finished without ${abilities.ids.filter((a) => !r.required.includes(a)).map(name).join(', ')}`);
        else if (r.required.length < abilities.ids.length) notes.push(`not needed here: ${abilities.ids.filter((a) => !r.required.includes(a)).map(name).join(', ')}`);
        for (const rule of mission === all ? zoneRules(atlas, all, sets, abilities.ids) : []) fail(`${zone.name}, ${n} players: ${rule}`);
        say(`    ok    ${n} players: can be finished in ${r.log.length} steps; every player is needed${notes.length ? '  (' + notes.join('; ') + ')' : ''}`);
      }
      for (const n of goalOf(written.mission.goal).notes?.(written.zone, written.mission.goal) || []) say(`    note  ${n}`);
      // Every clue must be needed: take each one away and the mission must no longer be finishable. A clue counts as
      // needed if some mission of the map (or the whole map) cannot be finished without it; the report is further down.
      {
        const sets = dealPreset(abilities, CLUE_PLAYERS);
        if (solve(written.zone, written.mission, sets).ok) {
          for (const o of written.zone.objects) for (const a of Object.keys(o.clues || {})) {
            if (neededClues.has(`${o.id}:${a}`)) continue;
            if (!solve(written.zone, written.mission, sets, { skipClues: new Set([`${o.id}:${a}`]) }).ok) neededClues.add(`${o.id}:${a}`);
          }
        }
      }
      // Every run must be finishable too (the server never starts one that is not, but a pack should not have them).
      if (mission !== all && isRandom(base, mission)) {
        const bad = [];
        for (let seed = 1; seed <= SEEDS; seed++) for (let n = 2; n <= 6; n++) {
          const run = makeRun(base, mission, seed), r = solve(run.zone, run.mission, dealPreset(abilities, n));
          if (!r.ok) bad.push(`seed ${seed}, ${n} players: ${r.problems.join('; ')}`);
        }
        if (bad.length) fail(`${mission.title}: ${bad.length} of ${SEEDS * 5} shuffled runs cannot be finished, for example ${bad.slice(0, 2).join(' | ')}. Check the slots and shuffles.`);
        else say(`    ok    ${SEEDS} shuffled runs, 2 to 6 players: all can be finished`);
      }
    }
    // A clue that no mission needs: a note, or a FAIL in a pack with "strictClues": true. An object can list the abilities
    // of its atmosphere clues in "extra": ["listen"]. Clues with a goal placeholder ({order}...) count as needed.
    {
      const loose = [];
      for (const o of atlas.objects) for (const [a, text] of Object.entries(o.clues || {})) {
        if (neededClues.has(`${o.id}:${a}`) || (o.extra || []).includes(a) || GOAL_PLACEHOLDERS.some((p) => String(text).includes(`{${p}}`))) continue;
        loose.push(`${o.id} (${name(a)})`);
      }
      const many = loose.length > 1;
      if (loose.length && content.packs[zone.pack]?.strictClues) fail(`${zone.name}: ${loose.length} clue${many ? 's are' : ' is'} not needed by any mission: ${loose.join(', ')}. Remove ${many ? 'them' : 'it'}, make ${many ? 'them' : 'it'} part of a puzzle, or list ${many ? 'them' : 'it'} in the object's "extra".`);
      else if (loose.length) { say(); say(`  note  ${loose.length} clue${many ? 's' : ''} not needed by any mission (${loose.slice(0, 3).join(', ')}${loose.length > 3 ? ', ...' : ''}). "strictClues": true in pack.json makes this an error.`); }
      else { say(); say('  ok    every clue is needed by some mission'); }
    }
    say();
    say('  The shortest way through the whole zone, for 3 players:');
    for (const step of inspect(atlas, all, dealPreset(abilities, 3), abilities.ids).log) say(`    - ${step}`);
    say();
  }
  for (const zone of Object.values(zones).filter((z) => (!only || z.pack === only) && !reached.has(z.id))) {
    fail(`${zone.pack}/${zone.id}: this map has no player starts, and no exit from a map with starts leads to it. Nobody can ever get there.`);
  }
  say(errors.length ? `${errors.length} PROBLEM${errors.length > 1 ? 'S' : ''} FOUND` : `All packs (${Object.keys(content.packs).join(', ')}), maps and missions are fine for 2 to 6 players.`);
  return { ok: !errors.length, errors, report: lines.join('\n') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await runCheck(path.join(root, 'data'), process.env.DATA_DIR || path.join(root, 'data'), process.argv[2] || null);
  console.log('\n' + r.report + '\n');
  process.exit(r.ok ? 0 : 1);
}
