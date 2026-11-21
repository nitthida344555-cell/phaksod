/**
 * ============================================================================
 * ລະບົບສຳຮອງ & ເຊື່ອມຕໍ່ Google Drive & Google Sheets
 * ສຳລັບ "ຮ້ານຂາຍຜັກສົດ (Fresh Vegetable POS)"
 * ============================================================================
 * ຄຸນສົມບັດ:
 * 1. ອັບເດດຂໍ້ມູນລົງ Google Sheets ອັດຕະໂນມັດ 5 ໜ້າ (ໃບບິນ, ສິນຄ້າ, ອຸປະກອນ, ລາຍຈ່າຍ, ແຜນຊື້)
 * 2. ສຳຮອງຂໍ້ມູນທັງໝົດເປັນໄຟລ໌ JSON ເກັບໄວ້ໃນ Google Drive ໂຟນເດີ "ຮ້ານດອນຫຼວງ_Backup_GoogleDrive"
 * 3. ເກັບປະຫວັດການສຳຮອງຕາມວັນທີ-ເວລາ ແລະ ໄຟລ໌ລ່າສຸດ Donluang_Backup_Latest.json
 * 4. ສາມາດດຶງຂໍ້ມູນລ່າສຸດຈາກ Cloud ກັບຄືນສູ່ແອັບໄດ້ທຸກເວລາ
 * 
 * ວິທີຕິດຕັ້ງ:
 * 1. ເປີດ Google Drive (drive.google.com) ແລ້ວສ້າງ Google Sheets ໃໝ່ (ຕັ້ງຊື່: ບັນຊີຮ້ານດອນຫຼວງໂຟໂຕ້)
 * 2. ກົດເມນູ Extensions (ສ່ວນຂະຫຍາຍ) -> Apps Script
 * 3. ລຶບໂຄ້ດເກົ່າອອກທັງໝົດ ແລ້ວ Copy ໂຄ້ດທັງໝົດໃນໄຟລ໌ນີ້ໄປວາງໃສ່ -> ກົດ Save (💾)
 * 4. ກົດປຸ່ມສີຟ້າ "Deploy" (ເຜີຍແຜ່) -> "New deployment" (ການເຜີຍແຜ່ໃໝ່)
 * 5. ກົດຮູບຟັນເຟືອງ ⚙️ ເລືອກປະເພດເປັນ "Web app" (ເວັບແອັບ):
 *    - Execute as: ເລືອກ "Me" (ຕົວຂ້ອຍເອງ)
 *    - Who has access: ເລືອກ "Anyone" (ທຸກຄົນ)
 * 6. ກົດ Deploy -> ກົດ Authorize access (ອະນຸຍາດສິດ Drive & Sheets) -> ກ໊ອບປີ້ "Web app URL"
 * 7. ນຳເອົາ Web app URL ມາວາງໃສ່ປຸ່ມ "☁️" ຢູ່ໃນເວັບແອັບໜ້າຮ້ານ!
 */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var driveRes = null;

    if (payload.state) {
      // 1. ອັບເດດຂໍ້ມູນລົງ Google Sheets ທັງ 5 ຕາຕະລາງ
      syncBillsSheet(ss, payload.state.bills || []);
      syncProductsSheet(ss, payload.state.products || []);
      syncMachinesSheet(ss, payload.state.machines || []);
      syncExpensesSheet(ss, payload.state.expenses || []);
      syncPurchasePlanSheet(ss, payload.state.purchasePlan || []);

      // 2. ບັນທຶກລົງ Google Drive ໃນໂຟນເດີ "ຮ້ານດອນຫຼວງ_Backup_GoogleDrive"
      driveRes = saveBackupToGoogleDrive(payload.state);

      // 3. ບັນທຶກ JSON Backup ໄວ້ໃນ Sheet ສຳລັບດຶງຂໍ້ມູນກັບຄືນເຂົ້າແອັບໄວຂຶ້ນ (ແບ່ງເປັນ Chunks 45,000 ຕົວອັກສອນ ເພື່ອບໍ່ໃຫ້ເກີນຂີດຈຳກັດ 50,000 ຕົວອັກສອນຂອງ Google Sheets)
      try {
        var metaSheet = getOrCreateSheet(ss, 'System_Backup');
        metaSheet.clear();
        metaSheet.getRange(1, 1).setValue('Updated_At');
        metaSheet.getRange(1, 2).setValue(new Date().toISOString());
        metaSheet.getRange(2, 1).setValue('Drive_Folder');
        metaSheet.getRange(2, 2).setValue(driveRes && driveRes.folderUrl ? driveRes.folderUrl : '');
        metaSheet.getRange(3, 1).setValue('JSON_State');

        var fullJson = JSON.stringify(payload.state);
        var chunkSize = 45000;
        var colIndex = 2;
        for (var offset = 0; offset < fullJson.length; offset += chunkSize) {
          metaSheet.getRange(3, colIndex).setValue(fullJson.substring(offset, offset + chunkSize));
          colIndex++;
        }
      } catch (sheetErr) {
        Logger.log("System_Backup sheet write warning: " + sheetErr);
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        message: 'ບັນທຶກລົງ Google Sheet ແລະ Google Drive ສຳເລັດຮຽບຮ້ອຍ!',
        drive: driveRes
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var metaSheet = ss.getSheetByName('System_Backup');
    var folderUrl = "";
    var updatedAt = "";
    var latestDriveState = null;

    if (metaSheet) {
      try {
        updatedAt = metaSheet.getRange(1, 2).getValue() || "";
        folderUrl = metaSheet.getRange(2, 2).getValue() || "";
      } catch (eMeta) {}
    }

    // 1. ດຶງຂໍ້ມູນພື້ນຖານ (Master Data) ຈາກໄຟລ໌ Donluang_Backup_Latest.json ໃນ Google Drive ກ່ອນສະເໝີ
    try {
      var folders = DriveApp.getFoldersByName("ຮ້ານດອນຫຼວງ_Backup_GoogleDrive");
      if (folders.hasNext()) {
        var folder = folders.next();
        folderUrl = folder.getUrl();
        var latestFiles = folder.getFilesByName("Donluang_Backup_Latest.json");
        if (latestFiles.hasNext()) {
          var latestFile = latestFiles.next();
          var driveJsonStr = latestFile.getBlob().getDataAsString("UTF-8");
          if (driveJsonStr) {
            latestDriveState = JSON.parse(driveJsonStr);
            if (!updatedAt) {
              updatedAt = latestFile.getLastUpdated().toISOString();
            }
          }
        }
      }
    } catch(err) {
      Logger.log("Drive read warning: " + err);
    }

    if (latestDriveState) {
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: true,
          state: latestDriveState,
          updatedAt: updatedAt,
          driveFolderUrl: folderUrl
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. ຖ້າບໍ່ພົບໃນໄຟລ໌ Drive ໃຫ້ດຶງຈາກ System_Backup ໃນ Google Sheet (ຮອງຮັບທັງແບບຊ່ອງດຽວ ແລະ ແບບແບ່ງ Chunks)
    if (metaSheet) {
      var lastCol = Math.max(2, metaSheet.getLastColumn());
      var rowValues = metaSheet.getRange(3, 2, 1, lastCol - 1).getValues()[0];
      var jsonStr = rowValues.join('');
      if (jsonStr && jsonStr.indexOf('{') === 0) {
        return ContentService
          .createTextOutput(JSON.stringify({
            ok: true,
            state: JSON.parse(jsonStr),
            updatedAt: updatedAt,
            driveFolderUrl: folderUrl
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, message: 'ຍັງບໍ່ມີຂໍ້ມູນໃນ Google Drive / Google Sheet', driveFolderUrl: folderUrl }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ບັນທຶກໄຟລ໌ສຳຮອງ JSON ເຂົ້າໃນ Google Drive
 */
function saveBackupToGoogleDrive(state) {
  try {
    var folderName = "ຮ້ານດອນຫຼວງ_Backup_GoogleDrive";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder;
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
      folder.setDescription("ໂຟນເດີເກັບກຳ ແລະ ສຳຮອງຂໍ້ມູນທັງໝົດຂອງລະບົບ ຮ້ານຂາຍຜັກສົດ");
    }

    var timeZone = Session.getScriptTimeZone() || "Asia/Vientiane";
    var dateFormatted = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd_HH-mm-ss");
    var fileName = "Donluang_Backup_" + dateFormatted + ".json";
    var jsonContent = JSON.stringify(state, null, 2);

    // 1. ອັບເດດ ຫຼື ສ້າງໄຟລ໌ Snapshot ລ່າສຸດ Donluang_Backup_Latest.json
    var latestFiles = folder.getFilesByName("Donluang_Backup_Latest.json");
    if (latestFiles.hasNext()) {
      latestFiles.next().setContent(jsonContent);
    } else {
      folder.createFile("Donluang_Backup_Latest.json", jsonContent, MimeType.PLAIN_TEXT);
    }

    // 2. ສ້າງໄຟລ໌ປະຫວັດຕາມເວລາ
    folder.createFile(fileName, jsonContent, MimeType.PLAIN_TEXT);

    // 3. ຮັກສາໄຟລ໌ເກົ່າບໍ່ໃຫ້ເກີນ 60 ໄຟລ໌
    pruneOldDriveBackups(folder, 60);

    return {
      success: true,
      folderName: folderName,
      folderUrl: folder.getUrl(),
      fileName: fileName,
      updatedAt: dateFormatted
    };
  } catch(err) {
    Logger.log("Google Drive backup error: " + err);
    return { success: false, error: err.toString() };
  }
}

function pruneOldDriveBackups(folder, maxKeep) {
  try {
    var files = folder.getFiles();
    var fileList = [];
    while (files.hasNext()) {
      var f = files.next();
      if (f.getName().indexOf("Donluang_Backup_2") === 0) {
        fileList.push({ file: f, date: f.getDateCreated().getTime() });
      }
    }
    if (fileList.length > maxKeep) {
      fileList.sort(function(a, b) { return a.date - b.date; });
      var toRemove = fileList.length - maxKeep;
      for (var i = 0; i < toRemove; i++) {
        fileList[i].file.setTrashed(true);
      }
    }
  } catch(e) {
    Logger.log("Prune error: " + e);
  }
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function syncBillsSheet(ss, bills) {
  var sheet = getOrCreateSheet(ss, '1_ໃບບິນຂາຍ');
  sheet.clear();
  var headers = ['ເລກບິນ', 'ວັນທີ-ເວລາ', 'ຊື່ລູກຄ້າ/ຫ້ອງການ', 'ເບີໂທ', 'ລາຍການສິນຄ້າ', 'ຍອດລວມ', 'ສ່ວນຫຼຸດ', 'ຍອດສຸດທິ (ກີບ)', 'ວິທີຊຳລະ', 'ສະຖານະ'];
  var rows = [headers];
  for (var i = 0; i < bills.length; i++) {
    var b = bills[i];
    var itemsText = (b.items || []).map(function(it) { return it.name + ' x' + it.qty; }).join(', ');
    rows.push([
      b.id,
      b.date,
      b.customer,
      b.phone,
      itemsText,
      b.subtotal,
      b.discount,
      b.total,
      b.paymentMethod,
      b.status === 'paid' ? 'ຊຳລະແລ້ວ' : 'ຕິດໜີ້'
    ]);
  }
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#dbeafe');
}

function syncProductsSheet(ss, products) {
  var sheet = getOrCreateSheet(ss, '2_ບັນຊີສິນຄ້າ');
  sheet.clear();
  var headers = ['ລະຫັດ', 'ຊື່ສິນຄ້າ/ບໍລິການ', 'ໝວດໝູ່', 'ຕົ້ນທຶນ (ກີບ)', 'ລາຄາຂາຍ (ກີບ)', 'ກຳໄລ/ໜ່ວຍ', 'ຫົວໜ່ວຍ', 'ສະຕັອກຄົງເຫຼືອ', 'ລາຄາຂາຍສົ່ງ (ຂັ້ນລາຄາ)'];
  var rows = [headers];
  var totCost = 0;
  var totPrice = 0;
  var totProfit = 0;
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    var cost = Number(p.cost || 0);
    var price = Number(p.price || 0);
    var profit = price - cost;
    totCost += cost;
    totPrice += price;
    totProfit += profit;
    var tieredNote = '';
    if (p.hasTieredPricing && Array.isArray(p.priceTiers) && p.priceTiers.length > 0) {
      tieredNote = p.priceTiers.map(function(t) { return '≥' + t.minQty + ': ' + Number(t.price).toLocaleString(); }).join(' | ');
    }
    rows.push([
      p.code,
      p.name,
      p.category,
      cost,
      price,
      profit,
      p.unit,
      p.trackStock ? p.stock : 'ບໍລິການ',
      tieredNote
    ]);
  }
  rows.push(['', 'ລວມມູນຄ່າທັງໝົດ', '', totCost, totPrice, totProfit, '', '', '']);
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#dcfce7');
  sheet.getRange(rows.length, 1, 1, headers.length).setFontWeight('bold').setBackground('#ffedd5');
}

function syncMachinesSheet(ss, machines) {
  var sheet = getOrCreateSheet(ss, '3_ບັນຊີອຸປະກອນ');
  sheet.clear();
  var headers = ['ລະຫັດ', 'ຊື່ອຸປະກອນ/ເຄື່ອງຈັກ', 'ຈຳນວນ', 'ຫົວໜ່ວຍ', 'ລາຄາຕໍ່ໜ່ວຍ (ກີບ)', 'ລວມມູນຄ່າ (ກີບ)', 'ບັນທຶກການກວດເຊັກ', 'ສະຖານະ'];
  var rows = [headers];
  var grandTotal = 0;
  var grandQty = 0;
  for (var i = 0; i < machines.length; i++) {
    var m = machines[i];
    var qty = Number(m.qty) || 1;
    var price = Number(m.price || 0);
    var unit = m.unit || 'ເຄື່ອງ';
    var lineTotal = price * qty;
    grandQty += qty;
    grandTotal += lineTotal;
    rows.push([
      m.id,
      m.name,
      qty,
      unit,
      price,
      lineTotal,
      m.note,
      m.status
    ]);
  }
  rows.push(['', 'ລວມທັງໝົດ', grandQty, 'ເຄື່ອງ', '', grandTotal, '', '']);
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#fef3c7');
  sheet.getRange(rows.length, 1, 1, headers.length).setFontWeight('bold').setBackground('#ffedd5');
}

function syncExpensesSheet(ss, expenses) {
  var sheet = getOrCreateSheet(ss, '4_ບັນຊີລາຍຈ່າຍ');
  sheet.clear();
  var headers = ['ລະຫັດ', 'ວັນທີຈ່າຍ', 'ໝວດລາຍຈ່າຍ', 'ລາຍລະອຽດ', 'ຈຳນວນເງິນ (ກີບ)', 'ວິທີຊຳລະ', 'ສະຖານະ', 'ຜູ້ຮັບເງິນ/ໝາຍເຫດ'];
  var rows = [headers];
  for (var i = 0; i < expenses.length; i++) {
    var ex = expenses[i];
    rows.push([
      ex.id,
      ex.date,
      ex.category,
      ex.title,
      ex.amount,
      ex.paymentMethod || 'cash',
      ex.status === 'unpaid' ? 'ຄ້າງຈ່າຍ' : 'ຈ່າຍແລ້ວ',
      ex.note
    ]);
  }
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#fce7f3');
}

function syncPurchasePlanSheet(ss, purchasePlan) {
  var sheet = getOrCreateSheet(ss, '5_ແຜນຊື້ສິນຄ້າ');
  sheet.clear();
  var headers = ['ເລກລຳດັບ', 'ຊື່ລາຍການ', 'ລາຄາຕໍ່ໜ່ວຍ (ກີບ)', 'ຈຳນວນ', 'ລາຄາລວມ (ກີບ)', 'ສະຖານະ'];
  var rows = [headers];
  var grandTotal = 0;
  for (var i = 0; i < purchasePlan.length; i++) {
    var item = purchasePlan[i];
    var lineTotal = Number(item.price || 0) * Number(item.qty || 0);
    grandTotal += lineTotal;
    rows.push([
      i + 1,
      item.name,
      item.price,
      item.qty,
      lineTotal,
      item.purchased ? 'ຊື້ແລ້ວ' : 'ຍັງບໍ່ຊື້'
    ]);
  }
  rows.push(['', 'ສະຫຼຸບລວມທັງໝົດ', '', '', grandTotal, '']);
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#fef3c7');
}
