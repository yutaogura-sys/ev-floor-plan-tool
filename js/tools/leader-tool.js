// Leader Annotation Tool - Two-click leader line with text (wire/equipment/conduit)
class LeaderTool {
  constructor(svgEngine, subtype, color, promptText) {
    this.svgEngine = svgEngine;
    this.subtype = subtype;     // 'wire' | 'equipment' | 'conduit'
    this.color = color;
    this.promptText = promptText;
    this.firstPoint = null;
    this.preview = null;
  }

  activate() { this.firstPoint = null; }
  deactivate() { this.firstPoint = null; this._removePreview(); }

  async onMouseDown(point, e) {
    if (e.button !== 0) return;

    if (!this.firstPoint) {
      // First click: set target point (arrow tip)
      this.firstPoint = { x: point.x, y: point.y };
      this._createPreview(point);
    } else {
      // Second click: set text position, ask for text via non-blocking modal
      this._removePreview();
      const target = this.firstPoint;
      const textPos = { x: point.x, y: point.y };
      this.firstPoint = null;
      const text = await Utils.promptModal({ title: this.promptText, multiline: true });
      if (text && text.trim()) {
        const id = Utils.generateId();
        // Split multi-line input by newline or comma
        const lines = text.trim().split(/[,\n]/).map(s => s.trim()).filter(Boolean);
        const el = this.svgEngine.createLeaderAnnotation(
          id, target.x, target.y, textPos.x, textPos.y, lines, this.color
        );
        // 配置後は選択ツールへ戻り自動選択（全配置ツールで統一）
        if (typeof app !== 'undefined') {
          app.toolManager.setActiveTool('select');
          app.toolManager.tools.select.selectElement(el);
          if (app.updateChecklist) app.updateChecklist();
        }
      }
    }
  }

  onMouseMove(point, e) {
    if (this.firstPoint && this.preview) {
      this._updatePreview(point);
    }
  }

  onMouseUp() {}

  _createPreview(point) {
    const sw = 0.05;
    this.preview = Utils.createSVGElement('g', { opacity: '0.5' });

    // Preview line
    this.previewLine = Utils.createSVGElement('line', {
      x1: point.x, y1: point.y, x2: point.x, y2: point.y,
      stroke: this.color, 'stroke-width': sw,
      'stroke-dasharray': `${sw * 4} ${sw * 3}`
    });
    this.preview.appendChild(this.previewLine);

    // Start circle
    this.preview.appendChild(Utils.createSVGElement('circle', {
      cx: point.x, cy: point.y, r: 0.08,
      fill: this.color, opacity: '0.6'
    }));

    // Hint text
    this.previewHint = Utils.createSVGElement('text', {
      x: point.x, y: point.y - 0.4,
      'font-size': '0.2', fill: this.color, 'text-anchor': 'middle',
      'font-family': 'Meiryo, sans-serif'
    });
    this.previewHint.textContent = '2点目をクリック';
    this.preview.appendChild(this.previewHint);

    document.getElementById('interaction-layer').appendChild(this.preview);
  }

  _updatePreview(point) {
    if (!this.previewLine) return;
    this.previewLine.setAttribute('x2', point.x);
    this.previewLine.setAttribute('y2', point.y);
    this.previewHint.setAttribute('x', (this.firstPoint.x + point.x) / 2);
    this.previewHint.setAttribute('y', Math.min(this.firstPoint.y, point.y) - 0.4);
  }

  _removePreview() {
    if (this.preview) {
      this.preview.remove();
      this.preview = null;
      this.previewLine = null;
      this.previewHint = null;
    }
  }
}
