// Road Marking Tool - Click to place 900x900 road surface marking
class RoadMarkingTool {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
  }

  activate() {}
  deactivate() {}

  onMouseDown(point, e) {
    if (e.button !== 0) return;
    const id = Utils.generateId();
    // Default surface type based on loaded data - can be changed in properties
    const surfaceType = app && app.state && app.state.surfaceType || 'アスファルト';
    const el = this.svgEngine.createRoadMarking(id, point.x, point.y, surfaceType);
    // 配置後は選択ツールへ戻り、置いた要素を自動選択（全配置ツールで統一）
    if (typeof app !== 'undefined') {
      app.toolManager.setActiveTool('select');
      app.toolManager.tools.select.selectElement(el);
      if (app.updateChecklist) app.updateChecklist();
    }
  }
}
