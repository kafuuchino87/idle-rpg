// ============================================================================
// 多人連線（WebRTC P2P via PeerJS）
// 階段 1：基礎連線 + 房號交換 + 訊息廣播
// 設計：「房主權威」— host 跑完整戰鬥，guest 發送動作並接收狀態
// ============================================================================

const MP = {
  // 連線狀態
  peer: null,           // PeerJS instance
  myId: null,           // 我的 peer ID（房號）
  role: 'solo',         // 'solo' | 'host' | 'guest'
  hostId: null,         // 房主 ID（含自己當 host 時也是 myId）
  connections: {},      // { peerId: DataConnection }
  players: {},          // { peerId: { name, charName, ready, hp, maxHp } }

  // callbacks
  onConnected: null,
  onMessage: null,
  onPlayerJoined: null,
  onPlayerLeft: null,
  onDisconnected: null,
};

// ===== 工具：產生簡短的房號（替代 PeerJS 自帶的 UUID） =====
// 4 碼字母 + 4 碼數字 = 易讀 ID
function genShortRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';  // 排除 I/O 避免混淆
  const nums = '23456789';                    // 排除 0/1
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += nums[Math.floor(Math.random() * nums.length)];
  return code;
}

// ===== 初始化 PeerJS 連線 =====
// 使用 PeerJS 預設的免費公共信令服務（peerjs.com）
function initPeer(desiredId = null) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') {
      reject(new Error('PeerJS 未載入'));
      return;
    }
    const peerId = desiredId || ('vr-' + genShortRoomCode().toLowerCase());
    const peer = new Peer(peerId, {
      debug: 1,  // 0=none, 1=err, 2=warn, 3=all
    });
    peer.on('open', (id) => {
      MP.peer = peer;
      MP.myId = id;
      console.log('[MP] 連到信令伺服器，我的 ID:', id);
      // 監聽其他人主動連我（host 接受 guest，guest 也可能接受其他 guest 的 mesh 連線）
      peer.on('connection', (conn) => {
        console.log('[MP] 收到連線:', conn.peer);
        setupConnection(conn);
        const handleOpen = () => {
          onConnectionOpen(conn);
          // Host 額外：把現有玩家 list 告訴新進來的，讓他自己 mesh 連其他人
          if (MP.role === 'host') {
            const otherPeers = Object.keys(MP.connections).filter(id => id !== conn.peer);
            if (otherPeers.length > 0) {
              sendTo(conn.peer, 'peer-list', { peers: otherPeers });
            }
          }
        };
        if (conn.open) handleOpen();
        else conn.on('open', handleOpen);
      });
      peer.on('disconnected', () => {
        console.warn('[MP] 信令伺服器斷線');
        if (MP.onDisconnected) MP.onDisconnected();
      });
      peer.on('error', (err) => {
        console.error('[MP] Peer 錯誤:', err.type, err);
      });
      resolve(id);
    });
    peer.on('error', (err) => {
      // 初始化階段的錯誤（如 ID 已被佔用）
      if (err.type === 'unavailable-id') reject(new Error('房號被佔用，請換一個'));
      else reject(err);
    });
  });
}

// ===== 設定一個 DataConnection（持續監聽事件） =====
// 注意：不要在這裡綁 'open'，因為 guest 端進來時 conn 已 open，
// listener 會錯過。改由呼叫方在已 open 時直接 onConnectionOpen()。
function setupConnection(conn) {
  MP.connections[conn.peer] = conn;
  conn.on('data', (data) => {
    handleMessage(conn.peer, data);
  });
  conn.on('close', () => {
    console.log('[MP] 連線關閉:', conn.peer);
    delete MP.connections[conn.peer];
    delete MP.players[conn.peer];
    if (MP.onPlayerLeft) MP.onPlayerLeft(conn.peer);
  });
  conn.on('error', (err) => {
    console.error('[MP] 連線錯誤:', err);
  });
}

// ===== 連線已開啟時要做的事（互換 player-info、通知 UI） =====
function onConnectionOpen(conn) {
  console.log('[MP] 連線開啟:', conn.peer);
  sendTo(conn.peer, 'player-info', buildPlayerInfo());
  if (MP.onPlayerJoined) MP.onPlayerJoined(conn.peer);
}

