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

test('encodeShiftJIS: 日本語ラベルが Shift-JIS で往復一致する', () => {
  const dec = new TextDecoder('shift_jis', { fatal: false });
  for (const s of ['【充電スペース①】', '幅2.5m×奥行5.0m', '分電盤', 'ハンドホール', 'EV']) {
    const bytes = Utils.encodeShiftJIS(s);
    assert.ok(bytes instanceof Uint8Array, 'returns Uint8Array');
    assert.strictEqual(dec.decode(bytes), s, `roundtrip: ${s}`);
  }
});

test('encodeShiftJIS: ASCIIは1バイトで保持・改行も保持', () => {
  const bytes = Utils.encodeShiftJIS('0\r\nLINE\r\n');
  assert.deepStrictEqual([...bytes], [0x30, 0x0d, 0x0a, 0x4c, 0x49, 0x4e, 0x45, 0x0d, 0x0a]);
});

test('encodeShiftJIS: CP932に無い文字は ? に置換（throwしない）', () => {
  const bytes = Utils.encodeShiftJIS('A😀B'); // 絵文字はCP932外
  assert.deepStrictEqual([...bytes], [0x41, 0x3f, 0x42]);
});
