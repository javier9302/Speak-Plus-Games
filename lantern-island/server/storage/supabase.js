// Supabase adapter (optional): the same records as the file adapter, in a Supabase project.
// Records go to Postgres tables (li_groups, li_cards, li_missions, li_meta), sound and
// pictures to the Storage bucket "li-media". Set up with supabase/schema.sql.
//
// It talks to Supabase's REST interfaces with fetch, so no extra package is installed.
// The service key is used here, on the server, and is never sent to a browser.
// Live play (movement, monster...) never goes through Supabase: only saves do.
const TABLES = { groups: 'li_groups', cards: 'li_cards', missions: 'li_missions', meta: 'li_meta' };
const BUCKET = 'li-media';
const SAFE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MEDIA = /^[a-z0-9]{6,40}\.[a-z0-9]{2,5}$/;
const TIMEOUT_MS = 12000;

export function createSupabaseStorage({ url, key }) {
  if (!/^https?:\/\//.test(url || '') || !key) {
    throw Object.assign(new Error('STORAGE=supabase needs SUPABASE_URL (like https://abcd.supabase.co) and SUPABASE_SERVICE_KEY. See the README, "Supabase".'), { status: 503 });
  }
  const base = url.replace(/\/+$/, '');
  const auth = { apikey: key, authorization: `Bearer ${key}` };

  // One request. Turns the ways Supabase can fail into messages a teacher can act on.
  async function call(path, { method = 'GET', headers = {}, body, raw = false, okMissing = false } = {}) {
    let res;
    try {
      res = await fetch(base + path, { method, headers: { ...auth, ...headers }, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      throw Object.assign(new Error('Supabase did not answer. Check the internet connection. On the free plan a project is paused after 7 days without use: open the Supabase dashboard and press "Restore project".'), { status: 503, cause: e });
    }
    if (okMissing && (res.status === 404 || res.status === 400)) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let why = `Supabase answered ${res.status}.`;
      if (res.status === 401 || res.status === 403) why = 'Supabase refused the key. SUPABASE_SERVICE_KEY must be the service key ("service_role" or secret key) of this project, not the public one.';
      else if (res.status === 404 || /PGRST205|42P01|does not exist|Bucket not found/i.test(text)) why = 'The Lantern Island tables are missing in this Supabase project. Run supabase/schema.sql in its SQL Editor.';
      else if (res.status >= 500) why = `Supabase has a problem (${res.status}). If the project is paused, restore it in the Supabase dashboard.`;
      throw Object.assign(new Error(why), { status: 503, detail: text.slice(0, 300) });
    }
    return raw ? Buffer.from(await res.arrayBuffer()) : res.status === 204 ? null : res.json().catch(() => null);
  }
  const table = (collection) => {
    if (!TABLES[collection]) throw Object.assign(new Error('Unknown collection.'), { status: 400 });
    return `/rest/v1/${TABLES[collection]}`;
  };
  const one = (id) => { if (!SAFE.test(id)) throw Object.assign(new Error('Group not found.'), { status: 404 }); return encodeURIComponent(id); };

  return {
    kind: 'supabase',
    // Called once at start-up, so a wrong key or missing tables are noticed before class.
    async check() { await call(`${table('groups')}?select=id&limit=1`); },
    async list(collection) {
      const rows = await call(`${table(collection)}?select=data&order=id`);
      return (rows || []).map((r) => r.data);
    },
    async get(collection, id) {
      const rows = await call(`${table(collection)}?select=data&id=eq.${one(id)}&limit=1`);
      return rows?.[0]?.data ?? null;
    },
    async put(collection, id, record) {
      one(id);
      await call(`${table(collection)}?on_conflict=id`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ id, data: record, updated_at: new Date().toISOString() }]),
      });
    },
    async remove(collection, id) {
      await call(`${table(collection)}?id=eq.${one(id)}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } });
    },
    // Sound and pictures for cards.
    async putFile(name, buffer, type = 'application/octet-stream') {
      if (!MEDIA.test(name)) throw Object.assign(new Error('Bad file name.'), { status: 400 });
      await call(`/storage/v1/object/${BUCKET}/${name}`, { method: 'POST', headers: { 'content-type': type, 'x-upsert': 'true' }, body: buffer });
    },
    async getFile(name) {
      if (!MEDIA.test(name)) return null;
      return call(`/storage/v1/object/${BUCKET}/${name}`, { raw: true, okMissing: true });
    },
    async listFiles() {
      const rows = await call(`/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 1000, offset: 0 }) });
      return (rows || []).map((r) => r.name).filter((n) => MEDIA.test(n));
    },
  };
}
