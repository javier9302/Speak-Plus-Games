import {
  ABILITY,
  DOG,
  GUARD_SPEED,
  GUARD_TURN_SPEED,
  TILE_SIZE,
  angleDiff,
  findPath,
  nearestWalkable,
  type GridMap,
  type GuardDef,
} from "@stealth-squad/shared";
import { Guard } from "../rooms/schema.js";

const DEG = Math.PI / 180;
const center = (t: number) => t * TILE_SIZE + TILE_SIZE / 2;
const tileOf = (v: number) => Math.floor(v / TILE_SIZE);

type Pt = { x: number; y: number };

interface Stop {
  x: number;
  y: number;
  wait: number;
  look: number[]; // radians; empty = keep facing
}

/** Walk to a noise, look around, walk back to where the patrol was left. */
interface Detour {
  phase: "out" | "look" | "back";
  points: Pt[];
  lookLeft: number;
  back: Pt[];
}

/**
 * Server-side logic for one guard. Owns the synced `Guard` schema and moves
 * it along its route: walk a leg → stand at the stop, turning through its
 * `look` directions → next leg. Interruptions, in priority order:
 *   asleep (dart) / netted / tied / carried → out of play (on Hard, tied /
 *     netted ones free themselves after a while and walk back to the route)
 *   stuck (glue) → can't move, still sees
 *   alert meter filling → freezes
 *   chat (Disguise) → faces the chatter
 *   detour (noise maker) → walks over, looks around, walks back
 */
export class GuardSim {
  readonly state = new Guard();
  private stops: Stop[];
  /** Order of stop indices for one full round (loop or ping-pong). */
  private seq: number[];
  /** legs[i] = pixel waypoints from seq[i] to seq[i+1]. */
  private legs: Pt[][];

  private seqPos = 0;
  private mode: "walk" | "wait" = "wait";
  private legLeft: Pt[] = [];
  private lookIdx = 0;
  private segLeft = 0;
  private targetAngle = 0;
  private sleepLeft = 0;
  private stuckLeft = 0;
  private chatLeft = 0;
  /** Seconds until a tied / netted guard frees himself (0 = never). */
  private freeLeft = 0;
  private detour?: Detour;
  /** Difficulty settings (GameRoom sets them when a level starts). */
  tune = { waitJitter: 0, freeSeconds: 0 };
  private speed: number;

  constructor(def: GuardDef, private map: GridMap) {
    this.stops = def.stops.map((s) => ({
      x: center(s.x),
      y: center(s.y),
      wait: s.wait ?? 0,
      look: (s.look ?? []).map((d) => d * DEG),
    }));
    const n = this.stops.length;
    this.seq =
      n === 1 ? [0]
      : def.route === "pingpong" ? [...Array(n).keys(), ...[...Array(n - 2).keys()].map((i) => n - 2 - i)]
      : [...Array(n).keys()];
    this.legs = this.seq.map((from, i) => {
      const to = this.seq[(i + 1) % this.seq.length];
      const tiles = findPath(map, def.stops[from], def.stops[to]) ?? [];
      return tiles.map((t) => ({ x: center(t.x), y: center(t.y) }));
    });
    this.state.officer = !!def.officer;
    this.state.dog = !!def.dog;
    this.speed = GUARD_SPEED * TILE_SIZE * (def.dog ? DOG.speedFactor : 1);
    this.reset();
  }

  /** Back to the start of the route (checkpoint restart). */
  reset() {
    const first = this.stops[this.seq[0]];
    this.state.x = first.x;
    this.state.y = first.y;
    this.state.alert = 0;
    this.state.status = "patrol";
    this.state.covered = false;
    this.state.woke = false;
    this.sleepLeft = this.stuckLeft = this.chatLeft = this.freeLeft = 0;
    this.detour = undefined;
    this.seqPos = 0;
    // Initial facing: first look direction, else towards the next stop.
    const next = this.legs[0][0];
    this.state.angle = first.look[0] ?? (next ? Math.atan2(next.y - first.y, next.x - first.x) : 0);
    this.targetAngle = this.state.angle;
    this.arriveAt(0);
  }

  /** Can see and detect players (awake: patrolling or stuck in glue). */
  get active() {
    return this.state.status === "patrol" || this.state.status === "stuck";
  }

