# フェーズ1（土台）実装計画 — シリアライズ / Undo・Redo / 保存・復元

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 図面状態をJSONへ相互変換できるようにし、堅牢なUndo/Redoとプロジェクト保存・自動保存を実装して「作業消失」と「操作が戻せない」を解消する。

**Architecture:** 注釈はSVG DOM要素（`data-*` 属性付き `<g>`）のまま維持し、DOM⇄JSONを変換する `state-serializer.js` を新設。各図形タイプの「コンストラクタ引数 ⇔ `data-*` 属性」対応を純データの `SCHEMA` テーブルで一元管理し、純関数（`recordFromDataset` / `createCallFromRecord`）をNodeでテストする。`history.js` はスナップショット文字列スタックでUndo/Redoを提供。保存はJSONダウンロード＋`localStorage`自動保存。

**Tech Stack:** バニラJS（ビルドなし、ブラウザ グローバル）, Node.js 組込みテストランナー `node --test`（追加依存なし）。

## Global Constraints

- ビルドステップを追加しない（`<script>` 直読み込みのまま）。
- 新規JSモジュールは **ブラウザ グローバル と Node `require` の両対応** にする（ファイル末尾に `if (typeof module !== 'undefined' && module.exports) { module.exports = X; }`）。
- DOMに依存する処理（`document` / `getBBox` / `svgEngine`）は**ユニットテストしない**。純ロジックのみ `node --test` で検証し、DOM結合はブラウザ スモークテストで確認する。
- 座標・寸法は全てDXF単位（メートル）。`data-*` 数値は文字列で格納され、読み出し時に `parseFloat` する。
- 既存の図形描画の見た目・座標系を変えない（属性追加は副作用なし）。
- 注釈の一意IDは既存形式（`Utils.generateId()` = `id_...`）を維持し、復元時は保存済みIDを再利用する。

---

## ファイル構成

| ファイル | 役割 | 区分 |
|---|---|---|
| `js/utils.js` | 既存ユーティリティ。Node対応の export 追加のみ | 変更 |
| `js/state-serializer.js` | SCHEMA + 純変換関数 + DOM serialize/deserialize/snapshot/restore | 新規 |
| `js/history.js` | スナップショット スタック（push/undo/redo/canUndo/canRedo/トリム） | 新規 |
| `js/svg-engine.js` | 復元に必要な欠落 `data-*` 属性を補完 | 変更 |
| `js/app.js` | 旧undo撤去、History配線、操作時のpush、保存/開く/自動保存配線、キーバインド | 変更 |
| `index.html` | 保存/開く/Undo/Redoボタン、scriptタグ追加 | 変更 |
| `test/utils.test.js` | `Utils.parseScale` のテスト（ハーネス検証） | 新規 |
| `test/state-serializer.test.js` | 純変換関数の往復テスト | 新規 |
| `test/history.test.js` | History の状態遷移テスト | 新規 |
| `package.json` | `test` スクリプト追加 | 変更 |

---

## Task 1: テストハーネス整備と utils.js のNode対応

**Files:**
- Modify: `package.json`
- Modify: `js/utils.js:115`（末尾に export 追加）
- Test: `test/utils.test.js`（新規）

**Interfaces:**
- Produces: `node --test` が実行可能になる。`require('../js/utils.js')` で `Utils`（`parseScale`, `formatDimension` 等）が得られる。

- [ ] **Step 1: テストスクリプトを追加**

`package.json` を次に変更（既存 dependencies は保持）:

```json
{
  "scripts": {
    "test": "node --test test/"
  },
  "dependencies": {
    "pdf-to-img": "^5.0.0",
    "sharp": "^0.34.5"
  }
}
```

- [ ] **Step 2: 失敗するテストを書く**

`test/utils.test.js` を新規作成:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const Utils = require('../js/utils.js');

test('parseScale: A3:1/100 → 100', () => {
  assert.strictEqual(Utils.parseScale('A3:1/100'), 100);
});

test('parseScale: 1/50 → 50', () => {
  assert.strictEqual(Utils.parseScale('1/50'), 50);
});

test('parseScale: 1:200 → 200', () => {
  assert.strictEqual(Utils.parseScale('1:200'), 200);
});

