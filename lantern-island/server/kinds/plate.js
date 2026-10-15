// A flat stone. While a player stands on it, its target (a gap or a gate) lets everybody else through.
export default {
  kind: 'plate',
  about: 'A flat stone. While a player stands on it, its target (a broken bridge or a gate) lets everybody else through. No ability needed.',
  fields: { target: 'the id of the gap or gate it holds open' },
  check: (o, v) => { if (!o.target) v.problem('a plate needs "target": the id of a gap or a gate'); },
  solid: () => false,
  holdsOpen: (t) => t.def.target,
  how: () => 'No ability. While a player stands on it, everybody can cross the broken bridge.',
  tick(t, c) {
    const target = c.byId(t.def.target);
    if (!target) return false;
    const down = c.someoneOn(t.x, t.y);
    if (down === target.held) return false;
    target.held = down; t.st = down ? 'down' : 'x';
    return true;
  },
};