// ===== 組合自己的 player-info（給對方看） =====
// Wave 30：戰鬥中以 BATTLE.charId 為準（玩家可能切到別角色看 UI，但廣播給隊友的應該是戰鬥角色）
function buildPlayerInfo() {
  const b = window.BATTLE;
  const battleCharId = (b && b.charId) ? b.charId : null;
  const charId = battleCharId || GAME_STATE.state.activeCharId;
  const cs = GAME_STATE.state.characters[charId];
  const blueprint = cs ? GAME_STATE.getCharacterBlueprint(cs.blueprintId) : null;
  const cp = cs ? GAME_STATE.combatPower(cs.id) : 0;
  return {
    peerId: MP.myId,
    nickname: GAME_STATE.state.playerNickname || '無名旅人',
    charName: cs ? (cs.customName || (blueprint ? blueprint.name : '?')) : '?',  // 角色名（如「月凜」）
    className: blueprint ? blueprint.title : '?',             // 職業（如「銀月狐巫」）
    pathName: cs && cs.pathName ? cs.pathName : '',           // 轉職分支
    blueprintId: cs ? cs.blueprintId : 'tsukirin',
    jobPath: cs ? cs.jobPath : '',                            // A/B/C 路線
    jobTier: cs ? cs.jobTier : 0,                             // 1/2/3 階
    level: cs ? cs.level : 1,
    cp: cp,
    graduated: cs ? !!cs.graduated : false,
  };
}

// ===== 通知所有連線者：我的資訊更新了（如改暱稱） =====
function broadcastPlayerInfo() {
  broadcast('player-info', buildPlayerInfo());
}

// ===== 房主邀請朋友打襲擊戰 =====
function broadcastRaidLaunch(dungeonId) {
  if (!isHost()) return;
  broadcast('raid-launch', { dungeonId, ts: Date.now() });
}

// ===== Host 廣播敵人狀態（每 200ms） =====
// 廣播完整敵人資料（name/maxHp/atk/def），Guest 用此重建本地 wave 確保同步
function broadcastEnemySync() {
  if (MP.role !== 'host') return;
  const b = window.BATTLE;
  if (!b || !b.currentWave || !b.dungeonId) return;
  // wave 切換過渡期（600ms）不廣播，避免空 wave 覆寫 Guest 端
  if (b._wavePending) return;
  broadcast('enemy-sync', {
    dungeonId: b.dungeonId,
    waveIdx: b.currentWaveIdx,
    totalWaves: (b.waves || []).length,
    enemies: b.currentWave.map(e => ({
      name: e.name,
      hp: Math.floor(e.hp || 0),
      maxHp: e.maxHp,
      isBoss: !!e.isBoss,
      atk: e.atk,
      def: e.def,
    })),
    cleared: !!b._cleared,
  });
}

// ===== 無盡塔結束：host 廣播權威終局數據 → guest 強制同步結算 =====
// 確保兩端同時結束 + 用 host 統計的 totalTeamDmg（含完整隊伍累積）
function broadcastEndlessEnd(totalTeamDmg) {
  if (MP.role !== 'host' || !MP.peer) return;
  broadcast('endless-end', { totalTeamDmg: totalTeamDmg || 0, ts: Date.now() });
}

// ===== B 路線聖光治癒：廣播給隊友按各自 maxHp 計算回血量 =====
function broadcastHealAlly(pct, skillName) {
  if (MP.role === 'solo' || !MP.peer) {
    console.log('[heal-ally][send] 略過：role=' + MP.role + ' peer=' + !!MP.peer);
    return;
  }
  const conns = Object.keys(MP.connections).length;
  console.log('[heal-ally][send] pct=' + pct + ' name=' + skillName + ' conns=' + conns);
  broadcast('heal-ally', { pct, name: skillName || '' });
}

// ===== 廣播自己的傷害給所有隊友（雙向）=====
// Host：對方累計到 damageStats 顯示，自己對敵人扣血是本地處理
// Guest：Host 收到會幫忙扣敵人 HP（權威），其他 Guest 累計到 damageStats 顯示
function reportDamageDealt(enemyIdx, dmg, isCrit) {
  if (MP.role === 'solo' || !MP.peer) return;
  broadcast('dmg-dealt', {
    waveIdx: window.BATTLE ? window.BATTLE.currentWaveIdx : 0,
    enemyIdx, dmg, isCrit,
  });
}

