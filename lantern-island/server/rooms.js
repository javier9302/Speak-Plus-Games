// Rooms: who is connected, the lobby, missions and the game loop.
// The server decides everything; phones only send their joystick and button presses.
//
// Messages (JSON, "t" is the type)
//   host  -> server   host {pin, room?, hostKey?} | group {id} | start (quick mission) | lobby
//                     kick {id} | shuffle {mode: "preset" | "random"}
//   phone -> server   join {room, name, token?, hero?} | input {x, y} | act {a: ability, item?: index}
//                     hero {id} (choose a character; only outside a mission)
//                     answer {o: station, value} | share {m: message, to: player} | open {o: station}
//                     power {k: seer | healer | slayer}
//   teacher -> server teacher {pin, room?, match?} | cmd {c: command, ...}      (commands: see teacher.js)
//   competitive mode (see match.js):
//   host  -> server   host {match, matchKey} (reload) | match:create {teams} | match:teams {teams} | match:group {id}
//   host, teacher     match:start {n?} | match:pause {on, n?} | match:end {n?} | match:lobby | match:kick {n, id}
//   teacher -> server score:adjust {n, delta} | sabotage:cancel {n?} | sabotage:toggle {on}
//   phone -> server   sabotage:send {target, effect?, from?}
//   server ->         score:update {phase, board} (everyone in the match) | match {...} (host screen, teacher panel)
//                     sabotage:start {id, from, left} | sabotage:end {id, why} (the target room) | sabotage:sent {id, target}
//   server -> host    room {code, hostKey, joinUrl, qr, network, abilities, items}
//   server -> all     roster {phase, group, players, deal, progress, mission, clock, paused, settings, result}
//                     world {zone, reach} | things {list} (objects and their state)
//                     state {p:[[id,x,y,dir,moving,stunned]]} | fx {by, a} (someone used an ability)
//                     beam {dir, at} (the monster fired along a row or column)
//   server -> one     joined {id, token, hero, abilities, items} | notes {list} | clue {o, a, name, text}
//                     card {o, name, card, wrong, hints} | hint {o, hints} | result {o, ok, msg}
//                     keypad {o, name, digits} (a gate asks for its code; answered with answer {o, value})
//                     npc {name, text} | say {msg} | nope {msg} | error {code, msg} | kicked
//                     inbox {list} (messages from the teacher, letters) | cool {slayer: seconds}
//   server -> Seer    mon {on, x, y, phase, warn}   the monster: only the Seer's phone (and the teacher) gets it
//   server -> teacher queue {stations (cards with answers, codes, hints, couriers), talks, npcs, stats, messages}
// Clue text and card questions only go to the player who found them. Answers and codes only to the teacher.
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { isTeacher } from './http.js';
import { dealPreset, dealRandom } from './abilities.js';
import { stepPlayer, solidAt, REACH } from './world.js';
import { buildThings, blockSet, publicThings, useAbility, returnItems, pressPlates, completeAction, waitingAbility, canForce } from './things.js';
import { kindOf, KIND_ART } from './kinds/index.js';
import { goalOf } from './goals/index.js';
import { gameCtx } from './things.js';
import { zoneFor } from './missions.js';
import { makeRun, isRandom } from './run.js';
import { customTiles } from './tiles.js';

const RUN_TRIES = 20;                     // seeds tried for a run that this team can finish
import { whyNot, inspect } from './solver.js';
import { pickCard, innerCard, publicCard, teacherCard, checkAnswer } from './cards.js';
import { createChat } from './chat.js';
import { createMonster } from './monster.js';
import { createTeacherCommands } from './teacher.js';
import { heroById } from '../public/shared/heroes.js';
import { COMPETE, competeConfig } from './compete-config.js';
import { createMatches } from './match.js';

export const MAX_PLAYERS = COMPETE.roomSize;             // the default; an app can change it with createApp({ compete: { roomSize } })
export const HINT_COST_SECONDS = 30;       // what a hint adds to the mission clock, if the teacher switches that on
const TICK_MS = 50;                       // 20 updates per second
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O
const ROOM_IDLE_MS = 30 * 60 * 1000;
const ACT_GAP_MS = 250;                   // a phone cannot use abilities faster than this
const ANSWER_GAP_MS = 1200;               // or answer a card faster than this (no guessing by hammering)
const DEFAULT_SETTINGS = { view: 9, phrases: true, hostDetails: false, timer: true, rotateMinutes: 0, hintCost: false };   // the teacher changes these live

const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const fail = (ws, code, msg) => send(ws, { t: 'error', code, msg });
const num = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
// A character id from public/shared/heroes.js, or '' (the islander).
export const cleanHero = (v) => (heroById(v) ? v : '');
export const cleanName = (v) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);

