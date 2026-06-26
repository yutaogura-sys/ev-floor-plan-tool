# 詳細ラベル表示トグル — 設計書

- 日付: 2026-06-26
- 対象: `C:\Users\Yuta Ogura\Desktop\平面図_AI作図`（EV充電設備 平面図作成ツール）
- 経緯: 操作性の自己確認サイクルで、1つの充電スペースに充電器・基礎・路面表示・寸法が集中すると各要素の説明ラベルが衝突し編集画面が読みづらくなる問題を確認。アプローチ比較（トグル / リーダー線 / 自動回避）の結果、**詳細ラベル表示トグル**を採用。

## 1. 目的とゴール

編集画面の混雑を、**出力（補助金図面）に必要な情報を失わずに**解消する。

### 成功基準
- レイヤーパネルの「詳細ラベル」チェックを外すと、説明系ラベルが**画面上で**非表示になり主識別子だけ残る。再度チェックで戻る。
- 既定はON（現状の見た目を変えない）。
- 編集（プロパティ変更で再構築）後も、隠す/表示の挙動が維持される。
- **PDF出力には詳細ラベルが常に含まれる**（画面トグルの状態によらず）。DXF出力も全情報を含む。
- 既存テスト（45件）が非回帰。

### 非ゴール
- 引き出し線方式・重なり自動回避（別アプローチ。今回は対象外）。
- トグル状態の永続化（セッション内のみ。リロードで既定ONに戻る）。YAGNI。
- 寸法線・テキスト・リーダー・分電盤名・充電器番号など「注釈本体」の非表示化（対象外、常に表示）。

## 2. 「詳細ラベル」の定義

説明・寸法系のサブラベルのみを `detail-label` とする。主識別子・記号は常に表示。

| 要素（create メソッド） | detail-label にする text | 常に表示 |
|---|---|---|
| 充電スペース `createChargingSpace` | `dimLabel`（幅○m×奥行○m） | 【充電スペース①】, 矩形 |
| 基礎 `createFoundation` | `lbl`（充電設備基礎 材質 w×h×d） | 矩形・ハッチ |
| 路面表示 `createRoadMarking` | `lbl`（路面表示 新設 900×900）, `surfLbl`（路面状況：…） | EVマーク, 矩形 |
| 建柱 `createPole` | `lbl`（建柱 材質 H=…） | 円・×記号 |
| ハンドホール `createHandhole` | `lbl`（HH 材質 w×d×h） | 矩形・HH文字 |
| プルボックス `createPullBox` | `lbl`（PB 材質 size） | 矩形・PB文字 |

**対象外（常に表示）**: dimension（寸法線本体）, text（テキスト注釈）, leader（配線/機器/配管注記）, boundary-rect（囲み寸法）, charger のラベル（充電器①＝識別子）, cubicle の label（分電盤＝識別子）, existing-charger の (既設) ラベル, wheel-stop/bollard/lighting（テキストなし）。

> 編集時の再構築（`select-tool.js` の `_rebuildChargingSpace`/`_rebuildFoundation`/`_rebuildPullBox`）も同じ `detail-label` クラスを付与し、編集後に挙動が壊れないようにする。路面表示・建柱・ハンドホールは現状プロパティ変更による再構築経路を持たない（編集してもラベル再生成されない既存仕様）ため、`svg-engine.js` の create での付与のみで足りる。実装時に各型の再構築経路の有無を確認する。

## 3. アーキテクチャ（低リスク・CSSベース）

1. **クラス付与**: 上表の detail テキストに `class: 'detail-label'` を `Utils.createSVGElement('text', { ... , class: 'detail-label' })` で付与（`svg-engine.js` + `select-tool.js` の該当再構築）。
2. **CSS**: `css/style.css` に
   ```css
   #drawing-canvas.labels-hidden .detail-label { display: none; }
   ```
3. **トグルUI**: `index.html` のレイヤーパネル（`#layer-content` 内、出力範囲プレビューの近く）に
   ```html
   <div class="layer-item">
     <input type="checkbox" id="toggle-detail-labels" checked>
     <span class="layer-name">詳細ラベル</span>
   </div>
   ```
4. **トグル配線**: `app.js` で `#toggle-detail-labels` の change を購読し、`#drawing-canvas` に `labels-hidden` クラスを付け外し（checked=表示=クラス無し、unchecked=非表示=クラス付与）。
5. **PDF出力時の保証**: `pdf-exporter.js` は出力用に `#drawing-canvas` を `cloneNode(true)` でクローンしてから加工する（`_prepareSVGString`）。クローン生成直後に `clone.classList.remove('labels-hidden')` を行い、画面トグルの状態によらずPDFには全ラベルが入るようにする。実キャンバスには触れない（ちらつき・復元処理が不要で例外安全）。DXF出力（`dxf-exporter.js`）は `data-*` から再構成するため影響なし（変更不要）。

### コンポーネント境界
- 表示制御はCSSクラス1つに集約（JSは class の付け外しのみ）。レイアウト計算なし＝低リスク。
- detail判定は「テキスト生成時にクラスを付ける」だけで、別モジュールに依存しない。
- 出力の正しさは exporter 側で「一時的に全表示」を保証（表示状態と出力内容を分離）。

## 4. エラーハンドリング / エッジ
- トグル要素やキャンバスが見つからない場合はガードして無視（既存の `if (el)` 慣習に倣う）。
- PDF出力はクローンに対して `labels-hidden` を除去するため、実キャンバスの状態に依存せず常に全ラベルを含む（復元処理不要・例外安全）。

## 5. テスト方針
- ロジックが薄くDOM/CSS中心のため、純ユニットテストは追加しない（既存45件の非回帰のみ確認）。
- ブラウザ スモークで検証:
  1. 合成サンプル配置 → 既定で詳細ラベル表示（従来どおり）。
  2. 「詳細ラベル」OFF → `dimLabel`/基礎/路面表示等が非表示、【充電スペース①】等は残る（snapshot/screenshot）。
  3. ON に戻す → 再表示。
  4. 充電スペースのプロパティ（幅）変更で再構築 → OFF状態が維持される（再構築テキストにも detail-label が付く）。
  5. OFF のまま PDF出力 → 例外なし。出力対象に detail-label が含まれる（出力中に一時表示される）ことを、出力処理前後で `labels-hidden` が一時的に外れ復元されることをフックして確認。

## 6. 変更ファイル概要
- `js/svg-engine.js`（6 create メソッドの detail テキストに class 付与）
- `js/tools/select-tool.js`（`_rebuildChargingSpace`/`_rebuildFoundation`/`_rebuildPullBox` の該当テキストに class 付与）
- `index.html`（レイヤーパネルにチェックボックス）
- `js/app.js`（トグル配線）
- `css/style.css`（`.labels-hidden .detail-label` ルール）
- `js/pdf-exporter.js`（出力時に一時的に全表示→復元）

## 7. リスクと緩和
- **再構築でクラスが失われる**: 再構築経路（select-tool）にも付与してテストで確認。
- **PDF出力にラベルが出ない**: exporter で一時解除＋復元。スモークで確認。
- **既定変更による違和感**: 既定ON＝従来どおりで回避。
