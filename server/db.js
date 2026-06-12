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

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,                     -- 發訊者 uuid（用來限制 rate / 封鎖）
    nickname TEXT NOT NULL,                 -- 顯示暱稱
    text TEXT NOT NULL,                     -- 訊息內容
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);

  CREATE TABLE IF NOT EXISTS world_boss (
    id INTEGER PRIMARY KEY CHECK (id = 1),    -- 永遠只有 1 列
    name TEXT NOT NULL,
    max_hp INTEGER NOT NULL,
    current_hp INTEGER NOT NULL,
    stamp_day TEXT NOT NULL,                  -- YYYY-MM-DD (Asia/Taipei)
    killed_at INTEGER                          -- 第一次被打死的時間（同一日二次傷害不會覆寫）
  );

  CREATE TABLE IF NOT EXISTS world_boss_damage (
    uuid TEXT NOT NULL,
    nickname TEXT,
    damage INTEGER NOT NULL DEFAULT 0,
    stamp_day TEXT NOT NULL,
    last_hit_at INTEGER,
    PRIMARY KEY (uuid, stamp_day)
  );

  CREATE INDEX IF NOT EXISTS idx_wbd_day ON world_boss_damage(stamp_day, damage DESC);

  CREATE TABLE IF NOT EXISTS world_boss_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    stamp_day TEXT NOT NULL,           -- 哪一日的貢獻產生這份獎勵
    rank INTEGER NOT NULL,
    damage INTEGER NOT NULL,            -- 紀錄那天打了多少（給玩家看用）
    chest_qty INTEGER NOT NULL,         -- 古龍寶箱數量
    created_at INTEGER NOT NULL,
    claimed_at INTEGER                  -- 未領取為 NULL
  );
  CREATE INDEX IF NOT EXISTS idx_wbr_uuid_unclaimed ON world_boss_rewards(uuid, claimed_at);
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

// ===== 世界聊天 =====
const CHAT_MAX_KEEP = 200;       // 最多保留 200 則訊息（超過就刪舊的）
const CHAT_MAX_TEXT_LEN = 200;   // 單訊息上限

function insertChatMessage(uuid, nickname, text) {
  const now = Date.now();
  const safeText = String(text).slice(0, CHAT_MAX_TEXT_LEN);
  const safeNick = String(nickname || '無名').slice(0, 32);
  const r = db.prepare(`
    INSERT INTO chat_messages (uuid, nickname, text, created_at)
    VALUES (?, ?, ?, ?)
  `).run(uuid, safeNick, safeText, now);
  // 順手清舊訊息（保留最新 200 則）
  db.prepare(`
    DELETE FROM chat_messages
    WHERE id NOT IN (SELECT id FROM chat_messages ORDER BY id DESC LIMIT ?)
  `).run(CHAT_MAX_KEEP);
  return { id: r.lastInsertRowid, created_at: now };
}

function getRecentChats(since) {
  // since = 上次取訊息的 timestamp（0 = 全部撈）
  const stmt = db.prepare(`
    SELECT id, uuid, nickname, text, created_at
    FROM chat_messages
    WHERE created_at > ?
    ORDER BY id ASC
    LIMIT ?
  `);
  return stmt.all(since || 0, CHAT_MAX_KEEP);
}

// ===== 世界 BOSS =====
const WORLD_BOSS_NAME = '焰心古龍';
const WORLD_BOSS_MAX_HP = 1_000_000_000_000;   // 1 兆
const WORLD_BOSS_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;  // Asia/Taipei = UTC+8

// 今日刷新戳記（每天 00:00 Asia/Taipei 切換到新一天）
function getTodayStampTPE() {
  const now = Date.now() + WORLD_BOSS_TZ_OFFSET_MS;
  return new Date(now).toISOString().slice(0, 10);  // YYYY-MM-DD
}

// 依排名給寶箱數量
// 1 名 = 5 箱、2-3 名 = 4 箱、4-10 名 = 3 箱、11+ = 2 箱、所有參與者保底 1 箱
function rewardQtyByRank(rank) {
  if (rank === 1) return 5;
  if (rank <= 3) return 4;
  if (rank <= 10) return 3;
  if (rank <= 30) return 2;
  return 1;
}

