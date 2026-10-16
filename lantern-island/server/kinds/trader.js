// A trader: wants one thing and gives another. Talk, with the item it wants in your pocket, makes the trade; then Pick up
// what it gives. Without the item, Talk tells the player what it wants (in the trader's own words), so the team has
// to pass it on. Chain traders (A wants X and gives Y; B wants Y and gives Z) for a trading mission.
const a = (s) => (/^[aeiou]/i.test(s) ? 'an' : 'a');
export default {
  kind: 'trader',
  about: 'A trader. Talk, with the item it wants in your pocket, trades it for another item to Pick up. Without the item, Talk says what it wants. Chain them.',
  fields: {
    wants: 'the item it wants', gives: 'the item it gives back',
    says: 'what it says when you come without the item (default: "I would like a <item>, please.")',
    thanks: 'what it says after the trade',
  },
  check(o, v) {
    v.item(o.wants, 'wants'); v.item(o.gives, 'gives');
    if (o.wants && o.wants === o.gives) v.problem('"wants" and "gives" are the same item');
    if (o.clues?.talk) v.problem('a trader says what it wants by itself when you Talk without the item; remove the "talk" clue and use "says" instead');
    for (const k of ['says', 'thanks']) if (o[k] !== undefined && (typeof o[k] !== 'string' || !o[k].trim())) v.problem(`"${k}" is a sentence`);
  },
  start: () => ({ st: 'wants', holds: null }),
  consumes: (o) => [o.wants],
  force(t) {
    if (t.st === 'wants') { t.st = 'paid'; t.holds = t.def.gives; return 'traded'; }
    return null;
  },
  returned: (t) => { t.st = 'paid'; },
  how: (o, itemName) => `Talk, with the ${itemName(o.wants)} in your pocket (it wants ${a(itemName(o.wants))} ${itemName(o.wants)}). Then Pick up the ${itemName(o.gives)}.`,
  actions: [
    {
      ability: 'talk', when: (t) => t.st === 'wants', needs: { item: (t) => t.def.wants },
      missing: (t, c) => t.def.says || `I would like ${a(c.itemName(t.def.wants))} ${c.itemName(t.def.wants)}, please.`,
      do: (t) => { t.st = 'paid'; t.holds = t.def.gives; },
      say: (t, c) => t.def.thanks || `Thank you! Here is the ${c.itemName(t.def.gives)}. Somebody can pick it up.`,
      log: (t) => `the ${t.def.wants} to the ${t.name.toLowerCase()}`,
    },
    { ability: 'pickup', when: (t) => t.st === 'paid' && !!t.holds, gives: true, do: (t) => { t.holds = null; t.st = 'done'; } },
  ],
  art: {
    pal: {'h': '#e8483b', 's': '#f6c9a0', 'c': '#41a6f6', 'd': '#1f2f5c'},
    states: {
      default: [
        '......kkkk......', '.....kkkkkk.....', '....khhhhhhk....', '....kkkkkkkk....',
        '.....kkkkkk.....', '.....kssssk.....', '.....kskskk.....', '.....kssssk.....',
        '.....kkkkkk.....', '....kcccccck....', '...kkcddddckk...', '...kkcccccckk...',
        '...kkcccccckk...', '...kkcccccckk...', '....kkkkkkkk....', '.....kk..kk.....',
      ],
    },
  },
};
