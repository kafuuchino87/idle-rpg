// ===========================================================================
// 狀態管理與存檔（v2：含創角、等級解鎖、轉職、共鳴）
// ===========================================================================

const SAVE_KEY = 'veilreach.save.v4';  // 沿用 key，但內部 version=5

// Wave 29：bag/clearedDungeons/pendingUnlocks/pendingJobChoice 改成「每角色獨立」
// 共用：gold、shard、globalBuffs、共鳴、playerNickname
function makeInitialState() {
  return {
    version: 5,
    createdAt: Date.now(),
    lastSaved: Date.now(),

    hasCharacter: false,

    selectedDungeonId: 'sleep-forest',
    autoRun: true,

    // ===== 共用資源 =====
    gold: 200,
    shard: 0,

    characters: {},
    activeCharId: null,

    // 玩家暱稱（跨所有角色共用，多人連線顯示用；非角色名）
    playerNickname: '',

    // ===== 共鳴（共用，畢業後共同累積）=====
    resonance: 0,
    resonanceExp: 0,
    resonanceUnlocked: false,
    resonancePoints: { atk: 0, def: 0, hp: 0, crit: 0, critDmg: 0, spd: 0, dmgReduce: 0, cdReduce: 0, vsBoss: 0, skillDmg: 0, maxMp: 0 },

    // 全域 buff（卷軸類，戰鬥內外都計時，存到存檔以 expiresAt 為準）
    globalBuffs: [],  // [{ potionId, stat, value, expiresAt }]

    // 唯一 ID 計數器（給裝備 instance 用，跨角色不重複）
    nextInstId: 1,
  };
}

// 預設「空 bag」 — 給每個新角色用
function makeEmptyBag() {
  return {
    materials: {},
    equipment: {},
    gems: {},
    potions: {},
    chests: {},
    passes: {},        // 無盡塔等副本入場券
    rerollTokens: 0,
    magicStones: {},   // 魔力石庫存：{ 'mstone-red': qty, ... }
  };
}

// 取目前角色 / 目前角色的 bag — 所有「來自當前 UI 操作」的 helper 都用這個
function activeChar() {
  return STATE.characters[STATE.activeCharId] || null;
}
function activeBag() {
  const cs = activeChar();
  if (!cs) return null;
  if (!cs.bag) cs.bag = makeEmptyBag();
  return cs.bag;
}

const SKILL_SLOTS = 5;

const MAX_CHARACTERS = 8;

function makeCharacterState(blueprintId, customName, slotIdx) {
  const bp = GAME_DATA.getCharacterBlueprint(blueprintId);
  const id = (slotIdx == null || slotIdx === 1) ? blueprintId : `${blueprintId}#${slotIdx}`;
  return {
    id,
    blueprintId,
    customName: customName || bp.name,
    level: 1,
    exp: 0,
    jobPath: null,
    jobTier: 0,
    graduated: false,
    equip: { weapon: null, head: null, top: null, bottom: null, feet: null, ring1: null, ring2: null },
    unlockedSkills: [],
    unlockedPassives: [],
    equippedSkills: [null, null, null, null, null],
    // 藥水欄：3 格 { potionId, threshold (HP/MP 百分比 0-1，僅 HP/MP 有意義) }
    potionSlots: [
      { potionId: null, threshold: 0.4 },  // HP slot (HP <= 40% 時自動喝)
      { potionId: null, threshold: 0.3 },  // MP slot (MP <= 30% 時自動喝)
      { potionId: null, threshold: 0 },    // Buff slot (持續時間結束時自動喝)
    ],
    // Wave 29：每角色獨立的資料
    bag: { materials: { '粗鋼': 5 }, equipment: {}, gems: {}, potions: {}, chests: {}, rerollTokens: 0 },
    clearedDungeons: {},
    pendingUnlocks: [],
    pendingJobChoice: 0,
  };
}

// 建一個裝備 instance，回傳 instId
// Wave 30：加 charId 參數 — 戰利品掉落時可指定目標角色（不指定則寫到 active）
function createEquipInstance(itemId, withAffixes, charId) {
  const def = GAME_DATA.findEquipment(itemId);
  if (!def) return null;
  const cs = charId ? STATE.characters[charId] : activeChar();
  if (!cs) return null;
  if (!cs.bag) cs.bag = makeEmptyBag();
  const instId = 'inst_' + (STATE.nextInstId++);
  cs.bag.equipment[instId] = {
    itemId,
    forge: 0,
    affixes: withAffixes ? GAME_DATA.rollAffixes(def.rarity, def.slot === 'ring') : [],
  };
  return instId;
}

// 自動把新解鎖技能塞進空槽（普攻不佔槽）
function autoEquipSkill(cs, skillId) {
  if (!cs.equippedSkills) cs.equippedSkills = [null, null, null, null, null];
  const sk = GAME_DATA.SKILLS[skillId];
  if (!sk || sk.isBasic) return;
  if (cs.equippedSkills.includes(skillId)) return;
  for (let i = 0; i < SKILL_SLOTS; i++) {
    if (cs.equippedSkills[i] == null) {
      cs.equippedSkills[i] = skillId;
      return;
    }
  }
  // 沒空槽就不裝，讓玩家自己換
}

let STATE = loadState() || makeInitialState();
let SAVE_TIMER = null;

// Wave 31：STATE 就緒後補齊任何漏掉的等級解鎖（修「直設 level 跳過 gainExp」遺漏的 unlocks）
if (STATE && STATE.characters) {
  for (const id in STATE.characters) {
    try { catchUpUnlocks(STATE.characters[id]); }
    catch (e) { console.warn('[catchUpUnlocks]', id, e); }
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== 4 && parsed.version !== 5) return null;
    // 補欄位：舊存檔可能缺 blueprintId
    if (parsed.characters) {
      for (const id in parsed.characters) {
        const cs = parsed.characters[id];
        if (!cs.blueprintId) cs.blueprintId = id.split('#')[0];
      }
    }
    if (!parsed.globalBuffs) parsed.globalBuffs = [];
    // ★ 一次性遷移：清掉已過期 buff、合併同 potionId 重複（修舊 activateGlobalBuff bug 堆積的）
    if (Array.isArray(parsed.globalBuffs)) {
      const now = Date.now();
      const merged = new Map();
      for (const b of parsed.globalBuffs) {
        if (!b || !b.potionId || !b.expiresAt) continue;
        if (b.expiresAt <= now) continue;  // 過期掉
        const cur = merged.get(b.potionId);
        if (cur) {
          // 同 potionId 取剩餘時間最長的（合併成一條）
          if (b.expiresAt > cur.expiresAt) cur.expiresAt = b.expiresAt;
        } else {
          merged.set(b.potionId, { ...b });
        }
      }
      parsed.globalBuffs = Array.from(merged.values());
    }
    if (parsed.characters) {
      for (const id in parsed.characters) {
        const cs = parsed.characters[id];
        if (!cs.potionSlots) cs.potionSlots = [
          { potionId: null, threshold: 0.4 },
          { potionId: null, threshold: 0.3 },
          { potionId: null, threshold: 0 },
        ];
      }
    }
    // ===== Wave 30.7：確保 nextInstId 永遠有效（修「新角武器消失」的根因）=====
    // 若 nextInstId 不是有效數字 → createEquipInstance 會生 'inst_NaN'，5 件裝備互相覆蓋
    if (typeof parsed.nextInstId !== 'number' || isNaN(parsed.nextInstId) || parsed.nextInstId < 1) {
      // 掃描所有已存在的 instId，從最大值+1 開始
      let maxId = 0;
      const scanBag = (bag) => {
        if (!bag || !bag.equipment) return;
        for (const instId in bag.equipment) {
          const m = String(instId).match(/^inst_(\d+)$/);
          if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
        }
      };
      if (parsed.bag) scanBag(parsed.bag);  // v4 全域 bag
      if (parsed.characters) {
        for (const cid in parsed.characters) scanBag(parsed.characters[cid].bag);
      }
      parsed.nextInstId = maxId + 1;
      console.warn(`[Wave 30.7] nextInstId 異常，重設為 ${parsed.nextInstId}（掃描現有最大 instId）`);
    }
    // ===== Wave 29：v4 → v5 遷移（背包/副本/解鎖通知/轉職選擇 → 每角色獨立） =====
    if (parsed.version === 4) {
      migrateV4toV5(parsed);
    }
    // Wave 29.1：每次載入都做一次自癒（防止舊存檔殘留問題）
    selfHealEquipment(parsed);
    // Wave 30.3：補發遺失的 starter 練習裝（每 slot 獨立 + 強制存檔）
    healMissingStarterGear(parsed);
    // Wave 31：強化系統大改後，一次性把所有裝備 forge 歸零讓玩家體驗新曲線
    // 只跑一次，靠 forgeResetV1 旗標（存在 STATE 上）
    if (!parsed.forgeResetV1) {
      let totalCount = 0, totalLv = 0;
      if (parsed.characters) {
        for (const cid in parsed.characters) {
          const bag = parsed.characters[cid].bag;
          if (!bag || !bag.equipment) continue;
          let csCount = 0;
          for (const instId in bag.equipment) {
            const inst = bag.equipment[instId];
            if (inst && inst.forge > 0) {
              totalLv += inst.forge;
              inst.forge = 0;
              csCount++;
            }
          }
          if (csCount > 0) {
            if (!bag.materials) bag.materials = {};
            // 補償（每件 +0~+10 累積消耗約：星鋼 50、精鋼 30、神鋼 5）
            const refund = { '星鋼': 50 * csCount, '精鋼': 30 * csCount, '神鋼': 5 * csCount };
            for (const [n, q] of Object.entries(refund)) {
              bag.materials[n] = (bag.materials[n] || 0) + q;
            }
            totalCount += csCount;
          }
        }
      }
      parsed.forgeResetV1 = true;
      console.log(`[forgeResetV1] 重置 ${totalCount} 件裝備強化（總計 ${totalLv} 等），退補償材料`);
    }
    // 一次性遷移：戒指詞綴池範圍修正 — 把所有舊戒指 reroll（新池 = 原最高 ~ 原最高×2）
    if (!parsed.ringAffixFixV1) {
      let ringCount = 0;
      if (parsed.characters) {
        for (const cid in parsed.characters) {
          const bag = parsed.characters[cid].bag;
          if (!bag || !bag.equipment) continue;
          for (const instId in bag.equipment) {
            const inst = bag.equipment[instId];
            if (!inst) continue;
            const def = GAME_DATA.findEquipment(inst.itemId);
            if (def && def.slot === 'ring') {
              inst.affixes = GAME_DATA.rollAffixes(def.rarity, true);
              ringCount++;
            }
          }
        }
      }
      parsed.ringAffixFixV1 = true;
      console.log(`[ringAffixFixV1] 重抽 ${ringCount} 枚戒指詞綴（新範圍）`);
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
    } catch (e) {
      console.warn('[Wave 30.3] 自癒後寫回 localStorage 失敗', e);
    }
    return parsed;
  } catch (e) {
    console.warn('讀取存檔失敗', e);
    return null;
  }
}

