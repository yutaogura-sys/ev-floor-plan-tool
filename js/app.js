// Main Application - Initializes all components and manages state
class App {
  constructor() {
    this.state = {
      dxfData: null,
      surfaceType: 'アスファルト',
      annotations: [],
      undoStack: []
    };

    // Initialize components
    this.svgElement = document.getElementById('drawing-canvas');
    this.container = document.getElementById('canvas-container');

    this.svgEngine = new SVGEngine(this.svgElement);
    this.viewport = new Viewport(this.svgElement, this.container);
    this.layerManager = new LayerManager();
    this.dxfParser = new DXFParser();
    this.toolManager = new ToolManager(this.viewport, this.svgEngine);
    this.titleBlock = new TitleBlock(this.svgEngine);
    this.pdfExporter = new PDFExporter(this.svgEngine);
    this.pdfViewer = new PDFViewer();

    // Initialize symbols
    Symbols.init(this.svgElement);

    // Register tools
    this.toolManager.registerTool('select', new SelectTool(this.svgEngine, this.viewport));
    this.toolManager.registerTool('charging-space', new ChargingSpaceTool(this.svgEngine));
    this.toolManager.registerTool('charger', new ChargerTool(this.svgEngine));
    this.toolManager.registerTool('dimension', new DimensionTool(this.svgEngine));
    this.toolManager.registerTool('road-marking', new RoadMarkingTool(this.svgEngine));
    this.toolManager.registerTool('wheel-stop', new WheelStopTool(this.svgEngine));
    this.toolManager.registerTool('text', new TextTool(this.svgEngine));

    // Boundary rectangle tool
    this.toolManager.registerTool('boundary-rect', {
      svgEngine: this.svgEngine,
      onMouseDown(point, e) {
        if (e.button !== 0) return;
        const id = Utils.generateId();
        const el = this.svgEngine.createBoundaryRect(id, point.x, point.y, 10.8, 5.2, '#0066cc');
        if (typeof app !== 'undefined') {
          app.toolManager.setActiveTool('select');
          app.toolManager.tools.select.selectElement(el);
          if (app.updateChecklist) app.updateChecklist();
        }
      }
    });

    // Leader annotation tools (wire/equipment/conduit)
    this.toolManager.registerTool('wire', new LeaderTool(this.svgEngine, 'wire', '#cc6600', '配線仕様を入力 (例: WL1 8sq 5m×2)'));
    this.toolManager.registerTool('equipment', new LeaderTool(this.svgEngine, 'equipment', '#009933', '機器名称を入力 (例: P.BOX 5個)'));
    this.toolManager.registerTool('conduit', new LeaderTool(this.svgEngine, 'conduit', '#0066cc', '配管仕様を入力 (例: FEP 28)'));

    // Wiring route diagram tools
    this.toolManager.registerTool('wiring-route', new WiringRouteTool(this.svgEngine));
    this.toolManager.registerTool('cubicle', {
      svgEngine: this.svgEngine,
      onMouseDown(point, e) {
        if (e.button !== 0) return;
        const id = Utils.generateId();
        const el = this.svgEngine.createCubicle(id, point.x, point.y, 1.0, 0.6, '分電盤');
        if (typeof app !== 'undefined') {
          app.toolManager.setActiveTool('select');
          app.toolManager.tools.select.selectElement(el);
          if (app.updateChecklist) app.updateChecklist();
        }
      }
    });
    this.toolManager.registerTool('pole', {
      svgEngine: this.svgEngine,
      onMouseDown(point, e) {
        if (e.button !== 0) return;
        const id = Utils.generateId();
        const el = this.svgEngine.createPole(id, point.x, point.y, 'コンクリート', '8m');
        if (typeof app !== 'undefined') {
          app.toolManager.setActiveTool('select');
          app.toolManager.tools.select.selectElement(el);
          if (app.updateChecklist) app.updateChecklist();
        }
      }
    });
    this.toolManager.registerTool('handhole', {
      svgEngine: this.svgEngine,
      onMouseDown(point, e) {
        if (e.button !== 0) return;
        const id = Utils.generateId();
        this.svgEngine.createHandhole(id, point.x, point.y);
        if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
      }
    });
    this.toolManager.registerTool('pullbox', {
      svgEngine: this.svgEngine,
      onMouseDown(point, e) {
        if (e.button !== 0) return;
        const id = Utils.generateId();
        const el = this.svgEngine.createPullBox(id, point.x, point.y, '200', 'SUS');
        if (typeof app !== 'undefined') {
          app.toolManager.setActiveTool('select');
          app.toolManager.tools.select.selectElement(el);
          if (app.updateChecklist) app.updateChecklist();
        }
      }
    });
    this.toolManager.registerTool('existing-charger', {
      svgEngine: this.svgEngine,
      onMouseDown(point, e) {
        if (e.button !== 0) return;
        const id = Utils.generateId();
        const el = this.svgEngine.createExistingCharger(id, point.x, point.y, 0, '');
        if (typeof app !== 'undefined') {
          app.toolManager.setActiveTool('select');
          app.toolManager.tools.select.selectElement(el);
          if (app.updateChecklist) app.updateChecklist();
        }
      }
    });

    // Pan tool (no dedicated class needed)
    this.toolManager.registerTool('pan', {
      activate() {},
      deactivate() {}
    });

    // Foundation tool
    this.toolManager.registerTool('foundation', {
      svgEngine: this.svgEngine,
      onMouseDown(point, e) {
        if (e.button !== 0) return;
        const id = Utils.generateId();
        // Default: 500x500x500mm = 0.5x0.5x0.5 in DXF units
        this.svgEngine.createFoundation(id, point.x, point.y, 0.5, 0.5, 0.5, 'コンクリート');
        if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
      }
    });

    // Bollard tool
    this.toolManager.registerTool('bollard', {
      svgEngine: this.svgEngine,
      onMouseDown(point, e) {
        if (e.button !== 0) return;
        const id = Utils.generateId();
        this.svgEngine.createBollard(id, point.x, point.y);
        if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
      }
    });

    // Lighting tool
    this.toolManager.registerTool('lighting', {
      svgEngine: this.svgEngine,
      onMouseDown(point, e) {
        if (e.button !== 0) return;
        const id = Utils.generateId();
        this.svgEngine.createLighting(id, point.x, point.y);
        if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
      }
    });

    // Bind file inputs
    this._bindFileInputs();

    // Bind dual export buttons (PDF) — 出力前に要件チェック（#2）
    document.getElementById('btn-export-plan').addEventListener('click', async () => {
      if (await this._checkBeforeExport('plan')) this.pdfExporter.exportPDF('plan');
    });
    document.getElementById('btn-export-route').addEventListener('click', async () => {
      if (await this._checkBeforeExport('route')) this.pdfExporter.exportPDF('route');
    });

    // Bind DXF export buttons
    this.dxfExporter = new DXFExporter(this.svgEngine);
    document.getElementById('btn-export-plan-dxf').addEventListener('click', () => {
      this.dxfExporter.exportDXF('plan');
    });
    document.getElementById('btn-export-route-dxf').addEventListener('click', () => {
      this.dxfExporter.exportDXF('route');
    });

    // Header layer toggle buttons
    document.querySelectorAll('.layer-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = btn.dataset.layer;
        // Map layer to a default tool in that layer
        const layerDefaults = {
          'shared': 'select',
          'plan': 'charging-space',
          'route': 'wiring-route'
        };
        const toolName = layerDefaults[layer] || 'select';
        this.toolManager.setActiveTool(toolName);
      });
    });

    // Initialize figure layer manager
    this.figureLayerManager = new FigureLayerManager();
    this.figureLayerManager.init();

    // Initialize PDF viewer
    this.pdfViewer.init();

    // Initialize export boundary preview
    this.exportBoundary = new ExportBoundaryPreview();
    this.exportBoundary.startTracking();
    const boundaryCheckbox = document.getElementById('fig-layer-boundary');
    if (boundaryCheckbox) {
      boundaryCheckbox.addEventListener('change', () => {
        this.exportBoundary.toggle(boundaryCheckbox.checked);
      });
    }
    // "範囲表示" button — force show and enable checkbox
    const showBoundaryBtn = document.getElementById('btn-show-boundary');
    if (showBoundaryBtn) {
      showBoundaryBtn.addEventListener('click', () => {
        this.exportBoundary.visible = true;
        if (boundaryCheckbox) boundaryCheckbox.checked = true;
        this.exportBoundary.update();
      });
    }

    // Initialize wiring summary
    this.wiringSummary = new WiringSummary(this.svgEngine);

    // Bind wiring summary button
    const summaryBtn = document.getElementById('btn-wiring-summary');
    if (summaryBtn) {
      summaryBtn.addEventListener('click', () => {
        this.wiringSummary.generateAutoPlaced();
      });
    }

    // Initialize PDF auto-reader
    this.pdfAutoReader = new PDFAutoReader(this.svgEngine, this.pdfViewer);
    // 候補レビュー用モーダル（自動読取/将来のAI結果で共用）
    this.reviewPanel = new ReviewPanel();

    // AI読取（ラフ図のClaude vision解析）
    this.aiReader = new AIReader(this.svgEngine, this.pdfViewer, this.reviewPanel, this.pdfAutoReader);
    const aiBtn = document.getElementById('btn-ai-read');
    if (aiBtn) aiBtn.addEventListener('click', () => this.aiReader.run());

    // Panel collapse toggling
    document.querySelectorAll('.panel-title').forEach(title => {
      title.addEventListener('click', () => {
        const contentId = title.dataset.collapse;
        const content = document.getElementById(contentId);
        if (content) {
          content.classList.toggle('collapsed');
          title.classList.toggle('collapsed');
        }
      });
    });

    // Set default viewbox
    this.svgElement.setAttribute('viewBox', '-100 -100 200 200');

    // 履歴（Undo/Redo）
    this._restoring = false; // restore中はupdateChecklistでの履歴記録を抑制
    this.history = new History(50);
    this.history.reset(StateSerializer.snapshot(this.svgEngine));
    this._bindHistoryControls();

    // 詳細ラベル表示トグル（OFFで説明系ラベルを画面上のみ非表示）
    const detailToggle = document.getElementById('toggle-detail-labels');
    if (detailToggle) {
      detailToggle.addEventListener('change', () => {
        this.svgElement.classList.toggle('labels-hidden', !detailToggle.checked);
      });
    }

    this._offerRestore();

    console.log('EV充電設備 平面図作成ツール initialized');
  }

  _bindFileInputs() {
    // DXF file input
    const dxfInput = document.getElementById('file-dxf');
    dxfInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      document.getElementById('dxf-name').textContent = file.name;
      document.getElementById('dxf-name').classList.add('loaded');

      try {
        const text = await file.text();
        const dxfData = await this.dxfParser.parse(text);
        this.state.dxfData = dxfData;
        this._onDXFLoaded(dxfData);
      } catch (err) {
        console.error('DXF parse error:', err);
        Utils.toast('DXFファイルの読み込みに失敗しました: ' + err.message, 'error');
      }
    });

    // Sketch PDF file input
    const sketchInput = document.getElementById('file-sketch');
    sketchInput.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files.length) return;

      const names = Array.from(files).map(f => f.name).join(', ');
      document.getElementById('sketch-names').textContent = names;
      document.getElementById('sketch-names').classList.add('loaded');

      for (const file of files) {
        await this.pdfViewer.loadPDF(file);
      }
    });

    // Drag and drop support
    const dropzones = [
      { el: document.getElementById('dropzone-dxf'), type: 'dxf' },
      { el: document.getElementById('dropzone-sketch'), type: 'sketch' }
    ];

    dropzones.forEach(({ el, type }) => {
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.style.background = 'rgba(74,158,255,0.2)';
      });
      el.addEventListener('dragleave', () => {
        el.style.background = '';
      });
      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        el.style.background = '';
        const files = e.dataTransfer.files;
        if (type === 'dxf' && files[0]) {
          document.getElementById('file-dxf').files = files;
          document.getElementById('file-dxf').dispatchEvent(new Event('change'));
        } else if (type === 'sketch') {
          document.getElementById('file-sketch').files = files;
          document.getElementById('file-sketch').dispatchEvent(new Event('change'));
        }
      });
    });
  }

  _onDXFLoaded(dxfData) {
    // Render DXF geometry
    this.svgEngine.renderDXF(dxfData);

    // Initialize layers
    this.layerManager.init(dxfData);

    // Set viewport bounds and fit — prefer EV_ annotation layer bounds if present
    this.viewport.setBounds(dxfData.bounds);
    const evBounds = this._computeEVLayerBounds(dxfData);
    if (evBounds) {
      this.viewport.fitToExtents(evBounds);
    } else {
      this.viewport.fitToExtents();
    }

    // Render title block
    this.titleBlock.render({
      minX: dxfData.bounds.minX,
      maxX: dxfData.bounds.maxX,
      minY: -dxfData.bounds.maxY,
      maxY: -dxfData.bounds.minY
    });

    // Enable export buttons
    document.getElementById('btn-export-plan').disabled = false;
    document.getElementById('btn-export-route').disabled = false;
    document.getElementById('btn-export-plan-dxf').disabled = false;
    document.getElementById('btn-export-route-dxf').disabled = false;

    // Show export boundary preview after DXF load
    if (this.exportBoundary) {
      setTimeout(() => this.exportBoundary.update(), 100);
    }

    // Log stats
    let totalPolylines = 0;
    let totalVertices = 0;
    for (const layer of Object.values(dxfData.layers)) {
      totalPolylines += (layer.polylines || []).length;
      for (const pl of (layer.polylines || [])) {
        totalVertices += pl.vertices.length;
      }
    }
    console.log(`DXF loaded: ${Object.keys(dxfData.layers).length} layers, ${totalPolylines} polylines, ${totalVertices} vertices`);

    // Try to extract site name from filename
    const dxfName = document.getElementById('dxf-name').textContent;
    if (dxfName && dxfName !== '未選択') {
      // Extract from filename like "○○県...（○○モール △△店）.dxf"
      const match = dxfName.match(/（(.+?)）/);
      if (match) {
        const siteNameInput = document.getElementById('tb-site-name');
        if (siteNameInput && !siteNameInput.value) {
          siteNameInput.value = match[1];
          this.titleBlock.data.siteName = match[1];
          this.titleBlock.render();
        }
      }
    }
  }

  // Compute bounds from EV_ annotation layers in imported DXF (for centering)
  _computeEVLayerBounds(dxfData) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasEV = false;

    for (const [layerName, layerData] of Object.entries(dxfData.layers)) {
      if (!layerName.startsWith('EV_')) continue;
      hasEV = true;
      for (const pl of (layerData.polylines || [])) {
        for (const v of pl.vertices) {
          if (v.x < minX) minX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.x > maxX) maxX = v.x;
          if (v.y > maxY) maxY = v.y;
        }
      }
      for (const ln of (layerData.lines || [])) {
        if (ln.x1 < minX) minX = ln.x1;
        if (ln.y1 < minY) minY = ln.y1;
        if (ln.x2 < minX) minX = ln.x2;
        if (ln.y2 < minY) minY = ln.y2;
        if (ln.x1 > maxX) maxX = ln.x1;
        if (ln.y1 > maxY) maxY = ln.y1;
        if (ln.x2 > maxX) maxX = ln.x2;
        if (ln.y2 > maxY) maxY = ln.y2;
      }
      for (const t of (layerData.texts || [])) {
        if (t.x < minX) minX = t.x;
        if (t.y < minY) minY = t.y;
        if (t.x > maxX) maxX = t.x;
        if (t.y > maxY) maxY = t.y;
      }
    }

    if (!hasEV || !isFinite(minX)) return null;
    // Add padding (30% of content size, min 20m to show surrounding context)
    const w = maxX - minX;
    const h = maxY - minY;
    const pad = Math.max(Math.max(w, h) * 0.3, 20);
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  // Update subsidy requirements checklist
  updateChecklist() {
    const records = StateSerializer.serializeAnnotations(this.svgEngine);
    const results = RequirementValidator.validate(records, { titleBlockComplete: this.titleBlock.isComplete() });

    const ICONS = { ok: '✔', warn: '⚠', missing: '○', na: '–' };
    for (const [req, res] of Object.entries(results)) {
      const li = document.querySelector(`[data-req="${req}"]`);
      if (!li) continue;
      const icon = li.querySelector('.check-icon');
      if (icon) icon.textContent = ICONS[res.status] || '○';
      li.classList.toggle('satisfied', res.status === 'ok');
      li.classList.toggle('req-warn', res.status === 'warn');
      // メッセージ（warn/missing のみ）
      li.title = res.message || '';
      let msgEl = li.querySelector('.req-msg');
      if (res.status === 'warn' && res.message) {
        if (!msgEl) {
          msgEl = document.createElement('span');
          msgEl.className = 'req-msg';
          li.appendChild(msgEl);
        }
        msgEl.textContent = res.message;
      } else if (msgEl) {
        msgEl.remove();
      }
    }

    // Update export boundary preview when annotations change
    if (this.exportBoundary) {
      this.exportBoundary.update();
    }

    // 注釈の変化を検知して履歴に記録（restore中とredo履歴の同一スナップショットは抑制）
    if (this.history && !this._restoring) {
      const snap = StateSerializer.snapshot(this.svgEngine);
      if (snap !== this.history.stack[this.history.index]) {
        this.history.record(snap);
        this._updateHistoryButtons();
      }
    }
    this._scheduleAutosave();
  }

  // ===== 出力前要件チェック（#2） =====
  // 対象グループ(plan|route)の必須未充足/確認推奨があれば確認ダイアログを表示。
  // 戻り値 Promise<boolean>（true=出力続行 / false=中止）。検証失敗時は妨げない。
  _checkBeforeExport(group) {
    let results;
    try {
      const records = StateSerializer.serializeAnnotations(this.svgEngine);
      results = RequirementValidator.validate(records, { titleBlockComplete: this.titleBlock.isComplete() });
    } catch (e) {
      return Promise.resolve(true);
    }
    const summary = RequirementValidator.summarizeForExport(results, group);
    if (summary.missing.length === 0 && summary.warn.length === 0) return Promise.resolve(true);
    const toItem = (id) => ({ label: this._reqLabel(id), message: (results[id] && results[id].message) || '' });
    return this._confirmExportModal({
      group,
      missing: summary.missing.map(toItem),
      warn: summary.warn.map(toItem)
    });
  }

  // チェックリストの <li data-req> から人間可読ラベルを取得（アイコン/メッセージ除去）
  _reqLabel(id) {
    const li = document.querySelector('[data-req="' + id + '"]');
    if (!li) return id;
    const clone = li.cloneNode(true);
    clone.querySelectorAll('.check-icon, .req-msg').forEach((e) => e.remove());
    return clone.textContent.trim();
  }

  // 確認ダイアログ（ReviewPanel と同様のオーバーレイ）。Promise<boolean> を返す。
  _confirmExportModal({ group, missing, warn }) {
    return new Promise((resolve) => {
      const groupName = group === 'route' ? '配線ルート図' : '平面図';
      const overlay = document.createElement('div');
      overlay.className = 'export-check-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;color:#222;max-width:480px;width:90%;max-height:80vh;overflow:auto;border-radius:8px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:Meiryo,sans-serif;';
      const li = (it) => `<li style="margin:4px 0;"><b>${it.label}</b>${it.message ? ' — ' + it.message : ''}</li>`;
      let html = `<h3 style="margin:0 0 12px;font-size:16px;">${groupName}の出力前チェック</h3>`;
      if (missing.length) {
        html += `<p style="color:#c00;font-weight:bold;margin:8px 0 4px;">未充足の必須項目（${missing.length}）</p>`;
        html += `<ul style="margin:0 0 8px;padding-left:20px;color:#c00;">${missing.map(li).join('')}</ul>`;
      }
      if (warn.length) {
        html += `<p style="color:#b07000;font-weight:bold;margin:8px 0 4px;">確認推奨（${warn.length}）</p>`;
        html += `<ul style="margin:0 0 12px;padding-left:20px;color:#b07000;">${warn.map(li).join('')}</ul>`;
      }
      html += `<p style="font-size:13px;color:#555;margin:8px 0 16px;">このまま出力できますが、補助金要件を満たさない可能性があります。</p>`;
      html += `<div style="display:flex;gap:8px;justify-content:flex-end;"><button class="ec-cancel" style="padding:8px 16px;border:1px solid #999;border-radius:4px;background:#f2f2f2;cursor:pointer;">キャンセル</button><button class="ec-proceed" style="padding:8px 16px;border:none;border-radius:4px;background:#1a6ed8;color:#fff;cursor:pointer;">このまま出力</button></div>`;
      box.innerHTML = html;
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const close = (val) => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); resolve(val); };
      box.querySelector('.ec-cancel').addEventListener('click', () => close(false));
      box.querySelector('.ec-proceed').addEventListener('click', () => close(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    });
  }

  // ===== 履歴（Undo/Redo） =====
  _bindHistoryControls() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.addEventListener('click', () => this.doUndo());
    if (redoBtn) redoBtn.addEventListener('click', () => this.doRedo());

    document.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      // フォーム入力中はブラウザ標準のテキストUndoを優先する
      if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); this.doUndo(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); this.doRedo(); }
    });
    const saveBtn = document.getElementById('btn-save-project');
    const openBtn = document.getElementById('btn-open-project');
    const openInput = document.getElementById('file-open-project');
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveProject());
    if (openBtn && openInput) openBtn.addEventListener('click', () => openInput.click());
    if (openInput) openInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      this.openProjectFile(f);
      e.target.value = '';
    });
    this._updateHistoryButtons();
  }

  pushHistory() {
    this.history.record(StateSerializer.snapshot(this.svgEngine));
    this._updateHistoryButtons();
  }

  doUndo() {
    const snap = this.history.undo();
    if (snap === null) return;
    this._restoring = true;
    StateSerializer.restore(this.svgEngine, snap);
    this.updateChecklist();
    this._restoring = false;
    this._updateHistoryButtons();
  }

  doRedo() {
    const snap = this.history.redo();
    if (snap === null) return;
    this._restoring = true;
    StateSerializer.restore(this.svgEngine, snap);
    this.updateChecklist();
    this._restoring = false;
    this._updateHistoryButtons();
  }

  _updateHistoryButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = !this.history.canUndo();
    if (redoBtn) redoBtn.disabled = !this.history.canRedo();
  }

  // ===== 保存 / 読込 =====
  _currentDxfName() {
    const el = document.getElementById('dxf-name');
    const v = el ? el.textContent : '';
    return (v && v !== '未選択') ? v : null;
  }

  saveProject() {
    const tbData = (this.titleBlock && this.titleBlock.data) ? this.titleBlock.data : {};
    const viewBox = this.svgElement.getAttribute('viewBox');
    const state = StateSerializer.serializeProject(this.svgEngine, tbData, viewBox, this._currentDxfName());
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const site = (tbData.siteName || 'project').replace(/[\\/:*?"<>|]/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${site}_${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async openProjectFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const state = JSON.parse(text);
      const { titleBlock, viewBox } = StateSerializer.deserializeProject(this.svgEngine, state);
      // タイトルブロック復元
      if (this.titleBlock && titleBlock) {
        Object.assign(this.titleBlock.data, titleBlock);
        this.titleBlock.render();
      }
      // viewBox復元
      if (viewBox) this.svgElement.setAttribute('viewBox', viewBox);
      this.updateChecklist();
      // 履歴を初期化
      this.history.reset(StateSerializer.snapshot(this.svgEngine));
      this._updateHistoryButtons();
      Utils.toast('プロジェクトを読み込みました。DXF/参照PDFは別途再読込してください。');
    } catch (err) {
      console.error('プロジェクト読込エラー:', err);
      Utils.toast('プロジェクトファイルの読み込みに失敗しました: ' + err.message, 'error');
    }
  }

  // ===== 自動保存（localStorage） =====
  _scheduleAutosave() {
    clearTimeout(this._autosaveTimer);
    this._autosaveTimer = setTimeout(() => this._autosave(), 1000);
  }

  _autosave() {
    try {
      const tbData = (this.titleBlock && this.titleBlock.data) ? this.titleBlock.data : {};
      const viewBox = this.svgElement.getAttribute('viewBox');
      const state = StateSerializer.serializeProject(this.svgEngine, tbData, viewBox, this._currentDxfName());
      localStorage.setItem('ev-floorplan-autosave', JSON.stringify(state));
    } catch (err) {
      console.warn('自動保存に失敗（容量超過の可能性）:', err.message);
    }
  }

  _offerRestore() {
    let raw;
    try { raw = localStorage.getItem('ev-floorplan-autosave'); } catch (e) { return; }
    if (!raw) return;
    let state;
    try { state = JSON.parse(raw); } catch (e) { return; }
    const count = (state.annotations || []).length;
    if (count === 0) return;
    const when = state.savedAt ? new Date(state.savedAt).toLocaleString('ja-JP') : '不明';
    if (confirm(`前回の作業（注釈${count}件 / ${when}）を復元しますか？`)) {
      const { titleBlock, viewBox } = StateSerializer.deserializeProject(this.svgEngine, state);
      if (this.titleBlock && titleBlock) { Object.assign(this.titleBlock.data, titleBlock); this.titleBlock.render(); }
      if (viewBox) this.svgElement.setAttribute('viewBox', viewBox);
      this.updateChecklist();
      this.history.reset(StateSerializer.snapshot(this.svgEngine));
      this._updateHistoryButtons();
    } else {
      // 復元を断ったら古い自動保存を消し、次回起動時に再度尋ねないようにする
      try { localStorage.removeItem('ev-floorplan-autosave'); } catch (e) { /* ignore */ }
    }
  }
}

// Initialize application when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new App();
});
