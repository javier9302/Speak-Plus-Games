// Missions: recipes that turn a zone into a 25-minute session.
// Templates come from two places: the scenario packs (data/scenarios/<pack>/missions, edited in the files only)
// and the teacher's own templates (storage collection "missions", made in the mission builder).
import { CARD_TYPES } from './cards.js';
import { KINDS } from './kinds/index.js';
import { didYouMean } from './words.js';
import { GOALS } from './goals/index.js';
import { applyOverrides, OVERRIDE_FIELDS } from './overrides.js';

// The map a mission plays on: its map file, changed by the mission's overrides if it has any.
const played = new WeakMap();
export const zoneFor = (mission, zones) => played.get(mission) || zones[mission.zone];

export const MISSION_FIELDS = ['id', 'title', 'story', 'zone', 'theme', 'minutes', 'timeLimit', 'seed', 'goal', 'stations', 'monster', ...OVERRIDE_FIELDS];
export const GOAL_FIELDS = ['type', 'label', 'restore', 'story'];       // every goal type has these; the rest is in its file

// The clean goal of a mission (or of a map, with stations = null). Mistakes go to `fail`.
export function normalizeGoal(raw, { zone, items, stations, fail }) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const base = zone.goal && (zone.goal.type || 'collect') === (raw.type || zone.goal.type || 'collect') ? zone.goal : {};
  const type = raw.type || base.type || 'collect';
  const g = GOALS[type];
  if (!g) { fail(`goal: unknown type "${type}".${didYouMean(type, Object.keys(GOALS))} Types: ${Object.keys(GOALS).join(', ')}`); return null; }
  extra(raw, [...GOAL_FIELDS, ...Object.keys(g.fields)], 'goal: ', fail.problems);
  const objectsOf = (want) => zone.objects.filter((o) => KINDS[o.kind] && want(KINDS[o.kind], o));
  const own = g.normalize(raw, { zone, items, stations, base, fail, objectsOf, didYouMean });
  const restore = text(raw.restore, 40) || null;
  if (restore && zone.landmarks && !zone.landmarks.some((l) => l.id === restore)) fail(`goal: "restore" is "${restore}", which is not a landmark of ${zone.name}.${didYouMean(restore, zone.landmarks.map((l) => l.id))} Landmarks: ${zone.landmarks.map((l) => l.id).join(', ')}`);
  if (!own) return null;
  return { type, ...own, label: text(own.label, 30) || g.label, restore };
}
const MONSTERS = ['off', 'gentle', 'normal', 'hard', 'group-setting'];
// Fields a record may have; "...Help" fields are notes for authors.
const extra = (rec, allowed, where, problems) => {
  if (rec && typeof rec === 'object' && !Array.isArray(rec)) for (const k of Object.keys(rec)) if (!allowed.includes(k) && !k.endsWith('Help')) problems.push(`${where}unknown field "${k}".${didYouMean(k, allowed)}`);
};

const text = (v, max) => String(v ?? '').trim().slice(0, max);