// v4 → v5：把 STATE 上的 bag/clearedDungeons/pendingUnlocks/pendingJobChoice 搬到「每角色獨立」
function migrateV4toV5(p) {
  const charIds = Object.keys(p.characters || {});
  // 取「沒 # 後綴」的當主角，否則最早建的（按 slot 編號排序）
  let primary = charIds.find(id => !id.includes('#'));
  if (!primary && charIds.length > 0) {
    primary = charIds.sort((a, b) => {
      const aN = parseInt(a.split('#')[1] || '1', 10);
      const bN = parseInt(b.split('#')[1] || '1', 10);
      return aN - bN;
    })[0];
  }
  // 補各角色預設欄位
  for (const cid of charIds) {
    const cs = p.characters[cid];
    if (!cs.bag) cs.bag = { materials: {}, equipment: {}, gems: {}, potions: {}, chests: {}, rerollTokens: 0 };
    if (!cs.clearedDungeons) cs.clearedDungeons = {};
    if (!cs.pendingUnlocks) cs.pendingUnlocks = [];
    if (cs.pendingJobChoice == null) cs.pendingJobChoice = 0;
  }

  const oldBag = p.bag || {};
  const oldEquipment = oldBag.equipment || {};

  // 步驟 1：每個角色穿戴中的裝備 → 移到他自己 cs.bag.equipment
  // Wave 30：若多個角色 cs.equip 指向同一 instance（v4 髒數據），為後處理者深拷貝
  // 確保兩個角色都能保有獨立的「自己穿著的那件」
  for (const cid of charIds) {
    const cs = p.characters[cid];
    if (!cs.equip) continue;
    for (const slot of Object.keys(cs.equip)) {
      const instId = cs.equip[slot];
      if (!instId) continue;
      if (oldEquipment[instId]) {
        // 第一個遇到的角色 → 拿原 instance
        cs.bag.equipment[instId] = oldEquipment[instId];
        delete oldEquipment[instId];
      } else {
        // 已被前面角色拿走 → 為當前角色 deep clone 一份，並改 cs.equip 指向新 instId
        let source = null;
        for (const ocid of charIds) {
          if (ocid === cid) break;
          const other = p.characters[ocid];
          if (other.bag && other.bag.equipment && other.bag.equipment[instId]) {
            source = other.bag.equipment[instId];
            break;
          }
        }
        if (source) {
          const newId = 'inst_' + (p.nextInstId || 1);
          p.nextInstId = (p.nextInstId || 1) + 1;
          cs.bag.equipment[newId] = JSON.parse(JSON.stringify(source));
          cs.equip[slot] = newId;
          console.log(`[Wave 30 migrate] 共享 instance ${instId} → 為 ${cid} 複製成 ${newId}`);
        } else {
          // 找不到來源 → 清空 slot
          cs.equip[slot] = null;
        }
      }
    }
  }

  // 步驟 2：剩下的（沒人穿的閒置裝備、材料、寶石、藥水、寶箱、券）→ 都歸主角
  if (primary) {
    const cs = p.characters[primary];
    Object.assign(cs.bag.materials, oldBag.materials || {});
    Object.assign(cs.bag.equipment, oldEquipment);  // 剩下的閒置裝備
    Object.assign(cs.bag.gems, oldBag.gems || {});
    Object.assign(cs.bag.potions, oldBag.potions || {});
    Object.assign(cs.bag.chests, oldBag.chests || {});
    cs.bag.rerollTokens = (cs.bag.rerollTokens || 0) + (oldBag.rerollTokens || 0);
    cs.clearedDungeons = { ...(p.clearedDungeons || {}), ...cs.clearedDungeons };
    cs.pendingUnlocks = (p.pendingUnlocks || []).concat(cs.pendingUnlocks || []);
    cs.pendingJobChoice = p.pendingJobChoice || cs.pendingJobChoice || 0;
  }

  // 移除舊欄位
  delete p.bag;
  delete p.clearedDungeons;
  delete p.pendingUnlocks;
  delete p.pendingJobChoice;
  p.version = 5;
  console.log('[Wave 29] 存檔 v4 → v5 遷移完成，主角=' + primary + '，已將每角色穿戴中的裝備分發到自己 bag');
}

// Wave 30：自癒檢查 — 共享 instance 改為「複製」而非「搶」
// 流程：
// 1. 掃描所有角色 cs.equip → 找出 (cid, slot, instId) 三元組
// 2. 對於某 instId 被多個角色指向：找到「真正擁有者」（cs.bag 有它的人），其他角色 deep clone
// 3. 對於某 instId 任何 bag 都沒有：清空 slot（無法救回）
function selfHealEquipment(p) {
  if (!p.characters) return;

  // Phase A：建立「instId → 真正擁有者 cid」對應表
  const realOwner = {};  // instId → cid
  for (const cid in p.characters) {
    const cs = p.characters[cid];
    if (!cs.bag || !cs.bag.equipment) continue;
    for (const instId in cs.bag.equipment) {
      if (!realOwner[instId]) {
        realOwner[instId] = cid;
      } else {
        // 同個 instId 同時在多個 bag 裡？
        // 這不應該發生（v5 結構保證 instId 唯一歸屬）
        // 若真發生，保留第一個發現的當主，後續的會被清掉
        console.warn(`[Wave 30] instance ${instId} 同時在 ${realOwner[instId]} 和 ${cid} 的 bag — 清理重複`);
        delete cs.bag.equipment[instId];
      }
    }
  }

  // Phase B：檢查每個 cs.equip 指向，必要時複製
  for (const cid in p.characters) {
    const cs = p.characters[cid];
    if (!cs.equip) continue;
    if (!cs.bag) cs.bag = makeEmptyBag();
    if (!cs.bag.equipment) cs.bag.equipment = {};
    for (const slot of Object.keys(cs.equip)) {
      const instId = cs.equip[slot];
      if (!instId) continue;
      if (cs.bag.equipment[instId]) continue;  // 自己已有 → OK
      const owner = realOwner[instId];
      if (owner && owner !== cid) {
        // 別人有 → 為自己複製一份（不搶走）
        const sourceInst = p.characters[owner].bag.equipment[instId];
        if (sourceInst) {
          const newId = 'inst_' + (p.nextInstId || 1);
          p.nextInstId = (p.nextInstId || 1) + 1;
          cs.bag.equipment[newId] = JSON.parse(JSON.stringify(sourceInst));
          cs.equip[slot] = newId;
          console.log(`[Wave 30] 共享 instance ${instId} → 為 ${cid} 複製成 ${newId}`);
        }
      } else {
        // 沒人有 → instance 失效，清空 slot
        console.warn(`[Wave 30] cs.equip[${slot}]=${instId} 在任何 bag 都找不到，清空槽位（${cid}）`);
        cs.equip[slot] = null;
      }
    }
  }
}

// Wave 30.4：補救「缺特定 slot 裝備」的角色 — 三層邏輯
// 第 1 層：cs.equip[slot] 指向不存在的 inst → 清空
// 第 2 層：cs.equip[slot] 為空 + bag 有同 slot 裝備 → 自動穿上最高階一件
// 第 3 層：cs.equip[slot] 為空 + bag 沒同 slot 裝備 → 補發 starter
function healMissingStarterGear(p) {
  if (!p.characters) return;
  // Wave 30.9：武器 starter 依角色 blueprint 動態選；其他部位共用
  function getStarterId(slot, blueprintId) {
    if (slot === 'weapon') {
      const wp = (GAME_DATA.ITEMS.equipment || []).find(e =>
        e.slot === 'weapon' && (e.tier || 0) === 0 && e.owner === blueprintId
      );
      return wp ? wp.id : 'eq-weap-prac';
    }
    return { head: 'eq-head-prac', top: 'eq-top-prac', bottom: 'eq-bot-prac', feet: 'eq-feet-prac', ring1: 'eq-ring-n', ring2: 'eq-ring-n' }[slot];
  }
  const SLOTS = ['weapon', 'head', 'top', 'bottom', 'feet', 'ring1', 'ring2'];
  console.log('[Wave 30.9] healMissingStarterGear 開始檢查');
  for (const cid in p.characters) {
    const cs = p.characters[cid];
    if (!cs.equip) cs.equip = { weapon: null, head: null, top: null, bottom: null, feet: null, ring1: null, ring2: null };
    if (!cs.bag) cs.bag = makeEmptyBag();
    if (!cs.bag.equipment) cs.bag.equipment = {};

    // 印出當前角色狀態（用 JSON 字串強制展開）
    const bagItemDetails = [];
    for (const instId in cs.bag.equipment) {
      const inst = cs.bag.equipment[instId];
      const def = (typeof GAME_DATA !== 'undefined') && GAME_DATA.findEquipment(inst.itemId);
      bagItemDetails.push({
        instId,
        itemId: inst.itemId,
        slot: def ? def.slot : '?',
        rarity: def ? def.rarity : '?',
        owner: def ? (def.owner || '-') : '?',
      });
    }
    console.log(`[Wave 30.5] ${cid} blueprintId=${cs.blueprintId}`);
    console.log(`[Wave 30.5] ${cid} cs.equip=${JSON.stringify(cs.equip)}`);
    console.log(`[Wave 30.5] ${cid} bag (${bagItemDetails.length} 件)=${JSON.stringify(bagItemDetails)}`);

    for (const slot of SLOTS) {
      const starterId = getStarterId(slot, cs.blueprintId);
      // ── 第 1 層：清空指向不存在的 inst ──
      if (cs.equip[slot] && !cs.bag.equipment[cs.equip[slot]]) {
        console.warn(`[Wave 30.9] ${cid}.${slot} → cs.equip 指向 ${cs.equip[slot]} 但 bag 沒此 instance → 清空`);
        cs.equip[slot] = null;
      }
      if (cs.equip[slot]) {
        console.log(`[Wave 30.5] ${cid}.${slot} 已穿著 ${cs.equip[slot]} → 跳過`);
        continue;
      }

      // ── 第 2 層：bag 裡找同 slot 最高階自動穿上 ──
      // 戒指：兩個格子都接受 def.slot='ring'，需避免兩格搶同一 inst → 用 alreadyAssigned 排除
      const alreadyAssigned = new Set(Object.values(cs.equip).filter(Boolean));
      let bestInstId = null;
      let bestTier = -1;
      let skipReasons = [];
      for (const instId in cs.bag.equipment) {
        if (alreadyAssigned.has(instId)) continue;
        const inst = cs.bag.equipment[instId];
        const def = GAME_DATA.findEquipment(inst.itemId);
        if (!def) { skipReasons.push(`${instId}:def-not-found`); continue; }
        if (!GAME_DATA.slotAcceptsItem(slot, def.slot)) continue;
        if (slot === 'weapon' && def.owner && def.owner !== cs.blueprintId) {
          skipReasons.push(`${instId}:owner-mismatch(${def.owner}!=${cs.blueprintId})`);
          continue;
        }
        const tier = def.tier || 0;
        if (tier > bestTier) {
          bestTier = tier;
          bestInstId = instId;
        }
      }
      if (bestInstId) {
        cs.equip[slot] = bestInstId;
        const def = GAME_DATA.findEquipment(cs.bag.equipment[bestInstId].itemId);
        console.log(`[Wave 30.5] ✓ ${cid}.${slot} 自動穿上 ${def ? def.name : bestInstId}（tier ${bestTier}）`);
        continue;
      }
      if (skipReasons.length) {
        console.log(`[Wave 30.5] ${cid}.${slot} bag 雖有同 slot 但全被過濾：${skipReasons.join(', ')}`);
      }

      // ── 第 3 層：bag 完全沒同 slot 裝備 → 補發 starter ──
      const def = GAME_DATA.findEquipment(starterId);
      if (!def) {
        console.warn(`[Wave 30.5] starter ${starterId} 找不到`);
        continue;
      }
      const instId = 'inst_' + (p.nextInstId || 1);
      p.nextInstId = (p.nextInstId || 1) + 1;
      // 戒指 N 有 1 條詞綴，其他練習裝 N 無詞綴
      const affixes = def.slot === 'ring' ? GAME_DATA.rollAffixes(def.rarity, true) : [];
      cs.bag.equipment[instId] = { itemId: starterId, forge: 0, affixes };
      cs.equip[slot] = instId;
      console.log(`[Wave 30.5] ✓ ${cid}.${slot} 補發 starter → ${def.name}（${instId}）`);
    }
  }
}
function saveState() {
  STATE.lastSaved = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(STATE));
}
function scheduleSave() {
  if (SAVE_TIMER) clearTimeout(SAVE_TIMER);
  SAVE_TIMER = setTimeout(saveState, 800);
}
function resetState() {
  localStorage.removeItem(SAVE_KEY);
  STATE = makeInitialState();
}