// ===== 廣播自己的戰鬥狀態（給隊友顯示） =====
// Wave 30：戰鬥中以 BATTLE.charId 為準
function broadcastBattleState() {
  if (MP.role === 'solo') return;
  const b = window.BATTLE;
  const battleCharId = (b && b.charId) ? b.charId : null;
  const charId = battleCharId || GAME_STATE.state.activeCharId;
  const cs = GAME_STATE.state.characters[charId];
  const cp = cs ? GAME_STATE.combatPower(cs.id) : 0;
  // 不在戰鬥也要帶 level/cp/jobPath/jobTier，這樣 ally panel 能即時跟著對方升級 / 轉職更新
  const base = {
    level: cs ? cs.level : 1,
    cp: cp,
    graduated: cs ? !!cs.graduated : false,
    jobPath: cs ? (cs.jobPath || '') : '',
    jobTier: cs ? (cs.jobTier || 0) : 0,
    pathName: cs && cs.pathName ? cs.pathName : '',
  };
  if (!b || !b.charId) {
    broadcast('player-state', { inBattle: false, ...base });
    return;
  }
  broadcast('player-state', {
    hp: b.player ? Math.floor(b.player.hp || 0) : 0,
    maxHp: b.player ? Math.floor(b.player.maxHp || 0) : 0,
    mp: b.player ? Math.floor(b.player.mp || 0) : 0,
    maxMp: b.player ? Math.floor(b.player.maxMp || 0) : 0,
    dungeonId: b.dungeonId,
    inBattle: true,
    paused: !!b.paused,
    ...base,
  });
}

// 內部 helper
function isHost() { return MP.role === 'host'; }
function isGuest() { return MP.role === 'guest'; }

