(() => {
const { $, esc, t, shuffle, pick, store } = Kit;
const KEY = 'sp-cityrun-v1';
const MAX_TEAMS = 4;
const COLS = 13, ROWS = 10, U = 100;          // streets every 3 tiles, 2×2 buildings in between
const DIRS = [[0,-1],[1,0],[0,1],[-1,0]];     // N E S W
const CLOSED = 6, MIN_TRIP = 15;              // closed streets per city, shortest A → B in steps
const GREEN = 4, CYCLE = 7;                   // traffic lights: seconds green, seconds per cycle
const TRAIN = {cycle:10, warn:5.5, pass:7};   // crossings: open until `warn`, flashing until `pass`, then the train goes by
const WORKS = {first:4, gap:8};               // road works: steps before the first street closes, then between closures
const FUEL = {spare:.3, min:4};               // low fuel: extra steps on top of the shortest route
const PEN = {bump:3, red:5, letter:2, teacher:5, wrong:3, train:5, skip:5, unfinished:30};
const LEVELS = [
  {id:1, stops:1, lights:false, codes:false},
  {id:2, stops:2, lights:true, codes:false},
  {id:3, stops:3, lights:true, codes:true}
];
// The level sets how hard a run is; the mission sets what the job is.
// ordered: goals in list order · reveal: each goal appears when the one before is done · pairs: pick-ups and drop-offs for n stops
const MISSIONS = [
  {id:'classic'},
  {id:'delivery', ordered:true, pairs:n => Math.min(2, n), verbs:['cr.verb.pickup', 'cr.verb.deliver']},
  {id:'taxi', ordered:true, reveal:true, pairs:() => 2, verbs:['cr.verb.taxiPickup', 'cr.verb.taxiDrop']},
  {id:'mystery', clues:true},
  {id:'works'},
  {id:'train'},
  {id:'fuel'},
  {id:'quiz', quiz:true}
];
const MIX = MISSIONS.length;
const msName = ms => t('cr.ms.' + ms.id);

/* ---------- Content: places (12), useful phrases, quiz questions. From packs, files or typed in. ---------- */
const placesPack = Kit.packs('places')[0], quizPack = Kit.packs('questions')[0];
const placesToText = items => items.map(p => [p.icon || '📍', p.name, p.clue || '', p.code || ''].join(' | ')).join('\n');
const parsePlaces = text => Kit.dedupe(String(text).split(/\r?\n/).map(l => {
  const [icon, name, clue, code] = l.split('|').map(x => (x || '').trim());
  return name ? {icon: icon || '📍', name, clue: clue || name, code: code || name} : null;
}).filter(Boolean), p => p.name);
const parseQuiz = text => Kit.parseItems(text).filter(x => x.answer);

const DEFAULTS = {teams: t('kit.teamX', {x: 'A'}) + '\n' + t('kit.teamX', {x: 'B'}), level:2, mission:0, rounds:2, limit:3, sound:true,
  places: placesPack ? placesToText(placesPack.items) : '', phrases: placesPack ? (placesPack.phrases || []).join('\n') : '',
  lang: placesPack ? placesPack.language : 'en', placesTitle: placesPack ? placesPack.title : '',
  quiz: quizPack ? Kit.itemsToText(quizPack.items) : '', quizTitle: quizPack ? quizPack.title : ''};
const S = Object.assign({}, DEFAULTS, store.get(KEY, {}));
if (!(S.mission >= 0 && S.mission <= MIX)) S.mission = 0;
const save = () => store.set(KEY, S);
Kit.sound.on = S.sound;
const lang = () => Kit.langName(S.lang);
let PLACES = [], QUIZ = [];

const views = {setup:$('#view-city-setup'), game:$('#view-city-game')};
function show(name){
  if (name === 'hub') { location.href = '../index.html'; return; }
  for (const k in views) views[k].hidden = k !== name;
  if (name !== 'game') Kit.wake.off();
  window.scrollTo(0,0);
}

const key = (x, y) => x + ',' + y;
const fmt = s => { const n = Math.round(s * 10), m = Math.floor(n / 600); return m + ':' + String(Math.floor(n % 600 / 10)).padStart(2, '0') + '.' + n % 10; };

/* ---------- Setup ---------- */
const teamsEl = $('#cr-teams'), placesEl = $('#cr-places'), phrasesEl = $('#cr-phrases'), quizEl = $('#cr-quiz'), langEl = $('#cr-lang');
teamsEl.value = S.teams; placesEl.value = S.places; phrasesEl.value = S.phrases; quizEl.value = S.quiz; $('#cr-sound').checked = S.sound;
langEl.innerHTML = ['en','es','fr','pt','de','it','ja','zh','ko'].map(c => `<option value="${c}" ${c === S.lang ? 'selected' : ''}>${esc(Kit.langName(c))}</option>`).join('');

function seg(id, k, values, label){
  const box = $('#' + id);
  box.innerHTML = values.map(v => `<input type="radio" name="cr-${k}" id="cr-${k}-${v}" value="${v}" ${S[k] == v ? 'checked' : ''}><label for="cr-${k}-${v}">${esc(label ? label(v) : v)}</label>`).join('');
  box.addEventListener('change', e => { S[k] = +e.target.value; save(); updateSetup(); });
}
seg('cr-seg-level', 'level', [1,2,3], v => t('cr.lv' + v));
seg('cr-seg-mission', 'mission', [...MISSIONS.keys(), MIX], v => v === MIX ? t('cr.ms.mix') : msName(MISSIONS[v]));
seg('cr-seg-rounds', 'rounds', [1,2,3,4]);
seg('cr-seg-limit', 'limit', [2,3,4,5], v => t('minutes', {n: v}));

function updateSetup(){
  const n = Kit.parseTeams(teamsEl.value).length, ms = MISSIONS[S.mission];
  $('#cr-team-count').textContent = (n === 1 ? t('solo') : t('teamsN', {n})) + ' · ' + t('maxN', {n: MAX_TEAMS});
  $('#cr-team-count').style.color = n > MAX_TEAMS ? 'var(--accent)' : '';
  $('#cr-level-note').textContent = t('cr.lv' + S.level + '.note');
  $('#cr-mission-note').textContent = !ms ? t('cr.brief.mix') : t('cr.brief.' + ms.id) + (ms.quiz ? ' ' + t('cr.needsKeyboard') : '');
  const np = parsePlaces(placesEl.value).length;
  $('#cr-place-count').textContent = t('cr.placesN', {n: np});
  $('#cr-place-count').style.color = np < 12 ? 'var(--accent)' : '';
  $('#cr-quiz-count').textContent = t('cr.quizN', {n: parseQuiz(quizEl.value).length});
  const L = lang();
  document.querySelectorAll('.cr-steps li')[1].innerHTML = t('cr.step2', {lang: esc(L)});
  $('#cr-pen-tags').innerHTML = [['bump', PEN.bump], ['red', PEN.red], ['letter', PEN.letter], ['wrong', PEN.wrong], ['train', PEN.train], ['teacher', PEN.teacher]]
    .map(([k, s]) => `<span class="tag">${esc(t('cr.pen.' + k, {n: s, lang: L}))}</span>`).join('');
  $('#cr-phrase-tags').innerHTML = phraseList().map(p => `<span class="tag">${esc(p)}</span>`).join('');
}
const phraseList = () => phrasesEl.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
teamsEl.addEventListener('input', () => { S.teams = teamsEl.value; save(); updateSetup(); });
placesEl.addEventListener('input', () => { S.places = placesEl.value; save(); updateSetup(); });
phrasesEl.addEventListener('input', () => { S.phrases = phrasesEl.value; save(); updateSetup(); });
quizEl.addEventListener('input', () => { S.quiz = quizEl.value; save(); updateSetup(); });
langEl.addEventListener('change', () => { S.lang = langEl.value; save(); updateSetup(); });
$('#cr-sound').addEventListener('change', e => { S.sound = Kit.sound.on = e.target.checked; save(); });
Kit.mountRoster($('#cr-roster'), teamsEl, MAX_TEAMS);
Kit.mountContent($('#cr-place-tools'), {
  type: 'places',
  getPack: () => ({title: S.placesTitle || t('cr.places'), language: S.lang, phrases: phraseList(), items: parsePlaces(placesEl.value)}),
  setPack: p => {
    if (p.items) placesEl.value = placesToText(p.items); else if (p.text) placesEl.value = p.text;
    if (p.phrases) phrasesEl.value = p.phrases.join('\n');
    if (p.language) { S.lang = p.language; langEl.value = p.language; }
    Object.assign(S, {places: placesEl.value, phrases: phrasesEl.value, placesTitle: p.title || ''}); save(); updateSetup();
    $('#cr-content').open = true;
  }
});
Kit.mountContent($('#cr-quiz-tools'), {
  type: 'questions',
  getPack: () => ({title: S.quizTitle || t('cr.quiz'), language: S.lang, items: parseQuiz(quizEl.value)}),
  setPack: p => { quizEl.value = p.items ? Kit.itemsToText(p.items) : p.text || ''; Object.assign(S, {quiz: quizEl.value, quizTitle: p.title || ''}); save(); updateSetup(); $('#cr-content').open = true; }
});
updateSetup();

$('#cr-back-hub').addEventListener('click', () => show('hub'));
$('#cr-btn-full').addEventListener('click', Kit.toggleFullscreen);
const beep = Kit.beep;

/* ---------- City ---------- */
const SEGS = [], CORNERS = [];   // the street between two corners is a segment of two tiles
for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) SEGS.push([[3*i + 1, 3*j], [3*i + 2, 3*j]]);
for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) SEGS.push([[3*i, 3*j + 1], [3*i, 3*j + 2]]);
for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) CORNERS.push({x: 3*i, y: 3*j});
const RAILS = [{h:true, n:3}, {h:true, n:6}, {h:false, n:3}, {h:false, n:6}, {h:false, n:9}];   // inner streets a railway can replace
const onRail = (rail, p) => !!rail && (rail.h ? p.y : p.x) === rail.n;

