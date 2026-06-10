// ===========================================================================
// 主邏輯：創角、UI、主迴圈、解鎖通知、轉職
// ===========================================================================

// Wave 29：背包每角色獨立 — UI 透過這兩個 helper 取當前角色 / 背包
function _activeCs() {
  return GAME_STATE.state.characters[GAME_STATE.state.activeCharId] || null;
}
function _activeBag() {
  const c = _activeCs();
  if (!c) return { materials: {}, equipment: {}, gems: {}, potions: {}, chests: {}, rerollTokens: 0 };
  if (!c.bag) c.bag = { materials: {}, equipment: {}, gems: {}, potions: {}, chests: {}, rerollTokens: 0 };
  return c.bag;
}
function _activeClearedDungeons() {
  const c = _activeCs();
  if (!c) return {};
  if (!c.clearedDungeons) c.clearedDungeons = {};
  return c.clearedDungeons;
}

window.addEventListener('DOMContentLoaded', init);

function init() {
  PIXEL.init();

  if (!GAME_STATE.state.hasCharacter) {
    showCreationOverlay();
  } else {
    enterGame();
  }

  bindGlobalEvents();

  // 雲端存檔自動同步：每 5 分鐘把 LocalStorage 上傳到後端做備份
  if (window.API && typeof window.API.startAutoSync === 'function') {
    window.API.startAutoSync();  // 預設 5 分鐘
  }
}

function enterGame() {
  PIXEL.setScene({ charId: GAME_STATE.state.activeCharId });
  renderAll();

  BATTLE.onUpdate = () => { renderHudBars(); };
  BATTLE.onLog = () => { renderBattleLog(); };
  BATTLE.onClear = () => {
    renderHud(); renderDungeonList(); renderForge(); renderBag(); renderClearSummary(); flushPendingNotifications();
    // 襲擊戰通關跳結算彈窗（停止自動戰鬥防誤入）
    if (BATTLE.lastClear && (BATTLE.lastClear.isRaid || BATTLE.lastClear.isEndless)) showResultModal(BATTLE.lastClear);
  };
  BATTLE.onFail = () => {
    renderHud();
    // 戰敗一律跳結算彈窗（玩家會想知道為什麼停了）
    if (BATTLE.lastClear) showResultModal(BATTLE.lastClear);
  };

  // ── 背景持續運行：Web Audio 靜音保活 ──
  // 瀏覽器看到分頁有「音訊輸出」就不會 throttle requestAnimationFrame
  // 第一次玩家點任何元素後啟動（autoplay policy 要求 user gesture）
  // 整個 lifecycle 只啟動一次，振盪器 0 音量永不停
  window._bgAudioCtx = null;
  function enableBgKeepalive() {
    if (window._bgAudioCtx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;       // 完全靜音
      osc.frequency.value = 440; // 440Hz（聽不到也沒差）
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      window._bgAudioCtx = ctx;
      console.log('[background] Web Audio 保活已啟動');
    } catch (e) {
      console.warn('[background] Web Audio 啟動失敗：', e);
    }
  }
  // 任何點擊都觸發（once 確保只跑一次）
  document.addEventListener('click', enableBgKeepalive, { once: true });
  document.addEventListener('keydown', enableBgKeepalive, { once: true });
  // 分頁切換時把 AudioContext resume 一下（部分瀏覽器會 suspend）
  document.addEventListener('visibilitychange', () => {
    if (window._bgAudioCtx && window._bgAudioCtx.state === 'suspended') {
      window._bgAudioCtx.resume().catch(() => {});
    }
  });

  let last = performance.now();
  let lastMpBroadcast = 0;
  let lastAllyRender = 0;
  const OFFLINE_MAX_MS = 4 * 60 * 60 * 1000;  // 最多補 4 小時（背景保活若失敗、或真關機才會用到）
  const OFFLINE_THRESHOLD = 3000;             // 超過 3 秒視為「背景中斷」
  function loop(now) {
    const elapsed = now - last;
    if (elapsed > OFFLINE_THRESHOLD) {
      // 分頁背景太久（rAF 被瀏覽器暫停），用固定步長補上時間
      const compensation = Math.min(elapsed, OFFLINE_MAX_MS);
      const STEP = 100;  // 100ms 一塊，比正常 frame 慢 6×，但避免一次跳太多
      const steps = Math.floor(compensation / STEP);
      for (let i = 0; i < steps; i++) tickBattle(STEP);
      last = now;
      if (typeof toast === 'function' && compensation > 5000) {
        toast(`離開 ${(compensation / 1000).toFixed(0)} 秒，已補上戰鬥進度`, 'gold');
      }
    } else {
      const dt = Math.min(150, elapsed);
      last = now;
      tickBattle(dt);
    }
    renderHudBars();
    renderSpeedReadout();
    renderSkillBar();
    flushPendingNotifications();
    // 多人：每 500ms 廣播戰鬥狀態 + 重繪 ally panel
    if (now - lastMpBroadcast > 500) {
      lastMpBroadcast = now;
      if (window.MP_API && MP_API.isConnected()) {
        MP_API.broadcastBattleState();
        // 備援 team-wipe 檢查（若 tickBattle 沒跑或 player-dead 訊息漏接）
        const b = window.BATTLE;
        if (b && b._dead && !b._teamWipeFired && (b._mpMode === 'host' || b._mpMode === 'guest')) {
          const players = MP_API.getPlayers();
          const playerIds = Object.keys(players);
          const allAllyDead = playerIds.length > 0 && playerIds.every(id => {
            const p = players[id];
            const bs = p && p.battleState;
            if (!bs) return true;
            if (!bs.inBattle) return true;  // ★ 沒進副本不算戰友
            return bs.dead || (bs.maxHp > 0 && bs.hp <= 0);
          });
          if (allAllyDead && typeof window.onBattleFail === 'function') {
            b._teamWipeFired = true;
            window.onBattleFail();
          }
        }
      }
    }
    if (now - lastAllyRender > 300) {
      lastAllyRender = now;
      renderAllyPanel();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  setInterval(() => GAME_STATE.saveState(), 30000);
  window.addEventListener('beforeunload', () => GAME_STATE.saveState());

  bindLeftChat();
  renderLeftChat();

  toast(`歡迎回來，旅人。`);

  // Wave 28：檢查角色是否有跨路線技能 BUG（舊版本創角遺留）
  setTimeout(checkJobPathConflicts, 600);
}

// ============================================================================
// Wave 28：跨路線技能 BUG 偵測 + 修復對話框
// ============================================================================
function checkJobPathConflicts() {
  const state = GAME_STATE.state;
  if (!state || !state.characters) return;
  const conflicted = [];
  for (const id in state.characters) {
    const cs = state.characters[id];
    const audit = GAME_STATE.auditJobPath(cs);
    if (audit && audit.hasConflict) {
      conflicted.push({ cs, audit });
    }
  }
  if (conflicted.length === 0) return;
  // 一次處理一個角色，處理完再檢查下一個
  showJobPathFixModal(conflicted, 0);
}

function showJobPathFixModal(list, idx) {
  if (idx >= list.length) return;
  const { cs, audit } = list[idx];
  const skillName = sid => (GAME_DATA.SKILLS[sid] && GAME_DATA.SKILLS[sid].name) || sid;
  const passiveName = pid => (GAME_DATA.PASSIVES[pid] && GAME_DATA.PASSIVES[pid].name) || pid;
  const aList = [
    ...audit.aSkills.map(s => `技能：${skillName(s)}`),
    ...audit.aPassives.map(p => `被動：${passiveName(p)}`),
  ].join('、') || '（無）';
  const bList = [
    ...audit.bSkills.map(s => `技能：${skillName(s)}`),
    ...audit.bPassives.map(p => `被動：${passiveName(p)}`),
  ].join('、') || '（無）';
  const curPathLabel = audit.currentPath === 'A' ? 'A 路線（月華）' :
                       audit.currentPath === 'B' ? 'B 路線（狐神）' : '未選擇';

  // 建動態 overlay
  let overlay = document.getElementById('jobPathFixOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'jobPathFixOverlay';
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="overlay-card small">
        <h3 style="color:var(--hp-enemy);margin:0 0 8px">⚠ 跨路線技能 BUG 修復</h3>
        <div id="jpfBody" style="font-size:12px;line-height:1.7;margin-bottom:12px"></div>
        <div style="display:flex;gap:6px;flex-direction:column">
          <button class="primary" id="jpfKeepA">保留 A 路線（移除 B 內容）</button>
          <button class="primary" id="jpfKeepB">保留 B 路線（移除 A 內容）</button>
          <button class="ghost" id="jpfSkip">稍後再修</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  const body = overlay.querySelector('#jpfBody');
  body.innerHTML = `
    <div>角色：<b>${cs.customName || cs.blueprintId} (Lv ${cs.level})</b></div>
    <div>當前路線：<b style="color:var(--accent)">${curPathLabel}</b></div>
    <div style="margin-top:8px;padding:6px 8px;background:var(--bg);border-radius:4px;border-left:3px solid #6699ff">
      <b style="color:#6699ff">A 路線內容：</b><br>${aList}
    </div>
    <div style="margin-top:6px;padding:6px 8px;background:var(--bg);border-radius:4px;border-left:3px solid #ff6688">
      <b style="color:#ff6688">B 路線內容：</b><br>${bList}
    </div>
    <div style="margin-top:8px;color:var(--muted);font-size:11px">
      請選擇要保留的路線（另一邊的技能 / 被動會被移除，並從技能槽自動取消裝備）。
    </div>
    ${list.length > 1 ? `<div style="margin-top:4px;color:var(--muted);font-size:11px">（${idx + 1} / ${list.length}）</div>` : ''}`;
  overlay.classList.remove('hidden');

  const close = () => {
    overlay.classList.add('hidden');
  };
  const fixAndNext = (keep) => {
    const r = GAME_STATE.fixJobPath(cs, keep);
    if (r) {
      toast(`已修復 ${cs.customName || cs.blueprintId}：移除 ${r.droppedSkills} 個技能、${r.droppedPassives} 個被動`, 'gold');
      renderAll();
    }
    close();
    setTimeout(() => showJobPathFixModal(list, idx + 1), 400);
  };
  overlay.querySelector('#jpfKeepA').onclick = () => fixAndNext('A');
  overlay.querySelector('#jpfKeepB').onclick = () => fixAndNext('B');
  overlay.querySelector('#jpfSkip').onclick = () => {
    close();
    toast('已跳過跨路線修復（重新整理會再次提示）', 'warn');
  };
}

function renderAll() {
  renderCharList();
  renderCharDetail();
  renderDungeonList();
  renderForge();
  renderBag();
  renderSkills();
  renderHud();
  renderHudBars();
}

// ============================================================================
// 創角畫面
// ============================================================================
function showCreationOverlay(isAdditional) {
  document.getElementById('creationOverlay').classList.remove('hidden');

  // 渲染角色縮圖列表（左欄）+ 詳細區（右欄）
  const list = document.getElementById('charThumbList');
  const blueprints = (GAME_DATA.CHARACTERS || []);
  let selectedId = blueprints[0] ? blueprints[0].id : 'tsukirin';

  function renderCards() {
    list.innerHTML = '';
    for (const bp of blueprints) {
      const card = document.createElement('div');
      card.className = 'char-thumb' + (selectedId === bp.id ? ' selected' : '');
      card.dataset.bp = bp.id;
      card.innerHTML = `
        <div class="char-thumb-portrait">${CHAR_PORTRAIT(bp.id, { bg: true, forceBase: true })}</div>
        <div class="char-thumb-info">
          <div class="char-thumb-name">${bp.name}</div>
          <div class="char-thumb-title">${bp.title}</div>
          <div class="char-thumb-weapon">⚔ ${bp.weaponType}</div>
        </div>
      `;
      card.onclick = () => {
        selectedId = bp.id;
        renderCards();
        renderDetail();
      };
      list.appendChild(card);
    }
  }

  function renderDetail() {
    const bp = blueprints.find(b => b.id === selectedId) || blueprints[0];
    if (!bp) return;
    document.getElementById('creationPortrait').innerHTML = CHAR_PORTRAIT(bp.id, { bg: true, forceBase: true });
    document.getElementById('creationDetailInfo').innerHTML = `
      <div class="detail-name">${bp.name} <small>${bp.enName || ''}</small></div>
      <div class="detail-subtitle">${bp.title} · ${bp.weaponType}</div>
      <div class="detail-role">${bp.role}</div>
      <div class="detail-lore">${bp.lore}</div>
      <div class="detail-paths">
        <div class="path-row path-a">
          <div class="path-head"><span class="path-tag">A 路線</span> ${bp.paths.A.name}</div>
          <div class="path-desc">${bp.paths.A.desc}</div>
        </div>
        <div class="path-row path-b">
          <div class="path-head"><span class="path-tag">B 路線</span> ${bp.paths.B.name}</div>
          <div class="path-desc">${bp.paths.B.desc}</div>
        </div>
      </div>
    `;
  }

  renderCards();
  renderDetail();

  document.getElementById('btnCreate').onclick = () => {
    const nickname = (document.getElementById('creationNickname').value || '').trim();
    if (!GAME_STATE.getPlayerNickname()) {
      if (!nickname) {
        toast('請填寫玩家暱稱（多人連線會用到）', 'error');
        document.getElementById('creationNickname')?.focus();
        return;
      }
      GAME_STATE.setPlayerNickname(nickname);
    } else if (nickname) {
      GAME_STATE.setPlayerNickname(nickname);
    }
    const bp = blueprints.find(b => b.id === selectedId) || blueprints[0];
    const cs = GAME_STATE.createCharacter(bp.id, bp.name);
    if (!cs) { toast('已達角色上限', 'error'); return; }
    document.getElementById('creationOverlay').classList.add('hidden');
    if (isAdditional) {
      renderAll();
      toast(`「${bp.name}」加入隊伍。`, 'gold');
    } else {
      enterGame();
      toast(`「${bp.name}」的旅程開始了。`, 'gold');
    }
  };
}

// ============================================================================
// 全域事件
// ============================================================================
function bindGlobalEvents() {
  // 浮動視窗：按鈕開關
  const winMap = { char: 'winChar', dungeon: 'winDungeon', forge: 'winForge', bag: 'winBag', skills: 'winSkills', report: 'winReport', equip: 'winEquip', resonance: 'winResonance', craft: 'winCraft', shop: 'winShop', potionConfig: 'winPotionConfig', raidPreview: 'winRaidPreview', craftPreview: 'winCraftPreview', mpRoom: 'winMpRoom', smith: 'winSmith', imbue: 'winImbue', leaderboard: 'winLeaderboard' };
  document.querySelectorAll('.dock-toggle, .cs-detail-btn').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.win;
      const win = document.getElementById(winMap[key]);
      const wasOpen = !win.classList.contains('hidden');
      win.classList.toggle('hidden', wasOpen);
      btn.classList.toggle('active', !wasOpen);
      if (!wasOpen) {
        bringWindowToFront(win);
        if (key === 'char') renderCharDetail();
        if (key === 'dungeon') renderDungeonList();
        if (key === 'forge') renderForge();
        if (key === 'bag') renderBag();
        if (key === 'skills') renderSkills();
        if (key === 'report') renderBattleReport();
        if (key === 'resonance') renderResonance();
        if (key === 'craft') renderCraft();
        if (key === 'shop') renderShop();
        if (key === 'potionConfig') renderPotionConfig();
        if (key === 'mpRoom') renderMpRoom();
        if (key === 'smith') renderSmith();
        if (key === 'imbue') renderImbue();
        if (key === 'leaderboard') renderLeaderboard();
      }
    };
  });
  // 關閉按鈕
  document.querySelectorAll('.float-close').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const key = btn.dataset.close;
      const w = document.getElementById(winMap[key]);
      if (w) {
        // 清掉 inline display 並加上 hidden class，雙重保險
        w.style.display = '';
        w.style.visibility = '';
        w.classList.add('hidden');
      }
      document.querySelector(`.dock-toggle[data-win="${key}"]`)?.classList.remove('active');
    };
  });
  // 拖移
  document.querySelectorAll('.float-panel').forEach(win => {
    const header = win.querySelector('.float-header');
    if (!header) return;
    header.onmousedown = (e) => {
      if (e.target.classList.contains('float-close')) return;
      bringWindowToFront(win);
      const r = win.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      const move = (ev) => {
        win.style.left = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - dx)) + 'px';
        win.style.top = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy)) + 'px';
        win.style.right = 'auto';
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
  });

  document.getElementById('btnStop').onclick = () => {
    if (BATTLE.running) { stopBattle('手動停止'); toast('已停止'); }
  };
  document.getElementById('btnToggleAuto').onclick = () => {
    GAME_STATE.state.autoRun = !GAME_STATE.state.autoRun;
    toast(`自動再戰：${GAME_STATE.state.autoRun ? '開' : '關'}`);
    GAME_STATE.scheduleSave();
  };
  document.getElementById('btnSave').onclick = () => { GAME_STATE.saveState(); toast('已存檔', 'gold'); };
  document.getElementById('btnExport').onclick = () => {
    GAME_STATE.saveState();
    // v2 格式：save 直接是物件（不是字串），避免內層 quotes escape 在轉送過程被破壞
    let saveObj = null;
    try { saveObj = JSON.parse(localStorage.getItem('veilreach.save.v4')); } catch (e) {}
    const data = {
      save: saveObj,
      nickname: localStorage.getItem('veilreach.nickname'),
      version: 'veilreach-export-v2',
    };
    const str = JSON.stringify(data);
    openIoModal({
      title: '匯出存檔',
      hint: '下面這串就是你的存檔。請在文字框內按 Ctrl+A 全選 → Ctrl+C 複製，貼到網頁版「匯入」即可。',
      value: str,
      readonly: true,
      confirmText: '完成',
      onConfirm: () => { closeIoModal(); toast('已關閉，記得複製存檔字串', 'gold'); },
    });
  };
  document.getElementById('btnImport').onclick = () => {
    openIoModal({
      title: '匯入存檔',
      hint: '在下方文字框 Ctrl+V 貼上你的存檔字串，再按「匯入」。',
      value: '',
      readonly: false,
      confirmText: '匯入',
      onConfirm: () => {
        const raw = document.getElementById('ioTextarea').value.trim();
        if (!raw) { toast('請先貼上存檔字串', 'error'); return; }
        let data;
        try { data = JSON.parse(raw); }
        catch (e) {
          alert('JSON 解析失敗：\n\n' + e.message
            + '\n\n字串長度：' + raw.length + ' 字'
            + '\n開頭 100 字：\n' + raw.slice(0, 100)
            + '\n\n結尾 100 字：\n' + raw.slice(-100)
            + '\n\n可能原因：\n'
            + '1. 貼上時被截斷（手機瀏覽器限制）\n'
            + '2. 複製時沒全選\n'
            + '3. 存檔包含特殊字元被破壞');
          return;
        }
        if (!data || !data.version || !data.save) {
          alert('這不是有效的存檔字串。\n\n預期：{"save":{...},"nickname":"...","version":"veilreach-export-v2"}\n\n收到的內容：\n'
            + raw.slice(0, 200));
          return;
        }
        // 同時支援 v1（save 是字串）和 v2（save 是物件，避免 escape 問題）
        let parsedState;
        let saveStrForStorage;
        if (data.version === 'veilreach-export-v2') {
          parsedState = data.save;  // 已是物件
          saveStrForStorage = JSON.stringify(data.save);
        } else if (data.version === 'veilreach-export-v1') {
          try { parsedState = JSON.parse(data.save); }
          catch (e) {
            alert('存檔內層 JSON 解析失敗（v1 格式）：\n' + e.message + '\n\n字串前 200 字：\n' + String(data.save).slice(0, 200));
            return;
          }
          saveStrForStorage = data.save;
        } else {
          alert('存檔版本不支援：' + data.version);
          return;
        }
        if (parsedState.version !== 4 && parsedState.version !== 5) {
          alert('存檔版本錯誤：預期 4 或 5，實際是 ' + JSON.stringify(parsedState.version));
          return;
        }
        if (!confirm('匯入會覆蓋當前進度（無法復原），確定？\n\n存檔詳情：\n' +
          `角色等級 Lv ${parsedState.characters?.tsukirin?.level || '?'}\n` +
          `金幣 ${parsedState.gold || 0}\n` +
          `已畢業 ${parsedState.characters?.tsukirin?.graduated ? '是' : '否'}\n` +
          `存檔字串大小 ${Math.round(saveStrForStorage.length / 1024)} KB`)) return;
        // 停所有遊戲邏輯
        if (window.BATTLE) {
          BATTLE.running = false;
          BATTLE.paused = true;
        }
        // 關鍵：先把記憶體中的 STATE 物件整個替換成匯入的內容
        // 這樣即使有 race condition（scheduleSave 在 reload 前 fire），寫的也是新 STATE 而非舊的
        if (window.GAME_STATE && GAME_STATE.replaceState) {
          GAME_STATE.replaceState(parsedState);
        }
        // 寫入 localStorage
        const realSetItem = localStorage.setItem.bind(localStorage);
        try {
          realSetItem('veilreach.save.v4', saveStrForStorage);
          if (data.nickname) realSetItem('veilreach.nickname', data.nickname);
        } catch (e) {
          alert('寫入 localStorage 失敗：' + e.message + '\n（可能存檔太大超過瀏覽器配額）');
          return;
        }
        // 寫入後讀回驗證
        const verify = localStorage.getItem('veilreach.save.v4');
        if (verify !== saveStrForStorage) {
          alert('寫入驗證失敗：localStorage 內容跟匯入的不一致！');
          return;
        }
        // 攔截後續 setItem 三重保險
        localStorage.setItem = function(key, value) {
          if (key === 'veilreach.save.v4' || key === 'veilreach.nickname') {
            console.warn('[import] blocked setItem during reload:', key);
            return;
          }
          return realSetItem(key, value);
        };
        // 立即 reload
        location.reload();
      },
    });
  };
  document.getElementById('btnReset').onclick = () => {
    if (confirm('確定要重設所有進度嗎？此動作無法復原。')) {
      GAME_STATE.resetState();
      location.reload();
    }
  };
  // ☁ 雲端恢復碼：先上傳當前存檔到雲端、再取碼顯示
  document.getElementById('btnCloudCode').onclick = async () => {
    if (!window.API) return toast('API 未載入', 'error');
    // 1. 強制同步存檔（含同步寫入 LocalStorage、清掉 scheduled timer）
    GAME_STATE.saveState();
    // 2. 立刻讀回剛存的 LocalStorage 確認沒踩到 race condition
    const localRaw = localStorage.getItem('veilreach.save.v4');
    let localGold = '?';
    try { localGold = JSON.parse(localRaw).gold.toLocaleString(); } catch (e) {}
    toast('正在上傳雲端 ...', 'gold');
    const up = await window.API.uploadSave();
    if (!up.ok) {
      if (up.offline) return toast('後端離線、無法同步', 'error');
      return toast('上傳失敗：' + (up.error || ''), 'error');
    }
    const r = await window.API.getRecoveryCode();
    if (!r.ok) return toast('取碼失敗：' + (r.error || ''), 'error');
    const code = r.data.recovery_code;
    openIoModal({
      title: '☁ 雲端恢復碼',
      hint: `已將當前進度（金幣 ${localGold}）上傳到雲端。\n換瀏覽器 / 換裝置時用「☁ 從碼還原」輸入下方這串碼即可拿回。\n\n存檔大小：${(up.data.size/1024).toFixed(1)} KB`,
      value: code,
      readonly: true,
      confirmText: '完成',
      onConfirm: () => { closeIoModal(); toast('已關閉，記得保存恢復碼', 'gold'); },
    });
  };
  // ☁ 從恢復碼還原存檔
  document.getElementById('btnCloudRestore').onclick = () => {
    if (!window.API) return toast('API 未載入', 'error');
    openIoModal({
      title: '☁ 從恢復碼還原',
      hint: '輸入你之前「☁ 恢復碼」拿到的碼（格式 VR-XXXX-XXXX-XXXX），按還原會覆蓋當前進度。',
      value: '',
      readonly: false,
      confirmText: '還原',
      onConfirm: async () => {
        const raw = document.getElementById('ioTextarea').value.trim();
        if (!raw) return toast('請先輸入恢復碼', 'error');
        const r = await window.API.restoreByCode(raw);
        if (!r.ok) {
          if (r.offline) return toast('後端離線', 'error');
          if (r.error === 'http_404') return toast('找不到這組恢復碼', 'error');
          return toast('還原失敗：' + (r.error || ''), 'error');
        }
        const incoming = r.data.save_json;
        // 解析雲端存檔做摘要 — 讓玩家確認金幣 / 角色數 / 上次存檔時間 對得上
        let summary = '無法解析存檔';
        try {
          const j = JSON.parse(incoming);
          const goldStr = (j.gold || 0).toLocaleString();
          const shardStr = (j.shard || 0).toLocaleString();
          const charCount = j.characters ? Object.keys(j.characters).length : 0;
          const savedAt = j.lastSaved ? new Date(j.lastSaved).toLocaleString() : 'N/A';
          summary = `金幣 ${goldStr} / 魂晶 ${shardStr} / 角色數 ${charCount} / 雲端存檔時間 ${savedAt}`;
        } catch (e) {}
        if (!confirm(`即將還原雲端存檔：\n\n${summary}\n\n這會「覆蓋」當前本地進度。確定？`)) return;
        // 寫入 LocalStorage
        window.API.writeLocalSave(incoming);
        // 驗證真的寫進去了
        const verify = localStorage.getItem('veilreach.save.v4');
        if (verify !== incoming) {
          alert('寫入驗證失敗：LocalStorage 內容跟雲端不一致！\n（可能是瀏覽器存取受限 / 私密模式 / quota 滿）');
          return;
        }
        closeIoModal();
        toast('還原成功！重新載入中 ...', 'gold');
        setTimeout(() => location.reload(), 800);
      },
    });
  };
  document.getElementById('btnUnlockOk').onclick = () => {
    document.getElementById('unlockOverlay').classList.add('hidden');
  };

  // 新角色按鈕：開啟創角彈窗（最多 4 名）
  const btnNewChar = document.getElementById('btnCreateChar');
  if (btnNewChar) {
    btnNewChar.onclick = () => {
      const count = Object.keys(GAME_STATE.state.characters).length;
      if (count >= GAME_STATE.MAX_CHARACTERS) {
        toast(`已達 ${GAME_STATE.MAX_CHARACTERS} 名角色上限，請先重設`, 'error');
        return;
      }
      // 重設輸入框
      const nickInput = document.getElementById('creationNickname');
      if (nickInput) {
        nickInput.value = GAME_STATE.getPlayerNickname() || '';
        // 已有暱稱時不可改（避免改新角色順便覆蓋舊暱稱）
        nickInput.disabled = !!GAME_STATE.getPlayerNickname();
      }
      showCreationOverlay(true);  // 第二次以上創角
    };
  }
}

// ============================================================================
// 角色列表（左）
// ============================================================================
function renderCharList() {
  const root = document.getElementById('charList');
  root.innerHTML = '';
  const ids = Object.keys(GAME_STATE.state.characters);
  for (const id of ids) {
    const cs = GAME_STATE.state.characters[id];
    const bp = GAME_STATE.getCharacterBlueprint((GAME_STATE.state.characters[id] || {}).blueprintId || id);
    const card = document.createElement('div');
    card.className = 'char-card' + (id === GAME_STATE.state.activeCharId ? ' active' : '');
    const cp = GAME_STATE.combatPower(id);
    const lvText = cs.graduated ? '畢' : `Lv ${cs.level}`;
    card.innerHTML = `
      <div class="char-portrait">${CHAR_PORTRAIT(id)}</div>
      <div class="char-info">
        <div class="cname">${cs.customName}</div>
        <div class="ctitle">${bp.title} · ${lvText}</div>
        <div class="cstat">CP ${cp.toLocaleString()}</div>
      </div>
    `;
    card.onclick = () => switchCharacter(id);
    root.appendChild(card);
  }
}

function switchCharacter(id) {
  if (BATTLE.running) {
    stopBattle();
    toast('已停止戰鬥並切換角色');
  }
  GAME_STATE.state.activeCharId = id;
  PIXEL.setScene({ charId: id });
  renderAll();
  GAME_STATE.scheduleSave();
}

// ============================================================================
// 角色詳細頁
// ============================================================================
function renderCharDetail() {
  const portRoot = document.getElementById('charStripPortrait');
  const infoRoot = document.getElementById('charStripInfo');
  if (!portRoot || !infoRoot) return;
  const id = GAME_STATE.state.activeCharId;
  if (!id) { portRoot.innerHTML = ''; infoRoot.innerHTML = ''; return; }
  const cs = GAME_STATE.state.characters[id];
  const bp = GAME_STATE.getCharacterBlueprint((GAME_STATE.state.characters[id] || {}).blueprintId || id);
  const s = GAME_STATE.effectiveStats(id);
  const cp = GAME_STATE.combatPower(id);

  // 大立繪
  portRoot.innerHTML = CHAR_PORTRAIT(id, { bg: true });

  // 職階文字
  let jobText = '一階弟子';
  if (cs.jobPath) {
    const p = bp.paths[cs.jobPath];
    if (cs.jobTier === 1) jobText = `一轉 · ${p.name}`;
    else if (cs.jobTier === 2) jobText = `二轉 · ${p.tier2.name}`;
    else if (cs.jobTier === 3) jobText = `三轉 · ${p.tier3.name}`;
  }
  if (cs.graduated) jobText += '（已畢業）';

  let expBar = '', expInfoText = '';
  if (cs.graduated) {
    const need = GAME_STATE.resonanceExpFor(GAME_STATE.state.resonance);
    const pct = Math.min(100, (GAME_STATE.state.resonanceExp / need) * 100);
    expBar = `<div class="exp-bar"><div style="width:${pct}%"></div></div>`;
    expInfoText = `<span class="exp-info">共鳴 R${GAME_STATE.state.resonance} · ${GAME_STATE.state.resonanceExp.toLocaleString()} / ${need.toLocaleString()}</span>`;
  } else {
    const need = GAME_DATA.expForLevel(cs.level);
    const pct = Math.min(100, (cs.exp / need) * 100);
    expBar = `<div class="exp-bar"><div style="width:${pct}%"></div></div>`;
    expInfoText = `<span class="exp-info">${cs.exp.toLocaleString()} / ${need.toLocaleString()}</span>`;
  }

  infoRoot.innerHTML = `
    <div class="char-name-line">
      <h3>${cs.customName}</h3>
      <span class="char-tier-tag">${jobText}</span>
      <span class="char-title-tag">「${bp.title}」</span>
    </div>
    <div class="char-lv-line">
      <span class="lv-badge">Lv ${cs.level}${cs.graduated ? ' MAX' : ''}</span>
      ${expBar}
      ${expInfoText}
    </div>
    <div class="lore-quote">${bp.lore}</div>
    <div class="stat-grid">
      <div class="stat-card offense">
        <div class="stat-card-title">攻擊組</div>
        <div class="stat-row-pair"><span>攻擊</span><b>${s.atk}</b></div>
        <div class="stat-row-pair"><span>暴擊</span><b>${(s.crit * 100).toFixed(1)}%${s.crit > 1.0 ? `<span style="color:var(--gold);font-size:10px;margin-left:6px" title="超過 100% 的部分 1:1 轉成暴傷">(+${((s.crit - 1.0) * 100).toFixed(1)}% → 暴傷)</span>` : ''}</b></div>
        <div class="stat-row-pair"><span>暴傷</span><b>${s.crit > 1.0 ? `${((s.critDmg + (s.crit - 1.0)) * 100).toFixed(0)}%<span style="color:var(--gold);font-size:10px;margin-left:6px" title="基礎 ${(s.critDmg*100).toFixed(0)}% + 暴擊溢出 ${((s.crit - 1.0)*100).toFixed(1)}%">(${(s.critDmg*100).toFixed(0)}+${((s.crit - 1.0)*100).toFixed(1)})</span>` : `${(s.critDmg * 100).toFixed(0)}%`}</b></div>
      </div>
      <div class="stat-card defense">
        <div class="stat-card-title">防禦組</div>
        <div class="stat-row-pair"><span>防禦</span><b>${s.def}</b></div>
        <div class="stat-row-pair"><span>生命</span><b>${s.hp}</b></div>
        <div class="stat-row-pair"><span>減傷</span><b>${(s.dmgReduce * 100).toFixed(0)}%</b></div>
      </div>
      <div class="stat-card utility">
        <div class="stat-card-title">機動組</div>
        <div class="stat-row-pair"><span>速度</span><b>${s.spd.toFixed(2)}</b></div>
        <div class="stat-row-pair"><span>CD減</span><b>${((s.cdReduce || 0) * 100).toFixed(0)}%${s.cdReduceRaw > s.cdReduce ? `<span style="color:var(--gold);font-size:9px;margin-left:4px" title="原始 ${(s.cdReduceRaw * 100).toFixed(0)}% 被上限壓低">(上限)</span>` : ''}</b></div>
        <div class="stat-row-pair"><span>對 BOSS</span><b>+${((s.vsBoss || 0) * 100).toFixed(0)}%</b></div>
        <div class="stat-row-pair"><span>技能傷害</span><b>+${((s.skillDmg || 0) * 100).toFixed(0)}%</b></div>
        <div class="stat-row-pair"><span>無視防禦</span><b>${((s.defPierce || 0) * 100).toFixed(0)}%${(s.defPierce || 0) >= 0.95 ? '<span style="color:var(--gold);font-size:9px;margin-left:4px">(上限)</span>' : ''}</b></div>
      </div>
      <div class="stat-card mp-card">
        <div class="stat-card-title">秘力組</div>
        <div class="stat-row-pair"><span>MP 上限</span><b>${s.maxMp}</b></div>
        <div class="stat-row-pair"><span>回復/秒</span><b>${s.mpRegen.toFixed(1)}</b></div>
        <div class="stat-row-pair"><span>普攻回藍</span><b>+${s.mpPerHit}</b></div>
      </div>
      <div class="stat-card cp-card">
        <div class="stat-card-title">戰力</div>
        <div class="cp-value">${cp.toLocaleString()}</div>
      </div>
    </div>
    ${renderActiveSets(cs)}
  `;
}

