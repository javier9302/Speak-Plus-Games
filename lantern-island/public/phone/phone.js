// Phone: join, then walk with the joystick. The phone only sends its joystick; the server moves the character.
import { connect, esc } from '../shared/net.js';
import { PLAYER_COLORS, charSprite, heroUrl, iconUrl, itemUrl } from '../shared/pixel.js';
import { HEROES, heroById } from '../shared/heroes.js';
import { createScene, drawScene, fitCanvas, smooth } from '../shared/render.js';
import { cardHtml, hintsHtml, speak, safeUrl } from '../shared/cardview.js';
import { play, isMuted, setMuted } from '../shared/audio.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
// ?p=2 gives a test window its own character (windows of one browser share their storage).
const slot = params.get('p') || '';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const tokenKey = (room) => `li-token-${room}-${slot}`;

let roomCode = (params.get('room') || '').toUpperCase();
let me = null;                    // { id, name, ci, hero }
let hero = heroById(store.get(`li-hero-${slot}`))?.id || '';   // the character chosen on this phone ('' = the islander)
let phase = 'lobby';
let scene = null, viewTiles = 9;
let wantJoin = false;             // true once the player pressed Join (or has a saved character)
const players = new Map();
let defs = [];                    // the 12 abilities: { id, name, help }
let reach = 1.5;                  // how close I must be to use an object
let notes = [];                   // clues I found: only my phone has their text
let seenDeal = store.get(`li-deal-${slot}`) || '';   // the last sharing of abilities I was shown
let itemDefs = [];                // { id, name }
let things = [];                  // objects on the map and their state
let near = null;                  // what I can reach right now: { thing } or { player }
let nearSig = '';
let sel = 0;                      // which of my items is selected (for Give)
let card = null;                  // the challenge card open on this phone
let fx = [];
let inbox = [];                   // messages from the teacher, and letters
const seenMail = new Set();       // ids already read on this phone
let helpers = {};                 // { listening: player id, reading: player id }
let restored = [];                // landmarks this group has restored
let roles = {};                   // { seer, healer, slayer }: a player id, or "teacher"
let hasMonster = false, mood = -1;
let mon = null;                   // the monster. Only the Seer's phone ever gets this.
let beams = [];
let coolUntil = 0;                // when the Slayer's power is charged again
let myCount = 0;                  // how many items I carried at the last update (for the pick-up sound)
let team = null;                  // competitive mode: { n, name, charge, sabotage, effect, ... } from the roster; null in the normal game
let board = null;                 // the shared scoreboard: { phase, board: [{ n, team, score, progress, place }] }
let effect = null;                // an effect on my room: { id, from, until (performance.now()) }

const screens = ['join', 'wait', 'play', 'notice'];
const show = (name) => screens.forEach((s) => { $('#' + s).hidden = s !== name; });

