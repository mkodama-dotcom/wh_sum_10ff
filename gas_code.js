// ============================================================
// 勤務時間集計ダッシュボード – Google Apps Script
// スプレッドシート: https://docs.google.com/spreadsheets/d/1y2EURUMGgWInslDeFcnFzIa_Zrg575YOF40otz5c6YI
// ============================================================

var SPREADSHEET_ID = '1y2EURUMGgWInslDeFcnFzIa_Zrg575YOF40otz5c6YI';
var EXCLUDE_ROLES  = ['研修_社内', '研修_社外', '非整理対象'];
var DELIVERY_ROLES = ['配送・栽培', '配送・出荷'];

// ── エントリーポイント ─────────────────────────────────────

function doGet(e) {
  try {
    var params = e && e.parameter ? e.parameter : {};
    var requestMonth = params.month || '';
    var debugMode = params.debug === '1';

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // シート名を実際の名前で取得（存在確認用）
    var allSheetNames = ss.getSheets().map(function(s) { return s.getName(); });
    var ws1 = ss.getSheetByName('シート1');
    var ws2 = ss.getSheetByName('シート2');
    var ws4 = ss.getSheetByName('シート4');

    // デバッグモード: シート名と先頭行の生データを返す
    if (debugMode) {
      var debug = { sheetNames: allSheetNames };
      if (ws1) {
        var raw = ws1.getDataRange().getValues();
        debug.sheet1_rows_total = raw.length;
        debug.sheet1_row1 = raw[0] ? raw[0].map(function(v) { return String(v).slice(0,30); }) : [];
        debug.sheet1_row2 = raw[1] ? raw[1].map(function(v) { return String(v).slice(0,30); }) : [];
        debug.sheet1_row3 = raw[2] ? raw[2].map(function(v) { return String(v).slice(0,30); }) : [];
        debug.sheet1_row4 = raw[3] ? raw[3].map(function(v) { return String(v).slice(0,30); }) : [];
        debug.sheet1_row5 = raw[4] ? raw[4].map(function(v) { return String(v).slice(0,30); }) : [];
        // 2行目の各セル型と値（年月検索用）
        debug.sheet1_row2_types = raw[1] ? raw[1].map(function(v) {
          return { type: typeof v, val: String(v).slice(0,30), isDate: v instanceof Date };
        }) : [];
      }
      return ContentService.createTextOutput(JSON.stringify(debug)).setMimeType(ContentService.MimeType.JSON);
    }

    if (!ws1) throw new Error('シート1が見つかりません。シート名一覧: ' + allSheetNames.join(', '));

    var s1 = ws1.getDataRange().getValues();
    var s2 = ws2 ? ws2.getDataRange().getValues() : [];
    var s4 = ws4 ? ws4.getDataRange().getValues() : [];

    var yearMonthCols = getYearMonthCols(s1);

    var targetMonth = requestMonth;
    if (!targetMonth && yearMonthCols.length > 0) {
      var sorted = yearMonthCols.slice().sort(function(a, b) {
        return a.yearMonth < b.yearMonth ? 1 : -1;
      });
      targetMonth = sorted[0].yearMonth;
    }

    var targetCol = -1;
    for (var i = 0; i < yearMonthCols.length; i++) {
      if (yearMonthCols[i].yearMonth === targetMonth) {
        targetCol = yearMonthCols[i].col;
        break;
      }
    }
    var sheet1Records = parseSheet1(s1, targetCol);
    var sheet2Records = parseSheet2(s2, targetMonth);

    var aggregated = aggregateData(sheet1Records, sheet2Records, targetMonth);
    var siteBlocks = buildSiteBlocks(aggregated);
    var sheet4Data = parseSheet4(s4, targetMonth);

    var result = {
      targetMonth: targetMonth,
      availableMonths: yearMonthCols.map(function(x) { return x.yearMonth; }).sort().reverse(),
      siteBlocks: siteBlocks,
      sheet4: sheet4Data,
      _debug: {
        sheet1Records: sheet1Records.length,
        sheet2Records: sheet2Records.length,
        yearMonthCols: yearMonthCols,
        targetCol: targetCol
      }
    };

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── シート1 パース ────────────────────────────────────────

function getYearMonthCols(data) {
  // 2行目（index 1）の K列（index 10）から3列おきに年月を取得
  var headerRow = data[1] || [];
  var result = [];
  for (var c = 10; c < headerRow.length; c += 3) {
    var ym = parseYearMonth(headerRow[c]);
    if (ym) result.push({ col: c, yearMonth: ym });
  }
  return result;
}

function parseSheet1(data, targetCol) {
  var records = [];
  // 4行目（index 3）からデータ開始（1:タイトル, 2:年月, 3:ヘッダー）
  for (var r = 3; r < data.length; r++) {
    var row = data[r];
    // A列（index 0）= flag（値が数値の1のみ対象）
    if (Number(row[0]) !== 1) continue;

    var employeeType = String(row[1] || '').trim();  // B = 雇用区分
    var site         = String(row[2] || '').trim();  // C = 拠点
    var prj          = String(row[3] || '').trim();  // D = PRJ
    var role         = String(row[4] || '').trim();  // E = 担当
    var gVal         = String(row[5] || '').trim();  // F = 社員番号
    var hVal         = String(row[6] || '').trim();  // G = 名前
    var employeeId   = (gVal && gVal !== '0') ? 'id:' + gVal : (hVal ? 'name:' + hVal : '');

    if (!site || !role) continue;
    if (EXCLUDE_ROLES.indexOf(role) >= 0) continue;

    var workHours = 0;
    if (targetCol >= 0 && targetCol < row.length) {
      workHours = parseWorkHours(row[targetCol]);
    }
    if (workHours === 0) continue;

    records.push({ employeeType: employeeType, site: site, prj: prj, role: role,
                   employeeId: employeeId, workHours: workHours });
  }
  return records;
}

// ── シート2 パース ────────────────────────────────────────

function parseSheet2(data, targetYearMonth) {
  var records = [];
  // 4行目（index 3）からデータ開始（シート1と同じ構造を想定）
  for (var r = 3; r < data.length; r++) {
    var row = data[r];
    if (Number(row[0]) !== 1) continue;   // A列（index 0）= flag

    // H列（index 7）の計上年月フィルター（シート1と同列ずれを反映）
    var rowYM = parseYearMonth(row[7]);
    if (rowYM !== targetYearMonth) continue;

    var employeeType = String(row[1] || '').trim();  // B = 雇用区分
    var site         = String(row[2] || '').trim();  // C = 拠点
    var prj          = String(row[3] || '').trim();  // D = PRJ
    var role         = String(row[4] || '').trim();  // E = 担当
    var adjustHours  = parseWorkHours(row[8]);       // I列（index 8）= 増減時間

    if (!site) continue;
    records.push({ employeeType: employeeType, site: site, prj: prj, role: role,
                   adjustHours: adjustHours });
  }
  return records;
}

// ── シート4 パース ────────────────────────────────────────

function parseSheet4(data, targetYearMonth) {
  if (!data || data.length < 2) return null;

  // 1行目（index 0）に年月が並ぶ。対象月の列を探す
  var headerRow = data[0];
  var targetCol = -1;
  for (var c = 1; c < headerRow.length; c++) {
    if (parseYearMonth(headerRow[c]) === targetYearMonth) {
      targetCol = c;
      break;
    }
  }

  // 拠点（A列）× 項目（B列）→ 対象月の値 を返す
  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var site  = String(row[0] || '').trim();
    var item  = String(row[1] || '').trim();
    var value = targetCol >= 0 ? row[targetCol] : null;
    if (!site && !item) continue;
    rows.push({ site: site, item: item, value: value });
  }
  return { targetCol: targetCol, rows: rows };
}

// ── 集計ロジック ──────────────────────────────────────────

function mapEmployeeCategory(raw) {
  if (raw === 'アルバイト') return 'part';
  if (raw === '社員＋技能実習生' || raw === '技能実習生' || raw === '社員') return 'employee';
  return null;
}

function aggregateSheet1(records) {
  var map = {};
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    var category = mapEmployeeCategory(r.employeeType);
    if (!category) continue;
    if (EXCLUDE_ROLES.indexOf(r.role) >= 0) continue;
    var key = r.site + '|' + r.role + '|' + category;
    if (!map[key]) map[key] = { totalHours: 0, employeeIds: {} };
    map[key].totalHours += r.workHours;
    map[key].employeeIds[r.employeeId] = true;
  }
  return map;
}

