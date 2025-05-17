const CACHE_NAME = 'iptv-cache-v1';
const ASSETS = [
  '/',
  '/index.php',
  '/main.js',
  '/partials/header.php',
  '/partials/footer.php',
  '/partials/head.php'
];
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
