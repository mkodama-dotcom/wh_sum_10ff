import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';

type Props = {
  onFile: (file: File, targetMonth: string) => void;
  loading: boolean;
};

export function FileUploader({ onFile, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    onFile(files[0], month);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-4 mb-3">
        <label className="text-sm font-medium text-gray-700">
          対象年月：
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </label>
      </div>
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onChange} />
        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : (
          <>
            <p className="text-gray-600 font-medium">Excelファイルをドロップ</p>
            <p className="text-gray-400 text-sm mt-1">または クリックして選択（.xlsx / .xls）</p>
          </>
        )}
      </div>
    </div>
  );
}
