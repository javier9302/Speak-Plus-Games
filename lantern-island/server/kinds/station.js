// A stone tablet with a challenge card. Its ability ("by", default Use) shows the card; the right answer
// solves it: its reward item appears (Pick up) and the gate it names opens.
export default {
  kind: 'station',
  about: 'A stone tablet with a challenge card. Its ability ("by", default Use) shows the card; the right answer solves it and its reward appears.',
  fields: { by: 'the ability that opens the card (default "use")', reward: '{ "item": an item that appears when solved, "open": the id of a gate it opens }', card: 'the card it prefers: { "type", "level" } (a mission can choose another)' },
  card: true,
  check(o, v) {
    v.ability(o.by || 'use', 'by');
    if (o.reward?.item) v.item(o.reward.item, 'reward item');
    if (o.reward?.open) v.object(o.reward.open, 'reward.open');
  },
  start: () => ({ st: 'new' }),
  passed: (t) => t.st === 'solved' && !t.holds,
  how: (o, itemName) => `Use shows its challenge card.${o.reward?.item ? ` Solved: a ${itemName(o.reward.item)} appears. Pick up.` : ''}`,
  actions: [
    {
      ability: (t) => t.def.by || 'use', when: (t) => t.st !== 'solved', needs: { card: true },
      do(t, c) {
        t.st = 'solved';
        t.holds = t.def.reward?.item || null;
        const gate = t.def.reward?.open && c.byId(t.def.reward.open);
        if (gate) gate.st = 'open';
      },
    },
    { ability: 'pickup', when: (t) => t.st === 'solved' && !!t.holds, gives: true, do: (t) => { t.holds = null; } },
  ],
};
