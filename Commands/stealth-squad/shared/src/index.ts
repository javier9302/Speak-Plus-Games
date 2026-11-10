/**
 * Shared types and constants used by both client and server.
 * Keep this free of runtime dependencies (no Phaser, no Colyseus) so it can be
 * imported from either side cheaply.
 */

/** Network / room constants. */
export const PROTOCOL_VERSION = 2;
export const GAME_ROOM = "game";
export const SERVER_TICK_HZ = 20;
export const MAX_PLAYERS = 6;
/** Seconds a dropped phone (screen lock, Wi-Fi blip) can come back into its slot. */
export const RECONNECT_SECONDS = 60;
/** Seconds the host screen can be gone (laptop reload) before the room closes. */
export const HOST_RECONNECT_SECONDS = 120;

export * from "./roles.js";
export * from "./skills.js";
export * from "./map.js";
export * from "./path.js";
export * from "./vision.js";
export * from "./level.js";
export * from "./levels/index.js";
export * from "./difficulty.js";

/** Movement speeds in tiles per second. Crawling is slower (and, from M3,
 *  shrinks the distance at which guards can see you). */
export const WALK_SPEED = 4;
export const CRAWL_SPEED = 1.8;
export const GUARD_SPEED = 2.2;
/** Guard turning speed, radians per second. */
export const GUARD_TURN_SPEED = Math.PI * 1.5;
/** "Spotted!" countdown before the team restarts at the checkpoint. */
export const SPOTTED_SECONDS = 3;

/** Room phase, synced in state. */
/** lobby → briefing (read the mission) → playing ⇄ spotted → won. */
export type Phase = "lobby" | "briefing" | "playing" | "spotted" | "won";

/** Options passed when creating (host) or joining (player) a room. */
export interface JoinOptions {
  host?: boolean;
  nickname?: string;
}

/** Messages the client sends to the server. */
export type ClientMessage =
  | { type: "ping"; t: number }
  /** Tap-to-move: target tile; server pathfinds and moves the player. */
  | { type: "moveTo"; tx: number; ty: number }
  | { type: "crawl"; on: boolean }
  /** Player picks a free role ("" = give it back). */
  | { type: "pickRole"; role: string }
  /** Host only: set any player's role ("" = none); swaps if already taken. */
  | { type: "assignRole"; sessionId: string; role: string }
  /** Host only. */
  | { type: "start" }
  | { type: "backToLobby" }
  | { type: "pause"; on: boolean }
  /** Host only: restart from checkpoint 0. */
  | { type: "restartLevel" }
  /** Host only: jump everyone to the next checkpoint. */
  | { type: "skipCheckpoint" }
  /** Use an ability. Aimed skills (ping, dart, trap) include the tapped world position; trap also its kind. */
  | { type: "use"; skill: string; x?: number; y?: number; kind?: string }
  /** Host only: choose the level in the lobby. */
  | { type: "setLevel"; id: string }
  /** Host only: briefing → playing. */
  | { type: "beginMission" }
  /** Host only: give a skill to another player (lobby or mid-game). */
  | { type: "moveSkill"; skill: string; to: string };

/** Messages the server sends back. */
export type ServerMessage =
  | { type: "welcome"; sessionId: string; protocol: number }
  | { type: "pong"; t: number }
  /** Reply to moveTo: the tile actually targeted (may be nudged off a wall), or ok=false. */
  | { type: "path"; ok: boolean; tx: number; ty: number }
  /** Scout + host only, ~5×/s: seconds until each guard turns / moves on (index = guard). */
  | { type: "intel"; timers: number[] }
  /** Broadcast when the team reaches a new checkpoint. */
  | { type: "checkpoint"; index: number; count: number }
  /** Short feedback to one player ("Get closer to a guard"). */
  | { type: "hint"; text: string }
  /** Scout's map ping, broadcast to everyone. World pixels. */
  | { type: "ping"; x: number; y: number; by: string }
  /** Noise maker went off (everyone hears it). World pixels. */
  | { type: "noise"; x: number; y: number }
  /** Team news toast for everyone ("Ken opened a door"). */
  | { type: "news"; text: string };
