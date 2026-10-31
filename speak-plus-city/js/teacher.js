// Teacher window: the bank. It holds the one true game state, applies every
// action (its own and the ones the board sends), saves after each change and
// sends the new state to the board. In phone mode it also sends each phone its
// own private view (js/views.js) through the game server (js/phones.js).

import {
  apply, tick, emptyState, options, currentPlayer, ownerOf, isMortgaged, priceOf, rentOf, playerProps, worth,
  timeLeft, money, fill, sessionReport, mortgageValue, TOKENS, LEVELS, LEVEL_NAMES, MAX_PLAYERS, DEFAULT_SETTINGS
} from './state.js';
import { openChannel, saveState, loadState, saveSettings, loadSettings } from './sync.js';
import { loadContent } from './content.js';
import { buildBoard, updateBoard } from './render-board.js';
import { phoneView, lobbyView } from './views.js';
import { serverInfo, createPhones } from './phones.js';
import { $, $$, esc, patch, tokenHTML, levelBadge, fmtClock, sayVars, download, readFile, helpOverlay, isTyping } from './ui.js';

let C = null;              // content (cards, missions, prompts…)
let S = null;              // game state
const undo = [];           // previous states, newest last
let boardSeenAt = 0;
let showSetup = false;     // "New game" pressed while a game is running
let tab = 'bank';
const revealed = new Set();  // missions the teacher has chosen to show on this screen
let tradeDraft = { from: 0, to: 1, give: { money: 0, props: [] }, get: { money: 0, props: [] } };
let setupPlayers = loadSetupPlayers();
let setupSettings = { ...DEFAULT_SETTINGS, ...(loadSettings() || {}) };
setupSettings.hints = { ...DEFAULT_SETTINGS.hints, ...(setupSettings.hints || {}) };
setupSettings.surprises = { ...DEFAULT_SETTINGS.surprises, ...(setupSettings.surprises || {}) };

let server = null;          // game server info when this page is served by it (phone mode possible)
const sentViews = new Map(); // phone token → last view sent (JSON), to send only changes

const ctx = () => ({ content: C, now: Date.now(), rand: Math.random });
const inSetup = () => S.phase === 'setup' || showSetup;
const phonesOn = () => !!server && (inSetup() ? setupSettings.phones : S.settings.phones);
const phones = createPhones({
  onHosted() { sentViews.clear(); broadcast(); render(); sendViews(); },
  onStatus() { renderConn(); },
  onPhone(m) { phoneEvent(m); },
  onAct(token, action) { phoneAction(token, action); },
  onReplaced() { toast('The phone game was opened in another teacher window.', 'bad'); }
});
const channel = openChannel(onMessage);
const boardConnected = () => Date.now() - boardSeenAt < 8000;

const help = helpOverlay('Teacher shortcuts', [
  ['2 … 12 Enter', 'Move by the total of real dice (or type two dice: 3 4)'],
  ['Space', 'Roll random dice'],
  ['A', 'Approve'],
  ['B', 'Approve + bonus for an excellent sentence'],
  ['R', 'Try again'],
  ['D', 'Deny / skip (cancel, waive rent, not done…)'],
  ['N', 'End turn (Shift+N skips the turn)'],
  ['← →', 'Move the current token one square'],
  ['S', 'Gold star for the current player'],
  ['Ctrl Z', 'Undo'],
  ['?', 'This help']
]);

// ---------- Sync ----------

function onMessage(msg) {
  if (msg.t === 'hello' || msg.t === 'ping') {
    const fresh = !boardConnected();
    boardSeenAt = Date.now();
    if (msg.t === 'hello' || fresh) broadcast();
    renderConn();
  } else if (msg.t === 'act' && msg.action) {
    boardSeenAt = Date.now();
    const action = { ...msg.action, from: 'board' };
    const r = apply(S, action, ctx());
    if (r.error) channel.send({ t: 'error', text: r.error });
    else commit(r.state);
  }
}

// The board doesn't need the log, the shuffled decks, the phone tokens or the teacher's notes.
function slim(s) {
  return { ...s, log: [], decks: {}, ruleQueue: [], seats: {}, players: s.players.map(p => ({ ...p, notes: '' })) };
}
// `net`: the room code and QR code the board shows in phone mode.
const netInfo = () => (phonesOn() && phones.info ? { ...phones.info, joined: [...phones.phones.values()].filter(p => p.on).map(p => p.name) } : null);
function broadcast() { channel.send({ t: 'state', state: slim(S), net: netInfo(), setup: inSetup() }); }

// ---------- Phones ----------

// Every connected phone gets its own view: its player's private game, or the lobby.
function sendViews() {
  if (!phonesOn() || !phones.connected) return;
  for (const [token, ph] of phones.phones) {
    if (!ph.on) continue;
    const pid = S.seats[token];
    let view;
    if (inSetup()) {
      const i = setupPlayers.findIndex(x => x.phone === token);
      view = { ...lobbyView({ phase: 'setup' }, ph.name), you: i >= 0 ? { name: setupPlayers[i].name || ph.name, icon: TOKENS[setupPlayers[i].token % TOKENS.length].icon, color: TOKENS[setupPlayers[i].token % TOKENS.length].color } : null };
    } else if (pid != null && S.players[pid]) view = phoneView(S, pid);
    else view = lobbyView(S, ph.name);
    const json = JSON.stringify(view);
    if (sentViews.get(token) !== json) { sentViews.set(token, json); phones.send(token, { t: 'view', view }); }
  }
}

function phoneEvent({ token, name, on }) {
  sentViews.delete(token);
  if (on && inSetup() && setupSettings.phones && !setupPlayers.some(x => x.phone === token)) {
    // A phone joined during the setup: it becomes a player (the first empty row, or a new one).
    const empty = setupPlayers.find(x => !x.phone && !x.name.trim());
    if (empty) { empty.name = name; empty.phone = token; }
    else if (setupPlayers.length < MAX_PLAYERS) {
      const used = new Set(setupPlayers.map(x => x.token));
      setupPlayers.push({ name, token: TOKENS.findIndex((_, k) => !used.has(k)), level: 'beginner', phone: token });
    } else toast(`📱 ${name} joined, but there are already ${MAX_PLAYERS} players.`, 'bad');
    toast(`📱 ${name} joined.`);
  }
  render();
  broadcast();
  sendViews();
}

function phoneAction(token, raw) {
  if (!phonesOn() || !raw || typeof raw.type !== 'string') return;
  const action = { ...raw, from: 'phone', token };
  delete action.dice; delete action.total;        // phones roll random dice like the board
  if (inSetup()) return phones.send(token, { t: 'error', text: 'The game hasn\'t started yet.' });
  const r = apply(S, action, ctx());
  if (r.error) phones.send(token, { t: 'error', text: r.error });
  else commit(r.state);
}

function syncPhones() { if (phonesOn()) phones.start(); }

function act(action) {
  const r = apply(S, action, ctx());
  if (r.error) { toast(r.error, 'bad'); return false; }
  commit(r.state, action.type !== 'notes');
  return true;
}

function commit(next, undoable = true) {
  if (undoable) { undo.push(S); if (undo.length > 60) undo.shift(); }
  S = next;
  if (!saveState(S)) toast('Could not auto-save (browser storage is full). Use Save game.', 'bad');
  broadcast();
  render();
  sendViews();
}

function undoLast() {
  const prev = undo.pop();
  if (!prev) { toast('Nothing to undo.'); return; }
  const s = structuredClone(prev);
  s.fxSeq = S.fxSeq;      // effect ids keep growing so the board stays in step
  s.fx = [];
  s.players.forEach((p, i) => { if (S.players[i]) p.notes = S.players[i].notes; });   // keep notes typed since
  S = s;
  saveState(S);
  broadcast();
  render();
  sendViews();
  toast('Undone.');
}

// ---------- Render ----------

function render() {
  const setup = S.phase === 'setup' || showSetup;
  $('#view-setup').hidden = !setup;
  $('#view-play').hidden = setup;
  if (setup) renderSetup();
  else {
    renderTurn();
    renderPlayers();
    renderTab();
    renderMini();
  }
  renderConn();
  tickDisplay();
  syncPhones();
  $('#btn-new-game').hidden = setup;
}

