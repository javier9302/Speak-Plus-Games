// Competitive mode. A match is 1 to 4 ordinary rooms (one per team) playing the same mission at the same time.
//
// Every room keeps all of its own game state, exactly as in the cooperative game: map objects, items, clues,
// monster, stuns, roles, abilities, the teacher's queue. Nothing here copies state from one room to another.
// The match only reads each room's counters (to score it) and, for sabotage, sets `room.effect` on the target
// room, in one function (startEffect) after the checks in `sabotage`.
//
// Who gets what:
//   score:update  {phase, board}        everybody in the match (all phones, the host screen, the teacher panel).
//                 board: [{n, team, score, progress: {clues, cluesTotal, goal, goalNeed}, place}] and nothing else.
//   match         the lobby (team names, join codes, QR codes, who joined) for the host screen; the same plus
//                 charges, effects and pause state for the teacher panel. Never positions, objects or clue text.
//   roster.team   each room's own phones: their team name, charge and active effect (see teamInfo).
//   sabotage:start {id, from, left} / sabotage:end {id, why}   only the target room's phones.
//   sabotage:sent {id, target}          only the phone that sent it.
import crypto from 'node:crypto';
import { EFFECTS } from './sabotage.js';
import { kindOf } from './kinds/index.js';
const intOr = (v, d) => (Number.isInteger(v) ? v : d);

