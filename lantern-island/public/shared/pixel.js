// All pixel art, drawn in code. Tiles and characters are 16x16.
import { heroById } from './heroes.js';
export const TILE = 16;
export const PLAYER_COLORS = ['#e0485f', '#41a6f6', '#38b764', '#f4b41b', '#a05fd6', '#f08a3c'];
const HAIR = ['#3a2a1e', '#1f1f2e', '#7a4a21', '#2b2b2b', '#5a3215', '#40304f'];
const SKIN = '#f6c9a0', OUTLINE = '#1a1c2c', BOOTS = '#4a3728';

// ---------- characters ----------
// k outline, h hair, s skin, e eye, c shirt (player color), d trousers, b boots
const TOP = [
  '................',
  '.....kkkkkk.....',
  '....khhhhhhk....',
  '...khhhhhhhhk...',
];
const FACE = {
  front: ['...khsssssshk...', '...kssessessk...', '...kssssssssk...', '....kssssssk....'],
  back:  ['...khhhhhhhhk...', '...khhhhhhhhk...', '...khhhhhhhhk...', '....khhhhhhk....'],
  side:  ['...khhhsssssk...', '...khhhsssesk...', '...khhssssssk...', '....khsssssk....'],   // looking right
};
const BODY = [
  '...kcccccccck...',
  '..ksccccccccsk..',
  '..ksccccccccsk..',
  '...kcccccccck...',
  '...kddddddddk...',
];
const STAND = ['....kddkkddk....', '....kbbkkbbk....', '.....kk..kk.....'];
const STEP_A = ['....kddkkddk....', '....kbbk.kk.....', '.....kk.........'];
const STEP_B = ['....kddkkddk....', '.....kk.kbbk....', '.........kk.....'];
const LEGS = [STAND, STEP_A, STAND, STEP_B];   // walk cycle

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

const sprites = new Map();
// dir: 0 down, 1 left, 2 right, 3 up. frame: 0..3 of the walk cycle (0 = standing).
// `hero`: the character the student chose (heroes.js). Without one, the islander in the player's color.
export function charSprite(ci, dir, frame, hero) {
  const h = heroById(hero);
  if (h) return heroSprite(h, dir, frame);
  const key = `${ci}/${dir}/${frame}`;
  if (sprites.has(key)) return sprites.get(key);
  const color = PLAYER_COLORS[ci % PLAYER_COLORS.length];
  const pal = { k: OUTLINE, h: HAIR[ci % HAIR.length], s: SKIN, e: OUTLINE, c: color, d: shade(color, 0.6), b: BOOTS };
  const rows = [...TOP, ...FACE[dir === 3 ? 'back' : dir === 0 ? 'front' : 'side'], ...BODY, ...LEGS[frame % 4]];
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < TILE; x++) {
      const ch = row[dir === 1 ? TILE - 1 - x : x];
      if (ch !== '.') { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); }
    }
  });
  sprites.set(key, c);
  return c;
}

// A chosen character. It always faces the camera (mirrored when walking left), shows its back
// when walking up, and walks with a little hop instead of moving its legs.
function heroSprite(h, dir, frame) {
  const hop = frame % 2, key = `hero/${h.id}/${dir}/${hop}`;
  if (sprites.has(key)) return sprites.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  h.art.forEach((row, y) => {
    for (let x = 0; x < TILE; x++) {
      let ch = row[dir === 1 ? TILE - 1 - x : x];
      if (dir === 3 && y < h.back.rows) ch = h.back.swap[ch] || ch;
      if (ch !== '.') { g.fillStyle = ch === 'k' ? OUTLINE : h.pal[ch]; g.fillRect(x, y - hop, 1, 1); }
    }
  });
  sprites.set(key, c);
  return c;
}
const heroUrls = new Map();
// The character standing still, as an image for the phone's picker and the lobby list.
export function heroUrl(hero, ci = 0) {
  const key = `${hero || ''}/${ci}`;
  if (!heroUrls.has(key)) heroUrls.set(key, charSprite(ci, 0, 0, hero).toDataURL());
  return heroUrls.get(key);
}