  /** Seconds until this guard next turns or moves on — the Scout's countdown. */
  timeUntilChange(): number {
    if (this.state.status === "asleep") return this.sleepLeft;
    if (this.state.status === "stuck") return this.stuckLeft;
    if ((this.state.status === "tied" || this.state.status === "netted") && this.freeLeft > 0) return this.freeLeft;
    if (!this.active) return Infinity;
    if (this.chatLeft > 0) return this.chatLeft;
    if (this.detour) {
      const d = this.detour;
      return d.phase === "look" ? d.lookLeft : this.pathTime(d.points) + (d.phase === "out" ? ABILITY.investigateSeconds : 0);
    }
    if (this.mode === "wait") return this.segLeft;
    return this.pathTime(this.legLeft);
  }

  /** Sleep dart hit: out for a while, then wakes up extra alert. */
  sleep() {
    this.state.status = "asleep";
    this.state.alert = 0;
    this.sleepLeft = ABILITY.sleepSeconds;
    this.chatLeft = 0;
  }

  /** Glue trap: can't walk for a while, but still looks around and sees. */
  stick() {
    this.state.status = "stuck";
    this.stuckLeft = ABILITY.glueSeconds;
  }

  /** Net trap: captured for good (until checkpoint restart); the Tagger can tie him. */
  net() {
    this.state.status = "netted";
    this.state.alert = 0;
    this.freeLeft = this.tune.freeSeconds;
  }

  /** Tied up: out of play until the next checkpoint restart. */
  tie() {
    this.state.status = "tied";
    this.state.alert = 0;
    // Tying a netted guard keeps the time he has already been struggling.
    if (this.freeLeft <= 0) this.freeLeft = this.tune.freeSeconds;
  }

  /** Disguise chat: turn to face (px, py) for a few seconds. */
  chat(px: number, py: number) {
    this.chatLeft = ABILITY.chatSeconds;
    this.targetAngle = Math.atan2(py - this.state.y, px - this.state.x);
  }

  /** Noise maker: walk over to (x, y), look around, come back. False if he can't get there. */
  investigate(x: number, y: number): boolean {
    if (this.state.status !== "patrol") return false;
    const from = { x: tileOf(this.state.x), y: tileOf(this.state.y) };
    const to = nearestWalkable(this.map, { x: tileOf(x), y: tileOf(y) });
    const out = to && findPath(this.map, from, to);
    if (!out) return false;
    // Way back = reverse of the way out, ending exactly where he left the route.
    const here = { x: this.state.x, y: this.state.y };
    const outPts = out.map((t) => ({ x: center(t.x), y: center(t.y) }));
    const back = [...outPts].reverse().slice(1);
    back.push({ x: center(from.x), y: center(from.y) }, here);
    this.detour = { phase: "out", points: outPts, lookLeft: ABILITY.investigateSeconds, back };
    return true;
  }

  /** `dt` in seconds. `frozen` = alert meter is filling. */
  update(dt: number, frozen: boolean) {
    const s = this.state;
    if (s.status === "asleep") {
      this.sleepLeft -= dt;
      if (this.sleepLeft <= 0) {
        // Picks up the patrol where he dozed off.
        s.status = "patrol";
        s.woke = true;
      }
      return;
    }
    if (s.status === "stuck") {
      this.stuckLeft -= dt;
      if (this.stuckLeft <= 0) s.status = "patrol";
      return;
    }
    // Carried guards can't wriggle free; the clock waits until he's dropped.
    if ((s.status === "tied" || s.status === "netted") && this.freeLeft > 0) {
      this.freeLeft -= dt;
      if (this.freeLeft <= 0) this.free();
      return;
    }
    if (s.status !== "patrol" || frozen) return;
    this.turnTowards(this.targetAngle, dt);

    if (this.chatLeft > 0) {
      this.chatLeft -= dt;
      return;
    }
    if (this.detour) return this.updateDetour(dt);

    if (this.mode === "wait") {
      this.segLeft -= dt;
      if (this.segLeft > 0) return;
      const stop = this.stops[this.seq[this.seqPos]];
      // More look directions at this stop: turn to the next one.
      if (this.lookIdx + 1 < stop.look.length) {
        this.lookIdx++;
        this.targetAngle = stop.look[this.lookIdx];
        this.segLeft = (stop.wait / stop.look.length) * this.jitter();
        return;
      }
      // Single-stop guard: cycle its look directions forever.
      if (this.seq.length === 1) {
        this.arriveAt(this.seqPos);
        return;
      }
      this.mode = "walk";
      this.legLeft = [...this.legs[this.seqPos]];
    }

    if (this.walk(this.legLeft, dt)) this.arriveAt((this.seqPos + 1) % this.seq.length);
  }

