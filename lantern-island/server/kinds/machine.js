// A broken machine (a pump, a clock, a lamp). Fix it (with the item it names, if any) and it works again.
// A "restore" goal counts the machines that work.
const wheel = (c) => [
  '................',
  '...kkkkkkkkkk...',
  '..kllllllllllk..',
  '..klmmmmmmmmlk..',
  '..klmkkkkkkmlk..',
  `..klmk${c}${c}${c}${c}kmlk..`,
  `..klmk${c}kk${c}kmlk..`,
  `..klmk${c}kk${c}kmlk..`,
  `..klmk${c}${c}${c}${c}kmlk..`,
  '..klmkkkkkkmlk..',
  '..klmmmmmmmmlk..',
];
const bottom = ['..kllllllllllk..', '..kddddddddddk..', '...kkkkkkkkkk...', '................'];
export default {
  kind: 'machine',
  about: 'A broken machine (a pump, a clock, a lamp). Fix it, with the item it names if it needs one; then it works. A "restore" goal counts the machines that work.',
  fields: { needs: 'the item that fixes it (optional)', by: 'the ability that fixes it (default "fix")' },
  check(o, v) { if (o.needs) v.item(o.needs, 'needs'); if (o.by) v.ability(o.by, 'by'); },
  consumes: (o) => (o.needs ? [o.needs] : []),
  start: () => ({ st: 'broken' }),
  working: (t) => t.st === 'running',
  force: (t) => { if (t.st === 'running') return null; t.st = 'running'; return 'fixed'; },
  passed: (t) => t.st === 'running',
  cleared: (t) => t.st === 'running',
  how: (o, itemName) => `Broken. ${o.by ? `${o.by[0].toUpperCase()}${o.by.slice(1)}` : 'Fix'} it${o.needs ? ` with the ${itemName(o.needs)}` : ''}, and it works again.`,
  actions: [
    {
      ability: (t) => t.def.by || 'fix', when: (t) => t.st === 'broken' && !!t.def.needs, needs: { item: (t) => t.def.needs },
      missing: (t, c) => `It is broken. You need a ${c.itemName(t.def.needs)} to fix it.`,
      do: (t) => { t.st = 'running'; }, say: () => 'It works again!',
    },
    { ability: (t) => t.def.by || 'fix', when: (t) => t.st === 'broken' && !t.def.needs, do: (t) => { t.st = 'running'; }, say: () => 'It works again!' },
  ],
  art: {
    pal: { l: '#b4bccd', m: '#8b93a7', d: '#5e6680', y: '#ffd166', r: '#e8483b', g: '#38b764' },
    states: {
      default: [...wheel('d'), '..klmrmmmmmmlk..', ...bottom],
      running: [...wheel('y'), '..klmgmmmmmmlk..', ...bottom],
    },
  },
};
