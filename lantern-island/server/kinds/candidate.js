// One of several look-alike objects (clay pots). An "odd-one-out" goal says which one is right; the clues
// tell them apart. Using the wrong one costs nothing: it says so, and the team can try again.
const pot = [
  '................',
  '................',
  '.....kkkkkk.....',
  '....kddddddk....',
  '.....kcccck.....',
  '....kcclccck....',
  '...kccllcccck...',
  '..kccllcccccck..',
  '..kcclccccccck..',
  '..kcccccccccck..',
  '..kdccccccccdk..',
  '...kdccccccdk...',
  '....kddddddk....',
  '.....kkkkkk.....',
  '................',
  '................',
];
import { lookProblems, lookKey } from '../looks.js';
export default {
  kind: 'candidate',
  about: 'One of several look-alike objects (pots). An "odd-one-out" goal names the right one; Use (or its "by" ability) chooses it. A wrong choice costs nothing.',
  fields: { by: 'the ability that chooses it (default "use")', look: 'how it looks (a person), for picture clues: { "hat": "red", "hair": "black", "glasses": true, "shirt": "green" }' },
  check(o, v) {
    if (o.by) v.ability(o.by, 'by');
    if (o.look !== undefined) for (const p of lookProblems(o.look)) v.problem(p);
  },
  rules: (t, things) => (t.def.look && things.some((o) => o !== t && o.kind === 'candidate' && o.def.look && lookKey(o.def.look) === lookKey(t.def.look)) ? `${t.name}: another candidate looks exactly the same, so no picture can tell them apart` : null),
  candidate: true,
  how: () => 'Use chooses it. Only one of these is right: the clues tell them apart.',
  actions: [
    { ability: (t) => t.def.by || 'use', when: (t) => t.st !== 'checked', do: (t) => { t.st = 'checked'; } },
  ],
  art: { pal: { c: '#c98a4b', d: '#8a5a2b', l: '#e0b080' }, states: { default: pot } },
};
