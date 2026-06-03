// ===========================================================================
// 戰鬥引擎：只使用已解鎖技能、套用被動效果
// ===========================================================================

const BATTLE = {
  running: false,
  paused: false,
  dungeonId: null,
  charId: null,
  player: null,
  enemy: null,
  enemyIndex: 0,
  enemyList: [],
  skillCDs: {},
  buffs: [],
  dots: [],
  summons: [],
  freezes: 0,
  log: [],
  speedMul: 1,
  recentSkills: [],   // 防 spam: 近期施放的技能 FIFO
  onUpdate: null,
  onLog: null,
  onClear: null,
  onFail: null,
};

// Buff 修正取值（atk/spdMul/crit/dmgReduce/summonMul 都從 buffs 累加）
function getBuffMod(key) {
  let v = 0;
  for (const b of BATTLE.buffs) if (b[key]) v += b[key];
  return v;
}

// 核心套裝觸發引擎
function triggerCoreSet(event) {
  if (!BATTLE.charId) return;
  const cs = GAME_STATE.state.characters[BATTLE.charId];
  if (!cs) return;
  const counts = GAME_DATA.countSetPieces(cs);
  for (const [setId, count] of Object.entries(counts)) {
    const setDef = GAME_DATA.findSet(setId);
    if (!setDef || !setDef.coreSet) continue;
    for (const bonus of setDef.bonuses) {
      if (!bonus.triggered) continue;
      if (count < bonus.pieces) continue;
      const t = bonus.triggered;
      if (t.event !== event) continue;
      // 處理各種觸發
      if (event === 'on-kill') {
        BATTLE.setTriggers.sun = Math.min((BATTLE.setTriggers.sun || 0) + 1, t.maxStacks);
        // 移除舊 sun buff、重推新版（疊層數）
        BATTLE.buffs = BATTLE.buffs.filter(b => b._setTrigger !== 'sun');
        BATTLE.buffs.push({
          atk: t.effect.atk * BATTLE.setTriggers.sun,
          spdMul: t.effect.spdMul * BATTLE.setTriggers.sun,
          critDmg: t.effect.critDmg * BATTLE.setTriggers.sun,
          dur: t.duration,
          _maxDur: t.duration,
          _name: `${t.name} ×${BATTLE.setTriggers.sun}`,
          _setTrigger: 'sun',
        });
        if (BATTLE.setTriggers.sun === t.maxStacks && window.logLine) logLine(`<span class="lg-skill">★ ${t.name} 達到滿層 ×${t.maxStacks}！</span>`, '');
      } else if (event === 'on-low-hp') {
        if (BATTLE.setTriggers.frost) return;  // 戰鬥內限 1 次
        BATTLE.setTriggers.frost = true;
        // 套用無敵 + 治療
        BATTLE.player.hp = Math.min(BATTLE.player.maxHp, BATTLE.player.hp + BATTLE.player.maxHp * t.healPct);
        BATTLE.buffs.push({
          dmgReduce: 0.99,  // 近似無敵
          dur: t.invulnDur,
          _maxDur: t.invulnDur,
          _name: t.name,
          _setTrigger: 'frost',
        });
        if (window.logLine) logLine(`<span class="lg-clear">★ ${t.name} 觸發！無敵 ${t.invulnDur}s + HP +${Math.floor(t.healPct*100)}%</span>`, '');
      } else if (event === 'on-skill-cast') {
        BATTLE.setTriggers.oracle = Math.min((BATTLE.setTriggers.oracle || 0) + 1, t.maxStacks);
        BATTLE.buffs = BATTLE.buffs.filter(b => b._setTrigger !== 'oracle');
        const stacks = BATTLE.setTriggers.oracle;
        const buff = { dur: 9999, _maxDur: 9999, _name: `${t.name} ×${stacks}`, _setTrigger: 'oracle' };
        for (const [k, v] of Object.entries(t.effect)) buff[k] = v * stacks;
        BATTLE.buffs.push(buff);
      }
    }
  }
}

function logLine(html, klass) {
  BATTLE.log.push({ html, klass });
  if (BATTLE.log.length > 60) BATTLE.log.shift();
  if (BATTLE.onLog) BATTLE.onLog();
}

function startBattle(dungeonId, charId) {
  const dungeon = GAME_DATA.getDungeon(dungeonId);
  if (!dungeon) return false;
  const cs = GAME_STATE.state.characters[charId];
  if (!cs) return false;
  // 等級需求（特殊副本/襲擊戰）
  if (dungeon.requiredLv && cs.level < dungeon.requiredLv) {
    const need = dungeon.requiredLv >= 99 ? '畢業（主線練到 Lv 99）' : `Lv ${dungeon.requiredLv}`;
    logLine(`需要${need}才能挑戰 <b>${dungeon.name}</b>（目前 Lv ${cs.level}）`, 'lg-fail');
    return false;
  }
  const stats = GAME_STATE.effectiveStats(charId);
  const cp = GAME_STATE.combatPower(charId);

  // 副本可單獨覆寫進場門檻（minCpOverride）— 適合難度高但鼓勵低戰力組隊嘗試的副本
  const minCp = (typeof dungeon.minCpOverride === 'number') ? dungeon.minCpOverride : dungeon.cp * 0.4;
  // 無盡塔不檢查戰力（依累積傷害給獎勵，弱也能打）
  if (cp < minCp && !dungeon.isEndless) {
    logLine(`戰力不足，無法挑戰 <b>${dungeon.name}</b>（需要 ${Math.floor(minCp).toLocaleString()} CP，目前 ${cp.toLocaleString()}）`, 'lg-fail');
    return false;
  }
  BATTLE.speedMul = 1.0;   // 戰速固定，通關快慢由角色攻速 + 傷害決定
  BATTLE.startTime = performance.now();
  // 清掉舊戰鬥還沒跑的 stopBattle 延遲（避免覆蓋新戰鬥的 running 旗標）
  if (BATTLE._pendingStopTimer) {
    clearTimeout(BATTLE._pendingStopTimer);
    BATTLE._pendingStopTimer = null;
  }

  BATTLE.running = true;
  BATTLE.paused = false;
  BATTLE.dungeonId = dungeonId;
  BATTLE.charId = charId;
  BATTLE.player = { hp: stats.hp, maxHp: stats.hp, mp: stats.maxMp, ...stats };
  BATTLE.expMul = 1; BATTLE.goldMul = 1;  // 來自藥水的全域加成
  BATTLE.waves = buildWaves(dungeon);
  BATTLE.currentWaveIdx = 0;
  BATTLE.currentWave = [];
  BATTLE.enemyList = [].concat(...BATTLE.waves);   // 相容用（給結算/UI 計算）
  BATTLE.enemyIndex = 0;
  BATTLE.skillCDs = {};
  // 保留藥水 buff 跨戰鬥（一瓶持續 60s），技能 buff 不保留
  BATTLE.buffs = (BATTLE.buffs || []).filter(b => b._potionId && b.dur > 0);
  BATTLE.dots = [];
  BATTLE.summons = [];
  BATTLE.freezes = 0;
  BATTLE.recentSkills = [];
  BATTLE.damageStats = { total: 0, bySkill: {}, hits: 0, crits: 0 };
  BATTLE._activeSkillId = null;
  BATTLE._cleared = false;  // 重置通關旗標
  BATTLE._dead = false;     // 重置陣亡旗標（組隊用）
  BATTLE._teamWipeFired = false;  // 重置全隊滅旗標
  // 多人：清掉所有 peer 的 sticky dead 旗標（不然上一場死的記憶帶到新場）
  if (window.MP_API && typeof MP_API.getPlayers === 'function') {
    const peers = MP_API.getPlayers();
    for (const pid in peers) {
      if (peers[pid] && peers[pid].battleState) peers[pid].battleState.dead = false;
    }
  }
  BATTLE._wavePending = false;  // 重置 wave 切換 pending 旗標
  BATTLE.setTriggers = { sun: 0, frost: false, oracle: 0 };  // 核心套裝觸發狀態
  BATTLE.ringErosionStacks = 0;  // 蝕念戒指疊層（每戰鬥重置）
  BATTLE.mirrorBoss = null;     // 幻夢之主技能排程狀態（spawnNextWave 觸發時 init）
  BATTLE.bossDying = false;     // BOSS 死亡動畫狀態（鎖血 1、暫停一切）
  BATTLE.bossDyingTimer = 0;
  // 快取已裝戒指的觸發效果（procId / proc 來自戒指 def）
  BATTLE.ringProcs = (() => {
    const p = { cdResetChance: 0, skillStackAtkValue: 0, skillStackAtkMax: 0 };
    if (!cs.equip || !cs.bag || !cs.bag.equipment) return p;
    for (const slot of ['ring1', 'ring2']) {
      const id = cs.equip[slot];
      if (!id) continue;
      const inst = cs.bag.equipment[id];
      if (!inst) continue;
      const def = GAME_DATA.findEquipment(inst.itemId);
      if (!def || !def.proc) continue;
      if (def.proc.cdResetChance) p.cdResetChance = Math.max(p.cdResetChance, def.proc.cdResetChance);
      if (def.proc.skillStackAtk) {
        p.skillStackAtkValue = def.proc.skillStackAtk.value;
        p.skillStackAtkMax = def.proc.skillStackAtk.maxStacks;
      }
    }
    return p;
  })();
  // 多人模式判定：襲擊戰 / 無盡塔 / 特殊副本 + 已連線 → host / guest，其他 → solo
  BATTLE._mpMode = 'solo';
  if ((dungeon.isRaid || dungeon.isEndless || dungeon.special) && window.MP_API && MP_API.isConnected()) {
    BATTLE._mpMode = MP_API.isHost() ? 'host' : 'guest';
  }
  BATTLE._lastEnemySync = 0;
  // 無盡塔特殊狀態
  BATTLE._endlessMode = !!dungeon.isEndless;
  BATTLE._endlessTimeLeft = dungeon.isEndless ? (dungeon.timeLimit || 30) : 0;
  BATTLE._endlessTotalDmg = 0;     // 自己累積傷害
  BATTLE._endlessTeamDmg = 0;      // 團隊累積（含自己 + 廣播）
  BATTLE._endlessTiers = dungeon.damageTiers || [];
  BATTLE._endlessReached = -1;     // 達到的最高階梯 idx
  spawnNextEnemy();

  const lastLog = BATTLE.log[BATTLE.log.length - 1];
  const entryMsg = `進入副本 <b>${dungeon.name}</b>（速度 ${BATTLE.speedMul.toFixed(2)}x）`;
  if (!lastLog || !lastLog.html.includes(dungeon.name) || !lastLog.html.includes('進入副本')) {
    logLine(entryMsg, 'lg-skill');
  }
  if (BATTLE.onUpdate) BATTLE.onUpdate();
  return true;
}

function buildEnemyList(dungeon) {
  // 保留用，但 buildWaves 為主
  return [].concat(...buildWaves(dungeon));
}

// 副本由波次組成，每波 1-3 隻怪，最後一波 BOSS 單獨
// 無盡塔：只有 1 隻 BOSS，HP 無上限
function buildWaves(dungeon) {
  if (dungeon.isEndless) {
    const boss = makeEnemy(dungeon.boss, dungeon, true);
    boss.hp = Number.MAX_SAFE_INTEGER;
    boss.maxHp = Number.MAX_SAFE_INTEGER;
    boss.isEndlessBoss = true;
    return [[boss]];
  }
  // 多階 BOSS RAID（skipMobs + bosses 陣列）：不出小怪，每階一波 BOSS
  if (dungeon.skipMobs && Array.isArray(dungeon.bosses) && dungeon.bosses.length > 0) {
    return dungeon.bosses.map(b => [makeEnemy(b.name, dungeon, true, b)]);
  }
  const waves = [];
  const waveCount = 4 + Math.floor(Math.random() * 2);  // 4-5 波小兵
  for (let w = 0; w < waveCount; w++) {
    let mobCount = 1;
    const r = Math.random();
    if (r < 0.45) mobCount = 1;
    else if (r < 0.80) mobCount = 2;
    else mobCount = 3;
    const wave = [];
    for (let i = 0; i < mobCount; i++) {
      const name = dungeon.enemies[Math.floor(Math.random() * dungeon.enemies.length)];
      wave.push(makeEnemy(name, dungeon, false));
    }
    waves.push(wave);
  }
  // BOSS 單獨一波
  waves.push([makeEnemy(dungeon.boss, dungeon, true)]);
  return waves;
}

// ============================================================================
// 材料掉落表：低階高機率 + 高階低機率 + 多種類同時 roll
// ============================================================================
const MAT_DROP_TABLE = {
  '粗鋼': { tier: 0, qty: [2, 6] },
  '精鋼': { tier: 1, qty: [1, 4] },
  '星鋼': { tier: 2, qty: [1, 3] },
  '神鋼': { tier: 3, qty: [1, 2] },
  '永晶': { tier: 4, qty: [1, 2] },
  '夢晶': { tier: 5, qty: [1, 1] },
};

function getDungeonMatCeiling(d) {
  if (d.isRaid) return 5;          // 襲擊戰可掉夢晶
  if (d.dropMats && d.dropMats.length) {
    // 神窟用 dropMats 內最高 tier
    let max = 0;
    for (const m of d.dropMats) {
      const t = MAT_DROP_TABLE[m]?.tier;
      if (t != null && t > max) max = t;
    }
    return max;
  }
  // 一般副本依 CP（門檻拉低，讓玩家更早能拿到中高階材料）
  if (d.cp >= 10000) return 4;     // 主線後期可低機率掉永晶（reflect-hall / abyss-mirror）
  if (d.cp >= 6000)  return 3;     // 主線後期可低機率掉神鋼
  if (d.cp >= 3000)  return 2;     // 星鋼為頂
  if (d.cp >= 800)   return 1;     // 精鋼為頂
  return 0;                         // 粗鋼為頂
}

