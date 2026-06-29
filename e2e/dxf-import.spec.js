// DXFインポートの回帰テスト。
// 不具合: 座標系が大きいDXF（例: 数千単位）を読み込むと、線幅が固定の小さな値(0.08単位)のため
// 実画面では ~0.04px となり「真っ白で開けない」ように見えた。
// 修正: 下図の線に vector-effect:non-scaling-stroke を適用し、座標スケール/ズームに依らず
// 一定の見える太さ(>=0.5px相当)で描画する。
const { test, expect } = require('@playwright/test');

test('大座標DXFの下図が見える太さで描画される（不可視バグの回帰）', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ev-floorplan-onboarded', '1'); } catch (e) {} });
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => typeof app !== 'undefined' && !!app.svgEngine);

  const r = await page.evaluate(() => {
    // output.dxf と同等スケール（約1500単位四方）の下図
    const dxfData = {
      layers: {
        ROAD: { polylines: [{ vertices: [
          { x: -973, y: -551 }, { x: 546, y: -551 }, { x: 546, y: 964 }, { x: -973, y: 964 }
        ], closed: true }], lines: [], texts: [], circles: [], arcs: [] }
      },
      bounds: { minX: -973, minY: -551, maxX: 546, maxY: 964 }
    };
    app.svgEngine.renderDXF(dxfData);
    app.viewport.setBounds(dxfData.bounds);
    app.viewport.fitToExtents();
    const g = document.getElementById('layer-ROAD');
    const path = g && g.querySelector('path');
    return {
      rendered: !!path && (path.getAttribute('d') || '').length > 0,
      vectorEffect: path ? (path.getAttribute('vector-effect') || getComputedStyle(path).vectorEffect) : null,
      strokeWidth: g ? parseFloat(g.getAttribute('stroke-width')) : null
    };
  });

  expect(r.rendered).toBe(true);                       // 幾何が描画されている
  expect(r.vectorEffect).toBe('non-scaling-stroke');   // スケール非依存の線（修正前は none）
  expect(r.strokeWidth).toBeGreaterThanOrEqual(0.5);   // 画面px相当で見える太さ（修正前は 0.08）
  expect(errors, 'console errors: ' + errors.join(' | ')).toHaveLength(0);
});