// --------------------------------------------------------------------------
// 建立新角色
// --------------------------------------------------------------------------
function createCharacter(blueprintId, customName) {
  const count = Object.keys(STATE.characters).length;
  if (count >= MAX_CHARACTERS) return null;
  // 找下一個空編號（用 slotIdx 避免跟下面的裝備 slot 名稱衝突）
  let slotIdx = 1;
  while (STATE.characters[slotIdx === 1 ? blueprintId : `${blueprintId}#${slotIdx}`]) slotIdx++;
  const cs = makeCharacterState(blueprintId, customName, slotIdx);
  STATE.characters[cs.id] = cs;
  STATE.activeCharId = cs.id;
  STATE.hasCharacter = true;
  if (count === 0) STATE.gold = 200;

  // Wave 30.7：再次保險 — 確保 nextInstId 是有效數字
  if (typeof STATE.nextInstId !== 'number' || isNaN(STATE.nextInstId) || STATE.nextInstId < 1) {
    console.warn('[Wave 30.7] createCharacter 偵測 nextInstId 異常:', STATE.nextInstId, '→ 重設為 1');
    STATE.nextInstId = 1;
  }

  // Wave 30.9：starter 武器按 blueprintId 選對應 owner
  // 雪羽 → eq-mirror-prac、月凜 → eq-weap-prac
  const starterWeapon = (GAME_DATA.ITEMS.equipment || []).find(e =>
    e.slot === 'weapon' && (e.tier || 0) === 0 && e.owner === blueprintId
  );
  const starterMap = {
    weapon: starterWeapon ? starterWeapon.id : 'eq-weap-prac',
    head:   'eq-head-prac',
    top:    'eq-top-prac',
    bottom: 'eq-bot-prac',
    feet:   'eq-feet-prac',
    ring1:  'eq-ring-n',
    ring2:  'eq-ring-n',
  };
  // Wave 30.7：直接寫入 cs.bag 而不依賴 createEquipInstance（避免 active 切換 race）
  for (const [slotKey, itemId] of Object.entries(starterMap)) {
    const def = GAME_DATA.findEquipment(itemId);
    if (!def) {
      console.error(`[Wave 30.7] starter ${itemId} 定義找不到`);
      continue;
    }
    const instId = 'inst_' + (STATE.nextInstId++);
    // 戒指 N 有 1 條詞綴，其他練習裝 N 無詞綴
    const affixes = def.slot === 'ring' ? GAME_DATA.rollAffixes(def.rarity, true) : [];
    cs.bag.equipment[instId] = { itemId, forge: 0, affixes };
    cs.equip[slotKey] = instId;
    console.log(`[Wave 30.7] 創角 ${cs.id} 穿上 ${slotKey} = ${instId}（${def.name}）`);
  }

  // 防呆驗證：5 件 starter 都成功穿上才繼續
  for (const slotKey of Object.keys(starterMap)) {
    if (!cs.equip[slotKey] || !cs.bag.equipment[cs.equip[slotKey]]) {
      console.error(`[Wave 30.7] ❌ 創角驗證失敗 ${cs.id}.${slotKey}=${cs.equip[slotKey]}`);
    }
  }

  // 1 級解鎖
  applyLevelUnlocks(cs, 1, []);
  saveState();
  return cs;
}

// --------------------------------------------------------------------------
// 套用「達到 lv 時」的解鎖（會 push 到 pendingUnlocks）
// --------------------------------------------------------------------------
function requireTierForLv(lv) {
  if (lv >= 75) return 3;
  if (lv >= 50) return 2;
  if (lv >= 25) return 1;
  return 0;
}

function applyLevelUnlocks(cs, lv, queue) {
  const bp = GAME_DATA.getCharacterBlueprint(cs.blueprintId || cs.id);
  if (!bp || !bp.unlocks) return;
  for (const u of bp.unlocks) {
    if (u.lv !== lv) continue;

    if (u.type === 'skill') {
      if (u.pathAny || u.path === cs.jobPath) {
        const need = u.path ? requireTierForLv(u.lv) : 0;
        if (cs.jobTier >= need && !cs.unlockedSkills.includes(u.skill)) {
          cs.unlockedSkills.push(u.skill);
          autoEquipSkill(cs, u.skill);
          const sk = GAME_DATA.SKILLS[u.skill];
          if (sk) queue.push({ kind: 'skill', name: sk.name, lv });
        }
      }
    } else if (u.type === 'passive') {
      if (u.pathAny || u.path === cs.jobPath) {
        const need = u.path ? requireTierForLv(u.lv) : 0;
        if (cs.jobTier >= need && !cs.unlockedPassives.includes(u.passive)) {
          cs.unlockedPassives.push(u.passive);
          const ps = GAME_DATA.PASSIVES[u.passive];
          if (ps) queue.push({ kind: 'passive', name: ps.name, lv });
        }
      }
    } else if (u.type === 'job') {
      // 只設「下一階」轉職；高於下一階的留待後續（每角色獨立）
      if (u.tier === cs.jobTier + 1 && (cs.pendingJobChoice || 0) === 0) {
        cs.pendingJobChoice = u.tier;
      }
      queue.push({ kind: 'job', tier: u.tier, lv });
    } else if (u.type === 'graduate') {
      cs.graduated = true;
      STATE.resonanceUnlocked = true;
      queue.push({ kind: 'graduate', lv });
    }
  }
}

// ============================================================================
// catchUpUnlocks：補齊任何漏掉的等級解鎖（修「直設 level 跳過 gainExp」造成的缺）
// 從 Lv 1 ~ cs.level 全部跑過 applyLevelUnlocks，只補不重複
function catchUpUnlocks(cs) {
  if (!cs) return { added: 0 };
  const bp = GAME_DATA.getCharacterBlueprint(cs.blueprintId || cs.id);
  if (!bp || !bp.unlocks) return { added: 0 };
  cs.unlockedSkills = cs.unlockedSkills || [];
  cs.unlockedPassives = cs.unlockedPassives || [];
  cs.pendingUnlocks = cs.pendingUnlocks || [];
  let added = 0;
  for (let lv = 1; lv <= cs.level; lv++) {
    const beforeS = cs.unlockedSkills.length, beforeP = cs.unlockedPassives.length;
    applyLevelUnlocks(cs, lv, cs.pendingUnlocks);
    added += (cs.unlockedSkills.length - beforeS) + (cs.unlockedPassives.length - beforeP);
  }
  return { added };
}

// Wave 28：跨路線技能 BUG 修復
// 舊版本創角時可能讓單一角色同時解鎖 A 路線與 B 路線的技能/被動。
// auditJobPath 回傳衝突詳情；fixJobPath 清除指定路線的對方資料。
// ============================================================================
function auditJobPath(cs) {
  if (!cs) return null;
  const bp = GAME_DATA.getCharacterBlueprint(cs.blueprintId || cs.id);
  if (!bp || !bp.unlocks) return null;
  // 建索引：skillId → path、passiveId → path
  const skillPath = {}, passivePath = {};
  for (const u of bp.unlocks) {
    if (u.path) {
      if (u.type === 'skill' && u.skill) skillPath[u.skill] = u.path;
      if (u.type === 'passive' && u.passive) passivePath[u.passive] = u.path;
    }
  }
  const result = { aSkills: [], bSkills: [], aPassives: [], bPassives: [] };
  for (const sid of (cs.unlockedSkills || [])) {
    const p = skillPath[sid];
    if (p === 'A') result.aSkills.push(sid);
    if (p === 'B') result.bSkills.push(sid);
  }
  for (const pid of (cs.unlockedPassives || [])) {
    const p = passivePath[pid];
    if (p === 'A') result.aPassives.push(pid);
    if (p === 'B') result.bPassives.push(pid);
  }
  result.hasConflict = (result.aSkills.length > 0 && result.bSkills.length > 0)
    || (result.aPassives.length > 0 && result.bPassives.length > 0);
  result.currentPath = cs.jobPath || null;
  return result;
}

function fixJobPath(cs, keepPath) {
  if (!cs || (keepPath !== 'A' && keepPath !== 'B')) return null;
  const audit = auditJobPath(cs);
  if (!audit) return null;
  const dropPath = keepPath === 'A' ? 'B' : 'A';
  const dropSkills = keepPath === 'A' ? audit.bSkills : audit.aSkills;
  const dropPassives = keepPath === 'A' ? audit.bPassives : audit.aPassives;
  // 1. 從 unlockedSkills / unlockedPassives 移除
  cs.unlockedSkills = (cs.unlockedSkills || []).filter(s => !dropSkills.includes(s));
  cs.unlockedPassives = (cs.unlockedPassives || []).filter(p => !dropPassives.includes(p));
  // 2. 從 equippedSkills 槽移除（保持陣列長度 + null 槽）
  if (cs.equippedSkills) {
    cs.equippedSkills = cs.equippedSkills.map(s => dropSkills.includes(s) ? null : s);
  }
  // 3. 修正 jobPath
  cs.jobPath = keepPath;
  // 4. 若有保留路線的技能卻 jobTier=0（極端情況），補成至少 1
  if ((audit[keepPath === 'A' ? 'aSkills' : 'bSkills'].length > 0) && (cs.jobTier || 0) < 1) {
    cs.jobTier = 1;
  }
  saveState();
  return {
    droppedSkills: dropSkills.length,
    droppedPassives: dropPassives.length,
    keepPath, dropPath,
  };
}

