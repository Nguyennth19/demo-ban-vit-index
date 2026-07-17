/**
 * File: sw.js
 * Dự Án: Phù Sa Farm (PWA Offline-first)
 * * HƯỚNG DẪN DÀNH CHO QUẢN TRỊ VIÊN:
 * - Để kích hoạt chế độ cập nhật bắt buộc (ép xóa cache cũ) cho người dùng,
 * hãy thay đổi giá trị CACHE_NAME bên dưới sang định dạng Thời gian (Timestamp).
 * - Định dạng khuyên dùng: 'phusa-farm-YYYYMMDD-HHMM' (Ví dụ: phusa-farm-20260717-0945)
 */
const CACHE_NAME = 'phusa-farm-20260717-0945'; // Thay đổi từ số thứ tự cũ (v4, v5) sang Timestamp để chống lỗi vòng lặp bộ nhớ

// Các tài nguyên tĩnh cục bộ cần bộ đệm hoạt động ngoại tuyến
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './logo-192.png',
  './logo-512.png',
  './background.png'
];

// Sự kiện cài đặt (Install) - Nạp tài nguyên vào Cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Đang nạp tài nguyên tĩnh vào bộ đệm...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting()) // Bỏ qua trạng thái chờ khi cài đặt lần đầu
  );
});

// Sự kiện kích hoạt (Activate) - Giải phóng và xóa bỏ cache cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Đang dọn dẹp bộ đệm cũ:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Sự kiện fetch - Đọc bộ đệm (Offline-first), bỏ qua API Google Sheets
self.addEventListener('fetch', (event) => {
  // Bỏ qua các lệnh API gửi lên Google Apps Script
  if (event.request.url.includes('script.google.com')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Trả về cache nếu có sẵn, nếu không sẽ tải từ mạng
      return cachedResponse || fetch(event.request);
    })
  );
});

// SỬA LỖI VẤN ĐỀ 1: Lắng nghe sự kiện 'message' để thực thi self.skipWaiting()
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    console.log('[Service Worker] Nhận được tín hiệu skipWaiting. Đang ép cập nhật phiên bản mới...');
    self.skipWaiting();
  }
});
