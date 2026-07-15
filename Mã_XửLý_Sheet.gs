/* File: ma xu ly sheet.gs */
/**
 * Hàm tiện ích: Chuẩn hóa số liệu an toàn (Dùng Regex để xử lý cả dấu phẩy và dấu chấm)
 */
function parseSafeNumber(val) {
  if (val === "" || val === null || val === undefined) return 0;
  // Thay thế dấu phẩy thành dấu chấm, lọc sạch mọi ký tự lạ không phải số
  let strVal = val.toString().replace(/,/g, '.').replace(/[^0-9.-]/g, '');
  let num = parseFloat(strVal);
  return isNaN(num) ? 0 : num;
}

/**
 * Hàm tiện ích: Bắt lỗi quá hạn khóa an toàn
 */
function acquireLockSafe(lock) {
  try {
    lock.waitLock(30000);
  } catch (e) {
    throw new Error("Hệ thống đang bận xử lý dữ liệu của người khác, vui lòng thử lại sau vài giây!");
  }
}

/**
 * Lần cân đầu tiên của Đợt: Tạo bảng mới trong Google Sheets cách đợt cũ 1 dòng trống
 */
function addFirstData(tenDot, donGiaStr, soKyStr, soSotStr) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    if (!sheet) throw new Error("Không tìm thấy trang tính 'Xuất vịt'");

    const soKy = parseSafeNumber(soKyStr);
    const donGia = parseSafeNumber(donGiaStr);
    const soSot = parseInt(soSotStr) || 2;

    if (soKy <= 0) throw new Error("Số ký nhập vào không hợp lệ");

    let lastRow = sheet.getLastRow();
    // Tạo bảng mới cách bảng cũ 1 dòng trống (nếu trang tính đã có sẵn dữ liệu)
    let newRow = lastRow > 1 ? lastRow + 2 : 2;

    const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
    // Cấu trúc phân bổ: A(Thông tin), B(Thời gian), C(Lần cân), D(Số ký), E(Tích lũy), F(Số sọt), G(Đơn giá), H(Tổng tiền), I(Thực nhận)
    sheet.getRange(newRow, 1, 1, 9).setValues([[tenDot, now, 1, soKy, soKy, soSot, donGia, "", ""]]);
    
    // TỐI ƯU CACHE: Lưu vết dòng bắt đầu của đợt này vào PropertiesService (vĩnh viễn)
    PropertiesService.getDocumentProperties().setProperty('lastBatchStartRow', newRow.toString());
    
    // Ép Google Sheet lưu dứt điểm dữ liệu vật lý xuống hàng trước khi nhả khóa
    SpreadsheetApp.flush();
    return getBatchData(newRow);
  } catch (e) { 
    throw new Error(e.message); 
  } finally {
    lock.releaseLock();
  }
}

/**
 * Các lần cân tiếp theo: Tự động tìm kiếm vị trí trống liền kề phía dưới của đợt hiện tại để ghi số
 */
function addNextData(startRow, soKyStr, soSotStr) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    const soKy = parseSafeNumber(soKyStr);
    const soSot = parseInt(soSotStr) || 2;
    
    if (soKy <= 0) throw new Error("Số ký nhập vào không hợp lệ");
    
    // Tối ưu: Chỉ đọc tối đa 1000 dòng để tìm chỗ trống thay vì đọc toàn bộ phần còn lại của sheet
    const lastRow = sheet.getLastRow();
    const numRowsToRead = Math.min(lastRow - startRow + 1, 1000);
    // Đọc 4 cột: C(Lần cân), D(Số ký), E(Tích lũy), F(Số sọt)
    const range = sheet.getRange(startRow, 3, numRowsToRead, 4);
    const values = range.getValues();
    
    let lastLanCan = 0;
    let lastTichLuy = 0;
    let totalSotCount = 0;
    let rowCount = 0;
    
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === "") break;
      lastLanCan = Number(values[i][0]);
      lastTichLuy = Number(values[i][2]);
      totalSotCount += Number(values[i][3]) || 0;
      rowCount++;
    }
    
    let targetRow = startRow + rowCount;
    let lanCan = lastLanCan + 1;
    let tichLuy = lastTichLuy + soKy;
    let newTotalSot = totalSotCount + soSot;
    const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
    
    sheet.getRange(targetRow, 2, 1, 5).setValues([[now, lanCan, soKy, tichLuy, soSot]]);
    
    SpreadsheetApp.flush();
    
    // TỐI ƯU PAYLOAD: Chỉ trả về phần tử mới và các số liệu tổng hợp thay vì cả 1000 dòng
    return {
      isPartial: true,
      summary: {
        totalKg: Number(tichLuy.toFixed(2)),
        totalSot: newTotalSot,
        lanCan: lanCan,
        actualKg: Number((tichLuy - (newTotalSot * 5)).toFixed(2))
      },
      newRow: {
        rowNum: targetRow,
        lanCan: lanCan,
        soSot: soSot,
        soKy: soKy,
        tichLuy: tichLuy
      }
    };
  } catch (e) { 
    throw new Error(e.message); 
  } finally {
    lock.releaseLock();
  }
}

/**
 * Chỉnh sửa dữ liệu sọt cân cũ: Cập nhật đồng thời Số ký (D), Số sọt (F) và tính toán lại toàn bộ cột Tích lũy (E)
 */
