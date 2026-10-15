// Lantern Island server. Run with: npm start
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { createStorage } from './storage/index.js';
import { createGroups } from './groups.js';
import { createHttpHandler } from './http.js';
import { createNetwork } from './net.js';
import { createRooms } from './rooms.js';
import { loadZone } from './world.js';
import { loadAbilities } from './abilities.js';
import { createCards } from './cards.js';
import { createMissions } from './missions.js';
import { loadMonster } from './monster.js';
import { createSheets } from './sheet.js';
import { checkObject } from './things.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function createApp(over = {}) {
  const config = loadConfig(over);
  const storage = createStorage(config);
  await storage.check();                   // a wrong Supabase key or missing tables stop the server here, with the reason
  const groups = createGroups(storage);
  const cards = createCards(storage, config.contentDir);
  // Every file in data/zones is a zone. The beach comes first: it is where every group starts.
  const zoneIds = (await fs.readdir(path.join(config.contentDir, 'zones'))).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort((a, b) => (a === 'beach' ? -1 : b === 'beach' ? 1 : a.localeCompare(b)));
  const zones = {};
  for (const id of zoneIds) zones[id] = await loadZone(config.contentDir, id);
  const abilities = await loadAbilities(config.contentDir);
  const itemFile = JSON.parse(await fs.readFile(path.join(config.contentDir, 'items.json'), 'utf8'));
  const items = { list: itemFile.items, byId: Object.fromEntries(itemFile.items.map((i) => [i.id, i])), maxCarry: itemFile.maxCarry || 4 };
  // Stop at start-up, with a clear message, if a zone file has a mistake.
  for (const zone of Object.values(zones)) {
    for (const o of zone.objects) {
      const bad = checkObject(o, itemFile.items.map((i) => i.id), abilities.ids);
      if (bad.length) throw new Error(`Zone ${zone.id}, object "${o.id}": ${bad.join('; ')}`);
    }
  }

  const missions = createMissions(storage, config.contentDir, zones, items);
  const live = {};                         // filled in below, once the rooms exist
  const server = http.createServer(createHttpHandler({ config, groups, cards, missions, storage, live }));
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, resolve);
  });
  const port = server.address().port;
  const network = createNetwork(config, port);
  const rooms = createRooms({ config, groups, zones, abilities, items, cards, missions, monsterCfg: await loadMonster(config.contentDir), network, compete: over.compete, clock: over.clock });

  live.sheets = createSheets({ zones, abilities, items, missions, rooms });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://x').pathname !== '/ws') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => rooms.connection(ws, req));
  });

  return {
    config, port, network, groups, rooms, cards, missions,
    close() {
      rooms.close();
      for (const ws of wss.clients) ws.terminate();
      return new Promise((r) => server.close(r));
    },
  };
}

async function main() {
  let app;
  try { app = await createApp(); }
  catch (e) {
    if (e.code === 'EADDRINUSE') console.error(`\nPort ${process.env.PORT || 3000} is already in use. Close the other copy of the game, or run:  PORT=3001 npm start\n`);
    else if (e.status) console.error(`\n${e.message}\n`);       // a storage problem, already in plain words
    else console.error(e);
    process.exit(1);
  }
  const { config, port, network } = app;
  const net = network.current();
  console.log('\n  LANTERN ISLAND\n');
  if (config.hosted) {
    console.log(`  Hosted mode, port ${port}`);
    console.log(`  Host screen:   ${config.publicUrl}/host/`);
    console.log(`  Teacher panel: ${config.publicUrl}/teacher/`);
  } else {
    console.log(`  Host screen (open this on the laptop):  http://localhost:${port}/host/`);
    console.log(`  Teacher panel:                          http://localhost:${port}/teacher/`);
    if (net.ok) console.log(`  Phones join at:                         ${net.urls.join('  or  ')}`);
    else console.log('  NO NETWORK FOUND. Connect this computer to Wi-Fi or a phone hotspot; the QR code updates by itself.');
  }
  console.log(`  Teacher PIN (for other devices):        ${config.pin}`);
  console.log(`  Saves:                                  ${config.storage === 'supabase' ? 'Supabase (' + config.supabaseUrl + ')' : 'files in ' + config.dataDir}`);
  console.log('\n  Press Ctrl+C to stop.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