test('parseScale: 空文字 → null', () => {
  assert.strictEqual(Utils.parseScale(''), null);
});
```

- [ ] **Step 3: テスト実行（失敗を確認）**

Run: `npm test`
Expected: FAIL（`Cannot find module` ではなく、`Utils` が `undefined` 由来のエラー。現状 `utils.js` は何も export していないため `Utils.parseScale` で `TypeError: Cannot read properties of undefined`）。

- [ ] **Step 4: utils.js にNode export を追加**

`js/utils.js` の末尾（115行目 `};` の直後）に追記:

```js

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
```

- [ ] **Step 5: テスト実行（成功を確認）**

Run: `npm test`
Expected: PASS（4 tests）

- [ ] **Step 6: コミット**

```bash
git add package.json js/utils.js test/utils.test.js
git commit -m "test: node --test ハーネス整備と utils.js のNode対応"
```

---

## Task 2: state-serializer の SCHEMA と純変換関数

**Files:**
- Create: `js/state-serializer.js`
- Test: `test/state-serializer.test.js`

**Interfaces:**
- Consumes: なし（純データ・純関数）。
- Produces:
  - `StateSerializer.SCHEMA`: `{ [type]: { method, fields } }`。`fields` は `[{ name, key, kind }]`（`kind` は `'number'|'string'`）。`key` は `dataset` のキャメルキー。
  - `StateSerializer.recordFromDataset(type, dataset) -> record | null`：`dataset`（プレーンobject、値は文字列）から `{ type, id, ...fields }` を生成。未知typeは `null`。
  - `StateSerializer.createCallFromRecord(record) -> { method, args } | null`：`{ method, args: [id, ...fieldValues] }`。未知typeは `null`。
  - 特殊type `wiring-route` / `wiring-summary` はJSON値（`routeData` / `summaryData`）を扱う。

- [ ] **Step 1: 失敗するテストを書く**

`test/state-serializer.test.js` を新規作成:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const StateSerializer = require('../js/state-serializer.js');

test('recordFromDataset: charging-space を数値変換して復元', () => {
  const ds = { id: 'a1', type: 'charging-space', x: '1.5', y: '2', width: '2.5', height: '5', number: '①', rotation: '0' };
  const rec = StateSerializer.recordFromDataset('charging-space', ds);
  assert.deepStrictEqual(rec, { type: 'charging-space', id: 'a1', x: 1.5, y: 2, width: 2.5, height: 5, number: '①', rotation: 0 });
});

test('createCallFromRecord: charging-space は createChargingSpace に正しい引数順で渡す', () => {
  const rec = { type: 'charging-space', id: 'a1', x: 1.5, y: 2, width: 2.5, height: 5, number: '①', rotation: 0 };
  const call = StateSerializer.createCallFromRecord(rec);
  assert.strictEqual(call.method, 'createChargingSpace');
  assert.deepStrictEqual(call.args, ['a1', 1.5, 2, 2.5, 5, '①', 0]);
});

test('charger: label と standType を保持して往復一致', () => {
  const ds = { id: 'c1', type: 'charger', x: '0', y: '0', rotation: '90', label: '充電器①', standType: 'パイルスタンド' };
  const rec = StateSerializer.recordFromDataset('charger', ds);
  const call = StateSerializer.createCallFromRecord(rec);
  assert.strictEqual(call.method, 'createCharger');
  assert.deepStrictEqual(call.args, ['c1', 0, 0, 90, '充電器①', 'パイルスタンド']);
});

test('dimension: x2/y2/labelOverride/color を保持', () => {
  const ds = { id: 'd1', type: 'dimension', x: '0', y: '0', x2: '2.5', y2: '0', labelOverride: '2,500', color: '#0066cc' };
  const rec = StateSerializer.recordFromDataset('dimension', ds);
  const call = StateSerializer.createCallFromRecord(rec);
  assert.strictEqual(call.method, 'createDimension');
  assert.deepStrictEqual(call.args, ['d1', 0, 0, 2.5, 0, '2,500', '#0066cc']);
});

test('leader: textX/textY/lines(JSON配列) を保持', () => {
  const ds = { id: 'l1', type: 'leader', x: '1', y: '1', textX: '3', textY: '0', lines: '["WL1","8sq"]', color: '#cc6600' };
  const rec = StateSerializer.recordFromDataset('leader', ds);
  assert.deepStrictEqual(rec.lines, ['WL1', '8sq']);
  const call = StateSerializer.createCallFromRecord(rec);
  assert.strictEqual(call.method, 'createLeaderAnnotation');
  assert.deepStrictEqual(call.args, ['l1', 1, 1, 3, 0, ['WL1', '8sq'], '#cc6600']);
});

test('text: 本文と fontSize を保持', () => {
  const ds = { id: 't1', type: 'text', x: '0', y: '0', text: '建物', fontSize: '0.5', color: '#333' };
  const rec = StateSerializer.recordFromDataset('text', ds);
  const call = StateSerializer.createCallFromRecord(rec);
  assert.deepStrictEqual(call.args, ['t1', 0, 0, '建物', 0.5, '#333']);
});

test('wiring-route: routeData(JSON) を vertices/segments に展開', () => {
  const routeData = { vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }], segments: [{ method: 'exposed' }] };
  const ds = { id: 'w1', type: 'wiring-route', x: '0', y: '0', routeData: JSON.stringify(routeData) };
  const rec = StateSerializer.recordFromDataset('wiring-route', ds);
  const call = StateSerializer.createCallFromRecord(rec);
  assert.strictEqual(call.method, 'createWiringRoute');
  assert.deepStrictEqual(call.args, ['w1', routeData.vertices, routeData.segments]);
});

test('未知typeは null', () => {
  assert.strictEqual(StateSerializer.recordFromDataset('unknown', { id: 'x' }), null);
  assert.strictEqual(StateSerializer.createCallFromRecord({ type: 'unknown', id: 'x' }), null);
});
```

- [ ] **Step 2: テスト実行（失敗を確認）**

Run: `npm test`
Expected: FAIL（`Cannot find module '../js/state-serializer.js'`）

- [ ] **Step 3: state-serializer.js を実装（SCHEMA + 純関数）**

`js/state-serializer.js` を新規作成:

