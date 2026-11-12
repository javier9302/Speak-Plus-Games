(() => {
const { $, esc, t, shuffle, store } = Kit;
const SPEEDS = [20, 15, 11, 8, 6];                     // seconds to reach the floor, "Very slow" → "Very fast"
const TASKS = ['answer', 'sentence', 'describe', 'question'];
const MAX_TEAMS = 8;
const KEY = 'sp-worddrop-v1';
const firstPack = Kit.packs('word-list')[0];
const DEFAULTS = {
  words: firstPack ? Kit.itemsToText(firstPack.items) : 'apple, book, chair, dog, egg, friend',
  teams: t('kit.teamX', { x: 'A' }) + '\n' + t('kit.teamX', { x: 'B' }),
  lives: 3, speed: 2, max: 2, sound: true, task: 'answer', title: firstPack ? firstPack.title : '',
};
const S = Object.assign({}, DEFAULTS, store.get(KEY, {}));
if (!(S.lives >= 0 && S.lives <= 5)) S.lives = 3;
if (!TASKS.includes(S.task)) S.task = 'answer';
const save = () => store.set(KEY, S);
Kit.sound.on = S.sound;

const views = { setup: $('#view-setup'), game: $('#view-game') };
function show(name) {
  if (name === 'hub') { location.href = '../index.html'; return; }
  for (const k in views) views[k].hidden = k !== name;
  if (name !== 'game') Kit.wake.off();
  window.scrollTo(0, 0);
}

const hearts = (n, total) => total ? '<span class="hearts" aria-label="' + n + ' / ' + total + '">' +
  Array.from({ length: total }, (_, i) => '<svg class="' + (i < n ? 'heart-on' : 'heart-off') + '"><use href="#heart"/></svg>').join('') + '</span>' : '';
const withAnswer = it => esc(it.prompt) + (it.answer ? ' <small>→ ' + esc(it.answer) + '</small>' : '');

/* ---------- Setup ---------- */
const wordsEl = $('#words'), teamsEl = $('#teams');
wordsEl.value = S.words; teamsEl.value = S.teams; $('#sound').checked = S.sound;

function seg(id, key, values, label) {
  const box = $('#' + id);
  box.innerHTML = values.map(v => `<input type="radio" name="${key}" id="${key}-${v}" value="${v}" ${S[key] == v ? 'checked' : ''}><label for="${key}-${v}">${esc(label ? label(v) : v)}</label>`).join('');
  box.addEventListener('change', e => { S[key] = isNaN(+e.target.value) ? e.target.value : +e.target.value; save(); updateCounts(); });
}
seg('seg-lives', 'lives', [0, 1, 2, 3, 4, 5], v => v ? v : t('off'));
seg('seg-speed', 'speed', [1, 2, 3, 4, 5]);
seg('seg-max', 'max', [1, 2, 3, 4]);
seg('seg-task', 'task', TASKS, v => t('wd.task.' + v));

function updateCounts() {
  const items = Kit.parseItems(wordsEl.value), w = items.length, teams = Kit.parseTeams(teamsEl.value), n = teams.length;
  const answers = items.filter(x => x.answer).length;
  $('#word-count').textContent = t('wd.wordsN', { n: w }) + (answers ? ' · ' + t('wd.withAnswers', { n: answers }) : '');
  $('#team-count').textContent = (n === 1 ? t('solo') : t('teamsN', { n })) + ' · ' + t('maxN', { n: MAX_TEAMS });
  $('#team-count').style.color = n > MAX_TEAMS ? 'var(--accent)' : '';
  const note = $('#split-note');
  if (n > 1 && n <= MAX_TEAMS && w >= n) {
    const per = Math.floor(w / n), extra = w - per * n;
    note.textContent = t('wd.perTeam', { n: per }) + (extra ? ' · ' + t('wd.unused', { n: extra }) : '');
  } else note.textContent = '';
  $('#speed-note').textContent = t('wd.speedNote', { label: t('wd.speed' + S.speed), n: SPEEDS[S.speed - 1] });
  $('#lives-note').textContent = S.lives ? t('wd.livesOn') : t('wd.livesOff');
}
wordsEl.addEventListener('input', () => { S.words = wordsEl.value; save(); updateCounts(); });
teamsEl.addEventListener('input', () => { S.teams = teamsEl.value; save(); updateCounts(); });
$('#sound').addEventListener('change', e => { S.sound = Kit.sound.on = e.target.checked; save(); });
Kit.mountContent($('#content-tools'), {
  type: 'word-list',
  getPack: () => ({ title: S.title || t('wd.title'), items: Kit.parseItems(wordsEl.value) }),
  setPack: p => { wordsEl.value = p.items ? Kit.itemsToText(p.items) : p.text || ''; S.title = p.title || ''; S.words = wordsEl.value; save(); updateCounts(); },
});
Kit.mountRoster($('#roster'), teamsEl, MAX_TEAMS);
updateCounts();

$('#back-hub').addEventListener('click', () => show('hub'));
$('#btn-full').addEventListener('click', Kit.toggleFullscreen);

/* ---------- Game ---------- */
const field = $('#field'), overlay = $('#overlay'), card = $('#card'), board = $('#board'), pill = $('#task-pill');
let G = null;

$('#start').addEventListener('click', startGame);
function startGame() {
  const items = Kit.parseItems(wordsEl.value), teams = Kit.parseTeams(teamsEl.value);
  const err = $('#setup-error');
  const fail = (msg, el) => { err.textContent = msg; err.hidden = false; el.focus(); };
  if (!items.length) return fail(t('wd.errNoWords'), wordsEl);
  if (!teams.length) return fail(t('wd.errNoTeams'), teamsEl);
  if (teams.length > MAX_TEAMS) return fail(t('wd.errTooMany', { max: MAX_TEAMS }), teamsEl);
  if (items.length < teams.length) return fail(t('wd.errFewWords', { n: teams.length }), wordsEl);
  err.hidden = true;
  clearBlocks();
  const all = shuffle(items), per = Math.floor(all.length / teams.length);
  G = {
    total: per * teams.length,
    teams: teams.map((tm, i) => ({ name: tm.name, members: tm.members, lives: S.lives, score: 0, out: false, deck: all.slice(i * per, (i + 1) * per) })),
    active: 0, blocks: [], state: 'turn', since: 0, lives: S.lives,
    failed: [], stolen: [], passed: new Set(), fall: SPEEDS[S.speed - 1], max: S.max, solo: teams.length === 1, first: true,
  };
  pill.textContent = t('wd.task.' + S.task); pill.hidden = S.task === 'answer';
  show('game'); Kit.wake.on(); renderBoard(); turnCard();
}

function renderBoard() {
  board.innerHTML = G.teams.map((tm, i) =>
    `<div class="team ${i === G.active && !tm.out ? 'active' : ''} ${tm.out ? 'out' : ''}" data-i="${i}">
      <span class="team-name">${esc(tm.name)}</span>${hearts(tm.lives, G.lives)}<span class="team-left">${esc(t('wd.left', { n: tm.deck.length }))}</span><span class="team-score" aria-label="${esc(t('points'))}">${tm.score}</span></div>`).join('');
  const used = G.total - G.teams.reduce((n, tm) => n + tm.deck.length, 0) - G.blocks.length;
  $('#progress').textContent = t('wd.progress', { used, total: G.total });
}

function openOverlay(html) { card.innerHTML = html; overlay.hidden = false; const b = card.querySelector('[data-focus]'); b && b.focus(); }
function closeOverlay() { overlay.hidden = true; }

function turnCard() {
  G.state = 'turn';
  const tm = G.teams[G.active];
  const label = G.first ? (G.solo ? t('ready') : t('firstUp')) : (G.solo ? t('keepGoing') : t('nextUp'));
  openOverlay(`
    <span class="eyebrow">${esc(label)}</span>
    <h2>${esc(tm.name)}</h2>
    ${tm.members.length ? `<p class="members">${tm.members.map(esc).join(' · ')}</p>` : ''}
    ${hearts(tm.lives, G.lives)}
    <span class="task-pill">${esc(t('wd.task.' + S.task))}</span>
    <p class="sub">${esc(t('wd.leftForTeam', { n: tm.deck.length }))}</p>
    <div class="card-actions"><button class="btn btn-primary btn-big" data-act="go" data-focus type="button">${esc(t('go'))}</button></div>
    <span class="keyhint">${t('orPress', { key: '<kbd>' + esc(t('spaceKey')) + '</kbd>' })}</span>`);
}

function go() { closeOverlay(); G.first = false; G.state = 'play'; G.since = 0; Kit.beep('go'); }

function pause() {
  if (!G || G.state !== 'play') return;
  G.state = 'paused';
  openOverlay(`
    <span class="eyebrow">${esc(t('paused'))}</span>
    <h2>${esc(t('takeBreath'))}</h2>
    <div class="card-actions">
      <button class="btn btn-primary btn-big" data-act="resume" data-focus type="button">${esc(t('resume'))}</button>
      <button class="btn btn-ghost" data-act="end" type="button">${esc(t('endGame'))}</button>
    </div>`);
}
function resume() { closeOverlay(); G.state = 'play'; }
$('#btn-pause').addEventListener('click', () => G && (G.state === 'play' ? pause() : G.state === 'paused' ? resume() : null));

card.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  ({ go, resume, end: () => endGame('ended'), again: startGame,
    settings: () => { clearBlocks(); G = null; show('setup'); },
    hub: () => { clearBlocks(); G = null; show('hub'); } })[a.dataset.act]?.();
});

