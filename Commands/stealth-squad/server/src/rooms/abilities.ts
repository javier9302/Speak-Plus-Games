import type { Client } from "@colyseus/core";
import {
  ABILITY,
  AIMED_SKILLS,
  FIXES,
  Skill,
  TILE_SIZE,
  Tile,
  isBush,
  isWalkable,
  VISION,
  angleDiff,
  hasLineOfSight,
  tileAt,
  type GridMap,
} from "@stealth-squad/shared";
import type { GuardSim } from "../sim/GuardSim.js";
import { Trap, type GameState, type Player } from "./schema.js";

/** What the ability code needs from the room. */
export interface World {
  state: GameState;
  map: GridMap;
  guards: GuardSim[];
  /** Stop a player's current walk. */
  stopPath(sessionId: string): void;
  hint(client: Client, text: string): void;
  ping(x: number, y: number, by: string): void;
  /** Toast for the whole team. */
  news(text: string): void;
  /** Change a tile for everyone (door opened...). */
  setTile(tx: number, ty: number, tile: Tile): void;
  noise(x: number, y: number): void;
}

/** Timed actions (server-only bookkeeping; progress is synced on the Player). */
interface Busy {
  kind: "cover" | "getup" | "dress" | "fix";
  left: number;
  total: number;
  guard: number;
  /** Tile being fixed (Engineer). */
  tx?: number;
  ty?: number;
}
const busy = new WeakMap<Player, Busy>();

const tileOf = (v: number) => Math.floor(v / TILE_SIZE);
const distTiles = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) / TILE_SIZE;

