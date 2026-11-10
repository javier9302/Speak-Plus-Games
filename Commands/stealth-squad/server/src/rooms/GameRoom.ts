import { Room, type Client } from "@colyseus/core";
import {
  ABILITY,
  CRAWL_SPEED,
  DOG,
  LIGHT_FILL_SECONDS,
  searchlightSpot,
  HOST_RECONNECT_SECONDS,
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  RECONNECT_SECONDS,
  SERVER_TICK_HZ,
  Skill,
  SPOTTED_SECONDS,
  TILE_SIZE,
  Tile,
  VISION,
  WALK_SPEED,
  assignSkills,
  cloneMap,
  getDifficulty,
  getLevel,
  isDifficulty,
  setTile,
  tileAt,
  detectionRate,
  findPath,
  isRole,
  nearestWalkable,
  type GridMap,
  type JoinOptions,
  type LevelDef,
  type TilePoint,
} from "@stealth-squad/shared";
import { Ally, GameState, Light, Player } from "./schema.js";
import { GuardSim } from "../sim/GuardSim.js";
import { countBytes, recordTick, registerRoom, unregisterRoom } from "../metrics.js";
import { beforeMove, resetAbilities, updateAbilities, updateTraps, useSkill, type World } from "./abilities.js";

export { GameState, Player };

const tileCenter = (t: number) => t * TILE_SIZE + TILE_SIZE / 2;

// Room codes: 4 letters, no I/O so they can't be confused with 1/0.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const codesInUse = new Set<string>();
function newRoomCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join("");
  } while (codesInUse.has(code));
  codesInUse.add(code);
  return code;
}

/**
 * One class = one room. Created by the teacher's host screen (`create` with
 * `{host: true}`); its roomId is a short code that phones join with
 * `joinById(code, {nickname})`. Phases: lobby (pick roles) → playing.
 */
export class GameRoom extends Room<GameState> {
  // 6 players + the host screen.
  maxClients = MAX_PLAYERS + 1;
  private level: LevelDef = getLevel("");
  /** This room's own copy: doors open, fences get cut. */
  private map: GridMap = cloneMap(this.level.map);
  private guards: GuardSim[] = [];
  /** Alert meters 0–1 per guard (synced as 0–100 in Guard.alert). */
  private meters: number[] = [];
  private spottedTimer = 0;
  private world!: World;
  private tickCount = 0;
  /** Remaining waypoints (world pixels) per session. Server-only, not synced. */
  private paths = new Map<string, { x: number; y: number }[]>();
  private hostSessionId = "";
  private startedAt = 0;
  /** Item / rescue objective index → checkpoint the team was at when it was done. */
  private itemTakenAt = new Map<number, number>();
  /** Seconds since the last (re)start: drives searchlight sweeps. */
  private lightTime = 0;
  private lightMeters: number[] = [];
  /** Rescued friends: who they follow and their current path (server-only). */
  private allyFollow = new Map<Ally, { leader: string; path: { x: number; y: number }[]; repath: number }>();
  private nextSlot = 0;

