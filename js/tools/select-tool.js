// Select Tool - Click to select, drag to move, scale handles, rotation handle
class SelectTool {
  constructor(svgEngine, viewport) {
    this.svgEngine = svgEngine;
    this.viewport = viewport;
    this.selected = null;
    this.isDragging = false;
    this.isScaling = false;
    this.isRotating = false;
    this.dragStart = null;
    this.elementStart = null;
    this.scaleAnchor = null; // Opposite corner for scaling
    this.scaleStartDist = 0;
    this.scaleStartVal = 1;
    this.rotateCenter = null;
    this.rotateStartAngle = 0;
  }

  activate() {}
  deactivate() {
    this.selected = null;
    this.svgEngine.clearInteraction();
  }

  onMouseDown(point, e) {
    if (e.button !== 0) return;

    // Check if clicking on a handle first (scale/rotate)
    const handle = this._hitTestHandle(point);
    if (handle && this.selected) {
      if (handle === 'rotate') {
        this._startRotate(point);
      } else {
        this._startScale(point, handle);
      }
      return;
    }

    const ann = this.svgEngine.findAnnotationAt(point.x, point.y);
    if (ann) {
      this.selected = ann;
      this.svgEngine.showSelection(ann);
      this.isDragging = true;
      this.dragStart = { x: point.x, y: point.y };

      const x = parseFloat(ann.dataset.x || 0);
      const y = parseFloat(ann.dataset.y || 0);
      this.elementStart = { x, y };

      this._showProperties(ann);
      if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
    } else {
      this.selected = null;
      this.svgEngine.clearInteraction();
      this._clearProperties();
    }
  }

  onMouseMove(point, e) {
    // Rotation drag
    if (this.isRotating && this.selected) {
      this._doRotate(point);
      return;
    }

    // Scale drag
    if (this.isScaling && this.selected) {
      this._doScale(point);
      return;
    }

    // Move drag
    if (!this.isDragging || !this.selected) return;

    const dx = point.x - this.dragStart.x;
    const dy = point.y - this.dragStart.y;
    const newX = this.elementStart.x + dx;
    const newY = this.elementStart.y + dy;

    const type = this.selected.dataset.type;

    if (type === 'pdf-overlay') {
      this.selected.dataset.x = newX;
      this.selected.dataset.y = newY;
      this._updatePdfOverlayTransform();
    } else if (type === 'charger' || type === 'wheel-stop') {
      const rotation = this.selected.dataset.rotation || 0;
      this.selected.setAttribute('transform', `translate(${newX},${newY}) rotate(${rotation})`);
      this.selected.dataset.x = newX;
      this.selected.dataset.y = newY;
    } else if (type === 'charging-space') {
      // Charging space uses translate(x,y) rotate(r) with local-coord children
      const rotation = this.selected.dataset.rotation || 0;
      this.selected.setAttribute('transform', `translate(${newX},${newY}) rotate(${rotation})`);
      this.selected.dataset.x = newX;
      this.selected.dataset.y = newY;
    } else {
      this.selected.setAttribute('transform', `translate(${dx},${dy})`);
      this.selected.dataset.x = newX;
      this.selected.dataset.y = newY;
    }

    this.svgEngine.showSelection(this.selected);
  }

  onMouseUp(point, e) {
    const wasManipulating = this.isDragging || this.isScaling || this.isRotating;
    this.isDragging = false;
    this.isScaling = false;
    this.isRotating = false;
    if (this.selected) {
      this.svgEngine.showSelection(this.selected);
      this._showProperties(this.selected);
    }
    // Record move/scale/rotate so it is independently undoable.
    // updateChecklist's dedup guard skips this when nothing actually changed (e.g. a plain click-select).
    if (wasManipulating && typeof app !== 'undefined' && app.updateChecklist) {
      app.updateChecklist();
    }
  }

