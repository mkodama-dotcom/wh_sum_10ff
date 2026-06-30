import type {
  WorkRecord,
  AdjustRecord,
  AggregatedRow,
  EmployeeCategory,
  RoleDisplayRow,
  SiteBlock,
} from './dataTypes';

const EXCLUDE_ROLES = new Set(['研修_社内', '研修_社外', '非整理対象']);
const DELIVERY_ROLES = new Set(['配送・栽培', '配送・出荷']);

function mapEmployeeCategory(raw: string): EmployeeCategory | null {
  if (raw === 'アルバイト') return 'part';
  if (raw === '社員＋技能実習生' || raw === '技能実習生' || raw === '社員') return 'employee';
  return null;
}

// Step1: シート１を集計（拠点 × 担当 × 雇用区分）
function aggregateSheet1(
  records: WorkRecord[],
): Map<string, { totalHours: number; employeeIds: Set<string> }> {
  const map = new Map<string, { totalHours: number; employeeIds: Set<string> }>();

  for (const r of records) {
    if (r.flag !== 1) continue;
    const category = mapEmployeeCategory(r.employeeType);
    if (!category) continue;
    // F列（担当）除外：parseSheet1Rowで除外済みだが念のため二重チェック
    if (EXCLUDE_ROLES.has(r.role)) continue;

    // 集計キーは r.role（F列 = 担当）を使用
    const key = `${r.site}|${r.role}|${category}`;
    const existing = map.get(key) ?? { totalHours: 0, employeeIds: new Set<string>() };
    existing.totalHours += r.workHours;
    existing.employeeIds.add(r.employeeId);
    map.set(key, existing);
  }

  return map;
}

// Step2: シート２の調整値をマージ
function applyAdjustments(
  base: Map<string, { totalHours: number; employeeIds: Set<string> }>,
  adjustRecords: AdjustRecord[],
  site: string,
): Map<string, { totalHours: number; employeeIds: Set<string> }> {
  const result = new Map(base);

  for (const adj of adjustRecords) {
    if (adj.flag !== 1) continue;
    const category = mapEmployeeCategory(adj.employeeType);
    if (!category) continue;

    // 集計キーは 拠点(D列=site) × 担当(F列=role) × 雇用区分
    // シート2は常に該当キーから減算するのみ（新規キーは作らない）
    const key = `${site}|${adj.role}|${category}`;
    const entry = result.get(key);
    if (entry) {
      result.set(key, { ...entry, totalHours: entry.totalHours - adj.adjustHours });
    }
  }

  return result;
}

// Step3: AggregatedRow[] に変換
function toAggregatedRows(
  map: Map<string, { totalHours: number; employeeIds: Set<string> }>,
  yearMonth: string,
): AggregatedRow[] {
  return Array.from(map.entries()).map(([key, val]) => {
    const [site, role, employeeCategory] = key.split('|') as [string, string, EmployeeCategory];
    const headcount = val.employeeIds.size;
    return {
      yearMonth,
      site,
      role,
      employeeCategory,
      totalHours: val.totalHours,
      headcount,
      avgHours: headcount > 0 ? val.totalHours / headcount : 0,
    };
  });
}

export function aggregateData(
  sheet1: WorkRecord[],
  sheet2: AdjustRecord[],
  targetMonth = '2025-06',
): AggregatedRow[] {
  const base = aggregateSheet1(sheet1);

  // 拠点一覧を取得してサイト別に調整適用
  const sites = new Set(sheet1.filter((r) => r.flag === 1).map((r) => r.site));
  let adjusted = base;
  for (const site of sites) {
    const siteAdj = sheet2.filter((a) => a.site === site);
    adjusted = applyAdjustments(adjusted, siteAdj, site);
  }

  return toAggregatedRows(adjusted, targetMonth);
}