```js
// State Serializer — DOM(注釈) ⇄ JSON 相互変換
// SCHEMA は各注釈タイプの「createXxx 引数順」と「data-* 属性キー」の対応表。
const StateSerializer = {
  // kind: 'number' は parseFloat、'string' はそのまま、'json' は JSON.parse/stringify
  SCHEMA: {
    'charging-space': {
      method: 'createChargingSpace',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'width', key: 'width', kind: 'number' },
        { name: 'height', key: 'height', kind: 'number' },
        { name: 'number', key: 'number', kind: 'string' },
        { name: 'rotation', key: 'rotation', kind: 'number' }
      ]
    },
    'charger': {
      method: 'createCharger',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'rotation', key: 'rotation', kind: 'number' },
        { name: 'label', key: 'label', kind: 'string' },
        { name: 'standType', key: 'standType', kind: 'string' }
      ]
    },
    'road-marking': {
      method: 'createRoadMarking',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'surfaceType', key: 'surfaceType', kind: 'string' }
      ]
    },
    'wheel-stop': {
      method: 'createWheelStop',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'rotation', key: 'rotation', kind: 'number' }
      ]
    },
    'bollard': {
      method: 'createBollard',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' }
      ]
    },
    'lighting': {
      method: 'createLighting',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' }
      ]
    },
    'foundation': {
      method: 'createFoundation',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'width', key: 'width', kind: 'number' },
        { name: 'height', key: 'height', kind: 'number' },
        { name: 'depth', key: 'depth', kind: 'number' },
        { name: 'material', key: 'material', kind: 'string' }
      ]
    },
    'leader': {
      method: 'createLeaderAnnotation',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'textX', key: 'textX', kind: 'number' },
        { name: 'textY', key: 'textY', kind: 'number' },
        { name: 'lines', key: 'lines', kind: 'json' },
        { name: 'color', key: 'color', kind: 'string' }
      ]
    },
    'dimension': {
      method: 'createDimension',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'x2', key: 'x2', kind: 'number' },
        { name: 'y2', key: 'y2', kind: 'number' },
        { name: 'labelOverride', key: 'labelOverride', kind: 'string' },
        { name: 'color', key: 'color', kind: 'string' }
      ]
    },
    'boundary-rect': {
      method: 'createBoundaryRect',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'width', key: 'width', kind: 'number' },
        { name: 'height', key: 'height', kind: 'number' },
        { name: 'color', key: 'color', kind: 'string' }
      ]
    },
    'text': {
      method: 'createTextAnnotation',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'text', key: 'text', kind: 'string' },
        { name: 'fontSize', key: 'fontSize', kind: 'number' },
        { name: 'color', key: 'color', kind: 'string' }
      ]
    },
    'cubicle': {
      method: 'createCubicle',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'width', key: 'width', kind: 'number' },
        { name: 'height', key: 'height', kind: 'number' },
        { name: 'label', key: 'label', kind: 'string' }
      ]
    },
    'pole': {
      method: 'createPole',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'material', key: 'material', kind: 'string' },
        { name: 'poleHeight', key: 'poleHeight', kind: 'string' }
      ]
    },
    'handhole': {
      method: 'createHandhole',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'material', key: 'material', kind: 'string' },
        { name: 'hhW', key: 'hhW', kind: 'number' },
        { name: 'hhD', key: 'hhD', kind: 'number' },
        { name: 'hhH', key: 'hhH', kind: 'number' }
      ]
    },
    'pullbox': {
      method: 'createPullBox',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'pbSize', key: 'pbSize', kind: 'string' },
        { name: 'material', key: 'material', kind: 'string' }
      ]
    },
    'existing-charger': {
      method: 'createExistingCharger',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'rotation', key: 'rotation', kind: 'number' },
        { name: 'label', key: 'label', kind: 'string' }
      ]
    },
    'wiring-route': {
      method: 'createWiringRoute',
      special: 'wiring-route'
    },
    'wiring-summary': {
      method: 'createWiringSummaryTable',
      special: 'wiring-summary'
    }
  },

  _coerce(kind, raw) {
    if (kind === 'number') return parseFloat(raw);
    if (kind === 'json') {
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
    return raw !== undefined && raw !== null ? String(raw) : '';
  },

  recordFromDataset(type, dataset) {
    const def = this.SCHEMA[type];
    if (!def) return null;
    const id = dataset.id;
    if (def.special === 'wiring-route') {
      let routeData = null;
      try { routeData = JSON.parse(dataset.routeData); } catch (e) { routeData = null; }
      return { type, id, routeData };
    }
    if (def.special === 'wiring-summary') {
      let summaryData = null;
      try { summaryData = JSON.parse(dataset.summaryData); } catch (e) { summaryData = null; }
      return { type, id, x: parseFloat(dataset.x), y: parseFloat(dataset.y), summaryData };
    }
    const rec = { type, id };
    for (const f of def.fields) {
      rec[f.name] = this._coerce(f.kind, dataset[f.key]);
    }
    return rec;
  },

  createCallFromRecord(record) {
    const def = this.SCHEMA[record.type];
    if (!def) return null;
    if (def.special === 'wiring-route') {
      const rd = record.routeData || { vertices: [], segments: [] };
      return { method: def.method, args: [record.id, rd.vertices, rd.segments] };
    }
    if (def.special === 'wiring-summary') {
      return { method: def.method, args: [record.id, record.x, record.y, record.summaryData] };
    }
    const args = [record.id];
    for (const f of def.fields) {
      args.push(record[f.name]);
    }
    return { method: def.method, args };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StateSerializer;
}
```

- [ ] **Step 4: テスト実行（成功を確認）**

Run: `npm test`
Expected: PASS（utils 4 + serializer 8 = 12 tests）

- [ ] **Step 5: コミット**

```bash
git add js/state-serializer.js test/state-serializer.test.js
git commit -m "feat: state-serializer の SCHEMA と純変換関数を追加"
```

---

## Task 3: svg-engine に欠落 data-* 属性を補完

**Files:**
- Modify: `js/svg-engine.js`（複数の `createXxx` の属性オブジェクト）

