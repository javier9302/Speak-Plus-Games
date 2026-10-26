// Board window (projector). It never changes the game itself: it draws the
// state the teacher window sends, plays the animations, and sends the players'
// button presses back to the teacher window, which decides.

import { options, ownerOf, rentOf, priceOf, playerProps, timeLeft, money, JAIL, LEVEL_NAMES } from './state.js';
import { openChannel, loadState } from './sync.js';
import { buildBoard, updateBoard, hop, boardSig } from './render-board.js';
import { $, $$, esc, patch, tokenHTML, levelBadge, fmtClock, sayVars, sayItHTML, helpOverlay, isTyping } from './ui.js';

let S = null;               // latest game state from the teacher
let lastFx = 0;             // id of the last effect we played
let lastMsgAt = 0;          // when we last heard from the teacher
const disp = {};            // where each token is drawn (differs from the state during a move animation)
const busy = {};            // pid → number of queued move animations
const queue = [];           // blocking effects (dice, moves) played one after another
let running = false;
const shownMoney = {};      // money numbers on screen, animated towards the real value
let ui = { framesKey: '', framesOpen: false, trade: null, ask: null, peek: null, hintClosed: 0 };

const boardEl = $('#board');
const channel = openChannel(onMessage);

const help = helpOverlay('Board shortcuts', [
  ['Space', 'Roll the dice'],
  ['Enter', 'Main button (Buy, Pay rent, Draw card, End turn…)'],
  ['← →', 'Move the current token one square back / forward (fix mistakes)'],
  ['T', 'Open the trade panel'],
  ['B', 'Ask the bank'],
  ['M', 'Peek at your secret mission'],
  ['F', 'Full screen'],
  ['Esc', 'Close a panel'],
  ['?', 'This help']
]);

// ---------- Messages ----------

function onMessage(msg) {
  lastMsgAt = Date.now();
  if (msg.t === 'state') setState(msg.state);
  else if (msg.t === 'error') toast(msg.text, 'bad');
  else if (msg.t === 'bye') lastMsgAt = 0;
  renderConn();
}

function send(action) {
  if (!connected()) { toast('Open the teacher window first (teacher.html).', 'bad'); return; }
  channel.send({ t: 'act', action: { ...action, from: 'board' } });
}

const connected = () => Date.now() - lastMsgAt < 8000;

function setState(s) {
  const fresh = !S || !s.players || S.players.length !== s.players.length || boardSig(S) !== boardSig(s) || (s.fxSeq || 0) < lastFx;
  if (fresh) {
    // New game, new board or first state: don't replay old effects.
    lastFx = s.fxSeq || 0;
    queue.length = 0;
    for (const k of Object.keys(busy)) delete busy[k];
    for (const k of Object.keys(shownMoney)) delete shownMoney[k];
    S = s;
    if (s.squares && s.squares.length) buildBoard(boardEl, s);
    render();
    return;
  }
  const newFx = (s.fx || []).filter(e => e.id > lastFx);
  lastFx = s.fxSeq || lastFx;
  S = s;
  for (const e of newFx) playFx(e);
  render();
}

// ---------- Effects ----------

function playFx(e) {
  switch (e.kind) {
    case 'dice': case 'move': case 'jail': case 'place':
      if (e.kind !== 'dice') busy[e.pid] = (busy[e.pid] || 0) + 1;
      queue.push(e);
      runQueue();
      break;
    case 'money': floatMoney(e.pid, e.delta); break;
    case 'announce': banner(e.title, e.text, e.style); break;
    case 'turn': if (S.players[e.pid]) banner(`${S.players[e.pid].name}'s turn`, '', 'turn', 1600); break;
    case 'star': starBurst(e.pid); break;
    case 'retry': stamp('Try again!', 'retry'); break;
    case 'approved': stamp(e.bonus ? 'Excellent! ⭐' : 'OK!', 'ok'); break;
    case 'denied': stamp('Not this time', 'retry'); break;
    case 'sold': stamp(e.pid != null ? 'SOLD!' : 'No sale', e.pid != null ? 'ok' : 'retry'); break;
    case 'bid': $('#auction-high')?.classList.remove('bump'); requestAnimationFrame(() => $('#auction-high')?.classList.add('bump')); break;
    case 'fine': playerFlash(e.pid, e.text, 'bad'); break;
    case 'cheer': playerFlash(e.pid, e.text, 'good'); break;
    case 'fund': $('#fund')?.classList.remove('pulse'); requestAnimationFrame(() => $('#fund')?.classList.add('pulse')); break;
    case 'confetti':
      // The results are up: drop announcements still waiting so they don't cover the table.
      bannerQ.length = 0;
      $$('.announce').forEach(el => el.remove());
      confetti();
      break;
    case 'buy': {
      const cell = boardEl.querySelector(`.cell[data-sq="${e.sq}"]`);
      if (cell) { cell.classList.remove('flash'); void cell.offsetWidth; cell.classList.add('flash'); }
      break;
    }
  }
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function runQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const e = queue.shift();
    if (e.kind === 'dice') await rollDice(e.dice);
    else if (e.kind === 'move') {
      const hopMs = reduced ? 30 : e.steps > 10 ? 130 : 190;
      for (let k = 1; k <= e.steps; k++) {
        disp[e.pid] = (e.from + k) % 48;
        drawBoard();
        hop(boardEl, e.pid);
        await wait(hopMs);
      }
      busy[e.pid]--;
    } else if (e.kind === 'jail') {
      await wait(350);
      disp[e.pid] = JAIL;
      busy[e.pid]--;
    } else if (e.kind === 'place') {
      disp[e.pid] = S.players[e.pid] ? S.players[e.pid].pos : 0;
      busy[e.pid]--;
    }
    render();
  }
  running = false;
  render();
}

