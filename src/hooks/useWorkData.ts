import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import type { WorkRecord, AdjustRecord, SiteBlock } from '../utils/dataTypes';
import { aggregateData, buildSiteBlocks } from '../utils/aggregation';
import { mockSheet1, mockSheet2 } from '../utils/mockData';

function parseSheet1Row(row: Record<string, unknown>): WorkRecord | null {
  const flag = Number(row['B'] ?? row['F']);
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
    setState((s) => ({ ...s, loading: true, error: null }));

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const sheet1Name = workbook.SheetNames[0];
        const sheet2Name = workbook.SheetNames[1];

        const s1 = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet1Name], { header: 'A' });
        const s2 = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet2Name], { header: 'A' });

        // ヘッダー行をスキップ（1行目）
        const sheet1Records = s1.slice(1).map(parseSheet1Row).filter((r): r is WorkRecord => r !== null);
        const sheet2Records = s2.slice(1).map(parseSheet2Row).filter((r): r is AdjustRecord => r !== null);

        const aggregated = aggregateData(sheet1Records, sheet2Records, targetMonth);
        setState({ siteBlocks: buildSiteBlocks(aggregated), targetMonth, loading: false, error: null });
      } catch (err) {
        setState((s) => ({ ...s, loading: false, error: `ファイル読み込みエラー: ${String(err)}` }));
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  return { ...state, loadFile };
}
