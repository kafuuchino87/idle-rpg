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

  let last = performance.now();
  let lastMpBroadcast = 0;
  let lastAllyRender = 0;
  const OFFLINE_MAX_MS = 10 * 60 * 1000;   // 最多補 10 分鐘的離線時間
  const OFFLINE_THRESHOLD = 3000;          // 超過 3 秒視為「背景中斷」
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
            return bs && (bs.dead || (bs.inBattle && bs.maxHp > 0 && bs.hp <= 0));
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
  const winMap = { char: 'winChar', dungeon: 'winDungeon', forge: 'winForge', bag: 'winBag', skills: 'winSkills', report: 'winReport', equip: 'winEquip', resonance: 'winResonance', craft: 'winCraft', shop: 'winShop', potionConfig: 'winPotionConfig', raidPreview: 'winRaidPreview', craftPreview: 'winCraftPreview', mpRoom: 'winMpRoom', smith: 'winSmith' };
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
        <div class="stat-row-pair"><span>暴擊</span><b>${(s.crit * 100).toFixed(1)}%</b></div>
        <div class="stat-row-pair"><span>暴傷</span><b>${(s.critDmg * 100).toFixed(0)}%</b></div>
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
    const matHtmlE = Object.entries(grantedMats).map(([n, q]) =>
      `<span class="cs-mat" style="color:${TIER_COLOR[n] || 'var(--text)'}">${n} +${q}</span>`
    ).join('');
    const gemHtmlE = grantedGems.map(name => `<span class="cs-drop">💎 ${name}</span>`).join('');
    body.innerHTML = `
      <span class="cs-name">${lc.dungeonName}</span>
      <span class="cs-time">30s ⏱</span>
      <span class="cs-dmg">累積 ${fmtM(lc.endlessTotalDmg || 0)}</span>
      <span class="cs-num">★ 階梯 ${lc.endlessTierLabel || '未達'}</span>
      ${matHtmlE || gemHtmlE || '<span class="cs-mat" style="color:var(--muted)">未達階梯 I</span>'}
      ${matHtmlE ? '' : ''}${gemHtmlE}
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
    body = `
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.6">用素材製作中低階裝備。UR 裝備僅由「襲擊戰」副本掉落，不可製作。</div>
      ${slotBar}
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
  const canReroll = def.rarity !== 'N' && inst.affixes && inst.affixes.length > 0;
  const rerollBtn = canReroll
    ? `<button class="ghost small" data-reroll="${instId}" ${tokens > 0 ? '' : 'disabled'}>重抽詞綴（券 ×${tokens}）</button>`
    : '';
  root.innerHTML = `
    <div class="eq-header">
      <div class="eq-name bag-item ${def.rarity}" style="display:inline-block;padding:2px 8px">${def.name}</div>
      <span style="margin-left:6px;color:var(--muted);font-size:11px">${GAME_DATA.SLOT_LABELS[def.slot]} · ${def.rarity}${forge ? ' +' + forge : ''}</span>
    </div>
    <div class="eq-section"><div class="eq-section-title">基礎屬性（白值，依強化提升）</div>${baseRows}</div>
    <div class="eq-section"><div class="eq-section-title">固定效果</div>${fixedHtml}</div>
    <div class="eq-section"><div class="eq-section-title">隨機詞綴 ${rerollBtn}</div>${affixHtml}</div>
    <div class="eq-section"><div class="eq-section-title">鑲嵌 (${socketCount} 孔)</div>${socketHtml}</div>
    ${setHtml}
  `;
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
  // 戰力評估
  let assessment, assessClass;
  if (cpRatio >= 1.5) { assessment = '戰力遠超 BOSS，勝券在握'; assessClass = 'safe'; }
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
        <div class="raid-subtitle">CP ${d.cp.toLocaleString()} · 難度 ×${d.difficultyMul || 1} · 需畢業 Lv ${d.requiredLv}</div>
        <div class="raid-lore">${lore}</div>
        ${d.warning ? `<div class="raid-warning">⚠ ${d.warning}</div>` : ''}
        <div class="raid-section-title">通關獎勵</div>
        <div class="raid-rewards">${rewards}</div>
        <div class="raid-section-title">戰力評估</div>
        <div class="raid-assessment ${assessClass}">
          <div>你的戰力：<b>${myCP.toLocaleString()}</b> vs BOSS <b>${d.cp.toLocaleString()}</b> (${(cpRatio * 100).toFixed(0)}%)</div>
          <div style="margin-top:4px">${assessment}</div>
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
    // 無盡塔：先檢查並扣入場券
    if (d.isEndless) {
      const ok = GAME_STATE.consumePass('pass-endless', 1);
      if (!ok) {
        toast('入場券不足！從寶箱中可低機率掉落「虛無通行證」', 'error');
        return;
      }
      // 房主開無盡塔也要廣播，讓 guest 自動跟進並扣自己入場券
      if (window.MP_API && MP_API.isHost() && MP_API.isConnected()) {
        MP_API.broadcastRaidLaunch(d.id);
        const teamSize = Object.keys(MP_API.getPlayers()).length + 1;
        toast(`房主開無盡塔 — ${teamSize} 人團進入：${d.name}（扣 1 張通行證）`, 'gold');
      } else {
        toast(`進入無盡塔：${d.name}（扣 1 張通行證）`, 'gold');
      }
    } else {
      // 房主：廣播 raid-launch 給朋友
      if (window.MP_API && MP_API.isHost()) {
        MP_API.broadcastRaidLaunch(d.id);
        const teamSize = Object.keys(MP_API.getPlayers()).length + 1;
        toast(`房主開戰 — ${teamSize} 人團進入：${d.name}`, 'gold');
      } else {
        toast(`進入襲擊戰：${d.name}`, 'error');
      }
    }
    // 關閉上一場的結算彈窗（避免擋住戰鬥畫面）
    const resultOverlay = document.getElementById('resultOverlay');
    if (resultOverlay) resultOverlay.classList.add('hidden');
    win.style.display = '';
    win.classList.add('hidden');
    PIXEL.setScene({ regionId: GAME_DATA.getRegionByDungeon(d.id).id });
    startBattle(d.id, GAME_STATE.state.activeCharId);
  });
  body.querySelector('button[data-raid-close]')?.addEventListener('click', () => {
    win.style.display = '';
    win.classList.add('hidden');
  });
};

