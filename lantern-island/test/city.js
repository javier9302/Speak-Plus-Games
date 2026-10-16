// The city pack (data/scenarios/city), played in a real room: clues that combine, a logic puzzle, a code from facts,
// a timed light, the locker and its key, the market and its prices. Run with: npm test, or node test/city.js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.js';
import { client } from './client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const app = await createApp({ port: 0, contentDir: path.join(root, 'data'), dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-city-saves-')), publicUrl: '', pin: '2468', quiet: true, watch: false });
  const api = async (p, method = 'GET', body) => (await fetch(`http://127.0.0.1:${app.port}/api${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).json();
  const group = await api('/groups', 'POST', { name: 'City testers' });
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
  const start = async (id) => { cmd('mission', { mission: lib.find((m) => m.id === id) }); await host.next('roster', (x) => x.phase === 'play' && x.mission.id === id); await sleep(100); };
  const player = (c) => r.players.find((p) => p.id === c.me.id);
  const who = (a) => [A, B].find((c) => player(c).abilities.includes(a));
  const tp = async (c, x, y) => { cmd('tp', { p: c.me.id, x, y }); await sleep(80); };
  const act = async (c, a) => { await sleep(260); c.send({ t: 'act', a }); await sleep(120); };
  const thing = (id) => r.things.find((t) => t.id === id);
  const clues = (c) => c.all.filter((x) => x.t === 'clue').map((x) => x.text);
  const last = (c, type, key) => c.all.filter((x) => x.t === type).at(-1)?.[key] || '';
  const keypad = (c, o) => c.all.filter((x) => x.t === 'keypad' && x.o === o).at(-1);
  const answer = async (c, o, value) => { await sleep(1300); c.send({ t: 'answer', o, value }); return (await c.next('result', (x) => x.o === o)).msg; };
  const ended = async () => (host.last.roster.phase === 'done' ? host.last.roster : host.next('roster', (x) => x.phase === 'done', 2500).catch(() => null));

  console.log('\nThe pack');
  check('the city loads: three missions and its own items with pictures', ['saturday-shopping', 'lost-parcel', 'lost-tourist'].every((id) => lib.some((m) => m.id === id)) && A.me.items.some((i) => i.id === 'ticket' && i.pack === 'city' && i.art.length === 16));

  console.log('\nThe lost parcel: clues that need each other, then a flat door');
  await start('lost-parcel');
  const reader = who('read'), looker = who('look'), listener = who('listen'), talker = who('talk'), user = who('use'), opener = who('open'), picker = who('pickup');
  const world = host.last.world.zone;
  check('the screens get the city\'s pictures: its door skin and its items', !!world.skins['flat-door'] && world.itemArt.some((i) => i.id === 'parcel') && host.last.things.list.find((t) => t.id === 'flat-door').skin === 'flat-door');
  await tp(reader, 11, 6); await act(reader, 'read');
  await tp(listener, 15, 6); await act(listener, 'listen');
  await tp(looker, 15, 7); await act(looker, 'look');
  await tp(talker, 20, 15); await act(talker, 'talk');
  check('Mrs Lee wants a question first: the phone gets the question frames, no clue yet', talker.all.filter((x) => x.t === 'ask').at(-1)?.frames.includes('Where does the baker live?') && !clues(talker).some((t) => t.includes('Mrs Lee')));
  await sleep(1300); talker.send({ t: 'asked', o: 'mrs-lee', i: 1 }); await sleep(200);
  const seen = [...clues(reader), ...clues(listener), ...clues(looker), ...clues(talker)].join(' | ');
  check('four clues, four rules of the street puzzle', ['The doctor lives to the left of the teacher.', 'The baker lives next to the pilot.', 'The baker does not live in the green house.', 'The baker lives next to the blue house.'].every((t) => seen.includes(t)), seen);
  check('no single clue gives the number', !/\b31\b/.test(seen) && r.secrets.answers['flat-door'] === '31');

  // The avenue's light: the button opens it for a few seconds.
  await tp(user, 14, 15); await act(user, 'use');
  check('the crossing button turns the light green for a while', thing('light-avenue').held === true && !r.block.has('8,10') && last(user, 'say', 'msg').includes('Go'), last(user, 'say', 'msg'));
  check('and the screens see it', host.last.things.list.find((t) => t.id === 'light-avenue').held === true);

  await tp(user, 13, 6); await act(user, 'use');
  check('the flat door asks for 2 digits', keypad(user, 'flat-door')?.kind === 'digits' && keypad(user, 'flat-door').length === 2);
  check('the wrong order of the right houses is refused', (await answer(user, 'flat-door', '13')).includes('not the code'));
  check('house 3 for the doctor and house 1 for the baker open it', (await answer(user, 'flat-door', '31')).includes('Unlocked') && thing('flat-door').st === 'closed');
  await tp(opener, 13, 6); await act(opener, 'open');
  await tp(picker, 12, 4); await act(picker, 'pickup');
  check('the parcel is picked up, and must now be carried to the postman', player(picker).items.some((i) => i.item === 'parcel') && host.last.roster.progress.bringTo === 'Postman');
  if (picker !== talker) { cmd('give', { p: talker.me.id, item: 'parcel' }); await sleep(100); }
  await tp(talker, 27, 13); await act(talker, 'talk');
  const done = await ended();
  check('the postman takes it and the mission ends', !!done && done.result?.completed === true, JSON.stringify(done?.result));

  console.log('\nSaturday shopping: a key from a locker, a code from facts, prices');
  await start('saturday-shopping');
  const f = r.secrets.facts;
  check('the screens show the 9 coins and the list of 3 things', host.last.roster.progress.coins === 9 && host.last.roster.progress.need === 3);
  await tp(looker, 7, 7); await act(looker, 'look');
  await tp(listener, 2, 8); await act(listener, 'listen');
  check('the poster and the radio give the facts, not the code', clues(looker).some((t) => t.includes(`opens at ${f.open} o'clock`)) && clues(listener).some((t) => t.includes(`open for ${f.hours} hours`)) && String(f.open + f.hours).length === 2);
  // The crate hides the locker; the key opens the market gate.
  await tp(opener, 3, 12); await act(opener, 'open');
  check('Open does nothing while the crate is in the way', thing('locker').st === 'closed');
  const pusher = who('push');
  await tp(pusher, 3, 13); await act(pusher, 'push');
  check('Push moves the crate away', thing('crate').st === 'b' && thing('crate').x === 4 && thing('crate').y === 13);
  await tp(opener, 3, 12); await act(opener, 'open');
  await tp(picker, 3, 12); await act(picker, 'pickup');
  check('the key is in the locker', player(picker).items.some((i) => i.item === 'key'));
  if (picker !== user) { cmd('give', { p: user.me.id, item: 'key' }); await sleep(100); }
  await tp(user, 4, 6); await act(user, 'use');
  check('the key is the first rule of the market gate', thing('market-gate').met.length === 1, last(user, 'say', 'msg'));
  await act(user, 'use');
  check('then it asks for the closing time', keypad(user, 'market-gate')?.kind === 'digits' && keypad(user, 'market-gate').length === 2);
  check('opening time alone is not the code', (await answer(user, 'market-gate', String(f.open))).includes('code') );
  check('opening time plus the hours open is', (await answer(user, 'market-gate', String(f.open + f.hours))).includes('Unlocked') && thing('market-gate').met.length === 2);
  await tp(opener, 4, 6); await act(opener, 'open');
  check('Open opens the shutter', thing('market-gate').st === 'open');
  // The prices.
  await tp(talker, 3, 4); await act(talker, 'talk');
  check('the market sells bread for 2 coins', clues(talker).at(-1) === 'Bread: 2 coins. The team has 9 coins.', clues(talker).at(-1));
  await tp(talker, 17, 17); await act(talker, 'talk');
  check('the bakery in the south sells it for 3', clues(talker).at(-1) === 'Bread: 3 coins. The team has 9 coins.', clues(talker).at(-1));
  await tp(user, 3, 4); await act(user, 'use'); await act(user, 'use');
  check('two breads at the market cost 4 coins', player(user).items.filter((i) => i.item === 'bread').length === 2 && r.goalState.coins === 5);
  await tp(user, 13, 17); await act(user, 'use');
  const done2 = await ended();
  check('the milk from the dairy completes the list, with 1 coin left', r.goalState.coins === 1 && !!done2 && done2.result?.completed === true, JSON.stringify(done2?.result));


  console.log('\nWho took the bag?: a picture clue, fog, and the old sign that lies');
  await start('the-stolen-bag');
  check('the mission is foggy for everybody: 6 tiles', host.last.roster.fog === 6 && A.last.roster.fog === 6);
  const thiefId = r.mission.goal.answer, thief = r.zone.objects.find((o) => o.id === thiefId).look;
  await tp(looker, 6, 4); await act(looker, 'look');
  const pic = clues(looker).length ? looker.all.filter((x) => x.t === 'clue').at(-1) : null;
  check('the camera shows the thief as a picture, with no description', JSON.stringify(pic.pic) === JSON.stringify([thief]) && pic.text === 'The camera shows the thief:', JSON.stringify(pic));
  const open = r.secrets.facts.open, hours = r.secrets.facts.hours;
  await tp(reader, 5, 7); await act(reader, 'read');
  const lie = looker === reader ? looker.all.filter((x) => x.t === 'clue').at(-1).text : reader.all.filter((x) => x.t === 'clue').at(-1).text;
  check('the old sign lies about the opening time (the poster is right)', /^OLD SIGN\. The market opens at \d o'clock\.$/.test(lie) && !lie.includes(`at ${open} `), lie);
  const spot = (id) => { const t = thing(id); return [t.x, t.y + 1]; };
  await tp(user, ...spot(thiefId === 'man-1' ? 'man-2' : 'man-1')); await act(user, 'use');
  check('the wrong stranger costs nothing', user.all.filter((x) => x.t === 'say').at(-1)?.msg.includes('Not this one'));
  await tp(user, ...spot(thiefId)); await act(user, 'use');
  const done3 = await ended();
  check('the thief ends the mission', !!done3 && done3.result?.completed === true, JSON.stringify(done3?.result));

  console.log('\nThe lost tourist: a ticket, the bus gate, and a character who follows through the exit');
  await start('lost-tourist');
  await tp(pusher, 3, 13); await act(pusher, 'push');
  await tp(opener, 3, 12); await act(opener, 'open');
  await tp(picker, 3, 12); await act(picker, 'pickup');
  if (picker !== user) { cmd('give', { p: user.me.id, item: 'key' }); await sleep(100); }
  await tp(user, 22, 13); await act(user, 'use');
  check('the key unlocks the ticket office door', thing('office-door').st === 'closed', last(user, 'say', 'msg'));
  await act(opener, 'open');
  cmd('solve', { o: 'kiosk' }); await sleep(150);
  await tp(picker, 22, 12); await act(picker, 'pickup');
  check('the kiosk gives a ticket', player(picker).items.some((i) => i.item === 'ticket'));
  if (picker !== user) { cmd('give', { p: user.me.id, item: 'ticket' }); await sleep(100); }
  await tp(user, 32, 14); await act(user, 'use');
  check('the ticket opens the bus gate (and stays in the pocket)', thing('bus-gate').st === 'closed' && player(user).items.some((i) => i.item === 'ticket'), last(user, 'nope', 'msg'));
  await act(opener, 'open');
  check('Open lifts the bar', thing('bus-gate').st === 'open');
  await tp(talker, 30, 15); await act(talker, 'talk');
  check('the tourist follows the player who talked to her', thing('tourist').following === true && r.goalState.leader === talker.me.id);
  const walk = async (x, y, ms) => { talker.send({ t: 'input', x, y }); await sleep(ms); talker.send({ t: 'input', x: 0, y: 0 }); await sleep(150); };
  await walk(0, -1, 260);       // up to the bus lane
  await walk(1, 0, 1000);       // through the open bus gate and onto the bus
  await sleep(500);
  check('both arrive in Uptown: the player and the tourist who followed', player(talker).x > 36 && thing('tourist').x > 36 && thing('tourist').following === true, `player=${player(talker).x},${player(talker).y} tourist=${thing('tourist').x},${thing('tourist').y}`);

  await app.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
