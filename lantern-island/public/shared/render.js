// Draws the map and the characters. Used by the host screen and the phones.
import { TILE, PLAYER_COLORS, charSprite, drawTile, thingSprite, iconCanvas, monsterSprite, landmarkSprite, setKindArt, setItemArt, setSkins, setTiles } from './pixel.js';

const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;   // no weather moving about

// Pre-draws the whole zone once (two frames, for the water).
export function createScene(zone) {
  setKindArt(zone.art);                  // pictures of kinds that bring their own
  setItemArt(zone.itemArt);              // pictures of items
  setSkins(zone.skins);                  // the pack's own pictures for objects
  // Several maps joined (an atlas) have regions, each with its theme; one map is one region. Each region also
  // takes half of the water between it and the next one, so no strip is left without a theme.
  const regions = (zone.regions || [{ x: 0, y: 0, w: zone.w, h: zone.h, theme: zone.theme }]).map((r, i, all) => {
    const x0 = i ? Math.floor((all[i - 1].x + all[i - 1].w + r.x) / 2) : 0, x1 = i < all.length - 1 ? Math.floor((r.x + r.w + all[i + 1].x) / 2) : zone.w;
    return { ...r, x: x0, y: 0, w: x1 - x0, h: zone.h };
  });
  const regionAt = (x) => regions.find((r) => x >= r.x && x < r.x + r.w) || regions[0];
  const make = (frame) => {
    const c = document.createElement('canvas');
    c.width = zone.w * TILE; c.height = zone.h * TILE;
    const g = c.getContext('2d');
    // A rock stands on sand if there is sand next to it, otherwise in the grass.
    const sandy = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => zone.rows[y + dy]?.[x + dx] === '.');
    for (let y = 0; y < zone.h; y++) for (let x = 0; x < zone.w; x++) {
      setTiles(zone.tiles, regionAt(x).theme?.art);                // the pack's own tiles, and the theme's pictures for tiles
      drawTile(g, zone.rows[y][x], x, y, frame, zone.rows[y][x] === 'R' && !sandy(x, y));
    }
    return c;
  };
  // One tile of sea, for places that flood (the tide pool behind the water gate).
  const sea = [0, 1].map((frame) => { const c = document.createElement('canvas'); c.width = c.height = TILE; drawTile(c.getContext('2d'), '~', 0, 0, frame); return c; });
  const frames = [make(0), make(1)];
  // Each region's palette: colours of the ground swapped for others (snow for grass...).
  for (const r of regions) if (r.theme?.palette) for (const c of frames) recolor(c, r.theme.palette, r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
  if (regions[0].theme?.palette) for (const c of sea) recolor(c, regions[0].theme.palette, 0, 0, TILE, TILE);
  return { zone, frames, sea, regions };
}

function recolor(canvas, palette, x = 0, y = 0, w = canvas.width, h = canvas.height) {
  const map = new Map(Object.entries(palette).map(([from, to]) => [parseInt(from.slice(1), 16), parseInt(to.slice(1), 16)]));
  const g = canvas.getContext('2d'), img = g.getImageData(x, y, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const to = map.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (to !== undefined) { d[i] = to >> 16; d[i + 1] = (to >> 8) & 255; d[i + 2] = to & 255; }
  }
  g.putImageData(img, x, y);
}

// Weather, drawn over the picture (not tied to the map). Every particle is worked out from the time alone.
const R = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
function weather(g, rect, kind, time, ppt) {
  const W = rect.w, H = rect.h, s = Math.max(2, ppt / 8);
  const each = (n, fn) => { for (let i = 0; i < n; i++) fn(i); };
  g.save();
  if (kind === 'snow') each(70, (i) => { g.fillStyle = 'rgba(255,255,255,.85)'; const x = (R(i, 1) * W + Math.sin(time + i) * ppt * 0.4 + W) % W, y = (R(i, 2) * H + time * ppt * (0.6 + R(i, 3))) % H; g.fillRect(rect.x + x, rect.y + y, s, s); });
  if (kind === 'rain') { g.strokeStyle = 'rgba(170,200,255,.55)'; g.lineWidth = Math.max(1, ppt / 16); each(90, (i) => { const x = (R(i, 1) * W + time * ppt * 2) % W, y = (R(i, 2) * H + time * ppt * (7 + R(i, 3) * 3)) % H; g.beginPath(); g.moveTo(rect.x + x, rect.y + y); g.lineTo(rect.x + x - ppt * 0.12, rect.y + y + ppt * 0.45); g.stroke(); }); }
  if (kind === 'fireflies') each(26, (i) => { const a = 0.35 + 0.55 * Math.max(0, Math.sin(time * (1.5 + R(i, 4)) + i)); g.fillStyle = `rgba(255,240,140,${a})`; const x = rect.x + R(i, 1) * W + Math.sin(time * 0.6 + i) * ppt, y = rect.y + R(i, 2) * H + Math.cos(time * 0.5 + i * 2) * ppt; g.fillRect(x, y, s, s); });
  if (kind === 'leaves') each(32, (i) => { g.fillStyle = ['#d0632a', '#f0a03c', '#a8482a'][i % 3]; const x = (R(i, 1) * W + Math.sin(time * 1.3 + i) * ppt * 0.8 + W) % W, y = (R(i, 2) * H + time * ppt * (0.8 + R(i, 3))) % H; g.fillRect(rect.x + x, rect.y + y, s * 1.4, s); });
  if (kind === 'confetti') each(60, (i) => { g.fillStyle = ['#E8483B', '#ffd166', '#9DB4E0', '#38b764', '#b98cf0'][i % 5]; const x = (R(i, 1) * W + Math.sin(time * 2 + i) * ppt * 0.5 + W) % W, y = (R(i, 2) * H + time * ppt * (1 + R(i, 3))) % H; g.fillRect(rect.x + x, rect.y + y, s, s * (1 + Math.abs(Math.sin(time * 4 + i)))); });
  g.restore();
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
  // Each region's theme: a colour over it (night, sunset), and its weather.
  for (const r of scene.regions) {
    const t = r.theme || {};
    if (!t.tint && (!t.weather || t.weather === 'none')) continue;
    const x0 = Math.max(rect.x, sx(r.x)), y0 = Math.max(rect.y, sy(r.y)), x1 = Math.min(rect.x + rect.w, sx(r.x + r.w)), y1 = Math.min(rect.y + rect.h, sy(r.y + r.h));
    if (x1 <= x0 || y1 <= y0) continue;
    const area = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    g.save(); g.beginPath(); g.rect(area.x, area.y, area.w, area.h); g.clip();
    if (t.tint) { g.fillStyle = t.tint; g.fillRect(area.x, area.y, area.w, area.h); }
    if (t.weather && t.weather !== 'none' && !calm) weather(g, area, t.weather, time, ppt);
    g.restore();
  }
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