// ---------- tiles ----------
// A fixed "random" number for a tile, so the map looks the same every time.
function rnd(x, y, n) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(n, 362437)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Draws tile `ch` at tile position (x, y). frame 0 or 1 animates the water.
// `onGrass`: a rock that stands in grass, not on the beach.
// Tiles a pack brings (server/tiles.js), and pictures a theme draws instead of a tile. Set by createScene.
let packTiles = {}, themeArt = {};
export function setTiles(tiles, art) { packTiles = tiles || {}; themeArt = art || {}; }
// A 16x16 picture written as letters ("." clear, "k" outline) at tile (x, y).
function letterArt(g, rows, pal, x, y) {
  rows.forEach((row, yy) => { for (let xx = 0; xx < TILE; xx++) { const ch = row[xx]; if (ch !== '.') { g.fillStyle = ch === 'k' ? OUTLINE : pal[ch]; g.fillRect(x * TILE + xx, y * TILE + yy, 1, 1); } } });
}

export function drawTile(g, ch, x, y, frame, onGrass = false) {
  const px = x * TILE, py = y * TILE;
  const r = (a, b, w, h, c) => { g.fillStyle = c; g.fillRect(px + a, py + b, w, h); };
  // A theme's picture for this tile (on its "base" tile, if it has one).
  if (themeArt[ch]) { if (themeArt[ch].base) drawTile(g, themeArt[ch].base, x, y, frame); letterArt(g, themeArt[ch].art, themeArt[ch].pal, x, y); return; }
  // A pack's own tile: its base, its colour with a few dots, its picture.
  const own = packTiles[ch];
  if (own) {
    if (own.base) drawTile(g, own.base, x, y, frame);
    if (own.color) { r(0, 0, 16, 16, own.color); (own.speckle || []).forEach((c, i) => { for (let k = 0; k < 3; k++) r(Math.floor(rnd(x, y, i * 7 + k) * 14), Math.floor(rnd(x, y, i * 7 + k + 3) * 14) + 1, 2, 1, c); }); }
    if (own.art) letterArt(g, own.art, own.pal || {}, x, y);
    return;
  }
  const dots = (n, color, w = 1) => {
    for (let i = 0; i < n; i++) r(Math.floor(rnd(x, y, i) * 14), Math.floor(rnd(x, y, i + 9) * 14) + 1, w, 1, color);
  };
  const water = () => {
    r(0, 0, 16, 16, '#3b82d6');
    for (let i = 0; i < 2; i++) {
      const wx = (Math.floor(rnd(x, y, i) * 12) + frame * 2) % 12, wy = Math.floor(rnd(x, y, i + 5) * 13) + 1;
      r(wx, wy, 4, 1, '#7fb6f0');
    }
  };
  const grass = () => { r(0, 0, 16, 16, '#6abe45'); dots(3, '#4f9e37', 2); if (rnd(x, y, 20) < 0.08) r(5, 6, 2, 2, '#fff3a8'); };
  const sand = () => { r(0, 0, 16, 16, '#f0dca0'); dots(3, '#dcc380'); };

  switch (ch) {
    case '~': water(); break;
    case '.': sand(); break;
    case ',': grass(); break;
    case '#': r(0, 0, 16, 16, '#c8a56a'); dots(4, '#b08c52'); break;
    case '=':
      water();
      r(0, 2, 16, 12, '#a9713c');
      for (let i = 3; i < 16; i += 4) r(i, 2, 1, 12, '#6e4423');
      r(0, 1, 16, 1, '#6e4423'); r(0, 14, 16, 1, '#6e4423');
      break;
    case 'T':
      grass();
      r(7, 10, 2, 5, '#6e4423'); r(6, 14, 4, 1, '#4a2d17');
      r(5, 1, 6, 1, OUTLINE); r(3, 2, 10, 8, OUTLINE); r(2, 4, 12, 4, OUTLINE); r(5, 10, 6, 1, OUTLINE);
      r(5, 2, 6, 8, '#2f7d32'); r(3, 4, 10, 4, '#2f7d32'); r(4, 3, 8, 6, '#2f7d32');
      r(5, 3, 3, 2, '#49a548'); r(9, 6, 2, 1, '#49a548');
      break;
    case 'R':
      if (onGrass) grass(); else sand();
      r(4, 6, 8, 1, OUTLINE); r(3, 7, 10, 6, OUTLINE); r(4, 13, 8, 1, OUTLINE);
      r(4, 7, 8, 6, '#8b93a7'); r(5, 7, 3, 2, '#b4bccd'); r(4, 11, 8, 2, '#5e6680');
      break;
    default: r(0, 0, 16, 16, '#ff00ff');   // unknown tile: easy to spot
  }
}

