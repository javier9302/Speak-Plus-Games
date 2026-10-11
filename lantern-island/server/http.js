// Plain HTTP: the three pages (static files) and the teacher's API for groups.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { isLoopback } from './net.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
};
const MAX_BODY = 2 * 1024 * 1024;
const MAX_MEDIA = 8 * 1024 * 1024;
// What may be uploaded for cards, and the file ending it gets.
const UPLOADS = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

// The teacher is trusted on the computer that runs the server (local mode only).
// Every other device, and everything in hosted mode, needs the PIN.
export function isTeacher(config, req, pin) {
  if (!config.hosted && isLoopback(req)) return true;
  return typeof pin === 'string' && pin === config.pin;
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req, max) {
  let size = 0; const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error(`File too big (the limit is ${Math.round(max / 1024 / 1024)} MB).`), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = await readBody(req, MAX_BODY);
  if (!body.length) return {};
  try { return JSON.parse(body.toString('utf8')); }
  catch { throw Object.assign(new Error('This is not a valid JSON file.'), { status: 400 }); }
}

export function createHttpHandler({ config, groups, cards, missions, storage, live }) {
  async function api(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean).slice(1);   // after "api"
    const m = req.method;
    if (parts[0] === 'info' && m === 'GET') {
      return json(res, 200, { hosted: config.hosted, needPin: !isTeacher(config, req, undefined), storage: config.storage });
    }
    if (!isTeacher(config, req, req.headers['x-pin'])) return json(res, 401, { error: 'Teacher PIN needed.' });

    if (parts[0] === 'groups') {
      const [, id, action] = parts;
      if (!id && m === 'GET') return json(res, 200, await groups.list());
      if (!id && m === 'POST') return json(res, 201, await groups.create((await readJson(req)).name));
      if (id === 'import' && m === 'POST') return json(res, 201, await groups.importFile(await readJson(req), url.searchParams.get('mode')));
      if (id && !action && m === 'PATCH') return json(res, 200, await groups.update(id, await readJson(req)));
      if (id && !action && m === 'DELETE') { await groups.remove(id); return json(res, 200, { ok: true }); }
      if (id && action === 'export' && m === 'GET') {
        const file = await groups.exportFile(id);
        return json(res, 200, file, { 'content-disposition': `attachment; filename="${id}.json"` });
      }
      if (id && action === 'reset' && m === 'POST') return json(res, 200, await groups.reset(id));
      if (id && action === 'duplicate' && m === 'POST') return json(res, 201, await groups.duplicate(id));
    }
    // The card library
    if (parts[0] === 'cards') {
      const id = parts[1];
      if (!id && m === 'GET') return json(res, 200, await cards.all());
      if (id === 'import' && m === 'POST') return json(res, 200, await cards.putMany((await readJson(req)).cards));
      if (id && m === 'PUT') return json(res, 200, await cards.put({ ...(await readJson(req)), id }));
      if (id && m === 'DELETE') { await cards.remove(id); return json(res, 200, { ok: true }); }
    }
    // Mission templates, and what each zone offers the mission builder
    if (parts[0] === 'missions' && !parts[1] && m === 'GET') return json(res, 200, { missions: await missions.all(), zones: missions.zones() });
    if (parts[0] === 'missions' && parts[1] && m === 'PUT') return json(res, 200, await missions.put({ ...(await readJson(req)), id: parts[1] }));
    if (parts[0] === 'missions' && parts[1] && m === 'DELETE') { await missions.remove(parts[1]); return json(res, 200, { ok: true }); }
    // Printable sheets: ?zone=beach (before class) or ?room=ABCD (the mission that is running)
    if (parts[0] === 'sheet' && m === 'GET') {
      const sheet = url.searchParams.get('room') ? live.sheets.room(url.searchParams.get('room')) : await live.sheets.zone(url.searchParams.get('zone') || 'beach');
      return sheet ? json(res, 200, sheet) : json(res, 404, { error: 'No mission is running in that room. Start one first, or print the zone sheet.' });
    }
    // Sound or picture for a card: the file itself is the request body.
    if (parts[0] === 'media' && m === 'POST') {
      const ext = UPLOADS[String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()];
      if (!ext) return json(res, 415, { error: 'Use a sound file (mp3, m4a, wav, ogg, webm) or a picture (png, jpg, gif, webp).' });
      const body = await readBody(req, MAX_MEDIA);
      if (!body.length) return json(res, 400, { error: 'The file is empty.' });
      const name = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
      await storage.putFile(name, body, Object.keys(MIME).find((k) => k === `.${ext}`) ? MIME[`.${ext}`] : 'application/octet-stream');
      return json(res, 201, { url: `/media/${name}` });
    }
    return json(res, 404, { error: 'Not found.' });
  }

  // Uploaded sound and pictures. Open to everyone in the room: the phones play them.
  async function media(req, res, url) {
    const name = url.pathname.slice('/media/'.length);
    const body = await storage.getFile(name);
    if (!body) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(name)] || 'application/octet-stream', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function statics(req, res, url) {
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { rel = '/'; }
    if (rel === '/') { res.writeHead(302, { location: '/phone/' + url.search }); return res.end(); }
    let file = path.join(config.publicDir, path.normalize(rel));
    if (!file.startsWith(config.publicDir + path.sep)) { res.writeHead(403); return res.end(); }
    try {
      if ((await fs.stat(file)).isDirectory()) {
        if (!rel.endsWith('/')) { res.writeHead(302, { location: rel + '/' + url.search }); return res.end(); }
        file = path.join(file, 'index.html');
      }
      const body = await fs.readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  }

  return async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else if (url.pathname.startsWith('/media/') && (req.method === 'GET' || req.method === 'HEAD')) await media(req, res, url);
      else if (req.method === 'GET' || req.method === 'HEAD') await statics(req, res, url);
      else { res.writeHead(405); res.end(); }
    } catch (e) {
      if (!e.status) console.error(e);
      if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Server error.' });
      else res.end();
    }
  };
}