// Returns a clean mission for this zone, or throws saying everything that is wrong.
export function normalizeMission(raw, zones, items) {
  const problems = [];
  const fail = (why) => problems.push(why);
  fail.problems = problems;
  const stop = () => { if (problems.length) throw Object.assign(new Error(`Mission "${raw?.title || raw?.id || '?'}": ${problems.map((p) => p.replace(/\.$/, '')).join('; ')}.`), { status: 400 }); };
  const base = zones[raw?.zone || Object.keys(zones)[0]];
  if (!base) { fail(`unknown zone "${raw?.zone}".${didYouMean(raw?.zone, Object.keys(zones))}`); stop(); }
  const { zone, overrides } = applyOverrides(base, raw, fail);
  extra(raw, [...MISSION_FIELDS, 'pack', 'file', 'tablets'], '', problems);      // pack, file, tablets: added by the server itself
  const tablets = zone.objects.filter((o) => KINDS[o.kind].card);
  const stations = [];
  for (const s of Array.isArray(raw.stations) ? raw.stations : []) {
    extra(s, ['at', 'card', 'filter'], `tablet "${s?.at}": `, problems);
    if (!tablets.some((t) => t.id === s.at)) { fail(`"${s.at}" is not a tablet of ${zone.name}.${didYouMean(s.at, tablets.map((t) => t.id))} Tablets: ${tablets.map((t) => t.id).join(', ')}`); continue; }
    if (stations.some((x) => x.at === s.at)) continue;
    if (s.card) stations.push({ at: s.at, card: text(s.card, 64) });
    else {
      const f = s.filter || {};
      extra(f, ['type', 'level', 'tags'], `tablet "${s.at}", filter: `, problems);
      if (f.type && !CARD_TYPES.includes(f.type)) fail(`unknown card type "${f.type}".${didYouMean(f.type, CARD_TYPES)} Types: ${CARD_TYPES.join(', ')}`);
      stations.push({ at: s.at, filter: { type: f.type || undefined, level: text(f.level, 12) || 'group', tags: Array.isArray(f.tags) ? f.tags.map((t) => text(t, 30)).filter(Boolean) : [] } });
    }
  }
  if (!stations.length && !problems.length) fail('needs at least one tablet');
  const goal = normalizeGoal(raw.goal, { zone, items, stations, fail });
  if (raw.monster !== undefined && !MONSTERS.includes(raw.monster)) fail(`"monster" must be one of ${MONSTERS.join(', ')}`);
  if (raw.theme != null && zone.themes && !zone.themes[raw.theme]) fail(`"theme" is "${raw.theme}", which is not a theme.${didYouMean(raw.theme, Object.keys(zone.themes))} Themes: ${Object.keys(zone.themes).join(', ')}`);
  if (raw.seed != null && !(Number.isInteger(raw.seed) && raw.seed >= 0)) fail('"seed" is a whole number: every run uses that layout (0 = the layout as written)');
  if (raw.timeLimit != null && !(Number.isInteger(raw.timeLimit) && raw.timeLimit >= 1 && raw.timeLimit <= 90)) fail('"timeLimit" is a number of minutes, 1 to 90: the mission ends when the time is up');
  stop();
  const mission = {
    id: /^[a-z0-9][a-z0-9-]{0,63}$/.test(raw.id || '') ? raw.id : 'custom',
    title: text(raw.title, 60) || 'Mission', story: text(raw.story, 400), zone: zone.id,
    minutes: Math.max(5, Math.min(90, Math.round(Number(raw.minutes) || 25))),
    timeLimit: raw.timeLimit || null,      // minutes; when the time is up the mission ends (not finished)
    seed: raw.seed ?? null,                // a fixed run (run.js); null: a new one every time
    theme: raw.theme ?? null,              // how its map looks (tiles.js); null: the map's theme
    goal,
    stations, monster: ['off', 'gentle', 'normal', 'hard'].includes(raw.monster) ? raw.monster : 'group-setting',
    pack: raw.pack || null,                // the scenario pack it comes from; null for the teacher's own templates
    ...overrides,                          // its changes to the map (overrides.js)
  };
  if (overrides) played.set(mission, zone);
  return mission;
}

export function createMissions(storage, zones, items, packMissions = () => []) {
  const fromPack = (id) => packMissions().find((m) => m.id === id);
  const readOnly = (id) => Object.assign(new Error(`"${id}" comes from the scenario pack "${fromPack(id).pack}". Edit its file (${fromPack(id).file}), or save your version under another name.`), { status: 400 });
  return {
    // The packs' missions first; a stored template with the same id as a pack mission is ignored.
    async all() {
      const out = [];
      const stored = (await storage.list('missions')).filter((m) => !fromPack(m.id));
      for (const m of [...packMissions(), ...stored]) { try { out.push(normalizeMission(m, zones, items)); } catch (e) { console.warn(e.message); } }
      return out;
    },
    normalize: (raw) => normalizeMission(raw, zones, items),
    // Saves a mission as a template (new, or replacing one). Throws with the reason if it has a mistake.
    async put(raw) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(raw?.id || '')) throw Object.assign(new Error('A template needs a name.'), { status: 400 });
      if (fromPack(raw.id)) throw readOnly(raw.id);
      delete raw.pack;
      const m = normalizeMission(raw, zones, items);
      await storage.put('missions', m.id, m);
      return m;
    },
    async remove(id) { if (fromPack(id)) throw readOnly(id); await storage.remove('missions', id); },
    // A mission made on the spot: every tablet of the zone, with card types drawn from
    // what the library has at this level.
    quick(zone, cards, level) {
      // Link cards are left out: they need the teacher at the panel. Choose them in the mission builder.
      const kinds = CARD_TYPES.filter((t) => t !== 'link');
      const have = kinds.filter((t) => cards.some((c) => c.type === t && c.level === level));
      const types = have.length ? have : kinds.filter((t) => cards.some((c) => c.type === t));
      const order = [...types].sort(() => Math.random() - 0.5);
      const stations = zone.objects.filter((o) => o.kind === 'station').map((o, i) => ({ at: o.id, filter: { type: order[i % order.length], level: 'group' } }));
      return normalizeMission({ id: 'quick', title: 'Quick mission', story: zone.goal?.story || 'Work together and find what the island needs.', zone: zone.id, minutes: 25, goal: zone.goal, stations }, zones, items);
    },
    // For the mission builder: the tablets of a mission whose overrides change its map (added tablets...).
    tablets: (m) => (m.add || m.remove ? zoneFor(m, zones).objects.filter((o) => KINDS[o.kind].card).map((o) => ({ id: o.id, name: o.name, x: o.x, y: o.y, reward: o.reward?.item || null })) : undefined),
    // For the mission builder: what each zone offers.
    zones: () => Object.values(zones).map((z) => ({ id: z.id, name: z.name, goal: z.goal, places: z.places, unlock: z.unlock, stations: z.objects.filter((o) => o.kind === 'station').map((o) => ({ id: o.id, name: o.name, x: o.x, y: o.y, reward: o.reward?.item || null })) })),
  };
}
