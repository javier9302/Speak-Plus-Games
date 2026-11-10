import { Tile, parseMap } from "../map.js";
import type { LevelDef } from "../level.js";

/**
 * Level 1 — tutorial. Start in the snowy forest (bottom-left), get into the
 * fenced outpost (south gate, east gate, or cut the fence), open the radio hut
 * and switch off the antenna, then reach the boat at the pier (east).
 * Guards: forest patrol, gate guard (turns), compound patrol, officer at the pier.
 * Edit with care and run `npm run check-level` after changes.
 */
// prettier-ignore
const MAP = [
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~~~~~~", // 0
  "T,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,......~~~~~~~", // 1
  "T,,,,,,,,,,,FFFFFFFFFFFFFFFFFFF......~~~~~~~", // 2
  "T,,TT,**,TT,F.................F...bb.~~~~~~~", // 3
  "T,,T,,,,,,,,F.#####...#######.F......~~~~~~~", // 4
  "T,,,,,,,,,,,F.#####...#.....#.F......~~~~~~~", // 5
  "T,,,,,,,,,,,F.#####...#..R..#.F......~~~~~~~", // 6
  "T,,,T,,,,,,,F.#####...#.....#.F......~~~~~~~", // 7
  "T,,,,,,,,,,,F.........###D###.F......~~~~~~~", // 8
  "T,,,,,,**,,,F.................F......~~~~~~~", // 9
  "T,TT,,,,,,,,F.................F......~~~~~~~", // 10
  "T,,,,,,,,,,,F..bb....................~~~~~~~", // 11
  "T,,,,,,,,,,,F......,,................~~~~~~~", // 12
  "T,,,,,,,,,,,F......,,......bb.F......~~~~~~~", // 13
  "T,**,,,,TT,,F.................F...bb.~~~~~~~", // 14
  "T,,,,,,,,T,,FFFFFFFF,,FFFFFFFFF......~~~~~~~", // 15
  "T,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,......~~~~~~~", // 16
  "T,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,......~~~~~~~", // 17
  "T,,,,TT,,,,,,,,,,,,,,,,,,,,,,**......~~~~~~~", // 18
  "T,,,,,,,,,,,,,TT,,,,,,,,,,TT,,,......~~BBB~~", // 19
  "T,,,*,,,,,TT,,,T,,**,,,,,,,,,,,..======BBB~~", // 20
  "T,,,,,,,,,T,,,,,,,,,,,TT,,,,,,,......~~BBB~~", // 21
  "T,SSS,,,,,,,,**,,,,,,,,,,*,,,,,......~~~~~~~", // 22
  "T,SSS,,,,,,,,,,,,,,,,,,,,,,,,,,......~~~~~~~", // 23
  "T,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,......~~~~~~~", // 24
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~~~~~~", // 25
  //0123456789012345678901234567890123456789012
];

const map = parseMap(MAP);

export const snowOutpost: LevelDef = {
  id: "snow-outpost",
  name: "Snow Outpost",
  map,
  briefing: [
    "We are in the snowy forest, near an enemy outpost.",
    "The outpost has a radio antenna. It can call for help.",
    "Your mission: switch off the radio, then go to the boat.",
    "The radio is in a small locked hut. Only the Engineer can open the door.",
    "Four robots are watching. The gold one is the boss robot.",
    "Talk to your team! Use the phrases on your card.",
  ],
  objectives: [{ kind: "fix", label: "Switch off the radio", x: 25, y: 6, doneTile: Tile.RadioOff }],
  exit: { x: 39, y: 19, w: 3, h: 3, label: "Everyone to the boat" },
  checkpointRule: "all",
  parSeconds: 360,
  guards: [
    // Forest patrol: walks across the west path, looks north and south at each end.
    { route: "pingpong", stops: [
      { x: 4, y: 12, wait: 2, look: [270, 90] },
      { x: 11, y: 12, wait: 2, look: [270, 90] },
    ] },
    // Gate guard: stands outside the south gate and turns. Scout: count for the team!
    { stops: [{ x: 21, y: 17, wait: 9, look: [180, 90, 0] }] },
    // Compound patrol: a loop below the radio hut, passes the hut door.
    { route: "loop", stops: [
      { x: 14, y: 10, wait: 1.5, look: [0] },
      { x: 28, y: 10, wait: 1.5, look: [90] },
      { x: 28, y: 13, wait: 1.5, look: [180] },
      { x: 14, y: 13, wait: 1.5, look: [270] },
    ] },
    // Officer on the shore: guards the way to the pier. Can't be fooled by the Disguise.
    { route: "pingpong", officer: true, stops: [
      { x: 33, y: 18, wait: 2, look: [270, 180] },
      { x: 33, y: 23, wait: 2, look: [90, 180] },
    ] },
  ],
  checkpoints: [
    { x: 2, y: 22, w: 3, h: 2, spawns: map.spawns },
    // Inside the compound, between the barracks and the radio hut.
    { x: 19, y: 4, w: 3, h: 3, spawns: [
      { x: 19, y: 4 }, { x: 20, y: 4 }, { x: 21, y: 4 },
      { x: 19, y: 5 }, { x: 20, y: 5 }, { x: 21, y: 5 },
    ] },
    // North shore, after the radio (out of the compound guard's view through the fence).
    { x: 32, y: 3, w: 4, h: 2, spawns: [
      { x: 32, y: 3 }, { x: 33, y: 3 }, { x: 32, y: 4 },
      { x: 33, y: 4 }, { x: 34, y: 4 }, { x: 35, y: 4 },
    ] },
  ],
};
