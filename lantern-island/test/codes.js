// Codes (server/codes.js): digits, words and pictures; answers worked out from facts; the red lock after wrong tries;
// and the rule that every clue is needed. Run with: npm test, or node test/codes.js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.js';
import { loadContent } from '../server/content.js';
import { loadAbilities, dealPreset } from '../server/abilities.js';
import { normalizeMission, zoneFor } from '../server/missions.js';
import { solve } from '../server/solver.js';
import { runCheck } from '../server/check.js';
import { zoneProblems } from '../server/validate.js';
import { arrangements, solution, logicProblems, answerProblems } from '../server/logic.js';
import { codeSpec, codeProblems, factProblems, evalFormula, judge, makeSecrets, clueTokens, needTokens, isKnown, partOf } from '../server/codes.js';
import { client } from './client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A field cut in three by walls of water, each with a gate; the machine to fix is at the far end.
const rows = Array.from({ length: 13 }, (_, y) => (y === 0 || y === 12 ? '~'.repeat(26) : `~${','.repeat(24)}~`)).map((r, y) => {
  if (y === 0 || y === 12) return r;
  const a = [...r];
  for (const x of [14, 17, 20, 23]) if (y !== 6) a[x] = '~';
  if (y === 6) a.splice(3, 6, ...'pppppp');
  return a.join('');
});
const zone = {
  id: 'code-field', name: 'Code field', theme: 'day', rows,
  goal: { type: 'restore', story: 'Fix the lamp behind the three gates.' },
  places: [], landmarks: [],
  facts: { a: { range: [5, 9] }, b: { pick: [5, 6, 7] } },
  logic: { street: {
    positions: ['red', 'blue', 'green', 'yellow'], items: ['doctor', 'baker', 'teacher', 'pilot'],
    rules: {
      r1: { if: ['left', 'doctor', 'teacher'], text: 'The doctor lives to the left of the teacher.' },
      r2: { if: ['not', 'baker', 'green'], text: 'The baker does not live in the green house.' },
      r3: { if: ['next', 'baker', 'pilot'], text: 'The baker lives next to the pilot.' },
      r4: { if: ['next', 'baker', 'blue'], text: 'The baker lives next to the blue house.' },
    },
  } },
  objects: [
    { id: 'gate1', kind: 'gate', name: 'Sum gate', x: 14, y: 6, locked: true, code: { type: 'digits', length: 2, answer: '{sum:a,b}' } },
    { id: 'gate2', kind: 'gate', name: 'Word gate', x: 17, y: 6, locked: true, code: { type: 'word', words: ['MOON', 'STAR'] } },
    { id: 'gate3', kind: 'gate', name: 'Picture gate', x: 20, y: 6, locked: true, code: { type: 'symbols', length: 3 } },
    { id: 's1', kind: 'sign', name: 'Board', x: 2, y: 2, clues: { read: 'The red house is number {fact:a}.' } },
    { id: 's2', kind: 'bottle', name: 'Bottle', x: 4, y: 2, clues: { look: 'There are {fact:b} birds on the sign.' } },
    { id: 's3', kind: 'shell', name: 'Shell', x: 6, y: 2, clues: { listen: 'Waves.' } },
    { id: 's4', kind: 'sign', name: 'Old sign', x: 15, y: 3, clues: { read: 'Letters 1 and 2: {code:gate2:1} {code:gate2:2}.' } },
    { id: 's5', kind: 'bottle', name: 'Green bottle', x: 16, y: 3, clues: { look: 'Letters 3 and 4: {code:gate2:3} {code:gate2:4}.' } },
    { id: 's6', kind: 'sign', name: 'Gate sign', x: 18, y: 3, clues: { read: 'First picture: {code:gate3:1}.' } },
    { id: 's7', kind: 'bell', name: 'Small bell', x: 19, y: 3, clues: { listen: 'Second picture: {code:gate3:2}.', look: 'Third picture: {code:gate3:3}.' } },
    { id: 'gate4', kind: 'gate', name: 'House gate', x: 23, y: 6, locked: true, code: { type: 'digits', length: 2, answer: '{pos:street.doctor}{pos:street.baker}' } },
    { id: 's8', kind: 'sign', name: 'Town sign', x: 21, y: 2, clues: { read: 'Tom says: {rule:street.r1}' } },
    { id: 's9', kind: 'bottle', name: 'Blue bottle', x: 21, y: 3, clues: { look: 'A note: {rule:street.r2}' } },
    { id: 's10', kind: 'shell', name: 'Pink shell', x: 21, y: 4, clues: { listen: 'A voice says: {rule:street.r3}' } },
    { id: 's11', kind: 'statue', name: 'Stone man', x: 21, y: 5, clues: { read: 'On the stone: {rule:street.r4}' } },
    { id: 'lamp', kind: 'machine', name: 'Lamp', x: 24, y: 6 },
    { id: 't1', kind: 'station', name: 'Tablet', x: 24, y: 9 },
  ],
};
const mission = { id: 'cf-all', title: 'All gates', zone: 'code-field', stations: [{ at: 't1' }], goal: { type: 'restore', machines: ['lamp'] } };

