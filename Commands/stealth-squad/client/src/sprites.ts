import type Phaser from "phaser";
import { ROLES, ROLE_INFO, isRole } from "@stealth-squad/shared";

/**
 * Character art as text grids (one letter = one pixel, "." = clear), painted
 * into spritesheets at boot. Like the level maps, edit the letters to change
 * a sprite; a PNG sheet with the same frame layout can replace it later.
 *
 * Every sheet: 3 facings × 3 frames, left to right:
 *   0–2 facing down, 3–5 facing up, 6–8 facing right (left = flipX).
 * Frame 0 of each facing is standing; 1 and 2 are walk steps.
 */
type Grid = string[];

export const Facing = { Down: 0, Up: 1, Side: 2 } as const;
export type Face = { dir: number; flip: boolean };

/** Walk cycle over the 3 frames of a facing. */
const WALK = [0, 1, 0, 2];
const WALK_MS = 140;

export function walkFrame(face: Face, moving: boolean, time: number) {
  return face.dir * 3 + (moving ? WALK[Math.floor(time / WALK_MS) % WALK.length] : 0);
}

/** Facing from a movement step (screen y points down). */
export function faceOf(dx: number, dy: number): Face {
  if (Math.abs(dx) > Math.abs(dy)) return { dir: Facing.Side, flip: dx < 0 };
  return { dir: dy > 0 ? Facing.Down : Facing.Up, flip: false };
}

export function faceOfAngle(angle: number): Face {
  return faceOf(Math.cos(angle), Math.sin(angle));
}

/** People and robots: 16×19, drawn so the sprite's origin sits at the waist. */
export const CHAR_ORIGIN_Y = 13 / 19;
/** Robot dog: 16×12. */
export const DOG_ORIGIN_Y = 7 / 12;
/** How far above a character's position its head ends (for labels). */
export const CHAR_TOP = 14;
export const DOG_TOP = 8;

// --- People ----------------------------------------------------------------
// k outline · h/H hair · s/S skin · e eyes · r cheeks · c/C shirt · p trousers · b shoes

const PERSON_DOWN: Grid = [
  "....kkkkkkkk....",
  "...khhhhhhhhk...",
  "..khhhhhhhhhhk..",
  "..khhhhhhhhhhk..",
  "..khhsssssshhk..",
  "..khssssssssHk..",
  "..kssessssessk..",
  "..kssessssessk..",
  "..ksrssssssrsk..",
  "...kssssssssk...",
  "....kSSSSSSk....",
  "...kcccccccck...",
  "..kcccccccccck..",
  "..kcCccccccCck..",
  "..kskppppppksk..",
];
const PERSON_UP: Grid = [
  "....kkkkkkkk....",
  "...khhhhhhhhk...",
  "..khhhhhhhhhhk..",
  "..khhhhhhhhhhk..",
  "..khhhhhhhhhhk..",
  "..khhhhhhhhhhk..",
  "..khHhhhhhhHhk..",
  "..kHhhhhhhhhHk..",
  "..ksHHHHHHHHsk..",
  "...kHHHHHHHHk...",
  "....kSSSSSSk....",
  "...kCccccccCk...",
  "..kcccccccccck..",
  "..kcCccccccCck..",
  "..kskppppppksk..",
];
const PERSON_SIDE: Grid = [
  ".....kkkkkk.....",
  "....khhhhhhk....",
  "...khhhhhhhhk...",
  "...khhhhhhhhk...",
  "...khhhhhsssk...",
  "...khhhhsssssk..",
  "...khhSssssesk..",
  "...khhSssssesk..",
  "...khsssssrssk..",
  "....kssssssk....",
  ".....kSSSSk.....",
  "....kcccccck....",
  "....kcCCccck....",
  "....kcCCccck....",
  "....kpsspppk....",
];
const LEGS_FRONT: Grid[] = [
  ["....kppkkppk....", "....kbbkkbbk....", ".....kk..kk.....", "................"],
  ["....kppkkppk....", "....kppkkbbk....", "....kbbk.kk.....", ".....kk........."],
  ["....kppkkppk....", "....kbbkkppk....", ".....kk.kbbk....", ".........kk....."],
];
const LEGS_SIDE: Grid[] = [
  [".....kppppk.....", ".....kbbbbbk....", "......kkkkk.....", "................"],
  ["....kppkkppk....", "...kbbk..kbbk...", "....kk....kk....", "................"],
  ["....kppkkppk....", "...kbbk..kbbk...", "....kk....kk....", "................"],
];

