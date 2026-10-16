// A gate: locked -> closed <-> open. Use unlocks it, with its key or (a code gate) by typing its code.
import { codeProblems, specOf } from '../codes.js';
const key = (t) => t.def.key || 'key';
export default {
  kind: 'gate',
  about: 'A gate. Locked: Use unlocks it with its key, or by typing its code (the digits are in clues). Then Open; Close shuts it.',
  fields: {
    locked: 'true: it starts locked', key: 'the item that unlocks it (default "key")',
    code: 'a code gate: a number of digits (2 to 6; clues give them as {d1}, {d2}...) or { "type": "digits" | "word" | "symbols", ... } (docs/SCENARIO_GUIDE.md, section 3b)',
  },
  check(o, v) {
    if (o.locked && !o.code) v.item(o.key || 'key', 'key');
    if (o.code !== undefined) for (const p of codeProblems(o.code)) v.problem(p);
  },
  start: (def) => ({ st: def.locked ? 'locked' : 'closed' }),
  solid: (t) => t.st !== 'open',
  holdable: true,
  view: (t) => ({ keypad: t.def.code ? true : undefined, red: t.redUntil > Date.now() ? true : undefined }),
  force: (t) => { t.st = t.st === 'open' ? 'closed' : 'open'; return t.st === 'open' ? 'opened' : 'closed'; },
  passed: (t) => t.st === 'open',
  cleared: (t) => !!t.def.locked && t.st !== 'locked',
  how: (o, itemName) => (o.code ? `Locked with a code of ${specOf(o).length} ${{ digits: 'numbers', word: 'letters (a word)', symbols: 'pictures' }[specOf(o).type]}. Use, type the code, then Open.` : o.locked ? `Locked. Use with the ${itemName(o.key || 'key')} in your pocket, then Open.` : 'Open. Close shuts it again.'),
  actions: [
    { ability: 'use', when: (t) => t.st === 'locked' && !!t.def.code, needs: { code: true }, do: (t) => { t.st = 'closed'; }, log: (t) => `the code of the ${t.name.toLowerCase()}` },
    {
      ability: 'use', when: (t) => t.st === 'locked' && !t.def.code, needs: { item: key, keep: true },
      missing: (t, c) => `It is locked. You need the ${c.itemName(key(t))}.`,
      do: (t) => { t.st = 'closed'; }, say: () => 'Unlocked! Now somebody can open it.',
      log: (t) => `the ${key(t)} on the ${t.name.toLowerCase()}`,
    },
    { ability: 'open', when: (t) => t.st === 'closed', do: (t) => { t.st = 'open'; } },
    { ability: 'close', when: (t) => t.st === 'open', solver: false, guard: (t, c) => (c.someoneOn(t.x, t.y) ? 'Somebody is standing in the gate.' : null), do: (t) => { t.st = 'closed'; } },
  ],
};