// ---------- connection ----------
const socket = connect({
  onOpen: () => { if (wantJoin) sendJoin(); },
  onStatus: (up) => { $('#offline').hidden = up || !me; },
  onMessage(m) {
    if (m.t === 'joined') {
      me = { id: m.id, name: m.name, ci: m.ci, hero: m.hero || '' };
      roomCode = m.room;
      defs = m.abilities;
      itemDefs = m.items;
      store.set(tokenKey(roomCode), m.token);
      store.set('li-name', m.name);
      $('#me-name').textContent = $('#wait-name').textContent = m.name;
      $('#me-dot').style.background = PLAYER_COLORS[m.ci % PLAYER_COLORS.length];
      drawAvatar();
      keepAwake();
      showGame();
    } else if (m.t === 'roster') {
      const was = phase;
      phase = m.phase;
      const ids = new Set(m.players.map((p) => p.id));
      for (const id of players.keys()) if (!ids.has(id)) players.delete(id);
      for (const p of m.players) players.set(p.id, { ...(players.get(p.id) || {}), ...p });
      helpers = m.helpers || {};
      restored = m.group?.island.landmarks || [];
      roles = m.roles || {}; hasMonster = !!m.monster; mood = m.phase === 'play' ? m.mood : -1;
      if (roles.seer !== me?.id) mon = null;        // not the Seer (any more): forget where it was
      renderPowers();
      // Live settings from the teacher
      viewTiles = m.settings.view;
      $('#open-phrases').hidden = !m.settings.phrases;
      $('#paused').hidden = !(m.phase === 'play' && m.paused);
      $('#wait-text').textContent = m.phase === 'done' ? (m.result?.completed ? 'Mission complete! Great teamwork.' : 'The mission is over.') : 'You are in! Look at the big screen.';
      $('#wait-soft').textContent = m.phase === 'done' ? 'Look at the big screen.' : 'The game starts soon.';
      if (m.phase !== 'play') { $('#sheet').hidden = true; card = null; }
      else $('#picker').hidden = true;
      const mine = me && m.players.find((p) => p.id === me.id);
      if (mine && (mine.hero || '') !== me.hero) { me.hero = mine.hero || ''; drawAvatar(); }
      if (!$('#picker').hidden) renderPicker();      // show who took which character
      if (m.phase === 'done' && was !== 'done' && m.result?.completed) play('win');
      if (me && (m.players.find((p) => p.id === me.id)?.items.length || 0) > myCount) play('item');
      myCount = m.players.find((p) => p.id === me?.id)?.items.length || 0;
      team = m.team || null;
      syncEffect(team?.effect);
      renderTeam();
      if (me) { showGame(); renderInventory(); newDeal(m); }
    } else if (m.t === 'score:update') {
      board = m;
      renderTeam();
    } else if (m.t === 'sabotage:start') {
      syncEffect(m);
      play('warn');
    } else if (m.t === 'sabotage:end') {
      syncEffect(null);
      if (m.why === 'time') toast('The fog is gone!');
    } else if (m.t === 'sabotage:sent') {
      toast(`Fog sent to ${m.target}!`);
      play('good');
    } else if (m.t === 'world') {
      scene = createScene(m.zone);
      reach = m.reach;
    } else if (m.t === 'things') {
      things = m.list;
    } else if (m.t === 'card') {
      openCard(m);
    } else if (m.t === 'keypad') {
      // A gate with a code. Its numbers are in clues that other players found.
      card = { o: m.o };
      openSheet(`<h3>${esc(m.name)}</h3><h2>Type the code.</h2><p>It has ${m.digits} numbers. They are in clues around the island: ask your team what they found!</p>
        <form data-answer><input inputmode="numeric" pattern="[0-9]*" maxlength="${m.digits}" placeholder="Code" aria-label="Code"><button class="big" type="submit">Enter</button></form>
        <p id="card-result" class="result" role="status" hidden></p>`, 'Close');
    } else if (m.t === 'result') {
      onResult(m);
    } else if (m.t === 'hint') {
      onHint(m);
    } else if (m.t === 'npc') {
      // A character answers (the teacher is playing it).
      openSheet(`<h3>${esc(m.name)} says</h3><h2 class="${m.good ? 'good' : ''}">${esc(m.text)}</h2><h3>Only you can see this. Tell your team!</h3>`);
    } else if (m.t === 'say') {
      toast(m.msg);
    } else if (m.t === 'inbox') {
      if (m.list.some((x) => !inbox.some((y) => y.id === x.id)) && inbox.length + m.list.length > 0 && me) play('mail');
      inbox = m.list;
      renderMailCount();
      if (mailOpen()) openMail();           // keep an open inbox up to date (a message was unlocked, shared, removed)
    } else if (m.t === 'notes') {
      notes = m.list;
      showCount('#notes-count', notes.length);
    } else if (m.t === 'clue') {
      if (!notes.some((n) => n.key === m.key)) notes.push(m);
      showCount('#notes-count', notes.length);
      play('good');
      openSheet(`<h3>Only you can see this. Tell your team!</h3>${clueHtml(m)}`);
    } else if (m.t === 'nope') {
      toast(m.msg);
      play('bad');
    } else if (m.t === 'fx') {
      fx.push({ by: m.by, a: m.a, until: performance.now() / 1000 + 1.4 });
    } else if (m.t === 'state') {
      for (const [id, x, y, dir, moving, stun] of m.p) {
        const p = players.get(id);
        if (p) Object.assign(p, { tx: x, ty: y, dir, moving: !!moving, stun: !!stun });
      }
      renderStun();
    } else if (m.t === 'mon') {
      mon = m.on ? m : null;
      // The warning only the Seer sees. The Seer has to shout it.
      if (mon?.warn && $('#warn').hidden) play('warn');
      $('#warn').hidden = !mon?.warn;
      if (mon?.warn) $('#warn').textContent = mon.warn.dir === 'h' ? "It's shooting sideways! Tell your team!" : "It's shooting up and down! Tell your team!";
    } else if (m.t === 'beam') {
      beams.push({ dir: m.dir, at: m.at, until: performance.now() / 1000 + 0.7 });
      play('beam');
    } else if (m.t === 'cool') {
      coolUntil = performance.now() + m.slayer * 1000;
      renderPowers();
      setTimeout(renderPowers, m.slayer * 1000 + 50);
    } else if (m.t === 'kicked') {
      leave('You left the game', 'The teacher removed this player. You can join again.');
    } else if (m.t === 'error') {
      // A saved character that the server no longer knows: go back to the form.
      wantJoin = false; me = null;
      $('#join-error').textContent = m.msg;
      $('#join-error').hidden = false;
      show('join');
    }
  },
});