const personFrames = (): Grid[] => [
  ...LEGS_FRONT.map((l) => [...PERSON_DOWN, ...l]),
  ...LEGS_FRONT.map((l) => [...PERSON_UP, ...l]),
  ...LEGS_SIDE.map((l) => [...PERSON_SIDE, ...l]),
];

/** Hair and skin per role, so the squad looks like six different people. */
const LOOKS: Record<string, { hair: number; skin: number }> = {
  scout: { hair: 0x3a2a1e, skin: 0xf2c9a0 },
  trapper: { hair: 0x1e1e28, skin: 0xd9a47a },
  tagger: { hair: 0xe8c35a, skin: 0xf5d2b0 },
  sleeper: { hair: 0xb0452a, skin: 0xc58a5e },
  disguise: { hair: 0x22222a, skin: 0x8a5a3c },
  engineer: { hair: 0x5a3a2a, skin: 0xf0c090 },
};

const personPalette = (shirt: number, hair: number, skin: number): Record<string, number> => ({
  k: 0x14161c,
  h: hair,
  H: shade(hair, 0.7),
  s: skin,
  S: shade(skin, 0.8),
  e: 0x14161c,
  r: mix(skin, 0xe86a6a, 0.35),
  c: shirt,
  C: shade(shirt, 0.75),
  p: 0x2c3550,
  b: 0x3a2a1e,
});

// --- Robots (the guards) -----------------------------------------------------
// k outline · m/M metal · d visor · g eye · a lights · w/W treads

const ROBOT_HEAD_FRONT: Grid = [
  "......kaak......",
  ".......kk.......",
  "...kkkkkkkkkk...",
  "..kmmmmmmmmmmk..",
  "..kmddddddddMk..",
  "..kmdggddggdMk..",
  "..kmdggddggdMk..",
  "..kmddddddddMk..",
  "..kMMMMMMMMMMk..",
  "...kkkkkkkkkk...",
  ".....kMMMMk.....",
];
const ROBOT_DOWN: Grid = [
  ...ROBOT_HEAD_FRONT,
  "..kkmmmmmmmmkk..",
  ".kMkmmmaammmkMk.",
  ".kMkmmmmmmmMkMk.",
  ".kkkMMMMMMMMkkk.",
];
const ROBOT_UP: Grid = [
  "......kaak......",
  ".......kk.......",
  "...kkkkkkkkkk...",
  "..kmmmmmmmmmmk..",
  "..kmmmmmmmmmMk..",
  "..kmmdddddmmMk..",
  "..kmmmmmmmmmMk..",
  "..kmmdddddmmMk..",
  "..kMMMMMMMMMMk..",
  "...kkkkkkkkkk...",
  ".....kMMMMk.....",
  "..kkmmmmmmmmkk..",
  ".kMkmmmmmmmmkMk.",
  ".kMkmmmmmmmMkMk.",
  ".kkkMMMMMMMMkkk.",
];
const ROBOT_SIDE: Grid = [
  "....kaak........",
  ".....kk.........",
  "...kkkkkkkkkk...",
  "..kmmmmmmmmmmk..",
  "..kmmmmmdddddk..",
  "..kmmmmmddggdk..",
  "..kmmmmmddggdk..",
  "..kmmmmmdddddk..",
  "..kMMMMMMMMMMk..",
  "...kkkkkkkkkk...",
  ".....kMMMMk.....",
  "....kmmmmmmk....",
  "....kmMMmmak....",
  "....kmMMmmmk....",
  "....kkMMkkkk....",
];
const TREADS_FRONT: Grid[] = [
  ["...kwwwwwwwwk...", "...kwWwWwWwWk...", "...kwwwwwwwwk...", "....kkkkkkkk...."],
  ["...kwwwwwwwwk...", "...kWwWwWwWwk...", "...kwwwwwwwwk...", "....kkkkkkkk...."],
];
const TREADS_SIDE: Grid[] = [
  ["...kwwwwwwwwk...", "..kwWwWwWwWwk...", "...kwwwwwwwwk...", "....kkkkkkkk...."],
  ["...kwwwwwwwwk...", "..kWwWwWwWwWk...", "...kwwwwwwwwk...", "....kkkkkkkk...."],
];
// Treads alternate A, B, A, B over the walk cycle (frames 1 and 2 are both B).
const robotFrames = (): Grid[] =>
  [ROBOT_DOWN, ROBOT_UP, ROBOT_SIDE].flatMap((body, i) => {
    const t = i === 2 ? TREADS_SIDE : TREADS_FRONT;
    return [[...body, ...t[0]], [...body, ...t[1]], [...body, ...t[1]]];
  });

