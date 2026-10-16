// Logic puzzles: a row of houses, a list of people or things to put in them, and rules (clues) that together
// leave exactly one way to do it. The code of a gate can ask "which house has the doctor?", so the team must put
// the clues together. The checker tries every arrangement (at most 5! = 120), so "one solution" and "every rule is
// needed" are proved, not hoped.
//
// In a map file:
//   "logic": { "street": {
//     "positions": ["red", "blue", "green"],            the houses, from left to right (house 1, 2, 3...)
//     "items": ["doctor", "baker", "teacher"],          who lives there (as many as houses)
//     "rules": { "r1": { "if": ["not", "doctor", "blue"], "text": "The doctor is not in the blue house." }, ... } } }
//
// A rule's "if" is [kind, a, b]. a and b are an item, a house colour or a house number:
//   at    a is in the same house as b          not   a is not in the same house as b
//   next  a is in a house next to b's          left  a is somewhere left of b (a smaller number)
// A clue shows a rule's sentence with {rule:<puzzle>.<rule>}; the gate's code uses {pos:<puzzle>.<item>}, the
// house number of that item (codes.js).

export const RULE_KINDS = ['at', 'not', 'next', 'left'];
const NAME = /^[a-z][a-z0-9-]*$/;

const perms = (n) => {
  const out = [];
  const go = (rest, acc) => { if (!rest.length) out.push(acc); else rest.forEach((x, i) => go([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x])); };
  go(Array.from({ length: n }, (_, i) => i + 1), []);
  return out;
};

// The house number of an item, a house colour or a house number, in this arrangement.
const place = (p, assign, name) => (typeof name === 'number' ? name : p.positions.includes(name) ? p.positions.indexOf(name) + 1 : assign[name]);
function holds([kind, a, b], p, assign) {
  const x = place(p, assign, a), y = place(p, assign, b);
  return kind === 'at' ? x === y : kind === 'not' ? x !== y : kind === 'next' ? Math.abs(x - y) === 1 : x < y;
}

// Every arrangement the rules allow (default: all rules): [{ doctor: 3, baker: 1, ... }].
export function arrangements(p, ruleIds = Object.keys(p.rules)) {
  const rules = ruleIds.map((id) => p.rules[id].if);
  return perms(p.items.length).map((order) => Object.fromEntries(p.items.map((it, i) => [it, order[i]])))
    .filter((assign) => rules.every((r) => holds(r, p, assign)));
}
// The different house numbers these items can have, one list per arrangement ("3,1").
const projections = (p, items, ruleIds) => new Set(arrangements(p, ruleIds).map((a) => items.map((it) => a[it]).join()));

// The house number of every item, if the rules leave exactly one arrangement (else null).
export function solution(p) {
  const all = arrangements(p);
  return all.length === 1 ? all[0] : null;
}
// The house numbers an item can have, over all arrangements.
export const domainOf = (p, item) => [...new Set(arrangements(p).map((a) => a[item]))];

// Everything wrong with one puzzle.
export function logicProblems(id, p) {
  const out = [], where = `puzzle "${id}"`;
  if (!NAME.test(id)) out.push(`${where}: the id uses small letters, numbers and dashes, starting with a letter`);
  if (!p || typeof p !== 'object' || Array.isArray(p)) return [...out, `${where}: must be { "positions": [...], "items": [...], "rules": {...} }`];
  for (const k of Object.keys(p)) if (!['positions', 'items', 'rules'].includes(k) && !k.endsWith('Help')) out.push(`${where}: unknown field "${k}". Fields: positions, items, rules`);
  const list = (key) => (Array.isArray(p[key]) && p[key].length >= 3 && p[key].length <= 5 && p[key].every((s) => typeof s === 'string' && NAME.test(s)) && new Set(p[key]).size === p[key].length);
  if (!list('positions')) out.push(`${where}: "positions" is 3 to 5 different names (small letters), the houses from left to right, for example ["red", "blue", "green"]`);
  if (!list('items')) out.push(`${where}: "items" is 3 to 5 different names (small letters), for example ["doctor", "baker", "teacher"]`);
  if (out.length) return out;
  if (p.positions.length !== p.items.length) out.push(`${where}: ${p.positions.length} houses but ${p.items.length} items. There must be the same number`);
  const clash = p.items.filter((i) => p.positions.includes(i));
  if (clash.length) out.push(`${where}: "${clash[0]}" is both a house and an item`);
  if (!p.rules || typeof p.rules !== 'object' || Array.isArray(p.rules) || Object.keys(p.rules).length < 2) return [...out, `${where}: "rules" is { "r1": { "if": ["not", "doctor", "blue"], "text": "The doctor is not in the blue house." }, ... } with at least two rules`];
  const known = (n) => (typeof n === 'number' ? Number.isInteger(n) && n >= 1 && n <= p.positions.length : p.items.includes(n) || p.positions.includes(n));
  for (const [rid, r] of Object.entries(p.rules)) {
    if (rid.endsWith('Help')) continue;
    const w = `${where}, rule "${rid}"`;
    if (!NAME.test(rid)) out.push(`${w}: the id uses small letters, numbers and dashes, starting with a letter`);
    if (!r || typeof r !== 'object' || !Array.isArray(r.if) || r.if.length !== 3) { out.push(`${w}: needs "if": [kind, a, b] and "text"`); continue; }
    const [kind, a, b] = r.if;
    if (!RULE_KINDS.includes(kind)) out.push(`${w}: kind "${kind}" is not one of ${RULE_KINDS.join(', ')}`);
    else if (!known(a) || !known(b)) out.push(`${w}: "${!known(a) ? a : b}" is not an item, a house or a house number (1 to ${p.positions.length})`);
    else if (a === b) out.push(`${w}: a and b are the same`);
    else if (!p.items.includes(a) && !p.items.includes(b)) out.push(`${w}: one of a and b must be an item (two houses always say the same)`);
    if (typeof r.text !== 'string' || !r.text.trim()) out.push(`${w}: needs "text", the sentence a clue shows`);
  }
  if (out.length) return out;
  if (!arrangements(p).length) out.push(`${where}: no arrangement follows all the rules (they contradict each other)`);
  return out;
}

// What the gate's code needs of a puzzle: asked about these items, the rules must leave one answer, and
// every rule must be needed for it. `items`: the items whose house numbers the code uses.
export function answerProblems(id, p, items) {
  const out = [];
  if (projections(p, items, undefined).size !== 1) { out.push(`the rules of puzzle "${id}" leave ${projections(p, items, undefined).size} possible answers for ${items.join(' and ')}. Add a rule.`); return out; }
  for (const rid of Object.keys(p.rules)) {
    const left = Object.keys(p.rules).filter((x) => x !== rid);
    if (projections(p, items, left).size === 1) out.push(`rule "${rid}" of puzzle "${id}" is not needed to find ${items.join(' and ')}: the other rules already give the answer. Remove it or make another rule depend on it.`);
  }
  return out;
}
