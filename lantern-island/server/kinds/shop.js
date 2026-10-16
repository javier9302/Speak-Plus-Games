// A shop: sells one item at a price. Talk tells the price (so a different player reads it from the one who pays);
// Use buys one, paid from the team's coins. Only in a "shopping" mission (server/goals/shopping.js), which holds the
// purse. Two shops can sell the same item at different prices: the team must compare.
const coins = (n) => `${n} coin${n === 1 ? '' : 's'}`;
const purse = (c) => c.room.goalState?.coins;
export default {
  kind: 'shop',
  about: 'A shop. It sells one item at a price. Talk tells the price; Use buys one with the team\'s coins (a "shopping" mission).',
  fields: { sells: 'the item it sells', price: 'its price in coins: 1 to 99', stock: 'how many it has (default: as many as you like)' },
  check(o, v) {
    v.item(o.sells, 'sells');
    if (!(Number.isInteger(o.price) && o.price >= 1 && o.price <= 99)) v.problem('a shop needs "price": a whole number of coins, 1 to 99');
    if (o.stock !== undefined && !(Number.isInteger(o.stock) && o.stock >= 1 && o.stock <= 20)) v.problem('"stock" is how many it has: 1 to 20');
    if (o.clues?.talk) v.problem('a shop tells its price by itself when you Talk; remove the "talk" clue');
  },
  start: (def) => ({ st: 'open', holds: def.sells, left: def.stock ?? null }),
  hidesHolds: () => true,
  force: () => null,
  returned: (t) => { if (t.left !== null) { t.left++; t.holds = t.def.sells; t.st = 'open'; } },
  how: (o, itemName) => `Talk to hear the price; Use to buy (${itemName(o.sells)}, ${coins(o.price)}${o.stock ? `, ${o.stock} in stock` : ''}).`,
  actions: [
    {
      ability: 'talk', when: () => true, solver: false,
      run(t, c) {
        const have = purse(c), left = t.left;
        const text = [`${c.itemName(t.def.sells)[0].toUpperCase()}${c.itemName(t.def.sells).slice(1)}: ${coins(t.def.price)}.`, left === null ? '' : left > 0 ? `${left} left.` : 'Sold out.', have === undefined ? '' : `The team has ${coins(have)}.`].filter(Boolean).join(' ');
        return { clue: { key: `${t.id}:talk`, o: t.id, a: 'talk', name: t.name, text } };
      },
    },
    {
      ability: 'use', when: (t) => t.st === 'open' && !!t.holds, gives: true, solver: false,
      guard(t, c) {
        const have = purse(c);
        if (have === undefined) return 'The shop is closed. (It is only open in a shopping mission.)';
        return have >= t.def.price ? null : `A ${c.itemName(t.def.sells)} costs ${coins(t.def.price)}. The team has ${coins(have)}. Talk about it!`;
      },
      do(t, c) {
        c.room.goalState.coins -= t.def.price;
        if (t.left !== null && --t.left <= 0) { t.holds = null; t.st = 'sold-out'; }
      },
    },
  ],
  art: {
    pal: {'h': '#e8483b', 'w': '#f7f4ee', 'c': '#a9713c', 'd': '#38b764', 'y': '#ffd166'},
    states: {
      default: [
        '................', '................', '.kkkkkkkkkkkkkk.', '.khhwwhhwwhhwwk.',
        '.khhwwhhwwhhwwk.', '.khhwwhhwwhhwwk.', '.kkkkkkkkkkkkkk.', '..kc........ck..',
        '..kc..d.....ck..', '..kc.kd..kk.ck..', '..kkkkkkkkykkk..', '..kcccccccccck..',
        '..kcccccccccck..', '..kcccccccccck..', '..kkkkkkkkkkkk..', '................',
      ],
    },
  },
};