function sendJoin() {
  socket.send({ t: 'join', room: roomCode, name: $('#name').value.trim() || store.get('li-name') || '', hero, token: store.get(tokenKey(roomCode)) || undefined });
}

// ---------- choosing a character ----------
// Before joining, the choice goes with the join message; after, it is sent at once (the server ignores it during a mission).
// Two players may choose the same character: their names on the map tell them apart.
const heroName = (id) => heroById(id)?.name || 'Islander';
function drawAvatar() {
  const a = $('#avatar').getContext('2d');
  a.clearRect(0, 0, 16, 16);
  if (me) a.drawImage(charSprite(me.ci, 0, 0, me.hero), 0, 0);
  $('#pick-face').src = heroUrl(hero);
  $('#pick-name').textContent = heroName(hero);
}
function renderPicker() {
  const current = me ? me.hero : hero;
  const takenBy = (id) => [...players.values()].filter((p) => p.id !== me?.id && (p.hero || '') === id).map((p) => p.name);
  $('#pick-grid').innerHTML = [{ id: '', name: 'Islander', from: 'Lantern Island' }, ...HEROES].map((h) => {
    const taken = takenBy(h.id);
    return `<button type="button" class="hero ${h.id === current ? 'sel' : ''}" data-hero="${h.id}" role="option" aria-selected="${h.id === current}">
      <img src="${heroUrl(h.id, me?.ci || 0)}" alt=""><b>${esc(h.name)}</b><small>${esc(h.from)}</small>
      ${taken.length ? `<span class="taken">${esc(taken.join(', '))}</span>` : ''}</button>`;
  }).join('');
}
function openPicker() { renderPicker(); $('#picker').hidden = false; $('#pick-grid .sel')?.scrollIntoView({ block: 'center' }); }
$('#pick-open').addEventListener('click', openPicker);
$('#pick-change').addEventListener('click', openPicker);
$('#pick-done').addEventListener('click', () => { $('#picker').hidden = true; });
$('#pick-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-hero]');
  if (!b) return;
  hero = b.dataset.hero;
  store.set(`li-hero-${slot}`, hero);
  play('item');
  if (me) { me.hero = hero; socket.send({ t: 'hero', id: hero }); }
  drawAvatar();
  renderPicker();
});
drawAvatar();
function showGame() { show(phase === 'play' ? 'play' : 'wait'); }
function leave(title, text) {
  store.del(tokenKey(roomCode));
  me = null; wantJoin = false;
  $('#sheet').hidden = true;
  $('#notice-title').textContent = title;
  $('#notice-text').textContent = text;
  show('notice');
}
$('#notice-btn').addEventListener('click', () => show('join'));

// ---------- abilities, role card, clues ----------
const mine = () => players.get(me?.id)?.abilities || [];
const owner = (ability) => [...players.values()].find((p) => p.abilities?.includes(ability));
const colorOf = (p) => PLAYER_COLORS[p.ci % PLAYER_COLORS.length];

const myItems = () => players.get(me?.id)?.items || [];
const itemName = (id) => itemDefs.find((d) => d.id === id)?.name || id;

function renderAbilities() {
  const have = mine();
  // The buttons that do something right here glow.
  const wanted = near?.thing ? near.thing.needs : near?.player ? [...(myItems().length ? ['give'] : []), ...(near.player.items?.length ? ['pickup'] : [])] : [];
  $('#abilities').innerHTML = defs.map((d) => {
    const on = have.includes(d.id);
    return `<button type="button" class="ab ${on ? (wanted.includes(d.id) ? 'hot' : '') : 'off'}" data-a="${d.id}" aria-disabled="${!on}">
      <img src="${iconUrl(d.id, '#1a1c2c')}" alt="">${esc(d.name)}</button>`;
  }).join('');
}
$('#abilities').addEventListener('click', (e) => {
  const b = e.target.closest('.ab');
  if (!b) return;
  const d = defs.find((x) => x.id === b.dataset.a);
  if (mine().includes(d.id)) { play('tap'); return socket.send({ t: 'act', a: d.id, item: sel }); }
  // Not mine: say who to ask. Asking out loud is the point of the game.
  const who = owner(d.id);
  toast(who ? `${who.name} can ${d.name}. Ask!` : `You can't ${d.name}.`);
});

