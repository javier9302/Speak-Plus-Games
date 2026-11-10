/**
 * Grid map model shared by server (collision, pathfinding) and client
 * (rendering). M1 uses a hand-written test map; Tiled JSON maps replace this
 * in M5 but should produce the same `GridMap` shape.
 */

export const TILE_SIZE = 16;

/** Tile kinds. Numeric values double as the tileset frame index on the client. */
export enum Tile {
  Floor = 0,
  Wall = 1,
  Snow = 2,
  Bush = 3,
  Water = 4,
  /** Locked door: blocks walking and sight until the Engineer opens it. */
  Door = 5,
  /** Fence: blocks walking but not sight; the Engineer cuts it. */
  Fence = 6,
  /** Alarm / radio panel (blocks walking); the Engineer switches it off. */
  Panel = 7,
  PanelOff = 8,
  DoorOpen = 9,
  FenceCut = 10,
  /** Radio antenna (level objective); the Engineer switches it off. */
  Radio = 11,
  RadioOff = 12,
  /** Wooden pier: walkable, over water. */
  Pier = 13,
  /** Boat deck: walkable (usually the exit zone). */
  Boat = 14,
  /** Pine tree: blocks walking and sight. */
  Tree = 15,
  /** Bush on snow (same as Bush: a hiding spot). */
  SnowBush = 16,
  /** Truck bed: walkable (exit zone). */
  Truck = 17,
  /** Stone bridge: walkable, over water. */
  Bridge = 18,
  /** Wooden crate: blocks walking and sight (cover). */
  Crate = 19,
  /** Office desk: blocks walking, not sight. */
  Desk = 20,
  /** Tree on grass (same as Tree). */
  GrassTree = 21,
}

/** Hiding spots: players inside are only found by bumping; dropped guards are covered. */
export const isBush = (t: Tile) => t === Tile.Bush || t === Tile.SnowBush;

/** Tiles players cannot walk on. */
const BLOCKING = new Set<Tile>([
  Tile.Wall, Tile.Water, Tile.Door, Tile.Fence, Tile.Panel, Tile.PanelOff, Tile.Radio, Tile.RadioOff, Tile.Tree,
  Tile.Crate, Tile.Desk, Tile.GrassTree,
]);

/** What the Engineer's Fix button does to each tile, and how long it takes (s). */
export const FIXES: Partial<Record<Tile, { to: Tile; seconds: number; verb: string; news: string }>> = {
  [Tile.Door]: { to: Tile.DoorOpen, seconds: 2, verb: "Open", news: "opened a door" },
  [Tile.Fence]: { to: Tile.FenceCut, seconds: 2, verb: "Cut", news: "cut the fence" },
  [Tile.Panel]: { to: Tile.PanelOff, seconds: 3, verb: "Switch off", news: "switched off the alarm" },
  [Tile.Radio]: { to: Tile.RadioOff, seconds: 3, verb: "Switch off", news: "switched off the radio antenna" },
};

export interface GridMap {
  width: number;
  height: number;
  /** Row-major tile kinds, length = width * height. */
  tiles: Tile[];
  /** Spawn tiles, one per player slot (reused if more players than spawns). */
  spawns: { x: number; y: number }[];
}

export function tileAt(map: GridMap, tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return Tile.Wall;
  return map.tiles[ty * map.width + tx];
}

export function isWalkable(map: GridMap, tx: number, ty: number): boolean {
  return !BLOCKING.has(tileAt(map, tx, ty));
}

export function setTile(map: GridMap, tx: number, ty: number, tile: Tile) {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return;
  map.tiles[ty * map.width + tx] = tile;
}

/** Rooms change tiles (doors open), so each room / client works on its own copy. */
export function cloneMap(map: GridMap): GridMap {
  return { ...map, tiles: [...map.tiles], spawns: map.spawns.map((s) => ({ ...s })) };
}

/**
 * Legend: `#` wall, `.` floor, `,` snow, `b` bush, `~` water, `S` spawn (floor),
 * `D` locked door, `F` fence, `P` alarm panel, `R` radio antenna, `=` pier,
 * `B` boat, `T` tree, `*` bush on snow, `Y` truck, `H` bridge, `X` crate, `K` desk,
 * `^` tree on grass.
 * Kept small and varied so tap-to-move and pathfinding can be tried around
 * corners, through gaps and across snow.
 */
const TEST_MAP = [
  "########################################",
  "#SSS...,,,,,,.....#.........~~~~~......#",
  "#SSS...,,,,,,.....#.........~~~~~......#",
  "#......,,,bb,.....#....bb...~~~~~..bb..#",
  "#......,,,bb,..........bb..............#",
  "#.....................####.............#",
  "#####.######......#...#..#....#####....#",
  "#.........#.......#...#..#....#,,,#....#",
  "#..bb.....#.......#...#..#....#,,,.....#",
  "#..bb.....#.......#............,,,#....#",
  "#.........#####.###...#..#....#####....#",
  "#.....................####.............#",
  "#,,,,,,,..........~~~~.........bb......#",
  "#,,,,,,,..........~~~~.........bb......#",
  "#,,bb,,,..#########FF##########....,,,,#",
  "#,,bb,,,..#..........................,,#",
  "#,,,,,,,..#....bb......,,,,,.........,,#",
  "#.........#....bb......,,,,,....bb...,,#",
  "#.....................,,,,,.....bb.....#",
  "#..............#.......................#",
  "#..~~~~........#.........######........#",
  "#..~~~~........#.........#..P.#....bb..#",
  "#..............#.........D....#....bb..#",
  "#..............#.........#....#........#",
  "########################################",
];

const LEGEND: Record<string, Tile> = {
  "#": Tile.Wall,
  ".": Tile.Floor,
  ",": Tile.Snow,
  b: Tile.Bush,
  "~": Tile.Water,
  S: Tile.Floor,
  D: Tile.Door,
  F: Tile.Fence,
  P: Tile.Panel,
  R: Tile.Radio,
  "=": Tile.Pier,
  B: Tile.Boat,
  T: Tile.Tree,
  "*": Tile.SnowBush,
  Y: Tile.Truck,
  H: Tile.Bridge,
  X: Tile.Crate,
  K: Tile.Desk,
  "^": Tile.GrassTree,
};

/** Build a GridMap from text rows (legend above). All rows must be the same length. */
export function parseMap(rows: string[]): GridMap {
  const height = rows.length;
  const width = rows[0].length;
  const tiles: Tile[] = [];
  const spawns: { x: number; y: number }[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? "#";
      if (ch === "S") spawns.push({ x, y });
      tiles.push(LEGEND[ch] ?? Tile.Wall);
    }
  });
  return { width, height, tiles, spawns };
}

export const testMap: GridMap = parseMap(TEST_MAP);