// 寶箱掉落 roll：依副本層級決定機率分佈
function rollChestDrop(d) {
  // 各階寶箱機率（按副本 CP / 類型）
  let p = { wood: 0, silver: 0, gold: 0, divine: 0 };
  if (d.isRaid) {
    p = { wood: 0, silver: 0.10, gold: 0.20, divine: 0.08 };  // 襲擊戰：38% 總掉落，含神格 8%
  } else if (d.special) {
    p = { wood: 0.05, silver: 0.12, gold: 0.06, divine: 0 };  // 神窟：23% 總掉落
  } else if (d.cp >= 6000) {
    p = { wood: 0.04, silver: 0.04, gold: 0.015, divine: 0 };  // 後期：~10% 總掉落
  } else if (d.cp >= 1500) {
    p = { wood: 0.06, silver: 0.02, gold: 0, divine: 0 };       // 中期：~8% 總掉落
  } else if (d.cp >= 200) {
    p = { wood: 0.05, silver: 0, gold: 0, divine: 0 };          // 早期：5%
  }
  // 副本級覆寫（特定副本可覆寫個別寶箱機率，例如神工秘境給神格機率）
  if (d.chestDropOverride) p = { ...p, ...d.chestDropOverride };
  // 從高階到低階 roll，命中即返回
  if (Math.random() < p.divine) return 'chest-divine';
  if (Math.random() < p.gold)   return 'chest-gold';
  if (Math.random() < p.silver) return 'chest-silver';
  if (Math.random() < p.wood)   return 'chest-wood';
  return null;
}

function rollMaterialDrops(d, matMul) {
  const maxTier = getDungeonMatCeiling(d);
  const result = {};
  for (const [name, info] of Object.entries(MAT_DROP_TABLE)) {
    if (info.tier > maxTier) continue;
    // 低階 tier 機率高：與最高 tier 差距越大，機率越高
    const delta = maxTier - info.tier;
    let chance = 0.55 + delta * 0.13;  // delta=0:55%、+1:68%、+2:81%、+3:94%、+4:99%
    chance = Math.min(0.97, chance);
    // 夢晶獨立稀有度：襲擊戰 35%、神窟僅 12%（多了一條畢業後可挖管道）
    if (info.tier === 5) chance = d.isRaid ? 0.35 : 0.12;
    if (Math.random() >= chance) continue;
    const [lo, hi] = info.qty;
    const baseQty = lo + Math.floor(Math.random() * (hi - lo + 1));
    // 夢晶（tier 5）不吃 matMul / dropMul 加成，保持稀有
    const qty = info.tier === 5 ? baseQty : Math.max(1, Math.floor(baseQty * matMul));
    result[name] = (result[name] || 0) + qty;
  }
  // 額外的夢晶 roll（材料神窟用，畢業後可慢慢挖）
  if (d.bonusMengjingChance && !d.isRaid) {
    if (Math.random() < d.bonusMengjingChance) {
      result['夢晶'] = (result['夢晶'] || 0) + 1;
    }
  }
  return result;
}

function makeEnemy(name, dungeon, isBoss, bossConfig) {
  // 無盡塔：BOSS def=0（玩家傷害不打折）、atk 基礎值低（隨時間遞增）
  if (dungeon.isEndless) {
    return {
      name, isBoss: true,
      hp: Number.MAX_SAFE_INTEGER, maxHp: Number.MAX_SAFE_INTEGER,
      atk: 100,  // 起始 atk 低（後續每秒+）
      def: 0,
    };
  }
  const factor = isBoss ? 4 : 1;
  const diffMul = dungeon.difficultyMul || 1;  // 影響 HP / def，但 atk 用獨立倍率
  let baseHp = Math.max(60, Math.floor(dungeon.cp * 1.6 * factor * diffMul));
  // 主線練等友善化：atkCoef 0.08 → 0.055（降 31%），讓玩家在練角時不會被秒
  let atkCoef = 0.055;
  let atkDiffMul = diffMul;
  if (dungeon.isRaid) {
    atkCoef = 0.025;
    atkDiffMul = Math.min(diffMul, 2.0);
  } else if (dungeon.special) {
    atkCoef = 0.035;  // 特殊副本也跟著降（從 0.05）
  }
  // 副本可單獨覆寫 atkCoef（神級經驗副本壓低，保護高 def 但 HP 不夠的畢業玩家）
  if (typeof dungeon.atkCoefOverride === 'number') atkCoef = dungeon.atkCoefOverride;
  let atk = Math.floor(dungeon.cp * atkCoef * (isBoss ? 1.5 : 1) * atkDiffMul + 4);
  // def 倍率可單獨覆寫（避免 raid 副本 def 隨 diffMul 25 爆膨脹）
  const defMul = (typeof dungeon.defScaleOverride === 'number') ? dungeon.defScaleOverride : diffMul;
  const def = Math.floor(dungeon.cp * 0.04 * (isBoss ? 1.4 : 1) * defMul);
  // 多階 BOSS bossConfig 覆寫（hpOverride / hpMul / atkMul / shield 配置 / portrait）
  if (bossConfig) {
    if (typeof bossConfig.hpOverride === 'number') baseHp = bossConfig.hpOverride;
    else if (bossConfig.hpMul) baseHp = Math.floor(baseHp * bossConfig.hpMul);
    if (bossConfig.atkMul) atk = Math.floor(atk * bossConfig.atkMul);
  }
  const e = { name, isBoss, hp: baseHp, maxHp: baseHp, atk, def };
  if (bossConfig?.shield) {
    e.shieldConfig = bossConfig.shield;       // { firstAt, interval, hpPct, breakTime }
    e.shieldTimer = bossConfig.shield.firstAt; // 倒數至下次護盾出現
    e.shield = 0; e.shieldMax = 0;             // 當前護盾量
    e.shieldBreakTimer = 0;                    // 護盾出現後的破盾倒數
  }
  if (bossConfig?.portrait) e.portrait = bossConfig.portrait;
  if (bossConfig?.portraitTall) e.portraitTall = true;
  // 開場拔刀斬：戰鬥開始時 BOSS 進入蓄力姿態，凝聚特大護盾
  if (bossConfig?.openingAttack) {
    e.openingAttack = bossConfig.openingAttack;
    e.openingState = 'pending';  // pending → active → done
  }
  // 自訂 BOSS 技能組標籤（'mirror' 啟用幻夢之主的 7 招技能排程）
  if (bossConfig?.bossSkillTag) e.bossSkillTag = bossConfig.bossSkillTag;
  return e;
}

function spawnNextEnemy() {
  // 換成波次系統
  spawnNextWave();
}

function spawnNextWave() {
  if (BATTLE.currentWaveIdx >= BATTLE.waves.length) {
    onDungeonClear();
    return;
  }
  // 複製這波怪物（不影響 wave 模板）
  BATTLE.currentWave = BATTLE.waves[BATTLE.currentWaveIdx].map(e => ({
    ...e, hp: e.maxHp, nextAtk: 1.4 + Math.random() * 0.4,
  }));
  BATTLE.enemy = BATTLE.currentWave[0];  // 主要目標 = 第一隻
  BATTLE.enemyIndex = BATTLE.currentWaveIdx;
  PIXEL.setScene({
    enemyName: BATTLE.enemy.name + (BATTLE.enemy.isBoss ? '(BOSS)' : ''),
    enemyShake: 0,
  });
  if (BATTLE.onUpdate) BATTLE.onUpdate();
}

function stopBattle(reason) {
  BATTLE.running = false;
  BATTLE.enemy = null;
  PIXEL.setScene({ enemyName: null });
  if (reason) logLine(reason, 'lg-fail');
  // 清掉鏡夢縛魂招式殘留視覺（boss-charging / 分身 / 鏡牢 / 對白氣泡 / 倒數覆蓋等）
  if (typeof window.cleanupMirrorAnims === 'function') window.cleanupMirrorAnims();
  if (BATTLE.onUpdate) BATTLE.onUpdate();
}

function tickBattle(dt) {
  if (!BATTLE.running || BATTLE.paused) return;
  if (!BATTLE.enemy) return;

  const dtSec = (dt / 1000) * BATTLE.speedMul;

  // 無盡塔：倒數 + 時間到結算 + BOSS atk 隨時間遞增（越打越痛）
  if (BATTLE._endlessMode) {
    BATTLE._endlessTimeLeft -= dtSec;
    // BOSS atk：起始 1500，每秒 +150（10 秒 3000、20 秒 4500、30 秒 6000）
    // 對應畢業玩家 def 1500-2500、HP 23000-30000，30 秒下來會被打到剩一口氣
    if (BATTLE.enemy && BATTLE.enemy.isEndlessBoss) {
      const elapsed = 30 - BATTLE._endlessTimeLeft;
      BATTLE.enemy.atk = Math.floor(1500 + elapsed * 150);
    }
    if (BATTLE._endlessTimeLeft <= 0 && !BATTLE._cleared) {
      BATTLE._endlessTimeLeft = 0;
      // guest 端：等 host 廣播 endless-end（避免兩端時間差導致資料不同步）
      // fallback：等 3 秒沒收到就自己結算（保險，避免 host 斷線時 guest 卡死）
      if (BATTLE._mpMode === 'guest') {
        BATTLE._endlessGuestWait = (BATTLE._endlessGuestWait || 0) + dtSec;
        if (BATTLE._endlessGuestWait >= 3.0) onEndlessTimeUp();
      } else {
        onEndlessTimeUp();
      }
      return;
    }
  }

  // 多人 Host：每 200ms 廣播敵人 HP 給 Guest
  if (BATTLE._mpMode === 'host' && window.MP_API) {
    BATTLE._lastEnemySync = (BATTLE._lastEnemySync || 0) + dt;
    if (BATTLE._lastEnemySync >= 200) {
      BATTLE._lastEnemySync = 0;
      MP_API.broadcastEnemySync();
    }
  }

  // 凍結倒數
  if (BATTLE.freezes > 0) BATTLE.freezes -= dtSec;

  // 鏡夢縛魂 BOSS 死亡動畫倒數
  if (BATTLE.bossDying) {
    BATTLE.bossDyingTimer -= dtSec;
    if (BATTLE.bossDyingTimer <= 0) {
      BATTLE.bossDying = false;
      if (BATTLE._mpMode !== 'guest') {
        if (BATTLE.enemy) BATTLE.enemy.hp = 0;
        if (typeof onEnemyDown === 'function') onEnemyDown();
      }
      // guest：等 host enemy-sync 帶 cleared=true 觸發 onDungeonClear
    }
    return;  // 死亡動畫期間暫停一切 — 不跑技能 / 攻擊 / 護盾 / regen
  }
  // BOSS 護盾即死機制（雙影獵討的 shieldConfig）
  tickBossShield(dtSec);
  // 幻夢之主技能排程（鏡夢縛魂 7 招）
  tickMirrorBoss(dtSec);

  // buff/dot/summon
  tickBuffs(dtSec);
  tickDots(dtSec);
  tickSummons(dtSec);

  // MP 自然回復（依角色屬性 mpRegen/sec）
  if (BATTLE.player.mp < BATTLE.player.maxMp) {
    const regen = (BATTLE.player.mpRegen || 8);
    BATTLE.player.mp = Math.min(BATTLE.player.maxMp, BATTLE.player.mp + regen * dtSec);
  }
  // HP 自然回復（雪羽 B 路線 holy-grace 被動 hpRegenPct）
  if (BATTLE.player.hpRegenPct && BATTLE.player.hp < BATTLE.player.maxHp && !BATTLE._dead) {
    const heal = BATTLE.player.maxHp * BATTLE.player.hpRegenPct * dtSec;
    BATTLE.player.hp = Math.min(BATTLE.player.maxHp, BATTLE.player.hp + heal);
  }

  // 自動藥水
  if (typeof tickPotions === 'function') tickPotions(dtSec);

  // CD
  for (const sid in BATTLE.skillCDs) {
    BATTLE.skillCDs[sid] -= dtSec;
    if (BATTLE.skillCDs[sid] <= 0) delete BATTLE.skillCDs[sid];
  }

  // 玩家行動（陣亡狀態不行動）
  if (!BATTLE._dead) {
    // 攻擊速度上限 5（avoid 共鳴/buff/裝備堆滿出極端值）；某些 buff（如虛無一閃）可突破上限至 10
    const hasUncap = BATTLE.buffs.some(b => b.spdUncap);
    const spdCap = hasUncap ? 10 : 5;
    const effSpd = Math.min(spdCap, BATTLE.player.spd * (1 + getBuffMod('spdMul')));
    if (!BATTLE.player.nextAtk) BATTLE.player.nextAtk = 1 / effSpd;
    BATTLE.player.nextAtk -= dtSec;
    if (BATTLE.player.nextAtk <= 0) {
      doPlayerAction();
      BATTLE.player.nextAtk = 1 / effSpd;
    }
  }

  // 每隻活著的怪各自攻擊（凍結中暫停，玩家陣亡也不被打）
  if (BATTLE.freezes <= 0 && BATTLE.currentWave && !BATTLE._dead) {
    for (const e of BATTLE.currentWave) {
      if (e.hp <= 0) continue;
      if (!e.nextAtk) e.nextAtk = 1.4;
      e.nextAtk -= dtSec;
      if (e.nextAtk <= 0) {
        doEnemyAttack(e);
        e.nextAtk = 1.4;
      }
    }
  }

  // 玩家陣亡判定
  if (BATTLE.player.hp <= 0 && !BATTLE._dead) {
    // 無盡塔 solo：陣亡 → 提早結算（保留已達階梯獎勵）
    if (BATTLE._endlessMode && BATTLE._mpMode === 'solo') {
      BATTLE._dead = true;
      logLine(`<span class="lg-fail">${GAME_STATE.getPlayerNickname() || '你'} 陣亡！本場結束，依當前傷害結算...</span>`, '');
      onEndlessTimeUp();
      return;
    }
    if (BATTLE._mpMode === 'host' || BATTLE._mpMode === 'guest') {
      // 組隊：自己倒了不算失敗，等隊友通關（或全隊死亡才結算）
      BATTLE._dead = true;
      BATTLE.player.hp = 0;
      logLine(`<span class="lg-fail">${GAME_STATE.getPlayerNickname() || '你'} 陣亡，等待隊友通關...</span>`, '');
      if (window.MP_API) MP_API.broadcast('player-dead', { dungeonId: BATTLE.dungeonId });
    } else {
      onBattleFail();
    }
  }

  // 全隊滅判定：組隊時自己 dead + 所有隊友 dead → 結算
  // 無盡塔：按累積傷害結算（onEndlessTimeUp）；一般副本：戰敗 0 獎勵（onBattleFail）
  if (BATTLE._dead && !BATTLE._teamWipeFired && (BATTLE._mpMode === 'host' || BATTLE._mpMode === 'guest')) {
    if (window.MP_API) {
      const players = MP_API.getPlayers();
      const playerIds = Object.keys(players);
      const allAllyDead = playerIds.length > 0 && playerIds.every(id => {
        const p = players[id];
        const bs = p && p.battleState;
        return bs && (bs.dead || (bs.inBattle && bs.maxHp > 0 && bs.hp <= 0));
      });
      if (allAllyDead) {
        BATTLE._teamWipeFired = true;
        if (BATTLE._endlessMode) {
          logLine('<span class="lg-fail">全隊滅亡！結算當前累積傷害...</span>', '');
          onEndlessTimeUp();
        } else {
          logLine('<span class="lg-fail">全隊滅亡！</span>', '');
          onBattleFail();
        }
      }
    }
  }
}

