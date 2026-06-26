# 詳細ラベル表示トグル 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 説明系ラベル（幅×奥行・基礎仕様・路面表示文言・建柱/HH/PB仕様）を「詳細ラベル」チェックで画面上だけ非表示にでき、編集時の混雑を解消する（PDF出力には常に含める）。

**Architecture:** 対象テキストに `class="detail-label"` を付与し、`#drawing-canvas.labels-hidden .detail-label { display:none }` で一括制御。チェックボックスが `#drawing-canvas` の `labels-hidden` クラスを付け外し。PDF出力は描画SVGの**クローン**から `labels-hidden` を外して常に全表示。

**Tech Stack:** バニラJS（ビルドなし、ブラウザ グローバル）, CSS, `node --test`（非回帰のみ）。

## Global Constraints

- ブラウザ側はビルドステップなし（`<script>` 直読み込み）。
- 既定はON（従来の見た目を変えない）。チェックを外すと画面上で detail-label が非表示。
- 隠す対象は説明・寸法系のサブラベルのみ。主識別子（【充電スペース①】・充電器番号・分電盤名・HH/PB文字・EVマーク）と、寸法線/テキスト/リーダー/囲み寸法（=注釈本体）は**常に表示**（detail-label を付けない）。
- **PDF出力は常に全ラベルを含める**。DXF出力は `data-*` から再構成のため影響なし（変更不要）。
- フェーズ3で配線ルート図系（建柱/HH/PB等）は `js/svg-shapes-route.js` へ分離済み。pole/handhole/pullbox の create はそこにある（svg-engine.js ではない）。
- DOM/CSS中心でロジックが薄いため純ユニットテストは追加しない。`node --check` ＋ 既存45テスト非回帰 ＋ ブラウザ スモークで検証。

## ファイル構成

| ファイル | 役割 | 区分 |
|---|---|---|
| `css/style.css` | `.labels-hidden .detail-label` ルール | 変更 |
| `js/svg-engine.js` | charging-space/foundation/road-marking の detail テキストに class | 変更 |
| `js/svg-shapes-route.js` | pole/handhole/pullbox の detail テキストに class | 変更 |
| `js/tools/select-tool.js` | `_rebuildChargingSpace`/`_rebuildFoundation`/`_rebuildPullBox` の detail テキストに class | 変更 |
| `index.html` | レイヤーパネルに「詳細ラベル」チェックボックス | 変更 |
| `js/app.js` | チェックボックス → `labels-hidden` クラス付け外し | 変更 |
| `js/pdf-exporter.js` | 出力用クローンから `labels-hidden` を除去 | 変更 |

---

## Task 1: detail-label クラス付与 ＋ CSS ルール

**Files:**
- Modify: `css/style.css`
- Modify: `js/svg-engine.js`（createChargingSpace / createFoundation / createRoadMarking）
- Modify: `js/svg-shapes-route.js`（createPole / createHandhole / createPullBox）
- Modify: `js/tools/select-tool.js`（_rebuildChargingSpace / _rebuildFoundation / _rebuildPullBox）

**Interfaces:**
- Produces: detail テキスト要素が `class="detail-label"` を持ち、祖先 `#drawing-canvas.labels-hidden` で `display:none` になる。

> 各編集は `Utils.createSVGElement('text', { ... })` の属性オブジェクトに `class: 'detail-label'` を追加するだけ。対象は直後の `textContent` で一意に特定できる。主識別子のテキスト（`【充電スペース...】` 等）には付けない。

- [ ] **Step 1: CSS ルールを追加**

`css/style.css` の末尾に追加:

```css
/* 詳細ラベル表示トグル: OFF 時は説明系ラベルを画面上で非表示（PDF出力は別途常に表示） */
#drawing-canvas.labels-hidden .detail-label { display: none; }
```

- [ ] **Step 2: svg-engine.js の charging-space 幅×奥行ラベルに class**

`createChargingSpace` 内、`dimLabel.textContent = `幅${width.toFixed(2)}m×奥行${height.toFixed(1)}m`;` の直前の `dimLabel` 生成属性に `class: 'detail-label'` を追加:

```js
    const dimLabel = Utils.createSVGElement('text', {
      x: width / 2, y: height / 2 + S.fontSmall * 1.2,
      'text-anchor': 'middle', 'font-size': S.fontSmall * 0.85,
      fill: '#cc0000', 'font-family': 'Meiryo, sans-serif',
      class: 'detail-label'
    });
```

（`label`（【充電スペース...】）には付けない。）

- [ ] **Step 3: svg-engine.js の foundation ラベルに class**

`createFoundation` 内、`lbl.textContent = `充電設備基礎 ${material} ${wMm}×${hMm}×${dMm}`;` の直前の `lbl` 生成属性に追加:

