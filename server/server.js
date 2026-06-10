// 幻域編年史後端 — 排行榜服務
// 純 REST API，CORS 允許 GitHub Pages + localhost
//
// 啟動：
//   npm install        （第一次安裝套件）
//   npm start          （正式跑）
//   npm run dev        （開發模式，存檔自動重啟）

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 8766;

// ===== CORS 允許清單 =====
// GitHub Pages + 本機開發
const ALLOWED_ORIGINS = [
  'https://kafuuchino87.github.io',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
  'http://localhost:5500',          // VS Code Live Server
];

app.use(cors({
  origin: (origin, callback) => {
    // 允許無 origin（curl、Postman 等）
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // 開發時允許所有 localhost
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return callback(null, true);
    }
    callback(new Error('CORS blocked: ' + origin));
  },
  credentials: false,
}));

app.use(express.json({ limit: '32kb' }));   // payload 限制 32KB 防濫送

// ===== 健康檢查 =====
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    playerCount: db.getPlayerCount(),
  });
});

// ===== 玩家資料 sync / upsert =====
// 前端會在 cp 變化或進入排行榜頁面時呼叫一次
app.post('/api/players/sync', (req, res) => {
  try {
    const p = req.body || {};
    if (!p.id || typeof p.id !== 'string' || p.id.length > 64) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    if (typeof p.cp !== 'number' || p.cp < 0 || p.cp > 100_000_000) {
      return res.status(400).json({ error: 'invalid_cp' });
    }
    // 暱稱長度限制
    if (p.nickname && p.nickname.length > 32) p.nickname = p.nickname.slice(0, 32);

    db.upsertPlayer(p);
    const rank = db.getPlayerRank(p.id);
    const total = db.getPlayerCount();
    res.json({ ok: true, rank, total });
  } catch (err) {
    console.error('[sync]', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ===== 排行榜 =====
app.get('/api/leaderboard', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const list = db.getLeaderboard(limit);
    res.json({
      ok: true,
      ts: Date.now(),
      total: db.getPlayerCount(),
      list,
    });
  } catch (err) {
    console.error('[leaderboard]', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ===== 取得單一玩家（含當前排名）=====
app.get('/api/players/:id', (req, res) => {
  try {
    const player = db.getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'not_found' });
    const rank = db.getPlayerRank(req.params.id);
    res.json({ ok: true, player, rank });
  } catch (err) {
    console.error('[get player]', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ===== 啟動 =====
app.listen(PORT, () => {
  const count = db.getPlayerCount();
  console.log(`✓ 幻域編年史後端啟動於 http://localhost:${PORT}`);
  console.log(`  DB: ${path.join(__dirname, 'data.db')}`);
  console.log(`  目前已記錄 ${count} 位玩家`);
  console.log(`  CORS 允許：${ALLOWED_ORIGINS.join(', ')}`);
  console.log(``);
  console.log(`  Endpoints:`);
  console.log(`    GET  /api/health                 — 健康檢查`);
  console.log(`    POST /api/players/sync           — 玩家資料 upsert`);
  console.log(`    GET  /api/leaderboard?limit=100  — 戰力排行榜`);
  console.log(`    GET  /api/players/:id            — 單一玩家 + 排名`);
});
