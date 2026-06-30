# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

- **Framework**: React 19 + TypeScript（Vite）
- **Styling**: Tailwind CSS v4（`@tailwindcss/vite` プラグイン）
- **Excel読み込み**: SheetJS（`xlsx`）
- **将来のグラフ**: Recharts（フェーズ２で追加予定）

## Common Commands

```bash
npm install          # 依存関係のインストール
npm run dev          # 開発サーバー起動
npm run build        # 本番ビルド（tsc → vite build）
npx tsc --noEmit     # 型チェックのみ
```

## Project Structure

```
src/
  components/
    Dashboard.tsx     # メインレイアウト。モック↔ファイル切り替えUI
    SummaryTable.tsx  # 拠点ブロック（担当×雇用区分テーブル）
    FileUploader.tsx  # ドラッグ&ドロップ対応Excelアップロード
  hooks/
    useWorkData.ts    # データ読み込み・集計・状態管理（useMockフラグあり）
  utils/
    aggregation.ts    # 集計ロジック（Step1〜3）+ buildSiteBlocks()
    dataTypes.ts      # 全型定義（WorkRecord / AdjustRecord / SiteBlock など）
    mockData.ts       # 開発用モックデータ（mockSheet1 / mockSheet2）
```

## Data & Aggregation Logic

### 集計の流れ（aggregation.ts）

1. **Step1**: シート１を `{site}|{role}|{category}` キーで集計（合計時間・ユニーク社員番号）
2. **Step2**: シート２の調整レコードを加減算（`prj === role` なら引くだけ、異なれば FROM から引いて TO へ加える）
3. **Step3**: `AggregatedRow[]` に変換 → `buildSiteBlocks()` で表示用 `SiteBlock[]` を生成

### フィルタ条件

- B列 `flag === 1` のみ対象
- C列 `employeeType` が `アルバイト`（→パート）または `社員＋技能実習生`（→社員・技能実習生）のみ
- E列 `prj`・F列 `role` が `研修_社内`・`研修_社外`・`非整理対象` は除外

### 配送担当の扱い

`配送・栽培` と `配送・出荷` は「配送」として合算表示。人数・平均は非表示、小計のみ。

## Phase 2 Readiness

- `aggregateData(sheet1, sheet2, targetMonth)` は `targetMonth` パラメータを受け取る設計
- `AggregatedRow` に `yearMonth` フィールドを保持
- `useWorkData` フックにデータ処理を集約し、表示コンポーネントから分離済み
