import { useRef } from 'react';

export function FileUploader({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <button onClick={() => inputRef.current?.click()}>
        Excelファイルを読み込む
      </button>
    </div>
  );
}
