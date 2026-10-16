// The talk score and the time estimate (solver.js), and the check's warning for missions that need little talking.
// Run with: npm test, or node test/talk.js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../server/content.js';
import { loadAbilities, dealPreset } from '../server/abilities.js';
import { normalizeMission, zoneFor } from '../server/missions.js';
import { solve } from '../server/solver.js';
import { runCheck } from '../server/check.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}

const rows = Array.from({ length: 13 }, (_, y) => (y === 0 || y === 12 ? '~'.repeat(26) : `~${','.repeat(24)}~`)).map((r, y) => {
  if (y === 0 || y === 12) return r;
  const a = [...r];
  if (y !== 6) a[14] = '~';
  if (y === 6) a.splice(3, 6, ...'pppppp');
  return a.join('');
});
const easy = {
  id: 'easy-field', name: 'Easy field', theme: 'day', rows, goal: { type: 'collect', items: { lantern: 1 }, story: 'Take the lantern.' }, places: [], landmarks: [],
  objects: [{ id: 't1', kind: 'station', name: 'Tablet', x: 5, y: 5, reward: { item: 'lantern' } }],
};
const talky = {
  id: 'talky-field', name: 'Talky field', theme: 'day', rows, goal: { type: 'collect', items: { lantern: 1 }, story: 'Take the lantern.' }, places: [], landmarks: [],
  facts: { a: { range: [5, 9] }, b: { pick: [5, 6, 7] } },
  objects: [
    { id: 'gate1', kind: 'gate', name: 'Sum gate', x: 14, y: 6, locked: true, code: { type: 'digits', length: 2, answer: '{sum:a,b}' } },
    { id: 's1', kind: 'sign', name: 'Board', x: 2, y: 2, clues: { read: 'The red house is number {fact:a}.' } },
    { id: 's2', kind: 'bottle', name: 'Bottle', x: 4, y: 2, clues: { look: 'There are {fact:b} birds on the sign.' } },
    { id: 'key1', kind: 'item', name: 'Key', x: 3, y: 9, item: 'key' },
    { id: 'gate2', kind: 'gate', name: 'Back gate', x: 20, y: 6, locked: true, key: 'key' },
    { id: 't2', kind: 'station', name: 'Tablet', x: 22, y: 9, reward: { item: 'lantern' } },
  ],
};
// A wall at x=20 for the second gate.
const talkyRows = rows.map((r, y) => (y > 0 && y < 12 && y !== 6 ? r.slice(0, 20) + '~' + r.slice(21) : r));
talky.rows = talkyRows;

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-talk-'));
  for (const f of ['items.json', 'abilities.json', 'monster.json', 'seed-cards.json', 'themes.json']) await fs.copyFile(path.join(root, 'data', f), path.join(dir, f));
  await fs.cp(path.join(root, 'data', 'scenarios'), path.join(dir, 'scenarios'), { recursive: true });
  const pack = path.join(dir, 'scenarios', 'talktest');
  await fs.mkdir(path.join(pack, 'zones'), { recursive: true });
  await fs.mkdir(path.join(pack, 'missions'), { recursive: true });
  await fs.writeFile(path.join(pack, 'pack.json'), JSON.stringify({ id: 'talktest', name: 'Talk test', order: 9 }));
  await fs.writeFile(path.join(pack, 'zones', 'easy-field.json'), JSON.stringify(easy));
  await fs.writeFile(path.join(pack, 'zones', 'talky-field.json'), JSON.stringify(talky));
  await fs.writeFile(path.join(pack, 'missions', 'easy-one.json'), JSON.stringify({ id: 'easy-one', title: 'Easy one', zone: 'easy-field', stations: [{ at: 't1' }] }));
  await fs.writeFile(path.join(pack, 'missions', 'talky-one.json'), JSON.stringify({ id: 'talky-one', title: 'Talky one', zone: 'talky-field', stations: [{ at: 't2' }] }));

  const abilities = await loadAbilities(dir);
  const it = JSON.parse(await fs.readFile(path.join(dir, 'items.json'), 'utf8'));
  const items = { list: it.items, byId: Object.fromEntries(it.items.map((i) => [i.id, i])) };
  const content = await loadContent(dir, { abilities, items });
  check('the test pack loads', !content.errors.length, content.errors.join(' | '));
  const run = (id, n) => { const m = normalizeMission(content.missions.find((x) => x.id === id), content.zones, items); return solve(zoneFor(m, content.zones), m, dealPreset(abilities, n)); };

  console.log('\nThe talk score');
  const talky2 = run('talky-one', 2), talky6 = run('talky-one', 6), easy3 = run('easy-one', 3);
  check('both missions can be finished', talky2.ok && talky6.ok && easy3.ok);
  check('two facts the Read and Look players found must reach the player who types the code', talky2.stats.facts === 2 && talky6.stats.facts === 2, JSON.stringify([talky2.stats, talky6.stats]));
  check('the key picked up by one player must be handed to the one who uses it', talky2.stats.items >= 1 && talky2.stats.talk === talky2.stats.facts + talky2.stats.items, JSON.stringify(talky2.stats));
  check('a mission with nothing to pass on scores 0', easy3.stats.talk === 0, JSON.stringify(easy3.stats));
  check('the score grows with the talking: the talky mission scores more than the easy one', talky2.stats.talk > easy3.stats.talk);

  console.log('\nThe time estimate');
  check('a perfect team takes some time: the fast figure is positive and below the slow one', talky2.stats.minutes.fast > 0 && talky2.stats.minutes.fast <= talky2.stats.minutes.slow, JSON.stringify(talky2.stats.minutes));
  check('with more players the same mission can be done faster, never slower', talky6.stats.minutes.fast <= talky2.stats.minutes.fast + 0.01, JSON.stringify([talky2.stats.minutes, talky6.stats.minutes]));
  check('a mission with a walk and a code takes longer than one tablet next to the start', talky2.stats.minutes.fast > easy3.stats.minutes.fast);

  console.log('\nThe check');
  const report = await runCheck(dir, dir, 'talktest');
  check('it shows the score and the time for every number of players', /\[talk score \d+; about [<\d]+ to [<\d]+ min for a perfect team\]/.test(report.report) && (report.report.match(/talk score/g) || []).length >= 10);
  check('and warns about the mission that needs no talking, and only that one', /Easy one[\s\S]*?note  this mission may be too easy to finish without talking: 2 players: talk score 0/.test(report.report) && !/Talky one[\s\S]*?note  this mission may be too easy[\s\S]*?Easy field/.test(report.report), report.report.split('\n').filter((l) => l.includes('note')).join(' | ').slice(0, 400));
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
