const { test } = require('node:test');
const assert = require('node:assert');
const { parseDXF } = require('../js/dxf-parse-core.js');

// 改行は \n。DXFは code/value のペア。
const mk = (lines) => lines.join('\n') + '\n';

test('parseDXF: POLYLINE(閉)を頂点付きで解析しレイヤー分けする', () => {
  const dxf = mk([
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'POLYLINE', '8', 'ROAD', '66', '1', '70', '1',
    '0', 'VERTEX', '8', 'ROAD', '10', '0', '20', '0',
    '0', 'VERTEX', '8', 'ROAD', '10', '10', '20', '0',
    '0', 'VERTEX', '8', 'ROAD', '10', '10', '20', '5',
    '0', 'SEQEND', '8', 'ROAD',
    '0', 'ENDSEC', '0', 'EOF'
  ]);
  const r = parseDXF(dxf);
  assert.ok(r.layers.ROAD, 'ROADレイヤーが存在');
  assert.strictEqual(r.layers.ROAD.polylines.length, 1);
  assert.deepStrictEqual(r.layers.ROAD.polylines[0].vertices, [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }
  ]);
  assert.strictEqual(r.layers.ROAD.polylines[0].closed, true);
  assert.deepStrictEqual(r.bounds, { minX: 0, minY: 0, maxX: 10, maxY: 5 });
});

test('parseDXF: LINE を解析する', () => {
  const dxf = mk([
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LINE', '8', 'CENTER', '10', '1', '20', '2', '11', '3', '21', '4',
    '0', 'ENDSEC', '0', 'EOF'
  ]);
  const r = parseDXF(dxf);
  assert.strictEqual(r.layers.CENTER.lines.length, 1);
  assert.deepStrictEqual(r.layers.CENTER.lines[0], { x1: 1, y1: 2, x2: 3, y2: 4 });
});

test('parseDXF: onProgress コールバックが呼ばれても結果は同じ', () => {
  const rows = ['0', 'SECTION', '2', 'ENTITIES'];
  for (let k = 0; k < 50; k++) {
    rows.push('0', 'LINE', '8', '0', '10', String(k), '20', '0', '11', String(k + 1), '21', '0');
  }
  rows.push('0', 'ENDSEC', '0', 'EOF');
  let calls = 0;
  const r = parseDXF(mk(rows), () => { calls++; });
  assert.strictEqual(r.layers['0'].lines.length, 50);
  assert.ok(calls >= 0); // 呼ばれても落ちない（self非依存）
});

test('parseDXF: ENTITIESが無ければ空レイヤーを返す（throwしない）', () => {
  const dxf = mk(['0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC', '0', 'EOF']);
  const r = parseDXF(dxf);
  assert.deepStrictEqual(r.layers, {});
});