function applyAdjustments(base, adjustRecords, site) {
  var result = JSON.parse(JSON.stringify(base));
  // employeeIds を再構築（JSON.parseで消えるため）
  for (var k in base) result[k].employeeIds = base[k].employeeIds;

  for (var i = 0; i < adjustRecords.length; i++) {
    var adj = adjustRecords[i];
    var category = mapEmployeeCategory(adj.employeeType);
    if (!category) continue;

    var fromKey = site + '|' + adj.role + '|' + category;

    if (adj.site === adj.prj) {
      // D=E: 研修（減算のみ）
      if (result[fromKey]) result[fromKey].totalHours -= adj.adjustHours;
    } else {
      // D≠E: 振替（F列から減算、E列へ加算）
      if (result[fromKey]) result[fromKey].totalHours -= adj.adjustHours;
      var toKey = site + '|' + adj.prj + '|' + category;
      if (!result[toKey]) result[toKey] = { totalHours: 0, employeeIds: {} };
      result[toKey].totalHours += adj.adjustHours;
    }
  }
  return result;
}

function aggregateData(sheet1, sheet2, targetMonth) {
  var base = aggregateSheet1(sheet1);

  // 拠点一覧
  var sites = {};
  for (var i = 0; i < sheet1.length; i++) sites[sheet1[i].site] = true;

  var adjusted = base;
  for (var site in sites) {
    var siteAdj = sheet2.filter(function(a) { return a.site === site; });
    adjusted = applyAdjustments(adjusted, siteAdj, site);
  }

  var rows = [];
  for (var key in adjusted) {
    var val = adjusted[key];
    var parts = key.split('|');
    var headcount = Object.keys(val.employeeIds).length;
    rows.push({
      yearMonth: targetMonth,
      site: parts[0], role: parts[1], employeeCategory: parts[2],
      totalHours: val.totalHours,
      headcount: headcount,
      avgHours: headcount > 0 ? val.totalHours / headcount : 0
    });
  }
  return rows;
}

