// File: sw.js
// Service Worker cho Hệ Thống Quản Lý Xuất Vịt - Phù Sa Farm (PWA Offline Shell)

const CACHE_NAME = 'phusa-farm-v2'; // Thay đổi v2 thành v3, v4... khi bạn cập nhật code trên Github
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://live.staticflickr.com/65535/55300817978_f977b99993.jpg'
];

// Cài đặt Service Worker và Cache các tài nguyên tĩnh
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
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
  // Không cache đối với request gọi tới máy chủ Google Apps Script
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

// Lắng nghe tín hiệu từ web ép cập nhật SW ngay lập tức
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
