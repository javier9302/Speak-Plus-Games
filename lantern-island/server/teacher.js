// The Game Master's live controls. The teacher panel sends  cmd { c: <name>, ... }.
//
//   mission {mission} | quick | end | lobby | pause {on} | reset
//   level {level} | shuffle {mode} | set {key, value}   (view, phrases, hostDetails, timer)
//   hint {o} | solve {o} | force {o}                    (tablets; gates, chests, bridge, rock)
//   give {p, item} | take {p, i} | tp {p, x, y} | rename {p, name} | kick {p}
//   npc {talk, text?, item?, approve?, done?}           (answer a student as a character)
//   star | notes {text}
//   msg {to, kind, text, url, shareable} | unlock {m, to} | lock {m} | forward {m, p} | revoke {m}
//   helper {role, p} | courier {o, to? | deliver?}            (see chat.js)
//   monster {do} | monsterSet {phase | speed | level} | role {role, p} | rotate | heal {p}   (see monster.js)
import { buildThings, blockSet, forceThing, returnItems } from './things.js';
import { cleanName, HINT_COST_SECONDS } from './rooms.js';

const SETTINGS = {
  view: (v) => Math.max(5, Math.min(15, Math.round(Number(v)) || 9)),   // tiles a phone sees
  phrases: Boolean, hostDetails: Boolean, timer: Boolean, hintCost: Boolean,
  rotateMinutes: (v) => Math.max(0, Math.min(30, Math.round(Number(v)) || 0)),   // 0 = the roles do not rotate by themselves
};
const line = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export function createTeacherCommands(G) {
  const { send, fail, sendRoster, sendQueue, changed, items, groups, missions, cards } = G;
  const player = (room, id) => room.players.find((p) => p.id === id);
  const playing = (room) => room.phase === 'play';

  return {
    // ----- missions -----
    async mission(room, m, ws) { await G.startMission(room, missions.normalize(m.mission), ws); },
    async quick(room, m, ws) { await G.fromHost.start(room, m, ws); },
    async end(room) { await G.endMission(room, false); },
    lobby(room) { G.fromHost.lobby(room); },
    pause(room, m) { if (playing(room)) { room.paused = !!m.on; sendRoster(room); } },

    // Reset the zone: everything back in place, same cards. Use it if the class is stuck.
    reset(room) {
      if (!playing(room)) return;
      const old = new Map(room.things.map((t) => [t.id, t]));
      room.things = buildThings(room.zone, room.mission.stations.map((s) => s.at));
      for (const t of room.things) if (t.kind === 'station') { const o = old.get(t.id); t.card = o?.card || null; t.inner = o?.inner || null; if (!t.card) { t.st = 'solved'; } }
      room.messages = [];
      room.players.forEach((p) => { p.items = []; p.stun = 0; p.lost = null; G.toSpawn(room, p); });
      room.talks = [];
      changed(room);
      G.chat.pushInboxes(room);
    },

    // New cards use the new level: every tablet nobody has opened yet gets a fresh card.
    async level(room, m) {
      if (!room.group) return;
      room.group.level = line(m.level, 12) || room.group.level;
      if (playing(room)) await G.drawCards(room);
      sendRoster(room); sendQueue(room);
    },
    shuffle(room, m) { G.fromHost.shuffle(room, m); },
    set(room, m) {
      if (!Object.hasOwn(SETTINGS, m.key)) return;
      room.settings[m.key] = SETTINGS[m.key](m.value);
      sendRoster(room);
    },

    // ----- tablets and other things -----
    // The hint ladder: each press shows the next hint on the phones that can open this tablet.
    hint(room, m) {
      const t = room.things.find((x) => x.id === m.o && x.kind === 'station');
      const card = t?.inner || t?.card;
      if (!playing(room) || !card || t.st === 'solved' || t.hints >= card.hints.length) return;
      t.hints++; room.stats.hints++;
      // Optional: a hint costs time on the mission clock (which can cost the star for speed).
      if (room.settings.hintCost) { room.clock += HINT_COST_SECONDS; sendRoster(room); }
      const msg = { t: 'hint', o: t.id, name: t.name, hints: card.hints.slice(0, t.hints) };
      for (const p of room.players) if (t.answerer ? t.answerer === p.id : p.abilities.includes(t.def.by || 'use')) send(p.ws, msg);
      sendQueue(room);
    },
    // Rescue: solve a tablet without an answer. Its reward appears as usual.
    solve(room, m) {
      const t = room.things.find((x) => x.id === m.o && x.kind === 'station');
      if (!playing(room) || !t || t.st === 'solved') return;
      G.solveStation(room, t);
      changed(room);
    },
    // Open or close a gate or chest, fix the bridge, move the rock.
    force(room, m) {
      const t = room.things.find((x) => x.id === m.o);
      if (playing(room) && t && forceThing(t)) changed(room);
    },

    // ----- players -----
    give(room, m, ws) {
      const p = player(room, m.p);
      if (!playing(room) || !p || !items.byId[m.item]) return;
      if (p.items.length >= items.maxCarry) return fail(ws, 'bad', `${p.name} cannot carry more.`);
      p.items.push({ item: m.item, from: null });
      send(p.ws, { t: 'say', msg: `The teacher gave you a ${items.byId[m.item].name.toLowerCase()}.` });
      changed(room);
    },
    take(room, m) {
      const p = player(room, m.p);
      if (!playing(room) || !p || !p.items[m.i] || p.items[m.i].courier) return;   // a courier's letter is rerouted, not taken
      const [it] = p.items.splice(m.i, 1);
      returnItems(room, { items: [it] });             // back where it was found, if it came from the map
      changed(room);
    },
    tp(room, m) {
      const p = player(room, m.p), x = Math.floor(Number(m.x)), y = Math.floor(Number(m.y));
      if (!playing(room) || !p || room.solid(x + 0.5, y + 0.5)) return;
      Object.assign(p, { x: x + 0.5, y: y + 0.6, ix: 0, iy: 0 });
    },
    rename(room, m) {
      const p = player(room, m.p), name = cleanName(m.name);
      if (!p || !name) return;
      p.name = name;
      send(p.ws, { t: 'joined', id: p.id, token: p.token, name: p.name, ci: p.ci, hero: p.hero, room: room.code, abilities: G.abilities.list, items: items.list });
      sendRoster(room); sendQueue(room);
    },
    kick(room, m) { G.kick(room, m.p); },

    // ----- playing a character -----
    // A student talked to an NPC; the teacher answers as that character.
    npc(room, m) {
      const k = room.talks.find((x) => x.id === m.talk);
      if (!k) return;
      const p = player(room, k.p);
      if (p && m.text) send(p.ws, { t: 'npc', name: k.npc, text: line(m.text) });
      if (p && m.approve) send(p.ws, { t: 'npc', name: k.npc, text: 'Well done! Thank you.', good: true });
      if (p && m.item && items.byId[m.item] && playing(room)) {
        if (p.items.length >= items.maxCarry) send(p.ws, { t: 'npc', name: k.npc, text: 'Your hands are full! Give something to a teammate first.' });
        else { p.items.push({ item: m.item, from: null }); send(p.ws, { t: 'npc', name: k.npc, text: `Here, take this ${items.byId[m.item].name.toLowerCase()}.` }); }
      }
      if (m.done) room.talks = room.talks.filter((x) => x !== k);
      changed(room);
    },
    // ----- chat, helpers, couriers (chat.js) -----
    msg: (room, m) => G.chat.commands.msg(room, m),
    unlock: (room, m) => G.chat.commands.unlock(room, m),
    lock: (room, m) => G.chat.commands.lock(room, m),
    forward: (room, m) => G.chat.commands.forward(room, m),
    revoke: (room, m) => G.chat.commands.revoke(room, m),
    helper: (room, m) => G.chat.commands.helper(room, m),
    courier: (room, m, ws) => G.chat.commands.courier(room, m, ws, { delivered: G.delivered }),

    // ----- the monster and its roles (monster.js) -----
    monster: (room, m) => G.monster.commands.monster(room, m),
    monsterSet: (room, m) => G.monster.commands.monsterSet(room, m),
    role: (room, m) => G.monster.commands.role(room, m),
    rotate: (room) => G.monster.commands.rotate(room),
    heal: (room, m) => G.monster.commands.heal(room, m),

    // ----- the group -----
    async star(room) {
      if (!room.group || room.match) return;          // a match is not saved to the group (use the team points instead)
      const saved = await groups.addStar(room.group.id);
      if (saved) { room.group.island = saved.island; sendRoster(room); }
    },
    // Session notes (errors heard). Saved with the group.
    async notes(room, m) {
      if (!room.group) return;
      const saved = await groups.update(room.group.id, { notes: String(m.text ?? '') });
      room.group.notes = saved.notes;
    },
  };
}
