// QualityChecker — 図面の「人が見て違和感を覚える」客観的な兆候を抽出する純ロジック。
// 描画後の各要素の bbox（描画座標系）と出力枠を受け取り、読みづらさ・印刷切れを検出する。
// DOM 非依存（bbox は呼び出し側が getBBox+getCTM 等で用意）→ Node でユニットテスト可能。
const QualityChecker = {
  _area(b) { return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY); },

  _interArea(a, b) {
    const ix = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
    const iy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
    return ix * iy;
  },

  // 2矩形の重なり度（小さい方の面積に対する重なり面積の比 0〜1）
  overlapRatio(a, b) {
    const ia = this._interArea(a, b);
    if (ia <= 0) return 0;
    const m = Math.min(this._area(a), this._area(b));
    return m > 0 ? ia / m : 0;
  },

  // box が frame に対して 'inside' | 'partial' | 'outside'
  rangeStatus(box, frame) {
    if (!frame) return 'inside';
    const ia = this._interArea(box, frame);
    if (ia <= 0) return 'outside';
    if (ia >= this._area(box) - 1e-9) return 'inside';
    return 'partial';
  },

  // labels: [{text, box}], elements: [{id, type, box}], frame: {minX,minY,maxX,maxY}|null
  // 戻り値: { labelOverlaps:[{a,b,ratio}], outOfRange:[{id,type,status}] }
  analyze(labels, elements, frame, opts) {
    opts = opts || {};
    const thr = typeof opts.overlapThreshold === 'number' ? opts.overlapThreshold : 0.4;
    labels = labels || [];
    elements = elements || [];

    const labelOverlaps = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const r = this.overlapRatio(labels[i].box, labels[j].box);
        if (r >= thr) labelOverlaps.push({ a: labels[i].text, b: labels[j].text, ratio: Math.round(r * 100) / 100 });
      }
    }

    const outOfRange = [];
    for (const e of elements) {
      const st = this.rangeStatus(e.box, frame);
      if (st !== 'inside') outOfRange.push({ id: e.id, type: e.type, status: st });
    }

    return { labelOverlaps, outOfRange };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = QualityChecker;
}
