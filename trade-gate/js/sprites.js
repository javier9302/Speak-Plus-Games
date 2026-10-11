// All pixel art is drawn here in code: no image files.
// Sprites are small canvases, built once, then drawn scaled up with
// image smoothing off so the pixels stay crisp.

// The palette. One letter = one color in the sprite strings below.
export const PAL = {
  k: '#1a1c2c', // outline / darkest
  w: '#f4f4f4', // white
  y: '#ffcd75', // yellow
  o: '#ef7d57', // orange
  b: '#8a5a3c', // brown
  d: '#5d3a28', // dark brown
  l: '#c48a5a', // light brown
  c: '#73eff7', // cyan
  u: '#41a6f6', // blue
  g: '#94b0c2', // light grey
  s: '#566c86', // grey
  n: '#a7f070', // light green
  e: '#38b764', // green
  r: '#b13e53', // red
  f: '#333c57', // floor
  F: '#29314a', // floor shade
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// rows: array of strings, "." = transparent. extra: more letter -> color.
function fromRows(rows, extra = {}) {
  const pal = { ...PAL, ...extra };
  const c = canvas(rows[0].length, rows.length);
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = pal[ch] || '#ff00ff';
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return c;
}

// Draw a 16x16 tile from a list of rectangles: [color, x, y, w, h].
function fromRects(rects, w = 16, h = 16) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  for (const [color, x, y, rw, rh] of rects) {
    ctx.fillStyle = PAL[color] || color;
    ctx.fillRect(x, y, rw, rh);
  }
  return c;
}

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// ---------- resource icons (12 x 12) ----------
const ICONS = {
  gold: [
    '....kkkk....',
    '..kkyyyykk..',
    '.kyyyyyyyyk.',
    '.kyywwyyyok.',
    'kyywyyyyyyok',
    'kyywyyyyyyok',
    'kyyyyyyyyyok',
    'kyyyyyyyyook',
    '.kyyyyyyook.',
    '.kyyyyooook.',
    '..kkooookk..',
    '....kkkk....',
  ],
  wood: [
    '............',
    '............',
    '.kkkkkkkkkk.',
    'kbbbbbbbkllk',
    'kbbddbbbkldk',
    'kbbbbbbbkldk',
    'kbddbbdbkldk',
    'kbbbbbbbkldk',
    'kbbbbddbkllk',
    '.kkkkkkkkkk.',
    '............',
    '............',
  ],
  gems: [
    '............',
    '..kkkkkkkk..',
    '.kwwcccccck.',
    'kwwcccccccuk',
    'kcccccccuuuk',
    '.kcccccccuk.',
    '..kcccccuk..',
    '...kcccuk...',
    '....kcuk....',
    '.....kk.....',
    '............',
    '............',
  ],
  gears: [
    '.....kk.....',
    '..k.kggk.k..',
    '.kgkkggkkgk.',
    '..kggggggk..',
    '.kkggkkggkk.',
    'kgggk..kgggk',
    'kgggk..kgggk',
    '.kkggkkggkk.',
    '..kggggggk..',
    '.kgkkggkkgk.',
    '..k.kggk.k..',
    '.....kk.....',
  ],
};

// ---------- player characters (16 x 16) ----------
// C = player color, D = darker player color. Rows 0-3 are the "hat", which is
// different for each character so players are easy to tell apart.
const BODY = [
  '....kkkkkkkk....',
  '...kCCCCCCCCk...',
  '..kCCCCCCCCCCk..',
  '..kCwwCCCCwwCk..',
  '..kCwkCCCCwkCk..',
  '..kCCCCCCCCCCk..',
  '..kCCCkkkkCCCk..',
  '..kCCCCCCCCCCk..',
  '..kDDDDDDDDDDk..',
  '...kDDDDDDDDk...',
  '....kkkkkkkk....',
];
const FEET = [
  ['....kk....kk....', '................'],
  ['.....kk..kk.....', '................'],
];
const HATS = {
  cat: [
    '................',
    '...kk......kk...',
    '...kCk....kCk...',
  ],
  robot: [
    '......kwwk......',
    '......kwwk......',
    '.......kk.......',
  ],
  sprout: [
    '................',
    '.....kk..kk.....',
    '....knnkknnk....',
  ],
  king: [
    '................',
    '....k..kk..k....',
    '....kwkwwkwk....',
  ],
};

