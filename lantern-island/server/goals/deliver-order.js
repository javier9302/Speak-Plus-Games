// Bring items to characters in a given order ("order": [{ "to", "item" }]). A clue should say who comes first.
// A character whose turn has not come says so; nothing is lost.
import { KINDS } from '../kinds/index.js';
import { shuffled } from '../random.js';
export default {
  type: 'deliver-order',
  label: 'Deliveries',
  about: 'Bring items to characters in order: "order": [{ "to": a character, "item": an item }, ...]. Talk to the character while carrying the item. Clues should say the order.',
  fields: { order: 'the deliveries in order: [{ "to": the id of a character, "item": an item id }]', shuffle: 'true: a new order every run (clues give it with {deliveries})' },
  normalize(raw, c) {
    const npcs = c.objectsOf((k) => !!k.character).map((o) => o.id);
    const order = raw.order ?? c.base.order;
    if (!Array.isArray(order) || !order.length) { c.fail('goal: a "deliver-order" goal needs "order": [{ "to": a character, "item": an item }, ...]'); return null; }
    for (const [i, d] of order.entries()) {
      if (!npcs.includes(d?.to)) c.fail(`goal: delivery ${i + 1}: "to" must be a character of this map.${c.didYouMean(d?.to, npcs)}`);
      if (!c.items.byId[d?.item]) c.fail(`goal: delivery ${i + 1}: "${d?.item}" is not an item.${c.didYouMean(d?.item, Object.keys(c.items.byId))}`);
    }
    return { order: order.map((d) => ({ to: d.to, item: d.item })), shuffle: !!raw.shuffle, label: raw.label };
  },
  random: (goal) => goal.shuffle,
  run: (goal, rnd) => (goal.shuffle && rnd ? { ...goal, order: shuffled(goal.order, rnd) } : goal),
  placeholders: (goal, c) => ({ deliveries: goal.order.map((d) => `the ${c.itemName(d.item)} to the ${c.name(d.to)}`).join(', then ') }),
  describe: (goal) => `${goal.order.length} deliveries in order`,
  start: () => ({ next: 0 }),
  progress: (room, goal) => ({ have: room.goalState.next, need: goal.order.length, done: room.goalState.next >= goal.order.length }),
  afterAct(room, p, t, ability, ctx) {
    const goal = room.mission.goal, st = room.goalState;
    if (ability !== 'talk' || !KINDS[t.kind].character || st.next >= goal.order.length) return null;
    const now = goal.order[st.next];
    if (now.to !== t.id) return goal.order.slice(st.next).some((d) => d.to === t.id) ? { npc: { name: t.name, text: 'Not yet! Somebody else is waiting first.' } } : null;
    const i = p.items.findIndex((it) => it.item === now.item && !it.courier);
    if (i < 0) return { npc: { name: t.name, text: `Please bring me a ${ctx.itemName(now.item)}.` } };
    p.items.splice(i, 1);
    st.next++;
    return { npc: { name: t.name, text: `A ${ctx.itemName(now.item)}! Thank you!`, good: true }, changed: true };
  },
  solver(s) {
    let next = 0;
    const order = s.mission.goal.order;
    return {
      step() {
        if (next >= order.length) return false;
        const d = order[next], npc = s.byId[d.to];
        for (const i of s.owners('talk')) {
          if (!s.reach(i, npc) || !s.canGet(i, d.item)) continue;
          s.take(i, d.item); s.used.add('talk'); s.log.push(`Talk: the ${npc.name.toLowerCase()}, with the ${d.item}`); s.record({ k: 'give-npc', i, thing: npc.id, item: d.item }); next++;
          return true;
        }
        return false;
      },
      done: () => next >= order.length,
      why: () => { const d = order[next]; if (!d) return []; return [`the ${s.byId[d.to].name.toLowerCase()} never gets the ${d.item} (delivery ${next + 1} of ${order.length})`]; },
    };
  },
  sheet: (goal, c) => `deliveries in order: ${goal.order.map((d) => `${c.itemName(d.item)} to the ${c.name(d.to)}`).join(', then ')}`,
};
