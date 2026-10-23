// Audio clues (the teacher's switch), picture clues (people to describe), clues that lie, and characters that must be asked.
// Run with: npm test, or node test/senses.js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.js';
import { loadContent } from '../server/content.js';
import { loadAbilities } from '../server/abilities.js';
import { zoneProblems } from '../server/validate.js';
import { KINDS } from '../server/kinds/index.js';
import { lookProblems, describeLook, lookKey } from '../server/looks.js';
import { client } from './client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const looks = [
  { hat: 'red', hair: 'black', glasses: true, shirt: 'green' },
  { hat: 'none', hair: 'blond', glasses: false, shirt: 'blue' },
  { hat: 'blue', hair: 'grey', beard: true, shirt: 'white' },
  { hat: 'yellow', hair: 'brown', glasses: true, shirt: 'pink' },
];
const rows = Array.from({ length: 13 }, (_, y) => (y === 0 || y === 12 ? '~'.repeat(24) : `~${','.repeat(22)}~`)).map((r, y) => (y === 6 ? r.slice(0, 3) + 'pppppp' + r.slice(9) : r));
const zone = {
  id: 'sense-field', name: 'Sense field', theme: 'day', rows,
  goal: { type: 'odd-one-out', answer: 'random', story: 'Find the person on the camera.' },
  places: [], landmarks: [],
  facts: { open: { range: [7, 9] } },
  objects: [
    ...looks.map((look, i) => ({ id: `man-${i + 1}`, kind: 'candidate', name: `Stranger ${i + 1}`, x: 14 + i * 2, y: 3, look })),
    { id: 'cctv', kind: 'sign', name: 'Camera', x: 2, y: 2, clues: { look: 'The camera shows: {look:odd}' } },
    { id: 'poster', kind: 'statue', name: 'Poster', x: 4, y: 2, clues: { look: 'The shop opens at {fact:open}.' } },
    { id: 'old-sign', kind: 'sign', name: 'Old sign', x: 6, y: 2, clues: { read: 'OLD SIGN. The shop opens at {wrong:open}.' } },
    { id: 'granny', kind: 'npc', name: 'Granny', x: 4, y: 9, look: { hat: 'purple', hair: 'grey', shirt: 'purple' }, clues: { talk: '"The market is on Oak Street."' }, ask: { frames: ['What is your name?', 'Where is the market?', 'How old are you?'], right: 1 } },
    { id: 'clerk', kind: 'npc', name: 'Clerk', x: 8, y: 9, clues: { talk: '"The code is seven."' }, ask: { frames: ['Where is the code?', 'Can you tell me the code, please?'], right: 1, teacher: true } },
    { id: 't1', kind: 'station', name: 'Tablet', x: 20, y: 9 },
  ],
};

