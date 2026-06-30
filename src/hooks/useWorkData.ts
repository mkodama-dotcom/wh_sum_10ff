import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import type { WorkRecord, AdjustRecord, SiteBlock } from '../utils/dataTypes';
import { aggregateData, buildSiteBlocks } from '../utils/aggregation';
import { mockSheet1, mockSheet2 } from '../utils/mockData';

function parseSheet1Row(row: Record<string, unknown>): WorkRecord | null {
  const flag = Number(row['B'] ?? 0);  // B列のみ参照（誤ったrow['F']フォールバックを除去）
  const employeeType = String(row['C'] ?? '');
  const site = String(row['D'] ?? '');
  const prj = String(row['E'] ?? '');
  const role = String(row['F'] ?? '');
  const employeeId = Number(row['G'] ?? 0);
  const rawHours = row['K'];
  const workHours = rawHours === 'なし' || rawHours == null ? 0 : Number(rawHours);

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

  const loadFile = useCallback((file: File, targetMonth: string) => {
    console.log('[useWorkData] loadFile 開始:', file.name, targetMonth);
    setState((s) => ({ ...s, loading: true, error: null }));

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        console.log('[useWorkData] シート一覧:', workbook.SheetNames);

        const sheet1Name = workbook.SheetNames[0];
        const sheet2Name = workbook.SheetNames[1];

        const s1 = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet1Name], { header: 'A' });
        const s2 = sheet2Name
          ? XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet2Name], { header: 'A' })
          : [];

        console.log('[useWorkData] シート1 生データ行数:', s1.length, '先頭行サンプル:', s1[0]);
        console.log('[useWorkData] シート2 生データ行数:', s2.length);

        // ヘッダー行をスキップ（1行目）
        const sheet1Records = s1.slice(1).map(parseSheet1Row).filter((r): r is WorkRecord => r !== null);
        const sheet2Records = s2.slice(1).map(parseSheet2Row).filter((r): r is AdjustRecord => r !== null);

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
