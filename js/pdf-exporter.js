// PDF Exporter - Export drawing as A3 landscape PDF
// Uses native browser SVG rendering via Canvas for perfect Japanese text support
// and fast rendering even with complex DXF data (94K+ polylines)
class PDFExporter {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
  }

  /**
   * Export PDF filtered by figure type
   * @param {'plan'|'route'} figureType - 'plan' exports plan+shared, 'route' exports route+shared
   */
  async exportPDF(figureType = 'plan') {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const progressFill = document.getElementById('progress-fill');
    overlay.classList.remove('hidden');
    progressFill.style.width = '0%';

    const typeLabel = figureType === 'route' ? '配線ルート図' : '平面図';
    loadingText.textContent = `${typeLabel}PDFを生成中...`;

    // Determine allowed figure layers for this export type
    const allowedFigures = figureType === 'route'
      ? ['route', 'shared']
      : ['plan', 'shared'];

    try {
      // A3 landscape: 420mm x 297mm
      // Use 300 DPI for crisp output on A3
      const DPI = 300;
      const A3_W_MM = 420;
      const A3_H_MM = 297;
      const pxW = Math.round(A3_W_MM * DPI / 25.4);  // ~4961px
      const pxH = Math.round(A3_H_MM * DPI / 25.4);  // ~3508px

      progressFill.style.width = '10%';
      loadingText.textContent = 'SVGを準備中...';

      // Prepare clean SVG string with export-optimized viewBox
      const svgString = this._prepareSVGString(pxW, pxH, allowedFigures, figureType);

      progressFill.style.width = '30%';
      loadingText.textContent = '画像をレンダリング中...';

      // Render SVG to Canvas using browser's native SVG renderer
      const imgData = await this._renderSVGToCanvas(svgString, pxW, pxH);

      progressFill.style.width = '70%';
      loadingText.textContent = 'PDFを作成中...';

      // Create jsPDF
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a3'
      });

      // Add rendered image to PDF
      doc.addImage(imgData, 'JPEG', 0, 0, A3_W_MM, A3_H_MM, undefined, 'FAST');

      progressFill.style.width = '90%';
      loadingText.textContent = 'PDFを保存中...';

      // Generate filename based on figure type
      const siteName = document.getElementById('tb-site-name').value || typeLabel;
      const date = new Date().toISOString().split('T')[0];
      const prefix = figureType === 'route' ? '【③配線ルート図】' : '【②平面図】';
      const filename = `${prefix}${siteName}_${date}.pdf`;

      doc.save(filename);

      progressFill.style.width = '100%';
      loadingText.textContent = `${typeLabel}PDF出力完了`;
      setTimeout(() => overlay.classList.add('hidden'), 1000);
    } catch (err) {
      console.error('PDF export failed:', err);
      loadingText.textContent = 'PDF出力に失敗しました: ' + err.message;
      setTimeout(() => overlay.classList.add('hidden'), 3000);
    }
  }

  _prepareSVGString(pxW, pxH, allowedFigures = ['plan', 'shared'], figureType = 'plan') {
    const svg = document.getElementById('drawing-canvas');
    const clone = svg.cloneNode(true);
    clone.classList.remove('labels-hidden'); // PDF出力は画面トグルによらず詳細ラベルを常に含める

    // Remove interaction layer
    const il = clone.querySelector('#interaction-layer');
    if (il) il.innerHTML = '';

    // Remove grid
    const gl = clone.querySelector('#grid-layer');
    if (gl) gl.remove();

    // Remove export boundary overlay (blue dashed border preview)
    const ebl = clone.querySelector('#export-boundary-layer');
    if (ebl) ebl.innerHTML = '';

    // Remove the existing title block (we'll re-render it at the correct export position)
    const existingTB = clone.querySelector('#title-block-layer');
    if (existingTB) existingTB.innerHTML = '';

    // Filter annotations by data-figure attribute
    // Remove any annotation whose data-figure is NOT in allowedFigures
    const annotationLayer = clone.querySelector('#annotation-layer');
    if (annotationLayer) {
      const annotations = annotationLayer.querySelectorAll('[data-type]');
      annotations.forEach(ann => {
        const figure = ann.getAttribute('data-figure') || 'plan'; // default to plan for backward compat
        if (!allowedFigures.includes(figure)) {
          ann.remove();
        }
      });
    }

    // Set pixel dimensions for canvas rendering
    clone.setAttribute('width', pxW);
    clone.setAttribute('height', pxH);

    // Compute the export viewBox (based on filtered annotations only)
    const exportVB = this._computeExportViewBox(allowedFigures);
    clone.setAttribute('viewBox', `${exportVB.x} ${exportVB.y} ${exportVB.w} ${exportVB.h}`);

    // Add white background as first element
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', exportVB.x);
    bg.setAttribute('y', exportVB.y);
    bg.setAttribute('width', exportVB.w);
    bg.setAttribute('height', exportVB.h);
    bg.setAttribute('fill', 'white');
    clone.insertBefore(bg, clone.firstChild);

    // Re-render title block at bottom-right of the export viewBox
    this._renderExportTitleBlock(clone, existingTB, exportVB, figureType);

    // Draw frame border (outer + inner lines)
    this._renderDrawingFrame(clone, exportVB);

    // Draw north arrow symbol
    this._renderNorthArrow(clone, exportVB);

    // Draw legend table (凡例)
    this._renderLegend(clone, exportVB, figureType);

    // Inline all styles (CSS classes don't transfer to Image rendering)
    this._inlineStyles(clone);

    // Serialize to string
    const serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(clone);

    // Ensure proper SVG namespace
    if (!svgStr.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    return svgStr;
  }

  /**
   * Compute the centroid of annotations matching the allowed figure layers
   */
  _computeAnnotationCenter(allowedFigures) {
    const annotationLayer = document.getElementById('annotation-layer');
    const annotations = annotationLayer.querySelectorAll('[data-type]');
    let sumX = 0, sumY = 0, count = 0;

    annotations.forEach(ann => {
      const figure = ann.getAttribute('data-figure') || 'plan';
      if (!allowedFigures.includes(figure)) return;
      try {
        const bbox = ann.getBBox();
        if (bbox.width <= 0 && bbox.height <= 0) return;
        sumX += bbox.x + bbox.width / 2;
        sumY += bbox.y + bbox.height / 2;
        count++;
      } catch (e) { /* skip */ }
    });

    if (count > 0) return { x: sumX / count, y: sumY / count };

    // Fallback: DXF layer center
    const dxfLayer = document.getElementById('dxf-layer');
    try {
      const db = dxfLayer.getBBox();
      if (db.width > 0) return { x: db.x + db.width / 2, y: db.y + db.height / 2 };
    } catch (e) { /* empty */ }
    return { x: 0, y: 0 };
  }

  _computeExportViewBox(allowedFigures = ['plan', 'shared']) {
    // Check if scale is specified — if so, use scale-based calculation
    const scaleStr = (typeof app !== 'undefined' && app.titleBlock?.data?.scale) || '';
    const scaleN = Utils.parseScale(scaleStr);

    const A3_W_MM = 420;
    const A3_H_MM = 297;

    if (scaleN) {
      // Scale-based viewBox: A3 paper dimensions × scale ratio → real-world area in meters
      const vbW = A3_W_MM * scaleN / 1000; // e.g. 420 * 100 / 1000 = 42m
      const vbH = A3_H_MM * scaleN / 1000; // e.g. 297 * 100 / 1000 = 29.7m

      // Use export boundary position if available, otherwise fall back to viewport center
      const eb = (typeof app !== 'undefined' && app.exportBoundary?.bounds);
      if (eb && eb.w > 0) {
        return { x: eb.x, y: eb.y, w: eb.w, h: eb.h };
      }

      const svg = document.getElementById('drawing-canvas');
      const vb = svg.viewBox.baseVal;
      const cx = vb.x + vb.width / 2;
      const cy = vb.y + vb.height / 2;

      return {
        x: cx - vbW / 2,
        y: cy - vbH / 2,
        w: vbW,
        h: vbH
      };
    }

    // Fallback: BBox-based calculation (when no valid scale is specified)
    const annotationLayer = document.getElementById('annotation-layer');
    const dxfLayer = document.getElementById('dxf-layer');

    let minX, minY, maxX, maxY;
    let hasAnnotations = false;

    // Compute bounding box from only the annotations matching allowed figures
    const annotations = annotationLayer.querySelectorAll('[data-type]');
    annotations.forEach(ann => {
      const figure = ann.getAttribute('data-figure') || 'plan';
      if (!allowedFigures.includes(figure)) return;
      try {
        const bbox = ann.getBBox();
        if (bbox.width <= 0 && bbox.height <= 0) return;
        if (!hasAnnotations) {
          minX = bbox.x;
          minY = bbox.y;
          maxX = bbox.x + bbox.width;
          maxY = bbox.y + bbox.height;
          hasAnnotations = true;
        } else {
          minX = Math.min(minX, bbox.x);
          minY = Math.min(minY, bbox.y);
          maxX = Math.max(maxX, bbox.x + bbox.width);
          maxY = Math.max(maxY, bbox.y + bbox.height);
        }
      } catch (e) { /* skip elements without geometry */ }
    });

    if (hasAnnotations) {
      const contentW = maxX - minX;
      const contentH = maxY - minY;
      const marginFactor = 0.6;
      minX -= contentW * marginFactor;
      minY -= contentH * marginFactor;
      maxX += contentW * marginFactor;
      maxY += contentH * marginFactor;
    } else {
      // Try EV_ layers first (for re-imported DXFs with annotation data)
      let evBBox = null;
      const evLayers = dxfLayer.querySelectorAll('[id^="layer-EV_"]');
      if (evLayers.length > 0) {
        for (const evl of evLayers) {
          try {
            const bb = evl.getBBox();
            if (bb.width <= 0 && bb.height <= 0) continue;
            if (!evBBox) {
              evBBox = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
            } else {
              const ex = Math.min(evBBox.x, bb.x);
              const ey = Math.min(evBBox.y, bb.y);
              evBBox.w = Math.max(evBBox.x + evBBox.w, bb.x + bb.width) - ex;
              evBBox.h = Math.max(evBBox.y + evBBox.h, bb.y + bb.height) - ey;
              evBBox.x = ex;
              evBBox.y = ey;
            }
          } catch (e) {}
        }
      }
      if (evBBox && evBBox.w > 0) {
        const pad = Math.max(evBBox.w, evBBox.h) * 0.3;
        minX = evBBox.x - pad;
        minY = evBBox.y - pad;
        maxX = evBBox.x + evBBox.w + pad;
        maxY = evBBox.y + evBBox.h + pad;
      } else {
        const dxfBBox = dxfLayer.getBBox();
        if (dxfBBox.width > 0) {
          const pad = Math.max(dxfBBox.width, dxfBBox.height) * 0.05;
          minX = dxfBBox.x - pad;
          minY = dxfBBox.y - pad;
          maxX = dxfBBox.x + dxfBBox.width + pad;
          maxY = dxfBBox.y + dxfBBox.height + pad;
        } else {
          return { x: -50, y: -50, w: 100, h: 100 / (420 / 297) };
        }
      }
    }

    // Reserve space for title block at bottom
    const titleBlockReserve = (maxY - minY) * 0.08;
    maxY += titleBlockReserve;

    // Enforce A3 landscape aspect ratio (420:297 ≈ 1.4141)
    const targetRatio = A3_W_MM / A3_H_MM;
    let vbW = maxX - minX;
    let vbH = maxY - minY;
    const currentRatio = vbW / vbH;

    if (currentRatio > targetRatio) {
      const newH = vbW / targetRatio;
      const diff = newH - vbH;
      minY -= diff / 2;
      vbH = newH;
    } else {
      const newW = vbH * targetRatio;
      const diff = newW - vbW;
      minX -= diff / 2;
      vbW = newW;
    }

    return { x: minX, y: minY, w: vbW, h: vbH };
  }

  _renderExportTitleBlock(svgClone, titleBlockLayer, exportVB, figureType = 'plan') {
    // Render title block at bottom-right of export viewBox
    // Scale the title block proportional to the export view
    // On A3 paper at 1:100, blockWidth=16m and blockHeight=1.2m
    // = 160mm and 12mm on paper
    // The viewBox maps to 420mm x 297mm on paper
    // So blockWidth should be 160/420 * vbW, blockHeight = 12/297 * vbH

    if (!titleBlockLayer) return;

    const S = this.svgEngine ? this.svgEngine.S : {
      fontSmall: 0.25, fontMedium: 0.35, fontLarge: 0.5,
      strokeThin: 0.05, strokeMedium: 0.08
    };

    // Get title block data from the app's title block instance
    const data = (typeof app !== 'undefined' && app.titleBlock) ? app.titleBlock.data : {};

    // Title block dimensions relative to viewBox (same proportions as paper)
    // Paper: 160mm wide, 12mm tall on 420x297mm A3
    const paperScale = exportVB.w / 420; // DXF units per mm on paper
    const blockWidth = 160 * paperScale;
    const blockHeight = 12 * paperScale;
    const rowHeight = blockHeight / 2;

    // Position at bottom-right with small margin
    const margin = exportVB.w * 0.01;
    const x = exportVB.x + exportVB.w - blockWidth - margin;
    const y = exportVB.y + exportVB.h - blockHeight - margin;

    const sw = blockHeight * 0.01;
    const fsLabel = blockHeight * 0.15;
    const fsValue = blockHeight * 0.2;

    const ns = 'http://www.w3.org/2000/svg';

    // Helper to create SVG elements in the clone context
    const makeEl = (tag, attrs) => {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
      }
      return el;
    };

    const addText = (tx, ty, text, fontSize, anchor = 'middle', weight = 'normal') => {
      const el = makeEl('text', {
        x: tx, y: ty,
        'font-size': fontSize,
        fill: '#333',
        'font-family': 'Meiryo, "Yu Gothic", sans-serif',
        'text-anchor': anchor,
        'font-weight': weight
      });
      el.textContent = text || '';
      titleBlockLayer.appendChild(el);
    };

    // Main border
    titleBlockLayer.appendChild(makeEl('rect', {
      x, y, width: blockWidth, height: blockHeight,
      fill: 'white', stroke: '#333', 'stroke-width': sw * 2
    }));

    // Row divider
    const midY = y + rowHeight;
    titleBlockLayer.appendChild(makeEl('line', {
      x1: x, y1: midY, x2: x + blockWidth, y2: midY,
      stroke: '#333', 'stroke-width': sw
    }));

    // Column positions
    const col1 = x + blockWidth * 0.09375;     // ~1.5/16
    const col2 = x + blockWidth * 0.65625;     // ~10.5/16
    const col3 = x + blockWidth * 0.7;         // ~11.2/16
    const col4 = x + blockWidth * 0.8125;      // ~13/16

    // Vertical column dividers
    [col1, col2, col3, col4].forEach(cx => {
      titleBlockLayer.appendChild(makeEl('line', {
        x1: cx, y1: y, x2: cx, y2: y + blockHeight,
        stroke: '#333', 'stroke-width': sw
      }));
    });

    // Text vertical centering offset
    const vOff = fsLabel * 0.35;

    // === Row 1: 設置場所 | サイト名 工事名 | 図面名称 | 平面図 ===
    const r1y = y + rowHeight / 2 + vOff;
    addText((x + col1) / 2, r1y, '設置場所', fsLabel);
    const siteText = data.siteName ?
      `${data.siteName}　${data.projectName || '充電設備設置工事'}` : '';
    addText((col1 + col2) / 2, r1y, siteText, fsLabel);
    addText((col2 + col3) / 2, r1y, '図面名称', fsLabel);
    // Override drawing name based on export figure type
    const drawingName = figureType === 'route' ? '配線ルート図' : (data.drawingName || '平面図');
    addText((col3 + col4) / 2, r1y, drawingName, fsValue, 'middle', 'bold');

    // === Row 2: 作成者 | 名前 | 縮尺 | A3:1/100 | 作成日 | 日付 ===
    const r2y = y + rowHeight + rowHeight / 2 + vOff;
    addText((x + col1) / 2, r2y, '作成者', fsLabel);
    addText((col1 + col2) / 2, r2y, data.author || '', fsValue);
    addText((col2 + col3) / 2, r2y, '縮尺', fsLabel);
    addText((col3 + col4) / 2, r2y, data.scale || 'A3:1/100', fsLabel);
    addText((col4 + x + blockWidth) / 2, y + rowHeight / 2 + vOff, '作成日', fsLabel);

    let dateStr = '';
    if (data.date) {
      const d = new Date(data.date);
      dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    addText((col4 + x + blockWidth) / 2, r2y, dateStr, fsLabel * 0.85);
  }

  /**
   * Draw a professional drawing frame (図面枠) - outer and inner border lines
   */
  _renderDrawingFrame(svgClone, exportVB) {
    const ns = 'http://www.w3.org/2000/svg';
    const makeEl = (tag, attrs) => {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };

    // paperScale: DXF units per mm on paper
    const paperScale = exportVB.w / 420;

    // Outer frame: 5mm from edge
    const outerM = 5 * paperScale;
    // Inner frame: 10mm from edge
    const innerM = 10 * paperScale;

    const outerSW = 0.5 * paperScale;  // 0.5mm thick
    const innerSW = 0.25 * paperScale; // 0.25mm thick

    // Outer frame rectangle
    svgClone.appendChild(makeEl('rect', {
      x: exportVB.x + outerM,
      y: exportVB.y + outerM,
      width: exportVB.w - outerM * 2,
      height: exportVB.h - outerM * 2,
      fill: 'none', stroke: '#000', 'stroke-width': outerSW,
      class: 'drawing-frame'
    }));

    // Inner frame rectangle
    svgClone.appendChild(makeEl('rect', {
      x: exportVB.x + innerM,
      y: exportVB.y + innerM,
      width: exportVB.w - innerM * 2,
      height: exportVB.h - innerM * 2,
      fill: 'none', stroke: '#000', 'stroke-width': innerSW,
      class: 'drawing-frame'
    }));
  }

  /**
   * Draw a north arrow (方位記号) at the top-right corner of the drawing
   * Rotates based on the northAngle setting (0° = up is north)
   */
  _renderNorthArrow(svgClone, exportVB) {
    const ns = 'http://www.w3.org/2000/svg';
    const makeEl = (tag, attrs) => {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };

    // Get north angle from title block data
    const northAngle = (typeof app !== 'undefined' && app.titleBlock)
      ? (parseFloat(app.titleBlock.data.northAngle) || 0) : 0;

    const paperScale = exportVB.w / 420;

    // Symbol size: 12mm diameter circle on paper
    const r = 6 * paperScale;
    // Position: top-right, 25mm from right edge, 25mm from top edge
    const cx = exportVB.x + exportVB.w - 25 * paperScale;
    const cy = exportVB.y + 25 * paperScale;

    // Create group with rotation
    const g = makeEl('g', {
      transform: `rotate(${northAngle}, ${cx}, ${cy})`,
      class: 'north-arrow'
    });

    // Outer circle
    g.appendChild(makeEl('circle', {
      cx, cy, r,
      fill: 'none', stroke: '#333', 'stroke-width': 0.3 * paperScale
    }));

    // North arrow (triangle pointing up from center)
    const arrowH = r * 0.85;  // Arrow extends to near circle edge
    const arrowW = r * 0.35;  // Half-width of arrow base
    // Filled north half (black)
    g.appendChild(makeEl('polygon', {
      points: `${cx},${cy - arrowH} ${cx - arrowW},${cy} ${cx},${cy - arrowH * 0.15}`,
      fill: '#333', stroke: '#333', 'stroke-width': 0.1 * paperScale
    }));
    // Outline south half (white)
    g.appendChild(makeEl('polygon', {
      points: `${cx},${cy - arrowH} ${cx + arrowW},${cy} ${cx},${cy - arrowH * 0.15}`,
      fill: '#fff', stroke: '#333', 'stroke-width': 0.1 * paperScale
    }));

    // South line (thin line going down)
    g.appendChild(makeEl('line', {
      x1: cx, y1: cy, x2: cx, y2: cy + arrowH * 0.7,
      stroke: '#333', 'stroke-width': 0.2 * paperScale
    }));

    // "N" text (above the circle, outside rotation so it stays readable)
    // We place it inside the rotated group but at a fixed position
    const nText = makeEl('text', {
      x: cx, y: cy - r - 1.5 * paperScale,
      'font-size': 4 * paperScale,
      fill: '#333',
      'font-family': 'Arial, Helvetica, sans-serif',
      'text-anchor': 'middle',
      'font-weight': 'bold'
    });
    nText.textContent = 'N';
    g.appendChild(nText);

    svgClone.appendChild(g);
  }

  /**
   * Render a legend (凡例) table on the PDF
   * Shows icons used in the current drawing with their descriptions
   */
  _renderLegend(svgClone, exportVB, figureType = 'plan') {
    const ns = 'http://www.w3.org/2000/svg';
    const makeEl = (tag, attrs) => {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };

    // Collect which annotation types are actually used
    const annotations = this.svgEngine.getAnnotations();
    const usedTypes = new Set();
    const allowedFigures = figureType === 'plan'
      ? ['plan', 'shared'] : ['route', 'shared'];
    annotations.forEach(a => {
      const fig = a.getAttribute('data-figure');
      if (allowedFigures.includes(fig)) {
        usedTypes.add(a.dataset.type);
      }
    });

    // Define legend items for each figure type
    const planItems = [
      { type: 'charger', icon: 'rect-red', label: '充電設備（新設）' },
      { type: 'charging-space', icon: 'rect-red-dash', label: '充電スペース' },
      { type: 'foundation', icon: 'rect-hatch', label: '基礎' },
      { type: 'road-marking', icon: 'rect-green', label: '路面表示' },
      { type: 'wheel-stop', icon: 'line-gray', label: '車止め' },
      { type: 'bollard', icon: 'circle-gray', label: '防護用部材' },
      { type: 'lighting', icon: 'circle-cross', label: '電灯' },
      { type: 'boundary-rect', icon: 'rect-blue', label: '設置範囲' },
    ];
    const routeItems = [
      { type: 'charger', icon: 'rect-red', label: '充電設備（新設）' },
      { type: 'existing-charger', icon: 'rect-orange-dash', label: '既設充電設備' },
      { type: 'cubicle', icon: 'rect-green', label: '分電盤/キュービクル' },
      { type: 'pole', icon: 'circle-x', label: '建柱（引込柱）' },
      { type: 'handhole', icon: 'rect-hh', label: 'ハンドホール' },
      { type: 'pullbox', icon: 'rect-pb', label: 'プルボックス' },
      { type: 'wiring-route', icon: 'line-red', label: '配線ルート' },
    ];

    const items = (figureType === 'plan' ? planItems : routeItems)
      .filter(item => usedTypes.has(item.type));

    if (items.length === 0) return; // No legend needed

    const paperScale = exportVB.w / 420;
    const rowH = 5 * paperScale;   // 5mm row height
    const iconW = 8 * paperScale;  // 8mm icon column width
    const textW = 30 * paperScale; // 30mm text column width
    const totalW = iconW + textW;
    const headerH = 5 * paperScale;
    const totalH = headerH + items.length * rowH;
    const fs = 2.5 * paperScale;   // 2.5mm font
    const sw = 0.2 * paperScale;   // line stroke width

    // Position: top-left inside inner frame
    const margin = 12 * paperScale;
    const x0 = exportVB.x + margin;
    const y0 = exportVB.y + margin;

    const g = makeEl('g', { class: 'legend-table' });

    // White background
    g.appendChild(makeEl('rect', {
      x: x0, y: y0, width: totalW, height: totalH,
      fill: 'white', stroke: '#333', 'stroke-width': sw * 2
    }));

    // Header: "凡例"
    g.appendChild(makeEl('rect', {
      x: x0, y: y0, width: totalW, height: headerH,
      fill: '#f0f0f0', stroke: '#333', 'stroke-width': sw
    }));
    const headerText = makeEl('text', {
      x: x0 + totalW / 2, y: y0 + headerH / 2 + fs * 0.35,
      'font-size': fs, fill: '#333', 'text-anchor': 'middle',
      'font-family': 'Meiryo, sans-serif', 'font-weight': 'bold'
    });
    headerText.textContent = '凡例';
    g.appendChild(headerText);

    // Column divider
    g.appendChild(makeEl('line', {
      x1: x0 + iconW, y1: y0 + headerH,
      x2: x0 + iconW, y2: y0 + totalH,
      stroke: '#333', 'stroke-width': sw
    }));

    // Render rows
    items.forEach((item, i) => {
      const ry = y0 + headerH + i * rowH;

      // Row divider
      if (i > 0) {
        g.appendChild(makeEl('line', {
          x1: x0, y1: ry, x2: x0 + totalW, y2: ry,
          stroke: '#ccc', 'stroke-width': sw * 0.5
        }));
      }

      // Icon cell center
      const icx = x0 + iconW / 2;
      const icy = ry + rowH / 2;
      const icsz = 2 * paperScale; // icon size

      // Draw icon based on type
      switch (item.icon) {
        case 'rect-red':
          g.appendChild(makeEl('rect', {
            x: icx - icsz, y: icy - icsz * 0.75, width: icsz * 2, height: icsz * 1.5,
            fill: 'none', stroke: '#cc0000', 'stroke-width': sw
          }));
          break;
        case 'rect-red-dash':
          g.appendChild(makeEl('rect', {
            x: icx - icsz, y: icy - icsz * 0.75, width: icsz * 2, height: icsz * 1.5,
            fill: 'rgba(204,0,0,0.05)', stroke: '#cc0000', 'stroke-width': sw,
            'stroke-dasharray': `${sw * 4} ${sw * 2}`
          }));
          break;
        case 'rect-green':
          g.appendChild(makeEl('rect', {
            x: icx - icsz, y: icy - icsz * 0.75, width: icsz * 2, height: icsz * 1.5,
            fill: 'none', stroke: '#009933', 'stroke-width': sw
          }));
          break;
        case 'rect-orange-dash':
          g.appendChild(makeEl('rect', {
            x: icx - icsz, y: icy - icsz * 0.75, width: icsz * 2, height: icsz * 1.5,
            fill: 'none', stroke: '#ff8800', 'stroke-width': sw,
            'stroke-dasharray': `${sw * 4} ${sw * 2}`
          }));
          break;
        case 'rect-hatch':
          g.appendChild(makeEl('rect', {
            x: icx - icsz, y: icy - icsz * 0.75, width: icsz * 2, height: icsz * 1.5,
            fill: 'rgba(200,200,200,0.3)', stroke: '#333', 'stroke-width': sw
          }));
          g.appendChild(makeEl('line', {
            x1: icx - icsz, y1: icy - icsz * 0.75, x2: icx + icsz, y2: icy + icsz * 0.75,
            stroke: '#333', 'stroke-width': sw * 0.5
          }));
          break;
        case 'line-gray':
          g.appendChild(makeEl('line', {
            x1: icx - icsz, y1: icy, x2: icx + icsz, y2: icy,
            stroke: '#555', 'stroke-width': sw * 3
          }));
          break;
        case 'circle-gray':
          g.appendChild(makeEl('circle', {
            cx: icx, cy: icy, r: icsz * 0.6,
            fill: 'rgba(100,100,100,0.3)', stroke: '#666', 'stroke-width': sw
          }));
          break;
        case 'circle-cross':
          g.appendChild(makeEl('circle', {
            cx: icx, cy: icy, r: icsz * 0.7,
            fill: 'none', stroke: '#cc6600', 'stroke-width': sw
          }));
          g.appendChild(makeEl('line', {
            x1: icx, y1: icy - icsz * 0.7, x2: icx, y2: icy + icsz * 0.7,
            stroke: '#cc6600', 'stroke-width': sw * 0.5
          }));
          g.appendChild(makeEl('line', {
            x1: icx - icsz * 0.7, y1: icy, x2: icx + icsz * 0.7, y2: icy,
            stroke: '#cc6600', 'stroke-width': sw * 0.5
          }));
          break;
        case 'circle-x':
          g.appendChild(makeEl('circle', {
            cx: icx, cy: icy, r: icsz * 0.7,
            fill: 'none', stroke: '#663300', 'stroke-width': sw
          }));
          g.appendChild(makeEl('line', {
            x1: icx - icsz * 0.5, y1: icy - icsz * 0.5,
            x2: icx + icsz * 0.5, y2: icy + icsz * 0.5,
            stroke: '#663300', 'stroke-width': sw * 0.5
          }));
          g.appendChild(makeEl('line', {
            x1: icx + icsz * 0.5, y1: icy - icsz * 0.5,
            x2: icx - icsz * 0.5, y2: icy + icsz * 0.5,
            stroke: '#663300', 'stroke-width': sw * 0.5
          }));
          break;
        case 'rect-hh': {
          const s = icsz * 0.8;
          g.appendChild(makeEl('rect', {
            x: icx - s, y: icy - s, width: s * 2, height: s * 2,
            fill: 'none', stroke: '#666', 'stroke-width': sw
          }));
          const hhT = makeEl('text', {
            x: icx, y: icy + fs * 0.2, 'text-anchor': 'middle',
            'font-size': fs * 0.6, fill: '#666', 'font-weight': 'bold',
            'font-family': 'Meiryo, sans-serif'
          });
          hhT.textContent = 'HH';
          g.appendChild(hhT);
          break;
        }
        case 'rect-pb': {
          const s = icsz * 0.8;
          g.appendChild(makeEl('rect', {
            x: icx - s, y: icy - s, width: s * 2, height: s * 2,
            fill: 'none', stroke: '#0066cc', 'stroke-width': sw
          }));
          const pbT = makeEl('text', {
            x: icx, y: icy + fs * 0.2, 'text-anchor': 'middle',
            'font-size': fs * 0.6, fill: '#0066cc', 'font-weight': 'bold',
            'font-family': 'Meiryo, sans-serif'
          });
          pbT.textContent = 'PB';
          g.appendChild(pbT);
          break;
        }
        case 'line-red':
          g.appendChild(makeEl('line', {
            x1: icx - icsz, y1: icy, x2: icx + icsz, y2: icy,
            stroke: '#cc0000', 'stroke-width': sw * 2
          }));
          break;
        case 'rect-blue':
          g.appendChild(makeEl('rect', {
            x: icx - icsz, y: icy - icsz * 0.75, width: icsz * 2, height: icsz * 1.5,
            fill: 'none', stroke: '#0066cc', 'stroke-width': sw
          }));
          break;
      }

      // Label text
      const labelText = makeEl('text', {
        x: x0 + iconW + 2 * paperScale,
        y: icy + fs * 0.35,
        'font-size': fs * 0.9, fill: '#333',
        'font-family': 'Meiryo, sans-serif'
      });
      labelText.textContent = item.label;
      g.appendChild(labelText);
    });

    svgClone.appendChild(g);
  }

  _inlineStyles(svgClone) {
    // ===== DXF layers =====
    const dxfLayers = svgClone.querySelectorAll('.dxf-layer');
    dxfLayers.forEach(layer => {
      if (!layer.getAttribute('fill')) layer.setAttribute('fill', 'none');
      layer.setAttribute('stroke-linecap', 'round');
      layer.setAttribute('stroke-linejoin', 'round');
    });

    // Specific layer colors/widths (match CSS)
    const layerStyles = {
      'layer-ROAD': { stroke: '#888', sw: '0.08' },
      'layer-BUILDING': { stroke: '#333', sw: '0.12' },
      'layer-STRUCTURE': { stroke: '#666', sw: '0.1' },
      'layer-CENTER': { stroke: '#ccc', sw: '0.05', dasharray: '0.4 0.2' }
    };
    for (const [id, s] of Object.entries(layerStyles)) {
      const el = svgClone.querySelector(`#${id}`);
      if (el) {
        el.setAttribute('stroke', s.stroke);
        el.setAttribute('stroke-width', s.sw);
        if (s.dasharray) el.setAttribute('stroke-dasharray', s.dasharray);
      }
    }

    // ===== Ensure ALL text has proper font-family for Image rendering =====
    svgClone.querySelectorAll('text').forEach(t => {
      if (!t.getAttribute('font-family')) {
        t.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
      }
    });

    // ===== Inline dimension line/text styles (CSS classes from dimension-tool.js) =====
    svgClone.querySelectorAll('.dimension-line').forEach(el => {
      el.setAttribute('stroke', '#0066cc');
      el.setAttribute('stroke-width', '0.05');
      el.setAttribute('fill', 'none');
    });
    svgClone.querySelectorAll('.dimension-text').forEach(el => {
      el.setAttribute('font-size', '0.25');
      el.setAttribute('fill', '#0066cc');
      el.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
      el.setAttribute('text-anchor', 'middle');
    });

    // ===== Inline all CSS-class-based annotation styles (fallback safety) =====
    svgClone.querySelectorAll('.charging-space').forEach(el => {
      if (!el.getAttribute('stroke')) el.setAttribute('stroke', '#cc0000');
      if (!el.getAttribute('stroke-width')) el.setAttribute('stroke-width', '0.08');
      if (!el.getAttribute('fill')) el.setAttribute('fill', 'rgba(204,0,0,0.03)');
    });
    svgClone.querySelectorAll('.charging-space-label').forEach(el => {
      el.setAttribute('font-size', '0.25');
      el.setAttribute('fill', '#cc0000');
      el.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
    });
    svgClone.querySelectorAll('.charger-symbol').forEach(el => {
      el.setAttribute('stroke', '#cc0000');
      el.setAttribute('stroke-width', '0.08');
      if (!el.getAttribute('fill')) el.setAttribute('fill', 'none');
    });
    svgClone.querySelectorAll('.charger-label').forEach(el => {
      el.setAttribute('font-size', '0.25');
      el.setAttribute('fill', '#cc0000');
      el.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
    });
    svgClone.querySelectorAll('.road-marking-symbol').forEach(el => {
      el.setAttribute('stroke', '#009933');
      el.setAttribute('stroke-width', '0.08');
    });
    svgClone.querySelectorAll('.road-marking-label').forEach(el => {
      el.setAttribute('font-size', '0.25');
      el.setAttribute('fill', '#009933');
      el.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
    });
    svgClone.querySelectorAll('.wheel-stop-symbol').forEach(el => {
      el.setAttribute('fill', '#555');
      el.setAttribute('stroke', '#333');
      el.setAttribute('stroke-width', '0.05');
    });
    svgClone.querySelectorAll('.bollard-symbol').forEach(el => {
      el.setAttribute('stroke', '#666');
      el.setAttribute('stroke-width', '0.05');
    });
    svgClone.querySelectorAll('.lighting-symbol').forEach(el => {
      el.setAttribute('stroke', '#cc6600');
      el.setAttribute('stroke-width', '0.08');
    });
    svgClone.querySelectorAll('.foundation-symbol').forEach(el => {
      el.setAttribute('stroke', '#333');
      el.setAttribute('stroke-width', '0.08');
    });
    svgClone.querySelectorAll('.text-annotation').forEach(el => {
      el.setAttribute('font-size', '0.35');
      el.setAttribute('fill', '#333');
      el.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
    });
    svgClone.querySelectorAll('.title-block-border').forEach(el => {
      el.setAttribute('stroke', '#333');
      el.setAttribute('stroke-width', '0.1');
      el.setAttribute('fill', '#fff');
    });
    svgClone.querySelectorAll('.title-block-text').forEach(el => {
      el.setAttribute('font-size', '0.25');
      el.setAttribute('fill', '#333');
      el.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
    });

    // ===== Inline wiring route styles =====
    svgClone.querySelectorAll('[data-type="wiring-route"]').forEach(group => {
      group.querySelectorAll('line').forEach(line => {
        if (!line.getAttribute('stroke')) line.setAttribute('stroke', '#cc0000');
        if (!line.getAttribute('stroke-width')) line.setAttribute('stroke-width', '0.1');
      });
      group.querySelectorAll('text').forEach(t => {
        if (!t.getAttribute('font-family')) {
          t.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
        }
      });
      group.querySelectorAll('polygon').forEach(p => {
        if (!p.getAttribute('fill')) p.setAttribute('fill', '#cc0000');
      });
    });

    // ===== Inline wiring route annotation styles =====
    svgClone.querySelectorAll('[data-type="wiring-route-annotation"]').forEach(group => {
      group.querySelectorAll('text').forEach(t => {
        if (!t.getAttribute('font-family')) {
          t.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
        }
        if (!t.getAttribute('fill')) t.setAttribute('fill', '#009933');
      });
    });

    // ===== Inline cubicle styles =====
    svgClone.querySelectorAll('[data-type="cubicle"]').forEach(group => {
      group.querySelectorAll('rect').forEach(r => {
        if (!r.getAttribute('stroke')) r.setAttribute('stroke', '#009933');
        if (!r.getAttribute('stroke-width')) r.setAttribute('stroke-width', '0.08');
      });
      group.querySelectorAll('text').forEach(t => {
        if (!t.getAttribute('font-family')) {
          t.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
        }
        if (!t.getAttribute('fill')) t.setAttribute('fill', '#009933');
      });
    });

    // ===== Inline pole styles =====
    svgClone.querySelectorAll('[data-type="pole"]').forEach(group => {
      group.querySelectorAll('circle, line').forEach(el => {
        if (!el.getAttribute('stroke')) el.setAttribute('stroke', '#663300');
        if (!el.getAttribute('stroke-width')) el.setAttribute('stroke-width', '0.06');
      });
      group.querySelectorAll('text').forEach(t => {
        if (!t.getAttribute('font-family')) {
          t.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
        }
        if (!t.getAttribute('fill')) t.setAttribute('fill', '#663300');
      });
    });

    // ===== Inline handhole styles =====
    svgClone.querySelectorAll('[data-type="handhole"]').forEach(group => {
      group.querySelectorAll('rect').forEach(r => {
        if (!r.getAttribute('stroke')) r.setAttribute('stroke', '#666666');
        if (!r.getAttribute('stroke-width')) r.setAttribute('stroke-width', '0.06');
      });
      group.querySelectorAll('text').forEach(t => {
        if (!t.getAttribute('font-family')) {
          t.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
        }
        if (!t.getAttribute('fill')) t.setAttribute('fill', '#666666');
      });
    });

    // ===== Inline existing-charger styles =====
    svgClone.querySelectorAll('[data-type="existing-charger"]').forEach(group => {
      group.querySelectorAll('rect, line').forEach(el => {
        if (!el.getAttribute('stroke')) el.setAttribute('stroke', '#ff8800');
        if (!el.getAttribute('stroke-width')) el.setAttribute('stroke-width', '0.08');
        if (!el.getAttribute('stroke-dasharray')) el.setAttribute('stroke-dasharray', '0.15 0.1');
      });
      group.querySelectorAll('text').forEach(t => {
        if (!t.getAttribute('font-family')) {
          t.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
        }
        if (!t.getAttribute('fill')) t.setAttribute('fill', '#ff8800');
      });
    });

    // ===== Inline wiring summary table styles =====
    svgClone.querySelectorAll('[data-type="wiring-summary"]').forEach(group => {
      group.querySelectorAll('rect').forEach(r => {
        if (!r.getAttribute('stroke')) r.setAttribute('stroke', '#333');
        if (!r.getAttribute('stroke-width')) r.setAttribute('stroke-width', '0.03');
      });
      group.querySelectorAll('text').forEach(t => {
        if (!t.getAttribute('font-family')) {
          t.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
        }
      });
    });

    // ===== Inline leader annotation styles (wire/equipment/conduit) =====
    svgClone.querySelectorAll('[data-type="leader"]').forEach(group => {
      group.querySelectorAll('line').forEach(line => {
        if (!line.getAttribute('stroke-width')) line.setAttribute('stroke-width', '0.05');
      });
      group.querySelectorAll('text').forEach(t => {
        if (!t.getAttribute('font-family')) {
          t.setAttribute('font-family', 'Meiryo, "Yu Gothic", sans-serif');
        }
      });
    });

    // ===== Ensure PDF overlay opacity is preserved =====
    svgClone.querySelectorAll('#pdf-overlay-layer [data-type="pdf-overlay"]').forEach(el => {
      const op = el.getAttribute('opacity') || el.dataset.opacity || '0.5';
      el.setAttribute('opacity', op);
    });

    // ===== Ensure all circles and lines have stroke-linecap =====
    svgClone.querySelectorAll('line').forEach(el => {
      if (!el.getAttribute('stroke-linecap')) {
        el.setAttribute('stroke-linecap', 'round');
      }
    });

    // ===== Remove selection artifacts =====
    svgClone.querySelectorAll('.selection-box, .selection-handle').forEach(el => el.remove());
  }

  _renderSVGToCanvas(svgString, width, height) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // White background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // Draw SVG
        ctx.drawImage(img, 0, 0, width, height);

        URL.revokeObjectURL(url);

        // Export as JPEG (good balance of quality and file size)
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('SVG画像の読み込みに失敗しました'));
      };

      img.src = url;
    });
  }
}