function bfs(road, sx, sy){
  const d = new Map([[key(sx, sy), 0]]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const k = key(x + dx, y + dy);
      if (road.has(k) && !d.has(k)) { d.set(k, d.get(key(x, y)) + 1); q.push([x + dx, y + dy]); }
    }
  }
  return d;
}

function tryCity(lv, ms, closed){
  const road = new Set(), parks = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (x % 3 === 0 || y % 3 === 0) road.add(key(x, y));
  // train mission: one inner street becomes a railway, and only its corners (the crossings) can be driven over
  const rail = ms.id === 'train' ? {...pick(RAILS), off: Math.random() * TRAIN.cycle} : null;
  const railSeg = s => s.every(([x, y]) => onRail(rail, {x, y}));
  SEGS.filter(railSeg).forEach(s => s.forEach(([x, y]) => road.delete(key(x, y))));
  // close a few streets so the route is not a straight line, but keep every corner reachable
  shuffle(SEGS.filter(s => !railSeg(s))).slice(0, Math.max(0, rail ? closed - 3 : closed)).forEach(s => s.forEach(([x, y]) => { road.delete(key(x, y)); parks.push({x, y}); }));
  if (bfs(road, 0, 0).size !== road.size) return null;
  // one door per building, on a street tile next to it
  const used = new Set(), names = shuffle(PLACES), places = [];
  for (let by = 0; by < 3; by++) for (let bx = 0; bx < 4; bx++) {
    const x0 = 3*bx + 1, y0 = 3*by + 1;
    const cand = [[x0, y0 - 1], [x0 + 1, y0 - 1], [x0, y0 + 2], [x0 + 1, y0 + 2], [x0 - 1, y0], [x0 - 1, y0 + 1], [x0 + 2, y0], [x0 + 2, y0 + 1]]
      .filter(([x, y]) => road.has(key(x, y)) && !used.has(key(x, y)));
    if (!cand.length) return null;
    const [x, y] = pick(cand); used.add(key(x, y));
    places.push({...names[places.length], bx, by, door: {x, y}});
  }
  const ends = CORNERS.filter(p => !onRail(rail, p)), side = p => (rail.h ? p.y : p.x) < rail.n;
  const a = pick(ends), dist = bfs(road, a.x, a.y);
  const far = ends.filter(p => dist.get(key(p.x, p.y)) >= MIN_TRIP && (!rail || side(p) !== side(a)));   // with a railway, B is across the tracks
  if (!far.length) return null;
  const b = pick(far);
  const dir = pick([0,1,2,3].filter(i => road.has(key(a.x + DIRS[i][0], a.y + DIRS[i][1]))));
  const stops = shuffle(places.map((_, i) => i)).slice(0, ms.pairs ? 2 * ms.pairs(lv.stops) : lv.stops);
  const lights = lv.lights ? shuffle(ends.filter(p => p !== a && p !== b)).slice(0, 5).map(p => ({x: p.x, y: p.y, off: Math.random() * CYCLE})) : [];
  return {road, parks, places, a, b, dir, stops, lights, rail};
}
// Almost always the first few tries work; with fewer closed streets a city is always possible, so this never hangs.
function makeCity(lv, ms){
  for (let i = 0; i < 2000; i++) { const m = tryCity(lv, ms, Math.max(0, CLOSED - Math.floor(i / 300))); if (m) return m; }
  throw new Error('City Run: could not build a city');
}

