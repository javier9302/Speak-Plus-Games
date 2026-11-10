import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { GAME_ROOM, SERVER_TICK_HZ } from "@stealth-squad/shared";
import { GameRoom } from "./rooms/GameRoom.js";
import { METRICS_HTML, snapshot } from "./metrics.js";

const PORT = Number(process.env.PORT ?? 2567);

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true, tickHz: SERVER_TICK_HZ });
});

// Live numbers: rooms, clients, tick time, CPU, memory, bandwidth.
app.get("/metrics", (_req, res) => {
  res.type("html").send(METRICS_HTML);
});
app.get("/metrics.json", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.json(snapshot());
});

// LAN addresses, so the host screen (opened on localhost) can put a URL that
// phones can reach into the QR code. CORS: the page is served from Vite's port.
app.get("/info", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.json({ lan: lanAddresses() });
});

// Colyseus dev dashboard at /colyseus (rooms, clients, state).
app.use("/colyseus", monitor());

// Production (Docker / cloud): serve the built web page from this same port.
// In dev, Vite serves it on :5173 instead.
const staticDir = process.env.STATIC_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (process.env.NODE_ENV === "production" && existsSync(join(staticDir, "index.html"))) {
  app.use(express.static(staticDir));
  // /host and any other page path → the single-page app.
  app.get(/^\/(?!colyseus|metrics|health|info).*/, (_req, res) => res.sendFile(join(staticDir, "index.html")));
  console.log(`  Serving web page from ${staticDir}`);
}

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(GAME_ROOM, GameRoom);

httpServer.listen(PORT, () => {
  console.log(`\n  Stealth Squad server listening on port ${PORT}`);
  console.log(`  Colyseus monitor: http://localhost:${PORT}/colyseus`);
  for (const addr of lanAddresses()) {
    console.log(`  LAN (for phones): ws://${addr}:${PORT}`);
  }
  console.log("");
});

/** Return non-internal IPv4 addresses so the console prints a URL phones can use. */
function lanAddresses(): string[] {
  const out: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const net of iface ?? []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}
