// Sample content. A collection is filled from its seed file on the first run. Samples added
// to the seed file later (a new version of the game) are added once too; samples the teacher
// deleted do not come back.
import fs from 'node:fs/promises';
import path from 'node:path';

export async function seed(storage, contentDir, collection, file) {
  const have = await storage.list(collection);
  const samples = JSON.parse(await fs.readFile(path.join(contentDir, file), 'utf8'));
  const meta = (await storage.get('meta', `seeded-${collection}`)) || { ids: have.length ? have.map((r) => r.id) : [] };
  const fresh = samples.filter((s) => !meta.ids.includes(s.id));
  if (!fresh.length) return have;
  for (const s of fresh) if (!have.some((r) => r.id === s.id)) { await storage.put(collection, s.id, s); have.push(s); }
  await storage.put('meta', `seeded-${collection}`, { ids: [...meta.ids, ...fresh.map((s) => s.id)] });
  return have;
}