// Every team drives the same city mirrored: same distances, different lefts and rights
function flip(m, fh, fv){
  const fx = x => fh ? COLS - 1 - x : x, fy = y => fv ? ROWS - 1 - y : y, pt = p => ({...p, x: fx(p.x), y: fy(p.y)});
  let dir = m.dir;
  if (fh && dir % 2) dir = 4 - dir;
  if (fv && dir % 2 === 0) dir = 2 - dir;
  return {
    road: new Set([...m.road].map(k => { const [x, y] = k.split(',').map(Number); return key(fx(x), fy(y)); })),
    parks: m.parks.map(pt), a: pt(m.a), b: pt(m.b), dir, stops: m.stops, lights: m.lights.map(pt),
    rail: m.rail && {...m.rail, n: m.rail.h ? fy(m.rail.n) : fx(m.rail.n)},
    places: m.places.map(p => ({...p, bx: fh ? 3 - p.bx : p.bx, by: fv ? 2 - p.by : p.by, door: pt(p.door)}))
  };
}

// Fewest steps from A through every stop (any order) to B
function shortest(m){
  const pts = [m.a, ...m.stops.map(i => m.places[i].door), m.b], d = pts.map(p => bfs(m.road, p.x, p.y));
  const leg = (i, j) => d[i].get(key(pts[j].x, pts[j].y)), end = pts.length - 1;
  let best = Infinity;
  const walk = (at, left, sum) => {
    if (!left.length) { best = Math.min(best, sum + leg(at, end)); return; }
    left.forEach(j => walk(j, left.filter(x => x !== j), sum + leg(at, j)));
  };
  walk(0, m.stops.map((_, i) => i + 1), 0);
  return best;
}

/* ---------- Game ---------- */
const mapEl = $('#cr-map'), overlay = $('#cr-overlay'), card = $('#cr-card'), board = $('#cr-board'), codeEl = $('#cr-code'), toastEl = $('#cr-toast'), fuelEl = $('#cr-fuel');
let G = null;   // the match: teams, rounds, totals
let R = null;   // the run being driven
let car = null, train = null, gates = [], cardAt = 0, toastTimer = 0;
const touch = matchMedia('(pointer: coarse)').matches;

