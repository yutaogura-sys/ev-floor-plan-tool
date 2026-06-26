const { test } = require('node:test');
const assert = require('node:assert');
const PDFAutoReader = require('../js/pdf-auto-reader.js');
const c = (t) => PDFAutoReader.classifyText(t);

test('充電スペース', () => assert.strictEqual(c('充電スペース3').kind, 'charging-space'));
test('充電器 + ラベル抽出', () => {
  const r = c('充電器①');
  assert.strictEqual(r.kind, 'charger');
  assert.strictEqual(r.label, '①');
});
test('EV充電', () => assert.strictEqual(c('EV充電設備1').kind, 'charger'));
test('配線(WL/sq/HIVE)', () => {
  assert.strictEqual(c('WL1').kind, 'wire');
  assert.strictEqual(c('CV8sq').kind, 'wire');
  assert.strictEqual(c('14sq').kind, 'wire');
});
test('機器(P.BOX/分電盤/キュービクル)', () => {
  assert.strictEqual(c('P.BOX').kind, 'equipment');
  assert.strictEqual(c('分電盤').kind, 'equipment');
});
test('配管(FEP/PF管/配管)', () => {
  assert.strictEqual(c('FEP28').kind, 'conduit');
  assert.strictEqual(c('PF管').kind, 'conduit');
});
test('寸法(2-5桁数字)', () => {
  assert.strictEqual(c('2500').kind, 'dimension');
  assert.strictEqual(c('900').kind, 'dimension');
});
test('建物ラベル', () => assert.strictEqual(c('建物').kind, 'building-text'));
test('一般テキスト(2文字以上)', () => assert.strictEqual(c('入口').kind, 'text'));
test('1文字以下は null', () => {
  assert.strictEqual(c('A'), null);
  assert.strictEqual(c(''), null);
});
