// Escort a character to a named place: after a player talks to it, it follows that player. It cannot jump or
// swim: the team must fix bridges or hold plates for it. It arrives when it is within 2 tiles of the place.
import { KINDS } from '../kinds/index.js';
const STEP = 0.22;                                   // seconds per tile it walks
const tile = (p) => [Math.floor(p.x), Math.floor(p.y)];
// Arrived: within 2 tiles of the place's tile (a place's x, y name a tile). The character walks behind its leader, so
// when the leader stands at the place, it is a tile or two away.
const arrivedAt = (x, y, place) => Math.abs(x - Math.floor(place.x)) <= 2 && Math.abs(y - Math.floor(place.y)) <= 2;
export default {
  type: 'escort',
  label: 'Escort',
  about: 'A character follows the player who talks to it, to a named place ("to"). It cannot jump or swim: fix bridges or hold plates for it.',
  fields: { npc: 'the id of the character', to: 'the id of a named place (from "places") where it wants to go' },
  normalize(raw, c) {
    const npcs = c.objectsOf((k) => !!k.character).map((o) => o.id), places = (c.zone.places || []).map((p) => p.id);
    const npc = raw.npc ?? c.base.npc, to = raw.to ?? c.base.to;
    if (!npcs.includes(npc)) c.fail(`goal: "npc" must be a character of this map.${c.didYouMean(npc, npcs)}`);
    if (!places.includes(to)) c.fail(`goal: "to" must be a named place of this map.${c.didYouMean(to, places)} Places: ${places.join(', ')}`);
    return npcs.includes(npc) && places.includes(to) ? { npc, to, label: raw.label } : null;
  },
  describe: (goal) => `escort the ${goal.npc} to ${goal.to}`,
  start: () => ({ leader: null, trail: [], wait: 0, arrived: false, told: false }),
  progress: (room) => ({ have: room.goalState.arrived ? 1 : 0, need: 1, done: room.goalState.arrived }),
  afterAct(room, p, t, ability) {
    const st = room.goalState;
    if (ability !== 'talk' || t.id !== room.mission.goal.npc || st.arrived || st.leader === p.id) return null;
    Object.assign(st, { leader: p.id, trail: [], told: false });
    t.following = true;
    return { npc: { name: t.name, text: 'I will follow you. Please walk slowly, and wait for me!', good: true }, changed: true };
  },
  // It walks along the tiles its leader walked, one tile at a time, and waits where it cannot go.
  tick(room, dt, ctx) {
    const goal = room.mission.goal, st = room.goalState;
    const leader = room.players.find((p) => p.id === st.leader), npc = ctx.byId(goal.npc);
    if (!leader || !npc || st.arrived) return false;
    const [lx, ly] = tile(leader), last = st.trail[st.trail.length - 1];
    if (!last || last[0] !== lx || last[1] !== ly) st.trail.push([lx, ly]);
    if (st.trail.length > 60) st.trail.shift();
    st.wait -= dt;
    if (st.wait > 0 || Math.hypot(leader.x - (npc.x + 0.5), leader.y - (npc.y + 0.6)) < 1.3) return false;
    while (st.trail.length && st.trail[0][0] === npc.x && st.trail[0][1] === npc.y) st.trail.shift();
    const next = st.trail[0];
    if (!next) return false;
    // The leader went through an exit (a bus, a door to another map): when it gets to that exit, it goes too.
    if (Math.abs(next[0] - npc.x) > 1 || Math.abs(next[1] - npc.y) > 1) {
      const exit = room.things.find((e) => e.kind === 'exit' && e.def.land && Math.abs(e.x - npc.x) + Math.abs(e.y - npc.y) <= 1 && Math.abs(e.def.land.x - next[0]) <= 1 && Math.abs(e.def.land.y - next[1]) <= 1);
      if (exit) { npc.x = exit.def.land.x; npc.y = exit.def.land.y; st.trail.shift(); st.wait = STEP; return true; }
    }
    // Only to a tile next to it (it cannot jump), and only where nothing blocks the way.
    if (Math.abs(next[0] - npc.x) > 1 || Math.abs(next[1] - npc.y) > 1 || room.solid(next[0] + 0.5, next[1] + 0.5)) {
      if (!st.told) { st.told = true; ctx.tell?.(leader, `The ${npc.name.toLowerCase()} cannot get there! Fix the way, or hold a plate for it.`); }
      st.trail = [];
      return false;
    }
    st.trail.shift();
    npc.x = next[0]; npc.y = next[1]; st.wait = STEP; st.told = false;
    const place = room.zone.places.find((p) => p.id === goal.to);
    if (place && arrivedAt(npc.x, npc.y, place)) { st.arrived = true; npc.following = false; }
    return true;
  },
  solver(s) {
    let started = false;
    const goal = s.mission.goal, npc = () => s.byId[goal.npc], place = () => s.zone.places.find((p) => p.id === goal.to);
    const near = (seen) => [...seen].some((k) => { const [x, y] = k.split(',').map(Number); return arrivedAt(x, y, place()); });
    return {
      step() {
        if (started) return false;
        for (const i of s.owners('talk')) if (s.reach(i, npc())) { started = true; s.used.add('talk'); s.log.push(`Talk: the ${npc().name.toLowerCase()} (it follows)`); s.record({ k: 'escort-start', i, thing: npc().id }); return true; }
        return false;
      },
      done() {
        if (!started) return false;
        const walk = s.walkFrom([[npc().x, npc().y]]);
        if (!near(walk)) return false;
        s.log.push(`Walk: the ${npc().name.toLowerCase()} to ${place().name}`);
        s.record({ k: 'escort-walk', thing: npc().id, place: goal.to });
        return true;
      },
      why: () => [!started ? `nobody with Talk can get to the ${npc().name.toLowerCase()}` : `the ${npc().name.toLowerCase()} cannot walk to ${place().name} (it cannot jump or swim)`],
    };
  },
  sheet: (goal, c) => `bring the ${c.name(goal.npc)} to ${goal.to} (it follows the player who talks to it)`,
};
