import Phaser from "phaser";
import { session } from "./session";
import { isMuted, play, setMuted, unlock } from "./sound";

const CRAWL_RADIUS = 38;
const SKILL_RADIUS = 32;
const GAP = 12;
const MARGIN = 20;

/** What GameScene wants a skill button to show this frame. */
export interface SkillButtonState {
  id: string;
  label: string;
  /** Dimmed when there's nothing to use it on (it still sends; the server gives a hint). */
  enabled: boolean;
  /** Highlighted while aiming (press, then tap the map). */
  active: boolean;
}

interface Button {
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  radius: number;
  key: string; // last rendered state, to skip redundant updates
}

/**
 * Screen-space overlay (unzoomed) on top of the world: status line, crawl
 * toggle, one button per skill, banner, toast and aim hint. Emits on
 * `this.events`: `crawl` (wanted state) and `skill` (skill id); GameScene
 * forwards them to the server and feeds the synced state back.
 */
export class HudScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private crawlBtn!: Button;
  private skillBtns = new Map<string, Button>();
  private crawling = false;
  private pendingStatus = "";
  private banner!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private aimText!: Phaser.GameObjects.Text;
  private missionTextObj!: Phaser.GameObjects.Text;
  private muteBtn!: Phaser.GameObjects.Text;

  constructor() {
    super("hud");
  }

  create() {
    this.statusText = this.add.text(10, 8, this.pendingStatus, {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#c8d2dc",
      stroke: "#000000",
      strokeThickness: 3,
    });

    this.crawlBtn = this.makeButton("CRAWL", CRAWL_RADIUS, () => this.events.emit("crawl", !this.crawling));
    // The host screen is a spectator: no controls.
    this.crawlBtn.box.setVisible(!session.spectator);

    const big = { fontFamily: "monospace", fontSize: "26px", fontStyle: "bold", align: "center",
      color: "#ffffff", stroke: "#000000", strokeThickness: 6 };
    this.banner = this.add.text(0, 0, "", { ...big, backgroundColor: "#00000088", padding: { x: 18, y: 12 } })
      .setOrigin(0.5).setVisible(false).setDepth(10);
    this.toastText = this.add.text(0, 0, "", { ...big, fontSize: "20px" })
      .setOrigin(0.5, 0).setAlpha(0).setDepth(10);
    this.aimText = this.add.text(0, 0, "", { ...big, fontSize: "18px", color: "#ffe066" })
      .setOrigin(0.5, 0).setVisible(false);

    // Sound on/off (top-right). Big enough to hit with a thumb.
    this.muteBtn = this.add
      .text(0, 6, isMuted() ? "🔇" : "🔊", { fontSize: "22px", padding: { x: 6, y: 2 } })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    this.muteBtn.on("pointerdown", () => {
      unlock();
      setMuted(!isMuted());
      this.muteBtn.setText(isMuted() ? "🔇" : "🔊");
      play("click");
    });

    this.missionTextObj = this.add.text(0, 8, "", {
      fontFamily: "monospace", fontSize: "13px", color: "#ffd166", stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5, 0);

    this.layout();
    this.scale.on("resize", this.layout, this);
  }

  /** Objectives checklist (top centre); "" hides it. */
  setMission(text: string) {
    if (!this.missionTextObj || this.missionTextObj.text === text) return;
    this.missionTextObj.setText(text);
  }

  /** True if a screen point is over a HUD control, so GameScene ignores it as a tap. */
  hitsUi(x: number, y: number): boolean {
    if (this.muteBtn?.getBounds().contains(x, y)) return true;
    for (const b of [this.crawlBtn, ...this.skillBtns.values()]) {
      if (b?.box.visible && Phaser.Math.Distance.Between(x, y, b.box.x, b.box.y) <= b.radius + 6) return true;
    }
    return false;
  }

  /** Safe to call before create() runs (the HUD is launched a frame after GameScene). */
  setStatus(text: string) {
    this.pendingStatus = text;
    this.statusText?.setText(text);
  }

  /** Mirror the server's crawl state (it resets on level start, so the button can't drift). */
  setCrawling(on: boolean) {
    if (on === this.crawling || !this.crawlBtn) return;
    this.crawling = on;
    this.crawlBtn.bg.setFillStyle(on ? 0x2f6f9f : 0x1d2733, on ? 0.95 : 0.8);
  }

  /** Create / update / remove skill buttons. Cheap to call every frame. */
  setSkills(states: SkillButtonState[]) {
    if (!this.crawlBtn) return;
    let relayout = false;
    for (const [id, b] of this.skillBtns) {
      if (states.some((s) => s.id === id)) continue;
      b.box.destroy();
      this.skillBtns.delete(id);
      relayout = true;
    }
    for (const s of states) {
      let b = this.skillBtns.get(s.id);
      if (!b) {
        b = this.makeButton("", SKILL_RADIUS, () => this.events.emit("skill", s.id));
        this.skillBtns.set(s.id, b);
        relayout = true;
      }
      const key = `${s.label}|${s.enabled}|${s.active}`;
      if (b.key === key) continue;
      b.key = key;
      b.label.setText(s.label);
      b.bg.setFillStyle(s.active ? 0x8a6d1a : 0x1d2733, s.active ? 0.95 : 0.8);
      b.bg.setStrokeStyle(3, s.active ? 0xffe066 : 0x7fd1ff);
      b.box.setAlpha(s.enabled || s.active ? 1 : 0.45);
    }
    if (relayout) this.layout();
  }

  /** Big centred message (Spotted / Paused); "" hides it. */
  setBanner(text: string) {
    if (!this.banner || this.banner.text === text) return;
    this.banner.setText(text).setVisible(text !== "");
  }

  /** Instruction while aiming ("Tap a robot"); "" hides it. */
  setAimHint(text: string) {
    if (!this.aimText || this.aimText.text === text) return;
    this.aimText.setText(text).setVisible(text !== "");
  }

  /** Short message that fades out (checkpoint reached, server hints). */
  toast(text: string, color = "#6fdc6f") {
    if (!this.toastText) return;
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(text).setColor(color).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 2000, duration: 600 });
  }

  private makeButton(text: string, radius: number, onPress: () => void): Button {
    const bg = this.add.circle(0, 0, radius, 0x1d2733, 0.8).setStrokeStyle(3, 0x7fd1ff);
    const label = this.add
      .text(0, 0, text, {
        fontFamily: "monospace",
        fontSize: radius > 34 ? "14px" : "12px",
        color: "#ffffff",
        align: "center",
        wordWrap: { width: radius * 1.8 },
      })
      .setOrigin(0.5);
    const box = this.add.container(0, 0, [bg, label]);
    bg.setInteractive({ useHandCursor: true });
    bg.on("pointerdown", onPress);
    return { box, bg, label, radius, key: "" };
  }

  /**
   * All buttons on the left edge: Crawl in the bottom-left corner, skills in
   * columns above it (bottom up, then the next column). Every exit is on the
   * right of its map and the team walks rightwards, so the right side of the
   * screen stays free for tapping the map and the truck / boat. Left thumb =
   * buttons, right thumb = map.
   */
  private layout() {
    const { width, height } = this.scale;
    this.banner?.setPosition(width / 2, height / 2);
    // Host: below the DOM bar.
    this.muteBtn?.setPosition(width - 8, session.spectator ? 60 : 6);
    // Host has a DOM bar at the top: keep the checklist below it.
    this.missionTextObj?.setPosition(width / 2, session.spectator ? 64 : 8);
    this.toastText?.setPosition(width / 2, 40);
    this.aimText?.setPosition(width / 2, 76);
    const colX = MARGIN + CRAWL_RADIUS; // centre of the first column
    this.crawlBtn.box.setPosition(colX, height - MARGIN - CRAWL_RADIUS);
    // Leave room for the status line at the top-left.
    const top = 30;
    const step = SKILL_RADIUS * 2 + GAP;
    const firstBottom = height - MARGIN - CRAWL_RADIUS * 2 - GAP; // above Crawl
    const fitsFirst = Math.max(0, Math.floor((firstBottom - top + GAP) / step));
    const perColumn = Math.max(1, Math.floor((height - MARGIN - top + GAP) / step));
    let i = 0;
    for (const b of this.skillBtns.values()) {
      if (i < fitsFirst) {
        b.box.setPosition(colX, firstBottom - SKILL_RADIUS - i * step);
      } else {
        const j = i - fitsFirst;
        const col = 1 + Math.floor(j / perColumn);
        b.box.setPosition(colX + col * step, height - MARGIN - SKILL_RADIUS - (j % perColumn) * step);
      }
      i++;
    }
  }
}