  onCreate(options: JoinOptions) {
    // Only the host screen may open a room; phones always join an existing code.
    if (!options?.host) throw new Error("Rooms are created from the host screen.");
    this.roomId = newRoomCode();
    this.setState(new GameState());
    this.state.code = this.roomId;
    this.world = {
      state: this.state,
      map: this.map,
      guards: this.guards,
      stopPath: (id) => this.paths.delete(id),
      hint: (client, text) => client.send("hint", { type: "hint", text }),
      ping: (x, y, by) => this.broadcast("ping", { type: "ping", x, y, by }),
      news: (text) => this.broadcast("news", { type: "news", text }),
      setTile: (tx, ty, tile) => {
        setTile(this.map, tx, ty, tile);
        this.state.tiles.set(String(ty * this.map.width + tx), tile);
      },
      noise: (x, y) => {
        this.broadcast("noise", { type: "noise", x, y });
        for (const g of this.guards) {
          if (Math.hypot(g.state.x - x, g.state.y - y) / TILE_SIZE <= ABILITY.noiseHearRange) g.investigate(x, y);
        }
      },
    };
    this.loadLevel(this.level.id);

    this.onMessage("ping", (client, message: { t: number }) => {
      client.send("pong", { type: "pong", t: message?.t ?? 0 });
    });

    this.onMessage("moveTo", (client, message: { tx: number; ty: number }) => {
      if (this.state.phase !== "playing" || this.state.paused) return;
      const player = this.state.players.get(client.sessionId);
      if (player && beforeMove(player)) this.handleMoveTo(client, message);
    });

    this.onMessage("crawl", (client, message: { on: boolean }) => {
      const player = this.state.players.get(client.sessionId);
      // Can't crawl while carrying a guard (or buried).
      if (player && player.carrying < 0 && !player.buried) player.crawling = !!message?.on;
    });

    this.onMessage("use", (client, message: { skill: string; x?: number; y?: number; kind?: string }) => {
      if (this.state.phase !== "playing" || this.state.paused) return;
      const player = this.state.players.get(client.sessionId);
      if (player) {
        useSkill(this.world, client, player, String(message?.skill), Number(message?.x), Number(message?.y), String(message?.kind ?? ""));
      }
    });

    // Host moves a skill to another player (lobby or mid-game, e.g. after a disconnect).
    this.onMessage("moveSkill", (client, message: { skill: string; to: string }) => {
      if (!this.isHost(client)) return;
      const to = this.state.players.get(message?.to);
      const skill = String(message?.skill);
      if (!to || to.skills.includes(skill)) return;
      this.state.players.forEach((p) => {
        const i = p.skills.indexOf(skill);
        if (i >= 0) p.skills.splice(i, 1);
      });
      to.skills.push(skill);
    });

    this.onMessage("pickRole", (client, message: { role: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== "lobby") return;
      const role = message?.role;
      if (role === "") player.role = "";
      else if (isRole(role) && !this.roleHolder(role)) player.role = role;
      this.recomputeSkills();
    });

    this.onMessage("assignRole", (client, message: { sessionId: string; role: string }) => {
      if (!this.isHost(client)) return;
      const player = this.state.players.get(message?.sessionId);
      const role = message?.role;
      if (!player || (role !== "" && !isRole(role))) return;
      // Swap: whoever had this role gets the target player's old role.
      const holder = role ? this.roleHolder(role) : undefined;
      if (holder && holder !== player) holder.role = player.role;
      player.role = role;
      if (this.state.phase === "lobby") this.recomputeSkills();
    });

    this.onMessage("setLevel", (client, message: { id: string }) => {
      if (!this.isHost(client) || this.state.phase !== "lobby") return;
      this.loadLevel(String(message?.id));
    });

    this.onMessage("setDifficulty", (client, message: { id: string }) => {
      if (!this.isHost(client) || this.state.phase !== "lobby" || !isDifficulty(message?.id)) return;
      this.state.difficulty = message.id;
    });

    // Start → briefing (everyone reads the mission + role card) → beginMission → playing.
    this.onMessage("start", (client) => {
      if (!this.isHost(client) || this.state.players.size === 0) return;
      this.startLevel();
      this.state.phase = "briefing";
    });

    this.onMessage("beginMission", (client) => {
      if (!this.isHost(client) || this.state.phase !== "briefing") return;
      this.state.phase = "playing";
      this.startedAt = Date.now();
    });

    this.onMessage("backToLobby", (client) => {
      if (!this.isHost(client)) return;
      this.state.phase = "lobby";
      this.state.paused = false;
      this.paths.clear();
    });

    this.onMessage("pause", (client, message: { on: boolean }) => {
      if (!this.isHost(client) || this.state.phase === "lobby") return;
      this.state.paused = !!message?.on;
      if (!this.state.paused) this.state.pauseReason = "";
    });

    this.onMessage("restartLevel", (client) => {
      if (!this.isHost(client) || this.state.phase === "lobby") return;
      this.startLevel();
      this.startedAt = Date.now();
    });

    // Teacher shortcut (short lesson, stuck team) and handy for testing levels.
    this.onMessage("skipCheckpoint", (client) => {
      if (!this.isHost(client) || this.state.phase === "lobby") return;
      if (this.state.checkpoint + 1 >= this.level.checkpoints.length) return;
      this.state.checkpoint++;
      this.restartFromCheckpoint();
    });

    this.setSimulationInterval((dt) => {
      const t0 = performance.now();
      this.tick(dt);
      recordTick(performance.now() - t0);
    }, 1000 / SERVER_TICK_HZ);
    registerRoom(this.roomId, () => {
      const players = [...this.state.players.values()];
      return {
        code: this.roomId,
        level: this.level.name,
        phase: this.state.paused ? `${this.state.phase} (paused)` : this.state.phase,
        players: players.length,
        connected: players.filter((p) => p.connected).length,
        host: this.state.hostConnected,
      };
    });
    console.log(`[GameRoom] created, code ${this.roomId}`);
  }