function renderConn() {
  const el = $('#conn-board');
  const ok = boardConnected();
  el.className = 'conn-pill ' + (ok ? 'ok' : 'off');
  el.textContent = ok ? 'Board connected' : 'Board not open';
  const ph = $('#conn-phones');
  ph.hidden = !phonesOn();
  if (phonesOn()) {
    const n = [...phones.phones.values()].filter(x => x.on).length;
    ph.className = 'conn-pill ' + (phones.connected ? 'ok' : 'off');
    ph.textContent = phones.connected ? `📱 ${phones.info.code} · ${n} phone${n === 1 ? '' : 's'}` : '📱 Connecting…';
  }
}

// The join box: QR code, room code and address (setup screen and Phones tab).
function joinBoxHTML() {
  if (!server) return `<p class="hint">To play with phones, start the game with <b>npm start</b> (or the start script) or use the online version. Now the page is served without the game server.</p>`;
  if (!phones.connected || !phones.info) return '<p class="hint">Connecting to the game server…</p>';
  const i = phones.info;
  return `<div class="join-box"><img src="${i.qr}" alt="QR code to join" width="150" height="150">
    <div><div class="label">Room code</div><div class="room-code">${esc(i.code)}</div><div class="small muted">${esc(i.joinUrl)}</div>
    <p class="hint">The board shows this QR code too. Students scan it, type their name, and appear here.</p></div></div>`;
}

