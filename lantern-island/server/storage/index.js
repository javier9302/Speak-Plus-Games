// Storage layer. Every adapter has the same functions:
//   list(collection)  get(collection, id)  put(collection, id, record)  remove(collection, id)
//   putFile(name, buffer, type)  getFile(name)  listFiles()     sound and pictures for cards
//   check()                                                      called once at start-up
// Collections: "groups", "cards", "missions", "meta".
//
// Choose with the STORAGE setting: "file" (default, JSON files in ./data) or "supabase".
import { createFileStorage } from './file.js';
import { createSupabaseStorage } from './supabase.js';

export function createStorage(config) {
  if (config.storage === 'file') return createFileStorage(config.dataDir);
  if (config.storage === 'supabase') return createSupabaseStorage({ url: config.supabaseUrl, key: config.supabaseKey });
  throw new Error(`Unknown STORAGE "${config.storage}". Use "file" or "supabase".`);
}