function die(v) {
  const P = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]] };
  return `<svg viewBox="0 0 100 100"><rect x="4" y="4" width="92" height="92" rx="18"/>${P[v].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9"/>`).join('')}</svg>`;
}

async function rollDice(dice) {
  const el = $('#dice');
  if (!el) return;
  el.hidden = false;
  el.classList.add('rolling');
  const frames = reduced ? 1 : 9;
  for (let i = 0; i < frames; i++) {
    el.innerHTML = die(1 + Math.floor(Math.random() * 6)) + die(1 + Math.floor(Math.random() * 6));
    await wait(70);
  }
  el.classList.remove('rolling');
  el.innerHTML = die(dice[0]) + die(dice[1]) + `<span class="dice-total">${dice[0] + dice[1]}</span>`;
  await wait(450);
}

// ---------- Render ----------

function render() {
  if (!S || !S.squares || !S.squares.length) { renderWelcome(); renderConn(); return; }
  document.body.classList.toggle('last-ten', !!S.lastTen);
  drawBoard();
  renderCenter();
  renderSide();
  renderOverlays();
  renderConn();
  tickTimers();
}

function positions() {
  const pos = {};
  S.players.forEach((p, pid) => {
    if (busy[pid] > 0 && disp[pid] != null) pos[pid] = disp[pid];
    else { disp[pid] = p.pos; pos[pid] = p.pos; }
  });
  return pos;
}

function drawBoard() {
  if (!S || !S.squares.length) return;
  const cur = S.turn && S.players[S.turn.pid];
  const animating = running || queue.length;
  updateBoard(boardEl, S, { positions: positions(), highlight: S.phase === 'play' && cur && !animating ? cur.pos : null });
}

function renderWelcome() {
  boardEl.innerHTML = `<div class="welcome"><div class="logo logo-xl">speak<svg><use href="#plus"/></svg></div>
    <h1>Speak Plus City</h1><p>${connected() ? 'The teacher is setting up the game…' : 'Open the teacher window to start: <b>teacher.html</b>'}</p></div>`;
  patch($('#side-status'), '');
  patch($('#side-players'), '');
}

function center() {
  let c = $('#center');
  if (!c) return null;
  if (!$('#center-main')) c.innerHTML = '<div id="dice" class="dice" hidden></div><div id="center-main"></div>';
  return $('#center-main');
}

function showFor(p) { return S.settings.hints[p.level] || 'none'; }

function framesOpenFor(key) {
  if (ui.framesKey !== key) { ui.framesKey = key; ui.framesOpen = false; }
  return ui.framesOpen;
}

function renderCenter() {
  const el = center();
  if (!el) return;
  const sayIt = S.sayIt || {};
  const t = S.turn;
  const animating = running || queue.length;
  const dice = $('#dice');
  if (dice) dice.hidden = (!(t && t.dice && S.phase === 'play' && t.step === 'land') && !animating) || !!S.auction || !!S.black;

  if (S.phase === 'ending' || S.phase === 'over') {
    patch(el, `<div class="c-end"><div class="big-emoji">🏁</div><h2>Time's up!</h2><p>${S.phase === 'over' ? 'Here are the results!' : 'The bank is counting the money…'}</p></div>`);
    return;
  }
  if (!t) { patch(el, ''); return; }
  const p = S.players[t.pid];
  const head = `<div class="c-head">${tokenHTML(p, 'token-lg')}<div><div class="c-who">${esc(p.name)}'s turn</div>${levelBadge(p.level)}</div>
    ${t.endsAt ? `<div class="turn-timer" data-end="${t.endsAt}"></div>` : ''}</div>`;

  // An auction or the Black Market take over the middle of the board.
  if (S.auction) { patch(el, auctionHTML()); return; }
  if (S.black) { patch(el, blackHTML()); return; }

  let body = '';
  if (S.pending) body = pendingHTML(sayIt);
  else if (animating) body = `<div class="c-moving">…</div>`;
  else body = turnHTML(sayIt);
  const strips = stripsHTML();
  patch(el, head + body + strips);
}

