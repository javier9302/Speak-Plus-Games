// Offline support. The first visit (over http or https, not file://) stores the hub and the games
// that work without a server; after that they open with no connection, or on poor school Wi-Fi.
// The file list and version come from shared/precache.js (made by `node tools/build.mjs`), so a
// new version of the site replaces the old copy by itself.
importScripts('shared/precache.js');
const CACHE = 'hub-' + self.PRECACHE.version;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(self.PRECACHE.files.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('hub-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Stored copy first (fast and offline), the network for anything not stored. Addresses with
// ?teacher=1 or #share=… use the same stored page.
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).catch(() =>
    req.mode === 'navigate' ? c.match('index.html') : Response.error()))));
});
