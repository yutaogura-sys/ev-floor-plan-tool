// 配線ルート図系の図形生成メソッド（svg-engine.js から分離）。挙動不変。
Object.assign(SVGEngine.prototype, {
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
  },

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
      'font-size': S.fontSmall * 0.85, fill: '#663300', 'font-family': 'Meiryo, sans-serif',
      class: 'detail-label'
    });
    lbl.textContent = `建柱 ${material} H=${height}`;
    group.appendChild(lbl);

    return this.addToGroup('poles-group', group);
  },

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
      'font-size': S.fontSmall * 0.75, fill: '#666', 'font-family': 'Meiryo, sans-serif',
      class: 'detail-label'
    });
    lbl.textContent = `HH ${material} ${wMm}×${dMm}×${hMm}`;
    group.appendChild(lbl);

    return this.addToGroup('handholes-group', group);
  },

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
      'font-size': S.fontSmall * 0.75, fill: '#0066cc', 'font-family': 'Meiryo, sans-serif',
      class: 'detail-label'
    });
    lbl.textContent = `PB ${material} ${size}`;
    group.appendChild(lbl);

    return this.addToGroup('pullboxes-group', group);
  },

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
  },

  // ===== Wiring Route (配線ルート) =====
  // Benchmark style: red lines with multi-line annotation blocks offset from route
  createWiringRoute(id, vertices, segments) {
    const S = this.S;
    // 不正/空の routeData でも throw しないよう正規化（破損データの復元で黙って消えるのを防ぐ）
    vertices = Array.isArray(vertices) ? vertices : [];
    segments = Array.isArray(segments) ? segments : [];
    const group = Utils.createSVGElement('g', {
      'data-id': id, 'data-type': 'wiring-route', 'data-figure': 'route',
      'data-x': vertices.length ? vertices[0].x : 0, 'data-y': vertices.length ? vertices[0].y : 0
    });
    group.dataset.routeData = JSON.stringify({ vertices, segments });
    if (vertices.length === 0) {
      // 頂点が無ければ描画せず、データだけ保持して返す（往復で保全）
      return this.addToGroup('wiring-routes-group', group);
    }

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
  },

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
});
