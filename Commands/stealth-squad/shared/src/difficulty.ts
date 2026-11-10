import { ABILITY } from "./skills.js";

/** Picked by the teacher in the lobby; applies to every level. Normal = the levels as designed. */
export type Difficulty = "easy" | "normal" | "hard";
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

export interface DifficultyDef {
  name: string;
  /** One line for the teacher's lobby and the briefing. */
  blurb: string;
  /** × robot sight range (the Scout's cones use it too). */
  sightFactor: number;
  /** × how fast a robot's alert meter fills. */
  fillFactor: number;
  /** Team pools per checkpoint. */
  darts: number;
  glue: number;
  nets: number;
  noise: number;
  /** Seconds until a tied / netted robot frees itself (0 = never). Not while carried. */
  freeSeconds: number;
  /** Each wait at a patrol stop is randomly up to this fraction longer or shorter (0 = always the same). */
  waitJitter: number;
  /** Spotted this many times → the mission starts again from the beginning (0 = no limit). */
  maxSpotted: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  easy: {
    name: "Easy",
    blurb: "Robots see less and notice you slowly. More darts and traps.",
    sightFactor: 0.8,
    fillFactor: 0.6,
    darts: 5,
    glue: 3,
    nets: 2,
    noise: 3,
    freeSeconds: 0,
    waitJitter: 0,
    maxSpotted: 0,
  },
  normal: {
    name: "Normal",
    blurb: "The levels as designed.",
    sightFactor: 1,
    fillFactor: 1,
    darts: ABILITY.dartsPerCheckpoint,
    glue: ABILITY.gluePerCheckpoint,
    nets: ABILITY.netsPerCheckpoint,
    noise: ABILITY.noisePerCheckpoint,
    freeSeconds: 0,
    waitJitter: 0,
    maxSpotted: 0,
  },
  hard: {
    name: "Hard",
    blurb: "Robots notice you faster, free themselves after 40 s, and change their timing. Spotted 5 times = start again.",
    // Not above 1: some checkpoint spawns are just outside normal sight (npm run check-level).
    sightFactor: 1,
    fillFactor: 1.4,
    darts: 2,
    glue: 1,
    nets: 1,
    noise: 1,
    freeSeconds: 40,
    waitJitter: 0.35,
    maxSpotted: 5,
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return DIFFICULTIES.includes(value as Difficulty);
}

export const getDifficulty = (value: unknown): DifficultyDef => DIFFICULTY[isDifficulty(value) ? value : "normal"];

/** End-screen stars: finishing, few alarms, and beating the level's target time. */
export const STAR_MAX_SPOTTED = 2;

export function missionStars(parSeconds: number, seconds: number, spotted: number): { got: boolean; kind: "done" | "spotted" | "time" }[] {
  return [
    { got: true, kind: "done" },
    { got: spotted <= STAR_MAX_SPOTTED, kind: "spotted" },
    { got: seconds <= parSeconds, kind: "time" },
  ];
}