// 玩家在轉職介面選了路線後呼叫
function selectJobPath(pathId, tier) {
  const cs = STATE.characters[STATE.activeCharId];
  if (!cs) return;
  if (!cs.pendingUnlocks) cs.pendingUnlocks = [];
  if (tier === 1) cs.jobPath = pathId;
  cs.jobTier = tier;
  cs.pendingJobChoice = 0;

  // 補解鎖：所有等級 <= 當前等級、路線符合的內容
  const newQueue = [];
  const bp = GAME_DATA.getCharacterBlueprint(cs.blueprintId || cs.id);
  // 只看：tier 切換之後新增的內容
  const tierLvMin = tier === 1 ? 25 : tier === 2 ? 50 : 75;
  const tierLvMax = tier === 1 ? 49 : tier === 2 ? 74 : 99;
  for (const u of bp.unlocks) {
    if (u.lv > cs.level) continue;
    if (u.lv < tierLvMin || u.lv > tierLvMax) continue;
    if (u.type === 'skill' && u.path === cs.jobPath) {
      if (!cs.unlockedSkills.includes(u.skill)) {
        cs.unlockedSkills.push(u.skill);
        autoEquipSkill(cs, u.skill);
        const sk = GAME_DATA.SKILLS[u.skill];
        if (sk) newQueue.push({ kind: 'skill', name: sk.name, lv: u.lv });
      }
    }
    if (u.type === 'passive' && u.path === cs.jobPath) {
      if (!cs.unlockedPassives.includes(u.passive)) {
        cs.unlockedPassives.push(u.passive);
        const ps = GAME_DATA.PASSIVES[u.passive];
        if (ps) newQueue.push({ kind: 'passive', name: ps.name, lv: u.lv });
      }
    }
  }
  cs.pendingUnlocks.push(...newQueue);

  // 若已超過下一階轉職等級，立刻排隊下一階選擇
  const nextTierLv = tier === 1 ? 50 : tier === 2 ? 75 : 999;
  if (cs.level >= nextTierLv && cs.jobTier < tier + 1) {
    cs.pendingJobChoice = tier + 1;
    cs.pendingUnlocks.push({ kind: 'job', tier: tier + 1, lv: nextTierLv });
  }
  saveState();
}

// --------------------------------------------------------------------------
// 經驗 / 等級
// --------------------------------------------------------------------------
// Wave 30：加 charId 參數 — 戰利品 gainExp 應該給戰鬥角色（BATTLE.charId），不是 UI 角色
function gainExp(n, charId) {
  const cs = STATE.characters[charId || STATE.activeCharId];
  if (!cs) return;
  if (!cs.pendingUnlocks) cs.pendingUnlocks = [];
  n = Math.floor(n);
  if (cs.graduated) {
    // 進入共鳴等級（共鳴依然共用）
    STATE.resonanceExp += n;
    while (STATE.resonanceExp >= resonanceExpFor(STATE.resonance)) {
      STATE.resonanceExp -= resonanceExpFor(STATE.resonance);
      STATE.resonance += 1;
      // 共鳴升級通知掛在當前 active 角色
      cs.pendingUnlocks.push({ kind: 'resonance', lv: STATE.resonance });
    }
    return;
  }
  cs.exp += n;
  let leveled = false;
  while (cs.level < GAME_DATA.MAX_LEVEL && cs.exp >= GAME_DATA.expForLevel(cs.level)) {
    cs.exp -= GAME_DATA.expForLevel(cs.level);
    cs.level += 1;
    leveled = true;
    applyLevelUnlocks(cs, cs.level, cs.pendingUnlocks);
  }
  if (cs.level >= GAME_DATA.MAX_LEVEL) {
    cs.exp = 0;
  }
}

function resonanceExpFor(rl) {
  // R0 → R1 = 1000；每級 +4%（緩指數）
  // R10 ≈ 1.5k、R30 ≈ 3.2k、R50 ≈ 7.1k、R100 ≈ 50k、R200 ≈ 2.5M
  return Math.floor(1000 * Math.pow(1.04, rl));
}

// 共鳴上限規則：atk/def/hp 無上限；expMul/goldMul 上限 100；其他屬性 50 點
const RESONANCE_DEFAULT = { atk: 0, def: 0, hp: 0, crit: 0, critDmg: 0, spd: 0, dmgReduce: 0, cdReduce: 0, vsBoss: 0, skillDmg: 0, defPierce: 0, maxMp: 0, expMul: 0, goldMul: 0 };
const RESONANCE_UNCAPPED = new Set(['atk', 'def', 'hp']);
const RESONANCE_CAP_100 = new Set(['expMul', 'goldMul']);
const RESONANCE_CAP = 50;

function _normalizeResonance() {
  if (!STATE.resonancePoints) STATE.resonancePoints = { ...RESONANCE_DEFAULT };
  else for (const k in RESONANCE_DEFAULT) if (!(k in STATE.resonancePoints)) STATE.resonancePoints[k] = 0;
}
function getResonanceUnspent() {
  _normalizeResonance();
  const total = Object.values(STATE.resonancePoints).reduce((a, b) => a + b, 0);
  return STATE.resonance - total;
}
function getResonanceCap(stat) {
  if (RESONANCE_UNCAPPED.has(stat)) return Infinity;
  if (RESONANCE_CAP_100.has(stat)) return 100;
  return RESONANCE_CAP;
}

function allocateResonance(stat, count) {
  _normalizeResonance();
  count = count || 1;
  if (getResonanceUnspent() < count) return false;
  const cur = STATE.resonancePoints[stat] || 0;
  const cap = getResonanceCap(stat);
  if (cur + count > cap) return false;  // 超過上限
  STATE.resonancePoints[stat] = cur + count;
  scheduleSave();
  return true;
}

function resetResonance() {
  STATE.resonancePoints = { ...RESONANCE_DEFAULT };
  scheduleSave();
}

// --------------------------------------------------------------------------
// 戰力 / 屬性計算
// --------------------------------------------------------------------------
function getCharacterBlueprint(id) { return GAME_DATA.getCharacterBlueprint(id); }
function findItem(category, id) {
  // 相容用：category 為 'equipment' 找裝備定義
  if (category === 'equipment') return GAME_DATA.findEquipment(id);
  return null;
}

function effectiveStats(charId) {
  const cs = STATE.characters[charId];
  if (!cs) return null;
  const bp = getCharacterBlueprint(cs.blueprintId || charId);
  const s = { ...bp.baseStats };

  // 等級加成
  s.atk += (cs.level - 1) * 3;
  s.def += (cs.level - 1) * 1.5;
  s.hp  += (cs.level - 1) * 25;

  // 5 部位裝備（baseStats × forgeMul + 隨機詞綴 + 固定效果）
  for (const slot of GAME_DATA.EQUIPMENT_SLOTS) {
    const instId = cs.equip ? cs.equip[slot] : null;
    if (!instId) continue;
    const inst = cs.bag && cs.bag.equipment ? cs.bag.equipment[instId] : null;
    if (!inst) continue;
    const def = GAME_DATA.findEquipment(inst.itemId);
    if (!def) continue;
    const fmult = GAME_DATA.forgeMultiplier(inst.forge || 0);
    for (const [k, v] of Object.entries(def.stats)) {
      const isPercentLike = (k === 'crit' || k === 'spd' || k === 'critDmg' || k === 'dmgReduce');
      const addV = isPercentLike ? v : v * fmult;
      s[k] = (s[k] || 0) + addV;
    }
    for (const a of (inst.affixes || [])) {
      s[a.stat] = (s[a.stat] || 0) + a.value;
    }
    // 固定效果（可能依強化等級變化）
    if (def.fixed && def.fixed.effect) {
      for (const [k, raw] of Object.entries(def.fixed.effect)) {
        const v = GAME_DATA.resolveFixedValue(raw, inst.forge || 0);
        if (k === 'allMul') {
          s.atk *= (1 + v); s.def *= (1 + v); s.hp *= (1 + v);
        } else {
          s[k] = (s[k] || 0) + v;
        }
      }
    }
    // 鑲嵌寶石效果
    if (inst.sockets) {
      for (const gemId of inst.sockets) {
        if (!gemId) continue;
        const gem = GAME_DATA.findGem(gemId);
        if (!gem) continue;
        s[gem.stat] = (s[gem.stat] || 0) + gem.value;
      }
    }
    // 魔力石賦予（只有 weapon 有 imbue 槽）
    // 「整數型屬性」走專屬 multiplier：atk → atkPct, def → defPct, hp → hpPct, maxMp → maxMpPct
    // 「比率型屬性」直接加：crit, critDmg, skillDmg, vsBoss, dmgReduce, cdReduce, defPierce, spd
    if (inst.imbue && def.slot === 'weapon') {
      for (const color of ['red', 'blue', 'yellow', 'mega']) {
        const slots = inst.imbue[color] || [];
        for (const slot of slots) {
          if (!slot.effect) continue;
          for (const [stat, value] of Object.entries(slot.effect)) {
            if (stat === 'atk')        s.atkPct   = (s.atkPct   || 0) + value;
            else if (stat === 'def')   s.defPct   = (s.defPct   || 0) + value;
            else if (stat === 'hp')    s.hpPct    = (s.hpPct    || 0) + value;
            else if (stat === 'maxMp') s.maxMpPct = (s.maxMpPct || 0) + value;
            else s[stat] = (s[stat] || 0) + value;
          }
        }
      }
    }
    // 鍛造效果（終焉套裝：每件依 smithStage 累加已解鎖效果）
    if (GAME_DATA.isSmithEligible(def) && inst.smithStage > 0) {
      const unlocked = GAME_DATA.getSmithUnlockedEffects(inst.smithStage, def);
      for (const eff of unlocked) {
        for (const [k, v] of Object.entries(eff.effect)) {
          s[k] = (s[k] || 0) + v;
        }
      }
    }
    // UR 武器成長（ur2 系列：依 urStage 累加已解鎖效果）
    if (GAME_DATA.isUrGrowable && GAME_DATA.isUrGrowable(def) && inst.urStage > 0) {
      const unlocked = GAME_DATA.getUrGrowthUnlocked(inst.urStage);
      for (const eff of unlocked) {
        for (const [k, v] of Object.entries(eff.effect)) {
          s[k] = (s[k] || 0) + v;
        }
      }
    }
  }

  // ===== 套裝效果（依穿戴件數累加，allMul 屬於乘法後階段） =====
  const setCounts = GAME_DATA.countSetPieces(cs);
  let setAllMul = 0; // 累積所有套裝的 allMul，最後乘上
  for (const [setId, count] of Object.entries(setCounts)) {
    const setDef = GAME_DATA.findSet(setId);
    if (!setDef) continue;
    for (const bonus of setDef.bonuses) {
      if (count < bonus.pieces) continue;
      // 直接 stat 效果
      if (bonus.effect) {
        for (const [k, v] of Object.entries(bonus.effect)) {
          if (k === 'allMul') setAllMul += v;
          else s[k] = (s[k] || 0) + v;
        }
      }
      // 觸發類別的被動部分（例如 4 件套自帶 +200 maxMp）
      if (bonus.passive) {
        for (const [k, v] of Object.entries(bonus.passive)) {
          s[k] = (s[k] || 0) + v;
        }
      }
    }
  }
  if (setAllMul > 0) {
    s.atk *= (1 + setAllMul);
    s.def *= (1 + setAllMul);
    s.hp  *= (1 + setAllMul);
  }

  // 被動（保留套裝/裝備已 set 的值，缺少時才初始化）
  if (s.critDmg == null) s.critDmg = 1.8;
  else s.critDmg = 1.8 + (s.critDmg || 0);  // 套裝可能設了 +X，這裡加到基線
  s.summonMul = 1.0;
  if (s.dmgReduce == null) s.dmgReduce = 0;
  if (s.cdReduce == null)  s.cdReduce = 0;
  if (s.vsBoss == null)    s.vsBoss = 0;
  if (s.skillDmg == null)  s.skillDmg = 0;
  if (s.defPierce == null) s.defPierce = 0;
  // ===== MP 屬性 =====
  if (s.maxMp == null) s.maxMp = 400;
  else s.maxMp += 400;
  s.mpRegen = 8 + cs.level * 0.15 + (s.spd || 0) * 2;
  s.mpPerHit = 10 + Math.floor(cs.level * 0.08);
  for (const pid of cs.unlockedPassives) {
    const ps = GAME_DATA.PASSIVES[pid];
    if (ps && ps.apply) ps.apply(s);
  }

  // ===== 共鳴點數加成 =====
  // atk/def/hp 無上限：每點少量加成
  // 其他屬性 50 點上限：每點較大加成
  const pts = STATE.resonancePoints || {};
  s.atk += (pts.atk || 0) * 2.5;
  s.def += (pts.def || 0) * 1.5;
  s.hp  += (pts.hp || 0) * 30;
  s.crit      += (pts.crit || 0) * 0.005;       // 50pts = +25%
  s.critDmg   += (pts.critDmg || 0) * 0.02;     // 50pts = +100%
  s.spd       += (pts.spd || 0) * 0.01;         // 50pts = +0.5
  s.dmgReduce += (pts.dmgReduce || 0) * 0.005;  // 50pts = +25%
  s.cdReduce  += (pts.cdReduce || 0) * 0.005;   // 50pts = +25%
  s.vsBoss    += (pts.vsBoss || 0) * 0.01;      // 50pts = +50%
  s.skillDmg  += (pts.skillDmg || 0) * 0.005;   // 50pts = +25%
  s.defPierce += (pts.defPierce || 0) * 0.015;  // 50pts = +75% 無視防禦
  s.maxMp     += (pts.maxMp || 0) * 10;         // 50pts = +500 (400→900)

  // ===== 屬性上限 =====
  s._cdReduceRaw = s.cdReduce;  // 保留原始值給 UI 顯示「達上限」提示
  if (s.cdReduce > 0.50) s.cdReduce = 0.50;  // CD 縮減硬上限 50%（防止技能秒放）
  if (s.defPierce > 0.95) s.defPierce = 0.95;  // 無視防禦上限 95%（保留 5% 給敵方）

  // ===== % 屬性套用（在所有加成後最後計算）=====
  // 整數型屬性的「%加成」：不顯示在面板上、直接乘到原值；CP 跟著上升
  // 來源：鍛造、被動、寶石、魔力石賦予
  if (s.atkPct   && s.atkPct   > 0) s.atk   = s.atk   * (1 + s.atkPct);
  if (s.defPct   && s.defPct   > 0) s.def   = s.def   * (1 + s.defPct);
  if (s.hpPct    && s.hpPct    > 0) s.hp    = s.hp    * (1 + s.hpPct);
  if (s.maxMpPct && s.maxMpPct > 0) s.maxMp = s.maxMp * (1 + s.maxMpPct);

  return {
    atk: Math.floor(s.atk),
    def: Math.floor(s.def),
    hp:  Math.floor(s.hp),
    spd: s.spd,
    crit: s.crit,
    critDmg: s.critDmg,
    summonMul: s.summonMul,
    dmgReduce: s.dmgReduce,
    cdReduce: s.cdReduce,
    cdReduceRaw: s._cdReduceRaw,   // 套用上限前的原始值（UI 用）
    vsBoss: s.vsBoss,
    skillDmg: s.skillDmg || 0,
    defPierce: s.defPierce || 0,
    lowHpDmg: s.lowHpDmg || 0,
    maxMp: Math.floor(s.maxMp),
    mpRegen: Math.round(s.mpRegen * 10) / 10,
    mpPerHit: Math.floor(s.mpPerHit),
  };
}

