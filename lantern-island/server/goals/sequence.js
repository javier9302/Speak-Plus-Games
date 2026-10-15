// Press pads (kind "pad") in the right order. The clues reveal the order. A wrong pad makes every pad go dark,
// and the team starts again; nothing else is lost.
import { KINDS } from '../kinds/index.js';
import { shuffled } from '../random.js';
export default {
  type: 'sequence',
  label: 'Stones',
  about: 'Press pads in the right order ("order": their ids). Clues must reveal the order. A wrong pad makes them all go dark; the team starts again.',
  fields: { order: 'the ids of the pads, in the order to press them (2 or more)', shuffle: 'true: a new order every run (clues give it with {order})' },
  normalize(raw, c) {
    const pads = c.objectsOf((k) => !!k.lit).map((o) => o.id);
    const order = raw.order ?? c.base.order;
    if (!Array.isArray(order) || order.length < 2) { c.fail('goal: a "sequence" goal needs "order": the ids of 2 or more pads, in order'); return null; }
    for (const id of order) if (!pads.includes(id)) c.fail(`goal: "${id}" in "order" is not a pad of this map.${c.didYouMean(id, pads)}`);
    if (new Set(order).size !== order.length) c.fail('goal: a pad appears twice in "order"');
    if (raw.shuffle !== undefined && typeof raw.shuffle !== 'boolean') c.fail('goal: "shuffle" is true or false');
    return { order, shuffle: !!raw.shuffle, label: raw.label };
  },
  describe: (goal) => `${goal.order.length} stones in order${goal.shuffle ? ' (a new order every run)' : ''}`,
  random: (goal) => goal.shuffle,
  run: (goal, rnd) => (goal.shuffle && rnd ? { ...goal, order: shuffled(goal.order, rnd) } : goal),
  placeholders: (goal, c) => ({ order: goal.order.map((id) => `the ${c.name(id)}`).join(', then ') }),
  start: () => ({ next: 0 }),
  progress: (room, goal) => ({ have: room.goalState.next, need: goal.order.length, done: room.goalState.next >= goal.order.length }),
  afterAct(room, p, t) {
    const goal = room.mission.goal, st = room.goalState;
    if (!KINDS[t.kind].lit || st.next >= goal.order.length) return null;
    if (t.id === goal.order[st.next]) {
      st.next++;
      return { say: st.next >= goal.order.length ? 'That was the last one. You did it!' : 'Yes! That is right.', changed: true };
    }
    // Wrong pad: all of them go dark.
    st.next = 0;
    for (const x of room.things) if (KINDS[x.kind].lit) KINDS[x.kind].reset(x);
    return { say: 'Wrong order! The stones go dark. Read your clues and start again.', changed: true };
  },
  // The solver cannot know the order (that is for the team to work out from the clues): every pad must be reachable.
  solver(s) {
    const pads = () => s.mission.goal.order.map((id) => s.byId[id]);
    return {
      done: () => pads().every((t) => KINDS[t.kind].lit(t)),
      why: () => pads().filter((t) => !KINDS[t.kind].lit(t)).map((t) => `the ${t.name.toLowerCase()} can never be pressed`),
    };
  },
  sheet: (goal, c) => `press, in this order: ${goal.order.map(c.name).join(', ')}`,
};
