(() => {
const $ = s => document.querySelector(s);
const SAMPLES = {
  jp: '必要, 約束, 経験, 天気, 便利, 旅行, 季節, 失敗, 友達, 図書館, 自信, 準備, 会議, 説明, 興味, 危険, 練習, 予約, 返事, 安全',
  cap: 'France, Japan, Brazil, Canada, Australia, Egypt, Mexico, Italy, Kenya, South Korea, Spain, Thailand, Argentina, Germany, India, Peru'
};
const SPEEDS = [{l:'Very slow',t:20},{l:'Slow',t:15},{l:'Medium',t:11},{l:'Fast',t:8},{l:'Very fast',t:6}];
const DEFAULTS = {words:SAMPLES.jp, teams:'Team A\nTeam B', lives:3, speed:2, max:2, sound:true};
const KEY = 'sp-worddrop-v1';
const MAX_TEAMS = 8;
let S = {...DEFAULTS};
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

const views = {setup:$('#view-setup'), game:$('#view-game')};
function show(name){
  if (name === 'hub') { location.href = '../index.html'; return; }
  for (const k in views) views[k].hidden = k !== name;
  if (name !== 'game') releaseWake();
  window.scrollTo(0,0);
}

const parseList = s => { const seen = new Set(); return s.split(/[,、，\n]+/).map(x => x.trim()).filter(x => x && !seen.has(x) && seen.add(x)); };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hearts = (n, total) => '<span class="hearts" aria-label="' + n + ' of ' + total + ' lives">' +
  Array.from({length: total}, (_, i) => '<svg class="' + (i < n ? 'heart-on' : 'heart-off') + '"><use href="#heart"/></svg>').join('') + '</span>';
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- Setup ---------- */
const wordsEl = $('#words'), teamsEl = $('#teams');
wordsEl.value = S.words; teamsEl.value = S.teams; $('#sound').checked = S.sound;

function seg(id, key, values, label){
  const box = $('#' + id);
  box.innerHTML = values.map(v => `<input type="radio" name="${key}" id="${key}-${v}" value="${v}" ${S[key] == v ? 'checked' : ''}><label for="${key}-${v}">${label ? label(v) : v}</label>`).join('');
  box.addEventListener('change', e => { S[key] = +e.target.value; save(); updateCounts(); });
}
seg('seg-lives', 'lives', [1,2,3,4,5]);
seg('seg-speed', 'speed', [1,2,3,4,5]);
seg('seg-max', 'max', [1,2,3,4]);

function updateCounts(){
  const w = parseList(wordsEl.value).length, t = parseList(teamsEl.value).length;
  $('#word-count').textContent = w + (w === 1 ? ' word' : ' words');
  $('#team-count').textContent = (t === 1 ? 'Solo' : t + ' teams') + ' · max ' + MAX_TEAMS;
  $('#team-count').style.color = t > MAX_TEAMS ? 'var(--accent)' : '';
  const note = $('#split-note');
  if (t > 1 && t <= MAX_TEAMS && w >= t) {
    const per = Math.floor(w / t), extra = w - per * t;
    note.textContent = per + (per === 1 ? ' word' : ' words') + ' per team' + (extra ? ' · ' + extra + (extra === 1 ? ' word' : ' words') + ' left unused' : '');
  } else note.textContent = '';
  const sp = SPEEDS[S.speed - 1];
  $('#speed-note').textContent = sp.l + ' · about ' + sp.t + ' seconds to reach the floor';
}
wordsEl.addEventListener('input', () => { S.words = wordsEl.value; save(); updateCounts(); });
teamsEl.addEventListener('input', () => { S.teams = teamsEl.value; save(); updateCounts(); });
$('#sound').addEventListener('change', e => { S.sound = e.target.checked; save(); });
document.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', () => {
  wordsEl.value = SAMPLES[b.dataset.sample]; S.words = wordsEl.value; save(); updateCounts();
}));
updateCounts();

$('#back-hub').addEventListener('click', () => show('hub'));

