// PDF Viewer - Display rough sketch PDFs as reference thumbnails + SVG canvas overlay
class PDFViewer {
  constructor() {
    this.pdfs = [];
    this.overlays = []; // Active PDF overlay elements on SVG canvas
    this.thumbnailContainer = document.getElementById('pdf-thumbnails');
    this.modalCanvas = document.getElementById('pdf-modal-canvas');
    this.currentPdf = null;
    this.currentPage = 1;
    this.pdfjsLib = null;
    this.overlayIdCounter = 0;

    this._initModal();
  }

  async init() {
    // Dynamic import of pdf.js
    try {
      this.pdfjsLib = await import('../lib/pdf.min.mjs');
      this.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.mjs';
    } catch (e) {
      console.warn('pdf.js not available, PDF preview disabled:', e.message);
    }
  }

  async loadPDF(file) {
    if (!this.pdfjsLib) {
      this._addPlaceholderThumb(file.name);
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await this.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pdfInfo = { pdf, name: file.name, numPages: pdf.numPages };
      this.pdfs.push(pdfInfo);

      // Render first page thumbnail
      await this._renderThumbnail(pdfInfo);
    } catch (e) {
      console.error('Failed to load PDF:', e);
      this._addPlaceholderThumb(file.name + ' (読み込みエラー)');
    }
  }

