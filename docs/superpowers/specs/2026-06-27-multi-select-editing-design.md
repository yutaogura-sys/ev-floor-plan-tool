# 複数選択・編集系 新機能 — 設計書

- 日付: 2026-06-27
- 対象: `C:\Users\Yuta Ogura\Desktop\平面図_AI作図`（EV充電設備 平面図/配線ルート図 作成ツール、バニラJS・ビルドなし）
- 経緯: 実使用ドッグフーディングで「複数要素の一括操作」「精密微調整」「複写」「選択範囲の確認」が無いことが判明。ユーザー選択により4機能（矢印nudge / 複数選択 / コピー&ペースト / 選択へズーム）を追加する。

## 1. 目的とゴール

単一要素しか扱えなかった編集を拡張し、複数要素の一括操作・精密微調整・複写・選択範囲へのズームを可能にする。

### 成功基準
- 矩形ドラッグ／Shift+クリックで複数要素を選択でき、まとめて移動・削除・コピーできる。
- 選択要素を矢印キーでグリッド単位、Shift+矢印で微動できる。
- Ctrl+C→Ctrl+V で選択要素を offset 複写でき、貼付分が選択される。
- 「全体表示」ボタンが、選択があれば選択範囲に、無ければ全体にズームする。
- 既存の単一要素操作（拡縮・回転・ラベルドラッグ・プロパティ編集）は不変。
- すべて Undo/Redo・保存/復元と整合。
- 既存テスト80件＋E2E5件が非回帰。

### 非ゴール
- 複数要素の一括拡縮/回転（複雑・YAGNI。複数時は拡縮/回転ハンドル非表示）。
- 図面（plan/route）をまたぐ選択の特別扱い（表示中の要素のみ選択対象）。
- システムクリップボード連携（アプリ内メモリのみ）。

## 2. アーキテクチャ（案B：プライマリ＋選択セット併存）

`SelectTool` に選択セットを導入し、**移動・削除・nudge・コピー・ズームはセット全体**、**拡縮・回転・ラベルドラッグ・プロパティ編集は主（単一）のみ**とする。これにより最も複雑な単一要素操作の既存コードを温存し、回帰リスクを限定する。

### 選択状態
- `this.selected`：主（最後に選んだ1個 / 単一選択時の対象）。従来通り。
- `this.selection`：選択要素の配列（常に `selected` を含む）。単一選択時は要素1個の配列。
- ヘルパ：
  - `_setSelection(elements)`：セットを置換し、主＝末尾、視覚更新＋パネル更新。
  - `_addToSelection(el)` / `_removeFromSelection(el)` / `_clearSelection()`。
  - `_isSelected(el)`。

### 視覚表示
- 選択された各要素に**薄い枠**（`interaction-layer` に矩形 outline、`getBBox×getCTM` で各要素のSVG座標bboxを算出）。
- **主が単一選択のときだけ**、従来の `svgEngine.showSelection(主)`（拡縮/回転ハンドル付き）を表示。複数選択時はハンドル無し（outlineのみ）。
- 既存 `svgEngine.showSelection` / `clearInteraction` を流用。複数枠は `select-tool` 側で `interaction-layer` に描画し、`clearInteraction` でまとめて消去。

### プロパティパネル
- 単一選択：従来どおり `_showProperties(主)`。
- 複数選択：`properties-content` に「N個選択中（移動・削除・コピー・矢印キーで微調整できます）」を表示（編集フィールドは出さない）。

## 3. 各機能の詳細

### 3.1 複数選択（マーキー＋Shift）
`onMouseDown(point, e)`（既存の早期分岐の後）:
- **ラベルドラッグ**（既存）：主が単一で detail-label を掴んだ場合は従来通り（変更なし）。
- アノテーション上で押下：
  - `e.shiftKey`：その要素を選択にトグル（追加/除外）。ドラッグは開始しない。
  - 既に選択集合に含まれる要素：選択維持のまま**一括移動ドラッグ**開始（`isDragging=true`、`elementStart` を全選択分記録）。
  - 集合外の要素（Shift無し）：その要素だけを選択（集合を置換）し、移動ドラッグ開始。
- 空き地で押下（アノテーション無し）：
  - `Shift` 無し：**マーキー開始**（`isMarquee=true`、`marqueeStart=point`、`interaction-layer` にラバーバンド矩形）。
  - 既存の「空クリックで全解除」は marqueeup 時に「矩形が極小（クリック相当）なら全解除」で吸収。

`onMouseMove`:
- マーキー中：ラバーバンド矩形を更新（SVG座標）。
- 一括移動中：`dx,dy` を主にスナップ適用して確定し、**全選択要素に同じ最終デルタ**を適用（各要素の型別 transform/data 更新は既存 move ロジックを要素ごとに呼ぶ形に一般化）。

