import Phaser from "phaser";
import type { Room } from "colyseus.js";
import "./ui.css";
import { GameScene } from "./GameScene";
import { HudScene } from "./HudScene";
import { session } from "./session";
import { startHost } from "./host";
import { startPlayer } from "./lobby";

// Teacher screen: /host (any case, trailing slash or .html), or ?host / #host.
const isHost =
  /^\/host(\.html)?\/?$/i.test(location.pathname) ||
  new URLSearchParams(location.search).has("host") ||
  location.hash.toLowerCase() === "#host";

/** Start Phaser once we're in a room. The DOM overlay (#ui) covers it during the lobby. */
function startGame(room: Room) {
  if (session.room) return;
  session.room = room;
  session.spectator = isHost;
  // GameScene starts first and launches HudScene on top of it.
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#11161d",
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 2 },
    scene: [GameScene, HudScene],
  });
}

if (isHost) startHost(startGame);
else startPlayer(startGame);