// BOSS 護盾即死機制（雙影獵討）
// shieldConfig: { firstAt, interval, hpFixed?, hpPct?, breakTime }
//   hpFixed: 固定護盾值（例：10_000_000）
//   hpPct: 按 BOSS maxHp 比例（fallback）
// 多人：host 為權威，guest 只接收 enemy-sync 同步護盾資料、即死靠 host 廣播 raid-instant-kill
function tickBossShield(dt) {
  const e = BATTLE.enemy;
  if (!e || e.hp <= 0) return;
  // guest 端：本地 tick shieldBreakTimer 順暢倒數（60fps），不執行啟動/即死邏輯
  // enemy-sync（200ms 一次）會週期性修正誤差，看起來就是即時順暢的倒數
  if (BATTLE._mpMode === 'guest') {
    if (e.shield > 0 && e.shieldBreakTimer > 0) {
      e.shieldBreakTimer = Math.max(0, e.shieldBreakTimer - dt);
    }
    return;
  }
  // ===== 開場拔刀斬（鏡夢縛魂）=====
  // 戰鬥一開始觸發，shield = 20億，3 秒內不破則衝刺一刀打 90% maxHp
  if (e.openingAttack && e.openingState === 'pending') {
    e.openingState = 'active';
    e.shield = e.openingAttack.shieldHp;
    e.shieldMax = e.openingAttack.shieldHp;
    e.shieldBreakTimer = e.openingAttack.chargeTime;
    if (typeof logLine === 'function') {
      logLine(`<span class="lg-fail">⚠ ${e.name} 進入【${e.openingAttack.name}】拔刀姿態！${e.openingAttack.chargeTime} 秒內不破盾將遭受 ${Math.round(e.openingAttack.damageOnFail * 100)}% 最大生命傷害！</span>`, '');
    }
    if (typeof window.bossChargingStart === 'function') window.bossChargingStart(e.openingAttack.chargeTime);
    return;
  }
  if (e.openingAttack && e.openingState === 'active') {
    e.shieldBreakTimer -= dt;
    if (e.shield <= 0) {
      // 玩家成功破盾 → BOSS 收招
      e.openingState = 'done';
      e.shield = 0; e.shieldMax = 0; e.shieldBreakTimer = 0;
      if (typeof logLine === 'function') {
        logLine(`<span class="lg-clear">✓ 阻止了【${e.openingAttack.name}】！BOSS 收回拔刀姿態。</span>`, '');
      }
      if (typeof window.bossChargingEnd === 'function') window.bossChargingEnd(true);
    } else if (e.shieldBreakTimer <= 0) {
      // 時間到 → BOSS 衝刺斬，造成 maxHp × damageOnFail 傷害
      e.openingState = 'done';
      e.shield = 0; e.shieldMax = 0; e.shieldBreakTimer = 0;
      const dmgPct = e.openingAttack.damageOnFail;
      const dmg = Math.floor(BATTLE.player.maxHp * dmgPct);
      BATTLE.player.hp = Math.max(0, BATTLE.player.hp - dmg);
      if (typeof logLine === 'function') {
        logLine(`<span class="lg-fail">✘ 【${e.openingAttack.name}】！${e.name} 衝刺一刀造成 ${dmg.toLocaleString()} 傷害（${Math.round(dmgPct * 100)}% 最大生命）</span>`, '');
      }
      if (typeof window.bossSlash === 'function') window.bossSlash(e.openingAttack.name, dmg);
      if (typeof window.bossChargingEnd === 'function') window.bossChargingEnd(false);
      // 廣播給隊友（guest 同步扣血 + 播動畫）
      if (BATTLE._mpMode === 'host' && window.MP_API) {
        MP_API.broadcast('boss-slash', {
          dungeonId: BATTLE.dungeonId,
          dmgPct: dmgPct,
          name: e.openingAttack.name,
        });
      }
      if (BATTLE.player.hp <= 0) {
        BATTLE._dead = true;
        if (BATTLE._mpMode === 'host' && window.MP_API) {
          MP_API.broadcast('player-dead', { dungeonId: BATTLE.dungeonId });
        } else if (BATTLE._mpMode === 'solo' && typeof onBattleFail === 'function') {
          onBattleFail();
        }
      }
    }
    return;  // 開場攻擊期間不執行下方常規護盾邏輯
  }

  if (!e.shieldConfig) return;
  const cfg = e.shieldConfig;
  // 護盾未啟動：倒數至 shieldTimer 達 0 → 啟動護盾
  if (e.shield <= 0) {
    e.shieldTimer -= dt;
    if (e.shieldTimer <= 0) {
      // hpFixed 優先；否則用 hpPct × maxHp
      e.shield = cfg.hpFixed ? Math.floor(cfg.hpFixed) : Math.floor(e.maxHp * (cfg.hpPct || 0.05));
      e.shieldMax = e.shield;
      e.shieldBreakTimer = cfg.breakTime;
      if (typeof logLine === 'function') logLine(`<span class="lg-fail">⚠ ${e.name} 凝聚虛無護盾！${cfg.breakTime} 秒內打破否則全隊即死！</span>`, '');
    }
    return;
  }
  // 護盾啟動中：破盾倒數
  e.shieldBreakTimer -= dt;
  if (e.shieldBreakTimer <= 0) {
    // 5 秒沒破 → 全隊即死
    if (typeof logLine === 'function') logLine(`<span class="lg-fail">✘ 護盾未破！${e.name} 釋放虛無吞噬，全隊即死！</span>`, '');
    BATTLE.player.hp = 0;
    BATTLE._dead = true;
    // host：廣播 raid-instant-kill 給所有 guest 同步即死
    if (BATTLE._mpMode === 'host' && window.MP_API) {
      MP_API.broadcast('raid-instant-kill', { dungeonId: BATTLE.dungeonId, reason: 'shield' });
      MP_API.broadcast('player-dead', { dungeonId: BATTLE.dungeonId });
    } else if (BATTLE._mpMode === 'solo') {
      if (typeof onBattleFail === 'function') onBattleFail();
    }
  }
}

// ============================================================================
// 幻夢之主（鏡夢縛魂 RAID）— BOSS 技能排程系統
// ----------------------------------------------------------------------------
// 拔刀斬結束後啟動，每招結束後固定 5 秒 CD → 立刻進下一招
// Phase 1（覺醒前，5 招循環）：
//   萬影連舞 → 紅絲縛魂 → 鏡花水月 → 分身映鏡 → 萬影連舞 (重複)
//   設計：暖機→debuff→必打斷→DPS 檢→快速收尾
// Phase 2（覺醒後，5 招循環，整體節奏拉緊）：
//   絲帶天降 → 萬影連舞 → 鏡牢禁錮 → 鏡花水月 → 絲帶天降 (重複)
//   設計：AoE→連擊→鎖人→補血→AoE，全程持續壓力
// ============================================================================
const MIRROR_SKILLS_P1 = ['shadowDance', 'ribbonBind', 'flowerMoon', 'cloneSummon', 'shadowDance'];
const MIRROR_SKILLS_P2 = ['ribbonRain', 'shadowDance', 'mirrorCage', 'flowerMoon', 'ribbonRain'];

// 每招施放前 BOSS 角色側邊吐一句話（precast 1.5 秒）
const MIRROR_CALLOUTS = {
  cloneSummon: '映於萬鏡——出來吧，分身。',
  flowerMoon:  '花綻水中月，傷痕盡撫平。',
  ribbonBind:  '紅絲為縛，魂歸吾鏡。',
  shadowDance: '一影、千影、萬影連舞——',
  ribbonRain:  '紅絲如雨，無處可逃。',
  mirrorCage:  '入鏡牢中，無人能救你。',
  awakening:   '夠了——讓我撕碎這些幻夢！',
};
const MIRROR_PRECAST_TIME = 1.5;  // 對白持續秒數

function initMirrorBoss() {
  // 第一次發現幻夢之主時呼叫（spawnNextWave 後）
  const e = BATTLE.enemy;
  if (!e || e.bossSkillTag !== 'mirror') return;
  if (BATTLE.mirrorBoss) return;  // 已初始化
  BATTLE.mirrorBoss = {
    skillIdx: 0,
    cdTimer: 0,
    skillCD: 5,    // 拔刀斬結束 5 秒進第一招
    awakened: false,
    active: null,
  };
}

function tickMirrorBoss(dt) {
  const e = BATTLE.enemy;
  if (!e || e.hp <= 0) return;
  if (e.bossSkillTag !== 'mirror') return;
  // 等開場拔刀斬結束才啟動技能系統
  if (e.openingAttack && e.openingState !== 'done') return;
  if (!BATTLE.mirrorBoss) initMirrorBoss();
  if (BATTLE._mpMode === 'guest') {
    // guest 端：技能邏輯由 host 廣播觸發，這裡只 tick 視覺倒數
    if (BATTLE.mirrorBoss && BATTLE.mirrorBoss.active) {
      BATTLE.mirrorBoss.active.timer = Math.max(0, (BATTLE.mirrorBoss.active.timer || 0) - dt);
    }
    return;
  }
  const mb = BATTLE.mirrorBoss;

  // === 半血階段轉換：真我覺醒（一次性）===
  if (!mb.awakened && e.hp / e.maxHp < 0.5) {
    castMirrorAwakening();
    return;
  }

  // === 啟動中技能 tick ===
  if (mb.active) {
    tickMirrorActive(dt);
    return;
  }

  // === 下一招冷卻倒數 ===
  mb.cdTimer += dt;
  if (mb.cdTimer >= mb.skillCD) {
    const schedule = mb.awakened ? MIRROR_SKILLS_P2 : MIRROR_SKILLS_P1;
    const skillId = schedule[mb.skillIdx % schedule.length];
    castMirrorSkill(skillId);
    mb.skillIdx++;
    mb.cdTimer = 0;
    mb.skillCD = 5;  // 每招結束後固定 5 秒就進下一招（之前 22-26 / 15-19）
  }
}

function castMirrorSkill(id) {
  // 先進 precast 狀態 — BOSS 側邊吐對白、視覺蓄力 1.5 秒，之後才實際施放
  const callout = MIRROR_CALLOUTS[id];
  if (callout) {
    BATTLE.mirrorBoss.active = {
      id: 'preCast', nextId: id, timer: MIRROR_PRECAST_TIME, name: '對白',
    };
    fireBossSpeak(callout, MIRROR_PRECAST_TIME);
    return;
  }
  // 沒對白（理論上不會走到）→ 直接施法
  doMirrorCast(id);
}

function doMirrorCast(id) {
  switch (id) {
    case 'cloneSummon':  castCloneSummon();  break;
    case 'flowerMoon':   castFlowerMoon();   break;
    case 'ribbonBind':   castRibbonBind();   break;
    case 'shadowDance':  castShadowDance();  break;
    case 'ribbonRain':   castRibbonRain();   break;
    case 'mirrorCage':   castMirrorCage();   break;
  }
}

function fireBossSpeak(text, duration) {
  // host：本地播 + 廣播給 guest 同步
  if (typeof window.bossSpeak === 'function') window.bossSpeak(text, duration);
  if (BATTLE._mpMode === 'host' && window.MP_API) {
    MP_API.broadcast('boss-speak', { text, duration, dungeonId: BATTLE.dungeonId });
  }
}

// ── 技能 2：分身映鏡（4 分身、本體 80% 減傷、15s 未清光各 30% maxHp）──
function castCloneSummon() {
  const e = BATTLE.enemy;
  e.cloneDR = 0.80;
  e.cloneCount = 4;
  e.cloneHpEach = Math.floor(e.maxHp * 0.05);  // 每個分身 5% maxHp 累積傷害
  e.cloneCurrentHp = e.cloneHpEach;
  BATTLE.mirrorBoss.active = { id: 'cloneSummon', timer: 15, name: '分身映鏡' };
  logLine(`<span class="lg-fail">✦【分身映鏡】幻夢之主分裂 4 個分身！本體 80% 減傷 — 15 秒內清光分身，否則每存活一個扣 30% 生命！</span>`, '');
  fireBossSkillAnim('cloneSummon', { duration: 15, count: 4 });
}

// ── 技能 3：鏡花水月（4 秒蓄力治療 20% maxHp、10 億傷害可打斷）──
function castFlowerMoon() {
  BATTLE.mirrorBoss.active = {
    id: 'flowerMoon', timer: 4, name: '鏡花水月',
    healPct: 0.20, dmgThreshold: 1_000_000_000, dmgDealt: 0,
  };
  logLine(`<span class="lg-fail">✦【鏡花水月】幻夢之主蓄力治癒！4 秒內對她造成 10 億傷害可打斷，否則回 20% 生命！</span>`, '');
  fireBossSkillAnim('flowerMoon', { duration: 4 });
}

