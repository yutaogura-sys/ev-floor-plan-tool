// History — スナップショット文字列スタックによる Undo/Redo
class History {
  constructor(limit = 50) {
    this.limit = limit;
    this.stack = [];
    this.index = -1;
  }

  reset(snapshotString) {
    this.stack = [snapshotString];
    this.index = 0;
  }

  record(snapshotString) {
    // 現在位置より後（redo分）を破棄
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(snapshotString);
    // 上限超過なら先頭を捨てる
    if (this.stack.length > this.limit) {
      this.stack.shift();
    }
    this.index = this.stack.length - 1;
  }

  canUndo() { return this.index > 0; }
  canRedo() { return this.index < this.stack.length - 1; }

  undo() {
    if (!this.canUndo()) return null;
    this.index--;
    return this.stack[this.index];
  }

  redo() {
    if (!this.canRedo()) return null;
    this.index++;
    return this.stack[this.index];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = History;
}
