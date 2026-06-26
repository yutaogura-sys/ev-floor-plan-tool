// Tool Manager - Manages active tool and delegates events
class ToolManager {
  constructor(viewport, svgEngine) {
    this.viewport = viewport;
    this.svgEngine = svgEngine;
    this.activeTool = 'select';
    this.tools = {};
    this.container = document.getElementById('canvas-container');

    this._initToolButtons();
    this._initCanvasEvents();
    this._initKeyboardShortcuts();
  }

  registerTool(name, tool) {
    this.tools[name] = tool;
  }

  setActiveTool(name) {
    if (this.tools[this.activeTool] && this.tools[this.activeTool].deactivate) {
      this.tools[this.activeTool].deactivate();
    }

    this.activeTool = name;

    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === name);
    });

    // Update status bar
    const toolNames = {
      'select': '選択', 'pan': '移動', 'charging-space': '充電スペース',
      'charger': '充電設備', 'dimension': '寸法線', 'boundary-rect': '囲み線',
      'road-marking': '路面表示',
      'wheel-stop': '車止め', 'bollard': '防護部材', 'lighting': '電灯',
      'foundation': '基礎', 'text': 'テキスト',
      'wire': '配線注記', 'equipment': '機器注記', 'conduit': '配管注記',
      'wiring-route': '配線ルート', 'cubicle': '分電盤', 'pole': '建柱',
      'handhole': 'ハンドホール', 'pullbox': 'プルボックス', 'existing-charger': '既設充電設備'
    };
    document.getElementById('status-tool').textContent = `ツール: ${toolNames[name] || name}`;

    // Update cursor
    const cursors = {
      'select': 'default', 'pan': 'grab',
      'charging-space': 'crosshair', 'charger': 'crosshair',
      'dimension': 'crosshair', 'road-marking': 'crosshair',
      'wheel-stop': 'crosshair', 'bollard': 'crosshair',
      'lighting': 'crosshair', 'foundation': 'crosshair',
      'text': 'text', 'boundary-rect': 'crosshair',
      'wire': 'crosshair', 'equipment': 'crosshair', 'conduit': 'crosshair',
      'wiring-route': 'crosshair', 'cubicle': 'crosshair', 'pole': 'crosshair',
      'handhole': 'crosshair', 'pullbox': 'crosshair', 'existing-charger': 'crosshair'
    };
    this.container.style.cursor = cursors[name] || 'crosshair';

    // Update figure layer indicator in status bar and canvas border
    const toolFigureMap = {
      'select': 'shared',
      'charging-space': 'plan', 'road-marking': 'plan', 'wheel-stop': 'plan',
      'bollard': 'plan', 'lighting': 'plan', 'foundation': 'plan',
      'wiring-route': 'route', 'cubicle': 'route', 'pole': 'route',
      'handhole': 'route', 'pullbox': 'route', 'existing-charger': 'route',
      'charger': 'shared', 'dimension': 'shared', 'boundary-rect': 'shared', 'text': 'shared',
      'wire': 'shared', 'equipment': 'shared', 'conduit': 'shared'
    };
    const figureLayer = toolFigureMap[name];
    const layerEl = document.getElementById('status-figure-layer');
    if (layerEl) {
      if (figureLayer) {
        const labels = { plan: '平面図専用', route: '配線ルート図専用', shared: '共通' };
        const colors = { plan: '#cc0000', route: '#ff6600', shared: '#0066cc' };
        layerEl.textContent = `レイヤー: ${labels[figureLayer]}`;
        layerEl.style.color = colors[figureLayer];
        layerEl.style.fontWeight = 'bold';
        this.container.style.borderTopColor = colors[figureLayer];
      } else {
        layerEl.textContent = '';
        this.container.style.borderTopColor = '';
      }
    }
    // Sync header layer toggle buttons
    const headerBtns = document.querySelectorAll('.layer-toggle-btn');
    headerBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layer === figureLayer);
    });

    if (this.tools[name] && this.tools[name].activate) {
      this.tools[name].activate();
    }
  }

  _initToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      // data-tool を持たない .tool-btn（例: 配線集計表ボタン）でツールを undefined にしない
      if (!btn.dataset.tool) return;
      btn.addEventListener('click', () => {
        this.setActiveTool(btn.dataset.tool);
      });
    });
  }

  _initCanvasEvents() {
    const svg = this.viewport.svg;

    svg.addEventListener('mousedown', (e) => {
      if (this.viewport.isPanning) return;
      const tool = this.tools[this.activeTool];
      if (tool && tool.onMouseDown) {
        const svgPoint = this.viewport.screenToSVG(e.clientX, e.clientY);
        tool.onMouseDown(svgPoint, e);
      }
    });

    svg.addEventListener('mousemove', (e) => {
      if (this.viewport.isPanning) return;
      const tool = this.tools[this.activeTool];
      if (tool && tool.onMouseMove) {
        const svgPoint = this.viewport.screenToSVG(e.clientX, e.clientY);
        tool.onMouseMove(svgPoint, e);
      }
    });

    svg.addEventListener('mouseup', (e) => {
      if (this.viewport.isPanning) return;
      const tool = this.tools[this.activeTool];
      if (tool && tool.onMouseUp) {
        const svgPoint = this.viewport.screenToSVG(e.clientX, e.clientY);
        tool.onMouseUp(svgPoint, e);
      }
    });

    svg.addEventListener('dblclick', (e) => {
      const tool = this.tools[this.activeTool];
      if (tool && tool.onDoubleClick) {
        const svgPoint = this.viewport.screenToSVG(e.clientX, e.clientY);
        tool.onDoubleClick(svgPoint, e);
      }
    });
  }

  _initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const keyMap = {
        'v': 'select', 'h': 'pan', 's': 'charging-space',
        'c': 'charger', 'd': 'dimension', 'm': 'road-marking',
        'w': 'wheel-stop', 'b': 'bollard', 'l': 'lighting',
        'f': 'foundation', 't': 'text',
        'r': 'wire', 'e': 'equipment', 'p': 'conduit',
        'g': 'wiring-route', 'k': 'cubicle', 'o': 'pole',
        'j': 'handhole', 'u': 'pullbox', 'x': 'existing-charger'
      };

      // Forward key events to active tool first
      const activeTool = this.tools[this.activeTool];
      if (activeTool && activeTool.onKeyDown) {
        activeTool.onKeyDown(e);
      }

      if (keyMap[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) {
        this.setActiveTool(keyMap[e.key.toLowerCase()]);
        e.preventDefault();
      }

      // Escape to select tool
      if (e.key === 'Escape') {
        this.setActiveTool('select');
        this.svgEngine.clearInteraction();
      }

      // Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectTool = this.tools['select'];
        if (selectTool && selectTool.deleteSelected) {
          selectTool.deleteSelected();
        }
      }

      // Ctrl+D duplicate selected
      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        const selectTool = this.tools['select'];
        if (selectTool && selectTool.duplicateSelected) {
          selectTool.duplicateSelected();
        }
        e.preventDefault();
      }

      // Undo/Redo は app.js の keydown（doUndo/doRedo、入力欄ガード付き）が担う
    });
  }
}
