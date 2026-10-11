// Host screen: the lobby (group, QR code, players) and the shared map.
import { connect, api, getPin, askPin, esc } from '../shared/net.js';
import { PLAYER_COLORS } from '../shared/pixel.js';
import { createScene, drawScene, fitCanvas, smooth } from '../shared/render.js';
import { play, isMuted, setMuted } from '../shared/audio.js';

const $ = (s) => document.querySelector(s);
const ROOM_KEY = 'li-host-room';        // lets a reloaded host page keep its room
const GROUP_KEY = 'li-last-group';

let room = null;                        // { code, hostKey, joinUrl, ... }
let roster = { phase: 'lobby', group: null, players: [] };
let groups = [];
let scene = null;
const players = new Map();              // id -> what we draw
let fx = [];                            // ability icons floating over players
let beams = [];                         // the monster's shots, for a moment after they fire
let things = [];                        // objects on the map and their state
let rosterAt = 0;                       // when the last roster arrived (the clock runs on from there)

const saved = () => { try { return JSON.parse(sessionStorage.getItem(ROOM_KEY) || '{}'); } catch { return {}; } };

const socket = connect({
  onOpen: (s) => s.send({ t: 'host', pin: getPin(), room: saved().code, hostKey: saved().hostKey }),
  onStatus: (up) => { $('#offline').hidden = up; },
  onMessage(m) {
    if (m.t === 'room') {
      room = m;
      try { sessionStorage.setItem(ROOM_KEY, JSON.stringify({ code: m.code, hostKey: m.hostKey })); } catch { /* private mode */ }
      renderRoom();
      pickSavedGroup();
    } else if (m.t === 'roster') {
      if (m.phase === 'lobby' && m.players.length > roster.players.length) play('join');
      if (m.phase === 'done' && roster.phase === 'play') play(m.result?.completed ? 'win' : 'bad');
      if (m.phase === 'play' && m.progress && roster.progress && m.progress.have > roster.progress.have) play('good');
      roster = m;
      rosterAt = performance.now();
      const ids = new Set(m.players.map((p) => p.id));
      for (const id of players.keys()) if (!ids.has(id)) players.delete(id);
      for (const p of m.players) players.set(p.id, { ...(players.get(p.id) || {}), ...p });
      renderLobby();
    } else if (m.t === 'world') {
      scene = createScene(m.zone);
      renderLobby();
    } else if (m.t === 'state') {
      for (const [id, x, y, dir, moving, stun] of m.p) {
        const p = players.get(id);
        if (p) Object.assign(p, { tx: x, ty: y, dir, moving: !!moving, stun: !!stun });
      }
    } else if (m.t === 'things') {
      things = m.list;
    } else if (m.t === 'beam') {
      beams.push({ dir: m.dir, at: m.at, until: performance.now() / 1000 + 0.7 });
      play('beam');
    } else if (m.t === 'fx') {
      fx.push({ by: m.by, a: m.a, until: performance.now() / 1000 + 1.4 });
      play(m.a === 'heal' ? 'heal' : 'tap');
    } else if (m.t === 'error') {
      if (m.code === 'pin') { if (askPin()) socket.send({ t: 'host', pin: getPin() }); return; }
      showError(m.msg);
    }
  },
});

