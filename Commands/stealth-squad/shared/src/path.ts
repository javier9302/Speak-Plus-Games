import { isWalkable, type GridMap } from "./map.js";

export interface TilePoint {
  x: number;
  y: number;
}

// 8 directions; diagonals cost √2.
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
] as const;

/**
 * A* over the tile grid. Diagonal steps are only allowed when both adjacent
 * orthogonal tiles are walkable, so players never clip wall corners.
 * Returns the tiles to visit after `from` (excluding it), or null if unreachable.
 */
export function findPath(map: GridMap, from: TilePoint, to: TilePoint): TilePoint[] | null {
  if (!isWalkable(map, to.x, to.y)) return null;
  const w = map.width;
  const start = from.y * w + from.x;
  const goal = to.y * w + to.x;
  if (start === goal) return [];

  const g = new Float32Array(w * map.height).fill(Infinity);
  const came = new Int32Array(w * map.height).fill(-1);
  const closed = new Uint8Array(w * map.height);
  // Octile distance heuristic (admissible for 8-dir movement).
  const h = (i: number) => {
    const dx = Math.abs((i % w) - to.x);
    const dy = Math.abs(Math.floor(i / w) - to.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  // Maps are tiny (≤ a few thousand tiles), so a plain array scan as the
  // open set is simpler than a heap and fast enough.
  const open: number[] = [start];
  g[start] = 0;

  while (open.length) {
    let best = 0;
    for (let k = 1; k < open.length; k++) {
      if (g[open[k]] + h(open[k]) < g[open[best]] + h(open[best])) best = k;
    }
    const cur = open[best];
    open[best] = open[open.length - 1];
    open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;

    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkable(map, nx, ny)) continue;
      if (dx && dy && (!isWalkable(map, cx + dx, cy) || !isWalkable(map, cx, cy + dy))) continue;
      const n = ny * w + nx;
      const ng = g[cur] + cost;
      if (ng < g[n]) {
        g[n] = ng;
        came[n] = cur;
        open.push(n);
      }
    }
  }

  if (came[goal] === -1) return null;
  const path: TilePoint[] = [];
  for (let i = goal; i !== start; i = came[i]) path.push({ x: i % w, y: Math.floor(i / w) });
  return path.reverse();
}

/** Nearest walkable tile to `t` (spiral search), so taps on walls still do something useful. */
export function nearestWalkable(map: GridMap, t: TilePoint, maxRadius = 3): TilePoint | null {
  if (isWalkable(map, t.x, t.y)) return t;
  for (let r = 1; r <= maxRadius; r++) {
    let best: TilePoint | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD && isWalkable(map, t.x + dx, t.y + dy)) {
          best = { x: t.x + dx, y: t.y + dy };
          bestD = d;
        }
      }
    }
    if (best) return best;
  }
  return null;
}
