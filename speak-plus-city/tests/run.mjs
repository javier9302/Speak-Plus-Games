// Tests for the game rules (js/state.js). Run: node tests/run.mjs
import { readFileSync } from 'node:fs';
import { apply, emptyState, options, mustAct, tick, rentOf, priceOf, worth, timeLeft, sessionReport, BOARD_SIZE, JAIL } from '../js/state.js';
import { validateContent } from '../js/content.js';

const content = JSON.parse(readFileSync(new URL('../data/content.json', import.meta.url)));
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✔', name); }
  catch (e) { failed++; console.log('  ✘', name, '\n     ', e.message); }
}
function eq(a, b, msg = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected true'); }

// Repeatable random numbers.
function seeded(seed = 1) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
let clock = 1_000_000;
const ctx = () => ({ content, now: clock, rand: seeded(7) });
// Apply an action and fail the test on error.
function run(s, action) {
  const r = apply(s, action, ctx());
  if (r.error) throw new Error(`${action.type}: ${r.error}`);
  return r.state;
}
function newGame(n = 3, settings = {}) {
  const players = ['Aiko', 'Ken', 'Mari', 'Sota', 'Yui', 'Taro'].slice(0, n).map((name, i) => ({ name, token: i, level: ['beginner', 'intermediate', 'advanced'][i % 3] }));
  return run(emptyState(), { type: 'setup', players, settings });
}
const sqByName = name => content.squares.findIndex(q => q.name === name);

console.log('Content');
test('default content is valid', () => eq(validateContent(content), []));
test('board has 48 squares with the right mix', () => {
  eq(content.squares.length, BOARD_SIZE);
  const count = t => content.squares.filter(q => q.type === t).length;
  eq([count('property'), count('chance'), count('mystery'), count('bank'), count('blackmarket')], [30, 5, 4, 4, 1]);
  eq([0, 12, 24, 36].map(i => content.squares[i].type), ['start', 'jail', 'festival', 'gotojail']);
});
test('enough default content', () => {
  ok(content.chance.length >= 30 && content.mystery.length >= 20 && content.missions.length >= 12 && content.rules.length >= 10);
  for (const lv of ['beginner', 'intermediate', 'advanced']) ok(content.chance.filter(c => c.level === lv).length >= 10, lv);
});

console.log('Setup and turns');
test('setup gives money, missions and a first turn', () => {
  const s = newGame(3);
  eq(s.phase, 'play');
  eq(s.players.map(p => p.money), [1500, 1500, 1500]);
  ok(s.players.every(p => p.mission), 'missions');
  eq(new Set(s.players.map(p => p.mission)).size, 3, 'different missions');
  eq(s.turn.pid, 0); eq(s.turn.step, 'roll');
  ok(s.rule, 'rule of the round');
});
test('setup needs 2–6 players', () => {
  ok(apply(emptyState(), { type: 'setup', players: [{ name: 'A' }] }, ctx()).error);
});
test('board can only send player actions', () => {
  const s = newGame();
  ok(apply(s, { type: 'money', pid: 0, delta: 500, from: 'board' }, ctx()).error);
});
test('rolling moves the token and passing Start pays salary', () => {
  let s = newGame();
  s = run(s, { type: 'roll', dice: [3, 4] });
  eq(s.players[0].pos, 7); eq(s.turn.step, 'land');
  s.players[0].pos = 45;
  s.turn.step = 'roll';
  s = run(s, { type: 'roll', dice: [2, 3] });
  eq(s.players[0].pos, 2); eq(s.players[0].money, 1700);
});
test('typed total from real dice', () => {
  const s = run(newGame(), { type: 'roll', total: 9 });
  eq(s.turn.dice[0] + s.turn.dice[1], 9); eq(s.players[0].pos, 9);
  ok(apply(newGame(), { type: 'roll', total: 13 }, ctx()).error);
});
test('cannot end the turn before buying or passing', () => {
  let s = run(newGame(), { type: 'roll', dice: [3, 4] });   // Ramen Corner, unowned
  ok(mustAct(s));
  ok(options(s).find(o => o.id === 'end').disabled);
  ok(apply(s, { type: 'end' }, ctx()).error);
});

console.log('Buying and rent');
test('buy needs teacher approval, with optional bonus', () => {
  let s = run(newGame(), { type: 'roll', dice: [3, 4] });
  s = run(s, { type: 'buy', from: 'board' });
  eq(s.pending.kind, 'buy'); eq(s.pending.amount, 100);
  eq(options(s), [], 'no options while pending');
  s = run(s, { type: 'retry' });
  eq(s.pending.tries, 1);
  s = run(s, { type: 'approve', bonus: true });
  eq(s.props[7].owner, 0);
  eq(s.players[0].money, 1500 - 100 + 20);
  ok(!mustAct(s));
  s = run(s, { type: 'end' });
  eq(s.turn.pid, 1);
});
test('rent, full group and market', () => {
  let s = newGame();
  s.props[1] = { owner: 0, mortgaged: false };
  eq(rentOf(s, 1), 12);
  s.props[3] = { owner: 0, mortgaged: false };
  s.props[5] = { owner: 0, mortgaged: false };
  eq(rentOf(s, 1), 24, 'full group doubles');
  s = run(s, { type: 'market', mult: 2, group: 'cafe', rounds: 1 });
  eq(rentOf(s, 1), 48); eq(priceOf(s, 7), 100, 'other groups unchanged');
  s.turn.pid = 1; s.players[1].pos = 0;
  s = run(s, { type: 'roll', dice: [1, 0 + 1] });   // 2 → chance square
  eq(s.players[1].pos, 2);
});
test('paying rent moves money between players', () => {
  let s = newGame();
  s.props[7] = { owner: 1, mortgaged: false };
  s = run(s, { type: 'roll', dice: [3, 4] });
  eq(options(s)[0].id, 'rent');
  s = run(s, { type: 'rent' });
  s = run(s, { type: 'approve' });
  eq([s.players[0].money, s.players[1].money], [1480, 1520]);
});
test('no rent on mortgaged property, own property needs nothing', () => {
  let s = newGame();
  s.props[7] = { owner: 1, mortgaged: true };
  s = run(s, { type: 'roll', dice: [3, 4] });
  ok(!mustAct(s));
});

test('getting the property in a trade mid-turn lets the player end the turn', () => {
  let s = newGame();
  s.props[7] = { owner: 1, mortgaged: false };
  s = run(s, { type: 'roll', dice: [3, 4] });
  ok(mustAct(s), 'rent due');
  s = run(s, { type: 'tradeConfirm', trade: { from: 1, to: 0, give: { props: [7] }, get: { money: 100 } } });
  ok(!mustAct(s), 'own property now');
  s = run(s, { type: 'end' });
});
test('a failed Chance card applies its fail amount and feeds the fund', () => {
  let s = newGame(3, { fundTarget: 1000 });
  s = run(s, { type: 'roll', dice: [1, 1] });
  s = run(s, { type: 'card' });
  s.pending.card = { text: 'x', reward: -50, fail: -100, fund: true };
  s = run(s, { type: 'deny' });
  eq(s.players[0].money, 1400); eq(s.fund, 100); ok(!mustAct(s));
});

console.log('Auctions');
test('passing starts an auction; highest bid wins when time runs out', () => {
  let s = run(newGame(), { type: 'roll', dice: [3, 4] });
  s = run(s, { type: 'pass' });
  ok(s.auction); eq(s.auction.sq, 7);
  ok(options(s).find(o => o.id === 'end').disabled, 'end waits for auction');
  s = run(s, { type: 'bid', pid: 1, add: 50 });
  s = run(s, { type: 'bid', pid: 2, add: 10 });
  eq(s.auction.high, { pid: 2, amount: 60 });
  ok(apply(s, { type: 'bid', pid: 1, amount: 60 }, ctx()).error, 'must outbid');
  clock += 60_000;
  s = tick(s, ctx());
  eq(s.auction, null); eq(s.props[7].owner, 2); eq(s.players[2].money, 1440);
  s = run(s, { type: 'end' });
});
test('no rent for the player who passed, when the teacher starts the auction from the Properties tab', () => {
  let s = run(newGame(), { type: 'roll', dice: [3, 4] });   // Ramen Corner, unowned
  s = run(s, { type: 'auction', sq: 7 });
  s = run(s, { type: 'bid', pid: 1, amount: 120 });
  s = run(s, { type: 'auctionClose' });
  eq(s.props[7].owner, 1);
  ok(!mustAct(s), 'no rent due');
  ok(!options(s).some(o => o.id === 'rent'), 'no rent button');
  eq(s.players[0].money, 1500);
  s = run(s, { type: 'end' });
});
test('the same when nobody bids', () => {
  let s = run(newGame(), { type: 'roll', dice: [3, 4] });
  s = run(s, { type: 'auction', sq: 7 });
  s = run(s, { type: 'auctionClose' });
  ok(!mustAct(s));
});
test('teacher can auction a player property; seller gets the money', () => {
  let s = newGame();
  s.props[10] = { owner: 0, mortgaged: false };
  s = run(s, { type: 'auction', sq: 10 });
  ok(apply(s, { type: 'bid', pid: 0, amount: 10 }, ctx()).error, 'seller cannot bid');
  s = run(s, { type: 'bid', pid: 1, amount: 200 });
  s = run(s, { type: 'auctionClose' });
  eq(s.props[10].owner, 1); eq(s.players[0].money, 1700); eq(s.players[1].money, 1300);
});

console.log('Cards, mystery, bank, jail');
test('chance card matches level; approve pays, deny applies fail and fund', () => {
  let s = newGame();
  s = run(s, { type: 'roll', dice: [1, 1] });   // square 2: chance
  s = run(s, { type: 'card' });
  eq(s.pending.card.level, 'beginner');
  const card = s.pending.card;
  s = run(s, { type: 'approve' });
  eq(s.players[0].money, 1500 + card.reward);
});
test('mystery challenge with custom amount', () => {
  let s = newGame();
  s = run(s, { type: 'roll', dice: [3, 3] });   // square 6: mystery
  s = run(s, { type: 'mystery' });
  ok(s.pending.card.text);
  s = run(s, { type: 'approve', amount: 75 });
  eq(s.players[0].money, 1575);
});
test('tax goes to the town fund; a full fund pays everyone', () => {
  let s = newGame(3, { fundTarget: 150 });
  s = run(s, { type: 'roll', dice: [2, 2] });   // square 4: tax 100
  s = run(s, { type: 'bank' });
  s = run(s, { type: 'approve', amount: 50 });  // discount!
  eq(s.players[0].money, 1450); eq(s.fund, 50);
  s = run(s, { type: 'fund', pid: 1, amount: 100 });
  eq(s.fund, 0); eq(s.festivals, 1);
  eq(s.players.map(p => p.money), [1550, 1500, 1600]);
});
test('Go to Coffee Break, then speak your way out', () => {
  let s = newGame();
  s.players[0].pos = 30;
  s = run(s, { type: 'roll', dice: [3, 3] });   // 36: go to jail
  eq(s.players[0].pos, JAIL); ok(s.players[0].inJail);
  s = run(s, { type: 'end' });
  s = run(s, { type: 'skip' }); s = run(s, { type: 'skip' });
  eq(s.turn.pid, 0); eq(s.turn.step, 'jail');
  eq(options(s).map(o => o.id), ['jailSpeak', 'jailStay']);
  s = run(s, { type: 'jailSpeak' });
  ok(s.pending.challenge);
  s = run(s, { type: 'approve' });
  eq(s.turn.step, 'roll'); ok(!s.players[0].inJail);
});
test('failing the Coffee Break talk misses the turn', () => {
  let s = newGame();
  s.players[0].inJail = true; s.turn.step = 'jail';
  s = run(s, { type: 'jailSpeak' });
  s = run(s, { type: 'deny' });
  eq(s.turn.pid, 1); ok(!s.players[0].inJail);
});
test('loan and repayment', () => {
  let s = newGame();
  s = run(s, { type: 'loan', pid: 1, amount: 300, repay: 330 });
  eq([s.players[1].money, s.players[1].debt], [1800, 330]);
  s = run(s, { type: 'repay', pid: 1, amount: 330 });
  eq([s.players[1].money, s.players[1].debt], [1470, 0]);
});
test('mortgage and unmortgage', () => {
  let s = newGame();
  s.props[13] = { owner: 2, mortgaged: false };
  s = run(s, { type: 'mortgage', sq: 13 });
  eq(s.players[2].money, 1570);
  s = run(s, { type: 'unmortgage', sq: 13 });
  eq(s.players[2].money, 1570 - 77);
});
test('ask the bank adds a request', () => {
  let s = run(newGame(), { type: 'ask', topic: 'loan', from: 'board' });
  eq(s.requests.length, 1);
  s = run(s, { type: 'requestDone', id: s.requests[0].id });
  eq(s.requests.length, 0);
});

console.log('Trades');
test('trade proposal confirmed by teacher', () => {
  let s = newGame();
  s.props[1] = { owner: 0, mortgaged: false };
  s.props[7] = { owner: 1, mortgaged: false };
  s = run(s, { type: 'trade', from: 'board', trade: { from: 0, to: 1, give: { props: [1], money: 50 }, get: { props: [7] } } });
  ok(s.trade);
  s = run(s, { type: 'tradeConfirm' });
  eq([s.props[1].owner, s.props[7].owner], [1, 0]);
  eq([s.players[0].money, s.players[1].money], [1450, 1550]);
});
test('trade fails if a property changed hands', () => {
  let s = newGame();
  s.props[1] = { owner: 0, mortgaged: false };
  s = run(s, { type: 'trade', trade: { from: 0, to: 1, give: { props: [1] }, get: { money: 100 } } });
  s.props[1].owner = 2;
  ok(apply(s, { type: 'tradeConfirm' }, ctx()).error);
});

console.log('Surprises');
test('market crash ends after its rounds', () => {
  let s = run(newGame(2), { type: 'market', mult: 0.5, rounds: 1 });
  eq(priceOf(s, 7), 50);
  s = run(s, { type: 'skip' }); s = run(s, { type: 'skip' });
  eq(s.round, 2); eq(s.market, null);
});
test('rule rotates each round; fines go to the fund', () => {
  let s = newGame(2);
  const first = s.rule.text;
  s = run(s, { type: 'skip' }); s = run(s, { type: 'skip' });
  ok(s.rule.text !== first, 'new rule');
  s = run(s, { type: 'ruleFine', pid: 1 });
  eq(s.players[1].money, 1480); eq(s.fund, 20);
});
test('black market: pitch winner pays and owns a special', () => {
  let s = run(newGame(), { type: 'blackMarket', item: 0 });
  ok(s.black);
  clock += 200_000;
  s = tick(s, ctx());
  ok(s.black.closed);
  s = run(s, { type: 'blackSell', pid: 1, price: 350 });
  eq(s.players[1].specials.length, 1);
  eq(worth(s, 1).total, 1500 - 350 + content.blackMarket[0].value);
});
test('gold star and English rule', () => {
  let s = run(newGame(), { type: 'star', pid: 2 });
  eq([s.players[2].stars, s.players[2].money], [1, 1520]);
  s = run(s, { type: 'english', pid: 0, good: false });
  eq(s.players[0].money, 1480);
});
test('last 10 minutes double rewards, then time ends the game', () => {
  let s = newGame(2, { gameMinutes: 60 });
  clock += 51 * 60_000;
  s = tick(s, ctx());
  ok(s.lastTen);
  s = run(s, { type: 'star', pid: 0 });
  eq(s.players[0].money, 1540);
  clock += 10 * 60_000;
  s = tick(s, ctx());
  eq(s.phase, 'ending');
});
test('timer pauses', () => {
  let s = newGame(2, { gameMinutes: 30 });
  s = run(s, { type: 'timerPause' });
  const left = timeLeft(s, clock);
  clock += 120_000;
  eq(timeLeft(s, clock), left);
  s = run(s, { type: 'timerResume' });
  clock += 1000;
  eq(timeLeft(s, clock), left - 1000);
});

console.log('End of game');
test('results: worth, missions, guesses, stars', () => {
  let s = newGame(3);
  s.props[45] = { owner: 1, mortgaged: false };   // Harbour 350
  s.players[1].debt = 100;
  s.players[2].stars = 2;
  s = run(s, { type: 'results', missions: { 0: true }, guesses: { 2: true } });
  eq(s.phase, 'over');
  const r = s.results.ranking;
  eq(r[0].pid, 1); eq(r[0].total, 1500 + 350 - 100);
  eq(r.find(x => x.pid === 0).total, 1700);
  eq(r.find(x => x.pid === 2).total, 1600);
  eq(s.results.topStars, [2]);
  ok(sessionReport(s).includes('## Final ranking'));
});
test('undo-friendly: apply never changes the old state', () => {
  const s = newGame();
  const before = JSON.stringify(s);
  run(s, { type: 'roll', dice: [3, 4] });
  eq(JSON.stringify(s), before);
});
test('a long random game never breaks', () => {
  let s = newGame(6);
  const r = seeded(99);
  for (let i = 0; i < 3000; i++) {
    const opts = options(s).filter(o => !o.disabled && !['trade', 'ask'].includes(o.id));
    if (s.pending) s = run(s, { type: r() < 0.7 ? 'approve' : 'deny' });
    else if (s.auction) { s = run(s, { type: 'bid', pid: (s.auction.seller ?? -1) === 0 ? 1 : 0, add: 10 }); s = run(s, { type: 'auctionClose' }); }
    else if (s.black) s = run(s, { type: 'blackClose' });
    else if (opts.length) s = run(s, { type: opts[Math.floor(r() * opts.length)].id });
    else throw new Error('stuck: ' + JSON.stringify(s.turn));
  }
  ok(s.round > 10, 'rounds played: ' + s.round);
  ok(s.log.length > 100);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
