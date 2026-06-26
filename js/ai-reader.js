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