/* ---------- Sound ---------- */
let ac;
function beep(kind){
  if (!S.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.connect(g); g.connect(ac.destination);
    if (kind === 'hit') { o.type = 'triangle'; o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(1320, t + .12); }
    else if (kind === 'go') { o.type = 'sine'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(780, t + .15); }
    else { o.type = 'sawtooth'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(80, t + .4); }
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .42);
    o.start(t); o.stop(t + .45);
  } catch {}
}

/* ---------- Wake lock / fullscreen ---------- */
let wake = null;
function requestWake(){ try { navigator.wakeLock?.request('screen').then(l => wake = l).catch(() => {}); } catch {} }
function releaseWake(){ try { wake?.release(); } catch {} wake = null; }
$('#btn-full').addEventListener('click', () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  } catch {}
});

/* ---------- Game ---------- */
const field = $('#field'), overlay = $('#overlay'), card = $('#card'), board = $('#board');
let G = null;

$('#start').addEventListener('click', startGame);
function startGame(){
  const words = parseList(wordsEl.value), teams = parseList(teamsEl.value);
  const err = $('#setup-error');
  if (!words.length) { err.textContent = 'Add at least one word to start.'; err.hidden = false; wordsEl.focus(); return; }
  if (!teams.length) { err.textContent = 'Add at least one team or student name.'; err.hidden = false; teamsEl.focus(); return; }
  if (teams.length > MAX_TEAMS) { err.textContent = 'Use ' + MAX_TEAMS + ' teams or fewer. Group students into teams if the class is bigger.'; err.hidden = false; teamsEl.focus(); return; }
  if (words.length < teams.length) { err.textContent = 'Add at least ' + teams.length + ' words so every team gets one.'; err.hidden = false; wordsEl.focus(); return; }
  err.hidden = true;
  clearBlocks();
  const all = shuffle(words), per = Math.floor(all.length / teams.length);
  G = {
    total: per * teams.length,
    teams: teams.map((n, i) => ({name: n, lives: S.lives, score: 0, out: false, deck: all.slice(i * per, (i + 1) * per)})),
    active: 0, blocks: [], state: 'turn', since: 0,
    failed: [], stolen: [], passed: new Set(), fall: SPEEDS[S.speed - 1].t, max: S.max, solo: teams.length === 1, first: true
  };
  show('game'); requestWake(); renderBoard(); turnCard();
}

function renderBoard(){
  board.innerHTML = G.teams.map((t, i) =>
    `<div class="team ${i === G.active && !t.out ? 'active' : ''} ${t.out ? 'out' : ''}" data-i="${i}">
      <span class="team-name">${esc(t.name)}</span>${hearts(t.lives, S.lives)}<span class="team-left">${t.deck.length} left</span><span class="team-score" aria-label="points">${t.score}</span></div>`).join('');
  const used = G.total - G.teams.reduce((n, t) => n + t.deck.length, 0) - G.blocks.length;
  $('#progress').textContent = used + ' / ' + G.total + ' words';
}

function openOverlay(html){ card.innerHTML = html; overlay.hidden = false; const b = card.querySelector('[data-focus]'); b && b.focus(); }
function closeOverlay(){ overlay.hidden = true; }

function turnCard(){
  G.state = 'turn';
  const t = G.teams[G.active];
  const label = G.first ? (G.solo ? 'Ready?' : 'First up') : (G.solo ? 'Keep going' : 'Next up');
  openOverlay(`
    <span class="eyebrow">${label}</span>
    <h2>${esc(t.name)}</h2>
    ${hearts(t.lives, S.lives)}
    <p class="sub">${t.deck.length} ${t.deck.length === 1 ? 'word' : 'words'} left for this team</p>
    <div class="card-actions"><button class="btn btn-primary btn-big" data-act="go" data-focus type="button">Go</button></div>
    <span class="keyhint">or press <kbd>Space</kbd></span>`);
}

function go(){
  closeOverlay(); G.first = false; G.state = 'play'; G.since = 0; beep('go');
}

function pause(){
  if (!G || G.state !== 'play') return;
  G.state = 'paused';
  openOverlay(`
    <span class="eyebrow">Paused</span>
    <h2>Take a breath</h2>
    <div class="card-actions">
      <button class="btn btn-primary btn-big" data-act="resume" data-focus type="button">Resume</button>
      <button class="btn btn-ghost" data-act="end" type="button">End game</button>
    </div>`);
}
function resume(){ closeOverlay(); G.state = 'play'; }
$('#btn-pause').addEventListener('click', () => G && (G.state === 'play' ? pause() : G.state === 'paused' ? resume() : null));

