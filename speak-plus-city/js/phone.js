// Phone page (phone mode). A student's private controller: their money,
// properties, mission and turn buttons. It only shows the view the teacher
// window sends (js/views.js) and sends button presses back through the game
// server. It never sees the other players' money, properties or missions.
//
// For testing several phones in one browser, add &p=1, &p=2… to the address:
// windows of one browser share their storage, and `p` keeps them apart.

import { $, $$, esc, sayItHTML, levelBadge, fmtClock } from './ui.js';
import { money, fill, LEVEL_NAMES } from './state.js';

const params = new URLSearchParams(location.search);
const slot = params.get('p') || '';
const store = {
  get: k => { try { return localStorage.getItem(`spc-${k}${slot}`); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(`spc-${k}${slot}`, v); } catch { /* private mode */ } },
  del: k => { try { localStorage.removeItem(`spc-${k}${slot}`); } catch { /* ignore */ } }
};

let ws = null;
let joined = null;          // { room, name, token }
let V = null;               // latest view from the teacher
let viewAt = 0;             // when it arrived (countdowns run from here)
let hostOn = true;
let tab = 'play';
let retry = 0;
let framesOpen = '';        // key of the "Say it!" box whose frames are open
let missionShown = false;
let hintClosed = 0;
let lastMoney = null;
let wasMyTurn = false;
let deal = freshDeal();

function freshDeal() { return { to: null, give: { money: 0, props: [] }, get: { money: 0, props: [] } }; }

// ---------- Connection ----------

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    $('#offline').hidden = true;
    const room = store.get('room'), name = store.get('name');
    if (room && name) send({ t: 'join', room, name, token: store.get('token') });
  };
  ws.onmessage = e => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'joined') {
      joined = m;
      store.set('room', m.room); store.set('name', m.name); store.set('token', m.token);
      show(V ? 'game' : 'wait');
      renderWait();
    } else if (m.t === 'error') {
      if (!joined) { $('#j-error').textContent = m.text; $('#j-error').hidden = false; show('join'); store.del('room'); }
      else toast(m.text, 'bad');
    } else if (m.t === 'host') {
      hostOn = m.on;
      $('#offline').hidden = hostOn;
      $('#offline').textContent = 'Waiting for the teacher\'s computer…';
    } else if (m.t === 'view') {
      V = m.view;
      viewAt = Date.now();
      render();
    } else if (m.t === 'kicked') {
      store.del('room'); store.del('token');
      joined = null; V = null;
      show('join');
      toast('The teacher removed this phone from the game.', 'bad');
    }
  };
  ws.onclose = () => {
    ws = null;
    if (joined || store.get('room')) { $('#offline').hidden = false; $('#offline').textContent = 'Connecting…'; }
    setTimeout(connect, Math.min(8000, 800 * 2 ** retry++));
  };
}
const send = msg => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const act = action => send({ t: 'act', action });

function show(name) {
  for (const s of ['join', 'wait', 'game']) $(`#s-${s}`).hidden = s !== name;
}

// ---------- Render ----------