// What I carry. Tap an item to choose which one Give hands over.
function renderInventory() {
  const list = myItems();
  if (sel >= list.length) sel = 0;
  $('#inv').innerHTML = list.length
    ? list.map((id, i) => `<button type="button" class="slot ${i === sel ? 'sel' : ''}" data-i="${i}"><img src="${itemUrl(id)}" alt="">${esc(itemName(id))}</button>`).join('')
    : '<span class="soft">You carry nothing.</span>';
}
$('#inv').addEventListener('click', (e) => {
  const b = e.target.closest('.slot');
  if (b) { sel = Number(b.dataset.i); renderInventory(); }
});

// ---------- the monster's roles: Seer, Healer, Slayer ----------
const POWERS = { seer: ['Seer', 'look'], healer: ['Heal', 'heal'], slayer: ['Slay', 'slay'] };
const roleHolder = (k) => (roles[k] === 'teacher' ? 'The teacher' : players.get(roles[k])?.name);
function renderPowers() {
  $('#powers').hidden = !hasMonster || phase !== 'play';
  if (!me) return;
  const charging = performance.now() < coolUntil;
  $('#powers').innerHTML = Object.entries(POWERS).map(([k, [label, icon]]) => {
    const mine = roles[k] === me.id;
    return `<button type="button" class="pw ${mine ? '' : 'off'}" data-k="${k}"><img src="${iconUrl(icon, '#1a1c2c')}" alt="">${label}${k === 'slayer' && mine && charging ? '…' : ''}</button>`;
  }).join('');
}
$('#powers').addEventListener('click', (e) => {
  const k = e.target.closest('.pw')?.dataset.k;
  if (!k) return;
  if (roles[k] === me.id && k === 'seer') return toast('Only you can see the monster. Tell your team where it is!');
  socket.send({ t: 'power', k });      // not mine: the server answers with who to ask
});
function renderStun() {
  const stunned = !!players.get(me?.id)?.stun && phase === 'play';
  if ($('#stunned').hidden === !stunned) return;
  play(stunned ? 'stun' : 'heal');
  const healer = roles.healer === me.id ? null : roleHolder('healer');
  $('#stunned').textContent = healer ? `Stunned! Call ${healer}: "Can you heal me, please?"` : 'Stunned! Wait a moment…';
  $('#stunned').hidden = !stunned;
}

// ---------- mail: messages from the teacher, and letters ----------
// Students cannot write back: they talk. A shareable message has a Share button that works
// only after the teacher unlocks it, which the teacher does when somebody asks for help in English.
const showCount = (id, n) => { $(id).textContent = n; $(id).hidden = !n; };
const renderMailCount = () => showCount('#mail-count', inbox.filter((m) => !seenMail.has(m.id)).length);
const mailOpen = () => !$('#sheet').hidden && !!$('#sheet-body .mailbox');
function openMail() {
  inbox.forEach((m) => seenMail.add(m.id));
  renderMailCount();
  const item = (m) => {
    let h = `<div class="mail"><div class="from">${esc(m.from)}</div>`;
    if (m.text) h += `<p>${esc(m.text)}</p>`;
    if (m.kind === 'link' && safeUrl(m.url)) h += `<a class="linkbtn" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">Open the link</a>`;
    if (m.kind === 'audio' && safeUrl(m.url)) h += `<audio controls src="${esc(m.url)}"></audio>`;
    if (m.kind === 'image' && safeUrl(m.url)) h += `<img src="${esc(m.url)}" alt="">`;
    if (m.kind === 'card') h += `<button type="button" class="sharebtn" data-open="${esc(m.o)}">Open the challenge</button>`;
    if (m.shareable && m.locked) h += '<p class="lock">You can share this. It is locked until somebody asks you for help, in English.</p>';
    if (m.shareable && !m.locked) h += m.canShare.map((p) => `<button type="button" class="sharebtn" data-share="${esc(m.id)}" data-to="${esc(p.id)}">Share with ${esc(p.name)}</button>`).join('') || '<p class="lock">Shared.</p>';
    return h + '</div>';
  };
  openSheet(`<h2 class="mailbox">Mail</h2>${inbox.length ? [...inbox].reverse().map(item).join('') : '<p>No messages yet.</p>'}`);
}
$('#open-mail').addEventListener('click', openMail);
$('#sheet-body').addEventListener('click', (e) => {
  const share = e.target.closest('[data-share]'), open = e.target.closest('[data-open]');
  if (share) socket.send({ t: 'share', m: share.dataset.share, to: share.dataset.to });
  if (open) socket.send({ t: 'open', o: open.dataset.open });
});

