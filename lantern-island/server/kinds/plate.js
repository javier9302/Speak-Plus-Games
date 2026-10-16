// A flat stone. While a player stands on it, its target (a gap or a gate) lets everybody else through.
export default {
  kind: 'plate',
  about: 'A flat stone. While a player stands on it, its target (a broken bridge or a gate) lets everybody else through. No ability needed.',
  fields: { target: 'the id of the gap or gate it holds open (leave it out for a plate that a barrier lists in "playersOn")' },
  check: (o, v) => { if (o.target) v.object(o.target, 'target', (k) => k.holdable, 'something a plate can hold open (a gap or a gate)'); },
  rules: (t, things) => (!t.def.target && !things.some((b) => b.kind === 'barrier' && [].concat(b.def.requires ?? []).some((r) => r.playersOn?.includes(t.id))) ? `${t.name}: it has no "target" and no barrier lists it in "playersOn", so it does nothing` : null),
  solid: () => false,
  holdsOpen: (t) => t.def.target,
  how: () => 'No ability. While a player stands on it, everybody can cross the broken bridge.',
  tick(t, c) {
    const down = c.someoneOn(t.x, t.y), target = t.def.target && c.byId(t.def.target);
    if (!target) { const st = down ? 'down' : 'x'; if (t.st === st) return false; t.st = st; return true; }     // a plate for a barrier's "playersOn": it only shows that somebody stands on it
    if (down === target.held) return false;
    target.held = down; t.st = down ? 'down' : 'x';
    return true;
  },
};
