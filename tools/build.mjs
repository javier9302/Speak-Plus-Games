// Regenerates shared/registry.js (the hub's list of games and content packs) and shared/precache.js
// (the files kept for offline use). Run it after adding or changing a game.json, card.svg or pack:
//   node tools/build.mjs
// CI runs `node tools/check.mjs`, which fails if these files are out of date.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, buildRegistry, buildPrecache, findManifests, findPacks } from './lib.mjs';

const registry = buildRegistry();
writeFileSync(join(ROOT, 'shared/registry.js'), registry);
writeFileSync(join(ROOT, 'shared/precache.js'), buildPrecache(registry));
console.log(`shared/registry.js: ${findManifests().length} games, ${findPacks().length} packs. shared/precache.js updated.`);
