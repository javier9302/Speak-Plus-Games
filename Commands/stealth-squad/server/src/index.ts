import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { GAME_ROOM, SERVER_TICK_HZ } from "@stealth-squad/shared";
import { GameRoom } from "./rooms/GameRoom.js";
import { METRICS_HTML, snapshot } from "./metrics.js";

const PORT = Number(process.env.PORT ?? 2567);

const app = express();

// Admin pages (/colyseus, /metrics): open on the computer that runs the server, so `npm run dev` and the
// load test work as before. From any other device (and always on a cloud host) they need ADMIN_PASSWORD
// (HTTP Basic, any user name); without it they answer 404. The room monitor can close live rooms.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const digest = (s: string) => createHash("sha256").update(s).digest();
function isThisComputer(req: Request): boolean {
  const a = req.socket.remoteAddress ?? "";
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(a) && !req.headers["x-forwarded-for"];
}
function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (isThisComputer(req)) return next();
  if (!ADMIN_PASSWORD) return res.status(404).send("Not found");
  const [scheme, encoded] = (req.headers.authorization ?? "").split(" ");
  const given = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":") : "";
  if (given && timingSafeEqual(digest(given), digest(ADMIN_PASSWORD))) return next();
  res.set("WWW-Authenticate", 'Basic realm="Stealth Squad admin", charset="UTF-8"');
  res.status(401).send("Password needed");
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, tickHz: SERVER_TICK_HZ });
});

// Live numbers: rooms, clients, tick time, CPU, memory, bandwidth.
app.get("/metrics", adminOnly, (_req, res) => {
  res.type("html").send(METRICS_HTML);
});
app.get("/metrics.json", adminOnly, (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.json(snapshot());
});

// LAN addresses, so the host screen (opened on localhost) can put a URL that
// phones can reach into the QR code. CORS: the page is served from Vite's port.
app.get("/info", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.json({ lan: lanAddresses() });
});

// Colyseus dashboard at /colyseus (rooms, clients, state). Admin only: see adminOnly above.
app.use("/colyseus", adminOnly, monitor());

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
