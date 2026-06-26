// Utility functions
const Utils = {
  // Generate unique ID
  generateId() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
  },

  // Distance between two points
  distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  },

  // Snap value to grid
  snapToGrid(value, gridSize) {
    return Math.round(value / gridSize) * gridSize;
  },

  // Clamp value
  clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  },

  // 用紙サイズ（横置き mm）。出力範囲プレビューとPDF出力の単一の真実の源。
  PAPER: {
    A3: { w: 420, h: 297, format: 'a3' },
    A4: { w: 297, h: 210, format: 'a4' }
  },
  paperDims(name) {
    return this.PAPER[name] || this.PAPER.A3;
  },

  // Create SVG element with attributes
  createSVGElement(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, val] of Object.entries(attrs)) {
      el.setAttribute(key, val);
    }
    return el;
  },

  // Format mm dimension display
  formatDimension(valueMm) {
    if (valueMm >= 1000) {
      const m = Math.floor(valueMm / 1000);
      const mm = Math.round(valueMm % 1000);
      if (mm === 0) return `${m},000`;
      return `${valueMm.toLocaleString()}`;
    }
    return `${Math.round(valueMm)}`;
  },

  // Convert DXF units to mm (assuming DXF units are in meters)
  dxfToMm(value) {
    return value * 1000;
  },

  // Convert mm to DXF units
  mmToDxf(value) {
    return value / 1000;
  },

  // A3 paper dimensions in mm
  A3: {
    width: 420,
    height: 297
  },

  // Default scale factor
  SCALE: 100, // 1:100

  // 色の単一の真実の源（SSOT）。値は現行レンダリングと一致させており、各モジュールは
  // 段階的にこの定数を参照するよう移行する（リテラル散在の解消）。
  COLORS: {
    // 下図レイヤー（svg-engine の _layerColors で使用）
    road: '#888888',
    building: '#333333',
    structure: '#666666',
    center: '#cccccc',
    // 注釈/要素の意味色（実際の描画値に一致）
    evRed: '#cc0000',   // 充電器・充電スペース枠・EVマーク・配線ルート 等
    green: '#009933',   // 路面表示・引き出し線 等
    blue: '#0066cc',    // 寸法・プルボックス・囲み線 等
    brown: '#663300',   // 配管注記
    ink: '#333',        // 基礎・テキスト・寸法本体 等の濃灰
    orange: '#cc6600',  // 電灯
    gray: '#666666',
    selection: '#4a9eff'
  },

  // Point in rect test
  pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  },

  /**
   * Parse scale string and extract the scale denominator N
   * Supported formats: "A3:1/100", "1/100", "1:100", "100"
   * @param {string} scaleStr
   * @returns {number|null} Scale value (e.g. 100) or null
   */
  parseScale(scaleStr) {
    if (!scaleStr) return null;
    // "A3:1/100" → remove prefix before first colon → "1/100"
    const cleaned = scaleStr.replace(/^[^:]*:/, '').trim();
    // "1/100" or "1:100"
    const match = cleaned.match(/1[\/:](\d+)/);
    if (match) return parseInt(match[1]);
    // Plain number like "100"
    const num = parseInt(cleaned);
    return (num > 1 && !isNaN(num)) ? num : null;
  },

  // 非ブロッキングのトースト通知
  toast(message, type = 'info') {
    if (typeof document === 'undefined') return; // Node環境では何もしない
    const el = document.createElement('div');
    const bg = type === 'error' ? '#c0392b' : '#333';
    el.style.cssText = `position:fixed;top:60px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.5s;`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 4000);
  },

  // Get bounding box of points
  getBoundingBox(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