```js
    const lbl = Utils.createSVGElement('text', {
      x, y: y + height / 2 + S.fontSmall * 1.5,
      'text-anchor': 'middle', 'font-size': S.fontSmall * 0.85,
      fill: '#333', 'font-family': 'Meiryo, sans-serif',
      class: 'detail-label'
    });
```

- [ ] **Step 4: svg-engine.js の road-marking ラベル2つに class**

`createRoadMarking` 内の `lbl`（`lbl.textContent = '路面表示 新設 900×900';` 直前）と `surfLbl`（`surfLbl.textContent = `（路面状況：${surfaceType}）`;` 直前）の両方の生成属性に `class: 'detail-label'` を追加:

```js
    const lbl = Utils.createSVGElement('text', {
      x, y: y + size / 2 + S.fontSmall * 1.5,
      'text-anchor': 'middle', 'font-size': S.fontSmall * 0.85,
      fill: '#009933', 'font-family': 'Meiryo, sans-serif',
      class: 'detail-label'
    });
```
```js
    const surfLbl = Utils.createSVGElement('text', {
      x, y: y + size / 2 + S.fontSmall * 3,
      'text-anchor': 'middle', 'font-size': S.fontSmall * 0.75,
      fill: '#009933', 'font-family': 'Meiryo, sans-serif',
      class: 'detail-label'
    });
```

（EVマークのテキストには付けない。）

- [ ] **Step 5: svg-shapes-route.js の pole/handhole/pullbox ラベルに class**

`createPole` の `lbl`（`lbl.textContent = `建柱 ${material} H=${height}`;` 直前）, `createHandhole` の `lbl`（`HH ${material} ...` 直前）, `createPullBox` の `lbl`（`PB ${material} ${size}` 直前）の各生成属性に `class: 'detail-label'` を追加（各 `Utils.createSVGElement('text', { ... })` に1行追加）。記号・HH/PB文字には付けない。

- [ ] **Step 6: select-tool.js の再構築メソッドに class**

`_rebuildChargingSpace` の `dimLabel`（`dimLabel.textContent = `幅${w.toFixed(2)}m×奥行${h.toFixed(1)}m`;` 直前）, `_rebuildFoundation` の `lbl`（`充電設備基礎 ...` 直前）, `_rebuildPullBox` の `lbl`（`PB ${material} ${size}` 直前）の各生成属性に `class: 'detail-label'` を追加。

- [ ] **Step 7: 構文チェック & 非回帰テスト**

Run: `node --check js/svg-engine.js && node --check js/svg-shapes-route.js && node --check js/tools/select-tool.js`（全て exit 0）
Run: `npm test`（45 passing）

- [ ] **Step 8: コミット**

```bash
git add css/style.css js/svg-engine.js js/svg-shapes-route.js js/tools/select-tool.js
git commit -m "feat: 説明系ラベルに detail-label クラスを付与し CSS で一括制御可能に"
```

---

## Task 2: 「詳細ラベル」トグルUI ＋ 配線

**Files:**
- Modify: `index.html`（レイヤーパネルにチェックボックス）
- Modify: `js/app.js`（トグル配線）

**Interfaces:**
- Consumes: Task 1 の `detail-label` クラスと CSS。
- Produces: `#toggle-detail-labels`（checked 既定）。change で `#drawing-canvas` に `labels-hidden` を付け外し（unchecked=付与=非表示）。

- [ ] **Step 1: index.html にチェックボックスを追加**

`index.html` のレイヤーパネル `#layer-content` 内、出力範囲プレビューの行（`<input type="checkbox" id="fig-layer-boundary" ...>` を含む `div.layer-item`）の直後に追加:

```html
          <div class="layer-item">
            <input type="checkbox" id="toggle-detail-labels" checked>
            <span class="layer-name">詳細ラベル</span>
          </div>
```

- [ ] **Step 2: app.js でトグルを配線**

`js/app.js` のコンストラクタ末尾付近（`this._offerRestore();` の前など、DOM要素取得が可能な箇所）に追加:

```js
    // 詳細ラベル表示トグル（OFFで説明系ラベルを画面上のみ非表示）
    const detailToggle = document.getElementById('toggle-detail-labels');
    if (detailToggle) {
      detailToggle.addEventListener('change', () => {
        this.svgElement.classList.toggle('labels-hidden', !detailToggle.checked);
      });
    }
```

- [ ] **Step 3: 構文チェック & 非回帰テスト**

Run: `node --check js/app.js`（exit 0）
Run: `npm test`（45 passing）

- [ ] **Step 4: コミット**

