// Groups (classes) and their saved islands.
import crypto from 'node:crypto';

export const MONSTER_SETTINGS = ['off', 'gentle', 'normal', 'hard'];
const EXPORT_KIND = 'lantern-island-group';

export const freshIsland = () => ({ zones: ['beach'], landmarks: [], missionsDone: [], stars: 0, sessions: 0 });

const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const list = (v, max) => (Array.isArray(v) ? [...new Set(v.map((x) => text(x, 40)).filter(Boolean))].slice(0, max) : []);
const count = (v) => Math.max(0, Math.min(100000, Math.floor(Number(v) || 0)));

function newId(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'group';
  return `${slug}-${crypto.randomBytes(3).toString('hex')}`;
}

// Turns anything (an imported file, a request body) into a valid group. Throws if it has no name.
export function normalizeGroup(raw, id) {
  const name = text(raw?.name, 40);
  if (!name) throw Object.assign(new Error('A group needs a name.'), { status: 400 });
  const s = raw.settings || {}, isl = raw.island || {};
  return {
    id,
    name,
    version: 1,
    createdAt: text(raw.createdAt, 30) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      level: text(s.level, 12) || 'A2',
      monster: MONSTER_SETTINGS.includes(s.monster) ? s.monster : 'normal',
    },
    notes: String(raw.notes ?? '').slice(0, 20000),
    island: {
      zones: list(isl.zones, 50).length ? list(isl.zones, 50) : ['beach'],
      landmarks: list(isl.landmarks, 200),
      missionsDone: list(isl.missionsDone, 2000),
      stars: count(isl.stars),
      sessions: count(isl.sessions),
    },
    nicknames: list(raw.nicknames, 200),   // names only, no personal data
  };
}

export function createGroups(storage) {
  const save = async (g) => { await storage.put('groups', g.id, g); return g; };
  // Changes to one group happen one after another (read, change, save), so two that
  // arrive together, like a star and a note, cannot overwrite each other.
  const queues = new Map();
  const oneAtATime = (id, fn) => {
    const next = (queues.get(id) || Promise.resolve()).catch(() => {}).then(fn);
    queues.set(id, next);
    return next;
  };
  const need = async (id) => {
    const g = await storage.get('groups', id);
    if (!g) throw Object.assign(new Error('Group not found.'), { status: 404 });
    return g;
  };
  return {
    list: async () => (await storage.list('groups')).sort((a, b) => a.name.localeCompare(b.name)),
    get: (id) => storage.get('groups', id),
    create: (name) => save(normalizeGroup({ name }, newId(text(name, 40)))),
    update: (id, patch) => oneAtATime(id, async () => {
      const g = await need(id);
      return save(normalizeGroup({
        ...g,
        name: patch.name ?? g.name,
        notes: patch.notes ?? g.notes,
        settings: { ...g.settings, ...(patch.settings || {}) },
      }, id));
    }),
    reset: (id) => oneAtATime(id, async () => { const g = await need(id); return save(normalizeGroup({ ...g, island: freshIsland() }, id)); }),
    async duplicate(id) {
      const g = await need(id);
      const name = text(`${g.name} (copy)`, 40);
      return save(normalizeGroup({ ...g, name, createdAt: '' }, newId(name)));
    },
    async remove(id) { await need(id); await storage.remove('groups', id); },
    async exportFile(id) { return { kind: EXPORT_KIND, version: 1, exportedAt: new Date().toISOString(), group: await need(id) }; },
    // mode: undefined -> error 409 if the group is already here; "replace" or "copy" decide.
    async importFile(data, mode) {
      if (data?.kind !== EXPORT_KIND || !data.group) throw Object.assign(new Error('This is not a Lantern Island save file.'), { status: 400 });
      let id = /^[a-z0-9][a-z0-9-]{0,63}$/.test(data.group.id || '') ? data.group.id : newId(text(data.group.name, 40));
      if (await storage.get('groups', id)) {
        if (mode === 'copy') id = newId(text(data.group.name, 40));
        else if (mode !== 'replace') throw Object.assign(new Error('This group is already here.'), { status: 409 });
      }
      return save(normalizeGroup(data.group, id));
    },
    // Called when a mission ends: stars, and what was restored on the island.
    recordMission: (id, { missionId, restore, stars, completed, zones = [] }) => oneAtATime(id, async () => {
      const g = await storage.get('groups', id);
      if (!g) return null;
      g.island.stars += stars;
      if (completed) {
        g.island.missionsDone.push(missionId);
        if (restore) g.island.landmarks.push(restore);
        g.island.zones.push(...zones);            // zones that this landmark opened
      }
      return save(normalizeGroup(g, id));
    }),
    addStar: (id) => oneAtATime(id, async () => {
      const g = await storage.get('groups', id);
      if (!g) return null;
      g.island.stars++;
      return save(normalizeGroup(g, id));
    }),
    // Called when a session starts: counts it and remembers the nicknames.
    recordSession: (id, names) => oneAtATime(id, async () => {
      const g = await storage.get('groups', id);
      if (!g) return null;
      if (!names) return g;
      g.island.sessions++;
      return save(normalizeGroup({ ...g, nicknames: [...g.nicknames, ...names] }, id));
    }),
  };
}