// ===== 處理收到的訊息 =====
function handleMessage(fromPeerId, data) {
  if (!data || typeof data !== 'object') return;
  console.log('[MP] 收到', data.type, 'from', fromPeerId, data.payload);

  // 內建訊息處理
  // Host 告訴新訪客其他訪客的 peerId 清單 → 主動 mesh 連
  if (data.type === 'peer-list' && Array.isArray(data.payload.peers)) {
    for (const peerId of data.payload.peers) {
      if (peerId === MP.myId) continue;
      if (MP.connections[peerId]) continue;  // 已連
      console.log('[MP] mesh 主動連:', peerId);
      const conn = MP.peer.connect(peerId, { reliable: true });
      conn.on('open', () => {
        setupConnection(conn);
        onConnectionOpen(conn);
      });
      conn.on('error', err => console.error('[MP] mesh connect error:', err));
    }
  }
  if (data.type === 'player-info') {
    // 保留現有的 battleState（避免被覆蓋）
    const prevBattleState = MP.players[fromPeerId] && MP.players[fromPeerId].battleState;
    MP.players[fromPeerId] = { ...data.payload, battleState: prevBattleState };
  }
  if (data.type === 'player-state') {
    if (!MP.players[fromPeerId]) MP.players[fromPeerId] = {};
    MP.players[fromPeerId].battleState = data.payload;
  }
  if (data.type === 'player-dead') {
    if (!MP.players[fromPeerId]) MP.players[fromPeerId] = {};
    if (!MP.players[fromPeerId].battleState) MP.players[fromPeerId].battleState = {};
    MP.players[fromPeerId].battleState.dead = true;
    // 提示給本機 UI
    if (typeof window.toast === 'function') {
      const nick = MP.players[fromPeerId].nickname || '隊友';
      toast(`⚠ ${nick} 陣亡！`, 'error');
    }
    // 立即檢查 team-wipe（不等下次 tickBattle）
    const b = window.BATTLE;
    if (b && b._dead && !b._teamWipeFired && (b._mpMode === 'host' || b._mpMode === 'guest')) {
      const playerIds = Object.keys(MP.players);
      const allAllyDead = playerIds.length > 0 && playerIds.every(id => {
        const p = MP.players[id];
        const bs = p && p.battleState;
        return bs && (bs.dead || (bs.inBattle && bs.maxHp > 0 && bs.hp <= 0));
      });
      if (allAllyDead) {
        b._teamWipeFired = true;
        // 無盡塔：按累積傷害結算；一般副本：戰敗 0 獎勵
        if (b._endlessMode && typeof window.onEndlessTimeUp === 'function') {
          window.onEndlessTimeUp();
        } else if (typeof window.onBattleFail === 'function') {
          window.onBattleFail();
        }
      }
    }
  }
  // Guest 收到 Host 廣播的敵人狀態 → 直接以 Host 為準
  if (data.type === 'enemy-sync' && MP.role === 'guest') {
    const b = window.BATTLE;
    // Wave 29.2：guest 沒在 host 的副本 → 自動跟上（解決後加入的 guest 沒收到 raid-launch 的問題）
    // Wave 31：!b.running 也要跟（修「結算後 host 開同關卡，guest 還停在上一場結束狀態」）
    const hostDungeonId = data.payload.dungeonId;
    const notInRightDungeon = !b || !b.dungeonId || b.dungeonId !== hostDungeonId || b._mpMode !== 'guest' || !b.running;
    if (notInRightDungeon && typeof window.startBattle === 'function') {
      // 防抖：800ms 內不要重複進入（避免每 200ms 一次 enemy-sync 反覆觸發）
      const now = Date.now();
      if (!MP._lastAutoJoin || now - MP._lastAutoJoin > 800) {
        MP._lastAutoJoin = now;
        const d = (typeof GAME_DATA !== 'undefined') && GAME_DATA.getDungeon(hostDungeonId);
        const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
        if (d && cs && (!d.requiredLv || cs.level >= d.requiredLv)) {
          // 無盡塔 fallback 路徑也要扣自己 1 張入場券（與 raid-launch 路徑一致）
          if (d.isEndless) {
            const ok = GAME_STATE.consumePass('pass-endless', 1);
            if (!ok) {
              if (typeof toast === 'function') toast('你的入場券不足，無法跟進無盡塔', 'error');
              return;
            }
          }
          console.log('[Wave 29.2] 自動跟上 host 副本：' + hostDungeonId);
          if (typeof toast === 'function') toast('自動跟上隊伍：' + d.name + (d.isEndless ? '（扣 1 張通行證）' : ''), 'gold');
          if (typeof PIXEL !== 'undefined') {
            try { PIXEL.setScene({ regionId: GAME_DATA.getRegionByDungeon(d.id).id }); } catch (_) {}
          }
          // 關掉副本選擇/襲擊戰預覽視窗 + 結算彈窗
          ['winRaidPreview', 'winDungeon', 'resultOverlay'].forEach(id => {
            const w = document.getElementById(id);
            if (w) { w.style.display = ''; w.classList.add('hidden'); }
          });
          window.startBattle(hostDungeonId, GAME_STATE.state.activeCharId);
        }
      }
      return;  // 等下一次 enemy-sync 再做實際同步（此時 b 還沒準備好）
    }
    if (b && b._mpMode === 'guest' && b.dungeonId === data.payload.dungeonId) {
      const hostEnemies = data.payload.enemies || [];
      const hostWaveIdx = data.payload.waveIdx;
      const hostTotalWaves = data.payload.totalWaves || (b.waves || []).length;

      // 同步 totalWaves（Host 可能與 Guest 本地 buildWaves 長度不同）
      if (b.waves && b.waves.length !== hostTotalWaves) {
        // 補齊或截斷 BATTLE.waves（內容不重要，只用 length 判斷通關時機）
        while (b.waves.length < hostTotalWaves) b.waves.push([]);
        if (b.waves.length > hostTotalWaves) b.waves.length = hostTotalWaves;
      }

      // Wave 32：判斷 guest 是否處於「空 wave」狀態（等待中）
      // 若是，無論 names 是否變 都要強制重建
      const guestWaiting = !b.enemy || !b.currentWave || b.currentWave.length === 0;
      const waveChanged = b.currentWaveIdx !== hostWaveIdx;
      const hostNames = hostEnemies.map(e => `${e.name}@${e.maxHp}`).join(',');
      const localNames = (b.currentWave || []).map(e => `${e.name}@${e.maxHp}`).join(',');
      if (guestWaiting || waveChanged || hostNames !== localNames) {
        b.currentWaveIdx = hostWaveIdx;
        b.currentWave = hostEnemies.map(e => ({
          name: e.name,
          hp: e.hp,
          maxHp: e.maxHp,
          atk: e.atk,
          def: e.def,
          isBoss: e.isBoss,
          nextAtk: 1.4 + Math.random() * 0.4,
        }));
        b.enemy = b.currentWave[0] || null;
        b.freezes = 0;
        if (b.onUpdate) b.onUpdate();
      } else {
        // 結構一致 → 只覆寫 HP（只能降）
        for (let i = 0; i < Math.min(b.currentWave.length, hostEnemies.length); i++) {
          if (b.currentWave[i] && hostEnemies[i]) {
            const newHp = hostEnemies[i].hp;
            if (newHp < b.currentWave[i].hp) b.currentWave[i].hp = newHp;
          }
        }
      }
      // Host 已通關 → Guest 跟著結算（但要進戰鬥至少 3 秒避免被殘留訊息誤觸發）
      if (data.payload.cleared && !b._cleared && typeof window.onDungeonClear === 'function') {
        const elapsed = b.startTime ? (performance.now() - b.startTime) : 0;
        if (elapsed >= 3000) {
          window.onDungeonClear();
        } else {
          console.warn('[mp] 忽略過早的 cleared sync (elapsed', elapsed, 'ms)');
        }
      }
    }
  }
  // 收到 host 廣播的「無盡塔結束」→ guest 強制同步結算
  if (data.type === 'endless-end' && MP.role === 'guest') {
    const b = window.BATTLE;
    if (b && b.running && b._endlessMode && !b._cleared) {
      // 用 host 的權威 totalTeamDmg 覆寫本地（補上 host 還沒同步到 guest 的傷害）
      const hostTotal = data.payload.totalTeamDmg || 0;
      if (hostTotal > (b._endlessTeamDmg || 0)) {
        b._endlessTeamDmg = hostTotal;
        if (typeof window.updateEndlessTier === 'function') window.updateEndlessTier();
      }
      // 強制結束 timer，立刻結算
      b._endlessTimeLeft = 0;
      if (typeof window.onEndlessTimeUp === 'function') window.onEndlessTimeUp();
    }
  }
  // 收到 B 路線聖光治癒 → 按自己 maxHp 補血
  if (data.type === 'heal-ally') {
    console.log('[heal-ally][recv] role=' + MP.role + ' running=' + (window.BATTLE?.running) + ' maxHp=' + (window.BATTLE?.player?.maxHp));
    if (MP.role === 'host' || MP.role === 'guest') {
      const b = window.BATTLE;
      if (b && b.running && b.player && b.player.maxHp > 0) {
        const pct = Math.max(0, Math.min(1, data.payload.pct || 0));
        const amount = Math.floor(b.player.maxHp * pct);
        console.log('[heal-ally][apply] pct=' + pct + ' amount=' + amount + ' hp_before=' + b.player.hp);
        if (amount > 0) {
          b.player.hp = Math.min(b.player.maxHp, b.player.hp + amount);
          const allyName = (MP.players[fromPeerId] && MP.players[fromPeerId].nickname) || '隊友';
          if (typeof window.logLine === 'function') window.logLine(`<span class="lg-clear">${allyName} 的 ${data.payload.name || '聖光'} 治療你 +${amount} HP</span>`, '');
          if (typeof window.floatDamage === 'function') window.floatDamage('+' + amount, 'heal');
        }
      } else {
        console.log('[heal-ally][skip] battle 不在執行中或玩家未就緒');
      }
    }
  }
  // 收到隊友的傷害廣播 → 累計到自己 damageStats 給戰報顯示
  if (data.type === 'dmg-dealt' && (MP.role === 'host' || MP.role === 'guest')) {
    const b = window.BATTLE;
    if (b && (b._mpMode === 'host' || b._mpMode === 'guest')) {
      const allyName = (MP.players[fromPeerId] && MP.players[fromPeerId].nickname) || '隊友';
      // 累計到戰報（雙方都做）
      if (typeof window.trackDamage === 'function') {
        window.trackDamage(data.payload.dmg, 'mp-ally:' + allyName, !!data.payload.isCrit);
      }
      // 無盡塔：累加團隊傷害（自己不算 selfDmg）
      if (b._endlessMode) {
        b._endlessTeamDmg = (b._endlessTeamDmg || 0) + data.payload.dmg;
        if (typeof window.updateEndlessTier === 'function') window.updateEndlessTier();
      }
      // Host 額外責任：實際扣敵人 HP（權威）— 無盡塔不扣（HP 是 Infinity）
      if (!b._endlessMode && MP.role === 'host' && b.currentWave && b.currentWaveIdx === data.payload.waveIdx) {
        const e = b.currentWave[data.payload.enemyIdx];
        if (e && e.hp > 0) {
          e.hp -= data.payload.dmg;
          if (e.hp <= 0 && typeof window.onEnemyDown === 'function') {
            window.onEnemyDown();
          }
        }
      }
    }
  }

  // 交給上層 callback
  if (MP.onMessage) MP.onMessage(fromPeerId, data.type, data.payload);
}

