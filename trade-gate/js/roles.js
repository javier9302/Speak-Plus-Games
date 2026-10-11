// Circular roles: "collectors can't spend, spenders can't collect".
//
// With resources [gold, wood, gems, gears] and 4 players:
//   P1 collects gold,  spends gears
//   P2 collects wood,  spends gold
//   P3 collects gems,  spends wood
//   P4 collects gears, spends gems
// Fewer players use the first N resources, so the circle always closes:
// player i collects resource i and spends the resource of the player before.

export function assignRoles(count, resourceOrder) {
  if (count < 2 || count > resourceOrder.length) {
    throw new Error(`Roles need 2 to ${resourceOrder.length} players, got ${count}`);
  }
  const res = resourceOrder.slice(0, count);
  return res.map((collects, i) => ({
    id: `P${i + 1}`,
    collects,
    spends: res[(i - 1 + count) % count],
  }));
}

export const collectorOf = (roles, res) => roles.find((r) => r.collects === res);
export const spenderOf = (roles, res) => roles.find((r) => r.spends === res);
