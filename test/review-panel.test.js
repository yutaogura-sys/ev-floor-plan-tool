const { test } = require('node:test');
const assert = require('node:assert');
const ReviewPanel = require('../js/review-panel.js');

test('filterAdopted: adopted!==false のみ残す', () => {
  const items = [
    { text: 'a', adopted: true },
    { text: 'b', adopted: false },
    { text: 'c' } // 未指定は採用扱い
  ];
  const out = ReviewPanel.filterAdopted(items);
  assert.deepStrictEqual(out.map(i => i.text), ['a', 'c']);
});

test('filterAdopted: 空配列', () => {
  assert.deepStrictEqual(ReviewPanel.filterAdopted([]), []);
});
