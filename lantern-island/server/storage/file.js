// File adapter: every record is one JSON file, <dir>/<collection>/<id>.json
import fs from 'node:fs/promises';
import path from 'node:path';

const SAFE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MEDIA = /^[a-z0-9]{6,40}\.[a-z0-9]{2,5}$/;

let writes = 0;

export function createFileStorage(dir) {
  const file = (collection, id) => {
    if (!SAFE.test(collection) || !SAFE.test(id)) throw Object.assign(new Error('Group not found.'), { status: 404 });
    return path.join(dir, collection, id + '.json');
  };
  return {
    kind: 'file',
    async list(collection) {
      let names;
      try { names = await fs.readdir(path.join(dir, collection)); } catch { return []; }
      const out = [];
      for (const n of names.filter((n) => n.endsWith('.json')).sort()) {
        try { out.push(JSON.parse(await fs.readFile(path.join(dir, collection, n), 'utf8'))); }
        catch (e) { console.warn(`Skipping unreadable save ${collection}/${n}: ${e.message}`); }
      }
      return out;
    },
    async get(collection, id) {
      try { return JSON.parse(await fs.readFile(file(collection, id), 'utf8')); }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    // Writes to a temporary file first, so a crash never leaves half a save. Each write
    // gets its own temporary file, so two saves at the same moment cannot mix.
    async put(collection, id, record) {
      const f = file(collection, id), tmp = `${f}.${process.pid}.${++writes}.tmp`;
      await fs.mkdir(path.dirname(f), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(record, null, 2));
      await fs.rename(tmp, f);
    },
    async remove(collection, id) {
      await fs.rm(file(collection, id), { force: true });
    },
    // Sound and pictures for cards: plain files in <dir>/media/.
    async putFile(name, buffer) {
      if (!MEDIA.test(name)) throw Object.assign(new Error('Bad file name.'), { status: 400 });
      await fs.mkdir(path.join(dir, 'media'), { recursive: true });
      await fs.writeFile(path.join(dir, 'media', name), buffer);
    },
    async getFile(name) {
      if (!MEDIA.test(name)) return null;
      try { return await fs.readFile(path.join(dir, 'media', name)); } catch { return null; }
    },
    async listFiles() {
      try { return (await fs.readdir(path.join(dir, 'media'))).filter((n) => MEDIA.test(n)); } catch { return []; }
    },
    async check() { await fs.mkdir(dir, { recursive: true }); },
  };
}