function phoneListHTML() {
  const list = [...phones.phones];
  if (!list.length) return '<p class="hint">No phones yet.</p>';
  return `<table class="ptable"><thead><tr><th>Phone</th><th>Plays</th><th></th></tr></thead><tbody>${list.map(([token, ph]) => {
    const pid = S.seats[token];
    return `<tr><td>${ph.on ? '🟢' : '⚪'} ${esc(ph.name)}</td>
      <td><select data-seat="${esc(token)}" aria-label="Player for ${esc(ph.name)}"><option value="">Not playing</option>${S.players.map((p, k) => `<option value="${k}" ${k === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></td>
      <td><button class="btn btn-ghost btn-small" data-cmd="kick" data-token="${esc(token)}" type="button">Remove</button></td></tr>`;
  }).join('')}</tbody></table>`;
}

// --- Setup ---

function loadSetupPlayers() {
  try {
    const p = JSON.parse(localStorage.getItem('sp-city-players-v1') || 'null');
    if (Array.isArray(p) && p.length >= 2) return p;
  } catch { /* ignore */ }
  return [{ name: '', token: 0, level: 'beginner' }, { name: '', token: 1, level: 'beginner' }];
}

function settingsFormHTML(st, { inGame }) {
  const num = (path, label, opts = '') => `<label class="f-num"><span>${label}</span><input type="number" data-setting="${path}" value="${esc(getPath(st, path))}" ${opts}></label>`;
  const chk = (path, label) => `<label class="switch"><input type="checkbox" data-setting="${path}" ${getPath(st, path) ? 'checked' : ''}> ${label}</label>`;
  const sel = (path, label, list) => `<label class="f-num"><span>${label}</span><select data-setting="${path}">${list.map(([v, l]) => `<option value="${v}" ${getPath(st, path) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const hintOpts = [['all', 'Frames + vocabulary'], ['vocab', 'Vocabulary (frames on request)'], ['none', 'No hints']];
  return `<div class="settings">
    <fieldset><legend>Money</legend>
      ${inGame ? '' : num('startMoney', 'Starting money', 'min="0" step="50"')}
      ${num('salary', 'Salary for passing Start', 'min="0" step="10"')}
      ${num('sentenceBonus', 'Bonus for an excellent sentence', 'min="0" step="5"')}
      ${num('festivalTalk', 'Town Festival corner reward', 'min="0" step="10"')}
      ${num('loanInterest', 'City Bank loan interest (%)', 'min="0" max="100"')}
    </fieldset>
    <fieldset><legend>Time</legend>
      ${inGame ? '' : sel('gameMinutes', 'Game length', [[0, 'No timer'], [45, '45 min'], [60, '60 min'], [90, '90 min'], [120, '120 min']].map(([v, l]) => [v, l]))}
      ${num('turnSecs', 'Turn timer (seconds, 0 = off)', 'min="0" step="15"')}
      ${num('auctionSecs', 'Auction length (seconds)', 'min="5" step="5"')}
      ${num('blackMarketSecs', 'Black Market pitch time (seconds)', 'min="10" step="10"')}
      ${num('hintSecs', 'Hints close after (seconds)', 'min="3"')}
    </fieldset>
    <fieldset><legend>English-only rule</legend>
      ${sel('english', 'Mode', [['off', 'Off'], ['rewards', 'Rewards only'], ['fines', 'Fines']])}
      ${num('englishBonus', 'Bonus for a full English turn', 'min="0" step="5"')}
      ${num('englishFine', 'Fine for Japanese', 'min="0" step="5"')}
    </fieldset>
    <fieldset><legend>Hints on the board, per level</legend>
      ${LEVELS.map(l => sel('hints.' + l, LEVEL_NAMES[l], hintOpts)).join('')}
    </fieldset>
    <fieldset><legend>Surprises</legend>
      ${chk('surprises.mystery', 'Mystery squares')}
      ${chk('surprises.market', 'Market crash / boom')}
      ${chk('surprises.missions', 'Secret missions' + (inGame ? ' (given at the start)' : ''))}
      ${chk('surprises.blackMarket', 'Black Market')}
      ${chk('surprises.rules', 'Rule of the round')}
      ${chk('surprises.townFund', 'Town fund')}
      ${chk('surprises.stars', 'Gold stars')}
      ${chk('lastTen', 'Last 10 minutes: rewards ×2')}
      ${chk('taxToFund', 'Taxes go to the town fund')}
    </fieldset>
    <fieldset><legend>Rent and phones</legend>
      ${sel('rentRule', 'Rent', [['ask', 'The owner must ask (before the next roll)'], ['pay', 'The visitor pays when landing']])}
      <label class="switch"><input type="checkbox" data-setting="phones" ${st.phones ? 'checked' : ''} ${server ? '' : 'disabled'}> Play with phones (QR code)</label>
      ${chk('showOwners', 'With phones: show who owns each property on the board')}
      ${server ? '' : '<p class="hint">Phones need the game server: start with npm start or the start script, or use the online version.</p>'}
    </fieldset>
    <fieldset><legend>Surprise amounts</legend>
      ${num('starBonus', 'Gold star bonus', 'min="0" step="5"')}
      ${num('ruleFine', 'Rule of the round fine', 'min="0" step="5"')}
      ${num('fundTarget', 'Town fund target', 'min="50" step="50"')}
      ${num('festivalBonus', 'Festival bonus for everyone', 'min="0" step="10"')}
      ${num('missionBonus', 'Secret mission bonus', 'min="0" step="10"')}
      ${num('guessBonus', 'Bonus for guessing a mission', 'min="0" step="10"')}
    </fieldset></div>`;
}

function getPath(o, path) { return path.split('.').reduce((x, k) => (x == null ? x : x[k]), o); }
function patchFromPath(path, value) {
  const keys = path.split('.');
  const out = {};
  let cur = out;
  keys.forEach((k, i) => { if (i === keys.length - 1) cur[k] = value; else cur = cur[k] = {}; });
  return out;
}

function renderSetup() {
  const rows = setupPlayers.map((p, i) => `<div class="setup-player" data-i="${i}">
      <span class="token" style="--tc:${TOKENS[p.token % TOKENS.length].color}">${TOKENS[p.token % TOKENS.length].icon}</span>
      ${p.phone ? `<span class="phone-mark" title="Plays on a phone">${phones.phones.get(p.phone)?.on ? '📱' : '📵'}</span>` : ''}
      <input type="text" data-sp="name" value="${esc(p.name)}" placeholder="Player ${i + 1} name" maxlength="24" aria-label="Name of player ${i + 1}">
      <select data-sp="token" aria-label="Token">${TOKENS.map((t, k) => `<option value="${k}" ${k === p.token ? 'selected' : ''}>${t.icon}</option>`).join('')}</select>
      <select data-sp="level" aria-label="Level">${LEVELS.map(l => `<option value="${l}" ${l === p.level ? 'selected' : ''}>${LEVEL_NAMES[l]}</option>`).join('')}</select>
      <button class="icon-btn" data-setup="remove" type="button" aria-label="Remove player" ${setupPlayers.length <= 2 ? 'disabled' : ''}>✕</button></div>`).join('');
  patch($('#setup-players'), rows + (setupPlayers.length < MAX_PLAYERS ? `<button class="btn btn-ghost" data-setup="add" type="button">+ Add player</button>` : ''));
  patch($('#setup-settings'), settingsFormHTML(setupSettings, { inGame: false }));
  const join = $('#setup-join');
  join.hidden = !setupSettings.phones;
  if (setupSettings.phones) patch(join, `<div class="legend">📱 Phones</div>${joinBoxHTML()}`);
  $('#setup-cancel').hidden = S.phase === 'setup';
  $('#content-note').textContent = C && C.__custom ? 'Using the content saved in the content editor.' : 'Using the default content (data/content.json).';
}

// --- Turn column ---

function renderTurn() {
  if (S.phase === 'ending' || S.phase === 'over') { renderEnding(); return; }
  $('#end-box').hidden = true;
  $('#turn-play').hidden = false;
  const t = S.turn;
  const p = currentPlayer(S);
  const q = S.squares[p.pos];
  const step = t.step === 'roll' ? 'Waiting to roll' : t.step === 'jail' ? 'On Coffee Break' : `On ${q.emoji || ''} ${q.name}${t.dice ? ` (rolled ${t.dice[0]} + ${t.dice[1]})` : ''}`;
  patch($('#turn-head'), `<div class="th-row">${tokenHTML(p, 'token-lg')}<div><div class="th-name">${esc(p.name)}'s turn</div>
    <div class="th-step">${esc(step)}</div></div><div class="th-right">${levelBadge(p.level)}<div class="muted">Round ${S.round}</div></div></div>
    ${t.step === 'land' ? squareInfoHTML(p.pos) : ''}`);

  const diceOk = t.step === 'roll' && !S.pending;
  $('#dice-input').disabled = !diceOk;
  $('#dice-go').disabled = !diceOk;
  $('#dice-random').disabled = !diceOk;
  $('#dice-box').classList.toggle('ready', diceOk);

  patch($('#pending-box'), pendingHTML());
  const opts = options(S).filter(o => !['roll', 'trade', 'ask'].includes(o.id));
  patch($('#player-opts'), opts.length ? `<div class="label">Player buttons (press for them)</div><div class="btn-row">${opts.map(o => `<button class="btn ${o.primary ? 'btn-primary' : 'btn-ghost'} btn-small" data-act="${o.id}" type="button" ${o.disabled ? `disabled title="${esc(o.why || '')}"` : ''}>${esc(o.label)}</button>`).join('')}</div>` : '');
  patch($('#auction-box'), auctionHTML());
  patch($('#trade-box'), tradeBoxHTML());
  patch($('#black-box'), blackBoxHTML());
  const rd = S.rentDue;
  patch($('#rent-box'), rd && !S.pending ? `<div class="box box-rent"><div class="label">Rent can be asked for until the next roll</div>
    <p><b>${esc(S.players[rd.from].name)}</b> is on <b>${esc(S.squares[rd.sq].name)}</b>, owned by <b>${esc(S.players[rd.to].name)}</b> (rent ${money(rentOf(S, rd.sq))}).
    ${S.settings.phones ? 'The owner can ask on their phone, or out loud.' : 'If the owner asks, press the button.'} If nobody asks, no rent.</p>
    <div class="btn-row"><button class="btn btn-primary btn-small" data-act="claimRent" type="button">${esc(S.players[rd.to].name)} asked → collect the rent</button></div></div>` : '');
  patch($('#requests-box'), S.requests.length ? `<div class="box"><div class="label">Requests to the bank</div>${S.requests.map(r => `<div class="req">${tokenHTML(S.players[r.pid])} <b>${esc(S.players[r.pid].name)}</b> asks for a <b>${esc(r.topic)}</b>
      <span class="spacer"></span><button class="btn btn-ghost btn-small" data-tab="bank" data-prefill="${r.pid}" type="button">Bank tab</button><button class="btn btn-ghost btn-small" data-act="requestDone" data-id="${r.id}" type="button">Done</button></div>`).join('')}</div>` : '');
  patch($('#turn-ctl'), `<div class="btn-row">
      <button class="btn btn-ghost btn-small" data-act="end" type="button">End turn <kbd>N</kbd></button>
      <button class="btn btn-ghost btn-small" data-act="skip" type="button">Skip turn</button>
      <button class="btn btn-ghost btn-small" data-act="nudge" data-d="-1" type="button" aria-label="Move token back">← 1</button>
      <button class="btn btn-ghost btn-small" data-act="nudge" data-d="1" type="button" aria-label="Move token forward">1 →</button>
      <button class="btn btn-ghost btn-small" data-act="reland" type="button" title="Use the square where the token is now">Use this square</button>
      <label class="inline">Turn: <select data-act-change="setTurn">${S.players.map((x, i) => `<option value="${i}" ${i === t.pid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    </div>`);
}

function squareInfoHTML(sq) {
  const q = S.squares[sq];
  const g = S.groups.find(x => x.id === q.group);
  let facts = '';
  if (q.type === 'property') {
    const o = ownerOf(S, sq);
    facts = `${money(priceOf(S, sq))} · rent ${money(rentOf(S, sq))} · ${o != null ? 'owned by ' + esc(S.players[o].name) + (isMortgaged(S, sq) ? ' (mortgaged)' : '') : 'for sale'}`;
  } else if (q.type === 'bank') facts = `${q.bank} ${money(q.amount)}`;
  return `<div class="sq-info" style="--gc:${g ? g.color : 'var(--sky)'}"><b>${esc(q.name)}</b> ${facts ? `<span class="muted">${facts}</span>` : ''}
    ${q.topic ? `<div class="muted small">Topic: ${esc(q.topic)}</div>` : ''}</div>`;
}

const PENDING = {
  buy: { title: 'wants to buy', amount: 'Price', deny: 'Cancel' },
  rent: { title: 'pays rent', amount: 'Rent', deny: 'Waive rent' },
  card: { title: 'Chance card', amount: 'Reward (− = pay)', deny: 'Not done' },
  mystery: { title: 'Mystery challenge', amount: 'Reward', deny: 'Not done' },
  bank: { title: 'talks to the bank', amount: 'Amount', deny: 'No deal' },
  jail: { title: 'speaks their way out of Coffee Break', amount: null, deny: 'Miss the turn' },
  festival: { title: 'Town Festival talk', amount: 'Reward', deny: 'Skip' }
};

function pendingHTML() {
  const pe = S.pending;
  if (!pe) return '';
  const p = S.players[pe.pid];
  const info = PENDING[pe.kind];
  const sayKey = { buy: 'buy', rent: pe.claim ? 'claimRent' : 'rent', mystery: 'mystery', bank: 'bank_' + pe.bank, jail: 'jail', festival: 'festival' }[pe.kind];
  const entry = sayKey && S.sayIt ? S.sayIt[sayKey] : null;
  const vars = sayVars(S, pe.pid, { sq: pe.sq, amount: pe.amount, challenge: pe.challenge });
  let what = '';
  if (pe.kind === 'buy' || pe.kind === 'rent') what = `<b>${esc(S.squares[pe.sq].name)}</b>${pe.kind === 'rent' ? ` → to ${esc(S.players[pe.to].name)}` : ''}`;
  if (pe.kind === 'bank') what = { tax: `Tax ${money(pe.amount)} — they may ask for a discount`, bonus: `City Hall bonus ${money(pe.amount)}`, loan: `City Bank: loan offer (repay +${S.settings.loanInterest}%)` }[pe.bank];
  if (pe.card) {
    what = `<div class="pcard">${esc(pe.card.text)}${pe.card.picture ? `<div class="big">${esc(pe.card.picture)}</div>` : ''}${pe.card.word ? `<div>Word: <b>${esc(pe.card.word)}</b> · don't say: ${esc((pe.card.taboo || []).join(', '))}</div>` : ''}
      ${pe.card.fail ? `<div class="muted small">If not done: ${money(pe.card.fail)}</div>` : ''}${pe.card.note ? `<div class="note small">👉 ${esc(pe.card.note)}</div>` : ''}</div>`;
  }
  if (pe.kind === 'jail') what = `<div class="pcard">${esc(pe.challenge)}</div>`;
  const model = entry && entry.examples && entry.examples[0] ? `<div class="model">Model: “${esc(fill(entry.examples[0], vars))}”</div>` : '';
  const amount = info.amount ? `<label class="f-num inline"><span>${info.amount}</span><input id="pending-amount" type="number" value="${pe.amount ?? 0}" step="10"></label>` : '';
  const boost = S.lastTen && S.settings.lastTen ? '<span class="badge-hot">rewards ×2</span>' : '';
  return `<div class="box box-pending"><div class="label">Waiting for you ${pe.tries ? `· try ${pe.tries + 1}` : ''} ${boost}</div>
    <div class="pe-title">${pe.claim ? `${tokenHTML(S.players[pe.to])} <b>${esc(S.players[pe.to].name)}</b> asks <b>${esc(p.name)}</b> for the rent` : `${tokenHTML(p)} <b>${esc(p.name)}</b> ${info.title}`}</div><div class="pe-what">${what}</div>${model}
    <div class="pe-actions">${amount}
      <button class="btn btn-primary" data-cmd="approve" type="button">Approve <kbd>A</kbd></button>
      <button class="btn btn-primary btn-star" data-cmd="approve-bonus" type="button">Approve + ${money(S.settings.sentenceBonus)} <kbd>B</kbd></button>
      <button class="btn btn-ghost" data-act="retry" type="button">Try again <kbd>R</kbd></button>
      <button class="btn btn-ghost btn-deny" data-act="deny" type="button">${info.deny} <kbd>D</kbd></button></div></div>`;
}

function auctionHTML() {
  const au = S.auction;
  if (!au) return '';
  const q = S.squares[au.sq];
  const rows = S.players.map((p, i) => i === au.seller ? '' : `<div class="bid-row ${au.high && au.high.pid === i ? 'lead' : ''}">${tokenHTML(p)} <span class="bid-name">${esc(p.name)}</span>
    <button class="btn btn-ghost btn-small" data-act="bid" data-pid="${i}" data-add="10" type="button">+10</button>
    <button class="btn btn-ghost btn-small" data-act="bid" data-pid="${i}" data-add="50" type="button">+50</button>
    <button class="btn btn-ghost btn-small" data-act="bid" data-pid="${i}" data-add="100" type="button">+100</button>
    <span class="custom" data-fields><input type="number" name="amount" placeholder="$" step="10" aria-label="Bid for ${esc(p.name)}"><button class="btn btn-ghost btn-small" data-act="bid" data-pid="${i}" type="button">Bid</button></span></div>`).join('');
  return `<div class="box box-auction"><div class="label">🔨 Auction · ${esc(q.name)} (list price ${money(q.price)})${au.seller != null ? ` · seller ${esc(S.players[au.seller].name)}` : ''}</div>
    <div class="auc-top"><span class="auc-time" data-end="${au.endsAt}"></span><span class="auc-high">${au.high ? `${esc(S.players[au.high.pid].name)} · <b>${money(au.high.amount)}</b>` : 'No bids yet'}</span></div>
    ${rows}<div class="btn-row"><button class="btn btn-ghost btn-small" data-act="auctionTime" data-secs="10" type="button">+10 s</button>
    <button class="btn btn-primary btn-small" data-act="auctionClose" type="button">Sold now</button>
    <button class="btn btn-ghost btn-small" data-act="auctionCancel" type="button">Cancel auction</button></div></div>`;
}

function tradeSide(x) {
  return [...x.props.map(sq => esc(S.squares[sq].name)), x.money ? money(x.money) : ''].filter(Boolean).join(' + ') || 'nothing';
}
function tradeBoxHTML() {
  const tr = S.trade;
  if (!tr) return '';
  const offered = tr.status === 'offered';
  return `<div class="box box-trade"><div class="label">🤝 Trade proposal${offered ? ` · waiting for ${esc(S.players[tr.to].name)}'s answer on the phone` : ''}</div>
    <p><b>${esc(S.players[tr.from].name)}</b> gives ${tradeSide(tr.give)}<br><b>${esc(S.players[tr.to].name)}</b> gives ${tradeSide(tr.get)}</p>
    <div class="btn-row"><button class="btn ${offered ? 'btn-ghost' : 'btn-primary'} btn-small" data-act="tradeConfirm" type="button">${offered ? 'Confirm anyway' : 'Confirm the deal'}</button>
    <button class="btn btn-ghost btn-small" data-act="tradeCancel" type="button">Cancel</button></div></div>`;
}

function blackBoxHTML() {
  const b = S.black;
  if (!b) return '';
  return `<div class="box box-black"><div class="label">🕶️ Black Market · ${esc(b.item.emoji)} ${esc(b.item.name)} (worth ${money(b.item.value)})</div>
    <div class="auc-top">${b.closed ? '<b>Pitching is over — choose the best pitch.</b>' : '<span class="auc-time" data-end="' + b.endsAt + '"></span> Students pitch now.'}</div>
    <div class="btn-row" data-fields><select name="pid" aria-label="Winner">${S.players.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('')}</select>
    <label class="f-num inline"><span>Price</span><input type="number" name="price" value="${b.item.price}" step="10"></label>
    <button class="btn btn-primary btn-small" data-act="blackSell" type="button">Sell to the best pitch</button>
    <button class="btn btn-ghost btn-small" data-act="blackClose" type="button">No sale</button></div></div>`;
}

function renderEnding() {
  $('#turn-play').hidden = true;
  const box = $('#end-box');
  box.hidden = false;
  if (S.phase === 'over') {
    patch(box, `<div class="box"><div class="label">Results are on the board</div>
      <ol class="final">${S.results.ranking.map(r => `<li>${tokenHTML(S.players[r.pid])} <b>${esc(S.players[r.pid].name)}</b> ${money(r.total)}</li>`).join('')}</ol>
      <div class="btn-row"><button class="btn btn-primary" data-cmd="export-md" type="button">Export log + notes</button>
      <button class="btn btn-ghost" data-cmd="new-game" type="button">New game</button>
      <button class="btn btn-ghost" data-act="resume" type="button">Back to the game</button></div></div>`);
    return;
  }
  const rows = S.players.map((p, i) => `<tr><td>${tokenHTML(p)} <b>${esc(p.name)}</b></td><td class="small">${p.mission ? esc(p.mission) : '<span class="muted">—</span>'}</td>
    <td><input type="checkbox" name="m${i}" ${p.mission ? '' : 'disabled'} aria-label="Mission done"></td><td><input type="checkbox" name="g${i}" aria-label="Guessed a mission"></td></tr>`).join('');
  patch(box, `<div class="box box-pending"><div class="label">End of the game</div>
    <p>Ask each player to reveal their mission and guess someone else's. Tick what they did, then show the results.</p>
    <table class="end-form" id="end-form"><thead><tr><th>Player</th><th>Secret mission</th><th>Done (+${money(S.settings.missionBonus)})</th><th>Guessed (+${money(S.settings.guessBonus)})</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="btn-row"><button class="btn btn-primary btn-big" data-cmd="results" type="button">Show the results</button>
    <button class="btn btn-ghost" data-act="resume" type="button">Back to the game</button></div></div>`);
}

// --- Players column ---

function renderPlayers() {
  const list = $('#players');
  if (list.children.length !== S.players.length) {
    list.innerHTML = S.players.map((_, i) => `<article class="pcard-t" data-pid="${i}"><div class="pc-main"></div>
      <textarea class="pc-notes" data-notes="${i}" rows="2" placeholder="Notes: errors, good sentences…" aria-label="Notes"></textarea></article>`).join('');
  }
  const st = S.settings;
  S.players.forEach((p, i) => {
    const card = list.children[i];
    card.classList.toggle('active', S.turn && S.turn.pid === i && S.phase === 'play');
    const props = playerProps(S, i).map(sq => {
      const g = S.groups.find(x => x.id === S.squares[sq].group);
      return `<span class="pchip-s ${isMortgaged(S, sq) ? 'mort' : ''}" style="--gc:${g ? g.color : '#999'}">${esc(S.squares[sq].name)}</span>`;
    }).join('') + p.specials.map(x => `<span class="pchip-s special">${esc(x.emoji)} ${esc(x.name)}</span>`).join('');
    const w = worth(S, i);
    const english = st.english === 'rewards' ? `<button class="btn btn-ghost btn-small" data-act="english" data-pid="${i}" data-good="1" type="button" title="Bonus ${money(st.englishBonus)}">✓ English turn</button>`
      : st.english === 'fines' ? `<button class="btn btn-ghost btn-small" data-act="english" data-pid="${i}" data-good="0" type="button" title="Fine ${money(st.englishFine)}">✗ Japanese</button>` : '';
    const seat = Object.keys(S.seats || {}).find(t => S.seats[t] === i);
    const phoneMark = S.settings.phones ? (seat ? (phones.phones.get(seat)?.on ? ' 📱' : ' 📵') : ' <span class="muted small">(no phone)</span>') : '';
    patch(card.querySelector('.pc-main'), `<div class="pc-head">${tokenHTML(p)}<div class="pc-name"><b>${esc(p.name)}${phoneMark}</b>${p.inJail ? ' ☕' : ''}
        <select data-level="${i}" aria-label="Level">${LEVELS.map(l => `<option value="${l}" ${l === p.level ? 'selected' : ''}>${LEVEL_NAMES[l]}</option>`).join('')}</select></div>
        <div class="pc-money ${p.money < 0 ? 'neg' : ''}">${money(p.money)}${p.debt ? `<div class="debt">debt ${money(p.debt)}</div>` : ''}<div class="muted small">worth ${money(w.total)}</div></div></div>
      <div class="btn-row money-btns">${[-200, -100, -50, 50, 100, 200].map(d => `<button class="btn btn-ghost btn-small ${d < 0 ? 'minus' : 'plus'}" data-act="money" data-pid="${i}" data-delta="${d}" type="button">${d > 0 ? '+' : '−'}${Math.abs(d)}</button>`).join('')}
        <span class="custom" data-fields><input type="number" name="amount" placeholder="$" step="10" aria-label="Custom amount for ${esc(p.name)}">
        <button class="btn btn-ghost btn-small" data-cmd="money-custom" data-pid="${i}" data-sign="1" type="button" aria-label="Give">+</button><button class="btn btn-ghost btn-small" data-cmd="money-custom" data-pid="${i}" data-sign="-1" type="button" aria-label="Take">−</button></span></div>
      <div class="btn-row">
        ${st.surprises.stars ? `<button class="btn btn-ghost btn-small" data-act="star" data-pid="${i}" type="button">⭐ Star${p.stars ? ' (' + p.stars + ')' : ''}</button>` : ''}
        ${english}
        ${S.rule ? `<button class="btn btn-ghost btn-small" data-act="ruleFine" data-pid="${i}" type="button" title="Fine ${money(st.ruleFine)}">Rule broken</button>` : ''}
        ${p.debt ? `<button class="btn btn-ghost btn-small" data-act="repay" data-pid="${i}" type="button">Repay debt</button>` : ''}
      </div>
      ${p.mission ? `<div class="mission-row"><span class="label">Mission</span> ${revealed.has(i) ? esc(p.mission) : '••••••'} <button class="link" data-cmd="reveal" data-pid="${i}" type="button">${revealed.has(i) ? 'hide' : 'show'}</button></div>` : ''}
      ${props ? `<div class="pc-props">${props}</div>` : ''}`);
    const notes = card.querySelector('.pc-notes');
    if (document.activeElement !== notes && notes.value !== p.notes) notes.value = p.notes;
  });
}

// --- Tabs ---

const TABS = { bank: bankTab, props: propsTab, events: eventsTab, hints: hintsTab, phones: phonesTab, log: logTab, settings: settingsTab, game: gameTab };

function phonesTab() {
  if (!S.settings.phones) return `<section class="tsec"><h3>📱 Phones</h3><p>Phones are off for this game.${server ? ' Switch them on in Settings → Rent and phones.' : ''}</p>${server ? '' : joinBoxHTML()}</section>`;
  return `<section class="tsec"><h3>📱 Join</h3>${joinBoxHTML()}</section>
    <section class="tsec"><h3>Phones</h3>${phoneListHTML()}
    <p class="hint">A phone that joins late chooses a free player itself, or choose here. Remove a phone to free its player.</p></section>`;
}

function renderTab() {
  $$('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  patch($('#tab-body'), TABS[tab]());
}

const playerOptions = (sel, blank) => (blank ? `<option value="">${blank}</option>` : '') + S.players.map((p, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

function bankTab() {
  const pid = S.turn ? S.turn.pid : 0;
  const d = tradeDraft;
  if (!S.players[d.from]) d.from = 0;
  if (!S.players[d.to] || d.to === d.from) d.to = (d.from + 1) % S.players.length;
  const propsFor = (key, owner) => playerProps(S, owner).map(sq => `<label class="chk"><input type="checkbox" data-tdraft="${key}" value="${sq}" ${d[key].props.includes(sq) ? 'checked' : ''}> ${esc(S.squares[sq].name)}</label>`).join('') || '<span class="muted small">No properties</span>';
  return `<section class="tsec" data-fields><h3>Transfer money</h3><div class="form-row">
      <select name="from" aria-label="From">${playerOptions(pid)}</select> → <select name="to" aria-label="To">${playerOptions((pid + 1) % S.players.length)}</select>
      <input type="number" name="amount" placeholder="$" step="10" aria-label="Amount"><button class="btn btn-primary btn-small" data-act="transfer" type="button">Transfer</button></div></section>
    <section class="tsec" data-fields><h3>Loan</h3><div class="form-row">
      <select name="pid" aria-label="Player">${playerOptions(pid)}</select>
      <input type="number" name="amount" placeholder="Lend $" step="50" aria-label="Loan amount">
      <input type="number" name="repay" placeholder="Pays back $" step="10" aria-label="Pays back">
      <button class="btn btn-primary btn-small" data-act="loan" type="button">Give loan</button></div>
      <p class="hint">Leave “pays back” empty for no interest. Debts count against the final worth.</p></section>
    <section class="tsec" data-fields><h3>Repay a loan</h3><div class="form-row">
      <select name="pid" aria-label="Player">${playerOptions(pid)}</select><input type="number" name="amount" placeholder="$ (empty = all)" step="10" aria-label="Amount">
      <button class="btn btn-ghost btn-small" data-act="repay" type="button">Repay</button></div>
      <p class="hint">${S.players.filter(p => p.debt).map(p => `${esc(p.name)}: ${money(p.debt)}`).join(' · ') || 'Nobody has debts.'}</p></section>
    <section class="tsec"><h3>Trade (built by the teacher)</h3>
      <div class="trade-build"><div><select data-tdraft-player="from" aria-label="First player">${playerOptions(d.from)}</select> gives
        <div class="chk-list">${propsFor('give', d.from)}</div><input type="number" data-tdraft-money="give" value="${d.give.money || ''}" placeholder="+ $" step="10" aria-label="Money"></div>
      <div><select data-tdraft-player="to" aria-label="Second player">${playerOptions(d.to)}</select> gives
        <div class="chk-list">${propsFor('get', d.to)}</div><input type="number" data-tdraft-money="get" value="${d.get.money || ''}" placeholder="+ $" step="10" aria-label="Money"></div></div>
      <button class="btn btn-primary btn-small" data-cmd="trade-do" type="button">Confirm this deal</button></section>`;
}

function propsTab() {
  const groups = S.groups.map(g => {
    const rows = S.squares.map((q, sq) => ({ q, sq })).filter(x => x.q.group === g.id).map(({ q, sq }) => {
      const o = ownerOf(S, sq);
      const m = isMortgaged(S, sq);
      return `<tr><td>${esc(q.emoji || '')} ${esc(q.name)}</td><td class="num">${money(priceOf(S, sq))}</td><td class="num">${money(rentOf(S, sq))}</td>
        <td><select data-owner="${sq}" aria-label="Owner of ${esc(q.name)}">${playerOptions(o, 'Bank')}</select></td>
        <td>${o != null ? `<button class="btn btn-ghost btn-small" data-act="${m ? 'unmortgage' : 'mortgage'}" data-sq="${sq}" type="button" title="${m ? 'Pays back ' + money(Math.round(mortgageValue(q) * 1.1)) : 'Gets ' + money(mortgageValue(q))}">${m ? 'Buy back' : 'Mortgage'}</button>` : ''}</td>
        <td><button class="btn btn-ghost btn-small" data-act="auction" data-sq="${sq}" type="button" ${S.auction ? 'disabled' : ''}>Auction</button></td></tr>`;
    }).join('');
    return `<tr class="grp"><th colspan="6"><i class="gdot" style="--gc:${g.color}"></i> ${esc(g.name)}</th></tr>${rows}`;
  }).join('');
  const specials = S.players.filter(p => p.specials.length).map(p => `<li><b>${esc(p.name)}</b>: ${p.specials.map(x => `${esc(x.emoji)} ${esc(x.name)} (${money(x.value)})`).join(', ')}</li>`).join('');
  return `<table class="ptable"><thead><tr><th>Property</th><th class="num">Price</th><th class="num">Rent</th><th>Owner</th><th></th><th></th></tr></thead><tbody>${groups}</tbody></table>
    ${specials ? `<h3>Black Market items</h3><ul>${specials}</ul>` : ''}
    <p class="hint">Rent doubles when one player owns a whole colour group. Mortgaged properties collect no rent.</p>`;
}

function eventsTab() {
  const sp = S.settings.surprises;
  const pid = S.turn ? S.turn.pid : 0;
  const off = what => `<p class="hint">${what} is switched off in Settings.</p>`;
  return `<section class="tsec" data-fields><h3>📈 Market boom / 📉 crash</h3>${sp.market ? `<div class="form-row">
      <select name="group" aria-label="Where"><option value="">All districts</option>${S.groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select>
      <label class="f-num inline"><span>Rounds</span><input type="number" name="rounds" value="2" min="1" max="9"></label>
      <button class="btn btn-primary btn-small" data-act="market" data-mult="2" type="button">Boom ×2</button>
      <button class="btn btn-primary btn-small" data-act="market" data-mult="0.5" type="button">Crash ½</button>
      ${S.market ? `<button class="btn btn-ghost btn-small" data-act="marketEnd" type="button">Back to normal</button>` : ''}</div>` : off('Market')}</section>
    <section class="tsec" data-fields><h3>🕶️ Black Market</h3>${sp.blackMarket ? `<div class="form-row">
      <select name="item" aria-label="Item"><option value="">Random item</option>${(C.blackMarket || []).map((x, i) => `<option value="${i}">${esc(x.emoji)} ${esc(x.name)} (${money(x.price)})</option>`).join('')}</select>
      <button class="btn btn-primary btn-small" data-act="blackMarket" type="button" ${S.black ? 'disabled' : ''}>Open for ${Math.round(S.settings.blackMarketSecs / 60 * 10) / 10} min</button></div>` : off('Black Market')}</section>
    <section class="tsec"><h3>📜 Rule of the round</h3>${sp.rules ? `<p>${S.rule ? esc(S.rule.text) : '<span class="muted">No rule right now.</span>'}</p>
      <div class="btn-row"><button class="btn btn-ghost btn-small" data-act="ruleNext" type="button">New rule</button><button class="btn btn-ghost btn-small" data-act="ruleClear" type="button">No rule</button></div>
      <p class="hint">A new rule comes automatically every round. Fine players from their card (“Rule broken”).</p>` : off('Rule of the round')}</section>
    <section class="tsec" data-fields><h3>🏮 Town fund</h3>${sp.townFund ? `<p>${money(S.fund)} of ${money(S.settings.fundTarget)} · festivals so far: ${S.festivals}</p><div class="form-row">
      <select name="pid" aria-label="Who pays">${playerOptions(null, 'The bank pays')}</select><input type="number" name="amount" placeholder="$" step="10" aria-label="Amount">
      <button class="btn btn-ghost btn-small" data-act="fund" type="button">Add to the fund</button></div>` : off('Town fund')}</section>
    <section class="tsec" data-fields><h3>🃏 Card for any player</h3><div class="form-row">
      <select name="pid" aria-label="Player">${playerOptions(pid)}</select>
      <button class="btn btn-ghost btn-small" data-act="drawFor" data-deck="chance" type="button">Chance card</button>
      ${sp.mystery ? `<button class="btn btn-ghost btn-small" data-act="drawFor" data-deck="mystery" type="button">Mystery challenge</button>` : ''}
      <button class="btn btn-ghost btn-small" data-act="jail" type="button">Send to Coffee Break</button></div></section>
    <section class="tsec" data-fields><h3>📣 Announcement</h3><div class="form-row">
      <input type="text" name="title" placeholder="Title" aria-label="Title"><input type="text" name="text" placeholder="Text (optional)" aria-label="Text">
      <button class="btn btn-ghost btn-small" data-act="announce" type="button">Show on the board</button></div></section>
    <section class="tsec"><h3>🏁 End</h3><button class="btn btn-ghost btn-small" data-act="endGame" type="button">End the game now</button></section>`;
}

function hintsTab() {
  const pid = S.turn ? S.turn.pid : 0;
  const p = S.players[pid];
  const vars = sayVars(S, pid);
  const q = S.squares[p.pos];
  const sendBtn = (title, lines, label) => `<button class="hint-item" data-hint='${esc(JSON.stringify({ title, lines }))}' type="button">${label}</button>`;
  const sec = Object.entries(S.sayIt || {}).map(([key, e]) => {
    const frames = (e.frames || []).map(f => fill(f, vars));
    const ex = (e.examples || []).map(f => fill(f, vars));
    return `<details class="hint-sec"><summary>${esc(e.label || key)} <span class="muted small">${esc(fill(e.task, vars))}</span></summary>
      ${frames.length ? `<div class="label">Sentence frames</div>${sendBtn('Try this', frames, '<b>All frames</b>')}${frames.map(f => sendBtn('Try this', [f], esc(f))).join('')}` : ''}
      ${e.vocab && e.vocab.length ? `<div class="label">Vocabulary</div>${sendBtn('Useful words', [e.vocab.join(' · ')], esc(e.vocab.join(' · ')))}` : ''}
      ${ex.length ? `<div class="label">Example answer</div>${ex.map(f => sendBtn('Example', [f], esc(f))).join('')}` : ''}</details>`;
  }).join('');
  const sqHint = q.vocab ? `<section class="tsec"><h3>This square: ${esc(q.name)}</h3>${sendBtn(q.name, [q.vocab.join(' · ')], 'Vocabulary: ' + esc(q.vocab.join(' · ')))}${q.topic ? sendBtn('Talk about it', [q.topic], 'Topic: ' + esc(q.topic)) : ''}</section>` : '';
  return `<div class="form-row"><label class="inline">Hint for: <select id="hint-pid">${playerOptions(pid, 'Everyone')}</select></label>
      ${S.hint ? `<button class="btn btn-ghost btn-small" data-act="hintClose" type="button">Close the hint on the board</button>` : ''}</div>
    <section class="tsec" data-fields><h3>Write your own</h3><div class="form-row"><input type="text" name="title" placeholder="Title (e.g. Try this)" aria-label="Hint title">
      <input type="text" name="text" placeholder="Hint text" aria-label="Hint text"><button class="btn btn-primary btn-small" data-cmd="hint-custom" type="button">Send</button></div></section>
    ${sqHint}<section class="tsec"><h3>Hint bank</h3>${sec}</section>`;
}

const LOG_ICON = { buy: '🏠', money: '💰', trade: '🤝', auction: '🔨', card: '🃏', event: '🎉', turn: '🎲', star: '⭐', rule: '📜', info: '•' };
let logFilter = '';
function logTab() {
  const items = S.log.filter(e => !logFilter || e.kind === logFilter).slice(-400).reverse().map(e => {
    const t = new Date(e.t);
    return `<li><span class="lt">${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}</span> ${LOG_ICON[e.kind] || '•'} ${esc(e.text)}</li>`;
  }).join('');
  return `<div class="form-row"><select id="log-filter" aria-label="Filter"><option value="">Everything</option>${Object.keys(LOG_ICON).map(k => `<option value="${k}" ${k === logFilter ? 'selected' : ''}>${LOG_ICON[k]} ${k}</option>`).join('')}</select>
    <button class="btn btn-primary btn-small" data-cmd="export-md" type="button">Export log + notes (.md)</button></div><ul class="log">${items}</ul>`;
}

function settingsTab() {
  return `<p class="hint">Changes apply straight away.</p>${settingsFormHTML(S.settings, { inGame: true })}`;
}

function gameTab() {
  const left = timeLeft(S, Date.now());
  return `<section class="tsec"><h3>⏱ Game timer</h3>
      <p>${left != null ? `<b class="tclock">${fmtClock(left)}</b> left${S.timer.pausedAt ? ' (paused)' : ''}` : 'No timer.'}</p>
      <div class="btn-row">
        ${S.timer ? (S.timer.pausedAt ? `<button class="btn btn-primary btn-small" data-act="timerResume" type="button">Resume</button>` : `<button class="btn btn-ghost btn-small" data-act="timerPause" type="button">Pause</button>`) : ''}
        ${S.timer ? `<button class="btn btn-ghost btn-small" data-act="timerAdd" data-minutes="5" type="button">+5 min</button><button class="btn btn-ghost btn-small" data-act="timerAdd" data-minutes="-5" type="button">−5 min</button>` : ''}
      </div><div class="btn-row">Restart at: ${[60, 90, 120].map(m => `<button class="btn btn-ghost btn-small" data-act="timerSet" data-minutes="${m}" type="button">${m} min</button>`).join('')}<button class="btn btn-ghost btn-small" data-act="timerSet" data-minutes="0" type="button">No timer</button></div></section>
    <section class="tsec"><h3>💾 Save and load</h3><p class="hint">The game saves itself in this browser after every action. To continue next week on any computer, save it to a file.</p>
      <div class="btn-row"><button class="btn btn-primary btn-small" data-cmd="save" type="button">Save game to a file</button><button class="btn btn-ghost btn-small" data-cmd="load" type="button">Load a game file</button>
      <button class="btn btn-ghost btn-small" data-cmd="export-md" type="button">Export log + notes</button></div></section>
    <section class="tsec"><h3>Game</h3><div class="btn-row">
      <button class="btn btn-ghost btn-small" data-act="endGame" type="button">End the game</button>
      <button class="btn btn-ghost btn-small" data-cmd="new-game" type="button">New game</button>
      <a class="btn btn-ghost btn-small" href="editor.html" target="_blank" rel="noopener">Content editor</a></div>
      <p class="hint">Content changes (cards, missions, rules, prompts) apply straight away after a reload; a changed board applies to the next new game.</p></section>`;
}

function renderMini() {
  const el = $('#mini-board');
  if (!el._sig) buildBoard(el, S, { mini: true });
  updateBoard(el, S, { highlight: S.turn ? S.players[S.turn.pid].pos : null });
}

// Timers and countdowns on this page.
function tickDisplay() {
  const now = Date.now();
  const left = S && S.phase === 'play' ? timeLeft(S, now) : null;
  const clock = $('#top-clock');
  clock.textContent = left != null ? fmtClock(left) + (S.timer.pausedAt ? ' ⏸' : '') : '';
  clock.classList.toggle('low', left != null && left <= 600000);
  for (const el of $$('.auc-time')) el.textContent = Math.ceil(Math.max(0, Number(el.dataset.end) - now) / 1000) + ' s';
  const tc = $('.tclock');
  if (tc && left != null) tc.textContent = fmtClock(left);
}

// ---------- Input ----------

function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3500);
}

// Collect data-* values of a button and named fields of its closest [data-fields] box.
function params(b) {
  const out = {};
  for (const [k, v] of Object.entries(b.dataset)) if (k !== 'act' && k !== 'cmd') out[k] = v;
  const box = b.closest('[data-fields]');
  if (box) for (const f of box.querySelectorAll('[name]')) if (!(f.name in out) || f.value !== '') out[f.name] = f.type === 'checkbox' ? f.checked : f.value;
  for (const k of ['pid', 'sq', 'from', 'to', 'item', 'id']) if (out[k] !== undefined && out[k] !== '') out[k] = Number(out[k]);
  for (const k of ['pid', 'item']) if (out[k] === '') out[k] = null;
  for (const k of ['delta', 'add', 'd', 'secs', 'minutes', 'mult', 'rounds']) if (out[k] !== undefined && out[k] !== '') out[k] = Number(out[k]);
  if (out.good !== undefined) out.good = out.good === '1';
  if (out.repay === '') delete out.repay;
  if (out.amount === '') delete out.amount;
  return out;
}

function approve(bonus) {
  const inp = $('#pending-amount');
  act({ type: 'approve', bonus, amount: inp ? inp.value : undefined });
}

function command(cmd, b) {
  switch (cmd) {
    case 'approve': approve(false); break;
    case 'approve-bonus': approve(true); break;
    case 'money-custom': {
      const box = b.closest('[data-fields]');
      const v = Number(box.querySelector('[name=amount]').value);
      if (!v) { toast('Type an amount first.'); return; }
      if (act({ type: 'money', pid: Number(b.dataset.pid), delta: v * Number(b.dataset.sign) })) box.querySelector('[name=amount]').value = '';
      break;
    }
    case 'reveal': {
      const i = Number(b.dataset.pid);
      if (revealed.has(i)) revealed.delete(i); else revealed.add(i);
      render();
      break;
    }
    case 'hint-custom': {
      const p = params(b);
      if (!p.text) { toast('Type a hint first.'); return; }
      sendHint(p.title || 'Hint', [p.text]);
      break;
    }
    case 'trade-do':
      if (act({ type: 'tradeConfirm', trade: tradeDraft })) tradeDraft = { from: tradeDraft.from, to: tradeDraft.to, give: { money: 0, props: [] }, get: { money: 0, props: [] } };
      render();
      break;
    case 'results': {
      const missions = {}, guesses = {};
      S.players.forEach((_, i) => {
        missions[i] = !!$(`#end-form [name=m${i}]`)?.checked;
        guesses[i] = !!$(`#end-form [name=g${i}]`)?.checked;
      });
      act({ type: 'results', missions, guesses });
      break;
    }
    case 'save': saveGame(); break;
    case 'load': $('#load-file').click(); break;
    case 'export-md': download(`speak-plus-city-${dateStamp()}.md`, sessionReport(S), 'text/markdown'); break;
    case 'new-game': {
      if (S.phase === 'play' && !confirm('Start a new game?\n\nYou go back to the setup screen with the same players and settings, and can change anything before you start again. Press "Back to the current game" there if you change your mind.')) return;
      // Same players (and their phones) and the settings of this game, ready to change.
      const phoneOf = pid => Object.keys(S.seats || {}).find(t => S.seats[t] === pid);
      if (S.players.length) setupPlayers = S.players.map((p, i) => ({ name: p.name, token: p.token, level: p.level, phone: phoneOf(i) }));
      if (S.phase !== 'setup') setupSettings = { ...setupSettings, ...structuredClone(S.settings) };
      showSetup = true;
      render();
      broadcast();      // the board shows the QR code again, phones go to the lobby
      sendViews();
      window.scrollTo(0, 0);
      break;
    }
    case 'open-board': openBoard(); break;
    case 'kick': {
      const token = b.dataset.token;
      if (!confirm('Remove this phone? Its player stays in the game and can be taken by another phone.')) return;
      phones.kick(token);
      sentViews.delete(token);
      if (S.seats[token] != null) act({ type: 'seat', token, pid: null }); else render();
      break;
    }
    case 'undo': undoLast(); break;
    case 'help': help.toggle(); break;
  }
}

