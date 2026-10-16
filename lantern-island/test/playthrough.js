// Plays every mission of every pack in a real room, the way students do: players WALK (the same movement and collision as
// the game), press ability buttons, type codes, hand items over, hold plates, pull levers and run through the door, take
// characters through the bus. The plan comes from the solver (what a perfect team does), so a mission the solver likes but
// the game does not let you finish stops here with the reason: a street that cannot be crossed, an exit with no way back,
// a door that never opens.
//
//   node test/playthrough.js                      every mission of every pack, 2 and 3 players, in parallel
//   node test/playthrough.js city                 one pack
//   node test/playthrough.js city lost-tourist 2  one mission with 2 players ("whole:<map id>" is a map's whole-zone mission)
//
// It reads the room's state directly (the same process), so it can tell whether something worked; the players only use the
// messages a phone uses. Cards of tablets are solved with the teacher's rescue button (cards are tested elsewhere).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createApp } from '../server/index.js';
import { loadContent } from '../server/content.js';
import { loadAbilities } from '../server/abilities.js';
import { goalOf } from '../server/goals/index.js';
import { solve } from '../server/solver.js';
import { atlasFor } from '../server/atlas.js';
import { needsOf, nearestThing } from '../server/things.js';
import { kindOf } from '../server/kinds/index.js';
import { client } from './client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (x, y) => `${x},${y}`;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export async function playMission({ contentDir = path.join(root, 'data'), missionId, players = 2, log = () => {} }) {
  const app = await createApp({ port: 0, contentDir, dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-play-')), publicUrl: '', pin: '2468', quiet: true, watch: false });
  const fail = (msg) => { throw Object.assign(new Error(msg), { play: true }); };
  try {
    const api = async (p, method = 'GET', body) => (await fetch(`http://127.0.0.1:${app.port}/api${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).json();
    const group = await api('/groups', 'POST', { name: 'Playthrough' });
    await api(`/groups/${group.id}`, 'PATCH', { settings: { monster: 'off' } });
    const host = client(app.port); await host.opened;
    host.send({ t: 'host' });
    const room = await host.next('room');
    host.send({ t: 'group', id: group.id });
    await host.next('roster', (x) => x.group?.id === group.id, 15000).catch(() => {});
    const cs = [];
    for (let k = 0; k < players; k++) { const c = client(app.port); await c.opened; c.send({ t: 'join', room: room.code, name: `P${k + 1}` }); c.me = await c.next('joined'); cs.push(c); }
    const teacher = client(app.port); await teacher.opened;
    teacher.send({ t: 'teacher', room: room.code });
    await teacher.next('watching');
    const r = app.rooms.rooms.get(room.code);
    const cmd = (x) => teacher.send({ t: 'cmd', ...x });

    // ---- the mission ----
    let mission;
    if (missionId.startsWith('whole:')) {
      // A map's whole-zone mission: every tablet, the goal that asks for everything (the same as the check's).
      const abilities = await loadAbilities(contentDir), it = JSON.parse(await fs.readFile(path.join(contentDir, 'items.json'), 'utf8'));
      const content = await loadContent(contentDir, { abilities, items: { list: it.items, byId: Object.fromEntries(it.items.map((x) => [x.id, x])) } });
      const zone = content.zones[missionId.slice(6)];
      const atlas = atlasFor(zone, content.zones);
      // Everything is collected, but not carried by one player to a character: hands hold only 4.
      mission = { id: 'whole-zone', title: `Whole ${zone.name}`, zone: zone.id, goal: (({ deliver, ...g }) => ((g.type || 'collect') === 'collect' && deliver ? { ...g, deliver: '' } : { ...g, ...(deliver ? { deliver } : {}) }))(goalOf(zone.goal).wholeZone(zone.goal)), stations: atlas.objects.filter((o) => kindOf({ kind: o.kind }).card).map((o) => ({ at: o.id })) };
    } else mission = (await api('/missions')).missions.find((m) => m.id === missionId);
    if (!mission) fail(`there is no mission "${missionId}"`);
    mission = { ...mission, timeLimit: null, monster: "off" };   // bots are slow, and the monster is tested elsewhere: neither is what this test is about
    cmd({ c: 'mission', mission });
    await host.next('roster', (x) => x.phase === 'play', 45000).catch(() => fail(`the mission did not start: ${[...teacher.all, ...host.all].filter((m) => m.t === 'error').map((m) => m.msg).join(' | ') || 'no message'}`));
    await sleep(150);

    const P = (c) => r.players.find((p) => p.id === c.me.id);
    const name = (i) => `P${i + 1}`;
    const has = (i, a) => P(cs[i]).abilities.includes(a);
    const owners = (a) => cs.map((_, i) => i).filter((i) => has(i, a));
    const thing = (id) => r.things.find((t) => t.id === id);
    const where = () => cs.map((c, k) => `${name(k)} at ${P(c).x.toFixed(1)},${P(c).y.toFixed(1)}`).join(', ');
    const Z = r.zone, links = Z.links || new Map();
    const passableTile = (x, y) => x >= 0 && y >= 0 && x < Z.w && y < Z.h && !r.solid(x + 0.5, y + 0.5);
    // A bridge held open only because this very player stands on its plate closes as soon as they step off: not a way.
    let mover = -1;
    const onTile = (x, y) => r.players.filter((p) => Math.floor(p.x) === x && Math.floor(p.y) === y);
    const selfHeld = (x, y) => {
      const t = r.things.find((o) => o.x === x && o.y === y && o.held && kindOf(o).holdable);
      if (!t || mover < 0 || r.things.some((l) => kindOf(l).opens?.(l) === t.id && l.st === 'on')) return false;
      const holders = r.things.filter((pl) => kindOf(pl).holdsOpen?.(pl) === t.id).flatMap((pl) => onTile(pl.x, pl.y));
      return holders.length > 0 && holders.every((p) => p.id === cs[mover].me.id);
    };
    // A door a lever opened a while ago may shut before we get there: only right after pulling it do we count on it.
    let freshLever = false;
    const leverHeld = (x, y) => r.things.some((o) => o.x === x && o.y === y && o.held && kindOf(o).holdable && r.things.some((l) => kindOf(l).opens?.(l) === o.id && l.st === 'on'));
    const passable = (x, y) => passableTile(x, y) && !selfHeld(x, y) && (freshLever || !leverHeld(x, y));
    const exitAt = (x, y) => r.things.find((t) => t.kind === 'exit' && t.x === x && t.y === y);
    const tileOf = (p) => [Math.floor(p.x), Math.floor(p.y)];

    // ---- what can be opened for a while ----
    const holdsFor = (t) => r.things.filter((p) => kindOf(p).holdsOpen?.(p) === t.id);          // plates that hold it
    const leversFor = (t) => r.things.filter((p) => kindOf(p).opens?.(p) === t.id);              // levers that open it for a while
    const openable = (x, y) => r.things.find((t) => t.x === x && t.y === y && kindOf(t).holdable && (!t.held || selfHeld(x, y) || (!freshLever && leverHeld(x, y))) && (holdsFor(t).length || leversFor(t).length));
    const brokenGapAt = (x, y) => r.things.find((t) => t.kind === 'gap' && t.x === x && t.y === y && t.st === 'broken' && (!t.held || selfHeld(x, y)));

    // ---- finding a way (breadth first over tiles: exits are portals, a jump crosses one broken bridge tile) ----
    function findPath(i, from, goalTiles, { relaxed = false, noJump = false, avoid = null } = {}) {
      mover = i;
      const goal = new Set(goalTiles.map(([x, y]) => key(x, y)));
      const start = key(from[0], from[1]), prev = new Map([[start, null]]), queue = [from];
      while (queue.length) {
        const [x, y] = queue.shift(), k = key(x, y);
        if (goal.has(k)) {
          const steps = [];
          for (let cur = k; prev.get(cur); cur = prev.get(cur).from) steps.unshift({ ...prev.get(cur), to: cur });
          return steps.map((s) => ({ ...s, tile: s.to.split(',').map(Number) }));
        }
        const go = (nx, ny, extra) => { const nk = key(nx, ny); if (!prev.has(nk)) { prev.set(nk, { from: k, ...extra }); queue.push([nx, ny]); } };
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy, ex = nx >= 0 && ny >= 0 && nx < Z.w && ny < Z.h && exitAt(nx, ny);
          if (ex) { const land = links.get(key(nx, ny)); if (land) go(land.x, land.y, { portal: [nx, ny] }); continue; }
          if (passable(nx, ny)) go(nx, ny, {});
          else if (!noJump && has(i, 'jump') && brokenGapAt(nx, ny) && passable(nx + dx, ny + dy) && !exitAt(nx + dx, ny + dy)) go(nx + dx, ny + dy, { jump: [nx, ny], over: brokenGapAt(nx, ny).id });
          else if (relaxed && openable(nx, ny) && openable(nx, ny).id !== avoid) go(nx, ny, { blocker: openable(nx, ny).id });
        }
      }
      return null;
    }

    // ---- moving ----
    const input = (c, x, y) => c.send({ t: 'input', x, y });
    async function stepTo(i, tx, ty, ms = 2500, tol = 0.2) {
      const c = cs[i], p = P(c), t0 = Date.now();
      while (true) {
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        if (d < tol) return;
        const m = Math.min(1, d * 3 + 0.2);
        input(c, (dx / d) * m, (dy / d) * m);
        await sleep(25);
        if (r.phase !== 'play') { if (r.result?.completed) throw Object.assign(new Error('finished'), { finished: true }); fail(`the mission stopped while ${name(i)} was walking (${r.timeUp ? 'time is up' : r.phase})`); }
        if (Date.now() - t0 > ms) { input(c, 0, 0); fail(`${name(i)} is stuck at ${p.x.toFixed(1)},${p.y.toFixed(1)} on the way to ${tx.toFixed(1)},${ty.toFixed(1)}`); }
      }
    }
    async function followSteps(i, steps) {
      if (process.env.PLAY_DEBUG) console.log(`  ${name(i)} from ${tileOf(P(cs[i])).join(',')}: ${steps.map((st) => (st.portal ? `[exit ${st.portal}]→` : st.jump ? '[jump]→' : '') + st.tile.join(',')).join(' ')}`);
      for (const s of steps) {
        const p = P(cs[i]);
        if (s.jump) {
          // Stand at the near edge, face the gap, jump.
          input(cs[i], 0, 0);
          const [gx, gy] = s.jump, [px, py] = tileOf(p);
          await stepTo(i, px + 0.5, py + 0.55);
          const msgs = await act(i, 'jump');
          if (msgs.some((m) => m.t === 'nope')) fail(`${name(i)} cannot jump: ${msgs.find((m) => m.t === 'nope').msg}`);
          if (Math.floor(P(cs[i]).x) !== s.tile[0] || Math.floor(P(cs[i]).y) !== s.tile[1]) fail(`${name(i)} jumped over ${s.over} but did not land on ${s.tile.join(',')} (is at ${P(cs[i]).x.toFixed(1)},${P(cs[i]).y.toFixed(1)})`);
        } else if (s.portal) {
          // Walk onto the exit until the game takes us to the other map.
          const t0 = Date.now();
          while (Math.hypot(P(cs[i]).x - s.tile[0] - 0.5, P(cs[i]).y - s.tile[1] - 0.5) > 1.5 && Date.now() - t0 < 2500) {
            const p = P(cs[i]), dx = s.portal[0] + 0.5 - p.x, dy = s.portal[1] + 0.55 - p.y, d = Math.hypot(dx, dy) || 1;
            input(cs[i], dx / d, dy / d);
            await sleep(25);
          }
          input(cs[i], 0, 0);
          if (Math.floor(P(cs[i]).x) !== s.tile[0]) fail(`${name(i)} stepped on the exit at ${s.portal.join(',')} and went nowhere`);
          await sleep(1300);                                  // a player just through an exit is not taken back at once
        } else await stepTo(i, s.tile[0] + 0.5, s.tile[1] + 0.55, 2500, s === steps.at(-1) ? 0.08 : 0.2);
      }
      input(cs[i], 0, 0);
      await sleep(30);
    }

    // ---- acting ----
    const lastAct = cs.map(() => 0);
    async function act(i, ability, extra = {}) {
      const c = cs[i], wait = lastAct[i] + 320 - Date.now();
      if (wait > 0) await sleep(wait);
      const n = c.all.length;
      c.send({ t: 'act', a: ability, ...extra });
      lastAct[i] = Date.now();
      await sleep(260);
      return c.all.slice(n);
    }
    const nopes = (msgs) => msgs.filter((m) => m.t === 'nope').map((m) => m.msg);

    // ---- walking to a thing, opening the way if a plate or a lever can ----
    const standTiles = (thingId, ability, around = 2) => {
      const t = thing(thingId), out = [];
      for (let dy = -around; dy <= around; dy++) for (let dx = -around; dx <= around; dx++) {
        const x = t.x + dx, y = t.y + dy;
        if (!passable(x, y) || exitAt(x, y)) continue;
        if (t.kind === 'boulder') { const d = t.st === 'a' ? t.def.to : t.def; if (d.x === x && d.y === y) continue; }   // not where the rock will roll
        const mock = { x: x + 0.5, y: y + 0.55 };
        if (Math.hypot(t.x + 0.5 - mock.x, t.y + 0.5 - (mock.y - 0.1)) > 1.2) continue;   // well inside reach
        if (nearestThing(r.things, mock, (o) => needsOf(o).includes(ability)) === t) out.push([x, y]);
      }
      return out;
    };
    async function goTo(i, goalTiles, why, opts = {}) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const here = tileOf(P(cs[i]));
        if (goalTiles.some(([x, y]) => x === here[0] && y === here[1])) return;
        let steps = findPath(i, here, goalTiles, opts);
        if (steps) { await followSteps(i, steps); continue; }
        steps = findPath(i, here, goalTiles, { ...opts, relaxed: true });
        if (!steps) fail(`${name(i)} at ${here.join(',')} cannot find any way to ${why}`);
        // The first closed thing on the way that a plate or a lever can open.
        const at = steps.findIndex((s) => s.blocker);
        await followSteps(i, steps.slice(0, Math.max(0, at - 0)).filter((s, k) => k < at));
        await openWay(i, thing(steps[at].blocker), steps[at].tile, opts);
        // Cross it now (to the tile just past it); the next round finds the way on from there.
        const past = steps[at + 1]?.tile || steps[at].tile;
        const cross = findPath(i, tileOf(P(cs[i])), [past], opts);
        if (!cross) fail(`${name(i)} could not cross ${steps[at].blocker} on the way to ${why} even though it was opened [${where()}; ${steps[at].blocker} held=${thing(steps[at].blocker).held}]`);
        await followSteps(i, cross);
        freshLever = false;
      }
      fail(`${name(i)} could not get to ${why}`);
    }
    const holding = new Map();                         // plate id -> player index standing on it
    async function openWay(i, blocker, tile, opts) {
      const plates = holdsFor(blocker), levers = leversFor(blocker);
      if (plates.length) {
        // A teammate stands on the flat stone while this player crosses.
        for (const plate of plates) for (let j = 0; j < cs.length; j++) {
          if (j === i) continue;
          // The helper may have to open other things on the way (a light), never this one.
          const here = tileOf(P(cs[j]));
          if (!findPath(j, here, [[plate.x, plate.y]], { relaxed: true, avoid: blocker.id })) continue;
          await goTo(j, [[plate.x, plate.y]], `${plate.name}`, { avoid: blocker.id });
          holding.set(plate.id, j);
          const t0 = Date.now();
          while (!blocker.held && Date.now() - t0 < 2500) await sleep(30);
          if (!blocker.held) fail(`${name(j)} stands on ${plate.name} but ${blocker.name} did not open`);
          return;
        }
        fail(`nobody else can reach ${plates[0].name}, so ${name(i)} cannot cross ${blocker.name}`);
      }
      if (levers.length) {
        const ability = levers[0].def.by || 'use';
        // Already green from an earlier press: go now if there is time, else wait for it to turn red and press again.
        const on = levers.find((l) => l.st === 'on');
        if (on && on.until - r.clock >= 5) { freshLever = true; return; }
        for (const t0 = Date.now(); levers.some((l) => l.st === 'on') && Date.now() - t0 < 15000;) await sleep(100);
        // Somebody pulls the lever, then the player runs across before it shuts.
        const approach = tileOf(P(cs[i]));
        const pullers = owners(ability).sort((a, b) => (a === i) - (b === i));
        for (const j of pullers) for (const lever of levers) {
          const tiles = standTiles(lever.id, ability);
          if (!tiles.length || !findPath(j, tileOf(P(cs[j])), tiles, { relaxed: true, avoid: blocker.id })) continue;
          await goTo(j, tiles, `${lever.name}`, { avoid: blocker.id });
          const msgs = await act(j, ability);
          if (nopes(msgs).length) fail(`${name(j)} cannot pull ${lever.name}: ${nopes(msgs)[0]}`);
          if (!blocker.held) fail(`${name(j)} pulled ${lever.name} but ${blocker.name} did not open`);
          freshLever = true;
          if (j === i) {
            // The same player must now run to the door and through it.
            const run = findPath(i, tileOf(P(cs[i])), [tile], {});
            if (!run) fail(`${name(i)} pulled ${lever.name} but cannot get to ${blocker.name}`);
            const t0 = Date.now();
            await followSteps(i, run);
            if (!blocker.held) fail(`${name(i)} was too slow: ${blocker.name} shut again after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
          } else {
            const t0 = Date.now(), run = findPath(i, approach, [tile], {});
            if (!run) fail(`${name(i)} cannot get to ${blocker.name}`);
            await followSteps(i, run);
            if (!blocker.held) fail(`${name(i)} was too slow: ${blocker.name} shut again after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
          }
          return;
        }
        fail(`nobody with ${ability} can reach a ${levers[0].name} for ${blocker.name} [${where()}; levers at ${levers.map((l) => `${l.x},${l.y}`).join(' ')}]`);
      }
      fail(`${blocker.name} is in the way and nothing opens it`);
    }
    const goNear = async (i, thingId, ability) => {
      const tiles = standTiles(thingId, ability);
      if (!tiles.length) fail(`there is no tile from which ${name(i)} can ${ability} the ${thing(thingId).name} (it is at ${thing(thingId).x},${thing(thingId).y})`);
      await goTo(i, tiles, `the ${thing(thingId).name}`);
    };

    // ---- items ----
    const itemCount = (i, item) => P(cs[i]).items.filter((it) => it.item === item).length;
    const holderOf = (item, except) => cs.findIndex((_, j) => j !== except && itemCount(j, item) > 0);
    async function meet(a, b) {
      // Player a walks to a tile next to player b (b may move meanwhile: to press a button on a's way), then b is the nearest teammate.
      for (let k = 0; k < 4; k++) {
        { const [bx, by] = tileOf(P(cs[b])); await stepTo(b, bx + 0.5, by + 0.55, 1500, 0.08); input(cs[b], 0, 0); }   // b stands in the middle of its tile
        const pb = tileOf(P(cs[b])), tiles = [];
        // Side by side if possible (a diagonal neighbour is right at the edge of reach).
        const around = (list) => list.map(([dx, dy]) => [pb[0] + dx, pb[1] + dy]).filter(([x, y]) => passable(x, y) && !exitAt(x, y));
        const side = around(DIRS);
        if (side.length && findPath(a, tileOf(P(cs[a])), side, { relaxed: true })) tiles.push(...side); else tiles.push(...side, ...around([[1, 1], [-1, 1], [1, -1], [-1, -1]]));
        await goTo(a, tiles, `${name(b)}`);
        { const [tx, ty] = tileOf(P(cs[a])); await stepTo(a, tx + 0.5, ty + 0.55, 1500, 0.08); input(cs[a], 0, 0); }
        if (Math.hypot(P(cs[a]).x - P(cs[b]).x, P(cs[a]).y - P(cs[b]).y) <= 1.49) return;
      }
      fail(`${name(a)} could not meet ${name(b)} [${where()}]`);
    }
    // One more of `item` into player i's hands, from a teammate who has one: given directly, taken with Pick up, or through
    // a third player. Give goes to the nearest teammate, so if somebody else stood closer we try again from there.
    async function transfer(i, item, depth = 0) {
      const before = itemCount(i, item);
      const h = holderOf(item, i);
      if (h < 0) fail(`nobody else has the ${item} that ${name(i)} needs [pockets: ${cs.map((c, k) => `${name(k)}: ${P(c).items.map((x) => x.item).join('+') || '-'}`).join('; ')}; tablets: ${r.things.filter((t) => t.kind === 'station').map((t) => `${t.id}=${t.st}/${t.holds || '-'}/${t.def.reward?.item}`).join(' ')}]`);
      if (depth > 4) fail(`the ${item} could not be handed to ${name(i)}`);
      await ensureSpace(i, item);
      if (has(h, 'give')) {
        await meet(h, i);
        const idx = P(cs[h]).items.findIndex((it) => it.item === item && !it.courier);
        const msgs = await act(h, 'give', { item: idx });
        if (nopes(msgs).length) fail(`${name(h)} cannot give the ${item} to ${name(i)}: ${nopes(msgs)[0]}`);
      } else if (has(i, 'pickup')) {
        // Pick up takes the first thing in the teammate's hands: hand back what is not wanted, and try again.
        await meet(i, h);
        const msgs = await act(i, 'pickup');
        if (nopes(msgs).length) fail(`${name(i)} cannot take the ${item} from ${name(h)}: ${nopes(msgs)[0]}`);
      } else {
        const mid = cs.findIndex((_, m) => m !== i && m !== h && (has(h, 'give') || has(m, 'pickup')) && (has(m, 'give') || has(i, 'pickup')));
        if (mid < 0) fail(`the ${item} is with ${name(h)} and cannot reach ${name(i)}`);
        await transfer(mid, item, depth + 1);
      }
      if (itemCount(i, item) <= before) return transfer(i, item, depth + 1);
    }
    async function ensureItem(i, item) { if (itemCount(i, item) === 0) await transfer(i, item); }

    // Full hands: pass something to a teammate first ("Can you hold this, please?").
    const MAX = 4;
    async function ensureSpace(i, keep = null, room = 1) {
      for (let guard = 0; P(cs[i]).items.length > MAX - room && guard < 6; guard++) {
        const idx = P(cs[i]).items.findIndex((it) => !it.courier && it.item !== keep);
        if (idx < 0) fail(`${name(i)} has full hands of ${keep}s`);
        const takers = cs.map((_, j) => j).filter((j) => j !== i && P(cs[j]).items.length < MAX && (has(i, 'give') || (has(j, 'pickup') && idx === 0)));
        if (!takers.length) fail(`${name(i)} has full hands and cannot pass anything on [carrying: ${P(cs[i]).items.map((x) => x.item).join(', ')}]`);
        const j = takers[0];
        if (has(i, 'give')) { await meet(i, j); await act(i, 'give', { item: idx }); }
        else { await meet(j, i); await act(j, 'pickup'); }
      }
    }

    // ---- one step of the plan ----
    const answerFor = (t) => { const a = r.secrets.answers[t.id]; return Array.isArray(a) ? a.join(',') : String(a); };
    async function enterCode(i, t) {
      await sleep(1300);
      const c = cs[i], n = c.all.length;
      c.send({ t: 'answer', o: t.id, value: answerFor(t) });
      await sleep(350);
      const res = c.all.slice(n).find((m) => m.t === 'result' && m.o === t.id);
      if (!res || !res.ok) fail(`${name(i)} typed the right code at the ${t.name} and it said: ${res?.msg || 'nothing'}`);
    }
    async function act1(i, t, ability) {
      const msgs = await act(i, ability);
      if (nopes(msgs).length) fail(`${name(i)} tried to ${ability} the ${t.name}: ${nopes(msgs)[0]} [carrying: ${P(cs[i]).items.map((x) => x.item).join(', ') || 'nothing'}]`);
      return msgs;
    }
    let leader = null;
    async function runStep(e) {
      const t = thing(e.thing);
      switch (e.k) {
        case 'clue': {
          await goNear(e.i, e.thing, e.a);
          let msgs = await act1(e.i, t, e.a);
          const ask = msgs.find((m) => m.t === 'ask');
          if (ask) {                                          // a character that wants the right question
            cs[e.i].send({ t: 'asked', o: t.id, i: t.def.ask.right });
            await sleep(400);
            if (t.def.ask.teacher) { const k = teacher.last.queue.talks.find((x) => x.o === t.id && x.question); if (!k) fail(`the question to ${t.name} did not reach the teacher`); cmd({ c: 'npc', talk: k.id, clue: true }); await sleep(300); }
            msgs = cs[e.i].all.slice(-6);
          }
          if (!msgs.some((m) => m.t === 'clue') && !cs[e.i].all.some((m) => m.t === 'clue' && m.o === t.id && m.a === e.a)) fail(`${name(e.i)} used ${e.a} on the ${t.name} and got no clue`);
          break;
        }
        case 'step': {
          if (t.kind === 'pad') return;                       // pads are pressed in the goal's order, below
          if (e.item) await ensureItem(e.i, e.item);
          await goNear(e.i, e.thing, e.a);
          if (e.card) { cmd({ c: 'solve', o: t.id }); await sleep(250); break; }
          if (e.gives) { await ensureSpace(e.i); await goNear(e.i, e.thing, e.a); }
          const before = P(cs[e.i]).items.length, msgs = await act1(e.i, t, e.a);
          if (e.code) {
            if (!msgs.some((m) => m.t === 'keypad')) fail(`${name(e.i)} used the ${t.name} and no keypad opened`);
            await enterCode(e.i, t);
          }
          if (e.gives && P(cs[e.i]).items.length <= before) fail(`${name(e.i)} could not pick up from the ${t.name} (hands full?)`);
          break;
        }
        case 'stand': {
          const b = thing(e.thing), before = b.met.length;
          for (const [plateId, j] of e.stand) { const plate = thing(plateId); await goTo(j, [[plate.x, plate.y]], `the ${plate.name}`); }
          const t0 = Date.now();
          while (b.met.length === before && b.st === 'locked' && Date.now() - t0 < 3000) await sleep(50);
          if (b.met.length === before && b.st === 'locked') fail(`players stand on the plates of ${b.name} but nothing happened`);
          break;
        }
        case 'deliver': {
          await ensureSpace(e.i, e.item, e.need - itemCount(e.i, e.item));
          for (let guard = 0; itemCount(e.i, e.item) < e.need && guard < 10; guard++) await transfer(e.i, e.item);
          if (itemCount(e.i, e.item) < e.need) fail(`${name(e.i)} holds ${itemCount(e.i, e.item)} of the ${e.need} ${e.item}s`);
          await goNear(e.i, e.thing, 'talk');
          await act1(e.i, t, 'talk');
          if (!r.goalState.delivered) fail(`${name(e.i)} talked to ${t.name} with the ${e.item}s but they were not accepted`);
          break;
        }
        case 'give-npc': {
          // Talking to the character for its clue while carrying the item already delivered it (the game does that).
          const k = r.mission.goal.order.findIndex((d, n) => n >= 0 && d.to === e.thing && d.item === e.item);
          if (k >= 0 && r.goalState.next > k) break;
          await ensureItem(e.i, e.item);
          await goNear(e.i, e.thing, 'talk');
          const next = r.goalState.next;
          await act1(e.i, t, 'talk');
          if (r.goalState.next === next) fail(`${t.name} did not take the ${e.item}`);
          break;
        }
        case 'escort-start': {
          await goNear(e.i, e.thing, 'talk');
          await act1(e.i, t, 'talk');
          if (!t.following) fail(`${t.name} does not follow after Talk`);
          leader = e.i;
          break;
        }
        case 'escort-walk': {
          const place = Z.places.find((p) => p.id === e.place), npc = t;
          const near = [];
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = Math.floor(place.x) + dx, y = Math.floor(place.y) + dy; if (passable(x, y) && Math.hypot(x + 0.5 - place.x, y + 0.5 - place.y) < 1.2) near.push([x, y]); }
          await escortTo(leader, npc, near, e.place);
          const t0 = Date.now();
          while (!r.goalState.arrived && Date.now() - t0 < 6000) { await sleep(100); }
          if (!r.goalState.arrived) fail(`${name(leader)} brought ${npc.name} next to ${place.name} but it never arrived (it is at ${npc.x},${npc.y})`);
          break;
        }
        case 'buy': {
          await goNear(e.hearer, e.thing, 'talk'); await act1(e.hearer, t, 'talk');
          await ensureSpace(e.buyer);
          await goNear(e.buyer, e.thing, 'use');
          const coins = r.goalState.coins;
          await act1(e.buyer, t, 'use');
          if (r.goalState.coins >= coins) fail(`${name(e.buyer)} could not buy at ${t.name}`);
          break;
        }
        default: fail(`unknown plan step ${JSON.stringify(e)}`);
      }
    }
    // The escort leader walks one tile at a time and waits for the character to catch up. A broken bridge is not jumped
    // (the character cannot jump): a teammate holds the plate.
    async function escortTo(i, npc, goalTiles, why) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const here = tileOf(P(cs[i]));
        if (goalTiles.some(([x, y]) => x === here[0] && y === here[1])) return;
        let steps = findPath(i, here, goalTiles, { noJump: true });
        let blocker = null;
        if (!steps) { steps = findPath(i, here, goalTiles, { noJump: true, relaxed: true }); if (!steps) fail(`${name(i)} cannot find a way for ${npc.name} to ${why}`); blocker = steps.findIndex((s) => s.blocker); }
        const upto = blocker === null ? steps.length : blocker;
        for (const s of steps.slice(0, upto)) {
          const t0 = Date.now();
          while (Math.hypot(npc.x + 0.5 - P(cs[i]).x, npc.y + 0.5 - P(cs[i]).y) > 2.4 && Date.now() - t0 < 4000) { input(cs[i], 0, 0); await sleep(80); }
          if (Math.hypot(npc.x + 0.5 - P(cs[i]).x, npc.y + 0.5 - P(cs[i]).y) > 4) fail(`${npc.name} is stuck at ${npc.x},${npc.y} and does not follow ${name(i)} (at ${P(cs[i]).x.toFixed(1)},${P(cs[i]).y.toFixed(1)})`);
          await followSteps(i, [s]);
          if (s.portal) await sleep(500);
        }
        if (blocker !== null) {
          await openWay(i, thing(steps[blocker].blocker), steps[blocker].tile, { noJump: true });
          // Both walk through while it is open: a few tiles at a time, waiting for the character.
          const through = findPath(i, tileOf(P(cs[i])), goalTiles, { noJump: true });
          if (!through) fail(`${name(i)} cannot take ${npc.name} across ${steps[blocker].blocker}`);
          for (const s of through) {
            const t0 = Date.now();
            while (Math.hypot(npc.x + 0.5 - P(cs[i]).x, npc.y + 0.5 - P(cs[i]).y) > 1.8 && Date.now() - t0 < 3000) { input(cs[i], 0, 0); await sleep(60); }
            await followSteps(i, [s]);
          }
        }
      }
    }

    // ---- play the plan ----
    const sets = r.players.map((p) => p.abilities);
    const solved = solve(r.zone, r.mission, sets);
    if (!solved.ok) fail(`the solver says this mission cannot be finished with ${players} players: ${solved.problems.join('; ')}`);
    log(`${solved.plan.length} steps planned`);
    let n = 0;
    for (const e of solved.plan) {
      n++;
      if (process.env.PLAY_DEBUG) console.log(`step ${n}: ${JSON.stringify(e)}`);
      try { await runStep(e); } catch (err) { if (err.finished) break; if (err.play) err.message = `step ${n}/${solved.plan.length} (${e.k} ${e.a || ''} ${e.thing || ''} by ${e.i !== undefined ? name(e.i) : '?'}): ${err.message}`; throw err; }
      if (host.last.roster.phase === 'done') break;
    }
    // A sequence of pads: pressed in the order the clues give.
    if (r.mission.goal.type === 'sequence' && host.last.roster.phase !== 'done') {
      for (const id of r.mission.goal.order) {
        const pad = thing(id), ability = pad.def.by || 'push', i = owners(ability)[0];
        if (i === undefined) fail(`nobody has ${ability} to press ${pad.name}`);
        await goNear(i, id, ability);
        await act1(i, pad, ability);
      }
    }
    const t0 = Date.now();
    while (host.last.roster.phase !== 'done' && Date.now() - t0 < 4000) await sleep(100);
    const done = host.last.roster;
    if (done.phase !== 'done') fail(`all ${solved.plan.length} steps were done but the mission did not end (progress ${JSON.stringify(done.progress)})`);
    if (!done.result?.completed) fail(`the mission ended without being completed: ${JSON.stringify(done.result)}`);
    return { ok: true, steps: solved.plan.length, seconds: Math.round(done.result.seconds) };
  } catch (e) {
    if (!e.play) throw e;
    return { ok: false, reason: e.message };
  } finally {
    await app.close();
  }
}

// ---- the command line ----
async function main() {
  const [pack, mission, n] = process.argv.slice(2);
  if (pack && mission) {
    const res = await playMission({ missionId: mission, players: Number(n) || 2, log: (m) => console.log('  ' + m) });
    console.log(res.ok ? `PASS ${mission} (${n || 2} players): ${res.steps} steps, ${res.seconds} s of game time` : `FAIL ${mission} (${n || 2} players): ${res.reason}`);
    process.exit(res.ok ? 0 : 1);
  }
  // Every mission of every pack (or one pack), each in its own process, a few at a time.
  const contentDir = path.join(root, 'data');
  const abilities = await loadAbilities(contentDir);
  const it = JSON.parse(await fs.readFile(path.join(contentDir, 'items.json'), 'utf8'));
  const items = { list: it.items, byId: Object.fromEntries(it.items.map((i) => [i.id, i])) };
  const content = await loadContent(contentDir, { abilities, items });
  const jobs = [];
  for (const z of Object.values(content.zones).filter((z) => z.spawns.length && (!pack || z.pack === pack))) {
    for (const m of content.missions.filter((m) => m.zone === z.id)) for (const k of [2, 3]) jobs.push([z.pack, m.id, k]);
    for (const k of [2, 3]) jobs.push([z.pack, `whole:${z.id}`, k]);
  }
  const results = [];
  const run = (job) => new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...job.map(String)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => { const line = out.split('\n').find((l) => /^(PASS|FAIL)/.test(l)) || `FAIL ${job[1]} (${job[2]} players): ${out.trim().split('\n').slice(-3).join(' | ')}`; results.push({ job, line, ok: code === 0 }); console.log(`${job[0].padEnd(8)} ${line}`); resolve(); });
  });
  const queue = [...jobs], workers = Array.from({ length: Math.min(4, jobs.length) }, async () => { while (queue.length) await run(queue.shift()); });
  await Promise.all(workers);
  const bad = results.filter((x) => !x.ok);
  console.log(`\n${results.length - bad.length} of ${results.length} playthroughs finished${bad.length ? `; ${bad.length} did not` : ''}.`);
  process.exit(bad.length ? 1 : 0);
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
