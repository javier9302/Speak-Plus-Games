// A barrier: anything that blocks the way until its "requires" are met. A door, a turnstile, a laser, a vine wall, a
// guard: it is only a picture (a pack's "skin") plus what opens it. No code is needed for a new one.
//
//   "requires": one rule, or a list. Each rule has ONE of:
//     { "item": "id-card" }                  a player Uses the item on it (it stays in the pocket; "consume": true uses it up)
//     { "code": { "type": "word", ... } }    the team types a code (codes.js); { "word": "MOON" } is a shortcut
//     { "ability": "fix" }                   a player with this ability does it (Fix the vine wall, Push the crate...)
//     { "playersOn": ["plate-a", "plate-b"] }  players stand on all these plates (kind "plate", no "target") at the same time
//   Item, code and ability rules are done in the order of the list; plates can be done at any time. When every rule is met
//   the barrier unlocks, and somebody must Open it (or it opens by itself with "finish": "auto").
import { codeProblems } from '../codes.js';

const KEYS = ['item', 'code', 'word', 'ability', 'playersOn'];
const rules = (t) => [].concat(t.def.requires ?? []);
const keyOf = (r) => KEYS.find((k) => r?.[k] !== undefined);
const isPlates = (r) => keyOf(r) === 'playersOn';
// The next rule a player must do: the first that is not met, not counting plates.
const nextIndex = (t) => rules(t).findIndex((r, i) => !t.met.includes(i) && !isPlates(r));
const next = (t) => rules(t)[nextIndex(t)];
const nextKey = (t) => (t.st === 'locked' && next(t) ? keyOf(next(t)) : null);
const meet = (t, i) => {
  if (i < 0) return;
  if (!t.met.includes(i)) t.met.push(i);
  if (rules(t).every((_, k) => t.met.includes(k))) t.st = t.def.finish === 'auto' ? 'open' : 'closed';
};
const doNext = (t) => meet(t, nextIndex(t));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export default {
  kind: 'barrier',
  about: 'Anything that blocks the way until its "requires" are met: a door, turnstile, laser, vine wall or guard. Rules: an item, a code or word, an ability, players standing on plates. Then Open.',
  fields: {
    requires: 'what opens it: one rule or a list of rules ({ "item" }, { "code" }, { "word" }, { "ability" }, { "playersOn": [plate ids] })',
    finish: '"open" (default: when every rule is met somebody Opens it) or "auto" (it opens by itself)',
  },
  check(o, v) {
    const list = [].concat(o.requires ?? []);
    if (!list.length) return v.problem('a barrier needs "requires": a rule like { "item": "key" }, or a list of rules');
    if (o.finish !== undefined && !['open', 'auto'].includes(o.finish)) v.problem('"finish" is "open" or "auto"');
    let codes = 0;
    list.forEach((r, i) => {
      const w = `requires #${i + 1}`;
      if (!r || typeof r !== 'object' || Array.isArray(r)) return v.problem(`${w}: a rule is { "item": ... } or { "code": ... } or { "word": ... } or { "ability": ... } or { "playersOn": [...] }`);
      const keys = KEYS.filter((k) => r[k] !== undefined);
      for (const k of Object.keys(r)) if (!KEYS.includes(k) && k !== 'consume') v.problem(`${w}: unknown field "${k}". A rule has one of ${KEYS.join(', ')}`);
      if (keys.length !== 1) return v.problem(`${w}: a rule has exactly one of ${KEYS.join(', ')}`);
      if (r.consume !== undefined && !r.item) v.problem(`${w}: "consume" is only for an item rule`);
      if (r.item !== undefined) v.item(r.item, `${w} item`);
      if (r.ability !== undefined) v.ability(r.ability, `${w} ability`);
      if (r.code !== undefined) {
        codes++;
        if (typeof r.code === 'number') v.problem(`${w}: use { "type": "digits", "length": ${r.code} } for a code of digits`);
        else for (const p of codeProblems(r.code)) v.problem(`${w}: ${p}`);
      }
      if (r.word !== undefined) { codes++; for (const p of codeProblems({ type: 'word', ...(Array.isArray(r.word) ? { words: r.word } : { word: r.word }) })) v.problem(`${w}: ${p}`); }
      if (r.playersOn !== undefined) {
        if (!Array.isArray(r.playersOn) || r.playersOn.length < 2 || r.playersOn.length > 4) v.problem(`${w}: "playersOn" is a list of 2 to 4 plate ids`);
        else for (const id of r.playersOn) v.object(id, `${w} playersOn`, (k) => k.kind === 'plate', 'a plate (kind "plate", without a "target")');
      }
    });
    if (codes > 1) v.problem('a barrier can ask for only one code');
  },
  consumes: (o) => [].concat(o.requires ?? []).filter((r) => r.item && r.consume).map((r) => r.item),
  start: () => ({ st: 'locked', met: [] }),
  solid: (t) => t.st !== 'open',
  view: (t) => ({ keypad: nextKey(t) === 'code' || nextKey(t) === 'word' ? true : undefined, red: t.redUntil > Date.now() ? true : undefined }),
  force(t) {
    if (t.st === 'locked') {
      meet(t, nextIndex(t) >= 0 ? nextIndex(t) : rules(t).findIndex((_, k) => !t.met.includes(k)));
      return t.st === 'locked' ? 'did one step' : t.st === 'open' ? 'opened' : 'unlocked';
    }
    t.st = t.st === 'open' ? 'closed' : 'open';
    return t.st === 'open' ? 'opened' : 'closed';
  },
  passed: (t) => t.st === 'open',
  cleared: (t) => t.st !== 'locked',
  how(o, itemName) {
    const parts = [].concat(o.requires ?? []).map((r) => (r.item ? `Use the ${itemName(r.item)}${r.consume ? ' (it is used up)' : ''}` : r.ability ? `${cap(r.ability)} it` : r.playersOn ? `players stand on ${r.playersOn.length} plates at the same time` : 'Use, and type the code'));
    return `${parts.join(', then ')}${o.finish === 'auto' ? '. It opens by itself.' : '. Then Open.'}`;
  },
  // Plates: whenever players stand on all the plates of a rule at once, the rule is met for good.
  tick(t, c) {
    if (t.st !== 'locked') return false;
    let changed = false;
    rules(t).forEach((r, i) => {
      if (!isPlates(r) || t.met.includes(i) || t.st !== 'locked') return;
      if (r.playersOn.every((id) => { const p = c.byId(id); return p && c.someoneOn(p.x, p.y); })) { meet(t, i); changed = true; }
    });
    return changed;
  },
  // For the solver: the players can stand on all the plates of a rule at once if every plate has a different player who can reach it.
  settle(t, s) {
    for (const [i, r] of rules(t).entries()) {
      if (!isPlates(r) || t.met.includes(i)) continue;
      const tiles = r.playersOn.map((id) => s.byId[id]).map((p) => p && `${p.x},${p.y}`);
      // Each plate needs a different player who can reach it.
      const assign = (k, used) => {
        if (k === tiles.length) return [];
        for (let j = 0; j < s.regs.length; j++) {
          if (used.has(j) || !tiles[k] || !s.regs[j].has(tiles[k])) continue;
          const rest = assign(k + 1, new Set([...used, j]));
          if (rest) return [[r.playersOn[k], j], ...rest];
        }
        return null;
      };
      const stand = assign(0, new Set());
      if (stand) { meet(t, i); return { text: `${r.playersOn.length} players stand on the plates of the ${t.name.toLowerCase()}`, stand }; }
    }
    return null;
  },
  actions: [
    { ability: 'use', when: (t) => nextKey(t) === 'item' && !next(t).consume, needs: { item: (t) => next(t).item, keep: true }, do: doNext, say: () => 'It worked!', log: (t) => `the ${next(t).item} on the ${t.name.toLowerCase()}` },
    { ability: 'use', when: (t) => nextKey(t) === 'item' && !!next(t).consume, needs: { item: (t) => next(t).item }, do: doNext, say: () => 'It worked! The item is used up.', log: (t) => `the ${next(t).item} on the ${t.name.toLowerCase()}` },
    { ability: 'use', when: (t) => nextKey(t) === 'code' || nextKey(t) === 'word', needs: { code: true }, do: doNext, log: (t) => `the code of the ${t.name.toLowerCase()}` },
    { ability: (t) => next(t)?.ability, when: (t) => nextKey(t) === 'ability', do: doNext, say: () => 'It worked!', log: (t) => `the ${t.name.toLowerCase()}` },
    { ability: 'open', when: (t) => t.st === 'closed', do: (t) => { t.st = 'open'; } },
    { ability: 'close', when: (t) => t.st === 'open', solver: false, guard: (t, c) => (c.someoneOn(t.x, t.y) ? 'Somebody is standing in the way.' : null), do: (t) => { t.st = 'closed'; } },
  ],
  art: {
    pal: {"a": "#c68a4e", "b": "#8a5a2b", "c": "#ffd166", "d": "#e8483b", "e": "#2b2f45"},
    states: {
      default: ["................", ".kkkkkkkkkkkkkk.", ".kbbbbbbbbbbbbk.", ".kaaaaabbaaaaak.",
        ".kaaaaabbaaaaak.", ".kaaakkkkkkaaak.", ".kaaakddddkaaak.", ".kaaakdkkdkaaak.",
        ".kbbbkdkkdkbbbk.", ".kaaakddddkkaak.", ".kaaakkkkkkcaak.", ".kaaaaabbaaaaak.",
        ".kaaaaabbaaaaak.", ".kbbbbbbbbbbbbk.", ".kaaaaabbaaaaak.", ".kaaaaabbaaaaak."],
      locked: ["................", ".kkkkkkkkkkkkkk.", ".kbbbbbbbbbbbbk.", ".kaaaaabbaaaaak.",
        ".kaaaaabbaaaaak.", ".kaaakkkkkkaaak.", ".kaaakddddkaaak.", ".kaaakdkkdkaaak.",
        ".kbbbkdkkdkbbbk.", ".kaaakddddkkaak.", ".kaaakkkkkkcaak.", ".kaaaaabbaaaaak.",
        ".kaaaaabbaaaaak.", ".kbbbbbbbbbbbbk.", ".kaaaaabbaaaaak.", ".kaaaaabbaaaaak."],
      closed: ["................", ".kkkkkkkkkkkkkk.", ".kbbbbbbbbbbbbk.", ".kaaaaabbaaaaak.",
        ".kaaaaabbaaaaak.", ".kaaaaabbaaaaak.", ".kaaaaabbaaaaak.", ".kaaaaabbaaaaak.",
        ".kbbbbbbbbbbbbk.", ".kaaaaabbakkaak.", ".kaaaaabbaccaak.", ".kaaaaabbaaaaak.",
        ".kaaaaabbaaaaak.", ".kbbbbbbbbbbbbk.", ".kaaaaabbaaaaak.", ".kaaaaabbaaaaak."],
      open: ["................", ".kkkkkkkkkkkkkk.", ".kbbbbbbbbbbbbk.", ".kaabeeeeeeeeek.",
        ".kaabeeeeeeeeek.", ".kaabeeeeeeeeek.", ".kaabeeeeeeeeek.", ".kaabeeeeeeeeek.",
        ".kaabeeeeeeeeek.", ".kaabeeeeeeeeek.", ".kaabeeeeeeeeek.", ".kaabeeeeeeeeek.",
        ".kaabeeeeeeeeek.", ".kaabeeeeeeeeek.", ".kaabeeeeeeeeek.", ".kaabeeeeeeeeek."],
    },
  },
};
