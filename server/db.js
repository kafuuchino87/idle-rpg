// SQLite 初始化 + helpers
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);

// 安全與效能設定
db.pragma('journal_mode = WAL');     // Write-ahead logging — 高並發友善
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ===== Schema =====

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,                    -- 玩家 UUID (前端 LocalStorage 生成)
    nickname TEXT NOT NULL,                 -- 顯示暱稱
    character_id TEXT,                      -- tsukirin / eve / rean / mira
    character_name TEXT,                    -- 顯示用（含路線轉職名）
    job_path TEXT,                          -- A / B / null
    job_tier INTEGER DEFAULT 0,             -- 0-3
    level INTEGER DEFAULT 1,
    cp INTEGER NOT NULL DEFAULT 0,          -- 戰力
    created_at INTEGER NOT NULL,            -- 第一次連線時間
    updated_at INTEGER NOT NULL             -- 最近更新時間
  );

  CREATE INDEX IF NOT EXISTS idx_players_cp ON players(cp DESC);
  CREATE INDEX IF NOT EXISTS idx_players_updated ON players(updated_at DESC);
`);

// ===== Helpers =====

/**
 * 寫入或更新玩家資料（upsert）
 * 收到前端 sync 請求時呼叫
 */
function upsertPlayer(p) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO players (id, nickname, character_id, character_name, job_path, job_tier, level, cp, created_at, updated_at)
    VALUES (@id, @nickname, @character_id, @character_name, @job_path, @job_tier, @level, @cp, @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      nickname = excluded.nickname,
      character_id = excluded.character_id,
      character_name = excluded.character_name,
      job_path = excluded.job_path,
      job_tier = excluded.job_tier,
      level = excluded.level,
      cp = excluded.cp,
      updated_at = excluded.updated_at
  `);
  stmt.run({
    id: p.id,
    nickname: p.nickname || '無名旅人',
    character_id: p.character_id || null,
    character_name: p.character_name || null,
    job_path: p.job_path || null,
    job_tier: p.job_tier || 0,
    level: p.level || 1,
    cp: p.cp || 0,
    now,
  });
}

/**
 * 取得戰力排行榜（前 N 名）
 */
function getLeaderboard(limit = 100) {
  const stmt = db.prepare(`
    SELECT
      id, nickname, character_id, character_name, job_path, job_tier, level, cp, updated_at
    FROM players
    ORDER BY cp DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

/**
 * 取得某玩家當前排名（可能很慢，N 小才用）
 */
function getPlayerRank(playerId) {
  const stmt = db.prepare(`
    SELECT COUNT(*) + 1 as rank
    FROM players
    WHERE cp > (SELECT cp FROM players WHERE id = ?)
  `);
  const row = stmt.get(playerId);
  return row ? row.rank : null;
}

/**
 * 取得玩家總數
 */
function getPlayerCount() {
  const row = db.prepare('SELECT COUNT(*) as n FROM players').get();
  return row ? row.n : 0;
}

/**
 * 取得單一玩家資料
 */
function getPlayer(playerId) {
  return db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
}

module.exports = {
  db,
  upsertPlayer,
  getLeaderboard,
  getPlayerRank,
  getPlayerCount,
  getPlayer,
};