function sendHint(title, lines) {
  const sel = $('#hint-pid');
  const pid = sel && sel.value !== '' ? Number(sel.value) : null;
  if (act({ type: 'hint', title, lines, pid })) toast('Hint sent to the board.');
}

const dateStamp = () => new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');

function saveGame() {
  download(`speak-plus-city-game-${dateStamp()}.json`, JSON.stringify({ app: 'speak-plus-city', v: 1, savedAt: new Date().toISOString(), state: S }, null, 1));
  toast('Game saved to a file.');
}

async function loadGame(file) {
  try {
    const data = JSON.parse(await readFile(file));
    const s = data && data.app === 'speak-plus-city' ? data.state : null;
    if (!s || !Array.isArray(s.players) || !Array.isArray(s.squares)) throw new Error('bad');
    s.fxSeq = Math.max(s.fxSeq || 0, S.fxSeq || 0) + 1;
    s.fx = [];
    if (s.timer && !s.timer.pausedAt && s.phase === 'play') s.timer.pausedAt = Date.now();   // paused until the teacher presses Resume
    showSetup = false;
    commit(normalize(s));
    toast(`Game loaded (saved ${new Date(data.savedAt).toLocaleString()}). The timer is paused: press Resume in the Game tab.`);
  } catch {
    toast('That file is not a Speak Plus City game.', 'bad');
  }
}