$('#cr-start').addEventListener('click', startGame);
function startGame(){
  const teams = Kit.parseTeams(teamsEl.value), err = $('#cr-setup-error');
  const fail = (msg, el) => { err.textContent = msg; err.hidden = false; el && el.focus(); };
  if (!teams.length) return fail(t('cr.errNoTeams'), teamsEl);
  if (teams.length > MAX_TEAMS) return fail(t('cr.errTooMany', {max: MAX_TEAMS}), teamsEl);
  const places = parsePlaces(placesEl.value);
  if (places.length < 12) { $('#cr-content').open = true; return fail(t('cr.errPlaces', {n: places.length}), placesEl); }
  const level = LEVELS[S.level - 1];
  const wantsQuiz = S.mission === MISSIONS.findIndex(m => m.quiz) || (S.mission === MIX && level.codes);
  QUIZ = parseQuiz(quizEl.value);
  if (wantsQuiz && QUIZ.length < 6) { $('#cr-content').open = true; return fail(t('cr.errQuiz'), quizEl); }
  err.hidden = true;
  PLACES = places;
  G = {
    teams: teams.map(tm => ({name: tm.name, members: tm.members, total: 0, pen: 0, runs: 0})),
    level, rounds: S.rounds, limit: S.limit * 60,
    missions: S.mission === MIX ? shuffle(MISSIONS.filter(m => !m.quiz || level.codes)) : [MISSIONS[S.mission]],   // one per round, in this order
    ms: null, quiz: [],
    round: 0, order: [], k: 0, city: null, state: 'turn', solo: teams.length === 1
  };
  $('#cr-teacher').textContent = t('cr.teacherBtn', {n: PEN.teacher, lang: lang()});
  $('#cr-say').innerHTML = phraseList().map(p => `<li>${esc(p)}</li>`).join('');
  $('#cr-say').closest('.cr-box').hidden = !phraseList().length;
  show('game'); Kit.wake.on(); newRound();
}

function newRound(){
  const n = G.teams.length;
  G.ms = G.missions[G.round % G.missions.length];
  G.city = makeCity(G.level, G.ms);
  G.order = G.teams.map((_, i) => (i + G.round) % n);   // a different team goes first each round
  G.k = 0;
  prepRun();
}

function prepRun(){
  const m = flip(G.city, G.k & 1, G.k & 2), ms = G.ms;
  const best = ms.id === 'fuel' ? shortest(m) : 0, fuel = ms.id === 'fuel' ? best + Math.max(FUEL.min, Math.round(best * FUEL.spare)) : null;
  R = {team: G.order[G.k], map: m, x: m.a.x, y: m.a.y, dir: m.dir, ang: m.dir * 90,
    t: 0, pen: 0, steps: 0, bumps: 0, reds: 0, code: null, arrived: false,
    goals: m.stops.map((p, k) => ({p, type: ms.pairs ? (k % 2 ? 'drop' : 'pickup') : 'visit', done: false})),
    fuel, tank: fuel, works: ms.id === 'works' ? G.level.stops : 0, nextWork: WORKS.first, gate: null};
  drawMap(); hideCode(); renderBoard(); renderSide(); turnCard();
}

// Goals: `at` is the first one not done yet; ordered missions only open that one, and taxi hides the ones after it
const at = () => { const i = R.goals.findIndex(g => !g.done); return i < 0 ? R.goals.length : i; };
const isOpen = (g, k) => !g.done && (!G.ms.ordered || k === at());
const isShown = k => !G.ms.reveal || k <= at();
const doorAt = (p, x, y) => p.door.x === x && p.door.y === y;

function drawMap(){
  const m = R.map, c = v => v * U + U / 2;
  let s = '';
  m.parks.forEach(p => s += `<circle class="cr-tree" cx="${c(p.x)}" cy="${c(p.y)}" r="18"/>`);
  m.road.forEach(k => { const [x, y] = k.split(',').map(Number); s += `<rect class="cr-tile" data-t="${k}" x="${x*U + 3}" y="${y*U + 3}" width="${U - 6}" height="${U - 6}" rx="14"/>`; });
  if (m.rail) {
    const n = c(m.rail.n), line = o => m.rail.h ? `M0 ${n + o}H${COLS * U}` : `M${n + o} 0V${ROWS * U}`;
    s += `<path class="cr-sleepers" d="${line(0)}"/><path class="cr-rails" d="${line(-15)}${line(15)}"/>`;
  }
  m.places.forEach((p, i) => {
    const x0 = (3*p.bx + 1) * U, y0 = (3*p.by + 1) * U;
    const ex = Math.max(x0 + 8, Math.min(x0 + 2*U - 8, c(p.door.x))), ey = Math.max(y0 + 8, Math.min(y0 + 2*U - 8, c(p.door.y)));
    const flat = p.door.y < 3*p.by + 1 || p.door.y > 3*p.by + 2;   // door on the top or bottom wall
    const small = p.name.length > 12 ? ' style="font-size:19px"' : '';
    s += `<g class="cr-place" data-p="${i}"><rect x="${x0 + 8}" y="${y0 + 8}" width="${2*U - 16}" height="${2*U - 16}" rx="22"/>` +
      `<text class="cr-icon" x="${x0 + U}" y="${y0 + U + 8}">${esc(p.icon)}</text><text class="cr-name" x="${x0 + U}" y="${y0 + U + 62}"${small}>${esc(p.name)}</text>` +
      `<line class="cr-door" x1="${ex - (flat ? 24 : 0)}" y1="${ey - (flat ? 0 : 24)}" x2="${ex + (flat ? 24 : 0)}" y2="${ey + (flat ? 0 : 24)}"/></g>` +
      `<rect class="cr-ring" data-p="${i}" x="${p.door.x*U + 12}" y="${p.door.y*U + 12}" width="${U - 24}" height="${U - 24}" rx="16"/>`;
  });
  const lamp = (l, attr) => `<g class="cr-light" ${attr}><rect x="${l.x*U + 7}" y="${l.y*U + 7}" width="${U - 14}" height="${U - 14}" rx="12"/>` +
    `<circle cx="${l.x*U + 76}" cy="${l.y*U + 24}" r="18"/><path d="M${l.x*U + 68} ${l.y*U + 24}h16"/></g>`;
  m.lights.forEach((l, i) => s += lamp(l, `data-l="${i}"`));
  CORNERS.filter(p => onRail(m.rail, p)).forEach(p => s += lamp(p, 'data-gate'));
  s += `<g class="cr-mark cr-a"><circle cx="${c(m.a.x)}" cy="${c(m.a.y)}" r="34"/><text x="${c(m.a.x)}" y="${c(m.a.y) + 16}">A</text></g>`;
  s += `<g class="cr-mark cr-b"><circle cx="${c(m.b.x)}" cy="${c(m.b.y)}" r="34"/><text x="${c(m.b.x)}" y="${c(m.b.y) + 16}">B</text></g>`;
  s += `<g id="cr-car"><g class="cr-car-body"><circle r="34"/><path d="M0-22 17 14 0 5-17 14Z"/></g></g>`;
  if (m.rail) s += `<g id="cr-train"><rect x="-170" y="-31" width="340" height="62" rx="20"/><path d="M-135 0H140"/></g>`;
  mapEl.innerHTML = s;
  car = $('#cr-car'); train = $('#cr-train'); gates = [...mapEl.querySelectorAll('[data-gate]')];
  m.lights.forEach((l, i) => { l.el = mapEl.querySelector(`[data-l="${i}"]`); l.red = null; });
  placeCar(); updateLights(); updateTrain(); markMap();
}
function placeCar(){ car.style.transform = `translate(${(R.x + .5) * U}px,${(R.y + .5) * U}px) rotate(${R.ang}deg)`; }
const isRed = l => (R.t + l.off) % CYCLE >= GREEN;
function updateLights(){
  for (const l of R.map.lights) { const red = isRed(l); if (red !== l.red) { l.red = red; l.el.classList.toggle('red', red); } }
}