// --- Robot dog ---------------------------------------------------------------

const DOG_DOWN: Grid = [
  "....k......k....",
  "....kmk..kmk....",
  "....kmmkkmmk....",
  "....kmmmmmmk....",
  "....kgmmmmgk....",
  "....kmmddmmk....",
  ".....kmmmmk.....",
  "....kmmaammk....",
  "....kMMMMMMk....",
];
const DOG_UP: Grid = [
  "....k......k....",
  "....kmk..kmk....",
  "....kmmkkmmk....",
  "....kmmmmmmk....",
  "....kmmmmmmk....",
  "....kMmmmmMk....",
  ".....kmmmmk.....",
  "....kmmmmmmk....",
  "....kMMMMMMk....",
];
const DOG_SIDE: Grid = [
  "..........k.k...",
  ".........kmkmk..",
  ".........kmmmmk.",
  ".k.......kmgmmMk",
  "..k.kkkkkkmmmmMk",
  "...kmmmmmmmkkkk.",
  "...kmmmmamMk....",
  "...kMMMMMMMk....",
  "...kkkkkkkkk....",
];
const DOG_LEGS_FRONT: Grid[] = [
  ["....kMk..kMk....", "....kMk..kMk....", "....kkk..kkk...."],
  ["....kMk..kMk....", "....kMk..kkk....", "....kkk........."],
  ["....kMk..kMk....", "....kkk..kMk....", ".........kkk...."],
];
const DOG_LEGS_SIDE: Grid[] = [
  ["....kMk..kMk....", "....kMk..kMk....", "....kkk..kkk...."],
  ["...kMk....kMk...", "..kMk......kMk..", "..kk........kk.."],
  ["...kMk....kMk...", "..kMk......kMk..", "..kk........kk.."],
];
const dogFrames = (): Grid[] => [
  ...DOG_LEGS_FRONT.map((l) => [...DOG_DOWN, ...l]),
  ...DOG_LEGS_FRONT.map((l) => [...DOG_UP, ...l]),
  ...DOG_LEGS_SIDE.map((l) => [...DOG_SIDE, ...l]),
];

const robotPalette = (metal: number, eye: number): Record<string, number> => ({
  k: 0x14161c,
  m: metal,
  M: shade(metal, 0.68),
  d: 0x1d2633,
  g: eye,
  a: eye,
  w: 0x3a3f4a,
  W: 0x5a606c,
});
const EYE_ON = 0xff4b3e;
const EYE_OFF = 0x3a4250;
const STEEL = 0xb8c4d0;
const GOLD = 0xf2c45a;
const CARDBOARD = 0xc9a46a;

// --- Sheets ------------------------------------------------------------------

export type Sheet = { key: string; frames: Grid[]; palette: Record<string, number> };

