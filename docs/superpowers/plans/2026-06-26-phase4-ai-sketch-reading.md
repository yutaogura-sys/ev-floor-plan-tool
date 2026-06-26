# フェーズ4（AI）実装計画 — ラフ図のClaude vision読取（モック先行・キーは後付け）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ラフ図（PDF）をClaude(vision)で解析し、充電スペース台数・配置・充電器・寸法・路面表示を構造化JSONで取得→図形候補に変換→フェーズ2のレビューUIで確定して配置する。APIキー未設定でも**モック応答**で全パイプラインが動くようにし、ユーザーが後で `ANTHROPIC_API_KEY` を設定すれば実読取が有効化される。

**Architecture:** 新規 `server.js`（既存 `serve.js` の静的配信＋ `POST /api/analyze-sketch`）が、`ANTHROPIC_API_KEY` があれば**公式SDK `@anthropic-ai/sdk`** で `claude-opus-4-8`（`ANALYZE_MODEL` で上書き可）を呼び、無ければ**フィクスチャを返す**。解析JSON→図形候補の変換は純関数 `sketch-to-shapes.js`（`node --test`）。ブラウザ側 `ai-reader.js` がラフ図をPNG化してPOST→候補化→`ReviewPanel`（フェーズ2）で確定→`_createFromCandidate` で生成。

**Tech Stack:** バニラJS（ブラウザ）, Node 組込み http サーバ + `@anthropic-ai/sdk`（サーバ依存）, pdf.js（既存）, `node --test`。

## Global Constraints

- ブラウザ側はビルドステップなし（`<script>` 直読み込み）。サーバ側のみ `@anthropic-ai/sdk` を `package.json` 依存に追加（既存の `pdf-to-img`/`sharp` と同様のサーバ依存。ブラウザバンドルではない）。
- 新規ブラウザJSは **ブラウザ グローバル と Node `require` の両対応**（footer）。`server.js` はNode専用（footer不要）。
- **モデル既定は `claude-opus-4-8`**。環境変数 `ANALYZE_MODEL` で上書き可（コスト調整用。例: `claude-sonnet-4-6`）。モデルIDは date サフィックスを付けない。
- **APIキーはサーバ側 `ANTHROPIC_API_KEY` 環境変数のみ**。ブラウザやリポジトリに置かない。キー未設定時はモック応答を返し、課金もネットワーク送信も発生させない。
- 既存の図形契約（`state-serializer` SCHEMA、`data-*`）とフェーズ2のパイプライン（候補 `{text,x,y,kind,label}` → `ReviewPanel` → `PDFAutoReader._createFromCandidate`）を再利用する。
- 解析の絶対座標は確定困難なため、台数・寸法・相対配置を主情報とし、最終位置はレビューUIでユーザーが調整する前提（座標は妥当な既定で配置）。
- 既存のテスト（41件）を壊さない。

## ファイル構成

| ファイル | 役割 | 区分 |
|---|---|---|
| `js/sketch-to-shapes.js` | 解析JSON→候補配列の純変換 | 新規 |
| `server.js` | 静的配信 + `POST /api/analyze-sketch`（実/モック） | 新規 |
| `js/ai-reader.js` | ラフ図PNG化→POST→候補化→ReviewPanel→生成 | 新規 |
| `js/review-panel.js` | KINDS に road-marking 追加 | 変更 |
| `js/pdf-auto-reader.js` | `_createFromCandidate` に road-marking 追加 | 変更 |
| `index.html` | script追加、AI読取ボタン追加 | 変更 |
| `js/app.js` | `this.aiReader = new AIReader(...)` 生成・ボタン配線 | 変更 |
| `.claude/launch.json` | `node server.js` に変更（ローカルのみ・gitignore） | 変更 |
| `package.json` | `@anthropic-ai/sdk` 依存追加、`start` スクリプト | 変更 |
| `README.md` | APIキー設定とnpm install手順 | 変更 |
| `test/sketch-to-shapes.test.js` | 変換のテスト | 新規 |

---

## Task 1: sketch-to-shapes.js（純変換）＋テスト

**Files:**
- Create: `js/sketch-to-shapes.js`
- Test: `test/sketch-to-shapes.test.js`