  onAuth(_client: Client, options: JoinOptions) {
    if (options?.host) {
      if (this.hostSessionId) throw new Error("This room already has a host screen.");
      return true;
    }
    if (this.state.players.size >= MAX_PLAYERS) throw new Error("This room is full (6 players).");
    const nickname = String(options?.nickname ?? "").trim();
    if (!nickname) throw new Error("Please enter a nickname.");
    return true;
  }

  onJoin(client: Client, options: JoinOptions) {
    countBytes(client);
    if (options?.host) {
      this.hostSessionId = client.sessionId;
      this.state.hostConnected = true;
      console.log(`[GameRoom ${this.roomId}] host joined`);
    } else {
      const player = new Player();
      player.nickname = String(options.nickname).trim().slice(0, 12);
      player.slot = this.nextSlot++;
      this.state.players.set(client.sessionId, player);
      // Late joiner during a level: drop them in at a spawn point (the host can give them skills).
      if (this.state.phase !== "lobby") this.placeAtSpawn(player, player.slot);
      else this.recomputeSkills();
      console.log(
        `[GameRoom ${this.roomId}] ${player.nickname} joined (${this.state.players.size}/${MAX_PLAYERS})`,
      );
    }
    client.send("welcome", { type: "welcome", sessionId: client.sessionId, protocol: PROTOCOL_VERSION });
  }

  async onLeave(client: Client, consented: boolean) {
    const isHost = client.sessionId === this.hostSessionId;
    const player = this.state.players.get(client.sessionId);

    if (isHost) this.state.hostConnected = false;
    if (player) {
      player.connected = false;
      this.paths.delete(client.sessionId);
      // Mid-level: pause so the team isn't missing skills; the host can hand them over.
      if (this.state.phase !== "lobby" && player.skills.length) {
        this.state.paused = true;
        this.state.pauseReason = `${player.nickname} lost connection`;
      }
    }

    // Phones drop all the time (screen lock, app switch). Hold the slot so a
    // reload or reopening the tab rejoins as the same player.
    if (!consented) {
      try {
        const back = await this.allowReconnection(client, isHost ? HOST_RECONNECT_SECONDS : RECONNECT_SECONDS);
        countBytes(back);
        if (isHost) this.state.hostConnected = true;
        if (player) {
          player.connected = true;
          // Their own drop paused the game: carry on automatically.
          if (this.state.pauseReason === `${player.nickname} lost connection`) {
            this.state.paused = false;
            this.state.pauseReason = "";
          }
        }
        console.log(`[GameRoom ${this.roomId}] ${isHost ? "host" : player?.nickname} reconnected`);
        return;
      } catch {
        // Timed out: fall through and remove.
      }
    }

    if (isHost) {
      console.log(`[GameRoom ${this.roomId}] host gone, closing room`);
      this.disconnect();
      return;
    }
    this.state.players.delete(client.sessionId);
    if (player && this.state.phase === "lobby") this.recomputeSkills();
    else if (player?.skills.length) {
      // Gone for good mid-level: the team must keep every skill.
      const heir = [...this.state.players.values()]
        .filter((p) => p.connected)
        .sort((a, b) => a.skills.length - b.skills.length)[0];
      if (heir) {
        for (const s of player.skills) if (!heir.skills.includes(s)) heir.skills.push(s);
        this.state.pauseReason = `${player.nickname} left — ${heir.nickname} has their skills now`;
      }
    }
    console.log(`[GameRoom ${this.roomId}] ${player?.nickname ?? client.sessionId} left`);
  }

