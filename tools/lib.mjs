// Shared by tools/build.mjs and tools/check.mjs. Node 18+, no dependencies.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const rel = p => relative(ROOT, p).split(sep).join('/');

const LEVELS = ['pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const GROUPINGS = ['individual', 'pairs', 'teams', 'co-op'];
const STUDENT_DEVICES = ['none', 'shared', 'optional', 'required'];
const SERVERS = ['none', 'static', 'node'];
const STATUS = ['stable', 'experimental'];
const PACK_TYPES = ['word-list', 'places', 'questions'];
export const UI_LANGS = ['en', 'es'];

/* ---------- Finding things ---------- */
export function findManifests() {
  const out = [];
  for (const a of readdirSync(ROOT)) {
    if (a.startsWith('.') || a === 'node_modules') continue;
    const dir = join(ROOT, a);
    if (!statSync(dir).isDirectory()) continue;
    if (existsSync(join(dir, 'game.json'))) out.push(join(dir, 'game.json'));
    else for (const b of readdirSync(dir)) {
      const sub = join(dir, b);
      if (!b.startsWith('.') && b !== 'node_modules' && statSync(sub).isDirectory() && existsSync(join(sub, 'game.json'))) out.push(join(sub, 'game.json'));
    }
  }
  return out.sort();
}
export const findPacks = () => readdirSync(join(ROOT, 'packs')).filter(f => f.endsWith('.json')).sort().map(f => join(ROOT, 'packs', f));
export const readJSON = p => JSON.parse(readFileSync(p, 'utf8'));

/* ---------- Validation: returns a list of problems, empty when fine ---------- */
const isText = (v, langs = ['en']) => v && typeof v === 'object' && langs.every(l => typeof v[l] === 'string' && v[l].trim());
const isRange = v => Array.isArray(v) && v.length === 2 && v.every(n => Number.isFinite(n)) && v[0] <= v[1];

export function validateGame(m, dir) {
  const e = [], need = (ok, msg) => { if (!ok) e.push(msg); };
  need(typeof m.id === 'string' && /^[a-z0-9-]+$/.test(m.id), 'id: lowercase letters, digits and dashes');
  need(isText(m.name), 'name: needs at least {"en": "..."}');
  need(isText(m.summary), 'summary: needs at least {"en": "..."}');
  need(typeof m.entry === 'string' && existsSync(join(dir, m.entry)), `entry: file "${m.entry}" not found in the folder`);
  need(isRange(m.ages) && m.ages[0] >= 3, 'ages: [min, max], for example [8, 99]');
  need(Array.isArray(m.levels) && m.levels.length && m.levels.every(l => LEVELS.includes(l)), `levels: some of ${LEVELS.join(', ')}`);
  need(m.players && Number.isFinite(m.players.min) && Number.isFinite(m.players.max) && m.players.min <= m.players.max && GROUPINGS.includes(m.players.grouping),
    `players: {"min", "max", "grouping": ${GROUPINGS.join(' | ')}}`);
  need(Array.isArray(m.skills) && m.skills.length, 'skills: a list, for example ["speaking", "vocabulary"]');
  need(isRange(m.minutes), 'minutes: [shortest, longest] game time');
  need(Number.isFinite(m.setupMinutes), 'setupMinutes: how long setup takes mid-class');
  need(m.devices && Array.isArray(m.devices.teacher) && STUDENT_DEVICES.includes(m.devices.students), `devices: {"teacher": [...], "students": ${STUDENT_DEVICES.join(' | ')}}`);
  need(m.needs && SERVERS.includes(m.needs.server), `needs.server: ${SERVERS.join(' | ')}`);
  need(typeof m.offline === 'boolean', 'offline: true or false');
  need(Array.isArray(m.uiLanguages) && m.uiLanguages.includes('en'), 'uiLanguages: must include "en"');
  need(STATUS.includes(m.status), `status: ${STATUS.join(' | ')}`);
  need(Array.isArray(m.authors) && m.authors.length, 'authors: a list of names');
  need(typeof m.license === 'string', 'license: "MIT" for code');
  need(existsSync(join(dir, 'card.svg')), 'card.svg: the picture for the hub card is missing');
  if (m.needs && m.needs.server === 'node') need(typeof m.start === 'string', 'start: the command that runs the server');
  for (const l of m.links || []) need(isText(l.label) && existsSync(join(dir, l.href || '')), `links: "${l.href}" not found`);
  if (existsSync(join(dir, 'card.svg'))) e.push(...checkSvg(readFileSync(join(dir, 'card.svg'), 'utf8')));
  return e;
}

export function checkSvg(svg) {
  const e = [];
  if (!/^<svg[\s>]/.test(svg.trim())) e.push('card.svg must start with <svg');
  if (!/viewBox="0 0 320 190"/.test(svg)) e.push('card.svg: use viewBox="0 0 320 190"');
  if (/<script|\son\w+\s*=|javascript:|<foreignObject/i.test(svg)) e.push('card.svg: no scripts, event handlers or foreignObject');
  if (/(href|src)\s*=\s*"(https?:)?\/\//i.test(svg)) e.push('card.svg: no external links or images');
  if (svg.length > 12000) e.push('card.svg: keep it under 12 kB');
  return e;
}

export function validatePack(p) {
  const e = [], need = (ok, msg) => { if (!ok) e.push(msg); };
  need(typeof p.id === 'string' && /^[a-z0-9-]+$/.test(p.id), 'id: lowercase letters, digits and dashes');
  need(PACK_TYPES.includes(p.type), `type: ${PACK_TYPES.join(' | ')}`);
  need(typeof p.title === 'string' && p.title.trim(), 'title');
  need(typeof p.language === 'string' && /^[a-z]{2,3}$/.test(p.language), 'language: the language students speak, like "en" or "es"');
  need(typeof p.license === 'string', 'license: "CC-BY-4.0" for content');
  need(typeof p.author === 'string' && p.author.trim(), 'author');
  need(Array.isArray(p.items) && p.items.length, 'items: at least one');
  const items = Array.isArray(p.items) ? p.items : [];
  if (p.type === 'word-list' || p.type === 'questions') items.forEach((x, i) => need(x && typeof x.prompt === 'string' && x.prompt.trim(), `items[${i}].prompt`));
  if (p.type === 'questions') items.forEach((x, i) => need(x && typeof x.answer === 'string' && x.answer.trim(), `items[${i}].answer`));
  if (p.type === 'places') {
    need(items.length >= 12, 'places: City Run needs 12 places');
    items.forEach((x, i) => need(x && x.name && x.icon && x.clue && x.code, `items[${i}]: icon, name, clue and code`));
    need(!p.phrases || (Array.isArray(p.phrases) && p.phrases.every(s => typeof s === 'string')), 'phrases: a list of strings');
  }
  return e;
}

/* ---------- Building the registry and the offline file list ---------- */
export function buildRegistry() {
  const games = findManifests().map(file => {
    const dir = file.slice(0, -'/game.json'.length), m = readJSON(file), path = rel(dir);
    const { $schema, ...data } = m;
    const svg = readFileSync(join(dir, 'card.svg'), 'utf8').trim();
    return { ...data, path, href: path + '/' + m.entry, docsHref: m.docs ? path + '/' + m.docs : null,
      links: (m.links || []).map(l => ({ label: l.label, href: path + '/' + l.href })), art: svg };
  }).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id));
  const order = ['word-list', 'places', 'questions'];
  const packs = findPacks().map(readJSON).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  return '// Generated by `node tools/build.mjs` from every game.json, card.svg and packs/*.json. Do not edit by hand.\n' +
    'window.HUB_GAMES = ' + JSON.stringify(games, null, 1) + ';\n' +
    'window.HUB_PACKS = ' + JSON.stringify(packs) + ';\n';
}

