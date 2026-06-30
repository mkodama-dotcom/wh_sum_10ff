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

  // F列（担当）が除外対象 or 時間が0の行は除外
  if (!site || !role) return null;
  if (EXCLUDE_ROLES_SET.has(role)) return null;
  if (workHours === 0) return null;

  return { flag, employeeType, site, prj, role, employeeId, workHours };
}

function parseSheet2Row(row: Record<string, unknown>): AdjustRecord | null {
  if (Number(row['B']) !== 1) return null;
  const flag = 1;
  const employeeType = String(row['C'] ?? '');
  const site = String(row['D'] ?? '').trim();
  const prj = String(row['E'] ?? '').trim();
  const role = String(row['F'] ?? '').trim();
  const adjustHours = Number(row['J'] ?? 0);

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
  notice: string | null;
};

export function useWorkData(useMock = false) {
  const [state, setState] = useState<State>(() => {
    if (useMock) {
      const rows = aggregateData(mockSheet1, mockSheet2, '2025-06');
      return { siteBlocks: buildSiteBlocks(rows), targetMonth: '2025-06', loading: false, error: null, notice: null };
    }
    return { siteBlocks: [], targetMonth: '', loading: false, error: null, notice: null };
  });

  const loadFile = useCallback((file: File) => {
    const targetMonth = '';
    setState((s) => ({ ...s, loading: true, error: null, notice: null }));

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

        const s1 = sheetToRows(workbook.Sheets[sheet1Name]);
        const s2 = workbook.Sheets[sheet2Name]
          ? sheetToRows(workbook.Sheets[sheet2Name])
          : [];

        const sheet1Records = s1.map(parseSheet1Row).filter((r): r is WorkRecord => r !== null);
        const sheet2Records = s2.map(parseSheet2Row).filter((r): r is AdjustRecord => r !== null);

        const aggregated = aggregateData(sheet1Records, sheet2Records, targetMonth);

        const notice =
          'ご注意：ExcelのグループAPPはSheetJSで検出できません。' +
          '集計対象外の行（非表示・グループ化）はExcel側でB列を空白にしてください。';

        setState({ siteBlocks: buildSiteBlocks(aggregated), targetMonth, loading: false, error: null, notice });
      } catch (err) {
        console.error('[useWorkData] エラー:', err);
        setState((s) => ({ ...s, loading: false, error: `ファイル読み込みエラー: ${String(err)}`, notice: null }));
      }
    };
    reader.onerror = () => {
      setState((s) => ({ ...s, loading: false, error: 'ファイルの読み取りに失敗しました', notice: null }));
    };
    reader.readAsArrayBuffer(file);
  }, []);

  return { ...state, loadFile };
}
