// Wheel Stop Tool - Click to place wheel stop (車止め)
class WheelStopTool {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
  }

  activate() {}
  deactivate() {}

  onMouseDown(point, e) {
    if (e.button !== 0) return;
    const id = Utils.generateId();
    const el = this.svgEngine.createWheelStop(id, point.x, point.y, 0);
    // 配置後は選択ツールへ戻り、置いた要素を自動選択（全配置ツールで統一）
    if (typeof app !== 'undefined') {
      app.toolManager.setActiveTool('select');
      app.toolManager.tools.select.selectElement(el);
      if (app.updateChecklist) app.updateChecklist();
    }
  }
}
