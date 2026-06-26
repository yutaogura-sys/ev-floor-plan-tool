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
