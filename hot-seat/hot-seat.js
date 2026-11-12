// Hot Seat, and the template for new games: copy this folder, rename it, change the rules below.
// The shape every static game follows:
//   1. Settings `S` saved with Kit.store under one key.
//   2. Setup: content box (Kit.mountContent), class list (Kit.mountRoster), segmented options.
//   3. Game state `G`, one render function per part of the screen, overlays for turn / pause / results.
//   4. All text through t('…') so the game works in every language of strings.js.
(() => {
const { $, esc, t, shuffle, store } = Kit;
const KEY = 'hub-hotseat-v1';
const MAX_TEAMS = 8;
const TIMES = [30, 60, 90, 120], TURNS = [1, 2, 3], SKIPS = [0, 1, 3, 99];
const first = Kit.packs('word-list')[0];
const DEFAULTS = { words: first ? Kit.itemsToText(first.items) : '', title: first ? first.title : '', side: 'left',
  teams: t('kit.teamX', { x: 'A' }) + '\n' + t('kit.teamX', { x: 'B' }), time: 60, turns: 2, skips: 3, sound: true };
const S = Object.assign({}, DEFAULTS, store.get(KEY, {}));
const save = () => store.set(KEY, S);
Kit.sound.on = S.sound;

const views = { setup: $('#view-setup'), game: $('#view-game') };
const show = name => { for (const k in views) views[k].hidden = k !== name; if (name !== 'game') Kit.wake.off(); scrollTo(0, 0); };

/* ---------- Setup ---------- */
const wordsEl = $('#words'), teamsEl = $('#teams');
wordsEl.value = S.words; teamsEl.value = S.teams; $('#sound').checked = S.sound;

function seg(id, k, values, label) {
  const box = $('#' + id);
  box.innerHTML = values.map(v => `<input type="radio" name="${k}" id="${k}-${v}" value="${v}" ${S[k] == v ? 'checked' : ''}><label for="${k}-${v}">${esc(label ? label(v) : v)}</label>`).join('');
  box.addEventListener('change', e => { S[k] = isNaN(+e.target.value) ? e.target.value : +e.target.value; save(); update(); });
}
seg('seg-side', 'side', ['left', 'right'], v => t('hs.' + v));
seg('seg-time', 'time', TIMES, v => t('seconds', { n: v }));
seg('seg-turns', 'turns', TURNS);
seg('seg-skips', 'skips', SKIPS, v => v === 99 ? t('hs.unlimited') : v);

function update() {
  const items = Kit.parseItems(wordsEl.value), n = Kit.parseTeams(teamsEl.value).length;
  $('#word-count').textContent = t('hs.wordsN', { n: items.length });
  $('#team-count').textContent = (n === 1 ? t('solo') : t('teamsN', { n })) + ' · ' + t('maxN', { n: MAX_TEAMS });
  $('#side-row').hidden = !items.some(x => x.answer);
}
wordsEl.addEventListener('input', () => { S.words = wordsEl.value; save(); update(); });
teamsEl.addEventListener('input', () => { S.teams = teamsEl.value; save(); update(); });
$('#sound').addEventListener('change', e => { S.sound = Kit.sound.on = e.target.checked; save(); });
Kit.mountContent($('#content-tools'), {
  type: 'word-list',
  getPack: () => ({ title: S.title || t('hs.title'), items: Kit.parseItems(wordsEl.value) }),
  setPack: p => { wordsEl.value = p.items ? Kit.itemsToText(p.items) : p.text || ''; S.title = p.title || ''; S.words = wordsEl.value; save(); update(); },
});
Kit.mountRoster($('#roster'), teamsEl, MAX_TEAMS);
update();
$('#start').addEventListener('click', start);
$('#btn-full').addEventListener('click', Kit.toggleFullscreen);

/* ---------- Game ---------- */
let G = null;
const overlay = $('#overlay'), card = $('#card');
const cardText = it => (S.side === 'right' && it.answer) ? it.answer : it.prompt;

function start() {
  const items = Kit.parseItems(wordsEl.value), teams = Kit.parseTeams(teamsEl.value), err = $('#setup-error');
  const fail = (m, el) => { err.textContent = m; err.hidden = false; el.focus(); };
  if (items.length < 5) return fail(t('hs.errNoWords'), wordsEl);
  if (!teams.length) return fail(t('hs.errNoTeams'), teamsEl);
  if (teams.length > MAX_TEAMS) return fail(t('hs.errTooMany', { max: MAX_TEAMS }), teamsEl);
  err.hidden = true;
  G = { deck: shuffle(items), review: [], missedAll: [], teams: teams.map(x => ({ ...x, score: 0, seat: 0 })),
    turn: 0, total: teams.length * S.turns, state: 'card', left: 0, word: null, got: [], missed: [], skips: 0 };
  show('game'); Kit.wake.on(); turnCard();
}
const team = () => G.teams[G.turn % G.teams.length];

function renderBoard() {
  $('#board').innerHTML = G.teams.map(x => `<div class="team ${x === team() && G.state !== 'over' ? 'active' : ''}"><span class="team-name">${esc(x.name)}</span><span class="team-score">${x.score}</span></div>`).join('');
  $('#progress').textContent = t('hs.progress', { turn: Math.min(G.turn + 1, G.total), turns: G.total });
}
function renderClock() {
  const s = Math.max(0, Math.ceil(G.left));
  $('#clock').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  $('#clock-bar').style.width = (G.left / S.time * 100) + '%';
  $('#clock').parentElement.classList.toggle('low', G.left <= 10);
}
function renderSkip() {
  const left = S.skips - G.skips, b = $('#skip');
  b.innerHTML = esc(S.skips === 99 ? t('hs.skip') : left > 0 ? t('hs.skipLeft', { n: left }) : t('hs.noSkips')) + ' <kbd>S</kbd>';
  b.disabled = S.skips !== 99 && left <= 0;
}
function seatName(x) { return x.members.length ? x.members[x.seat % x.members.length] : ''; }

function openOverlay(html) { card.innerHTML = html; overlay.hidden = false; card.querySelector('[data-focus]')?.focus(); }

function turnCard() {
  G.state = 'card'; renderBoard();
  const x = team(), who = seatName(x);
  openOverlay(`<span class="eyebrow">${esc(G.turn ? t('nextUp') : t('firstUp'))}</span><h2>${esc(x.name)}</h2>
    <p class="members">${esc(who ? t('hs.seat', { name: who }) : t('hs.seatAny'))}</p>
    <p class="sub">${esc(t('hs.cardIntro'))}</p>
    <div class="card-actions"><button class="btn btn-primary btn-big" data-act="go" data-focus type="button">${esc(t('go'))}</button></div>
    <span class="keyhint">${t('orPress', { key: '<kbd>' + esc(t('spaceKey')) + '</kbd>' })}</span>`);
}
function go() {
  overlay.hidden = true;
  Object.assign(G, { state: 'play', left: S.time, got: [], missed: [], skips: 0 });
  const who = seatName(team());
  $('#seat').textContent = who ? t('hs.seat', { name: who }) : '';
  renderSkip(); renderClock(); nextWord(); Kit.beep('go');
}
function nextWord() {
  if (!G.deck.length) G.deck = shuffle(G.review.length ? G.review.splice(0) : Kit.parseItems(wordsEl.value));
  G.word = G.deck.pop();
  const el = $('#word'), text = cardText(G.word);
  el.textContent = text; el.classList.toggle('long', text.length > 14);
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
function got() { if (G?.state !== 'play') return; team().score++; G.got.push(G.word); Kit.beep('hit'); renderBoard(); nextWord(); }
function skip() {
  if (G?.state !== 'play' || (S.skips !== 99 && G.skips >= S.skips)) return;
  G.skips++; G.missed.push(G.word); G.review.push(G.word); G.missedAll.push(G.word); Kit.beep('turn'); renderSkip(); nextWord();
}
function said() { if (G?.state !== 'play') return; G.missed.push(G.word); G.review.push(G.word); G.missedAll.push(G.word); Kit.beep('bad'); nextWord(); }

function timeUp() {
  G.state = 'result'; Kit.beep('alert');
  G.deck.push(G.word);                                   // the word on screen goes back for later
  team().seat++;
  const list = (items, cls) => `<div class="review-words">${items.map(it => `<span class="${cls || ''}">${esc(cardText(it))}</span>`).join('')}</div>`;
  const last = G.turn + 1 >= G.total;
  openOverlay(`<span class="eyebrow">${esc(t('hs.timeUp'))}</span><h2>${esc(team().name)}</h2><p class="sub">${esc(t('hs.gotN', { n: G.got.length }))}</p>
    ${G.got.length ? `<div class="review"><span class="eyebrow">${esc(t('hs.gotList'))}</span>${list(G.got, 'stolen')}</div>` : ''}
    ${G.missed.length ? `<div class="review"><span class="eyebrow">${esc(t('hs.missedList'))}</span>${list(G.missed)}</div>` : ''}
    <div class="card-actions"><button class="btn btn-primary btn-big" data-act="next" data-focus type="button">${esc(last ? t('hs.seeResults') : t('hs.nextTeam'))}</button></div>`);
}
function next() { G.turn++; if (G.turn >= G.total) endGame(); else turnCard(); }

function endGame() {
  G.state = 'over'; renderBoard(); Kit.wake.off();
  const ranked = G.teams.slice().sort((a, b) => b.score - a.score);
  const tie = ranked[1] && ranked[1].score === ranked[0].score;
  const title = G.teams.length === 1 ? t('hs.gotN', { n: ranked[0].score }) : tie ? t('tie') : t('wins', { name: ranked[0].name });
  const review = Kit.dedupe(G.missedAll, x => x.prompt);
  openOverlay(`<span class="eyebrow">${esc(t('gameEnded'))}</span><h2>${esc(title)}</h2>
    ${G.teams.length > 1 ? `<table class="results"><thead><tr><th>${esc(t('team'))}</th><th class="num">${esc(t('points'))}</th></tr></thead><tbody>${ranked.map((x, i) => `<tr class="${i ? '' : 'win'}"><td>${esc(x.name)}</td><td class="num">${x.score}</td></tr>`).join('')}</tbody></table>` : ''}
    ${review.length ? `<div class="review"><span class="eyebrow">${esc(t('hs.review'))} · ${review.length}</span><p class="hint">${esc(t('hs.reviewHint'))}</p><div class="review-words">${review.map(it => `<span>${esc(it.prompt)}${it.answer ? ' <small>→ ' + esc(it.answer) + '</small>' : ''}</span>`).join('')}</div></div>` : ''}
    <div class="card-actions"><button class="btn btn-primary" data-act="again" data-focus type="button">${esc(t('playAgain'))}</button>
    <button class="btn btn-ghost" data-act="settings" type="button">${esc(t('changeSettings'))}</button>
    <a class="btn btn-ghost" href="../index.html">${esc(t('allGames').replace('← ', ''))}</a></div>`);
}

function pause() {
  if (G?.state !== 'play') return;
  G.state = 'paused';
  openOverlay(`<span class="eyebrow">${esc(t('paused'))}</span><h2>${esc(t('takeBreath'))}</h2>
    <div class="card-actions"><button class="btn btn-primary btn-big" data-act="resume" data-focus type="button">${esc(t('resume'))}</button>
    <button class="btn btn-ghost" data-act="end" type="button">${esc(t('endGame'))}</button></div>`);
}
function resume() { overlay.hidden = true; G.state = 'play'; }

/* ---------- Input ---------- */
card.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  ({ go, next, resume, end: () => { G.state = 'over'; endGame(); }, again: start, settings: () => { G = null; show('setup'); } })[a.dataset.act]?.();
});
$('#got').addEventListener('click', e => { e.currentTarget.blur(); got(); });
$('#skip').addEventListener('click', e => { e.currentTarget.blur(); skip(); });
$('#said').addEventListener('click', e => { e.currentTarget.blur(); said(); });
$('#btn-pause').addEventListener('click', () => G && (G.state === 'play' ? pause() : G.state === 'paused' ? resume() : null));
document.addEventListener('keydown', e => {
  if (!G || views.game.hidden || e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); if (G.state === 'card') go(); else if (G.state === 'play') pause(); else if (G.state === 'paused') resume(); return; }
  if (e.key === 'Escape') return pause();
  if (G.state === 'result' && e.key === 'Enter') { e.preventDefault(); return next(); }
  if (G.state !== 'play') return;
  if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); got(); }
  else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') { e.preventDefault(); skip(); }
  else if (e.key === 'x' || e.key === 'X') said();
});

/* ---------- Clock ---------- */
let last = 0;
(function frame(now) {
  const dt = Math.min(.25, (now - last) / 1000 || 0); last = now;
  if (G && G.state === 'play') {
    const before = Math.ceil(G.left);
    G.left -= dt; renderClock();
    if (Math.ceil(G.left) !== before && G.left <= 5 && G.left > 0) Kit.beep('tick');
    if (G.left <= 0) timeUp();
  }
  requestAnimationFrame(frame);
})(0);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
})();