// Buildings to visit get a coloured wall, and the doors that can be opened right now get a ring
function markMap(){
  R.map.places.forEach((p, i) => {
    const el = mapEl.querySelector(`.cr-place[data-p="${i}"]`), mine = R.goals.filter((g, k) => g.p === i && isShown(k));
    el.classList.toggle('done', mine.length > 0 && mine.every(g => g.done));
    el.classList.toggle('stop', !G.ms.clues && mine.some(g => !g.done));
    mapEl.querySelector(`.cr-ring[data-p="${i}"]`).classList.toggle('on', !G.ms.clues && R.goals.some((g, k) => g.p === i && isOpen(g, k)));
  });
}

/* ---------- Mission hazards ---------- */
const trainPhase = () => (R.t + R.map.rail.off) % TRAIN.cycle;
const onTracks = () => onRail(R.map.rail, R);
function updateTrain(){
  const r = R.map.rail; if (!r) return;
  const p = trainPhase(), gate = p >= TRAIN.pass ? 'red' : p >= TRAIN.warn ? 'warn' : '';
  if (gate !== R.gate) {
    R.gate = gate;
    gates.forEach(el => { el.classList.toggle('warn', gate === 'warn'); el.classList.toggle('red', gate === 'red'); });
    train.style.display = gate === 'red' ? '' : 'none';
    if (G.state === 'play' && gate === 'warn') beep('alert');
    if (G.state === 'play' && gate === 'red' && onTracks()) penalty(PEN.train, t('cr.toast.tracks'));
  }
  if (gate === 'red') {
    const pos = -200 + (p - TRAIN.pass) / (TRAIN.cycle - TRAIN.pass) * ((r.h ? COLS : ROWS) * U + 400), n = r.n * U + U / 2;
    train.setAttribute('transform', r.h ? `translate(${pos} ${n})` : `translate(${n} ${pos}) rotate(90)`);
  }
}

// Road works: close a street the car is about to use, never a door it still needs, and always leave a way through
function closeStreet(){
  const m = R.map, from = bfs(m.road, R.x, R.y), d = (map, p) => map.get(key(p.x, p.y));
  const todo = R.goals.filter(g => !g.done).map(g => m.places[g.p].door);
  const ok = SEGS.filter(s => {
    if (!s.every(([x, y]) => from.get(key(x, y)) >= 2 && !todo.some(p => p.x === x && p.y === y))) return false;
    const road = new Set(m.road); s.forEach(([x, y]) => road.delete(key(x, y)));
    return bfs(road, R.x, R.y).size === road.size;
  });
  const open = R.goals.filter(isOpen).map(g => m.places[g.p].door).sort((p, q) => d(from, p) - d(from, q));
  const goal = open[0] || m.b, to = bfs(m.road, goal.x, goal.y);
  const ahead = ok.filter(s => s.some(([x, y]) => from.get(key(x, y)) + to.get(key(x, y)) === d(from, goal)))
    .sort((s, u) => from.get(key(...s[0])) - from.get(key(...u[0])));
  const seg = ahead[0] || pick(ok);
  R.works--; R.nextWork = R.steps + WORKS.gap;
  if (!seg) return;
  seg.forEach(([x, y]) => { m.road.delete(key(x, y)); mapEl.querySelector(`[data-t="${key(x, y)}"]`).classList.add('works'); });
  const cone = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  cone.setAttribute('class', 'cr-cone'); cone.setAttribute('x', (seg[0][0] + seg[1][0] + 1) * U / 2); cone.setAttribute('y', (seg[0][1] + seg[1][1] + 1) * U / 2 + 18);
  cone.textContent = '🚧'; car.before(cone);
  toast(t('cr.toast.works'), true, 2200); beep('alert');
}

