// Text Tool - Click to place text annotation
class TextTool {
  constructor(svgEngine) {
    this.svgEngine = svgEngine;
  }

  activate() {}
  deactivate() {}

  async onMouseDown(point, e) {
    if (e.button !== 0) return;
    const text = await Utils.promptModal({ title: 'テキストを入力', multiline: true });
    if (!text || !text.trim()) return;

    const id = Utils.generateId();
    const el = this.svgEngine.createTextAnnotation(id, point.x, point.y, text, 3, Utils.COLORS.ink);
    // 配置後は選択ツールへ戻り自動選択（全配置ツールで統一）
    if (typeof app !== 'undefined') {
      app.toolManager.setActiveTool('select');
      app.toolManager.tools.select.selectElement(el);
      if (app.updateChecklist) app.updateChecklist();
    }
  }

  async onDoubleClick(point, e) {
    // Edit existing text at point（非ブロッキングモーダル・複数行対応）
    const ann = this.svgEngine.findAnnotationAt(point.x, point.y);
    if (!ann || ann.dataset.type !== 'text') return;
    const current = [...ann.querySelectorAll('text')].map(t => t.textContent).join('\n');
    const newText = await Utils.promptModal({ title: 'テキストを編集', value: current, multiline: true });
    if (newText === null) return;
    const sel = (typeof app !== 'undefined') && app.toolManager.tools.select;
    if (sel && sel._rebuildTextAnnotation) {
      sel.selected = ann;
      sel._rebuildTextAnnotation(ann, newText);
    } else {
      const t = ann.querySelector('text');
      if (t) t.textContent = newText;
    }
    if (typeof app !== 'undefined' && app.updateChecklist) app.updateChecklist();
  }
}
