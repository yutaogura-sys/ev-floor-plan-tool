// SelectTool の図形再構築メソッド群（select-tool.js から分離）。
// プロパティ編集時に選択要素の見た目を作り直す。SVGEngine の svg-shapes-route.js と
// 同じく prototype 拡張方式で、select-tool.js の後に読み込む（index.html）。
// ブラウザ専用（DOM/SVG 依存）。
(function () {
  if (typeof SelectTool === 'undefined') return;

  Object.assign(SelectTool.prototype, {
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
        fill: '#cc0000', 'font-family': 'Meiryo, sans-serif',
        class: 'detail-label'
      });
      dimLabel.textContent = `幅${w.toFixed(2)}m×奥行${h.toFixed(1)}m`;
      el.appendChild(dimLabel);
      this.svgEngine.applyLabelOffset(el);
      this.svgEngine.showSelection(el);
    },

    _rebuildFoundation(el) {
      const S = this.svgEngine.S;
      const x = parseFloat(el.dataset.x);
      const y = parseFloat(el.dataset.y);
      const width = parseFloat(el.dataset.width);
      const height = parseFloat(el.dataset.height);
      const depth = parseFloat(el.dataset.depth || 0.5);
      const material = el.dataset.material || 'コンクリート';
      while (el.firstChild) el.removeChild(el.firstChild);
      el.appendChild(Utils.createSVGElement('rect', {
        x: x - width / 2, y: y - height / 2, width, height,
        fill: 'rgba(200,200,200,0.2)', stroke: '#333', 'stroke-width': S.strokeMedium
      }));
      el.appendChild(Utils.createSVGElement('line', {
        x1: x - width / 2, y1: y - height / 2, x2: x + width / 2, y2: y + height / 2,
        stroke: '#999', 'stroke-width': S.strokeThin
      }));
      el.appendChild(Utils.createSVGElement('line', {
        x1: x + width / 2, y1: y - height / 2, x2: x - width / 2, y2: y + height / 2,
        stroke: '#999', 'stroke-width': S.strokeThin
      }));
      const wMm = Math.round(width * 1000), hMm = Math.round(height * 1000), dMm = Math.round(depth * 1000);
      const lbl = Utils.createSVGElement('text', {
        x, y: y + height / 2 + S.fontSmall * 1.5,
        'text-anchor': 'middle', 'font-size': S.fontSmall * 0.85,
        fill: '#333', 'font-family': 'Meiryo, sans-serif',
        class: 'detail-label'
      });
      lbl.textContent = `充電設備基礎 ${material} ${wMm}×${hMm}×${dMm}`;
      el.appendChild(lbl);
      this.svgEngine.applyLabelOffset(el);
    },

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
    },

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
    },

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
    },

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
    },

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
        'font-size': S.fontSmall * 0.75, fill: '#0066cc', 'font-family': 'Meiryo, sans-serif',
        class: 'detail-label'
      });
      lbl.textContent = `PB ${material} ${size}`;
      el.appendChild(lbl);
      this.svgEngine.applyLabelOffset(el);
      this.svgEngine.showSelection(el);
    },

    // 選択要素を現在の data-* から作り直す（描画ロジックを二重化せず StateSerializer を再利用）。
    // change(blur)時に呼ぶ前提。data-figure と id を保持し、新要素を選択し直す。
    _regenerateSelected() {
      const el = this.selected;
      if (!el) return;
      const type = el.dataset.type;
      const rec = (typeof StateSerializer !== 'undefined') ? StateSerializer.recordFromDataset(type, el.dataset) : null;
      const call = rec && StateSerializer.createCallFromRecord(rec);
      if (!call || typeof this.svgEngine[call.method] !== 'function') return;
      const figure = el.getAttribute('data-figure');
      const labelDx = el.dataset.labelDx;
      const labelDy = el.dataset.labelDy;
      el.remove();
      const newEl = this.svgEngine[call.method].apply(this.svgEngine, call.args);
      if (newEl && figure) newEl.setAttribute('data-figure', figure);
      if (newEl && (parseFloat(labelDx) || parseFloat(labelDy))) {
        newEl.dataset.labelDx = labelDx || 0;
        newEl.dataset.labelDy = labelDy || 0;
        this.svgEngine.applyLabelOffset(newEl);
      }
      this.selected = newEl || null;
      if (newEl) {
        this.svgEngine.showSelection(newEl);
        this._showProperties(newEl);
      }
    }
  });
})();
