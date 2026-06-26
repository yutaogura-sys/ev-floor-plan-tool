const { test } = require('node:test');
const assert = require('node:assert');
const RV = require('../js/requirement-validator.js');

const space = (x, y) => ({ type: 'charging-space', x, y, width: 2.5, height: 5 });
const charger = (x, y) => ({ type: 'charger', x, y });
const dim = (x, y, x2, y2) => ({ type: 'dimension', x, y, x2, y2 });

test('basic-info: titleBlockComplete で ok / 未完で missing', () => {
  assert.strictEqual(RV.validate([], { titleBlockComplete: true })['basic-info'].status, 'ok');
  assert.strictEqual(RV.validate([], { titleBlockComplete: false })['basic-info'].status, 'missing');
});

test('space-dim: スペース無し→missing', () => {
  assert.strictEqual(RV.validate([], {})['space-dim'].status, 'missing');
});

test('space-dim: スペース有り・近くに寸法無し→warn', () => {
  const r = RV.validate([space(0, 0)], {})['space-dim'];
  assert.strictEqual(r.status, 'warn');
  assert.match(r.message, /寸法/);
});

test('space-dim: スペース有り・近くに寸法有り→ok', () => {
  const recs = [space(0, 0), dim(0, 0, 2.5, 0)];
  assert.strictEqual(RV.validate(recs, {})['space-dim'].status, 'ok');
});

test('equip-pos: 充電器有り・寸法無し→warn / 寸法有り→ok', () => {
  assert.strictEqual(RV.validate([charger(1, 1)], {})['equip-pos'].status, 'warn');
  assert.strictEqual(RV.validate([charger(1, 1), dim(1, 1, 1, 3)], {})['equip-pos'].status, 'ok');
});

test('foundation: 有→ok / 無→missing', () => {
  assert.strictEqual(RV.validate([{ type: 'foundation', x: 0, y: 0 }], {})['foundation'].status, 'ok');
  assert.strictEqual(RV.validate([], {})['foundation'].status, 'missing');
});

test('bollard: 条件付き（無→na, 有→ok）', () => {
  assert.strictEqual(RV.validate([], {})['bollard'].status, 'na');
  assert.strictEqual(RV.validate([{ type: 'bollard', x: 0, y: 0 }], {})['bollard'].status, 'ok');
});

test('route-pole/handhole/existing: 条件付き（無→na）, route-summary: 無→missing', () => {
  const v = RV.validate([], {});
  assert.strictEqual(v['route-pole'].status, 'na');
  assert.strictEqual(v['route-handhole'].status, 'na');
  assert.strictEqual(v['route-existing'].status, 'na');
  assert.strictEqual(v['route-summary'].status, 'missing');
});

test('dimNear: 端点・中点で近接判定', () => {
  const d = dim(0, 0, 4, 0); // midpoint (2,0)
  assert.strictEqual(RV.dimNear(d, 0.5, 0, 3), true);   // near start
  assert.strictEqual(RV.dimNear(d, 2, 0.2, 3), true);   // near midpoint
  assert.strictEqual(RV.dimNear(d, 20, 20, 3), false);  // far
});
