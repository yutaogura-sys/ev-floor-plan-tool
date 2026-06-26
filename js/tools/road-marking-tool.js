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
    this.svgEngine.createRoadMarking(id, point.x, point.y, surfaceType);
    if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
  }
}
