// One run of a mission, from a seed: where objects with a "slot" stand, what each "shuffle" swaps, and the
// goal's random parts (the order of a sequence, the odd one out). The same seed always gives the same run.
// Seed 0 is the layout as written. A new mission gets a random seed; the server solves that exact run first
// and tries another seed if it cannot be finished (rooms.js). npm run check tries many seeds.
import { goalOf } from './goals/index.js';
import { rng, shuffled } from './random.js';

export { rng, shuffled };

// True if runs of this mission can differ (so npm run check tries many seeds).
export const isRandom = (zone, mission) => Object.keys(zone.slots || {}).length > 0 || (zone.shuffle || []).length > 0 || !!goalOf(mission.goal).random?.(mission.goal);

// The map and mission for one seed: { zone, mission, seed }.
export function makeRun(zone, mission, seed = 0) {
  const rnd = seed ? rng(seed) : null;
  let objects = zone.objects;
  if (rnd && isRandom(zone, mission)) {
    objects = zone.objects.map((o) => ({ ...o }));
    const byId = new Map(objects.map((o) => [o.id, o]));
    for (const [name, tiles] of Object.entries(zone.slots || {})) {
      const order = shuffled(tiles, rnd);
      objects.filter((o) => o.slot === name).forEach((o, i) => { o.x = order[i].x; o.y = order[i].y; });
    }
    for (const sh of zone.shuffle || []) {
      const list = sh.objects.map((id) => byId.get(id)).filter(Boolean);
      const values = shuffled(list.map((o) => o[sh.field]), rnd);
      list.forEach((o, i) => { if (values[i] === undefined) delete o[sh.field]; else o[sh.field] = structuredClone(values[i]); });
    }
  }
  const runZone = objects === zone.objects ? zone : { ...zone, objects };
  const goal = goalOf(mission.goal).run?.(mission.goal, rnd, runZone) || mission.goal;
  return { zone: runZone, mission: goal === mission.goal ? mission : { ...mission, goal }, seed: rnd ? seed : 0 };
}
