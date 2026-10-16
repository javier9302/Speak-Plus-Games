// An atlas: the maps of a pack that exits link together, joined into one big map. The map a mission starts on
// comes first; the others follow to its right, with GAP tiles of water between them (more than a phone can
// see), at the same height. Exits become teleports: an exit's "land" is the free tile next to the exit it
// arrives at. Players start on the first map. Everything else (objects, places, landmarks, slots) moves with
// its map. A map without exits is used as it is.
//
// The solver walks through exits too: atlas.links maps an exit's tile to its landing tile.
import { KINDS } from './kinds/index.js';
import { solidSet } from './tiles.js';

export const GAP = 16;
const atlases = new WeakMap();

// The maps linked to `start` by exits (start first), using `zones` (id -> zone).
function linked(start, zones) {
  const out = [start], seen = new Set([start.id]);
  for (let i = 0; i < out.length; i++) {
    for (const o of out[i].objects) {
      if (o.kind !== 'exit' || seen.has(o.to) || !zones[o.to] || zones[o.to].pack !== start.pack) continue;
      seen.add(o.to); out.push(zones[o.to]);
    }
  }
  return out;
}

export function atlasFor(start, zones) {
  if (!start.objects.some((o) => o.kind === 'exit')) return start;
  if (atlases.has(start)) return atlases.get(start);
  const maps = linked(start, zones);
  const h = Math.max(...maps.map((z) => z.h));
  const offsets = new Map();
  let w = 0;
  for (const z of maps) { offsets.set(z.id, w); w += z.w + GAP; }
  w -= GAP;
  const rows = Array.from({ length: h }, (_, y) => maps.map((z) => (z.rows[y] ?? '~'.repeat(z.w))).join('~'.repeat(GAP)));
  const shift = (ox) => (p) => ({ ...p, x: p.x + ox });
  const objects = [], places = [], landmarks = [], fixed = new Set(), slots = {}, regions = [], tiles = {}, facts = {}, logic = {}, sprites = {};
  for (const z of maps) {
    const ox = offsets.get(z.id);
    for (const o of z.objects) {
      const m = { ...o, x: o.x + ox, zone: z.id };
      if (o.to && typeof o.to === 'object') m.to = shift(ox)(o.to);
      if (o.floods) m.floods = o.floods.map(shift(ox));
      objects.push(m);
    }
    places.push(...z.places.map(shift(ox)));
    landmarks.push(...z.landmarks.map(shift(ox)));
    for (const k of z.fixed) { const [x, y] = k.split(',').map(Number); fixed.add(`${x + ox},${y}`); }
    for (const [name, list] of Object.entries(z.slots || {})) slots[name] = [...(slots[name] || []), ...list.map(shift(ox))];
    Object.assign(tiles, z.tiles);
    Object.assign(facts, z.facts);
    Object.assign(logic, z.logic);
    Object.assign(sprites, z.sprites);
    regions.push({ id: z.id, name: z.name, x: ox, y: 0, w: z.w, h: z.h, themeName: z.themeName });
  }
  // Exits: where each one lands, and the links the solver walks through.
  const solid = solidSet(tiles);
  const free = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !solid.has(rows[y][x]) && !fixed.has(`${x},${y}`) && !objects.some((o) => o.x === x && o.y === y && KINDS[o.kind].solid({ def: o, st: 'x', ...o }));
  const links = new Map();
  for (const e of objects.filter((o) => o.kind === 'exit')) {
    const target = objects.find((o) => o.kind === 'exit' && o.zone === e.to && o.id === e.arrive);
    if (!target) continue;
    const land = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy })).find((p) => free(p.x, p.y));
    if (!land) continue;
    e.land = land;
    e.toName = maps.find((z) => z.id === e.to)?.name;
    links.set(`${e.x},${e.y}`, land);
  }
  const atlas = {
    ...start, w, h, rows, objects, places, landmarks, fixed, slots, tiles, facts, logic, sprites, solidTiles: solid,
    shuffle: maps.flatMap((z) => z.shuffle || []), regions, links,
  };
  Object.defineProperties(atlas, { themes: { value: start.themes }, raw: { value: start.raw }, deps: { value: start.deps } });
  atlases.set(start, atlas);
  return atlas;
}