// ---------- objects and items ----------
// Things you can use have a dark outline so they stand out from the scenery.
// Everything is drawn on a 16x16 canvas with a clear background.
function paint(kind, st, holds, flags = '') {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  const r = (a, b, w, h, col) => { g.fillStyle = col; g.fillRect(a, b, w, h); };
  const GOLD = '#ffd166', WOOD = '#a9713c', DARK = '#6e4423', STONE = '#8b93a7', LIGHT = '#b4bccd';
  const item = (id) => {
    if (id === 'lantern') { r(6, 0, 4, 3, OUTLINE); r(7, 1, 2, 1, LIGHT); r(4, 3, 8, 12, OUTLINE); r(5, 4, 6, 10, GOLD); r(7, 6, 2, 6, '#fff7c2'); r(5, 4, 6, 1, DARK); r(5, 13, 6, 1, DARK); }
    else if (id === 'key') { r(1, 4, 7, 8, OUTLINE); r(2, 5, 5, 6, GOLD); r(3, 7, 3, 2, OUTLINE); r(7, 6, 8, 4, OUTLINE); r(8, 7, 6, 2, GOLD); r(10, 9, 5, 4, OUTLINE); r(11, 9, 1, 3, GOLD); r(13, 9, 1, 3, GOLD); }
    else if (id === 'letter') { r(1, 3, 14, 10, OUTLINE); r(2, 4, 12, 8, '#fff7e0'); r(2, 4, 1, 1, '#c9b98a'); r(3, 5, 1, 1, '#c9b98a'); r(4, 6, 1, 1, '#c9b98a'); r(5, 7, 1, 1, '#c9b98a'); r(6, 8, 4, 1, '#c9b98a'); r(10, 7, 1, 1, '#c9b98a'); r(11, 6, 1, 1, '#c9b98a'); r(12, 5, 1, 1, '#c9b98a'); r(13, 4, 1, 1, '#c9b98a'); r(7, 8, 2, 2, '#E8483B'); }
    else if (id === 'crystal') { r(6, 1, 4, 1, OUTLINE); r(4, 2, 8, 2, OUTLINE); r(3, 4, 10, 5, OUTLINE); r(4, 9, 8, 2, OUTLINE); r(5, 11, 6, 2, OUTLINE); r(7, 13, 2, 2, OUTLINE); r(6, 2, 4, 2, '#bfe9ff'); r(4, 4, 8, 5, '#5cc8f2'); r(5, 9, 6, 2, '#2f9fd0'); r(6, 11, 4, 2, '#2f9fd0'); r(7, 13, 2, 1, '#2f9fd0'); r(5, 4, 2, 3, '#e8f8ff'); }
    else if (id === 'plank') { r(0, 5, 16, 7, OUTLINE); r(1, 6, 14, 5, WOOD); r(1, 8, 14, 1, DARK); r(4, 6, 1, 2, DARK); r(11, 9, 1, 2, DARK); }
    else { r(3, 3, 10, 10, OUTLINE); r(4, 4, 8, 8, '#ff9ecb'); }
  };
  switch (kind) {
    case 'item': item(holds); break;
    case 'sign':
      r(6, 9, 4, 7, OUTLINE); r(7, 9, 2, 6, '#8a5a2b');
      r(1, 1, 14, 9, OUTLINE); r(2, 2, 12, 7, '#e2b36a');
      r(4, 4, 8, 1, '#7a4a21'); r(4, 6, 6, 1, '#7a4a21');
      break;
    case 'statue':
      r(2, 12, 12, 4, OUTLINE); r(3, 13, 10, 2, STONE);
      r(4, 1, 8, 12, OUTLINE); r(5, 2, 6, 10, LIGHT);
      r(6, 4, 1, 1, OUTLINE); r(9, 4, 1, 1, OUTLINE); r(6, 7, 4, 1, STONE); r(5, 10, 6, 2, STONE);
      break;
    case 'shell':
      r(4, 5, 8, 1, OUTLINE); r(2, 6, 12, 8, OUTLINE); r(4, 14, 8, 1, OUTLINE);
      r(4, 6, 8, 8, '#f7b9cb'); r(3, 7, 10, 6, '#f7b9cb');
      r(5, 7, 1, 6, '#d98aa3'); r(8, 6, 1, 8, '#d98aa3'); r(11, 7, 1, 6, '#d98aa3');
      break;
    case 'bottle':
      r(6, 1, 4, 5, OUTLINE); r(7, 2, 2, 4, '#c98a4b');
      r(4, 5, 8, 11, OUTLINE); r(5, 6, 6, 9, '#7fd0b0');
      r(6, 8, 4, 5, '#fff7e0'); r(6, 6, 1, 2, '#c9f2e2');
      break;
    case 'stump':
      r(2, 6, 12, 9, OUTLINE); r(3, 7, 10, 7, '#8a5a2b'); r(3, 5, 10, 3, OUTLINE); r(4, 5, 8, 2, '#d9b27a'); r(6, 5, 4, 1, '#a9713c'); r(1, 13, 3, 2, OUTLINE); r(12, 13, 3, 2, OUTLINE); r(5, 9, 1, 4, '#6e4423'); r(9, 8, 1, 5, '#6e4423');
      break;
    case 'bell':
      r(2, 1, 12, 2, OUTLINE); r(3, 1, 1, 15, OUTLINE); r(12, 1, 1, 15, OUTLINE); r(7, 3, 2, 2, OUTLINE);
      r(5, 5, 6, 1, OUTLINE); r(4, 6, 8, 6, OUTLINE); r(3, 11, 10, 2, OUTLINE); r(5, 6, 6, 5, '#7fd0b0'); r(4, 11, 8, 1, '#5aa98c'); r(6, 7, 1, 3, '#c9f2e2'); r(7, 13, 2, 2, GOLD);
      break;
    case 'npc':                                        // the keeper: a character with a blue cap
      g.drawImage(charSprite(4, 0, 0), 0, 0);
      r(3, 0, 10, 3, OUTLINE); r(4, 1, 8, 1, '#1F2F5C'); r(2, 3, 12, 1, OUTLINE);
      break;
    case 'chest':
      if (st === 'closed') { r(1, 4, 14, 11, OUTLINE); r(2, 5, 12, 9, WOOD); r(2, 8, 12, 1, DARK); r(7, 7, 2, 4, GOLD); }
      else {
        r(1, 1, 14, 5, OUTLINE); r(2, 2, 12, 3, '#8a5a2b');
        r(1, 6, 14, 9, OUTLINE); r(2, 7, 12, 7, WOOD); r(3, 7, 10, 3, '#2a1c10');
        if (holds) { r(5, 6, 6, 3, GOLD); r(7, 5, 2, 1, '#fff7c2'); }
      }
      break;
    case 'gate':
      if (st === 'open') { r(0, 1, 4, 15, OUTLINE); r(1, 2, 2, 13, '#8a5a2b'); r(12, 1, 4, 15, OUTLINE); r(13, 2, 2, 13, '#8a5a2b'); }
      else {
        r(0, 1, 16, 15, OUTLINE); r(1, 2, 14, 13, '#8a5a2b');
        r(4, 2, 1, 13, DARK); r(8, 2, 1, 13, DARK); r(12, 2, 1, 13, DARK); r(1, 5, 14, 1, DARK); r(1, 11, 14, 1, DARK);
        if (st === 'locked' && flags.includes('k')) {
          // A code gate: a little keypad instead of a padlock.
          r(4, 4, 8, 9, OUTLINE); r(5, 5, 6, 7, LIGHT);
          for (let i = 0; i < 6; i++) r(6 + (i % 2) * 3, 6 + Math.floor(i / 2) * 2, 2, 1, OUTLINE);
        } else if (st === 'locked') { r(6, 5, 4, 3, OUTLINE); r(7, 6, 2, 2, '#8a5a2b'); r(5, 7, 6, 6, OUTLINE); r(6, 8, 4, 4, GOLD); r(7, 9, 2, 2, OUTLINE); }
      }
      break;
    case 'gap':
      if (st === 'fixed') { r(2, 2, 12, 12, '#d9b27a'); r(5, 2, 1, 12, WOOD); r(10, 2, 1, 12, WOOD); }
      else if (flags.includes('h')) {
        // Held by somebody on the flat stone: ropes and thin planks appear.
        r(0, 4, 16, 1, '#e2c58f'); r(0, 11, 16, 1, '#e2c58f');
        for (let i = 1; i < 16; i += 3) r(i, 4, 2, 8, '#d9b27a');
      }
      else { r(2, 2, 12, 12, '#2f6fc0'); r(2, 2, 3, 4, DARK); r(11, 9, 3, 5, DARK); r(5, 6, 4, 1, '#7fb6f0'); r(8, 10, 3, 1, '#7fb6f0'); r(2, 1, 12, 1, OUTLINE); r(2, 14, 12, 1, OUTLINE); }
      break;
    case 'plate':
      // A flat stone in the ground. It sinks a little when somebody stands on it.
      r(2, 4, 12, 9, OUTLINE); r(3, 5, 10, 7, st === 'down' ? STONE : LIGHT);
      if (st !== 'down') r(3, 11, 10, 1, STONE);
      r(6, 7, 4, 1, OUTLINE); r(7, 6, 2, 3, OUTLINE);
      break;
    case 'sluice':
      // A wooden water gate with a wheel. Broken: the wheel is in pieces. Closed: the board is down.
      r(1, 2, 3, 13, OUTLINE); r(2, 3, 1, 11, WOOD); r(12, 2, 3, 13, OUTLINE); r(13, 3, 1, 11, WOOD);
      r(4, st === 'closed' ? 8 : 3, 8, 6, OUTLINE); r(5, st === 'closed' ? 9 : 4, 6, 4, '#8a5a2b');
      if (st === 'broken') { r(6, 10, 2, 2, GOLD); r(9, 12, 2, 1, GOLD); r(5, 13, 1, 1, GOLD); }
      else { r(6, 1, 4, 4, OUTLINE); r(7, 2, 2, 2, GOLD); }
      if (st !== 'closed') { r(4, 12, 8, 3, '#3b82d6'); r(5, 13, 3, 1, '#7fb6f0'); }
      break;
    case 'boulder':
      r(3, 2, 10, 1, OUTLINE); r(1, 3, 14, 11, OUTLINE); r(3, 14, 10, 1, OUTLINE);
      r(3, 3, 10, 11, STONE); r(2, 4, 12, 9, STONE); r(4, 4, 5, 3, LIGHT); r(2, 11, 12, 2, '#5e6680'); r(10, 7, 2, 2, '#5e6680');
      break;
    case 'station':
      r(2, 11, 12, 5, OUTLINE); r(3, 12, 10, 3, LIGHT);
      if (st === 'solved') { if (holds) { g.save(); g.translate(0, -3); item(holds); g.restore(); } else { r(4, 2, 8, 10, OUTLINE); r(5, 3, 6, 8, STONE); } }
      else {
        // A tablet with a question mark. Purple = not tried yet, gold = someone is working on it.
        const col = st === 'open' ? GOLD : '#b98cf0';
        r(3, 0, 10, 12, OUTLINE); r(4, 1, 8, 10, col);
        r(6, 2, 4, 1, OUTLINE); r(9, 3, 1, 2, OUTLINE); r(7, 5, 2, 1, OUTLINE); r(7, 6, 1, 1, OUTLINE); r(7, 8, 1, 1, OUTLINE);
      }
      break;
    default: r(3, 3, 10, 10, '#ff00ff');
  }
  return c;
}

