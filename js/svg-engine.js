// SVG Drawing Engine - Renders DXF data and annotations
// All sizes in DXF units (meters). For 1:100 scale A3, 1mm on paper = 0.1m real.
// Typical text on paper: 2-3mm → 0.2-0.3m in DXF units
class SVGEngine {
  constructor(svgElement) {
    this.svg = svgElement;
    this.dxfLayer = document.getElementById('dxf-layer');
    this.pdfOverlayLayer = document.getElementById('pdf-overlay-layer');
    this.annotationLayer = document.getElementById('annotation-layer');
    this.titleBlockLayer = document.getElementById('title-block-layer');
    this.interactionLayer = document.getElementById('interaction-layer');
    this.gridLayer = document.getElementById('grid-layer');

    // Scale factor: text/symbol sizes in meters (DXF units)
    this.S = {
      fontSmall: 0.25,    // ~2.5mm on A3 at 1:100
      fontMedium: 0.35,   // ~3.5mm
      fontLarge: 0.5,     // ~5mm
      strokeThin: 0.05,
      strokeMedium: 0.08,
      strokeThick: 0.12,
      selPad: 0.3,
      handleSize: 0.4
    };

    // Ensure annotation sub-groups exist
    this._ensureAnnotationGroups();
  }

  _ensureAnnotationGroups() {
    const groupIds = [
      'charging-spaces-group', 'equipment-group', 'dimensions-group',
      'labels-group', 'road-markings-group', 'wheel-stops-group',
      'bollards-group', 'lighting-group', 'foundations-group', 'text-group',
      'wiring-routes-group', 'cubicles-group', 'poles-group', 'handholes-group'
    ];
    for (const gid of groupIds) {
      if (!document.getElementById(gid)) {
        const g = Utils.createSVGElement('g', { id: gid });
        this.annotationLayer.appendChild(g);
      }
    }
  }

  renderDXF(dxfData) {
    this.dxfLayer.innerHTML = '';
    const layerColors = {
      'ROAD': Utils.COLORS.road, 'BUILDING': Utils.COLORS.building,
      'STRUCTURE': Utils.COLORS.structure, 'CENTER': Utils.COLORS.center, '0': '#777',
      // EV annotation layers (for re-imported DXF)
      'EV_CHARGING_SPACE': '#cc0000', 'EV_CHARGER': '#cc0000',
      'EV_DIMENSION': '#0066cc', 'EV_ANNOTATION': '#0066cc',
      'EV_ROAD_MARKING': '#009933', 'EV_WHEEL_STOP': '#555',
      'EV_FOUNDATION': '#333', 'EV_TEXT': '#333',
      'EV_WIRING_ROUTE': '#ff6600', 'EV_CUBICLE': '#ff6600',
      'EV_POLE': '#ff6600', 'EV_HANDHOLE': '#ff6600'
    };
    const layerWidths = {
      'ROAD': 0.08, 'BUILDING': 0.12, 'STRUCTURE': 0.1, 'CENTER': 0.05, '0': 0.08
    };

    for (const [layerName, layerData] of Object.entries(dxfData.layers)) {
      const color = layerColors[layerName] || '#777';
      const width = layerWidths[layerName] || 0.08;
      const group = Utils.createSVGElement('g', {
        id: `layer-${layerName}`, class: 'dxf-layer',
        stroke: color,
        'stroke-width': width,
        fill: 'none'
      });

      // Batch polylines/lines into a single <path> per layer for performance
      if (layerData.polylines && layerData.polylines.length > 0) {
        let d = '';
        for (const pl of layerData.polylines) {
          if (pl.vertices.length < 2) continue;
          const first = pl.vertices[0];
          d += `M${first.x} ${-first.y}`;
          for (let j = 1; j < pl.vertices.length; j++) {
            d += `L${pl.vertices[j].x} ${-pl.vertices[j].y}`;
          }
          if (pl.closed) d += 'Z';
        }
        if (d) {
          group.appendChild(Utils.createSVGElement('path', { d }));
        }
      }
      if (layerData.lines && layerData.lines.length > 0) {
        let d = '';
        for (const ln of layerData.lines) {
          d += `M${ln.x1} ${-ln.y1}L${ln.x2} ${-ln.y2}`;
        }
        if (d) {
          group.appendChild(Utils.createSVGElement('path', { d }));
        }
      }
      // Render text entities
      if (layerData.texts && layerData.texts.length > 0) {
        for (const t of layerData.texts) {
          const attrs = {
            x: t.x, y: -t.y,
            'font-size': t.height || 0.25,
            fill: color,
            stroke: 'none',
            'font-family': "'Meiryo', sans-serif"
          };
          if (t.rotation) {
            attrs.transform = `rotate(${-t.rotation} ${t.x} ${-t.y})`;
          }
          const textEl = Utils.createSVGElement('text', attrs);
          textEl.textContent = t.content;
          group.appendChild(textEl);
        }
      }
      // Render circles
      if (layerData.circles && layerData.circles.length > 0) {
        for (const c of layerData.circles) {
          group.appendChild(Utils.createSVGElement('circle', {
            cx: c.cx, cy: -c.cy, r: c.r
          }));
        }
      }
      // Render arcs
      if (layerData.arcs && layerData.arcs.length > 0) {
        for (const a of layerData.arcs) {
          const startRad = a.startAngle * Math.PI / 180;
          const endRad = a.endAngle * Math.PI / 180;
          const x1 = a.cx + a.r * Math.cos(startRad);
          const y1 = a.cy + a.r * Math.sin(startRad);
          const x2 = a.cx + a.r * Math.cos(endRad);
          const y2 = a.cy + a.r * Math.sin(endRad);
          let sweep = a.endAngle - a.startAngle;
          if (sweep < 0) sweep += 360;
          const largeArc = sweep > 180 ? 1 : 0;
          // SVG Y is inverted
          const d = `M${x1} ${-y1}A${a.r} ${a.r} 0 ${largeArc} 0 ${x2} ${-y2}`;
          group.appendChild(Utils.createSVGElement('path', { d }));
        }
      }
      this.dxfLayer.appendChild(group);
    }
  }