function combatPower(charId) {
  const s = effectiveStats(charId);
  if (!s) return 0;
  return Math.floor(
    // ── 主數值（白值類）──
    s.atk * 6 +                     // 主輸出
    s.def * 4 +                     // 主減傷數值
    s.hp * 0.5 +                    // 生命池
    // ── 速度（範圍小但價值高）──
    s.spd * 80 +                    // 1.78 → 142
    // ── 百分比類（全面 ×10000：每 1% 加 100 CP，視覺合理）──
    s.crit * 10000 +                // 50% → 5,000
    s.critDmg * 10000 +             // 500% → 50,000
    (s.dmgReduce || 0) * 10000 +    // 60% → 6,000
    (s.cdReduce || 0) * 10000 +     // 50% → 5,000
    (s.vsBoss || 0) * 10000 +       // 100% → 10,000
    (s.skillDmg || 0) * 10000 +     // 100% → 10,000
    (s.defPierce || 0) * 10000 +    // 75% → 7,500
    // ── MP 池（超過基礎部分）──
    Math.max(0, (s.maxMp || 400) - 400) * 0.5
  );
}

// --------------------------------------------------------------------------
// 副本解鎖
// --------------------------------------------------------------------------
function isDungeonUnlocked(dungeonId) {
  const d = GAME_DATA.getDungeon(dungeonId);
  if (!d) return false;
  if (d.unlock === 0) return true;
  const cs = activeChar();
  return !!(cs && cs.clearedDungeons && cs.clearedDungeons[d.unlock]);
}

// --------------------------------------------------------------------------
// 各種獲得
// --------------------------------------------------------------------------
function gainGold(n) { STATE.gold = Math.max(0, Math.floor(STATE.gold + n)); }
function gainShard(n) { STATE.shard = Math.max(0, Math.floor(STATE.shard + n)); }

// 材料升階合成（使用 active 角色的背包）
function craftMaterial(recipeId, qty) {
  qty = qty || 1;
  const rec = GAME_DATA.findMaterialRecipe(recipeId);
  if (!rec) return { ok: false, reason: '找不到配方' };
  const cs = STATE.characters[STATE.activeCharId];
  if (cs && cs.level < (rec.requiredLv || 0)) return { ok: false, reason: `需要 Lv ${rec.requiredLv}` };
  const bag = activeBag();
  if (!bag) return { ok: false, reason: '無 active 角色' };
  // 檢查材料 / 金錢
  const totalGold = rec.gold * qty;
  if (STATE.gold < totalGold) return { ok: false, reason: '金幣不足' };
  for (const [m, n] of Object.entries(rec.from)) {
    const need = n * qty;
    if ((bag.materials[m] || 0) < need) return { ok: false, reason: `${m} 不足（需 ${need}）` };
  }
  // 扣除 + 給材料
  gainGold(-totalGold);
  for (const [m, n] of Object.entries(rec.from)) consumeMaterial(m, n * qty);
  gainMaterial(rec.to, rec.toQty * qty);
  scheduleSave();
  return { ok: true, toName: rec.to, toQty: rec.toQty * qty };
}

// 魂晶兌換
function exchangeShard(exchangeId) {
  const ex = GAME_DATA.findShardExchange(exchangeId);
  if (!ex) return { ok: false, reason: '找不到此兌換項目' };
  if (STATE.shard < ex.cost) return { ok: false, reason: `魂晶不足（需 ${ex.cost}）` };
  STATE.shard -= ex.cost;
  const r = ex.reward;
  let label = '';
  if (r.kind === 'material') {
    gainMaterial(r.name, r.qty);
    label = `${r.name} ×${r.qty}`;
  } else if (r.kind === 'gem-random') {
    const [tMin, tMax] = r.tier;
    const pool = GAME_DATA.GEMS.filter(g => g.tier >= tMin && g.tier <= tMax);
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (picked) {
      gainGem(picked.id, 1);
      label = picked.name;
    }
  } else if (r.kind === 'reroll-token') {
    const bag = activeBag();
    if (bag) bag.rerollTokens = (bag.rerollTokens || 0) + r.qty;
    label = `詞綴重抽券 ×${r.qty}`;
  } else if (r.kind === 'potion') {
    gainPotion(r.id, r.qty);
    const p = GAME_DATA.findPotion(r.id);
    label = `${p ? p.name : r.id} ×${r.qty}`;
  }
  scheduleSave();
  return { ok: true, label, costShard: ex.cost };
}

// ============================================================================
// 魔力石賦予系統
// ============================================================================
// 把魔力石加進玩家庫存
function gainMagicStone(stoneId, qty, charId) {
  const cs = charId ? STATE.characters[charId] : activeChar();
  if (!cs) return;
  if (!cs.bag) cs.bag = makeEmptyBag();
  if (!cs.bag.magicStones) cs.bag.magicStones = {};
  cs.bag.magicStones[stoneId] = (cs.bag.magicStones[stoneId] || 0) + qty;
}

// 賦予一顆魔力石到武器
// 回傳：{ ok, reason?, slotIdx?, effect? }
function imbueMagicStone(weaponInstId, stoneId) {
  const bag = activeBag();
  if (!bag) return { ok: false, reason: '無 active 角色' };
  const inst = bag.equipment[weaponInstId];
  if (!inst) return { ok: false, reason: '找不到武器' };
  const def = GAME_DATA.findEquipment(inst.itemId);
  if (!def || def.slot !== 'weapon') return { ok: false, reason: '只能對武器賦予' };
  const stoneDef = GAME_DATA.findMagicStone(stoneId);
  if (!stoneDef) return { ok: false, reason: '無效的魔力石' };
  // 檢查庫存
  const have = (bag.magicStones && bag.magicStones[stoneId]) || 0;
  if (have < 1) return { ok: false, reason: `${stoneDef.name} 庫存不足` };
  // 檢查金幣
  const cost = GAME_DATA.IMBUE_COSTS[stoneDef.color] || 0;
  if ((STATE.gold || 0) < cost) return { ok: false, reason: `金幣不足（需 ${cost.toLocaleString()}）` };
  // 檢查槽位上限
  if (!inst.imbue) inst.imbue = { red: [], blue: [], yellow: [], mega: [] };
  const slots = inst.imbue[stoneDef.color];
  const cap = GAME_DATA.IMBUE_SLOT_CAPS[stoneDef.color] || 0;
  if (slots.length >= cap) return { ok: false, reason: `${stoneDef.name} 槽位已滿（${cap} 顆）` };
  // 扣資源 + roll 數值
  STATE.gold -= cost;
  bag.magicStones[stoneId] -= 1;
  if (bag.magicStones[stoneId] <= 0) delete bag.magicStones[stoneId];
  const effect = GAME_DATA.rollImbueEffect(stoneId);
  slots.push({ stoneId, effect });
  scheduleSave();
  return { ok: true, slotIdx: slots.length - 1, effect, cost, color: stoneDef.color };
}