// The abilities were shared out again (game start, reshuffle, a player joined or left): show the role card.
function newDeal(roster) {
  if (roster.phase !== 'play') return;
  const key = `${roomCode}/${roster.deal}/${mine().join()}`;
  if (key === seenDeal) return;
  seenDeal = key;
  store.set(`li-deal-${slot}`, key);
  openRole(true);
}
function openRole(fresh) {
  const have = mine();
  const others = [...players.values()].filter((p) => p.id !== me.id && p.abilities?.length);
  const name = (id) => esc(defs.find((d) => d.id === id)?.name || id);
  openSheet(`
    <h2>${fresh ? 'Your role' : 'My role'}</h2>
    ${hasMonster ? [['seer', 'Only your phone shows the monster. Tell your team where it is!'], ['healer', 'Stand next to a stunned teammate and press Heal.'], ['slayer', 'Go near the monster and press Slay. You cannot see it: ask the Seer!']].filter(([k]) => roles[k] === me.id).map(([k, how]) => `<p class="helper">You are the ${k[0].toUpperCase() + k.slice(1)}. ${how}</p>`).join('') : ''}
    ${['listening', 'reading'].filter((r) => helpers[r] === me.id).map((r) => `<p class="helper">You are the ${r === 'listening' ? 'Listening' : 'Reading'} Helper. Teammates may ask: "Can you ${r === 'listening' ? 'listen to this' : 'read this'} with me, please?"</p>`).join('')}
    <h3>You can</h3>
    <ul class="rows">${defs.filter((d) => have.includes(d.id)).map((d) => `<li><img src="${iconUrl(d.id, '#1a1c2c')}" alt=""><span><b>${esc(d.name)}</b><small>${esc(d.help)}</small></span></li>`).join('')}</ul>
    <h3>Ask your team for</h3>
    <ul class="rows">${others.map((p) => `<li><span class="who" style="background:${colorOf(p)}"></span><span><b>${esc(p.name)}</b><small>${p.abilities.map(name).join(', ')}</small></span></li>`).join('')}</ul>
    <button type="button" class="play" data-mute>${isMuted() ? 'Sound: off' : 'Sound: on'}</button>`);
}
const clueHtml = (n) => `<div class="clue"><div class="from"><img src="${iconUrl(n.a, '#4A5578')}" alt="">${esc(n.name)} · ${esc(defs.find((d) => d.id === n.a)?.name || n.a)}</div><p>${esc(n.text)}</p></div>`;
function openNotes() {
  openSheet(`<h2>My clues</h2>${notes.length ? notes.map(clueHtml).join('') : '<p>Nothing yet. Walk to something and use an ability.</p>'}<h3>Only you can see these. Tell your team!</h3>`);
}
function openSheet(html, button = 'OK') { $('#sheet-body').innerHTML = html; $('#sheet-ok').textContent = button; $('#sheet').hidden = false; $('#sheet-body').scrollTop = 0; }
$('#sheet-ok').addEventListener('click', () => { $('#sheet').hidden = true; });
$('#open-role').addEventListener('click', () => openRole(false));
// The sound switch lives on the role card.
$('#sheet-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mute]');
  if (!b) return;
  setMuted(!isMuted());
  b.textContent = isMuted() ? 'Sound: off' : 'Sound: on';
  play('tap');
});
$('#open-notes').addEventListener('click', openNotes);