**Interfaces:**
- Consumes: Task 2 の SCHEMA が前提とする `data-*` キー。
- Produces: 各 `createXxx` が生成する `<g>` が SCHEMA の全 `key` に対応する `data-*` を持つ（serialize がロスレスになる）。

> 注: `data-stand-type` → `dataset.standType`、`data-text-x` → `dataset.textX` のように、ハイフン区切り属性はキャメルケースで `dataset` に現れる。SCHEMA の `key` はキャメルケースで定義済み。

- [ ] **Step 1: charger に label を追加**

`js/svg-engine.js` の `createCharger` 属性オブジェクト（351-356行付近）を変更:

```js
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'charger', 'data-figure': 'shared',
      'data-x': x, 'data-y': y, 'data-rotation': rotation,
      'data-stand-type': standType, 'data-label': label,
      transform: `translate(${x},${y}) rotate(${rotation})`
    });
```

- [ ] **Step 2: road-marking に surface-type を追加**

`createRoadMarking` 属性オブジェクト（407-410行付近）を変更:

```js
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'road-marking', 'data-figure': 'plan',
      'data-x': x, 'data-y': y, 'data-surface-type': surfaceType
    });
```

- [ ] **Step 3: wheel-stop に rotation を追加**

`createWheelStop` 属性オブジェクト（448-452行付近）を変更:

```js
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'wheel-stop', 'data-figure': 'plan',
      'data-x': x, 'data-y': y, 'data-rotation': rotation,
      transform: `translate(${x},${y}) rotate(${rotation})`
    });
```

- [ ] **Step 4: foundation に depth と material を追加**

`createFoundation` 属性オブジェクト（501-504行付近）を変更:

```js
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'foundation', 'data-figure': 'plan',
      'data-x': x, 'data-y': y, 'data-width': width, 'data-height': height,
      'data-depth': depth, 'data-material': material
    });
```

- [ ] **Step 5: leader に text-x / text-y / lines を追加**

`createLeaderAnnotation` 属性オブジェクト（540-543行付近）を変更:

```js
    const lineArrayForData = Array.isArray(lines) ? lines : [lines];
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'leader', 'data-figure': 'shared',
      'data-x': targetX, 'data-y': targetY, 'data-color': color,
      'data-text-x': textX, 'data-text-y': textY,
      'data-lines': JSON.stringify(lineArrayForData)
    });
```

- [ ] **Step 6: dimension に x2 / y2 / label-override を追加**

`createDimension` 属性オブジェクト（582-585行付近）を変更:

```js
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'dimension', 'data-figure': 'shared',
      'data-x': x1, 'data-y': y1, 'data-x2': x2, 'data-y2': y2,
      'data-label-override': labelOverride || '', 'data-color': color
    });
```

- [ ] **Step 7: text に text 本文と font-size を追加**

`createTextAnnotation` 属性オブジェクト（734-737行付近）を変更:

```js
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'text', 'data-figure': 'shared',
      'data-x': x, 'data-y': y, 'data-color': color,
      'data-text': text, 'data-font-size': (fontSize !== undefined && fontSize !== null) ? fontSize : ''
    });
```

- [ ] **Step 8: existing-charger に label を追加**

`createExistingCharger` 属性オブジェクト（884-888行付近）を変更:

```js
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'existing-charger', 'data-figure': 'route',
      'data-x': x, 'data-y': y, 'data-rotation': rotation, 'data-label': label,
      transform: `translate(${x},${y}) rotate(${rotation})`
    });
```

- [ ] **Step 9: wiring-summary に summary-data を追加**

`createWiringSummaryTable` 属性オブジェクト（1001-1004行付近）を変更:

```js
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'wiring-summary', 'data-figure': 'route',
      'data-x': x, 'data-y': y,
      'data-summary-data': JSON.stringify(summaryData)
    });
```

- [ ] **Step 10: 構文チェック**

Run: `node --check js/svg-engine.js`
Expected: エラーなし（終了コード0、出力なし）

- [ ] **Step 11: コミット**

```bash
git add js/svg-engine.js
git commit -m "feat: 復元に必要な data-* 属性を svg-engine に補完"
```

---

## Task 4: state-serializer の DOM serialize / deserialize / snapshot / restore

**Files:**
- Modify: `js/state-serializer.js`（DOMグルー関数を追記）

**Interfaces:**
- Consumes: `svgEngine.getAnnotations()`（`[data-id]` のNodeList）, `svgEngine.clearAnnotations()`, `svgEngine[createMethod](...)`。Task 2 の `recordFromDataset` / `createCallFromRecord`。
- Produces:
  - `StateSerializer.serializeAnnotations(svgEngine) -> record[]`
  - `StateSerializer.deserializeAnnotations(svgEngine, records) -> void`
  - `StateSerializer.snapshot(svgEngine) -> string`（annotation配列のJSON文字列）
  - `StateSerializer.restore(svgEngine, snapshotString) -> void`

> このTaskはDOM依存のためユニットテストせず、Task 10 のブラウザ スモークで検証する。`node --check` の構文チェックのみ行う。

- [ ] **Step 1: DOMグルー関数を追記**

`js/state-serializer.js` の `createCallFromRecord` の後（`}` の直前、`SCHEMA`オブジェクトのメソッドとして）に追加:

