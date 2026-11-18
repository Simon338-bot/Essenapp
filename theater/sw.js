// Service Worker: macht die App komplett offline nutzbar.
// Alle Dateien kommen aus dem Zwischenspeicher (schnell, auch ohne WLAN).
// Updates kommen über eine neue Versionsnummer hier: dann werden alle Dateien auf einmal neu geladen.
const CACHE = 'buehnenton-v6';
const ASSETS = ['./', 'index.html', 'styles.css?v=6', 'app.js?v=6', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('buehnenton-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req.mode === 'navigate' ? 'index.html' : req);
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      return (await cache.match('index.html')) || Response.error();
    }
  })());
});
