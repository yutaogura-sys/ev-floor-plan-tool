// Charger Tool - Click to place dual-stand charger
class ChargerTool {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
    this.chargerCounter = 0;
    this.preview = null;
  }

  activate() {}
  deactivate() {
    this._removePreview();
  }

  onMouseMove(point, e) {
    if (!this.preview) {
      this._createPreview();
    }
    this.preview.setAttribute('transform', `translate(${point.x},${point.y})`);
  }

  onMouseDown(point, e) {
    if (e.button !== 0) return;
    this.chargerCounter++;
    const id = Utils.generateId();
    const pairNum = Math.ceil(this.chargerCounter / 2);
    const startNum = (pairNum - 1) * 2 + 1;
    const label = `EV充電設備${startNum},${startNum + 1}`;

    const el = this.svgEngine.createCharger(id, point.x, point.y, 0, label);

    // 配置後は選択ツールへ戻り、置いた要素を自動選択（全配置ツールで統一）
    if (typeof app !== 'undefined') {
      app.toolManager.setActiveTool('select');
      app.toolManager.tools.select.selectElement(el);
      if (app.updateChecklist) app.updateChecklist();
    }
  }

  _createPreview() {
    this.preview = Utils.createSVGElement('g', {
      opacity: '0.5',
      'pointer-events': 'none'
    });

    const w = 0.4, h = 0.8;
    const body = Utils.createSVGElement('rect', {
      x: -w / 2, y: -h / 2, width: w, height: h,
      fill: 'none', stroke: Utils.COLORS.evRed, 'stroke-width': 0.08
    });
    this.preview.appendChild(body);

    document.getElementById('interaction-layer').appendChild(this.preview);
  }

  _removePreview() {
    if (this.preview) {
      this.preview.remove();
      this.preview = null;
    }
  }
}
