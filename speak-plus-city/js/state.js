// Speak Plus City — game state and rules.
//
// The teacher window owns the one true game state. Every change goes through
// apply(state, action, ctx), which returns a NEW state (the old one is left
// untouched, so the teacher can keep it for Undo). Nothing in this file
// touches the DOM, so it also runs in Node for the tests (tests/run.mjs).
//
// ctx = { content, now, rand }: the content file, the current time in ms and
// a random function. Tests pass their own to get repeatable games.
//
// Players are referred to by their index in state.players ("pid").
// Squares are referred to by their index on the board, 0–47 ("sq").

export const BOARD_SIZE = 48;
export const JAIL = 12;              // the Coffee Break corner
export const MAX_PLAYERS = 6;
export const LEVELS = ['beginner', 'intermediate', 'advanced'];
export const LEVEL_NAMES = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

// Player tokens: an icon and a colour each. The setup screen offers them in this order.
export const TOKENS = [
  { icon: '🚗', color: '#E8483B' },
  { icon: '🐱', color: '#1F2F5C' },
  { icon: '🎩', color: '#2E9E7A' },
  { icon: '🌸', color: '#D65DA0' },
  { icon: '🚲', color: '#E39B2B' },
  { icon: '⭐', color: '#5B6BBF' },
  { icon: '🐶', color: '#A0673A' },
  { icon: '🎸', color: '#0F8FA8' }
];

// Teacher settings. Saved with the game, and also remembered for the next game.
export const DEFAULT_SETTINGS = {
  startMoney: 1500,
  salary: 200,
  gameMinutes: 90,
  turnSecs: 0,             // 0 = no per-turn timer
  auctionSecs: 30,
  blackMarketSecs: 120,
  hintSecs: 15,            // a teacher hint closes itself after this
  english: 'rewards',      // 'off' | 'rewards' | 'fines'
  englishBonus: 20,
  englishFine: 20,
  // What each level sees on its turn: 'all' = frames + vocabulary, 'vocab' = vocabulary (frames on request), 'none'
  hints: { beginner: 'all', intermediate: 'vocab', advanced: 'none' },
  surprises: { mystery: true, market: true, missions: true, blackMarket: true, rules: true, townFund: true, stars: true },
  sentenceBonus: 20,       // "Approve + bonus" for an excellent sentence
  starBonus: 20,
  ruleFine: 20,
  festivalTalk: 100,       // reward for the Town Festival corner talk
  fundTarget: 600,
  festivalBonus: 100,      // everyone gets this when the town fund is full
  taxToFund: true,
  loanInterest: 10,        // % added to a loan from the City Bank square
  missionBonus: 200,
  guessBonus: 100,
  lastTen: true            // last 10 minutes: rewards are doubled
};

const MAX_LOG = 2000;
const MAX_FX = 30;

// ---------- Small helpers ----------

export const money = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Fill "{name}"-style placeholders. Unknown ones become a blank to fill in: ___
export function fill(text, vars = {}) {
  return String(text || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '___'));
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base[k] || {}, v) : v;
  }
  return out;
}

export const square = (s, sq) => s.squares[sq];
export const ownerOf = (s, sq) => (s.props[sq] ? s.props[sq].owner : null);
export const isMortgaged = (s, sq) => !!(s.props[sq] && s.props[sq].mortgaged);
export const currentPlayer = s => (s.turn ? s.players[s.turn.pid] : null);
export const groupSquares = (s, gid) => s.squares.map((q, i) => (q.group === gid ? i : -1)).filter(i => i >= 0);
export const playerProps = (s, pid) => Object.keys(s.props).map(Number).filter(i => s.props[i].owner === pid).sort((a, b) => a - b);
export const ownsGroup = (s, gid, pid) => groupSquares(s, gid).every(i => ownerOf(s, i) === pid);
export const mortgageValue = q => Math.round(q.price / 2);

// Market boom/crash multiplier for a colour group.
export function marketMult(s, gid) {
  const m = s.market;
  return m && (!m.group || m.group === gid) ? m.mult : 1;
}
export const priceOf = (s, sq) => Math.round(square(s, sq).price * marketMult(s, square(s, sq).group));

// Rent: doubled for a full colour group, then the market multiplier.
export function rentOf(s, sq) {
  const q = square(s, sq);
  const owner = ownerOf(s, sq);
  const full = owner != null && ownsGroup(s, q.group, owner);
  return Math.round(q.rent * (full ? 2 : 1) * marketMult(s, q.group));
}

// Total worth for the ranking: money + property values + Black Market items − debts.
export function worth(s, pid) {
  const p = s.players[pid];
  let props = 0;
  for (const sq of playerProps(s, pid)) {
    const q = square(s, sq);
    props += isMortgaged(s, sq) ? q.price - mortgageValue(q) : q.price;
  }
  const specials = p.specials.reduce((t, x) => t + x.value, 0);
  return { money: p.money, props, specials, debt: p.debt, total: p.money + props + specials - p.debt };
}

// Game timer, in ms left. Pausing freezes it.
export function timeLeft(s, now) {
  const t = s.timer;
  if (!t || !t.dur) return null;
  const paused = t.paused + (t.pausedAt ? now - t.pausedAt : 0);
  return Math.max(0, t.dur - (now - t.startAt - paused));
}

// Positive rewards are doubled in the last 10 minutes.
const boost = (s, amt) => (s.lastTen && s.settings.lastTen && amt > 0 ? amt * 2 : amt);
const on = (s, key) => !!s.settings.surprises[key];

function log(s, text, kind = 'info', ctx) {
  s.log.push({ t: ctx ? ctx.now : Date.now(), text, kind });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}

// Effects are one-off things the board animates (dice, moves, announcements…).
// Each has a growing id so the board only plays the new ones.
function fx(s, e) {
  s.fxSeq = (s.fxSeq || 0) + 1;
  s.fx.push({ id: s.fxSeq, ...e });
  if (s.fx.length > MAX_FX) s.fx.splice(0, s.fx.length - MAX_FX);
}

function pay(s, pid, delta, why, ctx, kind = 'money') {
  if (!delta) return;
  const p = s.players[pid];
  p.money += delta;
  fx(s, { kind: 'money', pid, delta });
  if (why) log(s, `${p.name} ${delta > 0 ? 'gets' : 'pays'} ${money(Math.abs(delta))} — ${why}`, kind, ctx);
}

