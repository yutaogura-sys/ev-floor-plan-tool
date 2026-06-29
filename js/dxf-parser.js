// DXF Parser - Web Worker で解析。Worker が使えない環境（file:// 直接開き等、origin 'null'）
// では Worker 生成に失敗するため、メインスレッド解析（dxf-parse-core.js）へ自動フォールバックする。
class DXFParser {
  constructor() {
    this.worker = null;
    this.data = null;
  }

  parse(fileText) {
    return new Promise((resolve, reject) => {
      const overlay = document.getElementById('loading-overlay');
      const progressFill = document.getElementById('progress-fill');
      const loadingText = document.getElementById('loading-text');

      if (overlay) overlay.classList.remove('hidden');
      if (loadingText) loadingText.textContent = 'DXFファイルを解析中...';
      if (progressFill) progressFill.style.width = '0%';

      const ui = { overlay, progressFill, loadingText };

      let worker = null;
      try {
        worker = new Worker('js/dxf-worker.js');
      } catch (err) {
        // file:// など Worker を生成できない環境 → メインスレッドで解析
        console.warn('Worker を生成できないためメインスレッドで解析します:', err && err.message);
        this._parseOnMainThread(fileText, ui, resolve, reject);
        return;
      }

      let settled = false;
      this.worker = worker;

      worker.onmessage = (e) => {
        if (e.data.type === 'progress') {
          if (progressFill) progressFill.style.width = e.data.percent + '%';
          if (loadingText) loadingText.textContent = `DXFファイルを解析中... ${e.data.percent}%`;
        } else if (e.data.type === 'complete') {
          settled = true;
          if (progressFill) progressFill.style.width = '100%';
          if (loadingText) loadingText.textContent = '解析完了';
          setTimeout(() => overlay && overlay.classList.add('hidden'), 300);
          this.data = e.data.data;
          worker.terminate();
          this.worker = null;
          resolve(this.data);
        }
      };

      worker.onerror = (err) => {
        if (settled) return;
        // Worker スクリプトの読込/実行に失敗（importScripts 不可な環境等）→ メインスレッドへフォールバック
        console.warn('Worker 解析に失敗。メインスレッドで再試行します:', err && err.message);
        try { worker.terminate(); } catch (e) { /* noop */ }
        this.worker = null;
        this._parseOnMainThread(fileText, ui, resolve, reject);
      };

      worker.postMessage(fileText);
    });
  }

  // メインスレッド解析（dxf-parse-core.js の parseDXF を使用）。
  _parseOnMainThread(fileText, ui, resolve, reject) {
    if (typeof parseDXF !== 'function') {
      if (ui.overlay) ui.overlay.classList.add('hidden');
      reject(new Error('DXF解析モジュール(dxf-parse-core.js)が読み込まれていません'));
      return;
    }
    // 大きめのファイルでもUIを固めないよう次フレームで実行
    setTimeout(() => {
      try {
        const data = parseDXF(fileText, (pct) => {
          if (ui.progressFill) ui.progressFill.style.width = pct + '%';
          if (ui.loadingText) ui.loadingText.textContent = `DXFファイルを解析中... ${pct}%`;
        });
        if (ui.progressFill) ui.progressFill.style.width = '100%';
        if (ui.loadingText) ui.loadingText.textContent = '解析完了';
        setTimeout(() => ui.overlay && ui.overlay.classList.add('hidden'), 300);
        this.data = data;
        resolve(data);
      } catch (e) {
        if (ui.overlay) ui.overlay.classList.add('hidden');
        reject(e);
      }
    }, 0);
  }

  getData() {
    return this.data;
  }
}
