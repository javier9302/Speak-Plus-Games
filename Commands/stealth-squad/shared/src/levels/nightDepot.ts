import { parseMap } from "../map.js";
import type { LevelDef } from "../level.js";

/**
 * Level 3. Night. Get into the fenced depot (two gaps, or cut the fence),
 * cross the yard under two searchlights (or switch them off at the box `P`),
 * avoid the dog, open the cell and rescue your friend, then take everyone —
 * friend included — to the truck.
 * Run `npm run check-level` after changes.
 */
// prettier-ignore
const MAP = [
  "##############################################", // 0
  "#.......F.................#..................#", // 1
  "#.......F....................................#", // 2
  "#.^^....F...########................#######..#", // 3
  "#.......F...########................#.....#..#", // 4
  "#...bb..F...########................#.....#..#", // 5
  "#...........########................#.....#..#", // 6
  "#.......F...########................#.....#..#", // 7
  "#....^..F...########................###D###..#", // 8
  "#.bb....F...########..........XX.............#", // 9
  "#.......F...........X........................#", // 10
  "#.......F..X.................................#", // 11
  "#.^^....F....................................#", // 12
  "#....bb.F.............P.XX.......bb..........#", // 13
  "#.......F....................................#", // 14
  "#.......F..X.................................#", // 15
  "#....^^.F............X.......................#", // 16
  "#..b....F...########.........................#", // 17
  "#.......F...########.........XX..............#", // 18
  "#.^.....F...########.........................#", // 19
  "#.......F...########.........................#", // 20
  "#...bb......########.....................YYY.#", // 21
  "#.......F...########.....................YYY.#", // 22
  "#.SSS...F...########..............XX.....YYY.#", // 23
  "#.SSS...F..............bb....................#", // 24
  "#.......F.bb.................................#", // 25
  "#.......F.................#..................#", // 26
  "##############################################", // 27
  //0123456789012345678901234567890123456789012345
];

const map = parseMap(MAP);

export const nightDepot: LevelDef = {
  id: "night-depot",
  name: "Night Depot",
  map,
  night: true,
  briefing: [
    "It is night. Our friend is locked in a cell in the depot.",
    "Your mission: rescue our friend, then everyone goes to the truck.",
    "Two searchlights move across the yard. Don't stand in the light!",
    "The Engineer can switch off the lights at the switch box.",
    "Be careful of the robot dog. It can smell you, even in a bush.",
    "Our friend can't hide or crawl. Protect them!",
  ],
  objectives: [{ kind: "rescue", label: "Rescue our friend", x: 39, y: 5, name: "Friend" }],
  exit: { x: 41, y: 21, w: 3, h: 3, label: "Everyone to the truck" },
  checkpointRule: "all",
  parSeconds: 600,
  searchlights: [
    { tower: { x: 26, y: 1 }, from: { x: 21, y: 5 }, to: { x: 34, y: 5 }, seconds: 5, radius: 1.6, panel: { x: 22, y: 13 } },
    { tower: { x: 26, y: 26 }, from: { x: 21, y: 22 }, to: { x: 34, y: 22 }, seconds: 6, radius: 1.6, panel: { x: 22, y: 13 } },
  ],
  guards: [
    // North gap guard: watches the gap in the fence, then the yard.
    { stops: [{ x: 10, y: 7, wait: 6, look: [180, 0] }] },
    // Fence patrol (inside), walks along the west fence.
    { route: "pingpong", stops: [
      { x: 10, y: 13, wait: 2, look: [180, 270] },
      { x: 10, y: 21, wait: 2, look: [180, 90] },
    ] },
    // Dog: loops around the middle of the yard.
    { route: "loop", dog: true, stops: [
      { x: 22, y: 11 }, { x: 34, y: 11 }, { x: 34, y: 16 }, { x: 22, y: 16 },
    ] },
    // Switch box guard.
    { stops: [{ x: 23, y: 15, wait: 9, look: [270, 0, 180] }] },
    // Officer in front of the cell.
    { officer: true, stops: [{ x: 39, y: 10, wait: 9, look: [180, 0, 90] }] },
    // Truck guard.
    { route: "pingpong", stops: [
      { x: 39, y: 19, wait: 2, look: [0, 180] },
      { x: 39, y: 25, wait: 2, look: [0, 180] },
    ] },
  ],
  checkpoints: [
    { x: 2, y: 23, w: 3, h: 2, spawns: map.spawns },
    // Between the warehouses.
    { x: 14, y: 11, w: 3, h: 2, spawns: [
      { x: 14, y: 11 }, { x: 15, y: 11 }, { x: 16, y: 11 },
      { x: 14, y: 12 }, { x: 15, y: 12 }, { x: 16, y: 12 },
    ] },
    // North-east corner, after the cell.
    { x: 43, y: 1, w: 2, h: 3, spawns: [
      { x: 43, y: 1 }, { x: 44, y: 1 }, { x: 43, y: 2 },
      { x: 44, y: 2 }, { x: 43, y: 3 }, { x: 44, y: 3 },
    ] },
  ],
};
