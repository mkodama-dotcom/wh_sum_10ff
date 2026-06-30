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

function parseSheet1Row(row: Record<string, unknown>): WorkRecord | null {
  const flag = Number(row['B'] ?? 0);
  const employeeType = String(row['C'] ?? '');
  const site = String(row['D'] ?? '');
  const prj = String(row['E'] ?? '');
  const role = String(row['F'] ?? '');
  // G列（社員番号）が空の場合はH列（名前）を識別子として使用
  const gVal = String(row['G'] ?? '').trim();
  const hVal = String(row['H'] ?? '').trim();
  const employeeId = gVal !== '' && gVal !== '0' ? `id:${gVal}` : hVal !== '' ? `name:${hVal}` : '';
  const workHours = parseWorkHours(row['K']);

  if (!flag || !site || !role) return null;
  return { flag, employeeType, site, prj, role, employeeId, workHours };
}

function parseSheet2Row(row: Record<string, unknown>): AdjustRecord | null {
  const flag = Number(row['B'] ?? 0);
  const employeeType = String(row['C'] ?? '');
  const site = String(row['D'] ?? '');
  const prj = String(row['E'] ?? '');
  const role = String(row['F'] ?? '');
  const adjustHours = Number(row['J'] ?? 0);

  if (!flag || !site) return null;
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

        const s1 = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet1Name], { header: 'A' });
        const s2 = sheet2Name
          ? XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet2Name], { header: 'A' })
          : [];

        console.log('[useWorkData] シート1 生データ行数:', s1.length);
        console.log('[useWorkData] シート1 先頭3行:', JSON.stringify(s1.slice(0, 3), null, 2));
        // K列の生値を確認（× 24 前）
        const kSamples = s1.slice(2, 7).map((r) => ({ K生値: r['K'], K変換後: (Number(r['K']) * 24).toFixed(2) + 'h' }));
        console.log('[useWorkData] K列サンプル（データ行3〜7）:', kSamples);
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
