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
