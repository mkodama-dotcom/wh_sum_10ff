export function App() {
  return (
    <div style={{ padding: 20 }}>
      <p>テスト用ファイル選択：</p>
      <input
        type="file"
        accept=".xlsx"
        onChange={(e) => console.log('テスト：ファイル選択された', e.target.files?.[0]?.name)}
      />
    </div>
  );
}