// The monster: a purple sea spirit. Only the Seer's phone (and the teacher's map) draws it.
let monsterCanvas = null;
export function monsterSprite() {
  if (monsterCanvas) return monsterCanvas;
  const c = monsterCanvas = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  const r = (a, b, w, h, col) => { g.fillStyle = col; g.fillRect(a, b, w, h); };
  r(4, 1, 8, 1, OUTLINE); r(2, 2, 12, 2, OUTLINE); r(1, 4, 14, 10, OUTLINE); r(1, 14, 3, 1, OUTLINE); r(6, 14, 4, 1, OUTLINE); r(12, 14, 3, 1, OUTLINE);
  r(4, 2, 8, 1, '#7b4bc4'); r(3, 3, 10, 1, '#7b4bc4'); r(2, 4, 12, 10, '#7b4bc4'); r(2, 14, 1, 1, '#7b4bc4'); r(7, 14, 2, 1, '#7b4bc4'); r(13, 14, 1, 1, '#7b4bc4');
  r(3, 4, 3, 2, '#a685e2');
  r(4, 6, 3, 3, '#ffffff'); r(9, 6, 3, 3, '#ffffff'); r(5, 7, 2, 2, OUTLINE); r(10, 7, 2, 2, OUTLINE);
  r(5, 11, 6, 1, OUTLINE); r(5, 10, 1, 1, OUTLINE); r(10, 10, 1, 1, OUTLINE);
  return c;
}

