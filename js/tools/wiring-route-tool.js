// Wiring Route Tool - Multi-segment polyline for cable routing
// Click to place vertices, double-click/Enter to finish
class WiringRouteTool {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
    this.vertices = [];
    this.previewLine = null;
    this.previewGroup = null;
    this.isDrawing = false;
  }

  activate() {
    this.vertices = [];
    this.isDrawing = false;
    this._removePreview();
  }

  deactivate() {
    this._removePreview();
    this.vertices = [];
    this.isDrawing = false;
  }

  onMouseDown(point, e) {
    // Add vertex
    this.vertices.push({ x: point.x, y: point.y });
    this.isDrawing = true;
    this._updatePreview(point);
  }

  onMouseMove(point, e) {
    if (!this.isDrawing || this.vertices.length === 0) return;
    this._updatePreviewLine(point);
  }

  onDoubleClick(point, e) {
    if (this.vertices.length < 2) return;
    // Remove duplicate last vertex from double-click
    if (this.vertices.length > 2) {
      const last = this.vertices[this.vertices.length - 1];
      const prev = this.vertices[this.vertices.length - 2];
      if (Math.abs(last.x - prev.x) < 0.01 && Math.abs(last.y - prev.y) < 0.01) {
        this.vertices.pop();
      }
    }
    this._finishRoute();
  }

  onKeyDown(e) {
    if (e.key === 'Enter' && this.vertices.length >= 2) {
      this._finishRoute();
    } else if (e.key === 'Escape') {
      this._removePreview();
      this.vertices = [];
      this.isDrawing = false;
    }
  }

  _finishRoute() {
    this._removePreview();

    // Route label (起点～終点) — matches benchmark annotation header
    const routeLabel = prompt('ルート名称を入力 (例: 新設プルボックス～EV充電設備1)', '');
    if (routeLabel === null) {
      this.vertices = [];
      this.isDrawing = false;
      return;
    }

    // Prompt for cable spec
    const cableSpec = prompt('ケーブル仕様を入力 (例: CV8sq-3C)', 'CV8sq-3C');
    if (cableSpec === null) {
      this.vertices = [];
      this.isDrawing = false;
      return;
    }

    const conduitSpec = prompt('配管仕様を入力 (例: PFD-28, FEP-65)', 'PFD-28');
    const methodStr = prompt('配線方法を入力\n1=露出  2=埋設  3=架空\n(全区間同一。後からプロパティで区間ごとに変更可)', '1');
    const methodMap = { '1': 'exposed', '2': 'buried', '3': 'aerial' };
    const method = methodMap[methodStr] || 'exposed';

    // Create segments with same spec for all
    const segments = [];
    for (let i = 0; i < this.vertices.length - 1; i++) {
      const v1 = this.vertices[i];
      const v2 = this.vertices[i + 1];
      const dx = v2.x - v1.x;
      const dy = v2.y - v1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      segments.push({
        method,
        cableSpec: cableSpec || '',
        conduitSpec: conduitSpec || '',
        length: Math.round(length * 1000) / 1000,
        surfaceType: method === 'buried' ? 'アスファルト' : '',
        riseLength: 0,
        fallLength: 0
      });
    }

    const id = Utils.generateId();
    const routeEl = this.svgEngine.createWiringRoute(id, [...this.vertices], segments);
    // Store route label for annotation generation
    if (routeEl && routeLabel) {
      routeEl.dataset.routeLabel = routeLabel;
      // Re-store routeData with label
      const rd = JSON.parse(routeEl.dataset.routeData);
      rd.routeLabel = routeLabel;
      routeEl.dataset.routeData = JSON.stringify(rd);
    }

    // Update checklist
    if (typeof app !== 'undefined' && app.updateChecklist) {
      app.updateChecklist();
    }

    this.vertices = [];
    this.isDrawing = false;
  }

  _updatePreview(point) {
    this._removePreview();

    const layer = this.svgEngine.interactionLayer;
    this.previewGroup = Utils.createSVGElement('g', { class: 'wiring-route-preview' });

    // Draw confirmed segments
    for (let i = 0; i < this.vertices.length - 1; i++) {
      const v1 = this.vertices[i];
      const v2 = this.vertices[i + 1];
      this.previewGroup.appendChild(Utils.createSVGElement('line', {
        x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y,
        stroke: '#cc0000', 'stroke-width': 0.08, opacity: 0.6
      }));
    }

    // Draw vertex markers
    for (const v of this.vertices) {
      this.previewGroup.appendChild(Utils.createSVGElement('circle', {
        cx: v.x, cy: v.y, r: 0.08,
        fill: '#cc0000', opacity: 0.8
      }));
    }

    layer.appendChild(this.previewGroup);
  }

  _updatePreviewLine(point) {
    // Remove old preview line
    if (this.previewLine) this.previewLine.remove();

    const last = this.vertices[this.vertices.length - 1];
    this.previewLine = Utils.createSVGElement('line', {
      x1: last.x, y1: last.y, x2: point.x, y2: point.y,
      stroke: '#cc0000', 'stroke-width': 0.06,
      'stroke-dasharray': '0.2 0.1', opacity: 0.5
    });

    if (this.previewGroup) {
      this.previewGroup.appendChild(this.previewLine);
    } else {
      this.svgEngine.interactionLayer.appendChild(this.previewLine);
    }
  }

  _removePreview() {
    if (this.previewGroup) {
      this.previewGroup.remove();
      this.previewGroup = null;
    }
    if (this.previewLine) {
      this.previewLine.remove();
      this.previewLine = null;
    }
  }
}
