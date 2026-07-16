/* File: Mã_XửLý_Sheet.gs */

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
 * Hàm tiện ích: Bắt lỗi quá hạn khóa an toàn chống ghi đè đa luồng
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
    if (!sheet) throw new Error("Không tìm thấy trang tính 'Xuất vịt'");
    
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
        tichLuy: tichLuy,
        timestamp: now
      }
    };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * NÂNG CẤP ĐỒNG BỘ: Đẩy cả Sọt cân lẫn Lệnh kết toán lên cùng 1 lúc (Nếu có phát sinh khi Offline)
 */
function syncOfflineData(startRow, tenDot, donGia, offlineRows, offlineCheckout) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    if (!sheet) throw new Error("Không tìm thấy trang tính 'Xuất vịt'");
    
    let currentStartRow = startRow;
    
    // 1. GHI HÀNG LOẠT SỌT CÂN (NẾU CÓ)
    if (offlineRows && offlineRows.length > 0) {
      let startIndex = 0;
      
      // Trường hợp đợt cân được tạo mới hoàn toàn khi offline (chưa có startRow)
      if (currentStartRow === null || currentStartRow === "" || isNaN(currentStartRow)) {
        const firstItem = offlineRows[0];
        const soKy = parseSafeNumber(firstItem.soKy);
        const dg = parseSafeNumber(donGia);
        const soSot = parseInt(firstItem.soSot) || 2;
        
        let lastRow = sheet.getLastRow();
        let newRow = lastRow > 1 ? lastRow + 2 : 2;
        const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
        
        sheet.getRange(newRow, 1, 1, 9).setValues([[tenDot, now, 1, soKy, soKy, soSot, dg, "", ""]]);
        PropertiesService.getDocumentProperties().setProperty('lastBatchStartRow', newRow.toString());
        
        currentStartRow = newRow;
        startIndex = 1; // Đã xử lý sọt đầu tiên, chuyển sang sọt tiếp theo
      }
      
      // Thu thập dữ liệu hiện hữu của đợt cân để tiếp tục tính lũy tiến
      const lastRow = sheet.getLastRow();
      const numRowsToRead = Math.min(lastRow - currentStartRow + 1, 1000);
      const range = sheet.getRange(currentStartRow, 3, numRowsToRead, 4);
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
      
      // Chuẩn bị ghi gộp (Bulk Write) danh sách hàng sọt offline còn lại
      const rowsToWrite = [];
      const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
      
      for (let i = startIndex; i < offlineRows.length; i++) {
        const item = offlineRows[i];
        const soKy = parseSafeNumber(item.soKy);
        const soSot = parseInt(item.soSot) || 2;
        
        lastLanCan++;
        lastTichLuy += soKy;
        totalSotCount += soSot;
        
        rowsToWrite.push([now, lastLanCan, soKy, lastTichLuy, soSot]);
      }
      
      if (rowsToWrite.length > 0) {
        const targetRow = currentStartRow + rowCount;
        sheet.getRange(targetRow, 2, rowsToWrite.length, 5).setValues(rowsToWrite);
      }
    }
    
    // 2. GHI LỆNH KẾT TOÁN (Nếu có bấm Kết Toán trong lúc mất mạng)
    if (offlineCheckout && currentStartRow) {
      sheet.getRange(currentStartRow, 8).setValue(parseSafeNumber(offlineCheckout.tongTien));
      sheet.getRange(currentStartRow, 9).setValue(parseSafeNumber(offlineCheckout.thucNhan));
    }
    
    SpreadsheetApp.flush();
    return currentStartRow ? getBatchData(currentStartRow) : null;
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
    if (!sheet) throw new Error("Không tìm thấy trang tính 'Xuất vịt'");
    
    const newSoKy = parseSafeNumber(newSoKyStr);
    const newSoSot = parseInt(newSoSotStr);
    
    sheet.getRange(rowToEdit, 4).setValue(newSoKy);
    if (!isNaN(newSoSot)) {
      sheet.getRange(rowToEdit, 6).setValue(newSoSot);
    }
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
    if (!sheet) throw new Error("Không tìm thấy trang tính 'Xuất vịt'");
    
    const donGia = parseSafeNumber(newDonGiaStr);
    sheet.getRange(startRow, 7).setValue(donGia);
    SpreadsheetApp.flush();
    return true;
  } catch(e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * TRẢ LẠI QUYỀN TÍNH TIỀN CHO FRONTEND: Chống lỗi NaN do định dạng số của Sheet khi kết toán
 */
function checkoutBatch(startRow, tongTien, thucNhan) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    if (!sheet) throw new Error("Không tìm thấy trang tính 'Xuất vịt'");
    
    // 3. Ghi dữ liệu kết toán vào cột H (Tổng tiền) và I (Thực nhận)
    sheet.getRange(startRow, 8).setValue(parseSafeNumber(tongTien));
    sheet.getRange(startRow, 9).setValue(parseSafeNumber(thucNhan));
    
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
    if (!sheet) throw new Error("Không tìm thấy trang tính 'Xuất vịt'");
    
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
        tichLuy: data[i][4],
        timestamp: Utilities.formatDate(new Date(data[i][1]), "GMT+7", "HH:mm:ss") // chỉ hiện giờ cho gọn giao diện
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
  } catch (e) {
    throw new Error("Lỗi truy xuất dữ liệu đợt: " + e.message);
  }
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
    if (!sheet) return null;
    
    // TỐI ƯU CACHE: Kiểm tra xem số dòng lưu trong bộ nhớ có chính xác là dòng chứa Tên đợt không
    if (cachedRow) {
      let rowNum = parseInt(cachedRow, 10);
      if (rowNum <= sheet.getLastRow() && sheet.getRange(rowNum, 1).getValue() !== "") {
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
      endRow = startRow - 1; // Lùi xuống khối 1000 dòng tiếp theo bên trên
    }
    return null;
  } catch (e) {
    throw new Error(e.message);
  }
}

