// The hidden monster, and the three special roles that deal with it.
//
//   Seer    the only phone that shows the monster (and the warning before a shot)
//   Healer  wakes up stunned teammates, standing next to them
//   Slayer  hits the monster with a charged power, standing near it (it is invisible to the Slayer)
//
// The teacher can hold any of the roles ("teacher"): students then have to ask the teacher.
//
// The monster floats over everything. Its anger (0 to 100) decides what it does:
//   wander  slow and harmless-looking
//   chase   goes for the nearest player; a touch stuns
//   shoot   stops, then fires along a whole row or column. Only the Seer sees the warning.
// A stunned player cannot move or act until the Healer comes, or the stun runs out.
// Nothing here can end the game, and nothing touches the saved island.
//
// The numbers are in data/monster.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { solidAt } from './world.js';
import { returnItems } from './things.js';

export const ROLES = ['seer', 'healer', 'slayer'];
const ROLE_NAME = { seer: 'Seer', healer: 'Healer', slayer: 'Slayer' };
const PHASES = ['wander', 'chase', 'shoot'];
const SEND_EVERY = 0.1;            // the Seer's phone gets the monster 10 times a second
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function loadMonster(contentDir) {
  const cfg = JSON.parse(await fs.readFile(path.join(contentDir, 'monster.json'), 'utf8'));
  for (const [name, l] of Object.entries(cfg.levels)) {
    for (const k of ['shotEvery', 'warn', 'stun', 'angerPerMinute', 'hits', 'away']) if (!(l[k] > 0)) throw new Error(`monster.json, level "${name}": "${k}" must be a number above 0`);
    for (const k of PHASES) if (!(l.speed?.[k] > 0)) throw new Error(`monster.json, level "${name}": speed.${k} must be a number above 0`);
  }
  return cfg;
}

