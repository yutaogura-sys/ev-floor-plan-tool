// Text Tool - Click to place text annotation
class TextTool {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
  }

  activate() {}
  deactivate() {}

  onMouseDown(point, e) {
    if (e.button !== 0) return;
    const text = prompt('テキストを入力してください:', '');
    if (!text) return;

    const id = Utils.generateId();
    this.svgEngine.createTextAnnotation(id, point.x, point.y, text, 3, Utils.COLORS.ink);
  }

  onDoubleClick(point, e) {
    // Edit existing text at point
    const ann = this.svgEngine.findAnnotationAt(point.x, point.y);
    if (ann && ann.dataset.type === 'text') {
      const textEl = ann.querySelector('text');
      if (textEl) {
        const newText = prompt('テキストを編集:', textEl.textContent);
        if (newText !== null) {
          textEl.textContent = newText;
        }
      }
    }
  }
}