// ---------- competitive mode: team, scoreboard, sabotage ----------
// How each effect looks on the phone. The server decides when it starts and ends (server/sabotage.js).
const EFFECT_VIEWS = {
  fog: { title: (from) => `${from} sent you fog!`, show() { $('#effect').hidden = false; }, hide() { $('#effect').hidden = true; } },
};
// The server's word on my room's effect: { id, from, left } or null. Called on every roster and on start/end.
function syncEffect(e) {
  const view = e && EFFECT_VIEWS[e.id];
  if (effect && (!view || effect.id !== e.id)) { EFFECT_VIEWS[effect.id]?.hide(); effect = null; }
  if (!view) return;
  effect = { id: e.id, from: e.from, until: performance.now() + e.left };
  $('#effect-from').textContent = view.title(e.from);
  view.show();
  tickEffect();
}
// The countdown only shows the time left; the effect goes away when the server says so.
function tickEffect() { if (effect) $('#effect-left').textContent = Math.max(0, Math.ceil((effect.until - performance.now()) / 1000)); }
setInterval(tickEffect, 250);

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
function renderTeam() {
  $('#team-bar').hidden = !team;
  $('#wait-team').hidden = !team;
  if (!team) { $('#board-list').hidden = true; return; }
  $('#wait-team').textContent = $('#team-name').textContent = team.name;
  const rows = board?.board || [], mine = rows.find((r) => r.n === team.n);
  $('#team-score').textContent = mine ? `${mine.score} pts${mine.place ? ' · ' + ordinal(mine.place) : ''}` : '';
  const others = rows.filter((r) => r.n !== team.n && !r.place);
  $('#fog-send').hidden = !(team.sabotage && team.charge > 0 && phase === 'play' && !mine?.place && others.length);
  // Finished teams first, in their order; then the others by score.
  const sorted = [...rows].sort((a, b) => (a.place || 99) - (b.place || 99) || b.score - a.score);
  $('#board-list').innerHTML = sorted.map((r) => {
    const p = r.progress, pct = p.goalNeed ? Math.round((100 * p.goal) / p.goalNeed) : 0;
    return `<li class="${r.n === team.n ? 'me' : ''}"><span class="place">${r.place ? ordinal(r.place) : ''}</span><span>${esc(r.team)}</span><span>${r.score}</span>
      <span class="bar" title="${p.goal} of ${p.goalNeed}, ${p.clues} of ${p.cluesTotal} clues"><i style="width:${pct}%"></i></span></li>`;
  }).join('');
}
$('#board-toggle').addEventListener('click', () => {
  const open = $('#board-list').hidden;
  $('#board-list').hidden = !open;
  $('#board-toggle').setAttribute('aria-expanded', String(open));
});
// Spend the charge. With one other team it goes straight there; with more, the player picks.
$('#fog-send').addEventListener('click', () => {
  const others = (board?.board || []).filter((r) => r.n !== team.n && !r.place);
  if (others.length === 1) return socket.send({ t: 'sabotage:send', target: others[0].n, effect: 'fog' });
  openSheet(`<h3>Send fog</h3><h2>Which team?</h2><div class="targets">${others.map((r) => `<button type="button" class="big" data-fog="${r.n}">${esc(r.team)}</button>`).join('')}</div>`, 'Cancel');
});
$('#sheet-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fog]');
  if (!b) return;
  socket.send({ t: 'sabotage:send', target: Number(b.dataset.fog), effect: 'fog' });
  $('#sheet').hidden = true;
});

let toastTimer;
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 2600);
}

// What is next to me? A thing I can use, or else a teammate (for Give). The prompt names it and,
// for each ability it needs, says whether I have it or who to ask.
function updateNear(my) {
  let thing = null, best = reach;
  for (const t of things) {
    if (!t.needs.length) continue;
    const d = Math.hypot(t.x + 0.5 - my.tx, t.y + 0.5 - (my.ty - 0.1));
    if (d <= best) { thing = t; best = d; }
  }
  let player = null;
  if (!thing) {
    best = reach;
    for (const p of players.values()) {
      if (p.id === me.id || !p.online || p.tx === undefined) continue;
      const d = Math.hypot(p.tx - my.tx, p.ty - my.ty);
      if (d <= best) { player = p; best = d; }
    }
  }
  const have = mine();
  const sig = [thing?.id, thing?.st, thing?.needs.join(), player?.id, player?.items?.length, have.join(), myItems().length, [...players.values()].map((p) => p.abilities?.join()).join('/')].join('|');
  if (sig === nearSig) return;
  nearSig = sig;
  near = thing ? { thing } : player ? { player } : null;
  renderAbilities();
  const line = (a, it) => {
    const d = defs.find((x) => x.id === a), who = owner(a);
    return have.includes(a) ? `<span class="mine">You can ${esc(d.name)}${it}</span>` : `<span class="ask">needs ${esc(d.name)}${who ? ': ask ' + esc(who.name) : ''}</span>`;
  };
  if (thing) $('#prompt').innerHTML = `<b>${esc(thing.name)}</b>` + thing.needs.map((a) => line(a, ' it')).join('');
  else if (player && myItems().length) $('#prompt').innerHTML = `<b>${esc(player.name)} is next to you</b>` + line('give', '');
  else if (player && player.items?.length && have.includes('pickup')) $('#prompt').innerHTML = `<b>${esc(player.name)} is next to you</b><span class="mine">You can Pick up from ${esc(player.name)}</span>`;
  else $('#prompt').innerHTML = '<span class="ask">Walk to something to use your abilities.</span>';
}

