import { useState } from 'react';
import { FileUploader } from './FileUploader';
import { SummaryTable } from './SummaryTable';
import { useWorkData } from '../hooks/useWorkData';

export function Dashboard() {
  const [useMock, setUseMock] = useState(true);
  const { siteBlocks, targetMonth, loading, error, notice, loadFile } = useWorkData(useMock);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 mb-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">勤務時間集計ダッシュボード</h1>
            {targetMonth && (
              <p className="text-sm text-gray-500 mt-0.5">対象月：{targetMonth}</p>
            )}
          </div>
          <button
            onClick={() => setUseMock((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1"
          >
            {useMock ? 'Excelファイルを読み込む' : 'モックデータを表示'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6">
        {!useMock && (
          <FileUploader onFile={loadFile} />
        )}

        {notice && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded px-4 py-3 mb-4 text-sm">
            ⚠️ {notice}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-6 text-sm">
            {error}
          </div>
        )}

        {siteBlocks.length === 0 && !loading && !useMock && (
          <p className="text-gray-400 text-center py-16">Excelファイルをアップロードしてください</p>
        )}

        {siteBlocks.map((block) => (
          <SummaryTable key={block.site} block={block} />
        ))}
      </main>
    </div>
  );
}