function render() {
  if (!V) return;
  if (V.kind === 'lobby') { show('wait'); renderWait(); return; }
  show('game');
  renderHead();
  for (const t of ['play', 'city', 'deal', 'bank']) $(`#tab-${t}`).hidden = t !== tab;
  $$('#ph-nav [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  // A badge on Play when something needs this player there and they are on another tab.
  $('#ph-nav [data-tab="play"]').classList.toggle('alert', tab !== 'play' && (V.myTurn || (V.pending && V.pending.mine) || (V.trade && V.trade.status === 'offered' && !V.trade.iProposed)));
  if (tab === 'play') renderPlay();
  else if (tab === 'city') renderCity();
  else if (tab === 'deal') renderDeal();
  else renderBank();
  if (V.myTurn && !wasMyTurn && navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate([120, 80, 120]);
  wasMyTurn = V.myTurn;
  if (lastMoney != null && V.me.money !== lastMoney) floatMoney(V.me.money - lastMoney);
  lastMoney = V.me.money;
  tickTimers();
}

function renderWait() {
  const name = (V && V.name) || (joined && joined.name) || '';
  let body;
  if (V && V.kind === 'lobby' && V.phase !== 'setup' && V.players) {
    const free = V.players.filter(p => p.free);
    body = `<h1>Hi, ${esc(name)}!</h1><p>The game has started. Which player are you?</p>
      <div class="seat-list">${free.length ? free.map(p => `<button class="seat" data-seat="${p.pid}" type="button"><span class="token" style="--tc:${p.color}">${p.icon}</span>${esc(p.name)}</button>`).join('')
        : '<p class="muted">Every player already has a phone. Ask the teacher.</p>'}</div>`;
  } else {
    const you = V && V.you;
    body = `${you ? `<span class="token token-xl" style="--tc:${you.color}">${you.icon}</span>` : '<div class="big-emoji">📱</div>'}
      <h1>You're in, ${esc(you ? you.name : name)}!</h1><p>Look at the big screen. The game starts soon.</p>`;
  }
  $('#wait-body').innerHTML = body;
}

function renderHead() {
  const m = V.me;
  const clock = V.clock ? `<span class="ph-clock" data-left="${V.clock.left}" data-paused="${V.clock.paused ? 1 : ''}"></span>` : '';
  $('#ph-head').innerHTML = `<span class="token" style="--tc:${m.color}">${m.icon}</span>
    <div class="ph-who"><b>${esc(m.name)}</b><div>${levelBadge(m.level)}${m.stars ? ` <span class="stars">⭐${m.stars}</span>` : ''}</div></div>
    <div class="ph-money"><span class="${m.money < 0 ? 'neg' : ''}">${money(m.money)}</span>${m.debt ? `<small class="debt">debt ${money(m.debt)}</small>` : ''}<small>Round ${V.round} ${clock}</small></div>`;
}

const vars = extra => ({ player: V.me.name, ...extra });

function sayBox(key, v, opts = {}) {
  const entry = V.sayIt && V.sayIt[key];
  if (!entry) return '';
  const fk = `${key}:${JSON.stringify(v)}`;
  return sayItHTML(entry, v, V.show, { framesOpen: framesOpen === fk, ...opts }).replace('data-ui="frames"', `data-frames="${esc(fk)}"`);
}

function squareHTML(q) {
  if (!q) return '';
  return `<div class="ph-square" style="--gc:${q.color || 'var(--sky)'}"><div class="ph-sq-band">${esc(q.group || typeLabel(q.type))}</div>
    <div class="ph-sq-body"><div class="ph-sq-title">${esc(q.emoji)} ${esc(q.name)}</div>
    ${q.type === 'property' ? `<div class="muted">${q.mine ? 'Yours' : q.sold ? 'Sold' : `For sale: ${money(q.price)}`}</div>` : ''}
    ${q.vocab.length && V.show !== 'none' ? `<div class="chips">${q.vocab.map(w => `<span class="chip">${esc(w)}</span>`).join('')}</div>` : ''}
    ${q.topic ? `<p class="topic"><b>Talk about it:</b> ${esc(q.topic)}</p>` : ''}</div></div>`;
}
const typeLabel = t => ({ start: 'Start', chance: 'Chance', mystery: 'Mystery', bank: 'Bank', blackmarket: 'Black Market', jail: 'Coffee Break', festival: 'Town Festival', gotojail: 'Go to Coffee Break' }[t] || '');

function renderPlay() {
  let html = '';
  if (V.phase === 'over' && V.results) { $('#tab-play').innerHTML = resultsHTML(); return; }
  if (V.phase === 'ending') html += `<div class="card center"><div class="big-emoji">🏁</div><h2>Time's up!</h2><p>The bank is counting the money…</p></div>`;
  if (V.hint && V.hint.id !== hintClosed) {
    html += `<div class="card hint"><div class="label">💡 Hint</div><h3>${esc(V.hint.title)}</h3>${V.hint.lines.map(l => `<p>${esc(l)}</p>`).join('')}
      <button class="btn btn-ghost btn-small" data-ui="hint-close" type="button">OK</button></div>`;
  }
  html += pendingHTML();
  html += tradeOfferHTML();
  if (V.auction) {
    const a = V.auction;
    html += `<div class="card auction"><div class="label">🔨 Auction</div><h3>${esc(a.emoji)} ${esc(a.name)}</h3>
      <p>List price ${money(a.price)} · <span class="countdown-s" data-left="${a.left}"></span></p>
      <p class="big">${a.high ? `${money(a.high.amount)} <small>${a.high.me ? '(you!)' : esc(a.high.name)}</small>` : 'No bids yet'}</p>
      ${sayBox('bid', vars({ name: a.name }))}<p class="muted small">Shout your bid! The teacher enters it.</p></div>`;
  }
  if (V.black) {
    const b = V.black;
    html += `<div class="card black"><div class="label">🕶️ Black Market</div><h3>${esc(b.item.emoji)} ${esc(b.item.name)}</h3>
      <p>Price ${money(b.item.price)} · worth ${money(b.item.value)}</p><p>${b.closed ? 'Pitching is over. The bank is choosing…' : `Pitch to the bank! <span class="countdown-s" data-left="${b.left}"></span>`}</p></div>`;
  }
  if (V.phase === 'play') html += turnHTML();
  if (V.rule) html += `<div class="card rule"><div class="label">Rule of the round</div><p>${esc(V.rule)}</p></div>`;
  if (V.market) html += `<div class="card market">${V.market.mult > 1 ? '📈 Boom' : '📉 Crash'}: prices and rents ${V.market.mult > 1 ? '×2' : '½'} ${V.market.group ? 'in ' + esc(V.market.group) : 'everywhere'} · ${V.market.rounds} round${V.market.rounds > 1 ? 's' : ''} left</div>`;
  $('#tab-play').innerHTML = html;
}

function turnHTML() {
  const t = V.turn;
  if (!t) return '';
  if (!V.myTurn) {
    return `<div class="card turn-other"><div class="label">Now playing</div><h2>${esc(t.name)}</h2>
      ${t.square && t.step !== 'roll' ? `<p>on ${esc(t.square.emoji)} <b>${esc(t.square.name)}</b></p>` : t.step === 'jail' ? '<p>on a Coffee Break ☕</p>' : '<p>about to roll the dice</p>'}
      ${V.rentRule === 'ask' ? '<p class="muted small">Is it one of your properties? Ask for the rent before the next roll! (My city tab)</p>' : ''}</div>`;
  }
  if (V.pending) return '';
  const opts = V.options;
  const primary = opts.find(o => o.primary && o.say && !o.disabled) || opts.find(o => o.say && !o.disabled && !['trade', 'end'].includes(o.id));
  let main = '';
  if (t.step === 'roll') main = '<p class="lead">Roll the dice!</p>';
  else if (t.step === 'jail') main = '<p class="lead">☕ You are on a Coffee Break.</p>';
  else main = squareHTML(t.square);
  const sq = t.square || {};
  const say = primary ? sayBox(primary.say, vars({ name: sq.name, price: sq.price != null ? '$' + sq.price : undefined })) : '';
  const buttons = opts.filter(o => !['trade', 'ask'].includes(o.id)).map(o =>
    `<button class="btn ${o.primary ? 'btn-primary' : 'btn-ghost'} btn-big opt" data-opt="${o.id}" type="button" ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</button>`).join('');
  const dice = t.dice && t.step === 'land' ? `<span class="dice-s">🎲 ${t.dice[0]} + ${t.dice[1]}</span>` : '';
  return `<div class="card turn-mine"><div class="label">Your turn! ${dice}</div>${main}${say}<div class="opts">${buttons}</div>
    ${opts.find(o => o.id === 'end' && o.disabled) ? `<p class="muted small">${esc(opts.find(o => o.id === 'end').why || '')}</p>` : ''}</div>`;
}

function pendingHTML() {
  const pe = V.pending;
  if (!pe) return '';
  if (!pe.mine) return `<div class="card wait"><span class="dot-pulse"></span> ${esc(pe.name)} is talking to the bank…</div>`;
  let body = '';
  let key = { buy: 'buy', rent: pe.role === 'owner' ? 'claimRent' : 'rent', mystery: 'mystery', bank: 'bank_' + pe.bank, jail: 'jail', festival: 'festival' }[pe.kind];
  const v = vars({ name: pe.square ? pe.square.name : '', amount: pe.amount != null ? '$' + pe.amount : undefined, challenge: pe.challenge, player: pe.role === 'owner' ? pe.other : V.me.name, owner: pe.role === 'owner' ? V.me.name : pe.other });
  if (pe.card) {
    const c = pe.card;
    body += `<div class="gcard ${pe.kind}"><div class="label">${pe.kind === 'card' ? '❓ Chance' : '🎁 Mystery'} · ${esc(LEVEL_NAMES[V.me.level])}</div>
      <p class="gc-text">${esc(c.text)}</p>${c.picture ? `<div class="gc-pic">${esc(c.picture)}</div>` : ''}
      ${c.word ? `<div class="gc-word">${esc(c.word)}</div>${c.taboo && c.taboo.length ? `<div class="gc-taboo">Don't say: ${c.taboo.map(w => `<s>${esc(w)}</s>`).join(' ')}</div>` : ''}` : ''}
      ${c.reward ? `<div class="gc-reward ${c.reward < 0 ? 'neg' : ''}">${c.reward > 0 ? '+' : ''}${money(c.reward)}</div>` : ''}</div>`;
    if (pe.kind === 'card') key = null;
  }
  if (pe.kind === 'rent') body += `<p class="lead">${pe.role === 'owner' ? `You asked <b>${esc(pe.other)}</b> for ${money(pe.amount)} rent.` : `<b>${esc(pe.other)}</b> asks you for ${money(pe.amount)} rent.`}</p>`;
  if (pe.kind === 'buy' && pe.square) body += squareHTML(pe.square);
  return `<div class="card pending"><div class="label">Say it to the bank! ${pe.tries ? `<span class="tries">Try ${pe.tries + 1}</span>` : ''}</div>
    ${body}${key ? sayBox(key, v, { big: true }) : ''}<p class="waiting"><span class="dot-pulse"></span> The teacher is listening…</p></div>`;
}

function tradeOfferHTML() {
  const tr = V.trade;
  if (!tr) return '';
  const side = x => [...x.props.map(p => `${esc(p.emoji)} ${esc(p.name)}`), x.money ? money(x.money) : ''].filter(Boolean).join(' + ') || 'nothing';
  if (tr.iProposed) {
    return `<div class="card deal"><div class="label">🤝 Your deal with ${esc(tr.other)}</div><p>You give: <b>${side(tr.give)}</b><br>You get: <b>${side(tr.get)}</b></p>
      <p class="muted small">${tr.status === 'offered' ? `Waiting for ${esc(tr.other)}'s answer…` : 'Accepted! Waiting for the bank.'}</p></div>`;
  }
  // The other way round: what they give is what I get.
  const offered = tr.status === 'offered';
  return `<div class="card deal ${offered ? 'attention' : ''}"><div class="label">🤝 ${esc(tr.other)} offers you a deal</div>
    <p>You get: <b>${side(tr.give)}</b><br>You give: <b>${side(tr.get)}</b></p>
    ${offered ? `${sayBox('trade', vars({}))}<div class="opts"><button class="btn btn-primary btn-big" data-answer="yes" type="button">It's a deal!</button><button class="btn btn-ghost btn-big" data-answer="no" type="button">No, thanks</button></div>`
      : '<p class="muted small">Accepted! Waiting for the bank.</p>'}</div>`;
}

function renderCity() {
  const props = V.props.map(p => `<div class="prop" style="--gc:${p.color}"><div class="prop-band"></div>
    <div class="prop-body"><b>${esc(p.emoji)} ${esc(p.name)}</b><span class="muted small">${esc(p.group)}${p.mortgaged ? ' · mortgaged' : ''}</span>
    <span>Rent <b>${money(p.rent)}</b>${p.full ? ' <span class="badge-full">full set ×2</span>' : ''}</span></div>
    ${V.rentRule === 'ask' && !p.mortgaged ? `<button class="btn btn-ghost btn-small" data-claim="${p.sq}" type="button">Ask for rent</button>` : ''}</div>`).join('');
  const specials = V.me.specials.map(x => `<div class="prop special"><div class="prop-body"><b>${esc(x.emoji)} ${esc(x.name)}</b><span class="muted small">Black Market · worth ${money(x.value)}</span></div></div>`).join('');
  const mission = V.me.mission ? `<div class="card mission"><div class="label">🔒 Secret mission</div>
    ${missionShown ? `<p class="mission-text">${esc(V.me.mission)}</p><button class="btn btn-ghost btn-small" data-ui="mission" type="button">Hide</button>`
      : `<p class="muted">Only you can see it. Make sure nobody is looking!</p><button class="btn btn-primary btn-small" data-ui="mission" type="button">Show my mission</button>`}</div>` : '';
  $('#tab-city').innerHTML = `${mission}<h2 class="tab-title">My properties</h2>
    ${props || '<p class="muted">No properties yet. Buy one when you land on it!</p>'}${specials}
    ${V.rentRule === 'ask' && V.props.length ? '<p class="hint">Someone landed on your property? Ask them for the rent out loud, then press <b>Ask for rent</b> — before the next player rolls!</p>' : ''}`;
}

function renderDeal() {
  if (V.phase !== 'play') { $('#tab-deal').innerHTML = '<p class="muted">No deals now.</p>'; return; }
  const others = V.players.filter(p => p.pid !== V.me.pid);
  if (deal.to == null || !others.some(p => p.pid === deal.to)) deal.to = others[0] ? others[0].pid : null;
  const chk = (key, list) => list.length ? list.map(p => `<label class="chk-row" style="--gc:${p.color}"><input type="checkbox" data-deal="${key}" value="${p.sq}" ${deal[key].props.includes(p.sq) ? 'checked' : ''}> ${esc(p.emoji)} ${esc(p.name)}</label>`).join('') : '<p class="muted small">None</p>';
  const stepper = key => `<div class="stepper"><button class="btn btn-ghost btn-small" data-money="${key}:-50" type="button">−50</button><button class="btn btn-ghost btn-small" data-money="${key}:-10" type="button">−10</button>
    <b>${money(deal[key].money)}</b><button class="btn btn-ghost btn-small" data-money="${key}:10" type="button">+10</button><button class="btn btn-ghost btn-small" data-money="${key}:50" type="button">+50</button></div>`;
  $('#tab-deal').innerHTML = `<h2 class="tab-title">Make a deal</h2>
    <label class="field">With <select id="deal-to">${others.map(p => `<option value="${p.pid}" ${p.pid === deal.to ? 'selected' : ''}>${p.icon} ${esc(p.name)}</option>`).join('')}</select></label>
    <div class="card"><div class="label">I give</div>${chk('give', V.props)}${stepper('give')}</div>
    <div class="card"><div class="label">I want</div><p class="muted small">Properties other players have bought. You don't know who owns what: ask!</p>${chk('get', V.sold)}${stepper('get')}</div>
    ${sayBox('trade', vars({}))}
    <button class="btn btn-primary btn-big wide" data-ui="deal-send" type="button" ${V.trade ? 'disabled' : ''}>Send the offer</button>
    ${V.trade ? '<p class="muted small">A deal is already waiting (Play tab).</p>' : ''}`;
}

function renderBank() {
  const topics = [['loan', '💰 Ask for a loan'], ['mortgage', '🏠 Mortgage a property'], ['discount', '🏷️ Ask for a discount']];
  $('#tab-bank').innerHTML = `<h2 class="tab-title">Talk to the bank</h2><p class="muted">Choose, practise the sentence, then call the bank and say it.</p>
    ${topics.map(([k, l]) => `<button class="btn btn-ghost btn-big wide" data-bank="${k}" type="button">${l}</button>`).join('')}`;
}

function resultsHTML() {
  const r = V.results;
  return `<div class="card center"><div class="big-emoji">🏆</div><h2>${esc(r.ranking[0].name)} wins!</h2></div>
    <ol class="ranking">${r.ranking.map(x => `<li class="${x.me ? 'me' : ''}">${x.icon} ${esc(x.name)} <b>${money(x.total)}</b></li>`).join('')}</ol>
    ${V.me.mission ? `<div class="card"><div class="label">Your mission</div><p>${esc(V.me.mission)} ${r.missionDone ? '✔' : '✘'}</p></div>` : ''}
    ${r.topStars.length ? `<p>⭐ Most gold stars: <b>${r.topStars.map(esc).join(', ')}</b></p>` : ''}`;
}

// ---------- Sheets (a "Say it!" panel before sending) ----------

function openSheet(html) { $('#sheet').innerHTML = `<div class="sheet">${html}</div>`; $('#sheet').hidden = false; }
function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; }

function claimSheet(sq) {
  const p = V.props.find(x => x.sq === sq);
  if (!p) return;
  openSheet(`<h2>Ask for rent</h2><p>${esc(p.emoji)} <b>${esc(p.name)}</b> · rent ${money(p.rent)}</p>
    ${sayBox('claimRent', { name: p.name, amount: '$' + p.rent })}
    <p class="muted small">Say it to the player, then tell the bank. If nobody is on your property, nothing happens.</p>
    <div class="opts"><button class="btn btn-primary btn-big" data-claim-send="${sq}" type="button">I asked! Tell the bank</button><button class="btn btn-ghost btn-big" data-ui="sheet-close" type="button">Cancel</button></div>`);
}

function bankSheet(topic) {
  openSheet(`<h2>🏦 ${{ loan: 'Loan', mortgage: 'Mortgage', discount: 'Discount' }[topic]}</h2>${sayBox(topic, vars({}), { big: true })}
    <div class="opts"><button class="btn btn-primary btn-big" data-bank-send="${topic}" type="button">Call the bank</button><button class="btn btn-ghost btn-big" data-ui="sheet-close" type="button">Cancel</button></div>`);
}

// ---------- Small effects ----------

function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3500);
}

function floatMoney(delta) {
  const el = document.createElement('div');
  el.className = 'float-money ' + (delta > 0 ? 'up' : 'down');
  el.textContent = (delta > 0 ? '+' : '−') + '$' + Math.abs(delta);
  $('#ph-head').append(el);
  setTimeout(() => el.remove(), 1500);
}

function tickTimers() {
  const gone = Date.now() - viewAt;
  for (const el of $$('[data-left]')) {
    if (el.classList.contains('ptoken')) continue;
    const ms = el.dataset.paused ? Number(el.dataset.left) : Math.max(0, Number(el.dataset.left) - gone);
    el.textContent = el.classList.contains('ph-clock') ? `· ${fmtClock(ms)}${el.dataset.paused ? ' ⏸' : ''}` : `${Math.ceil(ms / 1000)} s`;
  }
}
setInterval(tickTimers, 500);

// ---------- Input ----------

document.addEventListener('click', e => {
  const b = e.target.closest('button, [data-ui]');
  if (!b) return;
  if (b.dataset.tab) { tab = b.dataset.tab; render(); window.scrollTo(0, 0); return; }
  if (b.dataset.opt) { act({ type: b.dataset.opt }); return; }
  if (b.dataset.seat) { act({ type: 'seat', pid: Number(b.dataset.seat) }); return; }
  if (b.dataset.frames) { framesOpen = b.dataset.frames; render(); if (!$('#sheet').hidden) refreshSheet(); return; }
  if (b.dataset.answer) { act({ type: 'tradeAnswer', yes: b.dataset.answer === 'yes' }); return; }
  if (b.dataset.claim) { claimSheet(Number(b.dataset.claim)); return; }
  if (b.dataset.claimSend) { act({ type: 'claimRent', sq: Number(b.dataset.claimSend) }); closeSheet(); tab = 'play'; render(); return; }
  if (b.dataset.bank) { bankSheet(b.dataset.bank); return; }
  if (b.dataset.bankSend) { act({ type: 'ask', topic: b.dataset.bankSend }); closeSheet(); toast('The bank is listening. Say it to the teacher!'); return; }
  if (b.dataset.money) {
    const [key, d] = b.dataset.money.split(':');
    deal[key].money = Math.max(0, deal[key].money + Number(d));
    if (key === 'give') deal.give.money = Math.min(deal.give.money, Math.max(0, V.me.money));
    render(); return;
  }
  switch (b.dataset.ui) {
    case 'hint-close': hintClosed = V.hint ? V.hint.id : 0; render(); break;
    case 'mission': missionShown = !missionShown; render(); break;
    case 'sheet-close': closeSheet(); break;
    case 'deal-send': {
      if (!deal.give.props.length && !deal.get.props.length && !deal.give.money && !deal.get.money) { toast('Choose what you give or want first.', 'bad'); return; }
      act({ type: 'trade', trade: { to: deal.to, give: deal.give, get: deal.get } });
      deal = freshDeal();
      tab = 'play';
      render();
      break;
    }
  }
});

// Re-draw the open sheet (after "Show sentence frames").
function refreshSheet() {
  const btn = $('#sheet [data-claim-send]') || $('#sheet [data-bank-send]');
  if (!btn) return;
  if (btn.dataset.claimSend) claimSheet(Number(btn.dataset.claimSend)); else bankSheet(btn.dataset.bankSend);
}
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'deal-to') { deal.to = Number(el.value); render(); }
  else if (el.dataset.deal) {
    const list = deal[el.dataset.deal].props;
    const sq = Number(el.value);
    if (el.checked) list.push(sq); else list.splice(list.indexOf(sq), 1);
  }
});

$('#join-form').addEventListener('submit', e => {
  e.preventDefault();
  const room = $('#j-room').value.trim().toUpperCase();
  const name = $('#j-name').value.trim();
  if (!room || !name) return;
  $('#j-error').hidden = true;
  // A different room or name is a different player: start with a new identity.
  if (room !== store.get('room') || name !== store.get('name')) store.del('token');
  store.set('room', room); store.set('name', name);
  send({ t: 'join', room, name, token: store.get('token') });
});

// ---------- Start ----------

$('#j-room').value = (params.get('room') || store.get('room') || '').toUpperCase();
$('#j-name').value = store.get('name') || '';
if (store.get('room') && store.get('name') && (!params.get('room') || params.get('room').toUpperCase() === store.get('room'))) {
  $('#offline').hidden = false;      // rejoining automatically
} else store.del('room');
show('join');
connect();
