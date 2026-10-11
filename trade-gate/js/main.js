// Start-up, the game loop, and the flow between screens:
//   lobby -> level select -> level -> win -> level select ...

import { loadAll, resolveLevel, validateLevel } from './levels.js';
import { assignRoles } from './roles.js';
import { createInput } from './input.js';
import { createWorld, updateWorld, goalProgress } from './world.js';
import { updateGateUI, completeGate, cancelGate, releaseHint } from './trade.js';
import { buildSprites } from './sprites.js';
import { createRenderer } from './render.js';
import { createTeacherPanel } from './teacher.js';
import { createSync } from './sync.js';
import { play, setMuted } from './audio.js';
import { fmt } from './util.js';

const SETTINGS_KEY = 'trade-gate-settings';
const params = new URLSearchParams(location.search);
const $ = (sel) => document.querySelector(sel);

loadAll()
  .then(({ config, levels }) => (params.has('teacher') ? bootTeacher(config, levels) : bootGame(config, levels)))
  .catch((err) => {
    console.error(err);
    const box = $('#error');
    box.hidden = false;
    box.textContent = `Could not start the game: ${err.message}. Check the JSON files in the data folder.`;
  });

// ---------- teacher window (?teacher=1) ----------
function bootTeacher(config, levels) {
  document.body.classList.add('teacher-only');
  $('#hub-link').hidden = true;
  document.title = `${config.title} - teacher`;
  const sync = createSync();
  const root = $('#teacher');
  root.hidden = false;
  const panel = createTeacherPanel(root, { config, levels, standalone: true, send: (cmd) => sync.send({ type: 'cmd', cmd }) });
  // Until the game window answers, show the first level so the buttons and
  // questions are readable.
  panel.update({
    offline: true, screen: 'lobby', levelIdx: 0, playerCount: 0, paused: false,
    settings: { ...config.settings }, activeGate: null, gates: {}, stats: null, goal: null,
  });
  sync.on((msg) => { if (msg.type === 'state') panel.update(msg.state); });
  sync.send({ type: 'hello' });
}

