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
      return { type, id, routeData };
    }
    if (def.special === 'wiring-summary') {
      let summaryData = null;
      try { summaryData = JSON.parse(dataset.summaryData); } catch (e) { summaryData = null; }
      return { type, id, x: parseFloat(dataset.x), y: parseFloat(dataset.y), summaryData };
    }
    const rec = { type, id };
    for (const f of def.fields) {
      rec[f.name] = this._coerce(f.kind, dataset[f.key]);
    }
    return rec;
  },

  createCallFromRecord(record) {
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
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StateSerializer;
}