export function createRooms({ config, groups, zones, abilities, items, cards, missions, monsterCfg, network, compete, clock }) {
  const rooms = new Map();
  let net = network.current();
  const cfg = competeConfig(compete);
  const now = clock || Date.now;             // tests can move the clock forward (sabotage timers)

  // Room codes and match codes share one set of letters, so a code always means one thing.
  function newCode() {
    let code;
    do { code = Array.from({ length: 4 }, () => CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)]).join(''); } while (rooms.has(code) || M.matches.has(code));
    return code;
  }

  function newRoom() {
    const code = newCode();
    const room = {
      code, hostKey: crypto.randomBytes(8).toString('hex'),
      hosts: new Set(), teachers: new Set(), players: [], seq: 0,
      phase: 'lobby',                       // lobby -> play -> done (mission complete) -> play ...
      group: null, zone: Object.values(zones)[0], settings: { ...DEFAULT_SETTINGS },
      dealMode: 'preset', deal: 0, found: new Set(),
      mission: null, clock: 0, paused: false, result: null, counted: false,
      gateCode: '',                         // the garden gate's code: new digits every mission
      messages: [], helpers: { listening: null, reading: null },
      roles: { seer: null, healer: null, slayer: null }, roleTurn: -1, rotateClock: 0, mon: null,
      things: [], block: new Set(), talks: [], stats: { solved: 0, wrong: 0, hints: 0, acts: 0, stuns: 0, slays: 0 },
      qr: null, touched: Date.now(), missionRun: 0,
      match: null, team: null,              // competitive mode: the match this room is a team in (match.js)
    };
    room.solid = (x, y) => solidAt(room.zone, x, y, room.block);
    room.giveLetter = (p, it) => chat.giveLetter(room, p, it);
    rooms.set(code, room);
    return room;
  }

  const everyone = (room) => [...room.hosts, ...room.teachers, ...room.players.map((p) => p.ws)];
  const broadcast = (room, msg) => { const s = JSON.stringify(msg); for (const ws of everyone(room)) if (ws && ws.readyState === 1) ws.send(s); };

  function sendRoster(room) {
    const m = room.mission;
    if (room.match) M.observe(room);         // score what changed since the last roster
    broadcast(room, {
      t: 'roster', phase: room.phase, group: room.group, max: MAX_PLAYERS,
      deal: room.deal, dealMode: room.dealMode,
      progress: progress(room), settings: room.settings,
      mission: m && { id: m.id, title: m.title, story: m.story, minutes: m.minutes, timeLimit: m.timeLimit },
      clock: Math.round(room.clock), paused: room.paused, result: room.result, helpers: room.helpers,
      // The monster: who has which role, and its mood (-1 none, 0 wandering, 1 chasing, 2 shooting). Never where it is.
      roles: room.roles, monster: !!room.mon, mood: monster.mood(room),
      players: room.players.map((p) => ({ id: p.id, name: p.name, ci: p.ci, hero: p.hero, online: !!p.ws, abilities: p.abilities, items: p.items.map((it) => it.item) })),
      team: room.match ? M.teamInfo(room) : null,
    });
    if (room.match) M.refresh(room.match);
  }
  // How the map looks: the mission's theme, else the map's (tiles.js). A run's map keeps its base map's themes in room.themes.
  const themeOf = (room) => {
    const themes = room.zone.themes || room.themes || {}, name = room.mission?.theme || room.zone.themeName || 'day';
    return { id: name, ...(themes[name] || {}) };
  };
  // An atlas (several maps joined, atlas.js) has regions, each with its own theme (the mission's theme, if it has one).
  const regionsOf = (room) => room.zone.regions?.map((r) => {
    const themes = room.zone.themes || room.themes || {}, name = room.mission?.theme || r.themeName || 'day';
    return { id: r.id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h, theme: { id: name, ...(themes[name] || {}) } };
  });
  const worldMsg = (room) => ({
    t: 'world', reach: REACH,
    zone: { id: room.zone.id, name: room.zone.name, w: room.zone.w, h: room.zone.h, rows: room.zone.rows, places: room.zone.places, landmarks: room.zone.landmarks, art: KIND_ART,
      tiles: customTiles(room.zone.tiles || {}), theme: themeOf(room), regions: regionsOf(room) },
  });
  const stateMsg = (room) => ({ t: 'state', p: room.players.map((p) => [p.id, Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, p.dir, p.moving ? 1 : 0, p.stun > 0 ? 1 : 0]) });
  const thingsMsg = (room) => ({ t: 'things', list: publicThings(room.things) });

  // The shared goal, as its type (server/goals/) counts it: { label, have, need, ready?, bringTo?, done }.
  function progress(room) {
    const goal = room.mission?.goal;
    if (!goal || !room.goalState) return null;
    return { label: goal.label, ...goalOf(goal).progress(room, goal) };
  }

  // Something on the map changed: new walls, new picture, maybe new progress. Reaching the goal ends the mission.
  function changed(room) {
    room.block = blockSet(room.things);
    broadcast(room, thingsMsg(room));
    if (room.phase === 'play' && progress(room)?.done) return endMission(room, true);
    sendRoster(room);
    sendQueue(room);
  }

  // The teacher's list: every station with its card, answers, code and hints; who is talking to an NPC; the numbers.
  function sendQueue(room) {
    if (!room.teachers.size) return;
    const msg = JSON.stringify({
      t: 'queue', room: room.code, phase: room.phase, stats: room.stats, found: room.found.size, seed: room.seed ?? null,
      stations: room.things.filter((t) => kindOf(t).card && t.card).map((t) => {
        const card = t.inner || t.card, name = (id) => room.players.find((p) => p.id === id)?.name || null;
        return {
          o: t.id, name: t.name, st: t.st, wrong: t.wrong, by: t.by, byId: t.byId, hints: t.hints,
          waiting: t.st === 'open' && teacherCard(card).mode === 'code' && (!t.courier || t.delivered), card: teacherCard(card),
          courier: t.card.type === 'courier' ? { started: !!t.courier, delivered: !!t.delivered, carrier: name(t.courier?.carrier), to: name(t.courier?.to), place: room.zone.places.find((p) => p.id === (t.courier?.place || t.card.meetAt))?.name || null } : null,
          link: t.card.type === 'link' ? { url: t.card.link, helper: t.card.helper, sent: t.linkSent || null, who: name(t.linkHelper) } : null,
        };
      }),
      messages: chat.forTeacher(room),
      talks: room.talks, zone: room.zone.id, gateName: room.things.find((t) => t.def.code)?.name || null, gateCode: room.things.some((t) => t.def.code) ? room.gateCode.slice(0, room.things.find((t) => t.def.code).def.code) : null,
      npcs: room.things.filter((t) => kindOf(t).character).map((t) => ({ o: t.id, name: t.name, lines: t.def.lines || [] })),
      things: room.things.filter(canForce).map((t) => ({ o: t.id, name: t.name, kind: t.kind, st: t.st })),
    });
    for (const ws of room.teachers) if (ws.readyState === 1) ws.send(msg);
  }

  // Shares the 12 abilities among the players in the room. Called at the start, when the
  // number of players changes, and when the teacher reshuffles (mix = true: must change).
  function deal(room, mix = false) {
    const n = room.players.length, before = JSON.stringify(room.players.map((p) => p.abilities));
    // Only a way of sharing that lets the team finish the mission is accepted (see solver.js).
    const playable = (s) => !room.mission || n < 2 || !whyNot(room.zone, room.mission, s);
    let sets;
    for (let tries = 0; tries < 40; tries++) {
      sets = room.dealMode === 'random' ? dealRandom(abilities, n) : dealPreset(abilities, n, mix);
      if ((!mix || JSON.stringify(sets) !== before) && playable(sets)) break;
      sets = null;
    }
    if (!sets) sets = dealPreset(abilities, n);                   // the plain preset is the safe choice
    room.players.forEach((p, i) => { p.abilities = sets[i] || []; });
    room.deal++;
    chat.fixCouriers(room);                                       // a letter always stays with a player who has Give
  }

  function toSpawn(room, p) {
    const s = room.zone.spawns[p.ci % room.zone.spawns.length];
    Object.assign(p, { x: s.x, y: s.y, dir: 0, moving: false, ix: 0, iy: 0 });
  }

  // ---------- missions ----------
  // Gives a card to every tablet nobody has opened yet (mission start, or the level changed).
  async function drawCards(room) {
    // A pack's own cards are only for its own missions; the library's cards are for every mission.
    const all = (await cards.all()).filter((c) => !c.pack || c.pack === room.zone.pack), used = new Set(room.things.filter((t) => t.card && t.st !== 'new').map((t) => t.card.id)), drawn = [];
    for (const t of room.things.filter((x) => kindOf(x).card && x.st === 'new')) {
      const entry = room.mission.stations.find((s) => s.at === t.id);
      t.card = pickCard(all, entry?.card ? { id: entry.card } : entry?.filter, room.group.level, used);
      t.inner = null;
      if (t.card) { used.add(t.card.id); drawn.push(t.card); }
      // A courier's letter holds a second card, for the player who receives it.
      if (t.card?.type === 'courier') {
        t.inner = innerCard(all, t.card, room.group.level, used);
        if (t.inner) used.add(t.inner.id); else t.card = null;
      }
      if (t.card) continue;
      t.st = 'solved'; t.holds = t.def.reward?.item || null;
      console.warn(`No card fits tablet "${t.id}": it starts solved.`);
    }
    return drawn;
  }

  async function startMission(room, mission, ws) {
    if (!room.group) return fail(ws, 'no-group', 'Choose a group first (on the host screen).');
    if (room.players.length < 2) return fail(ws, 'few-players', `The game needs 2 to ${cfg.roomSize} players.`);
    // Never start a mission that cannot be finished: say why instead.
    const base = zoneFor(mission, zones), n = room.players.length, sets = dealPreset(abilities, n);   // the map as this mission changes it
    const written = makeRun(base, mission, 0);                         // the layout as written
    const stuck = whyNot(written.zone, written.mission, sets);
    if (stuck) return fail(ws, 'bad', `This mission cannot be finished with ${n} players. ${stuck}.`);
    // A new run each time (run.js): objects in slots, shuffles, the goal's random parts. Only a run this team can
    // finish is used; after RUN_TRIES seeds, the layout as written. A mission with a "seed" always plays that run.
    let run = written;
    if (mission.seed != null) { const r = makeRun(base, mission, mission.seed); if (!whyNot(r.zone, r.mission, sets)) run = r; }
    else if (isRandom(base, mission)) {
      for (let tries = 0; tries < RUN_TRIES; tries++) {
        const r = makeRun(base, mission, 1 + crypto.randomInt(2 ** 31 - 2));
        if (!whyNot(r.zone, r.mission, sets)) { run = r; break; }
      }
    }
    room.mission = run.mission;
    room.seed = run.seed;
    room.themes = base.themes;
    room.missionRun++;
    room.zone = run.zone;
    room.gateCode = Array.from({ length: 6 }, () => 1 + crypto.randomInt(9)).join('');
    room.players.forEach((p) => { toSpawn(room, p); p.notes = []; p.items = []; });
    room.found.clear();
    room.talks = [];
    room.messages = [];
    room.stats = { solved: 0, wrong: 0, hints: 0, acts: 0, stuns: 0, slays: 0 };
    room.clock = 0; room.paused = false; room.result = null; room.timeUp = false;
    room.things = buildThings(room.zone, mission.stations.map((s) => s.at));
    room.goalState = goalOf(room.mission.goal).start(room, room.mission.goal);
    const drawn = await drawCards(room);
    cards.touch(drawn).catch(console.error);
    room.block = blockSet(room.things);
    room.phase = 'play';
    deal(room);
    // The monster uses the group's setting unless the mission names one. The three roles move on by one player each mission.
    room.roleTurn++;
    monster.start(room, mission.monster === 'group-setting' ? room.group.monster : mission.monster);
    // A class session is counted once, however many missions it plays. A match is not saved to the group.
    if (!room.match) {
      const saved = await groups.recordSession(room.group.id, room.counted ? null : room.players.map((p) => p.name));
      room.counted = true;
      if (saved) room.group.island = saved.island;
    }
    broadcast(room, worldMsg(room));
    broadcast(room, thingsMsg(room));
    sendRoster(room);
    chat.pushInboxes(room);
    // A note for the teacher if, with this mission, some player has no ability the team needs.
    const idle = inspect(room.zone, room.mission, room.players.map((p) => p.abilities), abilities.ids).idle;
    if (idle.length) for (const t of room.teachers) send(t, { t: 'error', code: 'note', msg: `Note: in this mission ${idle.map((i) => room.players[i].name).join(' and ')} ${idle.length > 1 ? 'have' : 'has'} no ability the team must use. Reshuffle, or add tablets.` });
  }

  // The mission is over: the goal was reached, or the teacher ended it. Stars and the
  // restored landmark are saved to the group. Nobody is ranked; the numbers are the team's.
  async function endMission(room, completed) {
    if (room.phase !== 'play') return;
    room.phase = 'done';
    const m = room.mission, s = room.stats, seconds = Math.round(room.clock);
    const stars = completed ? 1 + (seconds <= m.minutes * 60 ? 1 : 0) + (s.hints <= 1 ? 1 : 0) : 0;
    // What the mission restores on the island: the landmark it names, or the next one still in ruins.
    const done = room.group.island.landmarks, marks = room.zone.landmarks;
    const mark = !completed ? null : marks.find((l) => l.id === m.goal.restore && !done.includes(l.id)) || marks.find((l) => !done.includes(l.id)) || null;
    room.result = { completed, timeUp: !completed && !!room.timeUp, title: m.title, restore: mark ? mark.name : null, restoreId: mark ? mark.id : null, stars, seconds, solved: s.solved, hints: s.hints, acts: s.acts, clues: room.found.size, monster: !!room.mon, slays: s.slays, stuns: s.stuns };
    // Enough landmarks open the next zone.
    const count = done.length + (mark ? 1 : 0);
    const opened = Object.values(zones).filter((z) => !room.group.island.zones.includes(z.id) && count >= z.unlock);
    room.result.opened = opened.map((z) => z.name);
    if (room.match) { M.finished(room, completed); sendRoster(room); return sendQueue(room); }   // a match keeps its own score, not the group's island
    sendRoster(room);
    const saved = await groups.recordMission(room.group.id, { missionId: m.id, restore: mark?.id, stars, completed, zones: opened.map((z) => z.id) }).catch(console.error);
    if (saved) { room.group.island = saved.island; sendRoster(room); }
    sendQueue(room);
  }

  // ---------- players' buttons ----------
  function onAct(room, p, m) {
    if (room.phase !== 'play') return;
    if (room.paused) return send(p.ws, { t: 'nope', msg: 'The game is paused.' });
    if (p.stun > 0) return send(p.ws, { t: 'nope', msg: 'You are stunned! Call the Healer.' });
    const now = Date.now();
    if (now - p.actAt < ACT_GAP_MS) return;
    p.actAt = now;
    const ability = Object.hasOwn(abilities.byId, m.a) ? abilities.byId[m.a] : null;
    if (!ability) return;
    if (!p.abilities.includes(ability.id)) return send(p.ws, { t: 'nope', msg: `You can't ${ability.name}. Ask your team!` });
    const r = useAbility(room, p, ability, items, m);
    if (r.nope) return send(p.ws, { t: 'nope', msg: r.nope });
    room.stats.acts++;
    monster.event(room, 'act');
    broadcast(room, { t: 'fx', by: p.id, a: ability.id });        // everyone sees that it was used, never what it showed
    if (r.clue) {
      if (!p.notes.some((n) => n.key === r.clue.key)) p.notes.push(r.clue);
      send(p.ws, { t: 'clue', ...r.clue });                       // the text goes to this phone only
      if (!room.found.has(r.clue.key)) { room.found.add(r.clue.key); monster.event(room, 'clue'); sendRoster(room); }
      // Talking to a character: the teacher sees it and can answer as that character.
      const t = room.things.find((x) => x.id === r.clue.o);
      // The goal may care (bringing the items to their character...).
      if (goalAct(room, p, t, ability.id)) return;
      if (kindOf(t).character && ability.id === 'talk') {
        room.talks = room.talks.filter((k) => !(k.p === p.id && k.o === t.id));
        room.talks.push({ id: `k${++room.seq}`, p: p.id, who: p.name, o: t.id, npc: t.name });
      }
      sendQueue(room);
    } else if (r.card) {
      const t = r.card;
      if (t.st === 'new') { t.st = 'open'; t.by = p.name; t.byId = p.id; }
      if (t.card.type === 'courier' && !t.delivered) {
        // A letter: it must travel from one player to another before anybody can answer.
        const c = chat.startCourier(room, t, p);
        const name = (id) => room.players.find((q) => q.id === id)?.name;
        if (c) send(p.ws, { t: 'say', msg: c.to === p.id ? `A letter for you! ${name(c.carrier)} must bring it. Ask where to meet.` : c.carrier === p.id ? `A letter! Bring it to ${name(c.to)}. Open Mail.` : `A letter! ${name(c.carrier)} must bring it to ${name(c.to)}.` });
      } else if (t.answerer && t.answerer !== p.id) {
        send(p.ws, { t: 'nope', msg: `This challenge is in ${room.players.find((q) => q.id === t.answerer)?.name || 'a teammate'}'s letter.` });
      } else sendCard(room, t, p);
      changed(room);
    } else if (r.keypad) {
      send(p.ws, { t: 'keypad', o: r.keypad.id, name: r.keypad.name, digits: r.keypad.def.code });
    } else if (r.deliver) {
      // The letter was handed over at the meeting place.
      delivered(room, r.deliver, chat.deliver(room, r.deliver), p);
    } else if (r.changed) {
      if (r.say) send(p.ws, { t: 'say', msg: r.say });
      if (r.tell) send(r.tell[0].ws, { t: 'say', msg: r.tell[1] });
      if (r.thing && goalAct(room, p, r.thing, ability.id)) return;
      changed(room);
    }
  }
  // The goal's reaction to an ability used on thing t. Returns true if the mission ended.
  function goalAct(room, p, t, ability) {
    const out = goalOf(room.mission.goal).afterAct?.(room, p, t, ability, gameCtx(room, items, p));
    if (!out) return false;
    if (out.npc) send(p.ws, { t: 'npc', ...out.npc });
    if (out.say) send(p.ws, { t: 'say', msg: out.say });
    if (out.changed) changed(room);
    return room.phase !== 'play';
  }

  // Shows a tablet's card on one phone. For a link card, the link itself goes to a helper.
  function sendCard(room, t, p) {
    const card = t.inner || t.card;
    let note = '';
    if (t.card.type === 'link') {
      const helper = chat.linkOpened(room, t, p);
      const role = t.card.helper === 'listening' ? 'Listening' : 'Reading';
      note = helper ? `${helper.name} is the ${role} Helper and has ${t.card.link ? 'the link' : 'what the teacher sends'}. Ask: "Can you ${t.card.helper === 'listening' ? 'listen to this' : 'read this'} with me, please?"` : '';
    }
    send(p.ws, { t: 'card', o: t.id, name: t.name, card: { ...publicCard(card), note }, wrong: t.wrong, hints: card.hints.slice(0, t.hints) });
  }
  // A letter arrived: the receiver sees the card inside. `from` handed it over (nobody, if the teacher delivered it).
  function delivered(room, t, to, from) {
    if (from) send(from.ws, { t: 'say', msg: `You gave the letter to ${to.name}.` });
    sendCard(room, t, to);
    changed(room);
  }

  // A tablet is solved (right answer, or the teacher's rescue button): its reward appears.
  function solveStation(room, t) {
    completeAction(room, t, items, 'card');                      // its kind's rule: solved, the reward appears, a gate opens
    room.stats.solved++;
    monster.event(room, 'solved');
    for (const p of room.players) p.items = p.items.filter((it) => it.courier !== t.id);   // a letter still on its way is not needed now
    let reward = '';
    if (t.holds) reward = `A ${(items.byId[t.holds]?.name || t.holds).toLowerCase()} appeared! Somebody must pick it up.`;
    const opened = t.def.reward?.open && room.things.find((x) => x.id === t.def.reward.open);
    if (opened) reward = `The ${opened.name.toLowerCase()} is open!`;
    return reward;
  }

  // A player answers the card of a station. Wrong answers never lock anything.
  function onAnswer(room, p, m) {
    if (room.phase !== 'play') return;
    // A gate with a code: the digits are in clues around the island.
    const gate = room.things.find((x) => x.id === m.o && x.def.code && waitingAbility(x, 'code'));
    if (gate) {
      if (!p.abilities.includes(waitingAbility(gate, 'code')) || p.stun > 0 || room.paused) return;
      const now = Date.now();
      if (now - p.answerAt < ANSWER_GAP_MS) return send(p.ws, { t: 'result', o: gate.id, ok: false, msg: 'Wait a moment, then try again.' });
      p.answerAt = now;
      if (String(m.value ?? '').replace(/\D/g, '') !== room.gateCode.slice(0, gate.def.code)) {
        monster.event(room, 'wrongAnswer');
        return send(p.ws, { t: 'result', o: gate.id, ok: false, msg: 'That is not the code. Find all its numbers: ask your team what they found.' });
      }
      completeAction(room, gate, items, 'code');
      send(p.ws, { t: 'result', o: gate.id, ok: true, msg: 'Unlocked! Now somebody can open it.' });
      return changed(room);
    }
    const t = room.things.find((x) => x.id === m.o && kindOf(x).card);
    if (!t || !t.card || t.st !== 'open') return;
    if (room.paused) return send(p.ws, { t: 'result', o: t.id, ok: false, msg: 'The game is paused.' });
    if (p.stun > 0) return send(p.ws, { t: 'result', o: t.id, ok: false, msg: 'You are stunned! Call the Healer.' });
    if (t.card.type === 'courier' && !t.delivered) return;        // the letter has not arrived yet
    // A delivered letter can only be answered by its receiver; other cards by whoever can open the tablet.
    if (t.answerer ? t.answerer !== p.id : !p.abilities.includes(t.def.by || 'use')) return send(p.ws, { t: 'nope', msg: 'This is not your challenge.' });
    const now = Date.now();
    if (now - p.answerAt < ANSWER_GAP_MS) return send(p.ws, { t: 'result', o: t.id, ok: false, msg: 'Wait a moment, then try again.' });
    p.answerAt = now;
    const card = t.inner || t.card;
    if (!checkAnswer(card, m.value)) {
      t.wrong++; room.stats.wrong++;
      monster.event(room, 'wrongAnswer');                         // wrong answers make the monster angrier, nothing more
      send(p.ws, { t: 'result', o: t.id, ok: false, msg: teacherCard(card).mode === 'code' ? 'That is not the code. Ask the teacher again.' : 'Not yet. Talk with your team and try again.' });
      return sendQueue(room);
    }
    const reward = solveStation(room, t);
    send(p.ws, { t: 'result', o: t.id, ok: true, msg: reward, explanation: card.explanation });
    changed(room);
  }

  async function qrOf(room) {
    const joinUrl = `${net.base}/phone/?room=${room.code}`;
    if (!room.qr || room.qr.url !== joinUrl) room.qr = { url: joinUrl, img: await QRCode.toDataURL(joinUrl, { margin: 1, scale: 8 }) };
    return room.qr;
  }
  async function sendRoomInfo(room, ws) {
    const { url: joinUrl, img } = await qrOf(room);
    const msg = { t: 'room', code: room.code, hostKey: room.hostKey, joinUrl, qr: img, network: { ok: net.ok, urls: net.urls }, hosted: config.hosted, abilities: abilities.list, items: items.list, compete: { maxRooms: cfg.maxRooms } };
    for (const h of ws ? [ws] : room.hosts) send(h, msg);
  }

  function kick(room, id) {
    const i = room.players.findIndex((p) => p.id === id);
    if (i < 0) return;
    const [p] = room.players.splice(i, 1);
    if (p.ws) { p.ws.ctx = {}; send(p.ws, { t: 'kicked' }); p.ws.close(); }
    room.talks = room.talks.filter((k) => k.p !== p.id);
    for (const m of room.messages) { m.to = m.to.filter((x) => x !== p.id); m.shared = m.shared.filter((x) => x !== p.id); }
    room.messages = room.messages.filter((m) => m.to.length);
    for (const role of Object.keys(room.helpers)) if (room.helpers[role] === p.id) room.helpers[role] = null;
    // A letter's challenge that only this player could answer goes back to everybody who can open the tablet.
    for (const t of room.things) if (t.answerer === p.id) t.answerer = null;
    monster.fixRoles(room);
    if (room.phase === 'play') {
      returnItems(room, p);                                       // what they carried goes back where it was found
      deal(room);                                                 // the others share that player's abilities
      return changed(room);
    }
    sendRoster(room);
  }

  // ---------- messages from the host screen ----------
  const fromHost = {
    async group(room, m) {
      const g = await groups.get(String(m.id || ''));
      if (!g) return;
      // Zones this group has earned (also for groups saved before a zone existed).
      for (const z of Object.values(zones)) if (!g.island.zones.includes(z.id) && g.island.landmarks.length >= z.unlock) g.island.zones.push(z.id);
      room.group = { id: g.id, name: g.name, level: g.settings.level, monster: g.settings.monster, island: g.island, notes: g.notes };
      room.counted = false;
      sendRoster(room);
    },
    // The Start button: a mission made on the spot for the group's level.
    async start(room, m, ws) {
      if (!room.group) return fail(ws, 'no-group', 'Choose a group first.');
      // In one of the zones this group has opened, chosen at random.
      const open = Object.values(zones).filter((z) => room.group.island.zones.includes(z.id) && z.spawns.length);   // a map players can start on
      const zone = open[Math.floor(Math.random() * open.length)] || Object.values(zones)[0];
      await startMission(room, missions.quick(zone, await cards.all(), room.group.level), ws);
    },
    lobby(room) { room.phase = 'lobby'; room.paused = false; sendRoster(room); sendQueue(room); },
    shuffle(room, m) {
      if (room.phase !== 'play') return;
      room.dealMode = m.mode === 'random' ? 'random' : 'preset';
      deal(room, true);
      sendRoster(room);
    },
    kick(room, m) { kick(room, m.id); },
  };

  // Everything the teacher panel can do. The host screen's buttons work from there too.
  const chat = createChat({ send, sendQueue, sendRoster });
  const monster = createMonster({ cfg: monsterCfg, send, broadcast, sendRoster, changed });
  const M = createMatches({
    cfg, now, send, fail, zones, missions, cards, groups, progress, sendRoster, startMission, endMission, kick, qrOf, newRoom, newCode,
    lobby: (room) => fromHost.lobby(room),
    dropRoom: (room) => rooms.delete(room.code),
    network: () => ({ ok: net.ok, urls: net.urls }),
  });
  const fromTeacher = createTeacherCommands({
    send, fail, broadcast, sendRoster, sendQueue, changed, deal, kick, toSpawn, drawCards, startMission, endMission, solveStation, chat, delivered, monster,
    fromHost, thingsMsg, items, abilities, groups, missions, cards, zones,
  });

  const playState = (room, ws) => {
    if (room.phase === 'lobby') { if (ws.ctx.role !== 'player') send(ws, worldMsg(room)); return; }   // the host shows the island in the lobby
    send(ws, worldMsg(room)); send(ws, thingsMsg(room)); send(ws, stateMsg(room));
  };

  // A screen leaves the room or match it was showing (it is about to show another one, or it closed).
  function detach(ws) {
    const { role, room, match } = ws.ctx;
    if (role === 'host') { room?.hosts.delete(ws); match?.hosts.delete(ws); }
    if (role === 'teacher') { room?.teachers.delete(ws); match?.teachers.delete(ws); }
  }

  async function onHostHello(ws, m) {
    if (!isTeacher(config, ws.req, m.pin)) return fail(ws, 'pin', 'Teacher PIN needed.');
    detach(ws);
    // A reloaded host page of a match goes back to its match. The host screen never joins a team room:
    // every team can see it, so it shows only join codes and the scoreboard, never a map.
    const match = M.matches.get(String(m.match || ''));
    if (match && match.key === m.matchKey) { ws.ctx = { role: 'host', match }; return M.attachHost(match, ws); }
    let room = rooms.get(String(m.room || ''));
    if (!room || room.hostKey !== m.hostKey) room = newRoom();     // the host page reloads into the same room
    room.hosts.add(ws);
    ws.ctx = { role: 'host', room };
    await sendRoomInfo(room, ws);
    sendRoster(room);
    playState(room, ws);
  }

  // The teacher panel watches and steers a room. In a match it also sees every team, and watches one team's room
  // at a time (m.room, or the first team): switching team is a new hello.
  function onTeacherHello(ws, m) {
    if (!isTeacher(config, ws.req, m.pin)) return fail(ws, 'pin', 'Teacher PIN needed.');
    const code = String(m.room || '').toUpperCase().trim();
    let room = rooms.get(code);
    const match = M.matches.get(String(m.match || '').toUpperCase().trim()) || M.matches.get(code) || room?.match || null;
    if (match && room?.match !== match) room = match.rooms[0];
    if (!room) return fail(ws, 'no-room', 'Room not found. Check the code on the host screen.');
    detach(ws);
    room.teachers.add(ws);
    ws.ctx = { role: 'teacher', room, match };
    send(ws, { t: 'watching', room: room.code, match: match?.id || null, team: room.team, abilities: abilities.list, items: items.list });
    if (match) M.attachTeacher(match, ws);
    sendRoster(room);
    playState(room, ws);
    sendQueue(room);
    monster.sendMon(room);
  }

  function onJoin(ws, m) {
    const room = rooms.get(String(m.room || '').toUpperCase().trim());
    if (!room) return fail(ws, 'no-room', 'Room not found. Check the code on the big screen.');
    // A phone that reconnects sends its token and gets its character back.
    let p = typeof m.token === 'string' && room.players.find((q) => q.token === m.token);
    if (!p) {
      if (room.players.length >= cfg.roomSize) return fail(ws, 'full', `This room is full (${cfg.roomSize} players).`);
      let name = cleanName(m.name);
      if (!name) return fail(ws, 'name', 'Please type your name.');
      for (let n = 2; room.players.some((q) => q.name.toLowerCase() === name.toLowerCase()); n++) name = `${cleanName(m.name).slice(0, 10)} ${n}`;
      let ci = 0;
      while (room.players.some((q) => q.ci === ci)) ci++;          // first free color
      p = { id: `p${++room.seq}`, token: crypto.randomBytes(12).toString('hex'), name, ci, hero: cleanHero(m.hero), ws: null, abilities: [], notes: [], items: [], actAt: 0, answerAt: 0, stun: 0, lost: null, slayAt: 0 };
      toSpawn(room, p);
      room.players.push(p);
      if (room.phase === 'play') deal(room);                      // a late player gets a share
    }
    if (p.ws && p.ws !== ws) { p.ws.ctx = {}; p.ws.close(4000, 'replaced'); }
    p.ws = ws;
    ws.ctx = { role: 'player', room, player: p };
    send(ws, { t: 'joined', id: p.id, token: p.token, name: p.name, ci: p.ci, hero: p.hero, room: room.code, abilities: abilities.list, items: items.list });
    send(ws, { t: 'notes', list: p.notes });                      // clues this player already found
    send(ws, { t: 'inbox', list: chat.inboxOf(room, p) });        // and their mail
    sendRoster(room);                                             // in a match, it holds the team, its charge and any effect still running
    if (room.match) M.sendBoard(room.match, ws);
    playState(room, ws);
  }

  function connection(ws, req) {
    ws.req = req; ws.ctx = {}; ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', async (data) => {
      if (data.length > 16384) return;
      let m;
      try { m = JSON.parse(data.toString()); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      try {
        const { role, room, player, match } = ws.ctx;
        if (room) room.touched = Date.now();
        if (m.t === 'host') await onHostHello(ws, m);
        else if (m.t === 'teacher') onTeacherHello(ws, m);
        else if (m.t === 'join') onJoin(ws, m);
        else if (role === 'player' && m.t === 'input') { player.ix = num(m.x); player.iy = num(m.y); }
        else if (role === 'player' && m.t === 'act') onAct(room, player, m);
        else if (role === 'player' && m.t === 'answer') onAnswer(room, player, m);
        else if (role === 'player' && m.t === 'share') chat.share(room, player, m);
        else if (role === 'player' && m.t === 'power') monster.power(room, player, m.k);
        else if (role === 'player' && m.t === 'sabotage:send') M.sabotage(room, player, m);
        else if (role === 'host' && m.t === 'match:create') {
          const made = M.create(m.teams, room?.group);
          detach(ws);
          ws.ctx = { role: 'host', match: made };
          M.attachHost(made, ws);
        }
        else if ((role === 'host' || role === 'teacher') && match && Object.hasOwn(M.commands, m.t)) await M.commands[m.t](match, m, ws);
        else if (role === 'player' && m.t === 'hero') {
          // Changing character mid-mission would confuse the team, so only in the lobby or after a mission.
          if (room.phase !== 'play') { player.hero = cleanHero(m.id); sendRoster(room); }
        }
        else if (role === 'player' && m.t === 'open') {
          // Reopen the challenge that came in a letter (from Mail).
          const t = room.things.find((x) => x.id === m.o && x.answerer === player.id && x.st === 'open');
          if (t && room.phase === 'play') sendCard(room, t, player);
        }
        else if (role === 'host' && room && Object.hasOwn(fromHost, m.t)) await fromHost[m.t](room, m, ws);
        else if (role === 'teacher' && m.t === 'cmd' && Object.hasOwn(fromTeacher, m.c)) await fromTeacher[m.c](room, m, ws);
      } catch (e) {
        if (e.status) fail(ws, 'bad', e.message); else console.error(e);
      }
    });
    ws.on('close', () => {
      const { role, room, player } = ws.ctx;
      detach(ws);
      if (role === 'player' && player.ws === ws) { player.ws = null; player.ix = player.iy = 0; player.moving = false; sendRoster(room); }
    });
    ws.on('error', () => {});
  }

  // ---------- timers ----------
  let last = Date.now();
  const tick = setInterval(() => {
    const t = Date.now(), dt = Math.min(0.2, (t - last) / 1000);
    last = t;
    M.tick(dt * 1000);                                            // sabotage effects end on the server's clock
    for (const room of rooms.values()) {
      if (room.phase !== 'play' || room.paused) continue;
      room.clock += dt;
      // A time limit (some missions have one): when the time is up, the mission ends, not finished.
      if (room.mission?.timeLimit && room.clock >= room.mission.timeLimit * 60) { room.timeUp = true; endMission(room, false); continue; }
      for (const p of room.players) { if (p.stun > 0) p.moving = false; else stepPlayer(room.zone, p, dt, room.block); }
      if (pressPlates(room, { tell: (p, msg) => send(p.ws, { t: 'say', msg }) })) changed(room);   // plates, exits (kinds with a tick)
      if (room.mission && goalOf(room.mission.goal).tick?.(room, dt, { ...gameCtx(room, items), tell: (p, msg) => send(p.ws, { t: 'say', msg }) })) changed(room);
      monster.tick(room, dt);
      broadcast(room, stateMsg(room));
    }
  }, TICK_MS);

  // Every few seconds: drop dead connections, notice a network change (new QR), forget old rooms.
  const slow = setInterval(() => {
    for (const room of rooms.values()) {
      for (const ws of everyone(room)) {
        if (!ws) continue;
        if (!ws.alive) { ws.terminate(); continue; }
        ws.alive = false; ws.ping();
      }
      const busy = room.hosts.size || room.teachers.size || room.players.some((p) => p.ws) || room.match?.hosts.size || room.match?.teachers.size;
      if (busy) room.touched = Date.now();
      else if (Date.now() - room.touched > ROOM_IDLE_MS) rooms.delete(room.code);
    }
    const current = network.current();
    if (current.base !== net.base || current.ok !== net.ok) {
      net = current;
      for (const room of rooms.values()) sendRoomInfo(room).catch(console.error);
    }
    M.slow((room) => rooms.has(room.code));
  }, 5000);

  // For the printable sheet of a running mission (sheet.js).
  const sheetData = (code) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || !room.mission) return null;
    return {
      room, stations: room.things.filter((t) => kindOf(t).card && t.card).map((t) => ({ name: t.name, card: teacherCard(t.inner || t.card), courier: t.card.type === 'courier' ? room.zone.places.find((pl) => pl.id === t.card.meetAt)?.name || 'anywhere' : null, reward: t.def.reward?.item || null })),
    };
  };

  // The scenario packs were reloaded. Rooms in the lobby show the new version of their map; running missions keep theirs.
  function contentChanged() {
    for (const room of rooms.values()) {
      if (room.phase !== 'lobby') continue;
      room.zone = zones[room.zone.id] || Object.values(zones)[0];
      broadcast(room, worldMsg(room));
    }
  }

  return {
    connection, rooms, sheetData, matches: M.matches, compete: cfg, contentChanged,
    close() { clearInterval(tick); clearInterval(slow); },
  };
}
