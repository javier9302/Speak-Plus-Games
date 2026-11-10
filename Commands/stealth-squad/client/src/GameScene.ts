import Phaser from "phaser";
import type { Room } from "colyseus.js";
import {
  ABILITY,
  AIMED_SKILLS,
  FIXES,
  PASSIVE_SKILLS,
  Skill,
  TILE_SIZE,
  TRAP_KINDS,
  Tile,
  cloneMap,
  getDifficulty,
  getLevel,
  setTile,
  tileAt,
  type GridMap,
  type LevelDef,
  type TrapKind,
} from "@stealth-squad/shared";
import { session } from "./session";
import { GuardLayer } from "./GuardLayer";
import { play } from "./sound";
import { createPlaceholderTextures } from "./textures";
import { CHAR_ORIGIN_Y, CHAR_TOP, Facing, costumeKey, faceOf, personKey, walkFrame, type Face } from "./sprites";
import type { HudScene, SkillButtonState } from "./HudScene";

/** How many tiles tall the view should roughly be; sets the camera zoom. */
const VIEW_TILES_TALL = 11;
/** A pointer that moves less than this (screen px) between down and up is a tap, not a drag. */
const TAP_SLOP = 14;

interface PlayerView {
  body: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  ring?: Phaser.GameObjects.Image;
  /** Snow mound shown instead of the body while burrowed. */
  mound: Phaser.GameObjects.Image;
  /** Texture now shown (role look, or the robot costume when disguised). */
  look: string;
  face: Face;
}

const SKILL_LABELS: Record<string, string> = {
  [Skill.Ping]: "Ping",
  [Skill.Dart]: "Dart",
  [Skill.Tag]: "Tie",
  [Skill.Dig]: "Burrow",
  [Skill.Trap]: "Trap",
  [Skill.Disguise]: "Costume",
  [Skill.Fix]: "Fix",
};
const AIM_HINTS: Record<string, string> = {
  [Skill.Ping]: "Tap the map to ping a spot",
  [Skill.Dart]: "Tap a robot to shoot a dart",
};
const TRAP_NAMES: Record<TrapKind, string> = { glue: "Glue", net: "Net", noise: "Noise" };
const TRAP_HINTS: Record<TrapKind, string> = {
  glue: "Tap next to you to put GLUE",
  net: "Tap next to you to put a NET",
  noise: "Tap a spot to throw a NOISE maker",
};

/**
 * The world: tilemap, every player's character, tap-to-move input and the
 * camera that follows your own character. Server state is the source of
 * truth; sprites smoothly chase the latest server positions (interpolation).
 * On the host screen (`session.spectator`) there is no input and the camera
 * shows the whole map.
 */
export class GameScene extends Phaser.Scene {
  private room?: Room;
  private mySessionId = "";
  /** Current level; rebuilt when the host picks another one (state.levelId). */
  private level!: LevelDef;
  /** Our own copy of the map; doors / fences change during play. */
  private map!: GridMap;
  private tilemap?: Phaser.Tilemaps.Tilemap;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  /** Exit zone + objective markers. */
  private goalGfx!: Phaser.GameObjects.Graphics;
  private drawnGoals = "";
  /** Night: a dark layer over the ground (characters, lights and cones stay bright). */
  private nightShade?: Phaser.GameObjects.Rectangle;
  /** Searchlight beams + spots (public: everyone sees lights). */
  private lightGfx!: Phaser.GameObjects.Graphics;
  /** Friends to rescue / rescued, by index in state.allies. */
  private allyViews: { body: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; face: Face }[] = [];
  /** Last phase seen, to play sounds / effects on changes. */
  private lastPhase = "";
  /** Truck / boat picture + "EXIT" label over the exit zone. */
  private exitSprite?: Phaser.GameObjects.Image;
  private exitLabel?: Phaser.GameObjects.Text;
  /** Items still waiting to be picked up (e.g. the plans). */
  private itemSprites: Phaser.GameObjects.Image[] = [];
  /** Tile changes from the server already applied (index → tile). */
  private appliedTiles = new Map<number, number>();
  private trapSprites: Phaser.GameObjects.Image[] = [];
  private guardLayer!: GuardLayer;
  private checkpointGfx!: Phaser.GameObjects.Graphics;
  private drawnCheckpoint = -1;
  private views = new Map<string, PlayerView>();
  private spectator = session.spectator;
  private marker!: Phaser.GameObjects.Image;
  private downAt?: { x: number; y: number; onUi: boolean };
  /** Aimed skill waiting for a map tap ("" = tapping moves). */
  private aimSkill = "";
  /** Which trap kind the Trap button is aiming. */
  private trapKind: TrapKind = "glue";

