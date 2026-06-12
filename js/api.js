// 後端 API wrapper
// - 自動處理 timeout、CORS error、後端離線
// - 全部回傳 Promise<{ ok, data, error, offline }>
// - 不會 throw，呼叫端統一檢查 result.ok / result.offline

(function () {
  const API_BASE = window.API_BASE || '';
  const TIMEOUT_MS = 4000;

  // 玩家 UUID：每個瀏覽器一個，存 LocalStorage
  const PLAYER_UUID_KEY = 'veilreach.player.uuid';
  function getOrCreateUuid() {
    let u = localStorage.getItem(PLAYER_UUID_KEY);
    if (!u) {
      // 簡單 UUID v4（crypto.randomUUID 較新瀏覽器才有，fallback）
      u = (crypto.randomUUID && crypto.randomUUID()) ||
          'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });
      localStorage.setItem(PLAYER_UUID_KEY, u);
    }
    return u;
  }

  // 帶 timeout 的 fetch
  async function fetchTimeout(url, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(t);
      return r;
    } catch (err) {
      clearTimeout(t);
      throw err;
    }
  }

  async function apiGet(path) {
    if (!window.API_ENABLED || !API_BASE) return { ok: false, offline: true };
    try {
      const r = await fetchTimeout(API_BASE + path);
      if (!r.ok) return { ok: false, error: `http_${r.status}` };
      const data = await r.json();
      return { ok: true, data };
    } catch (err) {
      return { ok: false, offline: true, error: String(err.message || err) };
    }
  }

  async function apiPost(path, body) {
    if (!window.API_ENABLED || !API_BASE) return { ok: false, offline: true };
    try {
      const r = await fetchTimeout(API_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      if (!r.ok) return { ok: false, error: `http_${r.status}` };
      const data = await r.json();
      return { ok: true, data };
    } catch (err) {
      return { ok: false, offline: true, error: String(err.message || err) };
    }
  }

  // ===== 高階 API =====

  /**
   * 把當前 active 角色資料上傳到後端
   * 自動讀 GAME_STATE 的 active char + 計算 CP
   */
  async function syncCurrentPlayer() {
    if (!window.GAME_STATE) return { ok: false, error: 'state_not_ready' };
    const st = GAME_STATE.state;
    const cs = st.characters[st.activeCharId];
    if (!cs) return { ok: false, error: 'no_active_char' };

    const cp = GAME_STATE.combatPower ? GAME_STATE.combatPower(st.activeCharId) : 0;

    const bp = window.GAME_DATA && GAME_DATA.getCharacterBlueprint
      ? GAME_DATA.getCharacterBlueprint(cs.blueprintId) : null;
    const pathDef = bp && bp.paths && cs.jobPath ? bp.paths[cs.jobPath] : null;
    const tierName = pathDef
      ? (cs.jobTier >= 3 ? pathDef.tier3?.name : cs.jobTier >= 2 ? pathDef.tier2?.name : pathDef.name)
      : (bp ? bp.name : '無名');

    return apiPost('/api/players/sync', {
      id: getOrCreateUuid(),
      nickname: st.playerNickname || '無名旅人',
      character_id: cs.blueprintId,
      character_name: tierName,
      job_path: cs.jobPath || null,
      job_tier: cs.jobTier || 0,
      level: cs.level || 1,
      cp: Math.floor(cp),
    });
  }

  async function getLeaderboard(limit) {
    return apiGet('/api/leaderboard?limit=' + (limit || 100));
  }

  async function getMyRank() {
    return apiGet('/api/players/' + getOrCreateUuid());
  }

  async function pingServer() {
    return apiGet('/api/health');
  }

  // 開遊戲時檢查雲端是否有更新版本
  // 流程：取本地 lastSaved → 取雲端 updated_at → 雲端較新就觸發 prompt
  // 不會直接覆蓋，玩家確認後才執行 applyCloudSave（在 game.js 處理）
  const FRESHNESS_THRESHOLD_MS = 30 * 1000;  // 30 秒（避免時鐘小誤差誤判）
  async function checkCloudFreshness() {
    const localRaw = readLocalSave();
    if (!localRaw) return { ok: false, reason: 'no_local' };
    let localLastSaved = 0;
    try { localLastSaved = JSON.parse(localRaw).lastSaved || 0; } catch (e) {}
    const cloud = await downloadSaveByUuid();
    if (!cloud.ok) return { ok: false, reason: cloud.offline ? 'offline' : 'no_cloud' };
    const cloudUpdatedAt = cloud.data.updated_at || 0;
    const cloudNewerBy = cloudUpdatedAt - localLastSaved;
    if (cloudNewerBy > FRESHNESS_THRESHOLD_MS) {
      // 雲端比本地新很多 → 提示玩家拉過來
      if (typeof window.showCloudFreshnessPrompt === 'function') {
        window.showCloudFreshnessPrompt({
          localLastSaved,
          cloudUpdatedAt,
          cloudSaveJson: cloud.data.save_json,
        });
      }
      return { ok: true, prompted: true };
    }
    return { ok: true, prompted: false };
  }

  // ===== 雲端存檔 =====

  // 從 LocalStorage 抓整包存檔 JSON（沿用既有的 SAVE_KEY）
  const SAVE_KEY = 'veilreach.save.v4';
  function readLocalSave() {
    return localStorage.getItem(SAVE_KEY);
  }
  function writeLocalSave(jsonStr) {
    localStorage.setItem(SAVE_KEY, jsonStr);
  }

  async function uploadSave() {
    const save = readLocalSave();
    if (!save) return { ok: false, error: 'no_local_save' };
    return apiPost('/api/saves/upload', { uuid: getOrCreateUuid(), save_json: save });
  }

  async function downloadSaveByUuid() {
    return apiGet('/api/saves/by-uuid/' + getOrCreateUuid());
  }

  async function getRecoveryCode() {
    return apiPost('/api/saves/recovery-code', { uuid: getOrCreateUuid() });
  }

  async function restoreByCode(code) {
    if (!code || typeof code !== 'string') return { ok: false, error: 'invalid_code' };
    return apiPost('/api/saves/restore-by-code', { code: code.trim().toUpperCase() });
  }

  // 自動同步：每 5 分鐘上傳一次（若 LocalStorage 有變動）
  let lastSyncSig = '';
  function startAutoSync(intervalMs) {
    intervalMs = intervalMs || 5 * 60 * 1000;
    setInterval(async () => {
      const save = readLocalSave();
      if (!save) return;
      // 簡單 sig：長度 + 末 50 字（避免每次都送）
      const sig = save.length + ':' + save.slice(-50);
      if (sig === lastSyncSig) return;
      const r = await uploadSave();
      if (r.ok) {
        lastSyncSig = sig;
        window.__cloudSaveLastSync = Date.now();
      }
    }, intervalMs);
  }

  // 把 LocalStorage 的 UUID 換成另一個（恢復碼還原時用、共用同一個雲端槽位）
  function adoptUuid(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    localStorage.setItem(PLAYER_UUID_KEY, uuid);
    return true;
  }

  // ===== 世界聊天 =====

  async function sendChatMessage(text) {
    if (!text || !text.trim()) return { ok: false, error: 'empty' };
    const nickname = (window.GAME_STATE && GAME_STATE.state && GAME_STATE.state.playerNickname) || '無名旅人';
    return apiPost('/api/chat/send', {
      uuid: getOrCreateUuid(),
      nickname,
      text: text.trim().slice(0, 200),
    });
  }

  async function getRecentChats(since) {
    // 帶 uuid 讓後端把自己也算進在線人數
    return apiGet('/api/chat/recent?since=' + (since || 0) + '&uuid=' + encodeURIComponent(getOrCreateUuid()));
  }

  // 聊天輪詢：每 4 秒拉新訊息 + 在線人數
  // callback(list, meta)：meta.online = 在線人數
  let _chatPollTimer = null;
  let _chatLastSeen = 0;
  function startChatPolling(onPoll, intervalMs) {
    if (_chatPollTimer) clearInterval(_chatPollTimer);
    intervalMs = intervalMs || 4000;
    const tick = async () => {
      const r = await getRecentChats(_chatLastSeen);
      if (!r.ok) {
        if (typeof onPoll === 'function') onPoll([], { online: null, offline: true });
        return;
      }
      const data = r.data || {};
      const list = data.list || [];
      if (list.length > 0) _chatLastSeen = list[list.length - 1].created_at;
      if (typeof onPoll === 'function') onPoll(list, { online: data.online, offline: false });
    };
    tick();  // 立刻拉一次
    _chatPollTimer = setInterval(tick, intervalMs);
  }
  function stopChatPolling() {
    if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
  }

  // ===== 世界 BOSS =====

  async function worldBossState() {
    return apiGet('/api/world-boss?uuid=' + encodeURIComponent(getOrCreateUuid()));
  }

  async function worldBossSubmitDamage(damage) {
    const nick = (window.GAME_STATE && GAME_STATE.state && GAME_STATE.state.playerNickname) || '無名旅人';
    return apiPost('/api/world-boss/damage', {
      uuid: getOrCreateUuid(),
      nickname: nick,
      damage: Math.floor(damage || 0),
    });
  }

  async function worldBossLeaderboard(limit) {
    return apiGet('/api/world-boss/leaderboard?limit=' + (limit || 100));
  }

  async function worldBossMyRewards() {
    return apiGet('/api/world-boss/rewards?uuid=' + encodeURIComponent(getOrCreateUuid()));
  }

  async function worldBossClaimRewards() {
    return apiPost('/api/world-boss/claim', { uuid: getOrCreateUuid() });
  }

  // ===== 暴露 =====
  window.API = {
    getUuid: getOrCreateUuid,
    adoptUuid,
    syncCurrentPlayer,
    getLeaderboard,
    getMyRank,
    pingServer,
    // cloud save
    uploadSave,
    downloadSaveByUuid,
    getRecoveryCode,
    restoreByCode,
    startAutoSync,
    checkCloudFreshness,
    readLocalSave,
    writeLocalSave,
    // world chat
    sendChatMessage,
    getRecentChats,
    startChatPolling,
    stopChatPolling,
    // world boss
    worldBossState,
    worldBossSubmitDamage,
    worldBossLeaderboard,
    worldBossMyRewards,
    worldBossClaimRewards,
  };
})();
