// Title Block - Standard drawing title block matching subsidy requirements
// All sizes in DXF units (meters). At 1:100 scale on A3, 1mm paper = 0.1m DXF.
class TitleBlock {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
    this.layer = document.getElementById('title-block-layer');
    this.data = {
      siteName: '',
      projectName: '充電設備設置工事',
      drawingName: '平面図',
      author: '',
      scale: '1/100',
      paper: 'A3',
      date: '',
      northAngle: 0
    };

    this._bindInputs();
  }

  _bindInputs() {
    const fields = {
      'tb-site-name': 'siteName',
      'tb-project-name': 'projectName',
      'tb-drawing-name': 'drawingName',
      'tb-author': 'author',
      'tb-scale': 'scale',
      'tb-paper': 'paper',
      'tb-date': 'date',
      'tb-north-angle': 'northAngle'
    };

    for (const [inputId, dataKey] of Object.entries(fields)) {
      const input = document.getElementById(inputId);
      if (input) {
        const handler = () => {
          this.data[dataKey] = dataKey === 'northAngle' ? parseFloat(input.value) || 0 : input.value;
          this.render();
          if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();

          // Sync scale to status bar and export boundary when scale field changes
          if (dataKey === 'scale') {
            const statusScale = document.getElementById('status-scale');
            const n = Utils.parseScale(this.data.scale);
            if (statusScale) {
              statusScale.textContent = n ? `縮尺: 1/${n}` : `縮尺: ${this.data.scale}`;
            }
            // 縮尺が解釈できない入力は無言で範囲枠を消さず、理由を通知
            if (!n && this.data.scale && input === document.activeElement && Utils.toast) {
              Utils.toast('縮尺を解釈できません（例: 1/100, 1:200）。出力範囲は前回値のままです。', 'error');
            }
          }
          // 縮尺・用紙のどちらの変更でも出力範囲プレビューを更新
          if ((dataKey === 'scale' || dataKey === 'paper') && typeof app !== 'undefined' && app.exportBoundary) {
            app.exportBoundary.update();
          }
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
      }
    }

    // Set default date
    const dateInput = document.getElementById('tb-date');
    if (dateInput) {
      const today = new Date();
      dateInput.value = today.toISOString().split('T')[0];
      this.data.date = dateInput.value;
    }
  }

  // data の値を各入力欄へ反映（プロジェクト読込後にフォームを実データへ同期）
  syncInputs() {
    const map = {
      'tb-site-name': 'siteName', 'tb-project-name': 'projectName',
      'tb-drawing-name': 'drawingName', 'tb-author': 'author',
      'tb-scale': 'scale', 'tb-paper': 'paper', 'tb-date': 'date',
      'tb-north-angle': 'northAngle'
    };
    for (const [id, key] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el && this.data[key] !== undefined && this.data[key] !== null) el.value = this.data[key];
    }
    // ステータスバーの縮尺表示も同期
    const statusScale = document.getElementById('status-scale');
    if (statusScale) {
      const n = Utils.parseScale(this.data.scale);
      statusScale.textContent = n ? `縮尺: 1/${n}` : `縮尺: ${this.data.scale}`;
    }
  }

  // Render title block at a fixed position relative to the drawing
  render(bounds) {
    this.layer.innerHTML = '';

    if (!bounds && this.svgEngine && this.svgEngine.dxfLayer) {
      const bbox = this.svgEngine.dxfLayer.getBBox();
      if (bbox.width > 0) {
        bounds = {
          minX: bbox.x,
          maxX: bbox.x + bbox.width,
          minY: bbox.y,
          maxY: bbox.y + bbox.height
        };
      }
    }

    // DXF が無い場合は注釈レイヤーの範囲にフォールバック（注釈のみ作図でも図枠を描画）
    if (!bounds && this.svgEngine && this.svgEngine.annotationLayer) {
      try {
        const bbox = this.svgEngine.annotationLayer.getBBox();
        if (bbox.width > 0) {
          bounds = {
            minX: bbox.x,
            maxX: bbox.x + bbox.width,
            minY: bbox.y,
            maxY: bbox.y + bbox.height
          };
        }
      } catch (e) { /* getBBox は未レンダリング時に throw しうる */ }
    }

    if (!bounds) return;

    const S = this.svgEngine.S;
    const sw = S.strokeThin;       // 0.05
    const fsLabel = S.fontSmall;   // 0.25
    const fsValue = S.fontMedium;  // 0.35
    const fsTitle = S.fontLarge;   // 0.5

    // Title block dimensions in meters (DXF units)
    // On paper at 1:100: blockWidth=16m → 160mm, blockHeight=1.2m → 12mm
    const blockWidth = 16;
    const blockHeight = 1.2;
    const rowHeight = blockHeight / 2;

    // Position title block at bottom-right of the drawing
    const x = bounds.maxX - blockWidth;
    const y = bounds.maxY + 0.5;

    // Main border
    this.layer.appendChild(Utils.createSVGElement('rect', {
      x, y, width: blockWidth, height: blockHeight,
      fill: 'white', stroke: Utils.COLORS.ink, 'stroke-width': sw * 2
    }));

    // Row divider (horizontal middle line)
    const midY = y + rowHeight;
    this.layer.appendChild(Utils.createSVGElement('line', {
      x1: x, y1: midY, x2: x + blockWidth, y2: midY,
      stroke: Utils.COLORS.ink, 'stroke-width': sw
    }));

    // Column positions (proportional within blockWidth=16m)
    // Row1: | 設置場所 | サイト名+工事名 | 図面名称 | 平面図 |
    // Row2: | 作成者   | 名前            | 縮尺     | A3:1/100 | 作成日 | 日付 |
    const col1 = x + 1.5;                       // after label "設置場所"/"作成者"
    const col2 = x + blockWidth - 5.5;          // before "図面名称"/"縮尺"
    const col3 = x + blockWidth - 4.8;          // after "図面名称"
    const col4 = x + blockWidth - 3.0;          // after "平面図" / before "作成日"/"縮尺val"

    // Vertical column dividers
    [col1, col2, col3, col4].forEach(cx => {
      this.layer.appendChild(Utils.createSVGElement('line', {
        x1: cx, y1: y, x2: cx, y2: y + blockHeight,
        stroke: Utils.COLORS.ink, 'stroke-width': sw
      }));
    });

    // Text vertical centering offset
    const vOff = fsLabel * 0.35;

    // === Row 1 (top): 設置場所 | サイト名 工事名 | 図面名称 | 平面図 ===
    const r1y = y + rowHeight / 2 + vOff;
    this._addText((x + col1) / 2, r1y, '設置場所', fsLabel, 'middle', S);
    const siteText = this.data.siteName ?
      `${this.data.siteName}　${this.data.projectName}` : '';
    this._addText((col1 + col2) / 2, r1y, siteText, fsLabel, 'middle', S);
    this._addText((col2 + col3) / 2, r1y, '図面名称', fsLabel, 'middle', S);
    this._addText((col3 + col4) / 2, r1y, this.data.drawingName, fsValue, 'middle', S, 'bold');

    // === Row 2 (bottom): 作成者 | 名前 | 縮尺 | A3:1/100 | 作成日 | 日付 ===
    const r2y = y + rowHeight + rowHeight / 2 + vOff;
    this._addText((x + col1) / 2, r2y, '作成者', fsLabel, 'middle', S);
    this._addText((col1 + col2) / 2, r2y, this.data.author, fsValue, 'middle', S);
    this._addText((col2 + col3) / 2, r2y, '縮尺', fsLabel, 'middle', S);
    this._addText((col3 + col4) / 2, r2y, this.data.scale, fsLabel, 'middle', S);
    this._addText((col4 + x + blockWidth) / 2, y + rowHeight / 2 + vOff, '作成日', fsLabel, 'middle', S);

    let dateStr = '';
    if (this.data.date) {
      const d = new Date(this.data.date);
      dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    this._addText((col4 + x + blockWidth) / 2, r2y, dateStr, fsLabel * 0.85, 'middle', S);
  }

  _addText(x, y, text, fontSize, anchor = 'start', S, weight = 'normal') {
    const el = Utils.createSVGElement('text', {
      x, y,
      'font-size': fontSize,
      fill: Utils.COLORS.ink,
      'font-family': 'Meiryo, sans-serif',
      'text-anchor': anchor === 'middle' ? 'middle' : anchor === 'end' ? 'end' : 'start',
      'font-weight': weight
    });
    el.textContent = text || '';
    this.layer.appendChild(el);
    return el;
  }

  isComplete() {
    return this.data.siteName && this.data.author && this.data.date;
  }
}
