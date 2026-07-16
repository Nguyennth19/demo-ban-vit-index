// File: sw.js
const CACHE_NAME = 'phusa-farm-v4'; // Tăng lên v4 để ép xóa sạch cache cũ
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  // Thêm v4 vào link để ép tải lại
  'https://raw.githubusercontent.com/Nguyennth19/demo-ban-vit-index/refs/heads/main/logo-phu-sa-farm.jpg?v=2',
  'https://raw.githubusercontent.com/Nguyennth19/demo-ban-vit-index/refs/heads/main/backgroup-phu-sa-farm.png?v=2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('script.google.com')) return;
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
