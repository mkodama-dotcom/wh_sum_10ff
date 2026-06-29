# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

- **Language**: Python 3.11+
- **Framework**: FastAPI
- **Testing**: pytest
- **Linting/Formatting**: ruff
- **Type Checking**: mypy

## Common Commands

```bash
# 依存関係のインストール
pip install -r requirements.txt

# 開発サーバーの起動
uvicorn app.main:app --reload

# テストの実行
pytest

# 特定のテストファイルを実行
pytest tests/test_foo.py

# 特定のテスト関数を実行
pytest tests/test_foo.py::test_bar

# lint
ruff check .

# フォーマット
ruff format .

# 型チェック
mypy .
```

## Project Structure

```
app/
  main.py       # FastAPIアプリのエントリポイント、ルーターのマウント
  routers/      # エンドポイント定義（機能ごとにファイルを分割）
  models/       # Pydanticモデル（リクエスト/レスポンススキーマ）
  services/     # ビジネスロジック
  dependencies/ # FastAPI依存性注入（認証など）
tests/          # pytestテスト群
```

## Coding Conventions

- 型アノテーションを必ず付ける（mypy strict に準拠）
- FastAPIの依存性注入（`Depends`）でサービス層を注入する
- `async def` を基本とし、同期処理が必要な場合のみ `def` を使う
- Pydanticモデルでリクエスト/レスポンスの型を定義し、生の`dict`は使わない
- `ruff` の設定に従い、`ruff check --fix` で自動修正可能な警告は都度修正する