  clearAnnotations() {
    // Clear contents of each sub-group but keep the groups themselves
    this.annotationLayer.querySelectorAll('[id$="-group"]').forEach(g => g.innerHTML = '');
  }

  clearInteraction() { this.interactionLayer.innerHTML = ''; }

  addToGroup(groupId, element) {
    let group = document.getElementById(groupId);
    if (!group) {
      // Auto-create missing group
      group = Utils.createSVGElement('g', { id: groupId });
      this.annotationLayer.appendChild(group);
    }
    group.appendChild(element);
    return element;
  }

  removeAnnotation(elementId) {
    const el = this.annotationLayer.querySelector(`[data-id="${elementId}"]`);
    if (el) el.remove();
  }

  getAnnotations() {
    return this.annotationLayer.querySelectorAll('[data-id]');
  }

  findAnnotationAt(x, y) {
    // Search annotations first (they are on top visually)
    const annotations = this.getAnnotations();
    for (const ann of annotations) {
      // For elements with translate/rotate transforms, use inverse transform
      // to convert the click point into local coordinates for hit testing
      const hasTranslate = ann.dataset.x !== undefined && ann.getAttribute('transform');
      if (hasTranslate) {
        try {
          const svg = this.svg;
          const ctm = ann.getCTM();
          const svgCtm = svg.getCTM();
          if (ctm && svgCtm) {
            // Convert world point to screen, then to element local coords
            const pt = svg.createSVGPoint();
            pt.x = x; pt.y = y;
            const screenPt = pt.matrixTransform(svgCtm);
            const localPt = screenPt.matrixTransform(ctm.inverse());
            const bbox = ann.getBBox();
            if (localPt.x >= bbox.x && localPt.x <= bbox.x + bbox.width &&
                localPt.y >= bbox.y && localPt.y <= bbox.y + bbox.height) {
              return ann;
            }
            continue;
          }
        } catch (e) { /* fallback to simple bbox */ }
      }
      const bbox = ann.getBBox();
      if (x >= bbox.x && x <= bbox.x + bbox.width &&
          y >= bbox.y && y <= bbox.y + bbox.height) {
        return ann;
      }
    }
    // Then search PDF overlays (need to account for transform)
    if (this.pdfOverlayLayer) {
      const overlays = this.pdfOverlayLayer.querySelectorAll('[data-id]');
      for (const ov of overlays) {
        const bbox = ov.getBBox();
        const tx = parseFloat(ov.dataset.x) || 0;
        const ty = parseFloat(ov.dataset.y) || 0;
        const scale = parseFloat(ov.dataset.scale) || 1;
        // Transform bbox to world coordinates
        const wx = tx + bbox.x * scale;
        const wy = ty + bbox.y * scale;
        const ww = bbox.width * scale;
        const wh = bbox.height * scale;
        if (x >= wx && x <= wx + ww && y >= wy && y <= wy + wh) {
          return ov;
        }
      }
    }
    return null;
  }

  showSelection(element) {
    this.clearInteraction();
    if (!element) return;
    const bbox = element.getBBox();
    const pad = this.S.selPad;
    const isPdfOverlay = element.dataset.type === 'pdf-overlay';

    // For elements with transforms, wrap selection handles in a group with same transform
    let container = this.interactionLayer;
    const transformAttr = element.getAttribute('transform');
    if (isPdfOverlay) {
      const tx = parseFloat(element.dataset.x) || 0;
      const ty = parseFloat(element.dataset.y) || 0;
      const rotation = parseFloat(element.dataset.rotation) || 0;
      const scale = parseFloat(element.dataset.scale) || 1;
      const wrapGroup = Utils.createSVGElement('g', {
        transform: `translate(${tx},${ty}) rotate(${rotation}) scale(${scale})`
      });
      this.interactionLayer.appendChild(wrapGroup);
      container = wrapGroup;
    } else if (transformAttr && element.dataset.rotation) {
      // For rotated annotations (e.g., charging-space with translate+rotate)
      const wrapGroup = Utils.createSVGElement('g', {
        transform: transformAttr
      });
      this.interactionLayer.appendChild(wrapGroup);
      container = wrapGroup;
    }

    // Selection box
    const rect = Utils.createSVGElement('rect', {
      x: bbox.x - pad, y: bbox.y - pad,
      width: bbox.width + pad * 2, height: bbox.height + pad * 2,
      class: 'selection-box'
    });
    container.appendChild(rect);

    const hs = this.S.handleSize;
    const cornerNames = ['tl', 'tr', 'bl', 'br'];
    const corners = [
      { x: bbox.x - pad, y: bbox.y - pad },
      { x: bbox.x + bbox.width + pad, y: bbox.y - pad },
      { x: bbox.x - pad, y: bbox.y + bbox.height + pad },
      { x: bbox.x + bbox.width + pad, y: bbox.y + bbox.height + pad }
    ];

    corners.forEach((c, i) => {
      const handle = Utils.createSVGElement('rect', {
        x: c.x - hs / 2, y: c.y - hs / 2, width: hs, height: hs,
        class: 'selection-handle',
        'data-handle': isPdfOverlay ? cornerNames[i] : ''
      });
      if (isPdfOverlay) {
        handle.style.cursor = (i === 0 || i === 3) ? 'nwse-resize' : 'nesw-resize';
        handle.setAttribute('fill', '#fff');
        handle.setAttribute('stroke', '#4a9eff');
        handle.setAttribute('stroke-width', this.S.strokeThin);
      }
      container.appendChild(handle);
    });

    // Rotation handle (only for PDF overlay)
    if (isPdfOverlay) {
      const topCenterX = bbox.x + bbox.width / 2;
      const topCenterY = bbox.y - pad;
      const rotHandleY = topCenterY - hs * 3;

      // Connecting line
      container.appendChild(Utils.createSVGElement('line', {
        x1: topCenterX, y1: topCenterY,
        x2: topCenterX, y2: rotHandleY,
        stroke: '#4a9eff', 'stroke-width': this.S.strokeThin,
        'stroke-dasharray': `${this.S.strokeThin * 3} ${this.S.strokeThin * 2}`
      }));

      // Rotation circle handle
      const rotHandle = Utils.createSVGElement('circle', {
        cx: topCenterX, cy: rotHandleY, r: hs * 0.6,
        fill: '#4a9eff', stroke: '#fff', 'stroke-width': this.S.strokeThin,
        'data-handle': 'rotate', style: 'cursor: grab;'
      });
      container.appendChild(rotHandle);
    }
  }