/**
 * TỐI ƯU KIẾN NGHỊ 1: Hàm kích hoạt Trigger dọn dẹp và nén (Archive) các đợt cân cũ sang Sheet Lịch Sử định kỳ
 * Đề xuất cấu hình Trigger chạy hàng tuần/tháng ngầm trong dự án Google Apps Script
 */
function autoArchiveOldBatches() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName('Xuất vịt');
  if (!sourceSheet) return;
  
  const lastRow = sourceSheet.getLastRow();
  if (lastRow < 2) return;
  
  const data = sourceSheet.getRange(1, 1, lastRow, 9).getValues();
  const batches = [];
  let currentBatch = null;
  
  // 1. Phân nhóm các đợt cân từ dòng dữ liệu thô
  for (let i = 1; i < data.length; i++) {
    const rowNum = i + 1;
    const tenDot = data[i][0];
    const isStartOfBatch = (tenDot !== "");
    
    if (isStartOfBatch) {
      if (currentBatch) {
        batches.push(currentBatch);
      }
      currentBatch = {
        startRow: rowNum,
        tenDot: tenDot,
        rows: [],
        isCompleted: false
      };
    }
    
    if (currentBatch) {
      currentBatch.rows.push({
        rowNum: rowNum,
        values: data[i]
      });
      // Nếu đợt đã được hoàn thành thanh toán (Tổng tiền H và Thực nhận I có giá trị)
      if (data[i][7] !== "" && data[i][8] !== "") {
        currentBatch.isCompleted = true;
      }
    }
  }
  if (currentBatch) {
    batches.push(currentBatch);
  }
  
  // 2. Lọc ra các đợt đã hoàn tất thanh toán và có thời gian hoàn tất trên 30 ngày
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const batchesToArchive = batches.filter(b => {
    if (!b.isCompleted) return false;
    const lastRowTimeStr = b.rows[b.rows.length - 1].values[1];
    try {
      // Định dạng ngày "dd/MM/yyyy HH:mm:ss" -> bóc tách để so sánh
      const parts = lastRowTimeStr.split(' ');
      const dateParts = parts[0].split('/');
      const batchDate = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
      return batchDate < thirtyDaysAgo;
    } catch (e) {
      return false;
    }
  });
  
  if (batchesToArchive.length === 0) return;
  
  // 3. Chuẩn bị / Tự động tạo Sheet Lịch sử lưu trữ cho năm hiện tại
  const currentYear = now.getFullYear();
  const archiveSheetName = "Lịch sử " + currentYear;
  let archiveSheet = ss.getSheetByName(archiveSheetName);
  
  if (!archiveSheet) {
    archiveSheet = ss.insertSheet(archiveSheetName);
    // Ghi tiêu đề cho sheet lưu trữ mới
    archiveSheet.appendRow(["Đợt xuất", "Thời gian", "Lần cân", "Số ký (kg)", "Tích lũy (kg)", "Số sọt", "Đơn giá", "Tổng tiền", "Thực nhận"]);
    archiveSheet.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#f1f5f9");
  }
  
  // Sắp xếp các đợt cần xóa theo dòng từ dưới lên trên để không làm lệch chỉ số dòng trong khi xóa
  batchesToArchive.sort((a, b) => b.startRow - a.startRow);
  
  const props = PropertiesService.getDocumentProperties();
  
  for (const batch of batchesToArchive) {
    const numRows = batch.rows.length;
    const startRow = batch.startRow;
    
    // Đọc toàn bộ nội dung của đợt cần di dời
    const range = sourceSheet.getRange(startRow, 1, numRows, 9);
    const values = range.getValues();
    
    // Cắt và ghi đè sang Sheet Lịch sử
    const lastRowArchive = archiveSheet.getLastRow();
    archiveSheet.getRange(lastRowArchive + 1, 1, numRows, 9).setValues(values);
    archiveSheet.appendRow(["", "", "", "", "", "", "", "", ""]); // Cách 1 dòng trống cho dễ nhìn
    
    // Xóa đợt cũ khỏi trang tính làm việc chính để duy trì độ nhẹ
    sourceSheet.deleteRows(startRow, numRows);
    
    // Nếu dòng trống bên dưới đợt đó vẫn trống, xóa nốt để làm sạch bảng
    if (startRow <= sourceSheet.getLastRow()) {
      const checkVal = sourceSheet.getRange(startRow, 1).getValue();
      if (checkVal === "") {
        sourceSheet.deleteRow(startRow);
      }
    }
  }
  
  // Reset cache vết dòng để ép hệ thống tìm dòng mới chính xác
  props.deleteProperty('lastBatchStartRow');
}