export function buildSprites(config) {
  const icons = {};
  for (const [name, rows] of Object.entries(ICONS)) icons[name] = fromRows(rows);

  const players = config.players.map((p) => {
    const hat = HATS[p.character] || HATS.cat;
    const colors = { C: p.color, D: shade(p.color, 0.7) };
    return FEET.map((feet) => fromRows([...hat, ...BODY, ...feet], colors));
  });

  const floor = fromRects([
    ['f', 0, 0, 16, 16], ['F', 0, 0, 16, 1], ['F', 0, 0, 1, 16],
    ['F', 5, 4, 1, 1], ['F', 11, 9, 1, 1], ['F', 7, 13, 1, 1],
  ]);
  const wall = fromRects([
    ['s', 0, 0, 16, 16], ['g', 0, 0, 16, 2],
    ['k', 0, 7, 16, 1], ['k', 0, 15, 16, 1], ['k', 7, 2, 1, 5], ['k', 3, 8, 1, 7], ['k', 11, 8, 1, 7],
  ]);

  const chest = (open) => fromRects([
    ['k', 1, 3, 14, 12], ['b', 2, 4, 12, 10], ['l', 2, 4, 12, 3],
    ['k', 1, 7, 14, 1], ['y', 2, 8, 12, 1], ['d', 2, 12, 12, 2],
    ['k', 6, 6, 4, 5], [open ? 'n' : 'y', 7, 7, 2, 3],
  ]);
  const machine = (on) => fromRects([
    ['k', 1, 1, 14, 14], ['s', 2, 2, 12, 12], ['g', 2, 2, 12, 2],
    ['k', 3, 5, 6, 6], [on ? 'n' : 'F', 4, 6, 4, 4],
    ['k', 10, 5, 4, 3], [on ? 'n' : 'r', 11, 6, 2, 1],
    ['k', 10, 9, 4, 3], ['y', 11, 10, 2, 1],
    ['k', 3, 12, 10, 1], ['k', 5, 0, 2, 2], ['g', 5, 0, 2, 1],
  ]);
  // Gate: two pillars and a beam. The beam color shows the state.
  const gate = (color) => fromRects([
    ['k', 0, 2, 16, 5], [color, 1, 3, 14, 3], ['w', 2, 3, 3, 1],
    ['k', 0, 6, 5, 10], ['g', 1, 7, 3, 8], ['s', 3, 7, 1, 8],
    ['k', 11, 6, 5, 10], ['g', 12, 7, 3, 8], ['s', 14, 7, 1, 8],
  ]);
  const plate = (down) => fromRects([
    ['f', 0, 0, 16, 16], ['k', 2, 2, 12, 12],
    [down ? 'e' : 'o', 3, 3, 10, 10], [down ? 'n' : 'y', down ? 5 : 3, down ? 5 : 3, down ? 6 : 10, down ? 6 : 2],
  ]);
  const bars = fromRects([
    ['f', 0, 0, 16, 16], ['k', 0, 1, 16, 3], ['g', 0, 2, 16, 1], ['k', 0, 12, 16, 3], ['g', 0, 13, 16, 1],
    ...[1, 6, 11].flatMap((x) => [['k', x, 0, 4, 16], ['g', x + 1, 0, 2, 16], ['w', x + 1, 0, 1, 16]]),
  ]);
  const doorShut = fromRects([
    ['k', 0, 0, 16, 16], ['b', 1, 1, 14, 14], ['d', 1, 1, 14, 1], ['d', 5, 1, 1, 14], ['d', 10, 1, 1, 14],
    ['k', 6, 5, 4, 6], ['y', 7, 6, 2, 4], ['k', 7, 8, 2, 1],
  ]);
  const doorOpen = fromRects([['f', 0, 0, 16, 16], ['k', 0, 0, 16, 2], ['k', 0, 14, 16, 2], ['n', 0, 2, 16, 1], ['n', 0, 13, 16, 1]]);
  const exit = (lit) => fromRects([
    ['f', 0, 0, 16, 16], [lit ? 'e' : 'F', 1, 1, 14, 14], ['f', 2, 2, 12, 12],
    [lit ? 'n' : 's', 5, 5, 6, 6], ['f', 7, 7, 2, 2],
  ]);

  return {
    icons, players,
    tiles: {
      floor, wall, bars, doorShut, doorOpen,
      chest: chest(false), chestFull: chest(true),
      machine: machine(false), machineOn: machine(true),
      gateLocked: gate(PAL.o), gateActive: gate(PAL.y), gateOpen: gate(PAL.n),
      plate: plate(false), plateDown: plate(true),
      exit: exit(false), exitLit: exit(true),
    },
  };
}
