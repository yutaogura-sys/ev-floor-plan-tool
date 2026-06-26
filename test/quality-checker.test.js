const { test } = require('node:test');
const assert = require('node:assert');
const QC = require('../js/quality-checker.js');

const box = (minX, minY, maxX, maxY) => ({ minX, minY, maxX, maxY });

test('overlapRatio: 非重なりは0、完全内包は1', () => {
  assert.strictEqual(QC.overlapRatio(box(0, 0, 1, 1), box(2, 2, 3, 3)), 0);
  // 小さい方が大きい方に完全内包 → 比1
  assert.strictEqual(QC.overlapRatio(box(0, 0, 4, 4), box(1, 1, 2, 2)), 1);
});

test('overlapRatio: 半分重なり', () => {
  // a=[0,2]x[0,1], b=[1,3]x[0,1] → 重なり[1,2]x[0,1]=1, 小さい方面積=2 → 0.5
  assert.strictEqual(QC.overlapRatio(box(0, 0, 2, 1), box(1, 0, 3, 1)), 0.5);
});

test('rangeStatus: inside / partial / outside', () => {
  const frame = box(0, 0, 10, 10);
  assert.strictEqual(QC.rangeStatus(box(1, 1, 2, 2), frame), 'inside');
  assert.strictEqual(QC.rangeStatus(box(8, 8, 12, 12), frame), 'partial');
  assert.strictEqual(QC.rangeStatus(box(20, 20, 22, 22), frame), 'outside');
  assert.strictEqual(QC.rangeStatus(box(0, 0, 1, 1), null), 'inside'); // 枠なしは inside 扱い
});

test('analyze: 重なるラベル対と範囲外要素を抽出', () => {
  const labels = [
    { text: 'A', box: box(0, 0, 2, 1) },
    { text: 'B', box: box(1, 0, 3, 1) }, // Aと0.5重なり
    { text: 'C', box: box(50, 50, 51, 51) } // 孤立
  ];
  const elements = [
    { id: 'e1', type: 'charger', box: box(1, 1, 2, 2) },     // 枠内
    { id: 'e2', type: 'pole', box: box(100, 100, 101, 101) } // 枠外
  ];
  const frame = box(0, 0, 42, 29);
  const r = QC.analyze(labels, elements, frame, { overlapThreshold: 0.4 });
  assert.strictEqual(r.labelOverlaps.length, 1);
  assert.deepStrictEqual(r.labelOverlaps[0], { a: 'A', b: 'B', ratio: 0.5 });
  assert.strictEqual(r.outOfRange.length, 1);
  assert.strictEqual(r.outOfRange[0].id, 'e2');
  assert.strictEqual(r.outOfRange[0].status, 'outside');
});

test('analyze: 閾値未満の軽微な重なりは報告しない', () => {
  const labels = [
    { text: 'A', box: box(0, 0, 10, 1) },
    { text: 'B', box: box(9, 0, 19, 1) } // 重なり[9,10]=1 / 小10 → 0.1 < 0.4
  ];
  const r = QC.analyze(labels, [], null);
  assert.strictEqual(r.labelOverlaps.length, 0);
});

test('analyze: 空入力でも安全', () => {
  assert.deepStrictEqual(QC.analyze(null, null, null), { labelOverlaps: [], outOfRange: [] });
});