function openBoard() {
  const w = window.open('board.html', 'sp-city-board', 'popup,width=1280,height=760');
  if (!w) toast('The browser blocked the window. Allow pop-ups, or open board.html in a new tab.', 'bad');
}

document.addEventListener('click', e => {
  const b = e.target.closest('button, [data-tab]');
  if (!b) return;
  if (b.dataset.tab && !b.dataset.act) {
    tab = b.dataset.tab;
    if (b.dataset.prefill) tradeDraft.from = Number(b.dataset.prefill);
    renderTab();
    return;
  }
  if (b.dataset.hint) { const h = JSON.parse(b.dataset.hint); sendHint(h.title, h.lines); return; }
  if (b.dataset.setup) {
    if (b.dataset.setup === 'add' && setupPlayers.length < MAX_PLAYERS) {
      const used = new Set(setupPlayers.map(p => p.token));
      setupPlayers.push({ name: '', token: TOKENS.findIndex((_, k) => !used.has(k)), level: 'beginner' });
    } else if (b.dataset.setup === 'remove') setupPlayers.splice(Number(b.closest('[data-i]').dataset.i), 1);
    renderSetup();
    return;
  }
  if (b.dataset.cmd) { command(b.dataset.cmd, b); return; }
  if (b.dataset.act) act({ type: b.dataset.act, ...params(b) });
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.level) act({ type: 'setLevel', pid: Number(el.dataset.level), level: el.value });
  else if (el.dataset.seat) act({ type: 'seat', token: el.dataset.seat, pid: el.value === '' ? null : Number(el.value) });
  else if (el.dataset.owner) act({ type: 'setOwner', sq: Number(el.dataset.owner), pid: el.value === '' ? null : Number(el.value) });
  else if (el.dataset.actChange === 'setTurn') act({ type: 'setTurn', pid: Number(el.value) });
  else if (el.id === 'log-filter') { logFilter = el.value; renderTab(); }
  else if (el.dataset.setting) {
    const v = el.type === 'checkbox' ? el.checked : el.type === 'number' || el.dataset.setting === 'gameMinutes' ? Number(el.value) : el.value;
    const patchObj = patchFromPath(el.dataset.setting, v);
    if (!$('#view-setup').hidden) {
      setupSettings = { ...setupSettings, ...patchObj, hints: { ...setupSettings.hints, ...(patchObj.hints || {}) }, surprises: { ...setupSettings.surprises, ...(patchObj.surprises || {}) } };
      saveSettings(setupSettings);
      render();       // "Play with phones" shows the QR code and connects
      broadcast();
    } else if (act({ type: 'settings', patch: patchObj })) saveSettings(S.settings);
  } else if (el.dataset.sp) {
    const i = Number(el.closest('[data-i]').dataset.i);
    setupPlayers[i][el.dataset.sp] = el.dataset.sp === 'token' ? Number(el.value) : el.value;
    if (el.dataset.sp !== 'name') renderSetup();
  } else if (el.dataset.tdraft) {
    const list = tradeDraft[el.dataset.tdraft].props;
    const sq = Number(el.value);
    if (el.checked) list.push(sq); else list.splice(list.indexOf(sq), 1);
  } else if (el.dataset.tdraftPlayer) {
    tradeDraft[el.dataset.tdraftPlayer] = Number(el.value);
    tradeDraft.give.props = []; tradeDraft.get.props = [];
    renderTab();
  } else if (el.dataset.tdraftMoney) tradeDraft[el.dataset.tdraftMoney].money = Number(el.value) || 0;
  else if (el.id === 'load-file' && el.files[0]) { loadGame(el.files[0]); el.value = ''; }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.notes) {
    clearTimeout(el._t);
    // Save notes shortly after typing stops (notes don't go into Undo).
    el._t = setTimeout(() => act({ type: 'notes', pid: Number(el.dataset.notes), text: el.value }), 400);
  } else if (el.dataset.sp === 'name') setupPlayers[Number(el.closest('[data-i]').dataset.i)].name = el.value;
});

