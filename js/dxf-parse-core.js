// DXF R12 解析コア（Worker・メインスレッド共用）。
// Worker からは importScripts() で、メインスレッド(file://フォールバック)からは <script> で読み込む。
// 進捗は onProgress(percent) コールバックで通知（self.postMessage 非依存）。Nodeテスト可能（純関数）。

function parseDXF(text, onProgress) {
  const lines = text.split('\n');
  const totalLines = lines.length;
  let i = 0;

  const layers = {};
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  function ensureLayer(name) {
    if (!layers[name]) layers[name] = { polylines: [], lines: [], texts: [], circles: [], arcs: [] };
    return layers[name];
  }

  // Skip to ENTITIES section
  let inEntities = false;
  while (i < totalLines) {
    const code = lines[i].trim();
    const value = (i + 1 < totalLines) ? lines[i + 1].trim() : '';
    if (code === '0' && value === 'SECTION') {
      i += 2;
      const secCode = lines[i].trim();
      const secValue = (i + 1 < totalLines) ? lines[i + 1].trim() : '';
      if (secCode === '2' && secValue === 'ENTITIES') {
        inEntities = true;
        i += 2;
        break;
      }
    }
    i += 2;
  }

  if (!inEntities) {
    return { layers: {}, bounds };
  }

  // Parse entities
  let progressLast = 0;
  while (i < totalLines - 1) {
    const code = lines[i].trim();
    const value = (i + 1 < totalLines) ? lines[i + 1].trim() : '';

    // Progress reporting (every 2%)
    const progress = Math.floor((i / totalLines) * 100);
    if (progress >= progressLast + 2) {
      progressLast = progress;
      if (onProgress) onProgress(progress);
    }

    if (code === '0' && value === 'ENDSEC') break;

    if (code === '0' && value === 'POLYLINE') {
      i += 2;
      const polyline = parsePolyline(lines, i, totalLines);
      i = polyline.nextIndex;
      const lay = ensureLayer(polyline.layer || '0');
      lay.polylines.push({ vertices: polyline.vertices, closed: polyline.closed });
      for (const v of polyline.vertices) updateBoundsPoint(bounds, v.x, v.y);
    } else if (code === '0' && value === 'LINE') {
      i += 2;
      const line = parseLine(lines, i, totalLines);
      i = line.nextIndex;
      const lay = ensureLayer(line.layer || '0');
      lay.lines.push({ x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 });
      updateBoundsPoint(bounds, line.x1, line.y1);
      updateBoundsPoint(bounds, line.x2, line.y2);
    } else if (code === '0' && value === 'LWPOLYLINE') {
      i += 2;
      const lwp = parseLWPolyline(lines, i, totalLines);
      i = lwp.nextIndex;
      const lay = ensureLayer(lwp.layer || '0');
      lay.polylines.push({ vertices: lwp.vertices, closed: lwp.closed });
      for (const v of lwp.vertices) updateBoundsPoint(bounds, v.x, v.y);
    } else if (code === '0' && value === 'TEXT') {
      i += 2;
      const txt = parseText(lines, i, totalLines);
      i = txt.nextIndex;
      const lay = ensureLayer(txt.layer || '0');
      lay.texts.push({ x: txt.x, y: txt.y, height: txt.height, content: txt.content, rotation: txt.rotation });
      updateBoundsPoint(bounds, txt.x, txt.y);
    } else if (code === '0' && value === 'CIRCLE') {
      i += 2;
      const circ = parseCircle(lines, i, totalLines);
      i = circ.nextIndex;
      const lay = ensureLayer(circ.layer || '0');
      lay.circles.push({ cx: circ.cx, cy: circ.cy, r: circ.r });
      updateBoundsPoint(bounds, circ.cx - circ.r, circ.cy - circ.r);
      updateBoundsPoint(bounds, circ.cx + circ.r, circ.cy + circ.r);
    } else if (code === '0' && value === 'ARC') {
      i += 2;
      const arc = parseArc(lines, i, totalLines);
      i = arc.nextIndex;
      const lay = ensureLayer(arc.layer || '0');
      lay.arcs.push({ cx: arc.cx, cy: arc.cy, r: arc.r, startAngle: arc.startAngle, endAngle: arc.endAngle });
      updateBoundsPoint(bounds, arc.cx - arc.r, arc.cy - arc.r);
      updateBoundsPoint(bounds, arc.cx + arc.r, arc.cy + arc.r);
    } else {
      // Skip unknown entity properties efficiently
      i += 2;
      while (i < totalLines - 1) {
        if (lines[i].trim() === '0') break;
        i += 2;
      }
    }
  }

  return { layers, bounds };
}