```bash
git add index.html js/app.js
git commit -m "feat: 詳細ラベル表示トグルをレイヤーパネルに追加"
```

---

## Task 3: PDF出力は常に詳細ラベルを含める

**Files:**
- Modify: `js/pdf-exporter.js`

**Interfaces:**
- Consumes: 出力用に `#drawing-canvas` をクローンする既存処理（`exportPDF`）。
- Produces: 出力クローンに `labels-hidden` が付かない（＝画面でOFFでもPDFは全ラベル）。

> `pdf-exporter.js` の `exportPDF` は `document.getElementById('drawing-canvas')` を取得し `cloneNode(true)` でクローン（`clone`）を作って加工する。クローン生成直後に `labels-hidden` クラスを外せばよい。実キャンバスには触れないためちらつきなし。

- [ ] **Step 1: クローンから labels-hidden を除去**

`js/pdf-exporter.js` の `exportPDF` 内、`#drawing-canvas` の `cloneNode(true)` で `clone`（または相当の変数名）を生成している箇所の**直後**に1行追加:

```js
    clone.classList.remove('labels-hidden');
```

（変数名が `clone` でない場合は実際のクローン変数名に合わせる。クローン生成は `const svg = document.getElementById('drawing-canvas');` の近傍にある。）

- [ ] **Step 2: 構文チェック & 非回帰テスト**

Run: `node --check js/pdf-exporter.js`（exit 0）
Run: `npm test`（45 passing）

- [ ] **Step 3: コミット**

```bash
git add js/pdf-exporter.js
git commit -m "fix: PDF出力時は詳細ラベルを常に含める（クローンからlabels-hidden除去）"
```

---

## Task 4: ブラウザ スモークテスト

**Files:** なし（手動検証）

**Interfaces:** Consumes 全Task成果。

- [ ] **Step 1: サーバ起動 & コンソール確認**

preview_start（`ev-floor-plan`）。preview_console_logs（level=error）でエラーなし。`#toggle-detail-labels` が表示されること。

- [ ] **Step 2: トグルの表示/非表示**

合成サンプル（充電スペース＋基礎＋路面表示＋寸法）を配置し全体表示。既定（ON）で詳細ラベルが見えることを確認（screenshot）。`#toggle-detail-labels` を unchecked（`document.getElementById('toggle-detail-labels').click()` 等）→ `#drawing-canvas` に `labels-hidden` が付き、`.detail-label`（幅×奥行・基礎仕様・路面表示文言）が消え、【充電スペース①】・寸法線は残ることを確認（screenshot/snapshot）。再度 checked で戻る。

- [ ] **Step 3: 編集後の維持**

OFF状態で充電スペースのプロパティ（幅）を変更（`_rebuildChargingSpace` 経由）→ 再構築後も dimLabel が `detail-label` を持ち非表示のままであることを確認（`document.querySelector('[data-id=...] .detail-label')` の computed display が none / または再構築テキストに class があること）。

- [ ] **Step 4: PDF出力に含まれる**

OFF状態のまま PDF出力を実行し、出力用クローンに `labels-hidden` が付かない（＝detail-label が display:none にならない）ことをフックで確認。例: `_rebuild*` ではなく、`exportPDF` 実行中に生成されるクローンの class を確認する簡易フック、または出力処理が例外なく完了し、別途クローン生成ロジックの単体確認（クローンに `labels-hidden` を付けてから `remove` されること）を eval で検証。最低限、OFF状態でPDF出力が例外なく完了することを確認。

- [ ] **Step 5: クリーンアップ**

preview_eval で注釈クリア・localStorage削除・history.reset・viewBox戻し・`#drawing-canvas` の `labels-hidden` 除去。

---

## Self-Review メモ

- **Spec coverage:** detail-label定義(Task1)、CSS制御(Task1)、トグルUI/配線(Task2)、PDF常時表示(Task3)、検証(Task4)を網羅。DXF出力は影響なし（data-*再構成）と spec 通り変更なし。
- **Placeholder scan:** クローン変数名の「`clone` でなければ実名に合わせる」は実ファイル確認で確定する具体指示（TBDではない）。それ以外プレースホルダなし。
- **Type/命名一貫性:** クラス名 `detail-label` と切替クラス `labels-hidden`、要素ID `toggle-detail-labels` / `drawing-canvas` をTask間で一貫使用。
- **配線ルート図系のファイル:** pole/handhole/pullbox は `svg-shapes-route.js`（Phase3分離後）を対象と明記。
- **依存:** Task1（クラス＋CSS）→ Task2（トグル）。Task3は独立。Task4は全Task後。
- **行番号注意:** 既存ファイルはメソッド名・直後のtextContentで対象を特定（行番号に依存しない）。