document.addEventListener('keydown', e => {
  if (views.game.hidden || !G) return;
  if (e.code === 'Space') {
    if (e.target.closest && e.target.closest('.block')) return;
    e.preventDefault();
    if (G.state === 'turn') go(); else if (G.state === 'play') pause(); else if (G.state === 'paused') resume();
  } else if (e.key === 'Escape' && G.state === 'play') pause();
});

function spawn() {
  const item = G.teams[G.active].deck.shift();
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'block block-in' + (G.passed.has(item.prompt) ? ' steal' : '') + (item.prompt.length > 14 ? ' long' : '');
  el.textContent = item.prompt; el.dataset.bonus = t('wd.bonus');
  el.setAttribute('aria-label', t('wd.tapHint', { word: item.prompt }));
  field.appendChild(el);
  const w = el.offsetWidth, h = el.offsetHeight, W = field.clientWidth, H = field.clientHeight;
  let x, tries = 0;
  do { x = Math.random() * Math.max(0, W - w); tries++; }
  while (tries < 14 && G.blocks.some(o => o.p * (H - o.h) < h * 1.8 && x < o.x + o.w + 16 && x + w + 16 > o.x));
  const b = { item, el, x, w, h, p: 0, done: false };
  el.style.transform = `translate(${x}px,0px)`;
  el.addEventListener('pointerdown', ev => { ev.preventDefault(); hit(b); });
  el.addEventListener('click', () => hit(b));
  G.blocks.push(b); G.since = 0;
  renderBoard();
}

