(() => {
const $ = s => document.querySelector(s);
const KEY = 'sp-cityrun-v1';
const MAX_TEAMS = 4;
const COLS = 13, ROWS = 10, U = 100;          // streets every 3 tiles, 2×2 buildings in between
const DIRS = [[0,-1],[1,0],[0,1],[-1,0]];     // N E S W
const CLOSED = 6, MIN_TRIP = 15;              // closed streets per city, shortest A → B in steps
const GREEN = 4, CYCLE = 7;                   // traffic lights: seconds green, seconds per cycle
const TRAIN = {cycle:10, warn:5.5, pass:7};   // crossings: open until `warn`, flashing until `pass`, then the train goes by
const WORKS = {first:4, gap:8};               // road works: steps before the first street closes, then between closures
const FUEL = {spare:.3, min:4};               // low fuel: extra steps on top of the shortest route
const PEN = {bump:3, red:5, letter:2, teacher:5, wrong:3, train:5, unfinished:30};
const PLACES = [
  {name:'Bank', icon:'🏦', code:'MONEY', clue:'You keep your money here'}, {name:'Bakery', icon:'🥐', code:'BREAD', clue:'You buy bread here'},
  {name:'Park', icon:'🌳', code:'TREE', clue:'You play outside here'}, {name:'School', icon:'🏫', code:'PENCIL', clue:'You study here with a teacher'},
  {name:'Hospital', icon:'🏥', code:'DOCTOR', clue:'You go here when you are sick'}, {name:'Library', icon:'📚', code:'BOOK', clue:'You borrow books here'},
  {name:'Post office', icon:'📮', code:'LETTER', clue:'You send letters here'}, {name:'Station', icon:'🚉', code:'TRAIN', clue:'You catch a train here'},
  {name:'Café', icon:'☕', code:'COFFEE', clue:'You drink coffee here'}, {name:'Cinema', icon:'🎬', code:'MOVIE', clue:'You watch movies here'},
  {name:'Hotel', icon:'🏨', code:'ROOM', clue:'You sleep here on a trip'}, {name:'Museum', icon:'🏛️', code:'PAINT', clue:'You see famous paintings here'}
];
const QUIZ = [
  {q:'What colour is a banana?', a:'YELLOW'}, {q:'What colour is the sky?', a:'BLUE'}, {q:'What colour is snow?', a:'WHITE'},
  {q:'What colour is grass?', a:'GREEN'}, {q:'How many days are in a week?', a:'SEVEN'}, {q:'How many months are in a year?', a:'TWELVE'},
  {q:'How many legs does a spider have?', a:'EIGHT'}, {q:'What is two plus two?', a:'FOUR'}, {q:'What animal says “meow”?', a:'CAT'},
  {q:'What animal says “woof”?', a:'DOG'}, {q:'What animal has a very long neck?', a:'GIRAFFE'}, {q:'What do bees make?', a:'HONEY'},
  {q:'What is the opposite of hot?', a:'COLD'}, {q:'What is the opposite of up?', a:'DOWN'}, {q:'What is the opposite of day?', a:'NIGHT'},
  {q:'What day comes after Monday?', a:'TUESDAY'}, {q:'What day comes before Sunday?', a:'SATURDAY'}, {q:'What month comes after April?', a:'MAY'},
  {q:'What is the first month of the year?', a:'JANUARY'}, {q:'What season comes after winter?', a:'SPRING'}, {q:'What is frozen water?', a:'ICE'}
];
const LEVELS = [
  {l:'Easy', stops:1, lights:false, codes:false, note:'One stop on the way to B. No traffic lights.'},
  {l:'Medium', stops:2, lights:true, codes:false, note:'Two stops and traffic lights.'},
  {l:'Hard', stops:3, lights:true, codes:true, note:'Three stops, traffic lights, and a word to spell at every door. Needs a keyboard.'}
];
// The level sets how hard a run is; the mission sets what the job is.
// ordered: goals in list order · reveal: each goal appears when the one before is done · pairs: pick-ups and drop-offs for n stops
const MISSIONS = [
  {id:'classic', l:'Classic', brief:'Visit every stop in any order, then drive to B.'},
  {id:'delivery', l:'Delivery', ordered:true, pairs:n => Math.min(2, n), verbs:['Pick up at', 'Deliver to'],
    brief:'Pick up each parcel and deliver it, in the order on the list. Then drive to B.'},
  {id:'taxi', l:'Taxi', ordered:true, reveal:true, pairs:() => 2, verbs:['Pick up at', 'Take them to'],
    brief:'Pick up a passenger to find out where they want to go. The next passenger appears after each drop-off.'},
  {id:'mystery', l:'Mystery', clues:true, brief:'The stops are clues, not names. Work out the places and visit them all. A wrong door costs 3 s.'},
  {id:'works', l:'Road works', brief:'Streets close while you drive. Find another way around.'},
  {id:'train', l:'Train crossing', brief:'A railway cuts the city in two. Never be on a crossing when the train comes: +5 s.'},
  {id:'fuel', l:'Low fuel', brief:'There is only fuel for a few extra steps. Plan the route before you move.'},
  {id:'quiz', l:'Quiz doors', quiz:true, brief:'Every door has a question. The navigator asks it and the driver types the answer.'}
];
const MIX = MISSIONS.length;
const DEFAULTS = {teams:'Team A\nTeam B', level:2, mission:0, rounds:2, limit:3, sound:true};
let S = {...DEFAULTS};
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
if (!(S.mission >= 0 && S.mission <= MIX)) S.mission = 0;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

const views = {hub:$('#view-hub'), setup:$('#view-city-setup'), game:$('#view-city-game')};
function show(name){
  for (const k in views) views[k].hidden = k !== name;
  if (name !== 'game') releaseWake();
  window.scrollTo(0,0);
}

const parseList = s => { const seen = new Set(); return s.split(/[,、，\n]+/).map(x => x.trim()).filter(x => x && !seen.has(x) && seen.add(x)); };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const key = (x, y) => x + ',' + y;
const fmt = s => { const t = Math.round(s * 10), m = Math.floor(t / 600); return m + ':' + String(Math.floor(t % 600 / 10)).padStart(2, '0') + '.' + t % 10; };

/* ---------- Setup ---------- */
const teamsEl = $('#cr-teams');
teamsEl.value = S.teams; $('#cr-sound').checked = S.sound;

function seg(id, k, values, label){
  const box = $('#' + id);
  box.innerHTML = values.map(v => `<input type="radio" name="cr-${k}" id="cr-${k}-${v}" value="${v}" ${S[k] == v ? 'checked' : ''}><label for="cr-${k}-${v}">${label ? label(v) : v}</label>`).join('');
  box.addEventListener('change', e => { S[k] = +e.target.value; save(); updateSetup(); });
}
seg('cr-seg-level', 'level', [1,2,3], v => LEVELS[v - 1].l);
seg('cr-seg-mission', 'mission', [...MISSIONS.keys(), MIX], v => v === MIX ? 'Mix' : MISSIONS[v].l);
seg('cr-seg-rounds', 'rounds', [1,2,3,4]);
seg('cr-seg-limit', 'limit', [2,3,4,5], v => v + ' min');

function updateSetup(){
  const t = parseList(teamsEl.value).length, ms = MISSIONS[S.mission];
  $('#cr-team-count').textContent = (t === 1 ? 'Solo' : t + ' teams') + ' · max ' + MAX_TEAMS;
  $('#cr-team-count').style.color = t > MAX_TEAMS ? 'var(--accent)' : '';
  $('#cr-level-note').textContent = LEVELS[S.level - 1].note;
  $('#cr-mission-note').textContent = !ms ? 'A different mission every round. Quiz doors only joins the mix on Hard, because it needs a keyboard.'
    : ms.brief + (ms.quiz ? ' Needs a keyboard.' : '');
}
teamsEl.addEventListener('input', () => { S.teams = teamsEl.value; save(); updateSetup(); });
$('#cr-sound').addEventListener('change', e => { S.sound = e.target.checked; save(); });
updateSetup();

$('#open-city').addEventListener('click', () => show('setup'));
$('#cr-back-hub').addEventListener('click', () => show('hub'));
if (location.hash === '#city-run') show('setup');

/* ---------- Sound ---------- */
let ac;
function beep(kind){
  if (!S.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    let len = .12;
    o.connect(g); g.connect(ac.destination);
    if (kind === 'step') { o.type = 'triangle'; o.frequency.setValueAtTime(520, t); len = .07; }
    else if (kind === 'turn') { o.type = 'triangle'; o.frequency.setValueAtTime(360, t); len = .07; }
    else if (kind === 'ok') { o.type = 'triangle'; o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(1320, t + .14); len = .22; }
    else if (kind === 'go') { o.type = 'sine'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(780, t + .15); len = .3; }
    else if (kind === 'alert') { o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(660, t + .13); len = .28; }
    else { o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + .3); len = .34; }
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + len);
    o.start(t); o.stop(t + len + .03);
  } catch {}
}

