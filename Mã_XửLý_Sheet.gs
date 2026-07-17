/* File: Mã_XửLý_Sheet.gs */

/**
 * ===================================================================
 * HỆ THỐNG XÁC THỰC BẰNG TÀI KHOẢN (LẤY TỪ SHEET "Account") (GIAI ĐOẠN 2)
 * ===================================================================
 */

function verifyLogin(username, password) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Account');
    
    if (!sheet) {
      return { success: false, message: "Lỗi hệ thống: Không tìm thấy sheet 'Account'" };
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
       return { success: false, message: "Hệ thống chưa có tài khoản nào được đăng ký!" };
    }
    
    const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); 
    
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
      return { success: true, token: password }; 
    } else {
      return { success: false, message: "Tài khoản hoặc mật khẩu không đúng!" };
    }
    
  } catch(e) {
    return { success: false, message: "Lỗi server: " + e.message };
  }
}

function verifyAuthToken(auth) {
  if (!auth || !auth.token) {
    throw new Error("AUTH_FAILED");
  }
  
  const tokenToVerify = auth.token;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Account');
  if (!sheet) throw new Error("AUTH_FAILED");
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("AUTH_FAILED");
  
  const passData = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  
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

/**
 * ===================================================================
 * CÁC HÀM XỬ LÝ CHÍNH CỦA DỰ ÁN
 * ===================================================================
 */

function parseSafeNumber(val) {
  if (val === "" || val === null || val === undefined) return 0;
  let strVal = val.toString().replace(/,/g, '.').replace(/[^0-9.-]/g, '');
  let num = parseFloat(strVal);
  return isNaN(num) ? 0 : num;
}

function acquireLockSafe(lock) {
  try {
    lock.waitLock(30000);
  } catch (e) {
    throw new Error("Hệ thống đang bận xử lý dữ liệu của người khác, vui lòng thử lại sau vài giây!");
  }
}

function addFirstData(auth, tenDot, donGiaStr, soKyStr, soSotStr) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    verifyAuthToken(auth);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    if (!sheet) throw new Error("Không tìm thấy trang tính 'Xuất vịt'");

    const soKy = parseSafeNumber(soKyStr);
    const donGia = parseSafeNumber(donGiaStr);
    const soSot = parseInt(soSotStr) || 2;

    if (soKy <= 0) throw new Error("Số ký nhập vào không hợp lệ");

    let lastRow = sheet.getLastRow();
    let newRow = lastRow > 1 ? lastRow + 2 : 2;
    const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");

    sheet.getRange(newRow, 1, 1, 9).setValues([[tenDot, now, 1, soKy, soKy, soSot, donGia, "", ""]]);
    PropertiesService.getDocumentProperties().setProperty('lastBatchStartRow', newRow.toString());
    SpreadsheetApp.flush();

    return getBatchData(auth, newRow);
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

function addNextData(auth, startRow, soKyStr, soSotStr) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    verifyAuthToken(auth);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    if (!sheet) throw new Error("Không tìm thấy trang tính 'Xuất vịt'");
    
    const soKy = parseSafeNumber(soKyStr);
    const soSot = parseInt(soSotStr) || 2;
    if (soKy <= 0) throw new Error("Số ký nhập vào không hợp lệ");
    
    const lastRow = sheet.getLastRow();
    const numRowsToRead = Math.min(lastRow - startRow + 1, 1000);
    const range = sheet.getRange(startRow, 3, numRowsToRead, 4);
    const values = range.getValues();
    
    let lastLanCan = 0; let lastTichLuy = 0; let totalSotCount = 0; let rowCount = 0;
    
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
    
    return {
      isPartial: true,
      summary: { totalKg: Number(tichLuy.toFixed(2)), totalSot: newTotalSot, lanCan: lanCan, actualKg: Number((tichLuy - (newTotalSot * 5)).toFixed(2)) },
      newRow: { rowNum: targetRow, lanCan: lanCan, soSot: soSot, soKy: soKy, tichLuy: tichLuy, timestamp: now }
    };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

// TÍCH HỢP HỖ TRỢ CHUNKING (GIAI ĐOẠN 3)
function syncOfflineData(auth, startRow, tenDot, donGia, offlineRows, offlineCheckout) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    verifyAuthToken(auth);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    
    // Nếu chưa có StartRow (Khởi tạo đợt từ Offline)
    if (!startRow && offlineRows.length > 0) {
      const soKy = parseSafeNumber(offlineRows[0].soKy);
      const soSot = parseInt(offlineRows[0].soSot) || 2;
      let lastRow = sheet.getLastRow();
      startRow = lastRow > 1 ? lastRow + 2 : 2;
      const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
      sheet.getRange(startRow, 1, 1, 9).setValues([[tenDot, now, 1, soKy, soKy, soSot, donGia, "", ""]]);
      PropertiesService.getDocumentProperties().setProperty('lastBatchStartRow', startRow.toString());
      offlineRows.shift(); 
    }
    
    // Viết các phần tử còn lại trong Chunk
    if (offlineRows.length > 0) {
      const lastRow = sheet.getLastRow();
      const numRowsToRead = Math.min(lastRow - startRow + 1, 1000);
      const values = sheet.getRange(startRow, 3, numRowsToRead, 4).getValues();
      
      let lastLanCan = 0; let lastTichLuy = 0; let rowCount = 0;
      for (let i = 0; i < values.length; i++) {
        if (values[i][0] === "") break;
        lastLanCan = Number(values[i][0]);
        lastTichLuy = Number(values[i][2]);
        rowCount++;
      }
      
      let writeData = [];
      for (let i = 0; i < offlineRows.length; i++) {
        const item = offlineRows[i];
        const soKy = parseSafeNumber(item.soKy);
        const soSot = parseInt(item.soSot) || 2;
        lastLanCan++;
        lastTichLuy += soKy;
        writeData.push([item.timestamp || Utilities.formatDate(new Date(), "GMT+7", "HH:mm:ss"), lastLanCan, soKy, lastTichLuy, soSot]);
      }
      
      if(writeData.length > 0) {
        sheet.getRange(startRow + rowCount, 2, writeData.length, 5).setValues(writeData);
      }
    }
    
    // Kết toán đợt ở chunk cuối
    if (offlineCheckout) {
      checkoutBatch(auth, startRow, offlineCheckout.tongTien, offlineCheckout.thucNhan);
    }
    
    SpreadsheetApp.flush();
    return startRow ? getBatchData(auth, startRow) : null;
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

function editData(auth, rowToEdit, newSoKyStr, newSoSotStr, startRow) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    verifyAuthToken(auth);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    const newSoKy = parseSafeNumber(newSoKyStr);
    const newSoSot = parseInt(newSoSotStr);
    
    sheet.getRange(rowToEdit, 4).setValue(newSoKy);
    if (!isNaN(newSoSot)) sheet.getRange(rowToEdit, 6).setValue(newSoSot);
    
    const now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
    sheet.getRange(rowToEdit, 2).setValue(now);
    
    const numRowsToRead = Math.min(sheet.getLastRow() - startRow + 1, 1000);
    const range = sheet.getRange(startRow, 3, numRowsToRead, 3);
    const values = range.getValues();
    
    let currentTichLuy = 0; let updates = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === "") break;
      let weight = (startRow + i === rowToEdit) ? newSoKy : Number(values[i][1]);
      currentTichLuy += weight;
      updates.push([currentTichLuy]);
    }
    sheet.getRange(startRow, 5, updates.length, 1).setValues(updates);
    SpreadsheetApp.flush();
    
    return getBatchData(auth, startRow);
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

