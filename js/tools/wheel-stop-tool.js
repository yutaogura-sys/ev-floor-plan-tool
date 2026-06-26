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
    this.svgEngine.createWheelStop(id, point.x, point.y, 0);
    if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
  }
}