const things = new Map();
// The picture of a thing in its current state: { kind, st, holds }.
export function thingSprite(t) {
  if (kindArt[t.kind]) return artSprite(t.kind, t.st);
  const flags = (t.held ? 'h' : '') + (t.keypad ? 'k' : '');
  const key = `${t.kind}/${t.st}/${t.holds || ''}/${flags}`;
  if (!things.has(key)) things.set(key, paint(t.kind, t.st, t.holds, flags));
  return things.get(key);
}
// Kinds that bring their own pictures (server/kinds/<kind>.js "art"), sent with the map:
// { kind: { pal, states: { st: 16 rows of 16 letters, default } } }. "k" is the outline, "." is clear.
let kindArt = {};
const arts = new Map();
export function setKindArt(art) { if (JSON.stringify(art || {}) !== JSON.stringify(kindArt)) { kindArt = art || {}; arts.clear(); } }
function artSprite(kind, st) {
  const a = kindArt[kind], rows = a.states[st] || a.states.default, key = `${kind}/${a.states[st] ? st : 'default'}`;
  if (arts.has(key)) return arts.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  rows.forEach((row, y) => { for (let x = 0; x < TILE; x++) { const ch = row[x]; if (ch !== '.') { g.fillStyle = ch === 'k' ? OUTLINE : a.pal[ch]; g.fillRect(x, y, 1, 1); } } });
  arts.set(key, c);
  return c;
}
// ---------- landmarks ----------
// What missions restore on the island. Each one is drawn as a ruin until a mission restores it.
// The canvas is as big as the landmark (w x h tiles).
const marks = new Map();
export function landmarkSprite(l, restored) {
  // `art` says which drawing to use, so zones can share drawings under their own names.
  const key = `${l.art || l.id}/${l.w}x${l.h}/${restored}`;
  if (marks.has(key)) return marks.get(key);
  const c = document.createElement('canvas');
  c.width = l.w * TILE; c.height = l.h * TILE;
  const g = c.getContext('2d');
  const r = (a, b, w, h, col) => { g.fillStyle = col; g.fillRect(a, b, w, h); };
  const STONE = '#8b93a7', LIGHT = '#b4bccd', DARK = '#5e6680', WOOD = '#a9713c', BROWN = '#6e4423', RED = '#E8483B', GOLD = '#ffd166', WHITE = '#fff7e0';
  const rubble = (x, y) => { r(x + 2, y + 10, 12, 5, OUTLINE); r(x + 3, y + 11, 10, 3, STONE); r(x + 4, y + 7, 5, 4, OUTLINE); r(x + 5, y + 8, 3, 3, DARK); r(x + 10, y + 9, 3, 2, OUTLINE); };
  const done = restored;
  switch (l.art || l.id) {
    case 'lighthouse':
      if (!done) { r(3, 20, 10, 12, OUTLINE); r(4, 21, 8, 10, STONE); r(5, 17, 3, 4, OUTLINE); r(6, 18, 1, 3, DARK); r(4, 25, 3, 2, DARK); r(9, 23, 2, 3, DARK); break; }
      r(4, 8, 8, 24, OUTLINE); r(5, 9, 6, 22, WHITE); r(5, 13, 6, 4, RED); r(5, 22, 6, 4, RED);
      r(3, 3, 10, 6, OUTLINE); r(4, 4, 8, 4, GOLD); r(6, 5, 4, 2, '#ffffff'); r(5, 1, 6, 2, OUTLINE); r(6, 0, 4, 1, RED);
      r(7, 27, 2, 4, BROWN);
      break;
    case 'dock':
      if (!done) { r(18, 5, 2, 8, BROWN); r(26, 7, 2, 6, BROWN); break; }
      r(14, 5, 18, 6, OUTLINE); r(15, 6, 16, 4, WOOD); for (let i = 18; i < 30; i += 4) r(i, 6, 1, 4, BROWN);
      r(1, 7, 12, 6, OUTLINE); r(2, 8, 10, 3, RED); r(3, 11, 8, 1, WHITE); r(6, 2, 1, 6, OUTLINE); r(7, 3, 4, 3, WHITE);
      break;
    case 'flower-garden':
      for (let i = 0; i < 9; i++) {
        const x = 3 + i * 5, y = 4 + (i * 7) % 8;
        if (!done) { r(x, y + 2, 2, 3, '#4f9e37'); continue; }
        r(x + 1, y + 3, 1, 4, '#3d8a2e'); r(x, y, 3, 3, [RED, GOLD, '#b98cf0', '#ff9ecb'][i % 4]); r(x + 1, y + 1, 1, 1, WHITE);
      }
      break;
    case 'post-office':
      if (!done) { rubble(0, 0); break; }
      r(1, 6, 14, 10, OUTLINE); r(2, 7, 12, 8, WHITE); r(0, 2, 16, 5, OUTLINE); r(1, 3, 14, 3, RED); r(6, 10, 4, 5, BROWN); r(10, 8, 4, 3, OUTLINE); r(11, 9, 2, 1, GOLD);
      break;
    case 'windmill':
      if (!done) { r(3, 20, 10, 12, OUTLINE); r(4, 21, 8, 10, WOOD); r(4, 24, 8, 1, BROWN); r(6, 17, 4, 4, OUTLINE); r(7, 18, 2, 3, BROWN); break; }
      r(4, 12, 8, 20, OUTLINE); r(5, 13, 6, 18, WHITE); r(7, 26, 2, 5, BROWN); r(3, 10, 10, 3, OUTLINE); r(4, 11, 8, 1, RED);
      r(7, 0, 2, 16, OUTLINE); r(0, 7, 16, 2, OUTLINE); r(7, 1, 2, 14, GOLD); r(1, 7, 14, 2, GOLD); r(7, 7, 2, 2, OUTLINE);
      break;
    case 'fountain':
      r(1, 8, 14, 7, OUTLINE); r(2, 9, 12, 5, STONE); r(3, 9, 10, 3, done ? '#3b82d6' : DARK);
      if (done) { r(7, 2, 2, 8, OUTLINE); r(7, 3, 2, 6, LIGHT); r(5, 1, 6, 2, '#7fb6f0'); r(4, 3, 1, 3, '#7fb6f0'); r(11, 3, 1, 3, '#7fb6f0'); r(4, 10, 3, 1, '#7fb6f0'); }
      else { r(6, 6, 3, 3, OUTLINE); r(7, 7, 1, 2, DARK); }
      break;
    case 'market':
      if (!done) { r(2, 9, 12, 2, OUTLINE); r(3, 11, 2, 4, BROWN); r(11, 10, 2, 3, BROWN); break; }
      r(1, 2, 14, 5, OUTLINE); for (let i = 0; i < 6; i++) r(2 + i * 2, 3, 2, 3, i % 2 ? WHITE : RED);
      r(2, 7, 1, 8, BROWN); r(13, 7, 1, 8, BROWN); r(2, 10, 12, 4, OUTLINE); r(3, 11, 10, 2, WOOD); r(4, 9, 2, 2, GOLD); r(7, 9, 2, 2, RED); r(10, 9, 2, 2, '#6abe45');
      break;
    case 'campfire':
      r(3, 11, 10, 3, OUTLINE); r(4, 12, 8, 1, BROWN);
      if (done) { r(6, 5, 4, 7, RED); r(7, 3, 2, 8, GOLD); r(5, 8, 1, 3, RED); r(10, 7, 1, 4, RED); r(7, 8, 2, 3, WHITE); }
      else { r(5, 10, 6, 1, DARK); r(7, 9, 2, 1, STONE); }
      break;
    default:
      if (!done) rubble(0, c.height - TILE);
      else { r(7, c.height - 14, 2, 13, OUTLINE); r(9, c.height - 14, 6, 5, RED); }
  }
  marks.set(key, c);
  return c;
}

