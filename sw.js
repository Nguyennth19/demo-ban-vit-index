// File: sw.js
// Service Worker cho Hệ Thống Quản Lý Xuất Vịt - Phù Sa Farm (PWA Offline Shell)

const CACHE_NAME = 'phusa-farm-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css'
];

// Cài đặt Service Worker và Cache các tài nguyên tĩnh
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Kích hoạt Service Worker và dọn dẹp các cache cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Xóa Cache cũ:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Đánh chặn yêu cầu Fetch để hỗ trợ tải Offline
self.addEventListener('fetch', (event) => {
  // Không cache các yêu cầu gửi lên Google Apps Script (phải xử lý trực tiếp online/offline bằng JS)
  if (event.request.url.includes('script.google.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch((err) => {
        console.log('[Service Worker] Mất mạng và không có tài nguyên trong cache:', err);
      });
    })
  );
});
