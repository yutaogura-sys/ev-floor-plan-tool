// Export Boundary Preview - Shows PDF export range as a dashed rectangle on the canvas
// Always centered on the current viewport center, updates on pan/zoom/scale change
class ExportBoundaryPreview {
  constructor() {
    this.layer = document.getElementById('export-boundary-layer');
    this.visible = true;
    this._onViewChange = () => this.update();
  }

  /**
   * Start listening to viewport changes (pan/zoom) so the boundary follows the screen center
   */
  startTracking() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    // Listen to wheel (zoom) and mousemove during pan
    container.addEventListener('wheel', this._onViewChange, { passive: true });
    container.addEventListener('mouseup', this._onViewChange);
    // Also listen to zoom button clicks
    ['btn-zoom-in', 'btn-zoom-out', 'btn-zoom-fit'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => setTimeout(this._onViewChange, 50));
    });
  }

  /**
   * Update the boundary rectangle at the current viewport center
   */
  update() {
    if (!this.layer) return;
    this.layer.innerHTML = '';
    if (!this.visible) return;

    const scaleStr = (typeof app !== 'undefined' && app.titleBlock?.data?.scale) || '';
    const scaleN = Utils.parseScale(scaleStr);
    if (!scaleN) return;

    const A3_W_MM = 420;
    const A3_H_MM = 297;
    const vbW = A3_W_MM * scaleN / 1000; // meters
    const vbH = A3_H_MM * scaleN / 1000;

    // Get current viewport center
    const svg = document.getElementById('drawing-canvas');
    const vb = svg.viewBox.baseVal;
    const cx = vb.x + vb.width / 2;
    const cy = vb.y + vb.height / 2;

    const x = cx - vbW / 2;
    const y = cy - vbH / 2;

    // Stroke width relative to viewport so it looks consistent at any zoom
    const sw = Math.min(vb.width, vb.height) * 0.003;
    const dashLen = Math.min(vb.width, vb.height) * 0.015;
    const dashGap = dashLen * 0.5;

    // Main rectangle — blue
    const color = '#4a9eff';
    this.layer.appendChild(Utils.createSVGElement('rect', {
      x, y, width: vbW, height: vbH,
      fill: 'none', stroke: color,
      'stroke-width': sw,
      'stroke-dasharray': `${dashLen} ${dashGap}`,
      opacity: 0.7, 'pointer-events': 'none'
    }));

    // Corner marks
    const markLen = Math.min(vbW, vbH) * 0.04;
    const markW = sw * 1.5;
    [[x, y, 1, 1], [x + vbW, y, -1, 1], [x, y + vbH, 1, -1], [x + vbW, y + vbH, -1, -1]].forEach(([cx, cy, dx, dy]) => {
      this.layer.appendChild(Utils.createSVGElement('line', {
        x1: cx, y1: cy, x2: cx + markLen * dx, y2: cy,
        stroke: color, 'stroke-width': markW, opacity: 0.9, 'pointer-events': 'none'
      }));
      this.layer.appendChild(Utils.createSVGElement('line', {
        x1: cx, y1: cy, x2: cx, y2: cy + markLen * dy,
        stroke: color, 'stroke-width': markW, opacity: 0.9, 'pointer-events': 'none'
      }));
    });

    // Label at top-left
    const fontSize = Math.min(vb.width, vb.height) * 0.022;
    const label = Utils.createSVGElement('text', {
      x: x + markLen * 0.3, y: y - fontSize * 0.3,
      'font-size': fontSize, fill: color,
      'font-family': 'Meiryo, sans-serif', 'font-weight': 'bold',
      opacity: 0.85, 'pointer-events': 'none'
    });
    label.textContent = `PDF出力範囲 (A3 1:${scaleN})  ${vbW.toFixed(1)}m × ${vbH.toFixed(1)}m`;
    this.layer.appendChild(label);
  }

  toggle(visible) {
    this.visible = visible;
    if (!visible) {
      if (this.layer) this.layer.innerHTML = '';
    } else {
      this.update();
    }
  }
}
