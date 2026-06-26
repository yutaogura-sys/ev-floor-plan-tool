# EV充電設備 平面図作成ツール

EV充電設備の**平面図・配線ルート図**を補助金要件に沿って作図するブラウザツールです。下書き（ラフ図）PDFとDXFベースマップを取り込み、充電スペース・充電器・基礎・寸法などの注釈を配置し、PDF/DXFとして出力します。右パネルで補助金要件のチェックリストを確認できます。

## 構成

- バニラJS（ビルドステップなし）+ 小型 Node 静的サーバ
- `index.html` … UI 本体
- `js/` … 作図エンジン・ツール・エクスポータ（SVG/DXF/PDF）
- `lib/` … ベンダーライブラリ（jsPDF / pdf.js / svg2pdf）
- `docs/superpowers/` … 設計書（spec）と実装計画（plan）

## 起動

```bash
node server.js   # または npm start
# ブラウザで http://localhost:8080 を開く
```

## AI読取（任意）

ラフ図のAI読取（Claude vision）を有効化するには、SDKを入れてAPIキーを環境変数に設定してから起動します。

```bash
npm install                      # @anthropic-ai/sdk を含む依存を取得
export ANTHROPIC_API_KEY=sk-ant-...   # PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
# 既定モデルは claude-opus-4-8。コスト調整は ANALYZE_MODEL で上書き可:
# export ANALYZE_MODEL=claude-sonnet-4-6
node server.js
```

キー未設定時はAI読取はモック応答で動作します（課金・外部送信なし）。

## 開発

純ロジックのユニットテストは Node 組込みテストランナーで実行します。

```bash
npm test
```

## ライセンス

社内利用ツール。