// 拆除一個賦予槽（石頭直接銷毀，扣拆除費；要重洗就再丟新石頭）
function removeImbueSlot(weaponInstId, color, slotIdx) {
  const bag = activeBag();
  if (!bag) return { ok: false, reason: '無 active 角色' };
  const inst = bag.equipment[weaponInstId];
  if (!inst || !inst.imbue) return { ok: false, reason: '武器無賦予' };
  const slots = inst.imbue[color];
  if (!slots || slotIdx < 0 || slotIdx >= slots.length) return { ok: false, reason: '無效的槽位' };
  const cost = GAME_DATA.IMBUE_COSTS.remove || 0;
  if ((STATE.gold || 0) < cost) return { ok: false, reason: `拆除需 ${cost.toLocaleString()} 金幣` };
  slots.splice(slotIdx, 1);
  STATE.gold -= cost;
  scheduleSave();
  return { ok: true, cost };
}

// 計算一件武器所有賦予效果的總和（給 effectiveStats 用）
function getImbueTotal(inst) {
  const total = {};
  if (!inst || !inst.imbue) return total;
  for (const color of ['red', 'blue', 'yellow', 'mega']) {
    const slots = inst.imbue[color] || [];
    for (const slot of slots) {
      if (!slot.effect) continue;
      for (const [stat, value] of Object.entries(slot.effect)) {
        total[stat] = (total[stat] || 0) + value;
      }
    }
  }
  return total;
}

// 詞綴重抽（消耗一張券）
function rerollAffixes(instId) {
  const bag = activeBag();
  if (!bag) return { ok: false, reason: '無 active 角色' };
  const inst = bag.equipment[instId];
  if (!inst) return { ok: false, reason: '找不到裝備' };
  const def = GAME_DATA.findEquipment(inst.itemId);
  if (!def) return { ok: false, reason: '裝備資料異常' };
  if (!inst.affixes || inst.affixes.length === 0) return { ok: false, reason: '此裝備無詞綴可重抽' };
  if ((bag.rerollTokens || 0) < 1) return { ok: false, reason: '缺重抽券（商店可兌換）' };
  bag.rerollTokens -= 1;
  inst.affixes = GAME_DATA.rollAffixes(def.rarity, def.slot === 'ring');
  scheduleSave();
  return { ok: true, name: def.name, newAffixes: inst.affixes };
}
// Wave 30：加 charId 參數 — 戰利品掉落可指定目標角色
function gainMaterial(name, n, charId) {
  const cs = charId ? STATE.characters[charId] : activeChar();
  if (!cs) return;
  if (!cs.bag) cs.bag = makeEmptyBag();
  cs.bag.materials[name] = (cs.bag.materials[name] || 0) + n;
}
function consumeMaterial(name, n) {
  const bag = activeBag();
  if (!bag) return false;
  const cur = bag.materials[name] || 0;
  if (cur < n) return false;
  bag.materials[name] = cur - n;
  if (bag.materials[name] <= 0) delete bag.materials[name];
  return true;
}
// 已被 createEquipInstance 取代

// ========== 入場券（無盡塔等用）==========
function gainPass(passId, n = 1, charId) {
  const cs = charId ? STATE.characters[charId] : activeChar();
  if (!cs) return;
  if (!cs.bag) cs.bag = makeEmptyBag();
  if (!cs.bag.passes) cs.bag.passes = {};
  cs.bag.passes[passId] = (cs.bag.passes[passId] || 0) + n;
}
function consumePass(passId, n = 1) {
  const cs = activeChar();
  if (!cs || !cs.bag || !cs.bag.passes) return false;
  const cur = cs.bag.passes[passId] || 0;
  if (cur < n) return false;
  cs.bag.passes[passId] = cur - n;
  if (cs.bag.passes[passId] <= 0) delete cs.bag.passes[passId];
  return true;
}

// ========== 寶箱 ==========
// Wave 30：加 charId 參數
function gainChest(chestId, n = 1, charId) {
  const cs = charId ? STATE.characters[charId] : activeChar();
  if (!cs) return;
  if (!cs.bag) cs.bag = makeEmptyBag();
  if (!cs.bag.chests) cs.bag.chests = {};
  cs.bag.chests[chestId] = (cs.bag.chests[chestId] || 0) + n;
}
function consumeChest(chestId, n = 1) {
  const bag = activeBag();
  if (!bag || !bag.chests) return false;
  const cur = bag.chests[chestId] || 0;
  if (cur < n) return false;
  bag.chests[chestId] = cur - n;
  if (bag.chests[chestId] <= 0) delete bag.chests[chestId];
  return true;
}
// 開箱：抽獎並實際發放，回傳 [{ kind, label, qty/inst }]
function openChest(chestId) {
  if (!consumeChest(chestId, 1)) return { ok: false, reason: '沒有此寶箱' };
  const rewards = GAME_DATA.rollChestRewards(chestId);
  const granted = [];
  for (const r of rewards) {
    if (r.kind === 'gold') {
      gainGold(r.qty);
      granted.push({ label: `金 +${r.qty}`, kind: 'gold' });
    } else if (r.kind === 'shard') {
      gainShard(r.qty);
      granted.push({ label: `魂晶 +${r.qty}`, kind: 'shard' });
    } else if (r.kind === 'material') {
      gainMaterial(r.name, r.qty);
      granted.push({ label: `${r.name} +${r.qty}`, kind: 'material' });
    } else if (r.kind === 'potion') {
      gainPotion(r.id, r.qty);
      const p = GAME_DATA.findPotion(r.id);
      granted.push({ label: `${p ? p.name : r.id} +${r.qty}`, kind: 'potion', rarity: p?.rarity });
    } else if (r.kind === 'gem-random') {
      // 從 tier 範圍隨機選一顆魔法石
      const [tMin, tMax] = r.tier;
      const pool = GAME_DATA.GEMS.filter(g => g.tier >= tMin && g.tier <= tMax);
      const picked = pool[Math.floor(Math.random() * pool.length)];
      if (picked) {
        gainGem(picked.id, 1);
        granted.push({ label: `${picked.name} ×1`, kind: 'gem', rarity: picked.rarity });
      }
    } else if (r.kind === 'equip-rarity') {
      // 從該稀有度隨機選一件裝備（非 owner 限定的隨機部位）
      const pool = GAME_DATA.ITEMS.equipment.filter(e => e.rarity === r.rarity && e.tier > 0);
      const cs = STATE.characters[STATE.activeCharId];
      const filtered = pool.filter(e => !e.owner || (cs && e.owner === cs.blueprintId));
      const picked = filtered[Math.floor(Math.random() * filtered.length)];
      if (picked) {
        const instId = createEquipInstance(picked.id, true);
        granted.push({ label: `[${picked.rarity}] ${picked.name}`, kind: 'equip', rarity: picked.rarity, instId });
      }
    } else if (r.kind === 'pass') {
      // 無盡塔入場券（虛無通行證）
      gainPass(r.id, r.qty);
      const p = GAME_DATA.findPass(r.id);
      granted.push({ label: `${p ? p.name : r.id} ×${r.qty}`, kind: 'pass', rarity: p?.rarity || 'SSR' });
    } else if (r.kind === 'magicstone') {
      // 魔力石（賦予用）— 顯示顏色 icon + 名稱
      gainMagicStone(r.id, r.qty || 1);
      const s = GAME_DATA.findMagicStone(r.id);
      granted.push({ label: `${s ? s.icon + ' ' + s.name : r.id} ×${r.qty || 1}`, kind: 'magicstone', color: s?.color, rarity: r.id === 'mstone-mega' ? 'UR' : 'SR' });
    }
  }
  return { ok: true, rewards: granted, chestName: GAME_DATA.findChest(chestId)?.name };
}

// 批次開箱：連開 n 次（最多開到擁有量），合併同類獎勵
function openChestBatch(chestId, n) {
  const bag = activeBag();
  if (!bag) return { ok: false, reason: '無 active 角色' };
  const have = bag.chests?.[chestId] || 0;
  if (have < 1) return { ok: false, reason: '沒有此寶箱' };
  const actualN = Math.min(n, have);
  const accum = { gold: 0, shard: 0, materials: {}, potions: {}, passes: {}, gems: [], equips: [], magicStones: {} };
  let opened = 0;
  for (let i = 0; i < actualN; i++) {
    if (!consumeChest(chestId, 1)) break;
    opened += 1;
    const rewards = GAME_DATA.rollChestRewards(chestId);
    for (const r of rewards) {
      if (r.kind === 'gold') { gainGold(r.qty); accum.gold += r.qty; }
      else if (r.kind === 'shard') { gainShard(r.qty); accum.shard += r.qty; }
      else if (r.kind === 'material') { gainMaterial(r.name, r.qty); accum.materials[r.name] = (accum.materials[r.name] || 0) + r.qty; }
      else if (r.kind === 'potion') { gainPotion(r.id, r.qty); accum.potions[r.id] = (accum.potions[r.id] || 0) + r.qty; }
      else if (r.kind === 'pass') { gainPass(r.id, r.qty); accum.passes[r.id] = (accum.passes[r.id] || 0) + r.qty; }
      else if (r.kind === 'magicstone') { gainMagicStone(r.id, r.qty || 1); accum.magicStones[r.id] = (accum.magicStones[r.id] || 0) + (r.qty || 1); }
      else if (r.kind === 'gem-random') {
        const [tMin, tMax] = r.tier;
        const pool = GAME_DATA.GEMS.filter(g => g.tier >= tMin && g.tier <= tMax);
        const picked = pool[Math.floor(Math.random() * pool.length)];
        if (picked) { gainGem(picked.id, 1); accum.gems.push({ name: picked.name, rarity: picked.rarity }); }
      } else if (r.kind === 'equip-rarity') {
        const pool = GAME_DATA.ITEMS.equipment.filter(e => e.rarity === r.rarity && e.tier > 0);
        const cs = STATE.characters[STATE.activeCharId];
        const filtered = pool.filter(e => !e.owner || (cs && e.owner === cs.blueprintId));
        const picked = filtered[Math.floor(Math.random() * filtered.length)];
        if (picked) {
          const instId = createEquipInstance(picked.id, true);
          accum.equips.push({ name: picked.name, rarity: picked.rarity, instId });
        }
      }
    }
  }
  // 合併產出 rewards 陣列（同類合併數量；寶石按 name 合併；裝備個別列）
  const granted = [];
  if (accum.gold) granted.push({ label: `金 +${accum.gold.toLocaleString()}`, kind: 'gold' });
  if (accum.shard) granted.push({ label: `魂晶 +${accum.shard.toLocaleString()}`, kind: 'shard' });
  for (const [name, qty] of Object.entries(accum.materials)) granted.push({ label: `${name} +${qty}`, kind: 'material' });
  for (const [id, qty] of Object.entries(accum.potions)) {
    const p = GAME_DATA.findPotion(id);
    granted.push({ label: `${p ? p.name : id} +${qty}`, kind: 'potion', rarity: p?.rarity });
  }
  for (const [id, qty] of Object.entries(accum.passes)) {
    const p = GAME_DATA.findPass(id);
    granted.push({ label: `${p ? p.name : id} ×${qty}`, kind: 'pass', rarity: p?.rarity || 'SSR' });
  }
  for (const [id, qty] of Object.entries(accum.magicStones)) {
    const s = GAME_DATA.findMagicStone(id);
    granted.push({ label: `${s ? s.icon + ' ' + s.name : id} ×${qty}`, kind: 'magicstone', color: s?.color, rarity: id === 'mstone-mega' ? 'UR' : 'SR' });
  }
  const gemGroup = {};
  for (const g of accum.gems) {
    const k = `${g.name}|${g.rarity}`;
    gemGroup[k] = (gemGroup[k] || 0) + 1;
  }
  for (const [k, qty] of Object.entries(gemGroup)) {
    const [name, rarity] = k.split('|');
    granted.push({ label: `${name} ×${qty}`, kind: 'gem', rarity });
  }
  for (const e of accum.equips) granted.push({ label: `[${e.rarity}] ${e.name}`, kind: 'equip', rarity: e.rarity, instId: e.instId });
  return { ok: true, rewards: granted, chestName: GAME_DATA.findChest(chestId)?.name, opened };
}

