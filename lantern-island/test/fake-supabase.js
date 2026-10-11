// A small stand-in for Supabase, for the tests: the parts of its REST interfaces that the
// adapter uses (PostgREST tables and Storage objects), kept in memory. It is strict about
// the key and the headers, so mistakes in the adapter show up here.
import http from 'node:http';

export async function startFakeSupabase({ key = 'service-key', tables = ['li_groups', 'li_cards', 'li_missions', 'li_meta'], bucket = 'li-media' } = {}) {
  const db = Object.fromEntries(tables.map((t) => [t, new Map()]));
  const files = new Map();
  const state = { paused: false, requests: 0 };

  const server = http.createServer(async (req, res) => {
    state.requests++;
    const url = new URL(req.url, 'http://x');
    const send = (status, body, type = 'application/json') => { res.writeHead(status, { 'content-type': type }); res.end(body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body); };
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    if (state.paused) return send(540, { message: 'Project paused' });
    if (req.headers.apikey !== key || req.headers.authorization !== `Bearer ${key}`) return send(401, { message: 'Invalid API key' });

    const rest = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (rest) {
      const table = db[rest[1]];
      if (!table) return send(404, { code: 'PGRST205', message: `Could not find the table 'public.${rest[1]}' in the schema cache` });
      const idEq = url.searchParams.get('id')?.replace(/^eq\./, '');
      if (req.method === 'GET') {
        let rows = [...table.values()].filter((r) => !idEq || r.id === idEq).sort((a, b) => a.id.localeCompare(b.id));
        if (url.searchParams.get('limit')) rows = rows.slice(0, Number(url.searchParams.get('limit')));
        const cols = (url.searchParams.get('select') || 'id,data').split(',');
        return send(200, rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))));
      }
      if (req.method === 'POST') {
        const rows = JSON.parse(body.toString());
        const merge = /resolution=merge-duplicates/.test(req.headers.prefer || '') && url.searchParams.get('on_conflict') === 'id';
        for (const r of rows) {
          if (table.has(r.id) && !merge) return send(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
          if (typeof r.id !== 'string' || r.data === undefined) return send(400, { message: 'null value in column violates not-null constraint' });
          table.set(r.id, r);
        }
        return send(201);
      }
      if (req.method === 'DELETE') { if (!idEq) return send(400, { message: 'DELETE requires a filter' }); table.delete(idEq); return send(204); }
    }
    const obj = url.pathname.match(/^\/storage\/v1\/object\/([a-z-]+)\/(.+)$/);
    if (obj && obj[1] !== 'list') {
      if (obj[1] !== bucket) return send(404, { error: 'Bucket not found' });
      if (req.method === 'POST') {
        if (files.has(obj[2]) && req.headers['x-upsert'] !== 'true') return send(400, { error: 'Duplicate', message: 'The resource already exists' });
        files.set(obj[2], { body, type: req.headers['content-type'] });
        return send(200, { Key: `${bucket}/${obj[2]}` });
      }
      if (req.method === 'GET') { const f = files.get(obj[2]); return f ? send(200, f.body, f.type) : send(400, { error: 'not_found', message: 'Object not found' }); }
    }
    if (url.pathname === `/storage/v1/object/list/${bucket}` && req.method === 'POST') return send(200, [...files.keys()].map((name) => ({ name })));
    send(404, { message: 'not found' });
  });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://127.0.0.1:${server.address().port}`, key, db, files, state, close: () => new Promise((r) => server.close(r)) };
}