// ── 技能 4：紅絲縛魂（6 秒玩家纏縛、每秒 8% maxHp、5 億傷害提早掙脫）──
function castRibbonBind() {
  BATTLE.mirrorBoss.active = {
    id: 'ribbonBind', timer: 6, name: '紅絲縛魂',
    dotPct: 0.08, dotTick: 1, dmgThreshold: 500_000_000, dmgDealt: 0,
  };
  // 玩家攻速 -50% buff
  BATTLE.buffs.push({ spdMul: -0.5, dur: 6, _maxDur: 6, _name: '紅絲纏縛', _ribbonBind: true });
  logLine(`<span class="lg-fail">✦【紅絲縛魂】紅絲帶纏住玩家！每秒扣 8% 生命 + 攻速 -50%，6 秒對 BOSS 造成 5 億傷害可掙脫！</span>`, '');
  fireBossSkillAnim('ribbonBind', { duration: 6 });
}

// ── 技能 5：萬影連舞（6 段攻擊、每段 8% maxHp、每段給玩家 +5% 暴擊）──
function castShadowDance() {
  BATTLE.mirrorBoss.active = {
    id: 'shadowDance', timer: 2.0, name: '萬影連舞',
    hitsLeft: 6, hitTimer: 0.3, hitInterval: 0.3, dmgPerHit: 0.08,
  };
  logLine(`<span class="lg-fail">✦【萬影連舞】BOSS 化作殘影連擊！6 段 × 8% 最大生命，每段給玩家暴擊 +5%！</span>`, '');
  fireBossSkillAnim('shadowDance', { duration: 2.0 });
}

// ── 技能 6（覺醒招）：絲帶天降（4 秒落下 12 條紅絲、每條 30% 命中 × 8% maxHp）──
function castRibbonRain() {
  BATTLE.mirrorBoss.active = {
    id: 'ribbonRain', timer: 4.0, name: '絲帶天降',
    ribbonsCast: 0, ribbonsTotal: 12, hitChance: 0.30, dmgPerHit: 0.08,
    interval: 4.0 / 12, accumulator: 0,
  };
  logLine(`<span class="lg-fail">✦【絲帶天降】螢幕落下 12 條紅絲！4 秒內隨機命中玩家！</span>`, '');
  fireBossSkillAnim('ribbonRain', { duration: 4, count: 12 });
}

// ── 技能 7（覺醒招）：鏡牢禁錮（8 秒鎖玩家、傷害打鏡牢 5 億 HP、未破 60% maxHp）──
function castMirrorCage() {
  BATTLE.mirrorBoss.active = {
    id: 'mirrorCage', timer: 8, name: '鏡牢禁錮',
    cageHp: 500_000_000, cageMaxHp: 500_000_000, failDmgPct: 0.60,
  };
  BATTLE.player.caged = true;
  logLine(`<span class="lg-fail">✦【鏡牢禁錮】玩家被鎖入鏡牢！對 BOSS 的傷害會打到鏡牢上 — 8 秒擊破 5 億 HP 鏡牢，否則扣 60% 生命！</span>`, '');
  fireBossSkillAnim('mirrorCage', { duration: 8 });
}

// ── 技能 8：真我覺醒（半血一次性、+50% atk、之後技能 CD -30%）──
function castMirrorAwakening() {
  const e = BATTLE.enemy;
  BATTLE.mirrorBoss.awakened = true;
  BATTLE.mirrorBoss.skillIdx = 0;
  BATTLE.mirrorBoss.cdTimer = 0;
  BATTLE.mirrorBoss.skillCD = 5;  // 覺醒後也是 5 秒間隔（跟一般循環一致）
  // 清掉舊招式狀態
  BATTLE.mirrorBoss.active = null;
  e.cloneDR = 0; e.cloneCount = 0; BATTLE.player.caged = false;
  BATTLE.buffs = BATTLE.buffs.filter(b => !b._ribbonBind);
  // 永久強化
  e.atk = Math.floor(e.atk * 1.5);
  e._awakened = true;
  // 覺醒對白（同樣 1.5s 飄字 + 螢幕震屏）
  fireBossSpeak(MIRROR_CALLOUTS.awakening, 2.0);
  logLine(`<span class="lg-fail">★★【真我覺醒】幻夢之主撕裂紅絲，真身覺醒！攻擊力 +50%、技能 CD -30%！</span>`, '');
  fireBossSkillAnim('awakening', { duration: 1.2 });
  if (BATTLE._mpMode === 'host' && window.MP_API) {
    MP_API.broadcast('boss-skill', { id: 'awakening', dungeonId: BATTLE.dungeonId });
  }
}

// ============================================================================
// tick 啟動中的 BOSS 技能（state machine）
// ============================================================================
function tickMirrorActive(dt) {
  const mb = BATTLE.mirrorBoss;
  if (!mb || !mb.active) return;
  const a = mb.active;
  a.timer -= dt;

  switch (a.id) {
    // BOSS 吐對白蓄力中：時間到才實際施放下一個技能
    case 'preCast': {
      if (a.timer <= 0) {
        const nextId = a.nextId;
        mb.active = null;
        doMirrorCast(nextId);
      }
      break;
    }
    case 'cloneSummon': {
      if (a.timer <= 0) {
        // 時間到：依殘餘分身數每個扣 30%
        const remaining = Math.max(0, BATTLE.enemy.cloneCount || 0);
        if (remaining > 0) {
          const explodePct = 0.30;
          const dmg = Math.floor(BATTLE.player.maxHp * explodePct * remaining);
          BATTLE.player.hp = Math.max(0, BATTLE.player.hp - dmg);
          logLine(`<span class="lg-fail">✘ 分身自爆！${remaining} 個分身共 ${dmg.toLocaleString()} 傷害！</span>`, '');
          fireBossSkillAnim('cloneExplode', { count: remaining });
          if (BATTLE._mpMode === 'host' && window.MP_API) {
            MP_API.broadcast('boss-skill-fail', { id: 'cloneSummon', dmgPct: explodePct * remaining });
          }
          if (BATTLE.player.hp <= 0) handleMirrorPlayerDead();
        }
        BATTLE.enemy.cloneDR = 0; BATTLE.enemy.cloneCount = 0;
        mb.active = null;
      }
      break;
    }
    case 'flowerMoon': {
      if (a.dmgDealt >= a.dmgThreshold) {
        logLine(`<span class="lg-clear">✓ 打斷了【鏡花水月】！</span>`, '');
        fireBossSkillAnim('flowerMoonEnd', { broken: true });
        mb.active = null;
        return;
      }
      if (a.timer <= 0) {
        // 蓄力完成 → 回血 20% maxHp
        const heal = Math.floor(BATTLE.enemy.maxHp * a.healPct);
        BATTLE.enemy.hp = Math.min(BATTLE.enemy.maxHp, BATTLE.enemy.hp + heal);
        logLine(`<span class="lg-fail">✘ 治癒完成！幻夢之主回 ${heal.toLocaleString()} HP！</span>`, '');
        fireBossSkillAnim('flowerMoonEnd', { broken: false });
        if (BATTLE._mpMode === 'host' && window.MP_API) {
          MP_API.broadcast('boss-skill-fail', { id: 'flowerMoon', healPct: a.healPct });
        }
        mb.active = null;
      }
      break;
    }
    case 'ribbonBind': {
      // DoT 每秒
      a.dotTick -= dt;
      if (a.dotTick <= 0) {
        a.dotTick = 1;
        const dmg = Math.floor(BATTLE.player.maxHp * a.dotPct);
        BATTLE.player.hp = Math.max(0, BATTLE.player.hp - dmg);
        if (typeof floatDamage === 'function') floatDamage('🩸 ' + dmg, 'enemy');
        // ★ 廣播 DoT tick 給 guest 同步扣血
        if (BATTLE._mpMode === 'host' && window.MP_API) {
          MP_API.broadcast('boss-skill-tick', { id: 'ribbonBind', dmgPct: a.dotPct });
        }
        if (BATTLE.player.hp <= 0) { handleMirrorPlayerDead(); mb.active = null; return; }
      }
      // 提早掙脫：對 BOSS 造成 5 億傷害
      if (a.dmgDealt >= a.dmgThreshold) {
        logLine(`<span class="lg-clear">✓ 掙脫紅絲縛魂！</span>`, '');
        BATTLE.buffs = BATTLE.buffs.filter(b => !b._ribbonBind);
        fireBossSkillAnim('ribbonBindEnd', { broken: true });
        mb.active = null;
        return;
      }
      if (a.timer <= 0) {
        BATTLE.buffs = BATTLE.buffs.filter(b => !b._ribbonBind);
        fireBossSkillAnim('ribbonBindEnd', { broken: false });
        mb.active = null;
      }
      break;
    }
    case 'shadowDance': {
      a.hitTimer -= dt;
      if (a.hitTimer <= 0 && a.hitsLeft > 0) {
        a.hitTimer = a.hitInterval;
        a.hitsLeft--;
        const dmg = Math.floor(BATTLE.player.maxHp * a.dmgPerHit);
        BATTLE.player.hp = Math.max(0, BATTLE.player.hp - dmg);
        // 每段給玩家 +5% 暴擊（5 秒）
        BATTLE.buffs.push({ crit: 0.05, dur: 5, _maxDur: 5, _name: '影舞反擊' });
        if (typeof floatDamage === 'function') floatDamage('⚔ ' + dmg, 'enemy');
        fireBossSkillAnim('shadowDanceHit', { hitIdx: 6 - a.hitsLeft });
        if (BATTLE._mpMode === 'host' && window.MP_API) {
          MP_API.broadcast('boss-skill-tick', { id: 'shadowDance', hit: 6 - a.hitsLeft, dmgPct: a.dmgPerHit });
        }
        if (BATTLE.player.hp <= 0) { handleMirrorPlayerDead(); mb.active = null; return; }
      }
      if (a.hitsLeft <= 0 && a.timer <= 0.1) {
        mb.active = null;
      }
      break;
    }
    case 'ribbonRain': {
      a.accumulator += dt;
      while (a.accumulator >= a.interval && a.ribbonsCast < a.ribbonsTotal) {
        a.accumulator -= a.interval;
        a.ribbonsCast++;
        const hit = Math.random() < a.hitChance;
        fireBossSkillAnim('ribbonDrop', { hit });
        if (hit) {
          const dmg = Math.floor(BATTLE.player.maxHp * a.dmgPerHit);
          BATTLE.player.hp = Math.max(0, BATTLE.player.hp - dmg);
          if (typeof floatDamage === 'function') floatDamage('🎀 ' + dmg, 'enemy');
          if (BATTLE._mpMode === 'host' && window.MP_API) {
            MP_API.broadcast('boss-skill-tick', { id: 'ribbonRain', dmgPct: a.dmgPerHit });
          }
          if (BATTLE.player.hp <= 0) { handleMirrorPlayerDead(); mb.active = null; return; }
        }
      }
      if (a.timer <= 0) mb.active = null;
      break;
    }
    case 'mirrorCage': {
      if (a.cageHp <= 0) {
        // 鏡牢擊破
        BATTLE.player.caged = false;
        logLine(`<span class="lg-clear">✓ 鏡牢被擊破！</span>`, '');
        fireBossSkillAnim('mirrorCageEnd', { broken: true });
        mb.active = null;
        return;
      }
      if (a.timer <= 0) {
        // 時間到：扣 60% maxHp
        BATTLE.player.caged = false;
        const dmg = Math.floor(BATTLE.player.maxHp * a.failDmgPct);
        BATTLE.player.hp = Math.max(0, BATTLE.player.hp - dmg);
        logLine(`<span class="lg-fail">✘ 鏡牢爆裂！${dmg.toLocaleString()} 傷害！</span>`, '');
        fireBossSkillAnim('mirrorCageEnd', { broken: false });
        if (BATTLE._mpMode === 'host' && window.MP_API) {
          MP_API.broadcast('boss-skill-fail', { id: 'mirrorCage', dmgPct: a.failDmgPct });
        }
        if (BATTLE.player.hp <= 0) handleMirrorPlayerDead();
      }
      break;
    }
  }
}

// 玩家攻擊 BOSS 時的傷害攔截（呼叫自 applyDamage / applyAoeDamage）
// 返回 true 表示已處理（不要扣 BOSS hp / shield）
function mirrorBossDamageHook(rawDmg) {
  const mb = BATTLE.mirrorBoss;
  if (!mb || !mb.active) {
    // 沒在施法但有分身減傷
    if (BATTLE.enemy && BATTLE.enemy.cloneDR > 0) {
      return Math.floor(rawDmg * (1 - BATTLE.enemy.cloneDR));  // 80% 減傷後的傷害仍打 BOSS
    }
    return rawDmg;
  }
  const a = mb.active;
  // 分身映鏡：傷害先打分身，分身全部死才打本體 + 解除 DR
  if (a.id === 'cloneSummon' && BATTLE.enemy.cloneCount > 0) {
    let remainingDmg = rawDmg;
    while (remainingDmg > 0 && BATTLE.enemy.cloneCount > 0) {
      if (remainingDmg >= BATTLE.enemy.cloneCurrentHp) {
        remainingDmg -= BATTLE.enemy.cloneCurrentHp;
        BATTLE.enemy.cloneCount--;
        BATTLE.enemy.cloneCurrentHp = BATTLE.enemy.cloneHpEach;
        if (typeof floatDamage === 'function') floatDamage('💔 分身擊破！', 'crit');
        if (BATTLE.enemy.cloneCount <= 0) {
          BATTLE.enemy.cloneDR = 0;
          logLine(`<span class="lg-clear">✓ 所有分身被清光！</span>`, '');
          mb.active = null;
          break;
        }
      } else {
        BATTLE.enemy.cloneCurrentHp -= remainingDmg;
        remainingDmg = 0;
      }
    }
    return remainingDmg;  // 溢出的繼續打 BOSS
  }
  // 鏡花水月 / 紅絲縛魂：累積傷害到 dmgDealt，BOSS 仍正常受傷
  if ((a.id === 'flowerMoon' || a.id === 'ribbonBind') && a.dmgDealt != null) {
    a.dmgDealt += rawDmg;
  }
  // 鏡牢禁錮：對 BOSS 的傷害先打鏡牢
  if (a.id === 'mirrorCage' && a.cageHp > 0) {
    const absorbed = Math.min(a.cageHp, rawDmg);
    a.cageHp -= absorbed;
    if (typeof floatDamage === 'function') floatDamage('🔒 ' + absorbed, 'enemy');
    return rawDmg - absorbed;  // 溢出打 BOSS
  }
  return rawDmg;
}

