// Make machines work again: N of the map's machines (or of the ones the goal names) must be running.
import { KINDS } from '../kinds/index.js';
const isMachine = (k) => !!k.working;
const list = (goal, things) => things.filter((t) => goal.machines.includes(t.id));
export default {
  type: 'restore',
  label: 'Machines',
  about: 'Make machines work again: Fix them (some need an item). Counts the machines named in "machines", or all of the map\'s.',
  fields: { machines: 'the ids of the machines that count (default: every machine of the map)', count: 'how many must work (default: all of them)' },
  normalize(raw, c) {
    const all = c.objectsOf(isMachine).map((o) => o.id);
    const machines = raw.machines ?? c.base.machines ?? all;
    if (!Array.isArray(machines) || !machines.length) { c.fail('goal: a "restore" goal needs machines (kind "machine") on the map, or a list in "machines"'); return null; }
    for (const id of machines) if (!all.includes(id)) c.fail(`goal: "${id}" in "machines" is not a machine of this map.${c.didYouMean(id, all)}`);
    const count = raw.count ?? c.base.count ?? machines.length;
    if (!(Number.isInteger(count) && count >= 1 && count <= machines.length)) c.fail(`goal: "count" must be 1 to ${machines.length} (the number of machines)`);
    return { machines, count, label: raw.label };
  },
  describe: (goal) => `${goal.count} machine${goal.count > 1 ? 's' : ''}`,
  progress(room, goal) {
    const have = list(goal, room.things).filter((t) => KINDS[t.kind].working(t)).length;
    return { have: Math.min(have, goal.count), need: goal.count, done: have >= goal.count };
  },
  solver(s) {
    const working = () => list(s.mission.goal, s.things).filter((t) => KINDS[t.kind].working(t)).length;
    return {
      done: () => working() >= s.mission.goal.count,
      why: () => [`only ${working()} of ${s.mission.goal.count} machines can be made to work`],
    };
  },
  sheet: (goal, c) => `make ${goal.count} of these work: ${goal.machines.map(c.name).join(', ')}`,
};