function parsePolyline(lines, startIdx, totalLines) {
  let i = startIdx;
  let layer = '0';
  let closed = false;
  const vertices = [];

  // Read polyline header properties
  while (i < totalLines - 1) {
    const code = lines[i].trim();
    const value = (i + 1 < totalLines) ? lines[i + 1].trim() : '';

    if (code === '0') break; // Next entity starts

    if (code === '8') layer = value;
    else if (code === '70') closed = (parseInt(value) & 1) !== 0;
    i += 2;
  }

  // Read vertices
  while (i < totalLines - 1) {
    const code = lines[i].trim();
    const value = (i + 1 < totalLines) ? lines[i + 1].trim() : '';

    if (code === '0' && value === 'VERTEX') {
      i += 2;
      let vx = 0, vy = 0;
      while (i < totalLines - 1) {
        const vc = lines[i].trim();
        const vv = (i + 1 < totalLines) ? lines[i + 1].trim() : '';
        if (vc === '0') break;
        if (vc === '10') vx = parseFloat(vv);
        else if (vc === '20') vy = parseFloat(vv);
        i += 2;
      }
      vertices.push({ x: vx, y: vy });
    } else if (code === '0' && value === 'SEQEND') {
      i += 2;
      // Skip SEQEND properties
      while (i < totalLines - 1) {
        const sc = lines[i].trim();
        if (sc === '0') break;
        i += 2;
      }
      break;
    } else {
      i += 2;
    }
  }

  return { layer, vertices, closed, nextIndex: i };
}

function parseLine(lines, startIdx, totalLines) {
  let i = startIdx;
  let layer = '0';
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0;

  while (i < totalLines - 1) {
    const code = lines[i].trim();
    const value = (i + 1 < totalLines) ? lines[i + 1].trim() : '';
    if (code === '0') break;
    if (code === '8') layer = value;
    else if (code === '10') x1 = parseFloat(value);
    else if (code === '20') y1 = parseFloat(value);
    else if (code === '11') x2 = parseFloat(value);
    else if (code === '21') y2 = parseFloat(value);
    i += 2;
  }

  return { layer, x1, y1, x2, y2, nextIndex: i };
}

function parseLWPolyline(lines, startIdx, totalLines) {
  let i = startIdx;
  let layer = '0';
  let closed = false;
  let vertexCount = 0;
  const vertices = [];
  let currentX = null;

  while (i < totalLines - 1) {
    const code = lines[i].trim();
    const value = (i + 1 < totalLines) ? lines[i + 1].trim() : '';
    if (code === '0') break;
    if (code === '8') layer = value;
    else if (code === '70') closed = (parseInt(value) & 1) !== 0;
    else if (code === '90') vertexCount = parseInt(value);
    else if (code === '10') {
      currentX = parseFloat(value);
    } else if (code === '20') {
      if (currentX !== null) {
        vertices.push({ x: currentX, y: parseFloat(value) });
        currentX = null;
      }
    }
    i += 2;
  }

  return { layer, vertices, closed, nextIndex: i };
}

function parseText(lines, startIdx, totalLines) {
  let i = startIdx;
  let layer = '0', x = 0, y = 0, height = 0.25, content = '', rotation = 0;

  while (i < totalLines - 1) {
    const code = lines[i].trim();
    const value = (i + 1 < totalLines) ? lines[i + 1].trim() : '';
    if (code === '0') break;
    if (code === '8') layer = value;
    else if (code === '10') x = parseFloat(value);
    else if (code === '20') y = parseFloat(value);
    else if (code === '40') height = parseFloat(value);
    else if (code === '1') content = value;
    else if (code === '50') rotation = parseFloat(value);
    i += 2;
  }

  return { layer, x, y, height, content, rotation, nextIndex: i };
}

function parseCircle(lines, startIdx, totalLines) {
  let i = startIdx;
  let layer = '0', cx = 0, cy = 0, r = 0;

  while (i < totalLines - 1) {
    const code = lines[i].trim();
    const value = (i + 1 < totalLines) ? lines[i + 1].trim() : '';
    if (code === '0') break;
    if (code === '8') layer = value;
    else if (code === '10') cx = parseFloat(value);
    else if (code === '20') cy = parseFloat(value);
    else if (code === '40') r = parseFloat(value);
    i += 2;
  }

  return { layer, cx, cy, r, nextIndex: i };
}

function parseArc(lines, startIdx, totalLines) {
  let i = startIdx;
  let layer = '0', cx = 0, cy = 0, r = 0, startAngle = 0, endAngle = 360;

  while (i < totalLines - 1) {
    const code = lines[i].trim();
    const value = (i + 1 < totalLines) ? lines[i + 1].trim() : '';
    if (code === '0') break;
    if (code === '8') layer = value;
    else if (code === '10') cx = parseFloat(value);
    else if (code === '20') cy = parseFloat(value);
    else if (code === '40') r = parseFloat(value);
    else if (code === '50') startAngle = parseFloat(value);
    else if (code === '51') endAngle = parseFloat(value);
    i += 2;
  }

  return { layer, cx, cy, r, startAngle, endAngle, nextIndex: i };
}

function updateBoundsPoint(bounds, x, y) {
  if (x < bounds.minX) bounds.minX = x;
  if (y < bounds.minY) bounds.minY = y;
  if (x > bounds.maxX) bounds.maxX = x;
  if (y > bounds.maxY) bounds.maxY = y;
}

// Node（ユニットテスト）用エクスポート。Worker(importScripts)/ブラウザ(script)では未定義のため無害。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseDXF };
}