function renderBoard(){
  board.innerHTML = G.teams.map((tm, i) =>
    `<div class="team ${i === R.team ? 'active' : ''}"><span class="team-name">${esc(tm.name)}</span><span class="team-score" aria-label="${esc(t('time'))}">${tm.runs ? fmt(tm.total) : '–'}</span></div>`).join('');
  $('#cr-progress').textContent = t('cr.progress', {round: G.round + 1, rounds: G.rounds, level: t('cr.lv' + G.level.id), mission: msName(G.ms), limit: S.limit});
}
function renderSide(){
  const m = R.map, ms = G.ms, n = at();
  $('#cr-team').textContent = G.teams[R.team].name;
  $('#cr-time').textContent = fmt(R.t + R.pen);
  $('#cr-pen').textContent = R.pen ? t('cr.penSoFar', {n: R.pen}) : '';
  fuelEl.hidden = R.fuel === null;
  if (R.fuel !== null) fuelEl.innerHTML = `<span>${esc(t('cr.fuel'))}</span><div class="cr-fuel-bar${R.fuel <= 5 ? ' low' : ''}"><i style="width:${R.fuel / R.tank * 100}%"></i></div><b>${R.fuel}</b>`;
  const more = ms.reveal ? Math.max(0, Math.floor((R.goals.length - 1 - n) / 2)) : 0;
  $('#cr-tasks').innerHTML = R.goals.map((g, k) => {
    if (!isShown(k)) return '';
    const p = m.places[g.p], name = p.icon + ' ' + p.name;
    const text = g.type !== 'visit' ? t(ms.verbs[g.type === 'drop' ? 1 : 0]) + ' ' + name : ms.clues && !g.done ? p.clue : name;
    return `<li class="${g.done ? 'done' : ms.ordered && k === n ? 'now' : ''}"><span class="cr-check"></span>${esc(text)}</li>`;
  }).join('') + (more ? `<li class="more">${esc(t('cr.morePassengers', {n: more}))}</li>` : '') +
    `<li class="${R.arrived ? 'done' : ms.ordered && n === R.goals.length ? 'now' : ''}"><span class="cr-check"></span>${esc(t('cr.reachB'))}</li>`;
}

function toast(text, bad, ms = 1100){
  toastEl.textContent = text; toastEl.classList.toggle('bad', !!bad); toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.hidden = true, ms);
}
function penalty(sec, label){
  R.pen += sec; toast('+' + sec + ' s · ' + label, true); beep('bad'); renderSide();
}

function openOverlay(html, solid){
  card.innerHTML = html; overlay.classList.toggle('cr-solid', !!solid); overlay.hidden = false; cardAt = performance.now();
  const b = card.querySelector('[data-focus]'); b && b.focus();
}
function closeOverlay(){ overlay.hidden = true; }

function turnCard(){
  G.state = 'turn';
  const tm = G.teams[R.team];
  const label = G.solo ? t('ready') : G.k === 0 ? t('firstUp') : t('nextUp');
  const swap = G.round > 0 && G.k === 0 ? t('cr.swap') + ' ' : '';
  openOverlay(`
    <span class="eyebrow">${esc(t('cr.roundOf', {round: G.round + 1, rounds: G.rounds}))} · ${esc(label)}</span>
    <h2>${esc(tm.name)}</h2>
    ${tm.members.length ? `<p class="members">${tm.members.map(esc).join(' · ')}</p>` : ''}
    <p class="cr-brief"><b>${esc(t('cr.missionIs', {name: msName(G.ms)}))}</b> ${esc(t('cr.brief.' + G.ms.id))}</p>
    <p class="sub">${esc(swap + t('cr.roles', {lang: lang()}))}</p>
    ${G.solo ? '' : `<p class="cr-watch">${esc(t('cr.watchers'))}</p>`}
    <div class="card-actions"><button class="btn btn-primary btn-big" data-act="go" data-focus type="button">${esc(t('go'))}</button></div>
    <span class="keyhint">${t('cr.clockStarts', {key: '<kbd>' + esc(t('spaceKey')) + '</kbd>'})}</span>`, true);
}
function go(){ if (G.state !== 'turn') return; closeOverlay(); G.state = 'play'; beep('go'); }

function pause(){
  if (!G || G.state !== 'play') return;
  G.state = 'paused';
  openOverlay(`
    <span class="eyebrow">${esc(t('paused'))}</span>
    <h2>${esc(t('takeBreath'))}</h2>
    <div class="card-actions">
      <button class="btn btn-primary btn-big" data-act="resume" data-focus type="button">${esc(t('resume'))}</button>
      <button class="btn btn-ghost" data-act="end" type="button">${esc(t('endGame'))}</button>
    </div>`, true);
}
function resume(){ if (G.state !== 'paused') return; closeOverlay(); G.state = 'play'; if (R.code) focusType(); }
$('#cr-btn-pause').addEventListener('click', () => G && (G.state === 'play' ? pause() : resume()));