/* ---------- Wake lock / fullscreen ---------- */
let wake = null;
function requestWake(){ try { navigator.wakeLock?.request('screen').then(l => wake = l).catch(() => {}); } catch {} }
function releaseWake(){ try { wake?.release(); } catch {} wake = null; }
$('#cr-btn-full').addEventListener('click', () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  } catch {}
});

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

function tryCity(lv, ms){
  const road = new Set(), parks = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (x % 3 === 0 || y % 3 === 0) road.add(key(x, y));
  // train mission: one inner street becomes a railway, and only its corners (the crossings) can be driven over
  const rail = ms.id === 'train' ? {...pick(RAILS), off: Math.random() * TRAIN.cycle} : null;
  const railSeg = s => s.every(([x, y]) => onRail(rail, {x, y}));
  SEGS.filter(railSeg).forEach(s => s.forEach(([x, y]) => road.delete(key(x, y))));
  // close a few streets so the route is not a straight line, but keep every corner reachable
  shuffle(SEGS.filter(s => !railSeg(s))).slice(0, rail ? CLOSED - 3 : CLOSED).forEach(s => s.forEach(([x, y]) => { road.delete(key(x, y)); parks.push({x, y}); }));
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
function makeCity(lv, ms){ for (;;) { const m = tryCity(lv, ms); if (m) return m; } }

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

$('#cr-start').addEventListener('click', startGame);
function startGame(){
  const teams = parseList(teamsEl.value), err = $('#cr-setup-error');
  if (!teams.length) { err.textContent = 'Add at least one team or pair.'; err.hidden = false; teamsEl.focus(); return; }
  if (teams.length > MAX_TEAMS) { err.textContent = 'Use ' + MAX_TEAMS + ' teams or fewer.'; err.hidden = false; teamsEl.focus(); return; }
  err.hidden = true;
  const level = LEVELS[S.level - 1];
  G = {
    teams: teams.map(n => ({name: n, total: 0, pen: 0, runs: 0})),
    level, rounds: S.rounds, limit: S.limit * 60,
    missions: S.mission === MIX ? shuffle(MISSIONS.filter(m => !m.quiz || level.codes)) : [MISSIONS[S.mission]],   // one per round, in this order
    ms: null, quiz: [],
    round: 0, order: [], k: 0, city: null, state: 'turn', solo: teams.length === 1
  };
  show('game'); requestWake(); newRound();
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
    s += `<g class="cr-place" data-p="${i}"><rect x="${x0 + 8}" y="${y0 + 8}" width="${2*U - 16}" height="${2*U - 16}" rx="22"/>` +
      `<text class="cr-icon" x="${x0 + U}" y="${y0 + U + 8}">${p.icon}</text><text class="cr-name" x="${x0 + U}" y="${y0 + U + 62}">${p.name}</text>` +
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
    if (G.state === 'play' && gate === 'red' && onTracks()) penalty(PEN.train, 'On the tracks!');
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
    .sort((s, t) => from.get(key(...s[0])) - from.get(key(...t[0])));
  const seg = ahead[0] || pick(ok);
  R.works--; R.nextWork = R.steps + WORKS.gap;
  if (!seg) return;
  seg.forEach(([x, y]) => { m.road.delete(key(x, y)); mapEl.querySelector(`[data-t="${key(x, y)}"]`).classList.add('works'); });
  const cone = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  cone.setAttribute('class', 'cr-cone'); cone.setAttribute('x', (seg[0][0] + seg[1][0] + 1) * U / 2); cone.setAttribute('y', (seg[0][1] + seg[1][1] + 1) * U / 2 + 18);
  cone.textContent = '🚧'; car.before(cone);
  toast('Road works! A street is closed', true, 2200); beep('alert');
}

function renderBoard(){
  board.innerHTML = G.teams.map((t, i) =>
    `<div class="team ${i === R.team ? 'active' : ''}"><span class="team-name">${esc(t.name)}</span><span class="team-score" aria-label="total time">${t.runs ? fmt(t.total) : '–'}</span></div>`).join('');
  $('#cr-progress').textContent = `Round ${G.round + 1} of ${G.rounds} · ${G.level.l} · ${G.ms.l} · ${S.limit} min limit`;
}
function renderSide(){
  const m = R.map, ms = G.ms, n = at();
  $('#cr-team').textContent = G.teams[R.team].name;
  $('#cr-time').textContent = fmt(R.t + R.pen);
  $('#cr-pen').textContent = R.pen ? '+' + R.pen + ' s in penalties' : '';
  fuelEl.hidden = R.fuel === null;
  if (R.fuel !== null) fuelEl.innerHTML = `<span>Fuel</span><div class="cr-fuel-bar${R.fuel <= 5 ? ' low' : ''}"><i style="width:${R.fuel / R.tank * 100}%"></i></div><b>${R.fuel}</b>`;
  const more = ms.reveal ? Math.max(0, Math.floor((R.goals.length - 1 - n) / 2)) : 0;
  $('#cr-tasks').innerHTML = R.goals.map((g, k) => {
    if (!isShown(k)) return '';
    const p = m.places[g.p], name = p.icon + ' ' + p.name;
    const text = g.type !== 'visit' ? ms.verbs[g.type === 'drop' ? 1 : 0] + ' ' + name : ms.clues && !g.done ? p.clue : name;
    return `<li class="${g.done ? 'done' : ms.ordered && k === n ? 'now' : ''}"><span class="cr-check"></span>${text}</li>`;
  }).join('') + (more ? `<li class="more">+ ${more} more ${more === 1 ? 'passenger' : 'passengers'}</li>` : '') +
    `<li class="${R.arrived ? 'done' : ms.ordered && n === R.goals.length ? 'now' : ''}"><span class="cr-check"></span>Reach B</li>`;
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
  const swap = G.round > 0 && G.k === 0 ? 'New city. Swap driver and navigator. ' : '';
  openOverlay(`
    <span class="eyebrow">Round ${G.round + 1} of ${G.rounds} · ${G.solo ? 'Ready?' : G.k === 0 ? 'First up' : 'Next up'}</span>
    <h2>${esc(G.teams[R.team].name)}</h2>
    <p class="cr-brief"><b>Mission: ${G.ms.l}.</b> ${G.ms.brief}</p>
    <p class="sub">${swap}Driver: back to the screen, fingers on the arrow keys. Navigator: English only.</p>
    <div class="card-actions"><button class="btn btn-primary btn-big" data-act="go" data-focus type="button">Go</button></div>
    <span class="keyhint">or press <kbd>Space</kbd> · the clock starts right away</span>`, true);
}
function go(){ if (G.state !== 'turn') return; closeOverlay(); G.state = 'play'; beep('go'); }

function pause(){
  if (!G || G.state !== 'play') return;
  G.state = 'paused';
  openOverlay(`
    <span class="eyebrow">Paused</span>
    <h2>Take a breath</h2>
    <div class="card-actions">
      <button class="btn btn-primary btn-big" data-act="resume" data-focus type="button">Resume</button>
      <button class="btn btn-ghost" data-act="end" type="button">End game</button>
    </div>`, true);
}
function resume(){ if (G.state !== 'paused') return; closeOverlay(); G.state = 'play'; }
$('#cr-btn-pause').addEventListener('click', () => G && (G.state === 'play' ? pause() : resume()));

/* ---------- Driving ---------- */
function forward(){
  const [dx, dy] = DIRS[R.dir], nx = R.x + dx, ny = R.y + dy;
  if (!R.map.road.has(key(nx, ny))) {
    R.bumps++;
    const body = car.firstChild; body.classList.remove('bump'); void body.getBoundingClientRect(); body.classList.add('bump');
    penalty(PEN.bump, 'Bump!'); return;
  }
  R.x = nx; R.y = ny; R.steps++; placeCar(); beep('step');
  if (R.fuel !== null) { R.fuel--; renderSide(); }
  const light = R.map.lights.find(l => l.x === nx && l.y === ny);
  if (light && isRed(light)) { R.reds++; penalty(PEN.red, 'Red light!'); }
  if (onTracks() && R.gate === 'red') penalty(PEN.train, 'Train!');
  if (nx === R.map.b.x && ny === R.map.b.y) {
    if (at() === R.goals.length) return finishRun(true);
    toast('Finish your jobs first', true);
  }
  if (R.fuel === 0) return finishRun(false, 'Out of fuel');
  if (R.works && R.steps >= R.nextWork) closeStreet();
}
function turn(by){
  R.dir = (R.dir + by + 4) % 4; R.ang += by * 90; placeCar(); beep('turn');
}
function action(){
  const m = R.map, here = m.places.findIndex(p => doorAt(p, R.x, R.y));
  const g = R.goals.find((g, k) => g.p === here && isOpen(g, k));
  if (!g) {
    if (G.ms.clues && here >= 0 && !R.goals.some(g => g.p === here)) return penalty(PEN.wrong, 'Wrong place');
    toast('No door to open here', true); return;
  }
  if (G.ms.quiz) { if (!G.quiz.length) G.quiz = shuffle(QUIZ); const q = G.quiz.pop(); R.code = {g, word: q.a, q: q.q, n: 0, miss: 0}; }
  else if (G.level.codes) R.code = {g, word: m.places[here].code, n: 0, miss: 0};
  else return completeGoal(g);
  showCode();
}
function typeLetter(ch){
  const c = R.code;
  if (ch !== c.word[c.n]) { c.miss++; penalty(PEN.letter, 'Wrong letter'); return showCode(); }
  c.n++; c.miss = 0; beep('step'); showCode();
  if (c.n === c.word.length) completeGoal(c.g);
}
// Spelling shows the whole word for the navigator to read out. A quiz hides the answer, and gives away a letter after three misses.
function showCode(){
  const c = R.code, show = k => !c.q || k < c.n || (k === c.n && c.miss >= 3);
  codeEl.innerHTML = `<span class="eyebrow">${c.q ? 'Navigator asks · driver types the answer' : 'Spell it to open the door'}</span>${c.q ? `<span class="cr-q">${c.q}</span>` : ''}<div class="cr-letters">${
    [...c.word].map((ch, k) => `<span class="${k < c.n ? 'ok' : k === c.n ? 'next' : ''}">${show(k) ? ch : ''}</span>`).join('')}</div>`;
  codeEl.classList.toggle('top', R.y > ROWS / 2); codeEl.hidden = false;
}
function hideCode(){ codeEl.hidden = true; }
function completeGoal(g){
  g.done = true; R.code = null; hideCode();
  const m = R.map, next = R.goals[R.goals.indexOf(g) + 1];
  if (g.type === 'visit') toast(m.places[g.p].name + ' ✓');
  else if (g.type === 'drop') toast(G.ms.reveal ? 'Thank you!' : 'Delivered ✓');
  else if (G.ms.reveal) toast(`“${m.places[next.p].name}, please!”`, false, 2200);
  else toast('Parcel picked up');
  beep('ok'); markMap(); renderSide();
}

function finishRun(arrived, why){
  G.state = 'result'; R.arrived = arrived; R.code = null; hideCode();
  const left = R.goals.length - R.goals.filter(g => g.done).length + 1;   // jobs not done, plus B itself
  const time = arrived ? R.t + R.pen : G.limit + PEN.unfinished * left;
  const t = G.teams[R.team]; t.total += time; t.pen += R.pen; t.runs++;
  renderBoard(); renderSide(); beep(arrived ? 'ok' : 'bad');
  const lastRun = G.k === G.order.length - 1, lastRound = G.round === G.rounds - 1;
  const detail = [R.steps + ' steps', R.bumps + (R.bumps === 1 ? ' bump' : ' bumps')];
  if (G.level.lights) detail.push(R.reds + (R.reds === 1 ? ' red light' : ' red lights'));
  if (R.fuel !== null) detail.push(R.fuel + ' fuel left');
  detail.push('+' + R.pen + ' s in penalties');
  openOverlay(`
    <span class="eyebrow">${esc(t.name)} · ${arrived ? 'Arrived at B' : why || 'Time is up'}</span>
    <h2>${fmt(time)}</h2>
    <p class="sub">${arrived ? detail.join(' · ') : `${fmt(G.limit)} limit + ${PEN.unfinished} s for each thing left to do (${left})`}</p>
    <div class="card-actions"><button class="btn btn-primary btn-big" data-act="next" type="button">${lastRun ? (lastRound ? 'See results' : 'Next round') : 'Next team'}</button></div>
    <span class="keyhint">or press <kbd>Enter</kbd></span>`);
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
  G.state = 'over'; hideCode();
  const ranked = G.teams.slice().sort((a, b) => (b.runs - a.runs) || (a.total - b.total));
  const top = ranked[0], tie = ranked[1] && ranked[1].runs === top.runs && fmt(ranked[1].total) === fmt(top.total);
  const title = !top.runs ? 'No runs finished' : G.solo ? fmt(top.total) : tie ? 'It’s a tie!' : esc(top.name) + ' wins!';
  const sub = G.solo ? esc(top.name) + '’s total time' : 'Fastest total time';
  const rows = G.solo ? '' : `<table class="results"><thead><tr><th>Team</th><th class="num">Time</th><th class="num">Penalties</th></tr></thead><tbody>${
    ranked.map((t, k) => `<tr class="${k === 0 ? 'win' : ''}"><td>${esc(t.name)}</td><td class="num">${t.runs ? fmt(t.total) : '–'}</td><td class="num">${t.runs ? '+' + t.pen + ' s' : '–'}</td></tr>`).join('')}</tbody></table>`;
  openOverlay(`
    <span class="eyebrow">${sub}</span>
    <h2>${title}</h2>
    ${rows}
    <div class="card-actions">
      <button class="btn btn-primary" data-act="again" type="button">Play again</button>
      <button class="btn btn-ghost" data-act="settings" type="button">Change settings</button>
      <button class="btn btn-ghost" data-act="hub" type="button">All games</button>
    </div>`, true);
  releaseWake();
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
$('#cr-teacher').addEventListener('click', e => { e.currentTarget.blur(); if (G && G.state === 'play') penalty(PEN.teacher, 'English only!'); });

document.addEventListener('keydown', e => {
  if (views.game.hidden || !G) return;
  if (e.key === 'Escape') { if (G.state === 'play') pause(); else if (G.state === 'paused') resume(); return; }
  if (G.state === 'turn') { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); go(); } return; }
  if (G.state === 'result') { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); next(); } return; }
  if (G.state !== 'play') return;
  const k = {ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right', Space: 'act'}[e.code];
  if (k || e.code === 'ArrowDown') e.preventDefault();   // keep the page still and the focused button unpressed
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (R.code) { if (/^Key[A-Z]$/.test(e.code)) typeLetter(e.code.slice(3)); return; }
  if (k) drive[k]();
});

let last = 0;
function frame(t){
  const dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
  if (G && G.state === 'play') {
    R.t += dt;
    $('#cr-time').textContent = fmt(R.t + R.pen);
    updateLights(); updateTrain();
    if (G.state === 'play' && R.t + R.pen >= G.limit) finishRun(false);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else if (G && G.state !== 'over' && !views.game.hidden) requestWake(); });
})();
