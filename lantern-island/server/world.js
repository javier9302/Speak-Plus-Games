// The map: loading a zone, what blocks the way, and moving a player.
// Positions are in tiles; (x, y) is the middle of a character's feet.
const SOLID = new Set(['~', 'T', 'R']);
const KNOWN = new Set(['~', ',', '.', '#', '=', 'T', 'R', 'p']);
export { KNOWN as TILES, SOLID as SOLID_TILES };
export const SPEED = 4.5;        // tiles per second
export const REACH = 1.5;        // how close (in tiles) a player must be to use an object
const HALF_W = 0.3, UP = 0.3, DOWN = 0.12;   // the box around the feet that must stay on walkable tiles

// A zone from its JSON (a scenario pack's zones/<id>.json, see content.js). Throws with the reason if it is wrong.
export function parseZone(raw) {
  const id = raw.id;
  const rows = raw.rows;
  if (!Array.isArray(rows) || !rows.length) throw new Error(`Zone ${id}: no rows`);
  const w = rows[0].length, spawns = [];
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`Zone ${id}: row ${y} is ${row.length} wide, expected ${w}`);
    [...row].forEach((ch, x) => {
      if (!KNOWN.has(ch)) throw new Error(`Zone ${id}: unknown tile "${ch}" at ${x},${y}`);
      if (ch === 'p') spawns.push({ x: x + 0.5, y: y + 0.6 });
    });
  });
  if (spawns.length < 6) throw new Error(`Zone ${id}: needs 6 player starts ("p"), has ${spawns.length}`);

  // Slots: named lists of tiles. An object with "slot" stands on one of them, a different one each run (run.js).
  // Here it gets the first free tile of its slot: the layout as written (seed 0).
  const slots = Object.fromEntries(Object.entries(raw.slots || {}).map(([k, tiles]) => [k, tiles.map(([x, y]) => ({ x, y }))]));
  const nextOf = {};
  // Objects stand on a tile. What they are and do is in things.js.
  const objects = [], seen = new Set(), taken = new Set();
  for (const raw0 of raw.objects || []) {
    const o = { ...raw0 };
    const where = `Zone ${id}, object "${o.id}"`;
    if (!o.id || seen.has(o.id)) throw new Error(`${where}: every object needs its own id`);
    seen.add(o.id);
    if (o.slot) {
      const tile = slots[o.slot]?.[nextOf[o.slot] = (nextOf[o.slot] ?? -1) + 1];
      if (!tile) throw new Error(`${where}: the slot "${o.slot}" has no free tile left`);
      o.x = tile.x; o.y = tile.y;
    }
    for (const f of o.floods || []) { const tile = rows[f.y]?.[f.x]; if (!tile || SOLID.has(tile)) throw new Error(`${where}: flooded tile ${f.x},${f.y} must be ground`); }
    for (const at of [o, o.to].filter(Boolean)) {
      const tile = rows[at.y]?.[at.x];
      if (!tile || SOLID.has(tile) || tile === 'p') throw new Error(`${where}: ${at.x},${at.y} is not free ground`);
      if (taken.has(`${at.x},${at.y}`)) throw new Error(`${where}: another object is already at ${at.x},${at.y}`);
      taken.add(`${at.x},${at.y}`);
    }
    objects.push({ ...o, name: String(o.name || o.kind) });
  }
  // Clients draw "p" as grass.
  // Landmarks: what missions restore. Solid ones block their tiles whether restored or not,
  // so the paths of the island never change with a group's progress.
  const landmarks = (raw.landmarks || []).map((l) => ({ id: l.id, name: String(l.name || l.id), art: l.art || l.id, x: l.x, y: l.y, w: l.w || 1, h: l.h || 1, solid: !!l.solid }));
  const fixed = new Set();
  for (const l of landmarks) {
    for (let dy = 0; dy < l.h; dy++) for (let dx = 0; dx < l.w; dx++) {
      const key = `${l.x + dx},${l.y + dy}`;
      if (taken.has(key) || rows[l.y + dy]?.[l.x + dx] === 'p') throw new Error(`Zone ${id}, landmark "${l.id}": ${key} is taken by an object or a player start`);
      if (l.solid) fixed.add(key);
    }
  }
  const places = (raw.places || []).filter((p) => p.id && p.name && Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({ id: p.id, name: String(p.name), x: p.x, y: p.y }));
  // `pack` and `unlock` (landmarks a group must have restored before this zone opens) come from the pack (content.js).
  return { id: raw.id, name: raw.name, w, h: rows.length, rows: rows.map((r) => r.replace(/p/g, ',')), spawns, objects, places, landmarks, fixed, goal: raw.goal || null,
    slots, shuffle: Array.isArray(raw.shuffle) ? raw.shuffle : [] };
}

// `block` is a set of "x,y" tiles taken by things (closed gates, chests...). It changes during the game.
export function solidAt(zone, x, y, block) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= zone.w || ty >= zone.h) return true;
  return SOLID.has(zone.rows[ty][tx]) || zone.fixed.has(`${tx},${ty}`) || !!block?.has(`${tx},${ty}`);
}

const blocked = (zone, x, y, block) =>
  solidAt(zone, x - HALF_W, y - UP, block) || solidAt(zone, x + HALF_W, y - UP, block) ||
  solidAt(zone, x - HALF_W, y + DOWN, block) || solidAt(zone, x + HALF_W, y + DOWN, block);

// Moves player p by its input (ix, iy) for dt seconds. Each axis is tried
// on its own so characters slide along walls.
export function stepPlayer(zone, p, dt, block) {
  const len = Math.hypot(p.ix, p.iy);
  p.moving = len > 0.15;
  if (!p.moving) return;
  const k = (len > 1 ? 1 / len : 1) * SPEED * dt;
  const nx = p.x + p.ix * k, ny = p.y + p.iy * k;
  // A player caught inside something (a gate closed on them, a rock pushed onto them) may always walk out.
  const stuck = blocked(zone, p.x, p.y, block);
  if (stuck || !blocked(zone, nx, p.y, block)) { if (!blocked(zone, nx, p.y)) p.x = nx; }
  if (stuck || !blocked(zone, p.x, ny, block)) { if (!blocked(zone, p.x, ny)) p.y = ny; }
  p.dir = Math.abs(p.ix) > Math.abs(p.iy) ? (p.ix < 0 ? 1 : 2) : (p.iy < 0 ? 3 : 0);   // 0 down, 1 left, 2 right, 3 up
}
