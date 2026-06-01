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

  const ratio = cp / dungeon.cp;
  if (ratio < 0.4) {
    logLine(`戰力不足，無法挑戰 <b>${dungeon.name}</b>（需要 ${dungeon.cp} CP，目前 ${cp}）`, 'lg-fail');
    return false;
  }
  BATTLE.speedMul = 1.0;   // 戰速固定，通關快慢由角色攻速 + 傷害決定
  BATTLE.startTime = performance.now();

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
  BATTLE._wavePending = false;  // 重置 wave 切換 pending 旗標
  BATTLE.setTriggers = { sun: 0, frost: false, oracle: 0 };  // 核心套裝觸發狀態
  // 多人模式判定：襲擊戰 + 已連線 → host / guest，其他 → solo
  BATTLE._mpMode = 'solo';
  if (dungeon.isRaid && window.MP_API && MP_API.isConnected()) {
    BATTLE._mpMode = MP_API.isHost() ? 'host' : 'guest';
  }
  BATTLE._lastEnemySync = 0;
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
function buildWaves(dungeon) {
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

function makeEnemy(name, dungeon, isBoss) {
  const factor = isBoss ? 4 : 1;
  const diffMul = dungeon.difficultyMul || 1;  // 影響 HP / def，但 atk 用獨立倍率
  const baseHp = Math.max(60, Math.floor(dungeon.cp * 1.6 * factor * diffMul));
  // 攻擊力倍率：襲擊戰用更低係數避免秒殺玩家（玩家 HP 約 1-2 萬，原本 atk 3 萬會直接秒）
  // 公式：cp × atkCoef × (boss ×1.5) × atkDiffMul
  let atkCoef = 0.08;
  let atkDiffMul = diffMul;
  if (dungeon.isRaid) {
    atkCoef = 0.025;       // 從 0.08 降到 0.025（約 1/3）
    atkDiffMul = Math.min(diffMul, 2.0);  // atk 不吃完整 diffMul（從 3.5 壓回 2.0）
  } else if (dungeon.special) {
    atkCoef = 0.05;        // 神窟也略降
  }
  return {
    name, isBoss,
    hp: baseHp, maxHp: baseHp,
    atk: Math.floor(dungeon.cp * atkCoef * (isBoss ? 1.5 : 1) * atkDiffMul + 4),
    def: Math.floor(dungeon.cp * 0.04 * (isBoss ? 1.4 : 1) * diffMul),
  };
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
  if (BATTLE.onUpdate) BATTLE.onUpdate();
}

function tickBattle(dt) {
  if (!BATTLE.running || BATTLE.paused) return;
  if (!BATTLE.enemy) return;

  const dtSec = (dt / 1000) * BATTLE.speedMul;

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

  // buff/dot/summon
  tickBuffs(dtSec);
  tickDots(dtSec);
  tickSummons(dtSec);

  // MP 自然回復（依角色屬性 mpRegen/sec）
  if (BATTLE.player.mp < BATTLE.player.maxMp) {
    const regen = (BATTLE.player.mpRegen || 8);
    BATTLE.player.mp = Math.min(BATTLE.player.maxMp, BATTLE.player.mp + regen * dtSec);
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
    const effSpd = BATTLE.player.spd * (1 + getBuffMod('spdMul'));
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

  // 全隊滅判定：組隊時自己 dead + 所有隊友 dead → 觸發戰敗結算
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
        logLine('<span class="lg-fail">全隊滅亡！</span>', '');
        onBattleFail();
      }
    }
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
        BATTLE.enemy.hp -= dmg;
        trackDamage(dmg, d.sourceId, false);
        if (window.floatDamage) floatDamage('🔥 ' + dmg, 'dot');
        if (BATTLE.enemy.hp <= 0) { onEnemyDown(); return false; }
      }
    }
    return d.dur > 0;
  });
}
// 自動喝藥邏輯：CD 用固定秒數（不被 cdReduce 屬性影響）
function tickPotions(dt) {
  if (!BATTLE.charId) return;
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
    const have = (GAME_STATE.state.bag.potions && GAME_STATE.state.bag.potions[pid]) || 0;
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
  BATTLE.summons = BATTLE.summons.filter(s => {
    s.dur -= dt;
    s.acc += dt;
    // 攻擊頻率 0.5 秒（從 0.8 加快 60%）
    while (s.acc >= 0.5) {
      s.acc -= 0.5;
      if (BATTLE.enemy) {
        // 召喚物吃玩家暴擊率，可暴擊
        const effCrit = BATTLE.player.crit + getBuffMod('crit');
        const isCrit = Math.random() < effCrit;
        const dmg = computeDamage(s.dps * BATTLE.player.summonMul, isCrit);
        BATTLE.enemy.hp -= dmg;
        trackDamage(dmg, s.sourceId, isCrit);
        if (window.floatDamage) floatDamage('🦊 ' + (isCrit ? 'CRIT! ' : '') + dmg, isCrit ? 'crit' : 'summon');
        if (BATTLE.enemy.hp <= 0) { onEnemyDown(); return false; }
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
  BATTLE._activeSkillId = 'silver-thrust';
  BATTLE._activeSkillName = null;  // 普攻不顯示「銀月刺」前綴
  // 普攻也要 roll 暴擊（之前忘了套）
  const effCrit = BATTLE.player.crit + getBuffMod('crit');
  const isCrit = Math.random() < effCrit;
  const dmg = computeDamage(BATTLE.player.atk * 1.0, isCrit);
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
    BATTLE.summons.push({ dps: BATTLE.player.atk * sk.summon.dps, dur: sk.summon.dur, acc: 0, sourceId: sid, _name: sk.name, _maxDur: sk.summon.dur });
  }
  if (sk.freeze && BATTLE.enemy) {
    BATTLE.freezes = sk.freeze;
    BATTLE._freezeMax = sk.freeze;  // 紀錄初始時長供 UI 進度條用
  }
  if (sk.buff) BATTLE.buffs.push({ ...sk.buff, _skillId: sid, _name: sk.name, _maxDur: sk.buff.dur });
  if (sk.lifesteal && total > 0) {
    BATTLE.player.hp = Math.min(BATTLE.player.maxHp, BATTLE.player.hp + total * sk.lifesteal);
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
  if (BATTLE.player.hp / BATTLE.player.maxHp < 0.30 && !BATTLE.setTriggers.frost) {
    triggerCoreSet('on-low-hp');
  }
}

function computeDamage(rawAtk, isCrit) {
  let mod = 1;
  for (const b of BATTLE.buffs) { if (b.atk) mod += b.atk; }
  const enemy = BATTLE.enemy;
  if (!enemy) return 0;
  const base = Math.max(1, rawAtk * mod - enemy.def * 0.4);
  const critMul = BATTLE.player.critDmg || 1.8;
  const dmg = Math.floor(base * (0.9 + Math.random() * 0.2) * (isCrit ? critMul : 1));
  return dmg;
}

function applyDamage(dmg, isCrit) {
  if (!BATTLE.enemy) return;
  BATTLE.enemy.hp -= dmg;
  trackDamage(dmg, BATTLE._activeSkillId, isCrit);
  // 多人：把自己造成的傷害廣播給所有隊友（host & guest 都廣播）
  if ((BATTLE._mpMode === 'host' || BATTLE._mpMode === 'guest') && window.MP_API) {
    const idx = BATTLE.currentWave ? BATTLE.currentWave.indexOf(BATTLE.enemy) : 0;
    if (idx >= 0) MP_API.reportDamageDealt(idx, dmg, isCrit);
  }
  if (window.battleAnim) {
    if (isCrit) battleAnim('enemy', 'crit-flash');
    else battleAnim('enemy', 'hit');
  }
  if (window.floatDamage) {
    // 技能名 + 傷害合併顯示（普攻不前綴技能名）
    const skillTag = BATTLE._activeSkillName ? `${BATTLE._activeSkillName} ` : '';
    const critTag = isCrit ? 'CRIT! ' : '';
    floatDamage(skillTag + critTag + dmg, isCrit ? 'crit' : (skillTag ? 'skill' : ''));
  }
  BATTLE._activeSkillName = null;  // 每次傷害用完就清，避免下次普攻又前綴技能名
  if (BATTLE.enemy.hp <= 0) onEnemyDown();
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

  for (const e of BATTLE.currentWave) {
    if (e.hp <= 0) continue;
    let base = Math.max(1, rawAtk - e.def * 0.4);
    let dmg = Math.floor(base * (0.9 + Math.random() * 0.2) * (isCrit ? critMul : 1));
    if (e.isBoss) {
      if (sk.vsBossBonus) dmg = Math.floor(dmg * (1 + sk.vsBossBonus));
      if (BATTLE.player.vsBoss) dmg = Math.floor(dmg * (1 + BATTLE.player.vsBoss));
    }
    e.hp -= dmg;
    trackDamage(dmg, BATTLE._activeSkillId, isCrit);
    // 多人：把 AOE 傷害也廣播給所有隊友（host & guest 都廣播）
    if ((BATTLE._mpMode === 'host' || BATTLE._mpMode === 'guest') && window.MP_API) {
      const idx = BATTLE.currentWave.indexOf(e);
      if (idx >= 0) MP_API.reportDamageDealt(idx, dmg, isCrit);
    }
    totalDmg += dmg;
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

  // 處理擊殺
  const anyDead = BATTLE.currentWave.some(e => e.hp <= 0);
  if (anyDead) onEnemyDown();

  return totalDmg;
}

function onEnemyDown() {
  if (BATTLE.enemy) BATTLE.enemy.hp = 0;
  // ─── 核心套裝觸發：on-kill（烈日斷罪） ───
  triggerCoreSet('on-kill');
  // 從目前 wave 中移除死掉的
  BATTLE.currentWave = (BATTLE.currentWave || []).filter(e => e.hp > 0);
  if (BATTLE.currentWave.length === 0) {
    // Guest 端不主動推進 wave，等 Host 廣播 enemy-sync 來對齊（避免兩邊小怪不同步）
    if (BATTLE._mpMode === 'guest') {
      BATTLE.enemy = null;
      if (BATTLE.onUpdate) BATTLE.onUpdate();
      return;
    }
    // 加 wave 切換 600ms 過渡（避免「一閃過」，給玩家看到擊殺反應）
    if (BATTLE._wavePending) return;  // 已 pending 不再排
    BATTLE._wavePending = true;
    BATTLE.enemy = null;
    if (BATTLE.onUpdate) BATTLE.onUpdate();
    setTimeout(() => {
      BATTLE._wavePending = false;
      if (!BATTLE.running) return;  // 戰鬥已停（離開 / 重打）就跳過
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
  GAME_STATE.state.clearedDungeons[d.id] = true;

  // 特殊副本倍率
  let expMul = 1, goldMul = 1, matMul = 1, equipDropChance = 0.30;
  let specialSSROnly = false;  // 特殊副本掉裝備時強制 SSR
  if (d.special === 'exp') { expMul = 3.5; goldMul = 0.3; equipDropChance = 0.008; specialSSROnly = true; }
  else if (d.special === 'mat') { expMul = 0.3; matMul = 6; equipDropChance = 0.008; specialSSROnly = true; }
  // 'forge' special 已棄用（合併進 mat 神窟），保留判斷以防舊存檔殘留
  if (d.isRaid) { equipDropChance = 0.03; goldMul = 1.5; expMul = 1.5; }  // UR 武器：3% 掉率

  // 全域 buff 加成（卷軸）
  const expBuff = GAME_STATE.getGlobalBuffMod('expMul');
  const goldBuff = GAME_STATE.getGlobalBuffMod('goldMul');
  const dropBuff = GAME_STATE.getGlobalBuffMod('dropMul');
  expMul *= (1 + expBuff);
  goldMul *= (1 + goldBuff);
  equipDropChance *= (1 + dropBuff);
  matMul *= (1 + dropBuff);  // 幸運神符同時加成材料掉落數量

  const goldDrop = Math.floor(d.goldBase * (0.9 + Math.random() * 0.3) * goldMul);
  const expDrop = Math.floor(d.expBase * (0.9 + Math.random() * 0.3) * expMul);
  GAME_STATE.gainGold(goldDrop);
  GAME_STATE.gainExp(expDrop);

  // 多材料掉落系統：每次副本 roll 5 階材料各一次，低階機率高
  const matDrops = rollMaterialDrops(d, matMul);
  const matMsgs = [];
  for (const [name, qty] of Object.entries(matDrops)) {
    GAME_STATE.gainMaterial(name, qty);
    matMsgs.push(`${name} +${qty}`);
  }
  const mat = matMsgs[0] ? matMsgs[0].split(' ')[0] : '粗鋼';  // for lastClear summary backward-compat
  const matRoll = Object.values(matDrops).reduce((a, b) => a + b, 0);

  const shardDrop = Math.random() < 0.15 ? (1 + Math.floor(Math.random() * 3)) : 0;
  if (shardDrop) GAME_STATE.gainShard(shardDrop);

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
    // 特殊副本掉 SSR：包含核心套裝（神諭 / 烈日 / 永凍）。製作仍是穩定路線、掉落是驚喜。
    const bpId = (BATTLE.charId || '').split('#')[0];
    if (slot === 'weapon') pool = pool.filter(e => e.owner === bpId);
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
      const instId = GAME_STATE.createEquipInstance(picked.id, true);
      const inst = GAME_STATE.state.bag.equipment[instId];
      const affixDesc = inst.affixes.length
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
      GAME_STATE.gainGem(picked.id, 1);
      gemDropMsg = ` <span class="lg-gem">[${picked.rarity}] ${picked.name} ×1</span>`;
      gemDropLabel = picked.name;
    }
  }

  // 寶箱掉落（隨機 lottery）
  let chestMsg = '';
  const chest = rollChestDrop(d);
  if (chest) {
    GAME_STATE.gainChest(chest, 1);
    const c = GAME_DATA.findChest(chest);
    chestMsg = ` <span class="lg-chest">獲得 ${c.name}（背包點開）</span>`;
  }

  // 結算紀錄（含戰鬥輸出統計）
  BATTLE.lastClear = {
    dungeonId: d.id,
    dungeonName: d.name,
    isRaid: !!d.isRaid,
    failed: false,
    time: clearTimeMs / 1000,
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
  logLine(`<span class="lg-clear">通關 ${d.name}！</span> ${(clearTimeMs/1000).toFixed(1)}s / 金 +${goldDrop} / 經驗 +${expDrop} / ${matStr} ${dropMsg}${gemDropMsg}${chestMsg}`, '');
  GAME_STATE.scheduleSave();
  if (BATTLE.onClear) BATTLE.onClear();

  setTimeout(() => {
    const did = BATTLE.dungeonId;
    const isRaid = GAME_DATA.getDungeon(did)?.isRaid;
    // 襲擊戰打完即停止自動戰鬥（玩家確認結算後才能再次手動進入）
    if (GAME_STATE.state.autoRun && !BATTLE.paused && !GAME_STATE.state.pendingJobChoice && !isRaid) {
      startBattle(did, BATTLE.charId);
    } else {
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
window.trackDamage = trackDamage;
window.spawnNextWave = spawnNextWave;
window.onDungeonClear = onDungeonClear;
window.onBattleFail = onBattleFail;