// ---------- lobby ----------
function renderRoom() {
  $('#qr').src = room.qr;
  $('#code').textContent = room.code;
  $('#play-code').textContent = room.code;
  $('#teacher-link').href = `../teacher/?room=${room.code}`;
  // Short enough to type by hand: the address alone opens the join page, which asks for the code.
  $('#url').textContent = room.joinUrl.replace(/^https?:\/\//, '').replace(/\/phone\/.*$/, '');
  const warn = $('#net-warn');
  warn.hidden = room.network.ok;
  if (!room.network.ok) warn.textContent = 'No network found. Connect this computer to Wi-Fi or to a phone hotspot. The QR code will update by itself.';
}

function renderLobby() {
  const playing = roster.phase !== 'lobby';             // the map stays up for the mission-complete screen
  $('#lobby').hidden = playing;
  $('#play').hidden = !playing;
  $('#mission').textContent = roster.mission ? roster.mission.title : '';
  $('#paused').hidden = !(roster.phase === 'play' && roster.paused);
  renderDone();
  $('#play-group').textContent = roster.group ? roster.group.name : '';
  // The shared goal. Only counts: clue texts and card questions never reach this screen.
  const pr = roster.progress;
  $('#goal').hidden = !pr;
  if (pr) {
    $('#goal-text').textContent = `${pr.label}: ${pr.have} of ${pr.need}` + (pr.ready && pr.bringTo ? ` · carry them all to the ${pr.bringTo.toLowerCase().split(' ').pop()}!` : '');
    $('#goal-fill').style.width = `${(100 * pr.have) / pr.need}%`;
  }

  const n = roster.players.length;
  $('#count').textContent = `${n} of ${roster.max || 6}`;
  $('#players-empty').hidden = n > 0;
  $('#players').innerHTML = roster.players.map((p) => `
    <li class="${p.online ? '' : 'off'}">
      <span class="dot" style="background:${PLAYER_COLORS[p.ci % PLAYER_COLORS.length]}"></span>
      <span class="name">${esc(p.name)}</span>
      ${p.online ? '' : '<span class="state">away</span>'}
      <button type="button" data-kick="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">✕</button>
    </li>`).join('');

  const g = roster.group;
  $('#group-info').textContent = g
    ? `Level ${g.level} · Monster: ${g.monster} · ${g.island.sessions} sessions played · ${g.island.stars} stars`
    : 'Choose a group, or create one. Each group keeps its own island.';
  if (g && $('#group').value !== g.id) $('#group').value = g.id;
  // The island so far.
  const marks = scene?.zone.landmarks || [];
  $('#island').hidden = $('#island-note').hidden = !g || !marks.length;
  if (g && marks.length) {
    const n = marks.filter((l) => g.island.landmarks.includes(l.id)).length;
    $('#island-note').textContent = n === 0 ? `The island of ${g.name}: everything is in ruins. Every mission restores something!`
      : n === marks.length ? `The island of ${g.name} is complete! ${g.island.stars} stars.`
      : `The island of ${g.name}: ${n} of ${marks.length} landmarks restored · ${g.island.stars} stars`;
  }
  $('#start').disabled = !g || n < 2;
  $('#start').textContent = !g ? 'Choose a group to start' : n < 2 ? 'Waiting for 2 to 6 players' : 'Start a quick mission';
  if (g && n >= 2) showError('');
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pretty = (id) => id.replace(/-/g, ' ');

// Mission complete: what was restored, stars, and the team's numbers.
function renderDone() {
  const r = roster.phase === 'done' ? roster.result : null;
  $('#done').hidden = !r;
  if (!r) return;
  $('#done-title').textContent = r.completed ? 'Mission complete!' : 'Mission over';
  $('#done-restore').textContent = r.completed ? (r.restore ? `You restored ${r.restore}. Look at the island!` : 'The island is complete. You did it together!') : `"${r.title}" was stopped. Try again next time!`;
  if (r.completed && r.opened?.length) $('#done-restore').textContent += ` A new place has opened: ${r.opened.join(', ')}!`;
  $('#done-stars').innerHTML = r.completed ? '★'.repeat(r.stars) + `<span class="off">${'★'.repeat(3 - r.stars)}</span>` : '';
  const rows = [['Time', mmss(r.seconds)], ['Challenges solved', r.solved], ['Clues found', r.clues], ['Abilities used', r.acts], ['Hints used', r.hints]];
  if (r.monster) rows.push(['Monster chased away', r.slays]);
  $('#done-stats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

function showError(text) {
  $('#error').textContent = text || '';
  $('#error').hidden = !text;
}

async function loadGroups() {
  try { groups = await api('/groups'); } catch (e) { showError(e.message); return; }
  $('#group').innerHTML = '<option value="">Choose a group…</option>' +
    groups.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  if (roster.group) $('#group').value = roster.group.id;
  pickSavedGroup();
}

// After a reload, go back to the group that was used last on this computer.
function pickSavedGroup() {
  if (!room || roster.group || !groups.length) return;
  let last = '';
  try { last = localStorage.getItem(GROUP_KEY) || ''; } catch { /* private mode */ }
  if (groups.some((g) => g.id === last)) chooseGroup(last);
}

function chooseGroup(id) {
  if (!id) return;
  try { localStorage.setItem(GROUP_KEY, id); } catch { /* private mode */ }
  socket.send({ t: 'group', id });
}

$('#group').addEventListener('change', (e) => chooseGroup(e.target.value));
$('#new-group').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#new-name').value.trim();
  if (!name) return $('#new-name').focus();
  try {
    const g = await api('/groups', { method: 'POST', body: { name } });
    $('#new-name').value = '';
    await loadGroups();
    chooseGroup(g.id);
  } catch (err) { showError(err.message); }
});
$('#players').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kick]');
  if (b) socket.send({ t: 'kick', id: b.dataset.kick });
});
$('#start').addEventListener('click', () => socket.send({ t: 'start' }));
$('#to-lobby').addEventListener('click', () => socket.send({ t: 'lobby' }));
const showMute = () => { for (const b of document.querySelectorAll('.mute')) b.textContent = isMuted() ? 'Sound: off' : 'Sound: on'; };
for (const b of document.querySelectorAll('.mute')) b.addEventListener('click', () => { setMuted(!isMuted()); showMute(); play('tap'); });
showMute();
$('#full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});

// Test players: each window gets its own number so they do not share one character.
let testN = 0;
$('#test-player').addEventListener('click', () => {
  if (!room) return;
  testN++;
  window.open(`/phone/?room=${room.code}&p=${Date.now() % 100000}${testN}`, '_blank', `width=400,height=760,left=${40 + testN * 60},top=60`);
});

// ---------- map ----------
const canvas = $('#map');
const g2d = canvas.getContext('2d');
let before = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - before) / 1000);
  before = now;
  if (roster.phase !== 'lobby' && scene) {
    fitCanvas(canvas);
    smooth(players, dt);
    g2d.fillStyle = '#131a33';
    g2d.fillRect(0, 0, canvas.width, canvas.height);
    // Fit the whole zone on screen.
    const { w, h } = scene.zone;
    const ppt = Math.min(canvas.width / w, canvas.height / h);
    const rect = { w: w * ppt, h: h * ppt, x: (canvas.width - w * ppt) / 2, y: (canvas.height - h * ppt) / 2 };
    fx = fx.filter((f) => f.until > now / 1000);
    beams = beams.filter((b) => b.until > now / 1000);
    drawScene(g2d, scene, rect, { cx: w / 2, cy: h / 2, tiles: Math.min(w, h) }, players, now / 1000, { fx, things, labels: roster.settings?.hostDetails, places: true, beams, mood: roster.phase === 'play' ? roster.mood : -1,
      restored: roster.group?.island.landmarks || [], fresh: roster.phase === 'done' ? roster.result?.restoreId : null });
    // The mission clock runs on between messages from the server. It turns yellow after the target time; nothing else happens.
    const running = roster.phase === 'play' && !roster.paused;
    const secs = (roster.phase === 'done' ? roster.result?.seconds : roster.clock + (running ? (now - rosterAt) / 1000 : 0)) || 0;
    const target = (roster.mission?.minutes || 0) * 60;
    $('#clock').hidden = !roster.settings?.timer;
    $('#clock').textContent = `${mmss(secs)} / ${mmss(target)}`;
    $('#clock').classList.toggle('late', secs > target);
  }
  // In the lobby: the group's island, with what they have restored.
  const isle = $('#island');
  if (roster.phase === 'lobby' && scene && roster.group && !isle.hidden) {
    fitCanvas(isle);
    const { w, h } = scene.zone, ppt = Math.min(isle.width / w, isle.height / h);
    drawScene(isle.getContext('2d'), scene, { x: (isle.width - w * ppt) / 2, y: (isle.height - h * ppt) / 2, w: w * ppt, h: h * ppt }, { cx: w / 2, cy: h / 2, tiles: Math.min(w, h) }, new Map(), now / 1000, { restored: roster.group.island.landmarks });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

loadGroups();
