import { Tile, parseMap } from "../map.js";
import type { LevelDef } from "../level.js";

/**
 * Level 4. Two jobs. Go through a gate in the fence (or cut it), open the
 * warehouse and take the map while the boss robot looks away, open the radio
 * hut and switch off the radio, then everyone to the boat at the pier.
 * A robot dog walks between the radio hut and the pier.
 * Run `npm run check-level` after changes.
 */
// prettier-ignore
const MAP = [
  "^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^~~~~~~~~", // 0
  "^.........F...........................~~~~~~~~", // 1
  "^.........F....................#####..~~~~~~~~", // 2
  "^.........F...########..######.#...#..~~~~~~~~", // 3
  "^....bb...F...#....KK#..######.#.R.#..~~~~~~~~", // 4
  "^.........F...#......#..######.#...#..~~~~~~~~", // 5
  "^.............#......#..######.##D##..~~~~~~~~", // 6
  "^.........F...#......#..######........~~~~~~~~", // 7
  "^..^^.....F...#XX....#..######........~~~~~~~~", // 8
  "^.........F...###D####................~~~~~~~~", // 9
  "^.........F...........................~~~~~~~~", // 10
  "^.........F...........................~~~~~~~~", // 11
  "^..bb.....F...........................~~~~~~~~", // 12
  "^.........F..XXXX..XXXX..XXXX....bb...~~~~~~~~", // 13
  "^......^..F..XXXX..XXXX..XXXX.........~~~~~~~~", // 14
  "^.........F...........................~~~~~~~~", // 15
  "^.........F...........................~~~~~~~~", // 16
  "^......b..F....XXXX..XXXX..XXXX.......~~~~~~~~", // 17
  "^......b..F....XXXX..XXXX..XXXX.......~~~~~~~~", // 18
  "^.........F...........................~~~~~~~~", // 19
  "^.....................................~~~BBB~~", // 20
  "^.........F.........................=====BBB~~", // 21
  "^.........F............bb.............~~~BBB~~", // 22
  "^.........F.bb................XX......~~~~~~~~", // 23
  "^.SSS.....F........XX.................~~~~~~~~", // 24
  "^.SSS^....F...........................~~~~~~~~", // 25
  "^.........F...........................~~~~~~~~", // 26
  "^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^~~~~~~~~", // 27
  //0123456789012345678901234567890123456789012345
];

const map = parseMap(MAP);

export const harborYard: LevelDef = {
  id: "harbor-yard",
  name: "Harbor Yard",
  map,
  briefing: [
    "The robots keep a map of the island in a warehouse at the harbor.",
    "Your mission has two jobs: take the map and switch off the radio.",
    "Then everyone goes to the boat at the pier.",
    "Both doors are locked. The Engineer can open them.",
    "The boss robot watches the map, then it looks away. Wait for the right moment!",
    "A robot dog walks near the radio hut. It can smell you, even in a bush.",
  ],
  objectives: [
    { kind: "item", label: "Take the map", x: 16, y: 5, item: "map" },
    { kind: "fix", label: "Switch off the radio", x: 33, y: 4, doneTile: Tile.RadioOff },
  ],
  exit: { x: 41, y: 20, w: 3, h: 3, label: "Everyone to the boat" },
  checkpointRule: "all",
  parSeconds: 660,
  guards: [
    // North gate: watches the gate, then the yard.
    { stops: [{ x: 12, y: 6, wait: 8, look: [180, 90, 0] }] },
    // Yard patrol: a loop around the first row of containers.
    { route: "loop", stops: [
      { x: 12, y: 11, wait: 1.5, look: [270] },
      { x: 31, y: 11, wait: 1.5, look: [0] },
      { x: 31, y: 15, wait: 1.5, look: [90] },
      { x: 12, y: 15, wait: 1.5, look: [180] },
    ] },
    // Boss robot in the warehouse: watches the map, then looks east.
    { officer: true, stops: [{ x: 18, y: 7, wait: 6, look: [225, 0] }] },
    // Radio hut guard: watches the path south and west.
    { stops: [{ x: 33, y: 8, wait: 7, look: [90, 180] }] },
    // Robot dog: a loop between the radio hut and the pier.
    { route: "loop", dog: true, stops: [
      { x: 32, y: 9 }, { x: 37, y: 9 }, { x: 37, y: 19 }, { x: 32, y: 19 },
    ] },
    // Pier guard: walks beside the pier.
    { route: "pingpong", stops: [
      { x: 35, y: 18, wait: 2, look: [0, 180] },
      { x: 35, y: 24, wait: 2, look: [0, 180] },
    ] },
  ],
  checkpoints: [
    { x: 2, y: 24, w: 3, h: 2, spawns: map.spawns },
    // Behind the second warehouse, after the map.
    { x: 24, y: 1, w: 3, h: 2, spawns: [
      { x: 24, y: 1 }, { x: 25, y: 1 }, { x: 26, y: 1 },
      { x: 24, y: 2 }, { x: 25, y: 2 }, { x: 26, y: 2 },
    ] },
    // North of the pier, after the radio.
    { x: 36, y: 1, w: 2, h: 3, spawns: [
      { x: 36, y: 1 }, { x: 37, y: 1 }, { x: 36, y: 2 },
      { x: 37, y: 2 }, { x: 36, y: 3 }, { x: 37, y: 3 },
    ] },
  ],
};
