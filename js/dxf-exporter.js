// DXF Exporter - Export annotations + base map as DXF R12 (AC1009)
// Produces a DXF file that can be opened and edited in AutoCAD, DraftSight, etc.
class DXFExporter {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
  }

  // ====== Public API ======

  exportDXF(figureType = 'plan') {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const progressFill = document.getElementById('progress-fill');
    overlay.classList.remove('hidden');
    progressFill.style.width = '0%';

    const typeLabel = figureType === 'route' ? '配線ルート図' : '平面図';
    loadingText.textContent = `${typeLabel}DXFを生成中...`;

    try {
      progressFill.style.width = '20%';
      const dxfString = this._buildDXF(figureType);

      progressFill.style.width = '90%';
      loadingText.textContent = 'ダウンロード中...';

      // Download
      const blob = new Blob([dxfString], { type: 'application/dxf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const siteName = (app.titleBlock && app.titleBlock.data.siteName) || typeLabel;
      const date = new Date().toISOString().split('T')[0];
      const prefix = figureType === 'route' ? '【③配線ルート図】' : '【②平面図】';
      a.download = `${prefix}${siteName}_${date}.dxf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      progressFill.style.width = '100%';
      loadingText.textContent = 'DXF出力完了';
      setTimeout(() => overlay.classList.add('hidden'), 800);
    } catch (err) {
      console.error('DXF export error:', err);
      Utils.toast('DXF出力に失敗しました: ' + err.message, 'error');
      overlay.classList.add('hidden');
    }
  }

  // ====== DXF Building ======

  _buildDXF(figureType) {
    const allowedFigures = figureType === 'route'
      ? ['route', 'shared']
      : ['plan', 'shared'];

    // Collect used annotation layers
    const usedLayers = new Set();
    const annotations = this._getFilteredAnnotations(allowedFigures);
    annotations.forEach(ann => {
      usedLayers.add(this._layerNameForType(ann.dataset.type));
    });

    // Base map layers
    const dxfData = app.state && app.state.dxfData;
    const baseMapLayers = dxfData ? Object.keys(dxfData.layers) : [];

    // Compute bounds
    const bounds = this._computeBounds(dxfData, annotations);

    // Build sections
    let dxf = '';
    dxf += this._buildHeader(bounds);
    dxf += this._buildTables(baseMapLayers, [...usedLayers]);
    dxf += this._buildEntities(dxfData, annotations);
    dxf += '0\r\nEOF\r\n';

    return dxf;
  }

  _getFilteredAnnotations(allowedFigures) {
    const all = this.svgEngine.getAnnotations();
    return [...all].filter(ann => {
      const figure = ann.getAttribute('data-figure') || 'plan';
      return allowedFigures.includes(figure);
    });
  }

  _computeBounds(dxfData, annotations) {
    const points = [];
    annotations.forEach(ann => {
      points.push({ x: parseFloat(ann.dataset.x), y: parseFloat(ann.dataset.y) });
    });
    return DXFExporter.computeBoundsCore(dxfData && dxfData.bounds, points);
  }

  // ====== HEADER Section ======

  _buildHeader(bounds) {
    return [
      '0', 'SECTION',
      '2', 'HEADER',
      '9', '$ACADVER', '1', 'AC1009',
      '9', '$DWGCODEPAGE', '3', 'UTF-8',
      '9', '$INSBASE', '10', '0.0', '20', '0.0', '30', '0.0',
      '9', '$EXTMIN', '10', bounds.minX.toFixed(4), '20', bounds.minY.toFixed(4), '30', '0.0',
      '9', '$EXTMAX', '10', bounds.maxX.toFixed(4), '20', bounds.maxY.toFixed(4), '30', '0.0',
      '0', 'ENDSEC'
    ].join('\r\n') + '\r\n';
  }

  // ====== TABLES Section ======

  _buildTables(baseMapLayers, annotationLayers) {
    const allLayers = [...new Set([...baseMapLayers, ...annotationLayers])];

    let out = '0\r\nSECTION\r\n2\r\nTABLES\r\n';

    // VPORT table (required by many CAD readers)
    out += '0\r\nTABLE\r\n2\r\nVPORT\r\n70\r\n1\r\n';
    out += [
      '0', 'VPORT', '2', '*ACTIVE', '70', '0',
      '10', '0.0', '20', '0.0',
      '11', '1.0', '21', '1.0',
      '12', '0.0', '22', '0.0',
      '13', '0.0', '23', '0.0',
      '14', '1.0', '24', '1.0',
      '15', '0.0', '25', '0.0',
      '16', '0.0', '26', '0.0', '36', '1.0',
      '17', '0.0', '27', '0.0', '37', '0.0',
      '40', '1000.0', '41', '1.414',
      '42', '50.0', '43', '0.0', '44', '0.0',
      '50', '0.0', '51', '0.0',
      '71', '0', '72', '100',
      '73', '1', '74', '3',
      '75', '0', '76', '0',
      '77', '0', '78', '0'
    ].join('\r\n') + '\r\n';
    out += '0\r\nENDTAB\r\n';

    // LTYPE table MUST come before LAYER (layers reference linetypes)
    out += '0\r\nTABLE\r\n2\r\nLTYPE\r\n70\r\n2\r\n';
    out += this._ltypeEntry('CONTINUOUS', '', 0, []);
    out += this._ltypeEntry('DASHED', '__ __ __ __', 1.0, [0.5, -0.5]);
    out += '0\r\nENDTAB\r\n';

    // LAYER table
    out += '0\r\nTABLE\r\n2\r\nLAYER\r\n70\r\n' + (allLayers.length + 1) + '\r\n';

    // Default layer 0
    out += this._layerEntry('0', 7, 'CONTINUOUS');

    // Base map layers
    const baseColors = { 'ROAD': 8, 'BUILDING': 7, 'STRUCTURE': 9, 'CENTER': 253 };
    baseMapLayers.forEach(name => {
      const aci = baseColors[name] || 7;
      const lt = name === 'CENTER' ? 'DASHED' : 'CONTINUOUS';
      out += this._layerEntry(name, aci, lt);
    });

    // Annotation layers
    const annColors = {
      'EV_CHARGING_SPACE': 1, 'EV_CHARGER': 1, 'EV_ROAD_MARKING': 3,
      'EV_WHEEL_STOP': 7, 'EV_BOLLARD': 7, 'EV_LIGHTING': 30,
      'EV_FOUNDATION': 7, 'EV_DIMENSION': 5, 'EV_ANNOTATION': 3,
      'EV_BOUNDARY': 5, 'EV_TEXT': 7, 'EV_CUBICLE': 3,
      'EV_POLE': 7, 'EV_HANDHOLE': 7, 'EV_PULLBOX': 5,
      'EV_EXISTING_CHARGER': 30, 'EV_WIRING_ROUTE': 1,
      'EV_WIRING_SUMMARY': 7, 'EV_MISC': 7
    };
    annotationLayers.forEach(name => {
      out += this._layerEntry(name, annColors[name] || 7, 'CONTINUOUS');
    });

    out += '0\r\nENDTAB\r\n';

    // STYLE table
    out += '0\r\nTABLE\r\n2\r\nSTYLE\r\n70\r\n1\r\n';
    out += [
      '0', 'STYLE', '2', 'STANDARD', '70', '0', '40', '0.0', '41', '1.0',
      '50', '0.0', '71', '0', '42', '0.25', '3', '', '4', ''
    ].join('\r\n') + '\r\n';
    out += '0\r\nENDTAB\r\n';

    out += '0\r\nENDSEC\r\n';
    return out;
  }

  _layerEntry(name, aci, linetype) {
    return [
      '0', 'LAYER', '2', name, '70', '0', '62', String(aci), '6', linetype
    ].join('\r\n') + '\r\n';
  }

  _ltypeEntry(name, desc, totalLen, pattern) {
    let out = ['0', 'LTYPE', '2', name, '70', '0', '3', desc,
      '72', '65', '73', String(pattern.length), '40', totalLen.toFixed(1)
    ].join('\r\n') + '\r\n';
    pattern.forEach(p => { out += '49\r\n' + p.toFixed(1) + '\r\n'; });
    return out;
  }

  // ====== ENTITIES Section ======

  _buildEntities(dxfData, annotations) {
    let out = '0\r\nSECTION\r\n2\r\nENTITIES\r\n';

    // 1. Base map entities
    if (dxfData) {
      out += this._emitBaseMapEntities(dxfData);
    }

    // 2. Annotation entities
    annotations.forEach(ann => {
      const type = ann.dataset.type;
      try {
        switch (type) {
          case 'charging-space': out += this._emitChargingSpace(ann); break;
          case 'charger':        out += this._emitCharger(ann); break;
          case 'road-marking':   out += this._emitRoadMarking(ann); break;
          case 'wheel-stop':     out += this._emitWheelStop(ann); break;
          case 'bollard':        out += this._emitBollard(ann); break;
          case 'lighting':       out += this._emitLighting(ann); break;
          case 'foundation':     out += this._emitFoundation(ann); break;
          case 'dimension':      out += this._emitDimension(ann); break;
          case 'leader':         out += this._emitLeader(ann); break;
          case 'boundary-rect':  out += this._emitBoundaryRect(ann); break;
          case 'text':           out += this._emitText(ann); break;
          case 'cubicle':        out += this._emitCubicle(ann); break;
          case 'pole':           out += this._emitPole(ann); break;
          case 'handhole':       out += this._emitHandhole(ann); break;
          case 'pullbox':        out += this._emitPullbox(ann); break;
          case 'existing-charger': out += this._emitExistingCharger(ann); break;
          case 'wiring-route':   out += this._emitWiringRoute(ann); break;
          case 'wiring-summary': out += this._emitWiringSummary(ann); break;
          default: break;
        }
      } catch (e) {
        console.warn('DXF export skip:', type, e.message);
      }
    });

    out += '0\r\nENDSEC\r\n';
    return out;
  }

  // ====== Base Map ======

  _emitBaseMapEntities(dxfData) {
    let out = '';
    const defaultAci = { 'ROAD': 8, 'BUILDING': 7, 'STRUCTURE': 9, 'CENTER': 253,
      'EV_CHARGING_SPACE': 1, 'EV_CHARGER': 1, 'EV_DIMENSION': 5, 'EV_ANNOTATION': 5,
      'EV_ROAD_MARKING': 3, 'EV_WHEEL_STOP': 7, 'EV_FOUNDATION': 7, 'EV_TEXT': 7,
      'EV_WIRING_ROUTE': 30, 'EV_CUBICLE': 30, 'EV_POLE': 30, 'EV_HANDHOLE': 30 };
    for (const [layerName, layerData] of Object.entries(dxfData.layers)) {
      const aci = defaultAci[layerName] || 7;

      // Polylines (coordinates are already in DXF space)
      for (const pl of (layerData.polylines || [])) {
        const verts = pl.vertices.map(v => ({ x: v.x, y: v.y }));
        out += this._dxfPolyline(layerName, aci, verts, pl.closed);
      }

      // Lines
      for (const ln of (layerData.lines || [])) {
        out += this._dxfLine(layerName, aci, ln.x1, ln.y1, ln.x2, ln.y2);
      }

      // Texts
      for (const t of (layerData.texts || [])) {
        out += this._dxfText(layerName, aci, t.x, t.y, t.height || 0.25, t.content, t.rotation || 0);
      }

      // Circles
      for (const c of (layerData.circles || [])) {
        out += this._dxfCircle(layerName, aci, c.cx, c.cy, c.r);
      }
    }
    return out;
  }

  // ====== Annotation Emitters ======

  _emitChargingSpace(el) {
    const layer = 'EV_CHARGING_SPACE';
    const aci = 1;
    // createChargingSpace は transform="translate(x,y) rotate(rot)" + rect(0,0,w,h)。
    // つまり (x,y) は矩形の左上角＝回転中心（中心ではない）。SVG/PDF と一致させるため
    // ローカル角 (0,0)-(w,h) を原点まわりで回転→(x0,y0) へ平行移動する。
    const x0 = parseFloat(el.dataset.x);
    const y0 = parseFloat(el.dataset.y);
    const w = parseFloat(el.dataset.width) || 2.5;
    const h = parseFloat(el.dataset.height) || 5.0;
    const rot = parseFloat(el.dataset.rotation) || 0;
    const num = el.dataset.number || '';

    const dxfCorners = DXFExporter.chargingSpaceCorners({ x: x0, y: y0, width: w, height: h, rotation: rot });

    let out = this._dxfPolyline(layer, aci, dxfCorners, true);

    // Label text（ローカル中心 (w/2,h/2) 付近。SVG の桁数表記に合わせる）
    const label = `【充電スペース${num}】`;
    const dimText = `幅${w.toFixed(2)}m×奥行${h.toFixed(1)}m`;
    const c = this._rotatePoint(w / 2, h / 2, 0, 0, rot);
    const lx = x0 + c.x;
    const ly = -(y0 + c.y);
    out += this._dxfText(layer, aci, lx, ly, 0.2, label, rot, 1);
    out += this._dxfText(layer, aci, lx, ly - 0.3, 0.15, dimText, rot, 1);

    return out;
  }

  _emitCharger(el) {
    const layer = 'EV_CHARGER';
    const aci = 1;
    const cx = parseFloat(el.dataset.x);
    const cy = parseFloat(el.dataset.y);
    const rot = parseFloat(el.dataset.rotation) || 0;

    // Charger body: 0.4 x 0.3m rectangle
    const hw = 0.2, hh = 0.15;
    const corners = [
      { x: -hw, y: -hh }, { x: hw, y: -hh },
      { x: hw, y: hh }, { x: -hw, y: hh }
    ];
    const dxfCorners = corners.map(c => {
      const r = this._rotatePoint(c.x, c.y, 0, 0, rot);
      return { x: cx + r.x, y: -(cy + r.y) };
    });

    let out = this._dxfPolyline(layer, aci, dxfCorners, true);

    // EV text inside
    const texts = el.querySelectorAll('text');
    if (texts.length > 0) {
      out += this._dxfText(layer, aci, cx, -cy, 0.12, texts[0].textContent, rot, 1);
    }

    return out;
  }

  _emitRoadMarking(el) {
    const layer = 'EV_ROAD_MARKING';
    const aci = 3;
    const cx = parseFloat(el.dataset.x);
    const cy = parseFloat(el.dataset.y);
    const dxfCy = -cy;

    // 0.9 x 0.9m square
    const s = 0.45;
    const corners = [
      { x: cx - s, y: dxfCy - s }, { x: cx + s, y: dxfCy - s },
      { x: cx + s, y: dxfCy + s }, { x: cx - s, y: dxfCy + s }
    ];

    let out = this._dxfPolyline(layer, aci, corners, true);
    out += this._dxfText(layer, aci, cx, dxfCy, 0.25, 'EV', 0, 1);
    return out;
  }

  _emitWheelStop(el) {
    const layer = 'EV_WHEEL_STOP';
    const aci = 7;
    const cx = parseFloat(el.dataset.x);
    const cy = parseFloat(el.dataset.y);
    const rot = parseFloat(el.dataset.rotation) || 0;

    // 0.6 x 0.1m rectangle
    const hw = 0.3, hh = 0.05;
    const corners = [
      { x: -hw, y: -hh }, { x: hw, y: -hh },
      { x: hw, y: hh }, { x: -hw, y: hh }
    ];
    const dxfCorners = corners.map(c => {
      const r = this._rotatePoint(c.x, c.y, 0, 0, rot);
      return { x: cx + r.x, y: -(cy + r.y) };
    });

    return this._dxfPolyline(layer, aci, dxfCorners, true);
  }

  _emitBollard(el) {
    const cx = parseFloat(el.dataset.x);
    return this._dxfCircle('EV_BOLLARD', 7, cx, -parseFloat(el.dataset.y), 0.06);
  }

  _emitLighting(el) {
    const layer = 'EV_LIGHTING';
    const aci = 30;
    const cx = parseFloat(el.dataset.x);
    const dxfCy = -parseFloat(el.dataset.y);
    const r = 0.15;

    let out = this._dxfCircle(layer, aci, cx, dxfCy, r);
    // Crosshairs
    out += this._dxfLine(layer, aci, cx - r, dxfCy, cx + r, dxfCy);
    out += this._dxfLine(layer, aci, cx, dxfCy - r, cx, dxfCy + r);
    return out;
  }

  _emitFoundation(el) {
    const layer = 'EV_FOUNDATION';
    const aci = 7;
    const cx = parseFloat(el.dataset.x);
    const cy = parseFloat(el.dataset.y);
    const dxfCy = -cy;
    const w = parseFloat(el.dataset.width) || 0.5;
    const h = parseFloat(el.dataset.height) || 0.5;
    const hw = w / 2, hh = h / 2;

    // Rectangle
    const corners = [
      { x: cx - hw, y: dxfCy - hh }, { x: cx + hw, y: dxfCy - hh },
      { x: cx + hw, y: dxfCy + hh }, { x: cx - hw, y: dxfCy + hh }
    ];
    let out = this._dxfPolyline(layer, aci, corners, true);

    // X diagonals
    out += this._dxfLine(layer, aci, cx - hw, dxfCy - hh, cx + hw, dxfCy + hh);
    out += this._dxfLine(layer, aci, cx + hw, dxfCy - hh, cx - hw, dxfCy + hh);

    return out;
  }

  _emitDimension(el) {
    const layer = 'EV_DIMENSION';
    const color = el.dataset.color || '#0066cc';
    const aci = this._cssColorToACI(color);

    // Read child SVG elements directly
    let out = '';
    el.querySelectorAll('line').forEach(line => {
      const x1 = parseFloat(line.getAttribute('x1'));
      const y1 = -parseFloat(line.getAttribute('y1'));
      const x2 = parseFloat(line.getAttribute('x2'));
      const y2 = -parseFloat(line.getAttribute('y2'));
      out += this._dxfLine(layer, aci, x1, y1, x2, y2);
    });

    el.querySelectorAll('text').forEach(text => {
      const x = parseFloat(text.getAttribute('x'));
      const y = -parseFloat(text.getAttribute('y'));
      const content = text.textContent;
      const fontSize = parseFloat(text.getAttribute('font-size')) || 0.15;
      const transform = text.getAttribute('transform') || '';
      let rot = 0;
      const rotMatch = transform.match(/rotate\(([^,)]+)/);
      if (rotMatch) rot = parseFloat(rotMatch[1]);
      out += this._dxfText(layer, aci, x, y, fontSize, content, rot, 1);
    });

    return out;
  }

  _emitLeader(el) {
    const layer = 'EV_ANNOTATION';
    const color = el.dataset.color || '#009933';
    const aci = this._cssColorToACI(color);

    let out = '';

    // Leader line
    const line = el.querySelector('line');
    if (line) {
      out += this._dxfLine(layer, aci,
        parseFloat(line.getAttribute('x1')), -parseFloat(line.getAttribute('y1')),
        parseFloat(line.getAttribute('x2')), -parseFloat(line.getAttribute('y2'))
      );
    }

    // Target circle
    const circle = el.querySelector('circle');
    if (circle) {
      out += this._dxfCircle(layer, aci,
        parseFloat(circle.getAttribute('cx')),
        -parseFloat(circle.getAttribute('cy')),
        parseFloat(circle.getAttribute('r')) || 0.05
      );
    }

    // Text lines
    el.querySelectorAll('text').forEach(text => {
      const x = parseFloat(text.getAttribute('x'));
      const y = -parseFloat(text.getAttribute('y'));
      const fontSize = parseFloat(text.getAttribute('font-size')) || 0.2;
      out += this._dxfText(layer, aci, x, y, fontSize, text.textContent, 0, 0);
    });

    return out;
  }

  _emitBoundaryRect(el) {
    const layer = 'EV_BOUNDARY';
    const color = el.dataset.color || '#0066cc';
    const aci = this._cssColorToACI(color);
    const cx = parseFloat(el.dataset.x);
    const cy = parseFloat(el.dataset.y);
    const dxfCy = -cy;
    const w = parseFloat(el.dataset.width) || 10;
    const h = parseFloat(el.dataset.height) || 10;
    const hw = w / 2, hh = h / 2;

    const corners = [
      { x: cx - hw, y: dxfCy - hh }, { x: cx + hw, y: dxfCy - hh },
      { x: cx + hw, y: dxfCy + hh }, { x: cx - hw, y: dxfCy + hh }
    ];

    return this._dxfPolyline(layer, aci, corners, true);
  }

  _emitText(el) {
    const layer = 'EV_TEXT';
    const color = el.dataset.color || '#333';
    const aci = this._cssColorToACI(color);

    let out = '';
    el.querySelectorAll('text').forEach(text => {
      const x = parseFloat(text.getAttribute('x'));
      const y = -parseFloat(text.getAttribute('y'));
      const fontSize = parseFloat(text.getAttribute('font-size')) || 0.25;
      out += this._dxfText(layer, aci, x, y, fontSize, text.textContent, 0, 0);
    });
    return out;
  }

  _emitCubicle(el) {
    const layer = 'EV_CUBICLE';
    const aci = 3;
    const cx = parseFloat(el.dataset.x);
    const dxfCy = -parseFloat(el.dataset.y);
    const w = parseFloat(el.dataset.width) || 1.0;
    const h = parseFloat(el.dataset.height) || 0.6;
    const hw = w / 2, hh = h / 2;

    const corners = [
      { x: cx - hw, y: dxfCy - hh }, { x: cx + hw, y: dxfCy - hh },
      { x: cx + hw, y: dxfCy + hh }, { x: cx - hw, y: dxfCy + hh }
    ];

    let out = this._dxfPolyline(layer, aci, corners, true);
    const label = el.dataset.label || '';
    if (label) out += this._dxfText(layer, aci, cx, dxfCy, 0.15, label, 0, 1);
    return out;
  }

  _emitPole(el) {
    const layer = 'EV_POLE';
    const aci = 7;
    const cx = parseFloat(el.dataset.x);
    const dxfCy = -parseFloat(el.dataset.y);
    const r = 0.15;

    let out = this._dxfCircle(layer, aci, cx, dxfCy, r);
    // X cross
    out += this._dxfLine(layer, aci, cx - r, dxfCy - r, cx + r, dxfCy + r);
    out += this._dxfLine(layer, aci, cx + r, dxfCy - r, cx - r, dxfCy + r);
    return out;
  }

  _emitHandhole(el) {
    const layer = 'EV_HANDHOLE';
    const aci = 7;
    const cx = parseFloat(el.dataset.x);
    const dxfCy = -parseFloat(el.dataset.y);
    const s = 0.15;

    const corners = [
      { x: cx - s, y: dxfCy - s }, { x: cx + s, y: dxfCy - s },
      { x: cx + s, y: dxfCy + s }, { x: cx - s, y: dxfCy + s }
    ];

    let out = this._dxfPolyline(layer, aci, corners, true);
    out += this._dxfText(layer, aci, cx, dxfCy, 0.12, 'HH', 0, 1);
    return out;
  }

  _emitPullbox(el) {
    const layer = 'EV_PULLBOX';
    const aci = 5;
    const cx = parseFloat(el.dataset.x);
    const dxfCy = -parseFloat(el.dataset.y);
    const s = 0.125;

    const corners = [
      { x: cx - s, y: dxfCy - s }, { x: cx + s, y: dxfCy - s },
      { x: cx + s, y: dxfCy + s }, { x: cx - s, y: dxfCy + s }
    ];

    let out = this._dxfPolyline(layer, aci, corners, true);
    out += this._dxfText(layer, aci, cx, dxfCy, 0.1, 'PB', 0, 1);
    return out;
  }

  _emitExistingCharger(el) {
    const layer = 'EV_EXISTING_CHARGER';
    const aci = 30;
    const cx = parseFloat(el.dataset.x);
    const cy = parseFloat(el.dataset.y);
    const rot = parseFloat(el.dataset.rotation) || 0;

    const hw = 0.2, hh = 0.15;
    const corners = [
      { x: -hw, y: -hh }, { x: hw, y: -hh },
      { x: hw, y: hh }, { x: -hw, y: hh }
    ];
    const dxfCorners = corners.map(c => {
      const r = this._rotatePoint(c.x, c.y, 0, 0, rot);
      return { x: cx + r.x, y: -(cy + r.y) };
    });

    return this._dxfPolyline(layer, aci, dxfCorners, true);
  }

  _emitWiringRoute(el) {
    const layer = 'EV_WIRING_ROUTE';
    const aci = 1;
    let out = '';

    // Read route data from JSON attribute
    const routeDataStr = el.dataset.routeData;
    if (routeDataStr) {
      try {
        const routeData = JSON.parse(routeDataStr);
        const vertices = routeData.vertices || [];
        if (vertices.length >= 2) {
          const dxfVerts = vertices.map(v => ({ x: v.x, y: -v.y }));
          out += this._dxfPolylineOpen(layer, aci, dxfVerts);
        }
      } catch (e) {
        // Fallback: read polyline child elements
      }
    }

    // Also read child lines
    if (!out) {
      el.querySelectorAll('line').forEach(line => {
        out += this._dxfLine(layer, aci,
          parseFloat(line.getAttribute('x1')), -parseFloat(line.getAttribute('y1')),
          parseFloat(line.getAttribute('x2')), -parseFloat(line.getAttribute('y2'))
        );
      });
    }

    // Text labels
    el.querySelectorAll('text').forEach(text => {
      out += this._dxfText(layer, aci,
        parseFloat(text.getAttribute('x')),
        -parseFloat(text.getAttribute('y')),
        parseFloat(text.getAttribute('font-size')) || 0.15,
        text.textContent, 0, 0
      );
    });

    return out;
  }

  _emitWiringSummary(el) {
    const layer = 'EV_WIRING_SUMMARY';
    const aci = 7;
    let out = '';

    // Export all text and line children
    el.querySelectorAll('line').forEach(line => {
      out += this._dxfLine(layer, aci,
        parseFloat(line.getAttribute('x1')), -parseFloat(line.getAttribute('y1')),
        parseFloat(line.getAttribute('x2')), -parseFloat(line.getAttribute('y2'))
      );
    });

    el.querySelectorAll('rect').forEach(rect => {
      const x = parseFloat(rect.getAttribute('x'));
      const y = -parseFloat(rect.getAttribute('y'));
      const w = parseFloat(rect.getAttribute('width'));
      const h = parseFloat(rect.getAttribute('height'));
      const corners = [
        { x: x, y: y }, { x: x + w, y: y },
        { x: x + w, y: y - h }, { x: x, y: y - h }
      ];
      out += this._dxfPolyline(layer, aci, corners, true);
    });

    el.querySelectorAll('text').forEach(text => {
      out += this._dxfText(layer, aci,
        parseFloat(text.getAttribute('x')),
        -parseFloat(text.getAttribute('y')),
        parseFloat(text.getAttribute('font-size')) || 0.15,
        text.textContent, 0, 0
      );
    });

    return out;
  }

  // ====== DXF Primitive Helpers ======

  _dxfLine(layer, aci, x1, y1, x2, y2) {
    return [
      '0', 'LINE', '8', layer, '62', String(aci),
      '10', x1.toFixed(4), '20', y1.toFixed(4), '30', '0.0',
      '11', x2.toFixed(4), '21', y2.toFixed(4), '31', '0.0'
    ].join('\r\n') + '\r\n';
  }

  _dxfPolyline(layer, aci, vertices, closed) {
    let out = [
      '0', 'POLYLINE', '8', layer, '62', String(aci),
      '66', '1', '70', closed ? '1' : '0'
    ].join('\r\n') + '\r\n';

    vertices.forEach(v => {
      out += [
        '0', 'VERTEX', '8', layer,
        '10', v.x.toFixed(4), '20', v.y.toFixed(4), '30', '0.0'
      ].join('\r\n') + '\r\n';
    });

    out += '0\r\nSEQEND\r\n8\r\n' + layer + '\r\n';
    return out;
  }

  _dxfPolylineOpen(layer, aci, vertices) {
    return this._dxfPolyline(layer, aci, vertices, false);
  }

  _dxfCircle(layer, aci, cx, cy, r) {
    return [
      '0', 'CIRCLE', '8', layer, '62', String(aci),
      '10', cx.toFixed(4), '20', cy.toFixed(4), '30', '0.0',
      '40', r.toFixed(4)
    ].join('\r\n') + '\r\n';
  }

  /**
   * @param halign 0=left, 1=center, 2=right
   */
  _dxfText(layer, aci, x, y, height, content, rotation, halign) {
    if (!content || content.trim() === '') return '';
    const rot = rotation || 0;

    // When alignment is used, DXF requires both insertion point (10/20) and
    // alignment point (11/21), plus codes 72 (horiz) and 73 (vert)
    if (halign && halign > 0) {
      return [
        '0', 'TEXT', '8', layer, '62', String(aci),
        '10', x.toFixed(4), '20', y.toFixed(4), '30', '0.0',
        '11', x.toFixed(4), '21', y.toFixed(4), '31', '0.0',
        '40', height.toFixed(4),
        '1', content,
        '50', rot.toFixed(1),
        '7', 'STANDARD',
        '72', String(halign),
        '73', '0'
      ].join('\r\n') + '\r\n';
    }

    return [
      '0', 'TEXT', '8', layer, '62', String(aci),
      '10', x.toFixed(4), '20', y.toFixed(4), '30', '0.0',
      '40', height.toFixed(4),
      '1', content,
      '50', rot.toFixed(1),
      '7', 'STANDARD'
    ].join('\r\n') + '\r\n';
  }

  // ====== Utilities ======

  // ---- 純関数（DOM非依存・Nodeテスト可能。静的版を真実の源とし、インスタンス側は委譲） ----

  // 点 (px,py) を (cx,cy) を中心に angleDeg 度回転
  static rotatePoint(px, py, cx, cy, angleDeg) {
    const rad = angleDeg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = px - cx;
    const dy = py - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }

  // 充電スペースの4隅をDXF座標で返す。(x,y)=矩形左上角=回転中心、ローカル(0,0)-(w,h)を
  // 原点まわりで回転→(x,y)へ平行移動→DXFのY反転。createChargingSpace の幾何と一致させる。
  static chargingSpaceCorners(o) {
    const x0 = o.x, y0 = o.y, w = o.width, h = o.height, rot = o.rotation || 0;
    const local = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    return local.map((c) => {
      const r = DXFExporter.rotatePoint(c.x, c.y, 0, 0, rot);
      return { x: x0 + r.x, y: -(y0 + r.y) };
    });
  }

  // 図面範囲の数値集約（DOM非依存）。dxfBounds（無ければnull）と注釈点[{x,y}]（SVG座標）から
  // DXF範囲を求める。空なら既定枠、NaN/Infinity が紛れたらフォールバック。
  static computeBoundsCore(dxfBounds, points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (dxfBounds) {
      minX = dxfBounds.minX; minY = dxfBounds.minY;
      maxX = dxfBounds.maxX; maxY = dxfBounds.maxY;
    }
    (points || []).forEach((p) => {
      const x = p.x, y = p.y;
      if (!isNaN(x) && !isNaN(y)) {
        const dxfY = -y; // SVG Y → DXF Y
        minX = Math.min(minX, x - 10); maxX = Math.max(maxX, x + 10);
        minY = Math.min(minY, dxfY - 10); maxY = Math.max(maxY, dxfY + 10);
      }
    });
    if (minX === Infinity) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
    return { minX, minY, maxX, maxY };
  }

  // CSS色 → AutoCAD カラーインデックス(ACI)
  static colorToACI(cssColor) {
    const c = String(cssColor == null ? '' : cssColor).toLowerCase();
    const map = {
      '#cc0000': 1, '#ff0000': 1, 'red': 1,
      '#009933': 3, '#00cc00': 3, 'green': 3,
      '#0066cc': 5, '#0000ff': 5, 'blue': 5,
      '#333': 7, '#333333': 7, '#000': 7, '#000000': 7, 'black': 7,
      '#666': 8, '#666666': 8, '#888': 8, '#888888': 8,
      '#ff6600': 30, '#ff8800': 30, '#cc6600': 30,
      '#999': 9, '#999999': 9, '#ccc': 253, '#cccccc': 253
    };
    return map[c] || 7;
  }

  _rotatePoint(px, py, cx, cy, angleDeg) {
    return DXFExporter.rotatePoint(px, py, cx, cy, angleDeg);
  }

  _cssColorToACI(cssColor) {
    return DXFExporter.colorToACI(cssColor);
  }

  _layerNameForType(dataType) {
    const map = {
      'charging-space': 'EV_CHARGING_SPACE',
      'charger': 'EV_CHARGER',
      'road-marking': 'EV_ROAD_MARKING',
      'wheel-stop': 'EV_WHEEL_STOP',
      'bollard': 'EV_BOLLARD',
      'lighting': 'EV_LIGHTING',
      'foundation': 'EV_FOUNDATION',
      'dimension': 'EV_DIMENSION',
      'leader': 'EV_ANNOTATION',
      'boundary-rect': 'EV_BOUNDARY',
      'text': 'EV_TEXT',
      'cubicle': 'EV_CUBICLE',
      'pole': 'EV_POLE',
      'handhole': 'EV_HANDHOLE',
      'pullbox': 'EV_PULLBOX',
      'existing-charger': 'EV_EXISTING_CHARGER',
      'wiring-route': 'EV_WIRING_ROUTE',
      'wiring-summary': 'EV_WIRING_SUMMARY'
    };
    return map[dataType] || 'EV_MISC';
  }
}

// ブラウザ/Node 両対応（静的純関数のユニットテスト用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DXFExporter;
}