  onDispose() {
    codesInUse.delete(this.roomId);
    unregisterRoom(this.roomId);
    console.log(`[GameRoom ${this.roomId}] disposed`);
  }

  private isHost(client: Client) {
    return client.sessionId === this.hostSessionId;
  }

  private roleHolder(role: string): Player | undefined {
    for (const p of this.state.players.values()) if (p.role === role) return p;
    return undefined;
  }

  /**
   * Lobby: skills = own role + merged skills of roles nobody picked (brief's
   * table). Runs on every roster / role change; the host's manual moves after
   * that are kept when the level starts.
   */
  private recomputeSkills() {
    const ordered = [...this.state.players.values()].sort((a, b) => a.slot - b.slot);
    const { skills } = assignSkills(ordered.map((p) => p.role));
    ordered.forEach((p, i) => {
      p.skills.clear();
      p.skills.push(...skills[i]);
    });
  }

  private startLevel() {
    // Players who never picked a role get the one the merge table gave them.
    const ordered = [...this.state.players.values()].sort((a, b) => a.slot - b.slot);
    const { roles } = assignSkills(ordered.map((p) => p.role));
    ordered.forEach((p, i) => (p.role = roles[i]));
    // Fresh map: doors closed, fences whole.
    this.map.tiles.splice(0, this.map.tiles.length, ...this.level.map.tiles);
    this.state.tiles.clear();
    this.state.objectivesDone.forEach((_, i) => (this.state.objectivesDone[i] = false));
    this.state.players.forEach((p) => (p.item = ""));
    this.itemTakenAt.clear();
    this.allyFollow.clear();
    this.level.objectives.forEach((o) => {
      if (o.kind !== "rescue") return;
      const a = this.state.allies.find((x) => x.name === o.name);
      if (!a) return;
      a.freed = false;
      a.moving = false;
      a.x = tileCenter(o.x);
      a.y = tileCenter(o.y);
    });
    this.state.spottedCount = 0;
    this.state.missionSeconds = 0;
    this.state.checkpoint = 0;
    this.state.paused = false;
    this.state.pauseReason = "";
    this.restartFromCheckpoint();
    console.log(`[GameRoom ${this.roomId}] level started with ${this.state.players.size} players`);
  }

  /** Everyone back to the current checkpoint; guards back to the start of their routes. */
  private restartFromCheckpoint() {
    // Items taken since this checkpoint go back (grab-and-get-caught doesn't count).
    for (const [i, cp] of this.itemTakenAt) {
      if (cp !== this.state.checkpoint) continue;
      const o = this.level.objectives[i];
      this.state.objectivesDone[i] = false;
      this.state.players.forEach((p) => {
        if (o.kind === "item" && p.item === o.item) p.item = "";
      });
      if (o.kind === "rescue") {
        // Back to the cell.
        const ally = this.state.allies.find((a) => a.name === o.name);
        if (ally) {
          ally.freed = false;
          ally.x = tileCenter(o.x);
          ally.y = tileCenter(o.y);
          this.allyFollow.delete(ally);
        }
      }
      this.itemTakenAt.delete(i);
    }
    // Friends rescued before this checkpoint restart with the team.
    const spawns = this.level.checkpoints[this.state.checkpoint].spawns;
    this.state.allies.forEach((a) => {
      if (!a.freed) return;
      const s = spawns[spawns.length - 1];
      a.x = tileCenter(s.x);
      a.y = tileCenter(s.y);
      a.moving = false;
      const f = this.allyFollow.get(a);
      if (f) f.path = [];
    });
    this.lightTime = 0;
    this.lightMeters = this.lightMeters.map(() => 0);
    // Spawn in join order so the same people stand next to each other each time.
    const ordered = [...this.state.players.values()].sort((a, b) => a.slot - b.slot);
    ordered.forEach((p, i) => {
      this.placeAtSpawn(p, i);
      p.crawling = false;
      p.moving = false;
      resetAbilities(p);
    });
    this.paths.clear();
    const d = getDifficulty(this.state.difficulty);
    this.guards.forEach((g) => {
      g.tune = { waitJitter: d.waitJitter, freeSeconds: d.freeSeconds };
      g.reset();
    });
    this.state.darts = d.darts;
    this.state.glue = d.glue;
    this.state.nets = d.nets;
    this.state.noise = d.noise;
    this.state.traps.clear();
    this.meters.fill(0);
    this.state.countdown = 0;
    this.state.spottedName = "";
    this.state.spottedText = "";
    this.state.phase = "playing";
  }

