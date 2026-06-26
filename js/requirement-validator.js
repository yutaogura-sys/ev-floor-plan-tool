// RequirementValidator — 補助金要件の「記載漏れ」検査（純関数・DOM非依存）。
// 入力: StateSerializer.serializeAnnotations() のレコード配列。
// 出力: { [reqId]: { status: 'ok'|'warn'|'missing'|'na', message: string } }
const RequirementValidator = {
  // dimension レコードの端点(x,y)/(x2,y2)・中点のいずれかが (px,py) から radius 以内か
  dimNear(dim, px, py, radius) {
    const pts = [
      { x: dim.x, y: dim.y },
      { x: dim.x2, y: dim.y2 },
      { x: (dim.x + dim.x2) / 2, y: (dim.y + dim.y2) / 2 }
    ];
    return pts.some(p => {
      if (typeof p.x !== 'number' || typeof p.y !== 'number' || isNaN(p.x) || isNaN(p.y)) return false;
      const dx = p.x - px, dy = p.y - py;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
  },

  validate(records, opts) {
    records = records || [];
    opts = opts || {};
    const RADIUS = 3; // m: 充電スペース(2.5×5)の近傍を拾える緩めの半径

    const byType = {};
    for (const r of records) (byType[r.type] = byType[r.type] || []).push(r);
    const has = t => (byType[t] || []).length > 0;
    const dims = byType['dimension'] || [];
    const anyDimNear = (targets) => (targets || []).some(t => dims.some(d => this.dimNear(d, t.x, t.y, RADIUS)));

    const ok = () => ({ status: 'ok', message: '' });
    const na = () => ({ status: 'na', message: '' });
    const warn = (m) => ({ status: 'warn', message: m });
    const missing = (m) => ({ status: 'missing', message: m });

    const tb = !!opts.titleBlockComplete;

    return {
      // ===== 平面図 =====
      'basic-info': tb ? ok() : missing('図面基本情報（設置場所・縮尺・作成者・図面名称・作成日）が未入力です'),
      'space-dim': !has('charging-space') ? missing('充電スペースが未配置です')
        : (anyDimNear(byType['charging-space']) ? ok() : warn('充電スペースの幅・奥行きの寸法が見当たりません')),
      'equip-pos': !has('charger') ? missing('充電設備が未配置です')
        : (anyDimNear(byType['charger']) ? ok() : warn('充電スペースと充電設備の位置関係寸法が見当たりません')),
      'foundation': has('foundation') ? ok() : missing('充電設備の基礎が未配置です'),
      'line-marking': has('charging-space') ? ok() : missing('充電スペースのライン引きが未配置です'),
      'road-marking': !has('road-marking') ? missing('路面表示が未配置です')
        : (anyDimNear(byType['road-marking']) ? ok() : warn('路面表示の位置寸法が見当たりません')),
      'bollard': has('bollard') ? ok() : na(),
      'wheel-stop': !has('wheel-stop') ? missing('車止めが未配置です')
        : (anyDimNear(byType['wheel-stop']) ? ok() : warn('充電設備と車止めまでの寸法が見当たりません')),
      'lighting': has('lighting') ? ok() : missing('電灯位置が未配置です'),
      // ===== 配線ルート図 =====
      'route-basic-info': tb ? ok() : missing('図面基本情報が未入力です'),
      'route-wiring': has('wiring-route') ? ok() : missing('配線ルートが未配置です'),
      'route-equipment': (has('cubicle') || has('charger')) ? ok() : missing('キュービクル/分電盤/充電設備が未配置です'),
      'route-pole': has('pole') ? ok() : na(),
      'route-handhole': has('handhole') ? ok() : na(),
      'route-existing': has('existing-charger') ? ok() : na(),
      'route-summary': has('wiring-summary') ? ok() : missing('配線集計表が未生成です')
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RequirementValidator;
}
