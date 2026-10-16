// Teacher panel, Live game tab: the map, the tablets with their answers and hints, characters to
// play, the players, rescue buttons, live settings, the mission builder and the session notes.
// Answers and codes are only ever sent to this page, never to the host screen or the phones.
import { api, esc, connect, getPin, askPin, upload } from '../shared/net.js';
import { PLAYER_COLORS } from '../shared/pixel.js';
import { createScene, drawScene, fitCanvas, smooth } from '../shared/render.js';

const $ = (s) => document.querySelector(s);
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const TYPE = { choice: 'Choice', typed: 'Typed answer', spelling: 'Spelling', code: 'Code card (you check)', link: 'Link (through a helper)', courier: 'Courier (a letter)' };

const params = new URLSearchParams(location.search);
const stored = (k) => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } };
let watching = (params.get('room') || (params.get('match') ? '' : stored('li-watch')) || '').toUpperCase();
// Competitive mode: the match this panel follows (all its teams), and the overview the server sends.
let matchId = (params.get('match') || (params.get('room') ? '' : stored('li-watch-match')) || '').toUpperCase();
let match = null, matchAt = 0, team = null;
let defs = { abilities: [], items: [] };
let roster = null, queue = null, scene = null, things = [];
const players = new Map();
let mon = null;                    // the monster, as the server reports it to the teacher
let beams = [];
let aim = null;                    // the player being teleported: next click on the map places them
let notesFor = null;               // the group whose notes are in the box

const showError = (text) => { $('#error').textContent = text || ''; $('#error').hidden = !text; };
const cmd = (c, extra = {}) => socket.send({ t: 'cmd', c, ...extra });
const hello = () => { if (watching || matchId) socket.send({ t: 'teacher', pin: getPin(), room: watching, match: matchId || undefined }); };

const socket = connect({
  onOpen: hello,
  onStatus: (up) => { if (!up && watching) $('#live-status').textContent = 'Connection lost. Reconnecting…'; },
  onMessage(m) {
    if (m.t === 'watching') {
      defs = m; showError(''); $('#live-body').hidden = false;
      watching = m.room; matchId = m.match || ''; team = m.team || null;
      if (!matchId) { match = null; renderMatch(); }
      try { sessionStorage.setItem('li-watch', watching); sessionStorage.setItem('li-watch-match', matchId); } catch { /* private mode */ }
      $('#watch-room').value = matchId || watching;
    }
    else if (m.t === 'match') { match = m; matchAt = performance.now(); renderMatch(); }
    else if (m.t === 'roster') {
      roster = m;
      const ids = new Set(m.players.map((p) => p.id));
      for (const id of players.keys()) if (!ids.has(id)) players.delete(id);
      for (const p of m.players) players.set(p.id, { ...(players.get(p.id) || {}), ...p });
      renderGame(); renderPlayers();
    }
    else if (m.t === 'world') scene = createScene(m.zone);
    else if (m.t === 'things') things = m.list;
    else if (m.t === 'state') { for (const [id, x, y, dir, moving, stun] of m.p) { const p = players.get(id); if (p) Object.assign(p, { tx: x, ty: y, dir, moving: !!moving, stun: !!stun }); }
      renderStunned(); }
    else if (m.t === 'queue') { queue = m; renderQueue(); }
    else if (m.t === 'mon') { mon = m; renderMonster(); }
    else if (m.t === 'beam') beams.push({ dir: m.dir, at: m.at, until: performance.now() / 1000 + 0.7 });
    else if (m.t === 'error' && m.code === 'pin') { if (askPin()) hello(); }
    else if (m.t === 'error' && m.code === 'no-room') { $('#live-status').textContent = m.msg; $('#live-body').hidden = true; }
    else if (m.t === 'error') showError(m.msg);            // also notes from the server (code "note")
  },
});

$('#watch-room').value = matchId || watching;
$('#watch').addEventListener('submit', (e) => {
  e.preventDefault();
  // A room code or a match code: the server works out which.
  watching = $('#watch-room').value.trim().toUpperCase();
  matchId = '';
  hello();
});

