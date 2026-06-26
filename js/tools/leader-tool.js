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

  onMouseDown(point, e) {
    if (e.button !== 0) return;

    if (!this.firstPoint) {
      // First click: set target point (arrow tip)
      this.firstPoint = { x: point.x, y: point.y };
      this._createPreview(point);
    } else {
      // Second click: set text position, prompt for text
      this._removePreview();
      const text = prompt(this.promptText + ':');
      if (text && text.trim()) {
        const id = Utils.generateId();
        // Split multi-line input by newline or comma
        const lines = text.trim().split(/[,\n]/).map(s => s.trim()).filter(Boolean);
        this.svgEngine.createLeaderAnnotation(
          id,
          this.firstPoint.x, this.firstPoint.y,
          point.x, point.y,
          lines,
          this.color
        );
        if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
      }
      this.firstPoint = null;
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
