const SHELL = 'autosplat-shell-v6';
const RUNTIME = 'autosplat-runtime-v6';
const SHELL_FILES = [
  './', './index.html', './css/style.css',
  './js/app.js', './js/viewer.js', './js/dropzone.js',
  './js/hud.js', './js/heightmap.js', './js/controls.js', './js/walking.js',
  './js/collision/voxelize.js', './js/collision/mc-tables.js',
  './js/collision/marching-cubes.js', './js/collision/mesh-bvh.js',
  './js/collision/editor.js', './js/collision/persist.js',
  './js/collision/collision-mode.js',
  './manifest.webmanifest', './assets/og-image.jpg',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== SHELL && k !== RUNTIME)
      .map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // same-origin app shell: network-first, so deploys show up on reload;
  // the cached copy is the offline fallback
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
        return res;
      } catch {
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached || Response.error();
      }
    })());
    return;
  }

  // cross-origin (CDN engine): stale-while-revalidate
  e.respondWith((async () => {
    const cached = await caches.open(RUNTIME).then(c => c.match(req));
    const network = fetch(req).then(async (res) => {
      if (res.ok) (await caches.open(RUNTIME)).put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
