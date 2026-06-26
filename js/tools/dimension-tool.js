// Dimension Tool - Click two points to create dimension line
class DimensionTool {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
    this.firstPoint = null;
    this.preview = null;
  }

  activate() { this.firstPoint = null; }
  deactivate() { this.firstPoint = null; this._removePreview(); }

  onMouseDown(point, e) {
    if (e.button !== 0) return;
    if (!this.firstPoint) {
      this.firstPoint = { x: point.x, y: point.y };
      this._createPreview(point);
    } else {
      this._removePreview();
      const id = Utils.generateId();
      this._createDimension(id, this.firstPoint, point);
      this.firstPoint = null;
      if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
    }
  }

  onMouseMove(point, e) {
    if (this.firstPoint && this.preview) this._updatePreview(point);
  }

  _createDimension(id, p1, p2) {
    const S = this.svgEngine.S;
    const sw = S.strokeThin;
    const fs = S.fontSmall;

    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'dimension',
      'data-x': p1.x, 'data-y': p1.y
    });

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const distMm = Math.round(distance * 1000);
    group.dataset.distance = distMm;

    const isHorizontal = Math.abs(dx) > Math.abs(dy);
    const offset = 0.6;
    const extGap = 0.1;

    if (isHorizontal) {
      const y = Math.min(p1.y, p2.y) - offset;
      // Extension lines
      group.appendChild(Utils.createSVGElement('line', {
        x1: p1.x, y1: p1.y, x2: p1.x, y2: y - extGap,
        stroke: '#0066cc', 'stroke-width': sw
      }));
      group.appendChild(Utils.createSVGElement('line', {
        x1: p2.x, y1: p2.y, x2: p2.x, y2: y - extGap,
        stroke: '#0066cc', 'stroke-width': sw
      }));
      // Dimension line with arrows
      group.appendChild(Utils.createSVGElement('line', {
        x1: p1.x, y1: y, x2: p2.x, y2: y,
        stroke: '#0066cc', 'stroke-width': sw,
        'marker-start': 'url(#dim-arrow-start)',
        'marker-end': 'url(#dim-arrow-end)'
      }));
      // Text
      const text = Utils.createSVGElement('text', {
        x: (p1.x + p2.x) / 2, y: y - extGap * 2,
        'text-anchor': 'middle', 'font-size': fs,
        fill: '#0066cc', 'font-family': 'Meiryo, sans-serif'
      });
      text.textContent = Utils.formatDimension(distMm);
      group.appendChild(text);
    } else {
      const x = Math.max(p1.x, p2.x) + offset;
      group.appendChild(Utils.createSVGElement('line', {
        x1: p1.x, y1: p1.y, x2: x + extGap, y2: p1.y,
        stroke: '#0066cc', 'stroke-width': sw
      }));
      group.appendChild(Utils.createSVGElement('line', {
        x1: p2.x, y1: p2.y, x2: x + extGap, y2: p2.y,
        stroke: '#0066cc', 'stroke-width': sw
      }));
      group.appendChild(Utils.createSVGElement('line', {
        x1: x, y1: p1.y, x2: x, y2: p2.y,
        stroke: '#0066cc', 'stroke-width': sw,
        'marker-start': 'url(#dim-arrow-start)',
        'marker-end': 'url(#dim-arrow-end)'
      }));
      const text = Utils.createSVGElement('text', {
        x: x + fs * 0.5, y: (p1.y + p2.y) / 2,
        'text-anchor': 'middle', 'font-size': fs,
        fill: '#0066cc', 'font-family': 'Meiryo, sans-serif',
        transform: `rotate(-90, ${x + fs * 0.5}, ${(p1.y + p2.y) / 2})`
      });
      text.textContent = Utils.formatDimension(distMm);
      group.appendChild(text);
    }

    this.svgEngine.addToGroup('dimensions-group', group);
  }

  _createPreview(point) {
    const sw = 0.05;
    this.preview = Utils.createSVGElement('g', { opacity: '0.5' });
    this.previewLine = Utils.createSVGElement('line', {
      x1: point.x, y1: point.y, x2: point.x, y2: point.y,
      stroke: '#0066cc', 'stroke-width': sw, 'stroke-dasharray': `${sw*4} ${sw*3}`
    });
    this.previewText = Utils.createSVGElement('text', {
      x: point.x, y: point.y - 0.3,
      'font-size': '0.25', fill: '#0066cc', 'text-anchor': 'middle'
    });
    this.preview.appendChild(this.previewLine);
    this.preview.appendChild(this.previewText);
    this.preview.appendChild(Utils.createSVGElement('circle', {
      cx: point.x, cy: point.y, r: 0.1,
      fill: 'none', stroke: '#4a9eff', 'stroke-width': sw
    }));
    document.getElementById('interaction-layer').appendChild(this.preview);
  }

  _updatePreview(point) {
    if (!this.previewLine) return;
    this.previewLine.setAttribute('x2', point.x);
    this.previewLine.setAttribute('y2', point.y);
    const dx = point.x - this.firstPoint.x;
    const dy = point.y - this.firstPoint.y;
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy) * 1000);
    this.previewText.setAttribute('x', (this.firstPoint.x + point.x) / 2);
    this.previewText.setAttribute('y', Math.min(this.firstPoint.y, point.y) - 0.3);
    this.previewText.textContent = `${dist}mm`;
  }

  _removePreview() {
    if (this.preview) {
      this.preview.remove();
      this.preview = null;
      this.previewLine = null;
      this.previewText = null;
    }
  }
}
