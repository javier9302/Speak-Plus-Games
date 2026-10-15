// A big rock. Push moves it between where it stands and its "to" tile.
const move = (t) => { const to = t.st === 'a' ? t.def.to : t.def; t.x = to.x; t.y = to.y; t.st = t.st === 'a' ? 'b' : 'a'; };
export default {
  kind: 'boulder',
  about: 'A big rock. Push moves it to its "to" tile, and back.',
  fields: { to: 'where Push moves it: { "x": 1, "y": 2 }' },
  check: (o, v) => { if (!(Number.isInteger(o.to?.x) && Number.isInteger(o.to?.y))) v.problem('a boulder needs "to": { x, y }'); },
  start: () => ({ st: 'a' }),
  force: (t) => { move(t); return 'moved'; },
  cleared: (t) => t.st === 'b',
  how: () => 'Push rolls it aside.',
  actions: [
    {
      ability: 'push', when: () => true, progress: (t) => t.st === 'a',
      guard: (t, c) => { const d = t.st === 'a' ? t.def.to : t.def; return c.someoneOn(d.x, d.y) ? 'Somebody is in the way.' : null; },
      do: move, say: () => 'You moved it.',
    },
  ],
};
