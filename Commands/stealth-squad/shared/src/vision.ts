import { TILE_SIZE, Tile, tileAt, type GridMap } from "./map.js";

/** Guard sight tuning. Distances in tiles, angles in radians. */
export const VISION = {
  /** How far a guard sees a standing / walking player. */
  range: 6,
  /** How far a guard sees a crawling player (the inner cone on the Scout's screen). */
  crawlRange: 3.5,
  /** Half the cone width (35° each side). */
  halfFov: (35 * Math.PI) / 180,
  /** Anyone this close is noticed in any direction (bumping into a guard). */
  touchRange: 0.8,
  /** Seconds of being seen up close before the meter is full. */
  fillSeconds: 0.7,
  /** Crawling fills the meter at this fraction of the normal speed. */
  crawlFillFactor: 0.5,
  /** Meter drain per second when nobody is seen (1 = full meter). */
  decayPerSecond: 0.6,
} as const;

/** Walls, closed doors, trees and crates block sight; fences, panels, desks and water don't. */
/** Dogs: run faster, see only a short way, but smell anyone close in any direction. */
export const DOG = {
  speedFactor: 1.6,
  /** Fraction of the normal sight range. */
  sightFactor: 0.5,
  /** Tiles: smelled even behind him, in a bush or in disguise (not when burrowed). */
  smellRange: 2.5,
} as const;

/** Seconds standing in a searchlight before you're spotted. */
export const LIGHT_FILL_SECONDS = 0.5;

/** Searchlight spot position (pixels) at time `t` seconds: smooth back-and-forth. */
export function searchlightSpot(
  def: { from: { x: number; y: number }; to: { x: number; y: number }; seconds: number },
  t: number,
  tileSize: number,
): { x: number; y: number } {
  const phase = (t / def.seconds) % 2; // 0→1 out, 1→2 back
  const k = 0.5 - 0.5 * Math.cos(Math.PI * (phase < 1 ? phase : 2 - phase));
  return {
    x: ((def.from.x + (def.to.x - def.from.x) * k) + 0.5) * tileSize,
    y: ((def.from.y + (def.to.y - def.from.y) * k) + 0.5) * tileSize,
  };
}

export const blocksSight = (map: GridMap, tx: number, ty: number) => {
  const t = tileAt(map, tx, ty);
  return t === Tile.Wall || t === Tile.Door || t === Tile.Tree || t === Tile.GrassTree || t === Tile.Crate;
};

const STEP = 2; // px per ray step; tiles are 16px so walls can't be skipped

/** Distance (px) a ray travels from (x, y) before hitting a wall, capped at maxDist. */
export function castRay(map: GridMap, x: number, y: number, angle: number, maxDist: number): number {
  const dx = Math.cos(angle) * STEP;
  const dy = Math.sin(angle) * STEP;
  for (let d = STEP; d <= maxDist; d += STEP) {
    x += dx;
    y += dy;
    if (blocksSight(map, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))) return d - STEP;
  }
  return maxDist;
}

export function hasLineOfSight(map: GridMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  return castRay(map, x0, y0, Math.atan2(y1 - y0, x1 - x0), dist) >= dist - STEP;
}

/** Smallest signed difference between two angles, in (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export interface SightOptions {
  crawling?: boolean;
  /** In a bush: only noticed by bumping into the guard. */
  hidden?: boolean;
  /** Guard woke up from a dart: sees further, notices faster. */
  rangeFactor?: number;
  fillFactor?: number;
  /** Dog: anyone within this many tiles is noticed (any direction, hidden or not). */
  smell?: number;
}

/**
 * How fast (meter per second) a guard at (gx, gy) facing `angle` notices a
 * player at (px, py); 0 = not seen. Closer = faster, crawling = slower and
 * only inside the shorter crawl range.
 */
export function detectionRate(
  map: GridMap,
  gx: number, gy: number, angle: number,
  px: number, py: number, opts: SightOptions = {},
): number {
  const dist = Math.hypot(px - gx, py - gy) / TILE_SIZE;
  const fill = (opts.fillFactor ?? 1) / VISION.fillSeconds;
  if (dist <= VISION.touchRange) return 3 * fill;
  if (opts.smell && dist <= opts.smell) return 2 * fill;
  if (opts.hidden) return 0;
  const range = (opts.crawling ? VISION.crawlRange : VISION.range) * (opts.rangeFactor ?? 1);
  if (dist > range) return 0;
  if (Math.abs(angleDiff(Math.atan2(py - gy, px - gx), angle)) > VISION.halfFov) return 0;
  if (!hasLineOfSight(map, gx, gy, px, py)) return 0;
  const near = 1 - 0.5 * (dist / range); // 1 up close → 0.5 at the edge
  return near * (opts.crawling ? VISION.crawlFillFactor : 1) * fill;
}

/** Cone outline for drawing: guard position followed by ray end points across the FOV. */
export function coneOutline(
  map: GridMap, gx: number, gy: number, angle: number, rangeTiles: number, rays = 20,
): number[] {
  const pts = [gx, gy];
  const max = rangeTiles * TILE_SIZE;
  for (let i = 0; i <= rays; i++) {
    const a = angle - VISION.halfFov + (2 * VISION.halfFov * i) / rays;
    const d = castRay(map, gx, gy, a, max);
    pts.push(gx + Math.cos(a) * d, gy + Math.sin(a) * d);
  }
  return pts;
}