```js
,

  serializeAnnotations(svgEngine) {
    const out = [];
    const nodes = svgEngine.getAnnotations();
    nodes.forEach(node => {
      const type = node.dataset.type;
      if (!type || !this.SCHEMA[type]) return; // 未対応はスキップ
      const rec = this.recordFromDataset(type, node.dataset);
      if (rec) out.push(rec);
    });
    return out;
  },

  deserializeAnnotations(svgEngine, records) {
    svgEngine.clearAnnotations();
    let skipped = 0;
    for (const rec of (records || [])) {
      const call = this.createCallFromRecord(rec);
      if (!call || typeof svgEngine[call.method] !== 'function') { skipped++; continue; }
      try {
        svgEngine[call.method].apply(svgEngine, call.args);
      } catch (e) {
        skipped++;
        console.warn('注釈の復元に失敗:', rec.type, rec.id, e);
      }
    }
    if (skipped > 0) console.warn(`${skipped}件の注釈を復元できませんでした`);
    return { restored: (records || []).length - skipped, skipped };
  },

  snapshot(svgEngine) {
    return JSON.stringify(this.serializeAnnotations(svgEngine));
  },

  restore(svgEngine, snapshotString) {
    let records = [];
    try { records = JSON.parse(snapshotString) || []; } catch (e) { records = []; }
    return this.deserializeAnnotations(svgEngine, records);
  }
```

- [ ] **Step 2: 構文チェック**

Run: `node --check js/state-serializer.js`
Expected: エラーなし

- [ ] **Step 3: 既存ユニットテストが壊れていないか確認**

Run: `npm test`
Expected: PASS（12 tests のまま。新規DOM関数はテスト対象外）

- [ ] **Step 4: コミット**

```bash
git add js/state-serializer.js
git commit -m "feat: state-serializer に DOM serialize/deserialize/snapshot/restore を追加"
```

---

## Task 5: history.js（スナップショット スタック）

**Files:**
- Create: `js/history.js`
- Test: `test/history.test.js`

**Interfaces:**
- Consumes: なし（文字列スナップショットを保持するだけの汎用スタック）。
- Produces: `History` クラス。
  - `new History(limit = 50)`
  - `record(snapshotString)`：現在位置以降のredo履歴を破棄して追加。`limit` 超過で先頭を捨てる。
  - `undo() -> string | null`：1つ前のスナップショットを返す（先頭で `null`）。
  - `redo() -> string | null`：1つ先のスナップショットを返す（末尾で `null`）。
  - `canUndo() -> boolean` / `canRedo() -> boolean`
  - `reset(snapshotString)`：履歴を1要素に初期化。

- [ ] **Step 1: 失敗するテストを書く**

`test/history.test.js` を新規作成:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const History = require('../js/history.js');

test('初期状態: canUndo/canRedo は false', () => {
  const h = new History();
  h.reset('S0');
  assert.strictEqual(h.canUndo(), false);
  assert.strictEqual(h.canRedo(), false);
});

test('record 後に undo で前の状態へ', () => {
  const h = new History();
  h.reset('S0');
  h.record('S1');
  assert.strictEqual(h.canUndo(), true);
  assert.strictEqual(h.undo(), 'S0');
  assert.strictEqual(h.canRedo(), true);
});

test('undo 後の redo で次の状態へ', () => {
  const h = new History();
  h.reset('S0');
  h.record('S1');
  h.undo();
  assert.strictEqual(h.redo(), 'S1');
  assert.strictEqual(h.canRedo(), false);
});

test('undo 後の record で redo 履歴が破棄される', () => {
  const h = new History();
  h.reset('S0');
  h.record('S1');
  h.undo();          // 位置はS0
  h.record('S2');    // S1は破棄
  assert.strictEqual(h.canRedo(), false);
  assert.strictEqual(h.undo(), 'S0');
});

test('limit を超えると先頭が捨てられる', () => {
  const h = new History(3);
  h.reset('S0');
  h.record('S1');
  h.record('S2');
  h.record('S3'); // [S1,S2,S3] に切り詰め（S0破棄）
  assert.strictEqual(h.undo(), 'S2');
  assert.strictEqual(h.undo(), 'S1');
  assert.strictEqual(h.canUndo(), false);
});

test('境界: 先頭で undo は null、末尾で redo は null', () => {
  const h = new History();
  h.reset('S0');
  assert.strictEqual(h.undo(), null);
  assert.strictEqual(h.redo(), null);
});
```

- [ ] **Step 2: テスト実行（失敗を確認）**

Run: `npm test`
Expected: FAIL（`Cannot find module '../js/history.js'`）

- [ ] **Step 3: history.js を実装**

`js/history.js` を新規作成:

```js
// History — スナップショット文字列スタックによる Undo/Redo
class History {
  constructor(limit = 50) {
    this.limit = limit;
    this.stack = [];
    this.index = -1;
  }

  reset(snapshotString) {
    this.stack = [snapshotString];
    this.index = 0;
  }

  record(snapshotString) {
    // 現在位置より後（redo分）を破棄
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(snapshotString);
    // 上限超過なら先頭を捨てる
    if (this.stack.length > this.limit) {
      this.stack.shift();
    }
    this.index = this.stack.length - 1;
  }

  canUndo() { return this.index > 0; }
  canRedo() { return this.index < this.stack.length - 1; }

  undo() {
    if (!this.canUndo()) return null;
    this.index--;
    return this.stack[this.index];
  }

