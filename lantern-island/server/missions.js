// Missions: recipes that turn a zone into a 25-minute session.
// Templates come from two places: the scenario packs (data/scenarios/<pack>/missions, edited in the files only)
// and the teacher's own templates (storage collection "missions", made in the mission builder).
import { CARD_TYPES } from './cards.js';
import { KINDS } from './kinds/index.js';
import { didYouMean } from './words.js';

export const MISSION_FIELDS = ['id', 'title', 'story', 'zone', 'minutes', 'goal', 'stations', 'monster'];
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
  const stop = () => { if (problems.length) throw Object.assign(new Error(`Mission "${raw?.title || raw?.id || '?'}": ${problems.join('; ')}.`), { status: 400 }); };
  const zone = zones[raw?.zone || Object.keys(zones)[0]];
  if (!zone) { fail(`unknown zone "${raw?.zone}".${didYouMean(raw?.zone, Object.keys(zones))}`); stop(); }
  extra(raw, [...MISSION_FIELDS, 'pack', 'file'], '', problems);
  extra(raw.goal, ['label', 'items', 'restore', 'deliver', 'story'], 'goal: ', problems);
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
  const [item, wanted] = Object.entries(raw.goal?.items || zone.goal?.items || {})[0] || [];
  if (!item || !items.byId[item]) fail(item ? `the goal item "${item}" is not an item.${didYouMean(item, Object.keys(items.byId))}` : 'needs a goal item');
  const restore = raw.goal?.restore;
  if (restore && !zone.landmarks.some((l) => l.id === restore)) fail(`goal: "restore" is "${restore}", which is not a landmark of ${zone.name}.${didYouMean(restore, zone.landmarks.map((l) => l.id))} Landmarks: ${zone.landmarks.map((l) => l.id).join(', ')}`);
  if (raw.monster !== undefined && !MONSTERS.includes(raw.monster)) fail(`"monster" must be one of ${MONSTERS.join(', ')}`);
  stop();
  // Never ask for more than the chosen tablets can give.
  const can = stations.filter((s) => tablets.find((t) => t.id === s.at).reward?.item === item).length;
  const need = Math.max(1, Math.min(Number(wanted) || 1, can || 1));
  return {
    id: /^[a-z0-9][a-z0-9-]{0,63}$/.test(raw.id || '') ? raw.id : 'custom',
    title: text(raw.title, 60) || 'Mission', story: text(raw.story, 400), zone: zone.id,
    minutes: Math.max(5, Math.min(90, Math.round(Number(raw.minutes) || 25))),
    goal: { label: text(raw.goal?.label, 30) || items.byId[item].name, items: { [item]: need }, restore: text(raw.goal?.restore, 40) || null,
      // Some zones want the items carried to a character (the keeper) by one player.
      deliver: zone.objects.some((o) => o.id === (raw.goal?.deliver ?? zone.goal?.deliver) && KINDS[o.kind].character) ? (raw.goal?.deliver ?? zone.goal.deliver) : null },
    stations, monster: ['off', 'gentle', 'normal', 'hard'].includes(raw.monster) ? raw.monster : 'group-setting',
    pack: raw.pack || null,                // the scenario pack it comes from; null for the teacher's own templates
  };
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
    // For the mission builder: what each zone offers.
    zones: () => Object.values(zones).map((z) => ({ id: z.id, name: z.name, goal: z.goal, places: z.places, unlock: z.unlock, stations: z.objects.filter((o) => o.kind === 'station').map((o) => ({ id: o.id, name: o.name, x: o.x, y: o.y, reward: o.reward?.item || null })) })),
  };
}