  duplicateSelected() {
    if (!this.selected) return;
    const el = this.selected;
    const type = el.dataset.type;
    if (type === 'pdf-overlay') return; // Cannot duplicate PDF overlays

    const id = Utils.generateId();
    const OFFSET = 1.0; // 1m offset for the copy
    const ox = parseFloat(el.dataset.x || 0) + OFFSET;
    const oy = parseFloat(el.dataset.y || 0) + OFFSET;
    const figure = el.getAttribute('data-figure') || 'plan';

    let newEl = null;

    switch (type) {
      case 'charging-space': {
        const w = parseFloat(el.dataset.width);
        const h = parseFloat(el.dataset.height);
        const num = parseInt(el.dataset.number || 1) + 1;
        const rot = parseFloat(el.dataset.rotation || 0);
        newEl = this.svgEngine.createChargingSpace(id, ox, oy, w, h, num, rot);
        break;
      }
      case 'charger': {
        const rot = parseFloat(el.dataset.rotation || 0);
        const standType = el.dataset.standType || 'パイルスタンド';
        newEl = this.svgEngine.createCharger(id, ox, oy, rot, '', standType);
        break;
      }
      case 'road-marking': {
        newEl = this.svgEngine.createRoadMarking(id, ox, oy);
        break;
      }
      case 'wheel-stop': {
        const rot = parseFloat(el.dataset.rotation || 0);
        newEl = this.svgEngine.createWheelStop(id, ox, oy, rot);
        break;
      }
      case 'bollard': {
        newEl = this.svgEngine.createBollard(id, ox, oy);
        break;
      }
      case 'lighting': {
        newEl = this.svgEngine.createLighting(id, ox, oy);
        break;
      }
      case 'foundation': {
        const w = parseFloat(el.dataset.width);
        const h = parseFloat(el.dataset.height);
        newEl = this.svgEngine.createFoundation(id, ox, oy, w, h, 0.5);
        break;
      }
      case 'text': {
        const allTexts = [...el.querySelectorAll('text')].map(t => t.textContent).join('\n');
        const textEl = el.querySelector('text');
        const fs = parseFloat(textEl?.getAttribute('font-size') || 0.3);
        const color = el.dataset.color || textEl?.getAttribute('fill') || '#333';
        newEl = this.svgEngine.createTextAnnotation(id, ox, oy, allTexts, fs * 10, color);
        break;
      }
      case 'dimension': {
        // Dimension: copy shape by getting endpoints offset
        const lines = el.querySelectorAll('line');
        const dimColor = el.dataset.color || '#0066cc';
        const dist = parseFloat(el.dataset.distance || 0) / 1000; // mm to m
        // Place horizontal or vertical based on original orientation
        if (lines.length >= 3) {
          const mainLine = lines[2]; // 3rd line is the dimension line
          const isH = mainLine.getAttribute('y1') === mainLine.getAttribute('y2');
          if (isH) {
            newEl = this.svgEngine.createDimension(id, ox, oy, ox + dist, oy, null, dimColor);
          } else {
            newEl = this.svgEngine.createDimension(id, ox, oy, ox, oy + dist, null, dimColor);
          }
        }
        break;
      }
      case 'leader': {
        const leaderTexts = [...el.querySelectorAll('text')].map(t => t.textContent);
        const leaderColor = el.dataset.color || '#009933';
        const line = el.querySelector('line');
        const dx = line ? parseFloat(line.getAttribute('x2')) - parseFloat(line.getAttribute('x1')) : 3;
        const dy = line ? parseFloat(line.getAttribute('y2')) - parseFloat(line.getAttribute('y1')) : -2;
        newEl = this.svgEngine.createLeaderAnnotation(id, ox, oy, ox + dx, oy + dy, leaderTexts, leaderColor);
        break;
      }
      case 'cubicle': {
        const w = parseFloat(el.dataset.width || 1.0);
        const h = parseFloat(el.dataset.height || 0.6);
        const label = el.dataset.label || '分電盤';
        newEl = this.svgEngine.createCubicle(id, ox, oy, w, h, label);
        break;
      }
      case 'pole': {
        const mat = el.dataset.material || 'コンクリート';
        const ph = el.dataset.poleHeight || '8m';
        newEl = this.svgEngine.createPole(id, ox, oy, mat, ph);
        break;
      }
      case 'handhole': {
        const mat = el.dataset.material || 'コンクリート';
        const hw = parseFloat(el.dataset.hhW || 0.4);
        const hd = parseFloat(el.dataset.hhD || 0.4);
        const hh = parseFloat(el.dataset.hhH || 0.4);
        newEl = this.svgEngine.createHandhole(id, ox, oy, mat, hw, hd, hh);
        break;
      }
      case 'pullbox': {
        const pbSize = el.dataset.pbSize || '200';
        const mat = el.dataset.material || 'SUS';
        newEl = this.svgEngine.createPullBox(id, ox, oy, pbSize, mat);
        break;
      }
      case 'existing-charger': {
        const rot = parseFloat(el.dataset.rotation || 0);
        const label = el.dataset.label || '';
        newEl = this.svgEngine.createExistingCharger(id, ox, oy, rot, label);
        break;
      }
      case 'boundary-rect': {
        const w = parseFloat(el.dataset.width);
        const h = parseFloat(el.dataset.height);
        const color = el.dataset.color || '#0066cc';
        newEl = this.svgEngine.createBoundaryRect(id, ox, oy, w, h, color);
        break;
      }
      default:
        return; // Unsupported type
    }

    // Preserve figure layer
    if (newEl) {
      newEl.setAttribute('data-figure', figure);
      // Select the new element
      this.selected = newEl;
      this.svgEngine.showSelection(newEl);
      this._showProperties(newEl);
      if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
    }
  }

  deleteSelected() {
    if (this.selected) {
      // If it's a PDF overlay, also clean up viewer reference
      if (this.selected.dataset.type === 'pdf-overlay' && typeof app !== 'undefined') {
        app.pdfViewer.removeOverlay(this.selected.dataset.id);
      } else {
        this.selected.remove();
      }
      this.selected = null;
      this.svgEngine.clearInteraction();
      this._clearProperties();
      if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
    }
  }

  // ========== Scale ==========

  _startScale(point, corner) {
    this.isScaling = true;
    this.isDragging = false;
    this.isRotating = false;
    this.dragStart = { x: point.x, y: point.y };

    const bbox = this.selected.getBBox();
    const cx = parseFloat(this.selected.dataset.x);
    const cy = parseFloat(this.selected.dataset.y);

    // Anchor is the center of the element (scale from center)
    this.scaleAnchor = { x: cx, y: cy };

    // Calculate starting distance from center to mouse
    const dx = point.x - cx;
    const dy = point.y - cy;
    this.scaleStartDist = Math.sqrt(dx * dx + dy * dy);
    this.scaleStartVal = parseFloat(this.selected.dataset.scale) || 1;
  }

  _doScale(point) {
    const dx = point.x - this.scaleAnchor.x;
    const dy = point.y - this.scaleAnchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.scaleStartDist < 0.01) return;

    let newScale = this.scaleStartVal * (dist / this.scaleStartDist);
    newScale = Math.max(0.05, Math.min(20, newScale)); // Clamp