function squareCardHTML(sq, show) {
  const q = S.squares[sq];
  const g = S.groups.find(x => x.id === q.group);
  const owner = ownerOf(S, sq);
  let facts = '';
  if (q.type === 'property') {
    facts = owner != null
      ? `<span>Owner: <b>${esc(S.players[owner].name)}</b></span><span>Rent <b>${money(rentOf(S, sq))}</b></span>`
      : `<span>Price <b>${money(priceOf(S, sq))}</b></span><span>Rent <b>${money(rentOf(S, sq))}</b></span>`;
  }
  const vocab = q.vocab && show !== 'none' ? `<div class="chips">${q.vocab.map(w => `<span class="chip">${esc(w)}</span>`).join('')}</div>` : '';
  const topic = q.topic ? `<p class="topic"><b>Talk about it:</b> ${esc(q.topic)}</p>` : '';
  return `<div class="sq-card" style="--gc:${g ? g.color : 'var(--sky)'}"><div class="sq-band">${g ? esc(g.name) : esc(typeName(q))}</div>
    <div class="sq-body"><div class="sq-title"><span class="sq-emoji">${esc(q.emoji || '')}</span>${esc(q.name)}</div>
    ${facts ? `<div class="sq-facts">${facts}</div>` : ''}${vocab}${topic}</div></div>`;
}

function typeName(q) {
  return { start: 'Start', chance: 'Chance', mystery: 'Mystery', bank: 'Bank', blackmarket: 'Black Market', jail: 'Coffee Break', festival: 'Town Festival', gotojail: 'Go to Coffee Break' }[q.type] || '';
}

function turnHTML(sayIt) {
  const t = S.turn;
  const p = S.players[t.pid];
  const opts = options(S);
  const show = showFor(p);
  let main = '';
  if (t.step === 'jail') {
    main = `<div class="c-note"><span class="big-emoji">☕</span> ${esc(p.name)} is on a Coffee Break.</div>`;
  } else if (t.step === 'roll') {
    main = `<div class="c-note">Roll the dice! <span class="keyhint">(click or press <kbd>Space</kbd>)</span></div>`;
  } else {
    main = squareCardHTML(p.pos, show);
    const q = S.squares[p.pos];
    if (q.type === 'gotojail' || (p.pos === JAIL && p.inJail)) main = `<div class="c-note"><span class="big-emoji">👮</span> Coffee Break! ${esc(p.name)} goes to the café.</div>`;
  }
  const primary = opts.find(o => o.primary && o.say && !o.disabled) || opts.find(o => o.say && !o.disabled && !['trade', 'end'].includes(o.id));
  const vars = sayVars(S, t.pid, { amount: primary && primary.id === 'rent' ? rentOf(S, p.pos) : (S.squares[p.pos].amount ?? null) });
  const key = `${t.pid}:${t.step}:${p.pos}:${primary ? primary.id : ''}`;
  const say = primary && sayIt[primary.say] ? sayItHTML(sayIt[primary.say], vars, show, { framesOpen: framesOpenFor(key) }) : '';
  const buttons = opts.map(o => `<button class="opt ${o.primary ? 'opt-primary' : ''} opt-${o.id}" data-opt="${o.id}" type="button" ${o.disabled ? `disabled title="${esc(o.why || '')}"` : ''}>${esc(o.label)}</button>`).join('');
  return `<div class="c-main">${main}${say}</div><div class="opts">${buttons}</div>`;
}