card.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  ({go, resume, end: () => endGame('ended'), again: startGame,
    settings: () => { clearBlocks(); G = null; show('setup'); },
    hub: () => { clearBlocks(); G = null; show('hub'); }})[a.dataset.act]?.();
});

document.addEventListener('keydown', e => {
  if (views.game.hidden || !G) return;
  if (e.code === 'Space') {
    if (e.target.closest && e.target.closest('.block')) return;
    e.preventDefault();
    if (G.state === 'turn') go(); else if (G.state === 'play') pause(); else if (G.state === 'paused') resume();
  } else if (e.key === 'Escape' && G.state === 'play') pause();
});

function spawn(){
  const word = G.teams[G.active].deck.shift();
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'block block-in' + (G.passed.has(word) ? ' steal' : ''); el.textContent = word;
  el.setAttribute('aria-label', word + ' — tap when answered correctly');
  field.appendChild(el);
  const w = el.offsetWidth, h = el.offsetHeight, W = field.clientWidth, H = field.clientHeight;
  let x, tries = 0;
  do { x = Math.random() * Math.max(0, W - w); tries++; }
  while (tries < 14 && G.blocks.some(o => o.p * (H - o.h) < h * 1.8 && x < o.x + o.w + 16 && x + w + 16 > o.x));
  const b = {word, el, x, w, h, p: 0, done: false};
  el.style.transform = `translate(${x}px,0px)`;
  el.addEventListener('pointerdown', ev => { ev.preventDefault(); hit(b); });
  el.addEventListener('click', () => hit(b));
  G.blocks.push(b); G.since = 0;
  renderBoard();
}

function hit(b){
  if (!G || G.state !== 'play' || b.done) return;
  b.done = true;
  G.blocks = G.blocks.filter(o => o !== b);
  const t = G.teams[G.active]; t.score++;
  if (G.passed.has(b.word)) G.stolen.push({word: b.word, by: t.name});
  b.el.classList.add('pop');
  const p = document.createElement('div'); p.className = 'plus1'; p.textContent = '+1';
  const y = b.p * (field.clientHeight - b.h);
  p.style.left = (b.x + b.w / 2 - 18) + 'px'; p.style.top = (y - 10) + 'px';
  field.appendChild(p);
  setTimeout(() => { b.el.remove(); p.remove(); }, 700);
  beep('hit'); renderBoard();
  board.querySelector(`[data-i="${G.active}"]`)?.classList.add('bump');
}

function miss(b){
  G.state = 'miss'; b.done = true;
  b.el.classList.add('missed');
  const others = G.blocks.filter(o => o !== b);
  others.forEach(o => { o.done = true; o.el.classList.add('fade'); setTimeout(() => o.el.remove(), 300);
    const d = G.teams[G.active].deck; d.splice(Math.floor(Math.random() * (d.length + 1)), 0, o.word); });
  G.blocks = [];
  const t = G.teams[G.active]; t.lives--; if (t.lives <= 0) t.out = true;
  // A missed word passes once to the next team still in the game, as their first word
  let receiver = null;
  if (!G.passed.has(b.word)) {
    const n = G.teams.length;
    for (let k = 1; k < n; k++) { const o = G.teams[(G.active + k) % n]; if (!o.out) { receiver = o; break; } }
    if (receiver) { receiver.deck.unshift(b.word); G.passed.add(b.word); G.total++; }
  }
  if (!receiver) G.failed.push(b.word); // nobody answered it
  const floor = $('#floor'); floor.classList.remove('flash'); void floor.offsetWidth; floor.classList.add('flash');
  const ban = document.createElement('div'); ban.className = 'banner';
  ban.textContent = (t.out ? `${t.name} is out!` : `${t.name} loses a life`) + (receiver ? ` · ${b.word} goes to ${receiver.name}` : '');
  field.appendChild(ban);
  beep('miss'); renderBoard();
  setTimeout(() => {
    b.el.remove(); ban.remove();
    if (!G) return;
    if (isOver()) endGame(G.teams.some(playable) ? 'lives' : 'words');
    else { nextTeam(); renderBoard(); turnCard(); }
  }, 1300);
}

