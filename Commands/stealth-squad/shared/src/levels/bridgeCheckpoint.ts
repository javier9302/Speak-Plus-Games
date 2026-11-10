import { parseMap } from "../map.js";
import type { LevelDef } from "../level.js";

/**
 * Level 2. Start on the west bank. Cross the only bridge (a river patrol on
 * the west bank, a turning guard at the east end), sneak through the town,
 * open the office and steal the plans while the officer inside looks away,
 * then reach the truck on the east road (guarded).
 * Run `npm run check-level` after changes.
 */
// prettier-ignore
const MAP = [
  "^^^^^^^^^^^^^^^^^^^###########################", // 0
  "^..................~~~~......................#", // 1
  "^..................~~~~......................#", // 2
  "^.........^........~~~~......................#", // 3
  "^..^^..............~~~~.......#########......#", // 4
  "^.....bb...........~~~~.......#.......#......#", // 5
  "^.............bb...~~~~....X..#...KK..#......#", // 6
  "^..................~~~~....X..#.......#......#", // 7
  "^.......^^.........~~~~.......#.......#..X...#", // 8
  "^..................~~~~.......#.......#..X...#", // 9
  "^...........bb.XX..~~~~...X...####D####......#", // 10
  "^.^................~~~~......................#", // 11
  "^..................HHHH......................#", // 12
  "^...........X......HHHH......................#", // 13
  "^..................HHHH.................b....#", // 14
  "^....^^............~~~~.................b....#", // 15
  "^..............XX..~~~~......................#", // 16
  "^..................~~~~..........b...........#", // 17
  "^..bb..............~~~~.b....................#", // 18
  "^...........^^.....~~~~.b....XX..............#", // 19
  "^..................~~~~..................YYY.#", // 20
  "^..................~~~~..X...............YYY.#", // 21
  "^.SSS..........bb..~~~~..X.........XX....YYY.#", // 22
  "^.SSS..............~~~~......................#", // 23
  "^........bb........~~~~......................#", // 24
  "^..................~~~~......................#", // 25
  "^..................~~~~......................#", // 26
  "^^^^^^^^^^^^^^^^^^^###########################", // 27
  //0123456789012345678901234567890123456789012345
];

const map = parseMap(MAP);

export const bridgeCheckpoint: LevelDef = {
  id: "bridge-checkpoint",
  name: "Bridge Checkpoint",
  map,
  briefing: [
    "There is only one bridge over the river. Robots are watching it.",
    "On the other side, the boss robot keeps secret plans in its office.",
    "Your mission: steal the plans, then escape in the truck.",
    "The office door is locked. The Engineer can open it.",
    "The boss robot looks at the plans, then it looks away. Wait for the right moment!",
    "Remember: the gold boss robot can see through a costume.",
  ],
  objectives: [{ kind: "item", label: "Steal the plans", x: 36, y: 6, item: "plans" }],
  exit: { x: 41, y: 20, w: 3, h: 3, label: "Everyone to the truck" },
  checkpointRule: "all",
  parSeconds: 480,
  guards: [
    // River patrol on the west bank: walks past the bridge.
    { route: "pingpong", stops: [
      { x: 17, y: 4, wait: 2, look: [270, 0] },
      { x: 17, y: 22, wait: 2, look: [90, 0] },
    ] },
    // Bridge guard at the east end: watches the bridge, then turns away.
    { stops: [{ x: 24, y: 13, wait: 9, look: [180, 90, 270] }] },
    // Town patrol between the bridge and the office.
    { route: "loop", stops: [
      { x: 26, y: 12, wait: 1.5, look: [0] },
      { x: 39, y: 12, wait: 1.5, look: [90] },
      { x: 39, y: 16, wait: 1.5, look: [180] },
      { x: 26, y: 16, wait: 1.5, look: [270] },
    ] },
    // Officer in the office: watches the plans, then looks north.
    { officer: true, stops: [{ x: 32, y: 8, wait: 6, look: [0, 270] }] },
    // Truck guard: walks beside the truck.
    { route: "pingpong", stops: [
      { x: 39, y: 18, wait: 2, look: [0, 270] },
      { x: 39, y: 24, wait: 2, look: [0, 90] },
    ] },
  ],
  checkpoints: [
    { x: 2, y: 22, w: 3, h: 2, spawns: map.spawns },
    // East bank, north of the bridge.
    { x: 23, y: 2, w: 3, h: 2, spawns: [
      { x: 23, y: 2 }, { x: 24, y: 2 }, { x: 25, y: 2 },
      { x: 23, y: 3 }, { x: 24, y: 3 }, { x: 25, y: 3 },
    ] },
    // North-east corner, after the office.
    { x: 41, y: 2, w: 3, h: 2, spawns: [
      { x: 41, y: 2 }, { x: 42, y: 2 }, { x: 43, y: 2 },
      { x: 41, y: 3 }, { x: 42, y: 3 }, { x: 43, y: 3 },
    ] },
  ],
};