function updatePrice(auth, startRow, newDonGiaStr) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    verifyAuthToken(auth);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    sheet.getRange(startRow, 7).setValue(parseSafeNumber(newDonGiaStr));
    SpreadsheetApp.flush();
    return true;
  } catch(e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

// TÍNH TOÁN KÉP HYBRID SYNC (GIAI ĐOẠN 2)
function checkoutBatch(auth, startRow, tongTienFrontend, thucNhan) {
  const lock = LockService.getScriptLock();
  acquireLockSafe(lock);
  try {
    verifyAuthToken(auth);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    if (!sheet) throw new Error("Không tìm thấy trang tính 'Xuất vịt'");
    
    const lastRow = sheet.getLastRow();
    const numRowsToRead = Math.min(lastRow - startRow + 1, 1000);
    const dataRange = sheet.getRange(startRow, 5, numRowsToRead, 3);
    const values = dataRange.getValues();
    
    let totalSot = 0;
    let finalTichLuy = 0;
    let donGia = Number(values[0][2]) || 0;
    
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === "") break;
      finalTichLuy = Number(values[i][0]) || 0;
      totalSot += Number(values[i][1]) || 0;
    }
    
    const kyThucTe = finalTichLuy - (totalSot * 5);
    let tongTienBackend = Math.round(kyThucTe * donGia);
    
    sheet.getRange(startRow, 8).setValue(tongTienBackend);
    sheet.getRange(startRow, 9).setValue(parseSafeNumber(thucNhan));

    SpreadsheetApp.flush();
    return true;
  } catch(e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

function getBatchData(auth, startRow) {
  try {
    verifyAuthToken(auth); 
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
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
    throw new Error(e.message); 
  }
}

function getLastBatchStartRow(auth) {
  try {
    verifyAuthToken(auth);
    const props = PropertiesService.getDocumentProperties();
    let cachedRow = props.getProperty('lastBatchStartRow');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Xuất vịt');
    if (!sheet) return null;
    
    if (cachedRow) {
      let rowNum = parseInt(cachedRow, 10);
      if (rowNum <= sheet.getLastRow() && sheet.getRange(rowNum, 1).getValue() !== "") {
        return rowNum; 
      }
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i][0] !== "") {
        return i + 2;
      }
    }
    return null;
  } catch (e) {
    throw new Error(e.message);
  }
}