/* ---------- Driving ---------- */
function forward(){
  const [dx, dy] = DIRS[R.dir], nx = R.x + dx, ny = R.y + dy;
  if (!R.map.road.has(key(nx, ny))) {
    R.bumps++;
    const body = car.firstChild; body.classList.remove('bump'); void body.getBoundingClientRect(); body.classList.add('bump');
    penalty(PEN.bump, t('cr.toast.bump')); return;
  }
  R.x = nx; R.y = ny; R.steps++; placeCar(); beep('step');
  if (R.fuel !== null) { R.fuel--; renderSide(); }
  const light = R.map.lights.find(l => l.x === nx && l.y === ny);
  if (light && isRed(light)) { R.reds++; penalty(PEN.red, t('cr.toast.red')); }
  if (onTracks() && R.gate === 'red') penalty(PEN.train, t('cr.toast.train'));
  if (nx === R.map.b.x && ny === R.map.b.y) {
    if (at() === R.goals.length) return finishRun(true);
    toast(t('cr.toast.jobsFirst'), true);
  }
  if (R.fuel === 0) return finishRun(false, t('cr.outOfFuel'));
  if (R.works && R.steps >= R.nextWork) closeStreet();
}
function turn(by){
  R.dir = (R.dir + by + 4) % 4; R.ang += by * 90; placeCar(); beep('turn');
}
function action(){
  const m = R.map, here = m.places.findIndex(p => doorAt(p, R.x, R.y));
  const g = R.goals.find((g, k) => g.p === here && isOpen(g, k));
  if (!g) {
    if (G.ms.clues && here >= 0 && !R.goals.some(g => g.p === here)) return penalty(PEN.wrong, t('cr.toast.wrong'));
    toast(t('cr.toast.noDoor'), true); return;
  }
  if (G.ms.quiz) { if (!G.quiz.length) G.quiz = shuffle(QUIZ); const q = G.quiz.pop(); R.code = {g, word: [...q.answer], q: q.prompt, n: 0, miss: 0}; }
  else if (G.level.codes) R.code = {g, word: [...m.places[here].code], n: 0, miss: 0};
  else return completeGoal(g);
  // spaces in an answer are typed for the driver
  skipSpaces(); showCode(); focusType();
}
function skipSpaces(){ const c = R.code; while (c.n < c.word.length && c.word[c.n] === ' ') c.n++; }
// Letters match without caring about case or accents: "cancion" opens CANCIÓN.
function typeLetter(ch){
  const c = R.code;
  if (!c || ch === ' ') return;
  if (Kit.fold(ch) !== Kit.fold(c.word[c.n])) { c.miss++; penalty(PEN.letter, t('cr.toast.letter')); return showCode(); }
  c.n++; c.miss = 0; skipSpaces(); beep('step');
  if (c.n >= c.word.length) return completeGoal(c.g);
  showCode();
}
// Spelling shows the whole word for the navigator to read out. A quiz hides the answer, and gives away a letter after three misses.
function showCode(){
  const c = R.code, shown = k => !c.q || k < c.n || c.word[k] === ' ' || (k === c.n && c.miss >= 3);
  const had = codeEl.querySelector('.cr-type'), focused = had && document.activeElement === had;
  codeEl.innerHTML = `<span class="eyebrow">${esc(c.q ? t('cr.code.quiz') : t('cr.code.spell'))}</span>${c.q ? `<span class="cr-q">${esc(c.q)}</span>` : ''}<div class="cr-letters">${
    c.word.map((ch, k) => `<span class="${k < c.n ? 'ok' : k === c.n ? 'next' : ''}"${ch === ' ' ? ' style="visibility:hidden"' : ''}>${shown(k) ? esc(ch) : ''}</span>`).join('')}</div>` +
    `<input class="cr-type" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="done" placeholder="${esc(t('cr.code.type'))}" ${touch ? '' : 'hidden'}>` +
    `<div class="cr-code-actions"><button class="btn btn-ghost" type="button" data-code="skip">${esc(t('cr.code.skip', {n: PEN.skip}))}</button></div>`;
  codeEl.classList.toggle('top', R.y > ROWS / 2); codeEl.hidden = false;
  if (focused) focusType();
}
function focusType(){ const el = codeEl.querySelector('.cr-type'); if (el && touch) el.focus({preventScroll: true}); }
function hideCode(){ codeEl.hidden = true; codeEl.innerHTML = ''; }
codeEl.addEventListener('input', e => {
  if (!e.target.matches('.cr-type')) return;
  const text = e.target.value; e.target.value = '';
  if (!G || G.state !== 'play') return;
  for (const ch of text) { if (!R.code) break; typeLetter(ch); }
});
codeEl.addEventListener('click', e => {
  if (!e.target.closest('[data-code="skip"]') || !R.code || G.state !== 'play') return;
  e.target.blur(); R.pen += PEN.skip; toast(t('cr.toast.skipped'), true); completeGoal(R.code.g);
});
function completeGoal(g){
  g.done = true; R.code = null; hideCode();
  const m = R.map, next = R.goals[R.goals.indexOf(g) + 1];
  if (g.type === 'visit') toast(m.places[g.p].name + ' ✓');
  else if (g.type === 'drop') toast(G.ms.reveal ? t('cr.toast.thanks') : t('cr.toast.delivered'));
  else if (G.ms.reveal) toast(t('cr.toast.please', {place: m.places[next.p].name}), false, 2200);
  else toast(t('cr.toast.parcel'));
  beep('ok'); markMap(); renderSide();
}