// ========== 裝備分解 ==========
// 依稀有度回饋對應材料與金錢；強化等級加倍返還
function toggleEquipLock(instId) {
  const bag = activeBag();
  if (!bag) return false;
  const inst = bag.equipment[instId];
  if (!inst) return false;
  inst.locked = !inst.locked;
  scheduleSave();
  return inst.locked;
}

// ===== 鍛造系統（終焉套裝專屬）=====
// 機制：每次鍛造扣 50K 金 + 1 次次數，累積進度條（100% 自動升階）；1% 跳階直接 100%
// 升階後只重置進度條，hits 整個鍛造過程共用（從 +0 → +30）— 用槌子補才能繼續
function smithEquip(instId) {
  const bag = activeBag();
  if (!bag) return { ok: false, reason: '無 active 角色' };
  const inst = bag.equipment[instId];
  if (!inst) return { ok: false, reason: '找不到裝備' };
  const def = GAME_DATA.findEquipment(inst.itemId);
  if (!def) return { ok: false, reason: '裝備資料缺失' };
  if (!GAME_DATA.isSmithEligible(def)) return { ok: false, reason: '此裝備不可鍛造（限蝕痕鎧神套）' };
  const cur = inst.smithStage || 0;
  if (cur >= GAME_DATA.SMITH_MAX_STAGE) return { ok: false, reason: '已鍛造到最高階（30）' };

  // 初始化欄位
  if (inst.smithHitsLeft == null) inst.smithHitsLeft = GAME_DATA.SMITH_INITIAL_HITS;
  if (inst.smithProgress == null) inst.smithProgress = 0;

  if (inst.smithHitsLeft <= 0) return { ok: false, reason: '鍛造次數已用完，需用異界之鎚恢復' };
  if (STATE.gold < GAME_DATA.SMITH_GOLD_COST) return { ok: false, reason: `金幣不足（每次 ${GAME_DATA.SMITH_GOLD_COST.toLocaleString()}）` };

  // 扣金 + 次數
  STATE.gold -= GAME_DATA.SMITH_GOLD_COST;
  inst.smithHitsLeft -= 1;

  // 累積進度（每次 +100/保底次數）
  const capHits = GAME_DATA.smithHitsToCap(cur);
  const perHit = 100 / capHits;
  inst.smithProgress = Math.min(100, inst.smithProgress + perHit);

  // 跳階：1% 機率直接 100%
  let jumped = false;
  if (Math.random() < GAME_DATA.SMITH_JUMP_CHANCE && inst.smithProgress < 100) {
    inst.smithProgress = 100;
    jumped = true;
  }

  // 升階判定 — 進度條重置但 hits 不重置（整個鍛造過程共用一池 hits）
  let leveledUp = false;
  if (inst.smithProgress >= 100) {
    inst.smithStage = cur + 1;
    inst.smithProgress = 0;
    leveledUp = true;
  }

  scheduleSave();
  return {
    ok: true, name: def.name,
    stage: inst.smithStage,
    progress: inst.smithProgress,
    hitsLeft: inst.smithHitsLeft,
    jumped, leveledUp,
  };
}

// ===== UR 武器成長系統 =====
// 雙影獵討 ur2 系列獨享，跟鍛造完全分開的 10 階強化
function growUrWeapon(instId) {
  const bag = activeBag();
  if (!bag) return { ok: false, reason: '無 active 角色' };
  const inst = bag.equipment[instId];
  if (!inst) return { ok: false, reason: '找不到裝備' };
  const def = GAME_DATA.findEquipment(inst.itemId);
  if (!GAME_DATA.isUrGrowable(def)) return { ok: false, reason: '此武器無法成長（限 UR2 / UR3 武器系列）' };
  const cur = inst.urStage || 0;
  if (cur >= GAME_DATA.UR_GROWTH_MAX_STAGE) return { ok: false, reason: '已達最高成長階段 (10/10)' };
  const nextStage = cur + 1;
  const cost = GAME_DATA.getUrGrowthCost(nextStage, def);
  if (!cost) return { ok: false, reason: '成本資料缺失' };
  // 檢查資源
  if (STATE.gold < cost.gold) return { ok: false, reason: `金幣不足（需 ${cost.gold.toLocaleString()}）` };
  for (const [name, qty] of Object.entries(cost.mats)) {
    if ((bag.materials[name] || 0) < qty) return { ok: false, reason: `${name} 不足（需 ${qty}）` };
  }
  // 扣資源
  gainGold(-cost.gold);
  for (const [name, qty] of Object.entries(cost.mats)) consumeMaterial(name, qty);
  // 升階
  inst.urStage = nextStage;
  const newEffect = GAME_DATA.UR_GROWTH.find(e => e.stage === nextStage);
  scheduleSave();
  return { ok: true, name: def.name, stage: nextStage, effectLabel: newEffect?.label };
}

function restoreSmithHits(instId) {
  const bag = activeBag();
  if (!bag) return { ok: false, reason: '無 active 角色' };
  const inst = bag.equipment[instId];
  if (!inst) return { ok: false, reason: '找不到裝備' };
  const def = GAME_DATA.findEquipment(inst.itemId);
  if (!GAME_DATA.isSmithEligible(def)) return { ok: false, reason: '此裝備不可鍛造' };
  if ((bag.materials['異界之鎚'] || 0) < 1) return { ok: false, reason: '需要 1 把異界之鎚' };
  bag.materials['異界之鎚'] -= 1;
  if (bag.materials['異界之鎚'] <= 0) delete bag.materials['異界之鎚'];
  if (inst.smithHitsLeft == null) inst.smithHitsLeft = GAME_DATA.SMITH_INITIAL_HITS;
  inst.smithHitsLeft += GAME_DATA.SMITH_HITS_PER_HAMMER;
  scheduleSave();
  return { ok: true, hitsLeft: inst.smithHitsLeft };
}

function disassembleEquipment(instId) {
  const bag = activeBag();
  if (!bag) return { ok: false, reason: '無 active 角色' };
  const inst = bag.equipment[instId];
  if (!inst) return { ok: false, reason: '找不到裝備' };
  const def = GAME_DATA.findEquipment(inst.itemId);
  if (!def) return { ok: false, reason: '裝備資料缺失' };
  // 鎖定中不可分解
  if (inst.locked) return { ok: false, reason: '裝備已鎖定（請先解鎖）' };
  // 裝備中不可分解（只檢查 active 角色，因為背包獨立了，instId 只屬於 active）
  const cs = activeChar();
  if (cs && cs.equip && Object.values(cs.equip).includes(instId)) {
    return { ok: false, reason: `${cs.customName} 裝備中，請先卸下` };
  }
  // 取下鑲嵌寶石（退回背包）
  let gemsReturned = [];
  if (inst.sockets) {
    for (const gid of inst.sockets) {
      if (gid) { gainGem(gid, 1); gemsReturned.push(gid); }
    }
  }
  // 依稀有度返還
  const REWARDS = {
    N:   { mat: '粗鋼', mq: 1, gold: 5 },
    R:   { mat: '精鋼', mq: 1, gold: 50 },
    SR:  { mat: '星鋼', mq: 1, gold: 200 },
    SSR: { mat: '神鋼', mq: 1, gold: 800 },
    UR:  { mat: '夢晶', mq: 1, gold: 3000 },
  };
  const r = REWARDS[def.rarity] || REWARDS.N;
  const forge = inst.forge || 0;
  const matQty = r.mq + Math.ceil(forge * 0.5);
  const goldRet = Math.floor(r.gold * (1 + forge * 0.3));
  gainMaterial(r.mat, matQty);
  gainGold(goldRet);
  // 移除 instance
  delete bag.equipment[instId];
  return { ok: true, name: def.name, mat: r.mat, matQty, gold: goldRet, gems: gemsReturned };
}

// 批次分解：依條件挑出未裝備裝備一次分解（只動 active 角色）
function batchDisassemble(criteria) {
  const RARITY_ORDER = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4 };
  const maxRarityVal = RARITY_ORDER[criteria.maxRarity] ?? -1;
  const bag = activeBag();
  const cs = activeChar();
  if (!bag || !cs) return { count: 0, mats: {}, gold: 0, gems: 0 };
  const equippedSet = new Set();
  if (cs.equip) for (const v of Object.values(cs.equip)) if (v) equippedSet.add(v);
  const toDis = [];
  for (const [instId, inst] of Object.entries(bag.equipment)) {
    if (equippedSet.has(instId)) continue;
    if (inst.locked) continue;
    const def = GAME_DATA.findEquipment(inst.itemId);
    if (!def) continue;
    if (RARITY_ORDER[def.rarity] > maxRarityVal) continue;
    toDis.push(instId);
  }
  const aggregate = { count: 0, mats: {}, gold: 0, gems: 0 };
  for (const id of toDis) {
    const r = disassembleEquipment(id);
    if (r.ok) {
      aggregate.count += 1;
      aggregate.mats[r.mat] = (aggregate.mats[r.mat] || 0) + r.matQty;
      aggregate.gold += r.gold;
      aggregate.gems += r.gems.length;
    }
  }
  return aggregate;
}