function hit(b) {
  if (!G || G.state !== 'play' || b.done) return;
  b.done = true;
  G.blocks = G.blocks.filter(o => o !== b);
  const tm = G.teams[G.active]; tm.score++;
  if (G.passed.has(b.item.prompt)) G.stolen.push({ item: b.item, by: tm.name });
  b.el.classList.add('pop');
  const p = document.createElement('div'); p.className = 'plus1'; p.textContent = '+1';
  const y = b.p * (field.clientHeight - b.h);
  p.style.left = (b.x + b.w / 2 - 18) + 'px'; p.style.top = (y - 10) + 'px';
  field.appendChild(p);
  setTimeout(() => { b.el.remove(); p.remove(); }, 700);
  Kit.beep('hit'); renderBoard();
  board.querySelector(`[data-i="${G.active}"]`)?.classList.add('bump');
}

function miss(b) {
  G.state = 'miss'; b.done = true;
  b.el.classList.add('missed');
  if (b.item.answer) b.el.textContent = b.item.prompt + ' → ' + b.item.answer;   // the class sees the answer
  G.blocks.filter(o => o !== b).forEach(o => {
    o.done = true; o.el.classList.add('fade'); setTimeout(() => o.el.remove(), 300);
    const d = G.teams[G.active].deck; d.splice(Math.floor(Math.random() * (d.length + 1)), 0, o.item);
  });
  G.blocks = [];
  const tm = G.teams[G.active];
  if (G.lives) { tm.lives--; if (tm.lives <= 0) tm.out = true; }
  // A missed word passes once to the next team still in the game, as their first word
  let receiver = null;
  if (!G.passed.has(b.item.prompt)) {
    const n = G.teams.length;
    for (let k = 1; k < n; k++) { const o = G.teams[(G.active + k) % n]; if (!o.out) { receiver = o; break; } }
    if (receiver) { receiver.deck.unshift(b.item); G.passed.add(b.item.prompt); G.total++; }
  }
  if (!receiver) G.failed.push(b.item);   // nobody answered it
  const floor = $('#floor'); floor.classList.remove('flash'); void floor.offsetWidth; floor.classList.add('flash');
  const ban = document.createElement('div'); ban.className = 'banner';
  ban.textContent = (!G.lives ? t('wd.passTurn') : tm.out ? t('wd.isOut', { name: tm.name }) : t('wd.losesLife', { name: tm.name })) +
    (receiver ? ' · ' + t('wd.goesTo', { word: b.item.prompt, name: receiver.name }) : '');
  field.appendChild(ban);
  Kit.beep('miss'); renderBoard();
  setTimeout(() => {
    b.el.remove(); ban.remove();
    if (!G) return;
    if (isOver()) endGame(G.teams.some(playable) ? 'lives' : 'words');
    else { nextTeam(); renderBoard(); turnCard(); }
  }, b.item.answer ? 2200 : 1300);
}