const playable = t => !t.out && t.deck.length > 0;
const aliveCount = () => G.teams.filter(t => !t.out).length;
function isOver(){
  if (!G.teams.some(playable)) return true;
  return G.solo ? aliveCount() === 0 : aliveCount() <= 1;
}
function nextTeam(){
  const n = G.teams.length;
  for (let k = 1; k <= n; k++) { const i = (G.active + k) % n; if (playable(G.teams[i])) { G.active = i; return; } }
}
function teamFinished(){
  G.state = 'miss';
  const t = G.teams[G.active];
  const ban = document.createElement('div'); ban.className = 'banner'; ban.style.background = 'var(--good)';
  ban.textContent = t.name + ' finished all their words!';
  field.appendChild(ban); beep('go');
  setTimeout(() => {
    ban.remove(); if (!G) return;
    if (isOver()) endGame('words'); else { nextTeam(); renderBoard(); turnCard(); }
  }, 1300);
}
function clearBlocks(){ field.querySelectorAll('.block,.plus1,.banner').forEach(n => n.remove()); }

function endGame(reason){
  G.state = 'over'; clearBlocks();
  // passed words the receiving team never got to play also count as unanswered
  G.teams.forEach(t => t.deck.forEach(w => { if (G.passed.has(w) && !G.failed.includes(w)) G.failed.push(w); })); G.blocks = []; renderBoard();
  const ranked = G.teams.map((t, i) => ({...t, i})).sort((a, b) => (a.out - b.out) || (b.score - a.score) || (b.lives - a.lives));
  let title, sub;
  if (G.solo) {
    const t = G.teams[0];
    title = t.score + (t.score === 1 ? ' word' : ' words');
    sub = reason === 'words' ? `${esc(t.name)} cleared the whole list!` : `${esc(t.name)}'s score`;
  } else {
    const top = ranked[0], tie = ranked[1] && !ranked[1].out === !top.out && ranked[1].score === top.score && ranked[1].lives === top.lives;
    title = tie ? 'It’s a tie!' : esc(top.name) + ' wins!';
    sub = reason === 'words' ? 'Every team used its words' : reason === 'ended' ? 'Game ended early' : 'Last team standing';
  }
  const rows = G.solo ? '' : `<table class="results"><thead><tr><th>Team</th><th class="num">Points</th><th class="num">Lives</th></tr></thead><tbody>${
    ranked.map((t, k) => `<tr class="${k === 0 ? 'win' : ''}"><td>${esc(t.name)}</td><td class="num">${t.score}</td><td class="num">${t.lives}</td></tr>`).join('')}</tbody></table>`;
  const failed = G.failed.length
    ? `<div class="review"><span class="eyebrow">Nobody answered · ${G.failed.length}</span><p class="hint">Go over these with the class.</p><div class="review-words">${G.failed.map(w => `<span>${esc(w)}</span>`).join('')}</div></div>`
    : `<div class="review"><span class="eyebrow">Nobody answered</span><p class="hint">Every word was answered by someone.</p></div>`;
  const stolen = G.stolen.length
    ? `<div class="review"><span class="eyebrow">Answered on the bonus · ${G.stolen.length}</span><div class="review-words">${G.stolen.map(x => `<span class="stolen">${esc(x.word)} <small>${esc(x.by)}</small></span>`).join('')}</div></div>` : '';
  const review = failed + stolen;
  openOverlay(`
    <span class="eyebrow">${sub}</span>
    <h2>${title}</h2>
    ${rows}${review}
    <div class="card-actions">
      <button class="btn btn-primary" data-act="again" data-focus type="button">Play again</button>
      <button class="btn btn-ghost" data-act="settings" type="button">Change settings</button>
      <button class="btn btn-ghost" data-act="hub" type="button">All games</button>
    </div>`);
  releaseWake();
}

let last = 0;
function frame(t){
  const dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
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
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else if (G && G.state !== 'over' && !views.game.hidden) requestWake(); });
})();