// ========== 藥水 ==========
// Wave 30：加 charId 參數
function gainPotion(pid, n = 1, charId) {
  const cs = charId ? STATE.characters[charId] : activeChar();
  if (!cs) return;
  if (!cs.bag) cs.bag = makeEmptyBag();
  if (!cs.bag.potions) cs.bag.potions = {};
  cs.bag.potions[pid] = (cs.bag.potions[pid] || 0) + n;
}
function consumePotion(pid, n = 1) {
  const bag = activeBag();
  if (!bag || !bag.potions) return false;
  const cur = bag.potions[pid] || 0;
  if (cur < n) return false;
  bag.potions[pid] = cur - n;
  if (bag.potions[pid] <= 0) delete bag.potions[pid];
  return true;
}
function buyPotion(pid, qty = 1) {
  const p = GAME_DATA.findPotion(pid);
  if (!p) return { ok: false, reason: '找不到該藥水' };
  const bag = activeBag();
  if (!bag) return { ok: false, reason: '無 active 角色' };
  const totalGold = (p.cost.gold || 0) * qty;
  const totalShard = (p.cost.shard || 0) * qty;
  if (totalGold > 0 && STATE.gold < totalGold) return { ok: false, reason: '金幣不足' };
  if (totalShard > 0 && STATE.shard < totalShard) return { ok: false, reason: `魂晶不足 (需 ${totalShard})` };
  if (p.cost.mats) {
    for (const [name, q] of Object.entries(p.cost.mats)) {
      const need = q * qty;
      if ((bag.materials[name] || 0) < need) return { ok: false, reason: `${name} 不足 (需 ${need})` };
    }
  }
  if (totalGold > 0) gainGold(-totalGold);
  if (totalShard > 0) gainShard(-totalShard);
  if (p.cost.mats) for (const [name, q] of Object.entries(p.cost.mats)) consumeMaterial(name, q * qty);
  gainPotion(pid, qty);
  return { ok: true };
}
function setPotionSlot(charId, slotIdx, pid) {
  const cs = STATE.characters[charId];
  if (!cs || !cs.potionSlots) return false;
  if (slotIdx < 0 || slotIdx >= 3) return false;
  cs.potionSlots[slotIdx].potionId = pid;
  return true;
}
function setPotionThreshold(charId, slotIdx, threshold) {
  const cs = STATE.characters[charId];
  if (!cs || !cs.potionSlots) return false;
  cs.potionSlots[slotIdx].threshold = Math.max(0, Math.min(1, threshold));
  return true;
}
// 計算 global buff 加成（卷軸類）：傳入 stat 名，回傳當前加成值（已過期會自動清掉）
function getGlobalBuffMod(stat) {
  if (!STATE.globalBuffs) STATE.globalBuffs = [];
  const now = Date.now();
  STATE.globalBuffs = STATE.globalBuffs.filter(b => b.expiresAt > now);
  let v = 0;
  for (const b of STATE.globalBuffs) if (b.stat === stat) v += b.value;
  return v;
}
// 啟用 global buff（疊加：刷新到期時間或追加新的）
function activateGlobalBuff(potionId) {
  const p = GAME_DATA.findPotion(potionId);
  if (!p || p.type !== 'buff' || p.kind !== 'global') return false;
  if (!STATE.globalBuffs) STATE.globalBuffs = [];
  const now = Date.now();
  // ★ 先清掉所有過期 buff（避免堆積 / 同 potionId 的舊過期條目讓新 push 變成獨立第二筆）
  STATE.globalBuffs = STATE.globalBuffs.filter(b => b.expiresAt > now);
  // 同 potionId 已有 → 延長到期；沒有 → push 新的
  const existing = STATE.globalBuffs.find(b => b.potionId === potionId);
  if (existing) {
    existing.expiresAt += p.duration * 1000;
  } else {
    STATE.globalBuffs.push({ potionId, stat: p.stat, value: p.value, expiresAt: now + p.duration * 1000 });
  }
  return true;
}

// 出售魔法石 — 依 tier 返還金錢，可一次賣多顆
function sellGem(gemId, n = 1) {
  const gem = GAME_DATA.findGem(gemId);
  if (!gem) return { ok: false, reason: '找不到此魔法石' };
  const bag = activeBag();
  if (!bag) return { ok: false, reason: '無 active 角色' };
  const cur = (bag.gems && bag.gems[gemId]) || 0;
  if (cur < n) return { ok: false, reason: '數量不足' };
  const PRICES = { 1: 10, 2: 60, 3: 280, 4: 1500, 5: 8000 };
  const price = (PRICES[gem.tier] || 10) * n;
  consumeGem(gemId, n);
  gainGold(price);
  return { ok: true, gold: price, name: gem.name };
}
function sellGemsBatch(maxRarity) {
  const RARITY_ORDER = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4 };
  const cap = RARITY_ORDER[maxRarity] ?? -1;
  const bag = activeBag();
  if (!bag) return { count: 0, gold: 0 };
  let totalGold = 0;
  let count = 0;
  const gems = { ...(bag.gems || {}) };
  for (const [gid, qty] of Object.entries(gems)) {
    const g = GAME_DATA.findGem(gid);
    if (!g) continue;
    if (RARITY_ORDER[g.rarity] > cap) continue;
    const r = sellGem(gid, qty);
    if (r.ok) { totalGold += r.gold; count += qty; }
  }
  return { count, gold: totalGold };
}

// Wave 30：加 charId 參數
function gainGem(gemId, n = 1, charId) {
  const cs = charId ? STATE.characters[charId] : activeChar();
  if (!cs) return;
  if (!cs.bag) cs.bag = makeEmptyBag();
  if (!cs.bag.gems) cs.bag.gems = {};
  cs.bag.gems[gemId] = (cs.bag.gems[gemId] || 0) + n;
}
function consumeGem(gemId, n = 1) {
  const bag = activeBag();
  if (!bag || !bag.gems) return false;
  const cur = bag.gems[gemId] || 0;
  if (cur < n) return false;
  bag.gems[gemId] = cur - n;
  if (bag.gems[gemId] <= 0) delete bag.gems[gemId];
  return true;
}
function socketGem(instId, slotIdx, gemId) {
  const bag = activeBag();
  if (!bag) return false;
  const inst = bag.equipment[instId];
  if (!inst) return false;
  const def = GAME_DATA.findEquipment(inst.itemId);
  if (!def) return false;
  const maxSockets = GAME_DATA.socketsForRarity(def.rarity);
  if (slotIdx < 0 || slotIdx >= maxSockets) return false;
  if (!inst.sockets) inst.sockets = new Array(maxSockets).fill(null);
  if (inst.sockets[slotIdx]) return false;
  if (!consumeGem(gemId, 1)) return false;
  inst.sockets[slotIdx] = gemId;
  return true;
}
function unsocketGem(instId, slotIdx) {
  const bag = activeBag();
  if (!bag) return false;
  const inst = bag.equipment[instId];
  if (!inst || !inst.sockets) return false;
  const gemId = inst.sockets[slotIdx];
  if (!gemId) return false;
  inst.sockets[slotIdx] = null;
  return { ok: true };
}

// 取出並清空一個 pending unlock
function dequeueUnlock() {
  const cs = activeChar();
  if (!cs || !cs.pendingUnlocks) return undefined;
  return cs.pendingUnlocks.shift();
}

// 完全替換 STATE 內容（匯入存檔用，避免 race condition）
function replaceState(newState) {
  if (!newState || typeof newState !== 'object') return false;
  // 清掉現有所有 properties
  Object.keys(STATE).forEach(k => { delete STATE[k]; });
  // 複製新內容
  Object.assign(STATE, newState);
  return true;
}

// 玩家暱稱（跨角色共用）
// 用獨立 localStorage key 儲存（雙保險）— 主存檔被覆寫或損壞時仍能找回
const NICKNAME_KEY = 'veilreach.nickname';
function setPlayerNickname(name) {
  const trimmed = String(name || '').slice(0, 16).trim();
  STATE.playerNickname = trimmed;
  localStorage.setItem(NICKNAME_KEY, trimmed);  // 獨立備份
  saveState();  // 主存檔也寫
}
function getPlayerNickname() {
  // 優先讀獨立儲存（更可靠，不會被主存檔覆寫）
  return localStorage.getItem(NICKNAME_KEY) || STATE.playerNickname || '';
}
// 載入時：若主存檔有 nickname 但獨立 key 沒有，補一份
(function syncNicknameFromMainSave() {
  try {
    if (!localStorage.getItem(NICKNAME_KEY) && STATE.playerNickname) {
      localStorage.setItem(NICKNAME_KEY, STATE.playerNickname);
    } else if (localStorage.getItem(NICKNAME_KEY) && !STATE.playerNickname) {
      // 反向同步：獨立 key 有但 STATE 沒有
      STATE.playerNickname = localStorage.getItem(NICKNAME_KEY);
    }
  } catch (_) {}
})();

// 跨分頁同步：監聽 storage 事件，當其他分頁修改 localStorage 時更新本分頁
// 注意：storage 事件「不會」在同一個分頁觸發，所以這只影響「其他」分頁
window.addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY || !e.newValue) return;
  try {
    const newSave = JSON.parse(e.newValue);
    let changed = false;
    // 只同步玩家層級設定（跨角色共用）— 不動戰鬥 / 角色 / 背包等
    if (newSave.playerNickname != null && newSave.playerNickname !== STATE.playerNickname) {
      STATE.playerNickname = newSave.playerNickname;
      changed = true;
    }
    if (changed) {
      // 通知 UI：多人視窗如果開著就重繪
      if (typeof window.renderMpRoom === 'function') {
        const win = document.getElementById('winMpRoom');
        if (win && !win.classList.contains('hidden')) window.renderMpRoom();
      }
      if (typeof window.toast === 'function') {
        toast('已從其他分頁同步玩家設定', 'gold');
      }
    }
  } catch (_) {}
});

window.GAME_STATE = {
  get state() { return STATE; },
  saveState, scheduleSave, resetState, replaceState,
  createCharacter, selectJobPath, MAX_CHARACTERS,
  auditJobPath, fixJobPath, catchUpUnlocks,
  setPlayerNickname, getPlayerNickname,
  effectiveStats, combatPower,
  isDungeonUnlocked,
  gainGold, gainShard, gainExp, gainMaterial, consumeMaterial, craftMaterial,
  exchangeShard, rerollAffixes,
  gainMagicStone, imbueMagicStone, removeImbueSlot, getImbueTotal,
  gainGem, consumeGem, socketGem, unsocketGem, sellGem, sellGemsBatch,
  gainPotion, consumePotion, buyPotion, setPotionSlot, setPotionThreshold,
  getGlobalBuffMod, activateGlobalBuff,
  gainChest, consumeChest, openChest, openChestBatch,
  gainPass, consumePass,
  disassembleEquipment, batchDisassemble, toggleEquipLock,
  smithEquip, restoreSmithHits, growUrWeapon,
  findItem, getCharacterBlueprint, createEquipInstance,
  dequeueUnlock,
  resonanceExpFor, getResonanceUnspent, allocateResonance, resetResonance, getResonanceCap,
  RESONANCE_CAP, RESONANCE_UNCAPPED, RESONANCE_CAP_100,
};
