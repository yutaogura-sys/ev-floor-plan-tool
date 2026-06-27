// Wiring Route Tool - Multi-segment polyline for cable routing
// Click to place vertices, double-click/Enter to finish
class WiringRouteTool {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
    this.vertices = [];
    this.previewLine = null;
    this.previewGroup = null;
    this.isDrawing = false;
    this._finishing = false; // 仕様モーダル表示中（再入防止）
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
    if (this._finishing) return;
    // Add vertex
    this.vertices.push({ x: point.x, y: point.y });
    this.isDrawing = true;
    this._updatePreview(point);
  }

  onMouseMove(point, e) {
    if (this._finishing || !this.isDrawing || this.vertices.length === 0) return;
    this._updatePreviewLine(point);
  }

  onDoubleClick(point, e) {
    if (this._finishing) return;
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
    if (this._finishing) return;
    if (e.key === 'Enter' && this.vertices.length >= 2) {
      this._finishRoute();
      if (e.preventDefault) e.preventDefault();
    } else if (e.key === 'Escape') {
      // 作図中なら取消してツールに留まる（tool-manager の選択ツール復帰を抑止）
      if (this.isDrawing || this.vertices.length) {
        this._removePreview();
        this.vertices = [];
        this.isDrawing = false;
        if (e.preventDefault) e.preventDefault();
      }
    }
  }

  async _finishRoute() {
    if (this._finishing) return;
    this._finishing = true;
    try {
      // 1枚のモーダルで全仕様を入力（旧: prompt 4連発）。プレビューは入力中も表示。
      const spec = await this._promptRouteSpec();
      this._removePreview();
      if (!spec) { this.vertices = []; this.isDrawing = false; return; }

      const routeLabel = spec.routeLabel || '';
      const cableSpec = spec.cableSpec || '';
      const conduitSpec = spec.conduitSpec || '';
      const method = spec.method || 'exposed';

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
    } finally {
      this._finishing = false;
    }
  }

  // 配線ルート仕様の入力モーダル。確定で {routeLabel,cableSpec,conduitSpec,method}、
  // キャンセルで null を resolve する Promise を返す（旧: native prompt 4連発の置換）。
  _promptRouteSpec() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'route-spec-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;color:#222;width:360px;max-width:92%;border-radius:8px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:Meiryo,sans-serif;font-size:13px;';
      box.innerHTML =
        '<h3 style="margin:0 0 12px;font-size:15px;">配線ルートの仕様</h3>' +
        '<label style="display:block;margin:8px 0 2px;">ルート名称</label>' +
        '<input class="rs-label" type="text" placeholder="例: 新設プルボックス～EV充電設備1" style="width:100%;padding:5px;box-sizing:border-box;">' +
        '<label style="display:block;margin:8px 0 2px;">ケーブル仕様</label>' +
        '<input class="rs-cable" type="text" value="CV8sq-3C" style="width:100%;padding:5px;box-sizing:border-box;">' +
        '<label style="display:block;margin:8px 0 2px;">配管仕様</label>' +
        '<input class="rs-conduit" type="text" value="PFD-28" style="width:100%;padding:5px;box-sizing:border-box;">' +
        '<label style="display:block;margin:8px 0 2px;">配線方法（全区間共通・後で区間別に変更可）</label>' +
        '<select class="rs-method" style="width:100%;padding:5px;box-sizing:border-box;">' +
        '<option value="exposed">露出</option><option value="buried">埋設</option><option value="aerial">架空</option>' +
        '</select>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
        '<button class="rs-cancel" style="padding:7px 14px;border:1px solid #999;border-radius:4px;background:#f2f2f2;cursor:pointer;">キャンセル</button>' +
        '<button class="rs-ok" style="padding:7px 14px;border:none;border-radius:4px;background:#1a6ed8;color:#fff;cursor:pointer;">確定</button>' +
        '</div>';
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      box.querySelector('.rs-label').focus();
      const close = (val) => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); resolve(val); };
      box.querySelector('.rs-ok').addEventListener('click', () => close({
        routeLabel: box.querySelector('.rs-label').value.trim(),
        cableSpec: box.querySelector('.rs-cable').value.trim(),
        conduitSpec: box.querySelector('.rs-conduit').value.trim(),
        method: box.querySelector('.rs-method').value
      }));
      box.querySelector('.rs-cancel').addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
      // モーダル内のキー入力はキャンバス側へ伝播させない（ツールショートカット誤作動防止）
      box.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); box.querySelector('.rs-ok').click(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(null); }
      });
    });
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
        stroke: Utils.COLORS.evRed, 'stroke-width': 0.08, opacity: 0.6
      }));
    }

    // Draw vertex markers
    for (const v of this.vertices) {
      this.previewGroup.appendChild(Utils.createSVGElement('circle', {
        cx: v.x, cy: v.y, r: 0.08,
        fill: Utils.COLORS.evRed, opacity: 0.8
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
      stroke: Utils.COLORS.evRed, 'stroke-width': 0.06,
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