  // ===== Charging Space =====
  createChargingSpace(id, x, y, width, height, number, rotation = 0) {
    const S = this.S;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'charging-space', 'data-figure': 'plan',
      'data-x': x, 'data-y': y,
      'data-width': width, 'data-height': height, 'data-number': number,
      'data-rotation': rotation,
      transform: `translate(${x},${y}) rotate(${rotation})`
    });

    // Red solid rectangle (local coords: 0,0 to width,height)
    group.appendChild(Utils.createSVGElement('rect', {
      x: 0, y: 0, width, height,
      fill: 'rgba(204,0,0,0.03)', stroke: '#cc0000',
      'stroke-width': S.strokeMedium
    }));

    // Label (red to match border)
    const label = Utils.createSVGElement('text', {
      x: width / 2, y: height / 2 - S.fontSmall * 0.5,
      'text-anchor': 'middle', 'font-size': S.fontSmall,
      fill: '#cc0000', 'font-family': 'Meiryo, sans-serif'
    });
    label.textContent = `【充電スペース${number}】`;
    group.appendChild(label);

    const dimLabel = Utils.createSVGElement('text', {
      x: width / 2, y: height / 2 + S.fontSmall * 1.2,
      'text-anchor': 'middle', 'font-size': S.fontSmall * 0.85,
      fill: '#cc0000', 'font-family': 'Meiryo, sans-serif'
    });
    dimLabel.textContent = `幅${width.toFixed(2)}m×奥行${height.toFixed(1)}m`;
    group.appendChild(dimLabel);

    return this.addToGroup('charging-spaces-group', group);
  }

  // ===== Charger (Dual Stand) =====
  createCharger(id, x, y, rotation = 0, label = '', standType = 'パイルスタンド') {
    const S = this.S;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'charger', 'data-figure': 'shared',
      'data-x': x, 'data-y': y, 'data-rotation': rotation,
      'data-stand-type': standType, 'data-label': label,
      transform: `translate(${x},${y}) rotate(${rotation})`
    });

    // Body: 0.4m x 0.3m
    const w = 0.4, h = 0.3;
    group.appendChild(Utils.createSVGElement('rect', {
      x: -w / 2, y: -h / 2, width: w, height: h,
      fill: 'none', stroke: '#cc0000', 'stroke-width': S.strokeMedium
    }));

    // Front indicator arrow (pointing up)
    const arrowH = 0.12;
    group.appendChild(Utils.createSVGElement('path', {
      d: `M0,${-h / 2 - arrowH} L-${arrowH * 0.6},${-h / 2 - 0.01} L${arrowH * 0.6},${-h / 2 - 0.01} Z`,
      fill: '#cc0000', stroke: 'none'
    }));

    // Dual plugs
    const pr = 0.04;
    group.appendChild(Utils.createSVGElement('circle', {
      cx: -0.08, cy: -0.02, r: pr, fill: '#cc0000'
    }));
    group.appendChild(Utils.createSVGElement('circle', {
      cx: 0.08, cy: -0.02, r: pr, fill: '#0066cc'
    }));

    // EV text inside
    const evText = Utils.createSVGElement('text', {
      x: 0, y: h / 2 - 0.02, 'text-anchor': 'middle',
      'font-size': 0.1, fill: '#cc0000', 'font-weight': 'bold'
    });
    evText.textContent = 'EV';
    group.appendChild(evText);

    // Label below
    if (label) {
      const labelEl = Utils.createSVGElement('text', {
        x: 0, y: h / 2 + S.fontSmall * 1.5,
        'text-anchor': 'middle', 'font-size': S.fontSmall * 0.9,
        fill: '#cc0000', 'font-family': 'Meiryo, sans-serif'
      });
      labelEl.textContent = label;
      group.appendChild(labelEl);
    }

    return this.addToGroup('equipment-group', group);
  }

  // ===== Road Marking (900x900mm) =====
  createRoadMarking(id, x, y, surfaceType = 'アスファルト') {
    const S = this.S;
    const size = 0.9; // 900mm
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'road-marking', 'data-figure': 'plan',
      'data-x': x, 'data-y': y, 'data-surface-type': surfaceType
    });

    group.appendChild(Utils.createSVGElement('rect', {
      x: x - size / 2, y: y - size / 2, width: size, height: size,
      fill: 'rgba(0,153,51,0.08)', stroke: '#009933', 'stroke-width': S.strokeMedium
    }));

    // EV icon
    const evText = Utils.createSVGElement('text', {
      x, y: y + 0.08, 'text-anchor': 'middle',
      'font-size': 0.3, fill: '#009933', 'font-weight': 'bold'
    });
    evText.textContent = 'EV';
    group.appendChild(evText);

    // Label below
    const lbl = Utils.createSVGElement('text', {
      x, y: y + size / 2 + S.fontSmall * 1.5,
      'text-anchor': 'middle', 'font-size': S.fontSmall * 0.85,
      fill: '#009933', 'font-family': 'Meiryo, sans-serif'
    });
    lbl.textContent = '路面表示 新設 900×900';
    group.appendChild(lbl);

    const surfLbl = Utils.createSVGElement('text', {
      x, y: y + size / 2 + S.fontSmall * 3,
      'text-anchor': 'middle', 'font-size': S.fontSmall * 0.75,
      fill: '#009933', 'font-family': 'Meiryo, sans-serif'
    });
    surfLbl.textContent = `（路面状況：${surfaceType}）`;
    group.appendChild(surfLbl);

    return this.addToGroup('road-markings-group', group);
  }

  // ===== Wheel Stop =====
  createWheelStop(id, x, y, rotation = 0) {
    const S = this.S;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'wheel-stop', 'data-figure': 'plan',
      'data-x': x, 'data-y': y, 'data-rotation': rotation,
      transform: `translate(${x},${y}) rotate(${rotation})`
    });
    group.appendChild(Utils.createSVGElement('rect', {
      x: -0.3, y: -0.05, width: 0.6, height: 0.1,
      fill: '#555', stroke: '#333', 'stroke-width': S.strokeThin, rx: 0.02
    }));
    return this.addToGroup('wheel-stops-group', group);
  }

  // ===== Bollard =====
  createBollard(id, x, y) {
    const S = this.S;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'bollard', 'data-figure': 'plan',
      'data-x': x, 'data-y': y
    });
    group.appendChild(Utils.createSVGElement('circle', {
      cx: x, cy: y, r: 0.06,
      fill: 'rgba(100,100,100,0.3)', stroke: '#666', 'stroke-width': S.strokeThin
    }));
    return this.addToGroup('bollards-group', group);
  }

  // ===== Lighting =====
  createLighting(id, x, y) {
    const S = this.S;
    const r = 0.15;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'lighting', 'data-figure': 'plan',
      'data-x': x, 'data-y': y
    });
    group.appendChild(Utils.createSVGElement('circle', {
      cx: x, cy: y, r,
      fill: 'rgba(255,200,0,0.15)', stroke: '#cc6600', 'stroke-width': S.strokeMedium
    }));
    // Cross
    group.appendChild(Utils.createSVGElement('line', {
      x1: x, y1: y - r, x2: x, y2: y + r,
      stroke: '#cc6600', 'stroke-width': S.strokeThin
    }));
    group.appendChild(Utils.createSVGElement('line', {
      x1: x - r, y1: y, x2: x + r, y2: y,
      stroke: '#cc6600', 'stroke-width': S.strokeThin
    }));
    return this.addToGroup('lighting-group', group);
  }

  // ===== Foundation =====
  createFoundation(id, x, y, width, height, depth, material = 'コンクリート') {
    const S = this.S;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'foundation', 'data-figure': 'plan',
      'data-x': x, 'data-y': y, 'data-width': width, 'data-height': height,
      'data-depth': depth, 'data-material': material
    });

    group.appendChild(Utils.createSVGElement('rect', {
      x: x - width / 2, y: y - height / 2, width, height,
      fill: 'rgba(200,200,200,0.2)', stroke: '#333', 'stroke-width': S.strokeMedium
    }));
    // Diagonal hatching
    group.appendChild(Utils.createSVGElement('line', {
      x1: x - width / 2, y1: y - height / 2,
      x2: x + width / 2, y2: y + height / 2,
      stroke: '#999', 'stroke-width': S.strokeThin
    }));
    group.appendChild(Utils.createSVGElement('line', {
      x1: x + width / 2, y1: y - height / 2,
      x2: x - width / 2, y2: y + height / 2,
      stroke: '#999', 'stroke-width': S.strokeThin
    }));

    // Label
    const wMm = Math.round(width * 1000);
    const hMm = Math.round(height * 1000);
    const dMm = Math.round(depth * 1000);
    const lbl = Utils.createSVGElement('text', {
      x, y: y + height / 2 + S.fontSmall * 1.5,
      'text-anchor': 'middle', 'font-size': S.fontSmall * 0.85,
      fill: '#333', 'font-family': 'Meiryo, sans-serif'
    });
    lbl.textContent = `充電設備基礎 ${material} ${wMm}×${hMm}×${dMm}`;
    group.appendChild(lbl);

    return this.addToGroup('foundations-group', group);
  }

  // ===== Leader Line Annotation (text with pointing line) =====
  createLeaderAnnotation(id, targetX, targetY, textX, textY, lines, color = '#009933') {
    const S = this.S;
    const lineArrayForData = Array.isArray(lines) ? lines : [lines];
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'leader', 'data-figure': 'shared',
      'data-x': targetX, 'data-y': targetY, 'data-color': color,
      'data-text-x': textX, 'data-text-y': textY,
      'data-lines': JSON.stringify(lineArrayForData)
    });

    // Leader line from target to text
    group.appendChild(Utils.createSVGElement('line', {
      x1: targetX, y1: targetY, x2: textX, y2: textY,
      stroke: color, 'stroke-width': S.strokeThin
    }));

    // Small circle at target point
    group.appendChild(Utils.createSVGElement('circle', {
      cx: targetX, cy: targetY, r: 0.05,
      fill: color
    }));

    // Text lines
    const lineArray = Array.isArray(lines) ? lines : [lines];
    lineArray.forEach((line, i) => {
      const text = Utils.createSVGElement('text', {
        x: textX, y: textY + i * S.fontSmall * 1.4,
        'font-size': S.fontSmall * 0.85,
        fill: color, 'font-family': 'Meiryo, sans-serif'
      });
      text.textContent = line;
      group.appendChild(text);
    });

    return this.addToGroup('labels-group', group);
  }

  // ===== Dimension Line =====
  createDimension(id, x1, y1, x2, y2, labelOverride, dimColor = '#0066cc') {
    const S = this.S;
    const sw = S.strokeThin;
    const fs = S.fontSmall;
    const color = dimColor;

    // Ensure marker defs exist for this color
    this._ensureDimMarker(color);

    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'dimension', 'data-figure': 'shared',
      'data-x': x1, 'data-y': y1, 'data-x2': x2, 'data-y2': y2,
      'data-label-override': labelOverride || '', 'data-color': color
    });

    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const distMm = Math.round(distance * 1000);
    const label = labelOverride || Utils.formatDimension(distMm);
    group.dataset.distance = distMm;

    const isHorizontal = Math.abs(dx) > Math.abs(dy);
    const offset = 0.6;
    const extGap = 0.1;

    if (isHorizontal) {
      const y = Math.min(y1, y2) - offset;
      group.appendChild(Utils.createSVGElement('line', {
        x1, y1, x2: x1, y2: y - extGap,
        stroke: color, 'stroke-width': sw
      }));
      group.appendChild(Utils.createSVGElement('line', {
        x1: x2, y1: y2, x2, y2: y - extGap,
        stroke: color, 'stroke-width': sw
      }));
      const mId = this._dimMarkerId(color);
      group.appendChild(Utils.createSVGElement('line', {
        x1, y1: y, x2, y2: y,
        stroke: color, 'stroke-width': sw,
        'marker-start': `url(#${mId}-start)`,
        'marker-end': `url(#${mId}-end)`
      }));
      const text = Utils.createSVGElement('text', {
        x: (x1 + x2) / 2, y: y - extGap * 2,
        'text-anchor': 'middle', 'font-size': fs,
        fill: color, 'font-family': 'Meiryo, sans-serif'
      });
      text.textContent = label;
      group.appendChild(text);
    } else {
      const mId = this._dimMarkerId(color);
      const x = Math.max(x1, x2) + offset;
      group.appendChild(Utils.createSVGElement('line', {
        x1, y1, x2: x + extGap, y2: y1,
        stroke: color, 'stroke-width': sw
      }));
      group.appendChild(Utils.createSVGElement('line', {
        x1: x2, y1: y2, x2: x + extGap, y2: y2,
        stroke: color, 'stroke-width': sw
      }));
      group.appendChild(Utils.createSVGElement('line', {
        x1: x, y1, x2: x, y2: y2,
        stroke: color, 'stroke-width': sw,
        'marker-start': `url(#${mId}-start)`,
        'marker-end': `url(#${mId}-end)`
      }));
      const text = Utils.createSVGElement('text', {
        x: x + fs * 0.5, y: (y1 + y2) / 2,
        'text-anchor': 'middle', 'font-size': fs,
        fill: color, 'font-family': 'Meiryo, sans-serif',
        transform: `rotate(-90, ${x + fs * 0.5}, ${(y1 + y2) / 2})`
      });
      text.textContent = label;
      group.appendChild(text);
    }

    return this.addToGroup('dimensions-group', group);
  }

  // Helper: generate a stable marker ID from a color hex string
  _dimMarkerId(color) {
    return 'dim-arrow-' + color.replace('#', '');
  }

  // Ensure SVG <defs> contains arrow markers for the given color
  _ensureDimMarker(color) {
    const id = this._dimMarkerId(color);
    if (this.svg.querySelector(`#${id}-start`)) return; // already exists

    const defs = this.svg.querySelector('defs') || (() => {
      const d = Utils.createSVGElement('defs', {});
      this.svg.insertBefore(d, this.svg.firstChild);
      return d;
    })();

    const makeMarker = (markerId, refX) => {
      const m = Utils.createSVGElement('marker', {
        id: markerId, viewBox: '0 0 10 10',
        refX, refY: 5, markerWidth: 4, markerHeight: 4,
        orient: 'auto-start-reverse', markerUnits: 'strokeWidth'
      });
      const path = Utils.createSVGElement('path', {
        d: refX === 0 ? 'M 0 5 L 10 0 L 10 10 Z' : 'M 10 5 L 0 0 L 0 10 Z',
        fill: color
      });
      m.appendChild(path);
      defs.appendChild(m);
    };

    makeMarker(`${id}-start`, 0);
    makeMarker(`${id}-end`, 10);
  }

  // ===== Boundary Rectangle (充電エリア囲み線) =====
  createBoundaryRect(id, x, y, width, height, color = '#0066cc') {
    const S = this.S;
    const sw = S.strokeThin * 1.2;
    const fs = S.fontSmall;

    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'boundary-rect', 'data-figure': 'plan',
      'data-x': x, 'data-y': y, 'data-width': width, 'data-height': height,
      'data-color': color
    });

    // Rectangle outline
    group.appendChild(Utils.createSVGElement('rect', {
      x, y, width, height,
      fill: 'none', stroke: color, 'stroke-width': sw
    }));

    // Dimension labels on edges
    const wMm = Math.round(width * 1000);
    const hMm = Math.round(height * 1000);

    // Top: width dimension
    const topText = Utils.createSVGElement('text', {
      x: x + width / 2, y: y - fs * 0.5,
      'text-anchor': 'middle', 'font-size': fs,
      fill: color, 'font-family': 'Meiryo, sans-serif'
    });
    topText.textContent = Utils.formatDimension(wMm);
    group.appendChild(topText);

    // Right: height dimension
    const rightText = Utils.createSVGElement('text', {
      x: x + width + fs * 0.5, y: y + height / 2,
      'text-anchor': 'middle', 'font-size': fs,
      fill: color, 'font-family': 'Meiryo, sans-serif',
      transform: `rotate(-90, ${x + width + fs * 0.5}, ${y + height / 2})`
    });
    rightText.textContent = Utils.formatDimension(hMm);
    group.appendChild(rightText);

    return this.addToGroup('dimensions-group', group);
  }

  // ===== Text Annotation =====
  createTextAnnotation(id, x, y, text, fontSize, color = '#333') {
    const S = this.S;
    const actualSize = fontSize ? fontSize * 0.1 : S.fontMedium; // Convert if legacy size passed
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'text', 'data-figure': 'shared',
      'data-x': x, 'data-y': y, 'data-color': color,
      'data-text': text, 'data-font-size': (fontSize !== undefined && fontSize !== null) ? fontSize : ''
    });
    // Support multi-line text (split by \n)
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const textEl = Utils.createSVGElement('text', {
        x, y: y + i * actualSize * 1.4, 'font-size': actualSize, fill: color,
        'font-family': 'Meiryo, sans-serif'
      });
      textEl.textContent = line;
      group.appendChild(textEl);
    });
    return this.addToGroup('text-group', group);
  }

  // ===== Cubicle / Distribution Panel (キュービクル/分電盤) =====
  createCubicle(id, x, y, width = 1.0, height = 0.6, label = '分電盤') {
    const S = this.S;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'cubicle', 'data-figure': 'shared',
      'data-x': x, 'data-y': y, 'data-width': width, 'data-height': height,
      'data-label': label
    });

    group.appendChild(Utils.createSVGElement('rect', {
      x: x - width / 2, y: y - height / 2, width, height,
      fill: 'rgba(0,153,51,0.05)', stroke: '#009933', 'stroke-width': S.strokeMedium
    }));

    // Label inside
    const lbl = Utils.createSVGElement('text', {
      x, y: y + S.fontSmall * 0.3, 'text-anchor': 'middle',
      'font-size': S.fontSmall, fill: '#009933', 'font-family': 'Meiryo, sans-serif'
    });
    lbl.textContent = label;
    group.appendChild(lbl);

    return this.addToGroup('cubicles-group', group);
  }

  // ===== Pole (建柱/引込柱) =====
  createPole(id, x, y, material = 'コンクリート', height = '8m') {
    const S = this.S;
    const r = 0.15;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'pole', 'data-figure': 'route',
      'data-x': x, 'data-y': y, 'data-material': material, 'data-pole-height': height
    });

    // Circle with cross
    group.appendChild(Utils.createSVGElement('circle', {
      cx: x, cy: y, r,
      fill: 'rgba(102,51,0,0.1)', stroke: '#663300', 'stroke-width': S.strokeMedium
    }));
    group.appendChild(Utils.createSVGElement('line', {
      x1: x - r, y1: y - r, x2: x + r, y2: y + r,
      stroke: '#663300', 'stroke-width': S.strokeThin
    }));
    group.appendChild(Utils.createSVGElement('line', {
      x1: x + r, y1: y - r, x2: x - r, y2: y + r,
      stroke: '#663300', 'stroke-width': S.strokeThin
    }));

    // Label below
    const lbl = Utils.createSVGElement('text', {
      x, y: y + r + S.fontSmall * 1.5, 'text-anchor': 'middle',
      'font-size': S.fontSmall * 0.85, fill: '#663300', 'font-family': 'Meiryo, sans-serif'
    });
    lbl.textContent = `建柱 ${material} H=${height}`;
    group.appendChild(lbl);

    return this.addToGroup('poles-group', group);
  }

  // ===== Handhole (ハンドホール) =====
  createHandhole(id, x, y, material = 'コンクリート', w = 0.4, d = 0.4, h = 0.4) {
    const S = this.S;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'handhole', 'data-figure': 'route',
      'data-x': x, 'data-y': y, 'data-material': material,
      'data-hh-w': w, 'data-hh-d': d, 'data-hh-h': h
    });

    // Small square
    const sz = 0.3;
    group.appendChild(Utils.createSVGElement('rect', {
      x: x - sz / 2, y: y - sz / 2, width: sz, height: sz,
      fill: 'rgba(100,100,100,0.1)', stroke: '#666', 'stroke-width': S.strokeMedium
    }));

    // "HH" text inside
    const hhText = Utils.createSVGElement('text', {
      x, y: y + 0.04, 'text-anchor': 'middle',
      'font-size': 0.12, fill: '#666', 'font-weight': 'bold'
    });
    hhText.textContent = 'HH';
    group.appendChild(hhText);

    // Label below
    const wMm = Math.round(w * 1000), dMm = Math.round(d * 1000), hMm = Math.round(h * 1000);
    const lbl = Utils.createSVGElement('text', {
      x, y: y + sz / 2 + S.fontSmall * 1.5, 'text-anchor': 'middle',
      'font-size': S.fontSmall * 0.75, fill: '#666', 'font-family': 'Meiryo, sans-serif'
    });
    lbl.textContent = `HH ${material} ${wMm}×${dMm}×${hMm}`;
    group.appendChild(lbl);

    return this.addToGroup('handholes-group', group);
  }

  // ===== Pull Box (プルボックス) =====
  createPullBox(id, x, y, size = '200', material = 'SUS') {
    const S = this.S;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'pullbox', 'data-figure': 'route',
      'data-x': x, 'data-y': y, 'data-pb-size': size, 'data-material': material
    });

    // Square size based on dimension (200mm → 0.2m in DXF)
    const sz = 0.25; // Display size
    group.appendChild(Utils.createSVGElement('rect', {
      x: x - sz / 2, y: y - sz / 2, width: sz, height: sz,
      fill: 'rgba(0,102,204,0.08)', stroke: '#0066cc', 'stroke-width': S.strokeMedium
    }));

    // "PB" text inside
    const pbText = Utils.createSVGElement('text', {
      x, y: y + 0.03, 'text-anchor': 'middle',
      'font-size': 0.09, fill: '#0066cc', 'font-weight': 'bold',
      'font-family': 'Meiryo, sans-serif'
    });
    pbText.textContent = 'PB';
    group.appendChild(pbText);

    // Label below
    const lbl = Utils.createSVGElement('text', {
      x, y: y + sz / 2 + S.fontSmall * 1.3, 'text-anchor': 'middle',
      'font-size': S.fontSmall * 0.75, fill: '#0066cc', 'font-family': 'Meiryo, sans-serif'
    });
    lbl.textContent = `PB ${material} ${size}`;
    group.appendChild(lbl);

    return this.addToGroup('pullboxes-group', group);
  }

  // ===== Existing Charger (既設充電設備) =====
  createExistingCharger(id, x, y, rotation = 0, label = '') {
    const S = this.S;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'existing-charger', 'data-figure': 'route',
      'data-x': x, 'data-y': y, 'data-rotation': rotation, 'data-label': label,
      transform: `translate(${x},${y}) rotate(${rotation})`
    });

    const w = 0.4, h = 0.3;
    group.appendChild(Utils.createSVGElement('rect', {
      x: -w / 2, y: -h / 2, width: w, height: h,
      fill: 'none', stroke: '#ff8800', 'stroke-width': S.strokeMedium,
      'stroke-dasharray': `${S.strokeMedium * 3} ${S.strokeMedium * 2}`
    }));

    const evText = Utils.createSVGElement('text', {
      x: 0, y: 0.04, 'text-anchor': 'middle',
      'font-size': 0.1, fill: '#ff8800', 'font-weight': 'bold'
    });
    evText.textContent = 'EV';
    group.appendChild(evText);

    // "(既設)" label below
    const lblText = label ? `${label} (既設)` : '(既設)';
    const lbl = Utils.createSVGElement('text', {
      x: 0, y: h / 2 + S.fontSmall * 1.5, 'text-anchor': 'middle',
      'font-size': S.fontSmall * 0.85, fill: '#ff8800', 'font-family': 'Meiryo, sans-serif'
    });
    lbl.textContent = lblText;
    group.appendChild(lbl);

    return this.addToGroup('equipment-group', group);
  }

  // ===== Wiring Route (配線ルート) =====
  // Benchmark style: red lines with multi-line annotation blocks offset from route
  createWiringRoute(id, vertices, segments) {
    const S = this.S;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'wiring-route', 'data-figure': 'route',
      'data-x': vertices[0].x, 'data-y': vertices[0].y
    });
    group.dataset.routeData = JSON.stringify({ vertices, segments });

    const routeColor = '#cc0000'; // Red — matches benchmark examples
    const methodStyles = {
      exposed: { dash: 'none', label: '露出' },
      buried:  { dash: `${0.3} ${0.15}`, label: '埋設' },
      aerial:  { dash: `${0.6} ${0.1} ${0.1} ${0.1}`, label: '架空' }
    };

    // Draw route lines
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const v1 = vertices[i];
      const v2 = vertices[i + 1];
      if (!v1 || !v2) continue;

      const style = methodStyles[seg.method] || methodStyles.exposed;

      // Segment line
      const lineAttrs = {
        x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y,
        stroke: routeColor, 'stroke-width': S.strokeMedium * 1.2
      };
      if (style.dash !== 'none') lineAttrs['stroke-dasharray'] = style.dash;
      group.appendChild(Utils.createSVGElement('line', lineAttrs));

      // Dimension label along segment (length in mm)
      const mx = (v1.x + v2.x) / 2;
      const my = (v1.y + v2.y) / 2;
      const dx = v2.x - v1.x;
      const dy = v2.y - v1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const lenMm = Math.round(len * 1000);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const textAngle = (angle > 90 || angle < -90) ? angle + 180 : angle;

      // Small offset perpendicular to segment for length label
      const perpX = -dy / (len || 1) * S.fontSmall * 0.8;
      const perpY = dx / (len || 1) * S.fontSmall * 0.8;

      const dimLbl = Utils.createSVGElement('text', {
        x: mx + perpX, y: my + perpY,
        'text-anchor': 'middle', 'font-size': S.fontSmall * 0.7,
        fill: '#0066cc', 'font-family': 'Meiryo, sans-serif',
        transform: `rotate(${textAngle}, ${mx + perpX}, ${my + perpY})`
      });
      dimLbl.textContent = Utils.formatDimension(lenMm);
      group.appendChild(dimLbl);
    }

    // Vertex markers (red filled triangles at junctions like benchmark)
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (i === 0 || i === vertices.length - 1) {
        // Endpoint: red filled diamond
        const sz = 0.08;
        const diamond = Utils.createSVGElement('polygon', {
          points: `${v.x},${v.y - sz} ${v.x + sz},${v.y} ${v.x},${v.y + sz} ${v.x - sz},${v.y}`,
          fill: routeColor, stroke: routeColor, 'stroke-width': S.strokeThin * 0.3
        });
        group.appendChild(diamond);
      } else {
        // Junction: small circle
        group.appendChild(Utils.createSVGElement('circle', {
          cx: v.x, cy: v.y, r: 0.05,
          fill: routeColor, stroke: '#fff', 'stroke-width': S.strokeThin * 0.3
        }));
      }
    }

    return this.addToGroup('wiring-routes-group', group);
  }

  // ===== Wiring Summary Table (配線集計表) =====
  // Benchmark format: hierarchical table per cable type with 全長→内訳(露出/管内/埋設)
  createWiringSummaryTable(id, x, y, summaryData) {
    const S = this.S;
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'wiring-summary', 'data-figure': 'route',
      'data-x': x, 'data-y': y,
      'data-summary-data': JSON.stringify(summaryData)
    });

    const fs = S.fontSmall * 0.7;
    const lineH = fs * 1.8;
    const indent1 = 0.3;  // 内訳 indent
    const indent2 = 0.6;  // 管内/sub indent
    const colRight = 6.0; // right edge for length values
    const tableW = 7.0;
    const textColor = '#009933'; // Green — matches benchmark annotation color

    // Build hierarchical data: group by cableSpec
    const byCable = {};
    const rows = Array.isArray(summaryData) ? summaryData : (summaryData.rows || summaryData);
    for (const row of rows) {
      const cable = row.cableSpec || '不明';
      if (!byCable[cable]) byCable[cable] = { total: 0, exposed: 0, conduit: [], buried: [] };
      const entry = byCable[cable];
      const len = typeof row.length === 'number' ? row.length : parseFloat(row.length) || 0;
      entry.total += len;
      const method = row.method || '露出';
      if (method === '埋設' || row.surfaceType) {
        entry.buried.push({ conduit: row.conduitSpec || '', length: len, surface: row.surfaceType || '' });
      } else if (row.conduitSpec) {
        entry.conduit.push({ conduit: row.conduitSpec, method: method, length: len });
        // exposed length does not include conduit lines
      } else {
        entry.exposed += len;
      }
    }

    // Render table lines
    let cy = y;
    const addLine = (text, lengthVal, xIndent, bold) => {
      const t = Utils.createSVGElement('text', {
        x: x + xIndent, y: cy + lineH * 0.7,
        'text-anchor': 'start', 'font-size': fs,
        fill: textColor, 'font-family': 'Meiryo, sans-serif',
        'font-weight': bold ? 'bold' : 'normal'
      });
      t.textContent = text;
      group.appendChild(t);

      if (lengthVal !== undefined && lengthVal !== null) {
        const vt = Utils.createSVGElement('text', {
          x: x + colRight, y: cy + lineH * 0.7,
          'text-anchor': 'end', 'font-size': fs,
          fill: textColor, 'font-family': 'Meiryo, sans-serif',
          'font-weight': bold ? 'bold' : 'normal'
        });
        vt.textContent = `${Math.round(lengthVal * 10) / 10}m`;
        group.appendChild(vt);
      }
      cy += lineH;
    };

    for (const [cable, data] of Object.entries(byCable)) {
      // Cable header: CV22sq-2C  全長  35m
      addLine(`${cable}　全長`, data.total, 0, true);

      // 内訳  露出
      if (data.exposed > 0) {
        addLine(`内訳　露出`, data.exposed, indent1, false);
      }

      // 管内 (conduit lines)
      if (data.conduit.length > 0) {
        addLine(`管内`, null, indent1, false);
        for (const c of data.conduit) {
          const desc = `合成樹脂　${c.method}　${c.conduit}`;
          addLine(desc, c.length, indent2, false);
        }
      }

      // 埋設
      if (data.buried.length > 0) {
        for (const b of data.buried) {
          const desc = `埋設　合成樹脂　埋設　${b.conduit}`;
          addLine(desc, b.length, indent1, false);
        }
      }
    }

    // Border around entire table
    const totalH = cy - y;
    group.appendChild(Utils.createSVGElement('rect', {
      x, y, width: tableW, height: totalH,
      fill: 'none', stroke: '#333', 'stroke-width': S.strokeThin
    }));

    // Horizontal separator after each cable header (optional: add dividers)
    // The benchmark uses simple line separators between cable sections

    return this.addToGroup('text-group', group);
  }
}
