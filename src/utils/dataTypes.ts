// シート１の1レコード
export type WorkRecord = {
  flag: number;         // B列（1のみ対象）
  employeeType: string; // C列（雇用区分）
  site: string;         // D列（拠点）
  prj: string;          // E列（PRJ）
  role: string;         // F列（担当）
  employeeId: number;   // G列（社員番号）
  workHours: number;    // K列（実質勤務時間）
};

// シート２の1レコード
export type AdjustRecord = {
  flag: number;
  employeeType: string;
  site: string;
  prj: string;          // D列（FROM PRJ）
  role: string;         // E列（TO PRJ）
  adjustHours: number;  // J列（増減時間）
};

// 雇用区分の表示カテゴリ
export type EmployeeCategory = 'employee' | 'part';

// 集計結果の1行（フェーズ２対応で yearMonth を持つ）
export type AggregatedRow = {
  yearMonth: string;        // 例: "2025-06"（単月時は固定値）
  site: string;
  role: string;
  employeeCategory: EmployeeCategory;
  totalHours: number;
  headcount: number;
  avgHours: number;
};

// 担当ごとの表示行（社員・技能実習生 / パート / 計）
export type RoleDisplayRow = {
  role: string;
  employee: { totalHours: number; headcount: number; avgHours: number } | null;
  part: { totalHours: number; headcount: number; avgHours: number } | null;
  subtotal: { totalHours: number; headcount: number };
  isDelivery: boolean;
};

// 拠点ごとの集計ブロック
export type SiteBlock = {
  site: string;
  roles: RoleDisplayRow[];
  total: {
    employee: { totalHours: number; headcount: number } | null;
    part: { totalHours: number; headcount: number } | null;
    totalHours: number;
    headcount: number;
  };
};
