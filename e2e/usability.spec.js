// 操作性（UI操作コスト）計測ハーネス — A:代表タスク定義 / B:自動リプレイ計測。
//
// ねらい: 「ある作業を終えるのに何アクション要るか」を客観値で測り、版間で追跡する。
//   値が増える = 操作が増える = 操作性の悪化、と機械的に判別できる。expect(budget) は回帰ガード。
// 指標: 実 mousedown 数 / keydown 数 / ツール切替回数 / Undo 回数 / エラートースト数 / 要素増減 / 所要 ms。
// 実行: npm run test:usability （詳細は docs/superpowers/usability/README.md）
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page._errors = errors;
  await page.goto('/');
  await page.waitForFunction(() => {
    try { return typeof app !== 'undefined' && !!app.svgEngine; } catch (e) { return false; }
  });
  // 計測カウンタ・座標変換・シード関数を注入
  await page.evaluate(() => {
    window.__m = { clicks: 0, keys: 0, toolSwitches: 0, undos: 0, errors: 0 };
    document.addEventListener('mousedown', () => window.__m.clicks++, true);
    document.addEventListener('keydown', () => window.__m.keys++, true);
    const tm = app.toolManager; const os = tm.setActiveTool.bind(tm);
    tm.setActiveTool = (n) => { window.__m.toolSwitches++; return os(n); };
    const ou = app.doUndo.bind(app); app.doUndo = () => { window.__m.undos++; return ou(); };
    const ot = Utils.toast.bind(Utils); Utils.toast = (msg, t) => { if (t === 'error') window.__m.errors++; return ot(msg, t); };
    window.__resetMetrics = () => { window.__m = { clicks: 0, keys: 0, toolSwitches: 0, undos: 0, errors: 0 }; };
    // 描画座標 → 画面ピクセル（実クリックを要素へ確実に当てるため）
    window.__toScreen = (x, y) => {
      const svg = app.svgElement; const m = svg.getScreenCTM();
      const p = svg.createSVGPoint(); p.x = x; p.y = y;
      const s = p.matrixTransform(m); return { x: s.x, y: s.y };
    };
    window.__seed = (specs) => {
      [...app.svgEngine.getAnnotations()].forEach((e) => e.remove());
      app.toolManager.tools.select._clearSelection();
      specs.forEach((s) => app.svgEngine[s.m].apply(app.svgEngine, s.a));
      // 全タスク座標(x:0..10, y:0..8)が確実に画面内に入る固定ビューに設定（fitだと座標が画面外に出る）
      app.viewport.setViewBox(-4, -4, 28, 20);
      app.toolManager.snapEnabled = false;
      app.toolManager.setActiveTool('select');
    };
  });
});

const sc = (page, x, y) => page.evaluate(([x, y]) => window.__toScreen(x, y), [x, y]);
const met = (page) => page.evaluate(() => window.__m);
const annCount = (page) => page.evaluate(() => app.svgEngine.getAnnotations().length);
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
}
function report(t, m, extra) {
  // 端末に1行で出す（list レポータでも見える）
  console.log(`USABILITY ${t}: clicks=${m.clicks} keys=${m.keys} toolSwitches=${m.toolSwitches} undos=${m.undos} errors=${m.errors} ${extra || ''}`);
}