// 表示用のSiteBlock[]に変換
export function buildSiteBlocks(rows: AggregatedRow[]): SiteBlock[] {
  const siteMap = new Map<string, Map<string, { employee?: AggregatedRow; part?: AggregatedRow }>>();

  for (const row of rows) {
    if (!siteMap.has(row.site)) siteMap.set(row.site, new Map());
    const roleMap = siteMap.get(row.site)!;
    if (!roleMap.has(row.role)) roleMap.set(row.role, {});
    roleMap.get(row.role)![row.employeeCategory] = row;
  }

  return Array.from(siteMap.entries()).map(([site, roleMap]) => {
    // 配送系ロールをまとめる
    const deliveryEmployeeHours = { totalHours: 0, headcount: 0, employeeIds: new Set<string>() };
    const deliveryPartHours = { totalHours: 0, headcount: 0, employeeIds: new Set<string>() };
    const regularRoles: RoleDisplayRow[] = [];
    let hasDelivery = false;

    for (const [role, cats] of roleMap.entries()) {
      if (DELIVERY_ROLES.has(role)) {
        hasDelivery = true;
        if (cats.employee) {
          deliveryEmployeeHours.totalHours += cats.employee.totalHours;
          deliveryEmployeeHours.headcount += cats.employee.headcount;
        }
        if (cats.part) {
          deliveryPartHours.totalHours += cats.part.totalHours;
          deliveryPartHours.headcount += cats.part.headcount;
        }
        continue;
      }

      const emp = cats.employee ?? null;
      const prt = cats.part ?? null;
      const totalHours = (emp?.totalHours ?? 0) + (prt?.totalHours ?? 0);
      const headcount = (emp?.headcount ?? 0) + (prt?.headcount ?? 0);

      regularRoles.push({
        role,
        employee: emp ? { totalHours: emp.totalHours, headcount: emp.headcount, avgHours: emp.avgHours } : null,
        part: prt ? { totalHours: prt.totalHours, headcount: prt.headcount, avgHours: prt.avgHours } : null,
        subtotal: { totalHours, headcount },
        isDelivery: false,
      });
    }

    const displayRoles: RoleDisplayRow[] = [...regularRoles];

    if (hasDelivery) {
      const totalHours = deliveryEmployeeHours.totalHours + deliveryPartHours.totalHours;
      const headcount = deliveryEmployeeHours.headcount + deliveryPartHours.headcount;
      displayRoles.push({
        role: '配送',
        employee: deliveryEmployeeHours.headcount > 0 ? { totalHours: deliveryEmployeeHours.totalHours, headcount: deliveryEmployeeHours.headcount, avgHours: deliveryEmployeeHours.totalHours / deliveryEmployeeHours.headcount } : null,
        part: deliveryPartHours.headcount > 0 ? { totalHours: deliveryPartHours.totalHours, headcount: deliveryPartHours.headcount, avgHours: deliveryPartHours.totalHours / deliveryPartHours.headcount } : null,
        subtotal: { totalHours, headcount },
        isDelivery: true,
      });
    }

    // 拠点合計
    let totalEmployeeHours = 0, totalEmployeeHeadcount = 0;
    let totalPartHours = 0, totalPartHeadcount = 0;

    for (const role of displayRoles) {
      if (role.employee) { totalEmployeeHours += role.employee.totalHours; totalEmployeeHeadcount += role.employee.headcount; }
      if (role.part) { totalPartHours += role.part.totalHours; totalPartHeadcount += role.part.headcount; }
    }

    return {
      site,
      roles: displayRoles,
      total: {
        employee: totalEmployeeHeadcount > 0 ? { totalHours: totalEmployeeHours, headcount: totalEmployeeHeadcount } : null,
        part: totalPartHeadcount > 0 ? { totalHours: totalPartHours, headcount: totalPartHeadcount } : null,
        totalHours: totalEmployeeHours + totalPartHours,
        headcount: totalEmployeeHeadcount + totalPartHeadcount,
      },
    };
  });
}
