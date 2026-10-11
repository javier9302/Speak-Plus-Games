// Settings, read once at start-up from the environment.
//   PORT          port to listen on (default 3000)
//   PUBLIC_URL    set this in hosted mode, e.g. https://island.example.com
//   TEACHER_PIN   PIN for the host and teacher pages (a random one is made if missing)
//   DATA_DIR      where saves go (default ./data)
//   STORAGE       "file" (default) or "supabase"
//   SUPABASE_URL, SUPABASE_SERVICE_KEY   only for STORAGE=supabase. The key stays on the server.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(over = {}) {
  const env = process.env;
  const publicUrl = String(over.publicUrl ?? env.PUBLIC_URL ?? '').replace(/\/+$/, '');
  return {
    root,
    port: over.port ?? Number(env.PORT || 3000),
    publicUrl,
    hosted: !!publicUrl,                       // hosted mode = PUBLIC_URL is set
    publicDir: path.join(root, 'public'),
    contentDir: path.join(root, 'data'),       // zones and other content shipped with the game
    dataDir: over.dataDir ?? env.DATA_DIR ?? path.join(root, 'data'),
    storage: over.storage ?? env.STORAGE ?? 'file',
    supabaseUrl: over.supabaseUrl ?? env.SUPABASE_URL ?? '',
    supabaseKey: over.supabaseKey ?? env.SUPABASE_SERVICE_KEY ?? '',
    pin: String(over.pin ?? env.TEACHER_PIN ?? Math.floor(1000 + Math.random() * 9000)),
    quiet: !!over.quiet,
  };
}
