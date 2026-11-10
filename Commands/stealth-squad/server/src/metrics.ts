import type { Client } from "@colyseus/core";

/**
 * Process-wide numbers for /metrics: tick duration, CPU, memory, rooms,
 * players and bytes sent. Sampled once a second; cheap enough to leave on.
 */

const TICK_WINDOW = 400; // last ~20 s of ticks at 20 Hz (per room)
const RATE_WINDOW = 10; // seconds for bytes/s and CPU %

const tickMs: number[] = [];
let bytesThisSecond = 0;
const bytesPerSecond: number[] = [];
const cpuPercent: number[] = [];
let lastCpu = process.cpuUsage();
let lastCpuAt = performance.now();

/** Rooms report themselves so the page can list them. */
export interface RoomInfo {
  code: string;
  level: string;
  phase: string;
  players: number;
  connected: number;
  host: boolean;
}
const rooms = new Map<string, () => RoomInfo>();

export function registerRoom(id: string, info: () => RoomInfo) {
  rooms.set(id, info);
}
export function unregisterRoom(id: string) {
  rooms.delete(id);
}

export function recordTick(ms: number) {
  tickMs.push(ms);
  if (tickMs.length > TICK_WINDOW * Math.max(1, rooms.size)) tickMs.shift();
}

/** Count every byte Colyseus sends to this client (state patches + messages). */
export function countBytes(client: Client) {
  const ws = (client as any).ref;
  if (!ws || ws.__counted) return;
  ws.__counted = true;
  const send = ws.send.bind(ws);
  ws.send = (data: any, ...rest: any[]) => {
    bytesThisSecond += data?.byteLength ?? data?.length ?? 0;
    return send(data, ...rest);
  };
}

function push(arr: number[], v: number) {
  arr.push(v);
  if (arr.length > RATE_WINDOW) arr.shift();
}

setInterval(() => {
  push(bytesPerSecond, bytesThisSecond);
  bytesThisSecond = 0;
  const now = performance.now();
  const cpu = process.cpuUsage(lastCpu); // µs since last sample
  push(cpuPercent, ((cpu.user + cpu.system) / 1000 / (now - lastCpuAt)) * 100);
  lastCpu = process.cpuUsage();
  lastCpuAt = now;
}, 1000).unref();

const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function snapshot() {
  const list = [...rooms.values()].map((f) => f());
  const clients = list.reduce((s, r) => s + r.connected + (r.host ? 1 : 0), 0);
  const bytesPerSec = avg(bytesPerSecond);
  const mem = process.memoryUsage();
  return {
    uptimeSeconds: Math.round(process.uptime()),
    rooms: list,
    roomCount: list.length,
    clients,
    tick: {
      avgMs: round(avg(tickMs), 3),
      maxMs: round(tickMs.length ? Math.max(...tickMs) : 0, 3),
      samples: tickMs.length,
    },
    cpuPercent: round(avg(cpuPercent), 1),
    memoryMB: { rss: round(mem.rss / 2 ** 20, 1), heapUsed: round(mem.heapUsed / 2 ** 20, 1) },
    bytesPerSecond: Math.round(bytesPerSec),
    bytesPerSecondPerClient: clients ? Math.round(bytesPerSec / clients) : 0,
  };
}

/** One summary line in the server log every minute while any room is open. */
setInterval(() => {
  if (!rooms.size) return;
  const s = snapshot();
  console.log(
    `[metrics] rooms ${s.roomCount} · clients ${s.clients} · tick avg ${s.tick.avgMs} ms max ${s.tick.maxMs} ms` +
      ` · cpu ${s.cpuPercent}% · rss ${s.memoryMB.rss} MB · ${s.bytesPerSecondPerClient} B/s per client`,
  );
}, 60_000).unref();

/** Tiny self-refreshing page for the teacher / developer. */
export const METRICS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stealth Squad metrics</title>
<style>
  body{font:15px/1.4 system-ui,sans-serif;background:#11161d;color:#e6edf3;margin:0;padding:16px}
  h1{font:700 20px monospace;color:#7fd1ff;margin:0 0 12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-bottom:16px}
  .card{background:#1a2430;border-radius:10px;padding:10px 12px}
  .card b{display:block;font-size:22px;font-family:monospace}
  .card span{color:#8b9aab;font-size:13px}
  table{border-collapse:collapse;width:100%;max-width:720px}
  td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #2c3a4a}
  th{color:#8b9aab;font-weight:600}
</style></head><body>
<h1>STEALTH SQUAD · server metrics</h1>
<div class="grid" id="cards"></div>
<table><thead><tr><th>Room</th><th>Level</th><th>Phase</th><th>Players (online)</th><th>Host</th></tr></thead><tbody id="rooms"></tbody></table>
<script>
const card = (v, label) => '<div class="card"><b>' + v + '</b><span>' + label + '</span></div>';
async function load() {
  try {
    const s = await fetch("metrics.json").then(r => r.json());
    document.getElementById("cards").innerHTML =
      card(s.roomCount, "rooms") + card(s.clients, "connected clients") +
      card(s.tick.avgMs + " ms", "tick avg (max " + s.tick.maxMs + " ms)") +
      card(s.cpuPercent + "%", "CPU (one core = 100%)") +
      card(s.memoryMB.rss + " MB", "memory (heap " + s.memoryMB.heapUsed + " MB)") +
      card(s.bytesPerSecondPerClient + " B/s", "sent per client (" + s.bytesPerSecond + " B/s total)") +
      card(Math.floor(s.uptimeSeconds / 60) + " min", "uptime");
    document.getElementById("rooms").innerHTML = s.rooms.map(r =>
      "<tr><td>" + r.code + "</td><td>" + r.level + "</td><td>" + r.phase + "</td><td>" + r.players + " (" + r.connected + ")</td><td>" + (r.host ? "yes" : "no") + "</td></tr>"
    ).join("") || '<tr><td colspan="5">No rooms</td></tr>';
  } catch {}
}
load(); setInterval(load, 2000);
</script></body></html>`;