const SKIP_DIR = new Set(['node_modules', 'tests', 'test', 'server', '.git', '.github', 'docs']);
const SKIP_FILE = /(^|\/)(game\.json|card\.svg|package(-lock)?\.json|README.*\.md|CLAUDE\.md|start\.command|start\.bat|\.gitignore|\.DS_Store|precache\.js)$/;
function walk(dir, out) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!SKIP_DIR.has(f) && !f.startsWith('.')) walk(p, out); }
    else if (!SKIP_FILE.test(rel(p))) out.push(p);
  }
  return out;
}
// Everything a teacher needs to open the hub and the offline games with no connection.
export function buildPrecache(registryText) {
  const games = findManifests().map(f => ({ dir: f.slice(0, -'/game.json'.length), m: readJSON(f) })).filter(g => g.m.offline);
  const files = [join(ROOT, 'index.html'), join(ROOT, 'manifest.webmanifest'), join(ROOT, 'icon.svg'), ...walk(join(ROOT, 'shared'), [])];
  games.forEach(g => walk(g.dir, files));
  const list = [...new Set(files.map(rel))].sort();
  const hash = createHash('sha1');
  list.forEach(f => hash.update(f).update(f === 'shared/registry.js' && registryText != null ? registryText : readFileSync(join(ROOT, f))));
  return '// Generated by `node tools/build.mjs`: the files sw.js keeps for offline use. Do not edit by hand.\n' +
    'self.PRECACHE = ' + JSON.stringify({ version: hash.digest('hex').slice(0, 12), files: list }, null, 1) + ';\n';
}