function addToFund(s, amount, ctx) {
  if (!on(s, 'townFund') || amount <= 0) return;
  s.fund += amount;
  fx(s, { kind: 'fund', amount });
  while (s.fund >= s.settings.fundTarget && s.settings.fundTarget > 0) {
    s.fund -= s.settings.fundTarget;
    s.festivals++;
    const bonus = boost(s, s.settings.festivalBonus);
    s.players.forEach((p, i) => pay(s, i, bonus, null, ctx));
    log(s, `🏮 The town fund is full! Town Festival: everyone gets ${money(bonus)}.`, 'event', ctx);
    fx(s, { kind: 'announce', title: 'Town Festival!', text: `The town fund is full. Everyone gets ${money(bonus)}!`, style: 'festival' });
  }
}

// Draw from a content deck (chance, mystery, jailChallenges), matching the player's level.
// Each deck/level keeps its own shuffled queue in s.decks so cards don't repeat too soon.
function draw(s, deck, level, ctx) {
  const list = ctx.content[deck] || [];
  if (!list.length) return null;
  let ok = list.map((c, i) => (c.level === level || c.level === 'all' || !c.level ? i : -1)).filter(i => i >= 0);
  if (!ok.length) ok = list.map((_, i) => i);
  const key = `${deck}:${level}`;
  let q = (s.decks[key] || []).filter(i => ok.includes(i));
  if (!q.length) q = shuffle(ok, ctx.rand);
  const idx = q.pop();
  s.decks[key] = q;
  return { ...list[idx] };
}

function nextRule(s, ctx) {
  const rules = ctx.content.rules || [];
  if (!on(s, 'rules') || !rules.length) { s.rule = null; return; }
  let q = (s.ruleQueue || []).filter(i => i < rules.length);
  if (!q.length) q = shuffle(rules.map((_, i) => i), ctx.rand);
  s.rule = { text: rules[q.pop()], round: s.round };
  s.ruleQueue = q;
  fx(s, { kind: 'announce', title: 'Rule of the round', text: s.rule.text, style: 'rule' });
  log(s, `Rule of the round: ${s.rule.text}`, 'rule', ctx);
}

// ---------- Setup ----------

export function emptyState(settings = {}) {
  return {
    v: 1, phase: 'setup',
    settings: deepMerge(DEFAULT_SETTINGS, settings),
    squares: [], groups: [], sayIt: {}, players: [], props: {},
    turn: null, pending: null, auction: null, trade: null, black: null,
    market: null, rule: null, ruleQueue: [], hint: null, requests: [],
    decks: {}, round: 1, fund: 0, festivals: 0, lastTen: false,
    timer: null, results: null, log: [], fx: [], fxSeq: 0, reqSeq: 0, hintSeq: 0
  };
}

function createGame(prev, { players, settings }, ctx) {
  const s = emptyState(deepMerge(prev.settings, settings));
  s.fxSeq = prev.fxSeq || 0;   // keep effect ids growing, so an open board doesn't miss new ones
  const c = ctx.content;
  if (!c.squares || c.squares.length !== BOARD_SIZE) throw new Error(`The content file needs exactly ${BOARD_SIZE} squares.`);
  if (!players || players.length < 2 || players.length > MAX_PLAYERS) throw new Error(`Add 2 to ${MAX_PLAYERS} players.`);
  // The board is copied into the game, so a saved game keeps its board even if the content changes later.
  s.squares = JSON.parse(JSON.stringify(c.squares));
  s.groups = JSON.parse(JSON.stringify(c.groups));
  s.sayIt = JSON.parse(JSON.stringify(c.sayIt || {}));   // prompts and hints the board shows
  const missions = shuffle((c.missions || []).map(m => m.text), ctx.rand);
  s.players = players.map((p, i) => ({
    name: String(p.name || `Player ${i + 1}`).trim().slice(0, 24),
    token: p.token ?? i,
    level: LEVELS.includes(p.level) ? p.level : 'beginner',
    money: s.settings.startMoney,
    pos: 0, debt: 0, stars: 0, inJail: false,
    specials: [], notes: '',
    mission: on(s, 'missions') && missions.length ? missions[i % missions.length] : null,
    missionDone: false, guessed: false
  }));
  s.phase = 'play';
  s.timer = s.settings.gameMinutes > 0 ? { dur: s.settings.gameMinutes * 60000, startAt: ctx.now, pausedAt: null, paused: 0 } : null;
  log(s, `New game: ${s.players.map(p => p.name).join(', ')}.`, 'turn', ctx);
  fx(s, { kind: 'announce', title: 'Welcome to Speak Plus City!', text: 'Buy, trade and talk your way to the top.', style: 'start' });
  nextRule(s, ctx);
  startTurn(s, 0, ctx);
  return s;
}

// ---------- Turns ----------

function startTurn(s, pid, ctx) {
  const p = s.players[pid];
  s.turn = { pid, step: p.inJail ? 'jail' : 'roll', dice: null, handled: false, endsAt: s.settings.turnSecs > 0 ? ctx.now + s.settings.turnSecs * 1000 : null };
  s.pending = null;
  fx(s, { kind: 'turn', pid });
}

function nextTurn(s, ctx) {
  const n = s.players.length;
  const pid = (s.turn.pid + 1) % n;
  if (pid === 0) newRound(s, ctx);
  startTurn(s, pid, ctx);
}

function newRound(s, ctx) {
  s.round++;
  log(s, `— Round ${s.round} —`, 'turn', ctx);
  if (s.market) {
    s.market.rounds--;
    if (s.market.rounds <= 0) {
      s.market = null;
      fx(s, { kind: 'announce', title: 'Market back to normal', text: 'Prices and rents are normal again.', style: 'market' });
      log(s, 'The market is back to normal.', 'event', ctx);
    }
  }
  if (s.rule || on(s, 'rules')) nextRule(s, ctx);
}

function moveBy(s, pid, steps, ctx) {
  const p = s.players[pid];
  const from = p.pos;
  p.pos = (from + steps) % BOARD_SIZE;
  fx(s, { kind: 'move', pid, from, steps });
  if (from + steps >= BOARD_SIZE) pay(s, pid, s.settings.salary, 'salary for passing Start', ctx);
}

function sendToJail(s, pid, ctx) {
  const p = s.players[pid];
  p.pos = JAIL;
  p.inJail = true;
  fx(s, { kind: 'jail', pid });
  log(s, `${p.name} goes to Coffee Break!`, 'turn', ctx);
}

