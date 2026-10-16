// Codes: what a code gate asks for, what its answer is each mission, and which clues the team needs to know it.
//
// A gate's "code" is either a number (the old way: that many digits, shared by every such gate, written in clues
// as {d1} {d2}...) or an object:
//   { "type": "digits",  "length": 3 }                       random digits, 0 to 9
//   { "type": "digits",  "length": 2, "answer": "{sum:house,birds}" }   worked out from the map's "facts"
//   { "type": "word",    "word": "MOON" }  or  "words": ["MOON", "STAR"] (one at random each mission)
//   { "type": "symbols", "length": 4 }                       from 8 pictures: 4 096 ways, not 1 000
// plus an optional "tries" (wrong tries before the lock goes red, default 2) and "lock" (seconds, 30 to 60, default 45).
//
// "facts" on the map: { "house": { "range": [1, 9] }, "birds": { "pick": [2, 4, 6] } }. Each mission draws one value
// for each. Clues give them as {fact:house}; a code's "answer" is a formula over them: {fact:x}, {sum:a,b},
// {diff:a,b} (a minus b), {times:a,b}, with other characters kept as they are. {pos:<puzzle>.<item>} is the house
// number of an item in a logic puzzle (logic.js), so a code can ask "which house has the doctor?".
//
// In clues: {rule:<puzzle>.<rule>} is the sentence of a logic rule. {code:<gate id>:<n>} is the n-th digit, letter or picture name of that gate's answer, {code:<gate id>}
// all of it, {fact:<id>} a fact. The solver and the checker use tokens (see clueTokens) to know what a clue gives.
import crypto from 'node:crypto';
import { solution, domainOf, answerProblems } from './logic.js';

export const SYMBOLS = [
  { id: 'sun', icon: '☀️' }, { id: 'moon', icon: '🌙' }, { id: 'star', icon: '⭐' }, { id: 'fish', icon: '🐟' },
  { id: 'tree', icon: '🌳' }, { id: 'boat', icon: '⛵' }, { id: 'bird', icon: '🐦' }, { id: 'house', icon: '🏠' },
];
export const TYPES = ['digits', 'word', 'symbols'];
export const DEFAULT_TRIES = 2, DEFAULT_LOCK = 45;
const FORMULA = /\{(fact|sum|diff|times|pos):([a-z0-9,.-]+)\}/g;
const CODE_FIELDS = ['type', 'length', 'answer', 'word', 'words', 'tries', 'lock'];
const FACT_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

// The normal form of a code: { type, length, legacy?, answer?, words?, tries, lock }, or null if it is not one.
export function codeSpec(code) {
  const base = { tries: DEFAULT_TRIES, lock: DEFAULT_LOCK };
  if (Number.isInteger(code) && code >= 2 && code <= 6) return { ...base, type: 'digits', length: code, legacy: true };
  if (!code || typeof code !== 'object' || Array.isArray(code)) return null;
  const words = (code.words || (code.word ? [code.word] : [])).map((w) => String(w).toUpperCase());
  const type = code.type || 'digits';
  const length = type === 'word' ? words[0]?.length : code.length;
  return {
    ...base, type, length, answer: code.answer, words,
    tries: Number.isInteger(code.tries) ? code.tries : DEFAULT_TRIES,
    lock: Number.isFinite(code.lock) ? Math.min(60, Math.max(30, code.lock)) : DEFAULT_LOCK,
  };
}
// The code an object asks for: a gate's "code", or the code (or word) rule in a barrier's "requires".
export function codeOf(def) {
  if (def?.code !== undefined) return def.code;
  for (const r of [].concat(def?.requires ?? [])) {
    if (r?.code !== undefined) return r.code;
    if (r?.word !== undefined) return Array.isArray(r.word) ? { type: 'word', words: r.word } : { type: 'word', word: r.word };
  }
  return undefined;
}
export const specOf = (def) => codeSpec(codeOf(def));

// The facts a formula uses.
export const factsIn = (formula) => [...String(formula).matchAll(FORMULA)].flatMap(([, , args]) => args.split(','));
// A formula's value for these fact values, or null (a negative number, a missing fact).
export function evalFormula(formula, values) {
  let bad = false;
  const out = String(formula).replace(FORMULA, (m, op, args) => {
    const n = args.split(',').map((f) => values[f]);
    if (n.some((x) => !Number.isInteger(x))) { bad = true; return ''; }
    const r = op === 'fact' || op === 'pos' ? n[0] : op === 'sum' ? n.reduce((a, b) => a + b, 0) : op === 'diff' ? n.reduce((a, b) => a - b) : n.reduce((a, b) => a * b, 1);
    if (r < 0) bad = true;
    return String(r);
  });
  return bad ? null : out;
}
// Every value a name in a formula can take: a fact's values, or the house numbers an item can have.
function domains(facts, logic) {
  const d = Object.fromEntries(Object.entries(facts || {}).filter(([k]) => !k.endsWith('Help')).map(([k, f]) => [k, factValues(f)]));
  for (const [pid, p] of Object.entries(logic || {})) if (!pid.endsWith('Help')) for (const item of p.items || []) d[`${pid}.${item}`] = domainOf(p, item);
  return d;
}
const factValues = (f) => (Array.isArray(f?.pick) ? f.pick : f?.range ? Array.from({ length: f.range[1] - f.range[0] + 1 }, (_, i) => f.range[0] + i) : []);