function pendingHTML(sayIt) {
  const pe = S.pending;
  const p = S.players[pe.pid];
  const show = showFor(p);
  const key = `pending:${pe.kind}:${pe.pid}:${pe.sq ?? ''}:${pe.card ? pe.card.text : ''}`;
  const vars = sayVars(S, pe.pid, { sq: pe.sq, amount: pe.amount, challenge: pe.challenge });
  let card = '';
  let sayKey = { buy: 'buy', rent: 'rent', card: null, mystery: 'mystery', bank: 'bank_' + pe.bank, jail: 'jail', festival: 'festival' }[pe.kind];
  if (pe.kind === 'card' || pe.kind === 'mystery') {
    const cd = pe.card;
    const isCard = pe.kind === 'card';
    const amount = cd.reward ? `<div class="card-reward ${cd.reward < 0 ? 'neg' : ''}">${cd.reward > 0 ? '+' : ''}${money(cd.reward)}${S.lastTen && cd.reward > 0 ? ' ×2' : ''}</div>` : '';
    let extra = '';
    if (cd.picture) extra += `<div class="card-picture">${esc(cd.picture)}</div>`;
    if (cd.word) extra += `<div class="card-word">${esc(cd.word)}</div>${cd.taboo && cd.taboo.length ? `<div class="card-taboo">Don't say: ${cd.taboo.map(w => `<s>${esc(w)}</s>`).join(' ')}</div>` : ''}`;
    card = `<div class="game-card-big ${isCard ? 'chance' : 'mystery'}"><div class="gc-type">${isCard ? '❓ Chance' : '🎁 Mystery'} · ${esc(LEVEL_NAMES[p.level])}</div>
      <p class="gc-text">${esc(cd.text)}</p>${extra}${amount}</div>`;
    if (pe.kind === 'mystery') sayKey = show === 'all' && (cd.type === 'picture' || cd.type === 'truths') ? 'mystery' : null;
  }
  if (pe.kind === 'buy' || pe.kind === 'rent') card = squareCardHTML(pe.sq, show);
  const say = sayKey && sayIt[sayKey] ? sayItHTML(sayIt[sayKey], vars, show, { framesOpen: framesOpenFor(key), big: true }) : '';
  const tries = pe.tries ? `<div class="tries">Try ${pe.tries + 1}</div>` : '';
  return `<div class="c-main pending">${card}${say}</div><div class="waiting"><span class="dot-pulse"></span> ${esc(p.name)}, say it to the bank! ${tries}</div>`;
}

function stripsHTML() {
  let out = '';
  if (S.trade) {
    const tr = S.trade;
    const side = x => [...x.props.map(sq => esc(S.squares[sq].name)), x.money ? money(x.money) : ''].filter(Boolean).join(' + ') || 'nothing';
    out += `<div class="strip">🤝 Deal waiting for the bank: <b>${esc(S.players[tr.from].name)}</b> gives ${side(tr.give)} ⇄ <b>${esc(S.players[tr.to].name)}</b> gives ${side(tr.get)}</div>`;
  }
  for (const r of S.requests.slice(-2)) out += `<div class="strip">🏦 ${esc(S.players[r.pid].name)} is asking the bank about a <b>${esc(r.topic)}</b>.</div>`;
  return out;
}

function auctionHTML() {
  const au = S.auction;
  const q = S.squares[au.sq];
  const g = S.groups.find(x => x.id === q.group);
  const hi = au.high;
  const cur = S.turn ? S.players[S.turn.pid] : S.players[0];
  const sayIt = S.sayIt || {};
  const say = sayIt.bid ? sayItHTML(sayIt.bid, { name: q.name }, 'all') : '';
  return `<div class="auction"><div class="auction-tag">🔨 Auction${au.seller != null ? ` · sold by ${esc(S.players[au.seller].name)}` : ''}</div>
    ${squareCardHTML(au.sq, 'vocab')}
    <div class="auction-row"><div class="countdown" data-end="${au.endsAt}" data-dur="${S.settings.auctionSecs * 1000}"></div>
    <div id="auction-high" class="auction-high">${hi ? `${tokenHTML(S.players[hi.pid])} <b>${money(hi.amount)}</b><span>${esc(S.players[hi.pid].name)}</span>` : '<span>No bids yet — shout a price!</span>'}</div></div>
    ${say}</div>`;
}

function blackHTML() {
  const b = S.black;
  const sayIt = S.sayIt || {};
  const pitch = { task: 'Pitch to the bank! Why should YOU get it?', frames: ['I deserve it because ___.', 'I will pay ___ and I will ___.', 'If I get it, I will ___.'], vocab: ['deserve', 'offer', 'take care of', 'special'] };
  return `<div class="black"><div class="black-tag">🕶️ Black Market</div>
    <div class="black-item"><span class="black-emoji">${esc(b.item.emoji)}</span><div><div class="black-name">${esc(b.item.name)}</div>
    <div class="black-facts">Price ${money(b.item.price)} · worth ${money(b.item.value)}</div></div></div>
    ${b.closed ? '<div class="c-note">Pitching time is over. The bank is choosing…</div>' : `<div class="countdown" data-end="${b.endsAt}" data-dur="${S.settings.blackMarketSecs * 1000}"></div>`}
    ${sayItHTML(sayIt.blackPitch || pitch, {}, 'all')}</div>`;
}