function roll(s, dice, ctx) {
  const t = s.turn;
  if (s.phase !== 'play') throw new Error('The game is not running.');
  if (t.step !== 'roll') throw new Error('This player has already rolled.');
  if (s.pending) throw new Error('Finish the pending action first.');
  const [a, b] = dice;
  t.dice = dice;
  const pid = t.pid;
  fx(s, { kind: 'dice', dice, pid });
  log(s, `${s.players[pid].name} rolls ${a} + ${b} = ${a + b}.`, 'turn', ctx);
  moveBy(s, pid, a + b, ctx);
  land(s, ctx);
}

// What happens the moment a token stops on a square.
function land(s, ctx) {
  const t = s.turn;
  const p = s.players[t.pid];
  const q = square(s, p.pos);
  t.step = 'land';
  t.handled = false;
  if (q.type === 'gotojail') { sendToJail(s, t.pid, ctx); t.handled = true; }
  else if (['start', 'jail'].includes(q.type)) t.handled = true;
  else if (q.type === 'property' && ownerOf(s, p.pos) === t.pid) t.handled = true;
  else if (q.type === 'property' && isMortgaged(s, p.pos)) t.handled = true;
  else if (q.type === 'mystery' && !on(s, 'mystery')) t.handled = true;
  else if (q.type === 'blackmarket' && !on(s, 'blackMarket')) t.handled = true;
}

// Does the current square still need something before the turn can end?
export function mustAct(s) {
  const t = s.turn;
  if (!t || t.step !== 'land' || t.handled) return false;
  const sq = s.players[t.pid].pos;
  const q = square(s, sq);
  if (q.type === 'property') {
    // Ownership can change during the turn (a trade, the teacher): only unowned or someone else's unmortgaged property needs action.
    const owner = ownerOf(s, sq);
    return owner == null || (owner !== t.pid && !isMortgaged(s, sq));
  }
  return ['chance', 'mystery', 'bank'].includes(q.type);
}

// The buttons the board shows for the current player. Shared by board and teacher.
// Each option: { id, label, say (key in content.sayIt), primary, disabled, why }
export function options(s) {
  if (s.phase !== 'play' || !s.turn || s.pending) return [];
  const t = s.turn;
  const pid = t.pid;
  const p = s.players[pid];
  const sq = p.pos;
  const q = square(s, sq);
  const out = [];
  const add = (id, label, say, extra = {}) => out.push({ id, label, say, ...extra });
  if (t.step === 'jail') {
    add('jailSpeak', 'Speak your way out', 'jail', { primary: true });
    add('jailStay', 'Miss this turn', null);
    return out;
  }
  if (t.step === 'roll') add('roll', 'Roll the dice', null, { primary: true });
  if (t.step === 'land' && !t.handled) {
    const owner = ownerOf(s, sq);
    if (q.type === 'property' && owner == null) {
      add('buy', `Buy for ${money(priceOf(s, sq))}`, 'buy', { primary: true });
      add('pass', 'Pass → auction', 'pass');
    } else if (q.type === 'property' && owner !== pid && !isMortgaged(s, sq)) {
      add('rent', `Pay rent ${money(rentOf(s, sq))}`, 'rent', { primary: true });
    } else if (q.type === 'chance') add('card', 'Draw a card', 'card', { primary: true });
    else if (q.type === 'mystery') add('mystery', 'Take the challenge', 'mystery', { primary: true });
    else if (q.type === 'bank') add('bank', 'Talk to the bank', 'bank_' + q.bank, { primary: true });
    else if (q.type === 'festival') add('festival', 'Festival talk', 'festival', { primary: true });
    else if (q.type === 'blackmarket') add('blackmarket', 'Open the Black Market', 'blackmarket', { primary: true });
  }
  add('trade', 'Trade', 'trade');
  add('ask', 'Ask the bank', null);
  if (t.step === 'land') {
    const blocked = mustAct(s) ? 'Finish this square first.' : s.auction ? 'The auction is still running.' : null;
    add('end', 'End turn', 'end', { primary: !blocked && (t.handled || q.type === 'festival' || q.type === 'blackmarket'), disabled: !!blocked, why: blocked });
  }
  return out;
}

// ---------- Actions ----------

// Actions the board window is allowed to send. Everything else is teacher-only.
export const BOARD_ACTIONS = new Set(['roll', 'buy', 'pass', 'rent', 'card', 'mystery', 'bank', 'festival', 'blackmarket', 'jailSpeak', 'jailStay', 'end', 'trade', 'ask', 'nudge']);

// Returns { state, error }. On error the original state is returned unchanged.
export function apply(state, action, ctx) {
  try {
    if (action.from === 'board' && !BOARD_ACTIONS.has(action.type)) throw new Error(`The board can't do "${action.type}".`);
    const s = structuredClone(state);
    const fn = ACTIONS[action.type];
    if (!fn) throw new Error(`Unknown action "${action.type}".`);
    const out = fn(s, action, ctx) || s;
    return { state: out, error: null };
  } catch (e) {
    return { state, error: e.message };
  }
}

function needPlay(s) { if (s.phase !== 'play') throw new Error('The game is not running.'); }
function needLand(s, type) {
  needPlay(s);
  const t = s.turn;
  if (s.pending) throw new Error('Waiting for the teacher to approve the last action.');
  if (t.step !== 'land' || t.handled) throw new Error('Nothing to do on this square.');
  const q = square(s, s.players[t.pid].pos);
  if (type && q.type !== type) throw new Error('Wrong square for this action.');
  return q;
}
function needPlayer(s, pid) {
  if (!s.players[pid]) throw new Error('Unknown player.');
  return s.players[pid];
}
const amountOf = v => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) throw new Error('Type a number.');
  return n;
};