  /** Switch level (lobby): map, guards, objectives. Same map/guards objects so World & GuardSims stay wired. */
  private loadLevel(id: string) {
    this.level = getLevel(id);
    Object.assign(this.map, cloneMap(this.level.map));
    this.guards.length = 0;
    this.state.guards.clear();
    this.meters.length = 0;
    for (const def of this.level.guards) {
      const g = new GuardSim(def, this.map);
      this.guards.push(g);
      this.state.guards.push(g.state);
      this.meters.push(0);
    }
    this.state.objectivesDone.clear();
    this.level.objectives.forEach(() => this.state.objectivesDone.push(false));
    this.state.night = !!this.level.night;
    this.state.lights.clear();
    this.lightMeters = [];
    for (const def of this.level.searchlights ?? []) {
      const l = new Light();
      l.towerX = tileCenter(def.tower.x);
      l.towerY = tileCenter(def.tower.y);
      l.radius = def.radius * TILE_SIZE;
      this.state.lights.push(l);
      this.lightMeters.push(0);
    }
    this.state.allies.clear();
    this.allyFollow.clear();
    for (const o of this.level.objectives) {
      if (o.kind !== "rescue") continue;
      const a = new Ally();
      a.name = o.name;
      a.x = tileCenter(o.x);
      a.y = tileCenter(o.y);
      this.state.allies.push(a);
    }
    this.state.tiles.clear();
    this.state.traps.clear();
    this.state.checkpoint = 0;
    this.state.levelId = this.level.id;
  }

  private placeAtSpawn(player: Player, index: number) {
    const spawns = this.level.checkpoints[this.state.checkpoint].spawns;
    const spawn = spawns[index % spawns.length];
    player.x = tileCenter(spawn.x);
    player.y = tileCenter(spawn.y);
  }

  private handleMoveTo(client: Client, message: { tx: number; ty: number }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const tx = Math.floor(Number(message?.tx));
    const ty = Math.floor(Number(message?.ty));
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;

    const from: TilePoint = {
      x: Math.floor(player.x / TILE_SIZE),
      y: Math.floor(player.y / TILE_SIZE),
    };
    const target = nearestWalkable(this.map, { x: tx, y: ty });
    const tiles = target && findPath(this.map, from, target);
    if (!target || !tiles) {
      client.send("path", { type: "path", ok: false, tx, ty });
      return;
    }

    // Re-centre on the current tile first so a mid-step re-route can't cut
    // diagonally across a wall corner.
    const waypoints = [{ x: tileCenter(from.x), y: tileCenter(from.y) }];
    for (const t of tiles) waypoints.push({ x: tileCenter(t.x), y: tileCenter(t.y) });
    this.paths.set(client.sessionId, waypoints);
    client.send("path", { type: "path", ok: true, tx: target.x, ty: target.y });
  }

  /** One server step. `dtMs` is in milliseconds. */
  private tick(dtMs: number) {
    const phase = this.state.phase;
    if (phase === "lobby" || phase === "briefing" || phase === "won" || this.state.paused) return;
    const dt = dtMs / 1000;

    if (this.state.phase === "spotted") {
      this.spottedTimer -= dt;
      this.state.countdown = Math.max(0, Math.ceil(this.spottedTimer));
      if (this.spottedTimer <= 0) {
        // Hard: too many alarms → the whole mission again (time and count restart too).
        const max = getDifficulty(this.state.difficulty).maxSpotted;
        if (max && this.state.spottedCount >= max) {
          this.startLevel();
          this.startedAt = Date.now();
        } else this.restartFromCheckpoint();
      }
      return;
    }

    this.movePlayers(dt);
    this.moveAllies(dt);
    updateAbilities(this.world, dt);
    updateTraps(this.world);
    this.updateLights(dt);
    this.updateGuards(dt);
    if (this.state.phase === "playing") {
      this.checkCheckpoints();
      this.checkObjectives();
    }
    if (++this.tickCount % 4 === 0) this.sendIntel();
  }

