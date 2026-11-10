import { Tile, parseMap } from "../map.js";
import type { LevelDef } from "../level.js";

/**
 * Level 5, the last mission. Night. Three jobs inside the walled factory:
 * rescue the friend from the cell block (west), switch off the radio in the
 * main hall (boss robot inside), take the control chip from the office
 * (north-east), then everyone, friend included, to the truck (east).
 * Ways in: the south door (Engineer), cut the fence, or the open gap (guarded).
 * Two searchlights, each with its own switch box (one is inside the hall),
 * and two robot dogs.
 * Run `npm run check-level` after changes.
 */
// prettier-ignore
const MAP = [
  "##############################################", // 0
  "#............................................#", // 1
  "#.#########............bb.........########...#", // 2
  "#.#.......#...................b...#......#...#", // 3
  "#.#.......#.......................#.K...K#...#", // 4
  "#.#.......#.....##############....#......#...#", // 5
  "#.#.......#.....#...........P#....#......#...#", // 6
  "#.####D####.....#..KK....KK..#....###D####...#", // 7
  "#...............#.....R......#...............#", // 8
  "#...............D............#..............X#", // 9
  "#...............#............#...............#", // 10
  "#...............#.X........X.#.....X.........#", // 11
  "#...............#............#.....X.........#", // 12
  "#.......XX......######D#######...............#", // 13
  "#........................................YYY.#", // 14
  "#...bb...................................YYY.#", // 15
  "#...........P.......XX...................YYY.#", // 16
  "#...................................bb.......#", // 17
  "#........................X...................#", // 18
  "#..........................................b.#", // 19
  "##############D###########FFFF########.#######", // 20
  "#............................................#", // 21
  "#............................................#", // 22
  "#.......bb..............XX..............bb...#", // 23
  "#.SSS.........................bb.............#", // 24
  "#.SSS........X....bb...............X.........#", // 25
  "#............................................#", // 26
  "##############################################", // 27
  //0123456789012345678901234567890123456789012345
];

const map = parseMap(MAP);

export const robotFactory: LevelDef = {
  id: "robot-factory",
  name: "Robot Factory",
  map,
  night: true,
  briefing: [
    "This is the last mission. It is night at the robot factory.",
    "You have three jobs: rescue our friend, switch off the radio, and take the control chip.",
    "Then everyone, and our friend, goes to the truck.",
    "Our friend is in the cell block. The radio is in the big hall. The chip is in the office.",
    "Two searchlights move across the yard. The Engineer can switch them off.",
    "There are two robot dogs and two boss robots. Plan together before you move!",
  ],
  objectives: [
    { kind: "rescue", label: "Rescue our friend", x: 4, y: 4, name: "Friend" },
    { kind: "fix", label: "Switch off the radio", x: 22, y: 8, doneTile: Tile.RadioOff },
    { kind: "item", label: "Take the control chip", x: 39, y: 4, item: "chip" },
  ],
  exit: { x: 41, y: 14, w: 3, h: 3, label: "Everyone to the truck" },
  checkpointRule: "all",
  parSeconds: 900,
  searchlights: [
    { tower: { x: 44, y: 18 }, from: { x: 14, y: 17 }, to: { x: 34, y: 17 }, seconds: 7, radius: 1.6, panel: { x: 12, y: 16 } },
    { tower: { x: 44, y: 1 }, from: { x: 32, y: 3 }, to: { x: 32, y: 18 }, seconds: 6, radius: 1.6, panel: { x: 28, y: 6 } },
  ],
  guards: [
    // Outside: walks along the south wall.
    { route: "pingpong", stops: [
      { x: 11, y: 22, wait: 2, look: [270, 90] },
      { x: 36, y: 22, wait: 2, look: [270, 90] },
    ] },
    // Watches the open gap from inside.
    { stops: [{ x: 38, y: 18, wait: 7, look: [90, 180, 0] }] },
    // Robot dog 1: a loop around the west yard.
    { route: "loop", dog: true, stops: [
      { x: 3, y: 11 }, { x: 13, y: 11 }, { x: 13, y: 18 }, { x: 3, y: 18 },
    ] },
    // Cell guard: stands outside the cell block door and turns.
    { stops: [{ x: 6, y: 9, wait: 8, look: [90, 0, 180] }] },
    // Boss robot 1 in the hall: walks between the desks, looks south at each end.
    { route: "pingpong", officer: true, stops: [
      { x: 18, y: 10, wait: 3, look: [90] },
      { x: 27, y: 10, wait: 3, look: [90] },
    ] },
    // Yard patrol below the hall.
    { route: "loop", stops: [
      { x: 15, y: 15, wait: 1.5, look: [270] },
      { x: 30, y: 15, wait: 1.5, look: [0] },
      { x: 30, y: 18, wait: 1.5, look: [90] },
      { x: 15, y: 18, wait: 1.5, look: [180] },
    ] },
    // Boss robot 2 outside the office door.
    { officer: true, stops: [{ x: 37, y: 9, wait: 8, look: [90, 0, 180] }] },
    // Robot dog 2: walks beside the truck.
    { route: "pingpong", dog: true, stops: [
      { x: 39, y: 11, wait: 1 },
      { x: 39, y: 18, wait: 1 },
    ] },
  ],
  checkpoints: [
    { x: 2, y: 24, w: 3, h: 2, spawns: map.spawns },
    // North-west corner, next to the cell block.
    { x: 11, y: 2, w: 3, h: 2, spawns: [
      { x: 11, y: 2 }, { x: 12, y: 2 }, { x: 13, y: 2 },
      { x: 11, y: 3 }, { x: 12, y: 3 }, { x: 13, y: 3 },
    ] },
    // North of the hall.
    { x: 17, y: 1, w: 3, h: 2, spawns: [
      { x: 17, y: 1 }, { x: 18, y: 1 }, { x: 19, y: 1 },
      { x: 17, y: 2 }, { x: 18, y: 2 }, { x: 19, y: 2 },
    ] },
  ],
};
