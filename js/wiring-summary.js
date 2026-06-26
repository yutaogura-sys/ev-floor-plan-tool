// Wiring Summary - Auto-generates wiring summary table and per-route annotation blocks
// Benchmark format: hierarchical table per cable type + multi-line annotation blocks near routes
class WiringSummary {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
  }

  /**
   * Collect all wiring route data from annotations and summarize by cable spec / method
   * @returns {Array} Summary rows: { cableSpec, conduitSpec, method, totalLength, surfaceType }
   */
  collectData() {
    const routes = document.querySelectorAll('[data-type="wiring-route"]');
    const aggregated = {}; // key: "cableSpec|conduitSpec|method|surfaceType"

    routes.forEach(route => {
      try {
        const routeData = JSON.parse(route.dataset.routeData || '{}');
        const segments = routeData.segments || [];

        segments.forEach(seg => {
          const key = `${seg.cableSpec || ''}|${seg.conduitSpec || ''}|${seg.method || 'exposed'}|${seg.surfaceType || ''}`;
          if (!aggregated[key]) {
            aggregated[key] = {
              cableSpec: seg.cableSpec || '',
              conduitSpec: seg.conduitSpec || '',
              method: seg.method || 'exposed',
              surfaceType: seg.surfaceType || '',
              totalLength: 0
            };
          }
          aggregated[key].totalLength += seg.length || 0;
        });
      } catch (e) {
        console.warn('Failed to parse route data:', e);
      }
    });

    return Object.values(aggregated).sort((a, b) => {
      if (a.method !== b.method) return a.method.localeCompare(b.method);
      return a.cableSpec.localeCompare(b.cableSpec);
    });
  }

  /**
   * Generate summary table as SVG and place it
   * @param {number} x - Placement X (DXF units)
   * @param {number} y - Placement Y (DXF units)
   */
  generate(x, y) {
    const data = this.collectData();
    if (data.length === 0) {
      Utils.toast('配線ルートが見つかりません。先に配線ルートを描画してください。', 'error');
      return;
    }

    // Remove existing summary table
    const existing = document.querySelector('[data-type="wiring-summary"]');
    if (existing) existing.remove();

    const id = Utils.generateId();

    // Pass data directly — createWiringSummaryTable handles the hierarchical format
    const methodNames = { 'exposed': '露出', 'buried': '埋設', 'aerial': '架空' };
    const summaryRows = data.map(row => ({
      cableSpec: row.cableSpec,
      conduitSpec: row.conduitSpec,
      method: methodNames[row.method] || row.method,
      length: Math.round(row.totalLength * 10) / 10,
      surfaceType: row.surfaceType
    }));

    this.svgEngine.createWiringSummaryTable(id, x, y, summaryRows);

    // Also generate per-route annotation blocks
    this._generateRouteAnnotations();

    // Update checklist
    if (typeof app !== 'undefined' && app.updateChecklist) {
      app.updateChecklist();
    }
  }

  /**
   * Generate multi-line annotation blocks near each wiring route
   * Benchmark format:
   *   新設プルボックス～EV充電設備3
   *   CV8sq-3C  露出配管  PFD-28  5m
   *   CV8sq-3C  露出配管  PFD-28  立下げ  3m
   *   ...
   */
  _generateRouteAnnotations() {
    // Remove existing route annotations
    document.querySelectorAll('[data-type="wiring-route-annotation"]').forEach(el => el.remove());

    const routes = document.querySelectorAll('[data-type="wiring-route"]');
    const S = this.svgEngine.S;
    const methodNames = { 'exposed': '露出', 'buried': '埋設', 'aerial': '架空' };

    routes.forEach((route, routeIdx) => {
      try {
        const routeData = JSON.parse(route.dataset.routeData || '{}');
        const vertices = routeData.vertices || [];
        const segments = routeData.segments || [];
        if (segments.length === 0) return;

        // Build annotation text lines
        const routeLabel = route.dataset.routeLabel || '';
        const lines = [];
        if (routeLabel) {
          lines.push({ text: routeLabel, bold: true });
        }

        segments.forEach((seg, i) => {
          const method = methodNames[seg.method] || seg.method;
          const parts = [];
          if (seg.cableSpec) parts.push(seg.cableSpec);
          parts.push(`${method}配管`);
          if (seg.conduitSpec) parts.push(seg.conduitSpec);
          const len = Math.round((seg.length || 0) * 10) / 10;
          parts.push(`${len}m`);
          lines.push({ text: parts.join('　'), bold: false });

          // Add rise/fall lines if present
          if (seg.riseLength > 0) {
            lines.push({ text: `${seg.cableSpec || ''}　${method}配管　${seg.conduitSpec || ''}　立上げ　${seg.riseLength}m`, bold: false });
          }
          if (seg.fallLength > 0) {
            lines.push({ text: `${seg.cableSpec || ''}　${method}配管　${seg.conduitSpec || ''}　立下げ　${seg.fallLength}m`, bold: false });
          }
        });

        // Also add internal cable line if applicable
        const lastSeg = segments[segments.length - 1];
        if (lastSeg) {
          lines.push({ text: `${lastSeg.cableSpec || ''}　露出　EV充電設備内余長　1m`, bold: false });
        }

        if (lines.length === 0) return;

        // Position: offset from the midpoint of the route, perpendicular
        const midIdx = Math.floor(vertices.length / 2);
        const anchorV = vertices[midIdx] || vertices[0];
        const fs = S.fontSmall * 0.65;
        const lineH = fs * 1.6;

        // Place to the left or below the route start
        const annotX = anchorV.x - 3.0; // offset left
        const annotY = anchorV.y + 0.5;

        const annGroup = Utils.createSVGElement('g', {
          'data-type': 'wiring-route-annotation', 'data-figure': 'route',
          'data-x': annotX, 'data-y': annotY
        });

        lines.forEach((line, li) => {
          const t = Utils.createSVGElement('text', {
            x: annotX, y: annotY + li * lineH,
            'text-anchor': 'start', 'font-size': fs,
            fill: '#009933', 'font-family': 'Meiryo, sans-serif',
            'font-weight': line.bold ? 'bold' : 'normal'
          });
          t.textContent = line.text;
          annGroup.appendChild(t);
        });

        this.svgEngine.annotationLayer.appendChild(annGroup);
      } catch (e) {
        console.warn('Failed to generate route annotation:', e);
      }
    });
  }

  /**
   * Auto-place summary table near top-left of annotation area (matching benchmark placement)
   */
  generateAutoPlaced() {
    const annotationLayer = document.getElementById('annotation-layer');
    const bbox = annotationLayer.getBBox();

    if (bbox.width <= 0) {
      this.generate(0, 0);
      return;
    }

    // Benchmark places the summary table at top-left, offset from the drawing
    const x = bbox.x;
    const y = bbox.y - 2.0;
    this.generate(x, y);
  }
}
