// Missions: recipes that turn a zone into a 25-minute session.
// Templates are data (storage collection "missions"); the first run copies data/seed-missions.json in.
import { CARD_TYPES } from './cards.js';
import { seed } from './seed.js';

const text = (v, max) => String(v ?? '').trim().slice(0, max);

// Returns a clean mission for this zone, or throws saying what is wrong.
export function normalizeMission(raw, zones, items) {
  const fail = (why) => { throw Object.assign(new Error(`Mission "${raw?.title || raw?.id || '?'}": ${why}.`), { status: 400 }); };
  const zone = zones[raw?.zone || 'beach'];
  if (!zone) fail(`unknown zone "${raw?.zone}"`);
  const tablets = zone.objects.filter((o) => o.kind === 'station');
  const stations = [];
  for (const s of Array.isArray(raw.stations) ? raw.stations : []) {
    if (!tablets.some((t) => t.id === s.at)) fail(`"${s.at}" is not a tablet of ${zone.name}`);
    if (stations.some((x) => x.at === s.at)) continue;
    if (s.card) stations.push({ at: s.at, card: text(s.card, 64) });
    else {
      const f = s.filter || {};
      if (f.type && !CARD_TYPES.includes(f.type)) fail(`unknown card type "${f.type}"`);
      stations.push({ at: s.at, filter: { type: f.type || undefined, level: text(f.level, 12) || 'group', tags: Array.isArray(f.tags) ? f.tags.map((t) => text(t, 30)).filter(Boolean) : [] } });
    }
  }
  if (!stations.length) fail('needs at least one tablet');
  const [item, wanted] = Object.entries(raw.goal?.items || zone.goal?.items || {})[0] || [];
  if (!item || !items.byId[item]) fail('needs a goal item');
  // Never ask for more than the chosen tablets can give.
  const can = stations.filter((s) => tablets.find((t) => t.id === s.at).reward?.item === item).length;
  const need = Math.max(1, Math.min(Number(wanted) || 1, can || 1));
  return {
    id: /^[a-z0-9][a-z0-9-]{0,63}$/.test(raw.id || '') ? raw.id : 'custom',
    title: text(raw.title, 60) || 'Mission', story: text(raw.story, 400), zone: zone.id,
    minutes: Math.max(5, Math.min(90, Math.round(Number(raw.minutes) || 25))),
    goal: { label: text(raw.goal?.label, 30) || items.byId[item].name, items: { [item]: need }, restore: text(raw.goal?.restore, 40) || null,
      // Some zones want the items carried to a character (the keeper) by one player.
      deliver: zone.objects.some((o) => o.id === (raw.goal?.deliver ?? zone.goal?.deliver) && o.kind === 'npc') ? (raw.goal?.deliver ?? zone.goal.deliver) : null },
    stations, monster: ['off', 'gentle', 'normal', 'hard'].includes(raw.monster) ? raw.monster : 'group-setting',
  };
}

export function createMissions(storage, contentDir, zones, items) {
  return {
    async all() {
      const out = [];
      for (const m of await seed(storage, contentDir, 'missions', 'seed-missions.json')) { try { out.push(normalizeMission(m, zones, items)); } catch (e) { console.warn(e.message); } }
      return out;
    },
    normalize: (raw) => normalizeMission(raw, zones, items),
    // Saves a mission as a template (new, or replacing one). Throws with the reason if it has a mistake.
    async put(raw) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(raw?.id || '')) throw Object.assign(new Error('A template needs a name.'), { status: 400 });
      const m = normalizeMission(raw, zones, items);
      await storage.put('missions', m.id, m);
      return m;
    },
    async remove(id) { await storage.remove('missions', id); },
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