  private movePlayers(dt: number) {
    this.state.players.forEach((player, id) => {
      const path = this.paths.get(id);
      if (!path || path.length === 0) {
        player.moving = false;
        return;
      }
      const carry = player.carrying >= 0 ? ABILITY.carrySpeedFactor : 1;
      const speed = (player.crawling ? CRAWL_SPEED : WALK_SPEED) * carry * TILE_SIZE;
      let budget = speed * dt;
      while (budget > 0 && path.length) {
        const wp = path[0];
        const dx = wp.x - player.x;
        const dy = wp.y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= budget) {
          player.x = wp.x;
          player.y = wp.y;
          budget -= dist;
          path.shift();
        } else {
          player.x += (dx / dist) * budget;
          player.y += (dy / dist) * budget;
          budget = 0;
        }
      }
      player.moving = path.length > 0;
    });
  }

  /** Detection: each guard's meter fills while it sees anyone, drains otherwise. */
  private updateGuards(dt: number) {
    /** Disguised players some guard is looking at this tick. */
    const watched = new Set<Player>();
    const d = getDifficulty(this.state.difficulty);
    this.guards.forEach((guard, i) => {
      const g = guard.state;
      if (!guard.active) {
        this.meters[i] = 0;
        guard.update(dt, false); // sleep timer
        return;
      }
      const woke = g.woke ? ABILITY.wokeRangeFactor : 1;
      const sight = {
        rangeFactor: woke * (g.dog ? DOG.sightFactor : 1) * d.sightFactor,
        fillFactor: (g.woke ? ABILITY.wokeFillFactor : 1) * d.fillFactor,
        smell: g.dog ? DOG.smellRange : undefined,
      };

      let rate = 0;
      let seenName = "";
      this.state.players.forEach((p) => {
        if (!p.connected || p.buried) return;
        const r = detectionRate(this.map, g.x, g.y, g.angle, p.x, p.y, {
          ...sight,
          crawling: p.crawling,
          hidden: p.hidden,
        });
        // A uniform fools ordinary guards for a while (suspicion builds, see below).
        if (r > 0 && p.disguised && !g.officer && !g.dog) {
          watched.add(p);
          return;
        }
        if (r > rate) {
          rate = r;
          seenName = p.nickname;
        }
      });
      // A rescued friend can't crawl or hide.
      this.state.allies.forEach((a) => {
        if (!a.freed) return;
        const r = detectionRate(this.map, g.x, g.y, g.angle, a.x, a.y, sight);
        if (r > rate) {
          rate = r;
          seenName = "Our friend";
        }
      });

      this.meters[i] = rate > 0
        ? Math.min(1, this.meters[i] + rate * dt)
        : Math.max(0, this.meters[i] - VISION.decayPerSecond * dt);
      g.alert = Math.round(this.meters[i] * 100);

      if (this.state.phase === "playing") {
        if (this.meters[i] >= 1 && seenName) {
          this.spotted(g.dog ? `The robot dog found ${seenName === "Our friend" ? "our friend" : seenName}!` : `${seenName} was spotted!`, seenName);
        } else if (!g.dog) this.checkEvidence(i, sight);
      }
      guard.update(dt, this.meters[i] > 0);
    });
    this.updateSuspicion(dt, watched);
  }

  /** Searchlights sweep; anyone in a spot (not in a bush / burrowed) is seen in ~0.5 s. Off when their panel is switched off. */
  private updateLights(dt: number) {
    this.lightTime += dt;
    (this.level.searchlights ?? []).forEach((def, i) => {
      const l = this.state.lights[i];
      if (!l) return;
      const spot = searchlightSpot(def, this.lightTime, TILE_SIZE);
      l.x = spot.x;
      l.y = spot.y;
      l.on = !def.panel || tileAt(this.map, def.panel.x, def.panel.y) !== Tile.PanelOff;
      let lit = "";
      if (l.on) {
        this.state.players.forEach((p) => {
          if (p.connected && !p.buried && !p.hidden && Math.hypot(p.x - l.x, p.y - l.y) <= l.radius) lit ||= p.nickname;
        });
        this.state.allies.forEach((a) => {
          if (a.freed && Math.hypot(a.x - l.x, a.y - l.y) <= l.radius) lit ||= "our friend";
        });
      }
      this.lightMeters[i] = lit
        ? this.lightMeters[i] + dt / LIGHT_FILL_SECONDS
        : Math.max(0, this.lightMeters[i] - dt);
      if (lit && this.lightMeters[i] >= 1 && this.state.phase === "playing") {
        this.spotted(`The searchlight found ${lit}!`, lit);
      }
    });
  }

  /** Rescued friends follow their leader (the rescuer, or the nearest player if they left). */
  private moveAllies(dt: number) {
    this.state.allies.forEach((a) => {
      const f = this.allyFollow.get(a);
      if (!a.freed || !f) return;
      let leader = this.state.players.get(f.leader);
      if (!leader?.connected) {
        // Hand over to the nearest connected player.
        let best = Infinity;
        this.state.players.forEach((p, id) => {
          const d = Math.hypot(p.x - a.x, p.y - a.y);
          if (p.connected && d < best) {
            best = d;
            f.leader = id;
            leader = p;
          }
        });
      }
      if (!leader) return;
      const dist = Math.hypot(leader.x - a.x, leader.y - a.y) / TILE_SIZE;
      f.repath -= dt;
      if (dist > 1.3 && f.repath <= 0) {
        f.repath = 0.4;
        const from = { x: Math.floor(a.x / TILE_SIZE), y: Math.floor(a.y / TILE_SIZE) };
        const to = { x: Math.floor(leader.x / TILE_SIZE), y: Math.floor(leader.y / TILE_SIZE) };
        const tiles = findPath(this.map, from, to) ?? [];
        tiles.pop(); // stop next to the leader, not on top
        f.path = tiles.map((t) => ({ x: tileCenter(t.x), y: tileCenter(t.y) }));
      }
      if (dist <= 1.1) f.path = [];
      let budget = WALK_SPEED * TILE_SIZE * dt;
      while (budget > 0 && f.path.length) {
        const wp = f.path[0];
        const dx = wp.x - a.x;
        const dy = wp.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d <= budget) {
          a.x = wp.x;
          a.y = wp.y;
          budget -= d;
          f.path.shift();
        } else {
          a.x += (dx / d) * budget;
          a.y += (dy / d) * budget;
          budget = 0;
        }
      }
      a.moving = f.path.length > 0;
    });
  }

  /** Disguise: being watched too long (5 s in total) gets you seen through; it fades when nobody looks. */
  private updateSuspicion(dt: number, watched: Set<Player>) {
    const step = (100 / ABILITY.suspicionSeconds) * dt;
    this.state.players.forEach((p) => {
      if (!p.disguised) return;
      p.suspicion = Math.round(Math.max(0, Math.min(100, p.suspicion + (watched.has(p) ? step : -step / 2))));
      if (p.suspicion >= 100 && this.state.phase === "playing") {
        this.spotted(`${p.nickname}'s costume was seen through!`, p.nickname);
      }
    });
  }

  /** A guard who sees an uncovered sleeping / tied colleague rings the alarm at once. */
  private checkEvidence(watcher: number, sight: { rangeFactor?: number; fillFactor?: number }) {
    const w = this.guards[watcher].state;
    for (const other of this.guards) {
      const o = other.state;
      if (other === this.guards[watcher] || o.covered) continue;
      if (o.status !== "asleep" && o.status !== "tied" && o.status !== "netted") continue;
      if (detectionRate(this.map, w.x, w.y, w.angle, o.x, o.y, sight) > 0) {
        const what = o.status === "asleep" ? "switched-off" : o.status === "netted" ? "netted" : "tied-up";
        this.spotted(`A robot found a ${what} robot!`, "");
        return;
      }
    }
  }

  /** Objectives done when their tile changed (radio off...); won when done + everyone is in the exit. */
  private checkObjectives() {
    this.level.objectives.forEach((o, i) => {
      if (o.kind === "fix") {
        const done = tileAt(this.map, o.x, o.y) === o.doneTile;
        if (this.state.objectivesDone[i] !== done) this.state.objectivesDone[i] = done;
        return;
      }
      if (this.state.objectivesDone[i]) return;
      if (o.kind === "rescue") {
        // Freed when someone reaches them (the cell door must be open for that).
        const ally = this.state.allies.find((a) => a.name === o.name);
        if (!ally) return;
        for (const [id, p] of this.state.players) {
          if (!p.connected || Math.hypot(p.x - ally.x, p.y - ally.y) / TILE_SIZE > 1.5) continue;
          ally.freed = true;
          this.allyFollow.set(ally, { leader: id, path: [], repath: 0 });
          this.state.objectivesDone[i] = true;
          this.itemTakenAt.set(i, this.state.checkpoint);
          this.broadcast("news", { type: "news", text: `${p.nickname} rescued our friend! They will follow you.` });
          break;
        }
        return;
      }
      // Item: first player to step on it takes it (stays taken after restarts).
      for (const p of this.state.players.values()) {
        if (!p.connected || Math.floor(p.x / TILE_SIZE) !== o.x || Math.floor(p.y / TILE_SIZE) !== o.y) continue;
        p.item = o.item;
        this.state.objectivesDone[i] = true;
        this.itemTakenAt.set(i, this.state.checkpoint);
        this.broadcast("news", { type: "news", text: `${p.nickname} stole the ${o.item}!` });
        break;
      }
    });
    if (this.state.objectivesDone.some((d) => !d)) return;
    const players = [...this.state.players.values()].filter((p) => p.connected);
    const e = this.level.exit;
    const inExit = (p: Player) => {
      const tx = Math.floor(p.x / TILE_SIZE);
      const ty = Math.floor(p.y / TILE_SIZE);
      return tx >= e.x && tx < e.x + e.w && ty >= e.y && ty < e.y + e.h;
    };
    const alliesIn = this.state.allies.every((a) => a.freed && inExit(a as unknown as Player));
    if (players.length && players.every(inExit) && alliesIn) {
      this.state.phase = "won";
      this.state.missionSeconds = Math.round((Date.now() - this.startedAt) / 1000);
      this.paths.clear();
      console.log(`[GameRoom ${this.roomId}] mission complete in ${this.state.missionSeconds}s`);
    }
  }

  private spotted(text: string, name: string) {
    this.state.spottedCount++;
    this.state.phase = "spotted";
    this.state.spottedName = name;
    this.state.spottedText = text;
    this.spottedTimer = SPOTTED_SECONDS;
    this.state.countdown = SPOTTED_SECONDS;
    this.paths.clear();
    this.state.players.forEach((p) => (p.moving = false));
    console.log(`[GameRoom ${this.roomId}] ${text} → checkpoint ${this.state.checkpoint}`);
  }

  /** Activate the furthest checkpoint whose zone contains everyone (or anyone, per level rule). */
  private checkCheckpoints() {
    const players = [...this.state.players.values()].filter((p) => p.connected);
    if (!players.length) return;
    const cps = this.level.checkpoints;
    for (let i = cps.length - 1; i > this.state.checkpoint; i--) {
      const cp = cps[i];
      const inside = (p: Player) => {
        const tx = Math.floor(p.x / TILE_SIZE);
        const ty = Math.floor(p.y / TILE_SIZE);
        return tx >= cp.x && tx < cp.x + cp.w && ty >= cp.y && ty < cp.y + cp.h;
      };
      const reached = this.level.checkpointRule === "one" ? players.some(inside) : players.every(inside);
      if (!reached) continue;
      this.state.checkpoint = i;
      this.broadcast("checkpoint", { type: "checkpoint", index: i, count: cps.length - 1 });
      console.log(`[GameRoom ${this.roomId}] checkpoint ${i} reached`);
      return;
    }
  }

  /** Turn timers go only to the Scout(s) and the host screen — information is individual. */
  private sendIntel() {
    // -1 = no countdown (tied / carried guards).
    const timers = this.guards.map((g) => {
      const t = g.timeUntilChange();
      return Number.isFinite(t) ? Math.round(t * 10) / 10 : -1;
    });
    for (const client of this.clients) {
      const p = this.state.players.get(client.sessionId);
      if (this.isHost(client) || p?.skills.includes(Skill.Eyes)) client.send("intel", { type: "intel", timers });
    }
  }
}