// 取得 BOSS（自動處理跨日刷新 + 自動初始化 + snapshot 排行榜給獎勵）
function getOrInitWorldBoss() {
  const today = getTodayStampTPE();
  let row = db.prepare('SELECT * FROM world_boss WHERE id = 1').get();
  if (!row) {
    db.prepare(`
      INSERT INTO world_boss (id, name, max_hp, current_hp, stamp_day)
      VALUES (1, ?, ?, ?, ?)
    `).run(WORLD_BOSS_NAME, WORLD_BOSS_MAX_HP, WORLD_BOSS_MAX_HP, today);
    return db.prepare('SELECT * FROM world_boss WHERE id = 1').get();
  }
  if (row.stamp_day !== today) {
    const yesterday = row.stamp_day;
    // 在清傷害表前 snapshot：把昨日 leaderboard 轉成 rewards
    const yesterdayBoard = db.prepare(`
      SELECT uuid, damage FROM world_boss_damage
      WHERE stamp_day = ? AND damage > 0
      ORDER BY damage DESC
    `).all(yesterday);
    const insertReward = db.prepare(`
      INSERT INTO world_boss_rewards (uuid, stamp_day, rank, damage, chest_qty, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    yesterdayBoard.forEach((p, idx) => {
      const rank = idx + 1;
      const qty = rewardQtyByRank(rank);
      insertReward.run(p.uuid, yesterday, rank, p.damage, qty, now);
    });
    // 重設 HP、清掉昨日傷害紀錄
    db.prepare(`
      UPDATE world_boss
      SET current_hp = max_hp, stamp_day = ?, killed_at = NULL
      WHERE id = 1
    `).run(today);
    db.prepare('DELETE FROM world_boss_damage WHERE stamp_day != ?').run(today);
    row = db.prepare('SELECT * FROM world_boss WHERE id = 1').get();
  }
  return row;
}

function getWorldBossPendingRewards(uuid) {
  return db.prepare(`
    SELECT id, stamp_day, rank, damage, chest_qty, created_at
    FROM world_boss_rewards
    WHERE uuid = ? AND claimed_at IS NULL
    ORDER BY stamp_day DESC
  `).all(uuid);
}

function claimWorldBossRewards(uuid) {
  getOrInitWorldBoss();  // 確保跨日 snapshot 已執行
  const pending = getWorldBossPendingRewards(uuid);
  if (pending.length === 0) return { totalChests: 0, claimed: [] };
  const now = Date.now();
  db.prepare(`UPDATE world_boss_rewards SET claimed_at = ? WHERE uuid = ? AND claimed_at IS NULL`).run(now, uuid);
  const totalChests = pending.reduce((s, r) => s + r.chest_qty, 0);
  return { totalChests, claimed: pending };
}

// 套用玩家本場傷害到共用 HP，並累積到玩家當日貢獻
// 戰敗也呼叫（accepted 可能為 0 if 已死）
function applyWorldBossDamage(uuid, nickname, dmg) {
  const boss = getOrInitWorldBoss();  // 自動跨日刷新
  const today = boss.stamp_day;
  const now = Date.now();
  const safeDmg = Math.max(0, Math.floor(dmg) || 0);

  let accepted = 0;
  let alreadyDead = boss.current_hp <= 0;
  let killedNow = false;

  if (!alreadyDead && safeDmg > 0) {
    accepted = Math.min(safeDmg, boss.current_hp);
    const newHp = boss.current_hp - accepted;
    db.prepare('UPDATE world_boss SET current_hp = ? WHERE id = 1').run(newHp);
    if (newHp <= 0 && !boss.killed_at) {
      db.prepare('UPDATE world_boss SET killed_at = ? WHERE id = 1').run(now);
      killedNow = true;
    }
  }

  // 即便 alreadyDead，仍要寫入玩家當日紀錄（讓他能在排行榜出現），但 dmg 加入是「打死前的有效傷害」
  // 如果 alreadyDead 完全沒貢獻就不寫入（避免送 0 dmg 也佔位）
  if (safeDmg > 0) {
    db.prepare(`
      INSERT INTO world_boss_damage (uuid, nickname, damage, stamp_day, last_hit_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(uuid, stamp_day) DO UPDATE SET
        damage = damage + excluded.damage,
        nickname = excluded.nickname,
        last_hit_at = excluded.last_hit_at
    `).run(uuid, String(nickname || '無名旅人').slice(0, 32), safeDmg, today, now);
  }

  const refreshed = db.prepare('SELECT * FROM world_boss WHERE id = 1').get();
  return { boss: refreshed, accepted, alreadyDead, killedNow };
}

function getWorldBossPlayerDmg(uuid) {
  const today = getTodayStampTPE();
  return db.prepare(`
    SELECT damage, last_hit_at FROM world_boss_damage
    WHERE uuid = ? AND stamp_day = ?
  `).get(uuid, today);
}

function getWorldBossPlayerRank(uuid) {
  const today = getTodayStampTPE();
  const me = db.prepare('SELECT damage FROM world_boss_damage WHERE uuid = ? AND stamp_day = ?').get(uuid, today);
  if (!me) return null;
  const r = db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM world_boss_damage
    WHERE stamp_day = ? AND damage > ?
  `).get(today, me.damage);
  return r ? r.rank : null;
}

function getWorldBossLeaderboard(limit) {
  const today = getTodayStampTPE();
  return db.prepare(`
    SELECT uuid, nickname, damage, last_hit_at
    FROM world_boss_damage
    WHERE stamp_day = ?
    ORDER BY damage DESC
    LIMIT ?
  `).all(today, Math.min(limit || 100, 500));
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
  // world chat
  insertChatMessage,
  getRecentChats,
  CHAT_MAX_TEXT_LEN,
  // world boss
  getOrInitWorldBoss,
  applyWorldBossDamage,
  getWorldBossPlayerDmg,
  getWorldBossPlayerRank,
  getWorldBossLeaderboard,
  getWorldBossPendingRewards,
  claimWorldBossRewards,
};