function editData(rowToEdit, newSoKyStr, newSoSotStr, startRow) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    const newSoKy = parseSafeNumber(newSoKyStr);
    const newSoSot = parseInt(newSoSotStr);
    
    sheet.getRange(rowToEdit, 4).setValue(newSoKy); 
    if (!isNaN(newSoSot)) sheet.getRange(rowToEdit, 6).setValue(newSoSot);
    const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
    sheet.getRange(rowToEdit, 2).setValue(now);

    // Tối ưu: Chỉ quét lại trong phạm vi đợt cân hiện tại (tối đa 1000 dòng), cực kỳ nhẹ bộ nhớ
    const lastRow = sheet.getLastRow();
    const numRowsToRead = Math.min(lastRow - startRow + 1, 1000);
    const range = sheet.getRange(startRow, 3, numRowsToRead, 3); 
    const values = range.getValues();
    
    let currentTichLuy = 0;
    let updates = [];
    
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === "") break;
      let weight = (startRow + i === rowToEdit) ? newSoKy : Number(values[i][1]);
      currentTichLuy += weight;
      updates.push([currentTichLuy]);
    }
    
    sheet.getRange(startRow, 5, updates.length, 1).setValues(updates);
    
    SpreadsheetApp.flush();
    // Return full do editData thay đổi tích lũy của nhiều dòng, frontend cần vẽ lại toàn bộ
    return getBatchData(startRow);
  } catch (e) { 
    throw new Error(e.message); 
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cập nhật Đơn Giá tại dòng đầu tiên của đợt (Cột G) khi thương lượng lại giá giữa chừng
 */
function updatePrice(startRow, newDonGiaStr) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    const donGia = parseSafeNumber(newDonGiaStr);

    sheet.getRange(startRow, 7).setValue(donGia);
    
    SpreadsheetApp.flush();
    return true; // Không cần return getBatchData vì UI đã cập nhật local
  } catch(e) { 
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Kết toán đợt xuất: Ghi đồng thời Tổng tiền (H) và Thực nhận (I) vào đúng dòng đầu tiên của đợt
 */
function checkoutBatch(startRow, tongTienStr, thucNhanStr) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    const tongTien = parseSafeNumber(tongTienStr);
    const thucNhan = parseSafeNumber(thucNhanStr);
    
    sheet.getRange(startRow, 8).setValue(tongTien);
    sheet.getRange(startRow, 9).setValue(thucNhan);
    
    SpreadsheetApp.flush();
    return true;
  } catch(e) { 
    throw new Error(e.message); 
  } finally {
    lock.releaseLock();
  }
}

/**
 * Hàm lấy cấu trúc dữ liệu tổng hợp và chi tiết của một đợt phục vụ kết nối UI hiển thị
 */
function getBatchData(startRow) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    const lastRow = sheet.getLastRow();
    
    if (startRow > lastRow) return null;

    // Tối ưu: Chỉ giới hạn lấy tối đa 1000 dòng (dư sức cho 1 đợt xuất) thay vì đọc mảng khổng lồ
    const numRowsToRead = Math.min(lastRow - startRow + 1, 1000);
    const dataRange = sheet.getRange(startRow, 1, numRowsToRead, 9);
    const data = dataRange.getValues();
    
    let tenDot = data[0][0];
    let donGia = data[0][6];

    let rows = [];
    let totalKg = 0;
    let totalSot = 0;
    let lanCanCount = 0;

    for (let i = 0; i < data.length; i++) {
      if (data[i][2] === "") break;

      let crateCount = Number(data[i][5]) || 0;
      rows.push({
        rowNum: startRow + i,
        lanCan: data[i][2],
        soSot: crateCount,
        soKy: data[i][3],
        tichLuy: data[i][4]
      });

      totalKg = data[i][4]; 
      totalSot += crateCount;
      lanCanCount = data[i][2];
    }

    // Hiển thị sọt mới cân lên đầu bảng danh sách
    rows.reverse();

    return {
      startRow: startRow,
      tenDot: tenDot,
      donGia: donGia,
      summary: {
        totalKg: Number(totalKg.toFixed(2)),
        totalSot: totalSot,
        lanCan: lanCanCount,
        actualKg: Number((totalKg - (totalSot * 5)).toFixed(2))
      },
      rows: rows
    };
  } catch (e) { throw new Error("Lỗi truy xuất dữ liệu đợt: " + e.message); }
}

/**
 * Quét ngược từ dưới lên trên Cột A nhằm tìm kiếm dòng bắt đầu của đợt xuất gần nhất (Tính năng Xem lại lịch sử)
 */
function getLastBatchStartRow() {
  try {
    const props = PropertiesService.getDocumentProperties();
    let cachedRow = props.getProperty('lastBatchStartRow');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    
    // TỐI ƯU CACHE: Kiểm tra xem số dòng lưu trong bộ nhớ có chính xác là dòng chứa Tên đợt không
    if (cachedRow) {
      let rowNum = parseInt(cachedRow, 10);
      if (sheet.getRange(rowNum, 1).getValue() !== "") {
        return rowNum; // Tìm thấy lập tức trong 0.1s
      }
    }

    // Fallback: Quét phân mảnh (Chunking) từ dưới lên
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    
    const CHUNK_SIZE = 1000;
    let endRow = lastRow;
    
    while (endRow >= 2) {
      let startRow = Math.max(2, endRow - CHUNK_SIZE + 1);
      let numRows = endRow - startRow + 1;
      
      let colA = sheet.getRange(startRow, 1, numRows, 1).getValues();

      for (let i = colA.length - 1; i >= 0; i--) {
        if (colA[i][0] !== "") {
          let foundRow = startRow + i;
          props.setProperty('lastBatchStartRow', foundRow.toString()); // Lưu lại Cache cho lần sau
          return foundRow;
        }
      }
      
      // Lùi xuống khối 1000 dòng tiếp theo bên trên
      endRow = startRow - 1;
    }
    
    return null;
  } catch (e) { throw new Error(e.message); }
}