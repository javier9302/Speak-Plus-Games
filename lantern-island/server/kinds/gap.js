// A broken bridge: a player with Jump crosses it; Fix (with the item it names) mends it for everybody.
// A plate can hold it open for the others while somebody stands on the plate.
export default {
  kind: 'gap',
  about: 'A broken bridge. Jump crosses it (only the jumper). Fix mends it for everybody, if it names the item it needs. A plate can let the others cross.',
  fields: { needs: 'the item that fixes it (optional; without it, it cannot be fixed)' },
  check: (o, v) => { if (o.needs) v.item(o.needs, 'needs'); },
  consumes: (o) => (o.needs ? [o.needs] : []),
  start: () => ({ st: 'broken' }),
  solid: (t) => t.st !== 'fixed',
  holdable: true,
  pass: (t, i, s) => t.st === 'fixed' || s.has(i, 'jump') || s.held(i, t),
  force: (t) => { if (t.st === 'fixed') return null; t.st = 'fixed'; return 'fixed'; },
  cleared: (t) => t.st === 'fixed',
  how: (o, itemName) => (o.needs ? `Jump across, or Fix with the ${itemName(o.needs)}.` : 'Jump across. It cannot be fixed.'),
  // Walking across by jumping counts as using Jump.
  markUsed: (t, s) => (t.st === 'broken' && s.owners('jump').some((i) => s.regs[i].has(`${t.x},${t.y}`)) ? ['jump'] : []),
  stuck: (t, s) => (t.st === 'broken' && !s.owners('jump').length ? ['nobody has Jump'] : []),
  rules: (t, things) => (!t.def.needs && !things.some((p) => p.kind === 'plate' && p.def.target === t.id) ? `${t.name}: only a jumper can cross, and there is no plate that lets the others follow` : null),
  actions: [
    {
      ability: 'jump', when: (t) => t.st === 'broken',
      // Land on the far side, straight across from where the player stands.
      run(t, c) {
        const p = c.player, dx = t.x + 0.5 - p.x, dy = t.y + 0.5 - (p.y - 0.1);
        const step = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
        const lx = t.x + step[0], ly = t.y + step[1];
        if (c.room.solid(lx + 0.5, ly + 0.5)) return { nope: 'There is no place to land on the other side.' };
        p.x = lx + 0.5; p.y = ly + 0.6;
        return { changed: true, say: 'You jumped across!' };
      },
    },
    {
      ability: 'fix', when: (t) => t.st === 'broken' && !!t.def.needs, needs: { item: (t) => t.def.needs }, explain: false,
      missing: (t, c) => `You need a ${c.itemName(t.def.needs)} to fix it.`,
      do: (t) => { t.st = 'fixed'; }, say: () => 'Fixed! Everybody can cross now.',
    },
  ],
};
