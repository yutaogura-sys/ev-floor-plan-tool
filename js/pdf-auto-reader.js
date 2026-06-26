// PDF Auto Reader - Extracts text from PDF and creates annotations
class PDFAutoReader {
  constructor(svgEngine, pdfViewer) {
    this.svgEngine = svgEngine;
    this.pdfViewer = pdfViewer;
  }

  // 純分類関数（DOM非依存・Nodeテスト可能）。既存の _classifyAndCreate の分類ロジックを踏襲。
  static classifyText(text) {
    if (!text) return null;
    if (/充電スペース/.test(text)) return { kind: 'charging-space' };
    if (/充電器[①-⑳\d]/.test(text) || /EV充電/.test(text)) {
      return { kind: 'charger', label: text.replace(/充電器/, '').trim() };
    }
    if (/WL\d/i.test(text) || /CV\d*sq/i.test(text) || /\d+sq/i.test(text) || /HIVE/i.test(text)) {
      return { kind: 'wire' };
    }
    if (/P\.?BOX/i.test(text) || /分電盤/.test(text) || /キュービクル/.test(text)) {
      return { kind: 'equipment' };
    }
    if (/FEP/i.test(text) || /PFD/i.test(text) || /配管/.test(text) || /PF管/.test(text)) {
      return { kind: 'conduit' };
    }
    if (/^\d{2,5}$/.test(text)) return { kind: 'dimension' };
    if (/建物/.test(text) || /店舗/.test(text)) return { kind: 'building-text' };
    if (text.length >= 2) return { kind: 'text' };
    return null;
  }

  /**
   * Extract text from a PDF overlay and create annotations.
   * Uses overlay transform for coordinate mapping.
   * @param {string} overlayId - The overlay's data-id
   */
  async extractFromOverlay(overlayId) {
    const overlay = this.pdfViewer.overlays.find(o => o.id === overlayId);
    if (!overlay) {
      console.warn('オーバーレイが見つかりません');
      return { count: 0, items: [] };
    }

    const { pdfInfo, pageNum, group } = overlay;
    const params = {
      overlayX: parseFloat(group.dataset.x) || 0,
      overlayY: parseFloat(group.dataset.y) || 0,
      overlayScale: parseFloat(group.dataset.scale) || 1,
      overlayRotation: parseFloat(group.dataset.rotation) || 0,
      imgWidthDXF: parseFloat(group.dataset.width) || 30,
      imgHeightDXF: parseFloat(group.dataset.height) || 20
    };

    return this._extractFromPage(pdfInfo, pageNum, params);
  }