function renderActiveSets(cs) {
  const counts = GAME_DATA.countSetPieces(cs);
  const keys = Object.keys(counts);
  if (!keys.length) return '';
  let html = '<div class="set-summary"><div class="set-summary-title">套裝效果</div>';
  for (const setId of keys) {
    const setDef = GAME_DATA.findSet(setId);
    if (!setDef) continue;
    const n = counts[setId];
    // armorOnly 套裝沒武器（4 件）；其他套裝有武器（5 件）
    const maxPieces = setDef.armorOnly ? 4 : 5;
    html += `<div class="set-block">
      <div class="set-block-title" style="color:${setDef.color}">${setDef.name} <span style="color:var(--muted);font-size:10px">(${n} / ${maxPieces})</span></div>`;
    for (const b of setDef.bonuses) {
      const active = n >= b.pieces;
      html += `<div class="set-bonus ${active ? 'active' : 'inactive'}">${active ? '✓' : '–'} ${b.label}</div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderClearSummary() {
  const body = document.getElementById('clearSummaryBody');
  if (!body) return;
  const lc = BATTLE.lastClear;
  if (!lc) {
    body.innerHTML = '<span class="cs-empty">尚無紀錄</span>';
    return;
  }
  const totalDmg = lc.damage ? lc.damage.total : 0;
  const dps = (lc.damage && lc.time > 0) ? Math.floor(totalDmg / lc.time) : 0;
  // Buff 標籤（卷軸生效中時顯示在經驗/金錢數字旁，明確標「卷軸」避免和副本固有倍率混淆）
  const expBuffTag = lc.expBuff > 0 ? `<span class="cs-buff">卷軸 ×${(1+lc.expBuff).toFixed(1)}</span>` : '';
  const goldBuffTag = lc.goldBuff > 0 ? `<span class="cs-buff">卷軸 ×${(1+lc.goldBuff).toFixed(1)}</span>` : '';
  const dropBuffTag = lc.dropBuff > 0 ? `<span class="cs-buff">卷軸 ×${(1+lc.dropBuff).toFixed(1)}</span>` : '';
  // 材料分項顯示（按 tier 排序，依稀有度配色）
  const TIER_COLOR = { '粗鋼': '#b0b0b0', '精鋼': '#5fa8ff', '星鋼': '#c084ff', '神鋼': '#ffb84d', '永晶': '#ff5e7a', '夢晶': '#ff8a3c' };
  const TIER_ORDER = ['粗鋼', '精鋼', '星鋼', '神鋼', '永晶', '夢晶'];
  const matEntries = lc.matDrops
    ? Object.entries(lc.matDrops).sort((a, b) => TIER_ORDER.indexOf(a[0]) - TIER_ORDER.indexOf(b[0]))
    : (lc.matName ? [[lc.matName, lc.matQty]] : []);
  const matHtml = matEntries.map(([name, qty]) =>
    `<span class="cs-mat" style="color:${TIER_COLOR[name] || 'var(--text)'}">${name} +${qty}</span>`
  ).join('');
  // 寶箱（如有掉落）
  let chestHtml = '';
  if (lc.chest) {
    const chestDef = GAME_DATA.CHESTS && GAME_DATA.CHESTS[lc.chest];
    if (chestDef) {
      chestHtml = `<span class="cs-chest" style="color:${chestDef.color}">📦 ${chestDef.name}</span>`;
    }
  }
  // 無盡塔：簡短顯示「累積傷害 + 階梯」；其他副本顯示傳統 exp/gold
  if (lc.isEndless) {
    const fmtM = (n) => n >= 1e6 ? (n/1e6).toFixed(2)+'M' : Math.floor(n).toLocaleString();
    const grantedMats = (lc.endlessGranted && lc.endlessGranted.mats) || {};
    const grantedGems = (lc.endlessGranted && lc.endlessGranted.gems) || [];
    const grantedChests = (lc.endlessGranted && lc.endlessGranted.chests) || [];
    const matHtmlE = Object.entries(grantedMats).map(([n, q]) =>
      `<span class="cs-mat" style="color:${TIER_COLOR[n] || 'var(--text)'}">${n} +${q}</span>`
    ).join('');
    const gemHtmlE = grantedGems.map(name => `<span class="cs-drop">💎 ${name}</span>`).join('');
    const chestHtmlE = grantedChests.map(c => {
      const cd = GAME_DATA.CHESTS[c.id];
      return `<span class="cs-drop" style="color:${cd?.color || 'var(--accent)'}">📦 ${cd?.name || c.id} ×${c.qty}</span>`;
    }).join('');
    body.innerHTML = `
      <span class="cs-name">${lc.dungeonName}</span>
      <span class="cs-time">30s ⏱</span>
      <span class="cs-dmg">累積 ${fmtM(lc.endlessTotalDmg || 0)}</span>
      <span class="cs-num">★ 階梯 ${lc.endlessTierLabel || '未達'}</span>
      ${(matHtmlE + gemHtmlE + chestHtmlE) || '<span class="cs-mat" style="color:var(--muted)">未達階梯 I</span>'}
    `;
    renderBattleReport();
    return;
  }
  body.innerHTML = `
    <span class="cs-name">${lc.dungeonName}</span>
    <span class="cs-time">${lc.time.toFixed(1)}s</span>
    <span class="cs-exp">經驗 +${(lc.exp||0).toLocaleString()}${expBuffTag}</span>
    <span class="cs-num">金 +${(lc.gold||0).toLocaleString()}${goldBuffTag}</span>
    ${matHtml || '<span class="cs-mat" style="color:var(--muted)">無材料</span>'}
    ${lc.shard ? `<span class="cs-mat" style="color:var(--shard)">魂晶 +${lc.shard}</span>` : ''}
    ${chestHtml}
    ${lc.gem ? `<span class="cs-drop">💎 ${lc.gem}</span>` : ''}
    ${lc.drop ? `<span class="cs-drop">${lc.drop}${dropBuffTag}</span>` : ''}
    ${totalDmg ? `<span class="cs-dmg">傷害 ${Math.floor(totalDmg).toLocaleString()} (${dps.toLocaleString()} dps)</span>` : ''}
  `;
  renderBattleReport();
}

function renderBattleReport() {
  const root = document.getElementById('tabReport');
  if (!root) return;
  const lc = BATTLE.lastClear;
  if (!lc) {
    root.innerHTML = '<span style="color:var(--muted)">尚無戰鬥紀錄</span>';
    return;
  }
  const d = lc.damage || { total: 0, bySkill: {}, hits: 0, crits: 0 };
  const dps = lc.time > 0 ? Math.floor(d.total / lc.time) : 0;
  const critRate = d.hits > 0 ? (d.crits / d.hits * 100).toFixed(1) : '0.0';

  const sorted = Object.entries(d.bySkill).sort((a, b) => b[1] - a[1]);
  const rows = sorted.map(([sid, dmg]) => {
    let name, isAlly = false;
    if (sid.startsWith('mp-ally:')) {
      name = '⛺ ' + sid.slice('mp-ally:'.length) + '（隊友）';
      isAlly = true;
    } else {
      const sk = GAME_DATA.SKILLS[sid];
      name = sk ? sk.name : sid;
    }
    const pct = d.total > 0 ? (dmg / d.total * 100) : 0;
    return `
      <div class="report-skill${isAlly ? ' ally' : ''}">
        <div class="report-skill-head">
          <span class="report-skill-name">${name}</span>
          <span class="report-skill-pct">${pct.toFixed(1)}%</span>
        </div>
        <div class="report-skill-bar"><div style="width:${Math.min(100, pct)}%"></div></div>
        <div class="report-skill-dmg">${Math.floor(dmg).toLocaleString()}</div>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <div class="report-header">
      <h4 style="margin:0 0 4px">${lc.dungeonName}</h4>
      <div style="font-size:11px;color:var(--muted)">通關時間 ${lc.time.toFixed(2)} 秒</div>
    </div>
    <div class="report-stats">
      <div class="report-stat"><span>總傷害</span><b>${Math.floor(d.total).toLocaleString()}</b></div>
      <div class="report-stat"><span>DPS</span><b>${dps.toLocaleString()}</b></div>
      <div class="report-stat"><span>命中</span><b>${d.hits}</b></div>
      <div class="report-stat"><span>暴擊率</span><b>${critRate}%</b></div>
    </div>
    <div class="report-loot">
      <div class="cs-loot-grid">
        ${lc.isEndless
          ? `<span class="cs-dmg">階梯 ${lc.endlessTierLabel || '未達'}</span>
             <span class="cs-mat">累積 ${Math.floor(lc.endlessTotalDmg||0).toLocaleString()}</span>`
          : `<span class="cs-exp">經驗 +${(lc.exp||0).toLocaleString()}</span>
             <span class="cs-num">金幣 +${(lc.gold||0).toLocaleString()}</span>
             ${lc.matName ? `<span class="cs-mat">${lc.matName} +${lc.matQty||0}</span>` : ''}
             ${lc.shard ? `<span class="cs-mat">魂晶 +${lc.shard}</span>` : ''}
             ${lc.drop ? `<span class="cs-drop">${lc.drop}</span>` : ''}`
        }
      </div>
    </div>
    <div class="report-section-title">技能輸出明細</div>
    <div class="report-skills">${rows || '<span style="color:var(--muted);font-size:11px">本場戰鬥無輸出</span>'}</div>
  `;
}

// ============================================================================
// HUD
// ============================================================================
let _craftTab = 'equip';  // 'equip' / 'material'
let _craftSlot = 'all';   // 'all' / 'weapon' / 'head' / 'top' / 'bottom' / 'feet'
function renderCraft() {
  const root = document.getElementById('tabCraft');
  if (!root) return;
  const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
  if (!cs) { root.innerHTML = ''; return; }
  const st = GAME_STATE.state;
  const tabs = `
    <div class="craft-tabs">
      <button class="${_craftTab === 'equip' ? 'active' : ''}" data-tab="equip">⚔ 裝備製作</button>
      <button class="${_craftTab === 'material' ? 'active' : ''}" data-tab="material">⚒ 材料升階</button>
    </div>`;

  let body = '';
  if (_craftTab === 'equip') {
    // 部位篩選列
    const slotFilters = [
      { key: 'all', label: '全部' },
      { key: 'weapon', label: '武器' },
      { key: 'head', label: '頭' },
      { key: 'top', label: '上衣' },
      { key: 'bottom', label: '下衣' },
      { key: 'feet', label: '腳' },
      { key: 'ring', label: '戒指' },
    ];
    const slotBar = `
      <div class="craft-slot-filter">
        ${slotFilters.map(f => `
          <button class="${_craftSlot === f.key ? 'active' : ''}" data-slot="${f.key}">${f.label}</button>
        `).join('')}
      </div>`;

    // 雪羽 Phase 8：依角色 + 部位篩選配方
    // 武器類配方按 active 角色 blueprintId 過濾（不顯示別角色武器配方）
    // 防具配方無 owner，所有角色共用
    const bpId = cs.blueprintId || cs.id.split('#')[0];
    const filteredRecipes = GAME_DATA.RECIPES.filter(rec => {
      const def = GAME_DATA.findEquipment(rec.target);
      if (!def) return false;
      // 武器：owner 必須符合當前角色
      if (def.slot === 'weapon' && def.owner && def.owner !== bpId) return false;
      // 部位篩選
      if (_craftSlot === 'all') return true;
      return def.slot === _craftSlot;
    });

    const rows = filteredRecipes.map(rec => {
      const def = GAME_DATA.findEquipment(rec.target);
      if (!def) return '';
      const lvOk = cs.level >= (rec.requiredLv || 0);
      const goldOk = st.gold >= rec.cost.gold;
      const matsOk = Object.entries(rec.cost.mats).every(([n, q]) => (_activeBag().materials[n] || 0) >= q);
      const canMake = lvOk && goldOk && matsOk;
      const matsStr = Object.entries(rec.cost.mats).map(([n, q]) => {
        const have = _activeBag().materials[n] || 0;
        const ok = have >= q;
        return `<span class="${ok ? 'ok' : 'no'}">${n} ${have}/${q}</span>`;
      }).join(' ');
      const slotLabel = (GAME_DATA.SLOT_LABELS && GAME_DATA.SLOT_LABELS[def.slot]) || '';
      return `
        <div class="craft-row">
          <div class="craft-info">
            <div class="craft-name">
              ${slotLabel ? `<span class="craft-slot-tag">${slotLabel}</span>` : ''}
              <span class="bag-item ${def.rarity} cp-clickable" style="display:inline-block;padding:1px 6px;border-width:1px;cursor:pointer" data-preview="${def.id}" title="點擊查看屬性">${def.name}</span>
              <small>Lv ${rec.requiredLv}+</small>
            </div>
            <div class="craft-cost">
              <span class="${goldOk ? 'ok' : 'no'}">金 ${rec.cost.gold.toLocaleString()}</span>
              ${matsStr}
            </div>
          </div>
          <button class="primary" data-craft="${rec.id}" ${canMake ? '' : 'disabled'}>製作</button>
        </div>
      `;
    }).filter(Boolean).join('');
    const emptyMsg = rows ? '' : '<div style="text-align:center;color:var(--muted);font-size:11px;padding:20px">此部位無配方</div>';
    const ringHint = _craftSlot === 'ring'
      ? '<div style="font-size:11px;color:var(--accent);margin-bottom:10px;line-height:1.6;padding:6px 10px;background:rgba(160,108,213,0.1);border-left:3px solid var(--accent);border-radius:4px">💍 戒指通用無左右之分 — 製作完成後到背包選擇要裝在「戒指(左)」或「戒指(右)」格子。詞綴用魂晶兌換的「詞綴重抽券」可洗。</div>'
      : '';
    body = `
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.6">用素材製作中低階裝備。UR 裝備僅由「襲擊戰」副本掉落，不可製作。</div>
      ${slotBar}
      ${ringHint}
      <div class="craft-list">${rows}${emptyMsg}</div>`;
  } else {
    // 材料升階
    const rows = GAME_DATA.MATERIAL_RECIPES.map(rec => {
      const lvOk = cs.level >= (rec.requiredLv || 0);
      const goldOk = st.gold >= rec.gold;
      const matsOk = Object.entries(rec.from).every(([n, q]) => (_activeBag().materials[n] || 0) >= q);
      const canMake = lvOk && goldOk && matsOk;
      const fromStr = Object.entries(rec.from).map(([n, q]) => {
        const have = _activeBag().materials[n] || 0;
        return `<span class="${have >= q ? 'ok' : 'no'}">${n} ${have}/${q}</span>`;
      }).join(' ');
      // 計算可以做的最大量（min of available / cost ratio）
      let maxMake = Math.floor(st.gold / rec.gold);
      for (const [n, q] of Object.entries(rec.from)) {
        maxMake = Math.min(maxMake, Math.floor((_activeBag().materials[n] || 0) / q));
      }
      maxMake = Math.max(0, maxMake);
      return `
        <div class="craft-row">
          <div class="craft-info">
            <div class="craft-name">${rec.name}<small>Lv ${rec.requiredLv}+</small></div>
            <div class="craft-cost">
              <span class="${goldOk ? 'ok' : 'no'}">金 ${rec.gold.toLocaleString()}</span>
              ${fromStr}
              <span style="color:var(--accent)">→ ${rec.to} ×${rec.toQty}</span>
            </div>
          </div>
          <div class="craft-buttons" style="display:flex;flex-direction:column;gap:4px">
            <button class="primary small" data-matcraft="${rec.id}" data-qty="1" ${canMake ? '' : 'disabled'}>合成 ×1</button>
            ${maxMake >= 10 ? `<button class="ghost small" data-matcraft="${rec.id}" data-qty="10">×10</button>` : ''}
            ${maxMake >= 50 ? `<button class="ghost small" data-matcraft="${rec.id}" data-qty="${maxMake}">×全部 (${maxMake})</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
    body = `
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.6">用多顆低階材料合成 1 顆高階。比率較高（10-12 : 1）但給粗鋼等過剩材料一個出口。<br>夢晶不開放合成，只能襲擊戰拿。</div>
      <div class="craft-list">${rows}</div>`;
  }

  root.innerHTML = tabs + body;
  root.querySelectorAll('.craft-tabs button').forEach(btn => {
    btn.onclick = () => { _craftTab = btn.dataset.tab; renderCraft(); };
  });
  root.querySelectorAll('.craft-slot-filter button').forEach(btn => {
    btn.onclick = () => { _craftSlot = btn.dataset.slot; renderCraft(); };
  });
  root.querySelectorAll('button[data-craft]').forEach(btn => {
    btn.onclick = () => doCraft(btn.dataset.craft);
  });
  root.querySelectorAll('[data-preview]').forEach(el => {
    el.onclick = () => showCraftPreview(el.dataset.preview);
  });
  root.querySelectorAll('button[data-matcraft]').forEach(btn => {
    btn.onclick = () => {
      const qty = parseInt(btn.dataset.qty) || 1;
      const r = GAME_STATE.craftMaterial(btn.dataset.matcraft, qty);
      if (r.ok) {
        toast(`合成 ${r.toName} ×${r.toQty}`, 'gold');
        renderCraft(); renderBag(); renderHud();
      } else toast(r.reason, 'error');
    };
  });
}

// ============================================================================
// 商店 / 藥水欄
// ============================================================================
function renderShop() {
  const root = document.getElementById('tabShop');
  if (!root) return;
  const st = GAME_STATE.state;
  // 分類顯示
  const sections = [
    { key: 'hp', title: '生命藥水', desc: '戰鬥中綁定第一槽自動回復' },
    { key: 'mp', title: '秘力藥水', desc: '戰鬥中綁定第二槽自動回復；MP 用盡技能會跳過' },
    { key: 'buff', title: '戰鬥藥劑', desc: '綁定第三槽，效果結束時自動再喝' },
    { key: 'scroll', title: '加成卷軸', desc: '使用後啟動全域 buff（30 分鐘），不需綁定' },
  ];
  let html = '';
  for (const s of sections) {
    const items = GAME_DATA.POTIONS.filter(p => p.category === s.key);
    html += `<div class="shop-section">
      <div class="shop-section-title">${s.title}<span class="shop-section-desc">${s.desc}</span></div>
      <div class="shop-grid">`;
    for (const p of items) {
      const have = (_activeBag().potions && _activeBag().potions[p.id]) || 0;
      const goldCost = p.cost.gold || 0;
      const shardCost = p.cost.shard || 0;
      const goldOk = st.gold >= goldCost;
      const shardOk = st.shard >= shardCost;
      const matsOk = !p.cost.mats || Object.entries(p.cost.mats).every(([n, q]) => (_activeBag().materials[n] || 0) >= q);
      const ok = goldOk && shardOk && matsOk;
      const matsStr = p.cost.mats ? Object.entries(p.cost.mats).map(([n, q]) => {
        const h = _activeBag().materials[n] || 0;
        return `<span class="${h >= q ? 'ok' : 'no'}">${n} ${h}/${q}</span>`;
      }).join(' ') : '';
      const goldStr = goldCost > 0 ? `<span class="${goldOk ? 'ok' : 'no'}">金 ${goldCost.toLocaleString()}</span>` : '';
      const shardStr = shardCost > 0 ? `<span class="${shardOk ? 'ok' : 'no'}" style="color:var(--shard)">魂晶 ${shardCost.toLocaleString()}</span>` : '';
      html += `<div class="shop-row ${ok ? '' : 'locked'}">
        <div class="shop-info">
          <div class="shop-name bag-item ${p.rarity}" style="display:inline-block;padding:1px 6px">${p.name}</div>
          <span style="color:var(--muted);font-size:10px;margin-left:6px">持有 ${have}</span>
          <div class="shop-desc">${p.desc}</div>
          <div class="shop-cost">${goldStr} ${shardStr} ${matsStr}</div>
        </div>
        <div class="shop-buy">
          <button class="primary" data-buy="${p.id}" data-qty="1" ${ok ? '' : 'disabled'}>買 ×1</button>
          <button class="ghost" data-buy="${p.id}" data-qty="10" ${ok ? '' : 'disabled'}>×10</button>
        </div>
      </div>`;
    }
    html += '</div></div>';
  }
  // ===== 魂晶兌換 =====
  html += `<div class="shop-section">
    <div class="shop-section-title">魂晶兌換<span class="shop-section-desc">用魂晶（目前 <b style="color:var(--shard)">${st.shard}</b>）換稀有材料/寶石/重抽券</span></div>
    <div class="shop-grid">`;
  for (const ex of GAME_DATA.SHARD_EXCHANGE) {
    const ok = st.shard >= ex.cost;
    html += `<div class="shop-row ${ok ? '' : 'locked'}">
      <div class="shop-info">
        <div class="shop-name" style="color:var(--shard)">${ex.name}</div>
        <div class="shop-desc">${ex.desc}</div>
        <div class="shop-cost"><span class="${ok ? 'ok' : 'no'}">魂晶 ${ex.cost}</span></div>
      </div>
      <div class="shop-buy">
        <button class="primary" data-exchange="${ex.id}" ${ok ? '' : 'disabled'}>兌換</button>
      </div>
    </div>`;
  }
  html += '</div></div>';
  root.innerHTML = html;
  root.querySelectorAll('button[data-buy]').forEach(b => {
    b.onclick = () => {
      const r = GAME_STATE.buyPotion(b.dataset.buy, parseInt(b.dataset.qty));
      if (r.ok) {
        const p = GAME_DATA.findPotion(b.dataset.buy);
        toast(`購得 ${p.name} ×${b.dataset.qty}`, 'gold');
        renderShop(); renderHud(); renderBag();
      } else {
        toast(r.reason, 'error');
      }
    };
  });
  root.querySelectorAll('button[data-exchange]').forEach(b => {
    b.onclick = () => {
      const r = GAME_STATE.exchangeShard(b.dataset.exchange);
      if (r.ok) {
        toast(`兌換 ${r.label}（-${r.costShard} 魂晶）`, 'gold');
        renderShop(); renderHud(); renderBag();
      } else {
        toast(r.reason, 'error');
      }
    };
  });
}

// 玩家當前生效的 buff（戰鬥用：藥水 + 技能）+ 全域 buff（卷軸）
function renderActiveBuffs() {
  const root = document.getElementById('playerBuffs');
  if (!root) return;
  const list = [];

  // 戰鬥 buff（技能 / 藥水）
  if (window.BATTLE && BATTLE.buffs && BATTLE.buffs.length) {
    for (const b of BATTLE.buffs) {
      if (b.dur <= 0) continue;
      const isPotion = !!b._potionId;
      const isSkill = !!b._skillId;
      let name = b._name || (isPotion ? '藥水' : '技能');
      let kind = isPotion ? 'potion' : 'skill';
      // 推估效果類型（決定顏色）
      let effTag = '';
      if (b.atk) { effTag = `atk +${Math.round(b.atk * 100)}%`; }
      else if (b.crit) { effTag = `crit +${Math.round(b.crit * 100)}%`; }
      else if (b.spdMul) { effTag = `spd +${Math.round(b.spdMul * 100)}%`; }
      else if (b.dmgReduce) { effTag = `減傷 +${Math.round(b.dmgReduce * 100)}%`; }
      list.push({
        name, kind, effTag,
        remain: b.dur,
        max: b._maxDur || (isPotion ? (GAME_DATA.findPotion(b._potionId)?.duration || b.dur) : b.dur),
      });
    }
  }

  // 召喚物（持續傷害）
  if (window.BATTLE && BATTLE.summons && BATTLE.summons.length) {
    for (const s of BATTLE.summons) {
      if (s.dur <= 0) continue;
      list.push({
        name: '🦊 ' + (s._name || '召喚物'),
        kind: 'summon',
        effTag: `每 0.8s 攻擊一次`,
        remain: s.dur,
        max: s._maxDur || s.dur,
      });
    }
  }
  // DoT（持續傷害）
  if (window.BATTLE && BATTLE.dots && BATTLE.dots.length) {
    for (const d of BATTLE.dots) {
      if (d.dur <= 0) continue;
      list.push({
        name: '🔥 ' + (d._name || 'DoT'),
        kind: 'dot',
        effTag: `每 0.5s 持續傷害`,
        remain: d.dur,
        max: d._maxDur || d.dur,
      });
    }
  }

  // 全域 buff（卷軸類）
  const gbs = (GAME_STATE.state.globalBuffs || []).filter(x => x.expiresAt > Date.now());
  for (const g of gbs) {
    const p = GAME_DATA.findPotion(g.potionId);
    if (!p) continue;
    list.push({
      name: p.name,
      kind: 'global',
      effTag: p.desc.split('，')[0],
      remain: Math.max(0, (g.expiresAt - Date.now()) / 1000),
      max: p.duration,
    });
  }

  if (!list.length) { root.innerHTML = ''; return; }

  root.innerHTML = list.map(b => {
    const pct = b.max > 0 ? Math.max(0, Math.min(100, (b.remain / b.max) * 100)) : 0;
    const min = Math.floor(b.remain / 60);
    const sec = Math.floor(b.remain % 60);
    const timeStr = min > 0 ? `${min}:${sec.toString().padStart(2,'0')}` : `${b.remain.toFixed(1)}s`;
    return `<div class="buff-chip buff-${b.kind}">
      <div class="buff-chip-name">${b.name}</div>
      <div class="buff-chip-eff">${b.effTag}</div>
      <div class="buff-chip-time">${timeStr}</div>
      <div class="buff-chip-bar"><div class="buff-chip-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderPotionSlotBar() {
  const root = document.getElementById('potionSlotBar');
  if (!root) return;
  const st = GAME_STATE.state;
  const cs = st.characters[st.activeCharId];
  if (!cs || !cs.potionSlots) { root.innerHTML = ''; root._pslotKey = ''; return; }

  const slotLabels = ['HP 自動', 'MP 自動', 'Buff 自動'];
  const slotIcons = ['❤', '✦', '⚡'];
  const cds = (window.BATTLE && BATTLE.potionCDs) || {};

  // ===== 計算「結構級」的 key，只有這個變了才整批 rebuild =====
  // 結構變動 = 槽位綁定變了 / 存量變了 / global buff list 變了
  const gbs = (st.globalBuffs || []).filter(b => b.expiresAt > Date.now());
  const structKey = cs.potionSlots.map((s, i) => {
    const pid = s.potionId;
    const have = pid ? ((_activeBag().potions && _activeBag().potions[pid]) || 0) : 0;
    return `${pid || '_'}|${have}|${s.threshold}`;
  }).join('||') + '/' + gbs.map(g => g.potionId).join(',');

  if (root._pslotKey !== structKey) {
    root._pslotKey = structKey;
    // 整批 rebuild
    let html = '';
    for (let i = 0; i < 3; i++) {
      const slot = cs.potionSlots[i];
      const pid = slot.potionId;
      const have = pid ? ((_activeBag().potions && _activeBag().potions[pid]) || 0) : 0;
      const p = pid ? GAME_DATA.findPotion(pid) : null;
      const thresholdText = (i < 2 && pid) ? `≤${Math.round(slot.threshold * 100)}%` : '';
      html += `<button type="button" class="potion-slot ${pid ? 'filled' : 'empty'}" data-pslot="${i}" onclick="openPotionConfig(${i})">
        <div class="pslot-icon">${slotIcons[i]}</div>
        <div class="pslot-info">
          <div class="pslot-label">${slotLabels[i]} ${thresholdText}</div>
          <div class="pslot-name">${p ? p.name : '（未綁定）'}</div>
          <div class="pslot-qty">${pid ? `存量 ${have}` : '點擊綁定藥水'}</div>
        </div>
        <div class="pslot-cd-overlay" data-cd-overlay style="display:none"><span></span></div>
        <div class="pslot-cd-bar" data-cd-bar style="height:0"></div>
      </button>`;
    }
    if (gbs.length) {
      const list = gbs.map(b => {
        const p = GAME_DATA.findPotion(b.potionId);
        return `<span class="global-buff-chip" data-pid="${b.potionId}">${p ? p.name : b.potionId} <b data-rem></b></span>`;
      }).join('');
      html += `<div class="global-buff-row">${list}</div>`;
    }
    root.innerHTML = html;
    // 點擊由 button 的 inline onclick 處理，不再用 event delegation 避免重複觸發
  }

  // ===== 每幀只更新 CD 倒數與 buff 時間，不動 button DOM =====
  for (let i = 0; i < 3; i++) {
    const btn = root.querySelector(`button[data-pslot="${i}"]`);
    if (!btn) continue;
    const cdRemain = cds[i] || 0;
    const slot = cs.potionSlots[i];
    const pid = slot.potionId;
    const p = pid ? GAME_DATA.findPotion(pid) : null;
    const baseCD = p ? (p.cd || (p.type === 'buff' && p.kind === 'combat' ? p.duration : 0)) : 0;
    const cdPct = baseCD > 0 ? Math.min(100, (cdRemain / baseCD) * 100) : 0;
    const overlay = btn.querySelector('[data-cd-overlay]');
    const bar = btn.querySelector('[data-cd-bar]');
    if (cdRemain > 0) {
      btn.classList.add('cooling');
      if (overlay) { overlay.style.display = 'flex'; overlay.querySelector('span').textContent = cdRemain.toFixed(1) + 's'; }
      if (bar) bar.style.height = cdPct + '%';
    } else {
      btn.classList.remove('cooling');
      if (overlay) overlay.style.display = 'none';
      if (bar) bar.style.height = '0';
    }
  }
  // 全域 buff 倒數
  root.querySelectorAll('.global-buff-chip').forEach(chip => {
    const pid = chip.dataset.pid;
    const gb = gbs.find(g => g.potionId === pid);
    if (!gb) return;
    const remain = Math.max(0, Math.floor((gb.expiresAt - Date.now()) / 1000));
    const min = Math.floor(remain / 60);
    const sec = remain % 60;
    const b = chip.querySelector('[data-rem]');
    if (b) b.textContent = `${min}:${sec.toString().padStart(2,'0')}`;
  });
}

window.openPotionConfig = function openPotionConfig(slotIdx) {
  console.log('[potion] openPotionConfig called for slot', slotIdx);
  window._configSlotIdx = slotIdx;
  const win = document.getElementById('winPotionConfig');
  if (!win) { console.error('[potion] winPotionConfig DOM 不存在！'); return; }
  // 完全用 inline style 強制顯示，bypass .hidden 邏輯
  win.classList.remove('hidden');
  win.style.display = 'flex';
  win.style.visibility = 'visible';
  win.style.opacity = '1';
  // 視窗大小與置中
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 800;
  win.style.left = Math.max(20, Math.floor((vw - 420) / 2)) + 'px';
  win.style.top  = Math.max(20, Math.floor(vh * 0.15)) + 'px';
  win.style.width = '420px';
  win.style.zIndex = '9999';
  // 也清掉 max-height 防止內容被截
  win.style.maxHeight = '70vh';
  // toast 確認
  if (typeof toast === 'function') toast(`已開啟藥水欄 #${slotIdx + 1} 設定`, 'gold');
  // 渲染內容
  renderPotionConfig();
  console.log('[potion] window 狀態：', { display: win.style.display, left: win.style.left, top: win.style.top, classList: win.className });
};

// 關閉藥水設定的覆寫版本（清掉 inline display:flex）
window.closePotionConfig = function() {
  const win = document.getElementById('winPotionConfig');
  if (!win) return;
  win.style.display = 'none';
  win.classList.add('hidden');
};

function renderPotionConfig() {
  const root = document.getElementById('tabPotionConfig');
  if (!root) return;
  const slotIdx = window._configSlotIdx || 0;
  const st = GAME_STATE.state;
  const cs = st.characters[st.activeCharId];
  if (!cs || !cs.potionSlots) { root.innerHTML = ''; return; }
  const slot = cs.potionSlots[slotIdx];
  const slotLabels = ['HP 自動回復', 'MP 自動回復', 'Buff 自動使用'];

  // 此槽接受的類別
  const acceptedTypes = slotIdx === 0 ? ['hp_heal'] : slotIdx === 1 ? ['mp_heal'] : ['buff'];
  const owned = Object.entries(_activeBag().potions || {}).filter(([, q]) => q > 0)
    .map(([id, q]) => ({ id, q, p: GAME_DATA.findPotion(id) }))
    .filter(o => o.p && acceptedTypes.includes(o.p.type) && (slotIdx !== 2 || o.p.kind === 'combat'));

  let thresholdControl = '';
  if (slotIdx < 2) {
    const pct = Math.round((slot.threshold || 0) * 100);
    thresholdControl = `<div class="pcfg-section">
      <div class="pcfg-label">觸發條件：當前 ${slotIdx === 0 ? 'HP' : 'MP'} ≤ <b id="cfgThVal">${pct}</b>%</div>
      <input type="range" min="10" max="90" step="5" value="${pct}" id="cfgThresholdSlider" style="width:100%">
    </div>`;
  } else {
    thresholdControl = `<div class="pcfg-section" style="font-size:11px;color:var(--muted)">Buff 槽：當綁定藥水的持續時間結束時，會自動再喝一瓶。</div>`;
  }

  let listHtml;
  if (!owned.length) {
    listHtml = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:16px">背包無可用藥水，請至商店購買。</div>';
  } else {
    listHtml = owned.map(o => {
      const isCur = slot.potionId === o.id;
      return `<div class="pcfg-row ${isCur ? 'current' : ''}" data-bind="${o.id}">
        <div class="pcfg-row-info">
          <span class="bag-item ${o.p.rarity}" style="display:inline-block;padding:1px 6px">${o.p.name}</span>
          <span style="color:var(--muted);font-size:11px">×${o.q}</span>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">${o.p.desc}</div>
        </div>
        <button class="${isCur ? 'danger' : 'primary'}" data-bindid="${o.id}">${isCur ? '解除' : '綁定'}</button>
      </div>`;
    }).join('');
  }

  root.innerHTML = `
    <div class="pcfg-title">${slotLabels[slotIdx]}</div>
    ${thresholdControl}
    <div class="pcfg-section">
      <div class="pcfg-label">選擇藥水：</div>
      <div class="pcfg-list">${listHtml}</div>
    </div>
  `;
  // bind
  root.querySelectorAll('button[data-bindid]').forEach(b => {
    b.onclick = () => {
      const cur = slot.potionId;
      const tgt = b.dataset.bindid;
      GAME_STATE.setPotionSlot(st.activeCharId, slotIdx, cur === tgt ? null : tgt);
      renderPotionConfig(); renderPotionSlotBar();
    };
  });
  const slider = document.getElementById('cfgThresholdSlider');
  if (slider) {
    slider.oninput = () => {
      const v = parseInt(slider.value) / 100;
      GAME_STATE.setPotionThreshold(st.activeCharId, slotIdx, v);
      document.getElementById('cfgThVal').textContent = slider.value;
      renderPotionSlotBar();
    };
  }
}

function doCraft(recipeId) {
  const rec = GAME_DATA.findRecipe(recipeId);
  if (!rec) return;
  const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
  if (cs.level < (rec.requiredLv || 0)) return toast(`需要 Lv ${rec.requiredLv}`, 'error');
  if (GAME_STATE.state.gold < rec.cost.gold) return toast('金幣不足', 'error');
  for (const [n, q] of Object.entries(rec.cost.mats)) {
    if (((cs.bag && cs.bag.materials && cs.bag.materials[n]) || 0) < q) return toast(`${n} 不足`, 'error');
  }
  // 扣費 + 產生 instance
  GAME_STATE.gainGold(-rec.cost.gold);
  for (const [n, q] of Object.entries(rec.cost.mats)) GAME_STATE.consumeMaterial(n, q);
  const instId = GAME_STATE.createEquipInstance(rec.target, true);
  const def = GAME_DATA.findEquipment(rec.target);
  toast(`製作完成：${def.name}`, 'gold');
  renderCraft();
  renderBag();
  renderHud();
}

function renderResonance() {
  const root = document.getElementById('tabResonance');
  if (!root) return;
  const st = GAME_STATE.state;
  if (!st.resonanceUnlocked) {
    root.innerHTML = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px">需要任一角色到 99 級畢業才能解鎖共鳴。</div>';
    return;
  }
  const pts = st.resonancePoints || {};
  const unspent = GAME_STATE.getResonanceUnspent();
  const stats = [
    { key: 'atk',       name: '攻擊',    delta: '+2.5 / 點' },
    { key: 'def',       name: '防禦',    delta: '+1.5 / 點' },
    { key: 'hp',        name: '生命',    delta: '+30 / 點' },
    { key: 'crit',      name: '暴擊',    delta: '+0.5% / 點' },
    { key: 'critDmg',   name: '暴傷',    delta: '+2% / 點' },
    { key: 'spd',       name: '速度',    delta: '+1% / 點' },
    { key: 'dmgReduce', name: '減傷',    delta: '+0.5% / 點' },
    { key: 'cdReduce',  name: 'CD 縮減', delta: '+0.5% / 點（總值 ≤ 50%）' },
    { key: 'vsBoss',    name: '對 BOSS', delta: '+1% / 點' },
    { key: 'skillDmg',  name: '技能傷害',delta: '+0.5% / 點' },
    { key: 'defPierce', name: '無視防禦',delta: '+1.5% / 點（上限 50 點 = 75%；硬上限 95%）' },
    { key: 'maxMp',     name: 'MP 上限', delta: '+10 / 點' },
    { key: 'expMul',    name: '經驗加倍', delta: '+2% / 點（上限 100 點 = +200%）' },
    { key: 'goldMul',   name: '金幣加倍', delta: '+2% / 點（上限 100 點 = +200%）' },
  ];
  const rows = stats.map(s => {
    const cur = pts[s.key] || 0;
    const cap = GAME_STATE.getResonanceCap(s.key);
    const isCapped = Number.isFinite(cap) && cur >= cap;
    const canAdd1 = unspent > 0 && !isCapped;
    const canAdd10 = unspent >= 10 && (!Number.isFinite(cap) || cur + 10 <= cap);
    const capLabel = Number.isFinite(cap)
      ? `<small class="reson-cap">${cur} / ${cap}</small>`
      : `<small class="reson-cap reson-cap-inf">${cur} ∞</small>`;
    return `
      <div class="reson-row ${isCapped ? 'capped' : ''}">
        <div class="reson-name">${s.name}<small>${s.delta}</small></div>
        <div class="reson-count">${capLabel}</div>
        <button class="primary" data-alloc="${s.key}" ${canAdd1 ? '' : 'disabled'}>＋</button>
        <button class="primary" data-alloc="${s.key}" data-amt="10" ${canAdd10 ? '' : 'disabled'}>+10</button>
      </div>
    `;
  }).join('');
  root.innerHTML = `
    <div class="reson-header">
      <div>共鳴等級 <b style="color:var(--gold);font-size:18px">R${st.resonance}</b></div>
      <div>可分配點數 <b style="color:var(--accent);font-size:18px">${unspent}</b></div>
      <button class="ghost" id="btnResonReset">重置</button>
    </div>
    <div class="reson-list">${rows}</div>
    <div style="font-size:10px;color:var(--muted);margin-top:8px;line-height:1.6">每提升 1 共鳴等級給 1 點。可重置免費（不消耗）。全角色共享。</div>
  `;
  root.querySelectorAll('button[data-alloc]').forEach(btn => {
    btn.onclick = () => {
      const stat = btn.dataset.alloc;
      const amt = parseInt(btn.dataset.amt || '1');
      if (GAME_STATE.allocateResonance(stat, amt)) {
        renderResonance(); renderHud(); renderCharDetail(); renderCharList();
      }
    };
  });
  const btnReset = document.getElementById('btnResonReset');
  if (btnReset) btnReset.onclick = () => {
    if (confirm('重置共鳴點數？所有分配點數會收回。')) {
      GAME_STATE.resetResonance();
      renderResonance(); renderHud(); renderCharDetail(); renderCharList();
    }
  };
}

function renderEquipDetail(instId) {
  const root = document.getElementById('tabEquip');
  if (!root) return;
  const inst = _activeBag().equipment[instId];
  if (!inst) { root.innerHTML = '<div style="color:var(--muted)">無</div>'; return; }
  const def = GAME_DATA.findEquipment(inst.itemId);
  if (!def) return;
  const forge = inst.forge || 0;
  const fmult = GAME_DATA.forgeMultiplier(forge);
  // 白值 base stats
  const baseRows = Object.entries(def.stats).map(([k, v]) => {
    const isPct = (k === 'crit' || k === 'spd' || k === 'critDmg' || k === 'dmgReduce');
    const final = isPct ? v : v * fmult;
    const display = isPct ? `+${(final * 100).toFixed(1)}%` : `+${Math.floor(final)}`;
    const names = { atk: '攻擊', def: '防禦', hp: '生命', crit: '暴擊', critDmg: '暴傷', spd: '速度', dmgReduce: '減傷' };
    return `<div class="eq-row"><span>${names[k] || k}</span><b>${display}</b></div>`;
  }).join('');
  // 固定效果
  let fixedHtml = '<div class="eq-empty">無</div>';
  if (def.fixed) {
    const effList = Object.entries(def.fixed.effect || {}).map(([k, raw]) => {
      const v = GAME_DATA.resolveFixedValue(raw, forge);
      const names = { atk: '攻擊', def: '防禦', hp: '生命', crit: '暴擊', critDmg: '暴傷', spd: '速度', dmgReduce: '減傷', cdReduce: 'CD減', vsBoss: '對 BOSS', allMul: '所有屬性' };
      const isPct = (k === 'crit' || k === 'spd' || k === 'critDmg' || k === 'dmgReduce' || k === 'cdReduce' || k === 'vsBoss' || k === 'allMul');
      const display = isPct ? `+${(v * 100).toFixed(1)}%` : `+${Math.floor(v)}`;
      return `<div class="eq-row"><span>${names[k] || k}</span><b style="color:var(--gold)">${display}</b></div>`;
    }).join('');
    fixedHtml = `<div style="color:var(--accent);font-weight:600;margin-bottom:4px;font-size:12px">${def.fixed.label}</div>${effList}`;
  }
  // 隨機詞綴（用全域 helper 統一格式）
  const affixHtml = inst.affixes && inst.affixes.length
    ? inst.affixes.map(a => {
        const f = formatAffix(a);
        return `<div class="eq-row"><span>${f.label}</span><b style="color:var(--shard)">+${f.value}</b></div>`;
      }).join('')
    : '<div class="eq-empty">無</div>';
  // 鑲嵌孔
  const socketCount = GAME_DATA.socketsForRarity(def.rarity);
  if (!inst.sockets) inst.sockets = new Array(socketCount).fill(null);
  let socketHtml;
  if (socketCount === 0) {
    socketHtml = '<div class="eq-empty">此稀有度無鑲嵌孔</div>';
  } else {
    // stat 簡寫對應
    const STAT_CHAR = { atk: '攻', def: '防', hp: '生', crit: '暴', spd: '速', critDmg: '傷', dmgReduce: '盾' };
    const STAT_NAME = { atk: '攻擊', def: '防禦', hp: '生命', crit: '暴擊率', spd: '速度', critDmg: '暴擊傷害', dmgReduce: '減傷' };
    socketHtml = '<div class="socket-row">';
    const totals = {};  // 鑲嵌總和 { stat: { value, pct } }
    for (let i = 0; i < socketCount; i++) {
      const gemId = inst.sockets[i];
      if (gemId) {
        const gem = GAME_DATA.findGem(gemId);
        const ch = gem ? (STAT_CHAR[gem.stat] || '?') : '?';
        const tier = gem ? gem.tier : 0;
        const rarity = gem ? gem.rarity : 'N';
        const valStr = gem ? (gem.pct ? `+${(gem.value * 100).toFixed(1)}%` : `+${gem.value}`) : '';
        const tip = gem ? `${gem.name} ${valStr}（點擊取下並銷毀）` : '';
        socketHtml += `<div class="socket filled rarity-${rarity}" data-inst="${instId}" data-slot="${i}" data-action="unsocket" title="${tip}">
          <span class="socket-stat">${ch}</span>
          <span class="socket-tier">T${tier}</span>
        </div>`;
        if (gem) {
          if (!totals[gem.stat]) totals[gem.stat] = { value: 0, pct: gem.pct };
          totals[gem.stat].value += gem.value;
        }
      } else {
        socketHtml += `<div class="socket empty" data-inst="${instId}" data-slot="${i}" data-action="socket" title="點擊嵌入魔法石">+</div>`;
      }
    }
    socketHtml += '</div>';
    // 鑲嵌總和顯示
    const totalEntries = Object.entries(totals);
    if (totalEntries.length > 0) {
      const lines = totalEntries.map(([stat, info]) => {
        const display = info.pct ? `+${(info.value * 100).toFixed(1)}%` : `+${Math.floor(info.value)}`;
        return `<span class="socket-total-item"><span class="socket-total-stat">${STAT_NAME[stat] || stat}</span> <span class="socket-total-val">${display}</span></span>`;
      }).join('');
      socketHtml += `<div class="socket-totals"><div class="socket-totals-label">鑲嵌加成</div><div class="socket-totals-body">${lines}</div></div>`;
    }
    socketHtml += '<div style="font-size:10px;color:var(--muted);margin-top:6px;line-height:1.5">點擊空孔嵌入魔法石。<span style="color:var(--hp-enemy)">★ 取下會直接銷毀，無法回收！</span></div>';
    socketHtml += `<div id="gemPicker_${instId}" class="gem-picker hidden"></div>`;
  }

  // 套裝
  let setHtml = '';
  if (def.setId) {
    const setDef = GAME_DATA.findSet(def.setId);
    if (setDef) {
      const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
      const counts = cs ? GAME_DATA.countSetPieces(cs) : {};
      const n = counts[def.setId] || 0;
      setHtml = `<div class="eq-section">
        <div class="eq-section-title" style="color:${setDef.color}">套裝：${setDef.name} (${n}/5)</div>
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px">${setDef.tagline}</div>`;
      for (const b of setDef.bonuses) {
        const active = n >= b.pieces;
        setHtml += `<div class="set-bonus ${active ? 'active' : 'inactive'}">${active ? '✓' : '–'} ${b.label}</div>`;
      }
      setHtml += '</div>';
    }
  }

  const tokens = _activeBag().rerollTokens || 0;
  const canReroll = inst.affixes && inst.affixes.length > 0;
  const rerollBtn = canReroll
    ? `<button class="ghost small" data-reroll="${instId}" ${tokens > 0 ? '' : 'disabled'}>重抽詞綴（券 ×${tokens}）</button>`
    : '';

  // UR 武器成長 section（只 ur2 系列顯示）
  let urGrowthHtml = '';
  if (GAME_DATA.isUrGrowable(def)) {
    const urStage = inst.urStage || 0;
    const maxStage = GAME_DATA.UR_GROWTH_MAX_STAGE;
    const unlocked = GAME_DATA.UR_GROWTH.map(eff => {
      const got = urStage >= eff.stage;
      return `<div style="font-size:11px;margin:2px 0;color:${got ? 'var(--hp-self)' : 'var(--muted)'}">${got ? '✓' : '–'} 階 ${eff.stage}：${eff.label}</div>`;
    }).join('');
    let actionHtml = '';
    if (urStage >= maxStage) {
      actionHtml = `<div style="color:var(--gold);font-size:12px;text-align:center;padding:8px">★ 已達神器階（10 / 10）</div>`;
    } else {
      const cost = GAME_DATA.getUrGrowthCost(urStage + 1, def);
      const bag = _activeBag();
      const goldOk = GAME_STATE.state.gold >= cost.gold;
      const matsHtml = Object.entries(cost.mats).map(([n, q]) => {
        const have = (bag.materials[n] || 0);
        const ok = have >= q;
        return `<span style="color:${ok ? 'var(--hp-self)' : 'var(--hp-enemy)'};margin-right:8px">${n} ${have}/${q}</span>`;
      }).join('');
      const allMatsOk = Object.entries(cost.mats).every(([n, q]) => (bag.materials[n] || 0) >= q);
      const canDo = goldOk && allMatsOk;
      const nextEff = GAME_DATA.UR_GROWTH.find(e => e.stage === urStage + 1);
      actionHtml = `
        <div style="font-size:11px;margin-bottom:4px">
          <span style="color:var(--accent)">下階解鎖：</span><span style="color:var(--gold)">${nextEff?.label || '?'}</span>
        </div>
        <div style="font-size:11px;margin-bottom:4px">
          <span style="color:${goldOk ? 'var(--hp-self)' : 'var(--hp-enemy)'};margin-right:8px">金 ${cost.gold.toLocaleString()}</span>
          ${matsHtml}
        </div>
        <button class="primary" data-urgrow="${instId}" ${canDo ? '' : 'disabled'}>★ 成長 → 階 ${urStage + 1}</button>
      `;
    }
    urGrowthHtml = `
      <div class="eq-section" style="border:1px solid var(--accent);padding:8px;border-radius:4px;background:rgba(255,138,60,0.05)">
        <div class="eq-section-title" style="color:var(--accent)">★ 武器成長 ${urStage} / ${maxStage}</div>
        <div style="margin-bottom:6px">${unlocked}</div>
        ${actionHtml}
      </div>
    `;
  }

  root.innerHTML = `
    <div class="eq-header">
      <div class="eq-name bag-item ${def.rarity}" style="display:inline-block;padding:2px 8px">${def.name}</div>
      <span style="margin-left:6px;color:var(--muted);font-size:11px">${GAME_DATA.SLOT_LABELS[def.slot]} · ${def.rarity}${forge ? ' +' + forge : ''}${inst.urStage ? ' · 成長 ' + inst.urStage : ''}</span>
    </div>
    <div class="eq-section"><div class="eq-section-title">基礎屬性（白值，依強化提升）</div>${baseRows}</div>
    <div class="eq-section"><div class="eq-section-title">固定效果</div>${fixedHtml}</div>
    <div class="eq-section"><div class="eq-section-title">隨機詞綴 ${rerollBtn}</div>${affixHtml}</div>
    <div class="eq-section"><div class="eq-section-title">鑲嵌 (${socketCount} 孔)</div>${socketHtml}</div>
    ${setHtml}
    ${urGrowthHtml}
  `;
  // UR 武器成長按鈕
  const urBtn = root.querySelector('button[data-urgrow]');
  if (urBtn) {
    urBtn.onclick = (e) => {
      e.stopPropagation();
      const r = GAME_STATE.growUrWeapon(instId);
      if (r.ok) {
        toast(`★ ${r.name} 成長至階 ${r.stage}（${r.effectLabel}）`, 'gold');
        renderEquipDetail(instId); renderBag(); renderHud(); renderCharDetail();
      } else {
        toast(r.reason, 'error');
      }
    };
  }
  // 重抽詞綴按鈕
  const rerollBtnEl = root.querySelector('button[data-reroll]');
  if (rerollBtnEl) {
    rerollBtnEl.onclick = (e) => {
      e.stopPropagation();
      if (!confirm('消耗 1 張重抽券，重新隨機所有詞綴？')) return;
      const r = GAME_STATE.rerollAffixes(instId);
      if (r.ok) {
        toast(`${r.name} 詞綴已重抽`, 'gold');
        renderEquipDetail(instId); renderBag(); renderHud();
      } else {
        toast(r.reason, 'error');
      }
    };
  }

  // 綁定 socket 點擊事件
  root.querySelectorAll('.socket[data-action]').forEach(el => {
    el.onclick = () => {
      const slotIdx = parseInt(el.dataset.slot);
      const action = el.dataset.action;
      if (action === 'unsocket') {
        // 兩段式確認：第一次點顯示警告，3 秒內再點同個孔才真的銷毀
        const key = `${instId}#${slotIdx}`;
        if (window._pendingUnsocket === key) {
          // 第二次點擊：執行銷毀
          clearTimeout(window._pendingUnsocketTimer);
          window._pendingUnsocket = null;
          const r = GAME_STATE.unsocketGem(instId, slotIdx);
          if (r && r.ok) {
            toast('魔法石已銷毀', 'error');
            renderEquipDetail(instId); renderBag(); renderHud();
          } else if (r && r.reason) {
            toast(r.reason, 'error');
          }
        } else {
          // 第一次點擊：標記、變色提示
          window._pendingUnsocket = key;
          el.classList.add('unsocket-pending');
          const gemId = _activeBag().equipment[instId]?.sockets?.[slotIdx];
          const gem = gemId ? GAME_DATA.findGem(gemId) : null;
          const name = gem ? gem.name : '魔法石';
          toast(`⚠ 再點一次以銷毀「${name}」（3 秒內）`, 'error');
          // 3 秒後自動取消
          if (window._pendingUnsocketTimer) clearTimeout(window._pendingUnsocketTimer);
          window._pendingUnsocketTimer = setTimeout(() => {
            window._pendingUnsocket = null;
            document.querySelectorAll('.socket.unsocket-pending').forEach(s => s.classList.remove('unsocket-pending'));
          }, 3000);
        }
      } else {
        openGemPicker(instId, slotIdx);
      }
    };
  });
}

function openGemPicker(instId, slotIdx) {
  const root = document.getElementById('gemPicker_' + instId);
  if (!root) return;
  const gems = _activeBag().gems || {};
  const owned = Object.entries(gems).filter(([id, q]) => q > 0);
  if (!owned.length) {
    root.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px;text-align:center">背包無魔法石。請至特殊副本（強化試煉）或襲擊戰取得。</div>';
    root.classList.remove('hidden');
    return;
  }
  root.innerHTML = '<div class="gem-picker-title">選擇要嵌入的魔法石：</div>' +
    owned.map(([id, qty]) => {
      const g = GAME_DATA.findGem(id);
      if (!g) return '';
      const isPct = (g.stat === 'crit' || g.stat === 'spd' || g.stat === 'critDmg');
      const valDisp = isPct ? `+${(g.value * 100).toFixed(1)}%` : `+${g.value}`;
      const statName = { atk: '攻擊', def: '防禦', hp: '生命', crit: '暴擊', spd: '速度' }[g.stat] || g.stat;
      return `<div class="gem-pick-row" data-gem="${id}">
        <span class="bag-item ${g.rarity}" style="display:inline-block;padding:1px 6px">${g.name}</span>
        <span style="color:var(--muted);font-size:11px">${statName} ${valDisp}</span>
        <span style="color:var(--text);font-size:11px">×${qty}</span>
        <button class="primary" data-gemid="${id}">嵌入</button>
      </div>`;
    }).join('') +
    '<button class="ghost" data-cancel="1" style="margin-top:6px;width:100%">取消</button>';
  root.classList.remove('hidden');
  root.querySelectorAll('button[data-gemid]').forEach(b => {
    b.onclick = () => {
      const gid = b.dataset.gemid;
      if (GAME_STATE.socketGem(instId, slotIdx, gid)) {
        toast('鑲嵌成功', 'gold');
        renderEquipDetail(instId); renderBag(); renderHud();
      } else {
        toast('鑲嵌失敗', 'error');
      }
    };
  });
  const cancel = root.querySelector('button[data-cancel]');
  if (cancel) cancel.onclick = () => root.classList.add('hidden');
}

window.showRaidPreview = function(dungeonId) {
  const d = GAME_DATA.getDungeon(dungeonId);
  if (!d) return;
  const win = document.getElementById('winRaidPreview');
  const body = document.getElementById('tabRaidPreview');
  const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
  const myCP = cs ? GAME_STATE.combatPower(cs.id) : 0;
  const lvOk = !d.requiredLv || (cs && cs.level >= d.requiredLv);
  const cpRatio = myCP / d.cp;
  // 戰力評估（cpHidden BOSS 不對外公開 CP，評估只看「能否進場」）
  let assessment, assessClass;
  if (d.cpHidden) {
    assessment = '深不可測——戰力參考意義有限';
    assessClass = 'warn';
  } else if (cpRatio >= 1.5) { assessment = '戰力遠超 BOSS，勝券在握'; assessClass = 'safe'; }
  else if (cpRatio >= 1.0) { assessment = '戰力足以挑戰'; assessClass = 'ok'; }
  else if (cpRatio >= 0.6) { assessment = '戰力略遜，需精打細算'; assessClass = 'warn'; }
  else { assessment = '戰力嚴重不足，凶多吉少'; assessClass = 'danger'; }

  const lore = (d.lore || []).map(l => l === '' ? '<br>' : `<p>${l}</p>`).join('');
  const rewards = (d.rewards || []).map(r => `
    <div class="raid-reward-row">
      <span class="raid-reward-label">${r.label}</span>
      <span class="raid-reward-value" style="color:${r.color || 'var(--text)'}">${r.value}</span>
    </div>
  `).join('');

  // ===== 多人連線狀態 =====
  const mpConnected = window.MP_API && MP_API.isConnected();
  const mpHost = mpConnected && MP_API.isHost();
  const mpGuest = mpConnected && MP_API.isGuest();
  const mpPlayers = mpConnected ? Object.values(MP_API.getPlayers()) : [];
  let mpHtml = '';
  if (mpConnected) {
    const myNick = GAME_STATE.getPlayerNickname() || '我';
    const teamList = [
      `<li class="raid-team-row${mpHost ? ' host' : ''}"><b>${myNick}</b> <small>（你）</small> ${mpHost ? '<span class="raid-tag-host">HOST</span>' : '<span class="raid-tag-guest">GUEST</span>'}</li>`,
      ...mpPlayers.map(p => `<li class="raid-team-row${p.peerId === MP.hostId ? ' host' : ''}"><b>${p.nickname || '無名旅人'}</b> <small>${p.charName || ''} Lv ${p.level || 1}</small> ${p.peerId === MP.hostId ? '<span class="raid-tag-host">HOST</span>' : '<span class="raid-tag-guest">GUEST</span>'}</li>`)
    ].join('');
    const teamCP = (myCP + mpPlayers.reduce((s, p) => s + (p.cp || 0), 0)).toLocaleString();
    mpHtml = `
      <div class="raid-section-title" style="color:#5fa8ff">⛺ 隊伍（${mpPlayers.length + 1} 人 · 總戰力 ${teamCP}）</div>
      <ul class="raid-team-list">${teamList}</ul>
      ${mpHost
        ? '<div class="raid-mp-note host">你是房主。點「進入戰鬥」會自動帶朋友一起進。</div>'
        : '<div class="raid-mp-note guest">等待房主開戰 — Guest 無法主動進入。</div>'}
    `;
  } else {
    mpHtml = `
      <div class="raid-mp-note solo">＊ 想揪朋友一起打？開「多人」視窗建房 / 加房後再回來。</div>
    `;
  }

  body.innerHTML = `
    <div class="raid-preview">
      <div class="raid-boss-portrait">
        <img src="${d.bossPortrait || ''}" alt="${d.boss}" onerror="this.style.display='none'">
      </div>
      <div class="raid-info">
        <div class="raid-title">${d.name}</div>
        <div class="raid-subtitle">CP ${d.cpHidden ? '???' : d.cp.toLocaleString()} · 難度 ×${d.difficultyMul || 1} · 需畢業 Lv ${d.requiredLv}</div>
        <div class="raid-lore">${lore}</div>
        ${d.warning ? `<div class="raid-warning">⚠ ${d.warning}</div>` : ''}
        <div class="raid-section-title">通關獎勵</div>
        <div class="raid-rewards">${rewards}</div>
        <div class="raid-section-title">戰力評估</div>
        <div class="raid-assessment ${assessClass}">
          <div>你的戰力：<b>${myCP.toLocaleString()}</b> vs BOSS <b>${d.cpHidden ? '???' : d.cp.toLocaleString()}</b> ${d.cpHidden ? '' : `(${(cpRatio * 100).toFixed(0)}%)`}</div>
          <div style="margin-top:4px">${d.cpHidden ? '深不可測——戰力參考意義有限' : assessment}</div>
        </div>
        ${mpHtml}
        <div class="raid-actions">
          <button class="primary big raid-start" data-raid-start="${d.id}" ${(lvOk && !mpGuest) ? '' : 'disabled'}>
            ${mpHost ? `⚔ 進入戰鬥（揪 ${mpPlayers.length} 位朋友）` : (mpGuest ? '🕓 等待房主開戰...' : '⚔ 進入戰鬥')}
          </button>
          <button class="ghost" data-raid-close>暫不挑戰</button>
        </div>
        ${!lvOk ? '<div class="raid-warning">需要先畢業（主線 Lv 99）才能進入</div>' : ''}
      </div>
    </div>
  `;
  // 顯示視窗
  win.classList.remove('hidden');
  win.style.display = 'flex';
  win.style.visibility = 'visible';
  win.style.opacity = '1';
  win.style.left = '460px';
  win.style.top = '60px';
  win.style.width = '540px';
  win.style.zIndex = '9999';
  bringWindowToFront(win);
  win.classList.add('flash-open');
  setTimeout(() => win.classList.remove('flash-open'), 600);
  // 綁定按鈕
  body.querySelector('button[data-raid-start]')?.addEventListener('click', () => {
    // ★ 預先驗證 CP / 等級 — 失敗就 toast 早退，不發廣播、不播 cutscene
    //   否則就會「動畫播完才知道進不去」的鬼狀態
    const _cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
    const _myCP = _cs ? GAME_STATE.combatPower(_cs.id) : 0;
    const _minCp = (typeof d.minCpOverride === 'number') ? d.minCpOverride : d.cp * 0.4;
    if (d.requiredLv && _cs && _cs.level < d.requiredLv) {
      const need = d.requiredLv >= 99 ? '畢業（主線練到 Lv 99）' : `Lv ${d.requiredLv}`;
      toast(`需要${need}才能挑戰 ${d.name}（目前 Lv ${_cs.level}）`, 'error');
      return;
    }
    if (_myCP < _minCp && !d.isEndless) {
      toast(`戰力不足，需要 ${Math.floor(_minCp).toLocaleString()} CP（目前 ${_myCP.toLocaleString()}）`, 'error');
      return;
    }
    // 無盡塔：先檢查並扣入場券（早退失敗）
    if (d.isEndless) {
      const passId = d.passId || 'pass-endless';
      const ok = GAME_STATE.consumePass(passId, 1);
      if (!ok) {
        const passName = GAME_DATA.findPass(passId)?.name || '入場券';
        toast(`入場券不足！從寶箱中可低機率掉落「${passName}」`, 'error');
        return;
      }
    }
    // ★ 多人同步關鍵：raid-launch 廣播改成放 click 立刻發出，
    //   讓 guest 跟 host 同一時刻播 cutscene → 雙方同時 startBattle
    if (window.MP_API && MP_API.isHost() && MP_API.isConnected()) {
      MP_API.broadcastRaidLaunch(d.id);
      const teamSize = Object.keys(MP_API.getPlayers()).length + 1;
      if (d.isEndless) {
        toast(`房主開無盡塔 — ${teamSize} 人團進入：${d.name}（扣 1 張通行證）`, 'gold');
      } else {
        toast(`房主開戰 — ${teamSize} 人團進入：${d.name}`, 'gold');
      }
    } else if (d.isEndless) {
      toast(`進入無盡塔：${d.name}（扣 1 張通行證）`, 'gold');
    } else {
      toast(`進入襲擊戰：${d.name}`, 'gold');
    }
    // 立刻 startBattle 並暫停 → 播 cutscene 期間 BOSS 不會動 → cutscene 結束才解暫停
    // 這樣 guest 收 enemy-sync 不會觸發 Wave 29.2 fallback 重複 startBattle 把統計洗掉
    const resultOverlay = document.getElementById('resultOverlay');
    if (resultOverlay) resultOverlay.classList.add('hidden');
    win.style.display = '';
    win.classList.add('hidden');
    PIXEL.setScene({ regionId: GAME_DATA.getRegionByDungeon(d.id).id });
    startBattle(d.id, GAME_STATE.state.activeCharId);
    if (d.cutscene && typeof showRaidCutscene === 'function' && window.BATTLE) {
      window.BATTLE.paused = true;
      showRaidCutscene(d.cutscene, () => {
        if (window.BATTLE) {
          window.BATTLE.paused = false;
          window.BATTLE.startTime = performance.now();  // 重設計時，cutscene 不算進「堅持秒數」
        }
      });
    }
  });
  body.querySelector('button[data-raid-close]')?.addEventListener('click', () => {
    win.style.display = '';
    win.classList.add('hidden');
  });
};

// ============================================================================
// 開場動畫（cutscene）— 全自動電影流程：
//   Phase 1：黑屏淡入白霧（雲霧繚繞）
//   Phase 2：對話自動跑（無跳過/繼續按鈕）
//   Phase 3：最後一句時 BOSS 從中央慢慢浮現
//   Phase 4：對話結束 BOSS 滑向戰鬥位置 → overlay 淡出 → 開戰
// ============================================================================
function showRaidCutscene(cutscene, onComplete) {
  if (!cutscene || !Array.isArray(cutscene.lines) || cutscene.lines.length === 0) {
    if (onComplete) onComplete();
    return;
  }
  // 已存在的 cutscene overlay 先清掉（避免重複）
  const existing = document.getElementById('cutsceneOverlay');
  if (existing) existing.remove();

  const styleClass = cutscene.style ? ` cutscene-${cutscene.style}` : '';
  const overlay = document.createElement('div');
  overlay.id = 'cutsceneOverlay';
  overlay.className = 'cutscene-overlay auto' + styleClass;
  // 主題化粒子層：bloodscythe 用薔薇花瓣 + 五芒星 + 鐮刀斬擊
  // 預設（mirror 等）用兩層白霧
  let themeLayers = '<div class="cutscene-mist"></div><div class="cutscene-mist cutscene-mist-2"></div>';
  if (cutscene.style === 'bloodscythe') {
    // 18 片飄落花瓣（不同位置、延遲、旋轉）
    const petals = Array.from({ length: 18 }, (_, i) => {
      const leftPct = (i * 5.5 + (i % 3) * 7) % 100;
      const delay = (i * 0.4) % 8;
      const dur = 6 + (i % 4) * 1.5;
      const size = 14 + (i % 3) * 6;
      const rot = (i * 47) % 360;
      return `<div class="cutscene-petal" style="left:${leftPct}%;animation-delay:${delay}s;animation-duration:${dur}s;width:${size}px;height:${size}px;--start-rot:${rot}deg"></div>`;
    }).join('');
    themeLayers = `
      <div class="cutscene-blood-veil"></div>
      <div class="cutscene-pentagram"></div>
      <div class="cutscene-petals">${petals}</div>
      <div class="cutscene-slash"></div>
    `;
  }
  overlay.innerHTML = `
    ${themeLayers}
    <div class="cutscene-portrait hidden">
      <img src="${cutscene.portrait}" alt="BOSS" />
    </div>
    <div class="cutscene-textbox">
      <div class="cutscene-speaker"></div>
      <div class="cutscene-line"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const speakerEl = overlay.querySelector('.cutscene-speaker');
  const lineEl    = overlay.querySelector('.cutscene-line');
  const portraitEl = overlay.querySelector('.cutscene-portrait');
  const textboxEl  = overlay.querySelector('.cutscene-textbox');

  // 計時參數（搭配 CSS 動畫：白霧 1.5s 漸層 + 對話框 1.4s delay + 0.8s 淡入）
  const MIST_FADE_IN    = 2300;  // 等對話框淡入完才開始打字
  const TYPE_SPEED      = 80;    // 每字 ms
  const POST_LINE_PAUSE = 1500;  // 一句打完後停留時間
  const BOSS_SETTLE     = 1800;  // BOSS 滑到戰鬥位置時長
  const OVERLAY_FADEOUT = 800;   // overlay 淡出

  let cleanup = false;
  function finish() {
    if (cleanup) return;
    cleanup = true;
    overlay.classList.remove('show');
    overlay.classList.add('hide');
    setTimeout(() => { try { overlay.remove(); } catch (e) {} }, OVERLAY_FADEOUT);
    if (onComplete) onComplete();
  }

  function typeLine(text, done) {
    lineEl.textContent = '';
    let i = 0;
    const ti = setInterval(() => {
      if (i < text.length) {
        lineEl.textContent += text[i++];
      } else {
        clearInterval(ti);
        if (done) done();
      }
    }, TYPE_SPEED);
  }

  function runLine(idx) {
    if (idx >= cutscene.lines.length) {
      // 對話跑完 → BOSS 滑向戰鬥位置（同時 textbox 淡出）
      textboxEl.classList.add('fade-out');
      portraitEl.classList.add('move-to-battle');
      setTimeout(finish, BOSS_SETTLE);
      return;
    }
    const line = cutscene.lines[idx];
    speakerEl.textContent = line.speaker || '';
    // 最後一句開始時觸發 BOSS 浮現
    if (idx === cutscene.lines.length - 1) {
      portraitEl.classList.remove('hidden');
      portraitEl.classList.add('emerge');
      // 主題化：bloodscythe 同時觸發鐮刀斬擊弧
      if (cutscene.style === 'bloodscythe') {
        const slashEl = overlay.querySelector('.cutscene-slash');
        if (slashEl) slashEl.classList.add('strike');
      }
    }
    typeLine(line.text, () => {
      setTimeout(() => runLine(idx + 1), POST_LINE_PAUSE);
    });
  }

  // 啟動：先讓 overlay 顯示（黑底）→ 過 50ms 開始淡入白霧 → 雲霧成形後跑對話
  setTimeout(() => overlay.classList.add('show'), 50);
  setTimeout(() => runLine(0), MIST_FADE_IN);
}
window.showRaidCutscene = showRaidCutscene;

// ============================================================================
// BOSS 衝刺一刀動畫（鏡夢縛魂的拔刀斬未破盾時觸發）
// 在 BOSS card 上播 slash 動畫 + 全螢幕紅閃 + 玩家血條閃紅
// ============================================================================
window.bossSlash = function(skillName, dmg) {
  // BOSS 卡片往前衝刺 + 縮放閃白
  const card = document.querySelector('.enemy-card');
  if (card) {
    card.classList.remove('boss-slashing');
    void card.offsetWidth;  // 強制重排，讓動畫可重複
    card.classList.add('boss-slashing');
    setTimeout(() => card.classList.remove('boss-slashing'), 700);
  }
  // 螢幕一閃紅 + 刀痕劃過
  let flash = document.getElementById('bossSlashFlash');
  if (!flash) {
    flash = document.createElement('div');
    flash.id = 'bossSlashFlash';
    flash.className = 'boss-slash-flash';
    document.body.appendChild(flash);
  }
  flash.classList.remove('show');
  void flash.offsetWidth;
  flash.classList.add('show');
  setTimeout(() => flash.classList.remove('show'), 800);
  // 玩家卡受擊抖動
  const playerCard = document.querySelector('.player-card, .fighter-card.player-card, .player-side .fighter-card');
  if (playerCard) {
    playerCard.classList.remove('boss-slash-hit');
    void playerCard.offsetWidth;
    playerCard.classList.add('boss-slash-hit');
    setTimeout(() => playerCard.classList.remove('boss-slash-hit'), 600);
  }
  // 大型傷害飄字
  if (typeof window.floatDamage === 'function' && dmg) {
    window.floatDamage('💀 ' + dmg, 'crit');
  }
};

// 開場蓄力開始 / 結束的 hook（log 之外的視覺）
window.bossChargingStart = function(chargeTime) {
  // class toggle 已由 renderEnemyCards 每幀處理（看 openingState === 'active'）
};
window.bossChargingEnd = function(broken) {
  // 同上，靠 class toggle 自動移除
};

// ============================================================================
// 幻夢之主 7 招技能動畫分發
// ============================================================================
window.bossSkillAnim = function(name, data) {
  data = data || {};
  switch (name) {
    case 'cloneSummon':    mirrorAnim_cloneSummon(data); break;
    case 'cloneExplode':   mirrorAnim_cloneExplode(data); break;
    case 'flowerMoon':     mirrorAnim_flowerMoon(data); break;
    case 'flowerMoonEnd':  mirrorAnim_flowerMoonEnd(data); break;
    case 'ribbonBind':     mirrorAnim_ribbonBind(data); break;
    case 'ribbonBindEnd':  mirrorAnim_ribbonBindEnd(data); break;
    case 'shadowDance':    mirrorAnim_shadowDance(data); break;
    case 'shadowDanceHit': mirrorAnim_shadowDanceHit(data); break;
    case 'ribbonRain':     mirrorAnim_ribbonRain(data); break;
    case 'ribbonDrop':     mirrorAnim_ribbonDrop(data); break;
    case 'mirrorCage':     mirrorAnim_mirrorCage(data); break;
    case 'mirrorCageEnd':  mirrorAnim_mirrorCageEnd(data); break;
    case 'awakening':      mirrorAnim_awakening(data); break;
    // 緋月姬 8 招
    case 'roseDance':         crimsonAnim_scytheArc(data, 'roseDance'); break;
    case 'roseDanceHit':      crimsonAnim_arcHit(data); break;
    case 'crimsonSlash':      crimsonAnim_chargeSlash(data, '緋月斬'); break;
    case 'crimsonSlashEnd':   crimsonAnim_chargeEnd(data); break;
    case 'scytheFrenzy':      crimsonAnim_scytheOrbit(data); break;
    case 'scytheFrenzyTick':  crimsonAnim_orbitTick(data); break;
    case 'scytheFrenzyEnd':   crimsonAnim_orbitEnd(data); break;
    case 'roseBarrier':       crimsonAnim_pentagram(data, '薔薇結界', false); break;
    case 'roseBarrierEnd':    crimsonAnim_pentagramEnd(data); break;
    case 'curseSpiral':       crimsonAnim_scytheArc(data, 'curseSpiral'); break;
    case 'curseSpiralHit':    crimsonAnim_arcHit(data); break;
    case 'bloodPact':         crimsonAnim_pentagram(data, '千年血契', true); break;
    case 'bloodPactEnd':      crimsonAnim_pentagramEnd(data); break;
    case 'curseRain':         crimsonAnim_petalRain(data); break;
    case 'curseRainTick':     crimsonAnim_petalRainTick(data); break;
    case 'curseRainEnd':      crimsonAnim_petalRainEnd(data); break;
    case 'moonFinale':        crimsonAnim_finale(data); break;
    case 'moonFinaleEnd':     crimsonAnim_finaleEnd(data); break;
  }
};

function _getBossCard() { return document.querySelector('.enemy-card'); }
function _getPlayerCard() {
  return document.querySelector('.player-side .fighter-card, .player-card');
}
function _getBattleStage() { return document.getElementById('battleStage'); }

// ── 分身映鏡：4 個半透明分身於 BOSS 卡四角 fade-in ──
function mirrorAnim_cloneSummon(data) {
  const card = _getBossCard();
  if (!card) return;
  // 清舊的
  card.querySelectorAll('.mirror-clone').forEach(el => el.remove());
  const positions = [
    { top: '8%',  left: '-22%' }, { top: '8%',  right: '-22%' },
    { bottom: '8%', left: '-22%' }, { bottom: '8%', right: '-22%' },
  ];
  positions.forEach((pos, i) => {
    const clone = document.createElement('div');
    clone.className = 'mirror-clone';
    Object.assign(clone.style, pos);
    clone.style.animationDelay = (i * 0.12) + 's';
    clone.innerHTML = `<img src="assets/portraits/raid-mirror.png" alt="clone">`;
    card.appendChild(clone);
  });
  card.classList.add('mirror-clones-active');
  const duration = (data.duration || 15) * 1000;
  setTimeout(() => {
    card.classList.remove('mirror-clones-active');
    card.querySelectorAll('.mirror-clone').forEach(el => el.remove());
  }, duration);
}
function mirrorAnim_cloneExplode(data) {
  // 4 個分身爆裂閃光
  const card = _getBossCard();
  if (!card) return;
  card.querySelectorAll('.mirror-clone').forEach(el => {
    el.classList.add('mirror-clone-explode');
  });
  setTimeout(() => {
    card.classList.remove('mirror-clones-active');
    card.querySelectorAll('.mirror-clone').forEach(el => el.remove());
  }, 600);
}

// ── 鏡花水月：BOSS 周圍粉藍光暈 + 漂浮花瓣粒子 ──
function mirrorAnim_flowerMoon(data) {
  const card = _getBossCard();
  if (!card) return;
  card.classList.add('boss-flowermoon');
  // 花瓣粒子
  const petalLayer = document.createElement('div');
  petalLayer.className = 'flowermoon-petals';
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('span');
    p.className = 'fm-petal';
    p.style.left = (Math.random() * 100) + '%';
    p.style.animationDelay = (Math.random() * 2) + 's';
    p.style.animationDuration = (3 + Math.random() * 2) + 's';
    petalLayer.appendChild(p);
  }
  card.appendChild(petalLayer);
  // 水波漣漪
  const ripple = document.createElement('div');
  ripple.className = 'flowermoon-ripple';
  card.appendChild(ripple);
}
function mirrorAnim_flowerMoonEnd(data) {
  const card = _getBossCard();
  if (!card) return;
  card.classList.remove('boss-flowermoon');
  card.querySelectorAll('.flowermoon-petals, .flowermoon-ripple').forEach(el => el.remove());
  if (data.broken) {
    // 打斷：藍色破裂閃光
    flashFullscreen('rgba(120, 200, 255, 0.4)', 500);
  } else {
    // 治療完成：BOSS 卡綠光治癒 flash
    card.classList.add('boss-healed');
    setTimeout(() => card.classList.remove('boss-healed'), 800);
  }
}

// ── 紅絲縛魂：紅絲帶從 BOSS 飛向玩家卡 + 玩家卡纏繞紅光 ──
function mirrorAnim_ribbonBind(data) {
  const bossCard = _getBossCard();
  const playerCard = _getPlayerCard();
  if (!bossCard || !playerCard) return;
  playerCard.classList.add('player-ribbon-bound');
  // 飛行絲帶
  const stage = _getBattleStage() || document.body;
  const ribbon = document.createElement('div');
  ribbon.className = 'ribbon-projectile';
  stage.appendChild(ribbon);
  setTimeout(() => ribbon.remove(), 800);
}
function mirrorAnim_ribbonBindEnd(data) {
  const playerCard = _getPlayerCard();
  if (playerCard) playerCard.classList.remove('player-ribbon-bound');
  if (data.broken) flashFullscreen('rgba(255, 220, 100, 0.3)', 400);
}

// ── 萬影連舞：BOSS 透明 + 殘影斜劃 ──
function mirrorAnim_shadowDance(data) {
  const card = _getBossCard();
  if (!card) return;
  card.classList.add('boss-shadowdance');
  setTimeout(() => card.classList.remove('boss-shadowdance'), (data.duration || 2) * 1000);
}
function mirrorAnim_shadowDanceHit(data) {
  // 一段殘影掃過畫面
  const stage = _getBattleStage() || document.body;
  const slash = document.createElement('div');
  slash.className = 'shadowdance-slash';
  // 隨機方向
  slash.style.transform = `rotate(${Math.floor(Math.random() * 360)}deg)`;
  slash.style.top = (10 + Math.random() * 70) + '%';
  stage.appendChild(slash);
  setTimeout(() => slash.remove(), 350);
  // 玩家卡受擊
  const playerCard = _getPlayerCard();
  if (playerCard) {
    playerCard.classList.remove('player-hit-flash');
    void playerCard.offsetWidth;
    playerCard.classList.add('player-hit-flash');
    setTimeout(() => playerCard.classList.remove('player-hit-flash'), 250);
  }
}

// ── 絲帶天降：螢幕落下垂直紅絲 ──
function mirrorAnim_ribbonRain(data) {
  // 在開始時建立一個 layer，逐條 ribbon 由 ribbonDrop 加進去
  let layer = document.getElementById('ribbonRainLayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'ribbonRainLayer';
    layer.className = 'ribbon-rain-layer';
    document.body.appendChild(layer);
  }
  const duration = (data.duration || 4) * 1000;
  setTimeout(() => { if (layer) layer.remove(); }, duration + 1500);
}
function mirrorAnim_ribbonDrop(data) {
  const layer = document.getElementById('ribbonRainLayer');
  if (!layer) return;
  const ribbon = document.createElement('div');
  ribbon.className = 'ribbon-falling' + (data.hit ? ' ribbon-hit' : '');
  ribbon.style.left = (Math.random() * 95) + '%';
  ribbon.style.animationDuration = (0.8 + Math.random() * 0.4) + 's';
  layer.appendChild(ribbon);
  setTimeout(() => ribbon.remove(), 1500);
}

// ── 鏡牢禁錮：玩家卡周圍 6 片菱形鏡面圍住 ──
function mirrorAnim_mirrorCage(data) {
  const playerCard = _getPlayerCard();
  if (!playerCard) return;
  playerCard.classList.add('player-caged');
  // 6 片鏡面
  const cage = document.createElement('div');
  cage.className = 'mirror-cage-frame';
  for (let i = 0; i < 6; i++) {
    const panel = document.createElement('div');
    panel.className = 'cage-panel';
    panel.style.transform = `rotate(${i * 60}deg) translateY(-95px)`;
    panel.style.animationDelay = (i * 0.08) + 's';
    cage.appendChild(panel);
  }
  playerCard.appendChild(cage);
}
function mirrorAnim_mirrorCageEnd(data) {
  const playerCard = _getPlayerCard();
  if (!playerCard) return;
  const cage = playerCard.querySelector('.mirror-cage-frame');
  if (cage) {
    cage.classList.add(data.broken ? 'cage-shatter' : 'cage-explode');
    setTimeout(() => cage.remove(), 800);
  }
  playerCard.classList.remove('player-caged');
  if (!data.broken) flashFullscreen('rgba(255, 80, 120, 0.45)', 600);
}

// ── 真我覺醒：螢幕震屏 + BOSS 卡紅化 + 黑紅煙霧 ──
function mirrorAnim_awakening(data) {
  const card = _getBossCard();
  if (card) {
    card.classList.add('boss-awakened');
    // 強烈震動
    card.classList.remove('boss-awakening-burst');
    void card.offsetWidth;
    card.classList.add('boss-awakening-burst');
    setTimeout(() => card.classList.remove('boss-awakening-burst'), 1300);
  }
  // 全螢幕黑紅閃爆
  flashFullscreen('rgba(120, 0, 30, 0.7)', 1200);
  // 螢幕震屏
  const app = document.getElementById('app');
  if (app) {
    app.classList.remove('screen-shake-hard');
    void app.offsetWidth;
    app.classList.add('screen-shake-hard');
    setTimeout(() => app.classList.remove('screen-shake-hard'), 800);
  }
}

// ============================================================================
// 緋月姬 8 招動畫（使用 raid-scythe-icon.png）
// ============================================================================
const CRIMSON_SCYTHE_IMG = 'assets/portraits/raid-scythe-icon.png';

// 連續斬擊弧（roseDance / curseSpiral）：一把鐮從上方斬下 + 花瓣噴撒 + 紅光環擴張
function crimsonAnim_scytheArc(data, id) {
  const stage = _getBattleStage(); if (!stage) return;
  stage.querySelectorAll('.crimson-arc, .crimson-burst-ring').forEach(el => el.remove());
  // 預備：bossCard 紅光震動 + 噴出花瓣
  const card = _getBossCard();
  if (card) {
    card.classList.add('crimson-charging');
    setTimeout(() => card.classList.remove('crimson-charging'), 600);
    // 從 BOSS 卡噴出 12 片花瓣（撒花前奏）
    for (let i = 0; i < 12; i++) {
      const petal = document.createElement('div');
      petal.className = 'crimson-petal-burst';
      const angle = (i * 30) + Math.random() * 15;
      const distance = 120 + Math.random() * 80;
      petal.style.setProperty('--burst-angle', angle + 'deg');
      petal.style.setProperty('--burst-distance', distance + 'px');
      petal.style.animationDelay = (i * 0.03) + 's';
      card.appendChild(petal);
      setTimeout(() => { try { petal.remove(); } catch (e) {} }, 1200);
    }
  }
  // 紅光擴張環（一個從 BOSS 卡噴出的光環）
  const ring = document.createElement('div');
  ring.className = 'crimson-burst-ring' + (id === 'curseSpiral' ? ' p2' : '');
  stage.appendChild(ring);
  setTimeout(() => { try { ring.remove(); } catch (e) {} }, 800);
}

function crimsonAnim_arcHit(data) {
  const stage = _getBattleStage(); if (!stage) return;
  // 主鐮
  const arc = document.createElement('div');
  arc.className = 'crimson-arc';
  arc.innerHTML = `<img src="${CRIMSON_SCYTHE_IMG}" alt="scythe">`;
  const angle = -45 + Math.random() * 90;
  arc.style.setProperty('--arc-angle', angle + 'deg');
  arc.style.left = (15 + Math.random() * 60) + '%';
  stage.appendChild(arc);
  setTimeout(() => { try { arc.remove(); } catch (e) {} }, 700);
  // 軌跡殘影 — 同方向 2 個更小、延遲噴出
  for (let k = 1; k <= 2; k++) {
    const ghost = document.createElement('div');
    ghost.className = 'crimson-arc ghost';
    ghost.innerHTML = `<img src="${CRIMSON_SCYTHE_IMG}" alt="scythe">`;
    ghost.style.setProperty('--arc-angle', (angle + (k * 8)) + 'deg');
    ghost.style.left = (15 + Math.random() * 60) + '%';
    ghost.style.animationDelay = (k * 0.08) + 's';
    stage.appendChild(ghost);
    setTimeout(() => { try { ghost.remove(); } catch (e) {} }, 900);
  }
  // 玩家方紅閃 + 軌跡切痕
  const pcard = _getPlayerCard();
  if (pcard) {
    pcard.classList.remove('crimson-slash-hit');
    void pcard.offsetWidth;
    pcard.classList.add('crimson-slash-hit');
    setTimeout(() => pcard.classList.remove('crimson-slash-hit'), 400);
    // 在玩家卡上加一個紅色斬擊切痕
    const slash = document.createElement('div');
    slash.className = 'crimson-slash-mark';
    slash.style.setProperty('--mark-angle', (-30 + Math.random() * 60) + 'deg');
    pcard.appendChild(slash);
    setTimeout(() => { try { slash.remove(); } catch (e) {} }, 600);
  }
}

// 緋月斬蓄力（crimsonSlash）：BOSS 卡上方浮現巨型鐮，逐漸發紅
function crimsonAnim_chargeSlash(data, label) {
  const card = _getBossCard(); if (!card) return;
  card.querySelectorAll('.crimson-big-scythe').forEach(el => el.remove());
  const scythe = document.createElement('div');
  scythe.className = 'crimson-big-scythe';
  scythe.innerHTML = `<img src="${CRIMSON_SCYTHE_IMG}" alt="scythe"><div class="crimson-charge-label">${label}</div>`;
  scythe.style.setProperty('--charge-dur', (data.duration || 2.5) + 's');
  card.appendChild(scythe);
}

function crimsonAnim_chargeEnd(data) {
  const card = _getBossCard(); if (!card) return;
  const scythe = card.querySelector('.crimson-big-scythe');
  if (scythe) {
    if (data && data.broken) scythe.classList.add('break');
    else scythe.classList.add('strike');
    setTimeout(() => { try { scythe.remove(); } catch (e) {} }, 800);
  }
  if (!data || !data.broken) {
    // 玩家方大紅閃
    flashFullscreen('rgba(220, 20, 50, 0.6)', 700);
    const pcard = _getPlayerCard();
    if (pcard) {
      pcard.classList.remove('crimson-finale-hit');
      void pcard.offsetWidth;
      pcard.classList.add('crimson-finale-hit');
      setTimeout(() => pcard.classList.remove('crimson-finale-hit'), 800);
    }
  }
}

// 千鐮亂舞（scytheFrenzy）：6 把鐮環繞 BOSS 旋轉
function crimsonAnim_scytheOrbit(data) {
  const card = _getBossCard(); if (!card) return;
  card.querySelectorAll('.crimson-orbit').forEach(el => el.remove());
  const orbit = document.createElement('div');
  orbit.className = 'crimson-orbit';
  const count = data.count || 6;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'crimson-orbit-scythe';
    s.style.setProperty('--orbit-angle', (i * (360 / count)) + 'deg');
    s.innerHTML = `<img src="${CRIMSON_SCYTHE_IMG}" alt="scythe">`;
    orbit.appendChild(s);
  }
  card.appendChild(orbit);
}

function crimsonAnim_orbitTick(data) {
  // 每秒玩家方輕微紅閃
  const pcard = _getPlayerCard();
  if (pcard) {
    pcard.classList.remove('crimson-tick-hit');
    void pcard.offsetWidth;
    pcard.classList.add('crimson-tick-hit');
    setTimeout(() => pcard.classList.remove('crimson-tick-hit'), 300);
  }
}

function crimsonAnim_orbitEnd(data) {
  const card = _getBossCard(); if (!card) return;
  card.querySelectorAll('.crimson-orbit').forEach(el => {
    el.classList.add('end');
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 500);
  });
}

// 薔薇結界 / 千年血契：玩家身上浮現五芒星魔法陣（紅光環 + 火焰邊 + 倒數時間軸）
function crimsonAnim_pentagram(data, label, big) {
  const pcard = _getPlayerCard(); if (!pcard) return;
  pcard.querySelectorAll('.crimson-pentagram').forEach(el => el.remove());
  const p = document.createElement('div');
  p.className = 'crimson-pentagram' + (big ? ' big' : '');
  p.style.setProperty('--charge-dur', (data.duration || 4) + 's');
  // SVG 五芒星 + 雙圓 + 內部符文
  p.innerHTML = `
    <div class="crimson-pentagram-aura"></div>
    <svg viewBox="0 0 120 120" class="crimson-pentagram-svg">
      <defs>
        <radialGradient id="penta-glow-${big ? 'big' : 'small'}" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="rgba(255,100,140,0.6)"/>
          <stop offset="100%" stop-color="rgba(120,0,30,0)"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#penta-glow-${big ? 'big' : 'small'})"/>
      <circle cx="60" cy="60" r="55" fill="none" stroke="rgba(255,60,100,0.95)" stroke-width="0.8"/>
      <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(220,40,80,0.7)" stroke-width="0.5" stroke-dasharray="2,3"/>
      <polygon points="60,8 73,46 113,46 80,68 92,108 60,84 28,108 40,68 7,46 47,46"
        fill="none" stroke="rgba(255,80,120,1)" stroke-width="1.6"
        style="filter:drop-shadow(0 0 6px #ff3060)"/>
      <circle cx="60" cy="60" r="36" fill="none" stroke="rgba(220,40,80,0.6)" stroke-width="0.4"/>
      <circle cx="60" cy="60" r="28" fill="none" stroke="rgba(220,40,80,0.4)" stroke-width="0.3"/>
    </svg>
    <div class="crimson-pentagram-ring"></div>
    <div class="crimson-pentagram-label">${label}</div>
    <div class="crimson-pentagram-timer"><div class="crimson-pentagram-timer-bar"></div></div>
  `;
  pcard.appendChild(p);
  // 玩家卡片加 sealed class（被結界封印感）
  pcard.classList.add('crimson-sealed');
}

function crimsonAnim_pentagramEnd(data) {
  const pcard = _getPlayerCard(); if (!pcard) return;
  pcard.classList.remove('crimson-sealed');
  pcard.querySelectorAll('.crimson-pentagram').forEach(el => {
    el.classList.add(data && data.broken ? 'broken' : 'fired');
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 900);
  });
  if (data && !data.broken) {
    flashFullscreen('rgba(220, 20, 50, 0.6)', 800);
    // 爆裂粒子（從玩家身上散開的紅光環）
    const burst = document.createElement('div');
    burst.className = 'crimson-pentagram-burst';
    pcard.appendChild(burst);
    setTimeout(() => { try { burst.remove(); } catch (e) {} }, 900);
  }
}

// 薔薇詛咒雨（curseRain）：花瓣雨佈滿戰場
function crimsonAnim_petalRain(data) {
  const stage = _getBattleStage(); if (!stage) return;
  stage.querySelectorAll('.crimson-rain').forEach(el => el.remove());
  const rain = document.createElement('div');
  rain.className = 'crimson-rain';
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'crimson-rain-petal';
    p.style.left = (Math.random() * 100) + '%';
    p.style.animationDelay = (Math.random() * 2) + 's';
    p.style.animationDuration = (1.8 + Math.random() * 1.2) + 's';
    rain.appendChild(p);
  }
  stage.appendChild(rain);
}

function crimsonAnim_petalRainTick(data) {
  const pcard = _getPlayerCard();
  if (pcard) {
    pcard.classList.remove('crimson-tick-hit');
    void pcard.offsetWidth;
    pcard.classList.add('crimson-tick-hit');
    setTimeout(() => pcard.classList.remove('crimson-tick-hit'), 300);
  }
}

function crimsonAnim_petalRainEnd(data) {
  const stage = _getBattleStage(); if (!stage) return;
  stage.querySelectorAll('.crimson-rain').forEach(el => {
    el.classList.add('end');
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 800);
  });
}

// 緋月終焉（moonFinale）：巨型鐮 + 紅色月亮 + 螢幕震
function crimsonAnim_finale(data) {
  const card = _getBossCard(); if (!card) return;
  card.querySelectorAll('.crimson-big-scythe, .crimson-finale').forEach(el => el.remove());
  const fin = document.createElement('div');
  fin.className = 'crimson-finale';
  fin.style.setProperty('--charge-dur', (data.duration || 5) + 's');
  fin.innerHTML = `
    <div class="crimson-finale-moon"></div>
    <div class="crimson-finale-scythe"><img src="${CRIMSON_SCYTHE_IMG}" alt="scythe"></div>
    <div class="crimson-finale-label">緋月終焉</div>
  `;
  card.appendChild(fin);
  // 螢幕輕震 5 秒（蓄力中持續）
  const app = document.getElementById('app');
  if (app) {
    app.classList.add('screen-shake');
    setTimeout(() => app.classList.remove('screen-shake'), (data.duration || 5) * 1000);
  }
}

function crimsonAnim_finaleEnd(data) {
  const card = _getBossCard(); if (!card) return;
  const fin = card.querySelector('.crimson-finale');
  if (fin) {
    fin.classList.add(data && data.broken ? 'break' : 'strike');
    setTimeout(() => { try { fin.remove(); } catch (e) {} }, 800);
  }
  if (!data || !data.broken) {
    flashFullscreen('rgba(255, 0, 30, 0.75)', 900);
    const pcard = _getPlayerCard();
    if (pcard) {
      pcard.classList.remove('crimson-finale-hit');
      void pcard.offsetWidth;
      pcard.classList.add('crimson-finale-hit');
      setTimeout(() => pcard.classList.remove('crimson-finale-hit'), 1000);
    }
  }
}

// ── 對話氣泡：BOSS 放招前在卡片旁邊吐一句 ──
window.bossSpeak = function(text, durationSec) {
  const card = _getBossCard();
  if (!card) return;
  // 清舊氣泡
  card.querySelectorAll('.boss-speak-bubble').forEach(el => el.remove());
  const bubble = document.createElement('div');
  bubble.className = 'boss-speak-bubble';
  bubble.textContent = text;
  card.appendChild(bubble);
  const ms = Math.max(800, (durationSec || 1.5) * 1000);
  setTimeout(() => bubble.classList.add('fade-out'), ms - 400);
  setTimeout(() => { try { bubble.remove(); } catch (e) {} }, ms);
};

// ── BOSS 死亡動畫進場（鎖血 1、暫停一切）──
// 清掉所有招式殘留 → BOSS 卡進入消散動畫（3 秒）
window.bossDeathStart = function() {
  // 先清掉所有招式視覺（紅紗、分身、鏡牢、對白...）
  if (typeof window.cleanupMirrorAnims === 'function') window.cleanupMirrorAnims();
  // BOSS 卡加 boss-dying class（CSS 控制 3 秒淡出動畫）
  const card = document.querySelector('.enemy-card');
  if (card) {
    card.classList.add('boss-dying');
  }
  // 全螢幕白光閃一下（夢碎瞬間）
  flashFullscreen('rgba(255, 240, 240, 0.4)', 600);
  // 1.5 秒後再閃一次（瓦解）
  setTimeout(() => flashFullscreen('rgba(255, 220, 230, 0.5)', 800), 1400);
};

// ── 血鐮緋月姬爆走變形動畫（HP 鎖在閾值、3 秒、然後套用 Phase 2）──
// 視覺序列：紅光閃 → BOSS 卡狂震 → Phase 2 立繪淡入 → 紅光收尾
window.bossRageStart = function(info) {
  const card = document.querySelector('.enemy-card');
  if (card) {
    card.classList.add('boss-raging');
    // 1.5 秒後切立繪
    if (info && info.pending && info.pending.newPortrait) {
      setTimeout(() => {
        const img = card.querySelector('img');
        if (img) {
          img.style.transition = 'opacity 0.6s ease';
          img.style.opacity = '0';
          setTimeout(() => {
            img.src = info.pending.newPortrait;
            img.style.opacity = '1';
          }, 600);
        }
      }, 1500);
    }
  }
  // 螢幕紅光連續閃 3 次（殺氣噴發）
  flashFullscreen('rgba(255, 30, 70, 0.55)', 500);
  setTimeout(() => flashFullscreen('rgba(255, 50, 90, 0.45)', 600), 900);
  setTimeout(() => flashFullscreen('rgba(255, 80, 120, 0.35)', 700), 1900);
};

window.bossRageEnd = function() {
  const card = document.querySelector('.enemy-card');
  if (card) {
    card.classList.remove('boss-raging');
    // 短暫 power-up flash 標記覺醒完成
    card.classList.add('boss-awakened');
    setTimeout(() => card.classList.remove('boss-awakened'), 1200);
  }
};

// ── 戰鬥結束清除所有 BOSS 招式殘留視覺（class / 浮層 / 元素）──
// 在 stopBattle / onBattleFail / onDungeonClear 後呼叫
window.cleanupMirrorAnims = function() {
  // BOSS 卡 class
  document.querySelectorAll('.enemy-card').forEach(card => {
    card.classList.remove(
      'boss-charging', 'boss-slashing', 'boss-flowermoon',
      'boss-shadowdance', 'boss-awakened', 'boss-awakening-burst',
      'boss-healed', 'mirror-clones-active', 'shield-active',
      'boss-raging', 'crimson-charging'
    );
    // 倒數覆蓋層 + 護盾條 hide
    const cd = card.querySelector('.shield-countdown-overlay');
    if (cd) cd.style.display = 'none';
    const sh = card.querySelector('.enemy-shield');
    if (sh) sh.style.display = 'none';
    // 子元素移除
    card.querySelectorAll('.mirror-clone, .flowermoon-petals, .flowermoon-ripple, .boss-speak-bubble, .crimson-big-scythe, .crimson-orbit, .crimson-finale').forEach(el => el.remove());
  });
  // 玩家卡 class
  document.querySelectorAll('.player-side .fighter-card, .player-card').forEach(card => {
    card.classList.remove('player-ribbon-bound', 'player-caged', 'player-hit-flash', 'boss-slash-hit', 'crimson-slash-hit', 'crimson-tick-hit', 'crimson-finale-hit');
    card.querySelectorAll('.mirror-cage-frame').forEach(el => el.remove());
  });
  // 戰場舞台層級
  const stage = document.getElementById('battleStage');
  if (stage) stage.querySelectorAll('.crimson-arc, .crimson-pentagram, .crimson-rain').forEach(el => el.remove());
  // 全螢幕浮層
  ['ribbonRainLayer', 'bossSlashFlash'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
  document.querySelectorAll('.fullscreen-flash, .ribbon-projectile, .shadowdance-slash, .ribbon-falling').forEach(el => el.remove());
  // 螢幕震屏 class
  const app = document.getElementById('app');
  if (app) app.classList.remove('screen-shake-hard', 'screen-shake');
};

// helper：整螢幕色閃
function flashFullscreen(color, ms) {
  let flash = document.createElement('div');
  flash.className = 'fullscreen-flash';
  flash.style.background = color;
  document.body.appendChild(flash);
  void flash.offsetWidth;
  flash.classList.add('show');
  setTimeout(() => {
    flash.classList.remove('show');
    setTimeout(() => flash.remove(), 400);
  }, ms || 600);
}

// ============================================================================
// 製作藍圖預覽
// ============================================================================
window.showCraftPreview = function(equipId) {
  const def = GAME_DATA.findEquipment(equipId);
  if (!def) return;
  const win = document.getElementById('winCraftPreview');
  const body = document.getElementById('tabCraftPreview');
  if (!win || !body) return;

  const SLOT_NAME = { weapon: '武器', head: '頭部', top: '上身', bottom: '下身', feet: '腳部', ring: '戒指' };
  const STAT_NAME = {
    atk: '攻擊', def: '防禦', hp: '生命', crit: '暴擊率', critDmg: '暴擊傷害',
    spd: '速度', dmgReduce: '減傷', cdReduce: 'CD 縮減', vsBoss: '對王傷害',
    skillDmg: '技能傷害', maxMp: 'MP 上限',
  };
  const isPct = k => ['crit', 'critDmg', 'spd', 'dmgReduce', 'cdReduce', 'vsBoss', 'skillDmg'].includes(k);
  const fmtVal = (k, v) => {
    if (typeof v === 'string') return v;  // forge:0.10+0.008 之類的標籤
    return isPct(k) ? `+${(v * 100).toFixed(0)}%` : `+${v}`;
  };

  // 基礎 stats
  const statLines = Object.entries(def.stats || {}).map(([k, v]) => `
    <div class="cp-stat-row">
      <span class="cp-stat-name">${STAT_NAME[k] || k}</span>
      <span class="cp-stat-val">${fmtVal(k, v)}</span>
    </div>
  `).join('');

  // 固定效果
  let fixedHtml = '';
  if (def.fixed) {
    fixedHtml = `
      <div class="cp-section-title">固定效果（可隨強化提升）</div>
      <div class="cp-fixed">${def.fixed.label}</div>
    `;
  }

  // 強化滿後的最終屬性試算（顯示用，採用 FORGE_MAX）
  const FORGE_MAX = GAME_DATA.FORGE_MAX || 18;
  const fmul = GAME_DATA.forgeMultiplier ? GAME_DATA.forgeMultiplier(FORGE_MAX) : (1 + FORGE_MAX * 0.12);
  const finalStats = {};
  for (const [k, v] of Object.entries(def.stats || {})) {
    finalStats[k] = isPct(k) ? v : v * fmul;
  }
  // 固定效果加成
  if (def.fixed && def.fixed.effect) {
    for (const [k, v] of Object.entries(def.fixed.effect)) {
      let val = v;
      if (typeof v === 'string' && v.startsWith('forge:')) {
        const [base, perLv] = v.slice(6).split('+').map(parseFloat);
        val = base + perLv * FORGE_MAX;
      }
      finalStats[k] = (finalStats[k] || 0) + val;
    }
  }
  const finalLines = Object.entries(finalStats).filter(([k, v]) => v !== 0).map(([k, v]) => {
    const display = isPct(k) ? `+${(v * 100).toFixed(0)}%` : `+${Math.floor(v)}`;
    return `<div class="cp-stat-row">
      <span class="cp-stat-name">${STAT_NAME[k] || k}</span>
      <span class="cp-stat-val" style="color:var(--accent)">${display}</span>
    </div>`;
  }).join('');

  // 套裝資訊
  let setHtml = '';
  if (def.setId) {
    const setDef = GAME_DATA.findSet ? GAME_DATA.findSet(def.setId) : (GAME_DATA.SETS && GAME_DATA.SETS[def.setId]);
    if (setDef) {
      const bonusList = (setDef.bonuses || []).map(b => `
        <div class="cp-set-bonus">
          <span class="cp-set-pieces">${b.pieces} 件</span>
          <span class="cp-set-label">${b.label}</span>
        </div>
      `).join('');
      setHtml = `
        <div class="cp-section-title" style="color:${setDef.color || '#c084ff'}">套裝：${setDef.name}</div>
        <div class="cp-set-tagline">${setDef.tagline || ''}</div>
        <div class="cp-set-bonuses">${bonusList}</div>
      `;
    }
  }

  body.innerHTML = `
    <div class="craft-preview">
      <div class="cp-header">
        <div class="cp-name bag-item ${def.rarity}" style="padding:4px 10px">${def.name}</div>
        <div class="cp-meta">
          <span class="cp-rarity ${def.rarity}">${def.rarity}</span>
          <span class="cp-slot">${SLOT_NAME[def.slot] || def.slot}</span>
          <span class="cp-tier">階 ${def.tier ?? '-'}</span>
        </div>
      </div>
      <div class="cp-section-title">基礎屬性（+0）</div>
      <div class="cp-stats">${statLines || '<div style="color:var(--muted);font-size:11px">— 無基礎屬性 —</div>'}</div>
      ${fixedHtml}
      <div class="cp-section-title">強化滿（+${FORGE_MAX}）試算屬性</div>
      <div class="cp-stats">${finalLines}</div>
      ${setHtml}
      <div class="cp-hint">＊ 詞綴（隨機）製作完成後會額外滾出，視窗只顯示固定值</div>
    </div>
  `;

  // 顯示視窗
  win.classList.remove('hidden');
  win.style.display = 'flex';
  win.style.visibility = 'visible';
  win.style.opacity = '1';
  win.style.zIndex = '9999';
  // 智能定位：放在 winCraft 右側
  const craftWin = document.getElementById('winCraft');
  if (craftWin && !craftWin.classList.contains('hidden')) {
    const r = craftWin.getBoundingClientRect();
    const vw = window.innerWidth || 1280;
    const desiredLeft = r.right + 12;
    const winW = 420;
    if (desiredLeft + winW < vw - 10) {
      win.style.left = desiredLeft + 'px';
      win.style.top = r.top + 'px';
    } else {
      // 右側放不下，放畫面右側
      win.style.left = Math.max(10, vw - winW - 20) + 'px';
      win.style.top = '80px';
    }
  }
  bringWindowToFront(win);
  win.classList.add('flash-open');
  setTimeout(() => win.classList.remove('flash-open'), 400);
};

window.openEquipDetail = function(instId) {
  renderEquipDetail(instId);
  const win = document.getElementById('winEquip');
  if (!win) return;
  win.classList.remove('hidden');
  // 智能定位：避開其他開著的浮窗，貼到右側或畫面中央偏右
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 800;
  // 嘗試找出當前最右側的浮窗，把詳細視窗放在它右邊
  let rightmost = 0;
  document.querySelectorAll('.float-panel:not(.hidden)').forEach(p => {
    if (p === win) return;
    const r = p.getBoundingClientRect();
    if (r.right > rightmost) rightmost = r.right;
  });
  const winW = 380;
  let left = Math.max(rightmost + 16, vw - winW - 40);
  if (left + winW > vw - 10) left = Math.max(20, vw - winW - 20);
  win.style.left = left + 'px';
  win.style.top = '120px';
  win.style.width = winW + 'px';
  bringWindowToFront(win);
};

function renderHud() {
  const st = GAME_STATE.state;
  const cs = st.characters[st.activeCharId];
  document.querySelector('#resGold b').textContent = st.gold.toLocaleString();
  document.querySelector('#resShard b').textContent = st.shard.toLocaleString();
  if (cs) {
    document.querySelector('#resCharLv b').textContent = cs.graduated ? 'Max' : cs.level;
    if (cs.graduated) {
      const need = GAME_STATE.resonanceExpFor(st.resonance);
      document.querySelector('#resCharExp b').textContent = `${st.resonanceExp.toLocaleString()} / ${need.toLocaleString()}`;
    } else {
      const need = GAME_DATA.expForLevel(cs.level);
      document.querySelector('#resCharExp b').textContent = `${cs.exp.toLocaleString()} / ${need.toLocaleString()}`;
    }
    document.querySelector('#resCP b').textContent = GAME_STATE.combatPower(st.activeCharId).toLocaleString();
  }
  // 共鳴顯示
  const resRow = document.getElementById('resResonance');
  if (st.resonanceUnlocked) {
    resRow.style.display = '';
    const unspent = GAME_STATE.getResonanceUnspent();
    resRow.querySelector('b').textContent = `R${st.resonance}${unspent > 0 ? ` (+${unspent})` : ''}`;
    document.getElementById('btnOpenResonance').style.display = '';
  } else {
    resRow.style.display = 'none';
  }
  // 鍛造按鈕：畢業 + 持有任一終焉套或鎚子才顯示
  const smithBtn = document.getElementById('btnOpenSmith');
  if (smithBtn) {
    const cs = GAME_STATE.state.characters[st.activeCharId];
    const bag = cs && cs.bag;
    const hasRuin = bag && bag.equipment && Object.values(bag.equipment).some(inst => {
      const def = GAME_DATA.findEquipment(inst.itemId);
      return def && GAME_DATA.isSmithEligible(def);
    });
    const hasHammer = bag && bag.materials && (bag.materials['異界之鎚'] || 0) > 0;
    smithBtn.style.display = (hasRuin || hasHammer) ? '' : 'none';
  }
}

let _lastPortraitKey = null;
let _lastEnemyName = null;

function renderHudBars() {
  const st = GAME_STATE.state;
  const cs = st.characters[st.activeCharId];

  // ===== 玩家卡 =====
  if (cs) {
    const tierKey = cs.jobPath && cs.jobTier > 0 ? `${cs.jobPath}${cs.jobTier}` : 'base';
    const key = `${cs.id}-${tierKey}`;
    const root = document.getElementById('playerPortrait');
    if (root && (_lastPortraitKey !== key || !root.children.length)) {
      root.innerHTML = CHAR_PORTRAIT(cs.id);
      _lastPortraitKey = key;
    }
    document.getElementById('playerName').textContent = cs.customName;
    const bp = GAME_STATE.getCharacterBlueprint(cs.blueprintId || cs.id);
    let jobText = '一階弟子';
    if (cs.jobPath) {
      const p = bp.paths[cs.jobPath];
      if (cs.jobTier === 1) jobText = p.name;
      else if (cs.jobTier === 2) jobText = p.tier2.name;
      else if (cs.jobTier === 3) jobText = p.tier3.name;
    }
    document.getElementById('playerSub').textContent = `Lv ${cs.graduated ? 'Max' : cs.level} · ${jobText}`;
  }

  if (BATTLE.player) {
    const p = BATTLE.player;
    // 陣亡狀態（組隊用）
    const pc = document.getElementById('playerCard');
    if (pc) pc.classList.toggle('dead', !!BATTLE._dead);
    document.getElementById('playerHpText').textContent = BATTLE._dead
      ? '陣亡 · 等待隊友'
      : `${Math.max(0, Math.floor(p.hp))} / ${p.maxHp}`;
    document.getElementById('playerHpBar').style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    const mpBar = document.getElementById('playerMpBar');
    const mpText = document.getElementById('playerMpText');
    if (mpBar && mpText) {
      mpText.textContent = `${Math.max(0, Math.floor(p.mp || 0))} / ${p.maxMp || 100}`;
      mpBar.style.width = `${Math.max(0, ((p.mp || 0) / (p.maxMp || 100)) * 100)}%`;
    }
  } else if (cs) {
    const stats = GAME_STATE.effectiveStats(cs.id);
    document.getElementById('playerHpText').textContent = `${stats.hp} / ${stats.hp}`;
    document.getElementById('playerHpBar').style.width = '100%';
    const mpBar = document.getElementById('playerMpBar');
    const mpText = document.getElementById('playerMpText');
    if (mpBar && mpText) { mpText.textContent = `${stats.maxMp} / ${stats.maxMp}`; mpBar.style.width = '100%'; }
  } else {
    document.getElementById('playerHpText').textContent = '— / —';
    document.getElementById('playerHpBar').style.width = '0%';
    const mpBar = document.getElementById('playerMpBar');
    const mpText = document.getElementById('playerMpText');
    if (mpBar && mpText) { mpText.textContent = '— / —'; mpBar.style.width = '0%'; }
  }

  // 藥水欄
  renderPotionSlotBar();
  // Buff 顯示
  renderActiveBuffs();

  // ===== 怪物卡（多隻支援） =====
  renderEnemyCards();

  // ===== 副本標題 =====
  if (BATTLE.dungeonId) {
    const d = GAME_DATA.getDungeon(BATTLE.dungeonId);
    const r = GAME_DATA.getRegionByDungeon(BATTLE.dungeonId);
    let title = d.name;
    let tierLine = `${r.name} · CP ${d.cp}`;
    // 多人模式標籤
    if (BATTLE._mpMode === 'host' || BATTLE._mpMode === 'guest') {
      const allies = window.MP_API ? Object.values(MP_API.getPlayers()).map(p => p.nickname || '無名').join('、') : '';
      tierLine = `⛺ 組隊中（${allies}）· BOSS HP 共享 · ` + tierLine;
    } else if (window.MP_API && MP_API.isConnected() && !d.isRaid) {
      tierLine = `🔸 連線中（單機副本，無同步）· ` + tierLine;
    }
    document.getElementById('dungeonName').textContent = title;
    document.getElementById('dungeonTier').textContent = tierLine;
  } else {
    document.getElementById('dungeonName').textContent = '尚未出征';
    document.getElementById('dungeonTier').textContent = '';
  }
}

// 觸發卡片動畫
window.battleAnim = function(target, kind) {
  const id = target === 'player' ? 'playerCard' : 'enemyCard';
  const card = document.getElementById(id);
  if (!card) return;
  const frame = card.querySelector('.card-frame');
  if (!frame) return;
  frame.classList.remove('attacking', 'hit', 'crit-flash');
  void frame.offsetWidth;  // restart animation
  frame.classList.add(kind);
  setTimeout(() => frame.classList.remove(kind), 600);
};

// 浮動傷害數字
window.floatDamage = function(text, kind) {
  const root = document.getElementById('floatingFx');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'float-dmg' + (kind ? ' ' + kind : '');
  el.textContent = text;
  el.style.left = (40 + Math.random() * 20) + '%';
  root.appendChild(el);
  setTimeout(() => el.remove(), 1000);
};

let _lastWaveSig = '';
function renderEnemyCards() {
  const root = document.getElementById('enemyCardsContainer');
  if (!root) return;
  const wave = BATTLE.currentWave || [];
  // 簽名以判斷是否需要重建 DOM
  const sig = wave.map(e => e.name + '|' + e.maxHp).join('::') + '#' + (BATTLE.currentWaveIdx || 0);
  if (sig !== _lastWaveSig) {
    _lastWaveSig = sig;
    root.className = 'enemy-side cnt-' + Math.max(1, Math.min(3, wave.length || 1));
    root.innerHTML = '';
    if (wave.length === 0) {
      root.innerHTML = `
        <div class="fighter-card enemy-card">
          <div class="card-frame"><div class="portrait"></div></div>
          <div class="card-name">${BATTLE.running ? '進場中…' : '—'}</div>
          <div class="card-sub"></div>
          <div class="card-hp enemy-hp"><div class="hp-fill" style="width:0%"></div><span class="hp-text">— / —</span></div>
        </div>`;
      return;
    }
    wave.forEach((e, i) => {
      const card = document.createElement('div');
      const useBigCard = BATTLE._endlessMode || e.portrait;  // 多階 BOSS 也用大卡
      const isTall = !!e.portraitTall;  // 直幅立繪用 3:4 卡片
      card.className = 'fighter-card enemy-card'
        + (useBigCard ? ' endless-boss-card' : '')
        + (isTall ? ' tall-portrait' : '')
        + (e.bossSkillTag === 'crimson' ? ' crimson-idle' : '');
      card.dataset.idx = i;
      // 立繪優先順序：BOSS 個別 portrait > 無盡塔 dungeon.bossPortrait > 像素 portrait
      const dungeon = GAME_DATA.getDungeon(BATTLE.dungeonId);
      let portraitHtml = '';
      // 直幅圖：cover + 靠上，把臉留在可見區，下襬裁切
      // 橫幅圖：contain，完整顯示
      const fitStyle = isTall
        ? 'object-fit:cover;object-position:center 18%'
        : 'object-fit:contain';
      if (e.portrait) {
        portraitHtml = `<img src="${e.portrait}" alt="${e.name}" style="width:100%;height:100%;${fitStyle}">`;
      } else if (BATTLE._endlessMode && dungeon && dungeon.bossPortrait) {
        portraitHtml = `<img src="${dungeon.bossPortrait}" alt="${e.name}" style="width:100%;height:100%;object-fit:contain">`;
      }
      // 護盾條 + 大字倒數覆蓋層 — 對所有 BOSS 都建好（display 控制），避免後續護盾啟動時 sig 沒變沒重建
      const shieldHtml = e.isBoss
        ? `<div class="enemy-shield" style="margin-top:4px;border-radius:5px;overflow:hidden;display:none">
             <div class="shield-fill" style="height:100%;width:0%"></div>
           </div>`
        : '';
      // 護盾倒數覆蓋（對所有 BOSS 都建好，display 控制）
      const countdownHtml = e.isBoss
        ? `<div class="shield-countdown-overlay" style="display:none">0</div>`
        : '';
      card.innerHTML = `
        <div class="card-frame">
          <div class="portrait">${portraitHtml}${countdownHtml}</div>
          <div class="enemy-debuffs"></div>
        </div>
        <div class="card-name">${e.name}</div>
        <div class="card-sub">${e.isBoss ? 'BOSS' : `波 ${(BATTLE.currentWaveIdx||0)+1} / ${BATTLE.waves.length}`}</div>
        <div class="card-hp enemy-hp">
          <div class="hp-fill"></div>
          <span class="hp-text"></span>
        </div>
        ${shieldHtml}
      `;
      root.appendChild(card);
      // 沒立繪的加像素 portrait
      if (!portraitHtml) {
        const portrait = card.querySelector('.portrait');
        if (portrait && typeof renderEnemyPortrait === 'function') {
          const cv = renderEnemyPortrait(e.name, 140);
          portrait.appendChild(cv);
        }
      }
    });
  }
  // 每幀只更新 HP bar 與目標標示
  const cards = root.querySelectorAll('.enemy-card');
  const isFrozen = BATTLE.freezes > 0;
  const hasDot = (BATTLE.dots || []).some(d => d.dur > 0);
  wave.forEach((e, i) => {
    const card = cards[i];
    if (!card) return;
    const fill = card.querySelector('.hp-fill');
    const txt = card.querySelector('.hp-text');
    if (BATTLE._endlessMode) {
      // 無盡塔：HP 條改為「下個階梯進度」+ 文字顯示累積傷害 / 倒數
      const cur = BATTLE._endlessTeamDmg || 0;
      const tiers = BATTLE._endlessTiers || [];
      const reached = BATTLE._endlessReached;
      const next = tiers[reached + 1];
      const prev = reached >= 0 ? tiers[reached].dmg : 0;
      const target = next ? next.dmg : (tiers[tiers.length-1]?.dmg || 1);
      const pct = next ? Math.min(100, ((cur - prev) / (target - prev)) * 100) : 100;
      if (fill) fill.style.width = pct + '%';
      if (txt) {
        const fmt = (n) => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : (n/1e3).toFixed(0)+'K';
        const tierLabel = reached >= 0 ? tiers[reached].label : '—';
        const timeLeft = (BATTLE._endlessTimeLeft || 0).toFixed(1);
        txt.textContent = `${fmt(cur)} | ★${tierLabel} | ⏱${timeLeft}s${next ? ` → ${next.label} ${fmt(target)}` : ' (MAX)'}`;
      }
    } else {
      if (fill) fill.style.width = Math.max(0, (e.hp / e.maxHp) * 100) + '%';
      if (txt) txt.textContent = `${Math.max(0, Math.floor(e.hp))} / ${e.maxHp}`;
    }
    // 護盾條 + 大字倒數覆蓋（取代文字版）
    const shieldEl = card.querySelector('.enemy-shield');
    const countdownEl = card.querySelector('.shield-countdown-overlay');
    if (e.shield > 0) {
      card.classList.add('shield-active');
      if (shieldEl) {
        shieldEl.style.display = 'block';
        const shFill = shieldEl.querySelector('.shield-fill');
        if (shFill) shFill.style.width = ((e.shield / e.shieldMax) * 100) + '%';
      }
      if (countdownEl) {
        // 緋月姬 Phase 2 不顯示倒數大字（避免破壞視覺）
        if (e.bossSkillTag === 'crimson') {
          countdownEl.style.display = 'none';
        } else {
          countdownEl.style.display = 'flex';
          countdownEl.textContent = Math.max(0, e.shieldBreakTimer).toFixed(1);
        }
      }
    } else {
      card.classList.remove('shield-active');
      if (shieldEl) shieldEl.style.display = 'none';
      if (countdownEl) countdownEl.style.display = 'none';
    }
    card.classList.toggle('active-target', e === BATTLE.enemy);
    // 開場拔刀斬：BOSS 蓄力姿態 CSS class
    card.classList.toggle('boss-charging', e.openingState === 'active');
    // Debuff badges
    const debuffEl = card.querySelector('.enemy-debuffs');
    if (debuffEl) {
      const badges = [];
      if (isFrozen && e === BATTLE.enemy) badges.push(`<span class="debuff-badge debuff-freeze" title="冰封">❄ ${BATTLE.freezes.toFixed(1)}s</span>`);
      if (hasDot && e === BATTLE.enemy) badges.push(`<span class="debuff-badge debuff-dot" title="持續傷害">🔥</span>`);
      debuffEl.innerHTML = badges.join('');
    }
    card.classList.toggle('is-frozen', isFrozen && e === BATTLE.enemy);
  });
}

function renderSpeedReadout() {
  document.getElementById('autoRunReadout').textContent = `自動再戰：${GAME_STATE.state.autoRun ? '開' : '關'}`;
}

function renderBattleLog() {
  const root = document.getElementById('battleLog');
  root.innerHTML = BATTLE.log.slice(-20).map(l => `<div class="${l.klass || ''}">${l.html}</div>`).join('');
  root.scrollTop = root.scrollHeight;
}

// 戰鬥技能列：5 槽，依裝備技能即時顯示 CD
let _lastSkillBarKey = '';
function renderSkillBar() {
  const root = document.getElementById('battleSkillBar');
  if (!root) return;
  const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
  if (!cs) { root.innerHTML = ''; return; }
  const eq = cs.equippedSkills || [null, null, null, null, null];
  const key = eq.join('|');

  if (key !== _lastSkillBarKey) {
    _lastSkillBarKey = key;
    root.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const sid = eq[i];
      const btn = document.createElement('div');
      btn.className = 'skill-btn' + (sid ? '' : ' empty');
      btn.dataset.slot = i;
      if (sid) {
        const sk = GAME_DATA.SKILLS[sid];
        const tierClass = sk.costTier ? `mp-tier-${sk.costTier}` : '';
        btn.innerHTML = `
          <div class="sb-name">${sk.name}</div>
          <div class="sb-tag">${sk.tag}</div>
          <div class="sb-mp ${tierClass}">MP ${sk.mpCost || 0}</div>
          <div class="sb-cd"></div>
          <div class="sb-cd-overlay"></div>
        `;
        btn.dataset.sid = sid;
      } else {
        btn.innerHTML = `<div class="sb-name" style="color:var(--muted);font-size:11px">空槽 ${i+1}</div>`;
      }
      root.appendChild(btn);
    }
  }

  // 更新每個按鈕的 CD overlay
  const btns = root.querySelectorAll('.skill-btn');
  btns.forEach(btn => {
    const sid = btn.dataset.sid;
    if (!sid) return;
    const sk = GAME_DATA.SKILLS[sid];
    if (!sk) return;
    const cdLeft = (BATTLE.skillCDs && BATTLE.skillCDs[sid]) || 0;
    const overlay = btn.querySelector('.sb-cd-overlay');
    const cdText = btn.querySelector('.sb-cd');
    if (cdLeft > 0) {
      overlay.style.width = `${Math.min(100, cdLeft / sk.cd * 100)}%`;
      cdText.textContent = cdLeft.toFixed(1) + 's';
    } else {
      overlay.style.width = '0%';
      cdText.textContent = '就緒';
      cdText.style.color = 'var(--hp-self)';
    }
  });
}

// 把視窗拉到最前
let _winZ = 100;
function bringWindowToFront(win) {
  _winZ += 1;
  win.style.zIndex = _winZ;
}

// 觸發單個技能按鈕閃光
window.flashSkillButton = function(sid) {
  const btn = document.querySelector(`#battleSkillBar .skill-btn[data-sid="${sid}"]`);
  if (!btn) return;
  btn.classList.remove('casting');
  void btn.offsetWidth;
  btn.classList.add('casting');
  setTimeout(() => btn.classList.remove('casting'), 500);
};

// ============================================================================
// 副本列表
// ============================================================================
let _dungeonTab = 'main';  // 'main' / 'special' / 'raid' / 'endless'
function renderDungeonList() {
  const root = document.getElementById('tabDungeon');
  root.innerHTML = '';
  const activeId = GAME_STATE.state.activeCharId;
  const cs = GAME_STATE.state.characters[activeId];

  // 分頁
  const tabs = document.createElement('div');
  tabs.className = 'craft-tabs';
  tabs.innerHTML = `
    <button class="${_dungeonTab === 'main' ? 'active' : ''}" data-dtab="main">🗺 主線</button>
    <button class="${_dungeonTab === 'special' ? 'active' : ''}" data-dtab="special">⭐ 特殊副本</button>
    <button class="${_dungeonTab === 'raid' ? 'active' : ''}" data-dtab="raid">⚔ 襲擊戰</button>
    <button class="${_dungeonTab === 'endless' ? 'active' : ''}" data-dtab="endless">✦ 無盡塔</button>
  `;
  root.appendChild(tabs);
  tabs.querySelectorAll('button[data-dtab]').forEach(b => {
    b.onclick = () => { _dungeonTab = b.dataset.dtab; renderDungeonList(); };
  });

  // 依分頁過濾 regions
  const filteredRegions = GAME_DATA.REGIONS.filter(r => {
    if (_dungeonTab === 'main') return !r.isSpecial && !r.isRaid && !r.isEndless;
    if (_dungeonTab === 'special') return r.isSpecial;
    if (_dungeonTab === 'raid') return r.isRaid;
    if (_dungeonTab === 'endless') return r.isEndless;
    return true;
  });
  if (filteredRegions.length === 0) {
    root.innerHTML += '<div style="color:var(--muted);font-size:12px;text-align:center;padding:30px">尚無此類副本</div>';
    return;
  }
  for (const r of filteredRegions) {
    const block = document.createElement('div');
    block.className = 'region-block';
    const titleTag = r.isSpecial ? ' <span style="color:var(--shard);font-size:10px">[特殊]</span>'
                   : r.isRaid ? ' <span style="color:var(--hp-enemy);font-size:10px">[襲擊]</span>' : '';
    block.innerHTML = `<div class="region-title">${r.name}${titleTag} · <span style="color:var(--muted);font-size:11px">${r.tagline}</span></div>`;
    for (const d of r.dungeons) {
      const row = document.createElement('div');
      const unlocked = GAME_STATE.isDungeonUnlocked(d.id);
      const lvOk = !d.requiredLv || (cs && cs.level >= d.requiredLv);
      const cp = GAME_STATE.combatPower(activeId);
      let klass = 'dungeon-row';
      if (!unlocked || !lvOk) klass += ' locked';
      if (BATTLE.dungeonId === d.id) klass += ' active';
      let cpClass = 'dungeon-cp';
      // cpHidden BOSS 不對外公開戰力比較，列表顯示中性
      if (!d.cpHidden) {
        if (cp < d.cp * 0.7) cpClass += ' high';
        else if (cp > d.cp * 2) cpClass += ' easy';
      }
      row.className = klass;
      // 特殊類型標籤
      let typeTag = '';
      if (d.special === 'exp') typeTag = '<span style="color:var(--exp);font-size:10px;margin-left:4px">經驗</span>';
      else if (d.special === 'mat') typeTag = '<span style="color:var(--shard);font-size:10px;margin-left:4px">材料</span>';
      else if (d.special === 'forge') typeTag = '<span style="color:var(--gold);font-size:10px;margin-left:4px">強化</span>';
      else if (d.isRaid) typeTag = '<span style="color:var(--hp-enemy);font-size:10px;margin-left:4px">RAID</span>';
      else if (d.isEndless) {
        const passId = d.passId || 'pass-endless';
        const passCount = (cs && cs.bag && cs.bag.passes && cs.bag.passes[passId]) || 0;
        const passIcon = GAME_DATA.findPass(passId)?.icon || '✦';
        typeTag = `<span style="color:var(--accent);font-size:10px;margin-left:4px">${passIcon} 通行證 ×${passCount}</span>`;
      }
      // Lv 99 顯示「需畢業」，其他顯示「需 LvN」
      const lvTag = d.requiredLv
        ? `<span style="font-size:10px;color:${lvOk ? 'var(--muted)' : 'var(--hp-enemy)'};margin-left:4px">${d.requiredLv >= 99 ? '需畢業' : `需 Lv${d.requiredLv}`}</span>`
        : '';
      row.innerHTML = `
        <div class="dungeon-name">${d.name}${typeTag}${lvTag}${_activeClearedDungeons()[d.id] ? ' <span style="color:var(--hp-self);font-size:10px">已通</span>' : ''}</div>
        <div class="${cpClass}">CP ${d.cpHidden ? '???' : d.cp}</div>
      `;
      if (unlocked) {
        row.onclick = () => {
          GAME_STATE.state.selectedDungeonId = d.id;
          // 襲擊戰 / 無盡塔不直接開打 → 跳預覽視窗
          if (d.isRaid || d.isEndless) {
            showRaidPreview(d.id);
            return;
          }
          // 特殊副本（修行/材料/神祠）：host 開戰時廣播給隊友自動跟上
          if (d.special && window.MP_API && MP_API.isHost() && MP_API.isConnected()) {
            MP_API.broadcastRaidLaunch(d.id);
            const teamSize = Object.keys(MP_API.getPlayers()).length + 1;
            toast(`房主開特殊副本 — ${teamSize} 人團：${d.name}`, 'gold');
          }
          PIXEL.setScene({ regionId: r.id });
          const ok = startBattle(d.id, activeId);
          if (ok && !(d.special && window.MP_API && MP_API.isHost())) toast(`出征 ${d.name}`);
          renderDungeonList();
        };
      }
      block.appendChild(row);
    }
    root.appendChild(block);
  }
}

// ============================================================================
// 強化
// ============================================================================
// ============================================================================
// 魔力賦予系統 UI
// ============================================================================
function renderImbue() {
  const root = document.getElementById('tabImbue');
  if (!root) return;
  const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
  if (!cs || !cs.equip) { root.innerHTML = '<div style="color:var(--muted)">無角色</div>'; return; }

  // 找穿戴中的武器
  const weaponInstId = cs.equip.weapon;
  if (!weaponInstId) { root.innerHTML = '<div style="color:var(--muted);padding:12px">未裝備武器</div>'; return; }
  const inst = _activeBag().equipment[weaponInstId];
  if (!inst) { root.innerHTML = '<div style="color:var(--muted);padding:12px">武器資料異常</div>'; return; }
  const def = GAME_DATA.findEquipment(inst.itemId);
  if (!def) { root.innerHTML = '<div style="color:var(--muted);padding:12px">武器資料異常</div>'; return; }

  // 初始化 imbue 結構
  if (!inst.imbue) inst.imbue = { red: [], blue: [], yellow: [], mega: [] };

  const stones = (_activeBag().magicStones || {});
  const gold = GAME_STATE.state.gold || 0;

  const COLORS = [
    { id: 'red',    stoneId: 'mstone-red',    bg: '#3a1818', glow: '#ff5e5e' },
    { id: 'blue',   stoneId: 'mstone-blue',   bg: '#181a3a', glow: '#5e9eff' },
    { id: 'yellow', stoneId: 'mstone-yellow', bg: '#3a3018', glow: '#ffd05e' },
    { id: 'mega',   stoneId: 'mstone-mega',   bg: '#2a1a3a', glow: '#c084ff' },
  ];

  // 累計總賦予效果
  const totalEffect = GAME_STATE.getImbueTotal(inst);
  const statName = {
    atk: '攻擊力 %', skillDmg: '技能傷害 %', critDmg: '暴擊傷害 %',
    vsBoss: '對 BOSS %', crit: '暴擊率 %', dmgReduce: '減傷 %',
    def: '防禦 %', hp: '生命 %',
    spd: '速度 %', cdReduce: 'CD 減 %', defPierce: '無視防禦 %',
    maxMp: 'MP 上限 %',
  };
  const totalLines = Object.entries(totalEffect)
    .map(([k, v]) => `<span style="color:#ffd66e">${statName[k] || k}</span> <b>+${(v * 100).toFixed(1)}%</b>`)
    .join('　');

  let html = `
    <div style="background:linear-gradient(180deg,rgba(160,108,213,0.12),var(--bg3));padding:10px 12px;border-radius:6px;border-left:3px solid var(--accent);margin-bottom:12px">
      <div style="color:var(--accent);font-weight:600;margin-bottom:4px">⚛ 魔力賦予系統</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.6">
        為武器鑲嵌魔力石、賦予 % 屬性加成。每件武器 紅 / 藍 / 黃 各 10 槽、巨型 3 槽。<br>
        每顆石頭只 roll <b>1 條屬性</b>、上限 5%、屬性<b>完全隨機</b>。<br>
        屬性池 12 種（涵蓋面板所有屬性）：攻擊 / 暴擊 / 暴傷 / 防禦 / 生命 / 減傷 /<br>
        速度 / CD 減 / 對 BOSS / 技能傷害 / 無視防禦 / MP 上限。<br>
        三色機率一致（每種 1/12 ≈ 8.3%） — 想堆出滿配武器要刷<b>大量</b>石頭。<br>
        巨型 3 槽：<span style="color:#888">🔒 目前無法獲得，之後新副本會開放。</span><br>
        魔力石從<b>魔力試煉境</b>掉落（1 場 1 顆、顏色隨機）— 副本入口在「副本 → 神窟區」。
      </div>
    </div>
    <div class="imbue-weapon" style="background:var(--bg2);padding:10px 12px;border-radius:6px;border:1px solid var(--line);margin-bottom:10px">
      <div style="font-size:13px;color:var(--muted)">當前武器</div>
      <div style="font-size:16px;font-weight:600">
        <span class="bag-item ${def.rarity}" style="display:inline-block;padding:1px 8px;border-width:1px">${def.name}${(inst.forge||0) ? ' +' + inst.forge : ''}</span>
      </div>
      ${totalLines ? `<div style="margin-top:6px;font-size:12px">${totalLines}</div>` : ''}
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px">金幣：<b style="color:var(--gold)">${gold.toLocaleString()}</b></div>
  `;

  for (const c of COLORS) {
    const stoneDef = GAME_DATA.findMagicStone(c.stoneId);
    if (!stoneDef) continue;
    const slots = inst.imbue[c.id] || [];
    const cap = GAME_DATA.IMBUE_SLOT_CAPS[c.id];
    const stoneQty = stones[c.stoneId] || 0;
    const cost = GAME_DATA.IMBUE_COSTS[c.id];
    const canImbue = stoneQty > 0 && gold >= cost && slots.length < cap;

    // 渲染每個槽位
    const slotHtml = [];
    for (let i = 0; i < cap; i++) {
      const slot = slots[i];
      if (slot) {
        const effStr = Object.entries(slot.effect).map(([k, v]) => `<span style="color:#7ee8a8">${statName[k] || k}+${(v * 100).toFixed(1)}%</span>`).join('<br>');
        slotHtml.push(`<div class="imbue-slot filled" data-color="${c.id}" data-idx="${i}" style="background:${c.bg};border:1px solid ${c.glow};border-radius:5px;padding:6px;font-size:10px;min-height:48px;position:relative;cursor:pointer" title="點擊拆除（消耗 ${GAME_DATA.IMBUE_COSTS.remove.toLocaleString()} 金幣）">
          <div style="position:absolute;top:1px;right:3px;font-size:8px;color:#888">#${i+1}</div>
          ${effStr}
        </div>`);
      } else {
        slotHtml.push(`<div class="imbue-slot empty" style="background:rgba(255,255,255,0.03);border:1px dashed var(--line);border-radius:5px;padding:6px;font-size:10px;min-height:48px;color:#444;display:flex;align-items:center;justify-content:center">空</div>`);
      }
    }
    const gridCols = c.id === 'mega' ? 3 : 5;

    const isLocked = stoneDef.notObtainable;
    html += `
      <div class="imbue-section" style="margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:6px;border-left:3px solid ${c.glow};${isLocked ? 'opacity:0.7' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div>
            <span style="font-size:14px">${stoneDef.icon} <b>${stoneDef.name}</b></span>
            <span style="font-size:11px;color:var(--muted);margin-left:8px">${stoneDef.label}</span>
            ${isLocked ? '<span style="font-size:10px;color:#999;margin-left:8px;background:#333;padding:1px 6px;border-radius:3px">🔒 未開放</span>' : ''}
          </div>
          <div style="font-size:11px;color:var(--muted)">
            槽位 <b>${slots.length}/${cap}</b>　|　庫存 <b style="color:${c.glow}">${stoneQty}</b>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(${gridCols},1fr);gap:4px;margin-bottom:8px">${slotHtml.join('')}</div>
        <button class="primary small" data-imbue-color="${c.id}" ${canImbue ? '' : 'disabled'}
                title="${isLocked ? '巨型魔力石尚未開放取得管道' : slots.length >= cap ? '槽位已滿' : stoneQty < 1 ? '石頭庫存不足' : gold < cost ? '金幣不足' : ''}">
          ⚛ 賦予一顆（${cost.toLocaleString()} 金幣）
        </button>
      </div>
    `;
  }

  root.innerHTML = html;

  // 綁定賦予按鈕
  root.querySelectorAll('button[data-imbue-color]').forEach(btn => {
    btn.onclick = () => {
      const color = btn.dataset.imbueColor;
      const stoneId = 'mstone-' + color;
      const r = GAME_STATE.imbueMagicStone(weaponInstId, stoneId);
      if (!r.ok) { toast(r.reason, 'error'); return; }
      const effStr = Object.entries(r.effect).map(([k, v]) => `${statName[k] || k} +${(v * 100).toFixed(1)}%`).join('、');
      toast(`✦ ${color} 賦予成功：${effStr}`, 'gold');
      renderImbue(); renderHud(); renderCharDetail();
    };
  });
  // 綁定拆除（點擊已填的槽位）
  root.querySelectorAll('.imbue-slot.filled').forEach(slot => {
    slot.onclick = () => {
      const color = slot.dataset.color;
      const idx = parseInt(slot.dataset.idx, 10);
      if (!confirm(`拆除這個賦予槽？\n石頭直接銷毀（不返還），扣 ${GAME_DATA.IMBUE_COSTS.remove.toLocaleString()} 金幣。`)) return;
      const r = GAME_STATE.removeImbueSlot(weaponInstId, color, idx);
      if (!r.ok) { toast(r.reason, 'error'); return; }
      toast(`已拆除 — 石頭銷毀`, 'gold');
      renderImbue(); renderHud(); renderCharDetail();
    };
  });
}

// ============================================================
// 🏆 戰力排行榜
// ============================================================
let _lbLastFetch = 0;
async function renderLeaderboard() {
  const root = document.getElementById('tabLeaderboard');
  if (!root) return;
  root.innerHTML = `
    <div style="padding:10px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="color:var(--muted);font-size:12px">戰力即時排行 — 每次開啟自動同步當前角色</div>
        <button id="btnLbRefresh" class="ghost small">🔄 重整</button>
      </div>
      <div id="lbStatus" style="color:var(--muted);font-size:11px;margin-bottom:8px">載入中…</div>
      <div id="lbTable"></div>
    </div>
  `;
  root.querySelector('#btnLbRefresh').onclick = () => loadLeaderboard();
  loadLeaderboard();
}

async function loadLeaderboard() {
  const statusEl = document.getElementById('lbStatus');
  const tableEl = document.getElementById('lbTable');
  if (!statusEl || !tableEl) return;
  statusEl.textContent = '同步中…';
  tableEl.innerHTML = '';

  if (!window.API || !window.API_ENABLED) {
    statusEl.innerHTML = '<span style="color:var(--hp-enemy)">⚠ API 未啟用（js/config.js 已設 API_ENABLED = false）</span>';
    return;
  }

  // 先同步自己當前資料，再取列表
  const syncRes = await API.syncCurrentPlayer();
  if (!syncRes.ok) {
    if (syncRes.offline) {
      statusEl.innerHTML = `<span style="color:var(--hp-enemy)">⚠ 排行榜服務離線中（${(syncRes.error || '').slice(0, 40)}）</span>
        <div style="color:var(--muted);font-size:10px;margin-top:4px">後端伺服器未啟動或網路無法連線。本機開發請跑 <code>cd server && npm start</code></div>`;
    } else {
      statusEl.innerHTML = `<span style="color:var(--hp-enemy)">⚠ 同步失敗：${syncRes.error}</span>`;
    }
    return;
  }

  const lbRes = await API.getLeaderboard(100);
  if (!lbRes.ok) {
    statusEl.innerHTML = `<span style="color:var(--hp-enemy)">⚠ 排行榜載入失敗：${lbRes.error || 'unknown'}</span>`;
    return;
  }

  const myId = API.getUuid();
  const myRank = syncRes.data.rank;
  const total = lbRes.data.total;
  statusEl.innerHTML = `共 <b style="color:var(--gold)">${total}</b> 位玩家 · 你目前排名 <b style="color:var(--accent)">#${myRank}</b>`;

  if (!lbRes.data.list || lbRes.data.list.length === 0) {
    tableEl.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center">尚無玩家紀錄</div>';
    return;
  }

  // 表格
  const rows = lbRes.data.list.map((p, idx) => {
    const rank = idx + 1;
    const isMe = p.id === myId;
    const rankColor = rank === 1 ? 'color:#ffcf3c;font-weight:700'
                    : rank === 2 ? 'color:#d8d8e0;font-weight:700'
                    : rank === 3 ? 'color:#cd7f32;font-weight:700' : 'color:var(--muted)';
    const rowBg = isMe ? 'background:linear-gradient(90deg,rgba(160,108,213,0.18),transparent);border-left:3px solid var(--accent)' : '';
    const ago = formatAgo(Date.now() - (p.updated_at || 0));
    return `
      <div class="lb-row" style="display:grid;grid-template-columns:50px 1fr 110px 100px 60px;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--line);${rowBg}">
        <div style="font-size:14px;${rankColor}">#${rank}</div>
        <div>
          <div style="font-weight:600">${escapeHtml(p.nickname || '無名')}${isMe ? ' <span style="color:var(--accent);font-size:10px">(你)</span>' : ''}</div>
          <div style="color:var(--muted);font-size:10px">${escapeHtml(p.character_name || p.character_id || '?')}${p.job_path ? ' · ' + p.job_path : ''} · Lv ${p.level || '?'}</div>
        </div>
        <div style="color:var(--gold);font-weight:700;font-size:14px">${(p.cp || 0).toLocaleString()}</div>
        <div style="color:var(--muted);font-size:10px">${ago}</div>
        <div></div>
      </div>
    `;
  }).join('');

  tableEl.innerHTML = `
    <div style="display:grid;grid-template-columns:50px 1fr 110px 100px 60px;gap:8px;padding:8px 10px;color:var(--muted);font-size:11px;font-weight:600;border-bottom:1px solid var(--line)">
      <div>排名</div><div>玩家 / 職業</div><div>戰力</div><div>更新</div><div></div>
    </div>
    <div style="max-height:60vh;overflow-y:auto">${rows}</div>
  `;
}

function formatAgo(ms) {
  if (!ms || ms < 0) return '剛剛';
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's 前';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' 分前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小時前';
  const d = Math.floor(h / 24);
  return d + ' 天前';
}

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderForge() {
  const root = document.getElementById('tabForge');
  const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
  root.innerHTML = '';
  if (!cs || !cs.equip) return;

  for (const slot of GAME_DATA.EQUIPMENT_SLOTS) {
    if (GAME_DATA.isRingSlot(slot)) continue;  // 戒指無 stats / fixed，鍛造對它無效，從鍛造頁隱藏
    const label = GAME_DATA.SLOT_LABELS[slot];
    const instId = cs.equip[slot];
    if (!instId) {
      const empty = document.createElement('div');
      empty.className = 'forge-block';
      empty.innerHTML = `<h4>${label}：<span style="color:var(--muted);font-size:12px">（未裝備）</span></h4>`;
      root.appendChild(empty);
      continue;
    }
    const inst = _activeBag().equipment[instId];
    const def = GAME_DATA.findEquipment(inst.itemId);
    if (!def) continue;
    const lvl = inst.forge || 0;
    const maxLvl = GAME_DATA.FORGE_MAX || 18;

    // base stat 顯示（套用強化倍率）
    const statStr = Object.entries(def.stats).map(([k, v]) => statLabel(k, v, lvl)).join(' · ');
    const affixStr = inst.affixes.length
      ? `<div class="forge-row" style="color:var(--shard);font-size:11px">詞綴：${inst.affixes.map(a => formatAffix(a).raw).join('、')}</div>`
      : '';

    const block = document.createElement('div');
    block.className = 'forge-block';
    let bottom;
    if (lvl >= maxLvl) {
      bottom = `<div style="color:var(--gold);font-size:11px">★ 已達上限</div>`;
    } else {
      const cost = GAME_DATA.forgeCost(lvl, def);
      const goldOk = GAME_STATE.state.gold >= cost.goldCost;
      const bag = _activeBag().materials || {};
      const matChecks = cost.mats.map(m => ({ ...m, ok: (bag[m.name] || 0) >= m.qty }));
      const allMatOk = matChecks.every(m => m.ok);
      const matsHtml = matChecks.map(m =>
        `<span class="${m.ok ? 'ok' : 'no'}">${m.name} x${m.qty}</span>`
      ).join('');
      const rateHtml = cost.canDowngrade
        ? `<span style="color:#5dd07c">成功 ${(cost.successRate*100).toFixed(0)}%</span> · <span style="color:#999">失敗 ${(cost.failRate*100).toFixed(0)}%</span> · <span style="color:#ff5e5e">降級 ${(cost.downgradeRate*100).toFixed(0)}%</span>`
        : `<span>成功率 ${(cost.successRate*100).toFixed(0)}%</span>`;
      const tier = cost.isAdvanced ? `<span style="color:#ff8a3c;font-size:10px;margin-left:4px">[極限強化]</span>` : '';
      // 保護卷選項（只在極限強化顯示）
      const PROTECT_ID = 'scroll-forge-protect';
      const protectHave = (_activeBag().potions && _activeBag().potions[PROTECT_ID]) || 0;
      const protectHtml = cost.canDowngrade
        ? `<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);margin-top:3px;cursor:pointer">
             <input type="checkbox" data-forge-protect="${instId}" ${protectHave > 0 ? '' : 'disabled'}>
             <span>使用強化保護卷（持有 ${protectHave} 張，降級時觸發保護）</span>
           </label>`
        : '';
      bottom = `
        <div class="forge-cost">
          <span class="${goldOk ? 'ok' : 'no'}">金 ${cost.goldCost.toLocaleString()}</span>
          ${matsHtml}
        </div>
        <div class="forge-cost" style="margin-top:2px">${rateHtml}${tier}</div>
        ${protectHtml}
        <button class="primary" ${goldOk && allMatOk ? '' : 'disabled'} data-forge-inst="${instId}">強化 +${lvl + 1}</button>
      `;
    }
    block.innerHTML = `
      <h4>${label}：<span class="bag-item ${def.rarity}" style="display:inline-block;padding:1px 6px;border-width:1px">${def.name}</span> <span style="color:var(--accent)">+${lvl}</span></h4>
      <div class="forge-row"><span>${statStr}</span><b>${(GAME_DATA.forgeMultiplier(lvl) * 100 - 100).toFixed(0)}%</b></div>
      ${affixStr}
      <div class="forge-bar"><div style="width:${(lvl / maxLvl) * 100}%"></div></div>
      ${bottom}
    `;
    root.appendChild(block);
  }

  root.querySelectorAll('button[data-forge-inst]').forEach(btn => {
    btn.onclick = () => {
      const instId = btn.dataset.forgeInst;
      const cb = root.querySelector(`input[data-forge-protect="${instId}"]`);
      const useProtect = !!(cb && cb.checked);
      doForge(instId, useProtect);
    };
  });
}

// ============================================================================
// 鍛造系統（蝕痕鎧神專屬，獨立視窗）
// ============================================================================
function renderSmith() {
  const root = document.getElementById('tabSmith');
  if (!root) return;
  const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
  if (!cs || !cs.equip) { root.innerHTML = ''; return; }
  const hammerCount = (_activeBag().materials['異界之鎚'] || 0);

  // 找出穿戴中的終焉套
  const ruinSlots = ['head', 'top', 'bottom', 'feet'].filter(slot => {
    const id = cs.equip[slot];
    if (!id) return false;
    const inst = _activeBag().equipment[id];
    const def = inst && GAME_DATA.findEquipment(inst.itemId);
    return def && GAME_DATA.isSmithEligible(def);
  });

  let html = `
    <div style="background:linear-gradient(180deg,rgba(255,94,122,0.12),var(--bg3));padding:10px 12px;border-radius:6px;border-left:3px solid #ff5e7a;margin-bottom:12px">
      <div style="color:#ff5e7a;font-weight:600;margin-bottom:4px">蝕痕鎧神鍛造</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.6">
        每件防具可鍛造 0-30 階，每 3 階解鎖一個效果。<br>
        4 件穿戴時所有效果累加（例如 4 件都鍛到 30，攻擊力 +60 ×4 = +240）。<br>
        升 1 階消耗 1 把異界之鎚（無盡塔 V 階梯掉落）。
      </div>
    </div>
    <div style="background:var(--bg);padding:10px 12px;border-radius:4px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
      <div>持有：<b style="color:#ff5e7a;font-size:16px">🔨 異界之鎚 ×${hammerCount}</b></div>
      <div style="color:var(--muted);font-size:11px">穿戴終焉套 ${ruinSlots.length} / 4 件</div>
    </div>
  `;

  if (ruinSlots.length === 0) {
    html += `<div style="text-align:center;padding:30px;color:var(--muted)">尚未穿戴任何蝕痕鎧神套裝。<br><small>從製作 → 99 級可製作 4 件終焉套（需無盡塔材料）</small></div>`;
    root.innerHTML = html;
    return;
  }

  const goldCost = GAME_DATA.SMITH_GOLD_COST;
  const playerGold = GAME_STATE.state.gold;

  for (const slot of ruinSlots) {
    const instId = cs.equip[slot];
    const inst = _activeBag().equipment[instId];
    const def = GAME_DATA.findEquipment(inst.itemId);
    const stage = inst.smithStage || 0;
    const maxStage = GAME_DATA.SMITH_MAX_STAGE;
    const progress = inst.smithProgress || 0;
    const hitsLeft = (inst.smithHitsLeft == null ? GAME_DATA.SMITH_INITIAL_HITS : inst.smithHitsLeft);
    const smithTable = (typeof GAME_DATA.getSmithEffectsTable === 'function')
      ? GAME_DATA.getSmithEffectsTable(def)
      : GAME_DATA.SMITH_EFFECTS;
    const next = smithTable.find(e => e.stage > stage);
    const effectsList = smithTable.map(e => {
      const got = stage >= e.stage;
      return `<span style="color:${got ? 'var(--hp-self)' : 'var(--muted)'};font-size:11px;display:inline-block;margin:2px 6px 2px 0">${got ? '✓' : '–'} 階${e.stage}：${e.label}</span>`;
    }).join('');
    let bottom = '';
    if (stage >= maxStage) {
      bottom = `<div style="color:var(--gold);font-size:12px;text-align:center;padding:6px">★ 已鍛造滿階（30/30）</div>`;
    } else {
      const capHits = GAME_DATA.smithHitsToCap(stage);
      const canSmith = hitsLeft > 0 && playerGold >= goldCost;
      const canRestore = hammerCount >= 1;
      const reasonNo = hitsLeft <= 0 ? '次數用完' : (playerGold < goldCost ? '金幣不足' : '');
      bottom = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0;font-size:11px">
          <span style="color:var(--muted)">階 ${stage} → ${stage + 1}：保底 ${capHits} 下　|　每次扣 <b style="color:${playerGold >= goldCost ? 'var(--gold)' : 'var(--hp-enemy)'}">金 ${goldCost.toLocaleString()}</b></span>
          <span style="color:${hitsLeft > 0 ? 'var(--hp-self)' : 'var(--hp-enemy)'}">剩餘次數 ${hitsLeft}</span>
        </div>
        <div style="display:flex;gap:6px">
          <button class="primary" style="flex:1" ${canSmith ? '' : 'disabled'} data-smith-inst="${instId}">
            🔨 鍛造一次${reasonNo ? `（${reasonNo}）` : ''}
          </button>
          <button class="ghost" ${canRestore ? '' : 'disabled'} data-restore-inst="${instId}" title="消耗 1 把異界之鎚，恢復 ${GAME_DATA.SMITH_HITS_PER_HAMMER} 次鍛造次數">
            ↻ 恢復 +${GAME_DATA.SMITH_HITS_PER_HAMMER}（鎚 ×1）
          </button>
        </div>
      `;
    }
    html += `
      <div class="forge-block">
        <h4>${GAME_DATA.SLOT_LABELS[slot]}：<span class="bag-item UR" style="display:inline-block;padding:1px 6px;border-width:1px">${def.name}</span> <span style="color:#ff5e7a;float:right">鍛 ${stage}/${maxStage}</span></h4>
        ${stage < maxStage ? `
        <div style="position:relative;height:14px;background:var(--bg);border-radius:7px;overflow:hidden;border:1px solid var(--line);margin:6px 0">
          <div style="position:absolute;inset:0;width:${progress}%;background:linear-gradient(90deg,#ff5e7a,#ff8a3c,#ffd66e);transition:width 0.2s"></div>
          <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;text-shadow:0 0 4px #000">煉製進度 ${progress.toFixed(1)}%</span>
        </div>` : ''}
        <div style="margin:8px 0;line-height:1.8">${effectsList}</div>
        ${bottom}
      </div>
    `;
  }
  root.innerHTML = html;

  root.querySelectorAll('button[data-smith-inst]').forEach(btn => {
    btn.onclick = () => {
      const r = GAME_STATE.smithEquip(btn.dataset.smithInst);
      if (r.ok) {
        if (r.leveledUp) {
          const msg = r.jumped ? `★ 跳階！${r.name} → 階 ${r.stage}` : `${r.name} 升階成功 → 階 ${r.stage}！次數已補滿`;
          toast(msg, 'gold');
        } else if (r.jumped) {
          toast(`${r.name} 觸發跳階加成！進度條已滿`, 'gold');
        }
        renderSmith(); renderHud(); renderBag(); renderCharDetail();
      } else {
        toast(r.reason, 'error');
      }
    };
  });
  root.querySelectorAll('button[data-restore-inst]').forEach(btn => {
    btn.onclick = () => {
      const r = GAME_STATE.restoreSmithHits(btn.dataset.restoreInst);
      if (r.ok) {
        toast(`恢復 +${GAME_DATA.SMITH_HITS_PER_HAMMER} 鍛造次數（剩 ${r.hitsLeft}）`, 'gold');
        renderSmith(); renderHud(); renderBag();
      } else {
        toast(r.reason, 'error');
      }
    };
  });
}

function statLabel(k, v, forge) {
  const isPct = (k === 'crit' || k === 'spd' || k === 'critDmg' || k === 'dmgReduce');
  // 強化等級加成（百分比類不吃強化倍率，與 effectiveStats 邏輯一致）
  const mul = forge ? GAME_DATA.forgeMultiplier(forge) : 1;
  const actual = isPct ? v : Math.floor(v * mul);
  const display = isPct ? `+${(v * 100).toFixed(0)}%` : `+${actual}`;
  const names = { atk: '攻擊', def: '防禦', hp: '生命', crit: '暴擊', critDmg: '暴傷', spd: '速度', dmgReduce: '減傷' };
  return `${names[k] || k} ${display}`;
}

function doForge(instId, useProtect) {
  const inst = _activeBag().equipment[instId];
  if (!inst) return;
  const def = GAME_DATA.findEquipment(inst.itemId);
  const curLv = inst.forge || 0;
  const cost = GAME_DATA.forgeCost(curLv, def);
  // 檢查資源（金 + 所有材料）
  if (GAME_STATE.state.gold < cost.goldCost) return toast('金幣不足', 'error');
  const bag = _activeBag().materials || {};
  for (const m of cost.mats) {
    if ((bag[m.name] || 0) < m.qty) return toast(`${m.name} 不足`, 'error');
  }
  // 保護卷檢查（只對極限強化有效）
  const PROTECT_ID = 'scroll-forge-protect';
  const protectHave = (_activeBag().potions && _activeBag().potions[PROTECT_ID]) || 0;
  const willUseProtect = !!useProtect && cost.canDowngrade && protectHave > 0;
  if (useProtect && cost.canDowngrade && protectHave <= 0) {
    return toast('保護卷不足，請至商店購買 (50 魂晶/張)', 'error');
  }
  // 扣資源
  GAME_STATE.gainGold(-cost.goldCost);
  for (const m of cost.mats) GAME_STATE.consumeMaterial(m.name, m.qty);
  if (willUseProtect) GAME_STATE.consumePotion(PROTECT_ID, 1);
  // 三段擲骰
  const roll = Math.random();
  if (roll < cost.successRate) {
    inst.forge = curLv + 1;
    toast(`★ 強化成功！+${inst.forge}` + (willUseProtect ? '（保護卷未消耗效果）' : ''), 'gold');
  } else if (roll < cost.successRate + cost.failRate) {
    // 純失敗（材料消耗，等級不變）
    toast(`強化失敗，材料消耗，等級不變` + (willUseProtect ? '（保護卷未觸發）' : ''), 'error');
  } else if (cost.canDowngrade) {
    // 降級命中 — 若用保護卷則轉為「等級不變」
    if (willUseProtect) {
      toast(`✓ 保護卷觸發！本來降級，等級維持 +${curLv}`, 'gold');
    } else {
      const safeLv = GAME_DATA.FORGE_SAFE_LEVEL || 10;
      if (curLv > safeLv) {
        inst.forge = curLv - 1;
        toast(`✘ 強化失敗降級！+${inst.forge}`, 'error');
      } else {
        toast(`強化失敗（安全層級保護，等級不變）`, 'error');
      }
    }
  } else {
    toast(`強化失敗，材料消耗`, 'error');
  }
  renderForge();
  renderHud();
  renderCharDetail();
  renderCharList();
  GAME_STATE.scheduleSave();
}

// ============================================================================
// 背包
// ============================================================================
let _bagTab = 'items';  // 'items' (物資) / 'equip' (裝備)
function renderBag() {
  const root = document.getElementById('tabBag');
  root.innerHTML = '';
  const st = GAME_STATE.state;
  const cs = st.characters[st.activeCharId];
  if (!cs) return;

  // ===== 分頁 =====
  const tabs = document.createElement('div');
  tabs.className = 'craft-tabs';
  tabs.innerHTML = `
    <button class="${_bagTab === 'items' ? 'active' : ''}" data-bagtab="items">📦 物資</button>
    <button class="${_bagTab === 'equip' ? 'active' : ''}" data-bagtab="equip">⚔ 裝備</button>
  `;
  root.appendChild(tabs);
  tabs.querySelectorAll('button[data-bagtab]').forEach(b => {
    b.onclick = () => { _bagTab = b.dataset.bagtab; renderBag(); };
  });

  // ===== 批次分解工具列（只在裝備分頁顯示） =====
  if (_bagTab !== 'equip') {} else {
  const bar = document.createElement('div');
  bar.className = 'bag-toolbar';
  bar.innerHTML = `
    <span class="bag-tool-title">批次分解：</span>
    <button class="ghost small" data-batch="N">N</button>
    <button class="ghost small" data-batch="R">+R</button>
    <button class="ghost small" data-batch="SR">+SR</button>
    <button class="ghost small" data-batch="SSR" style="border-color:#ffb84d;color:#ffb84d">+SSR</button>
  `;
  root.appendChild(bar);
  bar.querySelectorAll('button[data-batch]').forEach(b => {
    b.onclick = () => {
      const tier = b.dataset.batch;
      const label = { N: 'N', R: 'N+R', SR: 'N+R+SR', SSR: 'N+R+SR+SSR' }[tier];
      const extraWarn = tier === 'SSR' ? '\n\n⚠️ SSR 含核心套裝（神諭/烈日/永凍）！\n建議先穿好要留的核心套裝。' : '';
      if (!confirm(`確定分解所有 ${label} 階「未裝備」裝備？此操作無法復原。${extraWarn}`)) return;
      const r = GAME_STATE.batchDisassemble({ maxRarity: tier });
      if (r.count === 0) { toast('沒有可分解的裝備', 'error'); return; }
      const matStr = Object.entries(r.mats).map(([n, q]) => `${n} ×${q}`).join('、');
      toast(`分解 ${r.count} 件 → ${matStr}、金 +${r.gold}${r.gems ? `、寶石 ×${r.gems}`:''}`, 'gold');
      renderBag(); renderHud();
    };
  });
  }  // 結束「裝備分頁的批次工具列」 else block

  // ===== 物資分頁顯示：材料 / 寶箱 / 藥水 / 魔法石 =====
  if (_bagTab === 'items') {

  // ===== 材料 =====
  const matSec = document.createElement('div');
  matSec.className = 'bag-section';
  matSec.innerHTML = `<h4>材料</h4>`;
  const matGrid = document.createElement('div');
  matGrid.className = 'bag-grid';
  for (const [name, qty] of Object.entries(_activeBag().materials)) {
    const def = GAME_DATA.ITEMS.materials[name] || { rarity: 'N' };
    const cell = document.createElement('div');
    cell.className = `bag-item ${def.rarity}`;
    cell.innerHTML = `<div class="iname">${name}</div><div class="itag">${def.rarity}</div><div class="qty">${qty}</div>`;
    matGrid.appendChild(cell);
  }
  if (Object.keys(_activeBag().materials).length === 0) matGrid.innerHTML = '<div style="color:var(--muted);font-size:11px">無</div>';
  matSec.appendChild(matGrid);
  root.appendChild(matSec);

  // ===== 魔力石（賦予系統用）=====
  const stones = _activeBag().magicStones || {};
  const stoneEntries = Object.entries(stones).filter(([, q]) => q > 0);
  if (stoneEntries.length > 0 || true) {  // 一律顯示（讓玩家知道有這分類）
    const sSec = document.createElement('div');
    sSec.className = 'bag-section';
    sSec.innerHTML = `<h4>魔力石 <span style="color:var(--muted);font-size:10px;font-weight:400">在「⚛ 賦予」分頁鑲嵌到武器上</span></h4>`;
    const sGrid = document.createElement('div');
    sGrid.className = 'bag-grid';
    // 固定列出 4 種（已知種類，未取得顯示 0）
    const ALL_STONES = ['mstone-red', 'mstone-blue', 'mstone-yellow', 'mstone-mega'];
    for (const stoneId of ALL_STONES) {
      const def = GAME_DATA.findMagicStone && GAME_DATA.findMagicStone(stoneId);
      if (!def) continue;
      const qty = stones[stoneId] || 0;
      const lock = def.notObtainable;
      const COLOR_GLOW = { red: '#ff5e5e', blue: '#5e9eff', yellow: '#ffd05e', mega: '#c084ff' };
      const glow = COLOR_GLOW[def.color] || '#888';
      const cell = document.createElement('div');
      cell.className = `bag-item ${qty > 0 ? 'SR' : 'N'}`;
      cell.style.borderColor = glow;
      cell.style.opacity = (qty === 0 && lock) ? '0.45' : (qty === 0 ? '0.65' : '1');
      cell.innerHTML = `
        <div class="iname">${def.icon} ${def.name}</div>
        <div class="itag">${lock ? '🔒 未開放' : '魔力石'}</div>
        <div class="qty" style="color:#000">${qty}</div>
      `;
      sGrid.appendChild(cell);
    }
    sSec.appendChild(sGrid);
    root.appendChild(sSec);
  }

  // ===== 寶箱 =====
  const chests = _activeBag().chests || {};
  const chestEntries = Object.entries(chests).filter(([, q]) => q > 0);
  if (chestEntries.length > 0) {
    const cSec = document.createElement('div');
    cSec.className = 'bag-section';
    cSec.innerHTML = `<h4>寶箱 <span style="color:var(--muted);font-size:10px;font-weight:400">點擊開啟領取獎勵</span></h4>`;
    const cGrid = document.createElement('div');
    cGrid.className = 'bag-grid';
    for (const [cid, qty] of chestEntries) {
      const c = GAME_DATA.findChest(cid);
      if (!c) continue;
      const cell = document.createElement('div');
      cell.className = `bag-item ${c.rarity}`;
      const tenLabel = qty >= 10 ? '開 10' : `開 ${qty}`;
      cell.innerHTML = `
        <div class="iname" style="color:${c.color}">${c.name}</div>
        <div class="itag">${c.rarity}</div>
        <div style="color:var(--muted);font-size:10px;margin-top:3px;line-height:1.4">${c.desc}</div>
        <div class="qty">${qty}</div>
        <div style="display:flex;gap:4px;margin-top:6px">
          <button class="primary small" style="flex:1" data-openchest="${cid}">開 1</button>
          <button class="primary small" style="flex:1" data-openchest10="${cid}" ${qty < 2 ? 'disabled' : ''}>${tenLabel}</button>
        </div>
      `;
      cGrid.appendChild(cell);
    }
    cSec.appendChild(cGrid);
    root.appendChild(cSec);
  }

  // ===== 入場券 =====
  const passes = _activeBag().passes || {};
  const passEntries = Object.entries(passes).filter(([, q]) => q > 0);
  if (passEntries.length > 0) {
    const pSec = document.createElement('div');
    pSec.className = 'bag-section';
    pSec.innerHTML = `<h4>入場券 <span style="color:var(--muted);font-size:10px;font-weight:400">用於進入特定副本</span></h4>`;
    const pGrid = document.createElement('div');
    pGrid.className = 'bag-grid';
    for (const [pid, qty] of passEntries) {
      const pd = GAME_DATA.findPass(pid);
      if (!pd) continue;
      const cell = document.createElement('div');
      cell.className = `bag-item ${pd.rarity}`;
      cell.innerHTML = `
        <div class="iname" style="color:var(--shard)">${pd.icon || '✦'} ${pd.name}</div>
        <div class="itag">${pd.rarity}</div>
        <div style="color:var(--muted);font-size:10px;margin-top:3px;line-height:1.4">${pd.desc}</div>
        <div class="qty">${qty}</div>
      `;
      pGrid.appendChild(cell);
    }
    pSec.appendChild(pGrid);
    root.appendChild(pSec);
  }

  // ===== 藥水 / 卷軸 =====
  const potions = _activeBag().potions || {};
  const potionEntries = Object.entries(potions).filter(([, q]) => q > 0);
  if (potionEntries.length > 0) {
    const potSec = document.createElement('div');
    potSec.className = 'bag-section';
    potSec.innerHTML = `<h4>藥水 / 卷軸</h4>`;
    const potGrid = document.createElement('div');
    potGrid.className = 'bag-grid';
    for (const [pid, qty] of potionEntries) {
      const p = GAME_DATA.findPotion(pid);
      if (!p) continue;
      const isScroll = p.type === 'buff' && p.kind === 'global';
      const cell = document.createElement('div');
      cell.className = `bag-item ${p.rarity}`;
      cell.innerHTML = `
        <div class="iname">${p.name}</div>
        <div class="itag">${p.rarity}</div>
        <div style="color:var(--muted);font-size:10px;margin-top:3px;line-height:1.4">${p.desc}</div>
        <div class="qty">${qty}</div>
        ${isScroll
          ? `<button class="primary small" style="margin-top:6px;width:100%" data-usescroll="${pid}">使用</button>`
          : '<div style="font-size:9px;color:var(--muted);margin-top:4px;text-align:center">綁定到藥水欄自動使用</div>'}
      `;
      potGrid.appendChild(cell);
    }
    potSec.appendChild(potGrid);
    root.appendChild(potSec);
  }

  // ===== 魔法石 =====
  const gems = _activeBag().gems || {};
  const gemEntries = Object.entries(gems).filter(([, q]) => q > 0);
  if (gemEntries.length > 0) {
    const gemSec = document.createElement('div');
    gemSec.className = 'bag-section';
    gemSec.innerHTML = `<h4>魔法石
      <span style="margin-left:8px">
        <button class="ghost small" data-sellgems="N">賣所有 N</button>
        <button class="ghost small" data-sellgems="R">賣 N + R</button>
        <button class="ghost small" data-sellgems="SR">賣 N + R + SR</button>
      </span>
    </h4>`;
    const gemGrid = document.createElement('div');
    gemGrid.className = 'bag-grid';
    const GEM_PRICES = { 1: 10, 2: 60, 3: 280, 4: 1500, 5: 8000 };
    for (const [gid, qty] of gemEntries) {
      const g = GAME_DATA.findGem(gid);
      if (!g) continue;
      const isPct = (g.stat === 'crit' || g.stat === 'spd' || g.stat === 'critDmg');
      const valDisp = isPct ? `+${(g.value * 100).toFixed(1)}%` : `+${g.value}`;
      const statName = { atk: '攻擊', def: '防禦', hp: '生命', crit: '暴擊', spd: '速度', critDmg: '暴傷', dmgReduce: '減傷' }[g.stat] || g.stat;
      const unitPrice = GEM_PRICES[g.tier] || 10;
      const cell = document.createElement('div');
      cell.className = `bag-item ${g.rarity}`;
      cell.innerHTML = `
        <div class="iname">${g.name}</div>
        <div class="itag">${g.rarity}</div>
        <div style="font-size:9px;color:var(--muted);margin-top:2px">${statName} ${valDisp}</div>
        <div class="qty">${qty}</div>
        <div class="bag-cell-actions">
          <button class="danger small" data-sellgem="${gid}" title="售出 1 顆">賣 ${unitPrice} 金</button>
          ${qty >= 2 ? `<button class="danger small" data-sellgem="${gid}" data-all="1" title="售出全部">賣 ×${qty}</button>` : ''}
        </div>
      `;
      gemGrid.appendChild(cell);
    }
    gemSec.appendChild(gemGrid);
    root.appendChild(gemSec);
  }
  }  // 結束物資分頁

  // ===== 裝備分頁 =====
  if (_bagTab === 'equip') {
  const equippedInstIds = new Set(Object.values(cs.equip || {}));
  for (const slot of GAME_DATA.EQUIPMENT_SLOTS) {
    if (slot === 'ring2') continue;  // 戒指合併到 ring1 渲染
    const isRingSec = slot === 'ring1';

    // ─────────────────────────────────────────────────────
    // 戒指 section（自訂渲染：頂部雙槽 + 下方收藏網格）
    // ─────────────────────────────────────────────────────
    if (isRingSec) {
      const sec = document.createElement('div');
      sec.className = 'bag-section';
      // 頂部雙槽 panel：顯示已裝戒指的完整資訊
      const slotPanel = (rk) => {
        const id = cs.equip[rk];
        const inst = id ? _activeBag().equipment[id] : null;
        const def = inst ? GAME_DATA.findEquipment(inst.itemId) : null;
        const label = GAME_DATA.SLOT_LABELS[rk];
        if (!def) {
          return `<div class="ring-slot empty">
            <div class="ring-slot-head">${label}</div>
            <div class="ring-slot-empty">— 空 —</div>
          </div>`;
        }
        const affixHtml = (inst.affixes || []).map(a => {
          const stat = STAT_DISPLAY_NAMES[a.stat] || a.stat;
          const isPct = typeof a.value === 'number' && a.value < 1;
          const valStr = isPct ? '+' + (a.value * 100).toFixed(1) + '%' : '+' + a.value;
          return `<div class="ring-affix"><span>${a.label} <span style="color:var(--muted)">${stat}</span></span><b>${valStr}</b></div>`;
        }).join('');
        return `<div class="ring-slot equipped ${def.rarity}" data-inst-id="${id}">
          <div class="ring-slot-head">${label} <span class="ring-rarity ${def.rarity}">${def.rarity}</span></div>
          <div class="ring-slot-name">${def.name}</div>
          <div class="ring-slot-affixes">${affixHtml || '<div style="color:var(--muted);font-size:10px">無詞綴</div>'}</div>
          <button class="ghost small ring-unequip-btn" data-unequip="${rk}">卸下</button>
        </div>`;
      };
      sec.innerHTML = `
        <h4>戒指</h4>
        <div class="ring-slots-wrap">${slotPanel('ring1')}${slotPanel('ring2')}</div>
      `;

      // 下方收藏：只列「未裝備」的戒指
      const unequipped = Object.entries(_activeBag().equipment).filter(([id, inst]) => {
        const def = GAME_DATA.findEquipment(inst.itemId);
        if (!def || def.slot !== 'ring') return false;
        if (equippedInstIds.has(id)) return false;
        return true;
      }).sort((a, b) => {
        const da = GAME_DATA.findEquipment(a[1].itemId);
        const db = GAME_DATA.findEquipment(b[1].itemId);
        if (db.tier !== da.tier) return db.tier - da.tier;
        return (b[1].affixes || []).length - (a[1].affixes || []).length;
      });

      const stashTitle = document.createElement('div');
      stashTitle.innerHTML = `<div class="ring-stash-title">收藏（未裝備）<span style="color:var(--muted);font-weight:400">　${unequipped.length} 件</span></div>`;
      sec.appendChild(stashTitle);

      const grid = document.createElement('div');
      grid.className = 'bag-grid ring-grid';
      for (const [instId, inst] of unequipped) {
        const def = GAME_DATA.findEquipment(inst.itemId);
        const cell = document.createElement('div');
        cell.className = `bag-item ${def.rarity}` + (inst.locked ? ' locked' : '');
        const affixStr = (inst.affixes || []).length
          ? '<div style="color:var(--shard);font-size:10px;margin-top:3px">' + inst.affixes.map(a => formatAffix(a).raw).join('、') + '</div>'
          : '';
        const lockIcon = inst.locked ? '<span class="lock-badge" title="已鎖定（批次分解會跳過）">🔒</span>' : '';
        cell.innerHTML = `
          <div class="iname">${lockIcon}${def.name}</div>
          <div class="itag">${def.rarity}</div>
          ${affixStr}
          <div class="ring-cell-actions">
            <button class="ring-equip-l" data-equip="ring1:${instId}" title="裝至戒指(左)">裝左</button>
            <button class="ring-equip-r" data-equip="ring2:${instId}" title="裝至戒指(右)">裝右</button>
            <button class="ghost small" data-lock="${instId}" title="${inst.locked ? '解鎖' : '鎖定（避免批次分解）'}">${inst.locked ? '🔓' : '🔒'}</button>
            <button class="danger small" data-disasm="${instId}" title="分解返還材料">分解</button>
          </div>
        `;
        cell.style.cursor = 'pointer';
        cell.dataset.instId = instId;
        cell.addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON') return;
          openEquipDetail(instId);
        });
        grid.appendChild(cell);
      }
      if (unequipped.length === 0) {
        grid.innerHTML = '<div style="color:var(--muted);font-size:11px;grid-column:1/-1;padding:10px;text-align:center">收藏為空 — 到製作頁做幾枚戒指</div>';
      }
      sec.appendChild(grid);
      root.appendChild(sec);

      // 點擊已裝戒指的卡片開啟詳細頁（避開卸下按鈕）
      sec.querySelectorAll('.ring-slot.equipped').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON') return;
          openEquipDetail(card.dataset.instId);
        });
        card.style.cursor = 'pointer';
      });
      continue;
    }

    // ─────────────────────────────────────────────────────
    // 一般裝備 section（原邏輯）
    // ─────────────────────────────────────────────────────
    const label = GAME_DATA.SLOT_LABELS[slot];
    const sec = document.createElement('div');
    sec.className = 'bag-section';
    sec.innerHTML = `<h4>${label}</h4>`;
    const grid = document.createElement('div');
    grid.className = 'bag-grid';
    const instances = Object.entries(_activeBag().equipment).filter(([id, inst]) => {
      const def = GAME_DATA.findEquipment(inst.itemId);
      if (!def) return false;
      if (!GAME_DATA.slotAcceptsItem(slot, def.slot)) return false;
      // Wave 30.8：武器 owner 比對「藍圖 ID」（cs.blueprintId='tsukirin'），不是 cs.id（可能是 'tsukirin#2'）
      const bpId = cs.blueprintId || (cs.id || '').split('#')[0];
      if (slot === 'weapon' && def.owner && def.owner !== bpId) return false;
      return true;
    });
    // 排序：1) 裝備中優先 2) 稀有度高 3) 強化等級高 4) 詞綴多
    instances.sort((a, b) => {
      const ea = equippedInstIds.has(a[0]) ? 1 : 0;
      const eb = equippedInstIds.has(b[0]) ? 1 : 0;
      if (ea !== eb) return eb - ea;
      const da = GAME_DATA.findEquipment(a[1].itemId);
      const db = GAME_DATA.findEquipment(b[1].itemId);
      if (db.tier !== da.tier) return db.tier - da.tier;
      const fa = a[1].forge || 0, fb = b[1].forge || 0;
      if (fb !== fa) return fb - fa;
      const aA = (a[1].affixes || []).length;
      const aB = (b[1].affixes || []).length;
      return aB - aA;
    });
    for (const [instId, inst] of instances) {
      const def = GAME_DATA.findEquipment(inst.itemId);
      const isEquipped = cs.equip[slot] === instId;
      const cell = document.createElement('div');
      cell.className = `bag-item ${def.rarity}` + (inst.locked ? ' locked' : '');
      const forge = inst.forge || 0;
      const statStr = Object.entries(def.stats).map(([k, v]) => statLabel(k, v, forge)).join('<br>');
      const affixStr = inst.affixes.length
        ? '<div style="color:var(--shard);font-size:10px;margin-top:3px">' + inst.affixes.map(a => formatAffix(a).raw).join('、') + '</div>'
        : '';
      const lockIcon = inst.locked ? '<span class="lock-badge" title="已鎖定（批次分解會跳過）">🔒</span>' : '';
      cell.innerHTML = `
        <div class="iname">${lockIcon}${def.name}${forge ? ` +${forge}` : ''}</div>
        <div class="itag">${def.rarity}</div>
        <div style="color:var(--muted);font-size:10px;margin-top:3px;line-height:1.4">${statStr}</div>
        ${affixStr}
        ${isEquipped
          ? `<div style="color:var(--accent);font-size:10px;margin-top:4px;font-weight:600">[裝備中]</div>
             <div class="bag-cell-actions">
              <button class="ghost small" data-unequip="${slot}" title="卸下此裝備（卸下後可分解）">卸下</button>
              <button class="ghost small" data-lock="${instId}" title="${inst.locked ? '解鎖' : '鎖定（避免批次分解）'}">${inst.locked ? '🔓' : '🔒'}</button>
            </div>`
          : `<div class="bag-cell-actions">
              <button data-equip="${slot}:${instId}">裝備</button>
              <button class="ghost small" data-lock="${instId}" title="${inst.locked ? '解鎖' : '鎖定（避免批次分解）'}">${inst.locked ? '🔓' : '🔒'}</button>
              <button class="danger small" data-disasm="${instId}" title="分解返還材料">分解</button>
            </div>`}
      `;
      cell.style.cursor = 'pointer';
      cell.dataset.instId = instId;
      cell.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        openEquipDetail(instId);
      });
      grid.appendChild(cell);
    }
    if (instances.length === 0) {
      grid.innerHTML = '<div style="color:var(--muted);font-size:11px">無</div>';
    }
    sec.appendChild(grid);
    root.appendChild(sec);
  }
  }  // 結束裝備分頁

  root.querySelectorAll('button[data-equip]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const [slot, instId] = btn.dataset.equip.split(':');
      equipItem(slot, instId);
    };
  });
  root.querySelectorAll('button[data-sellgem]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const gid = btn.dataset.sellgem;
      const sellAll = btn.dataset.all === '1';
      const cur = (_activeBag().gems && _activeBag().gems[gid]) || 0;
      const qty = sellAll ? cur : 1;
      const g = GAME_DATA.findGem(gid);
      // 高階確認
      if (g && (g.tier >= 4)) {
        if (!confirm(`真的要售出 ${g.name} ×${qty}？無法復原。`)) return;
      }
      const r = GAME_STATE.sellGem(gid, qty);
      if (r.ok) {
        toast(`售出 ${r.name} ×${qty} → 金 +${r.gold}`, 'gold');
        renderBag(); renderHud();
      } else toast(r.reason, 'error');
    };
  });
  root.querySelectorAll('button[data-sellgems]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const cap = btn.dataset.sellgems;
      const label = { N: 'N', R: 'N + R', SR: 'N + R + SR' }[cap];
      if (!confirm(`真的要賣掉所有 ${label} 階魔法石？`)) return;
      const r = GAME_STATE.sellGemsBatch(cap);
      if (r.count === 0) return toast('沒有可賣的魔法石', 'error');
      toast(`售出 ${r.count} 顆魔法石 → 金 +${r.gold}`, 'gold');
      renderBag(); renderHud();
    };
  });
  root.querySelectorAll('button[data-openchest]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const cid = btn.dataset.openchest;
      const r = GAME_STATE.openChest(cid);
      if (!r.ok) return toast(r.reason, 'error');
      // 顯示開箱結果
      showChestRewardOverlay(r);
      renderBag(); renderHud();
    };
  });
  root.querySelectorAll('button[data-openchest10]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const cid = btn.dataset.openchest10;
      const r = GAME_STATE.openChestBatch(cid, 10);
      if (!r.ok) return toast(r.reason, 'error');
      showChestRewardOverlay(r);
      renderBag(); renderHud();
    };
  });
  root.querySelectorAll('button[data-usescroll]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const pid = btn.dataset.usescroll;
      const p = GAME_DATA.findPotion(pid);
      if (!p) return;
      // 檢查是否已有同卷軸生效
      const existing = (GAME_STATE.state.globalBuffs || []).find(b => b.potionId === pid && b.expiresAt > Date.now());
      if (existing) {
        if (!confirm(`「${p.name}」已生效中，使用後會延長時間，是否繼續？`)) return;
      }
      if (!GAME_STATE.consumePotion(pid, 1)) { toast('卷軸已耗盡', 'error'); return; }
      GAME_STATE.activateGlobalBuff(pid);
      toast(`${p.name} 已啟用（${Math.floor(p.duration / 60)} 分鐘）`, 'gold');
      renderBag(); renderHud();
    };
  });
  root.querySelectorAll('button[data-disasm]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.disasm;
      const inst = _activeBag().equipment[id];
      const def = inst && GAME_DATA.findEquipment(inst.itemId);
      if (!def) return;
      if (def.tier >= 3) {
        if (!confirm(`真的要分解 [${def.rarity}] ${def.name}${inst.forge ? ' +'+inst.forge : ''}？此操作無法復原。`)) return;
      }
      const r = GAME_STATE.disassembleEquipment(id);
      if (r.ok) {
        toast(`分解 ${r.name} → ${r.mat} ×${r.matQty}、金 +${r.gold}${r.gems.length ? `、退回寶石 ×${r.gems.length}`:''}`, 'gold');
        renderBag(); renderHud();
      } else {
        toast(r.reason, 'error');
      }
    };
  });
  root.querySelectorAll('button[data-lock]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.lock;
      const nowLocked = GAME_STATE.toggleEquipLock(id);
      toast(nowLocked ? '🔒 已鎖定（批次分解會跳過）' : '🔓 已解鎖', 'gold');
      renderBag();
    };
  });
  root.querySelectorAll('button[data-unequip]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slot = btn.dataset.unequip;
      const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
      if (!cs || !cs.equip) return;
      cs.equip[slot] = null;
      toast('已卸下，可以分解或裝其他裝備', 'gold');
      GAME_STATE.scheduleSave();
      renderBag(); renderHud(); renderCharDetail(); renderCharList(); renderForge();
    };
  });
}

function equipItem(slot, instId) {
  const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
  if (!cs.equip) cs.equip = {};
  // 戒指防雙開：同一 inst 不能同時在左右兩格
  if (slot === 'ring1' && cs.equip.ring2 === instId) cs.equip.ring2 = null;
  if (slot === 'ring2' && cs.equip.ring1 === instId) cs.equip.ring1 = null;
  // 戒指 procId 互斥：不能同時裝兩個有相同特效（procId）的戒指
  if (slot === 'ring1' || slot === 'ring2') {
    const otherSlot = slot === 'ring1' ? 'ring2' : 'ring1';
    const otherId = cs.equip[otherSlot];
    if (otherId && otherId !== instId) {
      const inst = cs.bag.equipment[instId];
      const otherInst = cs.bag.equipment[otherId];
      const def = inst && GAME_DATA.findEquipment(inst.itemId);
      const otherDef = otherInst && GAME_DATA.findEquipment(otherInst.itemId);
      if (def && otherDef && def.procId && def.procId === otherDef.procId) {
        toast(`不能裝兩個相同特效的戒指（${def.name}）`, 'error');
        return;
      }
    }
  }
  cs.equip[slot] = instId;
  toast('已裝備');
  renderBag();
  renderHud();
  renderCharDetail();
  renderCharList();
  renderForge();
  GAME_STATE.scheduleSave();
}

// ============================================================================
// 技能 / 被動頁
// ============================================================================
function renderSkills() {
  const root = document.getElementById('tabSkills');
  const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
  if (!cs) { root.innerHTML = ''; return; }
  const bp = GAME_STATE.getCharacterBlueprint(cs.blueprintId || cs.id);
  if (!cs.equippedSkills) cs.equippedSkills = [null, null, null, null, null];
  root.innerHTML = '';

  // ===== 已裝備（5 槽，依優先順序） =====
  const eqH = document.createElement('div');
  eqH.className = 'region-title';
  eqH.innerHTML = '已裝備技能 <span style="color:var(--muted);font-size:10px">（戰鬥優先順序由上到下）</span>';
  root.appendChild(eqH);

  for (let i = 0; i < 5; i++) {
    const sid = cs.equippedSkills[i];
    const row = document.createElement('div');
    row.className = 'skill-row equipped-slot';
    if (sid) {
      const sk = GAME_DATA.SKILLS[sid];
      const mults = Array.isArray(sk.mult) ? sk.mult : [sk.mult];
      const total = mults.reduce((a, b) => a + b, 0);
      // CD 進度
      const cdLeft = BATTLE.skillCDs && BATTLE.skillCDs[sid] || 0;
      const cdPct = cdLeft > 0 ? (cdLeft / sk.cd * 100) : 0;
      row.innerHTML = `
        <div class="sk-head">
          <div><span style="color:var(--accent);margin-right:6px">#${i + 1}</span><b class="sk-name">${sk.name}</b></div>
          <div class="sk-tag">${sk.tag}</div>
        </div>
        <div class="sk-desc">${sk.desc}</div>
        <div class="sk-stats">
          ${sk.isBuff ? '<span>Buff</span><b style="color:var(--shard)">支援型</b>' : `<span>倍率</span><b>${(total * 100).toFixed(0)}%</b>`}
          <span>冷卻</span><b>${sk.cd}s</b>
          <span>MP</span><b class="mp-tier-${sk.costTier || 'light'}">${sk.mpCost || 0}</b>
        </div>
        <div class="skill-cd-bar"><div style="width:${cdPct}%"></div></div>
        <div class="skill-slot-actions">
          ${i > 0 ? `<button data-act="up" data-i="${i}">↑</button>` : ''}
          ${i < 4 ? `<button data-act="dn" data-i="${i}">↓</button>` : ''}
          <button data-act="rm" data-i="${i}">取下</button>
        </div>
      `;
    } else {
      row.classList.add('empty-slot');
      row.innerHTML = `<div class="empty-slot-text">空槽 #${i + 1} — 從下方候選池點選裝備</div>`;
    }
    root.appendChild(row);
  }

  // ===== 候選池（已解鎖但未裝備、非普攻） =====
  const equipped = new Set(cs.equippedSkills);
  const available = cs.unlockedSkills.filter(sid => {
    const sk = GAME_DATA.SKILLS[sid];
    return sk && !sk.isBasic && !equipped.has(sid);
  });
  if (available.length) {
    const h = document.createElement('div');
    h.className = 'region-title';
    h.style.marginTop = '14px';
    h.textContent = '候選池（未裝備）';
    root.appendChild(h);
    for (const sid of available) {
      const sk = GAME_DATA.SKILLS[sid];
      const mults = Array.isArray(sk.mult) ? sk.mult : [sk.mult];
      const total = mults.reduce((a, b) => a + b, 0);
      const row = document.createElement('div');
      row.className = 'skill-row available';
      const hasEmpty = cs.equippedSkills.includes(null);
      row.innerHTML = `
        <div class="sk-head"><div class="sk-name">${sk.name}</div><div class="sk-tag">${sk.tag}</div></div>
        <div class="sk-desc">${sk.desc}</div>
        <div class="sk-stats">
          ${sk.isBuff ? '<span>Buff</span><b style="color:var(--shard)">支援型</b>' : `<span>倍率</span><b>${(total * 100).toFixed(0)}%</b>`}
          <span>冷卻</span><b>${sk.cd}s</b>
          <span>MP</span><b class="mp-tier-${sk.costTier || 'light'}">${sk.mpCost || 0}</b>
        </div>
        <button class="primary" data-act="eq" data-sid="${sid}" ${hasEmpty ? '' : 'disabled'}>${hasEmpty ? '裝備到空槽' : '槽位已滿'}</button>
      `;
      root.appendChild(row);
    }
  }

  // ===== 已掌握被動 =====
  if (cs.unlockedPassives.length) {
    const h = document.createElement('div');
    h.className = 'region-title';
    h.style.marginTop = '14px';
    h.textContent = '已掌握被動（自動生效，不佔技能槽）';
    root.appendChild(h);
    for (const pid of cs.unlockedPassives) {
      const ps = GAME_DATA.PASSIVES[pid];
      if (!ps) continue;
      const row = document.createElement('div');
      row.className = 'skill-row passive';
      row.innerHTML = `
        <div class="sk-head"><div class="sk-name">${ps.name}</div><div class="sk-tag">被動</div></div>
        <div class="sk-desc">${ps.desc}</div>
      `;
      root.appendChild(row);
    }
  }

  // ===== 即將解鎖 =====
  const upcoming = [];
  for (const u of bp.unlocks) {
    if (u.lv <= cs.level) continue;
    if (u.type === 'skill') {
      if (u.pathAny || u.path === cs.jobPath) {
        const sk = GAME_DATA.SKILLS[u.skill];
        if (sk) upcoming.push({ lv: u.lv, name: sk.name, kind: '技能', desc: sk.desc });
      }
    } else if (u.type === 'passive') {
      if (u.pathAny || u.path === cs.jobPath) {
        const ps = GAME_DATA.PASSIVES[u.passive];
        if (ps) upcoming.push({ lv: u.lv, name: ps.name, kind: '被動', desc: ps.desc });
      }
    } else if (u.type === 'job') {
      upcoming.push({ lv: u.lv, name: `${u.tier === 1 ? '一' : u.tier === 2 ? '二' : '三'}轉`, kind: '轉職', desc: '選擇你的道路。' });
    } else if (u.type === 'graduate') {
      upcoming.push({ lv: u.lv, name: '畢業 · 解鎖共鳴', kind: '里程碑', desc: '99 級畢業，解鎖跨角色共鳴等級系統。' });
    }
    if (upcoming.length >= 6) break;
  }
  if (upcoming.length) {
    const h = document.createElement('div');
    h.className = 'region-title';
    h.style.marginTop = '14px';
    h.textContent = '即將解鎖';
    root.appendChild(h);
    for (const up of upcoming) {
      const row = document.createElement('div');
      row.className = 'skill-row locked';
      row.innerHTML = `
        <div class="sk-head"><div class="sk-name">${up.name}</div><div class="sk-tag">${up.kind}</div></div>
        <div class="sk-desc">${up.desc}</div>
        <div class="sk-lock">Lv ${up.lv} 解鎖</div>
      `;
      root.appendChild(row);
    }
  }

  // 綁事件
  root.querySelectorAll('button[data-act]').forEach(btn => {
    btn.onclick = () => {
      const act = btn.dataset.act;
      const i = parseInt(btn.dataset.i);
      const eq = cs.equippedSkills;
      if (act === 'up' && i > 0) { [eq[i-1], eq[i]] = [eq[i], eq[i-1]]; }
      else if (act === 'dn' && i < 4) { [eq[i+1], eq[i]] = [eq[i], eq[i+1]]; }
      else if (act === 'rm') { eq[i] = null; }
      else if (act === 'eq') {
        const sid = btn.dataset.sid;
        const idx = eq.indexOf(null);
        if (idx >= 0) eq[idx] = sid;
      }
      GAME_STATE.scheduleSave();
      renderSkills();
    };
  });
}

// ============================================================================
// 解鎖通知 / 轉職彈窗（從 active 角色的 pendingUnlocks 取出）
// ============================================================================
function flushPendingNotifications() {
  const cs = _activeCs();
  if (!cs) return;
  if (!cs.pendingUnlocks) cs.pendingUnlocks = [];

  // 自癒：等級已達轉職門檻但 pendingJobChoice=0（狀態漏掉時補上）
  if ((cs.pendingJobChoice || 0) === 0 && !cs.graduated) {
    const need = cs.level >= 75 ? 3 : cs.level >= 50 ? 2 : cs.level >= 25 ? 1 : 0;
    if (need > cs.jobTier) cs.pendingJobChoice = cs.jobTier + 1;
  }

  // 優先處理轉職
  if (cs.pendingJobChoice && !document.getElementById('jobOverlay').classList.contains('open')) {
    if (document.getElementById('jobOverlay').classList.contains('hidden')) {
      showJobChoice(cs.pendingJobChoice);
    }
    return;
  }
  if (cs.pendingUnlocks.length > 0) {
    const importants = [];
    const resonances = [];
    while (cs.pendingUnlocks.length) {
      const u = GAME_STATE.dequeueUnlock();
      if (!u) break;
      if (u.kind === 'job') continue;
      if (u.kind === 'resonance') resonances.push(u);
      else importants.push(u);
    }
    if (resonances.length) {
      const max = resonances[resonances.length - 1].lv;
      const min = resonances[0].lv;
      const msg = resonances.length === 1
        ? `共鳴提升至 R${max}（+1 點可分配）`
        : `共鳴 R${min - 1} → R${max}（+${resonances.length} 點可分配）`;
      if (typeof toast === 'function') toast(msg, 'gold');
    }
    if (importants.length && document.getElementById('unlockOverlay').classList.contains('hidden')) {
      showUnlockOverlay(importants.slice(0, 8));
    }
  }
}

function showUnlockOverlay(items) {
  const ov = document.getElementById('unlockOverlay');
  const body = document.getElementById('unlockBody');
  const title = document.getElementById('unlockTitle');
  let html = '';
  let hasGrad = false;
  for (const u of items) {
    if (u.kind === 'skill') html += `<div class="unlock-line unlock-skill">Lv ${u.lv} · 解鎖技能 <b>${u.name}</b></div>`;
    else if (u.kind === 'passive') html += `<div class="unlock-line unlock-passive">Lv ${u.lv} · 解鎖被動 <b>${u.name}</b></div>`;
    else if (u.kind === 'graduate') { html += `<div class="unlock-line unlock-resonance">Lv 99 · <b>畢業！</b>共鳴等級系統已開啟。</div>`; hasGrad = true; }
    else if (u.kind === 'resonance') html += `<div class="unlock-line unlock-resonance">共鳴等級提升至 <b>R${u.lv}</b></div>`;
  }
  title.textContent = hasGrad ? '畢業 · 銀月之路' : '成長 · 新的力量';
  body.innerHTML = html;
  ov.classList.remove('hidden');
  renderCharDetail();
  renderSkills();
  renderHud();
  renderCharList();
}

function showJobChoice(tier) {
  const ov = document.getElementById('jobOverlay');
  const title = document.getElementById('jobTitle');
  const sub = document.getElementById('jobSub');
  const grid = document.getElementById('pathGrid');
  const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
  const bp = GAME_STATE.getCharacterBlueprint(cs.blueprintId || cs.id);

  title.textContent = `${tier === 1 ? '一' : tier === 2 ? '二' : '三'}轉 · ${tier === 1 ? '選擇你的道路' : '精修現有路線'}`;
  if (tier === 1) sub.textContent = '月凜在霜月家祖廟前佇立良久——是時候決定流派。';
  else if (tier === 2) sub.textContent = '走在道路上的她，能力進一步覺醒。';
  else sub.textContent = '銀月之路的盡頭，是真正的她自己。';

  grid.innerHTML = '';
  if (tier === 1) {
    // 兩選一
    for (const key of ['A', 'B']) {
      const p = bp.paths[key];
      const skill = bp.unlocks.find(u => u.type === 'skill' && u.path === key && u.lv === 25);
      const sk = skill ? GAME_DATA.SKILLS[skill.skill] : null;
      const opt = document.createElement('div');
      opt.className = 'path-option';
      opt.innerHTML = `
        <h4>${p.name}</h4>
        <div class="path-tag">${p.tag}</div>
        <div class="path-desc">${p.desc}</div>
        ${sk ? `<div class="path-skill">解鎖技能：<b>${sk.name}</b> — ${sk.desc}</div>` : ''}
      `;
      opt.onclick = () => {
        GAME_STATE.selectJobPath(key, 1);
        ov.classList.add('hidden');
        renderAll();
      };
      grid.appendChild(opt);
    }
  } else {
    // 二轉 / 三轉：只有當前路線
    const key = cs.jobPath;
    const p = bp.paths[key];
    const newName = tier === 2 ? p.tier2.name : p.tier3.name;
    const newDesc = tier === 2 ? p.tier2.desc : p.tier3.desc;
    const skillUnlock = bp.unlocks.find(u => u.type === 'skill' && u.path === key && u.lv === (tier === 2 ? 50 : 75));
    const sk = skillUnlock ? GAME_DATA.SKILLS[skillUnlock.skill] : null;
    const opt = document.createElement('div');
    opt.className = 'path-option';
    opt.style.gridColumn = 'span 2';
    opt.innerHTML = `
      <h4>${newName}</h4>
      <div class="path-tag">${tier === 2 ? '二轉精修' : '三轉終極'}</div>
      <div class="path-desc">${newDesc}</div>
      ${sk ? `<div class="path-skill">解鎖技能：<b>${sk.name}</b> — ${sk.desc}</div>` : ''}
    `;
    opt.onclick = () => {
      GAME_STATE.selectJobPath(cs.jobPath, tier);
      ov.classList.add('hidden');
      renderAll();
    };
    grid.appendChild(opt);
  }

  ov.classList.remove('hidden');
}

// ============================================================================
// Toast
// ============================================================================
window.showChestRewardOverlay = function(result) {
  const overlay = document.createElement('div');
  overlay.className = 'chest-reward-overlay';
  const items = result.rewards.map(r => {
    const rarityClass = r.rarity || 'N';
    return `<div class="chest-reward-row bag-item ${rarityClass}">${r.label}</div>`;
  }).join('');
  const countLabel = (result.opened && result.opened > 1) ? ` ×${result.opened}` : '';
  overlay.innerHTML = `
    <div class="chest-reward-card">
      <div class="chest-reward-title">✨ ${result.chestName}${countLabel} 已開啟 ✨</div>
      <div class="chest-reward-list">${items}</div>
      <button class="primary" id="chestRewardClose" style="margin-top:14px;width:100%">確定</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#chestRewardClose').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
};

window.showUrDropAnnouncement = function(name) {
  const overlay = document.createElement('div');
  overlay.className = 'ur-drop-overlay';
  overlay.innerHTML = `
    <div class="ur-drop-card">
      <div class="ur-drop-label">★ ULTRA RARE ★</div>
      <div class="ur-drop-name">${name}</div>
      <div class="ur-drop-sub">3% 概率 · 命運降臨</div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('fade-out'), 2400);
  setTimeout(() => overlay.remove(), 3000);
};

// 詞綴顯示格式化（label + 對應屬性中文 + 數值/百分比）
const STAT_DISPLAY_NAMES = {
  atk: '攻擊', def: '防禦', hp: '生命',
  crit: '暴擊', critDmg: '暴傷', spd: '速度',
  dmgReduce: '減傷', cdReduce: 'CD減', vsBoss: '對 BOSS', skillDmg: '技能傷害',
  defPierce: '無視防禦', maxMp: '最大MP', atkPct: '%攻擊力',
};
function formatAffix(a) {
  const isPct = typeof a.value === 'number' && a.value < 1;
  const valStr = isPct ? (a.value * 100).toFixed(1) + '%' : a.value;
  const stat = STAT_DISPLAY_NAMES[a.stat] || a.stat;
  return {
    label: `${a.label}（${stat}）`,
    value: valStr,
    raw: `${a.label} ${stat} +${valStr}`,
  };
}

// ============================================================================
// 左欄聊天框（隊伍頻道 + 在線人數）
// ============================================================================
function renderLeftChat() {
  const log = document.getElementById('chatLog');
  const onlineEl = document.getElementById('chatOnline');
  const input = document.getElementById('chatInputMain');
  const sendBtn = document.getElementById('chatSendMain');
  if (!log) return;

  const connected = window.MP_API && MP_API.isConnected();
  const playerCount = connected ? (Object.keys(MP_API.getPlayers()).length + 1) : 1;

  // 在線人數標記
  if (onlineEl) {
    onlineEl.textContent = connected ? `在線 ${playerCount}` : '未連線';
    onlineEl.classList.toggle('off', !connected);
  }

  // 輸入框啟用狀態
  if (input) {
    input.disabled = !connected;
    input.placeholder = connected ? '輸入訊息（Enter 送出）' : '未連線時無法傳訊';
  }
  if (sendBtn) sendBtn.disabled = !connected;

  // 訊息列表（用 structKey 避免閃爍）
  const sig = _mpChatLog.length + (connected ? ':on' : ':off');
  if (log._sig !== sig) {
    log._sig = sig;
    log.innerHTML = _mpChatLog.length === 0
      ? `<div class="chat-msg sys">${connected ? '隊伍頻道 — 開始聊天' : '尚未連線，建房 / 加房後可聊天'}</div>`
      : _mpChatLog.map(m => `
        <div class="chat-msg ${m.sys ? 'sys' : (m.self ? 'self' : '')}">
          ${m.sys ? '' : `<span class="chat-from">${m.who}:</span>`}
          ${m.text}
        </div>
      `).join('');
    // 自動滾到底
    log.scrollTop = log.scrollHeight;
  }
}

// 對外：加一則系統訊息（如「智乃 加入房間」）
window.addSystemChat = function(text) {
  _mpChatLog.push({ sys: true, text });
  if (_mpChatLog.length > 100) _mpChatLog.shift();
  renderLeftChat();
};

function bindLeftChat() {
  const input = document.getElementById('chatInputMain');
  const sendBtn = document.getElementById('chatSendMain');
  if (!input || !sendBtn) return;
  const send = () => {
    if (!MP_API || !MP_API.isConnected()) return;
    const text = input.value.trim();
    if (!text) return;
    const myName = GAME_STATE.getPlayerNickname() || '我';
    MP_API.broadcast('chat', { from: myName, text });
    _mpChatLog.push({ who: myName, text, self: true });
    if (_mpChatLog.length > 100) _mpChatLog.shift();
    input.value = '';
    renderLeftChat();
  };
  sendBtn.onclick = send;
  input.onkeydown = (e) => { if (e.key === 'Enter') send(); };

  // tab 切換（世界鎖住，只能 click team）
  document.querySelectorAll('.chat-tab').forEach(btn => {
    btn.onclick = () => {
      if (btn.classList.contains('disabled')) {
        toast('世界頻道需要中央伺服器，未開放', 'error');
        return;
      }
      document.querySelectorAll('.chat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });
}

// ============================================================================
// 戰鬥結算彈窗（襲擊戰通關 / 任何戰敗）
// ============================================================================
window.showResultModal = function(lc) {
  if (!lc) return;
  const overlay = document.getElementById('resultOverlay');
  if (!overlay) return;

  const titleEl = document.getElementById('resultTitle');
  const subEl = document.getElementById('resultSubtitle');
  const statsEl = document.getElementById('resultStats');
  const skillsEl = document.getElementById('resultSkills');
  const lootSection = document.getElementById('resultLootSection');
  const lootEl = document.getElementById('resultLoot');

  // 標題 / 副標題
  if (lc.failed) {
    titleEl.textContent = '✘ 戰敗';
    titleEl.className = 'result-title fail';
    subEl.textContent = `${lc.dungeonName}　·　堅持了 ${lc.time.toFixed(1)} 秒`;
  } else if (lc.isEndless) {
    titleEl.textContent = `✦ 階梯 ${lc.endlessTierLabel} 達成`;
    titleEl.className = 'result-title raid';
    const fmtM = (n) => n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n.toLocaleString();
    subEl.textContent = `${lc.dungeonName}　·　團隊累積 ${fmtM(lc.endlessTotalDmg||0)}（個人 ${fmtM(lc.endlessSelfDmg||0)}）`;
  } else if (lc.isRaid) {
    titleEl.textContent = '★ 襲擊戰通關 ★';
    titleEl.className = 'result-title raid';
    subEl.textContent = `${lc.dungeonName}　·　通關時間 ${lc.time.toFixed(1)} 秒`;
  } else {
    titleEl.textContent = '✓ 通關成功';
    titleEl.className = 'result-title win';
    subEl.textContent = `${lc.dungeonName}　·　通關時間 ${lc.time.toFixed(1)} 秒`;
  }

  // 統計
  const d = lc.damage || { total: 0, hits: 0, crits: 0, bySkill: {} };
  const dps = lc.time > 0 ? Math.floor(d.total / lc.time) : 0;
  const critRate = d.hits > 0 ? (d.crits / d.hits * 100).toFixed(1) : '0.0';
  statsEl.innerHTML = `
    <div class="result-stat"><span>總傷害</span><b>${Math.floor(d.total).toLocaleString()}</b></div>
    <div class="result-stat"><span>DPS</span><b>${dps.toLocaleString()}</b></div>
    <div class="result-stat"><span>命中</span><b>${d.hits}</b></div>
    <div class="result-stat"><span>暴擊率</span><b>${critRate}%</b></div>
  `;

  // 區段標題依模式決定
  const sectionTitleEl = overlay.querySelector('.result-section-title');
  const entries = Object.entries(d.bySkill || {});
  if (lc.isRaid || lc.isEndless) {
    // 襲擊戰：顯示「玩家貢獻」聚合（我 + 每位隊友），不顯示技能明細
    if (sectionTitleEl) sectionTitleEl.textContent = '玩家貢獻';
    const allyEntries = entries.filter(([k]) => k.startsWith('mp-ally:'));
    const myTotal = entries.filter(([k]) => !k.startsWith('mp-ally:')).reduce((s, [k, v]) => s + v, 0);
    const myName = GAME_STATE.getPlayerNickname() || '我';
    const contributors = [
      { name: myName, total: myTotal, self: true },
      ...allyEntries.map(([k, v]) => ({ name: k.slice(8), total: v, self: false })),
    ].sort((a, b) => b.total - a.total);
    if (contributors.some(c => c.total > 0)) {
      skillsEl.innerHTML = contributors.map(c => {
        const pct = d.total > 0 ? (c.total / d.total * 100) : 0;
        const label = c.self ? `👤 ${c.name}（你）` : `⛺ ${c.name}（隊友）`;
        return `
          <div class="result-skill${c.self ? '' : ' ally'}">
            <div class="result-skill-head">
              <span>${label}</span>
              <span>${Math.floor(c.total).toLocaleString()} (${pct.toFixed(1)}%)</span>
            </div>
            <div class="result-skill-bar"><div style="width:${Math.min(100, pct)}%"></div></div>
          </div>
        `;
      }).join('');
    } else {
      skillsEl.innerHTML = '<div style="color:var(--muted);font-size:11px;text-align:center;padding:6px">本場無輸出紀錄</div>';
    }
  } else {
    // 非襲擊戰（一般戰敗）：顯示技能輸出排行（前 5 名）
    if (sectionTitleEl) sectionTitleEl.textContent = '技能輸出';
    const sorted = entries.sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (sorted.length > 0) {
      skillsEl.innerHTML = sorted.map(([sid, dmg]) => {
        const sk = GAME_DATA.SKILLS[sid];
        const name = sk ? sk.name : sid;
        const pct = d.total > 0 ? (dmg / d.total * 100) : 0;
        return `
          <div class="result-skill">
            <div class="result-skill-head">
              <span>${name}</span><span>${Math.floor(dmg).toLocaleString()} (${pct.toFixed(1)}%)</span>
            </div>
            <div class="result-skill-bar"><div style="width:${Math.min(100, pct)}%"></div></div>
          </div>
        `;
      }).join('');
    } else {
      skillsEl.innerHTML = '<div style="color:var(--muted);font-size:11px;text-align:center;padding:6px">本場無輸出紀錄</div>';
    }
  }

  // 戰利品（只在通關顯示）
  if (lc.failed) {
    lootSection.style.display = 'none';
  } else if (lc.isEndless) {
    lootSection.style.display = '';
    const TIER_COLOR = { '粗鋼': '#b0b0b0', '精鋼': '#5fa8ff', '星鋼': '#c084ff', '神鋼': '#ffb84d', '永晶': '#ff5e7a', '夢晶': '#ff8a3c' };
    const g = lc.endlessGranted || { mats: {}, gems: [], chests: [], shard: 0 };
    const matHtml = Object.entries(g.mats || {}).map(([n, q]) =>
      `<span class="result-loot-item" style="color:${TIER_COLOR[n] || 'var(--text)'}">${n} +${q}</span>`
    ).join('');
    const gemHtml = (g.gems || []).map(name => `<span class="result-loot-item">💎 ${name}</span>`).join('');
    const chestHtmlG = (g.chests || []).map(c => {
      const cd = GAME_DATA.CHESTS[c.id];
      return `<span class="result-loot-item" style="color:${cd?.color || 'var(--accent)'}">📦 ${cd?.name || c.id} ×${c.qty}</span>`;
    }).join('');
    const shardHtml = (g.shard > 0) ? `<span class="result-loot-item shard">魂晶 +${g.shard}</span>` : '';
    lootEl.innerHTML = (shardHtml + matHtml + gemHtml + chestHtmlG) || '<span class="result-loot-item">未達階梯 I，無獎勵</span>';
  } else {
    lootSection.style.display = '';
    const TIER_COLOR = { '粗鋼': '#b0b0b0', '精鋼': '#5fa8ff', '星鋼': '#c084ff', '神鋼': '#ffb84d', '永晶': '#ff5e7a', '夢晶': '#ff8a3c' };
    const matEntries = lc.matDrops ? Object.entries(lc.matDrops) : [];
    const matHtml = matEntries.map(([n, q]) =>
      `<span class="result-loot-item" style="color:${TIER_COLOR[n] || 'var(--text)'}">${n} +${q}</span>`
    ).join('');
    let chestHtml = '';
    if (lc.chest && GAME_DATA.CHESTS[lc.chest]) {
      const c = GAME_DATA.CHESTS[lc.chest];
      chestHtml = `<span class="result-loot-item" style="color:${c.color}">📦 ${c.name}</span>`;
    }
    lootEl.innerHTML = `
      <span class="result-loot-item exp">經驗 +${lc.exp.toLocaleString()}</span>
      <span class="result-loot-item gold">金幣 +${lc.gold.toLocaleString()}</span>
      ${matHtml || ''}
      ${lc.shard ? `<span class="result-loot-item shard">魂晶 +${lc.shard}</span>` : ''}
      ${chestHtml}
      ${lc.gem ? `<span class="result-loot-item">💎 ${lc.gem}</span>` : ''}
      ${lc.drop ? `<span class="result-loot-item drop">${lc.drop}</span>` : ''}
    `;
  }

  overlay.classList.remove('hidden');
  document.getElementById('resultClose').onclick = () => overlay.classList.add('hidden');
};

// ============================================================================
// 多人 - 隊友面板（戰鬥中顯示）
// 用 DOM diff 避免每次 innerHTML 觸發 CSS 動畫造成閃爍
// ============================================================================
function renderAllyPanel() {
  const root = document.getElementById('allyPanel');
  if (!root) return;
  if (!window.MP_API || !MP_API.isConnected()) {
    if (root._allyKey !== '') { root.innerHTML = ''; root._allyKey = ''; }
    return;
  }
  const players = MP_API.getPlayers();
  const peerIds = Object.keys(players);
  if (!peerIds.length) {
    if (root._allyKey !== '') { root.innerHTML = ''; root._allyKey = ''; }
    return;
  }
  // 結構鍵：玩家加入/離開、暱稱改、轉職時才重建 DOM
  // level 不放 structKey（每升一級都重建會閃）；jobPath/jobTier 要用最新 battleState 的（轉職會變）
  const structKey = peerIds.map(pid => {
    const p = players[pid];
    const bs = p.battleState || {};
    const jobPath = bs.jobPath != null ? bs.jobPath : (p.jobPath || '');
    const jobTier = bs.jobTier != null ? bs.jobTier : (p.jobTier || 0);
    return `${pid}:${p.nickname || ''}:${p.charName || ''}:${jobPath}${jobTier}`;
  }).join('|');
  if (structKey !== root._allyKey) {
    root._allyKey = structKey;
    let html = '';
    for (const peerId of peerIds) {
      const info = players[peerId];
      const isHostTag = peerId === MP.hostId;
      // 立繪用最新轉職資料（battleState 優先，否則 fallback 用 info 連線時的版本）
      const bs = info.battleState || {};
      const effJobPath = bs.jobPath != null ? bs.jobPath : info.jobPath;
      const effJobTier = bs.jobTier != null ? bs.jobTier : info.jobTier;
      const tierKey = effJobPath && effJobTier > 0 ? `${effJobPath}${effJobTier}` : 'base';
      const portraitHtml = window.CHAR_PORTRAIT
        ? window.CHAR_PORTRAIT(info.blueprintId || 'tsukirin', { tierKey })
        : '';
      html += `
        <div class="fighter-card ally-card" data-peer="${peerId}">
          <div class="ally-tag-${isHostTag ? 'host' : 'guest'} ally-tag-badge">${isHostTag ? 'HOST' : 'GUEST'}</div>
          <div class="card-frame ally-frame">${portraitHtml}</div>
          <div class="card-name ally-nick">${info.nickname || '無名'}</div>
          <div class="card-sub">${info.charName || '?'} <small class="ally-lv">Lv ${info.level || 1}</small> <span class="ally-status"></span></div>
          <div class="card-hp ally-hp">
            <div class="hp-fill" style="width:0%"></div>
            <span class="hp-text">- / -</span>
          </div>
          <div class="card-mp ally-mp">
            <div class="mp-fill" style="width:0%"></div>
            <span class="mp-text">- / -</span>
          </div>
        </div>
      `;
    }
    root.innerHTML = html;
  }
  // 更新動態值（不重建 DOM）
  const myDungeon = BATTLE && BATTLE.charId ? BATTLE.dungeonId : null;
  root.querySelectorAll('.ally-card').forEach(card => {
    const peerId = card.dataset.peer;
    const info = players[peerId];
    if (!info) return;
    const bs = info.battleState || {};
    const sameDungeon = myDungeon && bs.dungeonId === myDungeon;
    const inBattle = bs.inBattle;
    // HP 為 0 也視為陣亡（即使 player-dead 訊息漏接，避免 ally 卡看不出來）
    const isDead = !!bs.dead || (inBattle && bs.maxHp > 0 && bs.hp <= 0);
    if (card.classList.contains('same') !== !!sameDungeon) card.classList.toggle('same', !!sameDungeon);
    if (card.classList.contains('far') !== !sameDungeon) card.classList.toggle('far', !sameDungeon);
    if (card.classList.contains('dead') !== isDead) card.classList.toggle('dead', isDead);

    const statusEl = card.querySelector('.ally-status');
    let statusText, statusClass;
    if (!inBattle) { statusText = '待命'; statusClass = 'ally-status-idle'; }
    else if (sameDungeon) { statusText = '同副本'; statusClass = 'ally-status-ok'; }
    else { statusText = '他副本'; statusClass = 'ally-status-far'; }
    if (statusEl.textContent !== statusText) statusEl.textContent = statusText;
    if (statusEl.className !== 'ally-status ' + statusClass) statusEl.className = 'ally-status ' + statusClass;

    // Lv 數字動態更新（優先用 battleState 內 level，否則 fallback 用 player-info 內 level）
    const lvEl = card.querySelector('.ally-lv');
    if (lvEl) {
      const effLv = (bs.level != null ? bs.level : info.level) || 1;
      const effGrad = bs.graduated != null ? bs.graduated : info.graduated;
      const lvText = effGrad ? 'Lv Max' : 'Lv ' + effLv;
      if (lvEl.textContent !== lvText) lvEl.textContent = lvText;
    }

    const hpFill = card.querySelector('.card-hp .hp-fill');
    const hpText = card.querySelector('.card-hp .hp-text');
    const mpFill = card.querySelector('.card-mp .mp-fill');
    const mpText = card.querySelector('.card-mp .mp-text');
    if (inBattle && bs.maxHp) {
      const hpPct = Math.max(0, bs.hp / bs.maxHp * 100);
      const mpPct = bs.maxMp ? Math.max(0, bs.mp / bs.maxMp * 100) : 0;
      hpFill.style.width = hpPct + '%';
      hpText.textContent = `${bs.hp} / ${bs.maxHp}`;
      mpFill.style.width = mpPct + '%';
      mpText.textContent = `${bs.mp} / ${bs.maxMp}`;
    } else {
      hpFill.style.width = '0%';
      hpText.textContent = '- / -';
      mpFill.style.width = '0%';
      mpText.textContent = '- / -';
    }
  });
}

// ============================================================================
// 存檔匯出 / 匯入 textarea modal
// ============================================================================
function openIoModal(opts) {
  const overlay = document.getElementById('ioOverlay');
  if (!overlay) return;
  document.getElementById('ioTitle').textContent = opts.title || '存檔工具';
  document.getElementById('ioHint').textContent = opts.hint || '';
  const ta = document.getElementById('ioTextarea');
  ta.value = opts.value || '';
  ta.readOnly = !!opts.readonly;
  document.getElementById('ioConfirm').textContent = opts.confirmText || '確定';
  overlay.classList.remove('hidden');
  // 自動全選（匯出模式時方便玩家複製）
  setTimeout(() => {
    ta.focus();
    if (opts.readonly) ta.select();
  }, 50);
  document.getElementById('ioCancel').onclick = closeIoModal;
  document.getElementById('ioConfirm').onclick = opts.onConfirm || closeIoModal;
}
function closeIoModal() {
  const overlay = document.getElementById('ioOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function toast(msg, kind) {
  const root = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = 'toast-msg' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ============================================================================
// 多人房間 UI（階段 1：基礎連線測試）
// ============================================================================
let _mpChatLog = [];

function playerInfoCard(info, isMe, isHostTag) {
  const tag = isHostTag ? 'HOST' : 'GUEST';
  const nickname = info.nickname || '無名旅人';
  const charLine = info.charName ? `${info.charName}${info.className ? ' · ' + info.className : ''}${info.pathName ? ' · ' + info.pathName : ''}` : '';
  const lvLine = `Lv ${info.level || 1}` + (info.cp ? `　CP ${info.cp.toLocaleString()}` : '') + (info.graduated ? '　✦ 已畢業' : '');
  return `
    <div class="mp-player${isMe ? ' self' : ''}">
      <span class="mp-player-icon">●</span>
      <div class="mp-player-info">
        <div class="mp-player-nick">${nickname}${isMe ? '（你）' : ''}</div>
        <div class="mp-player-sub">${charLine}</div>
        <div class="mp-player-meta">${lvLine}</div>
      </div>
      <span class="mp-player-tag">${tag}</span>
    </div>
  `;
}

function renderMpRoom() {
  const root = document.getElementById('tabMpRoom');
  if (!root) return;
  const isConnected = MP_API.isConnected();
  const isHost = MP_API.isHost();
  const roomCode = MP_API.getRoomCode();
  const players = MP_API.getPlayers();
  const playerCount = Object.keys(players).length + (isConnected ? 1 : 0);
  const myNickname = GAME_STATE.getPlayerNickname() || '';

  let html = '<div class="mp-room">';

  // 暱稱現況（單行顯示 + 修改按鈕）
  const nickDisplay = myNickname || '<span style="color:var(--hp-enemy)">★ 未設定</span>';
  html += `
    <div class="mp-nickname-line">
      <span class="mp-nick-label">玩家暱稱：</span>
      <b class="mp-nick-value">${nickDisplay}</b>
      <button class="ghost small" id="mpNicknameEdit">修改</button>
    </div>
  `;

  if (!isConnected) {
    html += `
      <div class="mp-section">
        <div class="mp-section-title">＊ 多人連線（Beta · 階段 1）</div>
        <div class="mp-hint">此階段只能測試連線與訊息收發。完整襲擊戰同步將在後續階段加入。</div>
      </div>
      <div class="mp-actions-grid">
        <button class="primary big" id="mpHostBtn">建立房間</button>
        <div style="display:flex;gap:6px">
          <input id="mpJoinCode" type="text" placeholder="輸入房號（如 ABCD-1234）" maxlength="9" style="flex:1;padding:8px;background:var(--bg);border:1px solid var(--line);color:var(--text);border-radius:4px;font-family:monospace;text-transform:uppercase">
          <button class="primary" id="mpJoinBtn">加入</button>
        </div>
      </div>
      <div class="mp-hint" style="margin-top:14px;font-size:10px">
        ⓘ 使用 WebRTC P2P 直連，信令服務由 PeerJS 公共伺服器提供（免費，無註冊）。<br>
        ⚠ 約 20% 機率穿不過防火牆 / NAT。若連線失敗，建議雙方都用同一個 WiFi 或行動網路試試。
      </div>
    `;
  } else {
    const roleText = isHost ? '🏠 房主' : '👥 訪客';
    html += `
      <div class="mp-section">
        <div class="mp-room-header">
          <div>
            <div class="mp-section-title">已連線 · ${roleText}</div>
            <div class="mp-room-code">房號：<b id="mpRoomCode">${roomCode}</b> <button id="mpCopyBtn" class="ghost small">複製</button></div>
          </div>
          <button class="danger small" id="mpLeaveBtn">離開房間</button>
        </div>
        <div class="mp-hint">分享房號給朋友，叫他在「多人」視窗輸入加入。</div>
      </div>
      <div class="mp-section">
        <div class="mp-section-title">玩家列表（${playerCount}）</div>
        <div class="mp-player-list">
    `;
    // 我自己
    const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
    const myBp = cs ? GAME_STATE.getCharacterBlueprint(cs.blueprintId) : null;
    const myInfo = cs ? {
      nickname: myNickname || '無名旅人',
      charName: cs.customName || (myBp ? myBp.name : '?'),
      className: myBp ? myBp.title : '',
      pathName: cs.pathName || '',
      level: cs.level,
      cp: GAME_STATE.combatPower(cs.id),
      graduated: !!cs.graduated,
    } : { nickname: myNickname || '無名旅人', charName: '?', level: 1 };
    html += playerInfoCard(myInfo, true, isHost);
    for (const [peerId, info] of Object.entries(players)) {
      html += playerInfoCard(info, false, peerId === MP.hostId);
    }
    html += `</div></div>`;
    // Chat 測試區
    html += `
      <div class="mp-section">
        <div class="mp-section-title">訊息（測試連線用）</div>
        <div class="mp-chat-log" id="mpChatLog">${_mpChatLog.map(m => `<div><b>${m.who}:</b> ${m.text}</div>`).join('') || '<i style="color:var(--muted)">尚無訊息</i>'}</div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <input id="mpChatInput" type="text" placeholder="輸入訊息..." style="flex:1;padding:6px;background:var(--bg);border:1px solid var(--line);color:var(--text);border-radius:4px">
          <button class="primary" id="mpSendBtn">發送</button>
        </div>
      </div>
    `;
  }

  html += '</div>';
  root.innerHTML = html;

  // 綁定按鈕
  const $ = (id) => document.getElementById(id);
  // 暱稱修改（簡單 prompt，創角時已主設定）
  if ($('mpNicknameEdit')) {
    $('mpNicknameEdit').onclick = () => {
      const current = GAME_STATE.getPlayerNickname() || '';
      const input = prompt('修改玩家暱稱（最多 16 字）：', current);
      if (input == null) return;
      const newName = input.trim().slice(0, 16);
      if (!newName) { toast('暱稱不能空白', 'error'); return; }
      GAME_STATE.setPlayerNickname(newName);
      toast('暱稱已更新：' + newName, 'gold');
      if (MP_API.isConnected()) MP_API.broadcastPlayerInfo();
      renderMpRoom();
    };
  }
  if ($('mpHostBtn')) $('mpHostBtn').onclick = async () => {
    if (!GAME_STATE.getPlayerNickname()) {
      toast('請先設定玩家暱稱', 'error');
      $('mpNicknameInput')?.focus();
      return;
    }
    try {
      $('mpHostBtn').disabled = true;
      $('mpHostBtn').textContent = '建立中...';
      const code = await MP_API.hostRoom();
      toast(`房間已建立：${code}`, 'gold');
      hookMpCallbacks();
      renderMpRoom();
      addSystemChat(`★ 房間建立成功 · 房號 ${code}`);
      renderLeftChat();
    } catch (e) {
      toast('建立失敗：' + e.message, 'error');
      $('mpHostBtn').disabled = false;
      $('mpHostBtn').textContent = '建立房間';
    }
  };
  if ($('mpJoinBtn')) $('mpJoinBtn').onclick = async () => {
    if (!GAME_STATE.getPlayerNickname()) {
      toast('請先設定玩家暱稱', 'error');
      $('mpNicknameInput')?.focus();
      return;
    }
    const code = $('mpJoinCode').value.trim().toUpperCase();
    if (!code || !/^[A-Z]{4}-[0-9]{4}$/.test(code)) {
      toast('房號格式錯誤（應為 ABCD-1234）', 'error');
      return;
    }
    try {
      $('mpJoinBtn').disabled = true;
      $('mpJoinBtn').textContent = '連線中...';
      hookMpCallbacks();
      await MP_API.joinRoom(code);
      toast(`已加入房間 ${code}`, 'gold');
      renderMpRoom();
      addSystemChat(`★ 已加入房間 ${code}`);
      renderLeftChat();
    } catch (e) {
      toast('加入失敗：' + e.message, 'error');
      $('mpJoinBtn').disabled = false;
      $('mpJoinBtn').textContent = '加入';
    }
  };
  if ($('mpLeaveBtn')) $('mpLeaveBtn').onclick = async () => {
    await MP_API.leaveRoom();
    _mpChatLog = [];
    toast('已離開房間');
    renderMpRoom();
    renderLeftChat();
  };
  if ($('mpCopyBtn')) $('mpCopyBtn').onclick = () => {
    navigator.clipboard.writeText(roomCode).then(() => toast('已複製房號', 'gold'));
  };
  if ($('mpSendBtn')) {
    const send = () => {
      const text = $('mpChatInput').value.trim();
      if (!text) return;
      const myName = GAME_STATE.getPlayerNickname() || '我';
      MP_API.broadcast('chat', { from: myName, text });
      _mpChatLog.push({ who: myName + ' (你)', text });
      if (_mpChatLog.length > 30) _mpChatLog.shift();
      $('mpChatInput').value = '';
      renderMpRoom();
    };
    $('mpSendBtn').onclick = send;
    $('mpChatInput').onkeydown = (e) => { if (e.key === 'Enter') send(); };
  }
}

function hookMpCallbacks() {
  MP.onMessage = (fromPeerId, type, payload) => {
    if (type === 'chat') {
      _mpChatLog.push({ who: payload.from, text: payload.text });
      if (_mpChatLog.length > 100) _mpChatLog.shift();
      const win = document.getElementById('winMpRoom');
      if (win && !win.classList.contains('hidden')) renderMpRoom();
      renderLeftChat();  // 左欄聊天框也即時更新
    } else if (type === 'player-info') {
      const win = document.getElementById('winMpRoom');
      if (win && !win.classList.contains('hidden')) renderMpRoom();
    } else if (type === 'raid-launch') {
      // 房主開戰 → Guest 自動跟著進
      const dId = payload.dungeonId;
      const d = GAME_DATA.getDungeon(dId);
      if (!d) { toast('房主開的副本找不到', 'error'); return; }
      const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
      if (!cs || (d.requiredLv && cs.level < d.requiredLv)) {
        toast(`你的等級不足（需 Lv ${d.requiredLv}），無法跟團`, 'error');
        return;
      }
      // CP 預檢 — 不足就早退，避免播 cutscene 後才發現進不去
      const _guestCP = GAME_STATE.combatPower(cs.id);
      const _guestMinCp = (typeof d.minCpOverride === 'number') ? d.minCpOverride : d.cp * 0.4;
      if (_guestCP < _guestMinCp && !d.isEndless) {
        toast(`你的戰力不足（需要 ${Math.floor(_guestMinCp).toLocaleString()} CP，目前 ${_guestCP.toLocaleString()}），無法跟團`, 'error');
        return;
      }
      // 無盡塔：guest 也要扣自己 1 張入場券（按設定「每人扣 1 張」）
      if (d.isEndless) {
        const ok = GAME_STATE.consumePass(d.passId || 'pass-endless', 1);
        if (!ok) {
          toast(`你的入場券不足，無法跟進無盡塔（房主已開戰）`, 'error');
          return;
        }
        toast(`房主開無盡塔：${d.name}（扣 1 張通行證）`, 'gold');
      } else {
        toast(`房主開戰：${d.name}`, 'gold');
      }
      // 關閉所有副本相關視窗 + 上一場結算彈窗
      ['winRaidPreview', 'winDungeon', 'resultOverlay'].forEach(id => {
        const w = document.getElementById(id);
        if (w) { w.style.display = ''; w.classList.add('hidden'); }
      });
      PIXEL.setScene({ regionId: GAME_DATA.getRegionByDungeon(d.id).id });
      // 立刻 startBattle 並暫停 → cutscene 期間 BOSS 不動 → 結束才解暫停
      // 確保 Wave 29.2 fallback 不會在 cutscene 期間因為 b.dungeonId 沒設而觸發
      startBattle(d.id, GAME_STATE.state.activeCharId);
      if (d.cutscene && typeof showRaidCutscene === 'function' && window.BATTLE) {
        window.BATTLE.paused = true;
        showRaidCutscene(d.cutscene, () => {
          if (window.BATTLE) {
            window.BATTLE.paused = false;
            window.BATTLE.startTime = performance.now();
          }
        });
      }
    }
  };
  MP.onPlayerJoined = (peerId) => {
    toast('朋友已加入', 'gold');
    const win = document.getElementById('winMpRoom');
    if (win && !win.classList.contains('hidden')) renderMpRoom();
    setTimeout(() => {
      const info = MP.players[peerId];
      const nick = info && info.nickname ? info.nickname : '某位旅人';
      addSystemChat(`★ ${nick} 加入了房間`);
    }, 300);
  };
  MP.onPlayerLeft = (peerId) => {
    const info = MP.players[peerId];
    const nick = info && info.nickname ? info.nickname : '隊友';
    toast(`${nick} 離開房間`);
    const win = document.getElementById('winMpRoom');
    if (win && !win.classList.contains('hidden')) renderMpRoom();
    addSystemChat(`✘ ${nick} 離開了房間`);
  };
}
