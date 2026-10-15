// A flat stone in the ground that lights up when pressed. A "sequence" goal asks for its pads in an order
// that the clues reveal; a wrong press makes them all go dark again (nothing else is lost).
const stone = (edge, mid) => [
  '................', '................', '................', '................',
  '....kkkkkkkk....',
  '...kssssssssk...',
  `..ks${edge.repeat(8)}sk..`,
  `..ks${edge}${mid.repeat(6)}${edge}sk..`,
  `..ks${edge}${mid}${edge.repeat(4)}${mid}${edge}sk..`,
  `..ks${edge}${mid.repeat(6)}${edge}sk..`,
  `..ks${edge.repeat(8)}sk..`,
  '...kssssssssk...',
  '....kkkkkkkk....',
  '................', '................', '................',
];
export default {
  kind: 'pad',
  about: 'A flat stone that lights up when pressed (default ability Push). A "sequence" goal asks for pads in an order the clues reveal.',
  fields: { by: 'the ability that presses it (default "push")' },
  check(o, v) { if (o.by) v.ability(o.by, 'by'); },
  start: () => ({ st: 'off' }),
  solid: () => false,
  lit: (t) => t.st === 'on',
  reset: (t) => { t.st = 'off'; },
  force: (t) => { t.st = t.st === 'on' ? 'off' : 'on'; return t.st === 'on' ? 'lit' : 'dark'; },
  how: (o) => `${o.by ? `${o.by[0].toUpperCase()}${o.by.slice(1)}` : 'Push'} it: it lights up.`,
  actions: [
    { ability: (t) => t.def.by || 'push', when: (t) => t.st === 'off', do: (t) => { t.st = 'on'; }, say: () => 'Click! The stone lights up.' },
  ],
  art: {
    pal: { s: '#b4bccd', d: '#8b93a7', b: '#9de0ff', w: '#ffffff' },
    states: { default: stone('d', 's'), on: stone('b', 'w') },
  },
};
