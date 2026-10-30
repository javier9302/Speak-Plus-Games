// What each phone may see (phone mode). Pure functions, no DOM: the teacher
// window computes a view for every connected phone after each change, and the
// server only passes it on.
//
// A view holds the player's OWN money, properties and mission. About the other
// players it holds only what everyone can see at the table: names, tokens and
// where they stand. Never their money, properties or missions, and never who
// owns a property, so nobody's phone can tell them when rent is due.

import { options, ownerOf, isMortgaged, rentOf, priceOf, playerProps, ownsGroup, timeLeft, TOKENS } from './state.js';

const tok = p => TOKENS[p.token % TOKENS.length];

function squareInfo(s, sq, pid) {
  const q = s.squares[sq];
  const g = s.groups.find(x => x.id === q.group);
  const owner = ownerOf(s, sq);
  return {
    sq, name: q.name, emoji: q.emoji || '', type: q.type, group: g ? g.name : '', color: g ? g.color : '',
    price: q.type === 'property' ? priceOf(s, sq) : null,
    vocab: q.vocab || [], topic: q.topic || '',
    sold: owner != null, mine: owner === pid
  };
}

// Times are sent as "ms left" (phone clocks don't agree with the laptop's); the phone counts down from when it got the view.
function clock(s, now) {
  const t = s.timer;
  if (!t || !t.dur) return null;
  return { paused: !!t.pausedAt, left: timeLeft(s, t.pausedAt || now) };
}

export function phoneView(s, pid, now = Date.now()) {
  const p = s.players[pid];
  const t = s.turn;
  const myTurn = s.phase === 'play' && !!t && t.pid === pid;
  const pe = s.pending;
  const view = {
    kind: 'game', phase: s.phase, round: s.round, rentRule: s.settings.rentRule, lastTen: !!s.lastTen,
    show: s.settings.hints[p.level] || 'none',
    me: {
      pid, name: p.name, icon: tok(p).icon, color: tok(p).color, level: p.level,
      money: p.money, debt: p.debt, stars: p.stars, inJail: p.inJail, mission: p.mission,
      specials: p.specials
    },
    props: playerProps(s, pid).map(sq => {
      const q = s.squares[sq];
      const g = s.groups.find(x => x.id === q.group);
      return { sq, name: q.name, emoji: q.emoji || '', group: g ? g.name : '', color: g ? g.color : '#999',
        price: q.price, rent: rentOf(s, sq), full: ownsGroup(s, q.group, pid), mortgaged: isMortgaged(s, sq) };
    }),
    // Properties someone else owns: names only (for asking for them in a trade). Not who owns them.
    sold: Object.keys(s.props).map(Number).filter(sq => s.props[sq].owner !== pid).sort((a, b) => a - b)
      .map(sq => { const q = s.squares[sq]; const g = s.groups.find(x => x.id === q.group); return { sq, name: q.name, emoji: q.emoji || '', color: g ? g.color : '#999' }; }),
    players: s.players.map((x, i) => ({ pid: i, name: x.name, icon: tok(x).icon, color: tok(x).color, level: x.level, pos: x.pos, square: s.squares[x.pos] ? s.squares[x.pos].name : '' })),
    turn: t ? { pid: t.pid, name: s.players[t.pid].name, step: t.step, dice: t.dice, square: s.squares.length ? squareInfo(s, s.players[t.pid].pos, pid) : null } : null,
    myTurn,
    options: myTurn ? options(s).filter(o => o.id !== 'nudge') : [],
    sayIt: s.sayIt,
    rule: s.rule ? s.rule.text : null,
    market: s.market ? { mult: s.market.mult, group: (s.groups.find(g => g.id === s.market.group) || {}).name || null, rounds: s.market.rounds } : null,
    clock: clock(s, now),
    auction: s.auction ? { name: s.squares[s.auction.sq].name, emoji: s.squares[s.auction.sq].emoji || '', price: s.squares[s.auction.sq].price,
      high: s.auction.high ? { amount: s.auction.high.amount, name: s.players[s.auction.high.pid].name, me: s.auction.high.pid === pid } : null,
      left: Math.max(0, s.auction.endsAt - now) } : null,
    black: s.black ? { item: s.black.item, left: Math.max(0, s.black.endsAt - now), closed: !!s.black.closed } : null,
    hint: s.hint && (s.hint.pid == null || s.hint.pid === pid) ? { id: s.hint.id, title: s.hint.title, lines: s.hint.lines } : null,
    pending: null, trade: null, results: null
  };

  if (pe) {
    const mine = pe.pid === pid || (pe.kind === 'rent' && pe.to === pid);
    view.pending = mine
      ? { kind: pe.kind, mine: true, role: pe.kind === 'rent' && pe.to === pid ? 'owner' : 'player', amount: pe.amount, tries: pe.tries,
          card: pe.card || null, challenge: pe.challenge || null, bank: pe.bank || null, claim: !!pe.claim,
          square: pe.sq != null ? squareInfo(s, pe.sq, pid) : null,
          other: pe.kind === 'rent' ? s.players[pe.to === pid ? pe.pid : pe.to].name : null }
      : { kind: pe.kind, mine: false, name: s.players[pe.pid].name };
  }

  const tr = s.trade;
  if (tr && (tr.from === pid || tr.to === pid)) {
    const names = side => ({ money: side.money, props: side.props.map(sq => ({ sq, name: s.squares[sq].name, emoji: s.squares[sq].emoji || '' })) });
    view.trade = { status: tr.status || 'accepted', iProposed: tr.from === pid, other: s.players[tr.from === pid ? tr.to : tr.from].name,
      give: names(tr.give), get: names(tr.get) };
  }

  if (s.phase === 'over' && s.results) {
    view.results = {
      ranking: s.results.ranking.map(r => ({ name: s.players[r.pid].name, icon: tok(s.players[r.pid]).icon, total: r.total, me: r.pid === pid })),
      topStars: s.results.topStars.map(i => s.players[i].name),
      missionDone: p.missionDone
    };
  }
  return view;
}

// A phone that is connected but not playing a player yet.
export function lobbyView(s, name) {
  if (s.phase === 'setup') return { kind: 'lobby', phase: 'setup', name };
  const taken = new Set(Object.values(s.seats));
  return {
    kind: 'lobby', phase: s.phase, name,
    players: s.players.map((p, i) => ({ pid: i, name: p.name, icon: tok(p).icon, color: tok(p).color, free: !taken.has(i) }))
  };
}