  redo() {
    if (!this.canRedo()) return null;
    this.index++;
    return this.stack[this.index];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = History;
}
```

- [ ] **Step 4: テスト実行（成功を確認）**

Run: `npm test`
Expected: PASS（utils 4 + serializer 8 + history 6 = 18 tests）

- [ ] **Step 5: コミット**

```bash
git add js/history.js test/history.test.js
git commit -m "feat: History（スナップショット式Undo/Redo）を追加"
```

---

## Task 6: index.html にスクリプト・ツールバーボタンを追加

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `js/state-serializer.js`, `js/history.js`（Task 2,4,5）。
- Produces: DOM上に以下のボタン要素（Task 7,8で配線）:
  - `#btn-undo`, `#btn-redo`（ヘッダー右）
  - `#btn-save-project`, `#btn-open-project`（ヘッダー右）
  - `#file-open-project`（hidden file input, accept=".json"）

- [ ] **Step 1: scriptタグを追加**

`index.html` の `<script src="js/utils.js"></script>`（378行）の直後に追加:

```html
  <script src="js/state-serializer.js"></script>
  <script src="js/history.js"></script>
```

- [ ] **Step 2: ヘッダーに保存/開く/Undo/Redoボタンを追加**

`index.html` の `<div class="header-right">`（44行）の中、先頭（`<button class="btn-primary" id="btn-export-plan" ...>` の前）に追加:

```html
      <button class="btn-secondary" id="btn-undo" title="元に戻す (Ctrl+Z)" disabled>↶ 戻す</button>
      <button class="btn-secondary" id="btn-redo" title="やり直し (Ctrl+Y)" disabled>↷ やり直し</button>
      <button class="btn-secondary" id="btn-open-project" title="プロジェクトを開く">📂 開く</button>
      <button class="btn-secondary" id="btn-save-project" title="プロジェクトを保存">💾 保存</button>
      <input type="file" id="file-open-project" accept=".json" hidden>
```

- [ ] **Step 3: 構文確認（ブラウザ読込）**

Run: preview_start でサーバ起動 → preview_console_logs でエラーがないこと、`#btn-undo` 等が表示されることを確認（詳細な動作確認はTask 10）。
Expected: コンソールエラーなし。ヘッダーに4ボタンが表示。

- [ ] **Step 4: コミット**

```bash
git add index.html
git commit -m "feat: 保存/開く/Undo/Redo ボタンとscript読込を追加"
```

---

## Task 7: app.js に History を配線（Undo/Redo・操作時push・キーバインド）

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `History`（Task 5）, `StateSerializer.snapshot/restore`（Task 4）, `#btn-undo`/`#btn-redo`（Task 6）。
- Produces:
  - `app.history`（History インスタンス）
  - `app.pushHistory()`：現在のスナップショットを記録しボタン活性を更新。
  - `app.doUndo()` / `app.doRedo()`：restore してチェックリスト・ボタン更新。
  - `app._updateHistoryButtons()`

> 既存の各ツールは配置時に `app.updateChecklist()` を呼んでいる。`updateChecklist` の中で `pushHistory()` は呼ばない（無限/過剰記録を避けるため別関数）。代わりに「注釈を変化させる操作」の後に `app.pushHistory()` を明示的に呼ぶ。本Taskでは中心的な経路（ツール配置の共通呼び出し `updateChecklist` 直後）に統一フックを置く。

- [ ] **Step 1: コンストラクタで History を初期化**

`js/app.js` のコンストラクタ、`console.log('EV充電設備 平面図作成ツール initialized');`（245行）の直前に追加:

```js
    // 履歴（Undo/Redo）
    this._restoring = false; // restore中はupdateChecklistでの履歴記録を抑制
    this.history = new History(50);
    this.history.reset(StateSerializer.snapshot(this.svgEngine));
    this._bindHistoryControls();
```

- [ ] **Step 2: 旧 undo() を置換し、履歴メソッドを追加**

`js/app.js` の既存 `undo()` メソッド（465-474行）を以下で**置換**:

```js
  // ===== 履歴（Undo/Redo） =====
  _bindHistoryControls() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.addEventListener('click', () => this.doUndo());
    if (redoBtn) redoBtn.addEventListener('click', () => this.doRedo());

    document.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); this.doUndo(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); this.doRedo(); }
    });
    this._updateHistoryButtons();
  }

  pushHistory() {
    this.history.record(StateSerializer.snapshot(this.svgEngine));
    this._updateHistoryButtons();
  }

  doUndo() {
    const snap = this.history.undo();
    if (snap === null) return;
    this._restoring = true;
    StateSerializer.restore(this.svgEngine, snap);
    this.updateChecklist();
    this._restoring = false;
    this._updateHistoryButtons();
  }

  doRedo() {
    const snap = this.history.redo();
    if (snap === null) return;
    this._restoring = true;
    StateSerializer.restore(this.svgEngine, snap);
    this.updateChecklist();
    this._restoring = false;
    this._updateHistoryButtons();
  }

  _updateHistoryButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = !this.history.canUndo();
    if (redoBtn) redoBtn.disabled = !this.history.canRedo();
  }
```

- [ ] **Step 3: updateChecklist の末尾で履歴を記録**

`updateChecklist()` は注釈の追加・削除の後に各ツールから呼ばれている。注釈数が前回スナップショットと変化したときだけ記録するようにする。`updateChecklist()` メソッド末尾（`if (this.exportBoundary) { this.exportBoundary.update(); }` の後、457行付近）に追加:

```js
    // 注釈の変化を検知して履歴に記録（restore中とredo履歴の同一スナップショットは抑制）
    if (this.history && !this._restoring) {
      const snap = StateSerializer.snapshot(this.svgEngine);
      if (snap !== this.history.stack[this.history.index]) {
        this.history.record(snap);
        this._updateHistoryButtons();
      }
    }
```

- [ ] **Step 4: 構文チェック**

Run: `node --check js/app.js`
Expected: エラーなし

- [ ] **Step 5: 既存ユニットテストが緑のまま確認**

Run: `npm test`
Expected: PASS（18 tests）

- [ ] **Step 6: コミット**

```bash
git add js/app.js
git commit -m "feat: app に History を配線（Undo/Redo・操作時記録・キーバインド）"
```

---

## Task 8: プロジェクト保存（JSONダウンロード）と読込

**Files:**
- Modify: `js/state-serializer.js`（プロジェクト全体の serialize/deserialize）
- Modify: `js/app.js`（保存/開くボタン配線）

**Interfaces:**
- Consumes: `app.titleBlock`（`titleBlock.data` と `titleBlock.render()`）, `app.svgElement`（viewBox）, `serializeAnnotations`/`deserializeAnnotations`。
- Produces:
  - `StateSerializer.serializeProject(svgEngine, titleBlockData, viewBox, dxfName) -> ProjectState`
  - `StateSerializer.deserializeProject(svgEngine, state) -> { annotations }`（注釈のみ復元しannotation配列を返す。titleBlock/viewBoxは呼び出し側で適用）
  - `app.saveProject()` / `app.openProjectFile(file)`

> `titleBlock.data` の実フィールド名は実装時に `js/title-block.js` を確認して合わせる（設計書の ProjectState.titleBlock スキーマ参照）。読み出せた値をそのまま保存し、復元時に同じキーへ戻す方針。

- [ ] **Step 1: serializeProject / deserializeProject を追記**

`js/state-serializer.js` の `restore(...)` メソッドの後に追加（同じオブジェクト内、カンマ区切り）:

```js
,

  serializeProject(svgEngine, titleBlockData, viewBox, dxfName) {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      titleBlock: titleBlockData || {},
      dxf: { fileName: dxfName || null, loaded: !!dxfName },
      annotations: this.serializeAnnotations(svgEngine),
      viewBox: viewBox || null
    };
  },

  deserializeProject(svgEngine, state) {
    const result = this.deserializeAnnotations(svgEngine, (state && state.annotations) || []);
    return { result, titleBlock: (state && state.titleBlock) || {}, viewBox: (state && state.viewBox) || null };
  }
```

- [ ] **Step 2: app.js に保存/読込メソッドを追加**

`js/app.js` の `_updateHistoryButtons()` メソッドの後に追加:

```js
  // ===== 保存 / 読込 =====
  _currentDxfName() {
    const el = document.getElementById('dxf-name');
    const v = el ? el.textContent : '';
    return (v && v !== '未選択') ? v : null;
  }

  saveProject() {
    const tbData = (this.titleBlock && this.titleBlock.data) ? this.titleBlock.data : {};
    const viewBox = this.svgElement.getAttribute('viewBox');
    const state = StateSerializer.serializeProject(this.svgEngine, tbData, viewBox, this._currentDxfName());
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const site = (tbData.siteName || 'project').replace(/[\\/:*?"<>|]/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${site}_${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async openProjectFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const state = JSON.parse(text);
      const { titleBlock, viewBox } = StateSerializer.deserializeProject(this.svgEngine, state);
      // タイトルブロック復元
      if (this.titleBlock && titleBlock) {
        Object.assign(this.titleBlock.data, titleBlock);
        this.titleBlock.render();
      }
      // viewBox復元
      if (viewBox) this.svgElement.setAttribute('viewBox', viewBox);
      this.updateChecklist();
      // 履歴を初期化
      this.history.reset(StateSerializer.snapshot(this.svgEngine));
      this._updateHistoryButtons();
      alert('プロジェクトを読み込みました。DXF/参照PDFは別途再読込してください。');
    } catch (err) {
      console.error('プロジェクト読込エラー:', err);
      alert('プロジェクトファイルの読み込みに失敗しました: ' + err.message);
    }
  }
```

- [ ] **Step 3: ボタンを配線**

`js/app.js` の `_bindHistoryControls()` の末尾（`this._updateHistoryButtons();` の前）に追加:

```js
    const saveBtn = document.getElementById('btn-save-project');
    const openBtn = document.getElementById('btn-open-project');
    const openInput = document.getElementById('file-open-project');
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveProject());
    if (openBtn && openInput) openBtn.addEventListener('click', () => openInput.click());
    if (openInput) openInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      this.openProjectFile(f);
      e.target.value = '';
    });
```

- [ ] **Step 4: 構文チェック**

Run: `node --check js/app.js` と `node --check js/state-serializer.js`
Expected: 両方エラーなし

- [ ] **Step 5: ユニットテスト確認**

Run: `npm test`
Expected: PASS（18 tests）

- [ ] **Step 6: コミット**

```bash
git add js/app.js js/state-serializer.js
git commit -m "feat: プロジェクトのJSON保存・読込を追加"
```

---

## Task 9: localStorage 自動保存と起動時復元

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `serializeProject`/`deserializeProject`, `app.pushHistory` 経路。
- Produces:
  - `app._autosave()`（debounce 1s で localStorage 保存）
  - `app._scheduleAutosave()`（updateChecklist から呼ぶ）
  - 起動時の復元プロンプト（`app._offerRestore()`）
  - localStorage キー: `'ev-floorplan-autosave'`

- [ ] **Step 1: 自動保存メソッドを追加**

`js/app.js` の `openProjectFile(...)` メソッドの後に追加:

```js
  // ===== 自動保存（localStorage） =====
  _scheduleAutosave() {
    clearTimeout(this._autosaveTimer);
    this._autosaveTimer = setTimeout(() => this._autosave(), 1000);
  }

  _autosave() {
    try {
      const tbData = (this.titleBlock && this.titleBlock.data) ? this.titleBlock.data : {};
      const viewBox = this.svgElement.getAttribute('viewBox');
      const state = StateSerializer.serializeProject(this.svgEngine, tbData, viewBox, this._currentDxfName());
      localStorage.setItem('ev-floorplan-autosave', JSON.stringify(state));
    } catch (err) {
      console.warn('自動保存に失敗（容量超過の可能性）:', err.message);
    }
  }

  _offerRestore() {
    let raw;
    try { raw = localStorage.getItem('ev-floorplan-autosave'); } catch (e) { return; }
    if (!raw) return;
    let state;
    try { state = JSON.parse(raw); } catch (e) { return; }
    const count = (state.annotations || []).length;
    if (count === 0) return;
    const when = state.savedAt ? new Date(state.savedAt).toLocaleString('ja-JP') : '不明';
    if (confirm(`前回の作業（注釈${count}件 / ${when}）を復元しますか？`)) {
      const { titleBlock, viewBox } = StateSerializer.deserializeProject(this.svgEngine, state);
      if (this.titleBlock && titleBlock) { Object.assign(this.titleBlock.data, titleBlock); this.titleBlock.render(); }
      if (viewBox) this.svgElement.setAttribute('viewBox', viewBox);
      this.updateChecklist();
      this.history.reset(StateSerializer.snapshot(this.svgEngine));
      this._updateHistoryButtons();
    }
  }
```

- [ ] **Step 2: updateChecklist から自動保存をスケジュール**

`js/app.js` の `updateChecklist()` 末尾、Task 7 Step 3 で追加した履歴記録ブロックの直後に追加:

```js
    this._scheduleAutosave();
```

- [ ] **Step 3: 起動時に復元を提案**

`js/app.js` コンストラクタ末尾、`this._bindHistoryControls();`（Task 7 Step 1で追加）の直後に追加:

```js
    this._offerRestore();
```

- [ ] **Step 4: 構文チェック**

Run: `node --check js/app.js`
Expected: エラーなし

- [ ] **Step 5: ユニットテスト確認**

Run: `npm test`
Expected: PASS（18 tests）

- [ ] **Step 6: コミット**

```bash
git add js/app.js
git commit -m "feat: localStorage 自動保存と起動時の復元提案を追加"
```

---

## Task 10: ブラウザ スモークテスト（DOM結合の往復検証）

**Files:**
- なし（手動検証のみ。必要なら `css/style.css` に `.btn-secondary` のスタイルを追加）

**Interfaces:**
- Consumes: 全Task成果。

- [ ] **Step 1: サーバ起動**

preview_start（または `node serve.js` を起動し `http://localhost:8080`）。

- [ ] **Step 2: コンソールエラー確認**

preview_console_logs でエラーがないことを確認。`#btn-undo`/`#btn-redo`/`#btn-save-project`/`#btn-open-project` が表示されていること（preview_snapshot）。

- [ ] **Step 3: 配置→Undo/Redo の往復確認**

DXFを読み込まずとも、ツールでキャンバスに充電スペース・充電器・寸法線・テキストを配置（preview_click でツール選択→キャンバスクリック）。配置のたびに `↶戻す` が活性化することを確認。`Ctrl+Z` で直前の注釈が消え、`Ctrl+Y` で戻ることを確認（preview_snapshot 前後比較）。

- [ ] **Step 4: 保存→リロード→自動復元の確認**

注釈を数件配置 → ページをリロード（preview_eval: `window.location.reload()`）→「前回の作業…を復元しますか？」プロンプトが出て、OKで注釈が復元されることを確認。

- [ ] **Step 5: JSON保存→開く の往復確認**

`💾保存` で `.json` がダウンロードされること、別途 `📂開く` でそのJSONを読み込み、注釈が同じ位置・種類で復元されることを確認（特に charger のラベル、dimension の端点、leader のテキスト、text の本文が保持されていること＝Task 3 の属性補完の検証）。

- [ ] **Step 6: 検証結果を記録しコミット（あればスタイル調整のみ）**

`.btn-secondary` の見た目が崩れている場合のみ `css/style.css` に最小限のスタイルを追加:

```css
.btn-secondary {
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f5f5f5;
  color: #333;
  cursor: pointer;
}
.btn-secondary:disabled { opacity: 0.4; cursor: default; }
```

```bash
git add css/style.css
git commit -m "style: 保存/Undo系ボタンのスタイル調整"
```

---

## Self-Review メモ（計画作成者による確認結果）

- **Spec coverage:** フェーズ1スコープ（#3 Undo/Redo, #2 保存・復元, 横断シリアライズ層, #7のテスト土台）を Task 1-10 で網羅。属性欠落リスク（spec §9）は Task 3 で対応し Task 10 で往復検証。
- **Placeholder scan:** 「実装時に確認」は2箇所のみ（svg-engine の行番号は近似値である旨明記、title-block.data のフィールド名）。いずれもコードを読めば確定する具体物で、TBDではない。
- **Type consistency:** `snapshot/restore`（svgEngine受け取り）、`History.record/undo/redo/canUndo/canRedo/reset`、`serializeAnnotations/deserializeAnnotations`、`serializeProject/deserializeProject` の名称をTask間で一貫使用。SCHEMA の `key`（キャメル）と svg-engine の `data-*`（ハイフン）の対応を Task 3 冒頭に明記。
- **行番号注意:** Task 3 等の行番号はTask実施順で前のTaskの編集により**ずれる**。各Stepは行番号ではなくメソッド名・属性オブジェクトの内容で対象を特定すること。