const roleKey = (role: string) => (isRole(role) ? role : "none");
/** A squad member, by role ("ally" = the friend to rescue). */
export const personKey = (role: string) => `person-${role === "ally" ? "ally" : roleKey(role)}`;
/** A squad member in the Disguise skill's cardboard robot costume. */
export const costumeKey = (role: string) => `costume-${roleKey(role)}`;
/** A guard robot; "off" = asleep / tied / netted (eye light out). */
export const robotKey = (g: { dog: boolean; officer: boolean }, off: boolean) =>
  `${g.dog ? "robodog" : g.officer ? "robot-officer" : "robot"}${off ? "-off" : ""}`;

export function characterSheets(): Sheet[] {
  const people = personFrames();
  const robots = robotFrames();
  const dogs = dogFrames();
  const sheets: Sheet[] = [];
  for (const role of ROLES) {
    const { hair, skin } = LOOKS[role];
    sheets.push({ key: personKey(role), frames: people, palette: personPalette(ROLE_INFO[role].color, hair, skin) });
    // The costume's eye light is the wearer's colour, so teammates can tell who is inside.
    sheets.push({ key: costumeKey(role), frames: robots, palette: robotPalette(CARDBOARD, ROLE_INFO[role].color) });
  }
  sheets.push({ key: personKey("none"), frames: people, palette: personPalette(0xcccccc, 0x3a2a1e, 0xf2c9a0) });
  sheets.push({ key: costumeKey("none"), frames: robots, palette: robotPalette(CARDBOARD, 0xcccccc) });
  sheets.push({ key: personKey("ally"), frames: people, palette: personPalette(0xeef0f2, 0x6a4a2a, 0xe8b88a) });
  for (const officer of [false, true]) {
    for (const off of [false, true]) {
      const metal = officer ? GOLD : STEEL;
      sheets.push({ key: robotKey({ dog: false, officer }, off), frames: robots, palette: robotPalette(metal, off ? EYE_OFF : EYE_ON) });
    }
  }
  for (const off of [false, true]) {
    sheets.push({ key: robotKey({ dog: true, officer: false }, off), frames: dogs, palette: robotPalette(STEEL, off ? EYE_OFF : EYE_ON) });
  }
  return sheets;
}

/** Calls `put` for every coloured pixel of the sheet, frames laid out left to right. */
export function paintSheet(sheet: Sheet, put: (x: number, y: number, color: number) => void) {
  const h = sheet.frames[0].length;
  const w = sheet.frames[0][0].length;
  sheet.frames.forEach((grid, f) => {
    if (grid.length !== h) throw new Error(`${sheet.key} frame ${f}: ${grid.length} rows, expected ${h}`);
    grid.forEach((row, y) => {
      if (row.length !== w) throw new Error(`${sheet.key} frame ${f} row ${y}: "${row}" is not ${w} wide`);
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === ".") continue;
        const color = sheet.palette[ch];
        if (color === undefined) throw new Error(`${sheet.key}: no colour for "${ch}"`);
        put(f * w + x, y, color);
      }
    });
  });
}

/** Paint every character sheet into a Phaser canvas texture with numbered frames. */
export function createCharacterTextures(scene: Phaser.Scene) {
  for (const sheet of characterSheets()) {
    if (scene.textures.exists(sheet.key)) continue;
    const h = sheet.frames[0].length;
    const w = sheet.frames[0][0].length;
    const tex = scene.textures.createCanvas(sheet.key, w * sheet.frames.length, h)!;
    const ctx = tex.getContext();
    paintSheet(sheet, (x, y, color) => {
      ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
      ctx.fillRect(x, y, 1, 1);
    });
    tex.refresh();
    sheet.frames.forEach((_, i) => tex.add(i, 0, i * w, 0, w, h));
  }
}

function shade(color: number, f: number) {
  const r = Math.round(((color >> 16) & 255) * f);
  const g = Math.round(((color >> 8) & 255) * f);
  const b = Math.round((color & 255) * f);
  return (r << 16) | (g << 8) | b;
}

function mix(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}
