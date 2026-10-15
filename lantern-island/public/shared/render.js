// Draws the map and the characters. Used by the host screen and the phones.
import { TILE, PLAYER_COLORS, charSprite, drawTile, thingSprite, iconCanvas, monsterSprite, landmarkSprite, setKindArt } from './pixel.js';

// Pre-draws the whole zone once (two frames, for the water).
export function createScene(zone) {
  setKindArt(zone.art);                  // pictures of kinds that bring their own
  const make = (frame) => {
    const c = document.createElement('canvas');
    c.width = zone.w * TILE; c.height = zone.h * TILE;
    const g = c.getContext('2d');
    // A rock stands on sand if there is sand next to it, otherwise in the grass.
    const sandy = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => zone.rows[y + dy]?.[x + dx] === '.');
    for (let y = 0; y < zone.h; y++) for (let x = 0; x < zone.w; x++) drawTile(g, zone.rows[y][x], x, y, frame, zone.rows[y][x] === 'R' && !sandy(x, y));
    return c;
  };
  // One tile of sea, for places that flood (the tide pool behind the water gate).
  const sea = [0, 1].map((frame) => { const c = document.createElement('canvas'); c.width = c.height = TILE; drawTile(c.getContext('2d'), '~', 0, 0, frame); return c; });
  return { zone, frames: [make(0), make(1)], sea };
}

// Keeps the picture sharp on any screen: the canvas has as many pixels as the device shows.
export function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

// Moves each drawn character smoothly toward its last known position.
export function smooth(players, dt) {
  const k = Math.min(1, dt * 14);
  for (const p of players.values()) {
    if (p.x === undefined || Math.hypot(p.tx - p.x, p.ty - p.y) > 3) { p.x = p.tx; p.y = p.ty; }
    else { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; }
  }
}