// ---------- challenge cards ----------
function openCard(m) {
  card = m;
  openSheet(cardHtml(m.card, m.hints || []), 'Close');
}
function sendAnswer(value) {
  if (!card || !String(value).trim()) return;
  socket.send({ t: 'answer', o: card.o, value: String(value).trim() });
}
function onResult(m) {
  if (!card || card.o !== m.o) return;
  play(m.ok ? 'good' : 'bad');
  if (m.ok) {
    card = null;
    return openSheet(`<h2 class="good">Correct!</h2>${m.msg ? `<p>${esc(m.msg)}</p>` : ''}${m.explanation ? `<p class="why">${esc(m.explanation)}</p>` : ''}<h3>Tell your team!</h3>`);
  }
  const el = $('#card-result');
  if (!el) return;
  el.textContent = m.msg;
  el.hidden = false;
  const input = $('#sheet-body input');
  if (input) input.select();
}
// The teacher released a hint: show it on the open card, or say that there is one.
function onHint(m) {
  if (card && card.o === m.o && $('#card-hints')) { card.hints = m.hints; $('#card-hints').innerHTML = hintsHtml(m.hints); toast('New hint from the teacher!'); }
  else toast(`New hint for the ${m.name.toLowerCase()}. Open it again to read it.`);
}

// ---------- phrase help ----------
// Useful sentences for what is next to me right now. The teacher can switch this off.
function openPhrases() {
  const lines = [];
  const verb = (a) => (defs.find((d) => d.id === a)?.name || a).toLowerCase();
  if (near?.thing) {
    const what = near.thing.name.toLowerCase();
    for (const a of near.thing.needs.filter((x) => !mine().includes(x))) {
      const who = owner(a);
      lines.push(`${who ? who.name + ', can' : 'Can'} you ${verb(a)} the ${what}, please?`);
    }
    lines.push(`I'm at the ${what}. Can you come here, please?`);
  }
  if (myItems().length) lines.push(`I have the ${itemName(myItems()[sel] || myItems()[0]).toLowerCase()}. Who needs it?`);
  if (inbox.some((m) => m.from === 'Letter')) lines.push('I have a letter for you. Where can we meet?', 'Meet me at the old bridge, please.');
  lines.push('Can you help me with this, please?', 'Can you read this with me, please?', 'Can you listen to this with me, please?');
  if (hasMonster) {
    if (roles.seer === me.id) lines.unshift('Watch out! The monster is behind you!', "There's a monster near the bridge!", "It's shooting sideways! Go up or down!", "It's shooting up and down! Go left or right!");
    else lines.push('Where is the monster?', 'Is it near me?');
    if (roles.healer !== me.id) lines.push('Can you heal me, please?');
    if (roles.slayer === me.id) lines.push('Where is it? Am I close?');
  }
  lines.push('Where are you?', 'Go left. / Go right. / Go up. / Go down.', 'Wait for me, please!', 'I found a clue! It says…', 'What can you see?', 'Can you say that again, please?', 'Can we have a hint, please?');
  openSheet(`<h2>You can say</h2><ul class="phrases">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`);
}
$('#open-phrases').addEventListener('click', openPhrases);

$('#sheet-body').addEventListener('click', (e) => {
  const opt = e.target.closest('[data-value]'), say = e.target.closest('[data-say]');
  if (opt) sendAnswer(opt.dataset.value);
  if (say && !speak(say.dataset.say)) toast('This phone cannot play the word. Ask the teacher to say it.');
});
$('#sheet-body').addEventListener('submit', (e) => {
  e.preventDefault();
  sendAnswer(e.target.querySelector('input').value);
});

