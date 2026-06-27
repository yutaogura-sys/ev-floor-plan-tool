// ショートカット一覧モーダル（発見性の改善）。? ボタン / Shift+? で開閉、Esc で閉じる。
// 非ブロッキング・aria 対応。実装済みキーをユーザーが「認識」できるようにする（Nielsen 原則6）。
const HelpOverlay = {
  _overlay: null,

  GROUPS: [
    {
      title: 'ツール切替',
      items: [
        ['V', '選択'], ['H', '移動（パン）'], ['S', '充電スペース'], ['C', '充電設備'],
        ['D', '寸法線'], ['M', '路面表示'], ['W', '車止め'], ['B', '防護部材'],
        ['L', '電灯'], ['F', '基礎'], ['T', 'テキスト'], ['R', '配線注記'],
        ['E', '機器注記'], ['P', '配管注記'], ['G', '配線ルート'], ['K', '分電盤'],
        ['O', '建柱'], ['J', 'ハンドホール'], ['U', 'プルボックス'], ['X', '既設充電設備']
      ]
    },
    {
      title: '選択・編集',
      items: [
        ['クリック', '要素を選択'],
        ['ドラッグ（空き地）', '矩形でまとめて選択'],
        ['Shift+クリック', '選択に追加 / 除外'],
        ['ドラッグ（要素）', '移動（複数選択なら一括）'],
        ['矢印キー', 'グリッド単位で微調整'],
        ['Shift+矢印', '微動（1/5グリッド）'],
        ['Delete / Backspace', '選択を削除'],
        ['Ctrl+D', '複製'],
        ['Ctrl+C / Ctrl+V', 'コピー / 貼り付け（クリックで配置）'],
        ['ダブルクリック', 'テキスト編集 / 配線ルート確定']
      ]
    },
    {
      title: '表示・履歴',
      items: [
        ['マウスホイール', 'ズーム'],
        ['全体表示ボタン', '選択があれば選択範囲へ、無ければ全体へ'],
        ['Ctrl+Z', '元に戻す'],
        ['Ctrl+Y / Ctrl+Shift+Z', 'やり直し'],
        ['Esc', '選択解除 / 配置・作図の取消'],
        ['?（Shift+/）', 'このヘルプを表示']
      ]
    }
  ],

  toggle() {
    if (this._overlay) this.close(); else this.show();
  },

  show() {
    if (this._overlay || typeof document === 'undefined') return;
    const overlay = document.createElement('div');
    overlay.className = 'help-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'キーボードショートカット一覧');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10002;display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#222;width:560px;max-width:94%;max-height:86vh;overflow:auto;border-radius:10px;padding:22px 24px;box-shadow:0 10px 40px rgba(0,0,0,0.35);font-family:Meiryo,sans-serif;';

    let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
      '<h2 style="margin:0;font-size:18px;">キーボード / 操作ショートカット</h2>' +
      '<button class="help-close" aria-label="閉じる" style="border:none;background:#eee;border-radius:6px;width:30px;height:30px;cursor:pointer;font-size:16px;">✕</button></div>';
    html += '<p style="margin:0 0 14px;font-size:12px;color:#666;">入力欄にフォーカスが無いときに有効。Esc で閉じます。</p>';

    this.GROUPS.forEach(g => {
      html += `<h3 style="font-size:13px;margin:14px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px;">${g.title}</h3>`;
      html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
      g.items.forEach(([key, desc]) => {
        html += `<tr>
          <td style="padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top;">
            <kbd style="display:inline-block;background:#f3f3f3;border:1px solid #ccc;border-bottom-width:2px;border-radius:4px;padding:1px 7px;font-family:Consolas,monospace;font-size:12px;color:#333;">${key}</kbd>
          </td>
          <td style="padding:3px 0;color:#333;">${desc}</td>
        </tr>`;
      });
      html += '</table>';
    });
    box.innerHTML = html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    this._overlay = overlay;

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); this.close(); }
    };
    overlay.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });
    box.querySelector('.help-close').addEventListener('click', () => this.close());
    // フォーカスを移してキーで閉じられるように
    box.querySelector('.help-close').focus();
  },

  close() {
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    this._overlay = null;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HelpOverlay;
}
