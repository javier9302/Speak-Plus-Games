// Shopping: buy everything on a list with the team's coins. Shops (kind "shop") sell one item each at a price; the same
// item can cost more in one shop than another. Talk at a shop tells the price, Use buys one. The coins are shared and
// run out, so the team must compare prices before it spends.
import { KINDS } from '../kinds/index.js';

const total = (list) => Object.values(list).reduce((a, b) => a + b, 0);
const shopsOf = (zone, item) => zone.objects.filter((o) => o.kind === 'shop' && o.sells === item);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export default {
  type: 'shopping',
  label: 'Shopping list',
  about: 'Buy everything on a shopping list with the team\'s coins. Shops sell items at different prices; Talk tells the price, Use buys one.',
  fields: { list: '{ "<item>": how many, ... }: the shopping list (up to 5 items, 8 things in all)', coins: 'the coins the team has: 1 to 999' },
  normalize(raw, c) {
    const list = raw.list ?? c.base.list, coins = raw.coins ?? c.base.coins;
    if (!list || typeof list !== 'object' || Array.isArray(list) || !Object.keys(list).length) { c.fail('goal: "list" is the shopping list, for example { "bread": 2, "milk": 1 }'); return null; }
    for (const [item, n] of Object.entries(list)) {
      if (!c.items.byId[item]) c.fail(`goal: "${item}" in "list" is not an item.${c.didYouMean(item, Object.keys(c.items.byId))}`);
      else if (!shopsOf(c.zone, item).length) c.fail(`goal: nobody sells "${item}": add a shop (kind "shop", "sells": "${item}")`);
      if (!(Number.isInteger(n) && n >= 1 && n <= 5)) c.fail(`goal: how many ${item}? A whole number from 1 to 5`);
    }
    if (Object.keys(list).length > 5 || total(list) > 8) c.fail('goal: the list can have 5 items and 8 things in all');
    if (!(Number.isInteger(coins) && coins >= 1 && coins <= 999)) c.fail('goal: "coins" is how many coins the team has: a whole number from 1 to 999');
    return { list, coins, label: raw.label };
  },
  wholeZone: (raw) => ({ ...raw, coins: 999 }),
  describe: (goal) => `a shopping list of ${plural(total(goal.list), 'thing')}, ${plural(goal.coins, 'coin')}`,
  start: (room, goal) => ({ coins: goal.coins }),
  progress(room, goal) {
    const have = Object.entries(goal.list).reduce((n, [item, need]) => n + Math.min(need, room.players.reduce((k, p) => k + p.items.filter((it) => it.item === item).length, 0)), 0);
    return { have, need: total(goal.list), coins: room.goalState.coins, done: have >= total(goal.list) };
  },
  sheet: (goal, c) => `buy ${Object.entries(goal.list).map(([i, n]) => `${n} ${c.itemName(i)}`).join(', ')} with ${plural(goal.coins, 'coin')}`,
  // The team gets a price warning from the check when the coins are enough at the dearest shops: then prices do not matter.
  notes(zone, goal) {
    const cost = (pick) => Object.entries(goal.list).reduce((n, [item, k]) => n + k * pick(...shopsOf(zone, item).map((o) => o.price)), 0);
    return cost(Math.max) <= goal.coins ? [`the coins (${goal.coins}) are enough even at the dearest shops (${cost(Math.max)}): prices do not matter. Lower the coins, or make a shop dearer.`] : [];
  },
  // A perfect team buys each item at the cheapest shop that still has some, after a player with Talk heard the price and
  // a player with Use paid for it. Other things that use up the item (a trader, a bridge...) count as demand too.
  solver(s) {
    const goal = s.mission.goal, shops = s.things.filter((t) => t.kind === 'shop');
    let coins = goal.coins;
    const bought = {}, heard = new Set();
    const demand = (item) => (goal.list[item] || 0) + s.things.reduce((n, t) => n + (KINDS[t.kind].consumes?.(t.def) || []).filter((x) => x === item).length, 0);
    const cheapest = (item) => shops.filter((t) => t.def.sells === item && (t.left === null || t.left > 0)).sort((a, b) => a.def.price - b.def.price)[0];
    return {
      step() {
        for (const item of new Set(shops.map((t) => t.def.sells))) {
          if ((bought[item] || 0) >= demand(item)) continue;
          const shop = cheapest(item);
          if (!shop || shop.def.price > coins) continue;
          const hearer = s.owners('talk').find((j) => s.reach(j, shop)), buyer = s.owners('use').find((j) => s.reach(j, shop));
          if (hearer === undefined || buyer === undefined) continue;
          if (!heard.has(shop.id)) { heard.add(shop.id); s.used.add('talk'); s.log.push(`Talk: the price at the ${shop.name.toLowerCase()}`); }
          s.used.add('use'); s.pool.push({ item, holder: buyer }); coins -= shop.def.price; bought[item] = (bought[item] || 0) + 1;
          if (shop.left !== null) shop.left--;
          s.log.push(`Use: buy ${item} at the ${shop.name.toLowerCase()} (${plural(shop.def.price, 'coin')})`);
          return true;
        }
        return false;
      },
      done: () => Object.entries(goal.list).every(([item, need]) => (bought[item] || 0) >= demand(item) && (bought[item] || 0) >= need),
      why(problems) {
        const out = [];
        for (const [item, need] of Object.entries(goal.list)) {
          if ((bought[item] || 0) >= demand(item)) continue;
          const shop = cheapest(item);
          if (!shop) out.push(`the shops are out of ${item}`);
          else if (shop.def.price > coins) out.push(`not enough coins for the ${item}: ${plural(coins, 'coin')} left, and the cheapest costs ${shop.def.price} (at the ${shop.name.toLowerCase()})`);
          else if (!s.owners('talk').some((j) => s.reach(j, shop))) out.push(`nobody with Talk can get to the ${shop.name.toLowerCase()} to hear the price of the ${item}`);
          else out.push(`nobody with Use can get to the ${shop.name.toLowerCase()} to buy the ${item}`);
        }
        return out;
      },
    };
  },
};
