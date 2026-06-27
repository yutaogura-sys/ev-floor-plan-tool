// State Serializer — DOM(注釈) ⇄ JSON 相互変換
// SCHEMA は各注釈タイプの「createXxx 引数順」と「data-* 属性キー」の対応表。
const StateSerializer = {
  // kind: 'number' は parseFloat、'string' はそのまま、'json' は JSON.parse/stringify
  SCHEMA: {
    'charging-space': {
      method: 'createChargingSpace',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'width', key: 'width', kind: 'number' },
        { name: 'height', key: 'height', kind: 'number' },
        { name: 'number', key: 'number', kind: 'string' },
        { name: 'rotation', key: 'rotation', kind: 'number' }
      ]
    },
    'charger': {
      method: 'createCharger',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'rotation', key: 'rotation', kind: 'number' },
        { name: 'label', key: 'label', kind: 'string' },
        { name: 'standType', key: 'standType', kind: 'string' }
      ]
    },
    'road-marking': {
      method: 'createRoadMarking',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'surfaceType', key: 'surfaceType', kind: 'string' }
      ]
    },
    'wheel-stop': {
      method: 'createWheelStop',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'rotation', key: 'rotation', kind: 'number' }
      ]
    },
    'bollard': {
      method: 'createBollard',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' }
      ]
    },
    'lighting': {
      method: 'createLighting',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' }
      ]
    },
    'foundation': {
      method: 'createFoundation',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'width', key: 'width', kind: 'number' },
        { name: 'height', key: 'height', kind: 'number' },
        { name: 'depth', key: 'depth', kind: 'number' },
        { name: 'material', key: 'material', kind: 'string' }
      ]
    },
    'leader': {
      method: 'createLeaderAnnotation',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'textX', key: 'textX', kind: 'number' },
        { name: 'textY', key: 'textY', kind: 'number' },
        { name: 'lines', key: 'lines', kind: 'json' },
        { name: 'color', key: 'color', kind: 'string' }
      ]
    },
    'dimension': {
      method: 'createDimension',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'x2', key: 'x2', kind: 'number' },
        { name: 'y2', key: 'y2', kind: 'number' },
        { name: 'labelOverride', key: 'labelOverride', kind: 'string' },
        { name: 'color', key: 'color', kind: 'string' }
      ]
    },
    'boundary-rect': {
      method: 'createBoundaryRect',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'width', key: 'width', kind: 'number' },
        { name: 'height', key: 'height', kind: 'number' },
        { name: 'color', key: 'color', kind: 'string' }
      ]
    },
    'text': {
      method: 'createTextAnnotation',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'text', key: 'text', kind: 'string' },
        { name: 'fontSize', key: 'fontSize', kind: 'number' },
        { name: 'color', key: 'color', kind: 'string' }
      ]
    },
    'cubicle': {
      method: 'createCubicle',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'width', key: 'width', kind: 'number' },
        { name: 'height', key: 'height', kind: 'number' },
        { name: 'label', key: 'label', kind: 'string' }
      ]
    },
    'pole': {
      method: 'createPole',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'material', key: 'material', kind: 'string' },
        { name: 'poleHeight', key: 'poleHeight', kind: 'string' }
      ]
    },
    'handhole': {
      method: 'createHandhole',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'material', key: 'material', kind: 'string' },
        { name: 'hhW', key: 'hhW', kind: 'number' },
        { name: 'hhD', key: 'hhD', kind: 'number' },
        { name: 'hhH', key: 'hhH', kind: 'number' }
      ]
    },
    'pullbox': {
      method: 'createPullBox',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'pbSize', key: 'pbSize', kind: 'string' },
        { name: 'material', key: 'material', kind: 'string' }
      ]
    },
    'existing-charger': {
      method: 'createExistingCharger',
      fields: [
        { name: 'x', key: 'x', kind: 'number' },
        { name: 'y', key: 'y', kind: 'number' },
        { name: 'rotation', key: 'rotation', kind: 'number' },
        { name: 'label', key: 'label', kind: 'string' }
      ]
    },
    'wiring-route': {
      method: 'createWiringRoute',
      special: 'wiring-route'
    },
    'wiring-summary': {
      method: 'createWiringSummaryTable',
      special: 'wiring-summary'
    }
  },

  _coerce(kind, raw) {
    if (kind === 'number') return parseFloat(raw);
    if (kind === 'json') {
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
    return raw !== undefined && raw !== null ? String(raw) : '';
  },

  recordFromDataset(type, dataset) {
    const def = this.SCHEMA[type];
    if (!def) return null;
    const id = dataset.id;
    if (def.special === 'wiring-route') {
      let routeData = null;
      try { routeData = JSON.parse(dataset.routeData); } catch (e) { routeData = null; }
      const wr = { type, id, routeData };
      if (dataset.figure !== undefined) wr.figure = dataset.figure;
      return wr;
    }
    if (def.special === 'wiring-summary') {
      let summaryData = null;
      try { summaryData = JSON.parse(dataset.summaryData); } catch (e) { summaryData = null; }
      const ws = { type, id, x: parseFloat(dataset.x), y: parseFloat(dataset.y), summaryData };
      if (dataset.figure !== undefined) ws.figure = dataset.figure;
      return ws;
    }
    const rec = { type, id };
    for (const f of def.fields) {
      rec[f.name] = this._coerce(f.kind, dataset[f.key]);
    }
    if (dataset.figure !== undefined) rec.figure = dataset.figure;
    // 詳細ラベルの手動オフセット（#4）。0/未設定は保持しない（スナップショット差分を増やさない）。
    if (dataset.labelDx !== undefined && parseFloat(dataset.labelDx)) rec.labelDx = parseFloat(dataset.labelDx);
    if (dataset.labelDy !== undefined && parseFloat(dataset.labelDy)) rec.labelDy = parseFloat(dataset.labelDy);
    return rec;
  },

  createCallFromRecord(record) {
    // 不正/欠損レコード（破損プロジェクト読込時の null 要素など）でも throw しない
    if (!record || typeof record !== 'object') return null;
    const def = this.SCHEMA[record.type];
    if (!def) return null;
    if (def.special === 'wiring-route') {
      const rd = record.routeData || { vertices: [], segments: [] };
      return { method: def.method, args: [record.id, rd.vertices, rd.segments] };
    }
    if (def.special === 'wiring-summary') {
      return { method: def.method, args: [record.id, record.x, record.y, record.summaryData] };
    }
    const args = [record.id];
    for (const f of def.fields) {
      args.push(record[f.name]);
    }
    return { method: def.method, args };
  },

  // レコード配列を (dx,dy) 平行移動した「新しい配列」を返す純関数（コピー&ペーストの貼付位置算出）。
  // 平行移動対象: x/textX/x2 に +dx、y/textY/y2 に +dy、wiring-route の各頂点、wiring-summary の x/y。
  // id は変更しない（呼び出し側で新規 id を割り当てる）。元レコードは変更しない（ディープコピー）。
  offsetRecords(records, dx, dy) {
    if (!Array.isArray(records)) return [];
    const XK = ['x', 'textX', 'x2'];
    const YK = ['y', 'textY', 'y2'];
    return records.map(rec => {
      if (!rec || typeof rec !== 'object') return rec;
      const r = JSON.parse(JSON.stringify(rec));
      XK.forEach(k => { if (typeof r[k] === 'number' && isFinite(r[k])) r[k] += dx; });
      YK.forEach(k => { if (typeof r[k] === 'number' && isFinite(r[k])) r[k] += dy; });
      if (r.routeData && Array.isArray(r.routeData.vertices)) {
        r.routeData.vertices = r.routeData.vertices.map(v => {
          if (v && typeof v === 'object') {
            const nv = Object.assign({}, v);
            if (typeof nv.x === 'number') nv.x += dx;
            if (typeof nv.y === 'number') nv.y += dy;
            return nv;
          }
          return v;
        });
      }
      return r;
    });
  },

  serializeAnnotations(svgEngine) {
    const out = [];
    const nodes = svgEngine.getAnnotations();
    nodes.forEach(node => {
      const type = node.dataset.type;
      if (!type || !this.SCHEMA[type]) return; // 未対応はスキップ
      const rec = this.recordFromDataset(type, node.dataset);
      if (rec) out.push(rec);
    });
    return out;
  },

  deserializeAnnotations(svgEngine, records) {
    svgEngine.clearAnnotations();
    let skipped = 0;
    for (const rec of (records || [])) {
      const call = this.createCallFromRecord(rec);
      if (!call || typeof svgEngine[call.method] !== 'function') { skipped++; continue; }
      try {
        const el = svgEngine[call.method].apply(svgEngine, call.args);
        if (el && rec.figure) el.setAttribute('data-figure', rec.figure);
        // 詳細ラベルの手動オフセット（#4）を復元
        if (el && (rec.labelDx || rec.labelDy)) {
          el.dataset.labelDx = rec.labelDx || 0;
          el.dataset.labelDy = rec.labelDy || 0;
          if (typeof svgEngine.applyLabelOffset === 'function') svgEngine.applyLabelOffset(el);
        }
      } catch (e) {
        skipped++;
        console.warn('注釈の復元に失敗:', rec.type, rec.id, e);
      }
    }
    if (skipped > 0) console.warn(`${skipped}件の注釈を復元できませんでした`);
    return { restored: (records || []).length - skipped, skipped };
  },

  snapshot(svgEngine) {
    return JSON.stringify(this.serializeAnnotations(svgEngine));
  },

  restore(svgEngine, snapshotString) {
    let records = [];
    try { records = JSON.parse(snapshotString) || []; } catch (e) { records = []; }
    return this.deserializeAnnotations(svgEngine, records);
  },

  serializeProject(svgEngine, titleBlockData, viewBox, dxfName) {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      titleBlock: titleBlockData || {},
      dxf: { fileName: dxfName || null, loaded: !!dxfName },
      annotations: this.serializeAnnotations(svgEngine),
      viewBox: viewBox || null
    };
  },

  deserializeProject(svgEngine, state) {
    const result = this.deserializeAnnotations(svgEngine, (state && state.annotations) || []);
    return { result, titleBlock: (state && state.titleBlock) || {}, viewBox: (state && state.viewBox) || null };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StateSerializer;
}