// ============================================================================
// 製作藍圖預覽
// ============================================================================
window.showCraftPreview = function(equipId) {
  const def = GAME_DATA.findEquipment(equipId);
  if (!def) return;
  const win = document.getElementById('winCraftPreview');
  const body = document.getElementById('tabCraftPreview');
  if (!win || !body) return;

  const SLOT_NAME = { weapon: '武器', head: '頭部', top: '上身', bottom: '下身', feet: '腳部' };
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
      card.className = 'fighter-card enemy-card' + (useBigCard ? ' endless-boss-card' : '');
      card.dataset.idx = i;
      // 立繪優先順序：BOSS 個別 portrait > 無盡塔 dungeon.bossPortrait > 像素 portrait
      const dungeon = GAME_DATA.getDungeon(BATTLE.dungeonId);
      let portraitHtml = '';
      if (e.portrait) {
        portraitHtml = `<img src="${e.portrait}" alt="${e.name}" style="width:100%;height:100%;object-fit:contain">`;
      } else if (BATTLE._endlessMode && dungeon && dungeon.bossPortrait) {
        portraitHtml = `<img src="${dungeon.bossPortrait}" alt="${e.name}" style="width:100%;height:100%;object-fit:contain">`;
      }
      // 護盾條（只有有 shieldConfig 的 BOSS 才渲染）
      const shieldHtml = e.shieldConfig
        ? `<div class="enemy-shield" style="margin-top:2px;height:6px;background:#3a1a4a;border-radius:3px;overflow:hidden;display:none">
             <div class="shield-fill" style="height:100%;background:linear-gradient(90deg,#ff5e5e,#a000ff);width:0%"></div>
           </div>
           <div class="shield-text" style="font-size:10px;color:#ff8a8a;text-align:center;margin-top:1px;display:none"></div>`
        : '';
      card.innerHTML = `
        <div class="card-frame">
          <div class="portrait">${portraitHtml}</div>
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
    // 護盾條 + 即死倒數
    const shieldEl = card.querySelector('.enemy-shield');
    const shieldTxt = card.querySelector('.shield-text');
    if (shieldEl && shieldTxt) {
      if (e.shield > 0) {
        shieldEl.style.display = 'block';
        shieldTxt.style.display = 'block';
        const shFill = shieldEl.querySelector('.shield-fill');
        if (shFill) shFill.style.width = ((e.shield / e.shieldMax) * 100) + '%';
        shieldTxt.textContent = `⚠ 護盾 ${Math.floor(e.shield).toLocaleString()} / ${e.shieldMax.toLocaleString()} · 破盾 ${Math.max(0, e.shieldBreakTimer).toFixed(1)}s`;
      } else {
        shieldEl.style.display = 'none';
        shieldTxt.style.display = 'none';
      }
    }
    card.classList.toggle('active-target', e === BATTLE.enemy);
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
      if (cp < d.cp * 0.7) cpClass += ' high';
      else if (cp > d.cp * 2) cpClass += ' easy';
      row.className = klass;
      // 特殊類型標籤
      let typeTag = '';
      if (d.special === 'exp') typeTag = '<span style="color:var(--exp);font-size:10px;margin-left:4px">經驗</span>';
      else if (d.special === 'mat') typeTag = '<span style="color:var(--shard);font-size:10px;margin-left:4px">材料</span>';
      else if (d.special === 'forge') typeTag = '<span style="color:var(--gold);font-size:10px;margin-left:4px">強化</span>';
      else if (d.isRaid) typeTag = '<span style="color:var(--hp-enemy);font-size:10px;margin-left:4px">RAID</span>';
      else if (d.isEndless) {
        const passCount = (cs && cs.bag && cs.bag.passes && cs.bag.passes['pass-endless']) || 0;
        typeTag = `<span style="color:var(--accent);font-size:10px;margin-left:4px">✦ 通行證 ×${passCount}</span>`;
      }
      // Lv 99 顯示「需畢業」，其他顯示「需 LvN」
      const lvTag = d.requiredLv
        ? `<span style="font-size:10px;color:${lvOk ? 'var(--muted)' : 'var(--hp-enemy)'};margin-left:4px">${d.requiredLv >= 99 ? '需畢業' : `需 Lv${d.requiredLv}`}</span>`
        : '';
      row.innerHTML = `
        <div class="dungeon-name">${d.name}${typeTag}${lvTag}${_activeClearedDungeons()[d.id] ? ' <span style="color:var(--hp-self);font-size:10px">已通</span>' : ''}</div>
        <div class="${cpClass}">CP ${d.cp}</div>
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
function renderForge() {
  const root = document.getElementById('tabForge');
  const cs = GAME_STATE.state.characters[GAME_STATE.state.activeCharId];
  root.innerHTML = '';
  if (!cs || !cs.equip) return;

  for (const slot of GAME_DATA.EQUIPMENT_SLOTS) {
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
      const cost = GAME_DATA.forgeCost(lvl);
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
    const next = GAME_DATA.SMITH_EFFECTS.find(e => e.stage > stage);
    const effectsList = GAME_DATA.SMITH_EFFECTS.map(e => {
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
  const curLv = inst.forge || 0;
  const cost = GAME_DATA.forgeCost(curLv);
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
    const label = GAME_DATA.SLOT_LABELS[slot];
    const sec = document.createElement('div');
    sec.className = 'bag-section';
    sec.innerHTML = `<h4>${label}</h4>`;
    const grid = document.createElement('div');
    grid.className = 'bag-grid';
    const instances = Object.entries(_activeBag().equipment).filter(([id, inst]) => {
      const def = GAME_DATA.findEquipment(inst.itemId);
      if (!def || def.slot !== slot) return false;
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
    const g = lc.endlessGranted || { mats: {}, gems: [], shard: 0 };
    const matHtml = Object.entries(g.mats || {}).map(([n, q]) =>
      `<span class="result-loot-item" style="color:${TIER_COLOR[n] || 'var(--text)'}">${n} +${q}</span>`
    ).join('');
    const gemHtml = (g.gems || []).map(name => `<span class="result-loot-item">💎 ${name}</span>`).join('');
    const shardHtml = (g.shard > 0) ? `<span class="result-loot-item shard">魂晶 +${g.shard}</span>` : '';
    lootEl.innerHTML = (shardHtml + matHtml + gemHtml) || '<span class="result-loot-item">未達階梯 I，無獎勵</span>';
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
      // 無盡塔：guest 也要扣自己 1 張入場券（按設定「每人扣 1 張」）
      if (d.isEndless) {
        const ok = GAME_STATE.consumePass('pass-endless', 1);
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
      startBattle(d.id, GAME_STATE.state.activeCharId);
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
