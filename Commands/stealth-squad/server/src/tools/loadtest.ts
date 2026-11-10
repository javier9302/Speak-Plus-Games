/**
 * Bot load test: `npm run loadtest -- --rooms 3 --seconds 60`
 *
 * Needs a running server (npm run dev, or the Docker image). For each room it
 * opens a host screen + 6 bot players, starts the level, and the bots wander
 * (tap-to-move to random nearby tiles, crawl now and then, the Scout pings).
 * Meanwhile it samples /metrics.json and prints a resource report.
 *
 * Options: --rooms N (default 1) --seconds S (default 60)
 *          --url http://host:port (default http://localhost:2567)
 *          --level snow-outpost | bridge-checkpoint | night-depot
 */
import { Client, type Room } from "colyseus.js";
import { GAME_ROOM, MAX_PLAYERS, TILE_SIZE, getLevel, isWalkable } from "@stealth-squad/shared";

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const ROOMS = Number(opt("rooms", "1"));
const SECONDS = Number(opt("seconds", "60"));
const HTTP = opt("url", "http://localhost:2567").replace(/\/$/, "");
const LEVEL = opt("level", "snow-outpost");
const WS = HTTP.replace(/^http/, "ws");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const quiet = (room: Room) => {
  for (const t of ["welcome", "pong", "path", "intel", "checkpoint", "hint", "ping", "noise", "news"]) room.onMessage(t, () => {});
  return room;
};

type Metrics = {
  clients: number;
  cpuPercent: number;
  tick: { avgMs: number; maxMs: number };
  memoryMB: { rss: number; heapUsed: number };
  bytesPerSecondPerClient: number;
};
const metrics = async () => (await (await fetch(`${HTTP}/metrics.json`)).json()) as Metrics;

/** One bot: wanders to random walkable tiles near where it is. */
function runBot(room: Room, stop: () => boolean) {
  const map = getLevel(LEVEL).map;
  const loop = async () => {
    while (!stop()) {
      await wait(rand(1500, 3000));
      const me = room.state.players?.get(room.sessionId);
      if (!me || room.state.phase !== "playing") continue;
      const tx0 = Math.floor(me.x / TILE_SIZE);
      const ty0 = Math.floor(me.y / TILE_SIZE);
      for (let tries = 0; tries < 10; tries++) {
        const tx = tx0 + Math.round(rand(-8, 8));
        const ty = ty0 + Math.round(rand(-8, 8));
        if (!isWalkable(map, tx, ty)) continue;
        room.send("moveTo", { tx, ty });
        break;
      }
      if (Math.random() < 0.2) room.send("crawl", { on: !me.crawling });
      if (me.skills?.includes("ping") && Math.random() < 0.2) room.send("use", { skill: "ping", x: me.x, y: me.y });
    }
  };
  void loop();
}

async function main() {
  console.log(`Load test: ${ROOMS} room(s) × ${MAX_PLAYERS} bots, ${SECONDS} s, level ${LEVEL}, server ${HTTP}`);
  const idle = await metrics();
  const client = new Client(WS);
  const rooms: Room[] = [];
  let done = false;

  for (let r = 0; r < ROOMS; r++) {
    const host = quiet(await client.create(GAME_ROOM, { host: true }));
    rooms.push(host);
    host.send("setLevel", { id: LEVEL });
    for (let b = 0; b < MAX_PLAYERS; b++) {
      const bot = quiet(await client.joinById(host.roomId, { nickname: `Bot${b + 1}` }));
      rooms.push(bot);
      runBot(bot, () => done);
    }
    await wait(300);
    host.send("start");
    await wait(300);
    host.send("beginMission");
    // Keep the level going if bots win or the host screen sits on a screen.
    const keepGoing = setInterval(() => {
      if (host.state.phase === "briefing") host.send("beginMission");
      if (host.state.phase === "won") host.send("start");
    }, 2000);
    host.onLeave(() => clearInterval(keepGoing));
    console.log(`  room ${host.roomId} ready`);
  }

  // Skip the first seconds (joins, JIT warm-up), then sample every 2 s.
  await wait(5000);
  const samples: Metrics[] = [];
  const end = Date.now() + SECONDS * 1000;
  while (Date.now() < end) {
    await wait(2000);
    samples.push(await metrics());
    process.stdout.write(".");
  }
  console.log("");
  done = true;

  const avg = (f: (m: Metrics) => number) => samples.reduce((s, m) => s + f(m), 0) / samples.length;
  const max = (f: (m: Metrics) => number) => Math.max(...samples.map(f));
  const row = (label: string, value: string) => console.log(`| ${label.padEnd(34)} | ${value.padEnd(22)} |`);
  console.log(`\n| ${"Metric".padEnd(34)} | ${"Value".padEnd(22)} |\n|${"-".repeat(36)}|${"-".repeat(24)}|`);
  row("Rooms × players (+ host)", `${ROOMS} × ${MAX_PLAYERS} (+${ROOMS}) = ${samples[0]?.clients ?? 0} clients`);
  row("CPU, avg / max (1 core = 100%)", `${avg((m) => m.cpuPercent).toFixed(1)}% / ${max((m) => m.cpuPercent).toFixed(1)}%`);
  row("Tick duration, avg / max", `${avg((m) => m.tick.avgMs).toFixed(3)} / ${max((m) => m.tick.maxMs).toFixed(2)} ms`);
  row("Tick budget used (avg, 50 ms/tick)", `${((avg((m) => m.tick.avgMs) * ROOMS) / 50 * 100).toFixed(2)}%`);
  row("Memory RSS: idle → max", `${idle.memoryMB.rss} → ${max((m) => m.memoryMB.rss)} MB`);
  row("Heap used, max", `${max((m) => m.memoryMB.heapUsed)} MB`);
  row("Sent per client, avg", `${Math.round(avg((m) => m.bytesPerSecondPerClient))} B/s (${(avg((m) => m.bytesPerSecondPerClient) * 8 / 1000).toFixed(1)} kbit/s)`);
  // Leaving the host closes each room; exiting drops the bots' sockets too.
  for (const r of rooms) r.connection.close();
  setTimeout(() => process.exit(0), 300);
}

main().catch((err) => {
  console.error("Load test failed:", err?.message ?? err);
  console.error(`Is the server running at ${HTTP}?`);
  process.exit(1);
});