  /**
   * Extract text directly from a PDF document (no overlay required).
   * Maps PDF coordinates to DXF space using DXF bounds.
   * @param {number} pdfIndex - Index into pdfViewer.pdfs[]
   * @param {number} pageNum - Page number (1-based)
   */
  async extractDirect(pdfIndex, pageNum = 1) {
    const pdfInfo = this.pdfViewer.pdfs[pdfIndex];
    if (!pdfInfo) {
      console.warn('PDFが見つかりません');
      return { count: 0, items: [] };
    }

    // Get DXF bounds for coordinate mapping
    const dxfLayer = document.getElementById('dxf-layer');
    const bbox = dxfLayer.getBBox();
    if (!bbox || bbox.width === 0) {
      console.warn('DXFが読み込まれていません');
      return { count: 0, items: [] };
    }

    // Map PDF page to DXF bounds
    const page = await pdfInfo.pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });

    // The PDF page maps to the DXF bounding area
    // PDF origin is bottom-left, DXF/SVG origin is top-left (Y flipped)
    const pdfW = viewport.width;
    const pdfH = viewport.height;
    const dxfW = bbox.width;
    const dxfH = bbox.height;

    // Scale to fit PDF into DXF bounds (maintain aspect ratio)
    const scaleX = dxfW / pdfW;
    const scaleY = dxfH / pdfH;
    const fitScale = Math.min(scaleX, scaleY);

    // Center the PDF within DXF bounds
    const fittedW = pdfW * fitScale;
    const fittedH = pdfH * fitScale;
    const offsetX = bbox.x + (dxfW - fittedW) / 2;
    const offsetY = bbox.y + (dxfH - fittedH) / 2;

    const params = {
      overlayX: offsetX + fittedW / 2,
      overlayY: offsetY + fittedH / 2,
      overlayScale: 1,
      overlayRotation: 0,
      imgWidthDXF: fittedW,
      imgHeightDXF: fittedH
    };

    return this._extractFromPage(pdfInfo, pageNum, params);
  }

  /**
   * Core extraction logic
   */
  async _extractFromPage(pdfInfo, pageNum, params) {
    const { overlayX, overlayY, overlayScale, overlayRotation, imgWidthDXF, imgHeightDXF } = params;

    const page = await pdfInfo.pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    const pdfPageWidth = viewport.width;
    const pdfPageHeight = viewport.height;
    const ptToDxf = imgWidthDXF / pdfPageWidth;

    const rotRad = (overlayRotation * Math.PI) / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);

    // Extract and convert text items
    const rawItems = textContent.items
      .filter(item => item.str && item.str.trim())
      .map(item => {
        const [a, b, c, d, pdfX, pdfY] = item.transform;
        // Detect text rotation: atan2(b, a) gives angle
        const textAngle = Math.atan2(b, a);
        const isRotated = Math.abs(textAngle) > 0.1; // ~6° threshold

        // Font size from transform matrix (works for any rotation)
        const fontSize = Math.sqrt(a * a + b * b);

        const localX = pdfX * ptToDxf - imgWidthDXF / 2;
        const localY = -(pdfY * ptToDxf - imgHeightDXF / 2);

        const worldX = overlayX + overlayScale * (localX * cosR - localY * sinR);
        const worldY = overlayY + overlayScale * (localX * sinR + localY * cosR);

        return {
          str: item.str.trim(),
          x: worldX,
          y: worldY,
          width: (item.width || 0) * ptToDxf * overlayScale,
          height: (item.height || fontSize || 10) * ptToDxf * overlayScale,
          fontSize: fontSize * ptToDxf * overlayScale,
          isRotated
        };
      });

    // Group nearby text items (only horizontal text gets grouped;
    // rotated text items are kept separate as they're complete labels)
    const horizontal = rawItems.filter(i => !i.isRotated);
    const rotated = rawItems.filter(i => i.isRotated);
    const grouped = [...this._groupTextItems(horizontal), ...rotated];

    // Build candidates (classify only; do NOT create yet)
    const candidates = [];
    for (const item of grouped) {
      const cls = PDFAutoReader.classifyText(item.str);
      if (!cls) continue;
      candidates.push({ text: item.str, x: item.x, y: item.y, kind: cls.kind, label: cls.label });
    }

    if (candidates.length === 0) {
      this._showNotification('読取可能な候補が見つかりませんでした。');
      return { count: 0, items: [] };
    }

    // Review before creating
    const panel = (typeof app !== 'undefined' && app.reviewPanel) ? app.reviewPanel : new ReviewPanel();
    return new Promise((resolve) => {
      panel.show(candidates, (adopted) => {
        const results = [];
        for (const cand of adopted) {
          const r = this._createFromCandidate(cand);
          if (r) results.push(r);
        }
        if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
        this._showNotification(`${results.length}件の注釈を配置しました。`);
        resolve({ count: results.length, items: results });
      });
    });
  }

  /**
   * Group nearby text items into logical units
   */
  _groupTextItems(items) {
    if (items.length === 0) return [];

    const sorted = [...items].sort((a, b) => {
      if (Math.abs(a.y - b.y) < a.height * 1.5) return a.x - b.x;
      return a.y - b.y;
    });

    const groups = [];
    const used = new Set();

    for (let i = 0; i < sorted.length; i++) {
      if (used.has(i)) continue;

      const group = [sorted[i]];
      used.add(i);

      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(j)) continue;
        const base = group[group.length - 1];
        const candidate = sorted[j];

        // Only merge items that are truly adjacent on the same line
        const yDist = Math.abs(candidate.y - base.y);
        if (yDist < base.height * 0.8) {
          // Horizontal gap must be very small (touching or slightly separated)
          const gap = candidate.x - (base.x + base.width);
          if (gap >= 0 && gap < base.height * 0.5) {
            group.push(candidate);
            used.add(j);
          }
        }
      }

      const mergedStr = group.map(g => g.str).join('');
      groups.push({
        str: mergedStr,
        x: group[0].x,
        y: group.reduce((s, g) => s + g.y, 0) / group.length,
        width: group.reduce((s, g) => s + g.width, 0),
        height: group[0].height,
        fontSize: group[0].fontSize
      });
    }

    return groups;
  }

  // 採用された候補から実際の注釈を生成する（kind はレビューでユーザーが変更済みの可能性あり）
  _createFromCandidate(cand) {
    const { text, x, y, kind, label } = cand;
    const id = Utils.generateId();
    switch (kind) {
      case 'charging-space':
        this.svgEngine.createChargingSpace(id, x, y, 2.5, 5, '');
        return { type: '充電スペース', text, id };
      case 'charger':
        this.svgEngine.createCharger(id, x, y, 0, label || '');
        return { type: '充電器', text, id };
      case 'wire':
        this.svgEngine.createLeaderAnnotation(id, x, y, x + 2, y - 1, [text], '#cc6600');
        return { type: '配線', text, id };
      case 'equipment':
        this.svgEngine.createLeaderAnnotation(id, x, y, x + 2, y - 1, [text], '#009933');
        return { type: '機器', text, id };
      case 'conduit':
        this.svgEngine.createLeaderAnnotation(id, x, y, x + 2, y - 1, [text], '#0066cc');
        return { type: '配管', text, id };
      case 'dimension':
        this.svgEngine.createTextAnnotation(id, x, y, text, 0.25, '#0066cc');
        return { type: '寸法', text: `${text}mm`, id };
      case 'building-text':
        this.svgEngine.createTextAnnotation(id, x, y, text, 0.5, '#333');
        return { type: 'テキスト', text, id };
      case 'text':
        this.svgEngine.createTextAnnotation(id, x, y, text, 0.25, '#333');
        return { type: 'テキスト', text, id };
      default:
        return null;
    }
  }

  /**
   * Show a non-blocking notification toast
   */
  _showNotification(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; top: 60px; left: 50%; transform: translateX(-50%);
      background: #333; color: #fff; padding: 12px 24px; border-radius: 8px;
      font-size: 14px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: opacity 0.5s;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PDFAutoReader;
}
