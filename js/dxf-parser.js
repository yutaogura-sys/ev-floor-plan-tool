// DXF Parser - Coordinates Web Worker for parsing
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

      overlay.classList.remove('hidden');
      loadingText.textContent = 'DXFファイルを解析中...';
      progressFill.style.width = '0%';

      this.worker = new Worker('js/dxf-worker.js');

      this.worker.onmessage = (e) => {
        if (e.data.type === 'progress') {
          progressFill.style.width = e.data.percent + '%';
          loadingText.textContent = `DXFファイルを解析中... ${e.data.percent}%`;
        } else if (e.data.type === 'complete') {
          progressFill.style.width = '100%';
          loadingText.textContent = '解析完了';
          setTimeout(() => overlay.classList.add('hidden'), 300);
          this.data = e.data.data;
          this.worker.terminate();
          this.worker = null;
          resolve(this.data);
        }
      };

      this.worker.onerror = (err) => {
        overlay.classList.add('hidden');
        this.worker.terminate();
        this.worker = null;
        reject(err);
      };

      this.worker.postMessage(fileText);
    });
  }

  getData() {
    return this.data;
  }
}
