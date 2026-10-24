// Service worker: cache-first app shell so the app opens without a signal (spec §7).
// Bump VERSION and keep APP_FILES complete whenever a loaded file is added or changed.

const VERSION = '19';
const CACHE = `sumaho-shosai-v${VERSION}`;
const APP_FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'src/app.js',
  'src/db.js',
  'src/lookup.js',
  'src/camera.js',
  'src/feedback.js',
  'src/ui/dom.js',
  'src/ui/scan.js',
  'src/ui/shelf.js',
  'src/ui/settings.js',
  'src/ui/detail.js',
  'src/ui/add.js',
  'src/ui/tags.js',
  'src/ui/icons.js',
  'src/ui/theme.js',
  'src/ui/photo.js',
  'src/ui/crop.js',
  'src/core/warp.js',
  'src/core/detect.js',
  'src/core/model.js',
  'src/core/isbn.js',
  'src/core/normalize.js',
  'src/core/volume.js',
  'src/core/ndl.js',
  'src/core/openbd.js',
  'src/core/rakuten.js',
  'src/core/merge.js',
  'src/core/confirm.js',
  'src/core/session.js',
  'src/core/check.js',
  'src/core/series.js',
  'src/core/search.js',
  'src/core/stale.js',
  'src/core/stats.js',
  'src/core/csv.js',
  'src/core/backup.js',
  'vendor/barcode-detector/ponyfill.js',
  'vendor/barcode-detector/zxing-exported.js',
  'vendor/barcode-detector/zxing_reader.wasm',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (self.location.hostname === 'localhost') return; // always fresh files while developing
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch (err) {
      if (request.mode === 'navigate') return caches.match('index.html');
      throw err;
    }
  })());
});