    this.selected.dataset.scale = newScale.toFixed(3);
    this._updatePdfOverlayTransform();
    this.svgEngine.showSelection(this.selected);
  }

  // ========== Rotate ==========

  _startRotate(point) {
    this.isRotating = true;
    this.isDragging = false;
    this.isScaling = false;

    const cx = parseFloat(this.selected.dataset.x);
    const cy = parseFloat(this.selected.dataset.y);
    this.rotateCenter = { x: cx, y: cy };

    const dx = point.x - cx;
    const dy = point.y - cy;
    this.rotateStartAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    this.rotateStartVal = parseFloat(this.selected.dataset.rotation) || 0;
  }

  _doRotate(point) {
    const dx = point.x - this.rotateCenter.x;
    const dy = point.y - this.rotateCenter.y;
    const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    let newRotation = this.rotateStartVal + (currentAngle - this.rotateStartAngle);

    // Normalize to -180..180
    while (newRotation > 180) newRotation -= 360;
    while (newRotation < -180) newRotation += 360;

    // Snap to 0/90/180/270 within 3 degrees
    const snapAngles = [0, 90, -90, 180, -180, 45, -45, 135, -135];
    for (const sa of snapAngles) {
      if (Math.abs(newRotation - sa) < 3) {
        newRotation = sa;
        break;
      }
    }

    this.selected.dataset.rotation = newRotation.toFixed(1);
    this._updatePdfOverlayTransform();
    this.svgEngine.showSelection(this.selected);
  }

  // ========== Transform ==========

  _updatePdfOverlayTransform() {
    if (!this.selected || this.selected.dataset.type !== 'pdf-overlay') return;

    const x = parseFloat(this.selected.dataset.x);
    const y = parseFloat(this.selected.dataset.y);
    const rotation = parseFloat(this.selected.dataset.rotation) || 0;
    const scale = parseFloat(this.selected.dataset.scale) || 1;
    const opacity = parseFloat(this.selected.dataset.opacity) || 0.5;

    this.selected.setAttribute('transform',
      `translate(${x},${y}) rotate(${rotation}) scale(${scale})`
    );
    this.selected.setAttribute('opacity', opacity);
  }

  // ========== Hit test handles ==========

  _hitTestHandle(point) {
    const il = document.getElementById('interaction-layer');
    const handles = il.querySelectorAll('[data-handle]');
    const svg = document.getElementById('drawing-canvas');
    for (const h of handles) {
      const bbox = h.getBBox();
      // Use CTM to convert local bbox center to SVG world coordinates
      const ctm = h.getCTM();
      const svgCtm = svg.getCTM();
      let cx = bbox.x + bbox.width / 2;
      let cy = bbox.y + bbox.height / 2;
      if (ctm && svgCtm) {
        // Transform local point to screen, then back to SVG root
        const svgPt = svg.createSVGPoint();
        svgPt.x = cx;
        svgPt.y = cy;
        const screenPt = svgPt.matrixTransform(ctm);
        const worldPt = screenPt.matrixTransform(svgCtm.inverse());
        cx = worldPt.x;
        cy = worldPt.y;
      }
      const pad = Math.max(bbox.width, bbox.height) * 0.5;
      const dist = Math.sqrt((point.x - cx) ** 2 + (point.y - cy) ** 2);
      if (dist < pad + 0.3) {
        return h.dataset.handle;
      }
    }
    return null;
  }

  // ========== Properties Panel ==========

  _showProperties(element) {
    const panel = document.getElementById('properties-content');
    const type = element.dataset.type;
    let html = `<p style="font-weight:600;margin-bottom:8px;">${this._getTypeName(type)}</p>`;

    switch (type) {
      case 'pdf-overlay':
        const opacity = parseFloat(element.dataset.opacity || 0.5);
        const rotation = parseFloat(element.dataset.rotation || 0);
        const scale = parseFloat(element.dataset.scale || 1);
        const name = element.dataset.name || 'PDF';
        html += `<p style="font-size:11px;color:#666;margin-bottom:6px;">${name}</p>`;
        html += `
          <div class="form-group">
            <label>透明度 <span id="opacity-val">${Math.round(opacity * 100)}%</span></label>
            <input type="range" min="0.05" max="1" step="0.05" value="${opacity}" data-prop="opacity" class="prop-input" style="width:100%">
          </div>
          <div class="form-group">
            <label>回転角度 (°)</label>
            <input type="number" step="1" value="${Math.round(rotation)}" data-prop="rotation" class="prop-input">
          </div>
          <div class="form-group">
            <label>スケール</label>
            <input type="number" step="0.1" min="0.05" max="20" value="${scale.toFixed(2)}" data-prop="scale" class="prop-input">
          </div>
          <button id="btn-auto-read" style="margin-top:8px;padding:6px 12px;background:#4a9eff;color:#fff;border:none;border-radius:4px;cursor:pointer;width:100%;font-size:12px;">📋 自動読取（テキスト抽出）</button>`;
        break;
      case 'charging-space':
        const w = parseFloat(element.dataset.width) * 1000;
        const h = parseFloat(element.dataset.height) * 1000;
        const num = element.dataset.number;
        const csRot = parseFloat(element.dataset.rotation || 0);
        html += `
          <div class="form-group"><label>番号</label><input type="number" value="${num}" data-prop="number" class="prop-input"></div>
          <div class="form-group"><label>幅 (mm)</label><input type="number" value="${Math.round(w)}" data-prop="width" class="prop-input"></div>
          <div class="form-group"><label>奥行 (mm)</label><input type="number" value="${Math.round(h)}" data-prop="height" class="prop-input"></div>
          <div class="form-group"><label>回転角度 (°)</label><input type="number" step="1" value="${Math.round(csRot)}" data-prop="rotation" class="prop-input"></div>
          <button id="btn-align-building" style="margin-top:4px;padding:6px 12px;background:#cc6600;color:#fff;border:none;border-radius:4px;cursor:pointer;width:100%;font-size:12px;">🏢 建物に平行</button>`;
        break;
      case 'charger':
        const chStand = element.dataset.standType || 'パイルスタンド';
        html += `
          <div class="form-group"><label>スタンド種別</label>
            <select data-prop="standType" class="prop-input" style="width:100%;padding:4px;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px;">
              <option value="パイルスタンド" ${chStand === 'パイルスタンド' ? 'selected' : ''}>パイルスタンド</option>
              <option value="アイフルスタンド" ${chStand === 'アイフルスタンド' ? 'selected' : ''}>アイフルスタンド</option>
              <option value="壁付" ${chStand === '壁付' ? 'selected' : ''}>壁付</option>
            </select>
          </div>
          <div class="form-group"><label>回転角度</label><input type="number" value="${element.dataset.rotation || 0}" data-prop="rotation" class="prop-input"></div>`;
        break;
      case 'text': {
        const textEl = element.querySelector('text');
        const textContent = [...element.querySelectorAll('text')].map(t => t.textContent).join('\n');
        const textColor = element.dataset.color || '#333';
        const textFontSize = textEl ? parseFloat(textEl.getAttribute('font-size')) : 0.35;
        html += `
          <div class="form-group"><label>テキスト</label><textarea data-prop="textContent" class="prop-input" style="width:100%;min-height:60px;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px;padding:4px;resize:vertical;">${textContent}</textarea></div>
          <div class="form-group"><label>フォントサイズ (mm)</label><input type="number" step="0.5" min="1" value="${Math.round(textFontSize * 10 * 10) / 10}" data-prop="fontSize" class="prop-input"></div>
          ${this._colorPickerHtml('color', textColor)}`;
        break;
      }
      case 'road-marking':
        html += `<p>路面表示 900×900</p>`;
        break;
      case 'dimension': {
        const dist = element.dataset.distance;
        const dimColor = element.dataset.color || '#0066cc';
        html += `<p>寸法: ${dist}mm</p>`;
        html += this._colorPickerHtml('color', dimColor);
        break;
      }
      case 'leader': {
        const leaderLines = [...element.querySelectorAll('text')].map(t => t.textContent).join('\n');
        const leaderColor = element.dataset.color || '#009933';
        html += `
          <div class="form-group"><label>テキスト</label><textarea data-prop="textContent" class="prop-input" style="width:100%;min-height:60px;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px;padding:4px;resize:vertical;">${leaderLines}</textarea></div>
          ${this._colorPickerHtml('color', leaderColor)}`;
        break;
      }
      case 'boundary-rect': {
        const brW = parseFloat(element.dataset.width) * 1000;
        const brH = parseFloat(element.dataset.height) * 1000;
        const brColor = element.dataset.color || '#0066cc';
        html += `
          <div class="form-group"><label>幅 (mm)</label><input type="number" value="${Math.round(brW)}" data-prop="width" class="prop-input"></div>
          <div class="form-group"><label>高さ (mm)</label><input type="number" value="${Math.round(brH)}" data-prop="height" class="prop-input"></div>
          ${this._colorPickerHtml('color', brColor)}`;
        break;
      }
      case 'wiring-route':
        html += this._buildWiringRouteProperties(element);
        break;
      case 'cubicle':
        html += `
          <div class="form-group"><label>ラベル</label><input type="text" value="${element.dataset.label || ''}" data-prop="label" class="prop-input"></div>`;
        break;
      case 'pole':
        html += `
          <div class="form-group"><label>材質</label><input type="text" value="${element.dataset.material || ''}" data-prop="material" class="prop-input"></div>
          <div class="form-group"><label>高さ</label><input type="text" value="${element.dataset.height || ''}" data-prop="height" class="prop-input"></div>`;
        break;
      case 'pullbox':
        html += `
          <div class="form-group"><label>サイズ</label><input type="text" value="${element.dataset.pbSize || '200'}" data-prop="pbSize" class="prop-input"></div>
          <div class="form-group"><label>材質</label>
            <select data-prop="material" class="prop-input" style="width:100%;padding:4px;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px;">
              <option value="SUS" ${(element.dataset.material || 'SUS') === 'SUS' ? 'selected' : ''}>SUS</option>
              <option value="鉄" ${element.dataset.material === '鉄' ? 'selected' : ''}>鉄</option>
            </select>
          </div>`;
        break;
      case 'existing-charger':
        html += `
          <div class="form-group"><label>ラベル</label><input type="text" value="${element.dataset.label || ''}" data-prop="label" class="prop-input"></div>
          <div class="form-group"><label>回転角度</label><input type="number" value="${element.dataset.rotation || 0}" data-prop="rotation" class="prop-input"></div>`;
        break;
      default:
        html += `<p>位置: (${Math.round(parseFloat(element.dataset.x) * 1000)}, ${Math.round(parseFloat(element.dataset.y) * -1000)})</p>`;
    }

    // Add figure layer dropdown for all annotation types (except pdf-overlay)
    if (type !== 'pdf-overlay') {
      const currentFigure = element.getAttribute('data-figure') || 'plan';
      html += `
        <div class="form-group" style="margin-top:8px;border-top:1px solid #444;padding-top:8px;">
          <label>帰属レイヤー</label>
          <select data-prop="figure" class="prop-input" style="width:100%;padding:4px;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px;">
            <option value="plan" ${currentFigure === 'plan' ? 'selected' : ''}>平面図専用</option>
            <option value="route" ${currentFigure === 'route' ? 'selected' : ''}>配線ルート図専用</option>
            <option value="shared" ${currentFigure === 'shared' ? 'selected' : ''}>共通</option>
          </select>
        </div>`;
    }

    // Action buttons row
    html += `<div style="display:flex;gap:6px;margin-top:8px;">`;
    html += `<button id="btn-duplicate" style="flex:1;padding:6px 8px;background:#4a9eff;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;" title="Ctrl+D">📋 コピー</button>`;
    html += `<button style="flex:1;padding:6px 8px;background:#f44;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;" onclick="app.toolManager.tools.select.deleteSelected()">🗑 削除</button>`;
    html += `</div>`;
    panel.innerHTML = html;

    // Bind property change events
    panel.querySelectorAll('.prop-input').forEach(input => {
      const eventType = input.type === 'range' ? 'input' : (input.tagName === 'TEXTAREA' ? 'input' : 'change');
      input.addEventListener(eventType, () => this._onPropertyChange(input));
    });

    // Bind color preset buttons
    panel.querySelectorAll('.color-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._onPropertyChange({ dataset: { prop: btn.dataset.prop }, value: btn.dataset.value });
        // Update UI selection
        panel.querySelectorAll('.color-preset-btn').forEach(b => b.style.outline = '');
        btn.style.outline = '2px solid #fff';
        btn.style.outlineOffset = '1px';
        // Also sync color input
        const colorInput = panel.querySelector(`input[type="color"][data-prop="${btn.dataset.prop}"]`);
        if (colorInput) colorInput.value = btn.dataset.value;
      });
    });

    // Bind auto-read button (for PDF overlay)
    const autoReadBtn = panel.querySelector('#btn-auto-read');
    if (autoReadBtn) {
      autoReadBtn.addEventListener('click', async () => {
        if (typeof app === 'undefined' || !app.pdfAutoReader) return;
        autoReadBtn.disabled = true;
        autoReadBtn.textContent = '⏳ 読取中...';
        try {
          // Try overlay-based extraction first, fallback to direct
          const overlayId = element.dataset.id;
          const overlay = app.pdfViewer.overlays.find(o => o.id === overlayId);
          if (overlay) {
            await app.pdfAutoReader.extractFromOverlay(overlayId);
          } else {
            // Find the matching PDF in pdfViewer.pdfs by name
            const name = element.dataset.name || '';
            const idx = app.pdfViewer.pdfs.findIndex(p => p.name === name);
            if (idx >= 0) {
              await app.pdfAutoReader.extractDirect(idx, 1);
            } else if (app.pdfViewer.pdfs.length > 0) {
              await app.pdfAutoReader.extractDirect(app.pdfViewer.pdfs.length - 1, 1);
            }
          }
          autoReadBtn.textContent = '✅ 読取完了';
        } catch (err) {
          console.error('Auto-read error:', err);
          autoReadBtn.textContent = '❌ エラー';
        }
      });
    }

    // Bind "建物に平行" button
    const alignBtn = panel.querySelector('#btn-align-building');
    if (alignBtn) {
      alignBtn.addEventListener('click', () => this._alignToNearestWall());
    }

    // Bind duplicate button
    const dupBtn = panel.querySelector('#btn-duplicate');
    if (dupBtn) {
      dupBtn.addEventListener('click', () => this.duplicateSelected());
    }
  }

  _buildWiringRouteProperties(element) {
    let html = '';
    try {
      const routeData = JSON.parse(element.dataset.routeData || '{}');
      const segments = routeData.segments || [];
      const totalLength = segments.reduce((sum, s) => sum + (s.length || 0), 0);
      html += `<p style="font-size:11px;color:#aaa;">全長: ${totalLength.toFixed(1)}m（${segments.length}区間）</p>`;

      const methodNames = { 'exposed': '露出', 'buried': '埋設', 'aerial': '架空' };
      segments.forEach((seg, i) => {
        html += `
          <div style="margin-top:6px;padding:4px;background:#1e1e1e;border-radius:3px;font-size:11px;">
            <div style="color:#cc6600;font-weight:600;">区間${i + 1} (${seg.length.toFixed(1)}m)</div>
            <div>工法: ${methodNames[seg.method] || seg.method}</div>
            <div>ケーブル: ${seg.cableSpec || '-'}</div>
            <div>配管: ${seg.conduitSpec || '-'}</div>
            ${seg.method === 'buried' ? `<div>路面: ${seg.surfaceType || '-'}</div>` : ''}
          </div>`;
      });
    } catch (e) {
      html += '<p style="color:#888;">ルートデータなし</p>';
    }
    return html;
  }

  _onPropertyChange(input) {
    if (!this.selected) return;
    const prop = input.dataset.prop;
    const value = input.value;
    const type = this.selected.dataset.type;

    // Handle figure layer change specially (it's an attribute, not dataset)
    if (prop === 'figure') {
      this.selected.setAttribute('data-figure', value);
      return;
    }

    this.selected.dataset[prop] = value;

    if (type === 'pdf-overlay') {
      if (prop === 'opacity') {
        // Update label
        const label = document.getElementById('opacity-val');
        if (label) label.textContent = Math.round(parseFloat(value) * 100) + '%';
      }
      this._updatePdfOverlayTransform();
      this.svgEngine.showSelection(this.selected);
    }

    // Update transform for rotatable annotation types
    if (prop === 'rotation' && (type === 'charging-space' || type === 'charger' || type === 'wheel-stop' || type === 'existing-charger')) {
      const rx = this.selected.dataset.x;
      const ry = this.selected.dataset.y;
      this.selected.setAttribute('transform', `translate(${rx},${ry}) rotate(${value})`);
      this.svgEngine.showSelection(this.selected);
    }

    // Rebuild pullbox when properties change
    if (type === 'pullbox' && (prop === 'pbSize' || prop === 'material')) {
      this._rebuildPullBox(this.selected);
    }

    // Rebuild charger when stand type changes
    if (type === 'charger' && prop === 'standType') {
      this.selected.dataset.standType = value;
    }

    // Rebuild charging space when dimensions change
    if (type === 'charging-space' && (prop === 'width' || prop === 'height' || prop === 'number')) {
      const cw = parseFloat(this.selected.dataset.width) / (prop === 'width' ? 1 : 1000);
      const ch = parseFloat(this.selected.dataset.height) / (prop === 'height' ? 1 : 1000);
      // Width/height are stored in meters in dataset but input is in mm
      if (prop === 'width') this.selected.dataset.width = parseFloat(value) / 1000;
      if (prop === 'height') this.selected.dataset.height = parseFloat(value) / 1000;
      this._rebuildChargingSpace(this.selected);
    }

    // Handle color changes for text/dimension/leader/boundary-rect
    if (prop === 'color') {
      this.selected.dataset.color = value;
      if (type === 'text') {
        this.selected.querySelectorAll('text').forEach(t => t.setAttribute('fill', value));
      } else if (type === 'leader') {
        this.selected.querySelectorAll('text').forEach(t => t.setAttribute('fill', value));
        this.selected.querySelectorAll('line').forEach(l => l.setAttribute('stroke', value));
        this.selected.querySelectorAll('circle').forEach(c => c.setAttribute('fill', value));
      } else if (type === 'dimension') {
        this._rebuildDimension(this.selected, value);
      } else if (type === 'boundary-rect') {
        this._rebuildBoundaryRect(this.selected);
      }
    }

    // Handle text content changes for text annotations
    if (prop === 'textContent' && type === 'text') {
      this._rebuildTextAnnotation(this.selected, value);
    }

    // Handle font size changes for text annotations
    if (prop === 'fontSize' && type === 'text') {
      const newSize = parseFloat(value) * 0.1; // mm to DXF units (m / 10)
      this.selected.querySelectorAll('text').forEach(t => t.setAttribute('font-size', newSize));
    }

    // Handle text content changes for leader annotations
    if (prop === 'textContent' && type === 'leader') {
      this._rebuildLeader(this.selected, value);
    }

    // Handle boundary-rect dimension changes
    if (type === 'boundary-rect' && (prop === 'width' || prop === 'height')) {
      if (prop === 'width') this.selected.dataset.width = parseFloat(value) / 1000;
      if (prop === 'height') this.selected.dataset.height = parseFloat(value) / 1000;
      this._rebuildBoundaryRect(this.selected);
    }
  }

  _rebuildChargingSpace(el) {
    const S = this.svgEngine.S;
    const w = parseFloat(el.dataset.width);
    const h = parseFloat(el.dataset.height);
    const num = el.dataset.number;
    // Remove child elements (rect, texts) but keep the group
    while (el.firstChild) el.removeChild(el.firstChild);
    // Rebuild in local coords
    el.appendChild(Utils.createSVGElement('rect', {
      x: 0, y: 0, width: w, height: h,
      fill: 'rgba(204,0,0,0.03)', stroke: '#cc0000',
      'stroke-width': S.strokeMedium
    }));
    const label = Utils.createSVGElement('text', {
      x: w / 2, y: h / 2 - S.fontSmall * 0.5,
      'text-anchor': 'middle', 'font-size': S.fontSmall,
      fill: '#cc0000', 'font-family': 'Meiryo, sans-serif'
    });
    label.textContent = `【充電スペース${num}】`;
    el.appendChild(label);
    const dimLabel = Utils.createSVGElement('text', {
      x: w / 2, y: h / 2 + S.fontSmall * 1.2,
      'text-anchor': 'middle', 'font-size': S.fontSmall * 0.85,
      fill: '#cc0000', 'font-family': 'Meiryo, sans-serif'
    });
    dimLabel.textContent = `幅${w.toFixed(2)}m×奥行${h.toFixed(1)}m`;
    el.appendChild(dimLabel);
    this.svgEngine.showSelection(el);
  }

  _rebuildTextAnnotation(el, newText) {
    const S = this.svgEngine.S;
    const x = parseFloat(el.dataset.x);
    const y = parseFloat(el.dataset.y);
    const color = el.dataset.color || '#333';
    const oldTextEl = el.querySelector('text');
    const fontSize = oldTextEl ? parseFloat(oldTextEl.getAttribute('font-size')) : S.fontMedium;
    while (el.firstChild) el.removeChild(el.firstChild);
    const lines = newText.split('\n');
    lines.forEach((line, i) => {
      const textEl = Utils.createSVGElement('text', {
        x, y: y + i * fontSize * 1.4, 'font-size': fontSize, fill: color,
        'font-family': 'Meiryo, sans-serif'
      });
      textEl.textContent = line;
      el.appendChild(textEl);
    });
    this.svgEngine.showSelection(el);
  }

  _rebuildLeader(el, newText) {
    const S = this.svgEngine.S;
    const color = el.dataset.color || '#009933';
    // Preserve line and circle (first 2 children), replace text elements
    const lineEl = el.querySelector('line');
    const circleEl = el.querySelector('circle');
    while (el.firstChild) el.removeChild(el.firstChild);
    if (lineEl) el.appendChild(lineEl);
    if (circleEl) el.appendChild(circleEl);
    const textX = lineEl ? parseFloat(lineEl.getAttribute('x2')) : parseFloat(el.dataset.x);
    const textY = lineEl ? parseFloat(lineEl.getAttribute('y2')) : parseFloat(el.dataset.y);
    const lines = newText.split('\n');
    lines.forEach((line, i) => {
      const textEl = Utils.createSVGElement('text', {
        x: textX, y: textY + i * S.fontSmall * 1.4,
        'font-size': S.fontSmall * 0.85, fill: color,
        'font-family': 'Meiryo, sans-serif'
      });
      textEl.textContent = line;
      el.appendChild(textEl);
    });
    this.svgEngine.showSelection(el);
  }

  _rebuildDimension(el, newColor) {
    // Rebuild dimension with new color - simplest approach: update all stroke/fill
    el.querySelectorAll('line').forEach(l => l.setAttribute('stroke', newColor));
    el.querySelectorAll('text').forEach(t => t.setAttribute('fill', newColor));
    // Update markers - need to ensure markers exist for new color
    this.svgEngine._ensureDimMarker(newColor);
    const mId = this.svgEngine._dimMarkerId(newColor);
    el.querySelectorAll('line[marker-start]').forEach(l => {
      l.setAttribute('marker-start', `url(#${mId}-start)`);
      l.setAttribute('marker-end', `url(#${mId}-end)`);
    });
  }

  _rebuildBoundaryRect(el) {
    const S = this.svgEngine.S;
    const x = parseFloat(el.dataset.x);
    const y = parseFloat(el.dataset.y);
    const w = parseFloat(el.dataset.width);
    const h = parseFloat(el.dataset.height);
    const color = el.dataset.color || '#0066cc';
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(Utils.createSVGElement('rect', {
      x, y, width: w, height: h,
      fill: 'none', stroke: color, 'stroke-width': S.strokeThin * 1.2
    }));
    const wMm = Math.round(w * 1000);
    const hMm = Math.round(h * 1000);
    const topText = Utils.createSVGElement('text', {
      x: x + w / 2, y: y - S.fontSmall * 0.5,
      'text-anchor': 'middle', 'font-size': S.fontSmall,
      fill: color, 'font-family': 'Meiryo, sans-serif'
    });
    topText.textContent = Utils.formatDimension(wMm);
    el.appendChild(topText);
    const rightText = Utils.createSVGElement('text', {
      x: x + w + S.fontSmall * 0.5, y: y + h / 2,
      'text-anchor': 'middle', 'font-size': S.fontSmall,
      fill: color, 'font-family': 'Meiryo, sans-serif',
      transform: `rotate(-90, ${x + w + S.fontSmall * 0.5}, ${y + h / 2})`
    });
    rightText.textContent = Utils.formatDimension(hMm);
    el.appendChild(rightText);
    this.svgEngine.showSelection(el);
  }

  _rebuildPullBox(el) {
    const S = this.svgEngine.S;
    const x = parseFloat(el.dataset.x);
    const y = parseFloat(el.dataset.y);
    const size = el.dataset.pbSize || '200';
    const material = el.dataset.material || 'SUS';
    while (el.firstChild) el.removeChild(el.firstChild);
    const sz = 0.25;
    el.appendChild(Utils.createSVGElement('rect', {
      x: x - sz / 2, y: y - sz / 2, width: sz, height: sz,
      fill: 'rgba(0,102,204,0.08)', stroke: '#0066cc', 'stroke-width': S.strokeMedium
    }));
    const pbText = Utils.createSVGElement('text', {
      x, y: y + 0.03, 'text-anchor': 'middle',
      'font-size': 0.09, fill: '#0066cc', 'font-weight': 'bold',
      'font-family': 'Meiryo, sans-serif'
    });
    pbText.textContent = 'PB';
    el.appendChild(pbText);
    const lbl = Utils.createSVGElement('text', {
      x, y: y + sz / 2 + S.fontSmall * 1.3, 'text-anchor': 'middle',
      'font-size': S.fontSmall * 0.75, fill: '#0066cc', 'font-family': 'Meiryo, sans-serif'
    });
    lbl.textContent = `PB ${material} ${size}`;
    el.appendChild(lbl);
    this.svgEngine.showSelection(el);
  }

  _clearProperties() {
    const panel = document.getElementById('properties-content');
    panel.innerHTML = '<p class="placeholder-text">要素を選択してください</p>';
  }

  // ========== Building Alignment ==========

  /**
   * Align the selected charging space to be parallel with the nearest DXF wall segment.
   * Searches all polyline segments and line entities to find the closest one,
   * then sets the rotation angle to match that segment's direction.
   */
  _alignToNearestWall() {
    if (!this.selected || this.selected.dataset.type !== 'charging-space') return;
    if (typeof app === 'undefined' || !app.state.dxfData) {
      alert('DXFデータが読み込まれていません。');
      return;
    }

    // Get charging space center in SVG coords
    const cx = parseFloat(this.selected.dataset.x) + parseFloat(this.selected.dataset.width) / 2;
    const cy = parseFloat(this.selected.dataset.y) + parseFloat(this.selected.dataset.height) / 2;

    // Collect all segments from DXF data
    // DXF coords: Y is positive up, but SVG renders with -Y, so polyline vertices
    // are stored in DXF coords. The SVG engine negates Y when rendering paths.
    // Our charging space is in SVG coords (Y negated), so we need to convert
    // DXF segment coords to SVG coords for distance calculation.

    let bestDist = Infinity;
    let bestAngle = 0;

    // Search radius: start with 50m, expand if nothing found
    const searchRadii = [50, 200, Infinity];
    const MIN_SEG_LEN = 0.5; // Ignore segments shorter than 0.5m (decorative elements)

    const layers = app.state.dxfData.layers;

    for (const radius of searchRadii) {
      if (bestDist < Infinity) break; // Already found a match

      for (const layerData of Object.values(layers)) {
        // Process polylines
        if (layerData.polylines) {
          for (const pl of layerData.polylines) {
            const verts = pl.vertices;
            if (!verts || verts.length < 2) continue;

            // Quick bounding-box rejection for the whole polyline
            if (radius < Infinity) {
              let plMinX = Infinity, plMaxX = -Infinity, plMinY = Infinity, plMaxY = -Infinity;
              for (const v of verts) {
                if (v.x < plMinX) plMinX = v.x;
                if (v.x > plMaxX) plMaxX = v.x;
                const sy = -v.y;
                if (sy < plMinY) plMinY = sy;
                if (sy > plMaxY) plMaxY = sy;
              }
              if (cx < plMinX - radius || cx > plMaxX + radius ||
                  cy < plMinY - radius || cy > plMaxY + radius) continue;
            }

            const count = pl.closed ? verts.length : verts.length - 1;
            for (let i = 0; i < count; i++) {
              const v1 = verts[i];
              const v2 = verts[(i + 1) % verts.length];
              // Convert DXF coords to SVG coords (negate Y)
              const sx1 = v1.x, sy1 = -v1.y;
              const sx2 = v2.x, sy2 = -v2.y;
              const segLen = Math.sqrt((sx2 - sx1) ** 2 + (sy2 - sy1) ** 2);
              if (segLen < MIN_SEG_LEN) continue; // Skip tiny segments

              const dist = this._pointToSegmentDist(cx, cy, sx1, sy1, sx2, sy2);
              if (dist < bestDist) {
                bestDist = dist;
                bestAngle = Math.atan2(sy2 - sy1, sx2 - sx1) * 180 / Math.PI;
              }
            }
          }
        }

        // Process lines
        if (layerData.lines) {
          for (const ln of layerData.lines) {
            const sx1 = ln.x1, sy1 = -ln.y1;
            const sx2 = ln.x2, sy2 = -ln.y2;
            const segLen = Math.sqrt((sx2 - sx1) ** 2 + (sy2 - sy1) ** 2);
            if (segLen < MIN_SEG_LEN) continue;

            if (radius < Infinity) {
              const minX = Math.min(sx1, sx2), maxX = Math.max(sx1, sx2);
              const minY = Math.min(sy1, sy2), maxY = Math.max(sy1, sy2);
              if (cx < minX - radius || cx > maxX + radius ||
                  cy < minY - radius || cy > maxY + radius) continue;
            }

            const dist = this._pointToSegmentDist(cx, cy, sx1, sy1, sx2, sy2);
            if (dist < bestDist) {
              bestDist = dist;
              bestAngle = Math.atan2(sy2 - sy1, sx2 - sx1) * 180 / Math.PI;
            }
          }
        }
      }
    }

    if (bestDist === Infinity) {
      alert('近くの建物壁が見つかりませんでした。');
      return;
    }

    // Normalize angle to align the space's long edge parallel to the wall.
    // The charging space rectangle's default orientation has width along X axis.
    // We want the longer dimension to be parallel to the wall segment.
    // bestAngle is the wall direction; we just apply it directly as rotation.
    // Normalize to -180..180
    while (bestAngle > 180) bestAngle -= 360;
    while (bestAngle < -180) bestAngle += 360;

    // Apply rotation
    const rx = this.selected.dataset.x;
    const ry = this.selected.dataset.y;
    this.selected.dataset.rotation = bestAngle.toFixed(1);
    this.selected.setAttribute('transform', `translate(${rx},${ry}) rotate(${bestAngle.toFixed(1)})`);
    this.svgEngine.showSelection(this.selected);

    // Update properties panel
    this._showProperties(this.selected);

    console.log(`Aligned to nearest wall: angle=${bestAngle.toFixed(1)}°, distance=${bestDist.toFixed(3)}m`);
  }

  /**
   * Calculate the shortest distance from point (px,py) to segment (x1,y1)-(x2,y2)
   */
  _pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  }

  _getTypeName(type) {
    const names = {
      'charging-space': '充電スペース', 'charger': '充電設備',
      'road-marking': '路面表示', 'wheel-stop': '車止め',
      'bollard': '防護用部材', 'lighting': '電灯',
      'foundation': '基礎', 'text': 'テキスト',
      'dimension': '寸法線', 'pdf-overlay': '📄 参照PDF',
      'leader': '引出線注釈', 'boundary-rect': '囲み線',
      'wiring-route': '配線ルート', 'cubicle': '分電盤/キュービクル',
      'pole': '建柱（引込柱）', 'handhole': 'ハンドホール',
      'pullbox': 'プルボックス',
      'existing-charger': '既設充電設備', 'wiring-summary': '配線集計表'
    };
    return names[type] || type;
  }

  // Generate color picker HTML for property panel
  _colorPickerHtml(propName, currentColor) {
    const presets = [
      { color: '#333333', label: '黒' },
      { color: '#009933', label: '緑' },
      { color: '#0066cc', label: '青' },
      { color: '#cc0000', label: '赤' },
      { color: '#cc6600', label: '橙' }
    ];
    let html = '<div class="form-group"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">';
    presets.forEach(p => {
      const sel = (currentColor === p.color || currentColor === p.color.replace('#', '#')) ? 'outline:2px solid #fff;outline-offset:1px;' : '';
      html += `<button class="color-preset-btn" data-prop="${propName}" data-value="${p.color}" style="width:24px;height:24px;border-radius:4px;border:1px solid #555;background:${p.color};cursor:pointer;${sel}" title="${p.label}"></button>`;
    });
    html += `<input type="color" value="${currentColor}" data-prop="${propName}" class="prop-input" style="width:30px;height:24px;padding:0;border:1px solid #555;border-radius:3px;cursor:pointer;">`;
    html += '</div></div>';
    return html;
  }
}
