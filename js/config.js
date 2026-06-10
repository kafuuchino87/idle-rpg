// 後端 API 設定
// - 線上：指向 Cloudflare Tunnel 公開網址（cloudflared 設好後改成你的網域）
// - 本機開發：指向 localhost:8766
// 沒設 / 後端離線時，前端會優雅降級（顯示「離線中」），不影響其他遊戲功能
window.API_BASE = (() => {
  const host = window.location.host || '';
  // 在 GitHub Pages 跑 → 用線上後端（Tailscale Funnel 固定網址、PC 不重灌不會換）
  if (host.includes('github.io')) {
    return 'https://desktop-41ch992.tailed47b7.ts.net';
  }
  // 本機開發（127.0.0.1 / localhost）→ 跑後端 localhost:8766
  return 'http://localhost:8766';
})();

// 設成 false 完全停用 API（純本地模式）
window.API_ENABLED = true;
