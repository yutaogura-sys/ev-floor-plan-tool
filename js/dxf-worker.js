// DXF R12 Parser Web Worker
// 解析ロジックは dxf-parse-core.js に集約（メインスレッドのフォールバックと共用）。
importScripts('dxf-parse-core.js');

self.onmessage = function (e) {
  const text = e.data;
  const result = parseDXF(text, function (pct) {
    self.postMessage({ type: 'progress', percent: pct });
  });
  self.postMessage({ type: 'complete', data: result });
};
