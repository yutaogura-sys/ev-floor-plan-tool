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