async function main() {
  console.log('\nLooks (people for picture clues)');
  check('a good look has no problems, a bad one is explained', lookProblems(looks[0]).length === 0 && lookProblems({ hat: 'pink', shirt: 'red' })[0].includes('choose one of') && lookProblems({ hair: 'black' }).some((p) => p.includes('needs a "shirt"')) && lookProblems({ shirt: 'red', cape: 1 })[0].includes('unknown field'));
  check('a look in words, for the teacher', describeLook(looks[0]) === 'a person with a red hat, black hair, glasses and a green shirt', describeLook(looks[0]));
  check('looks that differ in one part are different people', lookKey(looks[0]) !== lookKey({ ...looks[0], glasses: false }) && lookKey({ shirt: 'red' }) === lookKey({ shirt: 'red', hat: 'none', glasses: false }));

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-sense-'));
  for (const f of ['items.json', 'abilities.json', 'monster.json', 'questions.json', 'themes.json']) await fs.copyFile(path.join(root, 'data', f), path.join(dir, f));
  await fs.cp(path.join(root, 'data', 'scenarios'), path.join(dir, 'scenarios'), { recursive: true });
  const pack = path.join(dir, 'scenarios', 'sensetest');
  await fs.mkdir(path.join(pack, 'zones'), { recursive: true });
  await fs.mkdir(path.join(pack, 'missions'), { recursive: true });
  await fs.writeFile(path.join(pack, 'pack.json'), JSON.stringify({ id: 'sensetest', name: 'Senses test', order: 9 }));
  await fs.writeFile(path.join(pack, 'zones', 'sense-field.json'), JSON.stringify(zone));
  await fs.writeFile(path.join(pack, 'missions', 'st-odd.json'), JSON.stringify({ id: 'st-odd', title: 'Who is on the camera', zone: 'sense-field', stations: [{ at: 't1' }] }));

  console.log('\nThe map file');
  const abilities = await loadAbilities(dir);
  const it = JSON.parse(await fs.readFile(path.join(dir, 'items.json'), 'utf8'));
  const items = { list: it.items, byId: Object.fromEntries(it.items.map((i) => [i.id, i])) };
  const content = await loadContent(dir, { abilities, items });
  check('the pack loads', !content.errors.length, content.errors.join(' | '));
  const deps = { items: items.list.map((i) => i.id), abilities: abilities.ids };
  const bad = (id, patch) => zoneProblems({ ...zone, objects: zone.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) }, deps).join(' | ');
  check('a bad look on a person is found', bad('man-1', { look: { shirt: 'gold' } }).includes('choose one of'));
  check('a picture of something that has no look is found', bad('cctv', { clues: { look: '{look:poster}' } }).includes('has no "look"') && bad('cctv', { clues: { look: '{look:nobody}' } }).includes('not an object of this map'));
  check('two people who look the same: the check says no picture can tell them apart', KINDS.candidate.rules({ name: 'Stranger 1', def: { look: looks[0] } }, [{ kind: 'candidate', def: { look: { ...looks[0] } } }, { kind: 'candidate', def: { look: looks[1] } }]) !== null);
  check('a lie needs a truth to compare with', bad('poster', { clues: { look: 'Nothing.' } }).includes('is a lie, but no clue tells the truth') && bad('old-sign', { clues: { read: '{wrong:zzz}' } }).includes('no fact "zzz"'));
  check('a question needs good frames, a right one, and an answer', bad('granny', { ask: { frames: ['One only'], right: 0 } }).includes('2 to 6 questions') && bad('granny', { ask: { frames: ['A?', 'B?'], right: 5 } }).includes('counting from 0') && bad('granny', { clues: {} }).includes('needs a "talk" clue'));

  console.log('\nPlaying it');
  const app = await createApp({ port: 0, contentDir: dir, dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-sense-saves-')), publicUrl: '', pin: '2468', quiet: true, watch: false });
  const api = async (p, method = 'GET', body) => (await fetch(`http://127.0.0.1:${app.port}/api${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).json();
  const group = await api('/groups', 'POST', { name: 'Sense testers' });
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
  const cmd = (c, extra = {}) => teacher.send({ t: 'cmd', c, ...extra });
  const lib = (await api('/missions')).missions;
  cmd('mission', { mission: lib.find((m) => m.id === 'st-odd') });
  await host.next('roster', (x) => x.phase === 'play' && x.mission.id === 'st-odd');
  await sleep(100);
  const player = (c) => r.players.find((p) => p.id === c.me.id);
  const who = (a) => [A, B].find((c) => player(c).abilities.includes(a));
  const tp = async (c, x, y) => { cmd('tp', { p: c.me.id, x, y }); await sleep(80); };
  const act = async (c, a) => { await sleep(260); c.send({ t: 'act', a }); await sleep(120); };
  const thing = (id) => r.things.find((t) => t.id === id);
  const lastClue = (c) => c.all.filter((x) => x.t === 'clue').at(-1);
  const lastOf = (c, type) => c.all.filter((x) => x.t === type).at(-1);

  // The teacher's live switches reach every screen.
  cmd('set', { key: 'audio', value: true }); cmd('set', { key: 'fog', value: 4 }); await sleep(150);
  check('the teacher switches audio clues and fog on, for every screen', host.last.roster.settings.audio === true && host.last.roster.settings.fog === 4 && A.last.roster.settings.audio === true);
  cmd('set', { key: 'audio', value: false }); cmd('set', { key: 'fog', value: 0 }); await sleep(100);
  check('and off again', host.last.roster.settings.audio === false && host.last.roster.settings.fog === 0);

  // Picture clue: the Look player sees the right person; the words say nothing about who.
  const answer = r.mission.goal.answer, answerLook = looks[Number(answer.split('-')[1]) - 1];
  const looker = who('look');
  await tp(looker, 2, 3); await act(looker, 'look');
  const pic = lastClue(looker);
  check('the camera clue is a picture of the right person, with only these words', JSON.stringify(pic.pic) === JSON.stringify([answerLook]) && pic.text === 'The camera shows:', JSON.stringify(pic));
  check('the big screen draws the four people, and does not say which is right', host.last.things.list.filter((t) => t.look).length >= 4 && !JSON.stringify(host.all.filter((x) => x.t === 'roster')).includes(answer));

  // Clues that lie: the old sign shows a number that is not the fact.
  const open = r.secrets.facts.open, reader = who('read'), poster = who('look');
  await tp(reader, 6, 3); await act(reader, 'read');
  const wrongText = lastClue(reader).text;
  await tp(poster, 4, 3); await act(poster, 'look');
  check('the poster tells the truth, the old sign does not', lastClue(poster).text === `The shop opens at ${open}.` && wrongText !== `OLD SIGN. The shop opens at ${open}.` && /^OLD SIGN\. The shop opens at [789]\.$/.test(wrongText), wrongText);

  // Characters that want to be asked.
  const talker = who('talk');
  await tp(talker, 4, 10); await act(talker, 'talk');
  const ask = lastOf(talker, 'ask');
  check('Granny does not answer before a question: the phone is shown 3 question frames', ask?.o === 'granny' && ask.frames.length === 3 && !talker.all.some((x) => x.t === 'clue' && x.o === 'granny'), JSON.stringify(ask));
  await sleep(1300); talker.send({ t: 'asked', o: 'granny', i: 0 }); await sleep(150);
  check('the wrong question gets a polite "I do not understand" and no clue', lastOf(talker, 'npc')?.text.includes('do not understand') && !talker.all.some((x) => x.t === 'clue' && x.o === 'granny'));
  await sleep(1300); talker.send({ t: 'asked', o: 'granny', i: 1 }); await sleep(150);
  check('the right question gets her clue', lastClue(talker)?.o === 'granny' && lastClue(talker).text === '"The market is on Oak Street."');
  await act(talker, 'talk');
  check('once answered, she answers at once next time', talker.all.filter((x) => x.t === 'clue' && x.o === 'granny').length === 2 && talker.all.filter((x) => x.t === 'ask').length === 1);

  await tp(talker, 8, 10); await act(talker, 'talk');
  await sleep(1300); talker.send({ t: 'asked', o: 'clerk', i: 1 }); await sleep(200);
  check('the clerk waits for the teacher: the question is on the teacher\'s panel, the phone has no clue yet', teacher.last.queue.talks.some((k) => k.o === 'clerk' && k.question === 'Can you tell me the code, please?') && !talker.all.some((x) => x.t === 'clue' && x.o === 'clerk'));
  const talk = teacher.last.queue.talks.find((k) => k.o === 'clerk');
  cmd('npc', { talk: talk.id, clue: true }); await sleep(200);
  check('the teacher says yes and the clerk answers', lastClue(talker)?.o === 'clerk' && lastClue(talker).text === '"The code is seven."' && !teacher.last.queue.talks.some((k) => k.question));

  // Finally the person: the wrong one costs nothing, the right one ends the mission.
  const wrongId = answer === 'man-1' ? 'man-2' : 'man-1', chooser = who('use');
  const spot = (id) => { const t = thing(id); return [t.x, t.y + 1]; };
  await tp(chooser, ...spot(wrongId)); await act(chooser, 'use');
  check('the wrong person: "Not this one"', chooser.all.filter((x) => x.t === 'say').at(-1)?.msg.includes('Not this one'));
  await tp(chooser, ...spot(answer)); await act(chooser, 'use');
  const done = host.last.roster.phase === 'done' ? host.last.roster : await host.next('roster', (x) => x.phase === 'done', 2000).catch(() => null);
  check('the person from the camera ends the mission', !!done && done.result?.completed === true, JSON.stringify(done?.result));

  await app.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
