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
    var debugMode    = params.debug === '1';

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var allSheetNames = ss.getSheets().map(function(s) { return s.getName(); });
    var ws1 = ss.getSheetByName('シート1');
    var ws2 = ss.getSheetByName('シート2');
    var ws4 = ss.getSheetByName('シート4');

    // ── デバッグモード (?debug=1) ──
    if (debugMode) {
      var dbg = { sheetNames: allSheetNames };
      if (ws1) {
        var raw = ws1.getDataRange().getValues();
        dbg.sheet1_rows_total = raw.length;
        ['row1','row2','row3','row4','row5'].forEach(function(k, i) {
          dbg['sheet1_' + k] = (raw[i] || []).map(function(v) {
            return { val: String(v).slice(0,30), type: typeof v, isDate: v instanceof Date };
          });
        });
        // K列（index10）の生値デバッグ
        var dataRow = raw[3] || [];
        var testVal = dataRow[10];
        Logger.log('K列生値: ' + testVal + ' type: ' + typeof testVal);
        dbg.k_col_debug = {
          k_raw:    String(testVal),
          k_type:   typeof testVal,
          k_json:   JSON.stringify(testVal),
          k_number: Number(testVal),
          k_isDate: testVal instanceof Date,
          // 各変換式での結果
          as_times24:       Number(testVal) * 24,
          as_div1000_3600:  Number(testVal) / 1000 / 3600,
          as_serial_days:   Number(testVal) / 86400 / 1000
        };
      }
      if (ws2) {
        var r2 = ws2.getDataRange().getValues();
        dbg.sheet2_rows_total = r2.length;
        dbg.sheet2_row4 = (r2[3] || []).map(function(v) { return String(v).slice(0,30); });
        dbg.sheet2_row5 = (r2[4] || []).map(function(v) { return String(v).slice(0,30); });
      }
      if (ws4) {
        var r4 = ws4.getDataRange().getValues();
        dbg.sheet4_rows_total = r4.length;
        dbg.sheet4_row1 = (r4[0] || []).map(function(v) { return String(v).slice(0,30); });
        dbg.sheet4_row2 = (r4[1] || []).map(function(v) { return String(v).slice(0,30); });
      }
      return ContentService.createTextOutput(JSON.stringify(dbg)).setMimeType(ContentService.MimeType.JSON);
    }

    if (!ws1) throw new Error('シート1が見つかりません。シート名一覧: ' + allSheetNames.join(', '));

    var s1 = ws1.getDataRange().getValues();
    var s2 = ws2 ? ws2.getDataRange().getValues() : [];
    var s4 = ws4 ? ws4.getDataRange().getValues() : [];

    // 年月一覧と対象月を決定
    var yearMonthCols = getYearMonthCols(s1);
    var targetMonth = requestMonth;
    if (!targetMonth && yearMonthCols.length > 0) {
      targetMonth = yearMonthCols.slice().sort(function(a, b) {
        return a.yearMonth < b.yearMonth ? 1 : -1;
      })[0].yearMonth;
    }

    // 対象月の時間列を特定
    var targetHoursCol = -1;
    for (var i = 0; i < yearMonthCols.length; i++) {
      if (yearMonthCols[i].yearMonth === targetMonth) {
        targetHoursCol = yearMonthCols[i].hoursCol;
        break;
      }
    }

    var sheet1Records = parseSheet1(s1, targetHoursCol);
    var sheet2Records = parseSheet2(s2, targetMonth);
    var aggregated    = aggregateData(sheet1Records, sheet2Records, targetMonth);
    var siteBlocks    = buildSiteBlocks(aggregated);
    var sheet4Data    = parseSheet4(s4, targetMonth);

    return ContentService.createTextOutput(JSON.stringify({
      targetMonth:     targetMonth,
      availableMonths: yearMonthCols.map(function(x) { return x.yearMonth; }).sort().reverse(),
      siteBlocks:      siteBlocks,
      sheet4:          sheet4Data,
      _debug: {
        sheet1Records: sheet1Records.length,
        sheet2Records: sheet2Records.length,
        yearMonthCols: yearMonthCols,
        targetHoursCol: targetHoursCol
      }
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── シート1 パース ────────────────────────────────────────
// 列構造:
//   A(0)=None  B(1)=Flag  C(2)=雇用区分  D(3)=拠点  E(4)=PRJ  F(5)=担当
//   G(6)=社員番号  H(7)=名前
//   年月: row1 の index 8, 11, 14... (3列おき)
//   時間: 年月列 + 2 = index 10, 13, 16...
// 行構造: 1行目=タイトル, 2行目=年月, 3行目=ヘッダー, 4行目(index3)以降=データ

function getYearMonthCols(data) {
  var ymRow = data[1] || [];  // 2行目（index 1）に年月
  var result = [];
  for (var c = 8; c < ymRow.length; c += 3) {
    var ym = parseYearMonth(ymRow[c]);
    if (ym) result.push({ ymCol: c, hoursCol: c + 2, yearMonth: ym });
  }
  return result;
}

function parseSheet1(data, targetHoursCol) {
  var records = [];
  for (var r = 3; r < data.length; r++) {  // index 3 = 4行目からデータ
    var row = data[r];
    if (Number(row[1]) !== 1) continue;     // B(index1) = flag

    var employeeType = String(row[2] || '').trim();   // C = 雇用区分
    var site         = String(row[3] || '').trim();   // D = 拠点
    var prj          = String(row[4] || '').trim();   // E = PRJ
    var role         = String(row[5] || '').trim();   // F = 担当
    var gVal         = String(row[6] || '').trim();   // G = 社員番号
    var hVal         = String(row[7] || '').trim();   // H = 名前
    var employeeId   = (gVal && gVal !== '0') ? 'id:' + gVal : (hVal ? 'name:' + hVal : '');

    if (!site || !role) continue;
    if (EXCLUDE_ROLES.indexOf(role) >= 0) continue;

    var workHours = (targetHoursCol >= 0 && targetHoursCol < row.length)
      ? parseWorkHours(row[targetHoursCol]) : 0;
    if (workHours === 0) continue;

    records.push({ employeeType: employeeType, site: site, prj: prj, role: role,
                   employeeId: employeeId, workHours: workHours });
  }
  return records;
}

// ── シート2 パース ────────────────────────────────────────
// 列構造:
//   B(1)=Flag  D(3)=拠点  E(4)=PRJ  F(5)=担当  I(8)=計上年月  J(9)=増減時間
// 行構造: 1〜2行目=空, 3行目=ヘッダー, 4行目(index3)以降=データ

function parseSheet2(data, targetYearMonth) {
  var records = [];
  for (var r = 3; r < data.length; r++) {  // index 3 = 4行目からデータ
    var row = data[r];
    if (Number(row[1]) !== 1) continue;    // B(index1) = flag

    var rowYM = parseYearMonth(row[8]);    // I(index8) = 計上年月
    if (rowYM !== targetYearMonth) continue;

    var employeeType = String(row[2] || '').trim();  // C = 雇用区分
    var site         = String(row[3] || '').trim();  // D = 拠点
    var prj          = String(row[4] || '').trim();  // E = PRJ
    var role         = String(row[5] || '').trim();  // F = 担当
    var adjustHours  = parseWorkHours(row[9]);       // J(index9) = 増減時間

    if (!site) continue;
    records.push({ employeeType: employeeType, site: site, prj: prj, role: role,
                   adjustHours: adjustHours });
  }
  return records;
}

// ── シート4 パース ────────────────────────────────────────
// 列構造:
//   A(0)=拠点（結合）  B(1)=カテゴリ  C(2)=項目名  D(3)以降=各月の値
// 行構造: 1行目=年月（index3以降に 202604, 202605... の数値）, 2行目以降=データ

function parseSheet4(data, targetYearMonth) {
  if (!data || data.length < 2) return null;

  var headerRow = data[0];
  var targetCol = -1;
  for (var c = 3; c < headerRow.length; c++) {
    if (parseYearMonthFromNumber(headerRow[c]) === targetYearMonth) {
      targetCol = c;
      break;
    }
  }

  var rows = [];
  var lastSite = '';
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var site = String(row[0] || '').trim();
    if (site) lastSite = site;        // 結合セルの省略を補完
    var category = String(row[1] || '').trim();
    var item     = String(row[2] || '').trim();
    var value    = targetCol >= 0 ? row[targetCol] : null;
    if (!category && !item) continue;
    rows.push({ site: lastSite, category: category, item: item, value: value });
  }
  return { targetCol: targetCol, rows: rows };
}

// 202604 → "2026-04" 形式に変換
function parseYearMonthFromNumber(val) {
  var num = Number(val);
  if (isNaN(num) || num < 190001 || num > 210012) return null;
  var y = Math.floor(num / 100);
  var m = num % 100;
  if (m < 1 || m > 12) return null;
  return y + '-' + (m < 10 ? '0' + m : String(m));
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
  // ディープコピー（employeeIdsは参照を保持）
  var result = {};
  for (var k in base) result[k] = { totalHours: base[k].totalHours, employeeIds: base[k].employeeIds };

  for (var i = 0; i < adjustRecords.length; i++) {
    var adj = adjustRecords[i];
    var category = mapEmployeeCategory(adj.employeeType);
    if (!category) continue;

    var fromKey = site + '|' + adj.role + '|' + category;

    if (adj.site === adj.prj) {
      // D=E: 研修（減算のみ）
      if (result[fromKey]) result[fromKey].totalHours -= adj.adjustHours;
    } else {
      // D≠E: 振替（F列=担当から減算、E列=PRJへ加算）
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
      totalHours: val.totalHours, headcount: headcount,
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
    var hasDelivery  = false;

    for (var role in roleMap) {
      var cats = roleMap[role];
      if (DELIVERY_ROLES.indexOf(role) >= 0) {
        hasDelivery = true;
        if (cats.employee) { deliveryEmp.totalHours  += cats.employee.totalHours;  deliveryEmp.headcount  += cats.employee.headcount; }
        if (cats.part)     { deliveryPart.totalHours += cats.part.totalHours;      deliveryPart.headcount += cats.part.headcount; }
        continue;
      }
      var emp = cats.employee || null;
      var prt = cats.part     || null;
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
      site: site, roles: displayRoles,
      total: {
        employee: totalEmpN  > 0 ? { totalHours: totalEmpH,  headcount: totalEmpN  } : null,
        part:     totalPartN > 0 ? { totalHours: totalPartH, headcount: totalPartN } : null,
        totalHours: totalEmpH + totalPartH, headcount: totalEmpN + totalPartN
      }
    });
  }
  return blocks;
}

// ── ユーティリティ ────────────────────────────────────────

function parseWorkHours(val) {
  if (val === null || val === undefined || val === '' || val === 'なし') return 0;
  if (val instanceof Date) {
    // GAS は timedelta セルを 1900-01-01 基準の Date オブジェクトで返す
    // Excel の基準日 1899-12-30 からの経過ミリ秒を時間に変換
    var baseDate = new Date(1899, 11, 30, 0, 0, 0, 0);
    var ms = val.getTime() - baseDate.getTime();
    return ms / 3600000;
  }
  var num = Number(val);
  if (isNaN(num)) return 0;
  return num / 3600000;
}

function parseYearMonth(val) {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = val.getMonth() + 1;
    return y + '-' + (m < 10 ? '0' + m : String(m));
  }
  // 202604 形式の数値
  var asNum = parseYearMonthFromNumber(val);
  if (asNum) return asNum;
  // "YYYY-MM" / "YYYY/MM" 形式の文字列
  var str = String(val).trim();
  var match = str.match(/^(\d{4})[\/\-](\d{2})/);
  if (match) return match[1] + '-' + match[2];
  return null;
}

function parseYearMonthFromNumber(val) {
  var num = Number(val);
  if (isNaN(num) || num < 190001 || num > 210012) return null;
  var y = Math.floor(num / 100);
  var m = num % 100;
  if (m < 1 || m > 12) return null;
  return y + '-' + (m < 10 ? '0' + m : String(m));
}