$('#setup-form').addEventListener('submit', e => {
  e.preventDefault();
  const players = setupPlayers.map((p, i) => ({ ...p, name: p.name.trim() || `Player ${i + 1}`, phone: setupSettings.phones ? p.phone : undefined }));
  const tokens = players.map(p => p.token);
  if (new Set(tokens).size !== tokens.length) { toast('Each player needs a different token.', 'bad'); return; }
  localStorage.setItem('sp-city-players-v1', JSON.stringify(players.map(({ phone, ...p }) => p)));
  sentViews.clear();
  saveSettings(setupSettings);
  undo.length = 0;
  revealed.clear();
  showSetup = false;
  $('#mini-board')._sig = null;   // rebuild the small board and the player cards for the new game
  $('#players').innerHTML = '';
  if (act({ type: 'setup', players, settings: setupSettings })) {
    undo.length = 0;
    if (!boardConnected()) toast('Now open the board window for the projector.');
  }
});
$('#setup-cancel').addEventListener('click', () => { showSetup = false; render(); broadcast(); sendViews(); });

$('#dice-form').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#dice-input').value.trim();
  if (!v) return;
  const parts = v.split(/[\s,+]+/).map(Number).filter(n => !Number.isNaN(n));
  const ok = parts.length === 2 ? act({ type: 'roll', dice: parts }) : act({ type: 'roll', total: parts[0] });
  if (ok) { $('#dice-input').value = ''; $('#dice-input').blur(); }
});
$('#dice-random').addEventListener('click', () => act({ type: 'roll' }));

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isTyping(e)) { e.preventDefault(); undoLast(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') { help.close(); document.activeElement?.blur(); return; }
  if (isTyping(e) || S.phase !== 'play' || showSetup) return;
  const k = e.key;
  if (k === '?') { help.toggle(); return; }
  if (/^[0-9]$/.test(k) && !$('#dice-input').disabled) {
    // Typing a number anywhere goes to the dice box.
    e.preventDefault();
    $('#dice-input').focus();
    $('#dice-input').value += k;
    return;
  }
  const map = {
    ' ': () => S.turn.step === 'roll' && act({ type: 'roll' }),
    a: () => approve(false), b: () => approve(true),
    r: () => act({ type: 'retry' }), d: () => act({ type: 'deny' }),
    n: () => act({ type: 'end' }), N: () => act({ type: 'skip' }),
    s: () => S.settings.surprises.stars && act({ type: 'star', pid: S.turn.pid }),
    ArrowLeft: () => act({ type: 'nudge', d: -1 }), ArrowRight: () => act({ type: 'nudge', d: 1 })
  };
  const fn = map[k.length === 1 && k !== 'N' ? k.toLowerCase() : k];
  if (fn) { e.preventDefault(); fn(); }
});

addEventListener('beforeunload', () => channel.send({ t: 'bye' }));

// ---------- Start ----------

// Games saved before a setting existed get its default.
function normalize(s) {
  s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
  s.seats = s.seats || {};
  if (s.rentDue === undefined) s.rentDue = null;
  return s;
}

async function start() {
  try {
    const loaded = await loadContent();
    C = loaded.content;
    C.__custom = loaded.custom;
  } catch (err) {
    document.body.innerHTML = `<div class="wrap"><h1>Could not load the content</h1><p>${esc(err.message)}. Start the game with the start script (see README) so the browser can read data/content.json.</p></div>`;
    return;
  }
  server = await serverInfo();
  const saved = loadState();
  S = normalize(saved && saved.players ? saved : emptyState(setupSettings));
  if (S.phase !== 'setup' && C.sayIt) S.sayIt = C.sayIt;   // keep the prompts up to date with the content editor
  render();
  broadcast();
  setInterval(() => {
    const next = tick(S, ctx());
    if (next) commit(next);
    tickDisplay();
    renderConn();
  }, 250);
  setInterval(() => channel.send({ t: 'ping' }), 3000);
}
start();
