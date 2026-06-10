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

  // ===== 暴露 =====
  window.API = {
    getUuid: getOrCreateUuid,
    syncCurrentPlayer,
    getLeaderboard,
    getMyRank,
    pingServer,
  };
})();