const itemUrls = new Map();
export function itemUrl(id) {
  if (!itemUrls.has(id)) itemUrls.set(id, paint('item', 'here', id).toDataURL());
  return itemUrls.get(id);
}

// ---------- ability icons, 12x12 ----------
export const ICONS = {
  look: ['............', '............', '...XXXXXX...', '..X......X..', '.X..XXXX..X.', 'X..XX..XX..X', 'X..XX..XX..X', '.X..XXXX..X.', '..X......X..', '...XXXXXX...', '............', '............'],
  read: ['............', '.XXXX..XXXX.', 'X....XX....X', 'X.XX.XX.XX.X', 'X....XX....X', 'X.XX.XX.XX.X', 'X....XX....X', 'X.XX.XX.XX.X', 'X....XX....X', 'XXXXXXXXXXXX', '.....XX.....', '............'],
  talk: ['............', '.XXXXXXXXXX.', 'X..........X', 'X..........X', 'X.XX.XX.XX.X', 'X..........X', 'X..........X', '.XXXXXXXXXX.', '...XX.......', '..XX........', '.XX.........', '............'],
  listen: ['............', '.....X...X..', '....XX....X.', 'XXXXXX.X..X.', 'X...XX..X.X.', 'X...XX..X.X.', 'X...XX..X.X.', 'XXXXXX.X..X.', '....XX....X.', '.....X...X..', '............', '............'],
  pickup: ['.....XX.....', '....XXXX....', '...XXXXXX...', '..XX.XX.XX..', '.....XX.....', '.....XX.....', '............', 'X..........X', 'X..........X', 'X..........X', 'XXXXXXXXXXXX', '............'],
  give: ['...XX.XX....', '..X..X..X...', '...XXXXX....', '.XXXXXXXXXX.', '.X...XX...X.', '.XXXXXXXXXX.', '.X...XX...X.', '.X...XX...X.', '.X...XX...X.', '.X...XX...X.', '.XXXXXXXXXX.', '............'],
  open: ['............', '............', '..XXXX......', '.X....X.....', '.X....X.....', '.X....XXXXXX', '.X....X..X.X', '.X....X..X.X', '..XXXX......', '............', '............', '............'],
  close: ['............', '....XXXX....', '...X....X...', '...X....X...', '..XXXXXXXX..', '..XXXXXXXX..', '..XXX..XXX..', '..XXX..XXX..', '..XXXXXXXX..', '..XXXXXXXX..', '............', '............'],
  jump: ['.....XX.....', '....XXXX....', '...XX..XX...', '..XX....XX..', '.....XX.....', '....XXXX....', '...XX..XX...', '..XX....XX..', '............', '............', 'XXXXXXXXXXXX', '............'],
  push: ['............', '............', '..X......X..', '.XX.XXXX.XX.', 'XXX.X..X.XXX', 'XXX.X..X.XXX', '.XX.XXXX.XX.', '..X......X..', '............', '............', '............', '............'],
  use: ['............', 'XX..........', 'XXXX........', '.XXXXX......', '.XXXXXXX....', '..XXXXX.....', '..XXXXXX....', '...XX.XXX...', '...X...XXX..', '........XX..', '............', '............'],
  // The powers of the special roles
  heal: ['............', '..XX....XX..', '.XXXX..XXXX.', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX', '.XXXXXXXXXX.', '..XXXXXXXX..', '...XXXXXX...', '....XXXX....', '.....XX.....', '............'],
  slay: ['..........XX', '.........XXX', '........XXX.', '.......XXX..', '......XXX...', '.X...XXX....', '.XX.XXX.....', '..XXXX......', '..XXX.......', '.XXXXX......', 'XX...XX.....', 'X...........'],
  fix: ['............', '..XXXXXXX...', '..XXXXXXXX..', '..XXXXXXX...', '.....XX.....', '.....XX.....', '.....XX.....', '.....XX.....', '.....XX.....', '.....XX.....', '.....XX.....', '............'],
};

const icons = new Map();
// A 12x12 canvas with the icon in one color.
export function iconCanvas(id, color = '#1a1c2c') {
  const key = `${id}/${color}`;
  if (icons.has(key)) return icons.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 12;
  const g = c.getContext('2d');
  g.fillStyle = color;
  (ICONS[id] || []).forEach((row, y) => { for (let x = 0; x < 12; x++) if (row[x] === 'X') g.fillRect(x, y, 1, 1); });
  icons.set(key, c);
  return c;
}
const urls = new Map();
export function iconUrl(id, color) {
  const key = `${id}/${color}`;
  if (!urls.has(key)) urls.set(key, iconCanvas(id, color).toDataURL());
  return urls.get(key);
}