**Interfaces:**
- Produces: グローバル `SketchToShapes`。
  - `SketchToShapes.toCandidates(analysis, opts) -> candidate[]`。`analysis` は `{ charging_spaces[], chargers[], dimensions[], road_markings[], notes[] }`（後述スキーマ）。`opts = { originX, originY }`（DXF基準の配置起点・メートル。既定 0,0）。
  - 返す候補は フェーズ2 と同形 `{ text, x, y, kind, label? }`。`kind ∈ {'charging-space','charger','dimension','road-marking'}`。
  - 配置規則（純粋・決定的）:
    - charging_spaces: 各グループの `count` 台を `layout`（'horizontal' 既定）で並べる。横並びは `x = originX + i * spacing`（`spacing = (width_mm||2500)/1000 + 0.1`）, `y = originY`。各候補 `{kind:'charging-space', text:'充電スペース', x, y}`。
    - chargers: `near_space_index` の位置（無ければ i番目）に基づき `x = originX + idx*spacing + spacing/2`, `y = originY - 0.6`。`{kind:'charger', text:'充電器'+(label||''), label, x, y}`。
    - dimensions: 横一列に並べる `{kind:'dimension', text:String(value_mm), x: originX + i*1.0, y: originY - 1.5}`。
    - road_markings: `near_space_index` の位置に `{kind:'road-marking', text:'路面表示', x, y: originY}`。
  - `analysis` が空/未定義でも空配列を返す（堅牢）。

- [ ] **Step 1: 失敗するテストを書く**

`test/sketch-to-shapes.test.js`:

```js
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
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `npm test` → FAIL（`Cannot find module '../js/sketch-to-shapes.js'`）

- [ ] **Step 3: sketch-to-shapes.js を実装**

`js/sketch-to-shapes.js`:

```js
// SketchToShapes — Claude vision の解析JSON → フェーズ2の候補配列（純関数・DOM非依存）。
const SketchToShapes = {
  toCandidates(analysis, opts) {
    const out = [];
    if (!analysis || typeof analysis !== 'object') return out;
    const o = opts || {};
    const originX = typeof o.originX === 'number' ? o.originX : 0;
    const originY = typeof o.originY === 'number' ? o.originY : 0;

    // 充電スペース幅（最初のグループから推定。無ければ2500mm）
    const firstGroup = (analysis.charging_spaces || [])[0] || {};
    const widthM = ((firstGroup.width_mm || 2500) / 1000);
    const spacing = widthM + 0.1;

    // charging-space
    let placed = 0;
    for (const grp of (analysis.charging_spaces || [])) {
      const count = Math.max(0, parseInt(grp.count) || 0);
      for (let i = 0; i < count; i++) {
        out.push({ kind: 'charging-space', text: '充電スペース', x: originX + placed * spacing, y: originY });
        placed++;
      }
    }

    // charger
    (analysis.chargers || []).forEach((ch, i) => {
      const idx = (typeof ch.near_space_index === 'number') ? ch.near_space_index : i;
      const label = ch.label || '';
      out.push({ kind: 'charger', text: '充電器' + label, label, x: originX + idx * spacing + spacing / 2, y: originY - 0.6 });
    });

    // dimension
    (analysis.dimensions || []).forEach((d, i) => {
      const v = parseInt(d.value_mm);
      if (!v) return;
      out.push({ kind: 'dimension', text: String(v), x: originX + i * 1.0, y: originY - 1.5 });
    });

    // road-marking
    (analysis.road_markings || []).forEach((rm, i) => {
      const idx = (typeof rm.near_space_index === 'number') ? rm.near_space_index : i;
      out.push({ kind: 'road-marking', text: '路面表示', x: originX + idx * spacing, y: originY });
    });

    return out;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SketchToShapes;
}
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `npm test` → PASS（既存41 + sketch-to-shapes 4 = 45 tests）

- [ ] **Step 5: 構文チェック**

Run: `node --check js/sketch-to-shapes.js` → exit 0

- [ ] **Step 6: コミット**

```bash
git add js/sketch-to-shapes.js test/sketch-to-shapes.test.js
git commit -m "feat: 解析JSON→図形候補の純変換 SketchToShapes を追加"
```

---

## Task 2: server.js（静的配信 + /api/analyze-sketch、実/モック両対応）

**Files:**
- Create: `server.js`
- Modify: `package.json`（`@anthropic-ai/sdk` 依存、`start` スクリプト）
- Modify: `.claude/launch.json`（`node server.js` 起動）
- Modify: `README.md`（APIキー設定手順）

**Interfaces:**
- Produces: `POST /api/analyze-sketch`。リクエストJSON `{ imageBase64: string(PNG base64, no data: prefix), originX?, originY? }`。レスポンスJSON: 解析結果 `{ charging_spaces, chargers, dimensions, road_markings, notes, _mock?: true }`。
- `ANTHROPIC_API_KEY` 未設定時は `_mock: true` のフィクスチャを返す（SDK未インストールでも動く）。

- [ ] **Step 1: package.json を更新**

`package.json` を次に変更（既存依存は保持）:

```json
{
  "scripts": {
    "test": "node --test test/*.test.js",
    "start": "node server.js"
  },
  "dependencies": {
    "pdf-to-img": "^5.0.0",
    "sharp": "^0.34.5",
    "@anthropic-ai/sdk": "^0.69.0"
  }
}
```

> 注: バージョンは目安。`npm install @anthropic-ai/sdk` で最新を入れて構わない。

- [ ] **Step 2: server.js を作成**

`server.js`:

```js
// 静的配信 + AI読取API。ANTHROPIC_API_KEY があれば Claude(vision) を呼び、無ければモック応答。
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.dxf': 'text/plain'
};

// モック応答（APIキー未設定 / SDK未導入でもパイプラインが動く）
const MOCK_ANALYSIS = {
  charging_spaces: [{ count: 2, layout: 'horizontal', width_mm: 2500, depth_mm: 5000 }],
  chargers: [{ label: '①', near_space_index: 0 }, { label: '②', near_space_index: 1 }],
  dimensions: [{ value_mm: 2500, orientation: 'horizontal' }, { value_mm: 900, orientation: 'horizontal' }],
  road_markings: [{ near_space_index: 0 }],
  notes: ['モック応答（ANTHROPIC_API_KEY 未設定）'],
  _mock: true
};

const REPORT_TOOL = {
  name: 'report_sketch',
  description: 'EV充電設備のラフ図から、充電スペースの台数・並び・寸法、充電器、路面表示を構造化して報告する。',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      charging_spaces: { type: 'array', items: { type: 'object', additionalProperties: false,
        properties: { count: { type: 'integer' }, layout: { type: 'string' }, width_mm: { type: 'integer' }, depth_mm: { type: 'integer' } } } },
      chargers: { type: 'array', items: { type: 'object', additionalProperties: false,
        properties: { label: { type: 'string' }, near_space_index: { type: 'integer' } } } },
      dimensions: { type: 'array', items: { type: 'object', additionalProperties: false,
        properties: { value_mm: { type: 'integer' }, orientation: { type: 'string' } } } },
      road_markings: { type: 'array', items: { type: 'object', additionalProperties: false,
        properties: { near_space_index: { type: 'integer' } } } },
      notes: { type: 'array', items: { type: 'string' } }
    }
  }
};

const PROMPT = 'これはEV充電設備の設置を表すラフ図（手描きの下書き）です。充電スペースの台数と並び方（横並び/縦並び）、各スペースの幅・奥行きの寸法(mm)、充電器の数と位置、路面表示(EVマーク)の有無と位置、図中の寸法値を読み取り、report_sketch ツールで報告してください。読み取れない項目は省略して構いません。';

async function analyzeWithClaude(imageBase64) {
  const Anthropic = require('@anthropic-ai/sdk'); // 遅延require（キー有時のみ）
  const client = new Anthropic(); // ANTHROPIC_API_KEY を環境から読む
  const model = process.env.ANALYZE_MODEL || 'claude-opus-4-8';
  const resp = await client.messages.create({
    model,
    max_tokens: 4096,
    tools: [REPORT_TOOL],
    tool_choice: { type: 'tool', name: 'report_sketch' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
        { type: 'text', text: PROMPT }
      ]
    }]
  });
  const toolUse = (resp.content || []).find(b => b.type === 'tool_use');
  return toolUse ? toolUse.input : { notes: ['解析結果が空でした'] };
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/analyze-sketch') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 30 * 1024 * 1024) req.destroy(); });
    req.on('end', async () => {
      let payload = {};
      try { payload = JSON.parse(raw || '{}'); } catch (e) { return sendJSON(res, 400, { error: 'invalid JSON' }); }
      if (!process.env.ANTHROPIC_API_KEY) {
        return sendJSON(res, 200, MOCK_ANALYSIS);
      }
      try {
        const analysis = await analyzeWithClaude(payload.imageBase64 || '');
        sendJSON(res, 200, analysis);
      } catch (err) {
        console.error('analyze error:', err && err.message);
        sendJSON(res, 502, { error: 'analyze failed: ' + (err && err.message) });
      }
    });
    return;
  }
  // 静的配信
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const fp = path.join(process.cwd(), u);
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(d);
  });
});

server.listen(PORT, () => console.log('Server on ' + PORT + (process.env.ANTHROPIC_API_KEY ? ' (AI読取: 有効)' : ' (AI読取: モック)')));
```

- [ ] **Step 3: .claude/launch.json を server.js 起動に変更**

`.claude/launch.json` の `configurations[0]` を次に置換（`runtimeArgs` をワンライナーから `server.js` に）:

```json
    {
      "name": "ev-floor-plan",
      "runtimeExecutable": "node",
      "runtimeArgs": ["server.js"],
      "port": 8080,
      "autoPort": true
    }
```

- [ ] **Step 4: README.md にAI読取の手順を追記**

`README.md` の `## 起動` セクションを次に置換:

```markdown
## 起動

```bash
node server.js   # または npm start
# ブラウザで http://localhost:8080 を開く
```

## AI読取（任意）

ラフ図のAI読取（Claude vision）を有効化するには、SDKを入れてAPIキーを環境変数に設定してから起動します。

```bash
npm install                      # @anthropic-ai/sdk を含む依存を取得
export ANTHROPIC_API_KEY=sk-ant-...   # PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
# 既定モデルは claude-opus-4-8。コスト調整は ANALYZE_MODEL で上書き可:
# export ANALYZE_MODEL=claude-sonnet-4-6
node server.js
```

キー未設定時はAI読取はモック応答で動作します（課金・外部送信なし）。
```

- [ ] **Step 5: 構文チェック**

Run: `node --check server.js` → exit 0

- [ ] **Step 6: ユニットテスト（回帰なし）**

Run: `npm test` → PASS（45 tests）

- [ ] **Step 7: コミット**

```bash
git add server.js package.json .claude/launch.json README.md
git commit -m "feat: server.js に /api/analyze-sketch を追加（Claude vision / モック両対応）"
```

> 注: `.claude/` は .gitignore 済みのため launch.json はコミットされない（ローカル設定）。`git add` で warning が出ても問題ない。`server.js`/`package.json`/`README.md` はコミットされる。

---

## Task 3: ブラウザ統合（ai-reader.js + road-marking 種別追加 + ボタン配線）

**Files:**
- Create: `js/ai-reader.js`
- Modify: `js/review-panel.js`（KINDS に road-marking 追加）
- Modify: `js/pdf-auto-reader.js`（`_createFromCandidate` に road-marking 追加）
- Modify: `index.html`（script追加、AI読取ボタン）
- Modify: `js/app.js`（`this.aiReader` 生成・ボタン配線）

**Interfaces:**
- Consumes: `SketchToShapes`（Task 1）, `ReviewPanel`（フェーズ2）, `PDFAutoReader._createFromCandidate`, `app.pdfViewer`, `app.svgEngine`, `Utils.toast`。
- Produces: グローバル `AIReader`。
  - `new AIReader(svgEngine, pdfViewer, reviewPanel, pdfAutoReader)`
  - `async run()`：ラフ図をPNG化→`POST /api/analyze-sketch`→`SketchToShapes.toCandidates`→`ReviewPanel.show`→確定で `_createFromCandidate` 生成 + `updateChecklist`。失敗は `Utils.toast(..., 'error')`。

- [ ] **Step 1: review-panel.js の KINDS に road-marking を追加**

`js/review-panel.js` の `static KINDS = [...]` に、`['dimension','寸法']` の後へ1行追加:

```js
    ['road-marking', '路面表示'],
```

- [ ] **Step 2: pdf-auto-reader.js の _createFromCandidate に road-marking を追加**

`js/pdf-auto-reader.js` の `_createFromCandidate(cand)` の `switch (kind)` 内、`case 'charger':` の後に追加:

```js
      case 'road-marking':
        this.svgEngine.createRoadMarking(id, x, y, 'アスファルト');
        return { type: '路面表示', text, id };
```

- [ ] **Step 3: ai-reader.js を作成**

`js/ai-reader.js`:

```js
// AIReader — ラフ図をPNG化して /api/analyze-sketch に送り、解析結果を候補化してレビュー後に配置する。
class AIReader {
  constructor(svgEngine, pdfViewer, reviewPanel, pdfAutoReader) {
    this.svgEngine = svgEngine;
    this.pdfViewer = pdfViewer;
    this.reviewPanel = reviewPanel;
    this.pdfAutoReader = pdfAutoReader;
  }

  // 最初に読み込まれたラフ図PDFの1ページ目をPNG(base64)化。無ければ1x1の空PNGを返す。
  async _renderSketchPng() {
    const pdfs = (this.pdfViewer && this.pdfViewer.pdfs) || [];
    if (pdfs.length === 0 || !pdfs[0].pdf) {
      // 空の1x1 PNG（モック検証用フォールバック）
      return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    }
    const page = await pdfs[0].pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(viewport.width, 2000);
    canvas.height = Math.min(viewport.height, 2000);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.split(',')[1]; // base64部分のみ
  }

  _dxfOrigin() {
    // DXF範囲があればその左上付近を起点に。無ければ 0,0。
    try {
      const dxfLayer = document.getElementById('dxf-layer');
      const bbox = dxfLayer.getBBox();
      if (bbox && bbox.width > 0) return { originX: bbox.x + 1, originY: -(bbox.y + 1) };
    } catch (e) { /* noop */ }
    return { originX: 0, originY: 0 };
  }

  async run() {
    try {
      Utils.toast('ラフ図を解析中...', 'info');
      const imageBase64 = await this._renderSketchPng();
      const resp = await fetch('/api/analyze-sketch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 })
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const analysis = await resp.json();
      if (analysis.error) throw new Error(analysis.error);

      const origin = this._dxfOrigin();
      const candidates = SketchToShapes.toCandidates(analysis, origin);
      if (candidates.length === 0) {
        Utils.toast('読み取れる要素がありませんでした。', 'info');
        return;
      }
      if (analysis._mock) Utils.toast('モック応答です（APIキー未設定）。', 'info');

      this.reviewPanel.show(candidates, (adopted) => {
        const results = [];
        for (const cand of adopted) {
          const r = this.pdfAutoReader._createFromCandidate(cand);
          if (r) results.push(r);
        }
        if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
        Utils.toast(`${results.length}件をAI読取から配置しました。`, 'info');
      }, () => { /* キャンセル */ });
    } catch (err) {
      console.error('AI読取エラー:', err);
      Utils.toast('AI読取に失敗しました: ' + err.message, 'error');
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIReader;
}
```

- [ ] **Step 4: index.html に script と AI読取ボタンを追加**

`index.html` の `<script src="js/review-panel.js"></script>` の直後に追加:

```html
  <script src="js/sketch-to-shapes.js"></script>
  <script src="js/ai-reader.js"></script>
```

そして、ラフ図インポート枠（`<div class="import-slot" id="import-sketch">` 内）の `<span class="file-names" id="sketch-names">未選択</span>` の直後に追加:

```html
            <button class="import-btn" id="btn-ai-read" title="ラフ図をAIで読み取って配置" style="margin-top:4px;">🤖 AI読取</button>
```

- [ ] **Step 5: app.js に AIReader 生成とボタン配線を追加**

`js/app.js` のコンストラクタ、`this.reviewPanel = new ReviewPanel();`（フェーズ2 Task3で追加）の直後に追加:

```js
    // AI読取（ラフ図のClaude vision解析）
    this.aiReader = new AIReader(this.svgEngine, this.pdfViewer, this.reviewPanel, this.pdfAutoReader);
    const aiBtn = document.getElementById('btn-ai-read');
    if (aiBtn) aiBtn.addEventListener('click', () => this.aiReader.run());
```

> 注: `this.pdfAutoReader` は同コンストラクタ内で既に生成済み（フェーズ1/2）。生成順が `aiReader` より前であることを確認（前でなければ `this.pdfAutoReader = ...` の後に上記を置く）。

- [ ] **Step 6: 構文チェック & テスト**

Run: `node --check js/ai-reader.js && node --check js/review-panel.js && node --check js/pdf-auto-reader.js && node --check js/app.js` → 全て exit 0
Run: `npm test` → PASS（45 tests）

- [ ] **Step 7: コミット**

```bash
git add js/ai-reader.js js/review-panel.js js/pdf-auto-reader.js index.html js/app.js
git commit -m "feat: AI読取のブラウザ統合（PNG化→/api→候補→レビュー→配置）と路面表示種別"
```

---

## Task 4: ブラウザ スモークテスト（モックモードで全パイプライン）

**Files:** なし（手動検証）

**Interfaces:** Consumes 全Task成果。`ANTHROPIC_API_KEY` 未設定＝モックモードで検証（課金なし）。

- [ ] **Step 1: server.js を起動**

`.claude/launch.json` を更新済みなので preview_start（`ev-floor-plan`）で `node server.js` が起動する。`ANTHROPIC_API_KEY` は設定しない（モックモード）。preview_console_logs（level=error）でエラーなしを確認。`sketch-to-shapes.js`/`ai-reader.js` 読込エラーが無いこと。

- [ ] **Step 2: /api/analyze-sketch のモック応答を確認**

preview_eval で fetch を直接叩き、モックJSONが返ることを確認:
```js
fetch('/api/analyze-sketch', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ imageBase64: '' }) })
  .then(r => r.json()).then(j => JSON.stringify({ mock: j._mock, spaces: (j.charging_spaces||[]).length, chargers: (j.chargers||[]).length }))
```
期待: `{mock:true, spaces:1, chargers:2}`（モック定義どおり）。

- [ ] **Step 3: AI読取ボタン→レビュー→配置の全経路を確認**

preview_eval で `app.aiReader.run()` を呼ぶ（ラフ図未読込でも 1x1 フォールバックでモックが返る）。少し待ってレビューモーダルが開くことを確認（preview_snapshot で `.review-modal-overlay` とモック由来の候補：充電スペース×2・充電器①②・寸法×2・路面表示×1 が並ぶ）。`.rv-confirm` を click → モーダル閉 → `app.svgEngine.getAnnotations().length` が候補数（=6）になることを確認。要件チェックの「充電スペース寸法」等が更新されること。

例（eval、配置数の確認）:
```js
(async () => {
  app.svgEngine.clearAnnotations();
  await app.aiReader.run();
  // モーダルが出るまで少し待つ
  await new Promise(r => setTimeout(r, 800));
  const box = document.querySelector('.review-modal-overlay');
  const rows = box ? box.querySelectorAll('.rv-adopt').length : 0;
  if (box) box.querySelector('.rv-confirm').click();
  return JSON.stringify({ rows, placed: app.svgEngine.getAnnotations().length });
})()
```
期待: `rows=6, placed=6`（全採用時）。

- [ ] **Step 4: クリーンアップ**

preview_eval で `app.svgEngine.clearAnnotations(); try{localStorage.removeItem('ev-floorplan-autosave');}catch(e){} app.history.reset(StateSerializer.snapshot(app.svgEngine)); app._updateHistoryButtons();`。

- [ ] **Step 5: 体裁が崩れていれば最小限のCSS調整のみコミット**

---

## Self-Review メモ

- **Spec coverage:** #1 AI読取 = 純変換(Task1) + backend実/モック(Task2) + ブラウザ統合(Task3) + 検証(Task4)。設計書フェーズ4（server.js拡張・vision・構造化JSON・レビューUI経由）を網羅。
- **Placeholder scan:** なし（全ステップに実コード）。SDKバージョンは「目安」と明記。
- **Type consistency:** `SketchToShapes.toCandidates(analysis, {originX,originY})` → 候補 `{text,x,y,kind,label?}`（フェーズ2と同形）。`kind` に 'road-marking' を追加し、ReviewPanel.KINDS と `_createFromCandidate` の双方へ反映（Task3 Step1,2）。`AIReader.run()` が `reviewPanel.show(cands, onConfirm, onCancel)`（フェーズ2のキャンセル対応シグネチャ）を使用。
- **モデル:** 既定 `claude-opus-4-8`（claude-apiスキル準拠）、`ANALYZE_MODEL` で上書き可。
- **キー安全性:** サーバ環境変数のみ。未設定＝モック（課金/送信なし）。`.claude/`・顧客データは .gitignore 済み。
- **依存:** `@anthropic-ai/sdk` はサーバ依存（遅延require）。未インストールでもモックモードは動作（require はキー有時のみ実行）。
- **行番号注意:** 既存ファイルの編集位置はメソッド名・近傍コードで特定。
- **依存順:** Task1（SketchToShapes）→ Task3。Task2（API）→ Task4。Task3（統合）→ Task4。
```
