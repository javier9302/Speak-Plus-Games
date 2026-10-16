// Collect N of an item (from tablets, chests, the ground), counted over everybody's pockets. If the goal names
// a character ("deliver"), one player must then carry them all to it and Talk.
const itemOf = (goal) => Object.keys(goal.items)[0];
export default {
  type: 'collect',
  about: 'Collect a number of one item. With "deliver", one player must then carry them all to a character and Talk.',
  fields: { items: '{ "<item>": how many }', deliver: 'the id of a character (kind "npc") to bring them to (optional)' },
  normalize(raw, c) {
    const [item, wanted] = Object.entries(raw.items || c.base.items || {})[0] || [];
    if (!item || !c.items.byId[item]) { c.fail(item ? `goal: "${item}" is not an item.${c.didYouMean(item, Object.keys(c.items.byId))} Items: ${Object.keys(c.items.byId).join(', ')}` : 'goal: "items" must name an item and how many, for example { "lantern": 3 }'); return null; }
    if (wanted !== undefined && !(Number.isInteger(wanted) && wanted >= 1)) c.fail(`goal: the number of ${item}s must be 1 or more`);
    // Never ask for more than the chosen tablets can give.
    const can = c.stations ? c.stations.filter((s) => c.zone.objects.find((o) => o.id === s.at)?.reward?.item === item).length : 0;
    const need = c.stations ? Math.max(1, Math.min(Number(wanted) || 1, can || 1)) : Math.max(1, Number(wanted) || 1);
    const to = raw.deliver ?? c.base.deliver;
    const deliver = c.objectsOf((k) => k.character).some((o) => o.id === to) ? to : null;
    if (to && !deliver) {
      const o = c.zone.objects.find((x) => x.id === to);
      c.fail(o ? `goal: "deliver" must be a character (kind "npc"), but "${to}" is a ${o.kind}` : `goal: "deliver" is "${to}", which is not an object of this map.${c.didYouMean(to, c.zone.objects.map((x) => x.id))}`);
    }
    return { items: { [item]: need }, deliver, label: raw.label || c.items.byId[item].name };
  },
  wholeZone: (raw) => ({ ...raw, items: Object.fromEntries(Object.keys(raw.items || {}).map((k) => [k, 99])) }),
  describe: (goal) => `${Object.values(goal.items)[0]} ${itemOf(goal)}s`,
  progress(room, goal) {
    const item = itemOf(goal), need = goal.items[item];
    const have = room.players.reduce((n, p) => n + p.items.filter((it) => it.item === item).length, 0);
    const to = goal.deliver && room.things.find((t) => t.id === goal.deliver);
    return { have: Math.min(have, need), need, ready: have >= need, bringTo: to ? to.name : null, done: have >= need && (!to || !!room.goalState.delivered) };
  },
  // Bringing the items to their character: one player must carry them all.
  afterAct(room, p, t, ability) {
    const goal = room.mission.goal, pr = this.progress(room, goal);
    if (ability !== 'talk' || t.id !== goal.deliver || !pr.ready) return null;
    const mine = p.items.filter((it) => it.item === itemOf(goal)).length;
    if (mine >= pr.need) { room.goalState.delivered = true; return { npc: { name: t.name, text: 'You brought them all! Thank you, thank you!', good: true }, changed: true }; }
    return { npc: { name: t.name, text: `You have ${mine}. I need all ${pr.need} from one pair of hands. Ask your team to give them to you!` } };
  },
  solver(s) {
    const item = itemOf(s.mission.goal), need = s.mission.goal.items[item];
    const count = () => s.pool.filter((it) => it.item === item).length;
    return {
      done() {
        if (count() < need) return false;
        const npc = s.byId[s.mission.goal.deliver];
        if (!npc) return true;
        for (const i of s.owners('talk')) {
          if (!s.reach(i, npc) || !s.pool.filter((it) => it.item === item).every((it) => s.closure(it.holder).has(i))) continue;
          for (const it of s.pool) if (it.item === item && it.holder !== i) { if (s.has(it.holder, 'give')) s.used.add('give'); else if (s.has(i, 'pickup')) s.used.add('pickup'); else { s.used.add('give'); s.used.add('pickup'); } }
          s.used.add('talk'); s.log.push(`Talk: the ${npc.name.toLowerCase()}, with the ${item}s`); s.record({ k: 'deliver', i, thing: npc.id, item, need });
          return true;
        }
        return false;
      },
      why(problems) {
        const have = count();
        if (have >= need) return [`the ${item}s cannot be carried to the ${s.byId[s.mission.goal.deliver]?.name.toLowerCase()}: ${!s.owners('talk').length ? 'nobody has Talk' : !s.owners('give').length ? 'the player with Talk is not the one who picks them up, and nobody has Give' : 'the player with Talk cannot get there'}`];
        return problems.length ? [] : [`only ${have} of ${need} ${item}s can be collected`];
      },
    };
  },
  sheet: (goal, c) => `${Object.values(goal.items)[0]} ${c.itemName(itemOf(goal))}s${goal.deliver ? `, carried by one player to the ${c.name(goal.deliver)}` : ''}`,
};