function buildSiteBlocks(rows) {
  var siteMap = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!siteMap[row.site]) siteMap[row.site] = {};
    if (!siteMap[row.site][row.role]) siteMap[row.site][row.role] = {};
    siteMap[row.site][row.role][row.employeeCategory] = row;
  }

  var blocks = [];
  for (var site in siteMap) {
    var roleMap = siteMap[site];
    var deliveryEmp  = { totalHours: 0, headcount: 0 };
    var deliveryPart = { totalHours: 0, headcount: 0 };
    var regularRoles = [];
    var hasDelivery = false;

    for (var role in roleMap) {
      var cats = roleMap[role];
      if (DELIVERY_ROLES.indexOf(role) >= 0) {
        hasDelivery = true;
        if (cats.employee) { deliveryEmp.totalHours  += cats.employee.totalHours;  deliveryEmp.headcount  += cats.employee.headcount; }
        if (cats.part)     { deliveryPart.totalHours += cats.part.totalHours;     deliveryPart.headcount += cats.part.headcount; }
        continue;
      }
      var emp = cats.employee || null;
      var prt = cats.part || null;
      regularRoles.push({
        role: role,
        employee: emp ? { totalHours: emp.totalHours, headcount: emp.headcount, avgHours: emp.avgHours } : null,
        part:     prt ? { totalHours: prt.totalHours, headcount: prt.headcount, avgHours: prt.avgHours } : null,
        subtotal: { totalHours: (emp ? emp.totalHours : 0) + (prt ? prt.totalHours : 0),
                    headcount:  (emp ? emp.headcount  : 0) + (prt ? prt.headcount  : 0) },
        isDelivery: false
      });
    }

    var displayRoles = regularRoles.slice();
    if (hasDelivery) {
      var th = deliveryEmp.totalHours + deliveryPart.totalHours;
      var hc = deliveryEmp.headcount  + deliveryPart.headcount;
      displayRoles.push({
        role: '配送',
        employee: deliveryEmp.headcount  > 0 ? { totalHours: deliveryEmp.totalHours,  headcount: deliveryEmp.headcount,  avgHours: deliveryEmp.totalHours  / deliveryEmp.headcount  } : null,
        part:     deliveryPart.headcount > 0 ? { totalHours: deliveryPart.totalHours, headcount: deliveryPart.headcount, avgHours: deliveryPart.totalHours / deliveryPart.headcount } : null,
        subtotal: { totalHours: th, headcount: hc },
        isDelivery: true
      });
    }

    var totalEmpH = 0, totalEmpN = 0, totalPartH = 0, totalPartN = 0;
    for (var j = 0; j < displayRoles.length; j++) {
      if (displayRoles[j].employee) { totalEmpH  += displayRoles[j].employee.totalHours; totalEmpN  += displayRoles[j].employee.headcount; }
      if (displayRoles[j].part)     { totalPartH += displayRoles[j].part.totalHours;     totalPartN += displayRoles[j].part.headcount; }
    }

    blocks.push({
      site: site,
      roles: displayRoles,
      total: {
        employee: totalEmpN  > 0 ? { totalHours: totalEmpH,  headcount: totalEmpN  } : null,
        part:     totalPartN > 0 ? { totalHours: totalPartH, headcount: totalPartN } : null,
        totalHours: totalEmpH + totalPartH,
        headcount:  totalEmpN + totalPartN
      }
    });
  }
  return blocks;
}

// ── ユーティリティ ────────────────────────────────────────

function parseWorkHours(val) {
  if (val === null || val === undefined || val === '' || val === 'なし') return 0;
  var num = Number(val);
  if (isNaN(num)) return 0;
  // Googleスプレッドシートの時間値はシリアル値（1=24h）
  return num * 24;
}

function parseYearMonth(val) {
  if (val === null || val === undefined || val === '') return null;
  // Date オブジェクトの場合
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = String(val.getMonth() + 1).padStart('00', 2);
    return y + '-' + m;
  }
  var num = Number(val);
  if (!isNaN(num) && num > 0) {
    // Excelシリアル日付
    var d = new Date(Math.round((num - 25569) * 86400 * 1000));
    var y2 = d.getUTCFullYear();
    var m2 = String(d.getUTCMonth() + 1);
    if (m2.length < 2) m2 = '0' + m2;
    return y2 + '-' + m2;
  }
  var str = String(val).trim();
  var match = str.match(/^(\d{4})[\/\-](\d{2})/);
  if (match) return match[1] + '-' + match[2];
  return null;
}

// String.prototype.padStart は Apps Script では使えない場合があるため代替
if (!String.prototype.padStart) {
  String.prototype.padStart = function(targetLength, padString) {
    var str = String(this);
    while (str.length < targetLength) str = padString + str;
    return str;
  };
}