// Everything wrong with a map's "facts".
export function factProblems(facts) {
  if (facts === undefined) return [];
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return ['"facts" is { "<id>": { "range": [1, 9] } } or { "<id>": { "pick": [2, 4, 6] } }'];
  const out = [];
  for (const [id, f] of Object.entries(facts)) {
    if (id.endsWith('Help')) continue;
    if (!FACT_ID.test(id)) out.push(`fact "${id}": the id uses small letters, numbers and dashes`);
    const ok = (f && Array.isArray(f.pick) && f.pick.length >= 2 && f.pick.every((n) => Number.isInteger(n) && n >= 0 && n <= 99))
      || (f && Array.isArray(f.range) && f.range.length === 2 && f.range.every((n) => Number.isInteger(n) && n >= 0 && n <= 99) && f.range[1] > f.range[0]);
    if (!ok) out.push(`fact "${id}": needs "range": [from, to] or "pick": [a, b, c] with whole numbers from 0 to 99, at least two different values`);
  }
  return out;
}

// Everything wrong with one code. `facts`: the map's facts, or null to skip the checks that need them.
export function codeProblems(code, facts = null, logic = {}) {
  if (typeof code === 'number' || code === undefined) return code === undefined || (Number.isInteger(code) && code >= 2 && code <= 6) ? [] : ['"code" is the number of digits, 2 to 6'];
  if (!code || typeof code !== 'object' || Array.isArray(code)) return ['"code" is a number of digits (2 to 6) or { "type": "digits" | "word" | "symbols", ... }'];
  const out = [];
  for (const k of Object.keys(code)) if (!CODE_FIELDS.includes(k) && !k.endsWith('Help')) out.push(`"code" has an unknown field "${k}". Fields: ${CODE_FIELDS.join(', ')}`);
  const type = code.type || 'digits';
  if (!TYPES.includes(type)) return [...out, `"code" type "${type}" is not one of ${TYPES.join(', ')}`];
  if (type === 'word') {
    const words = code.words || (code.word ? [code.word] : []);
    if (!Array.isArray(words) || !words.length || words.some((w) => !/^[A-Za-z]{3,8}$/.test(w))) out.push('a word code needs "word": "MOON" or "words": ["MOON", "STAR"], with 3 to 8 letters each');
    else if (new Set(words.map((w) => w.length)).size > 1) out.push('"words" must all have the same number of letters');
    if (code.length !== undefined || code.answer !== undefined) out.push('a word code takes "word" or "words", not "length" or "answer"');
  } else {
    if (!Number.isInteger(code.length) || code.length < 2 || code.length > 6) out.push('"length" is how many digits or pictures: 2 to 6');
    if (code.word !== undefined || code.words !== undefined) out.push(`a ${type} code has no "word"`);
    if (code.answer !== undefined && type !== 'digits') out.push('"answer" (a formula over facts) is only for digit codes');
  }
  if (code.tries !== undefined && !(Number.isInteger(code.tries) && code.tries >= 1 && code.tries <= 5)) out.push('"tries" is how many wrong tries before the lock goes red: 1 to 5');
  if (code.lock !== undefined && !(Number.isFinite(code.lock) && code.lock >= 30 && code.lock <= 60)) out.push('"lock" is how many seconds the lock stays red: 30 to 60');
  if (code.answer !== undefined) {
    const formula = String(code.answer), used = factsIn(formula);
    if (!used.length) out.push('"answer" must use at least one fact, for example "{sum:house,birds}"');
    else if (facts) {
      const dom = domains(facts, logic), missing = used.filter((f) => !dom[f]);
      if (missing.length) out.push(`"answer" uses "${missing[0]}", which this map does not define (map fields "facts" and "logic")`);
      else if (Number.isInteger(code.length)) {
        // Every value the facts can take must give an answer of the right length.
        const names = [...new Set(used)], lists = names.map((n) => dom[n]);
        let total = 1; for (const l of lists) total *= l.length;
        for (let i = 0; i < Math.min(total, 5000); i++) {
          const values = {}; let rest = i;
          names.forEach((n, k) => { values[n] = lists[k][rest % lists[k].length]; rest = Math.floor(rest / lists[k].length); });
          const v = evalFormula(formula, values);
          if (v === null || !/^\d+$/.test(v) || v.length !== code.length) { out.push(`"answer" ${formula} gives ${v === null ? 'a negative number' : `"${v}"`} when ${names.map((n) => `${n} is ${values[n]}`).join(' and ')}; it must always be ${code.length} digits`); break; }
        }
      }
      // Asked about these items, each puzzle must leave one answer, and every one of its rules must be needed for it.
      const asked = {};
      if (!missing.length) for (const f of used.filter((x) => x.includes('.'))) { const [pid, item] = f.split('.'); (asked[pid] ||= new Set()).add(item); }
      for (const [pid, items] of Object.entries(asked)) out.push(...answerProblems(pid, logic[pid], [...items]));
    }
  }
  return out;
}