export function createMonster({ cfg, send, broadcast, sendRoster, changed }) {
  const byId = (room, id) => room.players.find((p) => p.id === id);
  const holder = (room, role) => (room.roles[role] === 'teacher' ? null : byId(room, room.roles[role]));
  const awake = (room) => room.players.filter((p) => !(p.stun > 0));
  const say = (p, msg) => send(p.ws, { t: 'say', msg });

  // A walkable tile far from every player.
  function farSpot(room) {
    let best = null, bestD = -1;
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(Math.random() * room.zone.w), y = Math.floor(Math.random() * room.zone.h);
      if (solidAt(room.zone, x + 0.5, y + 0.5)) continue;
      const d = Math.min(...room.players.map((p) => Math.hypot(p.x - x, p.y - y)), 99);
      if (d > bestD) { best = { x: x + 0.5, y: y + 0.5 }; bestD = d; }
    }
    return best || { x: room.zone.w / 2, y: room.zone.h / 2 };
  }
  const landSpot = (room) => {
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(Math.random() * room.zone.w), y = Math.floor(Math.random() * room.zone.h);
      if (!solidAt(room.zone, x + 0.5, y + 0.5)) return { x: x + 0.5, y: y + 0.5 };
    }
    return { x: room.zone.w / 2, y: room.zone.h / 2 };
  };

  // ---------- roles ----------
  // Shares Seer, Healer and Slayer among the students: three different players when there are
  // three or more; with two, one of them is Seer and Healer. `turn` rotates who gets what.
  // Roles the teacher holds stay with the teacher.
  function assignRoles(room) {
    const list = room.players, n = list.length;
    const at = (i) => list[(room.roleTurn + i) % n]?.id || null;
    const want = n >= 3 ? { seer: at(0), healer: at(1), slayer: at(2) } : { seer: at(0), healer: at(0), slayer: at(1) };
    for (const r of ROLES) if (room.roles[r] !== 'teacher') room.roles[r] = n ? want[r] : null;
  }
  function tellRoles(room) {
    for (const p of room.players) {
      const mine = ROLES.filter((r) => room.roles[r] === p.id);
      if (mine.length) say(p, `You are the ${mine.map((r) => ROLE_NAME[r]).join(' and the ')}!`);
    }
  }
  // A player left: their roles go to somebody else.
  function fixRoles(room) {
    if (ROLES.some((r) => room.roles[r] && room.roles[r] !== 'teacher' && !byId(room, room.roles[r]))) assignRoles(room);
  }

  // ---------- life cycle ----------
  // level: "off", or a level name from monster.json.
  function start(room, level) {
    for (const p of room.players) { p.stun = 0; p.lost = null; p.slayAt = 0; }
    room.rotateClock = 0;
    assignRoles(room);
    if (!cfg.levels[level]) { room.mon = null; return; }
    room.mon = { level, c: cfg.levels[level], on: true, anger: 0, phase: 'wander', forced: null, frozen: false, speedMul: 1, hp: cfg.levels[level].hits, away: 0, shotIn: cfg.levels[level].shotEvery, warn: null, touchWait: 3, retreat: 0, idle: 0, sendIn: 0, ...farSpot(room), goal: landSpot(room) };
  }
  function setLevel(room, level) {
    if (!cfg.levels[level]) { room.mon = null; for (const p of room.players) wake(room, p, false); return; }
    if (!room.mon) return start(room, level);
    Object.assign(room.mon, { level, c: cfg.levels[level], hp: Math.min(room.mon.hp, cfg.levels[level].hits) });
  }

  // ---------- stun and heal ----------
  function stun(room, p, mayDrop) {
    const m = room.mon;
    if (p.stun > 0) return;
    p.stun = m.c.stun; p.ix = p.iy = 0; p.moving = false;
    room.stats.stuns++;
    const healer = room.roles.healer === 'teacher' ? 'the teacher' : holder(room, 'healer')?.name;
    let msg = healer && room.roles.healer !== p.id ? `Stunned! Call ${healer}: "Can you heal me, please?"` : 'Stunned! Wait a moment.';
    // Stronger settings: the hit can knock an item out of the player's hands. The Healer can still save it.
    const loose = p.items.filter((it) => !it.courier && it.from);
    if (mayDrop && loose.length && Math.random() < m.c.setback) {
      p.lost = pick(loose);
      p.items = p.items.filter((it) => it !== p.lost);
      msg = `Stunned, and you dropped something! ${healer ? `Call ${healer} quickly to save it.` : ''}`;
      changed(room);
    }
    say(p, msg);
  }
  // healed = true: the Healer came in time, so a dropped item is saved.
  function wake(room, p, healed) {
    p.stun = 0;
    if (p.lost) {
      if (healed) { p.items.push(p.lost); say(p, 'Healed! You have your item back.'); }
      else { returnItems(room, { items: [p.lost] }); say(p, 'The item you dropped went back to where you found it.'); }
      p.lost = null;
      changed(room);
    } else if (healed) say(p, 'Healed! You can move again.');
  }

  // ---------- the monster's turn ----------
  function fire(room) {
    const m = room.mon, w = m.warn;
    m.warn = null;
    for (const p of awake(room)) if (Math.floor(w.dir === 'h' ? p.y : p.x) === w.at) stun(room, p, true);
    broadcast(room, { t: 'beam', dir: w.dir, at: w.at });
  }
  function sendMon(room) {
    const m = room.mon;
    const base = m ? { t: 'mon', on: m.on, x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100, phase: m.phase, frozen: m.frozen, warn: m.warn && { dir: m.warn.dir, at: m.warn.at } } : { t: 'mon', on: false, off: true };
    send(holder(room, 'seer')?.ws, base);
    // The teacher always sees it, with the numbers.
    if (room.teachers.size) {
      const full = JSON.stringify(m ? { ...base, anger: Math.round(m.anger), level: m.level, hp: m.hp, hits: m.c.hits, away: Math.ceil(m.away), forced: m.forced, speedMul: m.speedMul } : base);
      for (const ws of room.teachers) if (ws.readyState === 1) ws.send(full);
    }
  }

  function tick(room, dt) {
    // Stuns run out by themselves.
    for (const p of room.players) if (p.stun > 0) { p.stun -= dt; if (p.stun <= 0) wake(room, p, false); }
    // Roles rotate by themselves, if the teacher set that.
    if (room.settings.rotateMinutes > 0) {
      room.rotateClock += dt;
      if (room.rotateClock >= room.settings.rotateMinutes * 60) rotate(room);
    }
    const m = room.mon;
    if (!m) return;
    m.sendIn -= dt;
    const report = () => { if (m.sendIn <= 0) { m.sendIn = SEND_EVERY; sendMon(room); } };
    if (!m.on) {
      // Chased away: it comes back later, weaker or stronger.
      if (m.away > 0 && !m.frozen) {
        m.away -= dt;
        if (m.away <= 0) {
          Object.assign(m, { on: true, hp: m.c.hits, anger: { weaker: 0, same: 15, stronger: 35 }[m.c.returns] ?? 15, warn: null, shotIn: m.c.shotEvery, touchWait: 3, ...farSpot(room) });
          sendRoster(room);
        }
      }
      return report();
    }
    if (m.frozen) return report();

    // Anger grows with time, faster when nobody is doing anything.
    m.idle += dt;
    m.anger = clamp(m.anger + (m.c.angerPerMinute * dt / 60) * (m.idle > cfg.anger.idleAfter ? 2 : 1), 0, 100);
    const phase = m.forced || (m.anger >= cfg.anger.shootAt ? 'shoot' : m.anger >= cfg.anger.chaseAt ? 'chase' : 'wander');
    if (phase !== m.phase) { m.phase = phase; m.warn = null; m.shotIn = Math.min(m.shotIn, 3); sendRoster(room); }

    if (m.warn) {
      // Taking aim: it stands still. Only the Seer sees the warning.
      m.warn.left -= dt;
      if (m.warn.left <= 0) fire(room);
    } else {
      const target = awake(room).filter((p) => p.ws).sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];
      m.retreat = Math.max(0, m.retreat - dt);
      let goal = m.goal;
      if (m.phase !== 'wander' && target && !m.retreat) goal = target;
      else if (Math.hypot(m.goal.x - m.x, m.goal.y - m.y) < 0.3) goal = m.goal = landSpot(room);
      const d = Math.hypot(goal.x - m.x, goal.y - m.y), step = m.c.speed[m.phase] * m.speedMul * dt;
      if (d > 0.01) { m.x += (goal.x - m.x) / d * Math.min(step, d); m.y += (goal.y - m.y) / d * Math.min(step, d); }
      if (m.phase === 'shoot') {
        m.shotIn -= dt;
        if (m.shotIn <= 0 && target) {
          const dir = Math.random() < 0.5 ? 'h' : 'v';
          m.warn = { dir, at: Math.floor(dir === 'h' ? target.y : target.x), left: m.c.warn };
          m.shotIn = m.c.shotEvery;
          m.sendIn = 0;                                      // the Seer must see this at once
        }
      }
    }
    // Touching a player stuns them. Then the monster backs off, so nobody is stunned again and again.
    m.touchWait -= dt;
    if (m.touchWait <= 0) {
      const hit = awake(room).find((p) => Math.hypot(p.x - m.x, p.y - m.y) < cfg.touch);
      if (hit) { stun(room, hit, false); m.touchWait = 4; m.retreat = 3; m.goal = landSpot(room); }
    }
    report();
  }

  // Things the team does change the anger.
  function event(room, what) {
    const m = room.mon;
    if (!m) return;
    if (what === 'act') { m.idle = 0; return; }
    m.anger = clamp(m.anger + (cfg.anger[what] || 0), 0, 100);
  }

  function hitMonster(room, by) {
    const m = room.mon;
    m.hp--; m.warn = null;
    event(room, 'hit');
    broadcast(room, { t: 'say', msg: m.hp > 0 ? `${by} hit the monster! ${m.hp} more.` : `${by} chased the monster away!` });
    if (m.hp > 0) { m.retreat = 3; m.goal = farSpot(room); return; }
    m.on = false; m.away = m.c.away;
    room.stats.slays++;
    sendRoster(room);
  }

  // ---------- players' powers ----------
  function power(room, p, k) {
    if (room.phase !== 'play' || room.paused || !ROLES.includes(k)) return;
    const nope = (msg) => send(p.ws, { t: 'nope', msg });
    if (room.roles[k] !== p.id) {
      const who = room.roles[k] === 'teacher' ? 'The teacher' : holder(room, k)?.name;
      return nope(who ? `${who} is the ${ROLE_NAME[k]}. Ask!` : `Nobody is the ${ROLE_NAME[k]}.`);
    }
    if (p.stun > 0) return nope('You are stunned!');
    if (k === 'healer') {
      const near = room.players.filter((q) => q !== p && q.stun > 0).map((q) => [Math.hypot(q.x - p.x, q.y - p.y), q]).sort((a, b) => a[0] - b[0])[0];
      if (!near) return nope('Nobody is stunned.');
      if (near[0] > cfg.heal.range) return nope(`${near[1].name} is stunned, but too far. Go closer!`);
      wake(room, near[1], true);
      say(p, `You healed ${near[1].name}.`);
      broadcast(room, { t: 'fx', by: p.id, a: 'heal' });
    } else if (k === 'slayer') {
      const m = room.mon, now = Date.now();
      const wait = Math.ceil((p.slayAt + cfg.slay.cooldown * 1000 - now) / 1000);
      if (wait > 0) return nope(`Your power is charging: ${wait} s.`);
      p.slayAt = now;
      send(p.ws, { t: 'cool', slayer: cfg.slay.cooldown });
      broadcast(room, { t: 'fx', by: p.id, a: 'slay' });
      if (!m?.on || Math.hypot(m.x - p.x, m.y - p.y) > cfg.slay.range) return nope('You hit nothing. Ask the Seer where it is!');
      hitMonster(room, p.name);
    } else nope('The Seer sees the monster. Tell your team where it is!');
  }

  function rotate(room) {
    room.rotateClock = 0;
    if (room.players.length < 2) return;
    // Move on until every role a student holds has changed hands (the teacher may have set them by hand).
    const before = { ...room.roles };
    for (let tries = 0; tries < room.players.length; tries++) {
      room.roleTurn = (room.roleTurn + 1) % room.players.length;
      assignRoles(room);
      if (ROLES.every((r) => room.roles[r] === 'teacher' || room.roles[r] !== before[r])) break;
    }
    tellRoles(room);
    sendRoster(room);
  }

  // ---------- the teacher's controls ----------
  const playing = (room) => room.phase === 'play';
  const commands = {
    // monster {do: freeze | unfreeze | calm | spawn | remove | hit}
    monster(room, m) {
      const mon = room.mon;
      if (!playing(room)) return;
      if (m.do === 'spawn') {
        if (!mon) start(room, cfg.levels[room.group?.monster] ? room.group.monster : 'normal');
        else Object.assign(mon, { on: true, away: 0, hp: mon.c.hits, warn: null, ...farSpot(room) });
        return sendRoster(room);
      }
      if (!mon) return;
      if (m.do === 'freeze') mon.frozen = true;
      if (m.do === 'unfreeze') mon.frozen = false;
      if (m.do === 'calm') mon.anger = clamp(mon.anger - 25, 0, 100);
      if (m.do === 'remove') { mon.on = false; mon.away = 0; mon.warn = null; sendRoster(room); }
      if (m.do === 'hit' && mon.on && room.roles.slayer === 'teacher') hitMonster(room, 'The teacher');
      mon.sendIn = 0;
    },
    // monsterSet {phase: wander | chase | shoot | auto} | {speed: 0.5..2} | {level: off | gentle | normal | hard}
    monsterSet(room, m) {
      if (m.level !== undefined) {
        if (!playing(room)) return;
        setLevel(room, m.level);
        if (room.group) room.group.monster = cfg.levels[m.level] ? m.level : 'off';
        sendMon(room);
        return sendRoster(room);
      }
      const mon = room.mon;
      if (!mon) return;
      if (m.phase !== undefined) mon.forced = PHASES.includes(m.phase) ? m.phase : null;
      if (m.speed !== undefined) mon.speedMul = clamp(Number(m.speed) || 1, 0.25, 2);
      mon.sendIn = 0;
    },
    // role {role, p: player id | "teacher"}
    role(room, m) {
      if (!ROLES.includes(m.role)) return;
      const p = byId(room, m.p);
      if (m.p !== 'teacher' && !p) return;
      room.roles[m.role] = m.p === 'teacher' ? 'teacher' : p.id;
      if (p) say(p, `You are the ${ROLE_NAME[m.role]} now!`);
      sendRoster(room);
    },
    rotate(room) { rotate(room); },
    // The teacher is the Healer: a student asked, the teacher presses Heal.
    heal(room, m) {
      const p = byId(room, m.p);
      if (playing(room) && p && (p.stun > 0 || p.lost)) wake(room, p, true);
    },
  };

  return { start, tick, event, power, commands, fixRoles, assignRoles, sendMon, levels: () => Object.keys(cfg.levels), mood: (room) => (room.mon?.on ? PHASES.indexOf(room.mon.phase) : -1) };
}
