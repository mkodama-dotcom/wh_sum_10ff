import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import type { WorkRecord, AdjustRecord, SiteBlock } from '../utils/dataTypes';
import { aggregateData, buildSiteBlocks } from '../utils/aggregation';
import { mockSheet1, mockSheet2 } from '../utils/mockData';

function parseWorkHours(val: unknown): number {
  if (val === null || val === undefined || val === 'なし') return 0;
  const num = Number(val);
  if (isNaN(num)) return 0;
  // Excelシリアル値（1=24時間）なので×24して時間に変換
  return num * 24;
}

// Excelの日付値（シリアル値または "YYYY-MM-DD" 文字列）を "YYYY-MM" に変換
function parseYearMonth(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (!isNaN(num) && num > 0) {
    // Excelシリアル日付 → UTC日付（1900-01-01 = 1、うるう年バグ補正で -25569）
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  // 文字列形式 "YYYY-MM-DD" or "YYYY-MM"
  const str = String(val).trim();
  const match = str.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  return null;
}

const EXCLUDE_ROLES_SET = new Set(['研修_社内', '研修_社外', '非整理対象']);

function parseSheet1Row(row: Record<string, unknown>): WorkRecord | null {
  // B列が厳密に数値1のもののみ対象（null・空・文字列はすべて除外）
  if (Number(row['B']) !== 1) return null;
  const flag = 1;
  const employeeType = String(row['C'] ?? '');
  const site = String(row['D'] ?? '').trim();
  const prj = String(row['E'] ?? '').trim();
  const role = String(row['F'] ?? '').trim();  // F列 = 担当
  // G列（社員番号）が空の場合はH列（名前）を識別子として使用
  const gVal = String(row['G'] ?? '').trim();
  const hVal = String(row['H'] ?? '').trim();
  const employeeId = gVal !== '' && gVal !== '0' ? `id:${gVal}` : hVal !== '' ? `name:${hVal}` : '';
  const workHours = parseWorkHours(row['K']);

  if (!site || !role) return null;
  if (EXCLUDE_ROLES_SET.has(role)) return null;
  if (workHours === 0) return null;

  return { flag, employeeType, site, prj, role, employeeId, workHours };
}

function parseSheet2Row(
  row: Record<string, unknown>,
  targetYearMonth: string,
): AdjustRecord | null {
  if (Number(row['B']) !== 1) return null;

  // I列の計上年月がシート1のH1年月と一致する行のみ対象
  const rowYearMonth = parseYearMonth(row['I']);
  if (rowYearMonth !== targetYearMonth) return null;

  const flag = 1;
  const employeeType = String(row['C'] ?? '');
  const site = String(row['D'] ?? '').trim();
  const prj = String(row['E'] ?? '').trim();
  const role = String(row['F'] ?? '').trim();
  const adjustHours = parseWorkHours(row['J']);

  if (!site) return null;
  return { flag, employeeType, site, prj, role, adjustHours };
}

// 行ループでセル値を取得（sheet_to_json の代替）
// 注意: SheetJS は Excel のグループ化による非表示行を !rows[R].hidden で検出できません。
// 集計対象外の行は Excel 側で B列を空白にしてください。
function sheetToRows(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  const ref = ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: Record<string, unknown>[] = [];
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row: Record<string, unknown> = {};
    for (let C = range.s.c; C <= range.e.c; C++) {
      const colLetter = XLSX.utils.encode_col(C);
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
      row[colLetter] = ws[cellAddr]?.v ?? null;
    }
    rows.push(row);
  }
  return rows;
}

type State = {
  siteBlocks: SiteBlock[];
  targetMonth: string;
  loading: boolean;
  error: string | null;
};

export function useWorkData(useMock = false) {
  const [state, setState] = useState<State>(() => {
    if (useMock) {
      const rows = aggregateData(mockSheet1, mockSheet2, '2025-06');
      return { siteBlocks: buildSiteBlocks(rows), targetMonth: '2025-06', loading: false, error: null };
    }
    return { siteBlocks: [], targetMonth: '', loading: false, error: null };
  });

  const loadFile = useCallback((file: File) => {
    setState((s) => ({ ...s, loading: true, error: null }));

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellFormula: false, cellNF: false });

        const sheet1Name = 'シート1';
        const sheet2Name = 'シート2';

        if (!workbook.Sheets[sheet1Name]) {
          throw new Error(`シート「${sheet1Name}」が見つかりません。シート一覧: ${workbook.SheetNames.join(', ')}`);
        }

        // シート1のH1セルから対象年月を取得
        const ws1 = workbook.Sheets[sheet1Name];
        const h1Raw = ws1['H1'];
        const h1Value = h1Raw?.v ?? null;
        console.log('[DEBUG] H1セル raw:', JSON.stringify(h1Raw));
        console.log('[DEBUG] H1セル .v:', h1Value, ' type:', typeof h1Value);
        const targetYearMonth = parseYearMonth(h1Value) ?? '';
        console.log('[DEBUG] targetYearMonth:', targetYearMonth);

        const s1 = sheetToRows(ws1);
        const s2 = workbook.Sheets[sheet2Name]
          ? sheetToRows(workbook.Sheets[sheet2Name])
          : [];

        const sheet1Records = s1.map(parseSheet1Row).filter((r): r is WorkRecord => r !== null);
        // シート2 I列の年月サンプルを出力（先頭20行のみ）
        const s2Sample = s2.slice(0, 20).map((row, i) => ({
          idx: i, B: row['B'], I: row['I'], rowYM: parseYearMonth(row['I']),
        }));
        console.log('[DEBUG] シート2 I列サンプル:', JSON.stringify(s2Sample, null, 2));

        const sheet2Records = s2
          .map((row) => parseSheet2Row(row, targetYearMonth))
          .filter((r): r is AdjustRecord => r !== null);

        const aggregated = aggregateData(sheet1Records, sheet2Records, targetYearMonth);

        setState({ siteBlocks: buildSiteBlocks(aggregated), targetMonth: targetYearMonth, loading: false, error: null });
      } catch (err) {
        console.error('[useWorkData] エラー:', err);
        setState((s) => ({ ...s, loading: false, error: `ファイル読み込みエラー: ${String(err)}` }));
      }
    };
    reader.onerror = () => {
      setState((s) => ({ ...s, loading: false, error: 'ファイルの読み取りに失敗しました' }));
    };
    reader.readAsArrayBuffer(file);
  }, []);

  return { ...state, loadFile };
}
