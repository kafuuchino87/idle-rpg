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

  CREATE TABLE IF NOT EXISTS cloud_saves (
    uuid TEXT PRIMARY KEY,                  -- 同瀏覽器自動還原用
    recovery_code TEXT UNIQUE,              -- 跨裝置還原用（NULL = 還沒生成過）
    save_json TEXT NOT NULL,                -- 整包 LocalStorage JSON
    size_bytes INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cloud_saves_code ON cloud_saves(recovery_code);
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

// ===== 雲端存檔 helpers =====

const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';  // 32 字符，去掉易混淆的 0/O/1/I
function generateRecoveryCode() {
  // 格式：VR-XXXX-XXXX-XXXX（4 組 4 字符 = 16 字符）
  let code = 'VR';
  for (let g = 0; g < 3; g++) {
    code += '-';
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  }
  return code;
}

/**
 * 上傳存檔（自動同步用）— upsert by uuid
 */
function upsertSave(uuid, saveJson) {
  const now = Date.now();
  const size = Buffer.byteLength(saveJson, 'utf8');
  const stmt = db.prepare(`
    INSERT INTO cloud_saves (uuid, save_json, size_bytes, created_at, updated_at)
    VALUES (@uuid, @save_json, @size, @now, @now)
    ON CONFLICT(uuid) DO UPDATE SET
      save_json = excluded.save_json,
      size_bytes = excluded.size_bytes,
      updated_at = excluded.updated_at
  `);
  stmt.run({ uuid, save_json: saveJson, size, now });
  return { size, updated_at: now };
}

/**
 * 依 UUID 取存檔（自動還原用）
 */
function getSaveByUuid(uuid) {
  const stmt = db.prepare('SELECT save_json, recovery_code, size_bytes, updated_at FROM cloud_saves WHERE uuid = ?');
  return stmt.get(uuid);
}

/**
 * 生成 / 取得當前 UUID 的恢復碼（已存在就回原本的、不重新生成）
 */
function getOrCreateRecoveryCode(uuid) {
  const row = db.prepare('SELECT recovery_code FROM cloud_saves WHERE uuid = ?').get(uuid);
  if (!row) return null;  // 沒存過檔
  if (row.recovery_code) return row.recovery_code;

  // 還沒生成過 → 生成一個唯一碼
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRecoveryCode();
    const existing = db.prepare('SELECT 1 FROM cloud_saves WHERE recovery_code = ?').get(code);
    if (!existing) {
      db.prepare('UPDATE cloud_saves SET recovery_code = ? WHERE uuid = ?').run(code, uuid);
      return code;
    }
  }
  throw new Error('failed to generate unique code');
}

/**
 * 依恢復碼取存檔（跨裝置還原用）
 */
function getSaveByCode(code) {
  const stmt = db.prepare('SELECT uuid, save_json, size_bytes, updated_at FROM cloud_saves WHERE recovery_code = ?');
  return stmt.get(code);
}

/**
 * 雲端存檔總筆數（管理 / 統計用）
 */
function getCloudSaveCount() {
  const row = db.prepare('SELECT COUNT(*) as n, SUM(size_bytes) as total FROM cloud_saves').get();
  return { count: row?.n || 0, totalBytes: row?.total || 0 };
}

module.exports = {
  db,
  upsertPlayer,
  getLeaderboard,
  getPlayerRank,
  getPlayerCount,
  getPlayer,
  // cloud save
  upsertSave,
  getSaveByUuid,
  getOrCreateRecoveryCode,
  getSaveByCode,
  getCloudSaveCount,
};
