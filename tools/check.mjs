// Checks the whole hub. CI runs it on every pull request; run it yourself before opening one:
//   node tools/check.mjs
// 1. every game.json and pack is valid, 2. shared/registry.js and shared/precache.js are up to date,
// 3. static games make no requests to other sites, 4. every UI string exists in every language.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import vm from 'node:vm';
import { ROOT, rel, findManifests, findPacks, readJSON, validateGame, validatePack, buildRegistry, buildPrecache, UI_LANGS } from './lib.mjs';

let failures = 0;
const fail = (where, msg) => { failures++; console.log(`  ✗ ${where}: ${msg}`); };
const ok = msg => console.log(`  ✓ ${msg}`);

console.log('Games');
const ids = new Set();
for (const f of findManifests()) {
  let m; try { m = readJSON(f); } catch (e) { fail(rel(f), 'not valid JSON: ' + e.message); continue; }
  const errs = validateGame(m, dirname(f));
  if (ids.has(m.id)) errs.push(`id "${m.id}" is used by another game`);
  ids.add(m.id);
  errs.forEach(e => fail(rel(f), e));
  if (!errs.length) ok(`${m.id} (${rel(dirname(f))})`);
}

console.log('Content packs');
const packIds = new Set();
for (const f of findPacks()) {
  let p; try { p = readJSON(f); } catch (e) { fail(rel(f), 'not valid JSON: ' + e.message); continue; }
  const errs = validatePack(p);
  if (packIds.has(p.id)) errs.push(`id "${p.id}" is used by another pack`);
  if (p.id && !f.endsWith('/' + p.id + '.json')) errs.push(`the file name must be ${p.id}.json`);
  packIds.add(p.id);
  errs.forEach(e => fail(rel(f), e));
  if (!errs.length) ok(`${p.id} · ${p.type} · ${p.items.length} items`);
}

console.log('Generated files');
const registry = buildRegistry();
const same = (file, text) => existsSync(join(ROOT, file)) && readFileSync(join(ROOT, file), 'utf8') === text;
if (same('shared/registry.js', registry)) ok('shared/registry.js is up to date'); else fail('shared/registry.js', 'out of date. Run: node tools/build.mjs');
if (same('shared/precache.js', buildPrecache(registry))) ok('shared/precache.js is up to date'); else fail('shared/precache.js', 'out of date. Run: node tools/build.mjs');

console.log('No requests to other sites (static games work offline)');
const EXTERNAL = /(?:src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\/|@import\s+["']?https?:|fetch\(\s*["'`]https?:|importScripts\(\s*["']https?:/i;
const statics = findManifests().map(f => ({ dir: dirname(f), m: readJSON(f) })).filter(g => g.m.needs && g.m.needs.server !== 'node');
const scan = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (!['node_modules', 'tests', 'test', 'server'].includes(f)) scan(p, out); } else if (/\.(html|js|css|svg)$/.test(f)) out.push(p); } return out; };
let clean = true;
for (const p of [join(ROOT, 'index.html'), ...scan(join(ROOT, 'shared')), ...statics.flatMap(g => scan(g.dir))]) {
  const text = readFileSync(p, 'utf8'), m = text.match(EXTERNAL);
  if (m) { clean = false; fail(rel(p), `loads something from another site: ${m[0]}…`); }
}
if (clean) ok(`${statics.length} static games and the hub load nothing from other sites`);

console.log('Strings in every language');
const tables = [join(ROOT, 'shared/strings.js'), ...findManifests().map(f => join(dirname(f), 'strings.js')).filter(existsSync)];
for (const file of tables) {
  const got = {};
  vm.runInNewContext(readFileSync(file, 'utf8'), { Kit: { addStrings: t => Object.assign(got, t) } });
  const langs = Object.keys(got), keys = new Set(langs.flatMap(l => Object.keys(got[l])));
  const missing = [];
  for (const l of UI_LANGS.filter(l => langs.includes(l))) for (const k of keys) if (!(k in got[l])) missing.push(`${l}:${k}`);
  if (missing.length) fail(rel(file), 'missing ' + missing.slice(0, 8).join(', ') + (missing.length > 8 ? ` and ${missing.length - 8} more` : ''));
  else ok(`${rel(file)} · ${langs.join(', ')} · ${keys.size} strings`);
}

console.log(failures ? `\n${failures} problem${failures === 1 ? '' : 's'} found.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