// DYNAMIC ARCHIVING THEO THÁNG (GIAI ĐOẠN 3)
function autoArchiveOldBatches() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; 
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSheet = ss.getSheetByName('Xuất vịt');
    const lastRow = sourceSheet.getLastRow();
    if (lastRow < 2) return;

    const data = sourceSheet.getRange(2, 1, lastRow - 1, 9).getValues();
    let batches = [];
    let currentBatch = [];

    for (let i = 0; i < data.length; i++) {
      if (data[i][0] !== "" && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
      }
      currentBatch.push(data[i]);
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    const maxKeepBatches = 15; 
    if (batches.length <= maxKeepBatches) return;

    const batchesToKeep = batches.slice(-maxKeepBatches);
    const batchesToArchive = batches.slice(0, batches.length - maxKeepBatches);

    let archiveGroups = {};
    for (let b of batchesToArchive) {
      const timeStr = b[0][1]; 
      let monthYear = "Lịch sử Cũ";
      
      if (timeStr && timeStr.toString().includes('/')) {
        const parts = timeStr.toString().split('/');
        if (parts.length >= 3) {
          const month = parts[1].padStart(2, '0');
          const year = parts[2].split(' ')[0];
          monthYear = `Tháng ${month} - ${year}`;
        }
      }
      
      if (!archiveGroups[monthYear]) archiveGroups[monthYear] = [];
      archiveGroups[monthYear].push(b);
    }

    for (let sheetName in archiveGroups) {
      let targetSheet = ss.getSheetByName(sheetName);
      if (!targetSheet) {
        targetSheet = ss.insertSheet(sheetName);
        targetSheet.appendRow(["Đợt xuất", "Thời gian", "Lần cân", "Số ký (kg)", "Tích lũy (kg)", "Số sọt", "Đơn giá", "Tổng tiền", "Thực nhận"]);
        targetSheet.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#f1f5f9");
      }
      
      let rowsToWrite = [];
      for (let b of archiveGroups[sheetName]) {
        rowsToWrite = rowsToWrite.concat(b);
        rowsToWrite.push(["", "", "", "", "", "", "", "", ""]); 
      }
      
      const targetLastRow = targetSheet.getLastRow();
      targetSheet.getRange(targetLastRow + 1, 1, rowsToWrite.length, 9).setValues(rowsToWrite);
    }

    sourceSheet.getRange(2, 1, lastRow, 9).clearContent();
    let keptRows = [];
    for (let b of batchesToKeep) {
      keptRows = keptRows.concat(b);
    }
    if (keptRows.length > 0) {
      sourceSheet.getRange(2, 1, keptRows.length, 9).setValues(keptRows);
    }
    
  } catch(e) {
    console.error("Lỗi Archive RAM:", e.message);
  } finally {
    lock.releaseLock();
  }
}