// 鏡夢縛魂：BOSS 死亡動畫進場
// HP 鎖在 1，暫停所有技能、玩家攻擊、BOSS 攻擊
// 3 秒後 hp → 0、onEnemyDown → onDungeonClear
function enterMirrorBossDying() {
  if (!BATTLE.enemy || BATTLE.bossDying) return;
  BATTLE.enemy.hp = 1;
  BATTLE.bossDying = true;
  BATTLE.bossDyingTimer = 3.0;
  // 清掉啟動中的招式（停止 DoT、停止連舞等）
  if (BATTLE.mirrorBoss) BATTLE.mirrorBoss.active = null;
  BATTLE.buffs = (BATTLE.buffs || []).filter(b => !b._ribbonBind);
  BATTLE.player.caged = false;
  BATTLE.enemy.cloneDR = 0; BATTLE.enemy.cloneCount = 0;
  logLine(`<span class="lg-clear">★ 幻夢之主搖搖欲墜——「鏡夢...破碎了...」</span>`, '');
  if (typeof window.bossDeathStart === 'function') window.bossDeathStart();
  if (BATTLE._mpMode === 'host' && window.MP_API) {
    MP_API.broadcast('boss-dying', { dungeonId: BATTLE.dungeonId });
  }
}

function handleMirrorPlayerDead() {
  BATTLE._dead = true;
  if (BATTLE._mpMode === 'host' && window.MP_API) {
    MP_API.broadcast('player-dead', { dungeonId: BATTLE.dungeonId });
  } else if (BATTLE._mpMode === 'solo' && typeof onBattleFail === 'function') {
    onBattleFail();
  }
}

function fireBossSkillAnim(name, data) {
  if (typeof window.bossSkillAnim === 'function') window.bossSkillAnim(name, data || {});
  // host：廣播給 guest 播動畫
  if (BATTLE._mpMode === 'host' && window.MP_API) {
    MP_API.broadcast('boss-skill', { id: name, data: data || {}, dungeonId: BATTLE.dungeonId });
  }
}

function tickBuffs(dt) {
  BATTLE.buffs = BATTLE.buffs.filter(b => { b.dur -= dt; return b.dur > 0; });
}
function tickDots(dt) {
  BATTLE.dots = BATTLE.dots.filter(d => {
    d.dur -= dt;
    d.acc += dt;
    while (d.acc >= 0.5) {
      d.acc -= 0.5;
      if (BATTLE.enemy) {
        const dmg = Math.floor(d.dps * 0.5);
        if (BATTLE._endlessMode) {
          BATTLE._endlessTotalDmg += dmg;
          BATTLE._endlessTeamDmg += dmg;
          updateEndlessTier();
        } else {
          BATTLE.enemy.hp -= dmg;
        }
        trackDamage(dmg, d.sourceId, false);
        if (window.floatDamage) floatDamage('🔥 ' + dmg, 'dot');
        // 鏡夢縛魂：DoT 把 HP 打到 0 也要進入死亡動畫
        if (!BATTLE._endlessMode && BATTLE.enemy.hp <= 0) {
          if (BATTLE.enemy.bossSkillTag === 'mirror' && BATTLE._mpMode !== 'guest' && !BATTLE.bossDying) {
            enterMirrorBossDying();
            return false;
          }
          if (!BATTLE.bossDying) { onEnemyDown(); return false; }
        }
      }
    }
    return d.dur > 0;
  });
}
// 自動喝藥邏輯：CD 用固定秒數（不被 cdReduce 屬性影響）
function tickPotions(dt) {
  if (!BATTLE.charId) return;
  // 已陣亡：不再自動喝藥（不然 HP 會被補滿但 _dead=true，team-wipe 判定失效）
  if (BATTLE._dead) return;
  const cs = GAME_STATE.state.characters[BATTLE.charId];
  if (!cs || !cs.potionSlots) return;
  // 初始化 CD 容器
  if (!BATTLE.potionCDs) BATTLE.potionCDs = { 0: 0, 1: 0, 2: 0 };
  // 持續扣 CD（每幀，與節流分開）
  for (const k in BATTLE.potionCDs) {
    if (BATTLE.potionCDs[k] > 0) BATTLE.potionCDs[k] = Math.max(0, BATTLE.potionCDs[k] - dt);
  }
  // 節流：每 0.5 秒檢查觸發一次
  BATTLE._potionAcc = (BATTLE._potionAcc || 0) + dt;
  if (BATTLE._potionAcc < 0.5) return;
  BATTLE._potionAcc = 0;

  for (let i = 0; i < cs.potionSlots.length; i++) {
    const slot = cs.potionSlots[i];
    if (!slot || !slot.potionId) continue;
    if (BATTLE.potionCDs[i] > 0) continue;   // CD 中跳過
    const pid = slot.potionId;
    const have = (cs.bag && cs.bag.potions && cs.bag.potions[pid]) || 0;
    if (have <= 0) continue;
    const p = GAME_DATA.findPotion(pid);
    if (!p) continue;

    let shouldUse = false;
    if (i === 0 && p.type === 'hp_heal') {
      const pct = BATTLE.player.hp / BATTLE.player.maxHp;
      shouldUse = pct <= slot.threshold && BATTLE.player.hp < BATTLE.player.maxHp;
    } else if (i === 1 && p.type === 'mp_heal') {
      const pct = BATTLE.player.mp / BATTLE.player.maxMp;
      shouldUse = pct <= slot.threshold && BATTLE.player.mp < BATTLE.player.maxMp;
    } else if (i === 2 && p.type === 'buff') {
      if (p.kind === 'combat') {
        const active = BATTLE.buffs.some(b => b._potionId === pid && b.dur > 0);
        shouldUse = !active;
      } else if (p.kind === 'global') {
        const has = GAME_STATE.state.globalBuffs.some(b => b.potionId === pid && b.expiresAt > Date.now());
        shouldUse = !has;
      }
    }

    if (shouldUse) {
      applyPotion(pid);
      GAME_STATE.consumePotion(pid, 1);
      // 設定該槽 CD（HP/MP 用藥水自身 CD；Buff 用 duration 當保護期）
      const cdSec = p.cd || (p.type === 'buff' && p.kind === 'combat' ? p.duration : 0);
      BATTLE.potionCDs[i] = cdSec;
      GAME_STATE.scheduleSave();
      if (BATTLE.onUpdate) BATTLE.onUpdate();
    }
  }
}

// 套用藥水效果
function applyPotion(pid) {
  const p = GAME_DATA.findPotion(pid);
  if (!p) return;
  if (p.type === 'hp_heal') {
    const heal = Math.floor(BATTLE.player.maxHp * p.value);
    BATTLE.player.hp = Math.min(BATTLE.player.maxHp, BATTLE.player.hp + heal);
    logLine(`<span class="lg-potion">飲用 ${p.name} (+${heal} HP)</span>`, '');
  } else if (p.type === 'mp_heal') {
    const heal = Math.floor(BATTLE.player.maxMp * p.value);
    BATTLE.player.mp = Math.min(BATTLE.player.maxMp, BATTLE.player.mp + heal);
    logLine(`<span class="lg-potion">飲用 ${p.name} (+${heal} MP)</span>`, '');
  } else if (p.type === 'buff') {
    if (p.kind === 'combat') {
      BATTLE.buffs.push({ [p.stat]: p.value, dur: p.duration, _potionId: pid, _name: p.name, _maxDur: p.duration });
      logLine(`<span class="lg-potion">${p.name} 生效（${p.duration}秒）</span>`, '');
    } else if (p.kind === 'global') {
      GAME_STATE.activateGlobalBuff(pid);
      logLine(`<span class="lg-potion">${p.name} 生效（${Math.floor(p.duration / 60)}分鐘）</span>`, '');
    }
  }
}
window.applyPotion = applyPotion;

function tickSummons(dt) {
  // 召喚物攻擊頻率：預設 0.35s（每召喚可獨立覆寫 interval）
  // 無敵人時 dur 暫停（避免 wave 切換期間白白消耗秒數）
  BATTLE.summons = BATTLE.summons.filter(s => {
    const interval = s.interval || 0.35;
    if (!BATTLE.enemy) {
      s.acc = Math.min(s.acc, interval);
      return s.dur > 0;
    }
    s.dur -= dt;
    s.acc += dt;
    while (s.acc >= interval) {
      s.acc -= interval;
      if (BATTLE.enemy) {
        const effCrit = BATTLE.player.crit + getBuffMod('crit');
        const isCrit = Math.random() < effCrit;
        const dmg = computeDamage(s.dps * BATTLE.player.summonMul, isCrit);
        if (BATTLE._endlessMode) {
          BATTLE._endlessTotalDmg += dmg;
          BATTLE._endlessTeamDmg += dmg;
          updateEndlessTier();
        } else {
          BATTLE.enemy.hp -= dmg;
        }
        trackDamage(dmg, s.sourceId, isCrit);
        if (window.floatDamage) floatDamage('🦊 ' + (isCrit ? 'CRIT! ' : '') + dmg, isCrit ? 'crit' : 'summon');
        // 鏡夢縛魂：召喚物把 HP 打到 0 也要進入死亡動畫
        if (!BATTLE._endlessMode && BATTLE.enemy.hp <= 0) {
          if (BATTLE.enemy.bossSkillTag === 'mirror' && BATTLE._mpMode !== 'guest' && !BATTLE.bossDying) {
            enterMirrorBossDying();
            return s.dur > 0;
          }
          if (!BATTLE.bossDying) { onEnemyDown(); return s.dur > 0; }
        }
      }
    }
    return s.dur > 0;
  });
}

// --------------------------------------------------------------------------
// 玩家行動：從「裝備的技能」中挑可用的，按優先順序 + 防 spam
// --------------------------------------------------------------------------
function doPlayerAction() {
  const cs = GAME_STATE.state.characters[BATTLE.charId];
  if (!cs) return;

  // 嚴格按 slot 順序釋放：從 slot 1 開始，第一個能放的技能就放
  // 條件：CD 完成 + MP 足夠 + 不是 buff 重複
  const equipped = (cs.equippedSkills || []).filter(s => s);
  for (let i = 0; i < equipped.length; i++) {
    const sid = equipped[i];
    const sk = GAME_DATA.SKILLS[sid];
    if (!sk || sk.isBasic) continue;
    if (BATTLE.skillCDs[sid]) continue;  // CD 中
    // 已有同一個 skill buff 中跳過（藥水 buff 不算）
    if (sk.isBuff && sk.buff) {
      const dup = BATTLE.buffs.some(b => b._skillId === sid && b.dur > 0);
      if (dup) continue;
    }
    const mpCost = sk.mpCost || 90;
    if (BATTLE.player.mp < mpCost) continue;  // MP 不足，跳這個技能
    // 放這個技能
    BATTLE.player.mp -= mpCost;
    castSkill(sk, sid);
    BATTLE.recentSkills.unshift(sid);
    if (BATTLE.recentSkills.length > 4) BATTLE.recentSkills.pop();
    return;
  }
  // 沒有可放的技能 → 普攻
  basicAttack();
}

function basicAttack() {
  // 依角色 blueprint 找普攻技能 ID（月凜=silver-thrust、雪羽=mirror-shot）
  const cs = GAME_STATE.state.characters[BATTLE.charId];
  let basicId = 'silver-thrust';
  if (cs) {
    const bp = GAME_DATA.getCharacterBlueprint(cs.blueprintId || cs.id);
    if (bp && bp.unlocks) {
      const firstBasic = bp.unlocks.find(u => u.type === 'skill' && u.skill && GAME_DATA.SKILLS[u.skill]?.isBasic);
      if (firstBasic) basicId = firstBasic.skill;
    }
  }
  BATTLE._activeSkillId = basicId;
  BATTLE._activeSkillName = null;  // 普攻不顯示「銀月刺」前綴
  // 普攻也要 roll 暴擊（之前忘了套）
  const effCrit = BATTLE.player.crit + getBuffMod('crit');
  const isCrit = Math.random() < effCrit;
  // 普攻附加傷害（buff 觸發，如雪羽 A 虛無一閃期間）
  const basicBonus = BATTLE.buffs.reduce((s, b) => s + (b.basicBonusAtk || 0), 0);
  const basicMul = 1 + basicBonus;
  const dmg = computeDamage(BATTLE.player.atk * basicMul, isCrit);
  if (window.battleAnim) battleAnim('player', isCrit ? 'attacking' : 'attacking');
  applyDamage(dmg, isCrit);
  // 普攻回藍
  const gain = BATTLE.player.mpPerHit || 8;
  BATTLE.player.mp = Math.min(BATTLE.player.maxMp, (BATTLE.player.mp || 0) + gain);
}

function trackDamage(amount, skillId, isCrit) {
  if (!BATTLE.damageStats) return;
  BATTLE.damageStats.total += amount;
  BATTLE.damageStats.hits += 1;
  if (isCrit) BATTLE.damageStats.crits += 1;
  const key = skillId || 'unknown';
  BATTLE.damageStats.bySkill[key] = (BATTLE.damageStats.bySkill[key] || 0) + amount;
}