// ---------- competitive mode: every team ----------
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
const matchCmd = (t, extra = {}) => socket.send({ t, ...extra });
function renderMatch() {
  $('#match-box').hidden = !match;
  if (!match) return;
  $('#match-title').textContent = `Match ${match.id} · ${match.phase === 'lobby' ? 'lobby' : match.phase === 'play' ? 'playing' : 'finished'}${match.group ? ' · ' + match.group.name : ''}`;
  $('#sabotage-on').checked = match.sabotage;
  for (const b of document.querySelectorAll('#match-box [data-match]')) b.disabled = b.dataset.match === 'match:start' ? match.phase === 'play' : b.dataset.match !== 'match:lobby' && match.phase !== 'play';
  const since = performance.now() - matchAt;
  $('#match-teams').innerHTML = match.teams.map((t) => {
    const p = t.progress, effect = t.effect && Math.max(0, Math.ceil((t.effect.left - since) / 1000));
    const status = t.place ? `Finished ${ordinal(t.place)}` : t.phase === 'play' ? (t.paused ? 'Paused' : 'Playing') : t.phase === 'done' ? 'Ended' : 'Lobby';
    return `<tr class="${t.code === watching ? 'watched' : ''}">
      <td><strong>${esc(t.name)}</strong><br><span class="muted small">${esc(t.code)}</span></td>
      <td>${t.players.filter((x) => x.online).length} / ${t.players.length}<span class="muted small"> (max ${match.roomSize})</span></td>
      <td>${status}</td>
      <td class="score">${t.score}</td>
      <td>${p.goal} of ${p.goalNeed}<br><span class="muted small">${p.clues} of ${p.cluesTotal} clues</span></td>
      <td>${t.charge ? 'Ready' : `${t.chargeClues} / ${match.cluesPerCharge} clues`}</td>
      <td>${t.effect ? `${esc(t.effect.id)} from ${esc(t.effect.from)}, ${effect} s <button class="btn btn-small" data-n="${t.n}" data-act="cancel" type="button">Cancel</button>` : t.shield ? '<span class="muted small">protected</span>' : ''}</td>
      <td><div class="row">
        <button class="btn btn-small" data-n="${t.n}" data-act="bonus" type="button" title="Bonus for good speaking">+${match.points.speaking} speaking</button>
        <input class="field" type="number" step="1" value="-5" aria-label="Points to add or take away for ${esc(t.name)}" data-pts="${t.n}">
        <button class="btn btn-small" data-n="${t.n}" data-act="adjust" type="button">Add</button>
      </div></td>
      <td><div class="row">
        <button class="btn btn-small" data-n="${t.n}" data-act="watch" type="button"${t.code === watching ? ' disabled' : ''}>Watch</button>
        ${t.phase === 'play'
          ? `<button class="btn btn-small" data-n="${t.n}" data-act="pause" type="button">${t.paused ? 'Resume' : 'Pause'}</button><button class="btn btn-small btn-danger" data-n="${t.n}" data-act="end" type="button">End</button>`
          : match.phase !== 'lobby' && t.players.length ? `<button class="btn btn-small" data-n="${t.n}" data-act="start" type="button">Start</button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
  const watched = match.teams.find((t) => t.code === watching);
  $('#match-help').textContent = `The map, tablets and players below are ${watched ? watched.name + "'s" : 'one team\'s'}. Press Watch to switch team. Points: clue ${match.points.clue}, challenge ${match.points.challenge}, obstacle ${match.points.obstacle}, monster ${match.points.monster}, finishing ${match.points.finish.join(' / ')}.`;
}
setInterval(() => { if (match?.teams.some((t) => t.effect)) renderMatch(); }, 1000);   // the effects' countdown
$('#match-box').addEventListener('click', (e) => {
  const all = e.target.closest('[data-match]');
  if (all) {
    if (all.dataset.match === 'match:end' && !confirm('End the game for every team?')) return;
    return matchCmd(all.dataset.match, all.dataset.on !== undefined ? { on: all.dataset.on === '1' } : {});
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const n = Number(b.dataset.n), t = match.teams[n];
  const act = {
    bonus: () => matchCmd('score:adjust', { n, delta: match.points.speaking }),
    adjust: () => matchCmd('score:adjust', { n, delta: Math.round(Number($(`[data-pts="${n}"]`).value)) || 0 }),
    cancel: () => matchCmd('sabotage:cancel', { n }),
    watch: () => { watching = t.code; hello(); },
    pause: () => matchCmd('match:pause', { n, on: !t.paused }),
    end: () => { if (confirm(`End the game for ${t.name}?`)) matchCmd('match:end', { n }); },
    start: () => matchCmd('match:start', { n }),
  }[b.dataset.act];
  act?.();
});
$('#sabotage-on').addEventListener('change', (e) => matchCmd('sabotage:toggle', { on: e.target.checked }));

// ---------- game controls and settings ----------
$('#set-level').innerHTML = LEVELS.map((l) => `<option>${l}</option>`).join('');
$('#set-view').innerHTML = [5, 7, 9, 11, 13, 15].map((n) => `<option value="${n}">${n} tiles across</option>`).join('');

function renderGame() {
  const r = roster, playing = r.phase === 'play';
  const where = r.phase === 'lobby' ? 'in the lobby' : r.phase === 'done' ? 'mission finished' : r.paused ? 'PAUSED' : `playing "${r.mission.title}"`;
  $('#live-status').textContent = `${team ? team.name + ' · room ' : 'Room '}${watching} · ${r.group ? r.group.name : 'no group chosen yet'} · ${r.players.length} players · ${where}`;
  $('#btn-pause').textContent = r.paused ? 'Resume' : 'Pause';
  $('#btn-mix').textContent = r.dealMode === 'random' ? 'Random mix: on' : 'Random mix: off';
  for (const b of document.querySelectorAll('#tab-live [data-cmd]')) if (!['star', 'lobby'].includes(b.dataset.cmd)) b.disabled = !playing;
  for (const b of document.querySelectorAll('#monster-box [data-mon], #monster-box select')) b.disabled = !playing;
  // The level list also holds a custom label, if the group uses one.
  const level = r.group?.level || 'A2';
  if (![...$('#set-level').options].some((o) => o.value === level)) $('#set-level').add(new Option(level, level));
  $('#set-level').value = level;
  $('#set-view').value = String(r.settings.view);
  for (const box of document.querySelectorAll('[data-set]')) box.checked = !!r.settings[box.dataset.set];
  renderChatTargets();
  renderRoles();
  $('#m-start').disabled = $('#m-quick').disabled = !r.group || r.players.length < 2;
  // Session notes belong to the group: load them once per group, then they are yours to type in.
  if (r.group && notesFor !== r.group.id) { notesFor = r.group.id; $('#live-notes').value = r.group.notes || ''; }
  renderStats();
}
// The team's numbers for this mission.
function renderStats() {
  const r = roster, q = queue, p = r?.progress;
  if (!r || r.phase === 'lobby') { $('#live-stats').textContent = ''; return; }
  $('#live-stats').textContent = [p && `${p.label}: ${p.have} of ${p.need}${p.coins === undefined ? '' : ` · ${p.coins} coins`}`, q && `Solved ${q.stats.solved}`, q && `Wrong answers ${q.stats.wrong}`, q && `Hints ${q.stats.hints}`, q && `Clues found ${q.found}`, r.group && `Team stars ${r.group.island.stars}`].filter(Boolean).join(' · ');
}

document.querySelector('#tab-live').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]');
  if (!b || !roster) return;
  const c = b.dataset.cmd;
  if (c === 'pause') cmd('pause', { on: !roster.paused });
  else if (c === 'shuffle') cmd('shuffle', { mode: roster.dealMode });
  else if (c === 'mix') cmd('shuffle', { mode: roster.dealMode === 'random' ? 'preset' : 'random' });
  else if (c === 'reset') { if (confirm('Reset the zone?\n\nDoors, chests, the bridge and the tablets go back to the start, and players lose what they carry. The cards stay the same.')) cmd('reset'); }
  else if (c === 'end') { if (confirm('End this mission now?\n\nIt will not count as completed.')) cmd('end'); }
  else cmd(c);
});
$('#set-level').addEventListener('change', (e) => cmd('level', { level: e.target.value }));
$('#set-view').addEventListener('change', (e) => cmd('set', { key: 'view', value: Number(e.target.value) }));
document.querySelector('#tab-live').addEventListener('change', (e) => { if (e.target.dataset.set) cmd('set', { key: e.target.dataset.set, value: e.target.checked }); });
// ---------- the monster and its roles ----------
const PHASE = { wander: 'wandering', chase: 'CHASING', shoot: 'SHOOTING' };
function renderMonster() {
  const m = mon;
  if (!m || m.off) { $('#mon-status').textContent = '· off'; $('#mon-anger').style.width = '0'; $('#mon-phase').textContent = ''; $('#mon-level').value = 'off'; return; }
  $('#mon-status').textContent = m.on ? `· ${m.frozen ? 'FROZEN · ' : ''}needs ${m.hp} more hit${m.hp === 1 ? '' : 's'}` : m.away > 0 ? `· chased away, back in ${m.away} s` : '· sent away';
  $('#mon-anger').style.width = `${m.anger}%`;
  $('#mon-phase').textContent = m.on ? PHASE[m.phase] + (m.warn ? ' · taking aim!' : '') : '';
  $('#mon-freeze').textContent = m.frozen ? 'Unfreeze' : 'Freeze';
  if (document.activeElement?.closest?.('#monster-box')?.tagName !== 'SELECT') {
    $('#mon-level').value = m.level; $('#mon-force').value = m.forced || 'auto'; $('#mon-speed').value = String(m.speedMul);
  }
}
function renderRoles() {
  const r = roster, players = r.players.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  for (const sel of document.querySelectorAll('[data-role]')) {
    sel.innerHTML = `${players}<option value="teacher">Me (the teacher)</option>`;
    sel.value = r.roles[sel.dataset.role] || '';
  }
  $('#set-rotate').value = String(r.settings.rotateMinutes);
  $('#mon-hit').hidden = r.roles.slayer !== 'teacher';
  if (!r.monster) renderMonster();
  renderStunned();
}
// Stunned students. If you are the Healer, they must ask you, and you press Heal.
let stunnedSig = '';
function renderStunned() {
  if (!roster) return;
  const list = roster.players.filter((p) => players.get(p.id)?.stun), mine = roster.roles.healer === 'teacher';
  const sig = list.map((p) => p.id).join() + mine;
  if (sig === stunnedSig) return;
  stunnedSig = sig;
  $('#stunned').innerHTML = list.map((p) => `<span class="pill"><b>${esc(p.name)}</b>&nbsp;is stunned&nbsp;<button class="btn btn-small" type="button" data-heal="${esc(p.id)}" style="width:auto">${mine ? 'Heal' : 'Heal anyway'}</button></span>`).join('');
}
$('#monster-box').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mon]'), h = e.target.closest('[data-heal]');
  if (b) cmd('monster', { do: b.dataset.mon === 'freeze' && mon?.frozen ? 'unfreeze' : b.dataset.mon });
  if (h) cmd('heal', { p: h.dataset.heal });
});
$('#monster-box').addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'mon-level') cmd('monsterSet', { level: t.value });
  if (t.id === 'mon-force') cmd('monsterSet', { phase: t.value });
  if (t.id === 'mon-speed') cmd('monsterSet', { speed: Number(t.value) });
  if (t.id === 'set-rotate') cmd('set', { key: 'rotateMinutes', value: Number(t.value) });
  if (t.dataset.role) cmd('role', { role: t.dataset.role, p: t.value });
});