export function createMatches(G) {
  const { cfg, now, send, fail } = G;
  const matches = new Map();

  // ---------- teams ----------
  function resetTeam(room) {
    room.score = 0; room.place = 0;
    room.charge = 0; room.chargeClues = 0;
    room.effect = null; room.shieldUntil = 0;
    room.seen = { run: room.missionRun, clues: 0, solved: 0, slays: 0, obstacles: new Set() };
  }
  function addRoom(match) {
    const room = G.newRoom(), n = match.rooms.length;
    room.match = match;
    room.team = { n, name: cfg.teamNames[n] || `Team ${n + 1}` };
    room.group = match.group && structuredClone(match.group);    // each room its own copy: a level change stays in that room
    resetTeam(room);
    match.rooms.push(room);
    return room;
  }

  function create(teams, group) {
    const match = {
      id: G.newCode(), key: crypto.randomBytes(8).toString('hex'),
      phase: 'lobby', rooms: [], hosts: new Set(), teachers: new Set(),
      group: group ? structuredClone(group) : null, mission: null, finish: [], sabotage: !!cfg.sabotage.enabled,
      hostInfo: '', lastBoard: '',
    };
    matches.set(match.id, match);
    const n = Math.max(1, Math.min(cfg.maxRooms, intOr(teams, 2)));
    while (match.rooms.length < n) addRoom(match);
    return match;
  }

  // ---------- scoring ----------
  // Points come from counters each room already keeps. Called before every roster of a match room.
  function observe(room) {
    const s = room.seen, P = cfg.points;
    if (s.run !== room.missionRun) Object.assign(s, { run: room.missionRun, clues: 0, solved: 0, slays: 0, obstacles: new Set() });
    const clues = room.found.size - s.clues;
    if (clues > 0) { room.score += clues * P.clue; earn(room, clues); }
    s.clues = room.found.size;
    if (room.stats.solved > s.solved) room.score += (room.stats.solved - s.solved) * P.challenge;
    s.solved = room.stats.solved;
    if (room.stats.slays > s.slays) room.score += (room.stats.slays - s.slays) * P.monster;
    s.slays = room.stats.slays;
    // An obstacle counts once per mission, even if it is closed again later (each kind says when it is cleared).
    for (const t of room.things) if (kindOf(t).cleared?.(t) && !s.obstacles.has(t.id)) { s.obstacles.add(t.id); room.score += P.obstacle; }
  }
  // A charge for every N new clues, up to the maximum a team can keep.
  function earn(room, clues) {
    const { cluesPerCharge: n, maxCharges } = cfg.sabotage;
    room.chargeClues += clues;
    while (room.chargeClues >= n) { room.chargeClues -= n; room.charge = Math.min(maxCharges, room.charge + 1); }
  }
  // The room reached the final objective (completed) or the teacher ended its mission.
  function finished(room, completed) {
    const match = room.match;
    if (completed && !match.finish.includes(room)) {
      match.finish.push(room);
      room.place = match.finish.length;
      room.score += cfg.points.finish[room.place - 1] || 0;
    }
    endEffect(room, 'finished');
    checkDone(match);
  }
  function checkDone(match) {
    if (match.phase === 'play' && match.rooms.every((r) => r.phase !== 'play')) match.phase = 'done';
    refresh(match);
  }

  // ---------- what each screen sees ----------
  function progressOf(room) {
    const started = room.phase !== 'lobby' && room.mission;
    const goal = started ? G.progress(room) : null;
    return {
      clues: started ? room.found.size : 0,
      cluesTotal: started ? room.things.reduce((n, t) => n + Object.keys(t.def.clues || {}).length, 0) : 0,
      goal: goal ? (goal.done || room.place ? goal.need : goal.have) : 0,
      goalNeed: goal ? goal.need : 0,
    };
  }
  // The shared scoreboard: team name, score, progress and finishing place. Nothing about anybody's map.
  const board = (match) => match.rooms.map((r) => ({ n: r.team.n, team: r.team.name, score: r.score, progress: progressOf(r), place: r.place }));
  const effectOf = (room) => room.effect && { id: room.effect.id, from: room.effect.from, left: Math.max(0, room.effect.until - now()) };
  // For one room's own phones (sent inside their roster).
  function teamInfo(room) {
    const match = room.match;
    return {
      n: room.team.n, name: room.team.name, teams: match.rooms.length, phase: match.phase,
      charge: room.charge, chargeClues: room.chargeClues, cluesPerCharge: cfg.sabotage.cluesPerCharge,
      sabotage: match.sabotage && match.rooms.length > 1, effect: effectOf(room),
    };
  }
  // Which group the match plays as. Its notes (errors the teacher heard) stay on the teacher's Groups tab.
  const groupOf = (match) => match.group && { id: match.group.id, name: match.group.name, level: match.group.level };
  const players = (room) => room.players.map((p) => ({ id: p.id, name: p.name, ci: p.ci, hero: p.hero, online: !!p.ws }));
  async function hostMsg(match) {
    const teams = [];
    for (const r of match.rooms) {
      const qr = await G.qrOf(r);
      teams.push({ n: r.team.n, name: r.team.name, code: r.code, joinUrl: qr.url, qr: qr.img, phase: r.phase, players: players(r) });
    }
    return { t: 'match', id: match.id, key: match.key, phase: match.phase, max: cfg.maxRooms, roomSize: cfg.roomSize, group: groupOf(match), network: G.network(), teams };
  }
  function teacherMsg(match) {
    const t = now();
    return {
      t: 'match', id: match.id, phase: match.phase, sabotage: match.sabotage, max: cfg.maxRooms, roomSize: cfg.roomSize, group: groupOf(match),
      points: cfg.points, cluesPerCharge: cfg.sabotage.cluesPerCharge,
      teams: match.rooms.map((r) => ({
        n: r.team.n, name: r.team.name, code: r.code, phase: r.phase, paused: r.paused, players: players(r),
        score: r.score, place: r.place, progress: progressOf(r), charge: r.charge, chargeClues: r.chargeClues,
        effect: effectOf(r), shield: Math.max(0, r.shieldUntil - t), mission: r.mission?.title || null,
      })),
    };
  }
  const members = (match) => [...match.hosts, ...match.teachers, ...match.rooms.flatMap((r) => r.players.map((p) => p.ws))];

  // Something in the match may have changed: send the scoreboard (if it changed) and the screens' views.
  function refresh(match) {
    const b = JSON.stringify({ t: 'score:update', phase: match.phase, board: board(match) });
    if (b !== match.lastBoard) { match.lastBoard = b; for (const ws of members(match)) if (ws && ws.readyState === 1) ws.send(b); }
    const tm = JSON.stringify(teacherMsg(match));
    for (const ws of match.teachers) if (ws.readyState === 1) ws.send(tm);
    sendHost(match).catch(console.error);
  }
  async function sendHost(match, only) {
    if (!match.hosts.size && !only) return;
    const msg = JSON.stringify(await hostMsg(match));
    if (!only && msg === match.hostInfo) return;                  // the QR images are big: only send what changed
    match.hostInfo = msg;
    for (const ws of only ? [only] : match.hosts) if (ws.readyState === 1) ws.send(msg);
  }
  function sendBoard(match, ws) { send(ws, JSON.parse(match.lastBoard || JSON.stringify({ t: 'score:update', phase: match.phase, board: board(match) }))); }

  // ---------- sabotage ----------
  // A phone asks to send an effect. The server checks everything; a request that breaks the rules does nothing.
  function sabotage(room, p, m) {
    const match = room.match;
    if (!match || match.phase !== 'play' || !match.sabotage || room.phase !== 'play' || room.paused) return;
    if (m.from !== undefined && m.from !== room.team.n) return;   // claims to be another team
    if (room.charge < 1) return;
    const id = m.effect === undefined ? 'fog' : m.effect;
    if (!Object.hasOwn(EFFECTS, id) || !cfg.sabotage.effects[id]) return;
    const others = match.rooms.filter((r) => r !== room);
    const target = Number.isInteger(m.target) ? match.rooms[m.target] : others.length === 1 ? others[0] : null;
    if (!target || target === room) return;
    const nope = (msg) => send(p.ws, { t: 'nope', msg });
    if (target.phase !== 'play') return nope(`${target.team.name} is not playing now.`);
    if (target.effect) return nope(`${target.team.name} already has ${EFFECTS[target.effect.id].name}. Try again later.`);
    const wait = Math.ceil((target.shieldUntil - now()) / 1000);
    if (wait > 0) return nope(`${target.team.name} is protected for ${wait} more seconds.`);
    room.charge--;
    startEffect(target, EFFECTS[id], room);
    send(p.ws, { t: 'sabotage:sent', id, target: target.team.name });
    G.sendRoster(room);
  }
  function startEffect(target, effect, from) {
    target.effect = { id: effect.id, from: from.team.name, until: now() + cfg.sabotage.effects[effect.id].seconds * 1000 };
    effect.apply(target);
    const msg = { t: 'sabotage:start', id: effect.id, from: from.team.name, left: cfg.sabotage.effects[effect.id].seconds * 1000 };
    for (const p of target.players) send(p.ws, msg);
    G.sendRoster(target);
  }
  // Time is up, the teacher cancelled it, or the room's mission ended. Then the room is protected for a while.
  function endEffect(room, why) {
    if (!room.effect) return;
    const { id } = room.effect;
    EFFECTS[id].expire(room);
    room.effect = null;
    room.shieldUntil = now() + cfg.sabotage.cooldownSeconds * 1000;
    for (const p of room.players) send(p.ws, { t: 'sabotage:end', id, why });
    G.sendRoster(room);
  }
  // Every game tick. Effects run on the server's clock; while a room is paused, its effect waits too.
  function tick(dtMs) {
    const t = now();
    for (const match of matches.values()) for (const room of match.rooms) {
      if (!room.effect) continue;
      if (room.paused) room.effect.until += dtMs;
      else if (t >= room.effect.until) endEffect(room, 'time');
    }
  }

  // ---------- the teacher's and the host screen's controls ----------
  // m.n: one room (its number); without it, every room.
  const pick = (match, m) => (Number.isInteger(m.n) ? [match.rooms[m.n]].filter(Boolean) : match.rooms);
  async function newMission(match) {
    const zones = Object.values(G.zones), open = zones.filter((z) => match.group.island.zones.includes(z.id));
    const zone = open[Math.floor(Math.random() * open.length)] || zones[0];
    return G.missions.quick(zone, await G.cards.all(), match.group.level);
  }
  const commands = {
    // How many teams. Only in the lobby; a room that has players is never removed.
    'match:teams'(match, m, ws) {
      if (match.phase === 'play') return fail(ws, 'bad', 'End the match first.');
      const n = Math.max(1, Math.min(cfg.maxRooms, intOr(m.teams, match.rooms.length)));
      while (match.rooms.length < n) addRoom(match);
      while (match.rooms.length > n) {
        const last = match.rooms.at(-1);
        if (last.players.length) return fail(ws, 'bad', `${last.team.name} has players. Remove them first.`);
        match.rooms.pop();
        G.dropRoom(last);
      }
      refresh(match);
    },
    async 'match:group'(match, m) {
      const g = await G.groups.get(String(m.id || ''));
      if (!g) return;
      for (const z of Object.values(G.zones)) if (!g.island.zones.includes(z.id) && g.island.landmarks.length >= z.unlock) g.island.zones.push(z.id);
      match.group = { id: g.id, name: g.name, level: g.settings.level, monster: g.settings.monster, island: g.island, notes: g.notes };
      for (const r of match.rooms) { r.group = structuredClone(match.group); G.sendRoster(r); }
      refresh(match);
    },
    // Start every room that has players (all the same mission), or one room (m.n).
    async 'match:start'(match, m, ws) {
      if (!match.group) return fail(ws, 'no-group', 'Choose a group first.');
      if (Number.isInteger(m.n)) {
        const room = match.rooms[m.n];
        if (!room || room.phase === 'play') return;
        if (room.players.length < 2) return fail(ws, 'few-players', `${room.team.name} needs at least 2 players.`);
        match.mission ||= await newMission(match);
        match.finish = match.finish.filter((r) => r !== room);
        resetTeam(room);
        await G.startMission(room, match.mission, ws);
        if (room.phase === 'play') { room.seen.run = room.missionRun; match.phase = 'play'; }
        return refresh(match);
      }
      if (match.phase === 'play') return fail(ws, 'bad', 'The match is running. End it first.');
      const teams = match.rooms.filter((r) => r.players.length);
      if (!teams.length) return fail(ws, 'few-players', 'Nobody has joined yet.');
      const small = teams.find((r) => r.players.length < 2);
      if (small) return fail(ws, 'few-players', `${small.team.name} needs at least 2 players.`);
      match.mission = await newMission(match);
      match.finish = [];
      match.rooms.forEach(resetTeam);
      for (const room of teams) {
        await G.startMission(room, match.mission, ws);
        room.seen.run = room.missionRun;
      }
      if (teams.some((r) => r.phase === 'play')) match.phase = 'play';
      refresh(match);
    },
    'match:pause'(match, m) {
      for (const room of pick(match, m)) if (room.phase === 'play') { room.paused = !!m.on; G.sendRoster(room); }
      refresh(match);
    },
    async 'match:end'(match, m) {
      for (const room of pick(match, m)) if (room.phase === 'play') await G.endMission(room, false);
      checkDone(match);
    },
    'match:kick'(match, m) { const room = match.rooms[m.n]; if (room) G.kick(room, m.id); },
    'match:lobby'(match) {
      match.phase = 'lobby';
      for (const room of match.rooms) { endEffect(room, 'teacher'); G.lobby(room); }
      refresh(match);
    },
    // Points by hand: the speaking bonus, or any correction. A score never goes below 0.
    'score:adjust'(match, m) {
      const room = match.rooms[m.n], delta = Math.max(-1000, Math.min(1000, intOr(m.delta, 0)));
      if (!room || !delta) return;
      room.score = Math.max(0, room.score + delta);
      refresh(match);
    },
    'sabotage:cancel'(match, m) {
      for (const room of pick(match, m)) endEffect(room, 'teacher');
      refresh(match);
    },
    // Off: every running effect stops and nobody can send one. Charges are kept for when it is on again.
    'sabotage:toggle'(match, m) {
      match.sabotage = !!m.on;
      for (const room of match.rooms) { if (!match.sabotage) endEffect(room, 'teacher'); G.sendRoster(room); }
      refresh(match);
    },
  };

  // ---------- connecting ----------
  function attachHost(match, ws) { match.hosts.add(ws); sendHost(match, ws).catch(console.error); sendBoard(match, ws); }
  function attachTeacher(match, ws) { match.teachers.add(ws); send(ws, teacherMsg(match)); sendBoard(match, ws); }
  // The network changed: new QR codes. Rooms nobody uses any more were deleted: forget their match.
  function slow(alive) {
    for (const match of matches.values()) {
      if (!match.rooms.some((r) => alive(r))) { matches.delete(match.id); continue; }
      sendHost(match).catch(console.error);
    }
  }

  return { matches, create, commands, observe, finished, teamInfo, refresh, sendBoard, sabotage, endEffect, tick, attachHost, attachTeacher, slow };
}
