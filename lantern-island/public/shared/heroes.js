// Characters students can choose when they join, besides the Islander. Each one is a 16x16
// drawing, facing the camera. These are original Speak Plus drawings: safe to publish.
//
// Fan art (famous anime and game characters) can be added for classroom use only, in
// heroes-local.js next to this file. That file is never uploaded (.gitignore) and, online
// (hosted mode), never served: see the README, "Characters".
//
// Plain data, no browser code: the server imports it too, to check the id a phone sends.
// art: 16 rows of 16 letters. "." is clear, "k" is the outline; every other letter is in `pal`.
// The top row stays clear: walking lifts the drawing by one pixel.
// back: seen from behind (walking up), letters in the first `rows` rows change: { rows, swap: { from: to } }.

const ORIGINAL = [
  {
    id: 'fox', name: 'Fox', from: 'Lantern Island',
    pal: { o: '#e8823a', a: '#a8462a', w: '#fff4e6', e: '#1a1c2c', n: '#1a1c2c' },
    back: { rows: 13, swap: { w: 'o', e: 'o', n: 'o' } },
    art: [
      '................',
      '..k..........k..',
      '.kok........kok.',
      '.koak......kaok.',
      '.kooakkkkkkaook.',
      '.kooooooooooook.',
      '.kooeooooooeook.',
      '.kowwoooooowwok.',
      '.kowwwwnnwwwwok.',
      '..kwwwwwwwwwwk..',
      '...kkooooookk...',
      '..kooowwwwoook..',
      '..kooowwwwoook..',
      '...kook..kook...',
      '....kk....kk....',
      '................',
    ],
  },
  {
    id: 'robot', name: 'Robo', from: 'Lantern Island',
    pal: { g: '#8fa3b8', l: '#d7e2ec', c: '#3fd0e0', r: '#e8483b', a: '#e8483b', b: '#3b6fd0' },
    back: { rows: 13, swap: { c: 'l', r: 'g', b: 'g' } },
    art: [
      '................',
      '.......kk.......',
      '.......aa.......',
      '....kkkkkkkk....',
      '...kggggggggk...',
      '...kgllllllgk...',
      '...kglcllclgk...',
      '...kgllllllgk...',
      '...kggrrrrggk...',
      '....kkkkkkkk....',
      '..kkggggggggkk..',
      '..kgkgbbbbgkgk..',
      '..kgkgbbbbgkgk..',
      '...kkggggggkk...',
      '....kgk..kgk....',
      '....kkk..kkk....',
    ],
  },
  {
    id: 'frog', name: 'Frog', from: 'Lantern Island',
    pal: { f: '#4caf50', d: '#2e7d32', w: '#ffffff', e: '#1a1c2c', m: '#2e7d32', l: '#c8e6a0' },
    back: { rows: 16, swap: { e: 'w', m: 'f', l: 'f' } },
    art: [
      '................',
      '..kkk......kkk..',
      '.kwwwk....kwwwk.',
      '.kwewk....kwewk.',
      '.kfwwkkkkkkwwfk.',
      'kffffffffffffffk',
      'kffffffffffffffk',
      'kffmffffffffmffk',
      'kfffmmmmmmmmfffk',
      '.kffffffffffffk.',
      '.kfllllllllllfk.',
      'kffllllllllllffk',
      'kffllllllllllffk',
      '.kdffffffffffdk.',
      '..kffk....kffk..',
      '..kkkk....kkkk..',
    ],
  },
  {
    id: 'penguin', name: 'Penguin', from: 'Lantern Island',
    pal: { b: '#2b3a67', w: '#ffffff', e: '#1a1c2c', y: '#f2a33a' },
    back: { rows: 14, swap: { w: 'b', e: 'b', y: 'b' } },
    art: [
      '................',
      '....kkkkkkkk....',
      '...kbbbbbbbbk...',
      '..kbbbbbbbbbbk..',
      '..kbbwwwwwwbbk..',
      '..kbwwewwewwbk..',
      '..kbwwwyywwwbk..',
      '..kbbwwwwwwbbk..',
      '.kbbwwwwwwwwbbk.',
      'kbbbwwwwwwwwbbbk',
      'kbkbwwwwwwwwbkbk',
      '.kkbwwwwwwwwbkk.',
      '..kbwwwwwwwwbk..',
      '..kbbwwwwwwbbk..',
      '...kyyk..kyyk...',
      '...kkkk..kkkk...',
    ],
  },
];

// The classroom-only fan art, if this computer has it. Marked `fanArt` so the server can refuse it online.
let local = [];
try {
  local = (await import('./heroes-local.js')).HEROES.map((h) => ({ ...h, fanArt: true }));
} catch { /* not on this computer, or not served online */ }

export const HEROES = [...ORIGINAL, ...local];
const byId = new Map(HEROES.map((h) => [h.id, h]));
export const heroById = (id) => (typeof id === 'string' && byId.get(id)) || null;
