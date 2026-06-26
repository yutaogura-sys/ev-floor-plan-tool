const { test } = require('node:test');
const assert = require('node:assert');
const AIReader = require('../js/ai-reader.js');

test('pageOrigin: 1ページ目(index0)は基準そのまま', () => {
  const o = AIReader.pageOrigin({ originX: 5, originY: -3 }, 0);
  assert.deepStrictEqual(o, { originX: 5, originY: -3 });
});

test('pageOrigin: ページが進むほど originY を gap ぶん下げる（X不変）', () => {
  const base = { originX: 2, originY: 10 };
  const o1 = AIReader.pageOrigin(base, 1); // 既定 gap=8
  assert.strictEqual(o1.originX, 2);
  assert.strictEqual(o1.originY, 10 - 8);
  const o2 = AIReader.pageOrigin(base, 2, 5); // gap指定
  assert.strictEqual(o2.originY, 10 - 2 * 5);
});

test('pageOrigin: base 未指定は原点扱い', () => {
  const o = AIReader.pageOrigin(undefined, 3, 4);
  assert.deepStrictEqual(o, { originX: 0, originY: -12 });
});
