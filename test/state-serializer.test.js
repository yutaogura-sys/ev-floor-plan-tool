const { test } = require('node:test');
const assert = require('node:assert');
const StateSerializer = require('../js/state-serializer.js');

test('recordFromDataset: charging-space を数値変換して復元', () => {
  const ds = { id: 'a1', type: 'charging-space', x: '1.5', y: '2', width: '2.5', height: '5', number: '①', rotation: '0' };
  const rec = StateSerializer.recordFromDataset('charging-space', ds);
  assert.deepStrictEqual(rec, { type: 'charging-space', id: 'a1', x: 1.5, y: 2, width: 2.5, height: 5, number: '①', rotation: 0 });
});

test('createCallFromRecord: charging-space は createChargingSpace に正しい引数順で渡す', () => {
  const rec = { type: 'charging-space', id: 'a1', x: 1.5, y: 2, width: 2.5, height: 5, number: '①', rotation: 0 };
  const call = StateSerializer.createCallFromRecord(rec);
  assert.strictEqual(call.method, 'createChargingSpace');
  assert.deepStrictEqual(call.args, ['a1', 1.5, 2, 2.5, 5, '①', 0]);
});

test('charger: label と standType を保持して往復一致', () => {
  const ds = { id: 'c1', type: 'charger', x: '0', y: '0', rotation: '90', label: '充電器①', standType: 'パイルスタンド' };
  const rec = StateSerializer.recordFromDataset('charger', ds);
  const call = StateSerializer.createCallFromRecord(rec);
  assert.strictEqual(call.method, 'createCharger');
  assert.deepStrictEqual(call.args, ['c1', 0, 0, 90, '充電器①', 'パイルスタンド']);
});

test('dimension: x2/y2/labelOverride/color を保持', () => {
  const ds = { id: 'd1', type: 'dimension', x: '0', y: '0', x2: '2.5', y2: '0', labelOverride: '2,500', color: '#0066cc' };
  const rec = StateSerializer.recordFromDataset('dimension', ds);
  const call = StateSerializer.createCallFromRecord(rec);
  assert.strictEqual(call.method, 'createDimension');
  assert.deepStrictEqual(call.args, ['d1', 0, 0, 2.5, 0, '2,500', '#0066cc']);
});

test('leader: textX/textY/lines(JSON配列) を保持', () => {
  const ds = { id: 'l1', type: 'leader', x: '1', y: '1', textX: '3', textY: '0', lines: '["WL1","8sq"]', color: '#cc6600' };
  const rec = StateSerializer.recordFromDataset('leader', ds);
  assert.deepStrictEqual(rec.lines, ['WL1', '8sq']);
  const call = StateSerializer.createCallFromRecord(rec);
  assert.strictEqual(call.method, 'createLeaderAnnotation');
  assert.deepStrictEqual(call.args, ['l1', 1, 1, 3, 0, ['WL1', '8sq'], '#cc6600']);
});

test('text: 本文と fontSize を保持', () => {
  const ds = { id: 't1', type: 'text', x: '0', y: '0', text: '建物', fontSize: '0.5', color: '#333' };
  const rec = StateSerializer.recordFromDataset('text', ds);
  const call = StateSerializer.createCallFromRecord(rec);
  assert.deepStrictEqual(call.args, ['t1', 0, 0, '建物', 0.5, '#333']);
});

test('wiring-route: routeData(JSON) を vertices/segments に展開', () => {
  const routeData = { vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }], segments: [{ method: 'exposed' }] };
  const ds = { id: 'w1', type: 'wiring-route', x: '0', y: '0', routeData: JSON.stringify(routeData) };
  const rec = StateSerializer.recordFromDataset('wiring-route', ds);
  const call = StateSerializer.createCallFromRecord(rec);
  assert.strictEqual(call.method, 'createWiringRoute');
  assert.deepStrictEqual(call.args, ['w1', routeData.vertices, routeData.segments]);
});

test('未知typeは null', () => {
  assert.strictEqual(StateSerializer.recordFromDataset('unknown', { id: 'x' }), null);
  assert.strictEqual(StateSerializer.createCallFromRecord({ type: 'unknown', id: 'x' }), null);
});

test('recordFromDataset: figure を捕捉する', () => {
  const ds = { id: 'a1', type: 'charging-space', x: '0', y: '0', width: '2.5', height: '5', number: '', rotation: '0', figure: 'route' };
  const rec = StateSerializer.recordFromDataset('charging-space', ds);
  assert.strictEqual(rec.figure, 'route');
});

test('recordFromDataset: figure 無しのデータセットは figure キーを持たない', () => {
  const ds = { id: 'a1', type: 'bollard', x: '0', y: '0' };
  const rec = StateSerializer.recordFromDataset('bollard', ds);
  assert.strictEqual('figure' in rec, false);
});