function finishRun(arrived, why){
  G.state = 'result'; R.arrived = arrived; R.code = null; hideCode();
  const left = R.goals.length - R.goals.filter(g => g.done).length + 1;   // jobs not done, plus B itself
  const time = arrived ? R.t + R.pen : G.limit + PEN.unfinished * left;
  const tm = G.teams[R.team]; tm.total += time; tm.pen += R.pen; tm.runs++;
  renderBoard(); renderSide(); beep(arrived ? 'ok' : 'bad');
  const lastRun = G.k === G.order.length - 1, lastRound = G.round === G.rounds - 1;
  const detail = [t('cr.steps', {n: R.steps}), t('cr.bumps', {n: R.bumps})];
  if (G.level.lights) detail.push(t('cr.reds', {n: R.reds}));
  if (R.fuel !== null) detail.push(t('cr.fuelLeft', {n: R.fuel}));
  detail.push(t('cr.penSoFar', {n: R.pen}));
  openOverlay(`
    <span class="eyebrow">${esc(tm.name)} · ${esc(arrived ? t('cr.arrived') : why || t('cr.timeUp'))}</span>
    <h2>${fmt(time)}</h2>
    <p class="sub">${esc(arrived ? detail.join(' · ') : t('cr.unfinished', {limit: fmt(G.limit), n: PEN.unfinished, left}))}</p>
    <div class="card-actions"><button class="btn btn-primary btn-big" data-act="next" type="button">${esc(lastRun ? (lastRound ? t('cr.seeResults') : t('cr.nextRound')) : t('cr.nextTeam'))}</button></div>
    <span class="keyhint">${t('cr.pressEnter', {key: '<kbd>Enter</kbd>'})}</span>`);
}
function next(){
  if (G.state !== 'result') return;
  G.k++;
  if (G.k < G.order.length) return prepRun();
  G.round++;
  if (G.round < G.rounds) return newRound();
  endGame();
}

function endGame(){
  const early = G.state !== 'result' && G.round < G.rounds;
  G.state = 'over'; hideCode();
  const ranked = G.teams.slice().sort((a, b) => (b.runs - a.runs) || (a.total - b.total));
  const top = ranked[0], tie = ranked[1] && ranked[1].runs === top.runs && fmt(ranked[1].total) === fmt(top.total);
  const title = !top.runs ? t('cr.noRuns') : early ? t('gameEnded') : G.solo ? fmt(top.total) : tie ? t('tie') : t('wins', {name: top.name});
  const sub = early ? t('endedEarly') : G.solo ? t('cr.totalOf', {name: top.name}) : t('cr.fastest');
  const rows = G.solo ? '' : `<table class="results"><thead><tr><th>${esc(t('team'))}</th><th class="num">${esc(t('time'))}</th><th class="num">${esc(t('penalties'))}</th></tr></thead><tbody>${
    ranked.map((tm, k) => `<tr class="${k === 0 && !early ? 'win' : ''}"><td>${esc(tm.name)}</td><td class="num">${tm.runs ? fmt(tm.total) : '–'}</td><td class="num">${tm.runs ? '+' + tm.pen + ' s' : '–'}</td></tr>`).join('')}</tbody></table>`;
  openOverlay(`
    <span class="eyebrow">${esc(sub)}</span>
    <h2>${esc(title)}</h2>
    ${rows}
    <div class="card-actions">
      <button class="btn btn-primary" data-act="again" type="button">${esc(t('playAgain'))}</button>
      <button class="btn btn-ghost" data-act="settings" type="button">${esc(t('changeSettings'))}</button>
      <button class="btn btn-ghost" data-act="hub" type="button">${esc(t('allGames').replace('← ', ''))}</button>
    </div>`, true);
  Kit.wake.off();
}

/* ---------- Input ---------- */
card.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  if (performance.now() - cardAt < 350) return;   // a key still held from the last card must not press this one
  ({go, resume, next, end: endGame, again: startGame,
    settings: () => { G = null; show('setup'); },
    hub: () => { G = null; show('hub'); }})[a.dataset.act]?.();
});

const drive = {up: forward, left: () => turn(-1), right: () => turn(1), act: action};
document.querySelector('.cr-pad').addEventListener('click', e => {
  const b = e.target.closest('[data-key]');
  b && b.blur();   // so Space on the keyboard never re-presses a tapped button
  if (b && G && G.state === 'play' && !R.code) drive[b.dataset.key]();
});
$('#cr-teacher').addEventListener('click', e => { e.currentTarget.blur(); if (G && G.state === 'play') penalty(PEN.teacher, t('cr.toast.teacher', {lang: lang()})); });

document.addEventListener('keydown', e => {
  if (views.game.hidden || !G) return;
  if (e.key === 'Escape') { if (G.state === 'play') pause(); else if (G.state === 'paused') resume(); return; }
  if (G.state === 'turn') { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); go(); } return; }
  if (G.state === 'result') { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); next(); } return; }
  if (G.state !== 'play') return;
  if (e.target.matches && e.target.matches('.cr-type')) return;   // the text box types for itself
  const k = {ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right', Space: 'act'}[e.code];
  if (k || e.code === 'ArrowDown') e.preventDefault();   // keep the page still and the focused button unpressed
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (R.code) { if (e.key.length === 1 && e.key !== ' ') { e.preventDefault(); typeLetter(e.key); } return; }
  if (k) drive[k]();
});

let last = 0;
function frame(now){
  const dt = Math.min(.25, (now - last) / 1000 || 0); last = now;
  if (G && G.state === 'play') {
    R.t += dt;
    $('#cr-time').textContent = fmt(R.t + R.pen);
    updateLights(); updateTrain();
    if (G.state === 'play' && R.t + R.pen >= G.limit) finishRun(false);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else if (G && G.state !== 'over' && !views.game.hidden) Kit.wake.on(); });
})();
