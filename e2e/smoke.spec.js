// E2E スモーク（#9）。主要フローをヘッドレス Chromium で検証する。
// 既存のユニットテスト(node --test)では確認できない DOM/操作系を対象。
const { test, expect } = require('@playwright/test');

// 各テスト前に localStorage を空にして起動（自動保存復元ダイアログを出さない）
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
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