// ---------- game window ----------
function bootGame(config, levels) {
  const T = config.text;
  const order = config.resourceOrder;

  // Settings start from config.json; the teacher's last choices are remembered.
  const settings = { ...config.settings };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* storage off */ }
  setMuted(settings.muted);

  const game = {
    screen: 'lobby', config, levels, text: T, settings,
    players: [], world: null,
    levelIdx: 0, selectIdx: 0, levelInfo: [],
    paused: false, pauseMsg: '', lost: null,
    clock: 0,
  };
  const input = createInput();
  const renderer = createRenderer($('#game'), $('#stage'), buildSprites(config));
  const sync = createSync();
  const teacherEl = $('#teacher');
  const hubLink = $('#hub-link');
  const panel = createTeacherPanel(teacherEl, { config, levels, standalone: false, send: handleCommand });

  function addPlayer(device) {
    const i = game.players.length, pc = config.players[i];
    game.players.push({ id: pc.id, index: i, name: pc.name, color: pc.color, device, inv: {}, x: 0, y: 0 });
    play('join');
  }

  // Works out, for each level, how it plays with the players who joined.
  function refreshLevelInfo() {
    const n = game.players.length;
    const roles = assignRoles(n, order);
    game.players.forEach((p, i) => Object.assign(p, { collects: roles[i].collects, spends: roles[i].spends }));
    game.levelInfo = levels.map((level) => {
      const resolved = resolveLevel(level, n, order);
      const problems = validateLevel(resolved, roles);
      if (problems.length) console.warn(`${level.id} with ${n} players:`, problems);
      let note = '';
      if (problems.length) note = fmt(T.notReady, { m: n });
      else if (n < resolved.authoredPlayers) note = fmt(T.adapted, { n: level.players, m: n });
      else if (n > resolved.authoredPlayers) note = fmt(T.extra, { n: level.players });
      return { resolved, ok: problems.length === 0, note };
    });
  }

  function startLevel(idx) {
    if (game.players.length < 2 || !levels[idx]) return;
    refreshLevelInfo();
    const info = game.levelInfo[idx];
    game.selectIdx = idx;
    if (!info.ok) { game.screen = 'select'; play('deny'); return; }
    game.levelIdx = idx;
    game.world = createWorld(info.resolved, game.players, settings, T);
    game.screen = 'play';
    game.paused = false;
    game.pauseMsg = '';
    play('gate');
  }

  // Everything the teacher can do, from the panel in this window or the other.
  function handleCommand(cmd) {
    const w = game.screen === 'play' ? game.world : null;
    const gate = w && w.gates.find((g) => g.def.id === cmd.gate);
    switch (cmd.type) {
      case 'hint': if (gate && gate === w.activeGate) releaseHint(w, gate, cmd.n); break;
      case 'force': if (gate && gate.status !== 'open') completeGate(w, gate); break;
      case 'skip': if (w) cancelGate(w); break;
      case 'bonus': if (w) { w.stats.bonus++; play('bonus'); } break;
      case 'pause': if (w && !game.lost) { game.paused = !game.paused; game.pauseMsg = ''; } break;
      case 'restart': if (w) startLevel(game.levelIdx); break;
      case 'level':
        if (game.players.length >= 2) startLevel(cmd.index);
        else game.selectIdx = cmd.index;
        break;
      case 'set':
        if (!(cmd.key in settings)) break;
        settings[cmd.key] = cmd.value;
        setMuted(settings.muted);
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage off */ }
        break;
    }
  }

  // What the teacher panel needs to know. Sent whenever it changes.
  function snapshot() {
    const live = game.world && (game.screen === 'play' || game.screen === 'win');
    const w = game.world;
    return {
      screen: game.screen,
      levelIdx: live ? game.levelIdx : game.selectIdx,
      playerCount: game.players.length,
      paused: game.paused,
      settings: { ...settings },
      activeGate: live && game.screen === 'play' && w.activeGate ? w.activeGate.def.id : null,
      gates: live ? Object.fromEntries(w.gates.map((g) => [g.def.id, { status: g.status, hints: g.hints }])) : {},
      stats: live ? { ...w.stats, time: Math.floor(w.stats.time) } : null,
      goal: live ? goalProgress(w) : null,
    };
  }
  let lastSent = '';
  function shareState(force) {
    const snap = snapshot();
    const str = JSON.stringify(snap);
    if (!force && str === lastSent) return;
    lastSent = str;
    panel.update(snap);
    sync.send({ type: 'state', state: snap });
  }
  sync.on((msg) => {
    if (msg.type === 'hello') shareState(true);
    else if (msg.type === 'cmd') { handleCommand(msg.cmd); shareState(true); }
  });
  window.tradeGate = game; // handy in the browser console when testing

  // A player's controller was unplugged: pause until it is back, or until
  // someone presses A on a controller that nobody is using.
  function checkControllers() {
    const lost = game.players.filter((p) => p.device.startsWith('pad') && !input.device(p.device).connected);
    if (lost.length) {
      game.paused = true;
      game.lost = lost;
      for (const id of input.ids()) {
        const free = id.startsWith('pad') && !game.players.some((p) => p.device === id);
        if (free && input.device(id).pressed.a) { lost[0].device = id; break; }
      }
    } else if (game.lost) {
      game.lost = null;
      game.pauseMsg = T.reconnected;
    }
  }

  function update(dt) {
    input.poll();
    game.clock += dt;

    if (input.key('KeyT')) {
      // The game moves over to make room for the panel.
      teacherEl.hidden = !teacherEl.hidden;
      document.body.classList.toggle('panel-open', !teacherEl.hidden);
      renderer.resize();
    }
    if (input.key('KeyM')) handleCommand({ type: 'set', key: 'muted', value: !settings.muted });
    if (input.key('KeyG')) handleCommand({ type: 'bonus' });

    const devs = game.players.map((p) => input.device(p.device));
    const anyA = devs.some((d) => d.pressed.a);
    const anyStart = devs.some((d) => d.pressed.start);
    const esc = input.key('Escape');

    if (game.screen === 'lobby') {
      for (const id of input.ids()) {
        const taken = game.players.some((p) => p.device === id);
        if (!taken && game.players.length < 4 && input.device(id).pressed.a) addPlayer(id);
      }
      if (esc) game.players = [];
      if (game.players.length >= 2 && (input.key('Space') || anyStart)) {
        refreshLevelInfo();
        game.screen = 'select';
      }
    } else if (game.screen === 'select') {
      const step = (devs.find((d) => d.nav.y) || { nav: { y: 0 } }).nav.y;
      if (step) {
        game.selectIdx = (game.selectIdx + step + levels.length) % levels.length;
        play('key');
      }
      if (esc) game.screen = 'lobby';
      else if (anyA) startLevel(game.selectIdx);
    } else if (game.screen === 'play') {
      const w = game.world;
      checkControllers();
      if (!game.lost && (esc || anyStart || input.key('KeyP'))) {
        game.paused = !game.paused;
        game.pauseMsg = '';
      }
      if (!game.paused) {
        game.players.forEach((p, i) => { p.showRole = !!devs[i].down.x; p.showPhrases = !!devs[i].down.y; });
        w.stats.time += dt;
        if (w.activeGate) {
          updateGateUI(w, game.players, devs, { digits: input.digits(), backspace: input.key('Backspace') }, dt);
        } else {
          updateWorld(w, game.players, devs, dt);
        }
        if (w.won) game.screen = 'win';
      }
      w.events.splice(0).forEach(play);
    } else if (game.screen === 'win') {
      if (anyA || input.key('Space')) {
        game.selectIdx = Math.min(game.levelIdx + 1, levels.length - 1);
        refreshLevelInfo();
        game.screen = 'select';
      }
    }
  }

  let last = performance.now();
  let frames = 0;
  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    update(dt);
    renderer.draw(game);
    hubLink.hidden = game.screen !== 'lobby';
    if (frames++ % 10 === 0) shareState(false);
    requestAnimationFrame(frame);
  }

  quickStart();
  requestAnimationFrame(frame);

  // For testing a level without going through the lobby:
  //   index.html?level=level-3&players=4          (P1 = WASD, P2 = arrows)
  //   ...&gate=g2   opens that gate's card        ...&screen=select | win
  function quickStart() {
    if (!params.has('level') && !params.has('screen')) return;
    const n = Math.max(2, Math.min(4, Number(params.get('players')) || 2));
    ['kb1', 'kb2', 'none3', 'none4'].slice(0, n).forEach(addPlayer);
    refreshLevelInfo();
    const idx = Math.max(0, levels.findIndex((l) => l.id === params.get('level')));
    if (params.get('screen') === 'select') { game.screen = 'select'; return; }
    startLevel(idx);
    const w = game.world;
    const gate = w && w.gates.find((g) => g.def.id === params.get('gate'));
    if (gate) {
      gate.def.transfers.forEach((t) => { w.byId[t.from].inv[t.res] = t.amount; });
      gate.status = 'active';
      gate.hints = Number(params.get('hints')) || 0;
      gate.pickOk = params.has('picked');
      w.activeGate = gate;
    }
    if (params.get('screen') === 'win') game.screen = 'win';
  }
}
