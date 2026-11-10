import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import type { Phase } from "@stealth-squad/shared";

/** Authoritative per-player state that Colyseus syncs to every client. */
export class Player extends Schema {
  @type("string") nickname = "";
  /** False while a dropped phone has its slot held for reconnection. */
  @type("boolean") connected = true;
  /** A `Role` value, or "" if not picked yet. */
  @type("string") role = "";
  /** Join order; used for spawn slot and stable list order in the lobby. */
  @type("uint8") slot = 0;
  /** Position in world pixels (tile centre = tile * TILE_SIZE + TILE_SIZE / 2). */
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("boolean") crawling = false;
  @type("boolean") moving = false;
  /** Ability ids (shared `Skill`), set at level start incl. merged roles. */
  @type(["string"]) skills = new ArraySchema<string>();
  /** Standing in a bush: only noticed by bumping into a guard. */
  @type("boolean") hidden = false;
  /** Trapper burrowed in snow: invisible, can't move. */
  @type("boolean") buried = false;
  /** Index of the guard being carried, -1 = none. */
  @type("int8") carrying = -1;
  /** Objective item this player picked up ("plans"), "" = none. Kept through checkpoint restarts. */
  @type("string") item = "";
  /** Wearing the guard uniform (Disguise). */
  @type("boolean") disguised = false;
  /** How close guards are to seeing through the disguise, 0–100. */
  @type("uint8") suspicion = 0;
  /** Timed action in progress ("cover" | "getup" | "dress" | "fix" | ""), and its progress 0–100. */
  @type("string") action = "";
  @type("uint8") progress = 0;
}

/**
 * Guards are visible to everyone (position + facing, so sprites can turn).
 * Cones and turn timers are NOT in state: Scout/host compute cones locally
 * and get timers via the targeted `intel` message.
 */
export class Guard extends Schema {
  @type("float32") x = 0;
  @type("float32") y = 0;
  /** Facing, radians (0 = east, π/2 = south). */
  @type("float32") angle = 0;
  /** Alert meter 0–100; 100 = spotted. */
  @type("uint8") alert = 0;
  /** "patrol" | "stuck" | "asleep" | "netted" | "tied" | "carried" */
  @type("string") status = "patrol";
  /** Tied guard hidden under snow/leaves or in a bush: not evidence. */
  @type("boolean") covered = false;
  /** Woke up from a dart: sees further (Scout's cone is bigger). */
  @type("boolean") woke = false;
  /** Officers see through the disguise and don't chat. */
  @type("boolean") officer = false;
  /** A dog (short sight + smell, faster). */
  @type("boolean") dog = false;
}

/** Searchlight: tower position and the moving spot (pixels). Public: everyone sees lights. */
export class Light extends Schema {
  @type("float32") towerX = 0;
  @type("float32") towerY = 0;
  @type("float32") x = 0;
  @type("float32") y = 0;
  /** Spot radius in pixels. */
  @type("float32") radius = 0;
  @type("boolean") on = true;
}

/** A friend to rescue (follows the team once freed). */
export class Ally extends Schema {
  @type("string") name = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("boolean") freed = false;
  @type("boolean") moving = false;
}

/** A glue or net trap waiting on the ground (visible to the team). */
export class Trap extends Schema {
  @type("string") kind = "glue";
  @type("float32") x = 0;
  @type("float32") y = 0;
}

/** Room-wide synced state. The host is not a player and isn't in `players`. */
export class GameState extends Schema {
  @type("string") code = "";
  @type("string") phase: Phase = "lobby";
  /** Selected level (shared LEVELS id). */
  @type("string") levelId = "";
  /** Teacher's difficulty for every level (shared DIFFICULTY key). */
  @type("string") difficulty = "normal";
  /** One flag per level objective. */
  @type(["boolean"]) objectivesDone = new ArraySchema<boolean>();
  /** Times the team was spotted this mission, and the finish time (s) once won. */
  @type("uint16") spottedCount = 0;
  @type("uint16") missionSeconds = 0;
  @type("boolean") hostConnected = false;
  @type("boolean") paused = false;
  /** Index of the last reached checkpoint (0 = start). */
  @type("uint8") checkpoint = 0;
  /** Seconds left on the "Spotted!" screen. */
  @type("uint8") countdown = 0;
  /** Nickname of whoever was spotted (shown on the Spotted screen). */
  @type("string") spottedName = "";
  /** Why the team was spotted, shown on the Spotted screen. */
  @type("string") spottedText = "";
  /** Team's limited items left this checkpoint. */
  @type("uint8") darts = 0;
  @type("uint8") glue = 0;
  @type("uint8") nets = 0;
  @type("uint8") noise = 0;
  @type([Trap]) traps = new ArraySchema<Trap>();
  @type([Light]) lights = new ArraySchema<Light>();
  @type([Ally]) allies = new ArraySchema<Ally>();
  /** Dark level (client draws night). */
  @type("boolean") night = false;
  /** Tiles changed during play (doors opened...): tile index → Tile. */
  @type({ map: "uint8" }) tiles = new MapSchema<number>();
  /** Why the game is paused when it wasn't the host's button ("Ben lost connection"). */
  @type("string") pauseReason = "";
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([Guard]) guards = new ArraySchema<Guard>();
}
