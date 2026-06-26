const { test } = require('node:test');
const assert = require('node:assert');
const DXFExporter = require('../js/dxf-exporter.js');

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('rotatePoint: 0度は恒等', () => {
  const p = DXFExporter.rotatePoint(3, -4, 0, 0, 0);
  assert.ok(near(p.x, 3) && near(p.y, -4));
});

test('rotatePoint: 原点まわり90度で (1,0)→(0,1)', () => {
  const p = DXFExporter.rotatePoint(1, 0, 0, 0, 90);
  assert.ok(near(p.x, 0) && near(p.y, 1));
});

test('rotatePoint: 中心(cx,cy)まわりの回転', () => {
  const p = DXFExporter.rotatePoint(2, 1, 1, 1, 90); // (1,0)相対 → (0,1)相対 → (1,2)
  assert.ok(near(p.x, 1) && near(p.y, 2));
});

test('chargingSpaceCorners: rot0 は左上角(x,y)基準・DXFはY反転', () => {
  const c = DXFExporter.chargingSpaceCorners({ x: 5, y: 3, width: 2.5, height: 5, rotation: 0 });
  // ローカル(0,0)(w,0)(w,h)(0,h) → world(5,3)... → DXF y反転
  assert.deepStrictEqual(c, [
    { x: 5, y: -3 }, { x: 7.5, y: -3 }, { x: 7.5, y: -8 }, { x: 5, y: -8 }
  ]);
});

test('chargingSpaceCorners: 中心基準の旧バグ角(3.75/6.25)を生まない', () => {
  const c = DXFExporter.chargingSpaceCorners({ x: 5, y: 3, width: 2.5, height: 5, rotation: 0 });
  assert.ok(!c.some(p => near(p.x, 3.75) || near(p.x, 6.25)));
});

test('chargingSpaceCorners: rot90 は原点(左上角)まわりに回転', () => {
  const c = DXFExporter.chargingSpaceCorners({ x: 0, y: 0, width: 2, height: 4, rotation: 90 });
  // local(0,0)->(0,0); (2,0)->(0,2); (2,4)->(-4,2); (0,4)->(-4,0)  then DXF y反転
  assert.ok(near(c[0].x, 0) && near(c[0].y, 0));
  assert.ok(near(c[1].x, 0) && near(c[1].y, -2));
  assert.ok(near(c[2].x, -4) && near(c[2].y, -2));
  assert.ok(near(c[3].x, -4) && near(c[3].y, 0));
});

test('computeBoundsCore: 空（dxfBounds無し・点なし）は既定枠', () => {
  assert.deepStrictEqual(DXFExporter.computeBoundsCore(null, []), { minX: 0, minY: 0, maxX: 100, maxY: 100 });
});

test('computeBoundsCore: 点は±10マージン・SVG Y は反転して集約', () => {
  const b = DXFExporter.computeBoundsCore(null, [{ x: 5, y: 3 }]);
  // dxfY = -3 → minY=-13, maxY=7 ; x:5 → minX=-5, maxX=15
  assert.deepStrictEqual(b, { minX: -5, minY: -13, maxX: 15, maxY: 7 });
});

test('computeBoundsCore: NaN/Infinity が紛れたら既定枠にフォールバック', () => {
  const nan = DXFExporter.computeBoundsCore({ minX: NaN, minY: 0, maxX: 10, maxY: 10 }, []);
  assert.ok([nan.minX, nan.minY, nan.maxX, nan.maxY].every(Number.isFinite));
  const inf = DXFExporter.computeBoundsCore({ minX: 0, minY: 0, maxX: Infinity, maxY: 10 }, []);
  assert.ok([inf.minX, inf.minY, inf.maxX, inf.maxY].every(Number.isFinite));
});

test('computeBoundsCore: 有限な dxfBounds と点を合成', () => {
  const b = DXFExporter.computeBoundsCore({ minX: 0, minY: 0, maxX: 50, maxY: 50 }, [{ x: 100, y: -100 }]);
  // x:100 → maxX=110 ; dxfY=100 → maxY=110
  assert.strictEqual(b.maxX, 110);
  assert.strictEqual(b.maxY, 110);
  assert.strictEqual(b.minX, 0);
});

test('colorToACI: 代表色と未知色・大文字', () => {
  assert.strictEqual(DXFExporter.colorToACI('#cc0000'), 1);
  assert.strictEqual(DXFExporter.colorToACI('#0066cc'), 5);
  assert.strictEqual(DXFExporter.colorToACI('#009933'), 3);
  assert.strictEqual(DXFExporter.colorToACI('#CC0000'), 1); // 大文字を正規化
  assert.strictEqual(DXFExporter.colorToACI('#abcdef'), 7); // 未知→既定7
  assert.strictEqual(DXFExporter.colorToACI(undefined), 7);
});

test('colorToACI: 非文字列でも throw せず既定7（堅牢化）', () => {
  assert.strictEqual(DXFExporter.colorToACI(123), 7);
  assert.strictEqual(DXFExporter.colorToACI(null), 7);
  assert.strictEqual(DXFExporter.colorToACI({}), 7);
  assert.strictEqual(DXFExporter.colorToACI(true), 7);
});
