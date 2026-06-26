# 詳細ラベルの手動引き出し線（リーダー線） — 設計書

- 日付: 2026-06-26
- 対象: `C:\Users\Yuta Ogura\Desktop\平面図_AI作図`（EV充電設備 平面図作成ツール）
- 経緯: 改善案 #4。詳細ラベル（充電スペース寸法・基礎・路面表示・建柱・ハンドホール・プルボックスの説明文）が記号と重なり読みづらい問題に対し、ラベルを任意位置へドラッグで離し、元位置と細線（引き出し線）で結べるようにする。アプローチは「手動の引き出し線を追加」をユーザーが選択。

## 1. 目的とゴール

詳細ラベルをドラッグで移動し、移動元（記号近傍）と移動先を細線で結ぶことで、出力情報を失わずに混雑を解消する。

### 成功基準
- 注釈を選択した状態でその詳細ラベルをドラッグすると、ラベルが移動し、ホーム位置（既定位置）から移動先へ引き出し線が引かれる。
- 移動量はオフセット 0 に戻せば引き出し線も消える。
- プロパティ編集で再構築されてもオフセットが維持される。
- 保存/Undo/Redo/復元でオフセットが保持される。
- 引き出し線・ラベルは `detail-label` 扱い（詳細ラベルトグルOFFで一緒に隠れる／PDFには出る）。
- 既存テスト（49件）非回帰。

### 非ゴール
- 重なりの自動回避（今回は手動のみ）。
- 回転した充電スペース上でのドラッグの厳密なローカル座標補正（MVPはワールド差分。回転時は軽微なズレ。既知の制約）。
- 路面表示の2つ目以降の詳細ラベル（路面状況）への個別オフセット（主ラベルのみ対象）。

## 2. アーキテクチャ（低churn）

オフセットは**常に作成直後は0**であるため、create メソッド群（svg-engine / svg-shapes-route）は**変更不要**。再適用が必要な箇所だけに限定する。

1. **データ**: 注釈グループに `data-label-dx`, `data-label-dy`（DXF単位、既定0）。
2. **ヘルパ** `SVGEngine.applyLabelOffset(group)`:
   - 主詳細ラベル `group.querySelector('text.detail-label')` を取得（無ければ何もしない）。
   - 初回呼び出し時、ラベルの現在 x/y を `data-home-x/data-home-y` に保存（=ホーム位置）。
   - `dx,dy = group.dataset.labelDx|Dy`（既定0）。ラベルを `home + (dx,dy)` に配置。
   - `dx=dy=0` なら既存の `line.leader-connector` を除去。さもなくば connector を group 先頭に挿入/更新（`home → home+offset`、`class="leader-connector detail-label"`、薄いグレー）。
3. **ドラッグ**（`select-tool.js`）: `onMouseDown` で、選択中グループ内の `text.detail-label`（connector除く）上で押下したら label-drag モードへ。`onMouseMove` で `point` のワールド差分を offset に加算→`applyLabelOffset`→`showSelection`。`onMouseUp` で履歴記録（`app.updateChecklist`）。
4. **再適用点**（少数）:
   - `select-tool-rebuild.js` の `_rebuildChargingSpace` / `_rebuildFoundation` / `_rebuildPullBox` 末尾で `this.svgEngine.applyLabelOffset(el)`。
   - `_regenerateSelected`（pole/cubicle/existing-charger）で再生成後に offset を再適用。
   - `StateSerializer.deserializeAnnotations` で復元要素に offset を再適用。
5. **シリアライズ**: `figure` と同様に汎用的に `labelDx/labelDy` を捕捉（`recordFromDataset`）・復元（`deserializeAnnotations`）。これで Undo/保存/復元で保持され、ドラッグが履歴差分として検知される。

### コンポーネント境界
- 表示は `applyLabelOffset` に集約（ホーム捕捉→配置→connector管理）。
- 永続化はシリアライザの汎用フィールド追加（型別SCHEMA非依存）。
- create 群は不変＝回帰リスク最小。

## 3. エラーハンドリング / エッジ
- 詳細ラベルが無い型は `applyLabelOffset` が早期return。
- connector はラベルと同じ `detail-label` クラスでトグル/PDFと整合。
- ドラッグ対象が connector 自身の場合は無視（ラベルのみ掴む）。

## 4. テスト方針
- 純ロジックは薄いが、シリアライザの offset 捕捉/復元はユニットテスト追加（`state-serializer.test.js`）。
- ブラウザ スモーク: ラベルドラッグ→引き出し線表示／プロパティ編集後も維持／Undoで戻る／トグルOFFで線も消える。

## 5. 変更ファイル概要
- `js/svg-engine.js`（`applyLabelOffset` 追加）
- `js/tools/select-tool.js`（label-drag モード）
- `js/tools/select-tool-rebuild.js`（3 rebuild + `_regenerateSelected` で再適用）
- `js/state-serializer.js`（`labelDx/labelDy` 捕捉・復元）
- `css/style.css`（`.leader-connector` の見た目、任意）
- `test/state-serializer.test.js`（offset 捕捉テスト）

## 6. リスクと緩和
- **回転充電スペースでのドラッグずれ**: MVPでは既知の制約として許容（多くのラベルは非回転）。
- **再構築でオフセット消失**: 再適用点を網羅しテストで確認。
- **既定挙動の変化**: offset 既定0＝従来どおり。