function castSkill(sk, sidHint) {
  const sid = sidHint || Object.keys(GAME_DATA.SKILLS).find(k => GAME_DATA.SKILLS[k] === sk);
  let cd = sk.cd;
  if (BATTLE.player.cdReduce) cd *= (1 - BATTLE.player.cdReduce);
  BATTLE.skillCDs[sid] = cd;

  // ── 幻夢戒指：30% 機率重置該技能 CD（先設 CD 再判定，視覺上玩家會看到 CD 條跑滿後立刻變 0）──
  if (BATTLE.ringProcs && BATTLE.ringProcs.cdResetChance > 0 && Math.random() < BATTLE.ringProcs.cdResetChance) {
    delete BATTLE.skillCDs[sid];
    logLine(`<span class="lg-clear">★ 幻夢戒指觸發：${sk.name} CD 重置！</span>`, '');
  }

  // ── 蝕念戒指：每次釋放技能疊一層（攻擊 +5%，最多 10 層，戰鬥內持續）──
  if (BATTLE.ringProcs && BATTLE.ringProcs.skillStackAtkValue > 0) {
    const max = BATTLE.ringProcs.skillStackAtkMax;
    BATTLE.ringErosionStacks = Math.min((BATTLE.ringErosionStacks || 0) + 1, max);
    const stacks = BATTLE.ringErosionStacks;
    BATTLE.buffs = BATTLE.buffs.filter(b => !b._ringErosion);
    BATTLE.buffs.push({
      atk: BATTLE.ringProcs.skillStackAtkValue * stacks,
      dur: 9999, _maxDur: 9999,
      _name: `蝕念 ×${stacks}`,
      _ringErosion: true,
    });
    if (stacks === max && stacks > (BATTLE._ringErosionLoggedMax || 0)) {
      logLine(`<span class="lg-skill">★ 蝕念戒指達到滿層 ×${max}（攻擊 +${Math.round(BATTLE.ringProcs.skillStackAtkValue * max * 100)}%）</span>`, '');
      BATTLE._ringErosionLoggedMax = max;
    }
  }

  logLine(`<span class="lg-skill">${sk.name}</span> 發動！`, '');
  if (window.battleAnim) battleAnim('player', 'attacking');
  if (window.flashSkillButton) flashSkillButton(sid);
  BATTLE._activeSkillId = sid;
  BATTLE._activeSkillName = sk.name;  // 讓 applyDamage / applyAoeDamage 把技能名加進飄字

  const mults = Array.isArray(sk.mult) ? sk.mult : [sk.mult];
  let total = 0;
  for (const m of mults) {
    if (m === 0) continue;
    const effCrit = BATTLE.player.crit + getBuffMod('crit');
    const isCrit = sk.alwaysCrit || Math.random() < effCrit;
    // 技能傷害加成（skillDmg 屬性，僅用於技能不影響普攻）
    const skillMod = 1 + (BATTLE.player.skillDmg || 0);
    if (sk.aoe) {
      total += applyAoeDamage(sk, m, isCrit, skillMod);
    } else {
      let dmg = computeDamage(BATTLE.player.atk * m * skillMod, isCrit);
      if (BATTLE.enemy && BATTLE.enemy.isBoss) {
        if (sk.vsBossBonus) dmg = Math.floor(dmg * (1 + sk.vsBossBonus));
        if (BATTLE.player.vsBoss) dmg = Math.floor(dmg * (1 + BATTLE.player.vsBoss));
      }
      applyDamage(dmg, isCrit);
      total += dmg;
    }
    if (!BATTLE.enemy) break;
  }

  if (sk.dot && BATTLE.enemy) {
    BATTLE.dots.push({ dps: BATTLE.player.atk * sk.dot.dps, dur: sk.dot.dur, acc: 0, sourceId: sid, _name: sk.name, _maxDur: sk.dot.dur });
  }
  if (sk.summon && BATTLE.enemy) {
    BATTLE.summons.push({ dps: BATTLE.player.atk * sk.summon.dps, dur: sk.summon.dur, acc: 0, sourceId: sid, _name: sk.name, _maxDur: sk.summon.dur, interval: sk.summon.interval || 0.35 });
  }
  if (sk.freeze && BATTLE.enemy) {
    BATTLE.freezes = sk.freeze;
    BATTLE._freezeMax = sk.freeze;  // 紀錄初始時長供 UI 進度條用
  }
  if (sk.buff) BATTLE.buffs.push({ ...sk.buff, _skillId: sid, _name: sk.name, _maxDur: sk.buff.dur });
  if (sk.lifesteal && total > 0) {
    BATTLE.player.hp = Math.min(BATTLE.player.maxHp, BATTLE.player.hp + total * sk.lifesteal);
  }
  // ── 雪羽機制 ──
  // 自殘技能（chaos-blade）：施放後扣當前 HP %
  if (sk.selfDmg && sk.selfDmg > 0) {
    const loss = Math.floor(BATTLE.player.hp * sk.selfDmg);
    BATTLE.player.hp = Math.max(1, BATTLE.player.hp - loss);
    logLine(`<span class="lg-fail">${sk.name} 自損 -${loss} HP</span>`, '');
    if (window.floatDamage) floatDamage('-' + loss + ' (自損)', 'enemy');
  }
  // 強制設 HP 到指定 %（void-cleave）：搭配減傷 buff，HP 仍會正常下降但不會被秒
  if (sk.setHpPct != null) {
    const target = Math.floor(BATTLE.player.maxHp * sk.setHpPct);
    if (BATTLE.player.hp > target) BATTLE.player.hp = target;
    logLine(`<span class="lg-clear">${sk.name} HP 降至 ${Math.round(sk.setHpPct * 100)}%</span>`, '');
  }
  // 治癒技能（sacred-bloom、white-aegis、feather-eden）：施放時回 maxHp %
  if (sk.heal && sk.heal > 0) {
    const healMul = BATTLE.player.healMul || 1;
    const heal = Math.floor(BATTLE.player.maxHp * sk.heal * healMul);
    BATTLE.player.hp = Math.min(BATTLE.player.maxHp, BATTLE.player.hp + heal);
    logLine(`<span class="lg-clear">${sk.name} 回復 +${heal} HP</span>`, '');
    if (window.floatDamage) floatDamage('+' + heal, 'heal');
    // B 路線聖光治癒：同步治療隊友（pct of 對方 maxHp）
    if (sk.healAlly && window.MP_API && window.MP_API.broadcastHealAlly) {
      window.MP_API.broadcastHealAlly(sk.heal * healMul, sk.name);
    }
  }
  // 每段治癒（dawn-aria）：依 multi-hit 次數每段回 maxHp %
  if (sk.healPerHit && sk.healPerHit > 0) {
    const hits = Array.isArray(sk.mult) ? sk.mult.length : 1;
    const healMul = BATTLE.player.healMul || 1;
    const heal = Math.floor(BATTLE.player.maxHp * sk.healPerHit * hits * healMul);
    BATTLE.player.hp = Math.min(BATTLE.player.maxHp, BATTLE.player.hp + heal);
    if (sk.healAlly && window.MP_API && window.MP_API.broadcastHealAlly) {
      window.MP_API.broadcastHealAlly(sk.healPerHit * hits * healMul, sk.name);
    }
    if (heal > 0) {
      logLine(`<span class="lg-clear">${sk.name} 連歌回復 +${heal} HP</span>`, '');
      if (window.floatDamage) floatDamage('+' + heal, 'heal');
    }
  }
  // 神諭織縷觸發：每施放一個技能疊一層
  triggerCoreSet('on-skill-cast');
}

function skillColor(sk) {
  switch (sk.kind) {
    case 'fire':     return '#ff7e3a';
    case 'frost':    return '#7fd9ff';
    case 'arcane':   return '#c084ff';
    case 'physical': return '#ffe27a';
    case 'sonic':    return '#7fc8ff';
    default:         return '#ffffff';
  }
}

function doEnemyAttack(srcEnemy) {
  const e = srcEnemy || BATTLE.enemy;
  if (!e || e.hp <= 0) return;
  const atk = e.atk;
  let raw = Math.max(1, atk - BATTLE.player.def * 0.7);
  let dmg = Math.floor(raw * (0.85 + Math.random() * 0.3));
  const totalReduce = Math.min(0.9, (BATTLE.player.dmgReduce || 0) + getBuffMod('dmgReduce'));
  if (totalReduce > 0) dmg = Math.floor(dmg * (1 - totalReduce));
  BATTLE.player.hp = Math.max(0, BATTLE.player.hp - dmg);
  if (window.battleAnim) {
    battleAnim('enemy', 'attacking');
    setTimeout(() => battleAnim('player', 'hit'), 180);
  }
  if (window.floatDamage) floatDamage('-' + dmg, 'enemy');
  // 永凍守魂觸發：HP < 30% 且還沒觸發過 → 觸發無敵 + 回血
  // 已陣亡不再觸發（避免被回血+無敵起死回生）
  if (!BATTLE._dead && BATTLE.player.hp / BATTLE.player.maxHp < 0.30 && !BATTLE.setTriggers.frost) {
    triggerCoreSet('on-low-hp');
  }
}

function computeDamage(rawAtk, isCrit) {
  let mod = 1;
  for (const b of BATTLE.buffs) { if (b.atk) mod += b.atk; }
  // ── 雪羽 A 路線動態被動 ──
  // dark-blood：每損失 1% 當前 HP → 攻擊 +1%（最大 +60%）
  if (BATTLE.player.darkBlood && BATTLE.player.maxHp > 0) {
    const lossPct = 1 - (BATTLE.player.hp / BATTLE.player.maxHp);
    mod += Math.min(0.6, lossPct);
  }
  // last-stand：HP < 40% 時，atk +50%、critDmg +30%
  let critBonus = 0;
  if (BATTLE.player.lastStand && BATTLE.player.hp / BATTLE.player.maxHp < 0.4) {
    mod += 0.5;
    critBonus = 0.3;
  }
  const enemy = BATTLE.enemy;
  if (!enemy) return 0;
  const pierce = Math.min(0.95, BATTLE.player.defPierce || 0);
  const base = Math.max(1, rawAtk * mod - enemy.def * 0.4 * (1 - pierce));
  const critMul = (BATTLE.player.critDmg || 1.8) + critBonus;
  const dmg = Math.floor(base * (0.9 + Math.random() * 0.2) * (isCrit ? critMul : 1));
  return dmg;
}

function applyDamage(dmg, isCrit) {
  if (!BATTLE.enemy) return;
  const rawDmg = dmg;
  let actualDmg = dmg;
  // 鏡夢縛魂技能攔截：分身吸傷 / 鏡牢吸傷 / 治療打斷計數 / 紅絲掙脫計數
  // ★ 多人：只有 host / solo 套用 hook（權威端）；guest 送 raw 給 host 重算
  const isMirrorGuest = BATTLE.enemy.bossSkillTag === 'mirror' && BATTLE._mpMode === 'guest';
  if (BATTLE.enemy.bossSkillTag === 'mirror' && BATTLE._mpMode !== 'guest'
      && typeof mirrorBossDamageHook === 'function') {
    actualDmg = mirrorBossDamageHook(rawDmg);
  }
  // 無盡塔：HP 不扣（保持 MAX_SAFE_INTEGER），改累積到 totalDmg
  if (BATTLE._endlessMode) {
    BATTLE._endlessTotalDmg += actualDmg;
    BATTLE._endlessTeamDmg += actualDmg;
    updateEndlessTier();
  } else if (isMirrorGuest) {
    // 鏡夢縛魂 guest 端不本地扣 hp — 完全等 host enemy-sync 同步
  } else if (actualDmg > 0 && BATTLE.enemy.shield > 0) {
    // 護盾優先扣（雙影獵討機制）；溢出傷害扣 HP
    const absorbed = Math.min(BATTLE.enemy.shield, actualDmg);
    BATTLE.enemy.shield -= absorbed;
    const overflow = actualDmg - absorbed;
    if (overflow > 0) BATTLE.enemy.hp -= overflow;
    if (BATTLE.enemy.shield <= 0) {
      // 護盾打破 → 重置計時，等下次出現
      BATTLE.enemy.shield = 0; BATTLE.enemy.shieldMax = 0;
      BATTLE.enemy.shieldBreakTimer = 0;
      if (BATTLE.enemy.shieldConfig) BATTLE.enemy.shieldTimer = BATTLE.enemy.shieldConfig.interval;
      if (typeof logLine === 'function') logLine(`<span class="lg-clear">✓ 護盾粉碎！</span>`, '');
    }
  } else if (actualDmg > 0) {
    BATTLE.enemy.hp -= actualDmg;
  }
  // 統計用原始傷害（玩家輸出表）
  trackDamage(rawDmg, BATTLE._activeSkillId, isCrit);
  // 多人：廣播原始 dmg 給 host（host 端會再走一次 mirror hook 處理）
  if ((BATTLE._mpMode === 'host' || BATTLE._mpMode === 'guest') && window.MP_API) {
    const idx = BATTLE.currentWave ? BATTLE.currentWave.indexOf(BATTLE.enemy) : 0;
    if (idx >= 0) MP_API.reportDamageDealt(idx, rawDmg, isCrit);
  }
  if (window.battleAnim) {
    if (isCrit) battleAnim('enemy', 'crit-flash');
    else battleAnim('enemy', 'hit');
  }
  if (window.floatDamage) {
    // 技能名 + 傷害合併顯示（普攻不前綴技能名）
    const skillTag = BATTLE._activeSkillName ? `${BATTLE._activeSkillName} ` : '';
    const critTag = isCrit ? 'CRIT! ' : '';
    floatDamage(skillTag + critTag + rawDmg, isCrit ? 'crit' : (skillTag ? 'skill' : ''));
  }
  BATTLE._activeSkillName = null;  // 每次傷害用完就清，避免下次普攻又前綴技能名
  // 鏡夢縛魂：HP 跌破 0 時鎖在 1 進入 3 秒死亡動畫，不立刻 onEnemyDown
  if (BATTLE.enemy.bossSkillTag === 'mirror' && BATTLE._mpMode !== 'guest'
      && !BATTLE.bossDying && BATTLE.enemy.hp <= 0) {
    enterMirrorBossDying();
    return;
  }
  if (BATTLE.enemy.hp <= 0 && !BATTLE.bossDying) onEnemyDown();
}

