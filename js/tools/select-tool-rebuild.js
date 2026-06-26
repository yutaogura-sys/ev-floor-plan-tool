// SelectTool の図形再構築メソッド群（select-tool.js から分離）。
// プロパティ編集時に選択要素の見た目を作り直す。SVGEngine の svg-shapes-route.js と
// 同じく prototype 拡張方式で、select-tool.js の後に読み込む（index.html）。
// ブラウザ専用（DOM/SVG 依存）。
(function () {
  if (typeof SelectTool === 'undefined') return;

  Object.assign(SelectTool.prototype, {
    _rebuildTextAnnotation(el, newText) {
      const S = this.svgEngine.S;
      const x = parseFloat(el.dataset.x);
      const y = parseFloat(el.dataset.y);
      const color = el.dataset.color || Utils.COLORS.ink;
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
      const color = el.dataset.color || Utils.COLORS.green;
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