// ---------- chat and helpers ----------
const HELPER = { listening: 'Listening Helper', reading: 'Reading Helper' };
const keep = (sel, html) => { const v = sel.value; sel.innerHTML = html; sel.value = v; if (sel.selectedIndex < 0) sel.selectedIndex = 0; };
function renderChatTargets() {
  const r = roster, players = r.players.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  const name = (id) => r.players.find((p) => p.id === id)?.name;
  keep($('#chat-to'), `<option value="all">Everyone</option>${Object.keys(HELPER).map((k) => `<option value="${k}">${HELPER[k]}${name(r.helpers[k]) ? ' (' + esc(name(r.helpers[k])) + ')' : ' (nobody yet)'}</option>`).join('')}<option value="random">A random student</option>${players}`);
  for (const sel of document.querySelectorAll('[data-helper]')) {
    sel.innerHTML = `<option value="">Nobody</option><option value="random">Choose at random</option>${players}`;
    sel.value = r.helpers[sel.dataset.helper] || '';
  }
}
document.querySelector('#tab-live').addEventListener('change', (e) => { if (e.target.dataset.helper) cmd('helper', { role: e.target.dataset.helper, p: e.target.value || null }); });
function chatKind() {
  const kind = $('#chat-kind').value;
  $('#chat-url-row').hidden = kind === 'text';
  $('#chat-upload').hidden = kind === 'link' || kind === 'text';
  $('#chat-url').placeholder = kind === 'link' ? 'https://… (video, article, any web page)' : 'Upload a file, or paste an address';
}
$('#chat-kind').addEventListener('change', chatKind);
$('#chat-upload').addEventListener('click', () => {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: $('#chat-kind').value === 'audio' ? 'audio/*' : 'image/*' });
  input.onchange = async () => { try { showError(''); $('#chat-url').value = await upload(input.files[0]); } catch (err) { showError(err.message); } };
  input.click();
});
$('#chat').addEventListener('submit', (e) => {
  e.preventDefault();
  const kind = $('#chat-kind').value;
  if (!$('#chat-text').value.trim() && !$('#chat-url').value.trim()) return;
  showError('');
  cmd('msg', { to: $('#chat-to').value, kind, text: $('#chat-text').value, url: kind === 'text' ? '' : $('#chat-url').value.trim(), shareable: $('#chat-share').checked });
  $('#chat-text').value = ''; $('#chat-url').value = '';
});
function renderChat() {
  const players = roster ? roster.players.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') : '';
  $('#chat-list').innerHTML = [...queue.messages].reverse().map((m) => `
    <article class="msg ${m.shareable && !m.unlock ? 'locked' : ''}" data-m="${esc(m.id)}">
      <p><b>${m.from === 'Teacher' ? 'To' : esc(m.from) + ' to'} ${esc(m.to.join(', '))}</b>${m.shared.length ? ` · shared with ${esc(m.shared.join(', '))}` : ''}${m.shareable ? ` · <b>${m.unlock ? 'unlocked for ' + (m.unlock === 'any' ? 'anyone' : esc(m.unlock)) : 'LOCKED'}</b>` : ''}</p>
      ${m.text ? `<p>${esc(m.text)}</p>` : ''}
      ${m.url ? `<p class="small"><a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.url)}</a></p>` : ''}
      <div class="row">
        <select class="field small" aria-label="Student"><option value="any">Anyone</option>${players}</select>
        ${m.shareable ? `<button class="btn btn-small" type="button" data-chat="unlock">Unlock sharing for</button>${m.unlock ? '<button class="btn btn-small" type="button" data-chat="lock">Lock</button>' : ''}` : ''}
        <button class="btn btn-small" type="button" data-chat="forward">Send it to</button>
        <button class="btn btn-small btn-danger" type="button" data-chat="revoke">Remove</button>
      </div>
    </article>`).join('');
}
$('#chat-list').addEventListener('click', (e) => {
  const act = e.target.closest('[data-chat]')?.dataset.chat, box = e.target.closest('[data-m]');
  if (!act) return;
  const m = box.dataset.m, who = box.querySelector('select').value;
  if (act === 'unlock') cmd('unlock', { m, to: who });
  if (act === 'lock') cmd('lock', { m });
  if (act === 'forward') { if (who === 'any') return showError('Choose a student in the list first.'); showError(''); cmd('forward', { m, p: who }); }
  if (act === 'revoke') cmd('revoke', { m });
});
chatKind();

