const { test } = require('node:test');
const assert = require('node:assert');
const S2S = require('../js/sketch-to-shapes.js');

test('空/未定義 analysis は空配列', () => {
  assert.deepStrictEqual(S2S.toCandidates(null, {}), []);
  assert.deepStrictEqual(S2S.toCandidates({}, {}), []);
});

test('charging_spaces: count 分の充電スペース候補を横並びで生成', () => {
  const a = { charging_spaces: [{ count: 3, layout: 'horizontal', width_mm: 2500 }] };
  const c = S2S.toCandidates(a, { originX: 0, originY: 0 });
  const spaces = c.filter(x => x.kind === 'charging-space');
  assert.strictEqual(spaces.length, 3);
  // spacing = 2.5 + 0.1 = 2.6
  assert.strictEqual(spaces[0].x, 0);
  assert.ok(Math.abs(spaces[1].x - 2.6) < 1e-9);
  assert.ok(Math.abs(spaces[2].x - 5.2) < 1e-9);
});

test('chargers: ラベルと near_space_index を反映', () => {
  const a = { charging_spaces: [{ count: 2, width_mm: 2500 }], chargers: [{ label: '①', near_space_index: 1 }] };
  const c = S2S.toCandidates(a, { originX: 0, originY: 0 });
  const ch = c.find(x => x.kind === 'charger');
  assert.strictEqual(ch.label, '①');
  assert.strictEqual(ch.text, '充電器①');
  // near space 1 → x = 1*2.6 + 1.3 = 3.9
  assert.ok(Math.abs(ch.x - 3.9) < 1e-9);
});

test('dimensions と road_markings を候補化', () => {
  const a = { dimensions: [{ value_mm: 2500 }, { value_mm: 900 }], road_markings: [{ near_space_index: 0 }], charging_spaces: [{ count: 1, width_mm: 2500 }] };
  const c = S2S.toCandidates(a, {});
  assert.strictEqual(c.filter(x => x.kind === 'dimension').length, 2);
  assert.strictEqual(c.filter(x => x.kind === 'dimension')[0].text, '2500');
  assert.strictEqual(c.filter(x => x.kind === 'road-marking').length, 1);
});
