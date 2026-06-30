export function FileUploader({ onFile }: { onFile: (file: File) => void }) {
  return (
    <div>
      <input
        type="file"
        accept=".xlsx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
