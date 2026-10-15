// A way to another map of the same pack (a cave mouth, a door, a path). Walking onto it takes the player
// to the exit it names in the other map ("to" the map, "arrive" that map's exit); they land next to it.
// The maps of a pack linked by exits are joined into one atlas (atlas.js), so the rest of the game and the
// solver see one big map; "land" (where a player arrives) is filled in there.
const WAIT_MS = 1200;                    // after going through, a player is not taken back at once
const arch = (inside) => [
  '................',
  '....kkkkkkkk....',
  '...kssssssssk...',
  '..kssk' + inside.repeat(4) + 'kssk..',
  '..ksk' + inside.repeat(6) + 'ksk..',
  '..ksk' + inside.repeat(6) + 'ksk..',
  '..ksk' + inside.repeat(6) + 'ksk..',
  '..ksk' + inside.repeat(6) + 'ksk..',
  '..ksk' + inside.repeat(6) + 'ksk..',
  '..ksk' + inside.repeat(6) + 'ksk..',
  '..ksk' + inside.repeat(6) + 'ksk..',
  '..ksk' + inside.repeat(6) + 'ksk..',
  '..kssk' + inside.repeat(4) + 'kssk..',
  '..kkkkkkkkkkkk..',
  '................',
  '................',
];
export default {
  kind: 'exit',
  about: 'A way to another map of the same pack. Walking onto it takes players to the exit named by "arrive" in the map named by "to"; they land next to it.',
  fields: { to: 'the id of another map of this pack', arrive: 'the id of an exit in that map, where players arrive' },
  check(o, v) {
    if (typeof o.to !== 'string' || !o.to) v.problem('an exit needs "to": the id of another map of this pack');
    if (typeof o.arrive !== 'string' || !o.arrive) v.problem('an exit needs "arrive": the id of an exit in that map');
  },
  solid: () => false,
  fixedPlace: true,                      // never in a slot: where players land is worked out once (atlas.js)
  how: (o) => `Walk onto it to go to ${o.to}.`,
  // Somebody stands on it: off they go (and a character following them comes along).
  tick(t, c) {
    const land = t.def.land;
    if (!land) return false;
    let moved = false;
    for (const p of c.room.players) {
      if (Math.floor(p.x) !== t.x || Math.floor(p.y) !== t.y || (p.exitAt && Date.now() - p.exitAt < WAIT_MS)) continue;
      const from = { x: p.x, y: p.y };
      p.x = land.x + 0.5; p.y = land.y + 0.6; p.exitAt = Date.now();
      for (const f of c.room.things) if (f.following && c.room.goalState?.leader === p.id && Math.hypot(f.x + 0.5 - from.x, f.y + 0.6 - from.y) < 3) { f.x = land.x; f.y = land.y; }
      c.tell?.(p, `You go to ${t.def.toName || 'another place'}.`);
      moved = true;
    }
    return moved;
  },
  art: { pal: { s: '#8b93a7', d: '#1a1c2c' }, states: { default: arch('d') } },
};