// AOE 傷害：對 currentWave 所有存活目標各自計算傷害（依各自防禦）
function applyAoeDamage(sk, mult, isCrit, skillMod) {
  if (!BATTLE.currentWave || BATTLE.currentWave.length === 0) return 0;
  let totalDmg = 0;
  let hitCount = 0;
  let buffMod = 1;
  for (const b of BATTLE.buffs) if (b.atk) buffMod += b.atk;
  const critMul = BATTLE.player.critDmg || 1.8;
  const rawAtk = BATTLE.player.atk * mult * buffMod * (skillMod || 1);

  const aoePierce = Math.min(0.95, BATTLE.player.defPierce || 0);
  for (const e of BATTLE.currentWave) {
    if (e.hp <= 0) continue;
    let base = Math.max(1, rawAtk - e.def * 0.4 * (1 - aoePierce));
    let dmg = Math.floor(base * (0.9 + Math.random() * 0.2) * (isCrit ? critMul : 1));
    if (e.isBoss) {
      if (sk.vsBossBonus) dmg = Math.floor(dmg * (1 + sk.vsBossBonus));
      if (BATTLE.player.vsBoss) dmg = Math.floor(dmg * (1 + BATTLE.player.vsBoss));
    }
    // 鏡夢縛魂技能攔截（同 applyDamage：只在 host / solo 套用 hook）
    const aoeRawDmg = dmg;
    const aoeIsMirrorGuest = e.bossSkillTag === 'mirror' && BATTLE._mpMode === 'guest';
    if (e.bossSkillTag === 'mirror' && BATTLE._mpMode !== 'guest'
        && typeof mirrorBossDamageHook === 'function') {
      dmg = mirrorBossDamageHook(dmg);
    }
    // 無盡塔：HP 不扣，改累積到 totalDmg
    if (BATTLE._endlessMode) {
      BATTLE._endlessTotalDmg += dmg;
      BATTLE._endlessTeamDmg += dmg;
      updateEndlessTier();
    } else if (aoeIsMirrorGuest) {
      // 鏡夢縛魂 guest 端不本地扣 hp — 完全等 host enemy-sync
    } else if (e.shield > 0) {
      // 護盾優先扣 + 溢出傷害給 HP
      const absorbed = Math.min(e.shield, dmg);
      e.shield -= absorbed;
      const overflow = dmg - absorbed;
      if (overflow > 0) e.hp -= overflow;
      if (e.shield <= 0) {
        e.shield = 0; e.shieldMax = 0;
        e.shieldBreakTimer = 0;
        e.shieldTimer = e.shieldConfig.interval;
        if (typeof logLine === 'function') logLine(`<span class="lg-clear">✓ 護盾粉碎！</span>`, '');
      }
    } else {
      e.hp -= dmg;
    }
    trackDamage(aoeRawDmg, BATTLE._activeSkillId, isCrit);
    // 多人：廣播原始 dmg 給 host（host 會再走 mirror hook 處理）
    if ((BATTLE._mpMode === 'host' || BATTLE._mpMode === 'guest') && window.MP_API) {
      const idx = BATTLE.currentWave.indexOf(e);
      if (idx >= 0) MP_API.reportDamageDealt(idx, aoeRawDmg, isCrit);
    }
    totalDmg += aoeRawDmg;  // 顯示用原始值
    hitCount += 1;
  }

  if (hitCount > 0 && window.battleAnim) {
    battleAnim('enemy', isCrit ? 'crit-flash' : 'hit');
  }
  if (hitCount > 0 && window.floatDamage) {
    const skillTag = BATTLE._activeSkillName ? `${BATTLE._activeSkillName} ` : '';
    const critTag = isCrit ? 'CRIT! ' : '';
    const label = hitCount > 1
      ? `${skillTag}${critTag}AOE ×${hitCount} = ${totalDmg}`
      : `${skillTag}${critTag}${totalDmg}`;
    floatDamage(label, isCrit ? 'crit' : (skillTag ? 'skill' : ''));
  }
  BATTLE._activeSkillName = null;

  // 鏡夢縛魂：AOE 把 BOSS 打到 0 也鎖在 1 進入死亡動畫
  for (const e of BATTLE.currentWave) {
    if (e.bossSkillTag === 'mirror' && BATTLE._mpMode !== 'guest'
        && !BATTLE.bossDying && e.hp <= 0) {
      enterMirrorBossDying();
      return totalDmg;
    }
  }
  // 處理擊殺
  const anyDead = BATTLE.currentWave.some(e => e.hp <= 0);
  if (anyDead && !BATTLE.bossDying) onEnemyDown();

  return totalDmg;
}

function onEnemyDown() {
  if (BATTLE.enemy) BATTLE.enemy.hp = 0;
  // ─── 核心套裝觸發：on-kill（烈日斷罪） ───
  triggerCoreSet('on-kill');
  // 從目前 wave 中移除死掉的
  BATTLE.currentWave = (BATTLE.currentWave || []).filter(e => e.hp > 0);
  if (BATTLE.currentWave.length === 0) {
    // Wave 32：Guest 端「殺光當前 wave」→ 完全等 host 廣播下一波 enemy-sync
    // 之前會自己 spawnNextWave，但本地 BATTLE.waves 是 enemy-sync 補的空 stub
    // 結果 currentWave=[] / enemy=undefined → tickBattle 跳過 → 整場不動
    if (BATTLE._mpMode === 'guest') {
      BATTLE.enemy = null;
      BATTLE.currentWave = [];
      BATTLE.freezes = 0;
      // 不推 currentWaveIdx — 等 host enemy-sync 帶來新 idx + enemies
      // 200ms 內就會有下一個 enemy-sync 把 guest 拉到正確狀態
      if (BATTLE.onUpdate) BATTLE.onUpdate();
      return;
    }
    // Host 端：加 wave 切換 600ms 過渡（避免「一閃過」，給玩家看到擊殺反應）
    if (BATTLE._wavePending) return;
    BATTLE._wavePending = true;
    BATTLE.enemy = null;
    if (BATTLE.onUpdate) BATTLE.onUpdate();
    setTimeout(() => {
      BATTLE._wavePending = false;
      if (!BATTLE.running) return;
      BATTLE.currentWaveIdx++;
      BATTLE.freezes = 0;
      if (BATTLE.currentWaveIdx >= BATTLE.waves.length) onDungeonClear();
      else spawnNextWave();
    }, 600);
  } else {
    // 還有怪 → 切到下一個目標
    BATTLE.enemy = BATTLE.currentWave[0];
    if (BATTLE.onUpdate) BATTLE.onUpdate();
  }
}

// 無盡塔：累積傷害變更時更新已達階梯
function updateEndlessTier() {
  if (!BATTLE._endlessMode || !BATTLE._endlessTiers) return;
  const dmg = BATTLE._endlessTeamDmg;
  for (let i = BATTLE._endlessTiers.length - 1; i >= 0; i--) {
    if (dmg >= BATTLE._endlessTiers[i].dmg) {
      if (i > BATTLE._endlessReached) {
        BATTLE._endlessReached = i;
        const t = BATTLE._endlessTiers[i];
        logLine(`<span class="lg-clear">★ 階梯 ${t.label} 達成！（${(dmg/1e6).toFixed(1)}M）</span>`, '');
      }
      return;
    }
  }
}

// 無盡塔：30 秒時間到 → 結算
function onEndlessTimeUp() {
  if (BATTLE._cleared) return;
  BATTLE._cleared = true;
  // host 通知所有 guest：用權威 totalTeamDmg 強制結算（保證兩端同時結束 + 數據一致）
  if (BATTLE._mpMode === 'host' && window.MP_API && MP_API.broadcastEndlessEnd) {
    MP_API.broadcastEndlessEnd(BATTLE._endlessTeamDmg || 0);
  }
  const reached = BATTLE._endlessReached;
  const tiers = BATTLE._endlessTiers || [];
  const totalDmg = BATTLE._endlessTeamDmg;
  const selfDmg = BATTLE._endlessTotalDmg;
  const dungeonId = BATTLE.dungeonId;
  const d = GAME_DATA.getDungeon(dungeonId);
  const charId = BATTLE.charId;
  const cs = GAME_STATE.state.characters[charId];

  // 領取所有達到的階梯獎勵（互斥 → 累積發）
  const granted = { mats: {}, gems: [], chests: [], shard: 0 };
  for (let i = 0; i <= reached; i++) {
    const r = tiers[i].rewards || {};
    if (r.mats) {
      for (const [m, q] of Object.entries(r.mats)) {
        GAME_STATE.gainMaterial(m, q, charId);
        granted.mats[m] = (granted.mats[m] || 0) + q;
      }
    }
    if (r.gems) {
      const [tMin, tMax] = r.gems.tier;
      const pool = GAME_DATA.GEMS.filter(g => g.tier >= tMin && g.tier <= tMax);
      for (let n = 0; n < (r.gems.qty || 1); n++) {
        const picked = pool[Math.floor(Math.random() * pool.length)];
        if (picked) {
          GAME_STATE.gainGem(picked.id, 1, charId);
          granted.gems.push(picked.name);
        }
      }
    }
    if (r.shard) {
      GAME_STATE.gainShard(r.shard);
      granted.shard += r.shard;
    }
  }

  BATTLE.lastClear = {
    dungeonId,
    dungeonName: d.name,
    isEndless: true,
    failed: false,
    time: 30,
    endlessTotalDmg: totalDmg,
    endlessSelfDmg: selfDmg,
    endlessTierIdx: reached,
    endlessTierLabel: reached >= 0 ? tiers[reached].label : '未達',
    endlessGranted: granted,
    awardedToCharId: charId,
    awardedToCharName: cs ? (cs.customName || cs.id) : '?',
    damage: { ...BATTLE.damageStats, bySkill: { ...BATTLE.damageStats.bySkill } },
  };

  logLine(`<span class="lg-clear">⏱ 時間到！累積傷害 ${(totalDmg/1e6).toFixed(2)}M，達成階梯：${BATTLE.lastClear.endlessTierLabel}</span>`, '');
  GAME_STATE.scheduleSave();
  if (BATTLE.onClear) BATTLE.onClear();
  BATTLE._pendingStopTimer = setTimeout(() => { BATTLE._pendingStopTimer = null; stopBattle(); }, 400);
}