  constructor() {
    super("game");
  }

  private get hud() {
    return this.scene.get("hud") as HudScene;
  }

  create() {
    createPlaceholderTextures(this);
    this.checkpointGfx = this.add.graphics().setDepth(2);
    this.goalGfx = this.add.graphics().setDepth(2);
    this.lightGfx = this.add.graphics().setDepth(6);
    this.loadLevel(session.room?.state?.levelId ?? "");

    this.marker = this.add.image(0, 0, "marker").setVisible(false).setDepth(5);
    this.tweens.add({ targets: this.marker, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });

    this.cameras.main.setRoundPixels(true);
    this.scale.on("resize", this.applyZoom, this);

    if (!this.spectator) {
      this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
        this.downAt = { x: p.x, y: p.y, onUi: this.hud.hitsUi(p.x, p.y) };
      });
      this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    }

    this.scene.launch("hud");
    this.bindRoom(session.room!);
  }

  /** (Re)build everything that depends on the level: tilemap, guards, zones, camera. */
  private loadLevel(id: string) {
    this.level = getLevel(id);
    this.map = cloneMap(this.level.map);
    this.tilemap?.destroy();
    this.buildTilemap();
    this.guardLayer?.destroy();
    this.guardLayer = new GuardLayer(this, this.map);
    this.appliedTiles.clear();
    this.drawnCheckpoint = -1;
    this.drawnGoals = ` ${id}`; // force a redraw for the new level
    this.drawExit();
    this.nightShade?.destroy();
    this.nightShade = undefined;
    if (this.level.night) {
      const w = this.map.width * TILE_SIZE;
      const h = this.map.height * TILE_SIZE;
      this.nightShade = this.add.rectangle(w / 2, h / 2, w, h, 0x050a1e, 0.6).setDepth(1.5);
    }
    this.allyViews.forEach((v) => (v.body.destroy(), v.label.destroy()));
    this.allyViews = [];
    if (!this.spectator) {
      this.cameras.main.setBounds(0, 0, this.map.width * TILE_SIZE, this.map.height * TILE_SIZE);
    }
    this.applyZoom();
  }

  private buildTilemap() {
    const rows: number[][] = [];
    for (let y = 0; y < this.map.height; y++) {
      rows.push(this.map.tiles.slice(y * this.map.width, (y + 1) * this.map.width));
    }
    const tm = (this.tilemap = this.make.tilemap({ data: rows, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE }));
    const tileset = tm.addTilesetImage("tiles", "tiles", TILE_SIZE, TILE_SIZE, 0, 0)!;
    this.layer = tm.createLayer(0, tileset, 0, 0)!;
  }

  /** Integer zoom keeps pixel art crisp and avoids tile seams. */
  private applyZoom() {
    const cam = this.cameras.main;
    let zoom: number;
    if (this.spectator) {
      // Fit the whole map (with a margin for the host's top bar). Fractional
      // zoom is fine on a big screen; filling the projector matters more.
      zoom = 0.94 * Math.min(
        this.scale.width / (this.map.width * TILE_SIZE),
        this.scale.height / (this.map.height * TILE_SIZE),
      );
      cam.centerOn((this.map.width * TILE_SIZE) / 2, (this.map.height * TILE_SIZE) / 2);
    } else {
      zoom = Math.max(2, Math.round(this.scale.height / (TILE_SIZE * VIEW_TILES_TALL)));
    }
    cam.setZoom(zoom);
    // Labels are drawn at screen resolution: counter-scale so they stay crisp.
    for (const v of this.views.values()) v.label.setScale(1 / zoom);
    this.exitLabel?.setScale(1 / zoom);
  }

  private bindRoom(room: Room) {
    this.room = room;
    this.mySessionId = room.sessionId;

    room.onMessage("pong", (msg: { t: number }) => {
      const rtt = Math.round(performance.now() - msg.t);
      this.hud.setStatus(`ping ${rtt} ms`);
    });
    room.onMessage("intel", (msg: { timers: number[] }) => this.guardLayer.setTimers(msg.timers));
    room.onMessage("checkpoint", (msg: { index: number; count: number }) => {
      this.hud.toast(`Checkpoint ${msg.index}/${msg.count} reached!`);
      this.cameras.main.flash(250, 111, 220, 111);
      play("checkpoint");
    });
    room.onMessage("hint", (msg: { text: string }) => {
      this.hud.toast(msg.text, "#ffe066");
      play("hint");
    });
    room.onMessage("ping", (msg: { x: number; y: number; by: string }) => {
      this.showPing(msg.x, msg.y, msg.by);
      play("ping");
    });
    room.onMessage("noise", (msg: { x: number; y: number }) => {
      this.showNoise(msg.x, msg.y);
      play("noise");
    });
    room.onMessage("news", (msg: { text: string }) => {
      this.hud.toast(msg.text, "#7fd1ff");
      play("news");
    });
    room.onMessage("path", (msg: { ok: boolean; tx: number; ty: number }) => {
      if (msg.ok) this.showMarker(msg.tx, msg.ty, 0xffffff);
      else this.flashMarker(msg.tx, msg.ty);
    });

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => room.send("ping", { t: performance.now() }),
    });
    this.hud.events.on("crawl", (on: boolean) => room.send("crawl", { on }));
    this.hud.events.on("skill", (skill: string) => {
      if (skill === Skill.Trap) {
        this.cycleTrap();
      } else if (AIMED_SKILLS.has(skill as Skill)) {
        this.aimSkill = this.aimSkill === skill ? "" : skill; // press again to cancel
      } else {
        this.aimSkill = "";
        room.send("use", { skill });
      }
    });
  }

  /** Trap button: aim Glue → press again Net → Noise → cancel (kinds with none left are skipped). */
  private cycleTrap() {
    const st = this.room!.state;
    const left: Record<TrapKind, number> = { glue: st.glue, net: st.nets, noise: st.noise };
    const order = TRAP_KINDS.filter((k) => left[k] > 0);
    if (this.aimSkill !== Skill.Trap) {
      if (!order.length) return this.hud.toast("No traps left!", "#ffe066");
      this.trapKind = order[0];
      this.aimSkill = Skill.Trap;
      return;
    }
    const next = order[order.indexOf(this.trapKind) + 1];
    if (next) this.trapKind = next;
    else this.aimSkill = "";
  }

  private showNoise(x: number, y: number) {
    for (let i = 0; i < 3; i++) {
      const note = this.add
        .text(x, y, "♪", { fontFamily: "monospace", fontSize: "20px", color: "#ffe066", stroke: "#000", strokeThickness: 3 })
        .setOrigin(0.5).setScale(1 / this.cameras.main.zoom).setDepth(25);
      this.tweens.add({
        targets: note, y: y - 14, x: x + (i - 1) * 8, alpha: 0, delay: i * 250, duration: 1200,
        onComplete: () => note.destroy(),
      });
    }
  }

  /** Apply door / fence / panel changes from the server to our map + tilemap. */
  private syncTiles(tiles: any) {
    if (!tiles) return;
    if (tiles.size === 0 && this.appliedTiles.size) {
      // Level restarted: back to the original map.
      for (const idx of this.appliedTiles.keys()) {
        const tile = this.level.map.tiles[idx];
        this.map.tiles[idx] = tile;
        this.layer.putTileAt(tile, idx % this.map.width, Math.floor(idx / this.map.width));
      }
      this.appliedTiles.clear();
      return;
    }
    tiles.forEach((tile: number, key: string) => {
      const idx = Number(key);
      if (this.appliedTiles.get(idx) === tile) return;
      this.appliedTiles.set(idx, tile);
      const tx = idx % this.map.width;
      const ty = Math.floor(idx / this.map.width);
      setTile(this.map, tx, ty, tile);
      this.layer.putTileAt(tile, tx, ty);
    });
  }

  /** Glue / net traps on the ground. */
  private syncTraps(traps: any) {
    const list: any[] = traps ? [...traps] : [];
    while (this.trapSprites.length > list.length) this.trapSprites.pop()!.destroy();
    list.forEach((t, i) => {
      const key = t.kind === "net" ? "trap-net" : "trap-glue";
      const s = this.trapSprites[i] ?? (this.trapSprites[i] = this.add.image(0, 0, key).setDepth(4));
      s.setTexture(key).setPosition(t.x, t.y);
    });
  }

  /** Scout's ping: expanding rings + name, for everyone. */
  private showPing(x: number, y: number, by: string) {
    for (let i = 0; i < 3; i++) {
      const ring = this.add.circle(x, y, 4).setStrokeStyle(1.5, 0x7fd1ff).setDepth(25);
      this.tweens.add({
        targets: ring, scale: 4, alpha: 0, delay: i * 500, duration: 1200,
        repeat: Math.floor((ABILITY.pingSeconds * 1000) / 1500) - 1, repeatDelay: 300,
        onComplete: () => ring.destroy(),
      });
    }
    const label = this.add
      .text(x, y - 10, by, { fontFamily: "monospace", fontSize: "14px", color: "#7fd1ff", stroke: "#000", strokeThickness: 3 })
      .setOrigin(0.5, 1).setScale(1 / this.cameras.main.zoom).setDepth(25);
    this.time.delayedCall(ABILITY.pingSeconds * 1000, () => label.destroy());
  }

  private onPointerUp(p: Phaser.Input.Pointer) {
    const down = this.downAt;
    this.downAt = undefined;
    if (!down || down.onUi || !this.room) return;
    if (Phaser.Math.Distance.Between(down.x, down.y, p.x, p.y) > TAP_SLOP) return;

    const world = this.cameras.main.getWorldPoint(p.x, p.y);
    if (this.aimSkill) {
      const kind = this.aimSkill === Skill.Trap ? this.trapKind : undefined;
      this.room.send("use", { skill: this.aimSkill, x: world.x, y: world.y, kind });
      this.aimSkill = "";
      return;
    }
    const tx = Math.floor(world.x / TILE_SIZE);
    const ty = Math.floor(world.y / TILE_SIZE);
    this.room.send("moveTo", { tx, ty });
    this.showMarker(tx, ty, 0xffffff); // optimistic; server reply may nudge it
  }

  private showMarker(tx: number, ty: number, tint: number) {
    this.marker
      .setPosition(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2)
      .setTint(tint)
      .setVisible(true);
  }

  /** Unreachable tap: flash the marker red, then hide it. */
  private flashMarker(tx: number, ty: number) {
    this.showMarker(tx, ty, 0xff5555);
    this.time.delayedCall(400, () => this.marker.setVisible(false));
  }

  update(_time: number, delta: number) {
    const state = this.room?.state;
    const players = state?.players;
    if (!players) return;
    if (state.levelId && state.levelId !== this.level.id) this.loadLevel(state.levelId);
    if (state.phase !== this.lastPhase) {
      if (state.phase === "spotted") {
        play("spotted");
        this.cameras.main.shake(350, 0.012);
      }
      if (state.phase === "won") play("won");
      this.lastPhase = state.phase;
    }

    // Cones + timers: whoever has the Scout's Eyes skill, and the host.
    const me = players.get(this.mySessionId);
    const canSeeIntel = this.spectator || !!me?.skills?.includes(Skill.Eyes);
    const difficulty = getDifficulty(state.difficulty);
    this.guardLayer.update(state.guards ?? [], canSeeIntel, delta, 1 / this.cameras.main.zoom, difficulty.sightFactor);
    if (state.checkpoint !== this.drawnCheckpoint) this.drawCheckpoints(state.checkpoint);
    this.syncTiles(state.tiles);
    this.syncTraps(state.traps);
    this.drawLights(state.lights);
    this.syncAllies(state.allies, delta);
    this.drawGoals(state);
    this.hud.setMission(this.missionText(state));
    this.hud.setBanner(this.bannerText(state));
    if (me && !this.spectator) {
      if (state.phase !== "playing") this.aimSkill = "";
      this.hud.setSkills(this.skillButtons(me, state));
      this.hud.setAimHint(
        this.aimSkill === Skill.Trap ? `${TRAP_HINTS[this.trapKind]} · press Trap again to switch`
        : this.aimSkill ? AIM_HINTS[this.aimSkill] ?? ""
        : "",
      );
    }

    const seen = new Set<string>();
    players.forEach((p: any, id: string) => {
      seen.add(id);
      const v = this.views.get(id) ?? this.addView(id);
      this.updateView(v, p, id === this.mySessionId, delta);
    });

    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      v.body.destroy();
      v.label.destroy();
      v.ring?.destroy();
      v.mound.destroy();
      this.views.delete(id);
    }
  }

  /**
   * Button label + whether there's something to use it on right now. This is
   * only a hint for the player; the server re-checks everything.
   */
  private skillButtons(me: any, state: any): SkillButtonState[] {
    const guards: any[] = state.guards ? [...state.guards] : [];
    const near = (range: number, ok: (g: any) => boolean) =>
      guards.some((g) => ok(g) && Math.hypot(g.x - me.x, g.y - me.y) / TILE_SIZE <= range);
    const onTile = (t: Tile) => tileAt(this.map, Math.floor(me.x / TILE_SIZE), Math.floor(me.y / TILE_SIZE)) === t;

    return [...me.skills]
      .filter((s: string) => !PASSIVE_SKILLS.has(s as Skill))
      .map((id: string) => {
        let label = SKILL_LABELS[id] ?? id;
        let enabled = true;
        if (id === Skill.Dart) {
          label = `Dart ×${state.darts}`;
          enabled = state.darts > 0;
        } else if (id === Skill.Tag) {
          if (me.carrying >= 0) label = "Drop";
          else if (near(ABILITY.carryRange, (g) => g.status === "tied")) label = "Pick up";
          else enabled = near(ABILITY.tieRange, (g) => g.status === "asleep" || g.status === "patrol");
        } else if (id === Skill.Dig) {
          if (me.buried) label = "Get up";
          else if (near(ABILITY.coverRange, (g) => g.status === "tied" && !g.covered)) label = "Cover";
          else enabled = onTile(Tile.Snow) && me.carrying < 0;
        } else if (id === Skill.Trap) {
          const left: Record<TrapKind, number> = { glue: state.glue, net: state.nets, noise: state.noise };
          label = this.aimSkill === id
            ? `${TRAP_NAMES[this.trapKind]} ×${left[this.trapKind]}`
            : `Trap ×${state.glue + state.nets + state.noise}`;
          enabled = state.glue + state.nets + state.noise > 0;
        } else if (id === Skill.Disguise) {
          if (!me.disguised) label = "Costume";
          else if (near(ABILITY.chatRange, (g) => g.status === "patrol")) label = "Chat";
          else label = "Costume off";
        } else if (id === Skill.Fix) {
          const fix = this.nearestFix(me);
          label = fix?.verb ?? "Fix";
          enabled = !!fix;
        }
        return { id, label, enabled, active: this.aimSkill === id };
      });
  }

  /** Objectives checklist for the top of the screen. */
  private missionText(state: any): string {
    if (state.phase !== "playing" && state.phase !== "spotted") return "";
    const done: boolean[] = state.objectivesDone ? [...state.objectivesDone] : [];
    const lines = this.level.objectives.map((o, i) => `${done[i] ? "☑" : "☐"} ${o.label}`);
    lines.push(`${done.every(Boolean) ? "☐" : "·"} ${this.level.exit.label}`);
    const max = getDifficulty(state.difficulty).maxSpotted;
    if (max) lines.push(`Spotted ${state.spottedCount}/${max}`);
    return lines.join("   ");
  }

  /** Searchlights: a faint beam from the tower and a bright spot (red dot when switched off). */
  private drawLights(lights: any) {
    const g = this.lightGfx.clear();
    if (!lights) return;
    // Mark the switch box(es) while their light is on — hard to see at night.
    (this.level.searchlights ?? []).forEach((def, i) => {
      if (!def.panel || !lights[i]?.on) return;
      g.lineStyle(1, 0x7fd1ff, 0.9).strokeCircle((def.panel.x + 0.5) * TILE_SIZE, (def.panel.y + 0.5) * TILE_SIZE, 10);
    });
    for (const l of lights) {
      if (!l.on) {
        g.fillStyle(0xff5555, 0.9).fillCircle(l.towerX, l.towerY, 2);
        continue;
      }
      const a = Math.atan2(l.y - l.towerY, l.x - l.towerX);
      const nx = Math.cos(a + Math.PI / 2) * l.radius;
      const ny = Math.sin(a + Math.PI / 2) * l.radius;
      g.fillStyle(0xfff3b0, 0.12).fillTriangle(l.towerX, l.towerY, l.x + nx, l.y + ny, l.x - nx, l.y - ny);
      g.fillStyle(0xfff3b0, 0.35).fillCircle(l.x, l.y, l.radius);
      g.fillStyle(0xffffff, 0.25).fillCircle(l.x, l.y, l.radius * 0.6);
      g.fillStyle(0xffe066, 1).fillCircle(l.towerX, l.towerY, 2.5);
    }
  }

  /** Friend(s) to rescue: locked in until someone walks up, then they follow. */
  private syncAllies(allies: any, delta: number) {
    const list: any[] = allies ? [...allies] : [];
    const k = 1 - Math.exp(-delta / 60);
    list.forEach((a, i) => {
      let v = this.allyViews[i];
      if (!v) {
        v = this.allyViews[i] = {
          body: this.add.image(a.x, a.y, personKey("ally"), 0).setOrigin(0.5, CHAR_ORIGIN_Y).setDepth(10),
          label: this.add
            .text(a.x, a.y, "", { fontFamily: "monospace", fontSize: "14px", color: "#6fdc6f", stroke: "#000000", strokeThickness: 3 })
            .setOrigin(0.5, 1).setDepth(20),
          face: { dir: Facing.Down, flip: false },
        };
      }
      const dx = a.x - v.body.x;
      const dy = a.y - v.body.y;
      const moving = Math.hypot(dx, dy) > 0.3;
      if (moving) v.face = faceOf(dx, dy);
      if (Math.hypot(dx, dy) > TILE_SIZE * 3) v.body.setPosition(a.x, a.y);
      else v.body.setPosition(v.body.x + dx * k, v.body.y + dy * k);
      v.body.setFrame(walkFrame(v.face, moving, this.time.now)).setFlipX(v.face.flip);
      v.label
        .setText(a.freed ? a.name : `${a.name} (help!)`)
        .setScale(1 / this.cameras.main.zoom)
        .setPosition(v.body.x, v.body.y - CHAR_TOP);
    });
  }

  /** A recognisable vehicle on the exit zone (if it's a truck / boat) and an EXIT label. */
  private drawExit() {
    this.exitSprite?.destroy();
    this.exitLabel?.destroy();
    const e = this.level.exit;
    const cx = (e.x + e.w / 2) * TILE_SIZE;
    const cy = (e.y + e.h / 2) * TILE_SIZE;
    const tile = tileAt(this.map, e.x, e.y);
    const key = tile === Tile.Truck ? "exit-truck" : tile === Tile.Boat ? "exit-boat" : "";
    if (key) {
      this.exitSprite = this.add.image(cx, cy, key).setDepth(3)
        .setDisplaySize(e.w * TILE_SIZE, e.h * TILE_SIZE);
    }
    this.exitLabel = this.add
      .text(cx, e.y * TILE_SIZE - 2, "EXIT", {
        fontFamily: "monospace", fontSize: "14px", fontStyle: "bold", color: "#ffd166", stroke: "#000000", strokeThickness: 4,
      })
      .setOrigin(0.5, 1).setScale(1 / this.cameras.main.zoom).setDepth(20);
  }

  /** Exit zone (dashed gold box) and a pulsing star on unfinished objectives. */
  private drawGoals(state: any) {
    const done: boolean[] = state.objectivesDone ? [...state.objectivesDone] : [];
    const key = `${done.join()} ${this.level.id}`;
    if (key === this.drawnGoals) return;
    this.drawnGoals = key;
    const g = this.goalGfx.clear();
    this.itemSprites.forEach((s) => s.destroy());
    this.itemSprites = [];
    const e = this.level.exit;
    const allDone = done.length > 0 && done.every(Boolean);
    g.lineStyle(1, 0xffd166, allDone ? 1 : 0.5);
    g.strokeRect(e.x * TILE_SIZE + 0.5, e.y * TILE_SIZE + 0.5, e.w * TILE_SIZE - 1, e.h * TILE_SIZE - 1);
    this.level.objectives.forEach((o, i) => {
      if (done[i]) return;
      const cx = o.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = o.y * TILE_SIZE + TILE_SIZE / 2;
      g.lineStyle(1, 0xffd166, 0.9).strokeCircle(cx, cy, 10);
      if (o.kind === "item") this.itemSprites.push(this.add.image(cx, cy, "item").setDepth(4));
    });
  }

  /** Client copy of the server's "what can the Engineer reach" check (label only). */
  private nearestFix(me: any) {
    const px = Math.floor(me.x / TILE_SIZE);
    const py = Math.floor(me.y / TILE_SIZE);
    let best: { verb: string; d: number } | undefined;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const fix = FIXES[tileAt(this.map, px + dx, py + dy)];
        if (!fix) continue;
        const d = Math.hypot(me.x - (px + dx + 0.5) * TILE_SIZE, me.y - (py + dy + 0.5) * TILE_SIZE) / TILE_SIZE;
        if (d <= ABILITY.fixRange && (!best || d < best.d)) best = { verb: fix.verb, d };
      }
    }
    return best;
  }

  private bannerText(state: any): string {
    if (state.phase === "spotted") {
      const max = getDifficulty(state.difficulty).maxSpotted;
      const back = max && state.spottedCount >= max ? `Spotted ${max} times! Back to the start…` : "Back to checkpoint…";
      return `${state.spottedText || "Spotted!"}\n${back} ${state.countdown}`;
    }
    if (state.paused) return state.pauseReason ? `Paused\n${state.pauseReason}` : "Paused";
    return "";
  }

  /** Checkpoint zones: reached = green, next = white, later = grey. */
  private drawCheckpoints(current: number) {
    this.drawnCheckpoint = current;
    const g = this.checkpointGfx.clear();
    this.level.checkpoints.forEach((cp, i) => {
      if (i === 0) return; // start area isn't a goal
      const color = i <= current ? 0x6fdc6f : i === current + 1 ? 0xffffff : 0x8b9aab;
      const x = cp.x * TILE_SIZE;
      const y = cp.y * TILE_SIZE;
      g.fillStyle(color, 0.12).fillRect(x, y, cp.w * TILE_SIZE, cp.h * TILE_SIZE);
      g.lineStyle(1, color, 0.7).strokeRect(x + 0.5, y + 0.5, cp.w * TILE_SIZE - 1, cp.h * TILE_SIZE - 1);
      // Little flag in the corner.
      g.fillStyle(color, 0.9).fillRect(x + 3, y + 2, 1, 9).fillTriangle(x + 4, y + 2, x + 9, y + 4, x + 4, y + 6);
    });
  }

  private addView(id: string): PlayerView {
    const p = this.room!.state.players.get(id);
    const isMe = id === this.mySessionId;
    const look = personKey(p.role);
    const body = this.add.image(p.x, p.y, look, 0).setOrigin(0.5, CHAR_ORIGIN_Y).setDepth(10);
    const label = this.add
      .text(p.x, p.y, isMe ? "you" : p.nickname, {
        fontFamily: "monospace",
        fontSize: "14px",
        color: isMe ? "#ffe066" : "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setScale(1 / this.cameras.main.zoom)
      .setDepth(20);
    const mound = this.add.image(p.x, p.y, "mound").setDepth(10).setVisible(false);
    const view: PlayerView = { body, label, mound, look, face: { dir: Facing.Down, flip: false } };
    this.views.set(id, view);
    if (isMe) {
      view.ring = this.add.image(p.x, p.y, "you-ring").setDepth(9);
      this.cameras.main.startFollow(body, true, 0.2, 0.2);
    }
    return view;
  }

  private updateView(v: PlayerView, p: any, isMe: boolean, delta: number) {
    // Exponential smoothing toward the server position; snap on big jumps
    // (spawn, future checkpoint restarts).
    const dx = p.x - v.body.x;
    const dy = p.y - v.body.y;
    if (p.moving && Math.hypot(dx, dy) > 0.3) v.face = faceOf(dx, dy);
    if (Math.hypot(dx, dy) > TILE_SIZE * 3) {
      v.body.setPosition(p.x, p.y);
    } else {
      const k = 1 - Math.exp(-delta / 60);
      v.body.x += dx * k;
      v.body.y += dy * k;
    }

    // Disguised: a cardboard robot costume (eye light in the wearer's colour).
    const look = p.disguised ? costumeKey(p.role) : personKey(p.role);
    if (v.look !== look) {
      v.look = look;
      v.body.setTexture(look);
    }
    // Crawling steps at half pace; burrowed / still = standing frame.
    const time = p.crawling ? this.time.now / 2 : this.time.now;
    v.body.setFrame(walkFrame(v.face, p.moving, time)).setFlipX(v.face.flip);
    // Crawl = squashed and a bit transparent. Dropped phones (slot held for
    // reconnection) fade out; hidden in a bush = see-through.
    const alpha = (p.connected ? 1 : 0.35) * (p.hidden ? 0.45 : 1);
    v.body.setScale(1, p.crawling ? 0.6 : 1).setAlpha(alpha * (p.crawling ? 0.85 : 1));
    v.body.setVisible(!p.buried);
    v.mound.setVisible(p.buried).setPosition(v.body.x, v.body.y + 2);
    v.label.setAlpha(p.connected ? 1 : 0.35);

    v.label.setPosition(v.body.x, v.body.y - (p.crawling ? CHAR_TOP * 0.6 : CHAR_TOP));
    // Timed action ("Covering 40%") replaces the name for a moment.
    const name = isMe ? "you" : p.nickname;
    const text = p.action === "cover" ? `Covering ${p.progress}%`
      : p.action === "getup" ? "Getting up…"
      : p.action === "dress" ? "Changing…"
      : p.action === "fix" ? `Working ${p.progress}%`
      : p.disguised && p.suspicion > 0 ? `${name} — suspicious ${p.suspicion}%`
      : p.disguised ? `${name} (in costume)`
      : p.item ? `${name} (${p.item})`
      : p.buried ? `${name} (buried)`
      : p.hidden ? `${name} (hidden)`
      : name;
    if (v.label.text !== text) v.label.setText(text);
    v.ring?.setPosition(v.body.x, v.body.y + 5);

    // Arrived: hide the tap marker.
    if (isMe) this.hud.setCrawling(p.crawling);
    if (isMe && this.marker.visible &&
        Phaser.Math.Distance.Between(v.body.x, v.body.y, this.marker.x, this.marker.y) < 2) {
      this.marker.setVisible(false);
    }
  }
}
