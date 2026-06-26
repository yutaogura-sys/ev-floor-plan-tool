# バッチA（編集UX・バグ修正）実装計画 — #1 編集反映 / #6 キー死にコード掃除 / #8 ヘッダー折返し

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建柱/分電盤/既設充電設備のプロパティ編集が画面に反映されない不具合を直し、tool-manager の死にコード（削除済み `app.undo()` 呼び出し）を掃除し、狭幅でヘッダー右ボタンが見切れる問題をCSSで解消する。

**Architecture:** #1 は `StateSerializer.recordFromDataset`/`createCallFromRecord`（既存の純関数）を再利用した汎用 `_regenerateSelected()` で、編集後の `data-*` から要素を作り直す（描画ロジックを二重化しない＝DRY）。`change`（フォーカスアウト）時のみ発火するためパネル再描画も許容。#6 は死にコード1ブロック削除。#8 は `flex-wrap` のみ。

**Tech Stack:** バニラJS（ビルドなし、ブラウザ グローバル）, CSS, `node --test`（非回帰のみ）。

## Global Constraints

- ビルドステップなし。新規ロジックは無し（既存純関数の再利用）。
- 既存テスト45件の非回帰のみ確認（DOM/CSS中心のため新規ユニットテストは追加しない）。ブラウザ スモークで検証。
- pole/cubicle/existing-charger は `js/svg-shapes-route.js` に create がある（Phase3分離後）。`svgEngine.createPole`/`createCubicle`/`createExistingCharger` は prototype 経由で利用可能。
- `_regenerateSelected` は編集後の要素を**同じ id で**作り直す（`createCallFromRecord` が `record.id` を第1引数に渡す）。`data-figure` を保存・復元する。
- pole の再生成ラベルは create 側が既に `detail-label` クラスを付ける（詳細ラベルトグルと整合）。

## ファイル構成

| ファイル | 役割 | 区分 |
|---|---|---|
| `js/tools/select-tool.js` | `_regenerateSelected()` 追加＋`_onPropertyChange` で pole/cubicle/existing-charger を再生成 | 変更 |
| `js/tool-manager.js` | 死にコード（`app.undo()` を呼ぶ Ctrl+Z ブロック）削除 | 変更 |
| `css/style.css` | `.header-right`/`#header` を `flex-wrap: wrap` | 変更 |

---

## Task 1: 建柱/分電盤/既設充電設備の編集を画面に反映（#1）

**Files:**
- Modify: `js/tools/select-tool.js`（`_regenerateSelected()` 追加、`_onPropertyChange` に分岐追加）

**Interfaces:**
- Consumes: `StateSerializer.recordFromDataset(type, dataset)` / `StateSerializer.createCallFromRecord(record)`（既存・純関数）, `this.svgEngine[method](...)`, `this.svgEngine.showSelection`, `this._showProperties`。
- Produces: `SelectTool._regenerateSelected()`：`this.selected` を現在の `data-*` から作り直し、`data-figure` を保ち、新要素を選択して `_showProperties` を更新。

> 背景: `_onPropertyChange` には pole/cubicle/existing-charger の再構築が無く（pullbox/charging-space/foundation のみ）、材質・高さ・ラベルを編集してもラベルが再生成されず画面に反映されない。汎用 `_regenerateSelected()` で解消する。`change`（blur）発火なのでパネル再描画は許容。

- [ ] **Step 1: `_regenerateSelected()` メソッドを追加**

`js/tools/select-tool.js` の `_rebuildPullBox(el) { ... }` メソッドの直後（または他の `_rebuild*` 群の近く）に追加:

```js
  // 選択要素を現在の data-* から作り直す（描画ロジックを二重化せず StateSerializer を再利用）。
  // change(blur)時に呼ぶ前提。data-figure と id を保持し、新要素を選択し直す。
  _regenerateSelected() {
    const el = this.selected;
    if (!el) return;
    const type = el.dataset.type;
    const rec = (typeof StateSerializer !== 'undefined') ? StateSerializer.recordFromDataset(type, el.dataset) : null;
    const call = rec && StateSerializer.createCallFromRecord(rec);
    if (!call || typeof this.svgEngine[call.method] !== 'function') return;
    const figure = el.getAttribute('data-figure');
    el.remove();
    const newEl = this.svgEngine[call.method].apply(this.svgEngine, call.args);
    if (newEl && figure) newEl.setAttribute('data-figure', figure);
    this.selected = newEl || null;
    if (newEl) {
      this.svgEngine.showSelection(newEl);
      this._showProperties(newEl);
    }
  }
```

- [ ] **Step 2: `_onPropertyChange` で対象タイプを再生成**

`js/tools/select-tool.js` の `_onPropertyChange(input)` 内、末尾の履歴フック（`if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();`）の**直前**に追加:

```js
    // pole/cubicle/existing-charger はラベル等の編集をデータから作り直して反映（change=blur時）
    if ((type === 'pole' && (prop === 'material' || prop === 'height')) ||
        (type === 'cubicle' && prop === 'label') ||
        (type === 'existing-charger' && prop === 'label')) {
      this._regenerateSelected();
    }
```

> 注: existing-charger の `rotation` は既存の rotation 分岐（transform 設定）で処理されるため、ここでは `label` のみ対象。pole の dataset キーは `material`/`poleHeight`（SCHEMA）だが、プロパティパネルの `data-prop` は `material`/`height`（`_showProperties` の pole ケース）。`_onPropertyChange` 冒頭の `this.selected.dataset[prop] = value` で `dataset.height` が入るが、createPole は第5引数 height を使い、SCHEMA は `poleHeight`(key `poleHeight`=`data-pole-height`) を読む点に注意。**この不整合があると pole 高さが反映されないため、Step 3 で検証する。**

