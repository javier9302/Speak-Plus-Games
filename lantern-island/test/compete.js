// Competitive mode, simulated: one host screen, one teacher panel, 24 phones in 4 rooms.
// Checks that rooms never share state, that the scoreboard carries nothing but names, scores and progress,
// and the rules of sabotage (fog). The server's clock is moved forward instead of waiting 20 seconds.
// Run with: npm test (it runs after sim.js), or on its own: node test/compete.js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { client } from './client.js';

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let offset = 0;                                   // how far the test has moved the server's clock
const clock = () => Date.now() + offset;

// Every key anywhere inside a message.
function keysOf(v, out = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysOf(x, out); }
  return out;
}
const MAP_KEYS = ['x', 'y', 'tx', 'ty', 'rows', 'things', 'list', 'stations', 'text', 'gateCode', 'mon', 'items', 'abilities', 'notes'];
const sameKeys = (o, keys) => JSON.stringify(Object.keys(o).sort()) === JSON.stringify([...keys].sort());

async function main() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-compete-'));
  const app = await createApp({ port: 0, dataDir, publicUrl: '', pin: '2468', clock });
  const cfg = app.rooms.compete, P = cfg.points;
  const api = async (p, method, body) => (await fetch(`http://127.0.0.1:${app.port}/api${p}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  const group = await api('/groups', 'POST', { name: 'Thursday Teens' });
  await api(`/groups/${group.id}`, 'PATCH', { settings: { monster: 'off' } });   // no monster: rooms stay still unless the test acts

  console.log('\nCreating a match');
  const host = client(app.port); await host.opened;
  host.send({ t: 'host' });
  check('the host screen starts in the normal game, and knows the team limit', (await host.next('room')).compete.maxRooms === cfg.maxRooms);
  host.send({ t: 'match:create', teams: 9 });
  let info = await host.next('match');
  const hostFrom = host.all.length;
  check('a match has at most the configured number of rooms', info.teams.length === cfg.maxRooms && cfg.maxRooms === 4);
  check('teams get the configured names and their own codes and QR codes', info.teams.map((t) => t.name).join() === cfg.teamNames.join() && new Set(info.teams.map((t) => t.code)).size === 4 && info.teams.every((t) => /^[A-Z]{4}$/.test(t.code) && t.qr.startsWith('data:image/png') && t.joinUrl.endsWith(t.code)));
  host.send({ t: 'match:teams', teams: 2 });
  info = await host.next('match', (m) => m.teams.length === 2);
  host.send({ t: 'match:teams', teams: 4 });
  info = await host.next('match', (m) => m.teams.length === 4);
  check('the number of teams can change in the lobby', info.teams.length === 4);
  host.send({ t: 'match:group', id: group.id });
  info = await host.next('match', (m) => m.group);
  const teacher = client(app.port); await teacher.opened;
  teacher.send({ t: 'teacher', match: info.id });
  const [watching, overview] = await Promise.all([teacher.next('watching'), teacher.next('match')]);
  check('one teacher panel sees the whole match and watches the first team', watching.match === info.id && watching.room === info.teams[0].code && overview.teams.length === 4);

  console.log('\n24 phones in 4 rooms');
  const phones = [[], [], [], []];
  for (let n = 0; n < 4; n++) for (let i = 0; i < 6; i++) {
    const c = client(app.port); await c.opened;
    c.send({ t: 'join', room: info.teams[n].code, name: `P${n}${i}` });
    c.me = await c.next('joined');
    phones[n].push(c);
  }
  await sleep(100);
  const rooms = info.teams.map((t) => app.rooms.rooms.get(t.code));
  const [A, B, C, D] = rooms;
  check('every phone lands in the room of its code', phones.every((list, n) => list.every((c) => c.me.room === info.teams[n].code && rooms[n].players.some((p) => p.id === c.me.id))));
  check('every phone shows its team name', phones.every((list, n) => list.every((c) => c.last.roster.team?.n === n && c.last.roster.team.name === cfg.teamNames[n])));
  check('24 players, 6 in each room', rooms.every((r) => r.players.length === 6) && rooms.reduce((s, r) => s + r.players.length, 0) === 24);
  const seventh = client(app.port); await seventh.opened;
  seventh.send({ t: 'join', room: info.teams[0].code, name: 'Late' });
  check(`a room holds ${cfg.roomSize} players, the 7th is refused`, (await seventh.next('error')).code === 'full' && A.players.length === 6);
  check('the host lobby lists each team\'s players', host.last.match.teams.every((t) => t.players.length === 6));

  console.log('\nStarting');
  teacher.send({ t: 'match:start' });
  await host.next('score:update', (m) => m.phase === 'play');
  await sleep(100);
  check('the teacher starts every room at once', rooms.every((r) => r.phase === 'play'));
  check('all rooms play the same mission', rooms.every((r) => r.mission === A.mission && r.zone === A.zone));
  check('each room has its own objects, monster state and gate code', new Set(rooms.map((r) => r.things)).size === 4 && rooms.every((r) => r.things.every((t) => !rooms.some((o) => o !== r && o.things.includes(t)))));
  check('each room gets the same set of abilities on its own', rooms.every((r) => JSON.stringify(r.players.map((p) => p.abilities)) === JSON.stringify(A.players.map((p) => p.abilities))));
  check('phones get their own room\'s map', phones.every((list) => list.every((c) => c.last.world)));
  const seenByHost = new Set(host.all.slice(hostFrom).map((m) => m.t));
  check('the shared host screen never gets a map, positions or objects', !['world', 'state', 'things', 'mon', 'queue', 'roster'].some((t) => seenByHost.has(t)), [...seenByHost].join());

  console.log('\nNothing leaks between rooms');
  const snap = (r) => JSON.stringify({
    things: r.things.map((t) => [t.id, t.st, t.holds, t.x, t.y, t.wrong, t.hints, t.card?.id]), found: [...r.found], stats: r.stats, gateCode: r.gateCode,
    players: r.players.map((p) => [p.id, p.x, p.y, p.items, p.stun, p.abilities]), score: r.score, charge: r.charge, effect: r.effect, paused: r.paused, phase: r.phase, roles: r.roles, talks: r.talks,
  });
  const before = [B, C, D].map(snap);
  const marks = phones.map((list) => list.map((c) => c.all.length));
  // Room A: a player types the garden gate's code, and the teacher fixes the bridge.
  const gate = A.things.find((t) => t.def.code);
  const userIn = (room, list, ab) => list.find((c) => room.players.find((p) => p.id === c.me.id).abilities.includes(ab));
  const aUser = userIn(A, phones[0], 'use');
  aUser.send({ t: 'answer', o: gate.id, value: A.gateCode.slice(0, gate.def.code) });
  check('room A unlocks its gate', (await aUser.next('result', (m) => m.o === gate.id)).ok && gate.st === 'closed');
  const gap = A.things.find((t) => t.kind === 'gap');
  teacher.send({ t: 'cmd', c: 'force', o: gap.id });
  await sleep(150);
  check('room A fixes its bridge', gap.st === 'fixed');
  check('rooms B, C and D are exactly as they were', [B, C, D].map(snap).every((s, i) => s === before[i]));
  check('their gates and bridges are still closed and broken', [B, C, D].every((r) => r.things.find((t) => t.id === gate.id).st === 'locked' && r.things.find((t) => t.id === gap.id).st === 'broken'));
  const leaked = phones.slice(1).flatMap((list, i) => list.flatMap((c, j) => c.all.slice(marks[i + 1][j]).filter((m) => !['state', 'score:update'].includes(m.t))));
  check('no phone in B, C or D got a message about it (only positions and the scoreboard)', leaked.length === 0, leaked.map((m) => m.t).join());
  if (B.gateCode !== A.gateCode) {
    const bUser = userIn(B, phones[1], 'use');
    await sleep(1300);
    bUser.send({ t: 'answer', o: gate.id, value: A.gateCode.slice(0, gate.def.code) });
    check('room A\'s code does not open room B\'s gate', !(await bUser.next('result', (m) => m.o === gate.id)).ok && B.things.find((t) => t.id === gate.id).st === 'locked');
  }

  console.log('\nScoreboard');
  const board = (c = teacher) => c.last['score:update'].board;
  check('two obstacles score for room A only', board()[0].score === 2 * P.obstacle && board().slice(1).every((e) => e.score === 0));
  const sb = phones[2][0].last['score:update'];
  check('a scoreboard entry has only n, team, score, progress and place', sb.board.every((e) => sameKeys(e, ['n', 'team', 'score', 'progress', 'place']) && sameKeys(e.progress, ['clues', 'cluesTotal', 'goal', 'goalNeed'])));
  check('progress is only numbers', sb.board.every((e) => Object.values(e.progress).every(Number.isInteger)) && sb.board[0].progress.cluesTotal > 0);
  const boards = [host, teacher, ...phones.flat()].flatMap((c) => c.all.filter((m) => m.t === 'score:update'));
  const bad = [...keysOf(boards)].filter((k) => MAP_KEYS.includes(k));
  check('no scoreboard message ever had positions, objects, clue text or the monster', boards.length > 0 && bad.length === 0, bad.join());
  const tm = [...keysOf(teacher.last.match)].filter((k) => MAP_KEYS.includes(k));
  check('the teacher\'s match overview has no positions or objects either', tm.length === 0, tm.join());

  console.log('\nCharges from clues');
  // Walk A's players up to things with clues (the teacher's teleport), and use the ability that reads them.
  async function findClues(room, list, want) {
    for (const t of room.things) for (const ab of Object.keys(t.def.clues || {})) {
      if (room.found.size >= want) return;
      if (room.found.has(`${t.id}:${ab}`)) continue;
      const c = userIn(room, list, ab);
      if (!c) continue;
      const spot = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => [t.x + dx, t.y + dy]).find(([x, y]) => !room.solid(x + 0.5, y + 0.5));
      if (!spot) continue;
      teacher.send({ t: 'cmd', c: 'tp', p: c.me.id, x: spot[0], y: spot[1] });
      await sleep(300);
      c.send({ t: 'act', a: ab });
      await Promise.race([c.next('clue'), c.next('nope'), sleep(500)]).catch(() => {});
    }
  }
  await findClues(A, phones[0], cfg.sabotage.cluesPerCharge);
  await sleep(100);
  check(`${cfg.sabotage.cluesPerCharge} clues give a charge, and points`, A.found.size >= cfg.sabotage.cluesPerCharge && A.charge === 1 && A.score === 2 * P.obstacle + A.found.size * P.clue, `found ${A.found.size}, charge ${A.charge}, score ${A.score}`);
  check('the team\'s phones see their charge', phones[0].every((c) => c.last.roster.team.charge === 1));
  await findClues(A, phones[0], 2 * cfg.sabotage.cluesPerCharge);
  await sleep(100);
  if (A.found.size >= 2 * cfg.sabotage.cluesPerCharge) check('a team keeps at most one charge', A.charge === cfg.sabotage.maxCharges && cfg.sabotage.maxCharges === 1);

  console.log('\nFog');
  const marks2 = phones.map((list) => list.map((c) => c.all.length));
  const a0 = phones[0][0];
  a0.send({ t: 'sabotage:send', target: 1 });
  const got = await phones[1][0].next('sabotage:start');
  const sent = await a0.next('sabotage:sent');
  await sleep(100);
  check('room B\'s phones see who sent fog, and for how long', got.id === 'fog' && got.from === cfg.teamNames[0] && got.left === cfg.sabotage.effects.fog.seconds * 1000 && cfg.sabotage.effects.fog.seconds === 20);
  check('the start message says nothing about the sender\'s map', sameKeys(got, ['t', 'id', 'from', 'left']));
  check('the sender gets a short confirmation', sent.target === cfg.teamNames[1] && sameKeys(sent, ['t', 'id', 'target']));
  const startsIn = (n) => phones[n].filter((c, j) => c.all.slice(marks2[n][j]).some((m) => m.t === 'sabotage:start')).length;
  check('fog reaches all of room B and nobody else', startsIn(1) === 6 && startsIn(0) === 0 && startsIn(2) === 0 && startsIn(3) === 0);
  check('the charge is spent, and only B has the effect', A.charge === 0 && B.effect?.id === 'fog' && !A.effect && !C.effect && !D.effect && phones[1].every((c) => c.last.roster.team.effect?.id === 'fog'));
  check('B can still move under the fog', B.phase === 'play' && !B.paused);

  C.charge = 1;                                   // test shortcut: earning charges is checked above
  const c0 = phones[2][0];
  c0.send({ t: 'sabotage:send', target: 1 });
  check('only one fog at a time in a room', /already/.test((await c0.next('nope')).msg) && C.charge === 1);
  A.charge = 1;
  a0.send({ t: 'sabotage:send', target: 0 });
  a0.send({ t: 'sabotage:send', target: 2, from: 3 });   // claims to be another team
  a0.send({ t: 'sabotage:send', target: 9 });
  a0.send({ t: 'sabotage:send', target: 2, effect: 'earthquake' });
  phones[3][0].send({ t: 'sabotage:send', target: 2 });   // D has no charge
  await sleep(150);
  check('a team cannot fog itself; bad requests and no charge do nothing', A.charge === 1 && !A.effect && !C.effect && D.charge === 0);

  // Reconnecting under the fog: same room, same abilities, the fog's time left.
  const old = phones[1][2], mine = B.players.find((p) => p.id === old.me.id).abilities.join();
  await old.close();
  await sleep(50);
  const back = client(app.port); await back.opened;
  back.send({ t: 'join', room: B.code, name: 'whoever', token: old.me.token });
  const [again, r] = await Promise.all([back.next('joined'), back.next('roster', (m) => m.team)]);
  check('a phone that reconnects returns to its room and role', again.id === old.me.id && again.room === B.code && B.players.find((p) => p.id === again.id).abilities.join() === mine);
  check('and still sees the fog with its time left', r.team.effect?.id === 'fog' && r.team.effect.left > 0 && r.team.effect.left <= 20000);
  phones[1][2] = back;

  offset += 19000; await sleep(150);
  check('after 19 seconds the fog is still on', B.effect?.id === 'fog');
  offset += 1500;
  const end = await phones[1][0].next('sabotage:end', () => true, 1000);
  await sleep(50);
  check('after 20 seconds the server ends it', end.why === 'time' && !B.effect && back.all.some((m) => m.t === 'sabotage:end'), `${end.why} ${!!B.effect} ${back.all.some((m) => m.t === 'sabotage:end')}`);
  c0.send({ t: 'sabotage:send', target: 1 });
  check(`then B is protected for ${cfg.sabotage.cooldownSeconds} seconds`, /protected/.test((await c0.next('nope')).msg) && C.charge === 1 && !B.effect);
  offset += cfg.sabotage.cooldownSeconds * 1000 + 500;
  c0.send({ t: 'sabotage:send', target: 1 });
  check('after the cooldown it can be fogged again', (await phones[1][0].next('sabotage:start')).from === cfg.teamNames[2]);
  teacher.send({ t: 'sabotage:cancel', n: 1 });
  check('the teacher can cancel it', (await phones[1][0].next('sabotage:end')).why === 'teacher' && !B.effect);
  teacher.send({ t: 'sabotage:toggle', on: false });
  await sleep(100);
  a0.send({ t: 'sabotage:send', target: 3 });
  await sleep(100);
  check('the teacher can switch sabotage off', !D.effect && A.charge === 1 && phones[0].every((c) => c.last.roster.team.sabotage === false));
  teacher.send({ t: 'sabotage:toggle', on: true });

  console.log('\nTeacher controls and finishing order');
  teacher.send({ t: 'score:adjust', n: 3, delta: P.speaking });
  await teacher.next('score:update', (m) => m.board[3].score === P.speaking);
  teacher.send({ t: 'score:adjust', n: 3, delta: -1000 });
  check('the teacher adds a speaking bonus, and a score never goes below 0', (await teacher.next('score:update', (m) => m.board[3].score === 0)).board[3].score === 0);
  teacher.send({ t: 'match:pause', n: 1, on: true });
  await sleep(100);
  check('the teacher pauses one room', B.paused && !A.paused && !C.paused);
  teacher.send({ t: 'match:pause', on: false });
  await sleep(100);
  check('and resumes all', rooms.every((r) => !r.paused));

  // Finish the mission in C, then D: the teacher gives the goal items to a player who can Talk, who brings them.
  async function finish(room, list) {
    teacher.send({ t: 'teacher', match: info.id, room: room.code });
    await teacher.next('watching', (m) => m.room === room.code);
    const goal = room.mission.goal, [item, need] = Object.entries(goal.items)[0];
    const c = userIn(room, list, 'talk');
    for (let i = 0; i < need; i++) teacher.send({ t: 'cmd', c: 'give', p: c.me.id, item });
    await sleep(150);
    if (goal.deliver && room.phase === 'play') {
      const npc = room.things.find((t) => t.id === goal.deliver);
      const spot = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => [npc.x + dx, npc.y + dy]).find(([x, y]) => !room.solid(x + 0.5, y + 0.5));
      teacher.send({ t: 'cmd', c: 'tp', p: c.me.id, x: spot[0], y: spot[1] });
      await sleep(300);
      c.send({ t: 'act', a: 'talk' });
    }
    await teacher.next('score:update', (m) => m.board[room.team.n].place > 0);
  }
  const before3 = [C.score, D.score];
  await finish(C, phones[2]);
  await finish(D, phones[3]);
  const fin = board();
  check('the first room to finish is 1st, the next 2nd', fin[2].place === 1 && fin[3].place === 2 && fin[0].place === 0 && fin[1].place === 0);
  check('finishing gives the configured points', C.score >= before3[0] + P.finish[0] && D.score >= before3[1] + P.finish[1]);
  check('the other rooms keep playing', A.phase === 'play' && B.phase === 'play' && teacher.last['score:update'].phase === 'play');
  check('the match is not saved to the group\'s island', (await api(`/groups/${group.id}`, 'PATCH', {})).island.sessions === 0);
  teacher.send({ t: 'match:end' });
  check('the teacher ends the game for all rooms', (await teacher.next('score:update', (m) => m.phase === 'done')) && rooms.every((r) => r.phase === 'done'));

  console.log('\nThe cooperative game alongside');
  const host2 = client(app.port); await host2.opened;
  host2.send({ t: 'host' });
  const coop = await host2.next('room');
  const coopPhones = [];
  for (const name of ['Mika', 'Ken']) {
    const c = client(app.port); await c.opened;
    c.send({ t: 'join', room: coop.code, name });
    c.me = await c.next('joined');
    coopPhones.push(c);
  }
  await sleep(100);
  check('a normal room has no team and no scoreboard', coopPhones.every((c) => c.last.roster.team === null && !c.all.some((m) => m.t.includes(':'))));
  check('and is not part of any match', !app.rooms.rooms.get(coop.code).match && [...app.rooms.matches.values()].every((m) => !m.rooms.some((r) => r.code === coop.code)));

  await app.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
