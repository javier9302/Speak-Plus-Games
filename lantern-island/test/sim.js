// Simulated classroom: starts the server on a spare port and plays host and phones over real WebSockets.
// Run with: npm test
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { solidAt } from '../server/world.js';
import { loadAbilities, dealPreset, dealRandom } from '../server/abilities.js';
import { normalizeCard, pickCard, checkAnswer, publicCard } from '../server/cards.js';
import { createFileStorage } from '../server/storage/file.js';
import { createSupabaseStorage } from '../server/storage/supabase.js';
import { copyStorage } from '../server/copy.js';
import { HEROES } from '../public/shared/heroes.js';
import { startFakeSupabase } from './fake-supabase.js';
import { client } from './client.js';

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-test-'));
  const app = await createApp({ port: 0, dataDir, publicUrl: '', pin: '2468' });
  const base = `http://127.0.0.1:${app.port}`;
  const http = async (p, method = 'GET', body, headers = {}) => {
    const once = () => fetch(base + '/api' + p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
    // A kept-alive connection can be closed by the server just as it is reused (after a long pause in the test): try again.
    const res = await once().catch(() => once());
    return { status: res.status, data: await res.json().catch(() => null) };
  };

  console.log('\nPages');
  for (const p of ['/host/', '/phone/', '/teacher/', '/shared/pixel.js']) check(`GET ${p}`, (await fetch(base + p)).status === 200);
  check('GET / goes to the phone page', (await fetch(base + '/?room=ABCD', { redirect: 'manual' })).headers.get('location') === '/phone/?room=ABCD');
  check('no reading files outside public', (await fetch(base + '/%2e%2e/package.json')).status !== 200 && (await fetch(base + '/..%2fpackage.json')).status !== 200);

  console.log('\nGroups and saves (file adapter)');
  const made = await http('/groups', 'POST', { name: 'Tuesday Juniors' });
  const gid = made.data.id;
  check('create group', made.status === 201 && made.data.island.stars === 0 && made.data.settings.level === 'A2');
  check('group needs a name', (await http('/groups', 'POST', { name: '  ' })).status === 400);
  check('saved as a JSON file', JSON.parse(await fs.readFile(path.join(dataDir, 'groups', gid + '.json'), 'utf8')).name === 'Tuesday Juniors');
  const patched = await http(`/groups/${gid}`, 'PATCH', { settings: { level: 'B1', monster: 'gentle' }, notes: 'went -> go' });
  check('change settings and notes', patched.data.settings.level === 'B1' && patched.data.settings.monster === 'gentle' && patched.data.notes === 'went -> go');
  check('bad monster setting falls back', (await http(`/groups/${gid}`, 'PATCH', { settings: { monster: 'nightmare' } })).data.settings.monster === 'normal');
  const dup = await http(`/groups/${gid}/duplicate`, 'POST');
  check('duplicate group', dup.status === 201 && dup.data.id !== gid && dup.data.name === 'Tuesday Juniors (copy)' && dup.data.settings.level === 'B1');
  const file = (await http(`/groups/${gid}/export`)).data;
  check('export', file.kind === 'lantern-island-group' && file.group.id === gid);
  check('import of a group that exists asks first', (await http('/groups/import', 'POST', file)).status === 409);
  file.group.island.stars = 7;
  check('import, replace', (await http('/groups/import?mode=replace', 'POST', file)).data.island.stars === 7 && (await http('/groups')).data.length === 2);
  check('import, keep both', (await http('/groups/import?mode=copy', 'POST', file)).data.id !== gid && (await http('/groups')).data.length === 3);
  check('import rejects other files', (await http('/groups/import', 'POST', { hello: 1 })).status === 400);
  const reset = await http(`/groups/${gid}/reset`, 'POST');
  check('reset island keeps notes and settings', reset.data.island.stars === 0 && reset.data.notes === 'went -> go' && reset.data.settings.level === 'B1');
  check('delete group', (await http(`/groups/${dup.data.id}`, 'DELETE')).status === 200 && (await http('/groups')).data.length === 2);
  check('unknown group', (await http('/groups/nope/reset', 'POST')).status === 404 && (await http('/groups/..%2f..%2fpackage/export')).status === 404);

  await http(`/groups/${gid}`, 'PATCH', { settings: { monster: 'off' } });   // no monster wandering through the first sections; it has its own below

  console.log('\nLobby');
  const host = client(app.port);
  await host.opened;
  host.send({ t: 'host' });
  const room = await host.next('room');
  check('host gets a room code and a QR code', /^[A-Z]{4}$/.test(room.code) && room.qr.startsWith('data:image/png') && room.joinUrl.endsWith(`/phone/?room=${room.code}`));
  const phones = [];
  const chosen = { Mika: 'pikachu', Ken: 'not-a-character' };
  for (const name of ['Mika', 'Ken', 'Yui']) {
    const c = client(app.port);
    await c.opened;
    c.send({ t: 'join', room: room.code.toLowerCase(), name, hero: chosen[name] });
    c.me = await c.next('joined');
    phones.push(c);
  }
  await sleep(50);
  check('a player joins as the character they chose', phones[0].me.hero === 'pikachu' && host.last.roster.players[0].hero === 'pikachu');
  check('an unknown character becomes the islander', phones[1].me.hero === '' && phones[2].me.hero === '');
  phones[1].send({ t: 'hero', id: 'totoro' });
  await host.next('roster', (m) => m.players[1].hero === 'totoro');
  check('a player changes character in the lobby', true);
  check('every character drawing is 16x16 with known colors', HEROES.every((h) => h.art.length === 16 && h.art.every((r) => r.length === 16 && [...r].every((c) => c === '.' || c === 'k' || h.pal[c])) && !/[^.]/.test(h.art[0])));
  check('three players, three colors', host.last.roster.players.length === 3 && new Set(host.last.roster.players.map((p) => p.ci)).size === 3);
  const lost = client(app.port); await lost.opened;
  lost.send({ t: 'join', room: 'ZZZZ', name: 'Nobody' });
  check('wrong room code is refused', (await lost.next('error')).code === 'no-room');
  lost.send({ t: 'join', room: room.code, name: '   ' });
  check('empty name is refused', (await lost.next('error')).code === 'name');
  lost.send({ t: 'join', room: room.code, name: 'mika' });
  check('same name gets a number', (await lost.next('joined')).name === 'mika 2');
  phones[0].send({ t: 'start' });
  phones[0].send({ t: 'kick', id: phones[1].me.id });
  host.send({ t: 'start' });
  check('cannot start without a group', (await host.next('error')).code === 'no-group');
  check('a phone cannot start the game or remove players', host.last.roster.phase === 'lobby' && host.last.roster.players.length === 4);
  host.send({ t: 'kick', id: lost.last.joined.id });
  await lost.next('kicked');
  await sleep(50);
  check('host removes a player', host.last.roster.players.length === 3);
  host.send({ t: 'group', id: gid });
  await host.next('roster', (m) => m.group);
  check('host chooses a group', host.last.roster.group.name === 'Tuesday Juniors');

  console.log('\nMoving');
  host.send({ t: 'start' });
  const world = await phones[0].next('world');
  await host.next('state');
  const zone = app.rooms.rooms.get(room.code).zone;
  phones[1].send({ t: 'hero', id: 'kirby' });
  await sleep(50);
  check('nobody changes character during a mission', app.rooms.rooms.get(room.code).players[1].hero === 'totoro');
  await sleep(100);
  const usage = JSON.parse(await fs.readFile(path.join(dataDir, 'meta', 'card-usage.json'), 'utf8'));
  const drawn = app.rooms.rooms.get(room.code).things.filter((t) => t.card).map((t) => t.card.id);
  const bankText = await fs.readFile(path.join(app.config.contentDir, 'questions.json'), 'utf8');
  check('starting a mission notes when its cards were used, without rewriting the cards', drawn.length > 0 && drawn.every((id) => usage.used[id]) && !bankText.includes('lastUsed'));
  check('phones get the map', world.zone.w === 40 && world.zone.rows.length === 24 && host.last.roster.settings.view === 9);
  const pos = (id) => { const s = host.last.state.p.find((p) => p[0] === id); return { x: s[1], y: s[2], dir: s[3], moving: s[4] }; };
  const start = pos(phones[0].me.id);
  phones[0].send({ t: 'input', x: 1, y: 0 });
  await sleep(600);
  const a = pos(phones[0].me.id);
  check('joystick right moves the character right', a.x > start.x + 1.5 && a.x < start.x + 4 && a.dir === 2 && a.moving === 1, JSON.stringify([start, a]));
  check('the others stay still', pos(phones[1].me.id).moving === 0);
  phones[0].send({ t: 'input', x: 0, y: 0 });
  await sleep(150);
  const b = pos(phones[0].me.id);
  await sleep(200);
  check('releasing stops', pos(phones[0].me.id).x === b.x && pos(phones[0].me.id).moving === 0);
  phones[1].send({ t: 'input', x: 500, y: 0 });      // a cheating phone
  await sleep(400);
  check('speed is decided by the server', pos(phones[1].me.id).x < zone.spawns[1].x + 2.6);
  phones[1].send({ t: 'input', x: 'fast', y: null });
  phones[2].send({ t: 'input', x: -1, y: 0 });       // walk west into the sea
  await sleep(3500);
  const c = pos(phones[2].me.id);
  check('nobody walks into the water', !solidAt(zone, c.x, c.y) && c.x > 4 && c.x < 9, JSON.stringify(c));
  check('broken input is ignored', pos(phones[1].me.id).moving === 0);

  console.log('\nReconnecting');
  const before = pos(phones[2].me.id);
  await phones[2].close();
  await sleep(100);
  check('a lost phone shows as away', host.last.roster.players.find((p) => p.id === phones[2].me.id).online === false);
  await sleep(300);
  check('and its character stops', pos(phones[2].me.id).moving === 0);
  const back = client(app.port); await back.opened;
  back.send({ t: 'join', room: room.code, name: 'Someone else', token: phones[2].me.token });
  const again = await back.next('joined');
  await sleep(150);
  check('a phone that comes back gets the map again', back.last.world?.zone.id === 'beach');
  const after = pos(again.id);
  check('reconnect keeps the character', again.id === phones[2].me.id && again.name === 'Yui' && Math.abs(after.x - before.x) < 0.6 && host.last.roster.players.length === 3);
  const late = [];
  for (const name of ['D', 'E', 'F', 'G']) {
    const p = client(app.port); await p.opened;
    p.send({ t: 'join', room: room.code, name });
    late.push(await Promise.race([p.next('joined'), p.next('error')]));
  }
  check('late players can join, the 7th is refused', late.slice(0, 3).every((m) => m.t === 'joined') && late[3].code === 'full');
  const savedGroup = (await http(`/groups/${gid}`, 'PATCH', {})).data;
  check('the session is saved to the group', savedGroup.island.sessions === 1 && ['Mika', 'Ken', 'Yui'].every((n) => savedGroup.nicknames.includes(n)));
  const host2 = client(app.port); await host2.opened;
  host2.send({ t: 'host', room: room.code, hostKey: room.hostKey });
  const sameRoom = await host2.next('room');
  await sleep(150);
  check('a reloaded host page keeps its room', sameRoom.code === room.code && host2.last.world?.zone.id === 'beach');

  console.log('\nAbilities');
  const table = await loadAbilities(app.config.contentDir);
  const sizes = { 2: [6, 6], 3: [4, 4, 4], 4: [3, 3, 3, 3], 5: [3, 3, 2, 2, 2], 6: [2, 2, 2, 2, 2, 2] };
  const complete = (sets) => sets.flat().length === 12 && new Set(sets.flat()).size === 12;
  let presetOk = true, randomOk = true, spreadOk = true;
  for (let n = 2; n <= 6; n++) {
    const preset = dealPreset(table, n);
    presetOk &&= complete(preset) && preset.map((s) => s.length).join() === sizes[n].join();
    for (let i = 0; i < 50; i++) {
      const r = dealRandom(table, n);
      randomOk &&= complete(r) && r.map((s) => s.length).sort().join() === [...sizes[n]].sort().join();
      spreadOk &&= table.spread.every((list) => r.every((set) => set.filter((a) => list.includes(a)).length <= Math.ceil(list.length / n)));
    }
  }
  check('preset tables: all 12 abilities, shared evenly, for 2 to 6 players', presetOk);
  check('random mix: all 12 abilities, same sizes', randomOk);
  check('random mix: clue abilities are spread among players', spreadOk);

  // The room now has 6 players (3 phones + D, E, F).
  const ros = () => host.last.roster;
  const holder = (a) => ros().players.find((p) => p.abilities.includes(a));
  const live = app.rooms.rooms.get(room.code);
  const sock = { [phones[0].me.id]: phones[0], [phones[1].me.id]: phones[1], [again.id]: back };
  check('six players: two abilities each, every ability has one owner', ros().players.every((p) => p.abilities.length === 2) && complete(ros().players.map((p) => p.abilities)));
  check('the map sent to screens has no clue text', !JSON.stringify([host.last.world, host.last.things]).includes('lighthouse is dark') && host.last.things.list.find((o) => o.id === 'old-sign').needs.join() === 'read');
  // Give the three real phones known abilities by taking players away: with 3 players the preset is 4/4/4.
  for (const p of ros().players.filter((q) => !sock[q.id])) host.send({ t: 'kick', id: p.id });
  await sleep(200);
  check('players leave: the rest share all 12 again', ros().players.length === 3 && ros().players.every((p) => p.abilities.length === 4) && complete(ros().players.map((p) => p.abilities)));
  const reader = sock[holder('read').id], other = sock[holder('jump').id];
  const place = (c, x, y) => Object.assign(live.players.find((p) => p.id === (c.me?.id || again.id)), { x, y });
  back.me = again;
  place(reader, 20.5, 11.6); place(other, 21.5, 11.6);          // both stand under the old sign (20,10)
  other.send({ t: 'act', a: 'read' });
  check('an ability that is not yours is refused', (await other.next('nope')).msg.includes("can't Read"));
  await sleep(300);
  reader.send({ t: 'act', a: 'read' });
  const clue = await reader.next('clue');
  await sleep(100);
  check('the owner reads the sign', clue.o === 'old-sign' && clue.text.includes('lighthouse is dark'));
  check('nobody else gets the text', !other.last.clue && !host.last.clue && !JSON.stringify([host.last.fx, host.last.roster]).includes('lighthouse is dark'));
  check('everyone sees that an ability was used', host.last.fx.a === 'read' && other.last.fx.by === reader.me.id);
  check('the teacher sees how many clues were found', true);
  await sleep(300);
  reader.send({ t: 'act', a: 'look' });
  check('the wrong ability on an object does nothing', (await reader.next('nope')).msg.includes('does nothing'));
  place(reader, 15.5, 12.6);
  await sleep(300);
  reader.send({ t: 'act', a: 'read' });
  check('too far away does nothing', (await reader.next('nope')).msg.includes('Go closer'));
  // The statue has two clues, for two abilities.
  const looker = sock[holder('look').id];
  place(looker, 10.5, 10.6);
  await sleep(300);
  looker.send({ t: 'act', a: 'look' });
  check('Look and Read find different things on the same object', (await looker.next('clue')).text.includes('second number'));
  const token = reader.me.token, rid = reader.me.id;
  await reader.close();
  const reader2 = client(app.port); await reader2.opened;
  reader2.send({ t: 'join', room: room.code, name: 'x', token });
  const kept = await reader2.next('notes');
  check('a phone that comes back keeps its clues', kept.list.length >= 1 && kept.list.some((n) => n.o === 'old-sign'));
  sock[rid] = reader2; reader2.me = { id: rid, token };
  const deal0 = ros().deal, sets0 = JSON.stringify(ros().players.map((p) => p.abilities));
  host.send({ t: 'shuffle', mode: 'preset' });
  await host.next('roster', (m) => m.deal > deal0);
  check('reshuffle gives the same sets to different players', JSON.stringify(ros().players.map((p) => p.abilities)) !== sets0 && complete(ros().players.map((p) => p.abilities)) && ros().dealMode === 'preset');
  host.send({ t: 'shuffle', mode: 'random' });
  await host.next('roster', (m) => m.dealMode === 'random');
  check('random mix deals all 12', complete(ros().players.map((p) => p.abilities)) && ros().players.every((p) => p.abilities.length === 4));
  phones[0].send({ t: 'shuffle', mode: 'preset' });
  await sleep(100);
  check('a phone cannot reshuffle', ros().dealMode === 'random');
  const newcomer = client(app.port); await newcomer.opened;
  newcomer.send({ t: 'join', room: room.code, name: 'Late' });
  await newcomer.next('joined');
  await sleep(100);
  check('a late player gets a share', ros().players.length === 4 && ros().players.every((p) => p.abilities.length === 3) && complete(ros().players.map((p) => p.abilities)));

  console.log('\nCards');
  const quiet = console.warn; console.warn = () => {};
  check('broken cards are skipped', [{ id: 'x', type: 'choice', prompt: 'Q', options: { A: '1', B: '2' }, answer: 'C' }, { id: 'x', type: 'code', prompt: 'Q', teacher: { code: 'abc' } }, { id: 'x', type: 'typed', prompt: 'Q' }, { id: 'Bad Id', type: 'typed', prompt: 'Q', accepted: ['a'] }].every((c) => normalizeCard(c) === null));
  console.warn = quiet;
  const typed = normalizeCard({ id: 't', type: 'typed', prompt: 'Opposite of expensive?', accepted: ['cheap', 'inexpensive'], allowTypos: true });
  const strict = normalizeCard({ id: 's', type: 'spelling', prompt: 'Spell it', word: 'umbrella' });
  check('typed answers: case, spaces and final punctuation do not matter', ['cheap', '  CHEAP ', 'Cheap.', 'Inexpensive!'].every((v) => checkAnswer(typed, v)) && !checkAnswer(typed, 'expensive') && !checkAnswer(typed, ''));
  check('small typos are accepted only when the card allows them', checkAnswer(typed, 'cheep') && checkAnswer(typed, 'inexpensiv') && !checkAnswer(typed, 'chip') && !checkAnswer(strict, 'umbrela') && checkAnswer(strict, 'Umbrella'));
  const all = await app.cards.all();
  check('sample cards for every type', ['choice', 'typed', 'spelling', 'code', 'link', 'courier'].every((t) => all.some((c) => c.type === t)) && ['choice', 'typed', 'spelling', 'code'].every((t) => all.filter((c) => c.type === t).length >= 3));
  check('a station takes a card of the group level, or any level if there is none', pickCard(all, { type: 'choice', level: 'group' }, 'B1').level === 'B1' && pickCard(all, { type: 'choice', level: 'group' }, 'C1').type === 'choice' && pickCard(all, { type: 'nothing' }, 'A2') === null);
  check('the phone never gets the answer', all.every((c) => !/"(answer|accepted|teacher|hints|explanation|code)":/.test(JSON.stringify(publicCard(c)))));

  console.log('\nCard library (teacher API)');
  const newCard = { type: 'choice', level: 'A2', tags: ['test'], prompt: 'Pick B.', options: { A: 'no', B: 'yes' }, answer: 'b', hints: ['one', 'two', 'three', 'four'] };
  const put = await http('/cards/my-card', 'PUT', newCard);
  check('save a new card', put.status === 200 && put.data.answer === 'B' && put.data.hints.length === 3 && (await http('/cards')).data.length === all.length + 1);
  check('the card is a file in data/cards', JSON.parse(await fs.readFile(path.join(dataDir, 'cards', 'my-card.json'), 'utf8')).prompt === 'Pick B.');
  const badPut = await http('/cards/my-card', 'PUT', { ...newCard, answer: 'Z' });
  check('a card with a mistake is refused, with the reason', badPut.status === 400 && badPut.data.error.includes('answer'));
  check('a card cannot point to a script', (await http('/cards/my-card', 'PUT', { ...newCard, media: { image: 'javascript:alert(1)' } })).status === 400);
  const imp = await http('/cards/import', 'POST', { cards: [{ ...newCard, id: 'imp-1' }, { id: 'imp-2', type: 'typed', prompt: 'No answers' }, { ...newCard, id: 'imp-3', type: 'code', teacher: { code: '1234', accepted: ['ok'] } }] });
  check('bulk import saves the good cards and lists the others', imp.data.saved.join() === 'imp-1,imp-3' && imp.data.skipped[0].id === 'imp-2' && imp.data.skipped[0].why.includes('accepted'));
  for (const id of ['my-card', 'imp-1', 'imp-3']) await http(`/cards/${id}`, 'DELETE');
  check('delete cards', (await http('/cards')).data.length === all.length);
  const up = await fetch(base + '/api/media', { method: 'POST', headers: { 'content-type': 'audio/webm;codecs=opus' }, body: Buffer.from('fake-sound') });
  const media = await up.json();
  const got = await fetch(base + media.url);
  check('upload a sound, and phones can fetch it', up.status === 201 && /^\/media\/[a-f0-9]+\.webm$/.test(media.url) && got.status === 200 && got.headers.get('content-type') === 'audio/webm' && (await got.text()) === 'fake-sound');
  check('other file types are refused', (await fetch(base + '/api/media', { method: 'POST', headers: { 'content-type': 'text/html' }, body: '<script>' })).status === 415 && (await fetch(base + '/media/..%2Fgroups%2Fx.json')).status === 404);

  console.log('\nItems, doors and stations (a new room with two players)');
  const h3 = client(app.port); await h3.opened;
  h3.send({ t: 'host' });
  const room3 = await h3.next('room');
  const A = client(app.port), B = client(app.port);
  await A.opened; await B.opened;
  A.send({ t: 'join', room: room3.code, name: 'Aya' }); A.me = await A.next('joined');
  B.send({ t: 'join', room: room3.code, name: 'Ben' }); B.me = await B.next('joined');
  const teacher = client(app.port); await teacher.opened;
  teacher.send({ t: 'teacher', room: room3.code });
  h3.send({ t: 'group', id: gid });
  await h3.next('roster', (m) => m.group);
  // The teacher starts a mission from a template, so each tablet has a known card type.
  const lib = await (await fetch(base + '/api/missions')).json();
  check('mission templates and the zone\'s tablets are listed', lib.missions.length >= 6 && lib.zones[0].stations.length === 5);
  const tcmd = (c, extra = {}) => teacher.send({ t: 'cmd', c, ...extra });
  tcmd('mission', { mission: lib.missions.find((m) => m.id === 'light-the-lighthouse') });
  await h3.next('things');
  await sleep(200);
  tcmd('monsterSet', { level: 'off' });        // the monster has its own section below
  await sleep(100);
  check('the mission is on every screen', h3.last.roster.mission.title === 'Light the lighthouse' && h3.last.roster.phase === 'play' && A.last.roster.mission.minutes === 25);
  const r3 = app.rooms.rooms.get(room3.code);
  const at = (c, x, y) => Object.assign(r3.players.find((p) => p.id === c.me.id), { x: x + 0.5, y: y + 0.6, ix: 0, iy: 0 });
  const where = (c) => r3.players.find((p) => p.id === c.me.id);
  const thing = (id) => h3.last.things.list.find((t) => t.id === id);
  const inv = (c) => h3.last.roster.players.find((p) => p.id === c.me.id).items;
  // Sends an ability and returns the server's private reply to that phone.
  const act = async (c, a, extra = {}) => {
    for (const k of ['nope', 'say', 'clue', 'card', 'keypad']) delete c.last[k];
    c.send({ t: 'act', a, ...extra });
    await sleep(320);
    return c.last.nope?.msg || c.last.say?.msg || c.last.clue?.text || (c.last.card ? 'card' : '') || (c.last.keypad ? 'keypad' : '');
  };
  const answer = async (c, o, value) => { delete c.last.result; c.send({ t: 'answer', o, value }); await sleep(1300); return c.last.result; };
  const walk = async (c, x, y, ms) => { c.send({ t: 'input', x, y }); await sleep(ms); c.send({ t: 'input', x: 0, y: 0 }); await sleep(120); };
  // With two players: Aya has Look, Read, Talk, Listen, Pick up, Give. Ben has Open, Close, Jump, Push, Use, Fix.
  const q = () => teacher.last.queue.stations;
  check('every station got a card of the group level', q().length === 4 && q().map((s) => s.card.type).sort().join() === 'choice,code,spelling,typed' && q().every((s) => s.card.level === 'B1'));
  check('answers and codes go to the teacher only', !A.last.queue && !h3.last.queue && /^\d{4}$/.test(q().find((s) => s.card.type === 'code').card.code) && !/"(answer|code|accepted|hints)":/.test(JSON.stringify([h3.last.things, h3.last.roster, h3.last.world, A.last.things])));
  check('a closed chest does not show what is inside', thing('chest').holds === null && thing('gate').st === 'locked');

  at(B, 25, 11); await walk(B, 1, 0, 500);
  check('a locked gate blocks the bridge', where(B).x < 26);
  at(A, 16, 4); at(B, 15, 4);
  check('the rock blocks the way to the chest', (await act(B, 'open')).includes('Open does nothing') || (await act(B, 'open')).includes('Nothing to open'));
  check('Push is not Aya\'s', (await act(A, 'push')).includes("can't Push"));
  check('Ben pushes the rock aside', (await act(B, 'push')) === 'You moved it.' && thing('boulder').x === 17 && thing('boulder').y === 4);
  at(A, 16, 3); at(B, 16, 3);
  check('Aya cannot pick up from a closed chest', (await act(A, 'pickup')).includes('does nothing'));
  check('Ben opens the chest', (await act(B, 'open')).includes('key inside') && thing('chest').holds === 'key');
  check('Aya picks up the key', (await act(A, 'pickup')) === 'You have the key.' && inv(A).join() === 'key' && thing('chest').holds === null);
  at(B, 25, 11);
  check('Use on the gate needs the key', (await act(B, 'use')).includes('You need the key'));
  at(A, 3, 12);
  check('Give needs a teammate close by', (await act(A, 'give')).includes('Nobody is close enough'));
  at(A, 25, 11);
  delete B.last.say;
  check('Aya gives the key to Ben', (await act(A, 'give', { item: 0 })).includes('gave the key to Ben') && inv(B).join() === 'key' && inv(A).length === 0 && B.last.say.msg.includes('Aya gave you the key'));
  check('Ben unlocks, then opens the gate', (await act(B, 'use')).includes('Unlocked') && thing('gate').st === 'closed' && (await act(B, 'open')) === '' && thing('gate').st === 'open');
  await walk(B, 1, 0, 450);
  check('the open gate lets players through', where(B).x > 26.2);
  at(B, 26, 11);
  check('a gate does not close on a player', (await act(B, 'close')).includes('standing in the gate') && thing('gate').st === 'open');
  at(A, 27, 11); at(B, 27, 11); await walk(A, 1, 0, 500);
  check('the broken bridge stops walkers', where(A).x < 28);
  check('this bridge cannot be fixed, only jumped', (await act(B, 'fix')).includes('Fix does nothing'));
  check('Ben jumps across', (await act(B, 'jump')).includes('jumped') && Math.floor(where(B).x) === 29);
  // The flat stone on the far side: while Ben stands on it, the others can cross.
  at(B, 30, 11);
  await sleep(200);
  check('standing on the flat stone holds the bridge', thing('gap').held === true);
  await walk(A, 1, 0, 700);
  check('now Aya can walk across', where(A).x > 29);
  at(A, 31, 11); at(B, 32, 11);
  await sleep(200);
  at(A, 27, 11); await walk(A, 1, 0, 500);
  check('when nobody stands on it, the bridge is broken again', !thing('gap').held && where(A).x < 28);

  // The garden gate has a code. Its three numbers are in three clues, for three abilities.
  const st = (type) => q().find((s) => s.card.type === type);
  const spot = { 'tablet-1': [8, 14], 'tablet-2': [16, 22], 'tablet-3': [20, 16], 'tablet-4': [32, 14] };
  at(A, 19, 13); at(B, 20, 18);
  check('the garden tablet cannot be reached from outside the garden', (await act(B, 'use')) === 'keypad' && B.last.keypad.digits === 3 && !A.last.keypad);
  check('a wrong code does nothing', (await answer(B, 'garden-gate', '000')).ok === false && thing('garden-gate').st === 'locked');
  const digit = async (x, y, a) => { at(A, x, y); return (await act(A, a)).match(/(\d)\D*$/)[1]; };
  const code = (await digit(20, 11, 'read')) + (await digit(10, 10, 'look')) + (await digit(15, 18, 'listen'));
  check('Read, Look and Listen each find one number of the code', /^[1-9]{3}$/.test(code) && teacher.last.queue.gateCode === code && !JSON.stringify([h3.last.roster, h3.last.things]).includes(code));
  const unlocked = await answer(B, 'garden-gate', code);
  check('the code unlocks the gate; then it needs Open', unlocked.ok && thing('garden-gate').st === 'closed' && (await act(B, 'open')) === '' && thing('garden-gate').st === 'open');

  // The spelling tablet in the garden gives the plank.
  at(A, ...spot['tablet-3']); at(B, ...spot['tablet-3']);
  check('the tablet is Use, not Look', (await act(A, 'look')).includes('does nothing'));
  check('Ben opens the card on his phone only', (await act(B, 'use')) === 'card' && B.last.card.card.type === 'spelling' && !A.last.card && !h3.last.card && thing('tablet-3').st === 'open');
  check('the card has the question, not the answer', !/"(answer|accepted|word|code|teacher)":/.test(JSON.stringify(B.last.card)) && B.last.card.hints.length === 0);
  A.send({ t: 'answer', o: 'tablet-3', value: st('spelling').card.answer });
  await sleep(200);
  check('a player without the ability cannot answer', thing('tablet-3').st === 'open');
  check('a wrong answer does not lock anything', (await answer(B, 'tablet-3', 'zzzz')).ok === false && thing('tablet-3').st === 'open' && st('spelling').wrong === 1);
  const won = await answer(B, 'tablet-3', ` ${st('spelling').card.answer.toUpperCase()} `);
  check('the right answer solves it and the plank appears', won.ok && won.msg.includes('plank appeared') && thing('tablet-3').st === 'solved' && thing('tablet-3').holds === 'plank');
  check('Aya takes the plank and gives it to Ben', (await act(A, 'pickup')).includes('plank') && (await act(A, 'give')).includes('gave the plank') && inv(B).includes('plank'));

  // The water gate: broken, then fixed with the plank, then closed, and the sea goes down.
  at(A, 16, 20); await walk(A, 0, 1, 500);
  check('the sea is in the way to the sandbank', where(A).y < 21 && thing('sluice').floods.length === 1);
  at(B, 11, 19);
  check('the water gate is broken: Close does nothing yet', (await act(B, 'close')).includes('does nothing'));
  check('Ben fixes it with the plank', (await act(B, 'fix')).includes('Fixed') && thing('sluice').st === 'open' && !inv(B).includes('plank'));
  check('Ben closes it and the sea goes down', (await act(B, 'close')).includes('sea goes down') && thing('sluice').st === 'closed' && !thing('sluice').floods);
  await walk(A, 0, 1, 600);
  check('now the way to the sandbank is dry', where(A).y > 22);
  at(A, 16, 21);
  check('the water gate does not open while somebody is walking there', (await act(B, 'open')).includes('Wait'));

  // Choice and typed tablets, then the code card.
  for (const [id, type] of [['tablet-1', 'choice'], ['tablet-2', 'typed']]) {
    at(A, ...spot[id]); at(B, ...spot[id]);
    await act(B, 'use');
    const ok = await answer(B, id, st(type).card.answer.split(/[:/]/)[0].trim());
    check(`${type} card: auto-checked, a lantern appears`, ok.ok && thing(id).holds === 'lantern');
    check('Aya picks up the lantern', (await act(A, 'pickup')).includes('lantern'));
  }
  tcmd('take', { p: A.me.id, i: 0 });
  await sleep(150);
  check('an item the teacher takes away goes back where it was found', inv(A).length === 1 && thing('tablet-1').holds === 'lantern');
  at(A, ...spot['tablet-1']);
  await act(A, 'pickup');
  at(A, ...spot['tablet-4']); at(B, ...spot['tablet-4']);
  await act(B, 'use');
  check('code card: the teacher sees who is waiting, the code and what to accept', st('code').waiting === true && st('code').by === 'Ben' && st('code').card.accepted.length > 0 && B.last.card.card.digits === 4);
  check('a wrong code is refused', (await answer(B, 'tablet-4', '0000')).ok === false);
  check('the teacher\'s code solves it', (await answer(B, 'tablet-4', st('code').card.code)).ok === true && st('code').waiting === false);
  check('two lanterns so far', h3.last.roster.progress.have === 2 && !h3.last.roster.progress.ready);
  await act(A, 'pickup');
  await sleep(200);
  check('three lanterns: now they must go to the keeper', h3.last.roster.progress.ready && h3.last.roster.progress.bringTo === 'Lighthouse keeper' && h3.last.roster.phase === 'play');
  // One player must carry all three. Aya gives one away by mistake, and takes it back.
  at(A, 33, 11); at(B, 34, 11);
  await act(A, 'give');
  delete A.last.npc;
  await act(A, 'talk');
  check('the keeper wants all three from one pair of hands', A.last.npc.text.includes('You have 2') && h3.last.roster.phase === 'play');
  const tb = (await act(A, 'pickup')) + ' / ' + (await act(A, 'pickup'));        // Ben holds the key and the lantern: one press each
  check('Pick up takes an item back from a teammate, so nothing is ever stuck', tb.includes('took the key from Ben') && tb.includes('took the lantern from Ben') && inv(A).filter((x) => x === 'lantern').length === 3 && B.last.say.msg.includes('took the lantern from you'));
  await act(A, 'talk');
  await sleep(200);
  const res = h3.last.roster.result;
  check('talking to the keeper with all three completes the mission', h3.last.roster.phase === 'done' && res.completed && res.solved === 4 && res.restore === 'the lighthouse' && res.restoreId === 'lighthouse' && res.stars >= 2 && res.seconds > 5);
  check('the result has team numbers only, no player names', !/Aya|Ben/.test(JSON.stringify(res)));
  const after3 = (await http(`/groups/${gid}`, 'PATCH', {})).data;
  check('stars, the mission and the landmark are saved to the group', after3.island.stars === res.stars && after3.island.missionsDone.includes('light-the-lighthouse') && after3.island.landmarks.includes('lighthouse') && after3.island.sessions === 2);

  console.log('\nThe teacher\'s live controls');
  tcmd('quick');
  await h3.next('roster', (m) => m.phase === 'play');
  await sleep(200);
  tcmd('monsterSet', { level: 'off' });
  check('a second mission starts back to back, with fresh things', h3.last.roster.mission.title === 'Quick mission' && inv(A).length === 0 && thing('gate').st === 'locked' && h3.last.roster.clock < 3);
  check('the session is counted once', (await http(`/groups/${gid}`, 'PATCH', {})).data.island.sessions === 2);
  A.send({ t: 'cmd', c: 'pause', on: true });
  await sleep(100);
  check('a phone cannot send teacher commands', h3.last.roster.paused === false);
  tcmd('pause', { on: true });
  await sleep(150);
  at(A, 15, 12); await walk(A, 1, 0, 400);
  check('pause stops everything', h3.last.roster.paused === true && Math.floor(where(A).x) === 15 && (await act(A, 'look')).includes('paused'));
  tcmd('pause', { on: false });
  tcmd('set', { key: 'view', value: 99 }); tcmd('set', { key: 'phrases', value: false }); tcmd('set', { key: 'hostDetails', value: true }); tcmd('set', { key: 'hacked', value: 1 });
  await sleep(150);
  check('live settings: view size (kept within limits), phrase help, host details', JSON.stringify(h3.last.roster.settings) === JSON.stringify({ view: 15, phrases: false, hostDetails: true, timer: true, rotateMinutes: 0, hintCost: false, audio: false, fog: 0 }));
  tcmd('tp', { p: A.me.id, x: 30, y: 11 }); tcmd('tp', { p: B.me.id, x: 0, y: 0 });
  await sleep(150);
  check('teleport a player (never into water)', Math.floor(where(A).x) === 30 && where(B).x > 5);
  tcmd('give', { p: B.me.id, item: 'plank' }); tcmd('give', { p: B.me.id, item: 'crown' });
  await sleep(150);
  check('give an item', inv(B).join() === 'plank' && B.last.say.msg.includes('teacher gave you a plank'));
  tcmd('force', { o: 'gate' }); tcmd('force', { o: 'gap' }); tcmd('force', { o: 'boulder' });
  await sleep(150);
  check('rescue: open the gate, fix the bridge, move the rock', thing('gate').st === 'open' && thing('gap').st === 'fixed' && thing('boulder').x === 17);
  // Hints: released one at a time, to the players who can open that tablet.
  at(B, ...spot['tablet-1']);
  await act(B, 'use');
  const first = q().find((s) => s.o === 'tablet-1');
  delete A.last.hint;
  tcmd('hint', { o: 'tablet-1' });
  await sleep(150);
  check('hint ladder: the first hint goes to the player with the card', B.last.hint.hints.length === 1 && B.last.hint.hints[0] === first.card.hints[0] && !A.last.hint && q().find((s) => s.o === 'tablet-1').hints === 1);
  tcmd('hint', { o: 'tablet-1' }); tcmd('hint', { o: 'tablet-1' }); tcmd('hint', { o: 'tablet-1' });
  await sleep(150);
  check('three hints at most, and they are counted', B.last.hint.hints.length === 3 && teacher.last.queue.stats.hints === 3);
  // Optional: a hint costs 30 seconds on the clock.
  at(B, 23, 7);
  await act(B, 'use');
  tcmd('set', { key: 'hintCost', value: true });
  await sleep(100);
  const clock0 = r3.clock;
  tcmd('hint', { o: 'tablet-5' });
  await sleep(150);
  check('with "a hint costs 30 seconds", the clock jumps', r3.clock - clock0 > 29 && r3.clock - clock0 < 32 && h3.last.roster.clock >= Math.floor(clock0) + 30);
  tcmd('set', { key: 'hintCost', value: false });
  at(B, ...spot['tablet-1']);
  await act(B, 'use');
  check('a reopened card still shows its hints', B.last.card.hints.length === 3);
  tcmd('solve', { o: 'tablet-1' });
  await sleep(150);
  check('rescue: solve a tablet', thing('tablet-1').st === 'solved' && !!thing('tablet-1').holds);
  // Level change: unopened tablets get new cards, opened ones keep theirs.
  const beforeLevel = Object.fromEntries(q().map((s) => [s.o, s.card.id]));
  tcmd('level', { level: 'A1' });
  await sleep(250);
  check('changing the level gives new cards to unopened tablets only', h3.last.roster.group.level === 'A1' && q().filter((s) => s.st === 'new').every((s) => s.card.level === 'A1') && q().find((s) => s.o === 'tablet-1').card.id === beforeLevel['tablet-1']);
  // Playing the keeper.
  at(A, 34, 11);
  check('Aya talks to the keeper', (await act(A, 'talk')).includes('lighthouse keeper'));
  const talk = teacher.last.queue.talks[0];
  check('the teacher sees who is talking, and the keeper\'s lines', talk.who === 'Aya' && talk.npc === 'Lighthouse keeper' && teacher.last.queue.npcs[0].lines.length >= 3 && !A.last.queue);
  tcmd('npc', { talk: talk.id, text: 'Where did you find them?' });
  await sleep(150);
  check('the teacher answers as the keeper, on that phone only', A.last.npc.text === 'Where did you find them?' && A.last.npc.name === 'Lighthouse keeper' && !B.last.npc);
  tcmd('npc', { talk: talk.id, item: 'lantern', approve: true, done: true });
  await sleep(150);
  check('the keeper gives an item and the talk is closed', inv(A).includes('lantern') && teacher.last.queue.talks.length === 0);
  tcmd('rename', { p: A.me.id, name: '  Ayaka <b> ' }); tcmd('star'); tcmd('notes', { text: 'he go -> he goes' });
  await sleep(250);
  const g4 = (await http(`/groups/${gid}`, 'PATCH', {})).data;
  check('rename a player, add a team star, session notes saved with the group', h3.last.roster.players[0].name === 'Ayaka b' && g4.island.stars === res.stars + 1 && g4.notes === 'he go -> he goes');
  tcmd('reset');
  await sleep(200);
  check('reset zone: everything back in place, same cards', thing('gate').st === 'locked' && thing('tablet-1').st === 'new' && inv(A).length === 0 && q().find((s) => s.o === 'tablet-1').card.id === beforeLevel['tablet-1']);
  tcmd('mission', { mission: { title: 'Two tablets', zone: 'beach', minutes: 10, goal: { items: { lantern: 3 } }, stations: [{ at: 'tablet-1', card: 'ch-a1-01' }, { at: 'tablet-5', filter: { type: 'typed' } }] } });
  await h3.next('roster', (m) => m.mission?.title === 'Two tablets');
  await sleep(200);
  check('a custom mission: chosen tablets, a chosen card, and a goal it can reach', h3.last.things.list.filter((t) => t.kind === 'station').length === 2 && q().find((s) => s.o === 'tablet-1').card.id === 'ch-a1-01' && h3.last.roster.progress.need === 2);
  tcmd('mission', { mission: { title: 'Bad', zone: 'beach', stations: [{ at: 'nowhere' }] } });
  check('a mission with a mistake is refused with a reason', (await teacher.next('error')).msg.includes('is not a tablet'));
  tcmd('mission', { mission: { title: 'Stuck', zone: 'beach', goal: { items: { lantern: 3 } }, stations: [{ at: 'tablet-1' }, { at: 'tablet-2' }] } });
  const stuck = (await teacher.next('error')).msg;
  check('a mission that cannot be finished does not start, and says why', stuck.includes('cannot be finished') && stuck.includes('water gate') && h3.last.roster.mission.title === 'Two tablets');
  tcmd('end');
  await h3.next('roster', (m) => m.phase === 'done');
  check('the teacher ends a mission: no stars, nothing restored', h3.last.roster.result.completed === false && h3.last.roster.result.stars === 0 && h3.last.roster.result.restore === null);
  // A time limit: when the time is up, the mission ends, not finished.
  tcmd('mission', { mission: { ...lib.missions.find((m) => m.id === 'light-the-lighthouse'), timeLimit: 2 } });
  await h3.next('roster', (m) => m.phase === 'play' && m.mission.timeLimit === 2);
  app.rooms.rooms.get(room3.code).clock = 119;
  await sleep(100);
  check('before the time limit the mission goes on', h3.last.roster.phase === 'play');
  app.rooms.rooms.get(room3.code).clock = 120.5;
  const timeUp = await h3.next('roster', (m) => m.phase === 'done');
  check('when the time limit is up, the mission ends, not finished', timeUp.result.completed === false && timeUp.result.timeUp === true);
  h3.send({ t: 'kick', id: A.me.id });
  await sleep(200);
  delete h3.last.error;
  h3.send({ t: 'start' });
  await sleep(200);
  check('one player alone cannot start', h3.last.error?.code === 'few-players');

  console.log('\nChat, helpers, link cards and couriers (a new room with three players)');
  const h5 = client(app.port); await h5.opened;
  h5.send({ t: 'host' });
  const room5 = await h5.next('room');
  const kids = [];
  for (const name of ['Rin', 'Sota', 'Emi']) { const c = client(app.port); await c.opened; c.send({ t: 'join', room: room5.code, name }); c.me = await c.next('joined'); kids.push(c); }
  const t5 = client(app.port); await t5.opened;
  t5.send({ t: 'teacher', room: room5.code });
  h5.send({ t: 'group', id: gid });
  await h5.next('roster', (m) => m.group);
  const cmd5 = (c, extra = {}) => t5.send({ t: 'cmd', c, ...extra });
  cmd5('mission', { mission: { title: 'Post day', zone: 'beach', minutes: 20, goal: { items: { lantern: 3 } }, stations: [{ at: 'tablet-1', card: 'cu-a2-01' }, { at: 'tablet-2', card: 'li-a2-01' }, { at: 'tablet-3', card: 'li-a2-03' }, { at: 'tablet-4', card: 'cu-a2-02' }] } });
  await h5.next('things');
  cmd5('monsterSet', { level: 'off' });
  await sleep(250);
  const r5 = app.rooms.rooms.get(room5.code);
  const who = (ability) => kids.find((k) => h5.last.roster.players.find((p) => p.id === k.me.id)?.abilities.includes(ability));
  const byId5 = (id) => kids.find((k) => k.me.id === id);
  const stand = (c, x, y) => Object.assign(r5.players.find((p) => p.id === c.me.id), { x: x + 0.5, y: y + 0.6, ix: 0, iy: 0 });
  const mail = (c) => c.last.inbox.list;
  const q5 = () => t5.last.queue;
  const [rin, sota, emi] = kids;

  cmd5('msg', { to: 'all', kind: 'text', text: 'Hello everyone! Speak English, please.' });
  await sleep(150);
  check('a message to everyone reaches every phone', kids.every((k) => mail(k).some((m) => m.text.includes('Speak English') && m.from === 'Teacher' && !m.shareable)) && !h5.last.inbox);
  cmd5('msg', { to: rin.me.id, kind: 'link', url: 'javascript:alert(1)', text: 'x' });
  const refuse1 = (await t5.next('error')).msg;
  cmd5('msg', { to: rin.me.id, kind: 'link', url: 'ftp://example.com/file', text: 'x' });
  const refuse2 = (await t5.next('error')).msg;
  cmd5('msg', { to: rin.me.id, kind: 'image', url: 'data:image/png;base64,AAAA', text: 'x' });
  check('only http and https links are allowed', refuse1.includes('http') && refuse2.includes('http') && (await t5.next('error')).msg.includes('http') && mail(rin).length === 1);
  cmd5('msg', { to: rin.me.id, kind: 'link', url: 'https://example.com/video', text: 'Watch this.', shareable: true });
  await sleep(150);
  const sm = () => mail(rin).find((m) => m.kind === 'link');
  check('a shareable message arrives locked, and only for that student', sm().shareable && sm().locked && sm().canShare.length === 0 && rin.last.say.msg.includes('message you can share') && mail(sota).length === 1);
  rin.send({ t: 'share', m: sm().id, to: sota.me.id });
  check('Share does nothing while it is locked', (await rin.next('nope')).msg.includes('locked') && mail(sota).length === 1);
  cmd5('unlock', { m: sm().id, to: sota.me.id });
  await sleep(150);
  check('the teacher unlocks sharing for the student who asked', !sm().locked && sm().canShare.length === 1 && sm().canShare[0].name === 'Sota' && q5().messages.find((m) => m.kind === 'link').unlock === 'Sota');
  rin.send({ t: 'share', m: sm().id, to: emi.me.id });
  check('it cannot be shared with somebody else', (await rin.next('nope')).msg.includes('another teammate') && mail(emi).length === 1);
  rin.send({ t: 'share', m: sm().id, to: sota.me.id });
  await sleep(150);
  const got5 = mail(sota).find((m) => m.kind === 'link');
  check('the helper shares it with the asker', got5.url === 'https://example.com/video' && got5.from.includes('shared by Rin') && !got5.shareable && got5.canShare.length === 0 && q5().messages.find((m) => m.kind === 'link').shared.join() === 'Sota');
  cmd5('unlock', { m: sm().id, to: 'any' });
  await sleep(150);
  check('unlock for anyone: the rest of the team can get it', sm().canShare.map((p) => p.name).join() === 'Emi');
  cmd5('lock', { m: sm().id });
  cmd5('forward', { m: sm().id, p: emi.me.id });
  await sleep(150);
  check('lock again; the teacher can also send it straight to a student', sm().locked && mail(emi).some((m) => m.kind === 'link'));
  cmd5('revoke', { m: sm().id });
  await sleep(150);
  check('revoke removes it from every phone', kids.every((k) => !mail(k).some((m) => m.kind === 'link')));
  cmd5('msg', { to: 'reading', kind: 'text', text: 'x' });
  check('a message to a helper needs a helper', (await t5.next('error')).msg.includes('Reading Helper'));
  cmd5('helper', { role: 'reading', p: rin.me.id });
  await sleep(150);
  cmd5('msg', { to: 'reading', kind: 'text', text: 'For the reading helper.' });
  await sleep(150);
  check('name a helper at any moment; it shows on every screen', h5.last.roster.helpers.reading === rin.me.id && emi.last.roster.helpers.reading === rin.me.id && rin.last.say && mail(rin).some((m) => m.text === 'For the reading helper.') && !mail(sota).some((m) => m.text === 'For the reading helper.'));

  // A link card: the link goes to the Reading Helper, the question to the player at the tablet.
  const user = who('use'), giver5 = who('give');
  const press = async (c, a, extra = {}) => { for (const k of ['nope', 'say', 'card']) delete c.last[k]; c.send({ t: 'act', a, ...extra }); await sleep(330); return c.last.nope?.msg || (c.last.card ? 'card' : '') || c.last.say?.msg || ''; };
  const reply = async (c, o, value) => { delete c.last.result; c.send({ t: 'answer', o, value }); await sleep(1300); return c.last.result; };
  stand(user, 16, 22);
  check('a link card opens with a note about who to ask', (await press(user, 'use')) === 'card' && user.last.card.card.type === 'choice' && user.last.card.card.note.includes('Rin is the Reading Helper') && !JSON.stringify(user.last.card).includes('wikipedia'));
  const lm = mail(rin).find((m) => m.o === 'tablet-2');
  const st5 = (o) => q5().stations.find((s) => s.o === o);
  check('the link itself goes to the helper, locked', lm.kind === 'link' && lm.url.includes('simple.wikipedia.org') && lm.locked && st5('tablet-2').link.who === 'Rin' && !mail(user).some((m) => m.o === 'tablet-2'));
  cmd5('unlock', { m: lm.id, to: user.me.id });
  await sleep(100);
  rin.send({ t: 'share', m: lm.id, to: user.me.id });
  await sleep(150);
  check('after asking: unlock, share, and the asker has the link', mail(user).some((m) => m.o === 'tablet-2' && m.url.includes('wikipedia')));
  check('the question about the link is checked like any card', (await reply(user, 'tablet-2', 'A')).ok === true && st5('tablet-2').st === 'solved');
  stand(user, 20, 16);
  await press(user, 'use');
  check('a link card without a link waits for the teacher to send one', user.last.card.card.type === 'code' && user.last.card.card.note.includes('Listening Helper') && st5('tablet-3').link.sent === null && st5('tablet-3').waiting === true);

  // A courier: the letter starts with the player who has Give and goes to the one who opened the tablet.
  stand(user, 8, 14);
  const opened = await press(user, 'use');
  const c1 = () => st5('tablet-1').courier;
  check('a courier card hands a letter to the player with Give', opened.includes('letter') && c1().started && c1().carrier === h5.last.roster.players.find((p) => p.id === giver5.me.id).name && c1().to === h5.last.roster.players.find((p) => p.id === user.me.id).name && c1().place === 'the old bridge');
  check('the letter is in the carrier\'s pocket; both get instructions', h5.last.roster.players.find((p) => p.id === giver5.me.id).items.includes('letter') && mail(giver5).some((m) => m.from === 'Letter' && m.text.includes('the old bridge') && m.text.includes('Bring this letter')) && mail(user).some((m) => m.from === 'Letter' && m.text.includes('Ask where to meet')));
  user.send({ t: 'answer', o: 'tablet-1', value: 'A' });
  await sleep(200);
  check('nobody can answer before the letter arrives', st5('tablet-1').st === 'open' && !user.last.card);
  const third = kids.find((k) => k !== user && k !== giver5);
  cmd5('courier', { o: 'tablet-1', to: third.me.id });
  await sleep(200);
  check('the teacher reroutes the letter to another student', c1().to === h5.last.roster.players.find((p) => p.id === third.me.id).name && mail(third).some((m) => m.from === 'Letter') && !mail(user).some((m) => m.from === 'Letter'));
  const li = () => r5.players.find((p) => p.id === giver5.me.id).items.findIndex((it) => it.item === 'letter');
  stand(giver5, 10, 12); stand(third, 30, 11);
  check('Give does nothing while the receiver is far away', (await press(giver5, 'give', { item: li() })).includes('This letter is for'));
  stand(third, 11, 12);
  check('or when they meet in the wrong place', (await press(giver5, 'give', { item: li() })).includes('meet at the old bridge'));
  stand(giver5, 24, 11); stand(third, 23, 11);
  delete third.last.card;
  check('at the meeting place, Give delivers the letter', (await press(giver5, 'give', { item: li() })).includes('gave the letter') && li() === -1 && c1().delivered && third.last.card?.o === 'tablet-1');
  check('the challenge inside opens for the receiver only', !giver5.last.card && mail(third).some((m) => m.kind === 'card' && m.o === 'tablet-1'));
  stand(user, 8, 14);
  check('the player at the tablet cannot take it over', (await press(user, 'use')).includes('letter'));
  user.send({ t: 'answer', o: 'tablet-1', value: st5('tablet-1').card.answer.split(':')[0] });
  check('and cannot answer it', (await user.next('nope')).msg.includes('not your challenge') && st5('tablet-1').st === 'open');
  delete third.last.card;
  third.send({ t: 'open', o: 'tablet-1' });
  await sleep(150);
  check('the receiver reopens it from Mail and solves it', third.last.card?.o === 'tablet-1' && (await reply(third, 'tablet-1', st5('tablet-1').card.answer.split(':')[0])).ok === true && st5('tablet-1').st === 'solved');

  // The second courier: abilities are reshuffled while the letter is on its way.
  stand(who('use'), 32, 14);
  await press(who('use'), 'use');
  const c4 = () => st5('tablet-4').courier;
  cmd5('shuffle', { mode: 'preset' });
  await sleep(250);
  const holders = h5.last.roster.players.filter((p) => p.items.includes('letter'));
  check('after a reshuffle the letter is with the player who has Give now', holders.length === 1 && holders[0].abilities.includes('give') && c4().carrier === holders[0].name && c4().to !== holders[0].name);
  const to4 = byId5(h5.last.roster.players.find((p) => p.name === c4().to).id);
  delete to4.last.card;
  cmd5('courier', { o: 'tablet-4', deliver: true });
  await sleep(200);
  check('rescue: the teacher delivers a letter', c4().delivered && to4.last.card?.o === 'tablet-4' && h5.last.roster.players.every((p) => !p.items.includes('letter')));
  h5.send({ t: 'kick', id: to4.me.id });
  await sleep(200);
  const taker = who('use');
  stand(taker, 32, 14);
  check('if the receiver leaves, the challenge goes back to the tablet', (await press(taker, 'use')) === 'card' && taker.last.card.o === 'tablet-4');
  const lockedDelete = await http('/cards/ch-a1-01', 'DELETE'), lockedPut = await http('/cards/ch-a1-01', 'PUT', newCard);
  check('cards of questions.json are edited in the file only', lockedDelete.status === 400 && lockedPut.status === 400 && lockedDelete.data.error.includes('questions.json') && (await app.cards.all()).find((c) => c.id === 'ch-a1-01')?.bank);
  await http('/cards/kept-card', 'PUT', newCard);

  console.log('\nThe hidden monster (a new room with three players)');
  await http(`/groups/${gid}`, 'PATCH', { settings: { monster: 'normal' } });
  const h6 = client(app.port); await h6.opened;
  h6.send({ t: 'host' });
  const room6 = await h6.next('room');
  const team = [];
  for (const name of ['Nao', 'Taro', 'Hana']) { const c = client(app.port); await c.opened; c.send({ t: 'join', room: room6.code, name }); c.me = await c.next('joined'); team.push(c); }
  const t6 = client(app.port); await t6.opened;
  t6.send({ t: 'teacher', room: room6.code });
  h6.send({ t: 'group', id: gid });
  await h6.next('roster', (m) => m.group);
  const cmd6 = (c, extra = {}) => t6.send({ t: 'cmd', c, ...extra });
  cmd6('mission', { mission: lib.missions.find((m) => m.id === 'light-the-lighthouse') });
  await h6.next('things');
  await sleep(300);
  const r6 = app.rooms.rooms.get(room6.code), mon = r6.mon;
  const ro = () => h6.last.roster;
  const role = (k) => team.find((c) => c.me.id === ro().roles[k]);
  const pl = (c) => r6.players.find((p) => p.id === c.me.id);
  const stunned = (c) => h6.last.state.p.find((s) => s[0] === c.me.id)[5] === 1;
  const park = () => { mon.frozen = true; mon.x = 2; mon.y = 2; mon.warn = null; };       // out of the way, standing still
  const spread = () => team.forEach((c, i) => Object.assign(pl(c), { x: 12.5 + i * 3, y: 12.6, ix: 0, iy: 0 }));
  const use = async (c, k) => { for (const x of ['nope', 'say']) delete c.last[x]; c.send({ t: 'power', k }); await sleep(150); return c.last.nope?.msg || c.last.say?.msg || ''; };
  const seer = role('seer'), healer = role('healer'), slayer = role('slayer');
  check('Seer, Healer and Slayer go to three different students', new Set([seer, healer, slayer]).size === 3 && ro().monster === true && ro().mood === 0);
  check('only the Seer\'s phone gets the monster', !!seer.last.mon && seer.last.mon.on && !healer.last.mon && !slayer.last.mon && !h6.last.mon && typeof t6.last.mon.anger === 'number');
  check('nothing else says where it is', !/"(x|y)":/.test(JSON.stringify(ro())) && h6.last.state.p.every((s) => s.length === 6) && !JSON.stringify(h6.last.things).includes('monster'));

  // Anger: wrong answers feed it, progress calms it.
  park(); spread(); mon.anger = 20;
  const user6 = team.find((c) => ro().players.find((p) => p.id === c.me.id).abilities.includes('use'));
  Object.assign(pl(user6), { x: 8.5, y: 14.6 });
  user6.send({ t: 'act', a: 'use' }); await sleep(350);
  user6.send({ t: 'answer', o: 'tablet-1', value: 'Z' }); await sleep(300);
  const afterWrong = mon.anger;
  await sleep(1100);
  user6.send({ t: 'answer', o: 'tablet-1', value: t6.last.queue.stations.find((s) => s.o === 'tablet-1').card.answer.split(':')[0] }); await sleep(300);
  check('a wrong answer makes it angrier, a solved tablet calms it', afterWrong >= 28 && mon.anger <= afterWrong - 19 && t6.last.queue.stations.find((s) => s.o === 'tablet-1').st === 'solved');
  mon.frozen = false; mon.anger = 10; mon.idle = 0;
  await sleep(300);
  const slow = mon.anger;
  mon.idle = 999;
  await sleep(300);
  check('anger grows with time, faster when the team is idle', slow > 10 && mon.anger - slow > (slow - 10) * 1.5);

  // Chasing and touching.
  park(); spread(); mon.frozen = false; mon.anger = 50; mon.touchWait = 0; mon.retreat = 0;
  Object.assign(mon, { x: 6.5, y: 12.6 });
  const prey = team[0], d0 = Math.hypot(pl(prey).x - mon.x, pl(prey).y - mon.y);
  await sleep(600);
  check('when angry it chases the nearest player', mon.phase === 'chase' && ro().mood === 1 && Math.hypot(pl(prey).x - mon.x, pl(prey).y - mon.y) < d0 - 0.8);
  Object.assign(mon, { x: pl(prey).x - 0.3, y: pl(prey).y });
  await sleep(250);
  check('its touch stuns', stunned(prey) && prey.last.say.msg.includes('Stunned') && r6.stats.stuns === 1);
  park();
  prey.send({ t: 'input', x: 1, y: 0 }); prey.send({ t: 'act', a: ro().players.find((p) => p.id === prey.me.id).abilities[0] });
  const px = pl(prey).x;
  await sleep(400);
  prey.send({ t: 'input', x: 0, y: 0 });
  check('a stunned player cannot move or act', pl(prey).x === px && prey.last.nope.msg.includes('stunned'));
  const other6 = team.find((c) => c !== healer && c !== prey) || slayer;
  if (healer === prey) { pl(prey).stun = 0; Object.assign(pl(other6), { stun: 8 }); }
  const hurt = healer === prey ? other6 : prey;
  const bystander = team.find((c) => c !== healer && c !== hurt);
  check('only the Healer can heal', (await use(bystander, 'healer')).includes('is the Healer'));
  Object.assign(pl(healer), { x: pl(hurt).x + 8, y: pl(hurt).y });
  check('the Healer must be close', (await use(healer, 'healer')).includes('too far'));
  Object.assign(pl(healer), { x: pl(hurt).x + 1, y: pl(hurt).y });
  check('the Healer heals a stunned teammate', (await use(healer, 'healer')).includes('You healed') && !stunned(hurt) && hurt.last.say.msg.includes('Healed'));
  pl(hurt).stun = 0.3;
  await sleep(500);
  check('a stun also ends by itself', pl(hurt).stun === 0 && !stunned(hurt));

  // Shooting: a warning for the Seer only, then a whole row.
  park(); spread(); mon.frozen = false; mon.forced = 'shoot'; mon.shotIn = 0.05; mon.touchWait = 99;
  for (const c of team) delete c.last.beam;
  const warned = await seer.next('mon', (m) => m.warn, 3000);
  check('the Seer sees the warning before the shot', warned.phase === 'shoot' && ['h', 'v'].includes(warned.warn.dir) && Number.isInteger(warned.warn.at) && ro().mood === 2);
  check('nobody else is told before it fires', team.filter((c) => c !== seer).every((c) => !c.last.mon && !c.last.beam) && !h6.last.beam);
  // Make it a known shot: along row 12, with one player on it and the others moved away.
  mon.warn.dir = 'h'; mon.warn.at = 12; mon.warn.left = 0.3;
  const onLine = team[1], safe = [team[0], team[2]];
  Object.assign(pl(onLine), { x: 20.5, y: 12.6 }); safe.forEach((c, i) => Object.assign(pl(c), { x: 14.5 + i, y: 14.6 }));
  const beam = await h6.next('beam');
  await sleep(150);
  check('the shot stuns everybody on that row, and nobody else', beam.dir === 'h' && beam.at === 12 && stunned(onLine) && safe.every((c) => !stunned(c)) && onLine.last.beam.at === 12);

  // A hit can knock an item out of a player's hands; the Healer can save it.
  park(); r6.players.forEach((p) => { p.stun = 0; }); spread();
  const carrier6 = team.find((c) => c !== healer);
  pl(carrier6).items.push({ item: 'lantern', from: 'tablet-1' });
  r6.things.find((t) => t.id === 'tablet-1').holds = null;
  mon.c = { ...mon.c, setback: 1 };
  const shoot = async (c) => { mon.frozen = false; mon.forced = 'shoot'; mon.touchWait = 99; mon.warn = { dir: 'h', at: Math.floor(pl(c).y), left: 0.1 }; await sleep(350); park(); };
  Object.assign(pl(carrier6), { x: 30.5, y: 9.6 });
  await shoot(carrier6);
  check('on harder settings a hit makes the player drop an item', stunned(carrier6) && ro().players.find((p) => p.id === carrier6.me.id).items.length === 0 && carrier6.last.say.msg.includes('dropped'));
  Object.assign(pl(healer), { x: 31.5, y: 9.6 });
  await use(healer, 'healer');
  await sleep(100);
  check('healed in time, the item is saved', ro().players.find((p) => p.id === carrier6.me.id).items.join() === 'lantern');
  await shoot(carrier6);
  pl(carrier6).stun = 0.2;
  await sleep(500);
  check('not healed, the item goes back where it was found (never lost)', ro().players.find((p) => p.id === carrier6.me.id).items.length === 0 && h6.last.things.list.find((t) => t.id === 'tablet-1').holds === 'lantern');
  mon.forced = null;

  // The Slayer: must be near, the power needs time to charge, enough hits chase it away.
  park(); spread();
  check('only the Slayer can strike', (await use(seer, 'slayer')).includes('is the Slayer'));
  check('far from the monster the Slayer hits nothing', (await use(slayer, 'slayer')).includes('hit nothing') && slayer.last.cool.slayer === 6);
  check('the power has to charge again', (await use(slayer, 'slayer')).includes('charging'));
  const strike = async () => { pl(slayer).slayAt = 0; Object.assign(mon, { x: pl(slayer).x + 1.5, y: pl(slayer).y, frozen: true }); return use(slayer, 'slayer'); };
  mon.anger = 60;
  const hit1 = await strike();
  check('near the monster the Slayer hits it, and it gets calmer', hit1.includes('hit the monster') && mon.hp === 2 && mon.anger === 45);
  await strike(); await strike();
  check('enough hits chase it away for a while', mon.on === false && mon.away > 60 && ro().mood === -1 && r6.stats.slays === 1 && seer.last.mon.on === false);
  mon.frozen = false; mon.away = 0.2;
  await sleep(500);
  check('later it comes back', mon.on === true && mon.hp === 3 && ro().mood >= 0);

  // The teacher's controls.
  park();
  cmd6('monster', { do: 'unfreeze' }); await sleep(100);
  cmd6('monster', { do: 'freeze' }); await sleep(150);
  const fx6 = mon.x; mon.anger = 80;
  await sleep(300);
  check('freeze stops it', mon.frozen && mon.x === fx6 && mon.anger === 80 && t6.last.mon.frozen === true);
  cmd6('monster', { do: 'calm' }); cmd6('monsterSet', { phase: 'chase' }); cmd6('monsterSet', { speed: 9 });
  await sleep(150);
  check('calm it, choose its phase, change its speed (within limits)', mon.anger === 55 && mon.forced === 'chase' && mon.speedMul === 2);
  cmd6('monsterSet', { phase: 'auto' }); cmd6('monster', { do: 'remove' });
  await sleep(150);
  check('remove it', mon.on === false && mon.forced === null && ro().mood === -1);
  cmd6('monster', { do: 'spawn' });
  await sleep(150);
  check('and bring it back', mon.on === true && ro().mood >= 0);
  cmd6('monsterSet', { level: 'hard' });
  await sleep(150);
  check('change the difficulty live', r6.mon.level === 'hard' && r6.mon.c.stun === 11 && ro().group.monster === 'hard');
  // The teacher takes a role.
  cmd6('role', { role: 'healer', p: 'teacher' }); cmd6('role', { role: 'slayer', p: 'teacher' });
  await sleep(150);
  pl(team[0]).stun = 9;
  await sleep(100);
  check('with the teacher as Healer, students must ask the teacher', ro().roles.healer === 'teacher' && (await use(healer, 'healer')).includes('The teacher is the Healer') && stunned(team[0]));
  cmd6('heal', { p: team[0].me.id });
  await sleep(150);
  const hp0 = r6.mon.hp;
  cmd6('monster', { do: 'hit' });
  await sleep(150);
  check('the teacher heals and strikes from the panel', !stunned(team[0]) && r6.mon.hp === hp0 - 1);
  cmd6('role', { role: 'seer', p: team[2].me.id }); cmd6('role', { role: 'healer', p: team[2].me.id }); cmd6('role', { role: 'slayer', p: team[1].me.id });
  await sleep(150);
  check('the teacher gives roles to chosen students (one can hold two)', ro().roles.seer === team[2].me.id && ro().roles.healer === team[2].me.id && ro().roles.slayer === team[1].me.id);
  delete team[0].last.mon;
  r6.mon.sendIn = 0; r6.mon.frozen = false;
  await sleep(200);
  check('the new Seer now gets the monster, the old one does not', !!team[2].last.mon && (team[0] === team[2] || !team[0].last.mon));
  const before6 = { ...ro().roles };
  cmd6('rotate');
  await sleep(150);
  check('rotate: every role moves to another student', ['seer', 'healer', 'slayer'].every((k) => ro().roles[k] !== before6[k] && team.some((c) => c.me.id === ro().roles[k])) && new Set(Object.values(ro().roles)).size === 3);
  const before7 = { ...ro().roles };
  cmd6('set', { key: 'rotateMinutes', value: 1 });
  await sleep(100);
  r6.rotateClock = 59.9;
  await sleep(300);
  check('roles can rotate by themselves every N minutes', ro().settings.rotateMinutes === 1 && ro().roles.seer !== before7.seer);
  team[0].send({ t: 'cmd', c: 'monster', do: 'remove' });
  await sleep(100);
  check('a phone cannot control the monster', r6.mon.on === true);
  const seerNow = team.find((c) => c.me.id === ro().roles.seer);
  h6.send({ t: 'kick', id: seerNow.me.id });
  await sleep(200);
  check('if a player with a role leaves, the role goes to somebody else', ro().players.length === 2 && ['seer', 'healer', 'slayer'].every((k) => ro().players.some((p) => p.id === ro().roles[k])) && ro().roles.seer === ro().roles.healer && ro().roles.slayer !== ro().roles.seer);
  cmd6('monsterSet', { level: 'off' });
  await sleep(150);
  check('monster off: no monster at all', r6.mon === null && ro().monster === false && ro().mood === -1);
  cmd6('end');
  await h6.next('roster', (m) => m.phase === 'done');
  check('the result counts stuns and monsters chased away; the saved island is untouched', ro().result.slays === 1 && ro().result.stuns >= 4 && (await http(`/groups/${gid}`, 'PATCH', {})).data.island.landmarks.includes('lighthouse'));

  console.log('\nZones and mission templates');
  const lib2 = await (await fetch(base + '/api/missions')).json();
  const packPut = await http('/missions/light-the-lighthouse', 'PUT', { ...lib2.missions.find((m) => m.id === 'light-the-lighthouse'), title: 'Changed' });
  check('a scenario pack\'s mission cannot be changed or deleted from the panel', packPut.status === 400 && packPut.data.error.includes('scenarios/beach/missions/light-the-lighthouse.json') && (await http('/missions/light-the-lighthouse', 'DELETE')).status === 400);
  check('missions say which pack they come from', lib2.missions.filter((m) => m.zone === 'forest').every((m) => m.pack === 'forest'));
  check('the packs\' maps, each with its missions', lib2.zones.map((z) => z.id).slice(0, 2).join() === 'beach,forest' && lib2.zones[1].unlock === 2 && lib2.missions.filter((m) => m.zone === 'forest').length === 3 && lib2.missions.filter((m) => m.zone === 'beach').length >= 6);
  // A fresh group: the forest opens after two restored landmarks.
  const fresh = (await http('/groups', 'POST', { name: 'Fresh class' })).data;
  await http(`/groups/${fresh.id}`, 'PATCH', { settings: { monster: 'off' } });
  const h8 = client(app.port); await h8.opened;
  h8.send({ t: 'host' });
  const room8 = await h8.next('room');
  const duo = [];
  for (const name of ['Ami', 'Bo']) { const c = client(app.port); await c.opened; c.send({ t: 'join', room: room8.code, name }); c.me = await c.next('joined'); duo.push(c); }
  const t8 = client(app.port); await t8.opened;
  t8.send({ t: 'teacher', room: room8.code });
  h8.send({ t: 'group', id: fresh.id });
  await h8.next('roster', (m) => m.group);
  check('a new group starts with the beach only', h8.last.roster.group.island.zones.join() === 'beach');
  const r8 = app.rooms.rooms.get(room8.code);
  // Finishes the running mission the short way: hand the goal items to the player with Talk, next to the character.
  const finish = async () => {
    const goal = r8.mission.goal, item = Object.keys(goal.items)[0], npc = r8.things.find((t) => t.id === goal.deliver);
    const talker = r8.players.find((p) => p.abilities.includes('talk'));
    talker.items = Array.from({ length: goal.items[item] }, () => ({ item, from: null }));
    Object.assign(talker, { x: npc.x + 0.5, y: npc.y + 1.6, stun: 0 });
    duo.find((c) => c.me.id === talker.id).send({ t: 'act', a: 'talk' });
    await h8.next('roster', (m) => m.phase === 'done');
    await sleep(200);
    return h8.last.roster;
  };
  h8.send({ t: 'start' });
  await h8.next('roster', (m) => m.phase === 'play');
  check('a quick mission stays in the zones the group has opened', r8.zone.id === 'beach' && h8.last.world.zone.id === 'beach');
  const won1 = await finish();
  check('first mission: the lighthouse, and the forest is still closed', won1.result.restoreId === 'lighthouse' && won1.result.opened.length === 0 && won1.group.island.zones.join() === 'beach');
  t8.send({ t: 'cmd', c: 'mission', mission: lib2.missions.find((m) => m.id === 'light-the-lighthouse') });
  await h8.next('roster', (m) => m.phase === 'play');
  const won2 = await finish();
  check('same mission again: the next ruin is restored instead', won2.result.restoreId === 'dock' && won2.result.restore === 'the boat dock');
  check('two landmarks open the forest and the reef (both unlock at 2), and it is saved', won2.result.opened.join() === 'Whisper Forest,Reef Isle,Reef Shore' && won2.group.island.zones.join() === 'beach,forest,reef-isle,reef-shore' && (await http(`/groups/${fresh.id}`, 'PATCH', {})).data.island.zones.includes('forest'));
  t8.send({ t: 'cmd', c: 'mission', mission: { ...lib2.missions.find((m) => m.id === 'the-lost-crystals'), monster: 'gentle' } });
  await h8.next('world', (m) => m.zone.id === 'forest');
  await sleep(250);
  check('a forest mission: its own map, objects, places, goal and code', r8.zone.id === 'forest' && h8.last.things.list.some((t) => t.id === 'owl') && h8.last.world.zone.places.some((p) => p.name === 'the rope bridge') && h8.last.roster.progress.label === 'Crystals' && h8.last.roster.progress.bringTo === 'Forest ranger' && t8.last.queue.gateName === 'Yard gate' && t8.last.queue.zone === 'forest');
  check('a mission can name its own monster setting', r8.mon?.level === 'gentle' && h8.last.roster.group.monster === 'off');
  r8.mon.frozen = true;
  const won3 = await finish();
  check('forest missions restore forest landmarks', won3.result.restoreId === 'forest-cabin' && won3.group.island.landmarks.join() === 'lighthouse,dock,forest-cabin');
  const zsheet = await (await fetch(base + '/api/sheet?zone=forest')).json();
  check('the forest has its own printable sheet', zsheet.title === 'Whisper Forest' && zsheet.puzzles.some((p) => p.name === 'Old dam') && zsheet.missions.length === 3 && zsheet.steps.length > 20);
  const rsheet = await (await fetch(base + `/api/sheet?room=${room8.code}`)).json();
  check('and a sheet for the running mission (codes, players, one way through)', rsheet.title === 'The lost crystals' && /^[1-9]{3}$/.test(rsheet.gateCode.code) && rsheet.players.length === 2 && rsheet.stations.length === 4 && rsheet.steps.at(-1).includes('Talk'));
  // Saving a mission built in the panel as a template.
  const mine8 = { ...lib2.missions.find((m) => m.id === 'word-hunt'), id: 'my-word-hunt', title: 'My word hunt', minutes: 30, monster: 'off' };
  check('save a mission as a template', (await http('/missions/my-word-hunt', 'PUT', mine8)).data.minutes === 30 && (await (await fetch(base + '/api/missions')).json()).missions.find((m) => m.id === 'my-word-hunt').monster === 'off');
  check('a template with a mistake is refused', (await http('/missions/bad-one', 'PUT', { title: 'Bad', zone: 'moon', stations: [] })).status === 400);
  check('delete a template', (await http('/missions/my-word-hunt', 'DELETE')).status === 200 && !(await (await fetch(base + '/api/missions')).json()).missions.some((m) => m.id === 'my-word-hunt'));

  console.log('\nThe solver and the island');
  const { runCheck } = await import('../server/check.js');
  const checked = await runCheck(app.config.contentDir, dataDir);
  check('npm run check: every zone and mission can be finished with 2 to 6 players, and everybody is needed', checked.ok, checked.errors.join(' | '));
  const { solverAnswers, golden } = await import('./golden.js');
  const answers = await solverAnswers(), expected = await golden();
  const differ = Object.keys({ ...answers, ...expected }).filter((k) => JSON.stringify(answers[k]) !== JSON.stringify(expected[k]));
  check('the solver solves every pack mission exactly as before (test/solver-golden.json)', !differ.length, differ.slice(0, 5).join(', '));
  const { solve, whyNot } = await import('../server/solver.js');
  const zoneB = app.rooms.rooms.get(room3.code).zone, light = app.missions.normalize(lib.missions.find((m) => m.id === 'light-the-lighthouse'));
  check('the solver sees a dead end: nobody has Jump', !solve(zoneB, light, dealPreset(table, 3), { without: ['jump'] }).ok && whyNot(zoneB, light, [['look', 'read', 'talk', 'listen', 'pickup', 'give'], ['open', 'close', 'push', 'use', 'fix']]).includes('Jump'));
  check('and: Pick up and Give with different players (nothing could be handed over)', !solve(zoneB, light, [['pickup', 'look', 'read', 'talk', 'listen'], ['give', 'open', 'close', 'jump', 'push', 'use', 'fix']]).ok);
  let mixOk = true;
  for (let n = 2; n <= 6; n++) for (let i = 0; i < 40; i++) { const d = dealRandom(table, n); mixOk &&= d.some((set) => set.includes('pickup') && set.includes('give')); }
  check('random mix keeps Pick up and Give with one player', mixOk);
  const isl = (await http(`/groups/${gid}`, 'PATCH', {})).data.island;
  check('the island remembers every restored landmark, in order', isl.landmarks[0] === 'lighthouse' && isl.landmarks.length >= 1 && new Set(isl.landmarks).size === isl.landmarks.length);

  console.log('\nThe map');
  const seen = new Set(), todo = [zone.spawns[0]].map((s) => [Math.floor(s.x), Math.floor(s.y)]);
  while (todo.length) {
    const [x, y] = todo.pop();
    if (seen.has(`${x},${y}`) || solidAt(zone, x + 0.5, y + 0.5)) continue;
    seen.add(`${x},${y}`);
    todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  check('all six starts are connected, and the bridge leads to the islet', zone.spawns.every((s) => seen.has(`${Math.floor(s.x)},${Math.floor(s.y)}`)) && seen.has('24,11') && zone.landmarks.length === 8);
  await app.close();

  console.log('\nStorage adapters (files, and Supabase against a stand-in server)');
  const fake = await startFakeSupabase();
  const supa = createSupabaseStorage({ url: fake.url + '/', key: fake.key });
  const fileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-store-'));
  const fileStore = createFileStorage(fileDir);
  // The same contract for both adapters.
  for (const [label, store] of [['files', fileStore], ['Supabase', supa]]) {
    await store.check();
    const empty = (await store.list('groups')).length === 0 && (await store.get('groups', 'nobody')) === null;
    await store.put('groups', 'b-group', { id: 'b-group', name: 'B', island: { stars: 1 } });
    await store.put('groups', 'a-group', { id: 'a-group', name: 'A' });
    await store.put('groups', 'b-group', { id: 'b-group', name: 'B', island: { stars: 2 } });          // replace
    await store.put('meta', 'seeded-cards', { ids: ['x'] });
    const listed = await store.list('groups');
    const got = await store.get('groups', 'b-group');
    await store.remove('groups', 'a-group');
    await store.putFile('abcdef123456.webm', Buffer.from('sound-1'), 'audio/webm');
    await store.putFile('abcdef123456.webm', Buffer.from('sound-2'), 'audio/webm');                  // replace
    const file = await store.getFile('abcdef123456.webm');
    let badId = false;
    try { await store.put('groups', '../evil', {}); } catch { badId = true; }
    check(`${label}: save, replace, list in order, read, delete`, empty && listed.map((g) => g.id).join() === 'a-group,b-group' && got.island.stars === 2 && (await store.list('groups')).length === 1 && (await store.get('groups', 'a-group')) === null);
    check(`${label}: sounds and pictures`, file.toString() === 'sound-2' && (await store.getFile('nothere12345.png')) === null && (await store.getFile('../x')) === null && (await store.listFiles()).join() === 'abcdef123456.webm');
    check(`${label}: unsafe ids are refused`, badId && (await store.get('meta', 'seeded-cards')).ids[0] === 'x');
  }
  check('Supabase: the records really are in its tables and bucket', fake.db.li_groups.get('b-group').data.name === 'B' && fake.db.li_meta.has('seeded-cards') && fake.files.get('abcdef123456.webm').type === 'audio/webm');
  const reason = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message; } };
  check('Supabase: a wrong key gives a clear reason', (await reason(() => createSupabaseStorage({ url: fake.url, key: 'anon-key' }).check())).includes('service key'));
  const noTables = await startFakeSupabase({ tables: [] });
  check('Supabase: missing tables point to schema.sql', (await reason(() => createSupabaseStorage({ url: noTables.url, key: noTables.key }).check())).includes('schema.sql'));
  await noTables.close();
  fake.state.paused = true;
  check('Supabase: a paused project is explained', (await reason(() => supa.list('groups'))).includes('paused'));
  fake.state.paused = false;
  check('Supabase: no internet is explained', (await reason(() => createSupabaseStorage({ url: 'http://127.0.0.1:9', key: 'k' }).check())).includes('did not answer'));
  check('Supabase: the settings are needed', (await reason(async () => createSupabaseStorage({ url: '', key: '' }))).includes('SUPABASE_URL'));
  // The whole game on Supabase: start the server with it and use the teacher API.
  const cloud = await createApp({ port: 0, storage: 'supabase', supabaseUrl: fake.url, supabaseKey: fake.key, pin: '2468' });
  const cbase = `http://127.0.0.1:${cloud.port}`;
  const cg = await (await fetch(cbase + '/api/groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Cloud class' }) })).json();
  const ccards = await (await fetch(cbase + '/api/cards')).json();
  const cmissions = (await (await fetch(cbase + '/api/missions')).json()).missions;
  const cup = await (await fetch(cbase + '/api/media', { method: 'POST', headers: { 'content-type': 'audio/mpeg' }, body: Buffer.from('mp3-bytes') })).json();
  const cget = await fetch(cbase + cup.url);
  check('the game runs on Supabase: groups, sample cards, pack missions (kept in their files), uploads', fake.db.li_groups.has(cg.id) && ccards.length >= 40 && fake.db.li_cards.size === ccards.filter((c) => !c.pack && !c.bank).length && cmissions.length >= 9 && cmissions.every((m) => m.pack) && fake.db.li_missions.size === 0 && (await cget.text()) === 'mp3-bytes' && cget.headers.get('content-type') === 'audio/mpeg');
  check('the Supabase key never reaches a browser', !JSON.stringify([await (await fetch(cbase + '/api/info')).json(), cg, cup]).includes(fake.key) && !(await (await fetch(cbase + '/host/host.js')).text()).includes('SERVICE_KEY'));
  await cloud.close();
  // Moving a school from files to Supabase and back.
  const there = await startFakeSupabase();
  const counts = await copyStorage(createFileStorage(dataDir), createSupabaseStorage({ url: there.url, key: there.key }));
  const backDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-back-'));
  await copyStorage(createSupabaseStorage({ url: there.url, key: there.key }), createFileStorage(backDir));
  const backGroup = JSON.parse(await fs.readFile(path.join(backDir, 'groups', gid + '.json'), 'utf8'));
  check('copy everything to Supabase and back to files', counts.groups >= 2 && counts.cards >= 1 && counts.files >= 1 && there.db.li_groups.has(gid) && backGroup.island.landmarks.includes('lighthouse') && (await fs.readdir(path.join(backDir, 'media'))).length === counts.files && (await fs.readdir(path.join(backDir, 'cards'))).length === counts.cards);
  await there.close(); await fake.close();
  for (const d of [fileDir, backDir]) await fs.rm(d, { recursive: true, force: true });

  console.log('\nHosted mode');
  const hosted = await createApp({ port: 0, dataDir, publicUrl: 'https://island.example.com/', pin: '2468' });
  const hbase = `http://127.0.0.1:${hosted.port}/api`;
  check('the API needs the PIN', (await fetch(hbase + '/groups')).status === 401 && (await fetch(hbase + '/groups', { headers: { 'x-pin': '0000' } })).status === 401);
  check('the card library and uploads need the PIN too', (await fetch(hbase + '/cards')).status === 401 && (await fetch(hbase + '/media', { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: 'x' })).status === 401 && (await fetch(hbase + '/missions')).status === 401);
  check('the API opens with the PIN', (await fetch(hbase + '/groups', { headers: { 'x-pin': '2468' } })).status === 200);
  const h = client(hosted.port); await h.opened;
  h.send({ t: 'host' });
  check('the host screen needs the PIN', (await h.next('error')).code === 'pin');
  h.send({ t: 'teacher', room: 'ABCD' });
  check('the teacher view needs the PIN', (await h.next('error')).code === 'pin');
  h.send({ t: 'host', pin: '2468' });
  check('the QR code points to PUBLIC_URL', (await h.next('room')).joinUrl.startsWith('https://island.example.com/phone/?room='));
  await hosted.close();

  await fs.rm(dataDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
