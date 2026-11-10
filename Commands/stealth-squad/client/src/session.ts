import type { Room } from "colyseus.js";

/** The joined room, shared by the DOM lobby screens and the Phaser scenes. */
export const session: { room?: Room; spectator: boolean } = { spectator: false };
