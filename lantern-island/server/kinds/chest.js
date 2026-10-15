// A chest: Open, then Pick up what is inside. Close shuts it again.
export default {
  kind: 'chest',
  about: 'A chest. Open it, then Pick up what it holds. Close shuts it again.',
  fields: { holds: 'the item inside (optional)' },
  check: (o, v) => { if (o.holds) v.item(o.holds, 'holds'); },
  start: (def) => ({ st: 'closed', holds: def.holds || null }),
  hidesHolds: (t) => t.st === 'closed',
  force: (t) => { t.st = t.st === 'open' ? 'closed' : 'open'; return t.st === 'open' ? 'opened' : 'closed'; },
  passed: (t) => t.st === 'open' && !t.holds,
  how: (o, itemName) => `Open, then Pick up${o.holds ? ` (inside: ${itemName(o.holds)})` : ''}.`,
  actions: [
    { ability: 'open', when: (t) => t.st === 'closed', do: (t) => { t.st = 'open'; }, say: (t, c) => (t.holds ? `There is a ${c.itemName(t.holds)} inside!` : 'It is empty.') },
    { ability: 'close', when: (t) => t.st === 'open', solver: false, do: (t) => { t.st = 'closed'; } },
    { ability: 'pickup', when: (t) => t.st === 'open' && !!t.holds, gives: true, do: (t) => { t.holds = null; } },
  ],
};
