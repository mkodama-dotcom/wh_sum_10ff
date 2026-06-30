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
    const targetMonth = '';
    console.log('[useWorkData] loadFile 開始:', file.name, targetMonth);
    setState((s) => ({ ...s, loading: true, error: null }));

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        // cellFormula: false で数式セルを計算済み値として取得
        const workbook = XLSX.read(data, { type: 'array', cellFormula: false, cellNF: false });

        console.log('[useWorkData] シート一覧:', workbook.SheetNames);

        const sheet1Name = 'シート1';
        const sheet2Name = 'シート2';

        if (!workbook.Sheets[sheet1Name]) {
          throw new Error(`シート「${sheet1Name}」が見つかりません。シート一覧: ${workbook.SheetNames.join(', ')}`);
        }

        // defval: null で空セルを null として取得（空行も行として取り込み、B列=1フィルターで除外）
        const s1 = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet1Name], { header: 'A', defval: null });
        const s2 = workbook.Sheets[sheet2Name]
          ? XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet2Name], { header: 'A', defval: null })
          : [];

        console.log('[useWorkData] シート1 生データ行数:', s1.length);
        console.log('[useWorkData] シート1 先頭3行:', JSON.stringify(s1.slice(0, 3), null, 2));
        // パース後の先頭5レコードで role（F列=担当）が正しいか確認
        const colSamples = s1.slice(0, 10).map((r, i) => ({
          idx: i, B: r['B'], D: r['D'], E: r['E'], F: r['F'], K: r['K'],
        }));
        console.log('[useWorkData] 全列サンプル（index0〜9）:', colSamples);
        console.log('[useWorkData] シート2 生データ行数:', s2.length);

        // SheetJSは空行をスキップするため実質2行（タイトル・ヘッダー）のみ先頭にある
        // index0=タイトル, index1=ヘッダー, index2=データ開始
        const sheet1Records = s1.slice(2).map(parseSheet1Row).filter((r): r is WorkRecord => r !== null);
        const sheet2Records = s2.slice(2).map(parseSheet2Row).filter((r): r is AdjustRecord => r !== null);

        console.log('[useWorkData] パース済み シート1:', sheet1Records.length, '件  シート2:', sheet2Records.length, '件');

        const aggregated = aggregateData(sheet1Records, sheet2Records, targetMonth);
        console.log('[useWorkData] 集計結果:', aggregated.length, '行');

        setState({ siteBlocks: buildSiteBlocks(aggregated), targetMonth, loading: false, error: null });
      } catch (err) {
        console.error('[useWorkData] エラー:', err);
        setState((s) => ({ ...s, loading: false, error: `ファイル読み込みエラー: ${String(err)}` }));
      }
    };
    reader.onerror = () => {
      console.error('[useWorkData] FileReader エラー');
      setState((s) => ({ ...s, loading: false, error: 'ファイルの読み取りに失敗しました' }));
    };
    reader.readAsArrayBuffer(file);
  }, []);

  return { ...state, loadFile };
}
