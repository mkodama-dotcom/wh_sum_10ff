import type { SiteBlock, RoleDisplayRow } from '../utils/dataTypes';

function fmt(h: number) {
  return `${h.toFixed(1)}h`;
}

function RoleRows({ row }: { row: RoleDisplayRow }) {
  const { role, employee, part, subtotal, isDelivery } = row;

  if (isDelivery) {
    return (
      <tr className="bg-gray-50">
        <td className="border border-gray-200 px-3 py-1.5 font-medium" rowSpan={1}>{role}</td>
        <td className="border border-gray-200 px-3 py-1.5 text-gray-500">計</td>
        <td className="border border-gray-200 px-3 py-1.5 text-right text-orange-600 font-medium">{fmt(subtotal.totalHours)}</td>
        <td className="border border-gray-200 px-3 py-1.5 text-right text-blue-600">{subtotal.headcount}人</td>
        <td className="border border-gray-200 px-3 py-1.5 text-right text-gray-400">—</td>
      </tr>
    );
  }

  const rows: React.ReactNode[] = [];
  let firstCell = true;
  const rowCount = (employee ? 1 : 0) + (part ? 1 : 0) + 1;

  if (employee) {
    rows.push(
      <tr key="emp" className="hover:bg-gray-50">
        {firstCell && (
          <td className="border border-gray-200 px-3 py-1.5 font-medium align-top" rowSpan={rowCount}>
            {role}
          </td>
        )}
        <td className="border border-gray-200 px-3 py-1.5 text-sm">社員・技能実習生</td>
        <td className="border border-gray-200 px-3 py-1.5 text-right text-orange-600">{fmt(employee.totalHours)}</td>
        <td className="border border-gray-200 px-3 py-1.5 text-right text-blue-600">{employee.headcount}人</td>
        <td className="border border-gray-200 px-3 py-1.5 text-right text-gray-600">{fmt(employee.avgHours)}</td>
      </tr>
    );
    firstCell = false;
  }

  if (part) {
    rows.push(
      <tr key="part" className="hover:bg-gray-50">
        {firstCell && (
          <td className="border border-gray-200 px-3 py-1.5 font-medium align-top" rowSpan={rowCount}>
            {role}
          </td>
        )}
        <td className="border border-gray-200 px-3 py-1.5 text-sm">パート</td>
        <td className="border border-gray-200 px-3 py-1.5 text-right text-orange-600">{fmt(part.totalHours)}</td>
        <td className="border border-gray-200 px-3 py-1.5 text-right text-blue-600">{part.headcount}人</td>
        <td className="border border-gray-200 px-3 py-1.5 text-right text-gray-600">{fmt(part.avgHours)}</td>
      </tr>
    );
    firstCell = false;
  }

  rows.push(
    <tr key="sub" className="bg-gray-100 font-medium">
      {firstCell && (
        <td className="border border-gray-200 px-3 py-1.5 align-top" rowSpan={1}>{role}</td>
      )}
      <td className="border border-gray-200 px-3 py-1.5 text-gray-500 pl-4">　計</td>
      <td className="border border-gray-200 px-3 py-1.5 text-right text-orange-700">{fmt(subtotal.totalHours)}</td>
      <td className="border border-gray-200 px-3 py-1.5 text-right text-blue-700">{subtotal.headcount}人</td>
      <td className="border border-gray-200 px-3 py-1.5 text-right text-gray-500">—</td>
    </tr>
  );

  return <>{rows}</>;
}

export function SummaryTable({ block }: { block: SiteBlock }) {
  const { site, roles, total } = block;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-gray-800 mb-2 px-1">
        拠点：<span className="text-indigo-700">{site}</span>
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-indigo-600 text-white">
              <th className="border border-indigo-500 px-3 py-2 text-left w-24">担当</th>
              <th className="border border-indigo-500 px-3 py-2 text-left w-36">雇用区分</th>
              <th className="border border-indigo-500 px-3 py-2 text-right w-24">時間</th>
              <th className="border border-indigo-500 px-3 py-2 text-right w-20">人数</th>
              <th className="border border-indigo-500 px-3 py-2 text-right w-24">平均時間</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((row) => (
              <RoleRows key={row.role} row={row} />
            ))}
            {/* 拠点計 */}
            {total.employee && (
              <tr className="bg-indigo-50 font-semibold">
                <td className="border border-gray-200 px-3 py-1.5 text-indigo-800" rowSpan={
                  (total.employee ? 1 : 0) + (total.part ? 1 : 0) + 1
                }>
                  {site}<br /><span className="text-xs font-normal">拠点計</span>
                </td>
                <td className="border border-gray-200 px-3 py-1.5">社員・技能実習生</td>
                <td className="border border-gray-200 px-3 py-1.5 text-right text-orange-700">{fmt(total.employee.totalHours)}</td>
                <td className="border border-gray-200 px-3 py-1.5 text-right text-blue-700">{total.employee.headcount}人</td>
                <td className="border border-gray-200 px-3 py-1.5 text-right text-gray-400">—</td>
              </tr>
            )}
            {total.part && (
              <tr className="bg-indigo-50 font-semibold">
                <td className="border border-gray-200 px-3 py-1.5">パート</td>
                <td className="border border-gray-200 px-3 py-1.5 text-right text-orange-700">{fmt(total.part.totalHours)}</td>
                <td className="border border-gray-200 px-3 py-1.5 text-right text-blue-700">{total.part.headcount}人</td>
                <td className="border border-gray-200 px-3 py-1.5 text-right text-gray-400">—</td>
              </tr>
            )}
            <tr className="bg-indigo-100 font-bold">
              {!total.employee && !total.part && (
                <td className="border border-gray-200 px-3 py-1.5 text-indigo-800">
                  {site}<br /><span className="text-xs font-normal">拠点計</span>
                </td>
              )}
              <td className="border border-gray-200 px-3 py-1.5 text-gray-600">　計</td>
              <td className="border border-gray-200 px-3 py-1.5 text-right text-orange-800">{fmt(total.totalHours)}</td>
              <td className="border border-gray-200 px-3 py-1.5 text-right text-blue-800">{total.headcount}人</td>
              <td className="border border-gray-200 px-3 py-1.5 text-right text-gray-400">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