const ACTIONS = {
  setup: (s, a, ctx) => createGame(s, a, ctx),

  // --- Player actions (board or teacher) ---
  roll(s, a, ctx) {
    let dice = a.dice;
    if (!dice && a.total != null) {
      // The teacher typed the total of real dice: split it into two faces for the picture.
      const total = amountOf(a.total);
      if (total < 2 || total > 12) throw new Error('Two dice make 2 to 12.');
      const lo = Math.max(1, total - 6);
      const first = lo + Math.floor(ctx.rand() * (Math.min(6, total - 1) - lo + 1));
      dice = [first, total - first];
    }
    if (!dice) dice = [1 + Math.floor(ctx.rand() * 6), 1 + Math.floor(ctx.rand() * 6)];
    if (dice.length !== 2 || dice.some(d => !(d >= 1 && d <= 6))) throw new Error('Dice must be 1 to 6.');
    roll(s, dice.map(Number), ctx);
  },

  buy(s, a, ctx) {
    needLand(s, 'property');
    const sq = s.players[s.turn.pid].pos;
    if (ownerOf(s, sq) != null) throw new Error('Already owned.');
    s.pending = { kind: 'buy', pid: s.turn.pid, sq, amount: priceOf(s, sq), tries: 0 };
  },

  pass(s, a, ctx) {
    needLand(s, 'property');
    const sq = s.players[s.turn.pid].pos;
    if (ownerOf(s, sq) != null) throw new Error('Already owned.');
    s.turn.handled = true;
    log(s, `${s.players[s.turn.pid].name} passes on ${square(s, sq).name}.`, 'auction', ctx);
    startAuction(s, sq, ctx);
  },

  rent(s, a, ctx) {
    needLand(s, 'property');
    const sq = s.players[s.turn.pid].pos;
    const owner = ownerOf(s, sq);
    if (owner == null || owner === s.turn.pid) throw new Error('No rent to pay here.');
    s.pending = { kind: 'rent', pid: s.turn.pid, sq, to: owner, amount: rentOf(s, sq), tries: 0 };
  },

  card(s, a, ctx) {
    needLand(s, 'chance');
    const p = s.players[s.turn.pid];
    const card = draw(s, 'chance', p.level, ctx);
    if (!card) throw new Error('There are no Chance cards in the content file.');
    s.pending = { kind: 'card', pid: s.turn.pid, card, amount: card.reward, tries: 0 };
    fx(s, { kind: 'card', deck: 'chance' });
    log(s, `${p.name} draws: "${card.text}"`, 'card', ctx);
  },

  mystery(s, a, ctx) {
    needLand(s, 'mystery');
    const p = s.players[s.turn.pid];
    const card = draw(s, 'mystery', p.level, ctx);
    if (!card) throw new Error('There are no Mystery challenges in the content file.');
    s.pending = { kind: 'mystery', pid: s.turn.pid, card, amount: card.reward, tries: 0 };
    fx(s, { kind: 'card', deck: 'mystery' });
    log(s, `${p.name} takes a Mystery challenge: "${card.text}"`, 'card', ctx);
  },

  bank(s, a, ctx) {
    const q = needLand(s, 'bank');
    s.pending = { kind: 'bank', pid: s.turn.pid, bank: q.bank, amount: q.amount, tries: 0 };
  },

  festival(s, a, ctx) {
    needLand(s, 'festival');
    s.pending = { kind: 'festival', pid: s.turn.pid, amount: s.settings.festivalTalk, tries: 0 };
  },

  blackmarket(s, a, ctx) {
    needLand(s, 'blackmarket');
    s.turn.handled = true;
    if (!s.black) startBlackMarket(s, null, ctx);
  },

  jailSpeak(s, a, ctx) {
    needPlay(s);
    if (s.turn.step !== 'jail' || s.pending) throw new Error('Not on a Coffee Break.');
    const p = s.players[s.turn.pid];
    const ch = draw(s, 'jailChallenges', p.level, ctx);
    s.pending = { kind: 'jail', pid: s.turn.pid, challenge: ch ? ch.text : 'Say three sentences about your day.', amount: 0, tries: 0 };
  },

  jailStay(s, a, ctx) {
    needPlay(s);
    if (s.turn.step !== 'jail') throw new Error('Not on a Coffee Break.');
    const p = s.players[s.turn.pid];
    p.inJail = false;     // back to work next turn
    log(s, `${p.name} misses a turn on Coffee Break.`, 'turn', ctx);
    nextTurn(s, ctx);
  },

  end(s, a, ctx) {
    needPlay(s);
    if (s.pending) throw new Error('Waiting for the teacher to approve the last action.');
    if (s.turn.step !== 'land') throw new Error('Roll the dice first.');
    if (mustAct(s)) throw new Error('Finish this square first.');
    if (s.auction) throw new Error('The auction is still running.');
    nextTurn(s, ctx);
  },

  // A trade proposal (from the board's trade panel). The teacher confirms it.
  trade(s, a, ctx) {
    needPlay(s);
    s.trade = cleanTrade(s, a.trade);
    const tr = s.trade;
    log(s, `Trade proposed: ${s.players[tr.from].name} ↔ ${s.players[tr.to].name}.`, 'trade', ctx);
  },

  // "Ask the bank" for a loan, mortgage or discount: goes to the teacher's request list.
  ask(s, a, ctx) {
    needPlay(s);
    const topic = ['loan', 'mortgage', 'discount'].includes(a.topic) ? a.topic : 'loan';
    const pid = a.pid ?? s.turn.pid;
    needPlayer(s, pid);
    s.requests.push({ id: ++s.reqSeq, pid, topic, t: ctx.now });
    log(s, `${s.players[pid].name} asks the bank: ${topic}.`, 'money', ctx);
  },

  // Move a token one square without any effect (to fix mistakes). Board: current player only.
  nudge(s, a, ctx) {
    needPlay(s);
    const pid = a.from === 'board' ? s.turn.pid : (a.pid ?? s.turn.pid);
    const p = needPlayer(s, pid);
    const d = a.d < 0 ? -1 : 1;
    p.pos = (p.pos + d + BOARD_SIZE) % BOARD_SIZE;
    fx(s, { kind: 'place', pid });
    if (pid === s.turn.pid && s.turn.step === 'land') land(s, ctx);
  },

  // --- Teacher: approvals ---
  approve(s, a, ctx) {
    const pe = s.pending;
    if (!pe) throw new Error('Nothing to approve.');
    const p = s.players[pe.pid];
    const amt = a.amount != null && a.amount !== '' ? amountOf(a.amount) : pe.amount;
    switch (pe.kind) {
      case 'buy':
        if (ownerOf(s, pe.sq) != null) throw new Error('Someone already owns it.');
        pay(s, pe.pid, -amt, null, ctx);
        s.props[pe.sq] = { owner: pe.pid, mortgaged: false };
        log(s, `${p.name} buys ${square(s, pe.sq).name} for ${money(amt)}.`, 'buy', ctx);
        fx(s, { kind: 'buy', pid: pe.pid, sq: pe.sq });
        break;
      case 'rent':
        pay(s, pe.pid, -amt, null, ctx);
        pay(s, pe.to, amt, null, ctx);
        log(s, `${p.name} pays ${money(amt)} rent to ${s.players[pe.to].name} (${square(s, pe.sq).name}).`, 'money', ctx);
        break;
      case 'card':
      case 'mystery': {
        const val = boost(s, amt);
        if (val) pay(s, pe.pid, val, pe.kind === 'card' ? 'Chance card' : 'Mystery challenge', ctx, 'card');
        if (val < 0 && pe.card.fund) addToFund(s, -val, ctx);
        if (!val) log(s, `${p.name} completes the ${pe.kind === 'card' ? 'card' : 'challenge'}.`, 'card', ctx);
        break;
      }
      case 'bank':
        if (pe.bank === 'tax') {
          pay(s, pe.pid, -amt, 'tax', ctx);
          if (s.settings.taxToFund) addToFund(s, amt, ctx);
        } else if (pe.bank === 'bonus') pay(s, pe.pid, boost(s, amt), 'City Hall bonus', ctx);
        else if (amt > 0) giveLoan(s, pe.pid, amt, Math.round(amt * (1 + s.settings.loanInterest / 100)), ctx);
        break;
      case 'jail':
        p.inJail = false;
        s.turn.step = 'roll';
        log(s, `${p.name} speaks their way out of Coffee Break!`, 'turn', ctx);
        break;
      case 'festival':
        pay(s, pe.pid, boost(s, amt), 'Town Festival talk', ctx);
        break;
    }
    if (a.bonus) {
      const b = boost(s, s.settings.sentenceBonus);
      pay(s, pe.pid, b, 'bonus for an excellent sentence', ctx);
    }
    fx(s, { kind: 'approved', pid: pe.pid, bonus: !!a.bonus });
    s.pending = null;
    if (pe.kind !== 'jail' && !pe.extra) s.turn.handled = true;
  },

  retry(s, a, ctx) {
    if (!s.pending) throw new Error('Nothing to retry.');
    s.pending.tries++;
    fx(s, { kind: 'retry', pid: s.pending.pid });
  },

  // The "no" button. What it means depends on the action (see teacher panel labels).
  deny(s, a, ctx) {
    const pe = s.pending;
    if (!pe) throw new Error('Nothing to deny.');
    const p = s.players[pe.pid];
    const done = () => { if (!pe.extra) s.turn.handled = true; };   // extra = a card the teacher gave outside the turn
    s.pending = null;
    switch (pe.kind) {
      case 'buy': break;                                     // back to Buy / Pass
      case 'rent': log(s, `Rent waived for ${p.name}.`, 'money', ctx); done(); break;
      case 'card':
        if (pe.card.fail) {
          pay(s, pe.pid, pe.card.fail, 'Chance card (not completed)', ctx, 'card');
          if (pe.card.fail < 0 && pe.card.fund) addToFund(s, -pe.card.fail, ctx);
        } else log(s, `${p.name} didn't complete the card.`, 'card', ctx);
        done();
        break;
      case 'mystery': log(s, `${p.name} didn't complete the challenge.`, 'card', ctx); done(); break;
      case 'bank': log(s, `No deal with the bank for ${p.name}.`, 'money', ctx); done(); break;
      case 'festival': done(); break;
      case 'jail':
        p.inJail = false;
        log(s, `${p.name} stays on Coffee Break this turn.`, 'turn', ctx);
        nextTurn(s, ctx);
        break;
    }
    fx(s, { kind: 'denied', pid: pe.pid });
  },

  // --- Teacher: turn control ---
  skip(s, a, ctx) {
    needPlay(s);
    log(s, `${currentPlayer(s).name}'s turn is skipped.`, 'turn', ctx);
    nextTurn(s, ctx);
  },
  setTurn(s, a, ctx) {
    needPlay(s);
    needPlayer(s, a.pid);
    startTurn(s, a.pid, ctx);
    log(s, `It's ${s.players[a.pid].name}'s turn.`, 'turn', ctx);
  },
  // Resolve the square where the current token stands now (after a manual move).
  reland(s, a, ctx) { needPlay(s); s.pending = null; land(s, ctx); },
  setPos(s, a, ctx) {
    const p = needPlayer(s, a.pid);
    p.pos = ((Math.round(a.pos) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
    fx(s, { kind: 'place', pid: a.pid });
  },
  jail(s, a, ctx) { needPlayer(s, a.pid); sendToJail(s, a.pid, ctx); if (a.pid === s.turn.pid) s.turn.handled = true; },

  // --- Teacher: bank ---
  money(s, a, ctx) {
    needPlayer(s, a.pid);
    pay(s, a.pid, amountOf(a.delta), a.why || 'bank', ctx);
  },
  transfer(s, a, ctx) {
    needPlayer(s, a.from); needPlayer(s, a.to);
    const n = amountOf(a.amount);
    if (a.from === a.to || n <= 0) throw new Error('Choose two players and a positive amount.');
    pay(s, a.from, -n, null, ctx); pay(s, a.to, n, null, ctx);
    log(s, `${s.players[a.from].name} gives ${money(n)} to ${s.players[a.to].name}.`, 'money', ctx);
  },
  loan(s, a, ctx) {
    needPlayer(s, a.pid);
    const n = amountOf(a.amount);
    if (n <= 0) throw new Error('The loan must be more than $0.');
    giveLoan(s, a.pid, n, a.repay ? amountOf(a.repay) : n, ctx);
  },
  repay(s, a, ctx) {
    const p = needPlayer(s, a.pid);
    const n = Math.min(amountOf(a.amount ?? p.debt), p.debt);
    if (n <= 0) throw new Error('No debt to repay.');
    p.money -= n; p.debt -= n;
    fx(s, { kind: 'money', pid: a.pid, delta: -n });
    log(s, `${p.name} pays back ${money(n)} to the bank (debt now ${money(p.debt)}).`, 'money', ctx);
  },
  mortgage(s, a, ctx) {
    const pr = s.props[a.sq];
    if (!pr) throw new Error('Nobody owns this property.');
    if (pr.mortgaged) throw new Error('Already mortgaged.');
    const v = a.amount != null ? amountOf(a.amount) : mortgageValue(square(s, a.sq));
    pr.mortgaged = true;
    pay(s, pr.owner, v, `mortgage on ${square(s, a.sq).name}`, ctx);
  },
  unmortgage(s, a, ctx) {
    const pr = s.props[a.sq];
    if (!pr || !pr.mortgaged) throw new Error('Not mortgaged.');
    const v = a.amount != null ? amountOf(a.amount) : Math.round(mortgageValue(square(s, a.sq)) * 1.1);
    pr.mortgaged = false;
    pay(s, pr.owner, -v, `buys back ${square(s, a.sq).name}`, ctx);
  },
  setOwner(s, a, ctx) {
    const q = square(s, a.sq);
    if (!q || q.type !== 'property') throw new Error('Not a property.');
    if (a.pid == null || a.pid === '') {
      delete s.props[a.sq];
      log(s, `${q.name} goes back to the bank.`, 'buy', ctx);
    } else {
      needPlayer(s, a.pid);
      s.props[a.sq] = { owner: a.pid, mortgaged: s.props[a.sq] ? s.props[a.sq].mortgaged : false };
      log(s, `${q.name} now belongs to ${s.players[a.pid].name}.`, 'buy', ctx);
      fx(s, { kind: 'buy', pid: a.pid, sq: a.sq });
    }
  },
  requestDone(s, a) { s.requests = s.requests.filter(r => r.id !== a.id); },

  // --- Teacher: auctions ---
  auction(s, a, ctx) {
    needPlay(s);
    const q = square(s, a.sq);
    if (!q || q.type !== 'property') throw new Error('Only properties can be auctioned.');
    startAuction(s, a.sq, ctx);
  },
  bid(s, a, ctx) {
    const au = s.auction;
    if (!au) throw new Error('No auction running.');
    needPlayer(s, a.pid);
    if (au.seller === a.pid) throw new Error('The seller can\'t bid.');
    const amount = a.add != null ? (au.high ? au.high.amount : 0) + amountOf(a.add) : amountOf(a.amount);
    if (amount <= (au.high ? au.high.amount : 0)) throw new Error('A bid must be higher than the current one.');
    au.high = { pid: a.pid, amount };
    au.bids++;
    if (au.endsAt - ctx.now < 8000) au.endsAt = ctx.now + 8000;   // a late bid gives everyone a few more seconds
    fx(s, { kind: 'bid', pid: a.pid, amount });
  },
  auctionTime(s, a, ctx) { if (s.auction) s.auction.endsAt = Math.max(s.auction.endsAt, ctx.now) + amountOf(a.secs) * 1000; },
  auctionClose: (s, a, ctx) => closeAuction(s, ctx),
  auctionCancel(s, a, ctx) {
    if (!s.auction) throw new Error('No auction running.');
    log(s, `Auction for ${square(s, s.auction.sq).name} cancelled.`, 'auction', ctx);
    s.auction = null;
  },

  // --- Teacher: trades ---
  tradeConfirm(s, a, ctx) {
    const tr = a.trade ? cleanTrade(s, a.trade) : s.trade;
    if (!tr) throw new Error('No trade to confirm.');
    const A = s.players[tr.from], B = s.players[tr.to];
    for (const sq of tr.give.props) if (ownerOf(s, sq) !== tr.from) throw new Error(`${A.name} doesn't own ${square(s, sq).name}.`);
    for (const sq of tr.get.props) if (ownerOf(s, sq) !== tr.to) throw new Error(`${B.name} doesn't own ${square(s, sq).name}.`);
    for (const sq of tr.give.props) s.props[sq].owner = tr.to;
    for (const sq of tr.get.props) s.props[sq].owner = tr.from;
    if (tr.give.money) { pay(s, tr.from, -tr.give.money, null, ctx); pay(s, tr.to, tr.give.money, null, ctx); }
    if (tr.get.money) { pay(s, tr.to, -tr.get.money, null, ctx); pay(s, tr.from, tr.get.money, null, ctx); }
    const side = x => [...x.props.map(sq => square(s, sq).name), x.money ? money(x.money) : null].filter(Boolean).join(' + ') || 'nothing';
    log(s, `Deal! ${A.name} gives ${side(tr.give)}; ${B.name} gives ${side(tr.get)}.`, 'trade', ctx);
    fx(s, { kind: 'announce', title: 'It\'s a deal!', text: `${A.name} ⇄ ${B.name}`, style: 'deal' });
    s.trade = null;
  },
  tradeCancel(s, a, ctx) { if (s.trade) log(s, 'Trade cancelled.', 'trade', ctx); s.trade = null; },

  // --- Teacher: events and surprises ---
  market(s, a, ctx) {
    needPlay(s);
    const mult = Number(a.mult) === 2 ? 2 : 0.5;
    const g = a.group ? s.groups.find(x => x.id === a.group) : null;
    s.market = { mult, group: g ? g.id : null, rounds: Math.max(1, amountOf(a.rounds || 2)) };
    const where = g ? `in ${g.name}` : 'everywhere';
    const title = mult === 2 ? 'Market boom!' : 'Market crash!';
    const text = `Prices and rents ${mult === 2 ? 'double' : 'are halved'} ${where} for ${s.market.rounds} round${s.market.rounds > 1 ? 's' : ''}. What will you do?`;
    log(s, `${title} ${text}`, 'event', ctx);
    fx(s, { kind: 'announce', title, text, style: mult === 2 ? 'boom' : 'crash' });
  },
  marketEnd(s, a, ctx) { s.market = null; log(s, 'The market is back to normal.', 'event', ctx); },

  blackMarket(s, a, ctx) {
    needPlay(s);
    if (s.black) throw new Error('The Black Market is already open.');
    startBlackMarket(s, a.item ?? null, ctx);
  },
  blackSell(s, a, ctx) {
    if (!s.black) throw new Error('The Black Market is closed.');
    const p = needPlayer(s, a.pid);
    const price = a.price != null ? amountOf(a.price) : s.black.item.price;
    pay(s, a.pid, -price, null, ctx);
    p.specials.push({ name: s.black.item.name, emoji: s.black.item.emoji, value: s.black.item.value });
    log(s, `🕶️ ${p.name} wins the Black Market pitch: ${s.black.item.name} for ${money(price)}.`, 'buy', ctx);
    fx(s, { kind: 'announce', title: 'Sold on the Black Market!', text: `${p.name} gets ${s.black.item.emoji} ${s.black.item.name}`, style: 'black' });
    s.black = null;
  },
  blackClose(s, a, ctx) { if (s.black) log(s, 'The Black Market closes. No sale.', 'event', ctx); s.black = null; },

  ruleNext: (s, a, ctx) => nextRule(s, ctx),
  ruleClear(s) { s.rule = null; },
  ruleFine(s, a, ctx) {
    needPlayer(s, a.pid);
    pay(s, a.pid, -s.settings.ruleFine, 'broke the rule of the round', ctx);
    fx(s, { kind: 'fine', pid: a.pid, text: 'Rule broken!' });
    if (on(s, 'townFund')) addToFund(s, s.settings.ruleFine, ctx);
  },
  fund(s, a, ctx) {
    const n = amountOf(a.amount);
    if (n <= 0) throw new Error('Type a positive amount.');
    if (a.pid != null && a.pid !== '') { needPlayer(s, a.pid); pay(s, a.pid, -n, 'gives to the town fund', ctx); }
    else log(s, `The bank adds ${money(n)} to the town fund.`, 'event', ctx);
    addToFund(s, n, ctx);
  },
  star(s, a, ctx) {
    const p = needPlayer(s, a.pid);
    p.stars++;
    const b = boost(s, s.settings.starBonus);
    pay(s, a.pid, b, null, ctx);
    log(s, `⭐ Gold star for ${p.name}! (+${money(b)})`, 'star', ctx);
    fx(s, { kind: 'star', pid: a.pid });
  },
  english(s, a, ctx) {
    needPlayer(s, a.pid);
    if (a.good) {
      pay(s, a.pid, boost(s, s.settings.englishBonus), 'a full English turn', ctx);
      fx(s, { kind: 'cheer', pid: a.pid, text: 'All in English!' });
    } else {
      pay(s, a.pid, -s.settings.englishFine, 'used Japanese', ctx);
      fx(s, { kind: 'fine', pid: a.pid, text: 'English please!' });
    }
  },
  // Trigger a card or challenge for any player (from the Events tab).
  drawFor(s, a, ctx) {
    needPlay(s);
    if (s.pending) throw new Error('Finish the pending action first.');
    const p = needPlayer(s, a.pid);
    const deck = a.deck === 'mystery' ? 'mystery' : 'chance';
    const card = draw(s, deck, p.level, ctx);
    if (!card) throw new Error('That deck is empty.');
    s.pending = { kind: deck === 'chance' ? 'card' : 'mystery', pid: a.pid, card, amount: card.reward, tries: 0, extra: true };
    fx(s, { kind: 'card', deck });
    log(s, `${p.name} gets a ${deck === 'chance' ? 'Chance card' : 'Mystery challenge'}: "${card.text}"`, 'card', ctx);
  },
  announce(s, a, ctx) {
    fx(s, { kind: 'announce', title: String(a.title || 'Announcement'), text: String(a.text || ''), style: 'teacher' });
    log(s, `Announcement: ${a.title || ''} ${a.text || ''}`.trim(), 'event', ctx);
  },

  // --- Teacher: hints ---
  hint(s, a, ctx) {
    s.hint = { id: ++s.hintSeq, title: String(a.title || 'Hint'), lines: (a.lines || [a.text]).filter(Boolean).map(String), until: ctx.now + s.settings.hintSecs * 1000, pid: a.pid ?? null };
  },
  hintClose(s) { s.hint = null; },

  // --- Teacher: players and settings ---
  setLevel(s, a, ctx) {
    const p = needPlayer(s, a.pid);
    if (!LEVELS.includes(a.level)) throw new Error('Unknown level.');
    p.level = a.level;
    log(s, `${p.name} is now ${LEVEL_NAMES[a.level]}.`, 'info', ctx);
  },
  notes(s, a) { needPlayer(s, a.pid).notes = String(a.text || ''); },
  settings(s, a, ctx) { s.settings = deepMerge(s.settings, a.patch); },

  // --- Teacher: timer ---
  timerSet(s, a, ctx) {
    const min = amountOf(a.minutes);
    s.settings.gameMinutes = min;
    s.timer = min > 0 ? { dur: min * 60000, startAt: ctx.now, pausedAt: null, paused: 0 } : null;
    s.lastTen = false;
  },
  timerAdd(s, a, ctx) {
    if (!s.timer) throw new Error('No game timer.');
    s.timer.dur = Math.max(0, s.timer.dur + amountOf(a.minutes) * 60000);
    if (timeLeft(s, ctx.now) > 600000) s.lastTen = false;
  },
  timerPause(s, a, ctx) { if (s.timer && !s.timer.pausedAt) s.timer.pausedAt = ctx.now; },
  timerResume(s, a, ctx) {
    const t = s.timer;
    if (t && t.pausedAt) { t.paused += ctx.now - t.pausedAt; t.pausedAt = null; }
  },

  // --- End of game ---
  endGame(s, a, ctx) {
    needPlay(s);
    s.phase = 'ending';
    s.pending = null; s.auction = null; s.black = null;
    if (s.timer && !s.timer.pausedAt) s.timer.pausedAt = ctx.now;
    log(s, 'The game is over! Counting up…', 'event', ctx);
    fx(s, { kind: 'announce', title: 'Time\'s up!', text: 'Let\'s count the money…', style: 'end' });
  },
  resume(s, a, ctx) {
    if (s.phase === 'play') return;
    s.phase = 'play';
    s.results = null;
    if (s.timer && s.timer.pausedAt) { s.timer.paused += ctx.now - s.timer.pausedAt; s.timer.pausedAt = null; }
  },
  // Mission ticks and correct guesses come from the teacher's end-of-game form.
  results(s, a, ctx) {
    if (s.phase === 'play') ACTIONS.endGame(s, a, ctx);
    const done = a.missions || {}, guess = a.guesses || {};
    s.players.forEach((p, i) => {
      p.missionDone = !!(p.mission && done[i]);
      p.guessed = !!guess[i];
    });
    s.results = computeResults(s);
    s.phase = 'over';
    log(s, `Winner: ${s.players[s.results.ranking[0].pid].name}!`, 'event', ctx);
    fx(s, { kind: 'confetti' });
  }
};

// ---------- Helpers used by several actions ----------

function giveLoan(s, pid, amount, repay, ctx) {
  const p = s.players[pid];
  p.money += amount;
  p.debt += repay;
  fx(s, { kind: 'money', pid, delta: amount });
  log(s, `${p.name} borrows ${money(amount)} from the bank (pays back ${money(repay)}).`, 'money', ctx);
}

function startAuction(s, sq, ctx) {
  if (s.auction) throw new Error('An auction is already running.');
  const seller = ownerOf(s, sq);
  // Auctioning the bank's property the current player is standing on means they didn't buy it:
  // their square is dealt with, so they don't owe rent when it's sold (whichever button started the auction).
  const t = s.turn;
  if (seller == null && t && t.step === 'land' && s.players[t.pid].pos === sq) t.handled = true;
  s.auction = { sq, seller, high: null, bids: 0, startAt: ctx.now, endsAt: ctx.now + s.settings.auctionSecs * 1000, fromTurn: s.turn ? s.turn.pid : null };
  const q = square(s, sq);
  log(s, `Auction: ${q.name}${seller != null ? ` (sold by ${s.players[seller].name})` : ''}.`, 'auction', ctx);
  fx(s, { kind: 'announce', title: 'Auction!', text: `${q.emoji || ''} ${q.name} — shout your bids!`, style: 'auction' });
}

function closeAuction(s, ctx) {
  const au = s.auction;
  if (!au) throw new Error('No auction running.');
  const q = square(s, au.sq);
  s.auction = null;
  if (!au.high) { log(s, `Nobody bought ${q.name}.`, 'auction', ctx); fx(s, { kind: 'sold', sq: au.sq, pid: null }); return; }
  const { pid, amount } = au.high;
  pay(s, pid, -amount, null, ctx);
  if (au.seller != null) pay(s, au.seller, amount, null, ctx);
  s.props[au.sq] = { owner: pid, mortgaged: s.props[au.sq] ? s.props[au.sq].mortgaged : false };
  s.players[pid].auctionsWon = (s.players[pid].auctionsWon || 0) + 1;
  log(s, `Sold! ${s.players[pid].name} wins ${q.name} for ${money(amount)}.`, 'auction', ctx);
  fx(s, { kind: 'sold', sq: au.sq, pid, amount });
}

function startBlackMarket(s, itemIdx, ctx) {
  const items = ctx.content.blackMarket || [];
  if (!items.length) throw new Error('There are no Black Market items in the content file.');
  const item = items[itemIdx != null && items[itemIdx] ? itemIdx : Math.floor(ctx.rand() * items.length)];
  s.black = { item: { ...item }, endsAt: ctx.now + s.settings.blackMarketSecs * 1000 };
  log(s, `🕶️ Black Market: ${item.name} (worth ${money(item.value)}) — best pitch wins!`, 'event', ctx);
  fx(s, { kind: 'announce', title: 'Black Market!', text: `${item.emoji} ${item.name} — worth ${money(item.value)}. Best pitch wins!`, style: 'black' });
}

function cleanTrade(s, t) {
  if (!t) throw new Error('Empty trade.');
  const from = Number(t.from), to = Number(t.to);
  needPlayer(s, from); needPlayer(s, to);
  if (from === to) throw new Error('Choose two different players.');
  const side = x => ({
    money: Math.max(0, Math.round(Number(x && x.money) || 0)),
    props: [...new Set(((x && x.props) || []).map(Number))].filter(sq => s.squares[sq] && s.squares[sq].type === 'property')
  });
  const tr = { from, to, give: side(t.give), get: side(t.get) };
  if (!tr.give.money && !tr.get.money && !tr.give.props.length && !tr.get.props.length) throw new Error('The trade is empty.');
  return tr;
}

export function computeResults(s) {
  const st = s.settings;
  const rows = s.players.map((p, pid) => {
    const w = worth(s, pid);
    const missionBonus = p.missionDone ? st.missionBonus : 0;
    const guessBonus = p.guessed ? st.guessBonus : 0;
    return { pid, ...w, missionBonus, guessBonus, stars: p.stars, total: w.total + missionBonus + guessBonus };
  });
  rows.sort((a, b) => b.total - a.total);
  const maxStars = Math.max(...s.players.map(p => p.stars));
  return {
    ranking: rows,
    topStars: maxStars > 0 ? s.players.map((p, i) => (p.stars === maxStars ? i : -1)).filter(i => i >= 0) : []
  };
}

// Called by the teacher window a few times a second. Returns a new state when
// something time-based happened (auction or timer ran out…), otherwise null.
export function tick(s, ctx) {
  if (s.phase !== 'play') return null;
  const now = ctx.now;
  let out = null;
  const edit = () => (out = out || structuredClone(s));
  if (s.auction && now >= s.auction.endsAt) { edit(); closeAuction(out, ctx); }
  if (s.hint && now >= s.hint.until) { edit(); out.hint = null; }
  if (s.black && !s.black.closed && now >= s.black.endsAt) {
    edit(); out.black.closed = true;
    fx(out, { kind: 'announce', title: 'Pitching time is over!', text: 'The bank chooses the best pitch.', style: 'black' });
  }
  const left = timeLeft(s, now);
  if (left != null) {
    if (left <= 600000 && left > 0 && !s.lastTen && s.settings.lastTen && s.timer.dur > 600000) {
      edit(); out.lastTen = true;
      log(out, 'Last 10 minutes! Rewards are doubled.', 'event', ctx);
      fx(out, { kind: 'announce', title: 'Last 10 minutes!', text: 'All rewards are doubled. Speak up!', style: 'lastten' });
    }
    if (left === 0) { edit(); ACTIONS.endGame(out, {}, ctx); }
  }
  return out;
}

// Markdown report of the session for feedback after class.
export function sessionReport(s) {
  const d = new Date();
  const lines = [`# Speak Plus City — ${d.toLocaleDateString('en-GB')}`, ''];
  lines.push('## Players', '');
  s.players.forEach((p, i) => {
    const w = worth(s, i);
    lines.push(`### ${p.name} (${LEVEL_NAMES[p.level]})`, '',
      `- Money ${money(p.money)} · properties ${money(w.props)} · debt ${money(p.debt)} · worth ${money(w.total)}`,
      `- Gold stars: ${p.stars}`);
    if (p.mission) lines.push(`- Secret mission: ${p.mission}${s.phase === 'over' ? (p.missionDone ? ' ✔' : ' ✘') : ''}`);
    lines.push('', '**Teacher notes**', '', p.notes.trim() ? p.notes.trim() : '_(none)_', '');
  });
  if (s.results) {
    lines.push('## Final ranking', '');
    s.results.ranking.forEach((r, i) => lines.push(`${i + 1}. ${s.players[r.pid].name} — ${money(r.total)}`));
    lines.push('');
  }
  lines.push('## Log', '');
  for (const e of s.log) {
    const t = new Date(e.t);
    lines.push(`- ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} ${e.text}`);
  }
  return lines.join('\n') + '\n';
}
