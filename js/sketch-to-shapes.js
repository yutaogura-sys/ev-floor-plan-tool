// SketchToShapes — Claude vision の解析JSON → フェーズ2の候補配列（純関数・DOM非依存）。
const SketchToShapes = {
  toCandidates(analysis, opts) {
    const out = [];
    if (!analysis || typeof analysis !== 'object') return out;
    const o = opts || {};
    const originX = typeof o.originX === 'number' ? o.originX : 0;
    const originY = typeof o.originY === 'number' ? o.originY : 0;

    // 充電スペース幅（最初のグループから推定。無ければ2500mm）
    const firstGroup = (analysis.charging_spaces || [])[0] || {};
    const widthM = ((firstGroup.width_mm || 2500) / 1000);
    const spacing = widthM + 0.1;

    // charging-space
    let placed = 0;
    for (const grp of (analysis.charging_spaces || [])) {
      const count = Math.max(0, parseInt(grp.count) || 0);
      for (let i = 0; i < count; i++) {
        out.push({ kind: 'charging-space', text: '充電スペース', x: originX + placed * spacing, y: originY });
        placed++;
      }
    }

    // charger
    (analysis.chargers || []).forEach((ch, i) => {
      const idx = (typeof ch.near_space_index === 'number') ? ch.near_space_index : i;
      const label = ch.label || '';
      out.push({ kind: 'charger', text: '充電器' + label, label, x: originX + idx * spacing + spacing / 2, y: originY - 0.6 });
    });

    // dimension
    (analysis.dimensions || []).forEach((d, i) => {
      const v = parseInt(d.value_mm);
      if (!v) return;
      out.push({ kind: 'dimension', text: String(v), x: originX + i * 1.0, y: originY - 1.5 });
    });

    // road-marking
    (analysis.road_markings || []).forEach((rm, i) => {
      const idx = (typeof rm.near_space_index === 'number') ? rm.near_space_index : i;
      out.push({ kind: 'road-marking', text: '路面表示', x: originX + idx * spacing, y: originY });
    });

    return out;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SketchToShapes;
}