// view = { cx, cy, tiles }: the middle of the picture (in tiles) and how many tiles fit across
// the smaller side of `rect` (x, y, w, h in canvas pixels).
// extra = { things: objects to draw (they change during the game), target: object to outline, fx: [{ by, a, until }] ability icons floating over players,
//           noName: id of a player drawn without a name (yourself, on your own phone),
//           labels: true writes each object's name under it (teacher map, 'details on host'),
//           places: true writes the names of the zone's places (students use them to say where to meet),
//           mood: the monster's mood, as a faint tint of the whole picture (1 chasing, 2 shooting),
//           beams: [{ dir, at, until }] shots that were just fired,
//           restored: ids of the landmarks this group has restored (the others are drawn as ruins),
//           fresh: id of the landmark that was just restored (it sparkles),
//           monster: { x, y, frozen } and warn: { dir, at }: only the Seer's phone and the teacher's map pass these }
export function drawScene(g, scene, rect, view, players, time, extra = {}) {
  const { zone } = scene;
  const ppt = Math.min(rect.w, rect.h) / view.tiles;              // pixels per tile
  const left = view.cx - rect.w / ppt / 2, top = view.cy - rect.h / ppt / 2;
  const sx = (x) => Math.round(rect.x + (x - left) * ppt), sy = (y) => Math.round(rect.y + (y - top) * ppt);

  g.save();
  g.beginPath(); g.rect(rect.x, rect.y, rect.w, rect.h); g.clip();
  g.fillStyle = '#2f6fc0';
  g.fillRect(rect.x, rect.y, rect.w, rect.h);
  g.imageSmoothingEnabled = false;
  g.drawImage(scene.frames[Math.floor(time * 1.5) % 2], sx(0), sy(0), sx(zone.w) - sx(0), sy(zone.h) - sy(0));

  const size = Math.round(ppt);
  // The island's landmarks: ruins, or restored by this group's missions.
  if (extra.restored) for (const l of zone.landmarks || []) {
    const done = extra.restored.includes(l.id);
    g.globalAlpha = done ? 1 : 0.75;
    g.drawImage(landmarkSprite(l, done), sx(l.x), sy(l.y), sx(l.x + l.w) - sx(l.x), sy(l.y + l.h) - sy(l.y));
    g.globalAlpha = 1;
    if (l.id === extra.fresh && Math.floor(time * 3) % 2) { g.strokeStyle = '#ffd166'; g.lineWidth = Math.max(3, ppt / 6); g.strokeRect(sx(l.x) - 3, sy(l.y) - 3, sx(l.x + l.w) - sx(l.x) + 6, sy(l.y + l.h) - sy(l.y) + 6); }
  }
  const frameNo = Math.floor(time * 1.5) % 2;
  for (const t of extra.things || []) {
    for (const f of t.floods || []) g.drawImage(scene.sea[frameNo], sx(f.x), sy(f.y), sx(f.x + 1) - sx(f.x), sy(f.y + 1) - sy(f.y));
    g.drawImage(thingSprite(t), sx(t.x), sy(t.y), sx(t.x + 1) - sx(t.x), sy(t.y + 1) - sy(t.y));
  }
  if (extra.target) {
    // The object this player can reach: a blinking white frame.
    g.strokeStyle = Math.floor(time * 3) % 2 ? '#ffffff' : '#ffe08a';
    g.lineWidth = Math.max(2, ppt / 10);
    g.strokeRect(sx(extra.target.x) - 1, sy(extra.target.y) - 1, size + 2, size + 2);
  }
  const list = [...players.values()].filter((p) => p.x !== undefined).sort((a, b) => a.y - b.y);
  for (const p of list) {
    const frame = p.moving ? Math.floor(time * 8) % 4 : 0;
    g.globalAlpha = p.online === false ? 0.4 : p.stun ? 0.65 : 1;
    g.drawImage(charSprite(p.ci, p.dir, frame, p.hero), sx(p.x) - size / 2, sy(p.y) - Math.round(size * 15 / 16), size, size);
  }
  g.globalAlpha = 1;

  // Stunned players: stars going round their head.
  g.fillStyle = '#ffd166'; g.strokeStyle = '#1a1c2c'; g.lineWidth = 2;
  g.font = `700 ${Math.round(ppt * 0.45)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const p of list) {
    if (!p.stun) continue;
    for (let i = 0; i < 3; i++) {
      const a = time * 4 + i * 2.1, x = sx(p.x) + Math.cos(a) * ppt * 0.45, y = sy(p.y) - size * 0.95 + Math.sin(a) * ppt * 0.12;
      g.strokeText('★', x, y); g.fillText('★', x, y);
    }
  }
  // The monster and its aim. Drawn only where the caller knows them (the Seer, the teacher).
  const band = (dir, at, fill) => { g.fillStyle = fill; if (dir === 'h') g.fillRect(rect.x, sy(at), rect.w, sy(at + 1) - sy(at)); else g.fillRect(sx(at), rect.y, sx(at + 1) - sx(at), rect.h); };
  if (extra.warn) band(extra.warn.dir, extra.warn.at, Math.floor(time * 6) % 2 ? 'rgba(232,72,59,.55)' : 'rgba(232,72,59,.3)');
  if (extra.monster) {
    const m = extra.monster, bob = Math.sin(time * 4) * ppt * 0.06;
    g.globalAlpha = m.frozen ? 0.55 : 0.92;
    g.drawImage(monsterSprite(), sx(m.x) - size * 0.6, sy(m.y) - size * 0.75 + bob, size * 1.2, size * 1.2);
    g.globalAlpha = 1;
  }
  // A shot that was just fired: everybody sees the flash.
  for (const b of extra.beams || []) band(b.dir, b.at, `rgba(255,247,194,${Math.max(0, Math.min(0.9, (b.until - time) * 1.6))})`);
  // The mood of the island: the air turns warmer when the monster is angry.
  if (extra.mood > 0) { g.fillStyle = extra.mood === 1 ? 'rgba(255,150,40,.10)' : 'rgba(210,30,70,.16)'; g.fillRect(rect.x, rect.y, rect.w, rect.h); }

  // Names: large, in the player's color, with a dark edge so they read on any tile.
  const font = Math.max(11, Math.round(ppt * 0.42));
  g.font = `700 ${font}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'bottom'; g.lineJoin = 'round';
  for (const p of list) {
    if (p.id === extra.noName) continue;
    const x = sx(p.x), y = sy(p.y) - Math.round(size * 15 / 16) - 2;
    g.lineWidth = Math.max(3, font / 4); g.strokeStyle = '#1a1c2c';
    g.strokeText(p.name, x, y);
    g.fillStyle = PLAYER_COLORS[p.ci % PLAYER_COLORS.length];
    g.fillText(p.name, x, y);
  }
  if (extra.places) {
    const small = Math.max(10, Math.round(ppt * 0.34));
    g.font = `italic 600 ${small}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (const pl of zone.places || []) {
      const x = sx(pl.x + 0.5), y = sy(pl.y + 0.5);
      g.lineWidth = 3; g.strokeStyle = 'rgba(26,28,44,.75)'; g.strokeText(pl.name, x, y);
      g.fillStyle = '#fff7c2'; g.fillText(pl.name, x, y);
    }
    g.textBaseline = 'bottom';
  }
  if (extra.labels) {
    const small = Math.max(10, Math.round(ppt * 0.3));
    g.font = `600 ${small}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.textBaseline = 'top';
    for (const t of extra.things || []) {
      const x = sx(t.x + 0.5), y = sy(t.y + 1);
      g.lineWidth = 3; g.strokeStyle = '#1a1c2c'; g.strokeText(t.name, x, y);
      g.fillStyle = '#ffffff'; g.fillText(t.name, x, y);
    }
  }
  // Someone just used an ability: its icon pops up over their head. No text, so nothing is given away.
  for (const f of extra.fx || []) {
    const p = players.get(f.by);
    if (!p || p.x === undefined) continue;
    const left = (f.until - time) / 1.4;                 // 1 -> 0
    const s = Math.round(ppt * 0.8), x = sx(p.x) - s / 2, y = sy(p.y) - Math.round(size * 15 / 16) - font - s - (1 - left) * ppt * 0.4;
    g.globalAlpha = Math.min(1, left * 3);
    g.fillStyle = '#ffffff'; g.fillRect(x - 3, y - 3, s + 6, s + 6);
    g.strokeStyle = '#1a1c2c'; g.lineWidth = 2; g.strokeRect(x - 3, y - 3, s + 6, s + 6);
    g.drawImage(iconCanvas(f.a), x, y, s, s);
    g.globalAlpha = 1;
  }
  g.restore();
}
