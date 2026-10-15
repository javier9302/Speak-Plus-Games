// Scenario packs: loading, and the mistakes npm run check finds. Each test copies the real packs to a
// temporary folder, breaks one thing, and checks the message. Run with: npm test, or node test/content.js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../server/content.js';
import { loadAbilities } from '../server/abilities.js';
import { runCheck } from '../server/check.js';
import { createApp } from '../server/index.js';
import { client } from './client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
}

// A copy of the content folder (no saves) that a test can change.
async function copy() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-content-'));
  for (const f of ['items.json', 'abilities.json', 'monster.json', 'seed-cards.json']) await fs.copyFile(path.join(root, 'data', f), path.join(dir, f));
  await fs.cp(path.join(root, 'data', 'scenarios'), path.join(dir, 'scenarios'), { recursive: true });
  return dir;
}
const file = (dir, rel) => path.join(dir, 'scenarios', rel);
const read = async (dir, rel) => JSON.parse(await fs.readFile(file(dir, rel), 'utf8'));
const write = (dir, rel, data) => fs.writeFile(file(dir, rel), JSON.stringify(data, null, 1));
async function load(dir) {
  const abilities = await loadAbilities(dir);
  const it = JSON.parse(await fs.readFile(path.join(dir, 'items.json'), 'utf8'));
  return loadContent(dir, { abilities, items: { list: it.items, byId: Object.fromEntries(it.items.map((i) => [i.id, i])) } });
}
// Breaks the beach map with `change`, and returns the loader's messages.
async function beachErrors(change) {
  const dir = await copy();
  const zone = await read(dir, 'beach/zones/beach.json');
  change(zone);
  await write(dir, 'beach/zones/beach.json', zone);
  return { c: await load(dir), dir };
}
const has = (list, ...parts) => list.some((e) => parts.every((p) => e.includes(p)));