// ---------- join form ----------
$('#room').value = roomCode;
$('#name').value = store.get('li-name') || '';
$('#join').addEventListener('submit', (e) => {
  e.preventDefault();
  roomCode = $('#room').value.trim().toUpperCase();
  if (!roomCode || !$('#name').value.trim()) return;
  $('#join-error').hidden = true;
  wantJoin = true;
  sendJoin();
});
// Coming back after a reload or a locked phone: rejoin without asking.
if (roomCode && store.get(tokenKey(roomCode))) wantJoin = true;
show('join');
($('#room').value ? $('#name') : $('#room')).focus();

// ---------- screen stays on ----------
let wake = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } }
  catch { /* not allowed right now */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && me) keepAwake(); });

// ---------- joystick ----------
const pad = $('#pad'), stick = $('#stick'), knob = $('#knob');
const RADIUS = 46;                 // how far the knob travels, in CSS pixels
let touchId = null, origin = null;
let input = { x: 0, y: 0 }, sent = { x: 0, y: 0 }, sentAt = 0;
const keys = new Set();

function setStick(dx, dy) {
  const len = Math.hypot(dx, dy), k = len > RADIUS ? RADIUS / len : 1;
  knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  const dead = len < 10;
  input = dead ? { x: 0, y: 0 } : { x: (dx * k) / RADIUS, y: (dy * k) / RADIUS };
}
pad.addEventListener('pointerdown', (e) => {
  if (touchId !== null) return;
  touchId = e.pointerId;
  pad.setPointerCapture(e.pointerId);
  $('#pad-hint').hidden = true;
  // The joystick appears where the thumb lands.
  const r = pad.getBoundingClientRect();
  origin = { x: e.clientX, y: e.clientY };
  stick.style.position = 'absolute';
  stick.style.left = `${e.clientX - r.left - 62}px`;
  stick.style.top = `${e.clientY - r.top - 62}px`;
  setStick(0, 0);
});
pad.addEventListener('pointermove', (e) => { if (e.pointerId === touchId) setStick(e.clientX - origin.x, e.clientY - origin.y); });
const release = (e) => { if (e.pointerId === touchId) { touchId = null; setStick(0, 0); } };
pad.addEventListener('pointerup', release);
pad.addEventListener('pointercancel', release);
window.addEventListener('blur', () => { keys.clear(); touchId = null; setStick(0, 0); });

// Keyboard, for testing on a computer: arrow keys or WASD.
const KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
function fromKeys() {
  let x = 0, y = 0;
  for (const k of keys) { x += KEYS[k][0]; y += KEYS[k][1]; }
  const len = Math.hypot(x, y) || 1;
  input = { x: x / len, y: y / len };
}
window.addEventListener('keydown', (e) => { if (KEYS[e.code] && e.target.tagName !== 'INPUT' && $('#sheet').hidden) { e.preventDefault(); keys.add(e.code); fromKeys(); } });
window.addEventListener('keyup', (e) => { if (keys.delete(e.code)) fromKeys(); });

// Send the joystick when it changes, at most 20 times a second. Stopping is sent at once.
function sendInput(now) {
  const stopped = input.x === 0 && input.y === 0;
  const changed = Math.abs(input.x - sent.x) > 0.04 || Math.abs(input.y - sent.y) > 0.04;
  if (!changed || (!stopped && now - sentAt < 50)) return;
  sent = { ...input }; sentAt = now;
  socket.send({ t: 'input', x: Math.round(input.x * 100) / 100, y: Math.round(input.y * 100) / 100 });
}

// Stop the page from zooming or scrolling under the game.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- drawing ----------
const canvas = $('#view'), g = canvas.getContext('2d');
let before = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - before) / 1000);
  before = now;
  if (me && phase === 'play') {
    sendInput(now);
    const my = players.get(me.id);
    if (scene && my) {
      fitCanvas(canvas);
      smooth(players, dt);
      if (my.x !== undefined) {
        updateNear(my);
        fx = fx.filter((f) => f.until > now / 1000);
        beams = beams.filter((b) => b.until > now / 1000);
        // The phone only shows a small square around its own character.
        drawScene(g, scene, { x: 0, y: 0, w: canvas.width, h: canvas.height }, { cx: my.x, cy: my.y - 0.4, tiles: viewTiles }, players, now / 1000, { things, target: near?.thing, fx, noName: me.id, places: true, mood, beams, monster: mon, warn: mon?.warn, restored });
      }
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
