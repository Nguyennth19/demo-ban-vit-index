/**
 * Khởi tạo Web App và cấu hình render giao diện Index.html chính
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  
  // Nhận diện trạng thái điều hướng nếu có tham số mở rộng sau này
  template.mode = (e && e.parameter && e.parameter.mode) ? e.parameter.mode : 'landing';
  
  return template.evaluate()
    .setTitle('Hệ Thống Xuất Vịt - Phù Sa Farm')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Hàm tiện ích dùng để nhúng nội dung mã (CSS, JS, Component HTML) từ các file phụ vào tệp Index chính
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}