let notesTimer;
$('#live-notes').addEventListener('input', () => {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => {
    cmd('notes', { text: $('#live-notes').value });
    $('#notes-saved').hidden = false;
    setTimeout(() => { $('#notes-saved').hidden = true; }, 1200);
  }, 700);
});

// ---------- tablets, characters, rescue ----------
function renderQueue() {
  const q = queue, playing = q.phase === 'play';
  renderChat();
  const codes = (q.codes || []).filter((c) => c.st === 'locked');
  $('#gate-code').hidden = !codes.length || !playing;
  $('#gate-code').innerHTML = codes.map((c) => `Code of the ${esc(c.name.toLowerCase())} in this mission: <span class="big-code">${esc(c.answer)}</span>`).join('<br>') + ' (the pieces are in the clues: see the sheet)';
  $('#sheet-zone').href = `sheet.html?zone=${encodeURIComponent(q.zone || 'beach')}`;
  $('#sheet-room').href = `sheet.html?room=${encodeURIComponent(watching)}`;
  const waiting = q.stations.filter((s) => s.waiting).length + q.talks.length;
  document.title = (playing && waiting ? `(${waiting}) ` : '') + 'Lantern Island · Teacher';
  $('#stations').innerHTML = !q.stations.length ? '<p class="muted small">The tablets and their answers appear here when a mission starts.</p>' : q.stations.map((s) => {
    const c = s.card, kind = s.courier ? 'courier' : c.type;
    const state = s.st === 'solved' ? 'Solved' : s.waiting ? 'Call the teacher' : s.courier?.started && !s.courier.delivered ? 'Letter on its way' : s.st === 'open' ? 'Open' : 'Not found yet';
    return `<article class="station ${s.waiting ? 'waiting' : ''} ${s.st}">
      <h3>${esc(s.name)} <span class="badge">${state}</span> <span class="muted small">${TYPE[kind]}${kind !== c.type || c.mode !== c.type ? ' → ' + TYPE[c.mode] : ''} · ${esc(c.level)}${s.by ? ' · opened by ' + esc(s.by) : ''}${s.wrong ? ' · ' + s.wrong + ' wrong' : ''}</span></h3>
      ${courierHtml(s, playing)}${linkHtml(s, q)}
      <p class="q">${esc(c.prompt)}</p>
      ${c.answer ? `<p>Answer: <b>${esc(c.answer)}</b></p>` : ''}
      ${c.code ? `<p>Code: <span class="big-code">${esc(c.code)}</span></p>${c.accepted.length ? `<p class="small">Accept:</p><ul>${c.accepted.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}` : ''}
      ${c.hints.length ? `<p class="small">Hints (when they ask in English):</p><ol>${c.hints.map((h, i) => `<li class="${i < s.hints ? 'sent' : ''}">${esc(h)}</li>`).join('')}</ol>` : ''}
      ${s.st !== 'solved' && playing ? `<div class="row">
        ${s.hints < c.hints.length ? `<button class="btn btn-small" type="button" data-hint="${esc(s.o)}">Release hint ${s.hints + 1}</button>` : ''}
        <button class="btn btn-small" type="button" data-solve="${esc(s.o)}">Solve it for them</button></div>` : ''}
    </article>`;
  }).join('');

  $('#talks-box').hidden = !q.talks.length;
  $('#talks').innerHTML = q.talks.map((k) => {
    const lines = q.npcs.find((n) => n.o === k.o)?.lines || [];
    return `<article class="talk" data-talk="${esc(k.id)}">
      <h3>${esc(k.who)} is talking to the ${esc(k.npc)}</h3>
      <p class="small">Answer as the ${esc(k.npc.toLowerCase())}. It shows on ${esc(k.who)}'s phone only.</p>
      <div class="row">${lines.map((l) => `<button class="btn btn-small" type="button" data-line="${esc(l)}">${esc(l)}</button>`).join('')}</div>
      <form class="row"><input class="field grow" maxlength="300" placeholder="Or type what the character says" aria-label="What the character says"><button class="btn btn-small" type="submit">Say</button></form>
      <div class="row">
        <select class="field" aria-label="Item">${defs.items.filter((i) => i.id !== 'letter').map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select>
        <button class="btn btn-small" type="button" data-npc="item">Give item</button>
        <button class="btn btn-small" type="button" data-npc="approve">Approve ("Well done!")</button>
        <button class="btn btn-small" type="button" data-npc="done">Close</button>
      </div>
    </article>`;
  }).join('');

  const verb = { gate: (t) => (t.st === 'open' ? 'Close' : 'Open'), chest: (t) => (t.st === 'open' ? 'Close' : 'Open'), gap: () => 'Fix', boulder: () => 'Move', sluice: (t) => (t.st === 'closed' ? 'Open' : 'Close') };
  $('#rescue').innerHTML = playing ? q.things.filter((t) => !(t.kind === 'gap' && t.st === 'fixed')).map((t) => `<button class="btn btn-small" type="button" data-force="${esc(t.o)}">${verb[t.kind](t)} the ${esc(t.name.toLowerCase())}</button>`).join('') : '';
  renderStats();
}
// A courier tablet: who carries the letter, who gets it, where they must meet.
function courierHtml(s, playing) {
  const c = s.courier;
  if (!c) return '';
  if (!c.started) return `<p class="info small">A letter. When a student opens this tablet, the player who has Give must carry it to a teammate${c.place ? ', and they must meet at ' + esc(c.place) : ''}. The question below is inside the letter.</p>`;
  if (c.delivered) return `<p class="info small">The letter reached ${esc(c.to)}. Only ${esc(c.to)} can answer.</p>`;
  return `<p class="info"><b>${esc(c.carrier)}</b> carries a letter to <b>${esc(c.to)}</b>${c.place ? ', meeting at <b>' + esc(c.place) + '</b>' : ''}.</p>
    ${playing ? `<div class="row"><select class="field small" aria-label="New receiver">${roster.players.filter((p) => p.name !== c.carrier).map((p) => `<option value="${esc(p.id)}" ${p.name === c.to ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <button class="btn btn-small" type="button" data-reroute="${esc(s.o)}">Send the letter to this student instead</button>
      <button class="btn btn-small" type="button" data-deliver="${esc(s.o)}">Deliver it now</button></div>` : ''}`;
}
// A link tablet: where the link is, and the one button that matters (Unlock for the student who asked).
function linkHtml(s, q) {
  const l = s.link;
  if (!l) return '';
  const role = l.helper === 'listening' ? 'Listening Helper' : 'Reading Helper';
  if (s.st === 'new') return `<p class="info small">A link card. When a student opens it, ${l.url ? 'its link goes' : 'you send a link'} to the ${role}, and the student has to ask that helper for it.</p>`;
  const m = q.messages.find((x) => x.id === l.sent);
  if (!l.url && !m) return `<p class="info"><b>This card has no link yet.</b> Send one in Chat to ${esc(l.who || 'the ' + role)}, shareable. ${esc(s.by || 'The student')} must then ask for it.</p>`;
  if (!m) return '';
  if (m.shared.length) return `<p class="info small">${esc(m.to.join(', '))} shared the link with ${esc(m.shared.join(', '))}.</p>`;
  return `<p class="info"><b>${esc(m.to.join(', '))}</b> has the link${m.unlock ? ' and can share it now.' : `, locked. When <b>${esc(s.by || 'the student')}</b> asks for help in English:`}</p>
    ${m.unlock || !s.byId ? '' : `<div class="row"><button class="btn btn-small btn-primary" type="button" data-unlock="${esc(m.id)}" data-for="${esc(s.byId)}">Unlock sharing for ${esc(s.by)}</button></div>`}`;
}
$('#stations').addEventListener('click', (e) => {
  const re = e.target.closest('[data-reroute]'), de = e.target.closest('[data-deliver]'), un = e.target.closest('[data-unlock]');
  if (re) cmd('courier', { o: re.dataset.reroute, to: re.parentElement.querySelector('select').value });
  if (de) cmd('courier', { o: de.dataset.deliver, deliver: true });
  if (un) cmd('unlock', { m: un.dataset.unlock, to: un.dataset.for });
  const h = e.target.closest('[data-hint]'), s = e.target.closest('[data-solve]');
  if (h) cmd('hint', { o: h.dataset.hint });
  if (s && confirm('Solve this tablet for the students?')) cmd('solve', { o: s.dataset.solve });
});
$('#talks').addEventListener('click', (e) => {
  const box = e.target.closest('[data-talk]');
  if (!box) return;
  const talk = box.dataset.talk, line = e.target.closest('[data-line]'), act = e.target.closest('[data-npc]');
  if (line) cmd('npc', { talk, text: line.dataset.line });
  if (act?.dataset.npc === 'item') cmd('npc', { talk, item: box.querySelector('select').value });
  if (act?.dataset.npc === 'approve') cmd('npc', { talk, approve: true });
  if (act?.dataset.npc === 'done') cmd('npc', { talk, done: true });
});
$('#talks').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = e.target.querySelector('input');
  if (input.value.trim()) cmd('npc', { talk: e.target.closest('[data-talk]').dataset.talk, text: input.value });
  input.value = '';
});
$('#rescue').addEventListener('click', (e) => { const b = e.target.closest('[data-force]'); if (b) cmd('force', { o: b.dataset.force }); });

// ---------- players ----------
const abilityName = (id) => defs.abilities.find((a) => a.id === id)?.name || id;
const itemName = (id) => defs.items.find((i) => i.id === id)?.name || id;
function renderPlayers() {
  const playing = roster.phase === 'play';
  $('#live-players').innerHTML = !roster.players.length ? '<p class="muted small">Nobody has joined yet.</p>' : roster.players.map((p) => `
    <article class="player ${p.online ? '' : 'off'}" data-p="${esc(p.id)}">
      <h3><span class="dot" style="background:${PLAYER_COLORS[p.ci % PLAYER_COLORS.length]}"></span>${esc(p.name)} ${p.online ? '' : '<span class="badge">away</span>'}${Object.keys(HELPER).filter((k) => roster.helpers[k] === p.id).map((k) => ` <span class="badge">${HELPER[k]}</span>`).join('')}${roster.monster ? ['seer', 'healer', 'slayer'].filter((k) => roster.roles[k] === p.id).map((k) => ` <span class="badge">${k}</span>`).join('') : ''}</h3>
      ${p.abilities.length ? `<p class="small">${p.abilities.map(abilityName).map(esc).join(' · ')}</p>` : ''}
      <div class="row">
        ${p.items.map((it, i) => `<span class="pill">${esc(itemName(it))}${it === 'letter' ? '&nbsp;&nbsp;' : `<button type="button" data-take="${i}" aria-label="Take the ${esc(itemName(it))} away">✕</button>`}</span>`).join('')}
        ${playing ? `<select class="field small" aria-label="Item">${defs.items.filter((i) => i.id !== 'letter').map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select>
        <button class="btn btn-small" type="button" data-do="give">Give</button>
        <button class="btn btn-small" type="button" data-do="tp">${aim === p.id ? 'Now click the map…' : 'Teleport'}</button>` : ''}
        <button class="btn btn-small" type="button" data-do="rename">Rename</button>
        <button class="btn btn-small btn-danger" type="button" data-do="kick">Remove</button>
      </div>
    </article>`).join('');
}
$('#live-players').addEventListener('click', (e) => {
  const box = e.target.closest('[data-p]');
  if (!box) return;
  const p = box.dataset.p, name = roster.players.find((x) => x.id === p)?.name, take = e.target.closest('[data-take]'), act = e.target.closest('[data-do]')?.dataset.do;
  if (take) cmd('take', { p, i: Number(take.dataset.take) });
  if (act === 'give') cmd('give', { p, item: box.querySelector('select').value });
  if (act === 'tp') { aim = aim === p ? null : p; $('#live-map').classList.toggle('aim', !!aim); renderPlayers(); }
  if (act === 'rename') { const n = (prompt('New name:', name) || '').trim(); if (n) cmd('rename', { p, name: n }); }
  if (act === 'kick' && confirm(`Remove ${name} from the game?\n\nTheir abilities are shared among the others.`)) cmd('kick', { p });
});

// ---------- map ----------
const canvas = $('#live-map'), g = canvas.getContext('2d');
let before = performance.now(), rect = null;
function frame(now) {
  const dt = Math.min(0.1, (now - before) / 1000);
  before = now;
  if (scene && roster && roster.phase !== 'lobby' && !$('#tab-live').hidden && canvas.clientWidth) {
    fitCanvas(canvas);
    smooth(players, dt);
    const { w, h } = scene.zone, ppt = Math.min(canvas.width / w, canvas.height / h);
    rect = { w: w * ppt, h: h * ppt, x: (canvas.width - w * ppt) / 2, y: (canvas.height - h * ppt) / 2, ppt };
    g.fillStyle = '#2f6fc0'; g.fillRect(0, 0, canvas.width, canvas.height);
    drawScene(g, scene, rect, { cx: w / 2, cy: h / 2, tiles: Math.min(w, h) }, players, now / 1000, { things, labels: true, places: true, beams, mood: roster.phase === 'play' ? roster.mood : -1, restored: roster.group?.island.landmarks || [], monster: roster.phase === 'play' && mon?.on ? mon : null, warn: roster.phase === 'play' && mon?.on ? mon.warn : null });
    beams = beams.filter((b) => b.until > now / 1000);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Teleport: after pressing a player's Teleport button, click where they should stand.
canvas.addEventListener('click', (e) => {
  if (!aim || !rect) return;
  const box = canvas.getBoundingClientRect(), k = canvas.width / box.width;
  cmd('tp', { p: aim, x: ((e.clientX - box.left) * k - rect.x) / rect.ppt, y: ((e.clientY - box.top) * k - rect.y) / rect.ppt });
  aim = null; canvas.classList.remove('aim'); renderPlayers();
});

// ---------- mission builder ----------
// Pick a template, choose which tablets to use and what kind of card each one gets, and start.
let lib = { missions: [], zones: [] }, allCards = [];
async function loadMissions() {
  try { [lib, allCards] = await Promise.all([api('/missions'), api('/cards')]); } catch (e) { return showError(e.message); }
  const keep = $('#m-template').value;
  // Missions are listed zone by zone. A zone the group has not opened yet says so (you can still start it).
  const open = roster?.group?.island.zones || ['beach'];
  $('#m-template').innerHTML = lib.zones.map((z) => `<optgroup label="${esc(z.name)}${open.includes(z.id) ? '' : ` (opens after ${z.unlock} landmarks)`}">${lib.missions.filter((m) => m.zone === z.id).map((m) => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join('')}</optgroup>`).join('');
  if (lib.missions.some((m) => m.id === keep)) $('#m-template').value = keep;
  renderMission();
}
function renderMission() {
  const m = lib.missions.find((x) => x.id === $('#m-template').value);
  if (!m) return;
  const zone = lib.zones.find((z) => z.id === m.zone);
  $('#m-minutes').value = m.minutes;
  // A scenario pack's mission is edited in its file; your own templates can be deleted here.
  $('#m-delete').disabled = !!m.pack;
  $('#m-delete').title = m.pack ? `From the scenario pack "${m.pack}": edit it in data/scenarios/${m.pack}/missions/` : '';
  $('#m-monster').value = m.monster || 'group-setting';
  $('#m-story').textContent = m.story;
  // A mission that changes its map (overrides) may have tablets of its own.
  $('#m-stations').innerHTML = (m.tablets || zone.stations).map((st, i) => {
    const s = m.stations.find((x) => x.at === st.id);
    const pick = s?.card ? `card:${s.card}` : s?.filter?.type || '';
    return `<div class="m-row" data-at="${esc(st.id)}">
      <label class="check"><input type="checkbox" data-use ${s ? 'checked' : ''}> ${esc(st.name)}</label>
      <select class="field grow" data-pick aria-label="Card for tablet ${i + 1}">
        <option value="">Any card</option>
        ${Object.entries(TYPE).map(([k, v]) => `<option value="${k}" ${pick === k ? 'selected' : ''}>${v}</option>`).join('')}
        <optgroup label="One specific card">${allCards.map((c) => `<option value="card:${esc(c.id)}" ${pick === 'card:' + c.id ? 'selected' : ''}>${esc(c.level)} · ${esc(c.prompt.slice(0, 50))}</option>`).join('')}</optgroup>
      </select>
      <input class="field" data-tags placeholder="tags (optional)" value="${esc((s?.filter?.tags || []).join(', '))}" aria-label="Tags for tablet ${i + 1}" size="12">
      <span class="muted small">gives: ${esc(st.reward || 'nothing')}</span>
    </div>`;
  }).join('');
}
$('#m-template').addEventListener('change', renderMission);
// The mission as the builder shows it now.
function builtMission() {
  const m = lib.missions.find((x) => x.id === $('#m-template').value);
  const stations = [...document.querySelectorAll('#m-stations .m-row')].filter((row) => row.querySelector('[data-use]').checked).map((row) => {
    const pick = row.querySelector('[data-pick]').value;
    if (pick.startsWith('card:')) return { at: row.dataset.at, card: pick.slice(5) };
    return { at: row.dataset.at, filter: { type: pick || undefined, level: 'group', tags: row.querySelector('[data-tags]').value.split(',').map((t) => t.trim()).filter(Boolean) } };
  });
  const { tablets, ...rest } = m;                  // the list of tablets is for this page, not part of the mission
  return { ...rest, minutes: Number($('#m-minutes').value), monster: $('#m-monster').value, stations };
}
$('#m-start').addEventListener('click', () => { showError(''); cmd('mission', { mission: builtMission() }); });
// Keep a mission you built, to use it again in other classes.
$('#m-save').addEventListener('click', async () => {
  const title = (prompt('Name for this mission template:', builtMission().title + ' (my version)') || '').trim();
  if (!title) return;
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-mission';
  if (lib.missions.some((x) => x.id === id) && !confirm(`Replace the template "${title}"?`)) return;
  try { showError(''); await api(`/missions/${id}`, { method: 'PUT', body: { ...builtMission(), id, title } }); await loadMissions(); $('#m-template').value = id; renderMission(); }
  catch (e) { showError(e.message); }
});
$('#m-delete').addEventListener('click', async () => {
  const m = lib.missions.find((x) => x.id === $('#m-template').value);
  if (!m || !confirm(`Delete the mission template "${m.title}"?\n\nThis does not touch any group's progress.`)) return;
  try { showError(''); await api(`/missions/${m.id}`, { method: 'DELETE' }); await loadMissions(); } catch (e) { showError(e.message); }
});
$('#m-quick').addEventListener('click', () => { showError(''); cmd('quick'); });
// The card list may have changed in the Cards tab.
document.addEventListener('tab', (e) => { if (e.detail === 'live') loadMissions(); });