/** Nearest guard index matching `ok` within `range` tiles of the player, or -1. */
function nearestGuard(w: World, p: Player, range: number, ok: (g: GuardSim) => boolean): number {
  let best = -1;
  let bestD = range;
  w.guards.forEach((g, i) => {
    const d = distTiles(p.x, p.y, g.state.x, g.state.y);
    if (d <= bestD && ok(g)) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Handle a `use` message. Validates everything server-side; clients only ask. */
export function useSkill(w: World, client: Client, p: Player, skill: string, x?: number, y?: number, kind?: string) {
  if (!p.skills.includes(skill)) return;
  if (AIMED_SKILLS.has(skill as Skill) && (!Number.isFinite(x) || !Number.isFinite(y))) return;

  switch (skill) {
    case Skill.Ping:
      w.ping(x!, y!, p.nickname);
      return;

    case Skill.Dart: {
      if (w.state.darts <= 0) return w.hint(client, "No darts left!");
      // Target: awake guard nearest the tapped point (generous: phones are imprecise).
      let target = -1;
      let bestD = 1.5;
      w.guards.forEach((g, i) => {
        const d = distTiles(x!, y!, g.state.x, g.state.y);
        if (g.active && d < bestD) {
          target = i;
          bestD = d;
        }
      });
      if (target === -1) return w.hint(client, "Tap on a robot to shoot.");
      const g = w.guards[target].state;
      if (distTiles(p.x, p.y, g.x, g.y) > ABILITY.dartRange) return w.hint(client, "Too far away. Get closer.");
      if (!hasLineOfSight(w.map, p.x, p.y, g.x, g.y)) return w.hint(client, "A wall is in the way.");
      w.state.darts--;
      w.guards[target].sleep();
      return;
    }

    case Skill.Tag: {
      // Carrying → drop here.
      if (p.carrying >= 0) return drop(w, p);
      // Tied guard nearby → pick up.
      const tied = nearestGuard(w, p, ABILITY.carryRange, (g) => g.state.status === "tied");
      if (tied >= 0) {
        const g = w.guards[tied].state;
        g.status = "carried";
        g.covered = false;
        p.carrying = tied;
        p.crawling = false;
        return;
      }
      // Sleeping / netted guard, or awake guard from behind (outside his cone) → tie.
      const target = nearestGuard(
        w, p, ABILITY.tieRange,
        (g) => g.state.status === "asleep" || g.state.status === "netted" || g.active,
      );
      if (target === -1) return w.hint(client, "Get closer to a robot.");
      const g = w.guards[target];
      if (g.active) {
        const toPlayer = Math.atan2(p.y - g.state.y, p.x - g.state.x);
        if (Math.abs(angleDiff(toPlayer, g.state.angle)) <= VISION.halfFov || g.state.alert > 0) {
          return w.hint(client, "It can see you! Sneak up from behind.");
        }
      }
      g.tie();
      return;
    }

    case Skill.Dig: {
      if (p.buried) return startBusy(p, "getup", ABILITY.getUpSeconds, -1);
      if (p.carrying >= 0) return w.hint(client, "Drop the robot first.");
      const tied = nearestGuard(w, p, ABILITY.coverRange, (g) => g.state.status === "tied" && !g.state.covered);
      if (tied >= 0) {
        w.stopPath(client.sessionId);
        return startBusy(p, "cover", ABILITY.coverSeconds, tied);
      }
      if (tileAt(w.map, tileOf(p.x), tileOf(p.y)) === Tile.Snow) {
        w.stopPath(client.sessionId);
        p.buried = true;
        p.crawling = false;
        return;
      }
      return w.hint(client, "Stand on snow to burrow, or next to a tied robot to cover it.");
    }

    case Skill.Trap:
      return placeTrap(w, client, p, kind ?? "", x!, y!);

    case Skill.Disguise: {
      if (!p.disguised) {
        w.stopPath(client.sessionId);
        return startBusy(p, "dress", ABILITY.uniformSeconds, -1);
      }
      const near = nearestGuard(w, p, ABILITY.chatRange, (g) => g.state.status === "patrol");
      if (near === -1) {
        p.disguised = false;
        p.suspicion = 0;
        return;
      }
      const g = w.guards[near];
      if (g.state.officer) return w.hint(client, "Boss robots can't be fooled!");
      if (g.state.dog) return w.hint(client, "Robot dogs don't chat!");
      g.chat(p.x, p.y);
      return;
    }

    case Skill.Fix: {
      const target = nearestFixable(w, p);
      if (!target) return w.hint(client, "Stand next to a door, fence or panel.");
      w.stopPath(client.sessionId);
      busy.set(p, { kind: "fix", left: target.seconds, total: target.seconds, guard: -1, tx: target.tx, ty: target.ty });
      p.action = "fix";
      p.progress = 0;
      return;
    }
  }
}

/** Closest door / fence / panel within reach of the player. */
export function nearestFixable(w: { map: GridMap }, p: { x: number; y: number }) {
  const px = tileOf(p.x);
  const py = tileOf(p.y);
  let best: { tx: number; ty: number; seconds: number; d: number } | undefined;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const fix = FIXES[tileAt(w.map, px + dx, py + dy)];
      if (!fix) continue;
      const d = distTiles(p.x, p.y, (px + dx + 0.5) * TILE_SIZE, (py + dy + 0.5) * TILE_SIZE);
      if (d <= ABILITY.fixRange && (!best || d < best.d)) best = { tx: px + dx, ty: py + dy, seconds: fix.seconds, d };
    }
  }
  return best;
}

function placeTrap(w: World, client: Client, p: Player, kind: string, x: number, y: number) {
  const s = w.state;
  const tx = tileOf(x);
  const ty = tileOf(y);
  const cx = (tx + 0.5) * TILE_SIZE;
  const cy = (ty + 0.5) * TILE_SIZE;

  if (kind === "noise") {
    if (s.noise <= 0) return w.hint(client, "No noise makers left!");
    if (distTiles(p.x, p.y, cx, cy) > ABILITY.noiseThrowRange) return w.hint(client, "Too far to throw.");
    if (!hasLineOfSight(w.map, p.x, p.y, cx, cy)) return w.hint(client, "A wall is in the way.");
    s.noise--;
    w.noise(cx, cy);
    return;
  }

  if (kind !== "glue" && kind !== "net") return;
  const left = kind === "glue" ? s.glue : s.nets;
  if (left <= 0) return w.hint(client, kind === "glue" ? "No glue left!" : "No nets left!");
  if (distTiles(p.x, p.y, cx, cy) > ABILITY.trapPlaceRange) return w.hint(client, "Put traps close to you.");
  if (!isWalkable(w.map, tx, ty)) return w.hint(client, "You can't put a trap there.");
  if (s.traps.some((t) => tileOf(t.x) === tx && tileOf(t.y) === ty)) return w.hint(client, "There's already a trap there.");
  if (kind === "glue") s.glue--;
  else s.nets--;
  const trap = new Trap();
  trap.kind = kind;
  trap.x = cx;
  trap.y = cy;
  s.traps.push(trap);
}

/** Per-tick: guards that walk onto a glue / net trap get caught. */
export function updateTraps(w: World) {
  const traps = w.state.traps;
  for (let i = traps.length - 1; i >= 0; i--) {
    const t = traps[i];
    const victim = w.guards.find(
      (g) => g.state.status === "patrol" && distTiles(g.state.x, g.state.y, t.x, t.y) <= ABILITY.trapTriggerRange,
    );
    if (!victim) continue;
    if (t.kind === "glue") victim.stick();
    else victim.net();
    traps.splice(i, 1);
  }
}

function drop(w: World, p: Player) {
  const g = w.guards[p.carrying].state;
  p.carrying = -1;
  g.status = "tied";
  g.x = (tileOf(p.x) + 0.5) * TILE_SIZE;
  g.y = (tileOf(p.y) + 0.5) * TILE_SIZE;
  // Dropped into a bush = hidden.
  g.covered = isBush(tileAt(w.map, tileOf(g.x), tileOf(g.y)));
}

function startBusy(p: Player, kind: Busy["kind"], seconds: number, guard: number) {
  busy.set(p, { kind, left: seconds, total: seconds, guard });
  p.action = kind;
  p.progress = 0;
}

/** Any move cancels a timed action. */
export function cancelBusy(p: Player) {
  busy.delete(p);
  p.action = "";
  p.progress = 0;
}

/** Called when a player taps to move. Returns false if they can't move right now. */
export function beforeMove(p: Player): boolean {
  if (p.buried) {
    if (!busy.has(p)) startBusy(p, "getup", ABILITY.getUpSeconds, -1);
    return false;
  }
  cancelBusy(p);
  return true;
}

/** Per-tick: hiding, carried guards follow, timed actions progress. */
export function updateAbilities(w: World, dt: number) {
  w.state.players.forEach((p) => {
    p.hidden = !p.buried && isBush(tileAt(w.map, tileOf(p.x), tileOf(p.y)));

    if (p.carrying >= 0) {
      const g = w.guards[p.carrying].state;
      g.x = p.x;
      g.y = p.y - 3;
    }

    const b = busy.get(p);
    if (!b) return;
    b.left -= dt;
    p.progress = Math.round(100 * (1 - Math.max(0, b.left) / b.total));
    if (b.left > 0) return;
    if (b.kind === "getup") p.buried = false;
    if (b.kind === "dress") {
      p.disguised = true;
      p.suspicion = 0;
    }
    if (b.kind === "fix" && b.tx !== undefined && b.ty !== undefined) {
      const fix = FIXES[tileAt(w.map, b.tx, b.ty)];
      if (fix) {
        w.setTile(b.tx, b.ty, fix.to);
        w.news(`${p.nickname} ${fix.news}!`);
      }
    }
    if (b.kind === "cover") {
      const g = w.guards[b.guard]?.state;
      if (g && g.status === "tied") g.covered = true;
    }
    cancelBusy(p);
  });
}

/** Reset a player's ability state (checkpoint restart, level start). */
export function resetAbilities(p: Player) {
  cancelBusy(p);
  p.hidden = false;
  p.buried = false;
  p.carrying = -1;
  p.disguised = false;
  p.suspicion = 0;
}
