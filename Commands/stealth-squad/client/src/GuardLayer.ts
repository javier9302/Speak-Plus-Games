import Phaser from "phaser";
import { play } from "./sound";
import { CHAR_ORIGIN_Y, CHAR_TOP, DOG_ORIGIN_Y, DOG_TOP, faceOfAngle, robotKey, walkFrame } from "./sprites";
import { ABILITY, DOG, TILE_SIZE, Tile, VISION, angleDiff, coneOutline, tileAt, type GridMap } from "@stealth-squad/shared";

interface GuardView {
  body: Phaser.GameObjects.Image;
  /** Scanner light showing the robot's exact facing (the sprite only has 4). */
  scan: Phaser.GameObjects.Image;
  /** Shown instead of the body when a tied guard is covered. */
  mound: Phaser.GameObjects.Image;
  alert: Phaser.GameObjects.Text;
  timer: Phaser.GameObjects.Text;
  angle: number;
  /** Last seen alert / status, for one-off sounds and effects. */
  lastAlert: number;
  lastStatus: string;
}

/**
 * Draws guards for everyone, and — only when `canSeeIntel` — their vision
 * cones (outer = walking range, inner = crawling range) and turn timers.
 * Cones are computed here from the synced guard position/facing with the same
 * raycast the server uses; they are never sent over the network.
 */
export class GuardLayer {
  private views: GuardView[] = [];
  private cones: Phaser.GameObjects.Graphics;
  private timers: number[] = [];

  constructor(private scene: Phaser.Scene, private map: GridMap) {
    this.cones = scene.add.graphics().setDepth(3);
  }

  /** Remove everything (level change). */
  destroy() {
    for (const v of this.views) {
      v.body.destroy();
      v.scan.destroy();
      v.mound.destroy();
      v.alert.destroy();
      v.timer.destroy();
    }
    this.views = [];
    this.cones.destroy();
  }

  /** Latest seconds-until-turn per guard, from the server's `intel` message. */
  setTimers(timers: number[]) {
    this.timers = timers;
  }