test('代表タスク1: 3台の充電器をまとめて移動（矩形選択→1ドラッグ）', async ({ page }) => {
  await page.evaluate(() => window.__seed([
    { m: 'createCharger', a: ['u1', 2, 2, 0, 'A', 'パイルスタンド'] },
    { m: 'createCharger', a: ['u2', 4, 2, 0, 'B', 'パイルスタンド'] },
    { m: 'createCharger', a: ['u3', 6, 2, 0, 'C', 'パイルスタンド'] }
  ]));
  await page.evaluate(() => window.__resetMetrics());
  const t0 = Date.now();
  // 矩形選択（空き地から全体を囲む）
  await drag(page, await sc(page, 0, 0), await sc(page, 8, 4));
  const selLen = await page.evaluate(() => app.toolManager.tools.select.selection.length);
  // 選択要素を1回ドラッグ（u1 をつまんで下へ）→ 全体が同じだけ動く
  await drag(page, await sc(page, 2, 2), await sc(page, 2, 5));
  const m = await met(page); const ms = Date.now() - t0;
  const ys = await page.evaluate(() => [...app.svgEngine.getAnnotations()].map((e) => +e.dataset.y));
  const sameY = Math.max(...ys) - Math.min(...ys) < 0.01;
  report('task1-move3', m, `selLen=${selLen} sameY=${sameY} ms=${ms}`);
  expect(selLen).toBe(3);
  expect(sameY).toBe(true);          // 相対レイアウトを保ったまま一括移動
  expect(ys[0]).toBeGreaterThan(2.5); // 実際に動いた
  expect(m.clicks).toBeLessThanOrEqual(2); // 回帰ガード: 2ジェスチャ（旧来は3回個別移動）
  expect(m.errors).toBe(0);
});

test('代表タスク2: 同種5台のスタンド種別を一括変更（1選択＋1操作）', async ({ page }) => {
  await page.evaluate(() => window.__seed([
    { m: 'createCharger', a: ['c1', 1, 1, 0, '1', 'パイルスタンド'] },
    { m: 'createCharger', a: ['c2', 3, 1, 0, '2', 'パイルスタンド'] },
    { m: 'createCharger', a: ['c3', 5, 1, 0, '3', 'パイルスタンド'] },
    { m: 'createCharger', a: ['c4', 7, 1, 0, '4', 'パイルスタンド'] },
    { m: 'createCharger', a: ['c5', 9, 1, 0, '5', 'パイルスタンド'] }
  ]));
  await page.evaluate(() => window.__resetMetrics());
  const t0 = Date.now();
  await drag(page, await sc(page, 0, 0), await sc(page, 10, 3)); // 矩形選択
  const selLen = await page.evaluate(() => app.toolManager.tools.select.selection.length);
  await page.selectOption('[data-bulk-prop="standType"]', '壁付');   // 一括変更
  const m = await met(page); const ms = Date.now() - t0;
  const allWall = await page.evaluate(() =>
    [...app.svgEngine.getAnnotations()].filter((e) => e.dataset.type === 'charger').every((e) => e.dataset.standType === '壁付'));
  report('task2-bulk5', m, `selLen=${selLen} allWall=${allWall} ms=${ms}`);
  expect(selLen).toBe(5);
  expect(allWall).toBe(true);        // 5台すべてに反映（旧来は5回個別編集）
  expect(m.clicks).toBeLessThanOrEqual(1);
  expect(m.errors).toBe(0);
});

test('代表タスク3: 1台をコピーして2箇所へ配置（Ctrl+C / Ctrl+V 追従）', async ({ page }) => {
  await page.evaluate(() => window.__seed([
    { m: 'createCharger', a: ['s1', 3, 3, 0, 'A', 'パイルスタンド'] }
  ]));
  await page.evaluate(() => window.__resetMetrics());
  const t0 = Date.now();
  // 元を選択
  const p = await sc(page, 3, 3);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Control+c');
  // 1箇所目
  await page.keyboard.press('Control+v');
  let dst = await sc(page, 8, 8); await page.mouse.move(dst.x, dst.y); await page.mouse.click(dst.x, dst.y);
  // 2箇所目
  await page.keyboard.press('Control+v');
  dst = await sc(page, 8, 3); await page.mouse.move(dst.x, dst.y); await page.mouse.click(dst.x, dst.y);
  const m = await met(page); const ms = Date.now() - t0;
  const total = await annCount(page);
  report('task3-copy-paste2', m, `total=${total} ms=${ms}`);
  expect(total).toBe(3);             // 元1 + 配置2
  expect(m.errors).toBe(0);
});