// ===== 房主：建立房間 =====
async function hostRoom() {
  if (MP.peer) await leaveRoom();
  const code = genShortRoomCode();
  const peerId = 'vr-' + code.toLowerCase();
  await initPeer(peerId);
  MP.role = 'host';
  MP.hostId = MP.myId;
  console.log('[MP] 已建立房間:', code);
  return code;
}

// ===== 加入房間 =====
async function joinRoom(roomCode) {
  if (MP.peer) await leaveRoom();
  // 自己拿個隨機 ID
  await initPeer();
  MP.role = 'guest';
  // 連到房主
  const hostPeerId = 'vr-' + roomCode.toLowerCase();
  MP.hostId = hostPeerId;
  return new Promise((resolve, reject) => {
    const conn = MP.peer.connect(hostPeerId, { reliable: true });
    const timer = setTimeout(() => {
      reject(new Error('連線超時（15 秒）— 房號可能錯誤，或對方未開啟房間'));
    }, 15000);
    conn.on('open', () => {
      clearTimeout(timer);
      setupConnection(conn);
      onConnectionOpen(conn);  // ← 連上後立刻送 player-info 給房主
      if (MP.onConnected) MP.onConnected(hostPeerId);
      resolve(hostPeerId);
    });
    conn.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ===== 離開房間 / 清理 =====
async function leaveRoom() {
  for (const peerId in MP.connections) {
    try { MP.connections[peerId].close(); } catch (_) {}
  }
  MP.connections = {};
  MP.players = {};
  if (MP.peer) {
    try { MP.peer.destroy(); } catch (_) {}
    MP.peer = null;
  }
  MP.myId = null;
  MP.role = 'solo';
  MP.hostId = null;
}

// ===== 廣播訊息給所有連線者 =====
function broadcast(type, payload) {
  const msg = { type, payload };
  for (const peerId in MP.connections) {
    const conn = MP.connections[peerId];
    if (conn && conn.open) {
      try { conn.send(msg); } catch (e) { console.error('[MP] send fail:', e); }
    }
  }
}

// ===== 點對點訊息（指定對象） =====
function sendTo(peerId, type, payload) {
  const conn = MP.connections[peerId];
  if (conn && conn.open) {
    try { conn.send({ type, payload }); } catch (e) { console.error('[MP] sendTo fail:', e); }
  }
}

// ===== 對外 API =====
window.MP = MP;
window.MP_API = {
  hostRoom,
  joinRoom,
  leaveRoom,
  broadcast,
  broadcastPlayerInfo,
  broadcastRaidLaunch,
  broadcastBattleState,
  broadcastEnemySync,
  broadcastHealAlly,
  broadcastEndlessEnd,
  reportDamageDealt,
  sendTo,
  isHost,
  isGuest,
  isConnected: () => MP.role !== 'solo',
  getRoomCode: () => {
    if (!MP.hostId) return null;
    return MP.hostId.replace(/^vr-/, '').toUpperCase();
  },
  getPlayers: () => MP.players,
  getMyId: () => MP.myId,
};