  /** Wriggled free: extra alert (like after a dart), walks back to where he left his route. */
  private free() {
    const s = this.state;
    s.status = "patrol";
    s.covered = false;
    s.woke = true;
    this.freeLeft = 0;
    const stop = this.stops[this.seq[this.seqPos]];
    const resume = this.mode === "walk" && this.legLeft.length ? this.legLeft[0] : stop;
    const path = findPath(this.map, { x: tileOf(s.x), y: tileOf(s.y) }, { x: tileOf(resume.x), y: tileOf(resume.y) }) ?? [];
    const points = path.map((t) => ({ x: center(t.x), y: center(t.y) }));
    points.push({ x: resume.x, y: resume.y });
    this.detour = { phase: "back", points, lookLeft: 0, back: [] };
  }

  private updateDetour(dt: number) {
    const d = this.detour!;
    if (d.phase === "out") {
      if (this.walk(d.points, dt)) d.phase = "look";
    } else if (d.phase === "look") {
      d.lookLeft -= dt;
      // Look around: a quarter turn every second.
      if (Math.floor(d.lookLeft) !== Math.floor(d.lookLeft + dt)) this.targetAngle += Math.PI / 2;
      if (d.lookLeft <= 0) {
        d.phase = "back";
        d.points = d.back;
      }
    } else if (this.walk(d.points, dt)) {
      this.detour = undefined;
      // Resume the patrol: face where he was going.
      const next = this.mode === "walk" ? this.legLeft[0] : undefined;
      const stop = this.stops[this.seq[this.seqPos]];
      this.targetAngle = next
        ? Math.atan2(next.y - this.state.y, next.x - this.state.x)
        : stop.look[this.lookIdx] ?? this.targetAngle;
    }
  }

  /** Move along `points` (consumed as reached) at guard speed. True when the list is empty. */
  private walk(points: Pt[], dt: number): boolean {
    let budget = this.speed * dt;
    while (budget > 0 && points.length) {
      const wp = points[0];
      const dx = wp.x - this.state.x;
      const dy = wp.y - this.state.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) this.targetAngle = Math.atan2(dy, dx);
      if (dist <= budget) {
        this.state.x = wp.x;
        this.state.y = wp.y;
        budget -= dist;
        points.shift();
      } else {
        this.state.x += (dx / dist) * budget;
        this.state.y += (dy / dist) * budget;
        budget = 0;
      }
    }
    return points.length === 0;
  }

  private pathTime(points: Pt[]): number {
    let dist = 0;
    let x = this.state.x;
    let y = this.state.y;
    for (const p of points) {
      dist += Math.hypot(p.x - x, p.y - y);
      x = p.x;
      y = p.y;
    }
    return dist / this.speed;
  }

  private arriveAt(seqPos: number) {
    this.seqPos = seqPos;
    const stop = this.stops[this.seq[seqPos]];
    this.mode = "wait";
    this.lookIdx = 0;
    if (stop.look.length) this.targetAngle = stop.look[0];
    this.segLeft = stop.look.length ? stop.wait / stop.look.length : stop.wait;
    this.segLeft *= this.jitter();
  }

  /** Hard: each wait is a bit longer or shorter, so a level can't be learned by heart. */
  private jitter() {
    return 1 + (Math.random() * 2 - 1) * this.tune.waitJitter;
  }

  private turnTowards(target: number, dt: number) {
    const d = angleDiff(target, this.state.angle);
    const step = GUARD_TURN_SPEED * dt;
    const a = Math.abs(d) <= step ? target : this.state.angle + Math.sign(d) * step;
    this.state.angle = Math.atan2(Math.sin(a), Math.cos(a)); // keep in (-π, π]
  }
}