const playable = tm => !tm.out && tm.deck.length > 0;
const aliveCount = () => G.teams.filter(tm => !tm.out).length;
function isOver() {
  if (!G.teams.some(playable)) return true;
  if (!G.lives) return false;                       // no elimination: play until the words run out
  return G.solo ? aliveCount() === 0 : aliveCount() <= 1;
}
function nextTeam() {
  const n = G.teams.length;
  for (let k = 1; k <= n; k++) { const i = (G.active + k) % n; if (playable(G.teams[i])) { G.active = i; return; } }
}
function teamFinished() {
  G.state = 'miss';
  const tm = G.teams[G.active];
  const ban = document.createElement('div'); ban.className = 'banner'; ban.style.background = 'var(--good)';
  ban.textContent = t('wd.finished', { name: tm.name });
  field.appendChild(ban); Kit.beep('go');
  setTimeout(() => {
    ban.remove(); if (!G) return;
    if (isOver()) endGame('words'); else { nextTeam(); renderBoard(); turnCard(); }
  }, 1300);
}
function clearBlocks() { field.querySelectorAll('.block,.plus1,.banner').forEach(n => n.remove()); }

function endGame(reason) {
  G.state = 'over';
  // words still on screen go back to their team, so they are listed as not played
  G.blocks.forEach(b => G.teams[G.active].deck.unshift(b.item)); G.blocks = [];
  clearBlocks();
  // passed words the receiving team never got to play count as unanswered; the rest were never played
  const notPlayed = [];
  G.teams.forEach(tm => tm.deck.forEach(it => {
    if (G.passed.has(it.prompt)) { if (!G.failed.includes(it)) G.failed.push(it); } else notPlayed.push(it);
  }));
  renderBoard();
  const ranked = G.teams.map((tm, i) => ({ ...tm, i })).sort((a, b) => (G.lives ? a.out - b.out : 0) || (b.score - a.score) || (b.lives - a.lives));
  let title, sub;
  if (reason === 'ended') { title = t('gameEnded'); sub = G.solo ? t('wd.score', { name: G.teams[0].name }) + ': ' + G.teams[0].score : t('endedEarly'); }
  else if (G.solo) {
    const tm = G.teams[0];
    title = t('wd.wordsN', { n: tm.score });
    sub = reason === 'words' ? t('wd.cleared', { name: tm.name }) : t('wd.score', { name: tm.name });
  } else {
    const top = ranked[0], two = ranked[1];
    const tie = two && (!G.lives || !two.out === !top.out) && two.score === top.score && two.lives === top.lives;
    title = tie ? t('tie') : t('wins', { name: top.name });
    sub = reason === 'words' ? t('wd.allUsed') : t('wd.lastStanding');
  }
  const rows = G.solo ? '' : `<table class="results"><thead><tr><th>${esc(t('team'))}</th><th class="num">${esc(t('points'))}</th>${G.lives ? `<th class="num">${esc(t('lives'))}</th>` : ''}</tr></thead><tbody>${
    ranked.map((tm, k) => `<tr class="${k === 0 && reason !== 'ended' ? 'win' : ''}"><td>${esc(tm.name)}</td><td class="num">${tm.score}</td>${G.lives ? `<td class="num">${tm.lives}</td>` : ''}</tr>`).join('')}</tbody></table>`;
  const list = (items, cls) => `<div class="review-words">${items.map(it => `<span class="${cls || ''}">${withAnswer(it)}</span>`).join('')}</div>`;
  const failed = G.failed.length
    ? `<div class="review"><span class="eyebrow">${esc(t('wd.nobody'))} · ${G.failed.length}</span><p class="hint">${esc(t('wd.goOver'))}</p>${list(G.failed)}</div>`
    : `<div class="review"><span class="eyebrow">${esc(t('wd.nobody'))}</span><p class="hint">${esc(t('wd.everyAnswered'))}</p></div>`;
  const unplayed = notPlayed.length
    ? `<div class="review"><span class="eyebrow">${esc(t('wd.notPlayed'))} · ${notPlayed.length}</span><p class="hint">${esc(t('wd.notPlayedHint'))}</p>${list(notPlayed, 'stolen')}</div>` : '';
  const stolen = G.stolen.length
    ? `<div class="review"><span class="eyebrow">${esc(t('wd.onBonus'))} · ${G.stolen.length}</span><div class="review-words">${G.stolen.map(x => `<span class="stolen">${withAnswer(x.item)} <small>${esc(x.by)}</small></span>`).join('')}</div></div>` : '';
  openOverlay(`
    <span class="eyebrow">${esc(sub)}</span>
    <h2>${esc(title)}</h2>
    ${rows}${failed}${unplayed}${stolen}
    <div class="card-actions">
      <button class="btn btn-primary" data-act="again" data-focus type="button">${esc(t('playAgain'))}</button>
      <button class="btn btn-ghost" data-act="settings" type="button">${esc(t('changeSettings'))}</button>
      <button class="btn btn-ghost" data-act="hub" type="button">${esc(t('allGames').replace('← ', ''))}</button>
    </div>`);
  Kit.wake.off();
}

let last = 0;
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000 || 0); last = now;
  if (G && G.state === 'play') {
    G.since += dt;
    const deck = G.teams[G.active].deck;
    if (deck.length && G.blocks.length < G.max && (G.blocks.length === 0 || G.since >= G.fall * .45)) spawn();
    const H = field.clientHeight, W = field.clientWidth;
    for (const b of G.blocks) {
      b.p += dt / G.fall;
      b.x = Math.min(b.x, Math.max(0, W - b.w));
      b.el.style.transform = `translate(${b.x}px,${b.p * (H - b.h)}px)`;
      if (b.p >= 1) { miss(b); break; }
    }
    if (G.state === 'play' && !deck.length && !G.blocks.length) teamFinished();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else if (G && G.state !== 'over' && !views.game.hidden) Kit.wake.on(); });
})();