  async _renderThumbnail(pdfInfo) {
    // Remove placeholder text
    const placeholder = this.thumbnailContainer.querySelector('.placeholder-text');
    if (placeholder) placeholder.remove();

    const page = await pdfInfo.pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.3 });

    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'pdf-thumb';
    thumbDiv.title = pdfInfo.name;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.background = '#f0f0f0';
    const ctx = canvas.getContext('2d');

    // Render thumbnail with timeout - complex PDFs may be very slow
    try {
      const renderTask = page.render({ canvasContext: ctx, viewport });
      const timeoutMs = 8000;
      await Promise.race([
        renderTask.promise,
        new Promise((_, reject) => setTimeout(() => {
          renderTask.cancel();
          reject(new Error('timeout'));
        }, timeoutMs))
      ]);
    } catch (e) {
      // Render failed or timed out - show placeholder
      console.warn('Thumbnail render skipped (slow PDF):', pdfInfo.name);
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#999';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📄 ' + pdfInfo.name, canvas.width / 2, canvas.height / 2);
      ctx.fillText('(プレビュー省略)', canvas.width / 2, canvas.height / 2 + 16);
    }

    const label = document.createElement('div');
    label.className = 'thumb-label';
    label.textContent = pdfInfo.name;

    // Overlay button - places PDF on SVG canvas
    const overlayBtn = document.createElement('button');
    overlayBtn.className = 'overlay-btn';
    overlayBtn.textContent = '📌 配置';
    overlayBtn.title = 'キャンバスにオーバーレイ配置';
    overlayBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.addOverlayToCanvas(pdfInfo, 1);
      overlayBtn.textContent = '✅ 配置済';
      overlayBtn.disabled = true;
    });

    // Auto-read button - extracts text directly from PDF
    const autoReadBtn = document.createElement('button');
    autoReadBtn.className = 'overlay-btn';
    autoReadBtn.style.right = '5px';
    autoReadBtn.style.top = '30px';
    autoReadBtn.style.background = '#4a9eff';
    autoReadBtn.textContent = '📋 読取';
    autoReadBtn.title = 'テキスト自動読取';
    autoReadBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (typeof app === 'undefined' || !app.pdfAutoReader) return;
      autoReadBtn.disabled = true;
      autoReadBtn.textContent = '⏳...';
      try {
        const idx = this.pdfs.indexOf(pdfInfo);
        await app.pdfAutoReader.extractDirect(idx, 1);
        autoReadBtn.textContent = '✅ 完了';
      } catch (err) {
        console.error('Auto-read error:', err);
        autoReadBtn.textContent = '❌';
        console.error('自動読取エラー:', err.message);
      }
    });

    thumbDiv.appendChild(canvas);
    thumbDiv.appendChild(label);
    thumbDiv.appendChild(overlayBtn);
    thumbDiv.appendChild(autoReadBtn);

    // Click canvas area to open modal
    canvas.addEventListener('click', () => this._openModal(pdfInfo));

    this.thumbnailContainer.appendChild(thumbDiv);
  }

  // ========== SVG Canvas Overlay ==========

  async addOverlayToCanvas(pdfInfo, pageNum = 1) {
    const page = await pdfInfo.pdf.getPage(pageNum);

    // Render at moderate scale - cap canvas size to avoid memory/hang issues
    const baseViewport = page.getViewport({ scale: 1.0 });
    const maxDim = 1200; // Cap canvas size for performance
    const maxScale = Math.min(1.5, maxDim / Math.max(baseViewport.width, baseViewport.height));
    const renderScale = Math.max(0.5, maxScale);
    const viewport = page.getViewport({ scale: renderScale });

    console.log(`PDF overlay render: ${Math.round(viewport.width)}x${Math.round(viewport.height)} at scale ${renderScale.toFixed(2)}`);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convert to data URL (JPEG for smaller size)
    const dataURL = canvas.toDataURL('image/jpeg', 0.85);
    console.log(`PDF overlay dataURL length: ${dataURL.length}`);

    // Compute initial size in DXF units (meters)
    // PDF points: 72pt/inch. At renderScale=2, viewport pixels = points * 2
    // We want the image to span a reasonable area on the DXF canvas
    // Default: make the image ~30m wide (typical parking lot area)
    const pdfWidthPt = viewport.width / renderScale;
    const pdfHeightPt = viewport.height / renderScale;
    const aspectRatio = pdfHeightPt / pdfWidthPt;

    const imgWidthDXF = 30; // 30 meters initial width
    const imgHeightDXF = imgWidthDXF * aspectRatio;

    // Position at center of current viewBox
    const svgEl = document.getElementById('drawing-canvas');
    const vb = svgEl.getAttribute('viewBox');
    let cx = 0, cy = 0;
    if (vb) {
      const parts = vb.split(/\s+/).map(Number);
      cx = parts[0] + parts[2] / 2;
      cy = parts[1] + parts[3] / 2;
    }

    const id = `pdf-overlay-${++this.overlayIdCounter}`;

    // Create SVG group with transform
    const ns = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('data-id', id);
    group.setAttribute('data-type', 'pdf-overlay');
    group.setAttribute('data-x', cx);
    group.setAttribute('data-y', cy);
    group.setAttribute('data-width', imgWidthDXF);
    group.setAttribute('data-height', imgHeightDXF);
    group.setAttribute('data-rotation', '0');
    group.setAttribute('data-scale', '1');
    group.setAttribute('data-opacity', '0.5');
    group.setAttribute('data-name', pdfInfo.name);
    group.setAttribute('opacity', '0.5');

    // Build transform: translate to center, then offset to top-left of image
    this._updateOverlayTransform(group);

    // SVG <image> element
    const img = document.createElementNS(ns, 'image');
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataURL);
    img.setAttribute('width', imgWidthDXF);
    img.setAttribute('height', imgHeightDXF);
    img.setAttribute('x', -imgWidthDXF / 2);
    img.setAttribute('y', -imgHeightDXF / 2);
    img.setAttribute('preserveAspectRatio', 'none');

    group.appendChild(img);

    // Add to overlay layer
    const overlayLayer = document.getElementById('pdf-overlay-layer');
    overlayLayer.appendChild(group);

    this.overlays.push({ id, group, pdfInfo, pageNum });

    return group;
  }

  _updateOverlayTransform(group) {
    const x = parseFloat(group.dataset.x);
    const y = parseFloat(group.dataset.y);
    const rotation = parseFloat(group.dataset.rotation) || 0;
    const scale = parseFloat(group.dataset.scale) || 1;

    // Transform: translate to position, rotate, then scale
    group.setAttribute('transform',
      `translate(${x},${y}) rotate(${rotation}) scale(${scale})`
    );
    group.setAttribute('opacity', group.dataset.opacity || '0.5');
  }

  removeOverlay(id) {
    const idx = this.overlays.findIndex(o => o.id === id);
    if (idx >= 0) {
      this.overlays[idx].group.remove();
      this.overlays.splice(idx, 1);
    }
  }

  // ========== Modal ==========

  _addPlaceholderThumb(name) {
    const placeholder = this.thumbnailContainer.querySelector('.placeholder-text');
    if (placeholder) placeholder.remove();

    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'pdf-thumb';
    const label = document.createElement('div');
    label.className = 'thumb-label';
    label.textContent = name;
    thumbDiv.appendChild(label);
    this.thumbnailContainer.appendChild(thumbDiv);
  }

  async _openModal(pdfInfo) {
    this.currentPdf = pdfInfo;
    this.currentPage = 1;
    document.getElementById('pdf-modal').classList.remove('hidden');
    document.getElementById('pdf-modal-title').textContent = pdfInfo.name;
    await this._renderModalPage();
  }

  async _renderModalPage() {
    if (!this.currentPdf) return;

    const page = await this.currentPdf.pdf.getPage(this.currentPage);
    const viewport = page.getViewport({ scale: 1.5 });

    this.modalCanvas.width = viewport.width;
    this.modalCanvas.height = viewport.height;
    const ctx = this.modalCanvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    document.getElementById('pdf-modal-page').textContent =
      `${this.currentPage} / ${this.currentPdf.numPages}`;
  }

  _initModal() {
    document.getElementById('pdf-modal-prev').addEventListener('click', async () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        await this._renderModalPage();
      }
    });
    document.getElementById('pdf-modal-next').addEventListener('click', async () => {
      if (this.currentPdf && this.currentPage < this.currentPdf.numPages) {
        this.currentPage++;
        await this._renderModalPage();
      }
    });
  }
}