- [ ] **Step 3: pole の height キー不整合を検証し、必要なら吸収**

`_showProperties` の pole ケースは入力に `data-prop="height"` を使い、`createPole(id,x,y,material,height)` は `data-pole-height` を設定する。`StateSerializer` の pole SCHEMA は key `poleHeight`（=`data-pole-height`）を読むため、編集で `dataset.height`（`data-height`）だけ変わっても再生成時に拾われない。`_regenerateSelected` の前で pole の height を正しいキーに写すため、Step 2 の分岐内で再生成の前に次を追加:

```js
    if (type === 'pole' && prop === 'height') {
      this.selected.dataset.poleHeight = value; // createPole/SCHEMA が読む data-pole-height に反映
    }
```

（material は `data-material` で一致するため追加不要。cubicle label=`data-label`、existing-charger label=`data-label` も一致。）

- [ ] **Step 4: 構文チェック & 非回帰テスト**

Run: `node --check js/tools/select-tool.js`（exit 0）
Run: `npm test`（45 passing）

- [ ] **Step 5: コミット**

```bash
git add js/tools/select-tool.js
git commit -m "fix: 建柱/分電盤/既設充電設備のプロパティ編集を画面に反映（汎用再生成）"
```

---

## Task 2: tool-manager の死にコード掃除（#6）＋ ヘッダー折返し（#8）

**Files:**
- Modify: `js/tool-manager.js`（削除済み `app.undo()` を呼ぶ Ctrl+Z ブロック削除）
- Modify: `css/style.css`（`.header-right`/`#header` を折返し可能に）

**Interfaces:** なし（独立した小修正）。

> #6: ツールの単キー切替・Delete・Ctrl+D・Escape は `tool-manager.js` の `_initKeyboardShortcuts` に実装済みで、INPUT/TEXTAREA ガードもある。唯一、Ctrl+Z ブロックが Phase1 で撤去された `app.undo()` を呼んでおり（実害なし＝app.js の `doUndo` が処理）死にコード。これを削除する。

- [ ] **Step 1: 死にコードの Ctrl+Z ブロックを削除**

`js/tool-manager.js` の `_initKeyboardShortcuts` 内、次のブロックを**削除**:

```js
      // Ctrl+Z undo
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        if (app && app.undo) app.undo();
        e.preventDefault();
      }
```

（Undo/Redo は `app.js` の keydown（`doUndo`/`doRedo`、入力欄ガード付き）が担う。）

- [ ] **Step 2: ヘッダーを折返し可能に**

`css/style.css` の該当行を変更:

`#header { ... }` に `flex-wrap: wrap;` を追加（既存の `display: flex; align-items: center; gap: 16px; ...` に追記）:
```css
#header { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; padding: 6px 12px; background: #1a1a2e; color: #fff; min-height: 50px; z-index: 100; }
```

`.header-right { display: flex; gap: 8px; }` を変更:
```css
.header-right { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
```

- [ ] **Step 3: 構文チェック & 非回帰テスト**

Run: `node --check js/tool-manager.js`（exit 0）
Run: `npm test`（45 passing）

- [ ] **Step 4: コミット**

```bash
git add js/tool-manager.js css/style.css
git commit -m "chore: tool-manager の死にコード(app.undo)削除、狭幅でヘッダーを折返し"
```

---

## Task 3: ブラウザ スモークテスト

**Files:** なし（手動検証）

**Interfaces:** Consumes 全Task成果。

- [ ] **Step 1: サーバ起動 & コンソール確認**

preview_start（`ev-floor-plan`）。preview_console_logs（level=error）でエラーなし。

- [ ] **Step 2: #1 編集反映の確認**

- 建柱(pole)を配置→選択→材質を「鋼管」高さを「10m」に変更（`_onPropertyChange` 経由）→ ラベルが「建柱 鋼管 H=10m」に更新されることを確認（`document.querySelector('[data-type="pole"]').textContent` 等）。
- 分電盤(cubicle)のラベルを「キュービクル」に変更→ ボックス内テキストが更新。
- 既設充電設備(existing-charger)のラベル変更→ 「(既設)」前のラベルが更新。
- いずれも編集後に `data-id` が保持され、Undo で戻せること。

- [ ] **Step 3: #6/#8 の確認**

- 設置場所フィールドに「s」「d」等を入力してもツールが切り替わらないこと（INPUTガード）。キャンバスにフォーカスがある状態で「s」を押すと充電スペースツールに切替、`Delete` で選択要素削除、`Escape` で選択ツール、`Ctrl+Z` で1回だけUndo（二重Undoなし）を確認。
- preview_resize で tablet（768px）等にして、ヘッダー右の保存/出力ボタンが**見切れず折り返して表示**されることを screenshot で確認。desktop に戻す。

- [ ] **Step 4: クリーンアップ**

preview_eval で注釈クリア・localStorage削除・history.reset・viewBox戻し。

---

## Self-Review メモ

- **カバレッジ:** #1（pole/cubicle/existing-charger 再生成=Task1）、#6（死にコード削除=Task2）、#8（折返し=Task2）、検証=Task3。
- **#1 の要点:** pole の `data-prop="height"` と SCHEMA キー `poleHeight`(=`data-pole-height`) の不整合を Step3 で吸収。これを忘れると pole 高さが反映されない。
- **Placeholder scan:** なし。
- **Type一貫性:** `_regenerateSelected()`、`StateSerializer.recordFromDataset/createCallFromRecord` を一貫使用。
- **依存:** Task1 と Task2 は独立。Task3 は両方後。
- **行番号注意:** メソッド名・近傍コードで特定。