async function main() {
  console.log('\nLoading the packs');
  const real = await load(path.join(root, 'data'));
  check('the beach and forest packs load with no mistakes', !real.errors.length && Object.keys(real.packs).join() === 'beach,forest', real.errors.join(' | '));
  check('maps keep their ids and know their pack', real.zones.beach.pack === 'beach' && real.zones.forest.pack === 'forest' && real.zones.forest.unlock === 2);

  console.log('\nMistakes in a map, in plain English');
  let { c } = await beachErrors((z) => { z.objets = []; });
  check('a misspelt field gets a suggestion, with the file', has(c.errors, 'scenarios/beach/zones/beach.json', 'unknown field "objets"', 'Did you mean "objects"?'));
  check('a pack with a mistake is left out, the others still load', !c.packs.beach && !!c.packs.forest);
  ({ c } = await beachErrors((z) => { z.objects.find((o) => o.id === 'chest').holds = 'lanter'; z.objects.find((o) => o.id === 'gate').kind = 'gatee'; }));
  check('an unknown item or kind gets a suggestion, and every mistake is listed', has(c.errors, 'object "chest"', '"lanter" is not an item', 'Did you mean "lantern"?') && has(c.errors, 'object "gate"', 'unknown kind "gatee"', 'Did you mean "gate"?'));
  ({ c } = await beachErrors((z) => { const s = z.objects.find((o) => o.id === 'old-sign'); s.x = 0; s.y = 0; z.objects.find((o) => o.id === 'bottle').x = z.objects.find((o) => o.id === 'keeper').x; z.objects.find((o) => o.id === 'bottle').y = z.objects.find((o) => o.id === 'keeper').y; }));
  check('an object on water, and two objects on one tile', has(c.errors, 'object "old-sign"', 'blocks the way') && has(c.errors, 'object "keeper"', 'taken by "bottle"'));
  ({ c } = await beachErrors((z) => { z.rows[3] += '~'; z.rows[5] = z.rows[5].replace('.', 'Q'); }));
  check('rows of different widths, and an unknown tile', has(c.errors, 'line 3 is 41 tiles wide') && has(c.errors, 'unknown tile "Q"'));
  ({ c } = await beachErrors((z) => { const shell = z.objects.find((o) => o.id === 'big-shell'); shell.clues.listen = 'Only the sea.'; }));
  check('a code gate whose digit is in no clue', has(c.errors, 'object "garden-gate"', 'no clue gives digit 3'));
  ({ c } = await beachErrors((z) => { z.objects.find((o) => o.id === 'plate').target = 'chest'; z.goal.deliver = 'keepr'; }));
  check('what an object points to must exist and fit', has(c.errors, 'object "plate"', 'a chest') && has(c.errors, 'goal', '"keepr"', 'Did you mean "keeper"?'));

  console.log('\nMistakes in a pack, a mission, a card');
  let dir = await copy();
  const pack = await read(dir, 'forest/pack.json');
  pack.unlok = 3;
  await write(dir, 'forest/pack.json', pack);
  check('pack.json is checked too', has((await load(dir)).errors, 'scenarios/forest/pack.json', 'unknown field "unlok"', 'Did you mean "unlock"?'));
  dir = await copy();
  const m = await read(dir, 'beach/missions/word-hunt.json');
  m.goal.restore = 'old-bridge';
  m.stations[0].at = 'tablet-9';
  await write(dir, 'beach/missions/word-hunt.json', m);
  let errs = (await load(dir)).errors;
  check('a mission lists every mistake: a place is not a landmark, an unknown tablet', has(errs, 'beach/missions/word-hunt.json', '"old-bridge", which is not a landmark') && has(errs, '"tablet-9" is not a tablet'));
  dir = await copy();
  await fs.mkdir(file(dir, 'beach/cards'), { recursive: true });
  await write(dir, 'beach/cards/beach-hello.json', { id: 'beach-hello', type: 'choice', level: 'A1', prompt: 'Hello?', options: { A: 'Hi', B: 'Bye' }, answer: 'A' });
  const withCard = await load(dir);
  check('a pack can bring its own cards', !withCard.errors.length && withCard.cards.some((x) => x.id === 'beach-hello' && x.pack === 'beach'));

  console.log('\nnpm run check');
  ({ dir } = await beachErrors((z) => {
    // A sign alone in the sea: ground nobody can walk to.
    z.rows[1] = z.rows[1].slice(0, 5) + '.' + z.rows[1].slice(6);
    z.objects.push({ id: 'lost-sign', kind: 'sign', name: 'Lost sign', x: 5, y: 1, clues: { read: 'Nobody reads me.' } });
  }));
  let r = await runCheck(dir, dir);
  check('an object nobody can reach is found', !r.ok && has(r.errors, '"lost-sign"', 'can never be reached'), r.errors.join(' | '));
  dir = await copy();
  const m2 = await read(dir, 'beach/missions/word-hunt.json');
  m2.stations[0] = { at: 'tablet-1', card: 'no-such-card' };
  await write(dir, 'beach/missions/word-hunt.json', m2);
  r = await runCheck(dir, dir);
  check('a mission that names a card that does not exist', has(r.errors, 'no-such-card', 'does not exist'));
  r = await runCheck(path.join(root, 'data'), path.join(root, 'data'), 'forest');
  check('one pack can be checked alone', r.ok && r.report.includes('PACK forest') && !r.report.includes('PACK beach'));

  console.log('\nEditing packs while the server runs');
  dir = await copy();
  const app = await createApp({ port: 0, contentDir: dir, dataDir: await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-saves-')), publicUrl: '', pin: '2468', quiet: true });
  const api = async (p) => (await fetch(`http://127.0.0.1:${app.port}/api${p}`)).json();
  // Waits until `test` is true (the server noticed the change), for at most 5 seconds.
  const until = async (test) => { for (let i = 0; i < 50; i++) { if (await test()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
  const host = client(app.port); await host.opened;
  host.send({ t: 'host' });
  await host.next('room');
  const lobby = [...app.rooms.rooms.values()][0], firstZone = lobby.zone;
  const busy = { ...lobby, code: 'BUSY', phase: 'play', hosts: new Set(), teachers: new Set(), players: [] };   // a room in the middle of a mission
  app.rooms.rooms.set('BUSY', busy);
  const hunt = await read(dir, 'beach/missions/word-hunt.json');
  await write(dir, 'beach/missions/word-hunt.json', { ...hunt, title: 'Word hunt, new version' });
  check('a changed mission file is used without a restart', await until(async () => (await api('/missions')).missions.some((x) => x.title === 'Word hunt, new version')));
  const beach = await read(dir, 'beach/zones/beach.json');
  beach.rows[2] = beach.rows[2].replace('...', ',,,');
  await write(dir, 'beach/zones/beach.json', beach);
  check('a changed map reaches the host screen in the lobby', await until(() => host.last.world?.zone.rows[2].includes(',,,')));
  check('a mission that is running keeps the map it started with', busy.zone === firstZone && lobby.zone !== firstZone);
  await fs.writeFile(file(dir, 'beach/zones/beach.json'), '{ "id": "beach", oops');
  check('a broken file is reported, and the last good version is kept', await until(async () => { const c = await api('/content'); return c.kept.includes('beach') && c.errors.some((e) => e.includes('beach/zones/beach.json') && e.includes('not valid JSON')); }));
  check('while broken, the pack\'s maps and missions are still there', app.content.zones.beach && (await api('/missions')).missions.some((x) => x.id === 'word-hunt'));
  await write(dir, 'beach/zones/beach.json', beach);
  check('fixing the file clears the problem', await until(async () => !(await api('/content')).errors.length));
  // A new pack, added while the server runs: a copy of the beach with its own ids.
  const cove = JSON.parse(JSON.stringify(beach));
  Object.assign(cove, { id: 'cove', name: 'The Cove' });
  cove.landmarks.forEach((l) => { l.id = `cove-${l.id}`; });
  await fs.mkdir(file(dir, 'cove/zones'), { recursive: true });
  await write(dir, 'cove/zones/cove.json', cove);
  await write(dir, 'cove/pack.json', { id: 'cove', name: 'The Cove', order: 3 });
  check('a new pack folder appears by itself', await until(async () => (await api('/content')).packs.some((x) => x.id === 'cove') && (await api('/missions')).zones.some((z) => z.id === 'cove')));
  await host.close();
  await app.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
