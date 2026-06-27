// E2E スモーク（#9）。主要フローをヘッドレス Chromium で検証する。
// 既存のユニットテスト(node --test)では確認できない DOM/操作系を対象。
const { test, expect } = require('@playwright/test');

// 各テスト前に localStorage を空にして起動（自動保存復元ダイアログを出さない）
test.beforeEach(async ({ page }) => {
  // localStorage を空にしつつ、初回オンボーディングは抑止（個別テストで明示的に検証する）
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ev-floorplan-onboarded', '1'); } catch (e) {} });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page._errors = errors;
  await page.goto('/');
  // app は classic script のトップレベル const（window のプロパティではない）。bare 名で参照。
  await page.waitForFunction(() => {
    try { return typeof app !== 'undefined' && !!app.svgEngine; } catch (e) { return false; }
  });
});

test('アプリが読み込まれ、コンソールエラーが無い', async ({ page }) => {
  await expect(page.locator('#header')).toBeVisible();
  await expect(page.locator('#drawing-canvas')).toBeVisible();
  expect(page._errors, 'console errors: ' + page._errors.join(' | ')).toHaveLength(0);
});

test('キーボードショートカットでツールが切り替わる（#6）', async ({ page }) => {
  // INPUT/TEXTAREA にフォーカスが無い状態で単キーを押下（キャンバスへフォーカス）。
  await page.locator('#drawing-canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('s'); // 充電スペース
  expect(await page.evaluate(() => app.toolManager.activeTool)).toBe('charging-space');
  await page.keyboard.press('v'); // 選択
  expect(await page.evaluate(() => app.toolManager.activeTool)).toBe('select');
});

test('詳細ラベルトグルで detail-label が隠れる/戻る', async ({ page }) => {
  // 充電スペースを1件プログラム配置（座標クリックの不安定さを避ける）
  await page.evaluate(() => {
    app.svgEngine.createChargingSpace('e2e-cs', 0, 0, 2.5, 5, '①');
  });
  const dimLabel = page.locator('[data-id="e2e-cs"] text.detail-label');
  await expect(dimLabel).toHaveCount(1);
  // OFF
  await page.uncheck('#toggle-detail-labels');
  await expect(dimLabel).toBeHidden();
  // ON
  await page.check('#toggle-detail-labels');
  await expect(dimLabel).toBeVisible();
});

test('出力前チェック: 空の平面図で警告モーダルが出てキャンセルできる（#2）', async ({ page }) => {
  // 出力ボタンは通常DXF読込後に有効化される。ここではモーダル挙動を検証するため有効化。
  await page.evaluate(() => { document.getElementById('btn-export-plan').disabled = false; });
  await page.click('#btn-export-plan');
  const overlay = page.locator('.export-check-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('h3')).toContainText('出力前チェック');
  // 必須未充足が一覧される
  expect(await overlay.locator('li').count()).toBeGreaterThan(0);
  await overlay.locator('.ec-cancel').click();
  await expect(overlay).toHaveCount(0);
});

test('複数選択: Shift追加・一括移動・一括削除（新機能）', async ({ page }) => {
  const r = await page.evaluate(() => {
    const sel = app.toolManager.tools.select;
    app.toolManager.setActiveTool('select');
    app.svgEngine.getAnnotations().forEach((e) => e.remove());
    sel._clearSelection();
    app.toolManager.snapEnabled = false;
    const sp = [
      app.svgEngine.createChargingSpace('e2e_ms1', 0, 0, 2, 2, 1),
      app.svgEngine.createChargingSpace('e2e_ms2', 5, 0, 2, 2, 2)
    ];
    const cen = (el) => ({ x: +el.dataset.x + 1, y: +el.dataset.y + 1 });
    const md = (p, sh) => sel.onMouseDown(p, { button: 0, shiftKey: !!sh, target: null });
    md(cen(sp[0]));
    md(cen(sp[1]), true); // Shift追加
    const selLen = sel.selection.length;
    // 一括移動 +3,0（選択済み要素をドラッグ）
    const before = sp.map((s) => +s.dataset.x);
    const c = cen(sp[0]);
    md(c);
    sel.onMouseMove({ x: c.x + 3, y: c.y }, {});
    sel.onMouseUp({ x: c.x + 3, y: c.y }, {});
    const moved = sp.map((s, i) => +(s.dataset.x - before[i]).toFixed(2));
    // 一括削除
    sel.deleteSelected();
    const remaining = app.svgEngine.getAnnotations().length;
    app.toolManager.snapEnabled = true;
    return { selLen, moved, remaining };
  });
  expect(r.selLen).toBe(2);
  expect(r.moved).toEqual([3, 3]);
  expect(r.remaining).toBe(0);
  expect(page._errors, 'console errors: ' + page._errors.join(' | ')).toHaveLength(0);
});

test('矢印nudge と コピー&ペースト（新機能）', async ({ page }) => {
  await page.evaluate(() => {
    const sel = app.toolManager.tools.select;
    app.toolManager.setActiveTool('select');
    app.svgEngine.getAnnotations().forEach((e) => e.remove());
    sel._clearSelection();
    const f = app.svgEngine.createCharger('e2e_nf', 2, 2, 30, 'A', 'パイルスタンド');
    sel._setSelection([f]);
  });
  // 矢印キーで grid(0.25) 移動
  await page.locator('#drawing-canvas').click({ position: { x: 5, y: 5 } });
  await page.evaluate(() => app.toolManager.tools.select._setSelection([app.svgEngine.getAnnotations()[0]]));
  const yBefore = await page.evaluate(() => +app.svgEngine.getAnnotations()[0].dataset.y);
  await page.keyboard.press('ArrowDown'); // +0.25
  const yAfter = await page.evaluate(() => +app.svgEngine.getAnnotations()[0].dataset.y);
  expect(+(yAfter - yBefore).toFixed(2)).toBe(0.25);
  // コピー&ペースト
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  const r = await page.evaluate(() => ({
    count: app.svgEngine.getAnnotations().length,
    pastedSel: app.toolManager.tools.select.selection.length
  }));
  expect(r.count).toBe(2);     // 元1 + 貼付1
  expect(r.pastedSel).toBe(1); // 貼付分が選択される
  expect(page._errors, 'console errors: ' + page._errors.join(' | ')).toHaveLength(0);
});

test('ヘルプ: ? でショートカット一覧が開閉する（発見性）', async ({ page }) => {
  await page.locator('#drawing-canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Shift+Slash'); // = ?
  const overlay = page.locator('.help-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('ツール切替');
  await expect(overlay).toContainText('Ctrl+C');
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
});

test('削除フィードバックと配線ルートのEsc継続（新UX）', async ({ page }) => {
  // 削除トースト
  await page.evaluate(() => {
    const sel = app.toolManager.tools.select;
    app.toolManager.setActiveTool('select');
    app.svgEngine.getAnnotations().forEach((e) => e.remove());
    sel._setSelection([
      app.svgEngine.createCharger('e_d1', 1, 1, 0, '', 'パイルスタンド'),
      app.svgEngine.createCharger('e_d2', 3, 1, 0, '', 'パイルスタンド')
    ]);
    sel.deleteSelected();
  });
  await expect(page.locator('body')).toContainText('2個を削除しました');
  // 配線ルート作図中の Esc はツールに留まる
  const stays = await page.evaluate(() => {
    const tm = app.toolManager;
    tm.setActiveTool('wiring-route');
    const rt = tm.tools['wiring-route'];
    rt.onMouseDown({ x: 1, y: 1 }, { button: 0 });
    rt.onMouseDown({ x: 2, y: 2 }, { button: 0 });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return { tool: tm.activeTool, verts: rt.vertices.length };
  });
  expect(stays.tool).toBe('wiring-route'); // 選択ツールへ戻らない
  expect(stays.verts).toBe(0);             // 作図は取消
  expect(page._errors, 'console errors: ' + page._errors.join(' | ')).toHaveLength(0);
});

test('一括編集: 混在値は（複数値）表示で、他項目変更時に誤上書きしない（新UX）', async ({ page }) => {
  const r = await page.evaluate(() => {
    const sel = app.toolManager.tools.select;
    app.toolManager.setActiveTool('select');
    app.svgEngine.getAnnotations().forEach((e) => e.remove());
    // 回転が異なる（0 / 90）、スタンド種別は同じ2台
    const c1 = app.svgEngine.createCharger('mx1', 1, 1, 0, 'A', 'パイルスタンド');
    const c2 = app.svgEngine.createCharger('mx2', 3, 1, 90, 'B', 'パイルスタンド');
    sel._setSelection([c1, c2]);
    const panel = document.getElementById('properties-content');
    const rotInput = panel.querySelector('[data-bulk-prop="rotation"]');
    const mixedShown = rotInput.value === '' && rotInput.placeholder === '（複数値）';
    // 共有項目（スタンド種別）を一括変更 → 回転は各自のまま維持されるべき
    sel._applyBulkProp('standType', '壁付');
    const list = [...app.svgEngine.getAnnotations()].filter((e) => e.dataset.type === 'charger');
    const allWall = list.every((e) => e.dataset.standType === '壁付');
    const rots = list.map((e) => +e.dataset.rotation).sort((a, b) => a - b);
    app.svgEngine.getAnnotations().forEach((e) => e.remove());
    sel._clearSelection();
    return { mixedShown, allWall, rots };
  });
  expect(r.mixedShown).toBe(true);       // 混在回転は（複数値）
  expect(r.allWall).toBe(true);          // 共有項目は一括反映
  expect(r.rots).toEqual([0, 90]);       // 触れていない回転は上書きされない
});

test('初回オンボーディング: 表示→閉じると再表示しない（新UX）', async ({ page }) => {
  const r = await page.evaluate(() => {
    localStorage.removeItem('ev-floorplan-onboarded');
    Onboarding.maybeShowFirstRun();
    const shown = !!document.querySelector('.onboarding-overlay');
    const hasSteps = shown && /部材を配置|要件を確認/.test(document.querySelector('.onboarding-overlay').textContent);
    document.querySelector('.onboarding-overlay .ob-start').click();
    const flag = localStorage.getItem('ev-floorplan-onboarded');
    const closed = !document.querySelector('.onboarding-overlay');
    Onboarding.maybeShowFirstRun(); // 2回目は出ない
    const noReshow = !document.querySelector('.onboarding-overlay');
    return { shown, hasSteps, flag, closed, noReshow };
  });
  expect(r.shown).toBe(true);
  expect(r.hasSteps).toBe(true);
  expect(r.closed).toBe(true);
  expect(r.flag).toBe('1');
  expect(r.noReshow).toBe(true);
  expect(page._errors, 'console errors: ' + page._errors.join(' | ')).toHaveLength(0);
});

test('要件チェック: 「未充足のみ表示」で充足/非該当を隠す（新UX）', async ({ page }) => {
  await page.evaluate(() => {
    app.svgEngine.getAnnotations().forEach((e) => e.remove());
    app.svgEngine.createChargingSpace('uf1', 0, 0, 2.5, 5, '①');
    app.updateChecklist();
  });
  const planUl = page.locator('#checklist-plan');
  await page.check('#checklist-filter-unmet');
  // 充足(satisfied)・非該当(req-na)は非表示、未充足は表示
  const satisfiedVisible = await planUl.locator('li.satisfied:visible').count();
  const naVisible = await planUl.locator('li.req-na:visible').count();
  const unmetVisible = await planUl.locator('li:not(.satisfied):not(.req-na):visible').count();
  expect(satisfiedVisible).toBe(0);
  expect(naVisible).toBe(0);
  expect(unmetVisible).toBeGreaterThan(0);
  // 解除で全項目が戻る
  await page.uncheck('#checklist-filter-unmet');
  expect(await planUl.locator('li:visible').count()).toBe(12);
});

test('狭幅でヘッダー右ボタンが見切れない（#8）', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const clipped = await page.evaluate(() => {
    const right = document.querySelector('.header-right');
    if (!right) return -1;
    const vw = window.innerWidth;
    return Array.from(right.children).filter((b) => b.getBoundingClientRect().right > vw + 0.5).length;
  });
  expect(clipped).toBe(0);
});
