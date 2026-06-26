const { test } = require('node:test');
const assert = require('node:assert');
const Utils = require('../js/utils.js');

test('parseScale: A3:1/100 → 100', () => {
  assert.strictEqual(Utils.parseScale('A3:1/100'), 100);
});

test('parseScale: 1/50 → 50', () => {
  assert.strictEqual(Utils.parseScale('1/50'), 50);
});

test('parseScale: 1:200 → 200', () => {
  assert.strictEqual(Utils.parseScale('1:200'), 200);
});

test('parseScale: 空文字 → null', () => {
  assert.strictEqual(Utils.parseScale(''), null);
});

test('safeFilename: Windows禁止文字を_に置換しダウンロードを壊さない', () => {
  assert.strictEqual(Utils.safeFilename('A棟/B棟'), 'A棟_B棟');
  assert.strictEqual(Utils.safeFilename('A:B*区画?'), 'A_B_区画_');
  assert.ok(!/[<>:"/\|?*]/.test(Utils.safeFilename('x<y>z:"/\|?*')));
});

test('safeFilename: 空・null は untitled', () => {
  assert.strictEqual(Utils.safeFilename(''), 'untitled');
  assert.strictEqual(Utils.safeFilename(null), 'untitled');
  assert.strictEqual(Utils.safeFilename(undefined), 'untitled');
});

test('safeFilename: 通常の日本語物件名は保持（禁止文字以外）', () => {
  assert.strictEqual(Utils.safeFilename('○○モール立体駐車場'), '○○モール立体駐車場');
});
