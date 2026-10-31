/* =====================================================================
   service-worker.js - pré-cache do app, rede primeiro, Background Sync
   VERSAO muda junto com config.js (versao) e versao.txt a cada entrega.
   ===================================================================== */
const VERSAO = '1.0.1';
const CACHE = 'estoque-hub-rbg-' + VERSAO;
const ARQUIVOS = [
  './',
  'index.html',
  'styles.css',
  'config.js',
  'db.js',
  'auth.js',
  'sync.js',
  'app.js',
  'cadastros.js',
  'manifest.json',
  'vendor/dexie.min.js',
  'vendor/xlsx.full.min.js',
  'icons/logo-edp-branco.png',
  'icons/logo-edp.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('estoque-hub-rbg-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rede primeiro para os arquivos do app; a base central (outra origem) não passa pelo cache.
self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  ev.respondWith(
    fetch(req).then(resp => {
      if (resp && resp.ok && resp.type === 'basic') {
        const copia = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copia));
      }
      return resp;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});

// Background Sync: pede aos clientes abertos que sincronizem
self.addEventListener('sync', ev => {
  if (ev.tag === 'estoque-sync') {
    ev.waitUntil(self.clients.matchAll({ includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ tipo: 'sync' }))));
  }
});