async function main() {
  console.log('\nThe codes themselves');
  check('a number is the old shared-digits code', codeSpec(3).legacy === true && codeSpec(3).length === 3 && codeSpec(1) === null);
  check('a word code takes its length from the word', codeSpec({ type: 'word', word: 'moon' }).length === 4 && codeSpec({ type: 'word', word: 'moon' }).words[0] === 'MOON');
  check('formulas: sum, diff, times and plain digits', evalFormula('{sum:a,b}', { a: 7, b: 8 }) === '15' && evalFormula('{diff:a,b}', { a: 9, b: 4 }) === '5' && evalFormula('{times:a,b}', { a: 3, b: 4 }) === '12' && evalFormula('{fact:a}{fact:b}', { a: 4, b: 2 }) === '42');
  check('a negative result is no answer', evalFormula('{diff:a,b}', { a: 1, b: 4 }) === null);
  const digits = codeSpec({ type: 'digits', length: 3 }), word = codeSpec({ type: 'word', word: 'MOON' }), pics = codeSpec({ type: 'symbols', length: 3 });
  check('digits: any separators, and a short try is not complete', judge(digits, '123', '1 2-3').ok && !judge(digits, '123', '12').complete);
  check('words: any case, spelling matters', judge(word, 'MOON', 'moon').ok && !judge(word, 'MOON', 'moan').ok);
  check('pictures: the same pictures in the same order', judge(pics, ['sun', 'moon', 'star'], 'sun,moon,star').ok && !judge(pics, ['sun', 'moon', 'star'], 'moon,sun,star').ok && !judge(pics, ['sun', 'moon', 'star'], 'sun,moon,cat').complete);
  check('a piece of an answer, or all of it', partOf(['sun', 'moon'], 2) === 'moon' && partOf('MOON', 3) === 'O' && partOf(['sun', 'moon']) === 'sun, moon');
  check('the problems of a bad code are explained', codeProblems(1).length === 1 && codeProblems({ type: 'cat' })[0].includes('digits, word, symbols') && codeProblems({ type: 'word', word: 'MO' })[0].includes('3 to 8 letters') && codeProblems({ type: 'symbols', length: 4 }).length === 0);
  check('an answer that is sometimes the wrong length is found', codeProblems({ length: 2, answer: '{sum:a,b}' }, { a: { range: [1, 5] }, b: { range: [1, 5] } })[0]?.includes('must always be 2 digits'));
  check('and a fact that does not exist', codeProblems({ length: 2, answer: '{sum:a,zz}' }, { a: { range: [1, 5] } })[0]?.includes('"zz"'));
  check('facts must have two values', factProblems({ a: { range: [3, 3] } }).length === 1 && factProblems({ a: { pick: [1, 2] } }).length === 0);
  const secrets = makeSecrets({ facts: zone.facts, objects: zone.objects }, '123456');
  check('secrets: a fact, the sum, a word from the pool, three pictures', secrets.facts.a >= 5 && secrets.answers.gate1 === String(secrets.facts.a + secrets.facts.b) && ['MOON', 'STAR'].includes(secrets.answers.gate2) && secrets.answers.gate3.length === 3);
  const tokens = clueTokens('{fact:a} and {code:gate2:3} and {d2} and {code:gate9}');
  check('clue tokens', tokens.has('fact:a') && tokens.has('code:gate2:3') && tokens.has('d:2') && tokens.has('code:gate9:*'));
  check('a gate is known when every piece was found, or all of it', !isKnown({ code: { type: 'symbols', length: 2 } }, 'g', new Set(['code:g:1'])) && isKnown({ code: { type: 'symbols', length: 2 } }, 'g', new Set(['code:g:1', 'code:g:2'])) && isKnown({ code: { type: 'symbols', length: 2 } }, 'g', new Set(['code:g:*'])) && needTokens({ code: { length: 2, answer: '{sum:a,b}' } }, 'g').join() === 'fact:a,fact:b');

  console.log('\nLogic puzzles');
  const street = zone.logic.street;
  check('four rules leave one arrangement: the doctor in 3, the baker in 1', arrangements(street).length === 1 && solution(street).doctor === 3 && solution(street).baker === 1);
  check('the rules are a valid puzzle, and the code asks the right question', logicProblems('street', street).length === 0 && answerProblems('street', street, ['doctor', 'baker']).length === 0);
  const fewer = (id) => ({ ...street, rules: Object.fromEntries(Object.entries(street.rules).filter(([k]) => k !== id)) });
  check('without any one rule there is more than one answer', ['r1', 'r2', 'r3', 'r4'].every((id) => arrangements(fewer(id)).length > 1));
  const extra = { ...street, rules: { ...street.rules, r5: { if: ['at', 'teacher', 4], text: 'The teacher lives in house 4.' } } };
  check('a rule that is not needed is found', answerProblems('street', extra, ['doctor', 'baker']).some((p) => p.includes('"r5"') && p.includes('not needed')), answerProblems('street', extra, ['doctor', 'baker']).join(' | '));
  check('a puzzle that is too open is found', answerProblems('street', fewer('r4'), ['doctor', 'baker'])[0]?.includes('possible answers'));
  check('contradicting rules and bad rules are explained', logicProblems('s', { ...street, rules: { a: { if: ['at', 'doctor', 1], text: 'x' }, b: { if: ['at', 'doctor', 2], text: 'y' } } })[0]?.includes('contradict')
    && logicProblems('s', { ...street, rules: { a: { if: ['at', 'cat', 1], text: 'x' }, b: { if: ['at', 'doctor', 2], text: 'y' } } })[0]?.includes('"cat"')
    && logicProblems('s', { ...street, rules: { a: { if: ['at', 'red', 1], text: 'x' }, b: { if: ['at', 'doctor', 2], text: 'y' } } })[0]?.includes('one of a and b must be an item')
    && logicProblems('s', { positions: ['a', 'b'], items: ['x', 'y'], rules: {} })[0]?.includes('3 to 5'));
  check('the secrets hold the arrangement, so the code is "31"', makeSecrets({ facts: {}, logic: zone.logic, objects: zone.objects }, '123456').answers.gate4 === '31');
  check('an answer asking about a puzzle that does not exist is found', codeProblems({ length: 2, answer: '{pos:nope.doctor}{pos:nope.baker}' }, {}, zone.logic)[0]?.includes('does not define'));

  console.log('\nThe map file');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-codes-'));
  for (const f of ['items.json', 'abilities.json', 'monster.json', 'seed-cards.json', 'themes.json']) await fs.copyFile(path.join(root, 'data', f), path.join(dir, f));
  await fs.cp(path.join(root, 'data', 'scenarios'), path.join(dir, 'scenarios'), { recursive: true });
  const pack = path.join(dir, 'scenarios', 'codetest');
  await fs.mkdir(path.join(pack, 'zones'), { recursive: true });
  await fs.mkdir(path.join(pack, 'missions'), { recursive: true });
  await fs.writeFile(path.join(pack, 'pack.json'), JSON.stringify({ id: 'codetest', name: 'Code test', order: 9, strictClues: true }));
  await fs.writeFile(path.join(pack, 'zones', 'code-field.json'), JSON.stringify(zone));
  await fs.writeFile(path.join(pack, 'missions', 'cf-all.json'), JSON.stringify({ ...mission, extra: undefined }));
  const abilities = await loadAbilities(dir);
  const it = JSON.parse(await fs.readFile(path.join(dir, 'items.json'), 'utf8'));
  const items = { list: it.items, byId: Object.fromEntries(it.items.map((i) => [i.id, i])) };
  const deps = { items: it.items.map((i) => i.id), abilities: abilities.ids };
  check('the test map is valid', zoneProblems(zone, deps).length === 0, zoneProblems(zone, deps).join(' | '));
  const without = (id) => ({ ...zone, objects: zone.objects.map((o) => (o.id === id ? { ...o, clues: {} } : o)) });
  check('a piece nobody gives is found', zoneProblems(without('s2'), deps).some((p) => p.includes('"gate1"') && p.includes('the fact "b"')), zoneProblems(without('s2'), deps).join(' | '));
  check('a placeholder for a fact or gate that does not exist is found', zoneProblems({ ...zone, objects: zone.objects.map((o) => (o.id === 's1' ? { ...o, clues: { read: '{fact:zz} {code:nope:1} {code:gate3:9}' } } : o)) }, deps).filter((p) => p.includes('s1')).length === 3);

  console.log('\nThe solver');
  const content = await loadContent(dir, { abilities, items });
  check('the pack loads', !content.errors.length, content.errors.join(' | '));
  const m = normalizeMission(content.missions.find((x) => x.id === 'cf-all'), content.zones, items), z = zoneFor(m, content.zones);
  const four = dealPreset(abilities, 4);
  check('the mission can be finished with 2 to 6 players', [2, 3, 4, 5, 6].every((n) => solve(z, m, dealPreset(abilities, n)).ok));
  const need = ['s1:read', 's2:look', 's4:read', 's5:look', 's6:read', 's7:listen', 's7:look', 's8:read', 's9:look', 's10:listen', 's11:read'];
  check('without any one of these clues it cannot', need.every((k) => !solve(z, m, four, { skipClues: new Set([k]) }).ok), need.filter((k) => solve(z, m, four, { skipClues: new Set([k]) }).ok).join());
  check('the shell (flavour) is not needed', solve(z, m, four, { skipClues: new Set(['s3:listen']) }).ok);
  const checked = await runCheck(dir, dir, 'codetest');
  const unneeded = checked.errors.filter((e) => e.includes('not needed'));
  check('npm run check names the clue that is not needed (strictClues)', unneeded.length === 1 && unneeded[0].includes('s3 (Listen)'), checked.errors.join(' | '));
  await fs.writeFile(path.join(pack, 'zones', 'code-field.json'), JSON.stringify({ ...zone, objects: zone.objects.map((o) => (o.id === 's3' ? { ...o, extra: ['listen'] } : o)) }));
  const checked2 = await runCheck(dir, dir, 'codetest');
  check('and "extra" says it is flavour on purpose', !checked2.errors.some((e) => e.includes('not needed')), checked2.errors.join(' | '));

  console.log('\nPlaying it');
  const app = await createApp({ port: 0, contentDir: dir, dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-code-saves-')), publicUrl: '', pin: '2468', quiet: true, watch: false });
  const api = async (p, method = 'GET', body) => (await fetch(`http://127.0.0.1:${app.port}/api${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).json();
  const group = await api('/groups', 'POST', { name: 'Code testers' });
  await api(`/groups/${group.id}`, 'PATCH', { settings: { monster: 'off' } });
  const host = client(app.port); await host.opened;
  host.send({ t: 'host' });
  const room = await host.next('room');
  host.send({ t: 'group', id: group.id });
  const [A, B] = [client(app.port), client(app.port)];
  for (const [c, name] of [[A, 'Aki'], [B, 'Ben']]) { await c.opened; c.send({ t: 'join', room: room.code, name }); c.me = await c.next('joined'); }
  const teacher = client(app.port); await teacher.opened;
  teacher.send({ t: 'teacher', room: room.code });
  await teacher.next('watching');
  const r = app.rooms.rooms.get(room.code);
  const lib = (await api('/missions')).missions;
  teacher.send({ t: 'cmd', c: 'mission', mission: lib.find((x) => x.id === 'cf-all') });
  await host.next('roster', (x) => x.phase === 'play' && x.mission.id === 'cf-all');
  await sleep(100);
  const player = (c) => r.players.find((p) => p.id === c.me.id);
  const who = (a) => [A, B].find((c) => player(c).abilities.includes(a));
  const tp = async (c, x, y) => { teacher.send({ t: 'cmd', c: 'tp', p: c.me.id, x, y }); await sleep(80); };
  const act = async (c, a) => { await sleep(260); c.send({ t: 'act', a }); await sleep(120); };
  const thing = (id) => r.things.find((t) => t.id === id);
  const answers = r.secrets.answers;
  const clueText = (c) => c.all.filter((x) => x.t === 'clue').at(-1)?.text || '';
  const keypad = (c, o) => c.all.filter((x) => x.t === 'keypad' && x.o === o).at(-1);
  const answer = async (c, o, value) => { await sleep(1300); c.send({ t: 'answer', o, value }); return (await c.next('result', (x) => x.o === o)).msg; };

  // The clues carry the facts and pieces of this mission only.
  const reader = who('read'), looker = who('look');
  await tp(reader, 2, 3); await act(reader, 'read');
  check('a clue shows the fact of this mission', clueText(reader) === `The red house is number ${r.secrets.facts.a}.`, clueText(reader));
  await tp(reader, 15, 4); await act(reader, 'read');
  check('a clue shows pieces of the word', clueText(reader) === `Letters 1 and 2: ${answers.gate2[0]} ${answers.gate2[1]}.`, clueText(reader));
  check('the teacher sees every answer, the big screen none', teacher.last.queue.codes.length === 4 && teacher.last.queue.codes.find((c) => c.o === 'gate1').answer === answers.gate1
    && !JSON.stringify(host.all).includes(answers.gate2) && host.all.every((m) => !['queue', 'keypad', 'clue'].includes(m.t)));

  // The sum gate: a wrong code twice turns the lock red, and a right code is not taken while it is red.
  const user = who('use');
  await tp(user, 13, 6); await act(user, 'use');
  const pad = keypad(user, 'gate1');
  check('the phone is asked for 2 digits', pad.kind === 'digits' && pad.length === 2 && pad.digits === 2 && !pad.red);
  const wrong = String(answers.gate1) === '99' ? '98' : '99';
  check('the first wrong try only says so', (await answer(user, 'gate1', wrong)).includes('not the code'));
  check('a short try is not counted', (await answer(user, 'gate1', '1')).includes('2 numbers') && !thing('gate1').redUntil);
  check('the second wrong try turns the lock red', (await answer(user, 'gate1', wrong)).includes('lock is red') && thing('gate1').redUntil > Date.now());
  check('the big screen is told, and the gate is drawn red', host.all.some((x) => x.t === 'lockout' && x.o === 'gate1') && host.last.things.list.find((t) => t.id === 'gate1').red === true);
  check('while red even the right code is refused', (await answer(user, 'gate1', answers.gate1)).includes('lock is red') && thing('gate1').st === 'locked');
  thing('gate1').redUntil = 0;
  check('after the wait the right code opens it', (await answer(user, 'gate1', answers.gate1)).includes('Unlocked') && thing('gate1').st === 'closed');
  await act(who('open'), 'open');

  // The word gate.
  await tp(user, 16, 6); await act(user, 'use');
  const wpad = keypad(user, 'gate2');
  check('the phone is asked for a word of 4 letters', wpad.kind === 'word' && wpad.length === 4);
  check('the word is accepted in small letters', (await answer(user, 'gate2', answers.gate2.toLowerCase())).includes('Unlocked'));
  await tp(who('open'), 16, 6); await act(who('open'), 'open');

  // The picture gate.
  await tp(user, 19, 6); await act(user, 'use');
  const ppad = keypad(user, 'gate3');
  check('the phone gets the 8 pictures', ppad.kind === 'symbols' && ppad.symbols.length === 8 && ppad.length === 3);
  const other = ['sun', 'moon', 'star', 'fish'].filter((s) => s !== answers.gate3[0])[0];
  check('a wrong picture is refused', (await answer(user, 'gate3', [other, ...answers.gate3.slice(1)].join(','))).includes('not the code'));
  check('the right pictures open it', (await answer(user, 'gate3', answers.gate3.join(','))).includes('Unlocked'));

  await tp(who('open'), 19, 6); await act(who('open'), 'open');

  // The house gate: the code comes from a logic puzzle; each clue shows one rule.
  await tp(reader, 22, 5); await act(reader, 'read');
  check('a clue shows the sentence of its rule', clueText(reader).startsWith('Tom says: The doctor lives to the left of the teacher.') || clueText(reader).startsWith('On the stone: The baker lives next to the blue house.'), clueText(reader));
  await tp(user, 22, 6); await act(user, 'use');
  const hpad = keypad(user, 'gate4');
  check('the house gate asks for 2 digits', hpad.kind === 'digits' && hpad.length === 2);
  check('the wrong order of the right houses is refused', (await answer(user, 'gate4', '13')).includes('not the code'));
  check('house 3 for the doctor, house 1 for the baker opens it', (await answer(user, 'gate4', '31')).includes('Unlocked') && thing('gate4').st === 'closed');

  await app.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
