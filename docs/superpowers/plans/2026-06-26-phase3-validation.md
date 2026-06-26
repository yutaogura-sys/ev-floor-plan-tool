# フェーズ3（検証＋整理）実装計画 — 補助金要件の記載漏れ検査＋警告 / 大ファイル分割

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補助金要件の「必須の寸法・注釈が描かれているか」を検査し、不足は ⚠ と具体的メッセージで警告する。あわせて肥大した svg-engine.js の一部を責務単位の別ファイルへ切り出す。

**Architecture:** 検証は `StateSerializer.serializeAnnotations()` が返す注釈レコード配列に対する**純粋なルールエンジン** `requirement-validator.js`（`node --test` 可能）として実装し、`app.updateChecklist()` から呼んで ✔/⚠/○/− を描画する。寸法の有無は対象注釈との**近接判定**で近似し、見落とし防止を優先する。整理(#7)は svg-engine.js の配線ルート図系 create メソッドを `svg-shapes-route.js` へ `Object.assign(SVGEngine.prototype, …)` で機械的に分離する（挙動不変）。

**Tech Stack:** バニラJS（ビルドなし、ブラウザ グローバル）, `node --test`（追加依存なし）。

## Global Constraints

- ビルドステップを追加しない（`<script>` 直読み込みのまま）。
- 新規/変更モジュールは **ブラウザ グローバル と Node `require` の両対応**（footer `if (typeof module !== 'undefined' && module.exports) { module.exports = X; }`）。
- 検証エンジンは **純関数**（DOM非依存、レコード配列＋オプションのみ）。`node --test` でテスト。DOM結合（updateChecklist・描画）はブラウザ スモークで確認。
- 既存の注釈レコード形状（`state-serializer` の `serializeAnnotations` 出力）を入力とする。dimension レコードは `{type:'dimension', x, y, x2, y2, ...}`（フェーズ1 Task3で x2/y2 を保存済み）。
- 既存の描画・座標系・`data-*` 契約・図形の見た目を変えない（#7は機械的移動で挙動不変）。
- 座標・寸法は DXF単位（メートル）。近接判定の半径もメートル。
- 検証は「見落とし防止優先」：判定に迷う場合は ⚠（警告）に倒し、誤って ✔（充足）にしない。

## ファイル構成

| ファイル | 役割 | 区分 |
|---|---|---|
| `js/requirement-validator.js` | 純粋なルールエンジン（レコード→要件ごとの status/message） | 新規 |
| `js/app.js` | `updateChecklist` を validator 利用に置換、⚠/メッセージ描画 | 変更 |
| `css/style.css` | チェックリストの ⚠（警告）スタイル・メッセージ表示 | 変更 |
| `index.html` | `requirement-validator.js` と `svg-shapes-route.js` のscript追加 | 変更 |
| `js/svg-shapes-route.js` | svg-engine から配線ルート図系 create メソッドを分離 | 新規 |
| `js/svg-engine.js` | 配線ルート図系 create メソッドを削除（移設） | 変更 |
| `test/requirement-validator.test.js` | 検証エンジンのテスト | 新規 |

---

## Task 1: requirement-validator.js（純粋なルールエンジン）

**Files:**
- Create: `js/requirement-validator.js`
- Test: `test/requirement-validator.test.js`

**Interfaces:**
- Consumes: 注釈レコード配列（`StateSerializer.serializeAnnotations()` 形式）。
- Produces: グローバル `RequirementValidator`。
  - `RequirementValidator.validate(records, opts) -> { [reqId]: { status, message } }`。`opts = { titleBlockComplete: boolean }`。`status ∈ {'ok','warn','missing','na'}`。`message` は warn/missing 時の説明（ok/na では空文字）。
  - 返す reqId（平面図）: `basic-info, space-dim, equip-pos, foundation, line-marking, road-marking, bollard, wheel-stop, lighting`。（配線ルート図）: `route-basic-info, route-wiring, route-equipment, route-pole, route-handhole, route-existing, route-summary`。
  - 内部ヘルパー（同オブジェクトに公開、テスト用）: `RequirementValidator.dimNear(dim, x, y, radius) -> boolean`（dimension レコードの端点・中点のいずれかが (x,y) から radius 以内）。

- [ ] **Step 1: 失敗するテストを書く**

`test/requirement-validator.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const RV = require('../js/requirement-validator.js');

const space = (x, y) => ({ type: 'charging-space', x, y, width: 2.5, height: 5 });
const charger = (x, y) => ({ type: 'charger', x, y });
const dim = (x, y, x2, y2) => ({ type: 'dimension', x, y, x2, y2 });

test('basic-info: titleBlockComplete で ok / 未完で missing', () => {
  assert.strictEqual(RV.validate([], { titleBlockComplete: true })['basic-info'].status, 'ok');
  assert.strictEqual(RV.validate([], { titleBlockComplete: false })['basic-info'].status, 'missing');
});

test('space-dim: スペース無し→missing', () => {
  assert.strictEqual(RV.validate([], {})['space-dim'].status, 'missing');
});

test('space-dim: スペース有り・近くに寸法無し→warn', () => {
  const r = RV.validate([space(0, 0)], {})['space-dim'];
  assert.strictEqual(r.status, 'warn');
  assert.match(r.message, /寸法/);
});

test('space-dim: スペース有り・近くに寸法有り→ok', () => {
  const recs = [space(0, 0), dim(0, 0, 2.5, 0)];
  assert.strictEqual(RV.validate(recs, {})['space-dim'].status, 'ok');
});

test('equip-pos: 充電器有り・寸法無し→warn / 寸法有り→ok', () => {
  assert.strictEqual(RV.validate([charger(1, 1)], {})['equip-pos'].status, 'warn');
  assert.strictEqual(RV.validate([charger(1, 1), dim(1, 1, 1, 3)], {})['equip-pos'].status, 'ok');
});

test('foundation: 有→ok / 無→missing', () => {
  assert.strictEqual(RV.validate([{ type: 'foundation', x: 0, y: 0 }], {})['foundation'].status, 'ok');
  assert.strictEqual(RV.validate([], {})['foundation'].status, 'missing');
});

test('bollard: 条件付き（無→na, 有→ok）', () => {
  assert.strictEqual(RV.validate([], {})['bollard'].status, 'na');
  assert.strictEqual(RV.validate([{ type: 'bollard', x: 0, y: 0 }], {})['bollard'].status, 'ok');
});

test('route-pole/handhole/existing: 条件付き（無→na）, route-summary: 無→missing', () => {
  const v = RV.validate([], {});
  assert.strictEqual(v['route-pole'].status, 'na');
  assert.strictEqual(v['route-handhole'].status, 'na');
  assert.strictEqual(v['route-existing'].status, 'na');
  assert.strictEqual(v['route-summary'].status, 'missing');
});

test('dimNear: 端点・中点で近接判定', () => {
  const d = dim(0, 0, 4, 0); // midpoint (2,0)
  assert.strictEqual(RV.dimNear(d, 0.5, 0, 3), true);   // near start
  assert.strictEqual(RV.dimNear(d, 2, 0.2, 3), true);   // near midpoint
  assert.strictEqual(RV.dimNear(d, 20, 20, 3), false);  // far
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `npm test`
Expected: FAIL（`Cannot find module '../js/requirement-validator.js'`）

- [ ] **Step 3: requirement-validator.js を実装**

`js/requirement-validator.js`:

```js
// RequirementValidator — 補助金要件の「記載漏れ」検査（純関数・DOM非依存）。
// 入力: StateSerializer.serializeAnnotations() のレコード配列。
// 出力: { [reqId]: { status: 'ok'|'warn'|'missing'|'na', message: string } }
const RequirementValidator = {
  // dimension レコードの端点(x,y)/(x2,y2)・中点のいずれかが (px,py) から radius 以内か
  dimNear(dim, px, py, radius) {
    const pts = [
      { x: dim.x, y: dim.y },
      { x: dim.x2, y: dim.y2 },
      { x: (dim.x + dim.x2) / 2, y: (dim.y + dim.y2) / 2 }
    ];
    return pts.some(p => {
      if (typeof p.x !== 'number' || typeof p.y !== 'number' || isNaN(p.x) || isNaN(p.y)) return false;
      const dx = p.x - px, dy = p.y - py;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
  },

  validate(records, opts) {
    records = records || [];
    opts = opts || {};
    const RADIUS = 3; // m: 充電スペース(2.5×5)の近傍を拾える緩めの半径

    const byType = {};
    for (const r of records) (byType[r.type] = byType[r.type] || []).push(r);
    const has = t => (byType[t] || []).length > 0;
    const dims = byType['dimension'] || [];
    const anyDimNear = (targets) => (targets || []).some(t => dims.some(d => this.dimNear(d, t.x, t.y, RADIUS)));

    const ok = () => ({ status: 'ok', message: '' });
    const na = () => ({ status: 'na', message: '' });
    const warn = (m) => ({ status: 'warn', message: m });
    const missing = (m) => ({ status: 'missing', message: m });

    const tb = !!opts.titleBlockComplete;

    return {
      // ===== 平面図 =====
      'basic-info': tb ? ok() : missing('図面基本情報（設置場所・縮尺・作成者・図面名称・作成日）が未入力です'),
      'space-dim': !has('charging-space') ? missing('充電スペースが未配置です')
        : (anyDimNear(byType['charging-space']) ? ok() : warn('充電スペースの幅・奥行きの寸法が見当たりません')),
      'equip-pos': !has('charger') ? missing('充電設備が未配置です')
        : (anyDimNear(byType['charger']) ? ok() : warn('充電スペースと充電設備の位置関係寸法が見当たりません')),
      'foundation': has('foundation') ? ok() : missing('充電設備の基礎が未配置です'),
      'line-marking': has('charging-space') ? ok() : missing('充電スペースのライン引きが未配置です'),
      'road-marking': !has('road-marking') ? missing('路面表示が未配置です')
        : (anyDimNear(byType['road-marking']) ? ok() : warn('路面表示の位置寸法が見当たりません')),
      'bollard': has('bollard') ? ok() : na(),
      'wheel-stop': !has('wheel-stop') ? missing('車止めが未配置です')
        : (anyDimNear(byType['wheel-stop']) ? ok() : warn('充電設備と車止めまでの寸法が見当たりません')),
      'lighting': has('lighting') ? ok() : missing('電灯位置が未配置です'),
      // ===== 配線ルート図 =====
      'route-basic-info': tb ? ok() : missing('図面基本情報が未入力です'),
      'route-wiring': has('wiring-route') ? ok() : missing('配線ルートが未配置です'),
      'route-equipment': (has('cubicle') || has('charger')) ? ok() : missing('キュービクル/分電盤/充電設備が未配置です'),
      'route-pole': has('pole') ? ok() : na(),
      'route-handhole': has('handhole') ? ok() : na(),
      'route-existing': has('existing-charger') ? ok() : na(),
      'route-summary': has('wiring-summary') ? ok() : missing('配線集計表が未生成です')
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RequirementValidator;
}
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `npm test`
Expected: PASS（既存32 + validator 9 = 41 tests）

- [ ] **Step 5: 構文チェック**

Run: `node --check js/requirement-validator.js`
Expected: exit 0

- [ ] **Step 6: コミット**

```bash
git add js/requirement-validator.js test/requirement-validator.test.js
git commit -m "feat: 補助金要件の記載漏れ検査エンジン RequirementValidator を追加"
```

---

## Task 2: validator を updateChecklist に統合＋警告表示

**Files:**
- Modify: `js/app.js`（`updateChecklist` を validator 利用に置換）
- Modify: `index.html`（`requirement-validator.js` のscript追加）
- Modify: `css/style.css`（警告スタイル）

**Interfaces:**
- Consumes: `RequirementValidator.validate`（Task 1）, `StateSerializer.serializeAnnotations`（フェーズ1）, `this.titleBlock.isComplete()`。
- Produces: チェックリスト各 `<li data-req>` に status を反映（✔ ok / ⚠ warn / ○ missing / − na）、warn・missing は `title` 属性＋インラインの `.req-msg` にメッセージ表示。

- [ ] **Step 1: index.html に validator を読み込む**

`index.html` の `<script src="js/review-panel.js"></script>` の直後に追加:

```html
  <script src="js/requirement-validator.js"></script>
```

- [ ] **Step 2: updateChecklist の判定部を validator 利用に置換**

`js/app.js` の `updateChecklist()` 内、`const checks = { ... };` ブロック（`'basic-info'` 〜 `};`）と、その直後の描画ループ `for (const [req, satisfied] of Object.entries(checks)) { ... }` を、以下で**置換**（履歴記録ブロック・exportBoundary・_scheduleAutosave はそのまま残す）:

```js
    const records = StateSerializer.serializeAnnotations(this.svgEngine);
    const results = RequirementValidator.validate(records, { titleBlockComplete: this.titleBlock.isComplete() });

    const ICONS = { ok: '✔', warn: '⚠', missing: '○', na: '–' };
    for (const [req, res] of Object.entries(results)) {
      const li = document.querySelector(`[data-req="${req}"]`);
      if (!li) continue;
      const icon = li.querySelector('.check-icon');
      if (icon) icon.textContent = ICONS[res.status] || '○';
      li.classList.toggle('satisfied', res.status === 'ok');
      li.classList.toggle('req-warn', res.status === 'warn');
      // メッセージ（warn/missing のみ）
      li.title = res.message || '';
      let msgEl = li.querySelector('.req-msg');
      if (res.status === 'warn' && res.message) {
        if (!msgEl) {
          msgEl = document.createElement('span');
          msgEl.className = 'req-msg';
          li.appendChild(msgEl);
        }
        msgEl.textContent = res.message;
      } else if (msgEl) {
        msgEl.remove();
      }
    }
```

- [ ] **Step 3: 警告スタイルを追加**

`css/style.css` の末尾に追加:

```css
/* 補助金要件チェック: 警告表示 */
.checklist li.req-warn { color: #b8860b; }
.checklist .req-msg { display: block; font-size: 10px; color: #b8860b; margin-left: 16px; line-height: 1.3; }
```

- [ ] **Step 4: 構文チェック & ユニットテスト**

Run: `node --check js/app.js`（exit 0）
Run: `npm test`（41 passing）

- [ ] **Step 5: コミット**

```bash
git add js/app.js index.html css/style.css
git commit -m "feat: 要件チェックを RequirementValidator 連携にし、寸法不足を警告表示"
```

---

## Task 3: svg-engine の配線ルート図系 create メソッドを分離（#7）

**Files:**
- Create: `js/svg-shapes-route.js`
- Modify: `js/svg-engine.js`（対象メソッドを削除）
- Modify: `index.html`（`svg-shapes-route.js` のscript追加）

**Interfaces:**
- Consumes: `SVGEngine`（svg-engine.js で定義）, `Utils`。
- Produces: `SVGEngine.prototype` に `createCubicle`/`createPole`/`createHandhole`/`createPullBox`/`createExistingCharger`/`createWiringRoute`/`createWiringSummaryTable` を再付与（呼び出し側のAPIは不変）。

> 目的: 1100行超の svg-engine.js を縮小。**挙動は完全に不変**（メソッド定義を別ファイルへ移動し `Object.assign(SVGEngine.prototype, {...})` で付与するだけ）。移動するメソッドは `this.S` / `this.addToGroup` / `Utils.*` のみに依存し、svg-engine 内のprivateヘルパーに依存しないことを確認済み。

- [ ] **Step 1: svg-shapes-route.js を作成（メソッドを移植）**

`js/svg-engine.js` から次の**7メソッドの定義を切り取り**、`js/svg-shapes-route.js` に移す。新ファイルは以下の形（メソッド本体は svg-engine.js の現行コードをそのまま貼り付け。ここでは骨格を示す）:

```js
// 配線ルート図系の図形生成メソッド（svg-engine.js から分離）。
// SVGEngine.prototype に付与し、呼び出し側API（svgEngine.createCubicle 等）は不変。
Object.assign(SVGEngine.prototype, {
  createCubicle(id, x, y, width = 1.0, height = 0.6, label = '分電盤') {
    /* svg-engine.js の createCubicle の本体をそのまま移植 */
  },
  createPole(id, x, y, material = 'コンクリート', height = '8m') {
    /* 〃 createPole */
  },
  createHandhole(id, x, y, material = 'コンクリート', w = 0.4, d = 0.4, h = 0.4) {
    /* 〃 createHandhole */
  },
  createPullBox(id, x, y, size = '200', material = 'SUS') {
    /* 〃 createPullBox */
  },
  createExistingCharger(id, x, y, rotation = 0, label = '') {
    /* 〃 createExistingCharger */
  },
  createWiringRoute(id, vertices, segments) {
    /* 〃 createWiringRoute */
  },
  createWiringSummaryTable(id, x, y, summaryData) {
    /* 〃 createWiringSummaryTable */
  }
});
```

実装手順:
1. `js/svg-engine.js` を開き、上記7メソッド（`createCubicle` 〜 `createWiringSummaryTable`）の**完全な現行本体**をコピーする。
2. `js/svg-shapes-route.js` の各メソッドの本体に貼り付ける（引数デフォルトは現行のまま維持）。
3. `js/svg-engine.js` から該当7メソッドを**削除**する（クラス本体から取り除く）。`class SVGEngine { ... }` の閉じ括弧やその他メソッドを壊さないよう注意。

> 注: ブラウザ用のグローバル付与のみで良い（Node require は不要。SVGEngine自体がDOM前提のため）。footer不要。

- [ ] **Step 2: index.html に svg-shapes-route.js を読み込む**

`index.html` の `<script src="js/svg-engine.js"></script>` の直後に追加（SVGEngine 定義の後・app.js の前であること）:

```html
  <script src="js/svg-shapes-route.js"></script>
```

- [ ] **Step 3: 構文チェック**

Run: `node --check js/svg-engine.js && node --check js/svg-shapes-route.js`
Expected: 両方 exit 0

- [ ] **Step 4: ユニットテスト（回帰なし）**

Run: `npm test`
Expected: PASS（41 のまま。これらはDOMメソッドでテスト対象外だが、ファイルが壊れていないこと）

- [ ] **Step 5: コミット**

```bash
git add js/svg-engine.js js/svg-shapes-route.js index.html
git commit -m "refactor: 配線ルート図系の図形生成を svg-shapes-route.js に分離"
```

---

## Task 4: ブラウザ スモークテスト（#5 + #7）

**Files:** なし（手動検証）

**Interfaces:** Consumes 全Task成果。

- [ ] **Step 1: サーバ起動 & コンソール確認**

preview_start（`ev-floor-plan`）。preview_console_logs（level=error）でエラーなし。`requirement-validator.js`/`svg-shapes-route.js` 読込でエラーが無いこと。

- [ ] **Step 2: #7 の回帰確認（分離後も配線ルート図形が動く）**

preview_eval で `typeof app.svgEngine.createCubicle === 'function'` 等を確認し、`app.svgEngine.createCubicle(...)`/`createWiringRoute(...)` で実際に描画 → `StateSerializer.serializeAnnotations` が cubicle/wiring-route レコードを返す（往復健全）ことを確認。

- [ ] **Step 3: #5 検証の状態遷移を確認**

preview_eval で次を確認（クリーン状態から段階的に）:
- 何も無い状態 → `RequirementValidator.validate([], {titleBlockComplete:false})` で `space-dim`=missing 等。
- 充電スペースのみ配置（寸法なし）→ チェックリストの「②充電スペース寸法」が **⚠** になり、`.req-msg` に「充電スペースの幅・奥行きの寸法が見当たりません」が出る（preview_snapshot でテキスト確認 / preview_screenshot）。
- スペース近傍に寸法線を配置 → 同項目が **✔** に変わる。

例（eval）:
```js
(() => {
  const eng = app.svgEngine; eng.clearAnnotations();
  app.svgElement.setAttribute('viewBox','-2 -3 14 9');
  eng.createChargingSpace('s1',0,0,2.5,5,'①',0); app.updateChecklist();
  const liWarn = document.querySelector('[data-req="space-dim"]');
  const r1 = { icon: liWarn.querySelector('.check-icon').textContent, msg: (liWarn.querySelector('.req-msg')||{}).textContent };
  eng.createDimension('d1',0,0,2.5,0,'',  '#0066cc'); app.updateChecklist();
  const r2 = liWarn.querySelector('.check-icon').textContent;
  // cleanup
  eng.clearAnnotations(); try{localStorage.removeItem('ev-floorplan-autosave');}catch(e){}
  app.history.reset(StateSerializer.snapshot(eng)); app._updateHistoryButtons();
  app.svgElement.setAttribute('viewBox','-100 -100 200 200');
  return JSON.stringify({ warnIcon: r1.icon, warnMsg: r1.msg, okIcon: r2 });
})()
```
期待: `warnIcon='⚠'`, `warnMsg` に寸法メッセージ, `okIcon='✔'`。

- [ ] **Step 4: スクリーンショットで警告表示を確認**

充電スペースのみの状態で preview_screenshot を撮り、右パネルの要件チェックに ⚠ とメッセージが表示されていることを確認。

- [ ] **Step 5: クリーンアップ**

preview_eval で注釈クリア・localStorage削除・history.reset・viewBox戻し。

- [ ] **Step 6: 体裁が崩れていれば最小限のCSS調整のみコミット**

---

## Self-Review メモ

- **Spec coverage:** #5（検証エンジン=Task1、updateChecklist連携＋警告UI=Task2、検証=Task4）、#7（svg-engine分割=Task3、検証エンジンという focused module 追加でも整理に寄与、テスト追加=Task1）。
- **Placeholder scan:** Task3 の移植本体は「現行コードをそのまま移植」と明示（具体物が既存ファイルに存在し、骨格＋手順を提示）。それ以外はプレースホルダなし。
- **Type consistency:** `RequirementValidator.validate(records, {titleBlockComplete})` / `dimNear(dim,px,py,radius)` / status 値 `ok|warn|missing|na` / reqId 群をTask間で一貫使用。reqId は index.html の `data-req` と一致（basic-info, space-dim, equip-pos, foundation, line-marking, road-marking, bollard, wheel-stop, lighting, route-*）。
- **挙動不変(#7):** Task3 はメソッド移動のみ。検証は serialize 往復＋ブラウザ スモーク（create メソッド実行）。
- **行番号注意:** 既存ファイルの編集位置はメソッド名・近傍コードで特定。
- **依存:** Task1（validator）→ Task2（連携）。Task3 は独立。Task4 は全Task後。