`onMouseUp`:
- マーキー中：矩形と各注釈の `getBBox×getCTM` bbox の**交差**で選択集合を決定（`QualityChecker._interArea`>0）。矩形が極小ならクリック扱い＝全解除。
- 一括移動終了：`wasManipulating` で履歴記録（既存）。

### 3.2 矢印キー nudge
`tool-manager` の keydown（INPUT/TEXTAREA ガード済み）に追加、または `select-tool` がキーを受ける。選択が空でなく、アクティブが select の時：
- `ArrowUp/Down/Left/Right`：選択全体を `gridSize`（既定0.25m）移動。
- `Shift+Arrow`：`gridSize/5`（微動）。
- 移動は各要素の型別 transform/data を更新（一括移動と同じ内部関数を再利用）。`app.updateChecklist()` で履歴記録。`e.preventDefault()`。

### 3.3 コピー&ペースト
- 内部クリップボード：`app._clipboard`（配列、`StateSerializer.recordFromDataset` のレコード）。
- `Ctrl/Cmd+C`：選択集合を直列化して `app._clipboard` に格納（INPUTフォーカス時は無効）。
- `Ctrl/Cmd+V`：クリップボードの各レコードを **+0.5m,+0.5m offset・新id** で再生成（`StateSerializer.createCallFromRecord` 経由、`figure`/`labelDx/Dy` も継承）。生成した要素群を新しい選択集合にする。`updateChecklist()` で履歴記録。
- 直列化/オフセット適用は純関数 `StateSerializer.offsetRecords(records, dx, dy)`（新規・テスト対象）に切り出す。座標フィールドは型ごとに `x/y`（と wiring-route の vertices）。

### 3.4 選択へズーム
- `app` の zoom-fit ハンドラ（`btn-zoom-fit`）を拡張：`select` ツールに選択があれば、選択集合の**DXF座標 union bbox** を計算して `viewport.fitToExtents(bounds)`。無ければ従来の全体fit。
- 選択bboxは各要素の `getBBox×getCTM`（SVG座標）→ DXF座標（y反転）へ変換して union。

## 4. コンポーネント境界と純関数
- **純関数（Nodeテスト）**：
  - `StateSerializer.offsetRecords(records, dx, dy)`：レコード配列の座標を平行移動（x/y と wiring-route vertices）。
  - マーキー交差・union bbox は `QualityChecker` の矩形ユーティリティ（`_interArea`）を再利用。
- **DOM結合（ブラウザスモーク）**：select-tool の選択集合・マーキー・一括移動・nudge・貼付配置・zoom。

## 5. エラーハンドリング / エッジ
- 空選択での nudge/copy/zoom/delete はノーオップ。
- マーキーが極小（クリック相当）→ 全解除（または単一選択）。
- 一括移動で主のみスナップ、他要素は同一デルタ（相対位置維持）。回転群（充電スペース）の移動は既存ロジック準拠。
- ペーストでクリップボードが空ならノーオップ。貼付で未対応型は `createCallFromRecord` の既存 null ガードでスキップ。
- 複数選択中はプロパティ編集・拡縮・回転を出さない（主単一時のみ）。

## 6. 変更ファイル概要
- `js/tools/select-tool.js`：選択セット・マーキー・一括移動・nudge・複数枠・パネル分岐（中心）。
- `js/tool-manager.js`：矢印キー／Ctrl+C/V を select ツールへ委譲（既存 keydown に追加）。
- `js/app.js`：`_clipboard`、コピー/ペースト処理、zoom-fit 拡張。
- `js/state-serializer.js`：`offsetRecords` 純関数。
- `test/state-serializer.test.js`：offsetRecords テスト。
- （`js/svg-engine.js`：複数枠描画ヘルパが必要なら追加。基本は select-tool 側で interaction-layer に描画）

## 7. 実装順（各段階でテスト＋スモーク＋コミット）
1. 選択セット基盤（`_setSelection` 等）＋Shift-click＋一括移動＋一括削除＋複数枠表示＋パネル分岐。
2. マーキー（矩形）選択。
3. 矢印 nudge（grid / Shift微動）。
4. コピー&ペースト（`offsetRecords` 純関数＋テスト含む）。
5. 選択へズーム（fitボタン拡張）。

## 8. リスクと緩和
- **既存単一操作の回帰**：案B（単一操作は主のみ）で blast radius を限定。各段階で既存80テスト＋E2E＋単一編集スモークを確認。
- **一括移動の型別整合**：既存 move ロジックを要素ごとに適用する内部関数に一般化し、回転群（charging-space）も既存式を流用。
- **キーバインド競合**：矢印/Ctrl+C/V は INPUT/TEXTAREA ガード下で追加。tool 単キー（v/s/c…）とは非競合。
- **履歴**：すべての変更後に `updateChecklist()`（スナップショット記録）。
