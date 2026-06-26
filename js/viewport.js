// Viewport - Pan/Zoom/Coordinate transformation
class Viewport {
  constructor(svgElement, canvasContainer) {
    this.svg = svgElement;
    this.container = canvasContainer;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.minZoom = 0.1;
    this.maxZoom = 50;
    this.bounds = null;

    // Mouse state
    this.isPanning = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this._initEvents();
  }

  _initEvents() {
    this.container.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.container.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.container.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.container.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.container.addEventListener('mouseleave', (e) => this._onMouseUp(e));

    // Zoom buttons
    document.getElementById('btn-zoom-in').addEventListener('click', () => this.zoomBy(1.3));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.zoomBy(0.7));
    document.getElementById('btn-zoom-fit').addEventListener('click', () => this.fitToExtents());
  }

  _onWheel(e) {
    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    this.zoomAt(factor, mouseX, mouseY);
  }

  _onMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && e.altKey) ||
        (e.button === 0 && app && app.toolManager && app.toolManager.activeTool === 'pan')) {
      this.isPanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.container.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }

  _onMouseMove(e) {
    // Update status bar coordinates
    const svgPoint = this.screenToSVG(e.clientX, e.clientY);
    const coordsEl = document.getElementById('status-coords');
    if (coordsEl) {
      const xMm = Math.round(svgPoint.x * 1000);
      const yMm = Math.round(-svgPoint.y * 1000);
      coordsEl.textContent = `X: ${xMm} Y: ${yMm}`;
    }

    if (this.isPanning) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.pan(dx, dy);
    }
  }

  _onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.container.style.cursor = '';
    }
  }

  // Convert screen coordinates to SVG coordinates
  screenToSVG(clientX, clientY) {
    const point = this.svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPoint = point.matrixTransform(ctm.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  }

  // Convert SVG coordinates to screen coordinates
  svgToScreen(svgX, svgY) {
    const point = this.svg.createSVGPoint();
    point.x = svgX;
    point.y = svgY;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const screenPoint = point.matrixTransform(ctm);
    return { x: screenPoint.x, y: screenPoint.y };
  }

  // Set viewBox
  setViewBox(x, y, w, h) {
    this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    this._updateZoomDisplay();
  }

  // Get current viewBox
  getViewBox() {
    const vb = this.svg.viewBox.baseVal;
    return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
  }

  // Pan by screen pixels
  pan(dx, dy) {
    const vb = this.getViewBox();
    const rect = this.container.getBoundingClientRect();
    const scaleX = vb.width / rect.width;
    const scaleY = vb.height / rect.height;
    vb.x -= dx * scaleX;
    vb.y -= dy * scaleY;
    this.setViewBox(vb.x, vb.y, vb.width, vb.height);
  }

  // Zoom at a specific screen point
  zoomAt(factor, screenX, screenY) {
    const vb = this.getViewBox();
    const rect = this.container.getBoundingClientRect();

    // Point in SVG space before zoom
    const svgX = vb.x + (screenX / rect.width) * vb.width;
    const svgY = vb.y + (screenY / rect.height) * vb.height;

    const newWidth = vb.width / factor;
    const newHeight = vb.height / factor;

    // Check zoom limits
    if (this.bounds) {
      const totalWidth = this.bounds.maxX - this.bounds.minX;
      if (newWidth > totalWidth * 10 || newWidth < totalWidth * 0.001) return;
    }

    const newX = svgX - (screenX / rect.width) * newWidth;
    const newY = svgY - (screenY / rect.height) * newHeight;

    this.setViewBox(newX, newY, newWidth, newHeight);
  }

  // Zoom by factor centered
  zoomBy(factor) {
    const rect = this.container.getBoundingClientRect();
    this.zoomAt(factor, rect.width / 2, rect.height / 2);
  }

  // Fit view to DXF extents
  fitToExtents(customBounds) {
    let b = customBounds || this.bounds;
    // DXF範囲が無い（DXF未読込で注釈のみ）場合は描画済み注釈の範囲にフィット
    if (!b || !isFinite(b.minX)) {
      b = this._annotationBounds();
    }
    if (!b || !isFinite(b.minX)) return;

    const rect = this.container.getBoundingClientRect();
    const aspect = rect.width / rect.height;

    // DXF Y is flipped in SVG
    const svgMinY = -b.maxY;
    const svgMaxY = -b.minY;
    const width = b.maxX - b.minX;
    const height = svgMaxY - svgMinY;

    const padding = Math.max(width, height) * 0.05;
    let vbWidth = width + padding * 2;
    let vbHeight = height + padding * 2;

    // Adjust for aspect ratio
    if (vbWidth / vbHeight > aspect) {
      vbHeight = vbWidth / aspect;
    } else {
      vbWidth = vbHeight * aspect;
    }

    const vbX = b.minX - padding - (vbWidth - width - padding * 2) / 2;
    const vbY = svgMinY - padding - (vbHeight - height - padding * 2) / 2;

    this.setViewBox(vbX, vbY, vbWidth, vbHeight);
  }

  // 描画済み注釈レイヤーの範囲をDXF座標のbounds {minX,minY,maxX,maxY} で返す（無ければnull）。
  // SVGはY反転のため、SVG bbox から変換する。
  _annotationBounds() {
    try {
      const layer = document.getElementById('annotation-layer');
      if (!layer) return null;
      const bb = layer.getBBox();
      if (!bb || bb.width === 0 || bb.height === 0) return null;
      return { minX: bb.x, maxX: bb.x + bb.width, minY: -(bb.y + bb.height), maxY: -bb.y };
    } catch (e) { return null; }
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  _updateZoomDisplay() {
    if (!this.bounds) return;
    const vb = this.getViewBox();
    const totalWidth = this.bounds.maxX - this.bounds.minX;
    const zoomPercent = Math.round((totalWidth / vb.width) * 100);
    const zoomEl = document.getElementById('zoom-level');
    if (zoomEl) zoomEl.textContent = `${zoomPercent}%`;
  }
}
