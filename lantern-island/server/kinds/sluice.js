// A water gate: broken -> open <-> closed. Fix it with the item it needs, then Close: the tiles it floods fall dry.
export default {
  kind: 'sluice',
  about: 'A water gate. Broken: Fix it with the item it needs. Then Close: the tiles it floods fall dry. Open floods them again.',
  fields: { needs: 'the item that fixes it', floods: 'the tiles under water while it is not closed: [{ "x": 1, "y": 2 }, ...]' },
  check(o, v) {
    v.item(o.needs, 'needs');
    if (!Array.isArray(o.floods) || !o.floods.length) v.problem('a sluice needs "floods": [{ x, y }, ...]');
  },
  consumes: (o) => (o.needs ? [o.needs] : []),
  start: () => ({ st: 'broken' }),
  floods: (t) => (t.st !== 'closed' ? t.def.floods : []),
  view: (t) => ({ floods: t.st !== 'closed' ? t.def.floods : undefined }),
  force: (t) => { t.st = t.st === 'closed' ? 'open' : 'closed'; return t.st; },
  passed: (t) => t.st === 'closed',
  cleared: (t) => t.st !== 'broken',
  how: (o, itemName) => `Broken. Fix with the ${itemName(o.needs)}, then Close: the sea goes down and the way is dry.`,
  actions: [
    {
      ability: 'fix', when: (t) => t.st === 'broken', needs: { item: (t) => t.def.needs },
      missing: (t, c) => `It is broken. You need a ${c.itemName(t.def.needs)} to fix it.`,
      do: (t) => { t.st = 'open'; }, say: () => 'Fixed! Now somebody can close it.',
    },
    { ability: 'close', when: (t) => t.st === 'open', do: (t) => { t.st = 'closed'; }, say: () => 'The sea goes down!' },
    { ability: 'open', when: (t) => t.st === 'closed', solver: false, guard: (t, c) => (t.def.floods.some((f) => c.someoneOn(f.x, f.y)) ? 'Somebody is walking there. Wait!' : null), do: (t) => { t.st = 'open'; } },
  ],
};
