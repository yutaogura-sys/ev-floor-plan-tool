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

test('recordFromDataset: 詳細ラベルのオフセット(labelDx/labelDy)を捕捉する', () => {
  const ds = { id: 'a1', type: 'foundation', x: '0', y: '0', width: '1', height: '1', depth: '0.5', material: 'コンクリート', labelDx: '1.5', labelDy: '-0.8' };
  const rec = StateSerializer.recordFromDataset('foundation', ds);
  assert.strictEqual(rec.labelDx, 1.5);
  assert.strictEqual(rec.labelDy, -0.8);
});

test('recordFromDataset: オフセット0/未設定は labelDx/labelDy キーを持たない', () => {
  const zero = StateSerializer.recordFromDataset('foundation', { id: 'a1', type: 'foundation', x: '0', y: '0', width: '1', height: '1', depth: '0.5', material: 'X', labelDx: '0', labelDy: '0' });
  assert.strictEqual('labelDx' in zero, false);
  assert.strictEqual('labelDy' in zero, false);
  const none = StateSerializer.recordFromDataset('foundation', { id: 'a2', type: 'foundation', x: '0', y: '0', width: '1', height: '1', depth: '0.5', material: 'X' });
  assert.strictEqual('labelDx' in none, false);
});

// ===== deserializeAnnotations の往復（フェイク svgEngine で復元経路を検証） =====
function makeFakeEngine(opts = {}) {
  const eng = { cleared: 0, calls: [], offsets: [] };
  eng.clearAnnotations = function () { this.cleared++; };
  eng.applyLabelOffset = function (el) { this.offsets.push(el); el._offsetApplied = true; };
  const mk = (name) => function (...args) {
    if (opts.throwOn === name) throw new Error('boom ' + name);
    const el = { dataset: {}, _attrs: {}, _method: name, _args: args,
      setAttribute(k, v) { this._attrs[k] = String(v); } };
    eng.calls.push({ method: name, args, el });
    return el;
  };
  // 必要な create メソッドのみ用意（createPole は意図的に省略＝「メソッド欠落でskip」検証用）
  eng.createChargingSpace = mk('createChargingSpace');
  eng.createFoundation = mk('createFoundation');
  return eng;
}

test('deserializeAnnotations: 型・引数・figure・labelDx を復元し applyLabelOffset を呼ぶ', () => {
  const eng = makeFakeEngine();
  const recs = [
    { type: 'charging-space', id: 'a1', x: 0, y: 0, width: 2.5, height: 5, number: '①', rotation: 0, labelDx: 1.5, labelDy: -0.8, figure: 'plan' },
    { type: 'foundation', id: 'a2', x: 1, y: 1, width: 1, height: 1, depth: 0.5, material: 'X' }
  ];
  const res = StateSerializer.deserializeAnnotations(eng, recs);
  assert.strictEqual(eng.cleared, 1);
  assert.deepStrictEqual(res, { restored: 2, skipped: 0 });

  const a1 = eng.calls.find((c) => c.args[0] === 'a1');
  assert.strictEqual(a1.method, 'createChargingSpace');
  // 引数順 [id,x,y,width,height,number,rotation]
  assert.deepStrictEqual(a1.args, ['a1', 0, 0, 2.5, 5, '①', 0]);
  assert.strictEqual(a1.el._attrs['data-figure'], 'plan');
  assert.strictEqual(Number(a1.el.dataset.labelDx), 1.5);
  assert.strictEqual(Number(a1.el.dataset.labelDy), -0.8);
  assert.strictEqual(a1.el._offsetApplied, true);

  // オフセットの無い a2 には applyLabelOffset を呼ばない
  const a2 = eng.calls.find((c) => c.args[0] === 'a2');
  assert.strictEqual(a2.el._offsetApplied, undefined);
});

test('deserializeAnnotations: 未知タイプ/欠落メソッドは throw せず skipped に計上', () => {
  const eng = makeFakeEngine();
  const res = StateSerializer.deserializeAnnotations(eng, [
    { type: 'charging-space', id: 'ok', x: 0, y: 0, width: 2.5, height: 5, number: '①', rotation: 0 },
    { type: 'totally-unknown', id: 'u1' },                 // SCHEMA に無い → skip
    { type: 'pole', id: 'p1', x: 0, y: 0, material: 'X', poleHeight: '8m' } // createPole 未実装 → skip
  ]);
  assert.strictEqual(res.restored, 1);
  assert.strictEqual(res.skipped, 2);
});

test('createCallFromRecord: null/不正レコードでも throw せず null（破損読込の堅牢化）', () => {
  assert.strictEqual(StateSerializer.createCallFromRecord(null), null);
  assert.strictEqual(StateSerializer.createCallFromRecord(undefined), null);
  assert.strictEqual(StateSerializer.createCallFromRecord('x'), null);
  assert.strictEqual(StateSerializer.createCallFromRecord({ type: 'unknown' }), null);
});

test('deserializeAnnotations: 配列に null/未知/破損が混在しても throw せず良品のみ復元', () => {
  const eng = makeFakeEngine();
  const res = StateSerializer.deserializeAnnotations(eng, [
    null,
    {},
    { type: 'unknown', id: 'u' },
    { type: 'charging-space', id: 'good', x: 0, y: 0, width: 2.5, height: 5, number: '①', rotation: 0 }
  ]);
  assert.strictEqual(res.restored, 1);
  assert.ok(res.skipped >= 3);
  assert.ok(eng.calls.find((c) => c.args[0] === 'good'));
});

test('deserializeAnnotations: create が throw しても握って skipped、後続は継続', () => {
  const eng = makeFakeEngine({ throwOn: 'createFoundation' });
  const res = StateSerializer.deserializeAnnotations(eng, [
    { type: 'foundation', id: 'bad', x: 0, y: 0, width: 1, height: 1, depth: 0.5, material: 'X' },
    { type: 'charging-space', id: 'good', x: 0, y: 0, width: 2.5, height: 5, number: '①', rotation: 0 }
  ]);
  assert.strictEqual(res.skipped, 1);
  assert.strictEqual(res.restored, 1);
  assert.ok(eng.calls.find((c) => c.args[0] === 'good'));
});