function renderSide() {
  const st = S.settings;
  const left = timeLeft(S, Date.now());
  let status = '';
  if (left != null) status += `<div class="timer ${S.timer.pausedAt ? 'paused' : ''}"><span class="label">Time left</span><span id="game-clock" class="clock">${fmtClock(left)}</span></div>`;
  status += `<div class="round">Round <b>${S.round}</b>${S.lastTen ? ' <span class="badge-hot">Rewards ×2</span>' : ''}</div>`;
  if (S.rule) status += `<div class="rule"><span class="label">Rule of the round</span><p>${esc(S.rule.text)}</p></div>`;
  if (S.market) {
    const g = S.groups.find(x => x.id === S.market.group);
    status += `<div class="market-box ${S.market.mult > 1 ? 'boom' : 'crash'}">${S.market.mult > 1 ? '📈 Boom' : '📉 Crash'}: ${S.market.mult > 1 ? '×2' : '½'} ${g ? esc(g.name) : 'all'} · ${S.market.rounds} round${S.market.rounds > 1 ? 's' : ''} left</div>`;
  }
  if (st.surprises.townFund) {
    const pct = Math.min(100, Math.round((S.fund / Math.max(1, st.fundTarget)) * 100));
    status += `<div id="fund" class="fund"><span class="label">Town fund 🏮 ${money(S.fund)} / ${money(st.fundTarget)}</span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }
  if (S.settings.english !== 'off') status += `<div class="english-rule">${S.settings.english === 'fines' ? '🇬🇧 English only — Japanese is fined' : '🇬🇧 Full English turn = bonus'}</div>`;
  patch($('#side-status'), status);

  const rows = S.players.map((p, pid) => {
    const groups = playerProps(S, pid).map(sq => {
      const g = S.groups.find(x => x.id === S.squares[sq].group);
      return `<i class="pdot ${S.props[sq].mortgaged ? 'mort' : ''}" style="--gc:${g ? g.color : '#999'}" title="${esc(S.squares[sq].name)}"></i>`;
    }).join('') + p.specials.map(x => `<i class="pspecial" title="${esc(x.name)}">${esc(x.emoji)}</i>`).join('');
    const active = S.turn && S.turn.pid === pid && S.phase === 'play';
    return `<div class="prow ${active ? 'active' : ''}" data-pid="${pid}">
      ${tokenHTML(p)}<div class="pinfo"><div class="pname">${esc(p.name)} ${p.inJail ? '☕' : ''}</div>
      <div class="pmeta">${levelBadge(p.level)}${p.stars ? `<span class="stars">⭐${p.stars > 1 ? '×' + p.stars : ''}</span>` : ''}${p.debt ? `<span class="debt">debt ${money(p.debt)}</span>` : ''}</div>
      <div class="pprops">${groups}</div></div>
      <div class="pmoney ${p.money < 0 ? 'neg' : ''}" data-money="${pid}">${money(shownMoney[pid] ?? p.money)}</div>
      ${p.mission ? `<button class="peek-btn" data-peek="${pid}" type="button" title="Secret mission" aria-label="Secret mission for ${esc(p.name)}">🔒</button>` : ''}</div>`;
  }).join('');
  patch($('#side-players'), rows);
  S.players.forEach((p, pid) => tweenMoney(pid, p.money));
}

function tweenMoney(pid, target) {
  const from = shownMoney[pid] ?? target;
  shownMoney[pid] = from;
  if (from === target) return;
  const t0 = performance.now();
  const dur = 650;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    const v = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
    shownMoney[pid] = v;
    const el = $(`[data-money="${pid}"]`);
    if (el) { el.textContent = money(v); el.classList.toggle('neg', v < 0); }
    if (k < 1 && shownMoney[pid] !== target) requestAnimationFrame(step);
    else shownMoney[pid] = target;
  };
  requestAnimationFrame(step);
}

function renderConn() {
  const el = $('#conn');
  if (!el) return;
  const ok = connected();
  el.className = 'conn ' + (ok ? 'ok' : 'off');
  el.title = ok ? 'Connected to the teacher window' : 'Teacher window not found';
  el.textContent = ok ? '' : 'Open teacher.html';
}

// ---------- Overlays (trade, ask, peek, hint, end) ----------

function renderOverlays() {
  const root = $('#overlays');
  let html = '';
  if (S.hint && S.hint.id !== ui.hintClosed) html += hintHTML();
  if (S.phase === 'over' && S.results) html += endHTML();
  else if (ui.trade) html += tradeHTML();
  else if (ui.ask) html += askHTML();
  else if (ui.peek) html += peekHTML();
  patch(root, html);
}

function hintHTML() {
  const h = S.hint;
  const who = h.pid != null && S.players[h.pid] ? ` for ${esc(S.players[h.pid].name)}` : '';
  return `<div class="hint-pop" role="status"><div class="hint-tag">💡 Hint${who}</div><h2>${esc(h.title)}</h2>
    ${h.lines.map(l => `<p>${esc(l)}</p>`).join('')}<button class="btn btn-ghost" data-ui="hint-close" type="button">Close</button></div>`;
}

function tradeHTML() {
  const tr = ui.trade;
  const sayIt = S.sayIt || {};
  const cur = S.players[tr.from];
  const side = (key, pid) => {
    const x = tr[key];
    const props = playerProps(S, pid);
    const chips = props.length ? props.map(sq => {
      const q = S.squares[sq];
      const g = S.groups.find(y => y.id === q.group);
      return `<button type="button" class="pchip ${x.props.includes(sq) ? 'on' : ''}" data-tprop="${key}:${sq}" style="--gc:${g ? g.color : '#999'}">${esc(q.emoji || '')} ${esc(q.name)}</button>`;
    }).join('') : '<p class="muted">No properties.</p>';
    const sel = `<select data-tplayer="${key}">${S.players.map((p, i) => `<option value="${i}" ${i === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
    return `<div class="tside"><div class="tside-head">${tokenHTML(S.players[pid])} ${sel} <span class="muted">gives</span></div>
      <div class="pchips">${chips}</div>
      <div class="tmoney"><button type="button" class="btn btn-ghost btn-small" data-tmoney="${key}:-50">−50</button><button type="button" class="btn btn-ghost btn-small" data-tmoney="${key}:-10">−10</button>
      <span class="tmoney-val">${money(x.money)}</span>
      <button type="button" class="btn btn-ghost btn-small" data-tmoney="${key}:10">+10</button><button type="button" class="btn btn-ghost btn-small" data-tmoney="${key}:50">+50</button></div></div>`;
  };
  return `<div class="modal-back"><div class="modal modal-wide trade" role="dialog" aria-label="Trade">
    <h2>🤝 Make a deal</h2>
    <div class="tgrid">${side('give', tr.from)}<div class="tswap">⇄</div>${side('get', tr.to)}</div>
    ${sayIt.trade ? sayItHTML(sayIt.trade, {}, showFor(cur) === 'none' ? 'none' : 'all') : ''}
    <div class="modal-actions"><button class="btn btn-ghost" data-ui="close" type="button">Cancel</button><button class="btn btn-primary btn-big" data-ui="trade-send" type="button">Ask the bank to confirm</button></div>
  </div></div>`;
}

function askHTML() {
  const sayIt = S.sayIt || {};
  const pid = S.turn ? S.turn.pid : 0;
  const p = S.players[pid];
  const topics = [['loan', '💰 Loan'], ['mortgage', '🏠 Mortgage'], ['discount', '🏷️ Discount']];
  const body = ui.ask === 'menu'
    ? `<p class="muted">What do you want to ask the bank, ${esc(p.name)}?</p><div class="ask-grid">${topics.map(([k, l]) => `<button class="btn btn-ghost btn-big" data-ask="${k}" type="button">${l}</button>`).join('')}</div>`
    : `${sayItHTML(sayIt[ui.ask], {}, showFor(p) === 'none' ? 'none' : 'all', { big: true })}`;
  const act = ui.ask === 'menu' ? '' : `<button class="btn btn-primary btn-big" data-ui="ask-send" type="button">Call the bank</button>`;
  return `<div class="modal-back"><div class="modal" role="dialog" aria-label="Ask the bank"><h2>🏦 Ask the bank</h2>${body}
    <div class="modal-actions"><button class="btn btn-ghost" data-ui="close" type="button">Cancel</button>${act}</div></div></div>`;
}

function peekHTML() {
  const p = S.players[ui.peek.pid];
  if (!p) return '';
  const inner = ui.peek.shown
    ? `<div class="mission-card"><div class="label">Secret mission</div><p>${esc(p.mission)}</p></div>
       <div class="modal-actions"><button class="btn btn-primary btn-big" data-ui="close" type="button">Hide it</button></div>`
    : `<div class="big-emoji">🙈</div><p class="peek-warn">Everyone except <b>${esc(p.name)}</b>, look away!</p>
       <div class="modal-actions"><button class="btn btn-ghost" data-ui="close" type="button">Cancel</button><button class="btn btn-primary btn-big" data-ui="peek-show" type="button">Show my mission</button></div>`;
  return `<div class="modal-back peek"><div class="modal" role="dialog" aria-label="Secret mission">${tokenHTML(p, 'token-lg')}<h2>${esc(p.name)}</h2>${inner}</div></div>`;
}

function endHTML() {
  const r = S.results;
  const st = S.settings;
  const rows = r.ranking.map((x, i) => {
    const p = S.players[x.pid];
    return `<tr class="${i === 0 ? 'win' : ''}"><td class="rank">${i === 0 ? '🏆' : i + 1}</td><td>${tokenHTML(p)} ${esc(p.name)}</td>
      <td class="num">${money(x.money)}</td><td class="num">${money(x.props + x.specials)}</td><td class="num">${x.debt ? money(-x.debt) : '—'}</td>
      <td class="num">${x.missionBonus || x.guessBonus ? '+' + money(x.missionBonus + x.guessBonus) : '—'}</td><td class="num total">${money(x.total)}</td></tr>`;
  }).join('');
  const missions = S.players.filter(p => p.mission).map(p => `<li>${tokenHTML(p)} <b>${esc(p.name)}</b>: ${esc(p.mission)} ${p.missionDone ? `<span class="ok">✔ +${money(st.missionBonus)}</span>` : '<span class="muted">✘</span>'}${p.guessed ? ` <span class="ok">· guessed a mission +${money(st.guessBonus)}</span>` : ''}</li>`).join('');
  const stars = r.topStars.length ? `<p class="end-stars">⭐ Most gold stars: <b>${r.topStars.map(i => esc(S.players[i].name)).join(', ')}</b> (${S.players[r.topStars[0]].stars})</p>` : '';
  const w = S.players[r.ranking[0].pid];
  return `<div class="modal-back end"><div class="modal modal-wide" role="dialog" aria-label="Results">
    <div class="end-head">${tokenHTML(w, 'token-xl')}<div><div class="label">The winner is</div><h2>${esc(w.name)}!</h2></div></div>
    <table class="results"><thead><tr><th></th><th>Player</th><th class="num">Money</th><th class="num">Property</th><th class="num">Debt</th><th class="num">Missions</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table>
    ${stars}${missions ? `<h3>Secret missions</h3><ul class="missions">${missions}</ul>` : ''}</div></div>`;
}

// ---------- Small effects ----------

function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3500);
}

const bannerQ = [];
let bannerBusy = false;
function banner(title, text, style = '', ms = 3200) {
  bannerQ.push({ title, text, style, ms });
  if (!bannerBusy) nextBanner();
}
async function nextBanner() {
  const b = bannerQ.shift();
  if (!b) { bannerBusy = false; return; }
  bannerBusy = true;
  const el = document.createElement('div');
  el.className = `announce a-${b.style}`;
  el.innerHTML = `<h2>${esc(b.title)}</h2>${b.text ? `<p>${esc(b.text)}</p>` : ''}`;
  $('#banners').append(el);
  await wait(bannerQ.length > 2 ? Math.min(b.ms, 1400) : b.ms);
  el.classList.add('out');
  await wait(300);
  el.remove();
  nextBanner();
}

function stamp(text, kind) {
  const c = $('#center');
  if (!c) return;
  const el = document.createElement('div');
  el.className = 'stamp ' + kind;
  el.textContent = text;
  c.append(el);
  setTimeout(() => el.remove(), 1300);
}

function floatMoney(pid, delta) {
  const row = $(`.prow[data-pid="${pid}"]`);
  if (!row) return;
  const el = document.createElement('div');
  el.className = 'float-money ' + (delta > 0 ? 'up' : 'down');
  el.textContent = (delta > 0 ? '+' : '−') + '$' + Math.abs(delta);
  row.append(el);
  setTimeout(() => el.remove(), 1400);
}

function playerFlash(pid, text, kind) {
  const row = $(`.prow[data-pid="${pid}"]`);
  if (row) { row.classList.remove('flash-good', 'flash-bad'); void row.offsetWidth; row.classList.add('flash-' + kind); }
  if (S.players[pid]) banner(text, S.players[pid].name, kind === 'good' ? 'cheer' : 'fine', 1800);
}

function starBurst(pid) {
  const p = S.players[pid];
  if (!p) return;
  const el = document.createElement('div');
  el.className = 'star-burst';
  el.innerHTML = `<div class="star-big">⭐</div><div class="star-name">Gold star for ${esc(p.name)}!</div>`;
  document.body.append(el);
  setTimeout(() => el.remove(), 2300);
}

function confetti() {
  if (reduced) return;
  const cv = $('#confetti');
  const ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  cv.hidden = false;
  const colors = ['#E8483B', '#1F2F5C', '#9DB4E0', '#E39B2B', '#2E9E7A', '#D65DA0'];
  const bits = Array.from({ length: 220 }, () => ({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.6,
    vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 8 + Math.random() * 8, h: 5 + Math.random() * 6, c: colors[Math.floor(Math.random() * colors.length)]
  }));
  const t0 = performance.now();
  const frame = now => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const b of bits) {
      b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
    }
    if (now - t0 < 6000) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, cv.width, cv.height); cv.hidden = true; }
  };
  requestAnimationFrame(frame);
}

// Countdowns (game clock, turn timer, auction, Black Market) update 4 times a second.
function tickTimers() {
  if (!S || !S.squares || !S.squares.length) return;
  const now = Date.now();
  const left = timeLeft(S, now);
  const clock = $('#game-clock');
  if (clock && left != null) {
    clock.textContent = fmtClock(left);
    clock.classList.toggle('low', left <= 600000);
  }
  for (const el of $$('.countdown')) {
    const ms = Math.max(0, Number(el.dataset.end) - now);
    const dur = Number(el.dataset.dur) || 30000;
    el.style.setProperty('--k', Math.min(1, ms / dur));
    el.textContent = Math.ceil(ms / 1000);
    el.classList.toggle('low', ms < 6000);
  }
  for (const el of $$('.turn-timer')) {
    const ms = Math.max(0, Number(el.dataset.end) - now);
    el.textContent = ms ? fmtClock(ms) : 'Time!';
    el.classList.toggle('low', ms < 10000);
  }
}
setInterval(() => { tickTimers(); renderConn(); }, 250);

// ---------- Input ----------

function openTrade() {
  if (!S || S.phase !== 'play') return;
  const from = S.turn.pid;
  ui.trade = { from, to: (from + 1) % S.players.length, give: { money: 0, props: [] }, get: { money: 0, props: [] } };
  render();
}

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !S) return;
  if (b.dataset.opt) {
    const id = b.dataset.opt;
    if (id === 'trade') openTrade();
    else if (id === 'ask') { ui.ask = 'menu'; render(); }
    else send({ type: id });
    return;
  }
  if (b.dataset.peek != null) { ui.peek = { pid: Number(b.dataset.peek), shown: false }; render(); return; }
  if (b.dataset.ask) { ui.ask = b.dataset.ask; render(); return; }
  if (b.dataset.tprop) {
    const [key, sq] = b.dataset.tprop.split(':');
    const list = ui.trade[key].props;
    const i = list.indexOf(Number(sq));
    if (i >= 0) list.splice(i, 1); else list.push(Number(sq));
    render(); return;
  }
  if (b.dataset.tmoney) {
    const [key, d] = b.dataset.tmoney.split(':');
    ui.trade[key].money = Math.max(0, ui.trade[key].money + Number(d));
    render(); return;
  }
  switch (b.dataset.ui) {
    case 'frames': ui.framesOpen = true; render(); break;
    case 'close': ui.trade = null; ui.ask = null; ui.peek = null; render(); break;
    case 'hint-close': ui.hintClosed = S.hint ? S.hint.id : 0; render(); break;
    case 'peek-show': ui.peek.shown = true; render(); break;
    case 'trade-send': {
      const tr = ui.trade;
      send({ type: 'trade', trade: { from: tr.from, to: tr.to, give: tr.give, get: tr.get } });
      ui.trade = null; render(); break;
    }
    case 'ask-send': send({ type: 'ask', topic: ui.ask }); ui.ask = null; toast('The bank is listening…'); render(); break;
  }
});

document.addEventListener('change', e => {
  const sel = e.target.closest('[data-tplayer]');
  if (!sel || !ui.trade) return;
  const key = sel.dataset.tplayer;
  const pid = Number(sel.value);
  const other = key === 'give' ? 'to' : 'from';
  ui.trade[key === 'give' ? 'from' : 'to'] = pid;
  if (ui.trade[other] === pid) ui.trade[other] = (pid + 1) % S.players.length;
  ui.trade.give.props = []; ui.trade.get.props = [];
  render();
});

document.addEventListener('keydown', e => {
  if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === '?') { help.toggle(); return; }
  if (k === 'Escape') {
    if (help.open) help.close();
    ui.trade = null; ui.ask = null; ui.peek = null;
    if (S && S.hint) ui.hintClosed = S.hint.id;
    if (S) render();
    return;
  }
  if (k === 'f' || k === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); return; }
  if (!S || S.phase !== 'play' || ui.trade || ui.ask || ui.peek) return;
  const opts = options(S);
  if (k === ' ') {
    e.preventDefault();
    if (opts.some(o => o.id === 'roll')) send({ type: 'roll' });
  } else if (k === 'Enter') {
    const o = opts.find(x => x.primary && !x.disabled && !['trade', 'ask'].includes(x.id));
    if (o) { e.preventDefault(); send({ type: o.id }); }
  } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
    e.preventDefault();
    send({ type: 'nudge', d: k === 'ArrowLeft' ? -1 : 1 });
  } else if (k === 't' || k === 'T') openTrade();
  else if (k === 'b' || k === 'B') { ui.ask = 'menu'; render(); }
  else if ((k === 'm' || k === 'M') && S.turn && S.players[S.turn.pid].mission) { ui.peek = { pid: S.turn.pid, shown: false }; render(); }
});

addEventListener('resize', () => { if (S && S.squares.length) drawBoard(); });

// ---------- Start ----------

const saved = loadState();
if (saved && saved.squares) setState(saved); else render();
channel.send({ t: 'hello' });
// Keep saying hello until the teacher answers (the teacher window may open later).
setInterval(() => channel.send({ t: connected() ? 'ping' : 'hello' }), 2000);
if (!channel.ok) toast('This browser cannot connect the two windows. Use Chrome, Edge or Firefox.', 'bad');
