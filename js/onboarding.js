// 初回オンボーディング（ワークフロー案内）。初回のみ自動表示し、ヘルプから再表示可能。
// 「実装済み機能は分かっても、全体の進め方が分からない」初見ユーザーを支援（Nielsen 原則10）。
const Onboarding = {
  KEY: 'ev-floorplan-onboarded',
  _overlay: null,

  STEPS: [
    { icon: '📐', title: '1. 下図を読み込む（任意）', body: 'ヘッダーの「ファイル選択」から DXF/PDF を読み込みます。下図が無くても、そのまま作図できます。' },
    { icon: '🧰', title: '2. 部材を配置する', body: '左のツールバー（またはキー）でツールを選び、図面上をクリック/ドラッグで配置します。配置後は自動で選択ツールに戻り、配置物がそのまま選択されます。' },
    { icon: '✏️', title: '3. 調整する', body: 'クリックで選択して移動・回転・プロパティ編集。空き地をドラッグで複数選択、矢印キーで微調整、Ctrl+C / Ctrl+V でコピーできます。' },
    { icon: '✅', title: '4. 要件を確認して出力', body: '右の「補助金要件チェック」で必須項目の充足を確認し、平面図／配線ルート図を PDF・DXF で出力します（未充足があれば出力前に警告します）。' }
  ],

  maybeShowFirstRun() {
    if (typeof localStorage === 'undefined') return;
    let seen = null;
    try { seen = localStorage.getItem(this.KEY); } catch (e) { return; }
    if (seen) return;            // 既に表示済み（=再来訪）
    this.show(true);
  },

  _markSeen() {
    try { localStorage.setItem(this.KEY, '1'); } catch (e) { /* 容量超過等は無視 */ }
  },

  show(firstRun) {
    if (this._overlay || typeof document === 'undefined') return;
    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '使い方ガイド');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10002;display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#222;width:560px;max-width:94%;max-height:88vh;overflow:auto;border-radius:10px;padding:24px;box-shadow:0 10px 40px rgba(0,0,0,0.35);font-family:Meiryo,sans-serif;';

    let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
      '<h2 style="margin:0;font-size:19px;">EV平面図ツールの使い方</h2>' +
      '<button class="ob-close" aria-label="閉じる" style="border:none;background:#eee;border-radius:6px;width:30px;height:30px;cursor:pointer;font-size:16px;">✕</button></div>';
    html += '<p style="margin:0 0 14px;font-size:12px;color:#666;">4ステップで補助金用の平面図／配線ルート図を作成できます。</p>';

    this.STEPS.forEach(s => {
      html += `<div style="display:flex;gap:12px;padding:10px 0;border-top:1px solid #eee;">
        <div style="font-size:22px;line-height:1.3;flex:0 0 auto;">${s.icon}</div>
        <div><div style="font-weight:600;font-size:14px;margin-bottom:2px;">${s.title}</div>
        <div style="font-size:13px;color:#444;line-height:1.6;">${s.body}</div></div>
      </div>`;
    });

    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;gap:10px;flex-wrap:wrap;">' +
      '<button class="ob-shortcuts" style="background:none;border:none;color:#1a6ed8;cursor:pointer;font-size:13px;padding:0;text-decoration:underline;">⌨ ショートカット一覧を見る</button>' +
      '<button class="ob-start" style="padding:8px 18px;background:#1a6ed8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">はじめる</button>' +
      '</div>';
    box.innerHTML = html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    this._overlay = overlay;

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); this.close(); }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });
    box.querySelector('.ob-close').addEventListener('click', () => this.close());
    box.querySelector('.ob-start').addEventListener('click', () => this.close());
    box.querySelector('.ob-shortcuts').addEventListener('click', () => {
      this.close();
      if (typeof HelpOverlay !== 'undefined') HelpOverlay.show();
    });
    box.querySelector('.ob-start').focus();
  },

  close() {
    this._markSeen(); // 開いた時点で「案内済み」とみなす（初回/再表示どちらでも）
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    this._overlay = null;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Onboarding;
}
