// The 12 abilities and how they are shared out. The tables are in data/abilities.json.
import fs from 'node:fs/promises';
import path from 'node:path';

export async function loadAbilities(contentDir) {
  const raw = JSON.parse(await fs.readFile(path.join(contentDir, 'abilities.json'), 'utf8'));
  const ids = raw.abilities.map((a) => a.id);
  for (let n = 2; n <= 6; n++) {
    const sets = raw.assignments[n];
    if (!Array.isArray(sets) || sets.length !== n) throw new Error(`abilities.json: "assignments" needs ${n} lists for ${n} players`);
    const all = sets.flat();
    const missing = ids.filter((id) => !all.includes(id)), extra = all.filter((id, i) => !ids.includes(id) || all.indexOf(id) !== i);
    if (missing.length || extra.length) throw new Error(`abilities.json, ${n} players: missing [${missing}] repeated or unknown [${extra}]`);
  }
  return {
    list: raw.abilities, ids,
    byId: Object.fromEntries(raw.abilities.map((a) => [a.id, a])),
    assignments: raw.assignments,
    spread: (raw.random?.spread || []).map((l) => l.filter((id) => ids.includes(id))),
    together: (raw.random?.together || []).map((l) => l.filter((id) => ids.includes(id))),
  };
}

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// The preset sets for n players, in join order. With mix = true the same sets go to different players.
export function dealPreset(abilities, n, mix = false) {
  if (n < 2) return [[...abilities.ids]];                 // alone (testing): everything
  const sets = abilities.assignments[n].map((s) => [...s]);
  return mix ? shuffled(sets) : sets;
}

// "Random with constraints": same set sizes as the preset, abilities drawn at random,
// and each "spread" list shared among as many players as possible.
export function dealRandom(abilities, n) {
  if (n < 2) return [[...abilities.ids]];
  const sizes = shuffled(abilities.assignments[n].map((s) => s.length));
  const fair = (sets) => abilities.spread.every((list) => sets.every((s) => s.filter((id) => list.includes(id)).length <= Math.ceil(list.length / n)))
    && abilities.together.every((list) => sets.some((s) => list.every((id) => s.includes(id))));
  let sets;
  for (let tries = 0; tries < 3000; tries++) {
    const pool = shuffled(abilities.ids);
    sets = sizes.map((size) => pool.splice(0, size));
    if (fair(sets)) break;
  }
  // Keep the order of the ability list inside each set, so role cards read the same way every time.
  return sets.map((s) => abilities.ids.filter((id) => s.includes(id)));
}
