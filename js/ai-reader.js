// AIReader — ラフ図をPNG化して /api/analyze-sketch に送り、解析結果を候補化してレビュー後に配置する。
// #3: 複数ページ対応・読取中ローディング表示・DXF基準のページ別オフセット配置。
class AIReader {
  constructor(svgEngine, pdfViewer, reviewPanel, pdfAutoReader) {
    this.svgEngine = svgEngine;
    this.pdfViewer = pdfViewer;
    this.reviewPanel = reviewPanel;
    this.pdfAutoReader = pdfAutoReader;
  }

  // 複数ページ結果を縦に離して配置するためのページ別起点（純関数・テスト対象）。
  static pageOrigin(base, pageIndex, gapY) {
    const b = base || { originX: 0, originY: 0 };
    const g = (typeof gapY === 'number') ? gapY : AIReader.PAGE_GAP_Y;
    return { originX: b.originX, originY: b.originY - pageIndex * g };
  }

  // 指定ページをPNG(base64)化。PDF が無ければ 1x1 の空PNG（モック検証用フォールバック）。
  async _renderSketchPng(pageNum) {
    const pdfs = (this.pdfViewer && this.pdfViewer.pdfs) || [];
    if (pdfs.length === 0 || !pdfs[0].pdf) {
      return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    }
    const page = await pdfs[0].pdf.getPage(pageNum || 1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(viewport.width, 2000);
    canvas.height = Math.min(viewport.height, 2000);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.split(',')[1]; // base64部分のみ
  }

  // 解析対象ページ数（最初のラフ図PDFのページ数、上限 MAX_PAGES）。PDF無しは1。
  _pageCount() {
    const pdfs = (this.pdfViewer && this.pdfViewer.pdfs) || [];
    const n = (pdfs[0] && pdfs[0].numPages) ? pdfs[0].numPages : 1;
    return Math.max(1, Math.min(n, AIReader.MAX_PAGES));
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

  // ===== 読取中ローディング表示 =====
  _showLoading(msg) {
    this._hideLoading();
    if (!document.getElementById('ai-spin-style')) {
      const st = document.createElement('style');
      st.id = 'ai-spin-style';
      st.textContent = '@keyframes ai-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
    const o = document.createElement('div');
    o.id = 'ai-loading-overlay';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10002;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;';
    const sp = document.createElement('div');
    sp.style.cssText = 'width:44px;height:44px;border:4px solid rgba(255,255,255,0.3);border-top-color:#4a9eff;border-radius:50%;animation:ai-spin 0.8s linear infinite;';
    const txt = document.createElement('div');
    txt.id = 'ai-loading-text';
    txt.style.cssText = 'color:#fff;font-family:Meiryo,sans-serif;font-size:14px;text-shadow:0 1px 2px rgba(0,0,0,0.5);';
    txt.textContent = msg || '解析中...';
    o.appendChild(sp);
    o.appendChild(txt);
    document.body.appendChild(o);
  }

  _updateLoading(msg) {
    const t = document.getElementById('ai-loading-text');
    if (t) t.textContent = msg;
  }

  _hideLoading() {
    const o = document.getElementById('ai-loading-overlay');
    if (o) o.remove();
  }

  async run() {
    const pageCount = this._pageCount();
    const base = this._dxfOrigin();
    let allCandidates = [];
    let anyMock = false;

    this._showLoading('ラフ図を解析中...');
    try {
      for (let p = 1; p <= pageCount; p++) {
        if (pageCount > 1) this._updateLoading(`ラフ図を解析中... (ページ ${p}/${pageCount})`);
        const imageBase64 = await this._renderSketchPng(p);
        const resp = await fetch('/api/analyze-sketch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64 })
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const analysis = await resp.json();
        if (analysis.error) throw new Error(analysis.error);
        if (analysis._mock) anyMock = true;

        const origin = AIReader.pageOrigin(base, p - 1);
        const cands = SketchToShapes.toCandidates(analysis, origin);
        if (pageCount > 1) cands.forEach((c) => { c.page = p; });
        allCandidates = allCandidates.concat(cands);
      }
    } catch (err) {
      this._hideLoading();
      console.error('AI読取エラー:', err);
      Utils.toast('AI読取に失敗しました: ' + err.message, 'error');
      return;
    }
    this._hideLoading();

    if (allCandidates.length === 0) {
      Utils.toast('読み取れる要素がありませんでした。', 'info');
      return;
    }
    if (anyMock) Utils.toast('モック応答です（APIキー未設定）。', 'info');

    this.reviewPanel.show(allCandidates, (adopted) => {
      const results = [];
      for (const cand of adopted) {
        const r = this.pdfAutoReader._createFromCandidate(cand);
        if (r) results.push(r);
      }
      if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
      // 配置結果が画面に収まるようビューをフィット（結果が見えないのを防ぐ）
      if (typeof app !== 'undefined' && app.viewport && app.viewport.fitToExtents) app.viewport.fitToExtents();
      Utils.toast(`${results.length}件をAI読取から配置しました。`, 'info');
    }, () => { /* キャンセル */ });
  }
}

// 静的設定
AIReader.MAX_PAGES = 10;     // 解析対象ページ数の上限
AIReader.PAGE_GAP_Y = 8;     // m: 複数ページ結果を縦に離す間隔

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIReader;
}