  /** `sight` = the difficulty's sight factor, so cones match what the server checks. */
  update(guards: any[], canSeeIntel: boolean, delta: number, labelScale: number, sight: number) {
    while (this.views.length < guards.length) this.views.push(this.addView(guards[this.views.length]));
    this.cones.clear();

    const k = 1 - Math.exp(-delta / 60);
    guards.forEach((g, i) => {
      const v = this.views[i];
      // Same smoothing as players; snap on restarts.
      const moving = Math.hypot(g.x - v.body.x, g.y - v.body.y) > 0.2;
      if (Math.hypot(g.x - v.body.x, g.y - v.body.y) > 48) v.body.setPosition(g.x, g.y);
      else v.body.setPosition(v.body.x + (g.x - v.body.x) * k, v.body.y + (g.y - v.body.y) * k);
      v.angle += angleDiff(g.angle, v.angle) * k;

      // One-off effects: "huh?" when a guard starts noticing; dart / tie pops.
      if (g.alert > 0 && v.lastAlert === 0) play("alert");
      if (g.status !== v.lastStatus) {
        if (g.status === "asleep") play("dart");
        if (g.status === "tied" && v.lastStatus !== "carried") {
          play("tie");
          this.scene.tweens.add({ targets: v.body, scale: { from: 1.5, to: 1 }, duration: 250, ease: "Back.Out" });
        }
      }
      v.lastAlert = g.alert;
      v.lastStatus = g.status;

      // Out-of-play looks: knocked-out robots lie down with the eye light off;
      // asleep (bluish, "off"), tied (grey, ★), carried (small, on top), covered (mound).
      const active = g.status === "patrol";
      const covered = g.status === "tied" && g.covered;
      const out = g.status === "asleep" || g.status === "tied" || g.status === "carried" || g.status === "netted";
      const key = robotKey(g, out);
      if (v.body.texture.key !== key) v.body.setTexture(key);
      const face = out ? faceOfAngle(Math.PI / 2) : faceOfAngle(v.angle);
      v.body
        .setFrame(walkFrame(face, moving && !out, this.scene.time.now))
        .setFlipX(face.flip)
        .setOrigin(0.5, g.dog ? DOG_ORIGIN_Y : CHAR_ORIGIN_Y)
        .setRotation(out ? -Math.PI / 2 : 0)
        .setVisible(!covered)
        .setTint(
          g.status === "asleep" ? 0x9aa8d8
          : g.status === "tied" || g.status === "carried" || g.status === "netted" ? 0xaaaaaa
          : 0xffffff,
        )
        .setScale(this.scene.tweens.isTweening(v.body) ? v.body.scale : g.status === "carried" ? 0.8 : 1)
        // Knocked-out guards lie under players (players stand on the same tile when dropping/covering).
        .setDepth(g.status === "carried" ? 12 : active ? 11 : 9);
      if (covered) {
        const snow = tileAt(this.map, Math.floor(g.x / TILE_SIZE), Math.floor(g.y / TILE_SIZE)) === Tile.Snow;
        v.mound.setPosition(v.body.x, v.body.y).setTint(snow ? 0xffffff : 0x8a6a3a);
      }
      v.mound.setVisible(covered);
      v.scan.setVisible(active).setPosition(v.body.x, v.body.y - 2).setRotation(v.angle);
      const top = out ? 6 : g.dog ? DOG_TOP : CHAR_TOP;

      // Alert meter is public: whoever is being noticed needs the warning.
      const alert = g.alert / 100;
      const mark = alert > 0 && active ? (alert > 0.6 ? "!" : "?")
        : g.status === "asleep" ? "off"
        : g.status === "stuck" ? "stuck"
        : g.status === "netted" ? "net"
        : g.status === "tied" && !covered ? "★"
        : "";
      v.alert
        .setVisible(mark !== "")
        .setText(mark)
        .setColor(alert > 0 && active ? (alert > 0.6 ? "#ff5555" : "#ffe066") : "#c8d2dc")
        .setScale(labelScale * (alert > 0 && active ? 1 + alert * 0.6 : 0.8))
        .setPosition(v.body.x, v.body.y - top);

      // -1 = no countdown (tied for good). Out-of-play guards show seconds until they wake / wriggle free.
      const t = this.timers[i];
      v.timer
        .setVisible(canSeeIntel && typeof t === "number" && t >= 0 && t < (out ? 99 : 10))
        .setText(String(Math.ceil(t ?? 0)))
        .setScale(labelScale)
        .setPosition(v.body.x + 9, v.body.y - top);

      if (canSeeIntel && active) {
        const color = alert > 0 ? 0xff5555 : 0xffe066;
        const f = (g.woke ? ABILITY.wokeRangeFactor : 1) * (g.dog ? DOG.sightFactor : 1) * sight;
        // Dogs smell all around: show that circle too.
        if (g.dog) this.cones.lineStyle(1, color, 0.6).strokeCircle(v.body.x, v.body.y, DOG.smellRange * TILE_SIZE);
        this.drawCone(v.body.x, v.body.y, v.angle, VISION.range * f, color, 0.16);
        this.drawCone(v.body.x, v.body.y, v.angle, VISION.crawlRange * f, color, 0.2);
      }
    });
  }

  private drawCone(x: number, y: number, angle: number, range: number, color: number, alpha: number) {
    const pts = coneOutline(this.map, x, y, angle, range);
    this.cones.fillStyle(color, alpha);
    this.cones.beginPath();
    this.cones.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) this.cones.lineTo(pts[i], pts[i + 1]);
    this.cones.closePath();
    this.cones.fillPath();
  }

  private addView(g: any): GuardView {
    const text = (color: string) =>
      this.scene.add
        .text(g.x, g.y, "", {
          fontFamily: "monospace",
          fontSize: "16px",
          fontStyle: "bold",
          color,
          stroke: "#000000",
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1)
        .setDepth(21);
    return {
      body: this.scene.add.image(g.x, g.y, robotKey(g, false), 0).setDepth(11),
      scan: this.scene.add.image(g.x, g.y, "scan").setOrigin(0, 0.5).setDepth(10.5),
      mound: this.scene.add.image(g.x, g.y, "mound").setDepth(9).setVisible(false),
      alert: text("#ffe066"),
      timer: text("#7fd1ff"),
      angle: g.angle,
      lastAlert: g.alert,
      lastStatus: g.status,
    };
  }
}
