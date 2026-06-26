// Charging Space Tool - Click and drag to create charging space rectangle
class ChargingSpaceTool {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
    this.isDrawing = false;
    this.startPoint = null;
    this.preview = null;
    this.spaceCounter = 0;
  }

  activate() {}
  deactivate() {
    this._removePreview();
    this.isDrawing = false;
  }

  onMouseDown(point, e) {
    if (e.button !== 0) return;
    this.isDrawing = true;
    this.startPoint = { x: point.x, y: point.y };
    this._createPreview(point.x, point.y);
  }

  onMouseMove(point, e) {
    if (!this.isDrawing || !this.preview) return;
    const x = Math.min(this.startPoint.x, point.x);
    const y = Math.min(this.startPoint.y, point.y);
    const w = Math.abs(point.x - this.startPoint.x);
    const h = Math.abs(point.y - this.startPoint.y);

    this.preview.setAttribute('x', x);
    this.preview.setAttribute('y', y);
    this.preview.setAttribute('width', w);
    this.preview.setAttribute('height', h);
  }

  onMouseUp(point, e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this._removePreview();

    const x = Math.min(this.startPoint.x, point.x);
    const y = Math.min(this.startPoint.y, point.y);
    const w = Math.abs(point.x - this.startPoint.x);
    const h = Math.abs(point.y - this.startPoint.y);

    // Minimum size check (at least 1m x 1m)
    if (w < 0.5 || h < 0.5) return;

    this.spaceCounter++;
    const id = Utils.generateId();
    const el = this.svgEngine.createChargingSpace(id, x, y, w, h, this.spaceCounter);

    // 配置後は選択ツールへ戻り、置いた要素を自動選択（全配置ツールで統一）
    if (typeof app !== 'undefined') {
      app.toolManager.setActiveTool('select');
      app.toolManager.tools.select.selectElement(el);
      if (app.updateChecklist) app.updateChecklist();
    }
  }

  _createPreview(x, y) {
    this.preview = Utils.createSVGElement('rect', {
      x, y, width: 0, height: 0,
      fill: 'rgba(204,0,0,0.05)',
      stroke: Utils.COLORS.evRed,
      'stroke-width': 0.08
    });
    document.getElementById('interaction-layer').appendChild(this.preview);
  }

  _removePreview() {
    if (this.preview) {
      this.preview.remove();
      this.preview = null;
    }
  }
}
