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

  // ファイル名に使えない文字を除去（Windows禁止文字・制御文字・末尾ドット/空白）。
  // 物件名にスラッシュやコロンが含まれてもダウンロードが壊れないようにする。
  safeFilename(s) {
    return String(s == null ? '' : s)
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/[. ]+$/, '')
      .trim()
      .slice(0, 80) || 'untitled';
  },

  // Shift-JIS(CP932) エンコード。DXF(R12)を日本語CAD(Jw_cad/AutoCAD-JP)で開けるようにする。
  // 外部ライブラリ不要: TextDecoder('shift_jis') から char→bytes の逆引き表を一度だけ構築。
  _sjisMap: null,
  _buildSjisMap() {
    const dec = new TextDecoder('shift_jis', { fatal: false });
    const map = new Map();
    for (let b = 0; b <= 0x7f; b++) map.set(String.fromCharCode(b), [b]); // ASCII
    for (let b = 0xa1; b <= 0xdf; b++) { // 半角カナ
      const c = dec.decode(Uint8Array.from([b]));
      if (c && c !== '�') map.set(c, [b]);
    }
    const leads = [];
    for (let l = 0x81; l <= 0x9f; l++) leads.push(l);
    for (let l = 0xe0; l <= 0xfc; l++) leads.push(l);
    for (const l of leads) {
      for (let t = 0x40; t <= 0xfc; t++) {
        if (t === 0x7f) continue;
        const c = dec.decode(Uint8Array.from([l, t]));
        if (c && c.length === 1 && c !== '�' && !map.has(c)) map.set(c, [l, t]);
      }
    }
    return map;
  },
  // 文字列を Shift-JIS バイト列(Uint8Array)に変換。CP932に無い文字は '?'。
  encodeShiftJIS(str) {
    const s = String(str == null ? '' : str);
    if (typeof TextDecoder === 'undefined') {
      // TextDecoder非対応環境の保険（実用上は到達しない）
      return (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(s) : Uint8Array.from(s, c => c.charCodeAt(0) & 0xff);
    }
    if (!this._sjisMap) this._sjisMap = this._buildSjisMap();
    const map = this._sjisMap;
    const out = [];
    for (const ch of s) {
      const b = map.get(ch);
      if (b) { for (const x of b) out.push(x); }
      else { out.push(0x3f); } // '?'
    }
    return Uint8Array.from(out);
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

  // ステータスバーの操作ヒント（現在のツール/モードの使い方を案内）
  setStatusHint(text) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('status-hint');
    if (el) el.textContent = text ? `💡 ${text}` : '';
  },

  // 非ブロッキングのトースト通知
  toast(message, type = 'info') {
    if (typeof document === 'undefined') return; // Node環境では何もしない
    const el = document.createElement('div');
    const bg = type === 'error' ? '#c0392b' : '#333';
    el.style.cssText = `position:fixed;top:60px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.5s;`;
    // スクリーンリーダーに通知（エラーは assertive、それ以外は polite）
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 4000);
  },

  // 非ブロッキングのテキスト入力モーダル（native prompt の置換）。Promise<string|null> を返す。
  // opts: { title, value, placeholder, multiline }
  promptModal(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      if (typeof document === 'undefined') { resolve(null); return; }
      const overlay = document.createElement('div');
      overlay.className = 'prompt-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;color:#222;width:360px;max-width:92%;border-radius:8px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:Meiryo,sans-serif;font-size:13px;';
      const ml = !!opts.multiline;
      const fieldStyle = 'width:100%;padding:6px;box-sizing:border-box;';
      box.innerHTML =
        `<h3 style="margin:0 0 10px;font-size:15px;">${opts.title || '入力'}</h3>` +
        (ml
          ? `<textarea class="pm-input" style="${fieldStyle}min-height:70px;resize:vertical;"></textarea>`
          : `<input class="pm-input" type="text" placeholder="${opts.placeholder || ''}" style="${fieldStyle}">`) +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
        '<button class="pm-cancel" style="padding:7px 14px;border:1px solid #999;border-radius:4px;background:#f2f2f2;cursor:pointer;">キャンセル</button>' +
        '<button class="pm-ok" style="padding:7px 14px;border:none;border-radius:4px;background:#1a6ed8;color:#fff;cursor:pointer;">OK</button>' +
        '</div>';
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const input = box.querySelector('.pm-input');
      input.value = opts.value != null ? String(opts.value) : ''; // 属性ではなくプロパティで設定（エスケープ不要）
      input.focus();
      if (input.select) input.select();
      const close = (v) => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); resolve(v); };
      box.querySelector('.pm-ok').addEventListener('click', () => close(input.value));
      box.querySelector('.pm-cancel').addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
      box.addEventListener('keydown', (e) => {
        e.stopPropagation(); // キャンバス側へキーを伝播させない
        if (e.key === 'Enter' && !ml) { e.preventDefault(); close(input.value); }
        else if (e.key === 'Escape') { e.preventDefault(); close(null); }
      });
    });
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
