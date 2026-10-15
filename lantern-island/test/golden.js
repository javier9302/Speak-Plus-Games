// The solver's answers for every pack mission (2 to 6 players, the preset deal), kept in test/solver-golden.json.
// A change to the engine must not change how the existing missions are solved. If a change is meant to
// (new content, or a deliberate rule change), write the file again: node test/golden.js --write
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadContent } from '../server/content.js';
import { loadAbilities, dealPreset } from '../server/abilities.js';
import { normalizeMission, zoneFor } from '../server/missions.js';
import { solve } from '../server/solver.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'test', 'solver-golden.json');

export async function solverAnswers() {
  const contentDir = path.join(root, 'data');
  const abilities = await loadAbilities(contentDir);
  const itemFile = JSON.parse(await fs.readFile(path.join(contentDir, 'items.json'), 'utf8'));
  const items = { list: itemFile.items, byId: Object.fromEntries(itemFile.items.map((i) => [i.id, i])) };
  const content = await loadContent(contentDir, { abilities, items });
  const out = {};
  for (const raw of content.missions) {
    const m = normalizeMission(raw, content.zones, items);
    for (let n = 2; n <= 6; n++) { const r = solve(zoneFor(m, content.zones), m, dealPreset(abilities, n)); out[`${m.id} ${n}`] = { ok: r.ok, log: r.log, problems: r.problems }; }
  }
  return out;
}
export const golden = async () => JSON.parse(await fs.readFile(file, 'utf8'));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--write')) {
  await fs.writeFile(file, JSON.stringify(await solverAnswers(), null, 1) + '\n');
  console.log(`Wrote ${file}`);
}