const pick = (list) => list[crypto.randomInt(list.length)];
// A new mission's secrets: one value for each fact, and the answer of each code gate that is not an old numeric one.
// `legacy`: the shared digits of the old numeric codes (a string of 6 digits).
export function makeSecrets(zone, legacy = '') {
  const facts = {};
  for (const [id, f] of Object.entries(zone.facts || {})) if (!id.endsWith('Help')) facts[id] = pick(factValues(f));
  const answers = {}, values = { ...facts };
  for (const [pid, p] of Object.entries(zone.logic || {})) {
    const sol = pid.endsWith('Help') ? null : solution(p);
    for (const [item, house] of Object.entries(sol || {})) values[`${pid}.${item}`] = house;
  }
  for (const o of zone.objects) {
    const spec = specOf(o);
    if (!spec) continue;
    if (spec.legacy) answers[o.id] = legacy.slice(0, spec.length);
    else if (spec.type === 'word') answers[o.id] = pick(spec.words);
    else if (spec.type === 'symbols') answers[o.id] = Array.from({ length: spec.length }, () => pick(SYMBOLS).id);
    else answers[o.id] = spec.answer !== undefined ? evalFormula(spec.answer, values) ?? '' : Array.from({ length: spec.length }, () => String(crypto.randomInt(10))).join('');
  }
  return { facts, answers };
}

const parts = (answer) => (Array.isArray(answer) ? answer : [...String(answer)]);
// The n-th piece (1 to length) of an answer, or the whole answer.
export const partOf = (answer, n) => (n ? parts(answer)[n - 1] ?? '?' : Array.isArray(answer) ? answer.join(', ') : String(answer));
// The answer in words, for the teacher.
export const answerText = (answer) => partOf(answer);
// What the phone asks for.
export const keypadOf = (spec) => ({ kind: spec.type, length: spec.length, symbols: spec.type === 'symbols' ? SYMBOLS : undefined });

// An attempt: { complete, ok }. A short attempt is not counted (the phone does not send one, but a hand-made message could).
export function judge(spec, answer, value) {
  const v = String(value ?? '');
  if (spec.type === 'symbols') {
    const got = v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    return { complete: got.length === spec.length && got.every((s) => SYMBOLS.some((x) => x.id === s)), ok: got.join(',') === answer.join(',') };
  }
  const got = spec.type === 'word' ? v.replace(/[^A-Za-z]/g, '').toUpperCase() : v.replace(/\D/g, '');
  return { complete: got.length === spec.length, ok: got === String(answer).toUpperCase() };
}

// ---- What a clue gives, for the solver and the checker ----
const PLACEHOLDER = /\{(d\d|fact:[a-z0-9-]+|rule:[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*|code:[a-z0-9-]+(?::\d)?)\}/g;
// The tokens a clue's text hands out: "d:1" (old digit), "fact:house", "code:gate:2", "code:gate:*" (all of it).
export function clueTokens(text) {
  const out = new Set();
  for (const [, ph] of String(text).matchAll(PLACEHOLDER)) {
    const parts = ph.split(':');
    if (parts[0].startsWith('d') && parts.length === 1) out.add(`d:${ph.slice(1)}`);
    else if (parts[0] === 'fact' || parts[0] === 'rule') out.add(`${parts[0]}:${parts[1]}`);
    else out.add(`code:${parts[1]}:${parts[2] ?? '*'}`);
  }
  return out;
}
// The tokens a gate needs, all of them, to be opened by knowing its answer.
export function needTokens(def, id, logic = {}) {
  const spec = specOf(def);
  if (!spec) return [];
  if (spec.legacy) return Array.from({ length: spec.length }, (_, i) => `d:${i + 1}`);
  if (spec.answer !== undefined) {
    // A fact is one clue; a logic puzzle needs every one of its rules.
    const out = new Set();
    for (const f of factsIn(spec.answer)) {
      if (f.includes('.')) for (const r of Object.keys(logic[f.split('.')[0]]?.rules || {})) out.add(`rule:${f.split('.')[0]}.${r}`);
      else out.add(`fact:${f}`);
    }
    return [...out];
  }
  return Array.from({ length: spec.length }, (_, i) => `code:${id}:${i + 1}`);
}
// True if the found tokens are enough for this gate.
// A clue that gives the whole answer ({code:<id>}) is always enough.
export const isKnown = (def, id, found, logic = {}) => found.has(`code:${id}:*`) || needTokens(def, id, logic).every((t) => found.has(t));
