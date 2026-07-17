/* File: Mã_XửLý_Sheet.gs */

/**
 * -------------------------------------------------------------------
 * HỆ THỐNG XÁC THỰC BẰNG TÀI KHOẢN (LẤY TỪ SHEET "Account")
 * -------------------------------------------------------------------
 */

// Hàm API: Trình duyệt gọi lên để kiểm tra đăng nhập
function verifyLogin(username, password) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Account');
    
    if (!sheet) {
      return { success: false, message: "Lỗi hệ thống: Không tìm thấy sheet 'Account'" };
    }
    
    // Đọc toàn bộ dữ liệu (bỏ qua dòng tiêu đề)
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
       return { success: false, message: "Hệ thống chưa có tài khoản nào được đăng ký!" };
    }
    
    const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // Cột A (User), Cột B (Pass)
    
    let isMatched = false;
    for (let i = 0; i < data.length; i++) {
      let dbUser = (data[i][0] || "").toString().trim();
      let dbPass = (data[i][1] || "").toString().trim();
      
      if (dbUser === username && dbPass === password) {
        isMatched = true;
        break;
      }
    }
    
    if (isMatched) {
      // Nếu đúng mật khẩu, tạo một token tĩnh tạm thời (hoặc bạn có thể dùng Utilities.getUuid() để bảo mật hơn)
      // Ở đây dùng mật khẩu làm token tĩnh để đơn giản hóa quá trình xác thực các hàm sau
      return { success: true, token: password }; 
    } else {
      return { success: false, message: "Tài khoản hoặc mật khẩu không đúng!" };
    }
    
  } catch(e) {
    return { success: false, message: "Lỗi server: " + e.message };
  }
}

/**
 * Hàm kiểm tra Auth (Hàng rào bảo vệ các API khác)
 * Chặn mọi API request nếu token gửi lên không trùng với bất kỳ mật khẩu nào trong sheet Account
 */
function verifyAuthToken(auth) {
  if (!auth || !auth.token) {
    throw new Error("AUTH_FAILED");
  }
  
  const tokenToVerify = auth.token;
  
  // (Để tối ưu, nên cache danh sách token vào PropertiesService thay vì đọc Sheet mỗi lần,
  // nhưng nếu ít người dùng, quét trực tiếp Sheet Account vẫn ổn định).
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Account');
  if (!sheet) throw new Error("AUTH_FAILED");
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("AUTH_FAILED");
  
  const passData = sheet.getRange(2, 2, lastRow - 1, 1).getValues(); // Chỉ đọc cột B (Mật khẩu/Token)
  
  let isValid = false;
  for (let i = 0; i < passData.length; i++) {
    if (passData[i][0] !== "" && passData[i][0].toString().trim() === tokenToVerify) {
      isValid = true;
      break;
    }
  }
  
  if (!isValid) {
    throw new Error("AUTH_FAILED"); 
  }
}

// -------------------------------------------------------------------
// CẬP NHẬT CÁC HÀM CŨ: BỔ SUNG AUTH VÀO ĐẦU
// -------------------------------------------------------------------

// Ví dụ hàm lấy dữ liệu:
function getBatchData(auth, startRow) {
  try {
    verifyAuthToken(auth); // Kiểm tra token trước khi cho phép đọc
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    // ... toàn bộ logic đọc sheet giữ nguyên như cũ ...
    
    const lastRow = sheet.getLastRow();
    if (startRow > lastRow) return null;
    
    const numRowsToRead = Math.min(lastRow - startRow + 1, 1000);
    const data = sheet.getRange(startRow, 1, numRowsToRead, 9).getValues();
    
    let tenDot = data[0][0]; let donGia = data[0][6];
    let rows = []; let totalKg = 0; let totalSot = 0; let lanCanCount = 0;
    
    for (let i = 0; i < data.length; i++) {
      if (data[i][2] === "") break;
      let crateCount = Number(data[i][5]) || 0;
      rows.push({
        rowNum: startRow + i, lanCan: data[i][2], soSot: crateCount, soKy: data[i][3],
        tichLuy: data[i][4], timestamp: Utilities.formatDate(new Date(data[i][1]), "GMT+7", "HH:mm:ss")
      });
      totalKg = data[i][4];
      totalSot += crateCount;
      lanCanCount = data[i][2];
    }
    rows.reverse();
    return {
      startRow: startRow, tenDot: tenDot, donGia: donGia,
      summary: { totalKg: Number(totalKg.toFixed(2)), totalSot: totalSot, lanCan: lanCanCount, actualKg: Number((totalKg - (totalSot * 5)).toFixed(2)) },
      rows: rows
    };
  } catch (e) {
    throw new Error(e.message); // Sẽ trả về 'AUTH_FAILED' nếu lỗi xác thực
  }
}
