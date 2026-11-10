import Phaser from "phaser";
import { TILE_SIZE, Tile } from "@stealth-squad/shared";
import { createCharacterTextures } from "./sprites";

/**
 * Placeholder pixel art drawn at boot (a few 16×16 tiles), so M1 needs no
 * asset files. Swap for a real tileset PNG later — keep frame order = `Tile` enum.
 */
export function createPlaceholderTextures(scene: Phaser.Scene) {
  const T = TILE_SIZE;
  const g = scene.add.graphics();
  const px = (color: number, x: number, y: number, w = 1, h = 1) => {
    g.fillStyle(color);
    g.fillRect(x, y, w, h);
  };

  // --- Tileset: one frame per Tile enum value, laid out left to right. ---
  const frames: Record<Tile, (ox: number) => void> = {
    [Tile.Floor]: (ox) => {
      px(0x3b4a3a, ox, 0, T, T);
      for (const [x, y] of [[3, 4], [11, 2], [7, 10], [13, 12], [2, 13]]) px(0x46584a, ox + x, y);
    },
    [Tile.Wall]: (ox) => {
      px(0x5a5f6b, ox, 0, T, T);
      for (let row = 0; row < 4; row++) {
        px(0x3d414a, ox, row * 4 + 3, T, 1); // mortar line
        const off = row % 2 ? 4 : 0;
        for (let x = off; x < T; x += 8) px(0x3d414a, ox + x, row * 4, 1, 3);
      }
      px(0x6e7480, ox, 0, T, 1);
    },
    [Tile.Snow]: (ox) => {
      px(0xdfe8f0, ox, 0, T, T);
      for (const [x, y] of [[2, 3], [9, 6], [5, 12], [13, 10], [12, 1]]) px(0xc4d2e0, ox + x, y, 2, 1);
    },
    [Tile.Bush]: (ox) => {
      frames[Tile.Floor](ox);
      g.fillStyle(0x2f7a3a);
      g.fillCircle(ox + 8, 8, 7);
      g.fillStyle(0x3f9a4a);
      g.fillCircle(ox + 6, 6, 3);
      g.fillCircle(ox + 11, 9, 2);
    },
    [Tile.Water]: (ox) => {
      px(0x2a5a8a, ox, 0, T, T);
      px(0x4a7fb0, ox + 2, 4, 5, 1);
      px(0x4a7fb0, ox + 9, 10, 5, 1);
    },
    [Tile.Door]: (ox) => {
      px(0x6b4a2b, ox, 0, T, T);
      px(0x4a3018, ox, 0, T, 1);
      px(0x4a3018, ox + 7, 0, 1, T); // planks
      px(0xffd166, ox + 11, 7, 2, 3); // padlock
      px(0x3d414a, ox + 11, 5, 2, 2);
    },
    [Tile.Fence]: (ox) => {
      frames[Tile.Floor](ox);
      for (let x = 1; x < T; x += 4) px(0x9aa3ad, ox + x, 1, 1, T - 2); // posts
      for (let y = 3; y < T; y += 4) px(0x9aa3ad, ox, y, T, 1); // wire
    },
    [Tile.Panel]: (ox) => {
      frames[Tile.Floor](ox);
      px(0x3d414a, ox + 2, 2, 12, 12);
      px(0xff5555, ox + 5, 5, 2, 2); // red light: alarm on
      px(0xffe066, ox + 9, 5, 2, 2);
      px(0x9aa3ad, ox + 4, 10, 8, 2);
    },
    [Tile.PanelOff]: (ox) => {
      frames[Tile.Floor](ox);
      px(0x3d414a, ox + 2, 2, 12, 12);
      px(0x6fdc6f, ox + 5, 5, 2, 2); // green: switched off
      px(0x555b66, ox + 9, 5, 2, 2);
      px(0x9aa3ad, ox + 4, 10, 8, 2);
    },
    [Tile.DoorOpen]: (ox) => {
      frames[Tile.Floor](ox);
      px(0x6b4a2b, ox, 0, 3, T); // door swung open against the frame
    },
    [Tile.Radio]: (ox) => {
      frames[Tile.Floor](ox);
      px(0x3d414a, ox + 3, 10, 10, 5); // base box
      px(0x9aa3ad, ox + 7, 1, 2, 10); // mast
      px(0x9aa3ad, ox + 4, 3, 8, 1);
      px(0x9aa3ad, ox + 5, 6, 6, 1);
      px(0xff5555, ox + 7, 0, 2, 2); // red light: transmitting
    },
    [Tile.RadioOff]: (ox) => {
      frames[Tile.Floor](ox);
      px(0x3d414a, ox + 3, 10, 10, 5);
      px(0x6b717c, ox + 7, 1, 2, 10);
      px(0x6b717c, ox + 4, 3, 8, 1);
      px(0x6b717c, ox + 5, 6, 6, 1);
      px(0x6fdc6f, ox + 7, 0, 2, 2); // green: off
    },
    [Tile.Pier]: (ox) => {
      px(0x8a6a3a, ox, 0, T, T);
      for (let y = 3; y < T; y += 4) px(0x6b4a2b, ox, y, T, 1); // planks
    },
    // Boat / truck tiles are just the ground under the "exit-boat" / "exit-truck" picture.
    [Tile.Boat]: (ox) => frames[Tile.Water](ox),
    [Tile.Tree]: (ox) => {
      frames[Tile.Snow](ox);
      g.fillStyle(0x1f4d2b);
      g.fillTriangle(ox + 8, 0, ox + 1, 12, ox + 15, 12);
      g.fillStyle(0x2f6b3a);
      g.fillTriangle(ox + 8, 3, ox + 4, 9, ox + 12, 9);
      px(0xffffff, ox + 6, 3, 3, 1); // snow on top
      px(0x5a3a1a, ox + 7, 12, 2, 4); // trunk
    },
    [Tile.SnowBush]: (ox) => {
      frames[Tile.Snow](ox);
      g.fillStyle(0x2f7a3a);
      g.fillCircle(ox + 8, 8, 7);
      g.fillStyle(0x3f9a4a);
      g.fillCircle(ox + 6, 6, 3);
      px(0xffffff, ox + 5, 2, 4, 1); // snow on top
      px(0xffffff, ox + 10, 4, 3, 1);
    },
    [Tile.GrassTree]: (ox) => {
      frames[Tile.Floor](ox);
      g.fillStyle(0x1f4d2b);
      g.fillTriangle(ox + 8, 0, ox + 1, 12, ox + 15, 12);
      g.fillStyle(0x2f6b3a);
      g.fillTriangle(ox + 8, 3, ox + 4, 9, ox + 12, 9);
      px(0x5a3a1a, ox + 7, 12, 2, 4); // trunk
    },
    [Tile.Truck]: (ox) => frames[Tile.Floor](ox),
    [Tile.Bridge]: (ox) => {
      px(0x8a8a8a, ox, 0, T, T);
      for (let y = 0; y < T; y += 4) px(0x7a7a7a, ox, y, T, 1); // stones
      for (let x = 2; x < T; x += 6) px(0x7a7a7a, ox + x, 1, 1, 2);
    },
    [Tile.Crate]: (ox) => {
      frames[Tile.Floor](ox);
      px(0x6b4a2b, ox + 1, 1, 14, 14);
      px(0x8a6a3a, ox + 2, 2, 12, 12);
      px(0x6b4a2b, ox + 2, 7, 12, 2); // slats
      px(0x6b4a2b, ox + 7, 2, 2, 12);
    },
    [Tile.Desk]: (ox) => {
      frames[Tile.Floor](ox);
      px(0x5a3a1a, ox, 3, T, 10);
      px(0x7a5a3a, ox, 4, T, 2);
    },
    [Tile.FenceCut]: (ox) => {
      frames[Tile.Floor](ox);
      px(0x9aa3ad, ox + 1, 1, 1, 4);
      px(0x9aa3ad, ox + 13, 11, 1, 4);
      px(0x9aa3ad, ox, 3, 4, 1);
      px(0x9aa3ad, ox + 12, 11, 4, 1);
    },
  };
  const kinds = Object.keys(frames).map(Number) as Tile[];
  for (const k of kinds) frames[k](k * T);
  g.generateTexture("tiles", T * kinds.length, T);
  g.clear();

  // --- People, robot guards and the robot dog: spritesheets in sprites.ts. ---
  createCharacterTextures(scene);

  // --- Scanner light in front of an active robot (rotates to its exact facing). ---
  g.fillStyle(0xff4b3e, 0.35);
  g.fillTriangle(0, 4, 12, 0, 12, 8);
  g.fillStyle(0xff4b3e, 0.6);
  g.fillTriangle(0, 4, 6, 2, 6, 6);
  g.generateTexture("scan", 12, 9);
  g.clear();

  // --- Traps (visible to the team). ---
  g.fillStyle(0xe8d44d, 0.9);
  g.fillEllipse(6, 5, 12, 8);
  px(0xfff3a0, 3, 3, 3, 2);
  g.generateTexture("trap-glue", 12, 10);
  g.clear();
  g.lineStyle(1, 0xd8c8a0);
  for (let i = 0; i <= 12; i += 4) {
    g.lineBetween(i, 0, i, 12);
    g.lineBetween(0, i, 12, i);
  }
  g.generateTexture("trap-net", 13, 13);
  g.clear();

  // --- Objective item: folded plans (blue paper). ---
  px(0xffffff, 1, 2, 12, 9);
  px(0x4a7fb0, 2, 3, 10, 7);
  px(0xffffff, 4, 5, 6, 1);
  px(0xffffff, 4, 7, 4, 1);
  g.generateTexture("item", 14, 12);
  g.clear();

  // --- Exit vehicles, drawn over the 3×3-tile exit zone (48×48, nose pointing up). ---
  // Truck: cab with windscreen at the front, canvas-covered cargo bed behind, wheels.
  for (const [x, y] of [[3, 9], [41, 9], [3, 30], [41, 30], [3, 38], [41, 38]]) px(0x1a1a1a, x, y, 4, 7);
  px(0x222222, 7, 2, 34, 15);
  px(0x5a6b3a, 8, 3, 32, 13); // cab
  px(0x9fd3f0, 11, 5, 26, 4); // windscreen
  px(0xffe066, 9, 3, 4, 2); // headlights
  px(0xffe066, 35, 3, 4, 2);
  px(0x222222, 6, 17, 36, 29);
  px(0x7a8a4a, 7, 18, 34, 27); // canvas cover
  for (let y = 22; y < 45; y += 6) px(0x5a6b3a, 7, y, 34, 1); // ribs
  g.generateTexture("exit-truck", 48, 48);
  g.clear();
  // Boat: pointed bow, white hull, wooden deck, small cabin.
  g.fillStyle(0x222222);
  g.fillTriangle(24, 0, 6, 16, 42, 16);
  g.fillRect(6, 15, 36, 32);
  g.fillStyle(0xf0f0f0);
  g.fillTriangle(24, 2, 8, 16, 40, 16);
  g.fillRect(8, 15, 32, 30);
  g.fillStyle(0x8a6a3a);
  g.fillRect(12, 14, 24, 28); // deck
  px(0x3d414a, 17, 18, 14, 10); // cabin roof
  px(0x9fd3f0, 18, 19, 12, 3); // cabin window
  g.generateTexture("exit-boat", 48, 48);
  g.clear();

  // --- Mound: burrowed Trapper, covered guard (tinted: snow white / leaves brown). ---
  g.fillStyle(0x222222);
  g.fillEllipse(7, 6, 14, 10);
  g.fillStyle(0xffffff);
  g.fillEllipse(7, 6, 12, 8);
  px(0xc4d2e0, 3, 7, 8, 1);
  g.generateTexture("mound", 14, 12);
  g.clear();

  // --- "You" ring drawn under your own character. ---
  g.lineStyle(1, 0xffe066);
  g.strokeEllipse(8, 4, 14, 6);
  g.generateTexture("you-ring", 16, 8);
  g.clear();

  // --- Tap target marker. ---
  g.lineStyle(1, 0xffffff);
  g.strokeRect(1, 1, T - 2, T - 2);
  px(0xffffff, 7, 7, 2, 2);
  g.generateTexture("marker", T, T);

  g.destroy();
}
