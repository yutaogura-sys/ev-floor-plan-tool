// ReviewPanel — 自動読取/AI抽出の候補を「採用/却下/種別変更→確定」でレビューするモーダル。
// 純関数 filterAdopted は Node テスト可能。show() は DOM（ブラウザ）専用。
class ReviewPanel {
  static KINDS = [
    ['charging-space', '充電スペース'],
    ['charger', '充電器'],
    ['wire', '配線'],
    ['equipment', '機器'],
    ['conduit', '配管'],
    ['dimension', '寸法'],
    ['road-marking', '路面表示'],
    ['building-text', '建物テキスト'],
    ['text', 'テキスト']
  ];

  static filterAdopted(items) {
    return (items || []).filter(i => i.adopted !== false);
  }

  constructor() {
    this.modal = null;
  }

  show(candidates, onConfirm, onCancel) {
    this._close();
    candidates = candidates || [];
    const overlay = document.createElement('div');
    overlay.className = 'review-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#222;border-radius:8px;max-width:560px;width:90%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 24px rgba(0,0,0,0.4);';

    const optionsHtml = ReviewPanel.KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    const rows = candidates.map((cand, i) => `
      <tr data-i="${i}" style="border-bottom:1px solid #eee;">
        <td style="padding:4px 6px;"><input type="checkbox" class="rv-adopt" data-i="${i}" checked></td>
        <td style="padding:4px 6px;"><select class="rv-kind" data-i="${i}" style="font-size:12px;">${optionsHtml}</select></td>
        <td style="padding:4px 6px;font-size:12px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this._escape(cand.text)}</td>
      </tr>`).join('');

    box.innerHTML = `
      <div style="padding:12px 16px;border-bottom:1px solid #ddd;font-weight:600;">自動読取の候補レビュー（${candidates.length}件）</div>
      <div style="padding:8px 16px;overflow:auto;flex:1;">
        <div style="margin-bottom:6px;"><button class="rv-all">全採用</button> <button class="rv-none">全解除</button></div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="text-align:left;font-size:11px;color:#666;"><th style="padding:4px 6px;">採用</th><th style="padding:4px 6px;">種別</th><th style="padding:4px 6px;">テキスト</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="padding:12px 16px;border-top:1px solid #ddd;display:flex;justify-content:flex-end;gap:8px;">
        <button class="rv-cancel" style="padding:6px 14px;">キャンセル</button>
        <button class="rv-confirm" style="padding:6px 14px;background:#4a9eff;color:#fff;border:none;border-radius:4px;">確定して配置</button>
      </div>`;

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    this.modal = overlay;

    // set initial kind selects to candidate.kind
    box.querySelectorAll('.rv-kind').forEach(sel => {
      const i = parseInt(sel.dataset.i);
      if (candidates[i] && candidates[i].kind) sel.value = candidates[i].kind;
    });

    box.querySelector('.rv-all').addEventListener('click', () => box.querySelectorAll('.rv-adopt').forEach(c => c.checked = true));
    box.querySelector('.rv-none').addEventListener('click', () => box.querySelectorAll('.rv-adopt').forEach(c => c.checked = false));
    box.querySelector('.rv-cancel').addEventListener('click', () => { this._close(); if (typeof onCancel === 'function') onCancel(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { this._close(); if (typeof onCancel === 'function') onCancel(); } });
    box.querySelector('.rv-confirm').addEventListener('click', () => {
      const result = candidates.map((cand, i) => {
        const adopt = box.querySelector(`.rv-adopt[data-i="${i}"]`);
        const kindSel = box.querySelector(`.rv-kind[data-i="${i}"]`);
        return Object.assign({}, cand, { adopted: adopt ? adopt.checked : true, kind: kindSel ? kindSel.value : cand.kind });
      });
      const adopted = ReviewPanel.filterAdopted(result);
      this._close();
      if (typeof onConfirm === 'function') onConfirm(adopted);
    });
  }

  _close() {
    if (this.modal) { this.modal.remove(); this.modal = null; }
  }

  _escape(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReviewPanel;
}
