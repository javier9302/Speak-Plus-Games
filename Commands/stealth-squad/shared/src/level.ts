import { Tile, testMap, type GridMap } from "./map.js";

/** A patrol stop. Tile coords; `look` angles in degrees (0 = east, 90 = south). */
export interface GuardStop {
  x: number;
  y: number;
  /** Seconds to stand here (split evenly between the `look` directions). */
  wait?: number;
  look?: number[];
}

export interface GuardDef {
  stops: GuardStop[];
  /** Officers see through the Disguise and can't be distracted by chat. */
  officer?: boolean;
  /** A dog: faster, short sight, smells anyone close (see DOG in vision.ts). */
  dog?: boolean;
  /** loop: A→B→C→A. pingpong: A→B→C→B→A. One stop = stands still, turning. */
  route?: "loop" | "pingpong";
}

export interface CheckpointDef {
  /** Tile rectangle that activates it. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where players restart (one per player slot). */
  spawns: { x: number; y: number }[];
}

/**
 * Something the team must do before leaving:
 * - "fix": a tile must become `doneTile` (Engineer switches off the radio).
 * - "item": anyone walks onto (x, y) and picks it up (steal the plans).
 * Both stay done after a checkpoint restart.
 */
export type ObjectiveDef =
  | { kind: "fix"; label: string; x: number; y: number; doneTile: Tile }
  | { kind: "item"; label: string; x: number; y: number; item: string }
  /** A friend waits at (x, y); walk up to them and they follow you. They must reach the exit too. */
  | { kind: "rescue"; label: string; x: number; y: number; name: string };

/**
 * A searchlight on a tower: its bright spot sweeps from `from` to `to` and
 * back (tile coords), taking `seconds` each way. Anyone in the spot is seen
 * almost at once. Switching off the panel at `panel` (Engineer) turns it off.
 */
export interface SearchlightDef {
  tower: { x: number; y: number };
  from: { x: number; y: number };
  to: { x: number; y: number };
  seconds: number;
  /** Spot radius in tiles. */
  radius: number;
  panel?: { x: number; y: number };
}

export interface LevelDef {
  /** Stable id (lobby picker, state.levelId). */
  id: string;
  name: string;
  map: GridMap;
  /** Mission briefing, simple English (A2), one sentence per line. */
  briefing: string[];
  objectives: ObjectiveDef[];
  /** Exit zone (tile rect). Level is won when objectives are done and every connected player is inside. */
  exit: { x: number; y: number; w: number; h: number; label: string };
  /** Dark level (visual only): lights and characters stand out. */
  night?: boolean;
  searchlights?: SearchlightDef[];
  guards: GuardDef[];
  /** checkpoints[0] is the start. */
  checkpoints: CheckpointDef[];
  /** "all": every connected player must stand in it; "one": first to arrive. */
  checkpointRule: "all" | "one";
  /** Target time (s) for the end-screen time star. A guess until classes play it: tune it. */
  parSeconds: number;
}

/** M3 test level on the M1 test map. Replaced by Tiled levels in M5. */
export const testLevel: LevelDef = {
  id: "test",
  name: "Test Yard",
  map: testMap,
  briefing: [
    "This is the practice yard.",
    "Try your skills. Switch off the alarm in the small hut.",
    "Then everyone goes to the bottom-right corner.",
  ],
  objectives: [{ kind: "fix", label: "Switch off the alarm", x: 28, y: 21, doneTile: Tile.PanelOff }],
  exit: { x: 35, y: 22, w: 4, h: 2, label: "Everyone to the corner" },
  checkpointRule: "all",
  parSeconds: 300,
  guards: [
    // Walks along the top corridor, looks around at each end.
    { route: "pingpong", stops: [
      { x: 10, y: 4, wait: 2, look: [90, 180] },
      { x: 17, y: 4, wait: 2, look: [90, 0] },
    ] },
    // Stands still and turns: the Scout's countdown matters most here.
    { stops: [{ x: 28, y: 9, wait: 6, look: [180, 90] }] },
    // Officer: loops around the lower yard.
    { route: "loop", officer: true, stops: [
      { x: 12, y: 16, wait: 1 },
      { x: 30, y: 16, wait: 1.5, look: [90] },
      { x: 30, y: 18, wait: 1 },
      { x: 12, y: 18, wait: 1.5, look: [270] },
    ] },
  ],
  checkpoints: [
    { x: 1, y: 1, w: 3, h: 2, spawns: testMap.spawns },
    { x: 31, y: 7, w: 3, h: 3, spawns: [
      { x: 31, y: 7 }, { x: 32, y: 7 }, { x: 33, y: 7 },
      { x: 31, y: 8 }, { x: 32, y: 8 }, { x: 33, y: 8 },
    ] },
    { x: 35, y: 22, w: 4, h: 2, spawns: [
      { x: 35, y: 22 }, { x: 38, y: 22 }, { x: 35, y: 23 },
      { x: 36, y: 23 }, { x: 37, y: 23 }, { x: 38, y: 23 },
    ] },
  ],
};
