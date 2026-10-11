// Copies everything (groups, cards, missions, sounds and pictures) from one storage to the other.
//   npm run copy-to-supabase     files in ./data  ->  Supabase
//   npm run copy-to-files        Supabase         ->  files in ./data
// Records with the same id are replaced at the destination. Nothing is deleted anywhere.
// Needs SUPABASE_URL and SUPABASE_SERVICE_KEY, like the server.
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { createStorage } from './storage/index.js';

export async function copyStorage(from, to, log = () => {}) {
  await from.check(); await to.check();
  const counts = {};
  for (const collection of ['groups', 'cards', 'missions', 'meta']) {
    const rows = await from.list(collection);
    for (const r of rows) {
      // Bookkeeping records keep their id in the file name, not inside.
      if (r?.id) await to.put(collection, r.id, r);
    }
    counts[collection] = rows.filter((r) => r?.id).length;
    log(`${collection}: ${counts[collection]}`);
  }
  // "meta" records have no id of their own: copy the two we know.
  for (const id of ['seeded-cards', 'seeded-missions']) { const m = await from.get('meta', id); if (m) await to.put('meta', id, m); }
  const files = await from.listFiles();
  for (const name of files) { const body = await from.getFile(name); if (body) await to.putFile(name, body); }
  counts.files = files.length;
  log(`sounds and pictures: ${files.length}`);
  return counts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [a, b] = process.argv.slice(2);
  if (!['file', 'supabase'].includes(a) || !['file', 'supabase'].includes(b) || a === b) {
    console.error('Use: node server/copy.js file supabase   or   node server/copy.js supabase file');
    process.exit(1);
  }
  try {
    console.log(`\nCopying from ${a} to ${b}...`);
    await copyStorage(createStorage(loadConfig({ storage: a })), createStorage(loadConfig({ storage: b })), (line) => console.log('  ' + line));
    console.log('Done.\n');
  } catch (e) { console.error('\n' + e.message + '\n'); process.exit(1); }
}