function onDungeonClear() {
  // 防重入：AOE 同時擊殺多隻 → onEnemyDown 多次連續呼叫 → 防止 onDungeonClear 跑多次
  if (BATTLE._cleared) return;
  BATTLE._cleared = true;
  // 多人 Host：立刻廣播 cleared 旗標確保 Guest 知道
  if (BATTLE._mpMode === 'host' && window.MP_API) {
    MP_API.broadcastEnemySync();
  }
  const d = GAME_DATA.getDungeon(BATTLE.dungeonId);
  const r = GAME_DATA.getRegionByDungeon(BATTLE.dungeonId);
  // Wave 30：戰利品全部歸到「戰鬥角色」cs.bag（不是 UI active 角色）
  // 這樣玩家在戰鬥中切到別角色看背包時，戰利品仍會記到正確角色
  const _battleCharId = BATTLE.charId;
  const _battleCs = GAME_STATE.state.characters[_battleCharId];
  // 首通判定：標記前先記下還沒清過（給 bonusEquipment guaranteedFirstClear 用）
  const _isFirstClear = !!(_battleCs && (!_battleCs.clearedDungeons || !_battleCs.clearedDungeons[d.id]));
  if (_battleCs) {
    if (!_battleCs.clearedDungeons) _battleCs.clearedDungeons = {};
    _battleCs.clearedDungeons[d.id] = true;
  }

  // 特殊副本倍率
  let expMul = 1, goldMul = 1, matMul = 1, equipDropChance = 0.30;
  let specialSSROnly = false;  // 特殊副本掉裝備時強制 SSR
  if (d.special === 'exp') { expMul = 3.5; goldMul = 0.3; equipDropChance = 0.008; specialSSROnly = true; }
  else if (d.special === 'mat') { expMul = 0.3; matMul = 6; equipDropChance = 0.008; specialSSROnly = true; }
  if (d.isRaid) { equipDropChance = 0.03; goldMul = 1.5; expMul = 1.5; }

  // 全域 buff 加成（卷軸）
  const expBuff = GAME_STATE.getGlobalBuffMod('expMul');
  const goldBuff = GAME_STATE.getGlobalBuffMod('goldMul');
  // 共鳴點數加成（每點 +2%，上限 100 點 = +200%）
  const resPts = GAME_STATE.state.resonancePoints || {};
  const resExpBonus = (resPts.expMul || 0) * 0.02;
  const resGoldBonus = (resPts.goldMul || 0) * 0.02;
  const dropBuff = GAME_STATE.getGlobalBuffMod('dropMul');
  expMul *= (1 + expBuff + resExpBonus);
  goldMul *= (1 + goldBuff + resGoldBonus);
  equipDropChance *= (1 + dropBuff);
  matMul *= (1 + dropBuff);

  const goldDrop = Math.floor(d.goldBase * (0.9 + Math.random() * 0.3) * goldMul);
  const expDrop = Math.floor(d.expBase * (0.9 + Math.random() * 0.3) * expMul);
  GAME_STATE.gainGold(goldDrop);             // 共用，無需指定角色
  GAME_STATE.gainExp(expDrop, _battleCharId); // 經驗給戰鬥角色

  // 多材料掉落系統
  const matDrops = rollMaterialDrops(d, matMul);
  const matMsgs = [];
  for (const [name, qty] of Object.entries(matDrops)) {
    GAME_STATE.gainMaterial(name, qty, _battleCharId);  // 材料給戰鬥角色
    matMsgs.push(`${name} +${qty}`);
  }
  // 副本層級必掉材料（雙影獵討星淵碎片 / 星龍鱗片）
  if (d.guaranteedMats) {
    for (const [n, [min, max]] of Object.entries(d.guaranteedMats)) {
      const q = min + Math.floor(Math.random() * (max - min + 1));
      GAME_STATE.gainMaterial(n, q, _battleCharId);
      matDrops[n] = (matDrops[n] || 0) + q;
      matMsgs.push(`★ ${n} +${q}`);
    }
  }
  // 副本層級機率掉特殊材料（永恆星辰）
  if (Array.isArray(d.bonusMats)) {
    for (const b of d.bonusMats) {
      if (Math.random() < (b.chance || 0)) {
        const [min, max] = b.qty || [1, 1];
        const q = min + Math.floor(Math.random() * (max - min + 1));
        GAME_STATE.gainMaterial(b.name, q, _battleCharId);
        matDrops[b.name] = (matDrops[b.name] || 0) + q;
        matMsgs.push(`✨ ${b.name} +${q}`);
      }
    }
  }
  // 副本層級機率掉特殊裝備（UR 戒指等）— 額外掉落，不佔通用裝備掉落配額
  // guaranteedFirstClear: 首通必掉（無視機率）
  let bonusEquipMsg = '';
  if (Array.isArray(d.bonusEquipment)) {
    for (const b of d.bonusEquipment) {
      const guaranteed = _isFirstClear && b.guaranteedFirstClear;
      if (guaranteed || Math.random() < (b.chance || 0)) {
        const items = b.items || (b.itemId ? [b.itemId] : []);
        if (!items.length) continue;
        const pickedId = items[Math.floor(Math.random() * items.length)];
        const pickedDef = GAME_DATA.findEquipment(pickedId);
        if (!pickedDef) continue;
        const instId = GAME_STATE.createEquipInstance(pickedId, true, _battleCharId);
        const inst = _battleCs && _battleCs.bag && _battleCs.bag.equipment ? _battleCs.bag.equipment[instId] : null;
        const affixDesc = (inst && inst.affixes && inst.affixes.length)
          ? '【' + inst.affixes.map(a => `${a.label}+${a.value}`).join('/') + '】'
          : '';
        const firstTag = guaranteed ? '【首通必掉】' : '';
        bonusEquipMsg = `<span class="lg-drop">★★${firstTag} 獲得 [${pickedDef.rarity}] ${pickedDef.name}${affixDesc}</span>`;
        logLine(bonusEquipMsg, '');
        matMsgs.push(`★★${firstTag}${pickedDef.name}`);
      }
    }
  }
  const mat = matMsgs[0] ? matMsgs[0].split(' ')[0] : '粗鋼';
  const matRoll = Object.values(matDrops).reduce((a, b) => a + b, 0);

  const shardDrop = Math.random() < 0.15 ? (1 + Math.floor(Math.random() * 3)) : 0;
  if (shardDrop) GAME_STATE.gainShard(shardDrop);  // 共用

  const clearTimeMs = BATTLE.startTime ? (performance.now() - BATTLE.startTime) : 0;

  let dropMsg = '';
  if (Math.random() < equipDropChance) {
    // 依副本 CP 決定可掉的階層（tier 0 ~ 4）
    let tierCap = 0;
    // 主線最高 SR（tier 2）— SSR 只能製作，UR 只有襲擊戰才掉
    if (d.cp >= 6000) tierCap = 2;
    else if (d.cp >= 1500) tierCap = 1;
    else tierCap = 0;
    // 隨機部位
    let slot;
    let forceMinTier = 0;  // 強制最低 tier（特殊副本 SSR 用）
    if (d.isRaid) {
      // 襲擊戰：50% 機率武器位（拼 UR）、50% 其他位（補 SSR）
      if (Math.random() < 0.5) {
        slot = 'weapon';
        tierCap = 4;  // 武器位才能掉 UR
      } else {
        const others = GAME_DATA.EQUIPMENT_SLOTS.filter(s => s !== 'weapon');
        slot = others[Math.floor(Math.random() * others.length)];
        tierCap = 3;  // 其他位最高 SSR
      }
    } else if (specialSSROnly) {
      // 特殊副本：強制 SSR（tier 3），排除 UR 武器與核心套裝防具（armorOnly 標記）
      slot = GAME_DATA.EQUIPMENT_SLOTS[Math.floor(Math.random() * GAME_DATA.EQUIPMENT_SLOTS.length)];
      tierCap = 3;
      forceMinTier = 3;
    } else {
      slot = GAME_DATA.EQUIPMENT_SLOTS[Math.floor(Math.random() * GAME_DATA.EQUIPMENT_SLOTS.length)];
    }
    let pool = GAME_DATA.ITEMS.equipment.filter(e => e.slot === slot && e.tier <= tierCap && e.tier >= Math.max(1, forceMinTier));
    // 副本層級覆寫：武器位限定特定 id 清單（雙影獵討只掉 ur2 系列）
    if (slot === 'weapon' && Array.isArray(d.weaponDropOverride)) {
      pool = GAME_DATA.ITEMS.equipment.filter(e => d.weaponDropOverride.includes(e.id));
    }
    // 雪羽 Phase 7：武器掉落不過濾 owner — 完全隨機，掉到別角色武器只能分解拿材料
    // （之前是 pool = pool.filter(e => e.owner === bpId)，現在拿掉以增加驚喜感）
    // 高機率掉低階、低機率掉高階（偏向當前等級）
    if (pool.length) {
      pool.sort((a, b) => b.tier - a.tier);
      // 加權選擇：高 tier 較稀有
      const weights = pool.map(e => Math.pow(0.45, tierCap - e.tier));
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * total;
      let picked = pool[0];
      for (let i = 0; i < pool.length; i++) {
        roll -= weights[i];
        if (roll <= 0) { picked = pool[i]; break; }
      }
      const instId = GAME_STATE.createEquipInstance(picked.id, true, _battleCharId);
      const inst = _battleCs && _battleCs.bag && _battleCs.bag.equipment ? _battleCs.bag.equipment[instId] : null;
      const affixDesc = (inst && inst.affixes && inst.affixes.length)
        ? '【' + inst.affixes.map(a => `${a.label}+${a.value}`).join('/') + '】'
        : '';
      dropMsg = `<span class="lg-drop">獲得 [${picked.rarity}] ${picked.name}${affixDesc}</span>`;
      var dropLabel = `[${picked.rarity}] ${picked.name}`;
      // UR 特別提示
      if (picked.rarity === 'UR' && typeof showUrDropAnnouncement === 'function') {
        showUrDropAnnouncement(picked.name);
      }
    }
  }

  // 魔法石掉落（5 階系統：T1 粗糙 → T5 至高）
  let gemDropMsg = '';
  let gemDropLabel = null;
  let gemChance = 0, gemTierMin = 1, gemTierMax = 1;
  if (d.isRaid && d.cp >= 20000) { gemChance = 1.0; gemTierMin = 3; gemTierMax = 5; }
  else if (d.isRaid) { gemChance = 1.0; gemTierMin = 3; gemTierMax = 4; }
  else if (d.special === 'forge' && d.cp >= 4000) { gemChance = 0.8; gemTierMin = 2; gemTierMax = 4; }
  else if (d.special === 'forge') { gemChance = 0.7; gemTierMin = 1; gemTierMax = 3; }
  else if (d.cp >= 6000) { gemChance = 0.10; gemTierMin = 1; gemTierMax = 3; }
  else if (d.cp >= 2500) { gemChance = 0.06; gemTierMin = 1; gemTierMax = 2; }
  else if (d.cp >= 800)  { gemChance = 0.04; gemTierMin = 1; gemTierMax = 2; }
  else if (d.cp >= 200)  { gemChance = 0.02; gemTierMin = 1; gemTierMax = 1; }
  if (Math.random() < gemChance) {
    // 加權：高 tier 較稀有（在範圍內挑）
    const pool = GAME_DATA.GEMS.filter(g => g.tier >= gemTierMin && g.tier <= gemTierMax);
    if (pool.length) {
      const weights = pool.map(g => Math.pow(0.5, g.tier - gemTierMin));
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * total;
      let picked = pool[0];
      for (let i = 0; i < pool.length; i++) {
        roll -= weights[i];
        if (roll <= 0) { picked = pool[i]; break; }
      }
      GAME_STATE.gainGem(picked.id, 1, _battleCharId);  // 魔法石給戰鬥角色
      gemDropMsg = ` <span class="lg-gem">[${picked.rarity}] ${picked.name} ×1</span>`;
      gemDropLabel = picked.name;
    }
  }

  // 寶箱掉落（隨機 lottery）
  let chestMsg = '';
  const chest = rollChestDrop(d);
  if (chest) {
    GAME_STATE.gainChest(chest, 1, _battleCharId);
    const c = GAME_DATA.findChest(chest);
    chestMsg = ` <span class="lg-chest">獲得 ${c.name}（背包點開）</span>`;
  }

  // 異界之鎚掉落：依副本類型給不同低機率（鍛造終焉鎧用）
  let hammerMsg = '';
  let hammerChance = 0;
  if (d.isRaid) hammerChance = 0.04;           // 襲擊戰 4%
  else if (d.special) hammerChance = 0.02;     // 神窟 2%
  else if (d.cp >= 6000) hammerChance = 0.005; // 主線高階 0.5%
  if (hammerChance > 0 && Math.random() < hammerChance) {
    GAME_STATE.gainMaterial('異界之鎚', 1, _battleCharId);
    hammerMsg = ` <span class="lg-drop">🔨 異界之鎚 ×1</span>`;
  }

  // 結算紀錄（含戰鬥輸出統計）
  BATTLE.lastClear = {
    dungeonId: d.id,
    dungeonName: d.name,
    isRaid: !!d.isRaid,
    failed: false,
    time: clearTimeMs / 1000,
    // Wave 30：記錄戰利品歸屬，UI 結算彈窗可顯示「→ 月凜的背包」
    awardedToCharId: _battleCharId,
    awardedToCharName: _battleCs ? (_battleCs.customName || _battleCs.id) : '?',
    exp: expDrop,
    gold: goldDrop,
    matName: mat,
    matQty: matRoll,
    matDrops: matDrops,  // 所有材料分布
    shard: shardDrop,
    drop: typeof dropLabel !== 'undefined' ? dropLabel : null,
    gem: gemDropLabel,
    chest: chest,  // 寶箱 id
    // 加成資訊（供結算 UI 顯示）
    expBuff, goldBuff, dropBuff,
    damage: { ...BATTLE.damageStats, bySkill: { ...BATTLE.damageStats.bySkill } },
  };

  const matStr = matMsgs.length ? matMsgs.join('、') : '無材料';
  logLine(`<span class="lg-clear">通關 ${d.name}！</span> ${(clearTimeMs/1000).toFixed(1)}s / 金 +${goldDrop} / 經驗 +${expDrop} / ${matStr} ${dropMsg}${gemDropMsg}${chestMsg}${hammerMsg}`, '');
  GAME_STATE.scheduleSave();
  if (BATTLE.onClear) BATTLE.onClear();

  BATTLE._pendingStopTimer = setTimeout(() => {
    BATTLE._pendingStopTimer = null;
    const did = BATTLE.dungeonId;
    const isRaid = GAME_DATA.getDungeon(did)?.isRaid;
    // Wave 29.3：用 BATTLE.charId（戰鬥角色）而非 activeCharId（UI 角色）取 cs
    // 避免玩家切到別的角色看背包時，自動再戰判斷錯誤
    const _autoCs = GAME_STATE.state.characters[BATTLE.charId];
    const _pendingJob = _autoCs ? (_autoCs.pendingJobChoice || 0) : 0;
    if (GAME_STATE.state.autoRun && !BATTLE.paused && !_pendingJob && !isRaid) {
      startBattle(did, BATTLE.charId);
    } else {
      // 給玩家明確訊息為什麼停了
      if (_pendingJob && _autoCs) {
        logLine(`<span class="lg-fail">需先選擇轉職路線（${_autoCs.customName || _autoCs.id}）才能繼續自動再戰</span>`, '');
      }
      stopBattle();
    }
  }, 400);
}

function onBattleFail() {
  const failedId = BATTLE.dungeonId;
  const d = GAME_DATA.getDungeon(failedId);
  const clearTimeMs = BATTLE.startTime ? (performance.now() - BATTLE.startTime) : 0;
  logLine(`<span class="lg-fail">戰敗 ${d?.name || ''}！自動戰鬥已停止，請重整裝備後手動再戰。</span>`, '');
  // 戰敗也存 lastClear 紀錄（供結算彈窗顯示傷害統計）
  BATTLE.lastClear = {
    dungeonId: failedId,
    dungeonName: d?.name || '?',
    isRaid: !!(d && d.isRaid),
    failed: true,
    time: clearTimeMs / 1000,
    exp: 0, gold: 0, matName: '無', matQty: 0, matDrops: {},
    shard: 0, drop: null, gem: null, chest: null,
    expBuff: 0, goldBuff: 0, dropBuff: 0,
    damage: { ...BATTLE.damageStats, bySkill: { ...BATTLE.damageStats.bySkill } },
  };
  stopBattle();
  if (BATTLE.onFail) BATTLE.onFail();
}

window.BATTLE = BATTLE;
window.startBattle = startBattle;
window.rollMaterialDrops = rollMaterialDrops;
window.stopBattle = stopBattle;
window.tickBattle = tickBattle;
window.onEnemyDown = onEnemyDown;
window.updateEndlessTier = updateEndlessTier;
window.trackDamage = trackDamage;
window.spawnNextWave = spawnNextWave;
window.mirrorBossDamageHook = mirrorBossDamageHook;  // 鏡夢縛魂 host 端 MP 傷害攔截用
window.onDungeonClear = onDungeonClear;
window.onBattleFail = onBattleFail;
window.onEndlessTimeUp = onEndlessTimeUp;
