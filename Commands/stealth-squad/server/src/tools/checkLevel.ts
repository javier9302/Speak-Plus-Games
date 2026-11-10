/**
 * Level sanity check: `npm run check-level`.
 * Simulates every guard's patrol for a while and reports any checkpoint spawn
 * tile a guard can see (that would get the team spotted right after a restart),
 * plus unreachable patrol stops / checkpoints. Sight uses the longest range of
 * any difficulty (Hard), so a spawn that is safe there is safe everywhere.
 */
import {
  DIFFICULTIES,
  DIFFICULTY,
  DOG,
  FIXES,
  searchlightSpot,
  LEVELS,
  TILE_SIZE,
  cloneMap,
  detectionRate,
  findPath,
  isWalkable,
  type LevelDef,
} from "@stealth-squad/shared";
import { GuardSim } from "../sim/GuardSim.js";

function check(level: LevelDef, seconds = 90): number {
  let problems = 0;
  const report = (msg: string) => {
    problems++;
    console.log(`  ✗ ${msg}`);
  };
  const start = level.checkpoints[0].spawns[0];
  // Reachability assumes the Engineer opens every door / fence.
  const open = cloneMap(level.map);
  open.tiles = open.tiles.map((t) => FIXES[t]?.to ?? t);
  const reach = (to: { x: number; y: number }) => !!findPath(open, start, to);
  const reachNextTo = (x: number, y: number) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isWalkable(open, x + dx, y + dy) && reach({ x: x + dx, y: y + dy }));

  level.guards.forEach((def, gi) =>
    def.stops.forEach((s, si) => {
      if (!findPath(level.map, s, def.stops[(si + 1) % def.stops.length])) report(`guard ${gi} stop ${si} can't reach the next stop`);
    }),
  );
  level.checkpoints.forEach((cp, ci) => {
    if (!reach(cp.spawns[0])) report(`checkpoint ${ci} is unreachable from the start`);
    if (cp.spawns.length < 6) report(`checkpoint ${ci} has ${cp.spawns.length} spawns (need 6)`);
    cp.spawns.forEach((sp) => {
      if (!isWalkable(level.map, sp.x, sp.y)) report(`checkpoint ${ci} spawn (${sp.x},${sp.y}) is not walkable`);
    });
  });
  level.objectives.forEach((o) => {
    if (o.kind === "fix") {
      if (!FIXES[level.map.tiles[o.y * level.map.width + o.x]]) report(`objective "${o.label}" (${o.x},${o.y}) is not a fixable tile`);
      if (!reachNextTo(o.x, o.y)) report(`objective "${o.label}" can't be reached`);
    } else {
      if (!isWalkable(level.map, o.x, o.y)) report(`"${o.label}" (${o.x},${o.y}) is not on a walkable tile`);
      if (!reach({ x: o.x, y: o.y })) report(`"${o.label}" can't be reached`);
    }
  });
  (level.searchlights ?? []).forEach((l, li) => {
    if (l.panel && !FIXES[level.map.tiles[l.panel.y * level.map.width + l.panel.x]]) report(`searchlight ${li} panel is not a fixable tile`);
    if (l.panel && !reachNextTo(l.panel.x, l.panel.y)) report(`searchlight ${li} panel can't be reached`);
  });
  if (!reach({ x: level.exit.x, y: level.exit.y })) report(`exit is unreachable`);

  const sims = level.guards.map((d) => new GuardSim(d, level.map));
  const far = Math.max(...DIFFICULTIES.map((d) => DIFFICULTY[d].sightFactor));
  const seen = new Set<string>();
  const dt = 1 / 20;
  for (let t = 0; t < seconds; t += dt) {
    sims.forEach((g, gi) => {
      g.update(dt, false);
      level.checkpoints.forEach((cp, ci) =>
        cp.spawns.forEach((sp) => {
          const key = `${gi}:${ci}:${sp.x},${sp.y}`;
          if (seen.has(key)) return;
          const px = sp.x * TILE_SIZE + TILE_SIZE / 2;
          const py = sp.y * TILE_SIZE + TILE_SIZE / 2;
          const sight = g.state.dog
            ? { rangeFactor: DOG.sightFactor * far, smell: DOG.smellRange }
            : { rangeFactor: far };
          if (detectionRate(level.map, g.state.x, g.state.y, g.state.angle, px, py, sight) > 0) {
            seen.add(key);
            report(`guard ${gi} can see checkpoint ${ci} spawn (${sp.x},${sp.y}) at t=${t.toFixed(1)}s`);
          }
        }),
      );
    });
  }
  // Searchlight spots must never sweep over a restart point.
  (level.searchlights ?? []).forEach((l, li) => {
    for (let t = 0; t < l.seconds * 2; t += 0.1) {
      const spot = searchlightSpot(l, t, TILE_SIZE);
      level.checkpoints.forEach((cp, ci) =>
        cp.spawns.forEach((sp) => {
          const d = Math.hypot((sp.x + 0.5) * TILE_SIZE - spot.x, (sp.y + 0.5) * TILE_SIZE - spot.y);
          const key = `L${li}:${ci}:${sp.x},${sp.y}`;
          if (d <= l.radius * TILE_SIZE && !seen.has(key)) {
            seen.add(key);
            report(`searchlight ${li} lights checkpoint ${ci} spawn (${sp.x},${sp.y})`);
          }
        }),
      );
    }
  });
  return problems;
}

const levels = LEVELS;
let total = 0;
for (const level of levels) {
  console.log(`${level.name}:`);
  const n = check(level);
  if (!n) console.log("  ✓ ok");
  total += n;
}
process.exit(total ? 1 : 0);
