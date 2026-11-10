import { Client, type Room } from "colyseus.js";
import { GAME_ROOM, type JoinOptions } from "@stealth-squad/shared";

/**
 * Build the Colyseus endpoint from the page's own address.
 * - Dev: Vite serves the page on :5173 and the game server listens on :2567,
 *   so a phone at http://192.168.x.x:5173 connects to ws://192.168.x.x:2567.
 * - Production build (Docker / cloud): the server serves the page itself, so
 *   connect to the same host and port the page came from (wss on https).
 * Override with VITE_SERVER_URL if the game server lives elsewhere.
 */
export function serverEndpoint(): string {
  const override = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (override) return override;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  if (import.meta.env.PROD) return `${proto}://${location.host}`;
  const port = import.meta.env.VITE_SERVER_PORT ?? "2567";
  return `${proto}://${location.hostname}:${port}`;
}

const client = new Client(serverEndpoint());

// Reconnection tokens live in sessionStorage: survives a reload or the phone
// browser restoring the tab, but each tab is its own player.
const TOKEN_KEY = { host: "ss-host-token", player: "ss-player-token" } as const;
type Who = keyof typeof TOKEN_KEY;

function remember(who: Who, room: Room): Room {
  try {
    sessionStorage.setItem(TOKEN_KEY[who], room.reconnectionToken);
  } catch {
    // Private mode etc.: no reconnect-on-reload, everything else still works.
  }
  // Registered here so Colyseus doesn't warn about an unhandled message type.
  room.onMessage("welcome", () => {});
  return room;
}

export function forget(who: Who) {
  try {
    sessionStorage.removeItem(TOKEN_KEY[who]);
  } catch {}
}

/** Rejoin the room this tab was in before a reload / dropped connection, if it still holds our slot. */
export async function tryReconnect(who: Who): Promise<Room | undefined> {
  let token: string | null = null;
  try {
    token = sessionStorage.getItem(TOKEN_KEY[who]);
  } catch {}
  if (!token) return undefined;
  try {
    return remember(who, await client.reconnect(token));
  } catch {
    forget(who);
    return undefined;
  }
}

export async function createHostRoom(): Promise<Room> {
  const options: JoinOptions = { host: true };
  return remember("host", await client.create(GAME_ROOM, options));
}

export async function joinAsPlayer(code: string, nickname: string): Promise<Room> {
  const options: JoinOptions = { nickname };
  return remember("player", await client.joinById(code.trim().toUpperCase(), options));
}

/**
 * The URL students open (and the QR code encodes). If the host page was opened
 * via localhost, swap in the laptop's LAN address from the server's /info.
 */
export async function playerJoinUrl(code: string): Promise<string> {
  const publicUrl = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  let origin = publicUrl?.replace(/\/+$/, "") ?? location.origin;
  if (!publicUrl && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(location.hostname)) {
    try {
      const info = await fetch(`${serverEndpoint().replace(/^ws/, "http")}/info`).then((r) => r.json());
      if (info.lan?.[0]) origin = `${location.protocol}//${info.lan[0]}${location.port ? `:${location.port}` : ""}`;
    } catch {
      // Fall back to the localhost URL; the teacher will see it's wrong.
    }
  }
  return `${origin}/?room=${code}`;
}
