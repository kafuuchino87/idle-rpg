// ===========================================================================
// 幻域編年史 · 遊戲資料層（月凜版）
// ===========================================================================

// --------------------------------------------------------------------------
// 角色：月凜（首推）— 銀月矛 × 雪狐契約 × 雙形態
// --------------------------------------------------------------------------
const CHARACTERS = [
  {
    id: 'tsukirin',
    name: '月凜',
    enName: 'Tsuki Rin',
    title: '銀月狐巫',
    weaponType: '銀月矛',
    role: '近戰 / 三路線分歧',
    lore: '霜月家末代弟子，自幼能聽見雪山深處的低語。十二歲那年雪狐之靈「白霧」附身於她，從此她以家傳銀月矛行走江湖，誓要找出當年焚毀祖廟的火影。',
    palette: { skin: '#f0d8be', hair: '#d4d8e8', cloth: '#1a1f33', accent: '#7fd9ff' },
    // 一階基礎屬性（裸值，會被等級、裝備、共鳴加成）
    baseStats: { atk: 24, def: 10, hp: 200, spd: 1.15, crit: 0.12 },
    // 三條轉職路線（Lv25 一轉 / Lv50 二轉 / Lv75 三轉）
    paths: {
      A: {
        id: 'A', name: '疾風月舞', tag: '速攻連擊',
        desc: '專精連續斬擊，每段攻擊都累積氣勢。月華如刃，無一絲停歇。',
        tier2: { name: '月華舞姬', desc: '舞姿如月華傾瀉，連擊化為流光。' },
        tier3: { name: '永夜舞姬', desc: '永夜中起舞的不滅幻影。' },
      },
      B: {
        id: 'B', name: '靈契禦狐', tag: '召喚輔助',
        desc: '與白霧之契加深，召喚雪狐共同作戰。冷霜封路，靈獸圍敵。',
        tier2: { name: '御狐司祭', desc: '已從契約者進化為馭使者，狐神低語回應其令。' },
        tier3: { name: '白霧之主', desc: '白霧成為她的延伸，狐神親臨戰場。' },
      },
    },
    // 等級解鎖列表（unlockLv -> 解鎖內容）
    unlocks: [
      { lv: 1,  type: 'skill',   pathAny: true, skill: 'silver-thrust' },
      { lv: 1,  type: 'skill',   pathAny: true, skill: 'crescent-slash' },
      { lv: 5,  type: 'skill',   pathAny: true, skill: 'frost-needle' },
      { lv: 10, type: 'passive', pathAny: true, passive: 'fox-eye' },
      { lv: 15, type: 'skill',   pathAny: true, skill: 'white-mist' },
      { lv: 20, type: 'skill',   pathAny: true, skill: 'silver-cloak' },
      { lv: 25, type: 'job',     tier: 1 },
      // 一轉 Lv25 技能（依路線）
      { lv: 25, type: 'skill', path: 'A', skill: 'moonshade-dance' },
      { lv: 25, type: 'skill', path: 'B', skill: 'fox-mirage' },
      // Lv 35 路線被動
      { lv: 35, type: 'passive', path: 'A', passive: 'wind-seal' },
      { lv: 35, type: 'passive', path: 'B', passive: 'pact-seal' },
      // Lv 45 路線技能
      { lv: 45, type: 'skill', path: 'A', skill: 'splitmoon-bloom' },
      { lv: 45, type: 'skill', path: 'B', skill: 'frostfall' },
      { lv: 50, type: 'job',     tier: 2 },
      // 二轉 Lv50 升級 + 新技能
      { lv: 50, type: 'skill', path: 'A', skill: 'moonwheel-waltz' },
      { lv: 50, type: 'skill', path: 'B', skill: 'mist-seal' },
      // Lv 60 路線被動 2
      { lv: 60, type: 'passive', path: 'A', passive: 'traceless' },
      { lv: 60, type: 'passive', path: 'B', passive: 'oracle' },
      { lv: 40, type: 'skill',   pathAny: true, skill: 'frost-shield' },
      { lv: 65, type: 'skill',   pathAny: true, skill: 'lunar-vigor' },
      { lv: 75, type: 'job',     tier: 3 },
      // 三轉 Lv75 終極技能
      { lv: 75, type: 'skill', path: 'A', skill: 'endless-night' },
      { lv: 75, type: 'skill', path: 'B', skill: 'fox-god-descend' },
      // Lv 90 終極被動
      { lv: 90, type: 'passive', pathAny: true, passive: 'silver-soul' },
      { lv: 99, type: 'graduate' },
    ],
  },
  // ============================================================================
  // 雪羽 — Eve 為原型的鏡靈使
  // ============================================================================
  {
    id: 'eve',
    name: '雪羽',
    enName: 'Yukiha',
    title: '鏡靈使',
    weaponType: '靈鏡',
    role: '中距 / 雙形態（暗蝕 ↔ 聖光）',
    lore: '在世界邊緣的鏡之神域，沉眠著一面記錄萬象的「夢境之鏡」。某日鏡光迸裂，誕下少女雪羽 — 她是鏡的意志化身。隨著心境分歧，她將踏上月蝕墮天或白翼聖姫的命運。',
    palette: { skin: '#f4dfd0', hair: '#dde0e8', cloth: '#e8e8f0', accent: '#a89cff' },
    // 基礎屬性：低 HP / 低速、但高 crit、定位中距精準
    baseStats: { atk: 22, def: 9, hp: 180, spd: 1.0, crit: 0.15 },
    paths: {
      A: {
        id: 'A', name: '月蝕墮天', tag: '暗影爆發',
        desc: '心被絕望吞噬，化為毀滅之姫。以自身鮮血換取毀世之力。',
        tier2: { name: '月蝕侵染', desc: '紫黑暗影侵蝕雙瞳，鏡片化為利刃。' },
        tier3: { name: '月蝕墮天', desc: '魔翼覺醒，巨型魔劍出鞘。' },
      },
      B: {
        id: 'B', name: '白翼聖姫', tag: '聖光治癒',
        desc: '心被希望淨化，化為守護之姫。聖光融鏡，治癒戰場一切創傷。',
        tier2: { name: '光輝守護', desc: '羽翼覺醒，鏡片化為光芒。' },
        tier3: { name: '白翼聖姫', desc: '彩翼舞動，聖光神諭加身。' },
      },
    },
    unlocks: [
      { lv: 1,  type: 'skill',   pathAny: true, skill: 'mirror-shot' },     // 普攻
      { lv: 1,  type: 'skill',   pathAny: true, skill: 'ring-flash' },      // 連擊
      { lv: 5,  type: 'skill',   pathAny: true, skill: 'star-shard' },      // AOE
      { lv: 10, type: 'passive', pathAny: true, passive: 'third-eye' },     // crit+
      { lv: 15, type: 'skill',   pathAny: true, skill: 'mirror-shield' },   // 減傷 buff
      { lv: 20, type: 'skill',   pathAny: true, skill: 'ray-cleave' },      // 單體高傷
      { lv: 25, type: 'job',     tier: 1 },
      { lv: 25, type: 'skill', path: 'A', skill: 'eclipse-touch' },         // A 連擊+DOT
      { lv: 25, type: 'skill', path: 'B', skill: 'sacred-bloom' },          // B 治療AOE
      { lv: 35, type: 'passive', path: 'A', passive: 'dark-blood' },        // 損 HP 換 atk
      { lv: 35, type: 'passive', path: 'B', passive: 'holy-grace' },        // HP regen
      { lv: 40, type: 'skill',   pathAny: true, skill: 'prism-veil' },      // 共用盾
      { lv: 45, type: 'skill', path: 'A', skill: 'chaos-blade' },           // A 自殘大傷
      { lv: 45, type: 'skill', path: 'B', skill: 'dawn-aria' },             // B AOE治癒
      { lv: 50, type: 'job',     tier: 2 },
      { lv: 50, type: 'skill', path: 'A', skill: 'black-moon-judge' },      // A vsBOSS
      { lv: 50, type: 'skill', path: 'B', skill: 'white-aegis' },           // B 護盾
      { lv: 60, type: 'passive', path: 'A', passive: 'last-stand' },        // 背水
      { lv: 60, type: 'passive', path: 'B', passive: 'angel-favor' },       // 神光庇護
      { lv: 65, type: 'skill',   pathAny: true, skill: 'mirror-vigor' },    // 共用補給
      { lv: 75, type: 'job',     tier: 3 },
      { lv: 75, type: 'skill', path: 'A', skill: 'void-cleave' },           // A 終極
      { lv: 75, type: 'skill', path: 'B', skill: 'feather-eden' },          // B 終極
      { lv: 90, type: 'passive', pathAny: true, passive: 'mirror-soul' },   // 終極被動
      { lv: 99, type: 'graduate' },
    ],
  },
  // ============================================================================
  // 璃安 — Rena 為原型的翠林之靈（弓系角色）
  // ============================================================================
  {
    id: 'rean',
    name: '璃安',
    enName: 'Rean',
    title: '翠林之靈',
    weaponType: '翠玉弓',
    role: '中距 / 雙形態（風舞 ↔ 神射）',
    lore: '翠林深處千年沉睡的精靈，因古星之光甦醒。她攜弓而行，感知自然失衡之處——憤怒時，風暴自弓弦而生。一條路通往凡塵風舞，另一條飛向天境光神。',
    palette: { skin: '#f4dfcf', hair: '#f5dc9a', cloth: '#a8d8a8', accent: '#7ee8a8' },
    // 平衡：跟 月凜 / 雪羽 同等級
    baseStats: { atk: 23, def: 10, hp: 190, spd: 1.10, crit: 0.13 },
    paths: {
      A: {
        id: 'A', name: '風韻舞姬', tag: '多段風舞',
        desc: '放下長弓改執雙扇，化身翠林的風暴具現。每一舞每一旋皆是利刃。',
        tier2: { name: '風華舞姬', desc: '雙扇與風融為一體，舞步即殺戮。' },
        tier3: { name: '風華絕舞', desc: '永恆的舞動如翠羽千舞無盡，敵人連倒下都來不及。' },
      },
      B: {
        id: 'B', name: '光弓神使', tag: '長距神射',
        desc: '弓弦上凝聚的不再只是風——是神之光。她聽見天境的召喚。',
        tier2: { name: '翠林神使', desc: '神域翠光降臨弓身，箭矢化為神諭。' },
        tier3: { name: '降臨光神', desc: '羽翼與神光全開，每箭都是神的審判。' },
      },
    },
    unlocks: [
      // 通用技能 (Lv 1 - 20)
      { lv: 1,  type: 'skill',   pathAny: true, skill: 'verdant-shot' },        // 普攻
      { lv: 1,  type: 'skill',   pathAny: true, skill: 'wind-arrow' },          // 單體
      { lv: 5,  type: 'skill',   pathAny: true, skill: 'leaf-storm' },          // 多段 AOE
      { lv: 10, type: 'passive', pathAny: true, passive: 'forest-blessing' },   // 攻速 + crit
      { lv: 15, type: 'skill',   pathAny: true, skill: 'wind-veil' },           // 減傷 buff
      { lv: 20, type: 'skill',   pathAny: true, skill: 'piercing-shot' },       // 單體必爆
      { lv: 25, type: 'job',     tier: 1 },
      // 一轉 Lv25 路線技
      { lv: 25, type: 'skill', path: 'A', skill: 'whirlwind-slash' },           // A 連擊
      { lv: 25, type: 'skill', path: 'B', skill: 'holy-pierce' },               // B 神聖單體
      // Lv 35 路線被動 1
      { lv: 35, type: 'passive', path: 'A', passive: 'wind-charm' },            // A 攻速
      { lv: 35, type: 'passive', path: 'B', passive: 'sacred-grace' },          // B vsBoss
      // Lv 40 通用：buff 技
      { lv: 40, type: 'skill',   pathAny: true, skill: 'evergreen-aura' },
      // Lv 45 路線技
      { lv: 45, type: 'skill', path: 'A', skill: 'twin-fan-dance' },            // A AOE
      { lv: 45, type: 'skill', path: 'B', skill: 'light-halo' },                // B 自治
      { lv: 50, type: 'job',     tier: 2 },
      // 二轉 Lv50
      { lv: 50, type: 'skill', path: 'A', skill: 'tempest-bloom' },             // A 大 AOE
      { lv: 50, type: 'skill', path: 'B', skill: 'divine-judgment' },           // B 對 BOSS
      // Lv 60 路線被動 2
      { lv: 60, type: 'passive', path: 'A', passive: 'twin-fan-art' },          // A 攻速+crit+技傷
      { lv: 60, type: 'passive', path: 'B', passive: 'full-bloom' },            // B atk+hp+dmgReduce
      // Lv 65 通用補給
      { lv: 65, type: 'skill',   pathAny: true, skill: 'forest-vigor' },
      { lv: 75, type: 'job',     tier: 3 },
      // 三轉 Lv75 大招
      { lv: 75, type: 'skill', path: 'A', skill: 'thousand-feather-dance' },    // A 終極
      { lv: 75, type: 'skill', path: 'B', skill: 'oracle-arrow' },              // B 終極
      // Lv 90 終極被動
      { lv: 90, type: 'passive', pathAny: true, passive: 'verdant-soul' },
      { lv: 99, type: 'graduate' },
    ],
  },
];

// --------------------------------------------------------------------------
// 月凜的技能定義表（id 對應 unlocks 裡的 skill）
// --------------------------------------------------------------------------
const SKILLS = {
  // 一階通用
  'silver-thrust': {
    name: '銀月刺', tag: '普攻', kind: 'physical',
    desc: '銀月矛刺擊，無冷卻。',
    mult: 1.0, cd: 0, isBasic: true,
  },
  'crescent-slash': {
    name: '迴月斬', tag: '範圍', kind: 'physical',
    desc: '矛尖劃出彎月軌跡：對全體 150% 攻擊力 AOE 斬擊。CD 2.5s，輕量輸出技。',
    mult: 1.5, cd: 2.5, aoe: true, mpCost: 90, costTier: 'light',
  },
  'frost-needle': {
    name: '霜針陣', tag: '多段', kind: 'frost',
    desc: '四枚霜針穿透敵陣：4 段傷害共 280% 攻擊力（含一段 100% 強擊）。CD 4s。',
    mult: [0.6, 0.6, 0.6, 1.0], cd: 4.0, mpCost: 180, costTier: 'medium',
  },
  'white-mist': {
    name: '白霧召喚', tag: '靈獸', kind: 'frost',
    desc: '雪狐撕咬：即發 220% 傷害 + 持續 3 秒每秒 60% 攻擊力 DoT（合計 ~400%）。CD 6s。',
    mult: 2.2, dot: { dps: 0.6, dur: 3 }, cd: 6.0, mpCost: 90, costTier: 'light',
  },
  'silver-cloak': {
    name: '銀月披身', tag: 'Buff', kind: 'self',
    desc: '銀月光輝披體：自身攻擊力 +60%，持續 8 秒。CD 14s。配合連擊技開大用。',
    mult: 0, buff: { atk: 0.6, dur: 8 }, cd: 14, isBuff: true, mpCost: 90, costTier: 'light',
  },
  'frost-shield': {
    name: '霜冰護盾', tag: 'Buff', kind: 'self',
    desc: '凝冰為盾：受到傷害 -60%，持續 6 秒。CD 18s。對應 BOSS 大招週期。',
    mult: 0, buff: { dmgReduce: 0.6, dur: 6 }, cd: 18, isBuff: true, mpCost: 90, costTier: 'light',
  },
  'lunar-vigor': {
    name: '月華貫氣', tag: 'Buff', kind: 'self',
    desc: '月華貫滿丹田：速度 +50%、暴擊率 +25%、暴傷 +30%，持續 10 秒。CD 22s。',
    mult: 0, buff: { spdMul: 0.5, crit: 0.25, critDmg: 0.3, dur: 10 }, cd: 22, isBuff: true, mpCost: 90, costTier: 'light',
  },

  // ── 路線 A：疾風月舞 ──
  'moonshade-dance': {
    name: '影月連舞', tag: '連擊', kind: 'physical', path: 'A',
    desc: '六段疾速連斬：總 380% 攻擊力（最後一段 130% 強擊）。CD 5s。',
    mult: [0.5, 0.5, 0.5, 0.5, 0.7, 1.3], cd: 5.0, mpCost: 180, costTier: 'medium',
  },
  'splitmoon-bloom': {
    name: '裂月千華', tag: '範圍連擊', kind: 'physical', path: 'A',
    desc: '六段花瓣狀範圍斬：AOE，總 550% 攻擊力（最後段 150% 強擊）。CD 8s。',
    mult: [0.7, 0.7, 0.8, 0.9, 1.0, 1.5], aoe: true, cd: 8.0, mpCost: 180, costTier: 'medium',
  },
  'moonwheel-waltz': {
    name: '月華輪舞', tag: '持續', kind: 'physical', path: 'A', requireTier: 2,
    desc: '八段舞踏狀態：總 650% 攻擊力（末段 180% 暴擊強擊）。CD 18s。',
    mult: [0.5, 0.5, 0.6, 0.6, 0.7, 0.9, 1.0, 1.8], cd: 18.0, mpCost: 270, costTier: 'heavy',
  },
  'endless-night': {
    name: '永夜千華舞', tag: '★大招★', kind: 'physical', path: 'A', requireTier: 3,
    desc: '【終極奧義】十二段月華舞踏 AOE，全段必爆，總 1100% 攻擊力（末段 220% 強擊）。施放後自身攻擊 +30% 持續 6 秒。CD 25s。',
    mult: [0.5, 0.5, 0.6, 0.7, 0.7, 0.8, 0.8, 0.9, 1.0, 1.1, 1.4, 2.2],
    aoe: true, alwaysCrit: true, buff: { atk: 0.3, dur: 6 },
    cd: 25, mpCost: 270, costTier: 'heavy',
  },

  // ── 路線 B：靈契禦狐（持續輸出 + AOE 控制，定位「穩定 DPS + 召喚物」）──
  'fox-mirage': {
    name: '狐影分身', tag: '召喚', kind: 'arcane', path: 'B',
    desc: '召喚雪狐分身：即發 150% + 持續 8 秒每 0.35 秒攻擊（單次 90% × ~23 次 ≈ 2070%）。可暴擊，無敵人時暫停。CD 10s。',
    mult: 1.5, summon: { dps: 0.9, dur: 8 }, cd: 10, mpCost: 90, costTier: 'light',
  },
  'frostfall': {
    name: '凝霜降臨', tag: '冰封', kind: 'frost', path: 'B',
    desc: '霜氣降下：450% 攻擊力 AOE 傷害，對 BOSS 額外 +30%（合計 585% vs BOSS） + 凍結敵人 2.5 秒（敵方停止行動）。CD 9s。',
    mult: 4.5, vsBossBonus: 0.3, aoe: true, freeze: 2.5, cd: 9, mpCost: 90, costTier: 'light',
  },
  'mist-seal': {
    name: '白霧封印', tag: '弱化', kind: 'arcane', path: 'B', requireTier: 2,
    desc: '撕裂霧封印：680% 攻擊力，對 BOSS 額外 +90%（合計 1292% vs BOSS）。CD 12s。',
    mult: 6.8, vsBossBonus: 0.9, cd: 12, mpCost: 180, costTier: 'medium',
  },
  'fox-god-descend': {
    name: '狐神降世', tag: '★大招★', kind: 'arcane', path: 'B', requireTier: 3,
    desc: '【終極奧義】九尾狐神降臨：即發 700% AOE + 持續 12 秒每 0.3 秒（單次 150% × ~40 次 ≈ 6000% 召喚），總 6700%。對 BOSS 額外 +60%。召喚物可暴擊，無敵人時暫停。CD 30s。',
    mult: 7.0, aoe: true, summon: { dps: 1.5, dur: 12, interval: 0.3 }, vsBossBonus: 0.6,
    cd: 30, mpCost: 270, costTier: 'heavy',
  },

  // ============================================================================
  // 雪羽 — 鏡靈使（中距 / 雙形態）
  // ============================================================================
  // ── 共用技能 ──
  'mirror-shot': {
    name: '鏡光射撃', tag: '普攻', kind: 'arcane',
    desc: '靈鏡發射光彈，無冷卻。',
    mult: 1.0, cd: 0, isBasic: true,
  },
  'ring-flash': {
    name: '流光圓舞', tag: '連擊', kind: 'arcane',
    desc: '四片鏡光繞身飛旋：四段連擊共 240% 攻擊力（最後段 90% 強擊）。CD 3s。',
    mult: [0.5, 0.5, 0.5, 0.9], cd: 3.0, mpCost: 90, costTier: 'light',
  },
  'star-shard': {
    name: '星辰碎片', tag: '範圍', kind: 'arcane',
    desc: '鏡片碎裂成星屑：對全體 180% 攻擊力 AOE。CD 4s。',
    mult: 1.8, cd: 4.0, aoe: true, mpCost: 90, costTier: 'light',
  },
  'mirror-shield': {
    name: '鏡像護盾', tag: 'Buff', kind: 'self',
    desc: '鏡光環身：受到傷害 -25%，持續 8 秒。CD 14s。',
    mult: 0, buff: { dmgReduce: 0.25, dur: 8 }, cd: 14, isBuff: true, mpCost: 90, costTier: 'light',
  },
  'ray-cleave': {
    name: '鏡破光斬', tag: '單體', kind: 'arcane',
    desc: '聚光斬擊：單體 320% 攻擊力。CD 5s。',
    mult: 3.2, cd: 5.0, mpCost: 180, costTier: 'medium',
  },
  'prism-veil': {
    name: '稜鏡紗幕', tag: 'Buff', kind: 'self',
    desc: '稜鏡折光成幕：受到傷害 -60%，持續 6 秒。CD 18s。',
    mult: 0, buff: { dmgReduce: 0.6, dur: 6 }, cd: 18, isBuff: true, mpCost: 90, costTier: 'light',
  },
  'mirror-vigor': {
    name: '鏡華貫氣', tag: 'Buff', kind: 'self',
    desc: '鏡光貫滿身軀：速度 +50%、暴擊率 +25%、暴傷 +30%，持續 10 秒。CD 22s。',
    mult: 0, buff: { spdMul: 0.5, crit: 0.25, critDmg: 0.3, dur: 10 }, cd: 22, isBuff: true, mpCost: 90, costTier: 'light',
  },

  // ── 路線 A：月蝕墮天（自殘換爆發、vs BOSS 強）──
  'eclipse-touch': {
    name: '暗蝕觸發', tag: '連擊+DOT', kind: 'arcane', path: 'A',
    desc: '暗鏡劃過：三段連擊共 300% + 持續 3 秒每秒 50% DOT（合計 ~450%）。CD 6s。',
    mult: [1.0, 1.0, 1.0], dot: { dps: 0.5, dur: 3 }, cd: 6.0, mpCost: 180, costTier: 'medium',
  },
  'chaos-blade': {
    name: '絕焰魔劍', tag: '★自殘★', kind: 'arcane', path: 'A',
    desc: '揮舞魔劍：580% 攻擊力 + 損失 15% 當前 HP。CD 9s。',
    mult: 5.8, selfDmg: 0.15, cd: 9.0, mpCost: 180, costTier: 'medium',
  },
  'black-moon-judge': {
    name: '黑月斷罪', tag: 'vs BOSS', kind: 'arcane', path: 'A', requireTier: 2,
    desc: '月蝕之刃：750% 攻擊力，對 BOSS 額外 +60%（合計 1200% vs BOSS）。CD 11s。',
    mult: 7.5, vsBossBonus: 0.6, cd: 11, mpCost: 180, costTier: 'medium',
  },
  'void-cleave': {
    name: '虛無一閃', tag: '★大招★', kind: 'arcane', path: 'A', requireTier: 3,
    desc: '【終極奧義】魔劍劈裂虛空：1500% 攻擊力單體強擊，對 BOSS 額外 +80%（合計 2700% vs BOSS），必爆。施放後 10 秒：減傷 +25% + 攻速 +150%（突破上限至 10）+ 普攻附加 +100% 攻擊 + 強制觸發暗血盟（滿 +60% 攻）與背水之姫（+50% 攻 + 30% 暴傷）。CD 25s。',
    mult: 15.0, vsBossBonus: 0.8, alwaysCrit: true,
    buff: { dmgReduce: 0.25, spdMul: 1.5, spdUncap: true, basicBonusAtk: 1.0, forceLowHp: true, dur: 10 },
    cd: 25, mpCost: 270, costTier: 'heavy',
  },

  // ── 路線 B：白翼聖姫（治癒、護盾、AOE）──
  'sacred-bloom': {
    name: '聖光綻放', tag: '治療+AOE', kind: 'arcane', path: 'B',
    desc: '聖光綻放：對全體 320% AOE + 自身與隊友各回復 15% 最大 HP。CD 8s。',
    mult: 3.2, aoe: true, heal: 0.15, healAlly: true, cd: 8.0, mpCost: 180, costTier: 'medium',
  },
  'dawn-aria': {
    name: '曙光連歌', tag: '治癒連擊', kind: 'arcane', path: 'B',
    desc: '聖光詠唱：四段 AOE 連擊共 1120%（每段 280%），每段自身與隊友各回 5% HP（合計 20%）。CD 10s。',
    mult: [2.8, 2.8, 2.8, 2.8], aoe: true, healPerHit: 0.05, healAlly: true, cd: 10, mpCost: 180, costTier: 'medium',
  },
  'white-aegis': {
    name: '白翼結界', tag: '★護盾★', kind: 'self', path: 'B', requireTier: 2,
    desc: '光輝結界：受到傷害 -50% 持續 10 秒、自身與隊友各回復 25% 最大 HP。CD 16s。',
    mult: 0, buff: { dmgReduce: 0.5, dur: 10 }, heal: 0.25, healAlly: true,
    cd: 16, isBuff: true, mpCost: 90, costTier: 'light',
  },
  'feather-eden': {
    name: '羽落聖光', tag: '★大招★', kind: 'arcane', path: 'B', requireTier: 3,
    desc: '【終極奧義】羽翼降下聖光：三段 AOE 共 2550%（每段 850%）+ 自身與隊友 HP 回滿 + 8 秒減傷 30%。CD 30s。',
    mult: [8.5, 8.5, 8.5], aoe: true, heal: 1.0, healAlly: true, buff: { dmgReduce: 0.3, dur: 8 },
    cd: 30, mpCost: 270, costTier: 'heavy',
  },

  // ============================================================================
  // 璃安 — 弓系角色技能組
  // ============================================================================
  'verdant-shot': {
    name: '翠葉射', tag: '普攻', kind: 'physical',
    desc: '翠木長弓射出綠箭。',
    mult: 1.0, cd: 0, isBasic: true,
  },
  'wind-arrow': {
    name: '疾風箭', tag: '單體', kind: 'physical',
    desc: '凝聚一發疾風利箭：300% 攻擊力強擊。CD 5s。',
    mult: 3.0, cd: 5, mpCost: 90, costTier: 'light',
  },
  'leaf-storm': {
    name: '落葉之嵐', tag: 'AOE 多段', kind: 'physical',
    desc: '召喚旋風帶起落葉：5 段 × 80% AOE，共 400% 全體傷害。CD 6s。',
    mult: [0.8, 0.8, 0.8, 0.8, 0.8], cd: 6, aoe: true, mpCost: 90, costTier: 'light',
  },
  'wind-veil': {
    name: '風帷護身', tag: 'Buff', kind: 'self',
    desc: '披上風之帷幕：受到傷害 -25%，持續 8 秒。CD 14s。',
    mult: 0, buff: { dmgReduce: 0.25, dur: 8 }, cd: 14, isBuff: true, mpCost: 90, costTier: 'light',
  },
  'piercing-shot': {
    name: '貫月射', tag: '單體必爆', kind: 'physical',
    desc: '極致集中的一箭：450% 攻擊力、必爆。CD 8s。',
    mult: 4.5, alwaysCrit: true, cd: 8, mpCost: 180, costTier: 'medium',
  },
  'evergreen-aura': {
    name: '常綠之氣', tag: 'Buff', kind: 'self',
    desc: '翠林之氣繚繞：攻擊力 +50%、暴擊 +15%，持續 8 秒。CD 14s。',
    mult: 0, buff: { atk: 0.5, crit: 0.15, dur: 8 }, cd: 14, isBuff: true, mpCost: 90, costTier: 'light',
  },
  'forest-vigor': {
    name: '森之脈動', tag: '補給', kind: 'self',
    desc: '森之脈動回血回藍：回 20% HP + 20% MP。CD 25s。',
    mult: 0, heal: 0.20, restoreMp: 0.20, cd: 25, mpCost: 0, costTier: 'free',
  },
  // ─ A 路線：風韻舞姬 ─
  'whirlwind-slash': {
    name: '旋風斬', tag: '多段', kind: 'physical', path: 'A', requireTier: 1,
    desc: '4 段風刃連擊：每段 180%，合計 720% 單體傷害。CD 9s。',
    mult: [1.8, 1.8, 1.8, 1.8], cd: 9, mpCost: 180, costTier: 'medium',
  },
  'twin-fan-dance': {
    name: '雙扇舞', tag: 'AOE 多段', kind: 'physical', path: 'A', requireTier: 1,
    desc: '雙扇旋舞全場：5 段 × 150% AOE，合計 750%。CD 12s。',
    mult: [1.5, 1.5, 1.5, 1.5, 1.5], cd: 12, aoe: true, mpCost: 180, costTier: 'medium',
  },
  'tempest-bloom': {
    name: '風華絕舞', tag: '★ AOE 大招', kind: 'physical', path: 'A', requireTier: 2,
    desc: '6 段範圍狂舞：每段 200% AOE，合計 1200%。CD 18s。',
    mult: [2.0, 2.0, 2.0, 2.0, 2.0, 2.0], cd: 18, aoe: true, mpCost: 270, costTier: 'heavy',
  },
  'thousand-feather-dance': {
    name: '翠羽千舞', tag: '★大招★', kind: 'physical', path: 'A', requireTier: 3,
    desc: '【終極奧義】十二段風暴：12 段 × 130% = 1560%，必爆 + 自身攻速 +150% 持續 8 秒。CD 25s。',
    mult: [1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3],
    alwaysCrit: true, buff: { spdMul: 1.5, dur: 8 },
    cd: 25, mpCost: 270, costTier: 'heavy',
  },
  // ─ B 路線：光弓神使 ─
  'holy-pierce': {
    name: '聖光裂矢', tag: '單體神聖', kind: 'arcane', path: 'B', requireTier: 1,
    desc: '凝聚神光的單體爆射：500% 攻擊力 + 對 BOSS +30%（合計 650% vs BOSS）。CD 10s。',
    mult: 5.0, vsBossBonus: 0.3, cd: 10, mpCost: 180, costTier: 'medium',
  },
  'light-halo': {
    name: '光環庇護', tag: 'Buff / 治癒', kind: 'self', path: 'B', requireTier: 1,
    desc: '神光庇護：回 30% maxHp + 減傷 25%（6 秒）。CD 22s。',
    mult: 0, heal: 0.30, buff: { dmgReduce: 0.25, dur: 6 }, cd: 22, mpCost: 180, costTier: 'medium',
  },
  'divine-judgment': {
    name: '神諭裁決', tag: '單體神聖', kind: 'arcane', path: 'B', requireTier: 2,
    desc: '對單一目標 1200% 神聖傷害 + 對 BOSS +60%（合計 1920% vs BOSS）。CD 16s。',
    mult: 12.0, vsBossBonus: 0.6, cd: 16, mpCost: 270, costTier: 'heavy',
  },
  'oracle-arrow': {
    name: '神諭斷罪', tag: '★大招★', kind: 'arcane', path: 'B', requireTier: 3,
    desc: '【終極奧義】神之斷罪箭：1500% 攻擊力 + 對 BOSS +100%（合計 3000% vs BOSS）+ 必爆 + 15% 吸血。CD 25s。',
    mult: 15.0, vsBossBonus: 1.0, alwaysCrit: true, lifesteal: 0.15,
    cd: 25, mpCost: 270, costTier: 'heavy',
  },

};

// --------------------------------------------------------------------------
// 被動定義
// --------------------------------------------------------------------------
const PASSIVES = {
  'fox-eye':    { name: '狐眼',       desc: '暴擊 +5%、攻擊速度 +5%。',                 apply: s => { s.crit += 0.05; s.spd *= 1.05; } },
  'wind-seal':  { name: '疾風之印',   desc: '攻擊力 +10%（戰鬥中常駐生效）。',           apply: s => { s.atk *= 1.10; } },
  'pact-seal':  { name: '契約之印',   desc: '召喚物傷害 +80%、暴擊率 +5%。',              apply: s => { s.summonMul = (s.summonMul || 1) * 1.8; s.crit += 0.05; } },
  'traceless':  { name: '無痕',       desc: '受到傷害 -15%。',                           apply: s => { s.dmgReduce = (s.dmgReduce || 0) + 0.15; } },
  'oracle':     { name: '神諭',       desc: '所有技能冷卻 -20%、攻擊力 +10%。',           apply: s => { s.cdReduce = (s.cdReduce || 0) + 0.20; s.atk *= 1.10; } },
  'silver-soul':{ name: '銀月之魂',   desc: '全屬性 +50%。',                             apply: s => { s.atk *= 1.5; s.def *= 1.5; s.hp *= 1.5; } },

  // ===== 雪羽 被動 =====
  'third-eye':   { name: '心眼',       desc: '暴擊率 +6%、暴擊傷害 +15%。',                apply: s => { s.crit += 0.06; s.critDmg = (s.critDmg || 1.8) + 0.15; } },
  'dark-blood':  { name: '暗血盟',     desc: '每損失 1% 當前 HP，攻擊力 +1%（戰鬥中動態，戰前無效）。', apply: s => { s.darkBlood = true; } },
  'holy-grace':  { name: '聖恩潤澤',   desc: '戰鬥中 HP 每秒回復 1.5%、所有治癒效果 +25%。',           apply: s => { s.hpRegenPct = (s.hpRegenPct || 0) + 0.015; s.healMul = (s.healMul || 1) * 1.25; } },
  'last-stand':  { name: '背水之姫',   desc: 'HP < 40% 時，攻擊力 +50%、暴擊傷害 +30%（戰鬥中動態）。', apply: s => { s.lastStand = true; } },
  'angel-favor': { name: '神光庇護',   desc: 'HP 上限 +20%、減傷 +15%、暴擊傷害 +25%。',               apply: s => { s.hp *= 1.2; s.dmgReduce = (s.dmgReduce || 0) + 0.15; s.critDmg = (s.critDmg || 1.8) + 0.25; } },
  'mirror-soul': { name: '鏡之魂',     desc: '全屬性 +50%、技能傷害 +30%。',                            apply: s => { s.atk *= 1.5; s.def *= 1.5; s.hp *= 1.5; s.skillDmg = (s.skillDmg || 0) + 0.3; } },

  // ===== 璃安 被動 =====
  'forest-blessing': { name: '森林祝福',  desc: '攻擊速度 +10%、暴擊 +5%。',                                apply: s => { s.spd *= 1.10; s.crit += 0.05; } },
  // ─ A 路線（風韻舞姬 → 風華絕舞）：堆攻速 + crit + 技能傷
  'wind-charm':      { name: '風韻',      desc: '攻擊速度 +30%、攻擊力 +10%。',                              apply: s => { s.spd *= 1.30; s.atk *= 1.10; } },
  'twin-fan-art':    { name: '雙扇之術',  desc: '攻擊速度 +25%、暴擊率 +15%、技能傷害 +20%。',               apply: s => { s.spd *= 1.25; s.crit += 0.15; s.skillDmg = (s.skillDmg || 0) + 0.20; } },
  // ─ B 路線（光弓神使 → 降臨光神）：堆 BOSS + 暴傷 + 生存
  'sacred-grace':    { name: '神聖加持',  desc: '對 BOSS 傷害 +20%、暴擊傷害 +15%。',                        apply: s => { s.vsBoss = (s.vsBoss || 0) + 0.20; s.critDmg = (s.critDmg || 1.8) + 0.15; } },
  'full-bloom':      { name: '滿開祝禱',  desc: '攻擊力 +20%、HP 上限 +20%、減傷 +10%。',                    apply: s => { s.atk *= 1.20; s.hp *= 1.20; s.dmgReduce = (s.dmgReduce || 0) + 0.10; } },
  // 終極被動
  'verdant-soul':    { name: '翠靈之魂',  desc: '全屬性 +50%、攻擊速度 +20%。',                              apply: s => { s.atk *= 1.5; s.def *= 1.5; s.hp *= 1.5; s.spd *= 1.2; } },
};

// --------------------------------------------------------------------------
// 副本：9 區共 18 副本
// --------------------------------------------------------------------------
const REGIONS = [
  {
    id: 'lumen', name: '露光之村', tagline: '微光森林邊境，旅程的起點。',
    palette: { sky: '#3a5680', ground: '#4a6b3a' }, mats: ['粗鋼'],
    dungeons: [
      { id: 'sleep-forest', name: '沉睡森林路', cp: 80,   unlock: 0,
        baseTime: 14, expBase: 35, goldBase: 80, enemies: ['野狼', '蜂群', '森林哥布林'], boss: '哥布林長老' },
      { id: 'broken-tower', name: '廢棄哨塔',   cp: 160,  unlock: 'sleep-forest',
        baseTime: 16, expBase: 55, goldBase: 120, enemies: ['蝙蝠群', '鏽甲骷髏', '廢哨衛兵'], boss: '塔頂鏽影' },
    ],
  },
  {
    id: 'rustwater', name: '鏽水鎮', tagline: '河川被鐵渣染紅的舊礦鎮。',
    palette: { sky: '#5a4a3a', ground: '#3a2a1a' }, mats: ['粗鋼', '精鋼'],
    dungeons: [
      { id: 'raven-alley',  name: '渡鴉小巷',   cp: 280,  unlock: 'broken-tower',
        baseTime: 17, expBase: 80, goldBase: 180, enemies: ['暗巷盜匪', '鴉群', '飢餓野狗'], boss: '暗巷首領' },
      { id: 'rust-foundry', name: '鏽鋼工坊',   cp: 420,  unlock: 'raven-alley',
        baseTime: 18, expBase: 115, goldBase: 240, enemies: ['機械守衛', '蒸氣魔', '鏽鋼怪'], boss: '工坊長老機甲' },
    ],
  },
  {
    id: 'cinnabar', name: '朱砂砂漠', tagline: '紅沙之下埋著古文明的吐息。',
    palette: { sky: '#a85c30', ground: '#7a3a1a' }, mats: ['精鋼'],
    dungeons: [
      { id: 'salamander',   name: '火蜥蜴遺跡', cp: 620,  unlock: 'rust-foundry',
        baseTime: 19, expBase: 160, goldBase: 320, enemies: ['火蜥蜴', '砂中幽靈', '熔岩元素'], boss: '熔岩巨蜥' },
      { id: 'sandworm',     name: '砂蟲深坑',   cp: 820,  unlock: 'salamander',
        baseTime: 20, expBase: 220, goldBase: 410, enemies: ['幼蟲群', '甲殼戰士', '砂蟲爪'], boss: '深坑砂蟲王' },
    ],
  },
  {
    id: 'aurora', name: '永晝鋼都', tagline: '永不日落的高聳鋼鐵之城。',
    palette: { sky: '#5e7caa', ground: '#3a4660' }, mats: ['精鋼', '星鋼'],
    dungeons: [
      { id: 'mech-harbor',  name: '機械港灣',   cp: 1080, unlock: 'sandworm',
        baseTime: 21, expBase: 290, goldBase: 520, enemies: ['鋼鐵守衛', '飛行眼球', '巡邏機甲'], boss: '港灣鋼鐵巨像' },
      { id: 'steel-throne', name: '鋼鐵王座',   cp: 1380, unlock: 'mech-harbor',
        baseTime: 22, expBase: 380, goldBase: 660, enemies: ['御林機兵', '高階哨兵', '王座衛士'], boss: '無名鋼王' },
    ],
  },
  {
    id: 'azure', name: '蒼穹聖城', tagline: '神諭仍在迴蕩的雲端古都。',
    palette: { sky: '#a4d6ff', ground: '#dde9ff' }, mats: ['星鋼'],
    dungeons: [
      { id: 'library',      name: '古老圖書廊', cp: 1800, unlock: 'steel-throne',
        baseTime: 23, expBase: 490, goldBase: 820, enemies: ['活書頁', '幻影學者', '紙翼妖精'], boss: '禁書守衛' },
      { id: 'cathedral',    name: '聖光大殿',   cp: 2300, unlock: 'library',
        baseTime: 24, expBase: 630, goldBase: 1020, enemies: ['聖衛', '吟唱牧師', '光之精靈'], boss: '墮落大主教' },
    ],
  },
  {
    id: 'abyss', name: '沉淵海港', tagline: '潮聲下藏著遺忘的眾神。',
    palette: { sky: '#264960', ground: '#1a2a44' }, mats: ['星鋼', '神鋼'],
    dungeons: [
      { id: 'wave-dock',    name: '浪湧碼頭',   cp: 2900, unlock: 'cathedral',
        baseTime: 25, expBase: 810, goldBase: 1280, enemies: ['章魚兵', '海盜亡靈', '潮浪元素'], boss: '深海艦長' },
      { id: 'abyss-shrine', name: '海淵神殿',   cp: 3600, unlock: 'wave-dock',
        baseTime: 26, expBase: 1050, goldBase: 1620, enemies: ['深海祭司', '克拉肯子嗣', '迴游石像'], boss: '沉眠克拉肯' },
    ],
  },
  {
    id: 'greycloud', name: '灰雲峰', tagline: '火山與龍族盤踞的灼天群嶺。',
    palette: { sky: '#3a2a3a', ground: '#5a2a1a' }, mats: ['神鋼'],
    dungeons: [
      { id: 'lava-mine',    name: '灼熱礦坑',   cp: 4500, unlock: 'abyss-shrine',
        baseTime: 27, expBase: 1340, goldBase: 2000, enemies: ['熔岩怪', '蜥蜴龍', '熾紅工人'], boss: '熔礦獸首' },
      { id: 'dragon-nest',  name: '噴火龍巢',   cp: 5600, unlock: 'lava-mine',
        baseTime: 28, expBase: 1700, goldBase: 2500, enemies: ['雛龍', '龍翼戰士', '焚火吐息獸'], boss: '紅鱗古龍' },
    ],
  },
  {
    id: 'stellar', name: '星雪領域', tagline: '冬月不化的白鬼領地。',
    palette: { sky: '#b6cfe6', ground: '#dde9f5' }, mats: ['神鋼', '永晶'],
    dungeons: [
      { id: 'ice-corridor', name: '冰封迴廊',   cp: 6900, unlock: 'dragon-nest',
        baseTime: 29, expBase: 2150, goldBase: 3100, enemies: ['冰晶傀儡', '雪原狼王', '霜息魔'], boss: '永凍劍聖' },
      { id: 'white-summit', name: '白鬼之巔',   cp: 8500, unlock: 'ice-corridor',
        baseTime: 30, expBase: 2800, goldBase: 3900, enemies: ['白鬼侍從', '雪暴元素', '冰封王衛'], boss: '白鬼之王' },
    ],
  },
  {
    id: 'mirror', name: '鏡之夢界', tagline: '鏡面之下的倒影世界。',
    palette: { sky: '#2a2a4a', ground: '#1a1a3a' }, mats: ['永晶', '夢晶'],
    dungeons: [
      { id: 'reflect-hall', name: '反射迴廊',   cp: 10500, unlock: 'white-summit',
        baseTime: 31, expBase: 3600, goldBase: 4800, enemies: ['鏡面分身', '碎影使者', '無臉旅人'], boss: '虛影自我' },
      { id: 'abyss-mirror', name: '倒影深淵',   cp: 13000, unlock: 'reflect-hall',
        baseTime: 33, expBase: 4500, goldBase: 6200, enemies: ['深淵之眼', '夢魘之手', '逆世神官'], boss: '鏡之主宰' },
    ],
  },
  // ===== 特殊副本（畢業後 Lv 99 才能進）=====
  {
    id: 'special', name: '特殊副本', tagline: '需主線畢業（Lv 99）：修行賺經驗，材料神窟挖製作素材（含夢晶）。',
    palette: { sky: '#5a3a5a', ground: '#3a2a3a' }, mats: ['神鋼', '永晶'],
    isSpecial: true,
    dungeons: [
      { id: 'sp-exp', name: '修行神窟', cp: 18000, unlock: 'abyss-mirror', requiredLv: 99,
        special: 'exp', baseTime: 35, expBase: 12000, goldBase: 25000,  // × goldMul 0.3 ≈ 7.5K/場（主以經驗）
        difficultyMul: 1.4, dropMats: ['神鋼', '永晶', '星鋼'],
        enemies: ['幻影修者', '虛靈試煉者'], boss: '修行至尊（神格）' },
      { id: 'sp-mat', name: '材料神窟', cp: 18000, unlock: 'abyss-mirror', requiredLv: 99,
        special: 'mat', baseTime: 40, expBase: 600, goldBase: 22000,  // × goldMul 1.0 = 22K/場（鍛 1 次需打 2-3 場）
        difficultyMul: 1.4, dropMats: ['神鋼', '永晶', '星鋼', '精鋼', '粗鋼'],
        bonusMengjingChance: 0.12,
        enemies: ['神鋼巨人', '永晶守衛'], boss: '神鋼巨像（神格）' },
      // ===== 神級經驗副本（畢業 + 終焉套後農共鳴經驗）=====
      // 設計：給平均 DPS 200 萬玩家，戰鬥節奏 15-20 秒（HP/atk 3x 強化）
      { id: 'sp-exp-elite', name: '神祠秘境', cp: 100000, unlock: 'sp-exp', requiredLv: 99,
        special: 'exp', baseTime: 60, expBase: 50000, goldBase: 1500,  // 純經驗副本，金大幅下修
        difficultyMul: 7.5, atkCoefOverride: 0.012,
        dropMats: ['神鋼', '永晶', '夢晶'],
        enemies: ['神祠執行者', '虛位幻獸'], boss: '神祠主祭（神格・神）' },
      // ===== 神級材料副本（畢業 + 終焉套後農高階普通材料）=====
      // 同神祠秘境難度，但獎勵走材料路線；不掉無盡塔材料（蝕痕系列只能無盡塔出）
      // 額外：低機率掉神格寶箱（神窟系列唯一能出神箱的）
      { id: 'sp-mat-elite', name: '神工秘境', cp: 100000, unlock: 'sp-mat', requiredLv: 99,
        special: 'mat', baseTime: 60, expBase: 1500, goldBase: 50000,
        difficultyMul: 7.5, atkCoefOverride: 0.012,
        dropMats: ['神鋼', '永晶', '夢晶'],
        bonusMengjingChance: 0.25,
        chestDropOverride: { divine: 0.03 },  // 3% 神格寶箱
        enemies: ['神工執行者', '虛位匠靈'], boss: '神工大師（神格・神）' },
      // ===== 魔力試煉境（賦予系統專屬副本）=====
      // 高難度綜合本：給比經驗副本更多 XP+金幣 + 只掉魔力石和寶箱
      // 玩家用這裡的石頭去武器賦予介面強化武器
      { id: 'sp-imbue-trial', name: '魔力試煉境', cp: 150000, unlock: 'sp-exp-elite', requiredLv: 99,
        special: 'imbue', baseTime: 60, expBase: 300000, goldBase: 50000,  // 經驗 2x（15→30 萬）補償 HP 上修拉長戰鬥；金幣維持 5 萬 → 4 場才夠 1 次賦予
        difficultyMul: 20, atkCoefOverride: 0.011,           // HP 上修：難度 12→20（+67%），atkCoef 同步下修保持原 BOSS 攻擊
        dropMats: [],  // 不掉一般材料
        // 魔力石掉落：1 場頂多 1 顆、顏色隨機
        // 巨型暫時不掉（之後新副本會開放）
        magicStoneDrop: {
          chance: 1.0,                          // 必掉 1 顆（之後想壓難度可改 0.5）
          colors: ['red', 'blue', 'yellow'],    // 隨機 1 色
          qty: 1,
        },
        chestDropOverride: { divine: 0.08 },  // 8% 神格寶箱（補金幣的同時也給驚喜）
        enemies: ['魔力侍從', '結晶守衛'], boss: '魔力試煉主（神格・極）' },
    ],
  },
  // ===== 無盡塔（30 秒限時，依累積傷害領獎）=====
  {
    id: 'endless', name: '無盡塔', tagline: '時限 30 秒，挑戰你的爆發 DPS。團隊累積、階梯領獎、入場需通行證。',
    palette: { sky: '#1a1838', ground: '#2a1a5a' }, mats: ['永晶', '夢晶'],
    isEndless: true,
    dungeons: [
      { id: 'endless-tower', name: '虛無之塔 · 鏡之終焉', cp: 200000, unlock: 'raid-calamity', requiredLv: 99,
        isEndless: true, baseTime: 30, timeLimit: 30,
        expBase: 0, goldBase: 0,  // 無盡塔不掉 exp/gold，獎勵由階梯給
        // 階梯：累積傷害 → 終焉材料獎勵；V 階給異界之鎚
        damageTiers: [
          { dmg: 10_000_000,  label: 'I',   rewards: { mats: { '蝕痕碎片': 3 }, shard: 5 } },
          { dmg: 25_000_000,  label: 'II',  rewards: { mats: { '蝕痕碎片': 5, '蝕痕神核': 1 }, shard: 8 } },
          { dmg: 45_000_000,  label: 'III', rewards: { mats: { '蝕痕碎片': 8, '蝕痕神核': 3, '終焉印石': 1, '異界之鎚': 1 }, shard: 10 } },
          { dmg: 180_000_000, label: 'IV',  rewards: { mats: { '蝕痕碎片': 12, '蝕痕神核': 6, '終焉印石': 3, '異界之鎚': 2 }, shard: 12 } },
          { dmg: 400_000_000, label: 'V',   rewards: { mats: { '蝕痕碎片': 20, '蝕痕神核': 10, '終焉印石': 6, '異界之鎚': 3 }, shard: 15 } },
        ],
        lore: [
          '在虛無之塔的頂端，鏡之終焉沉眠。',
          '他既無始亦無終 — 你能撼動他多少？',
          '時限三十秒，每一擊都是試煉。',
          '盡你所能，揭示自己的極限。',
        ],
        warning: '時限 30 秒。BOSS 無血量上限，依累積傷害領取階梯獎勵。多人連線時團隊傷害累加。入場需消耗 1 張「虛無通行證」。',
        rewards: [
          { label: '時限', value: '30 秒（BOSS 無 HP 上限，越打越痛）', color: 'var(--accent)' },
          { label: '入場', value: '消耗 1 張虛無通行證（寶箱掉落）', color: 'var(--shard)' },
          { label: '階梯 I', value: '10M 傷害 → 蝕痕碎片 ×3、魂晶 +5', color: 'var(--muted)' },
          { label: '階梯 II', value: '25M → +蝕痕碎片 ×5、神核 ×1、魂晶 +8', color: 'var(--hp-self)' },
          { label: '階梯 III', value: '45M → +碎片 ×8、神核 ×3、印石 ×1、★異界之鎚 ×1、魂晶 +10', color: 'var(--exp)' },
          { label: '階梯 IV', value: '180M → +碎片 ×12、神核 ×6、印石 ×3、★異界之鎚 ×2、魂晶 +12（雙人合作）', color: 'var(--gold)' },
          { label: '階梯 V', value: '400M → +碎片 ×20、神核 ×10、印石 ×6、★異界之鎚 ×3、魂晶 +15（累計鎚 6 / 三人團畢業裝）', color: 'var(--hp-enemy)' },
          { label: '多人', value: '團隊累積傷害共享、每人各扣 1 張通行證', color: 'var(--accent)' },
        ],
        bossPortrait: 'assets/portraits/endless-boss.png',
        passId: 'pass-endless',
        enemies: [],
        boss: '終焉鎧神 · 蝕痕' },
      // ===== 暗影結晶塔（100M DPS 世代，依累積傷害領魔力石寶箱）=====
      { id: 'endless-crystal', name: '暗影結晶塔 · 霸主試煉', cp: 1_500_000, unlock: 'raid-calamity', requiredLv: 99,
        isEndless: true, baseTime: 30, timeLimit: 30,
        expBase: 0, goldBase: 0,
        passId: 'pass-crystal',
        // BOSS 週期技「結晶崩斬」：每 5 秒一週期，最後 1.5 秒蓄力（紅光預警），週期到劈出 80% 最大生命一刀（受玩家減傷影響）
        bossChargeSlash: { name: '結晶崩斬', interval: 5, chargeTime: 1.5, damagePct: 0.8 },
        // 階梯校準：solo 100M DPS × 30s = 30 億 ≈ 階梯 III；IV/V 需 buff/組隊（團隊傷害累加）
        damageTiers: [
          { dmg:   600_000_000, label: 'I',   rewards: { chests: { 'chest-mana': 1 } } },
          { dmg: 1_200_000_000, label: 'II',  rewards: { chests: { 'chest-mana': 1 } } },
          { dmg: 2_400_000_000, label: 'III', rewards: { chests: { 'chest-mana': 1 } } },
          { dmg: 4_000_000_000, label: 'IV',  rewards: { chests: { 'chest-mana': 2 } } },
          { dmg: 6_000_000_000, label: 'V',   rewards: { chests: { 'chest-mana': 3 } } },
        ],
        lore: [
          '暗影礦脈最深處，結晶霸主自億萬魔力石中甦醒。',
          '它的鎧甲由魔力石凝成，每一次揮劍都震碎山岩。',
          '時限三十秒 — 傾盡全力，看你能擊碎多少結晶。',
        ],
        warning: '時限 30 秒。BOSS 無血量上限，依累積傷害領取魔力石寶箱。多人連線時團隊傷害累加。入場需消耗 1 張「暗影結晶通行證」。',
        rewards: [
          { label: '時限', value: '30 秒（BOSS 無 HP 上限）', color: 'var(--accent)' },
          { label: '入場', value: '消耗 1 張暗影結晶通行證', color: 'var(--shard)' },
          { label: '階梯 I',   value: '6 億傷害 → 魔力石寶箱 ×1',  color: 'var(--muted)' },
          { label: '階梯 II',  value: '12 億 → 魔力石寶箱 ×1', color: 'var(--hp-self)' },
          { label: '階梯 III', value: '24 億 → 魔力石寶箱 ×1（solo 100M 標準線）', color: 'var(--exp)' },
          { label: '階梯 IV',  value: '40 億 → 魔力石寶箱 ×2', color: 'var(--gold)' },
          { label: '階梯 V',   value: '60 億 → 魔力石寶箱 ×3（需 buff/組隊）', color: 'var(--hp-enemy)' },
          { label: '多人', value: '團隊累積傷害共享、每人各扣 1 張通行證', color: 'var(--accent)' },
        ],
        bossPortrait: 'assets/portraits/endless-crystal-boss.png',
        bossPortraitTall: true,
        enemies: [],
        boss: '暗影結晶霸主' },
    ],
  },
  // ===== 襲擊戰（Lv 99 endgame，超級難）=====
  {
    id: 'raid', name: '襲擊戰', tagline: '災厄降臨。需主線畢業（Lv 99）。唯一可掉 UR 武器（3%）。',
    palette: { sky: '#3a1818', ground: '#5a1a1a' }, mats: ['神鋼', '夢晶'],
    isRaid: true,
    dungeons: [
      { id: 'raid-calamity', name: '災厄·虛影鏡之主宰', cp: 80000, unlock: 'abyss-mirror', requiredLv: 99,
        isRaid: true, baseTime: 90, expBase: 30000, goldBase: 50000,
        difficultyMul: 7.8,  // BOSS HP ~400 萬，atk 仍 cap 2.0 不秒殺玩家
        lore: [
          '反射迴廊的最深處，倒影深淵的盡頭。',
          '鏡之主宰的本體在虛影封印破裂之夜降臨。',
          '鏡片中映出無數扭曲的面孔，每一面都是他吞噬過的英魂。',
          '走到他面前，你會看見——自己。',
        ],
        warning: '此為畢業後挑戰副本，難度倍率 ×3.5。建議備齊大型藥水、鬥志藥水、加倍卷軸方可一試。',
        rewards: [
          { label: '經驗值', value: '30,000', color: 'var(--exp)' },
          { label: '金幣',   value: '50,000', color: 'var(--gold)' },
          { label: '材料',   value: '神鋼 / 永晶 / 夢晶（35%）', color: 'var(--shard)' },
          { label: '魔法石', value: 'T3-T5 必掉', color: 'var(--hp-self)' },
          { label: '寶箱',   value: '金箱 20% / 神格箱 8%', color: 'var(--accent)' },
          { label: 'UR 武器', value: '永夜·狐神矛 / 虛無真鏡 / 神羽弓（3% 機率，隨機角色）', color: 'var(--hp-enemy)' },
        ],
        bossPortrait: 'assets/portraits/raid-calamity.png',
        enemies: ['虛影侍從（災厄）', '夢魘碎片（災厄）', '鏡面碎魂（災厄）', '逆世執事（災厄）'],
        boss: '災厄·虛影鏡之主宰' },
      // ===== 星淵之獵（雙階 BOSS RAID，組隊本，必須有補師才能通關）=====
      // Phase 1：星淵獸（豹）→ Phase 2：虛宙星龍（最終 BOSS）
      // 兩階都有「護盾即死」機制：5 秒內不破護盾全隊即死
      { id: 'raid-stardragon', name: '星淵 · 雙影獵討', cp: 600000, unlock: 'raid-calamity', requiredLv: 99,
        minCpOverride: 100000,
        isRaid: true, baseTime: 60, expBase: 50000, goldBase: 80000,
        difficultyMul: 50,         // HP 大幅上修（玩家 DPS 已破 1900 萬 / 場，舊 25x 太快通關）
        atkCoefOverride: 0.015,    // BOSS atk
        defScaleOverride: 2.5,     // BOSS def（不跟 difficultyMul，獨立 2.5x）
        skipMobs: true,  // 不出小怪，直接兩階 BOSS
        bosses: [
          // Phase 1 — 星淵獸：純血戰，無護盾機制（熱身關）
          { name: '星淵獸', portrait: 'assets/portraits/raid-beast.png' },
          // Phase 2 — 虛宙星龍：護盾即死機制 + HP/atk 強化（真正考驗）
          { name: '虛宙星龍', portrait: 'assets/portraits/raid-dragon.png',
            hpMul: 2.2, atkMul: 1.4,
            shield: { firstAt: 3, interval: 40, hpFixed: 20_000_000, breakTime: 5 } },
        ],
        // 通關必掉星淵材料；低機率掉永恆星辰；UR 武器只掉 ur2 系列（不掉 ur1）
        guaranteedMats: { '星淵碎片': [3, 5], '星龍鱗片': [2, 4] },
        bonusMats: [{ name: '永恆星辰', chance: 0.05, qty: [1, 1] }],
        weaponDropOverride: ['eq-weap-ur2', 'eq-mirror-ur2', 'eq-bow-ur2'],  // 武器位掉落限定三角色 UR2 清單
        lore: [
          '星淵的封印崩裂於萬年沉睡之後。',
          '夜空中現出兩道光影 — 黑豹的咆哮與星龍的哀鳴。',
          '它們是宇宙誕生時的原初獸群，從未死去，只是被遺忘。',
          '只有同心協力的隊伍才能踏出歸途。',
        ],
        warning: '此為雙階 BOSS 副本，建議三人團 + 補師（雪羽 B 路線）才能通關。BOSS 每段時間會凝聚護盾，5 秒內不打破則全隊即死。',
        rewards: [
          { label: '經驗值', value: '50,000', color: 'var(--exp)' },
          { label: '金幣',   value: '80,000', color: 'var(--gold)' },
          { label: '★ 星淵碎片', value: '必掉 ×3~5（UR 武器材料）', color: 'var(--shard)' },
          { label: '★ 星龍鱗片', value: '必掉 ×2~4（UR 武器材料）', color: 'var(--shard)' },
          { label: '★ 永恆星辰', value: '低機率掉落（極限強化用）', color: 'var(--hp-enemy)' },
          { label: 'UR 武器', value: '星淵·噬月矛 / 星龍·夢淵鏡 / 星淵·穿宙神羽弓（2% 機率）', color: 'var(--hp-enemy)' },
        ],
        bossPortrait: 'assets/portraits/raid-dragon.png',  // 預覽用龍當代表
        enemies: [],
        boss: '虛宙星龍' },
      // ===== 鏡夢縛魂（單階 BOSS RAID + 開場動畫，畢業後最終本）=====
      // 幻夢之主：紅絲帶縛萬千分身，凡入此境者被蝕去自我
      // 機制：每 30 秒凝聚「分身結界」護盾，5 秒內不破則全隊即死
      // 掉落：低機率 UR 戒指（幻夢 / 蝕念 隨機一枚）
      { id: 'raid-mirror', name: '鏡夢 · 縛魂', cp: 700000, unlock: 'raid-stardragon', requiredLv: 99,
        minCpOverride: 400000,  // 實際入場門檻 40 萬 CP
        cpHidden: true,         // 預覽窗 CP 顯示「???」
        isRaid: true, baseTime: 60, expBase: 60000, goldBase: 100000,
        difficultyMul: 60,
        atkCoefOverride: 0.005,    // BOSS 平 A 倍率
        defScaleOverride: 2.5,
        skipMobs: true,  // 不出小怪，直接 BOSS
        cutscene: {
          portrait: 'assets/portraits/raid-mirror.png',
          lines: [
            { speaker: '？？？',     text: '……是誰，闖入我的鏡夢？' },
            { speaker: '幻夢之主', text: '紅絲帶縛萬千分身——你能辨真我嗎？' },
            { speaker: '幻夢之主', text: '來吧，迷途者——讓你的影子永遠映入鏡中。' },
          ],
        },
        bosses: [
          // 鏡夢縛魂的 BOSS 從零設計，不沿用雙影獵討的週期即死護盾。
          // 所有技能獨立列在 BOSS 物件上（openingAttack / 之後會加更多）。
          { name: '幻夢之主', portrait: 'assets/portraits/raid-mirror.png',
            portraitTall: true,        // ← 立繪是直幅，戰鬥卡片改 3:4 比例顯示完整
            hpOverride: 10_000_000_000, // ← 精確 100 億 HP
            bossSkillTag: 'mirror',     // ← 啟用幻夢之主專屬技能組（battle.js 內排程）
            // ── 技能 1：開場拔刀斬 ──
            // 戰鬥一開始 BOSS 進入 3 秒蓄力姿態，凝聚 20 億盾
            // 3 秒內不破盾 → 衝刺一刀，造成玩家最大生命 90% 傷害（不一定即死）
            openingAttack: {
              name: '拔刀斬',
              chargeTime: 3,
              shieldHp: 2_000_000_000,  // 20 億盾
              damageOnFail: 0.9,        // 90% maxHp 衝刺一刀
            },
          },
        ],
        bonusMats: [
          { name: '神鋼', chance: 0.50, qty: [10, 20] },
          { name: '永晶', chance: 0.30, qty: [3, 6] },
        ],
        bonusEquipment: [
          // 首通必掉 1 枚（從 2 枚隨機）、之後 5% 機率
          { items: ['eq-ring-ur-dream', 'eq-ring-ur-erosion'], chance: 0.05, guaranteedFirstClear: true, label: 'UR 戒指' },
        ],
        lore: [
          '鏡湖之畔，住著一位「幻夢之主」。',
          '紅絲帶纏繞萬千分身，凡入此境者皆迷失於鏡像。',
          '心智被蝕、靈魂被縛——直至忘卻自我，化為她的一員。',
          '若能斬斷幻象、直擊真實，便可帶走她遺落的縛魂之物。',
        ],
        rewards: [
          { label: '經驗值', value: '60,000', color: 'var(--exp)' },
          { label: '金幣',   value: '100,000', color: 'var(--gold)' },
          { label: '神鋼',   value: '50% 機率 ×10~20', color: 'var(--shard)' },
          { label: '永晶',   value: '30% 機率 ×3~6', color: 'var(--shard)' },
          { label: '★★ UR 戒指', value: '首通必掉 1 枚、之後 5% 機率（幻夢戒指 / 蝕念戒指 隨機）', color: 'var(--hp-enemy)' },
        ],
        bossPortrait: 'assets/portraits/raid-mirror.png',
        enemies: [],
        boss: '幻夢之主' },
    ],
  },
];

// ===== 製作配方 =====
const RECIPES = [
  // R 階（Lv 15）— 材料 3 倍
  { id: 'craft-r-weap', name: '寒鐵矛',   target: 'eq-weap-r1', cost: { gold: 1000, mats: { '精鋼': 15 } }, requiredLv: 15 },
  { id: 'craft-r-head', name: '銀絲髮飾', target: 'eq-head-r1', cost: { gold: 800,  mats: { '精鋼': 12 } }, requiredLv: 15 },
  { id: 'craft-r-top',  name: '霜葉袍',   target: 'eq-top-r1',  cost: { gold: 800,  mats: { '精鋼': 12 } }, requiredLv: 15 },
  { id: 'craft-r-bot',  name: '輕步袴',   target: 'eq-bot-r1',  cost: { gold: 800,  mats: { '精鋼': 12 } }, requiredLv: 15 },
  { id: 'craft-r-feet', name: '迅風靴',   target: 'eq-feet-r1', cost: { gold: 800,  mats: { '精鋼': 12 } }, requiredLv: 15 },
  // SR 階（Lv 35）— 材料 3 倍
  { id: 'craft-sr-weap', name: '銀霜長矛',   target: 'eq-weap-sr1', cost: { gold: 4500,  mats: { '星鋼': 25, '精鋼': 10 } }, requiredLv: 35 },
  { id: 'craft-sr-head', name: '星霜冠',     target: 'eq-head-sr1', cost: { gold: 4000,  mats: { '星鋼': 22, '精鋼': 8 } },  requiredLv: 35 },
  { id: 'craft-sr-top',  name: '霜雪戰袍',   target: 'eq-top-sr1',  cost: { gold: 4000,  mats: { '星鋼': 22, '精鋼': 8 } },  requiredLv: 35 },
  { id: 'craft-sr-bot',  name: '霜風袴',     target: 'eq-bot-sr1',  cost: { gold: 4000,  mats: { '星鋼': 22, '精鋼': 8 } },  requiredLv: 35 },
  { id: 'craft-sr-feet', name: '寒月靴',     target: 'eq-feet-sr1', cost: { gold: 4000,  mats: { '星鋼': 22, '精鋼': 8 } },  requiredLv: 35 },
  // SSR 階（Lv 60）— 材料 3 倍
  { id: 'craft-ssr-weap', name: '永夜真矛', target: 'eq-weap-ssr1', cost: { gold: 18000, mats: { '神鋼': 30, '永晶': 10, '星鋼': 15 } }, requiredLv: 60 },
  { id: 'craft-ssr-head', name: '星辰冠冕', target: 'eq-head-ssr1', cost: { gold: 15000, mats: { '神鋼': 25, '永晶': 8,  '星鋼': 12 } }, requiredLv: 60 },
  { id: 'craft-ssr-top',  name: '銀河戰袍', target: 'eq-top-ssr1',  cost: { gold: 15000, mats: { '神鋼': 25, '永晶': 8,  '星鋼': 12 } }, requiredLv: 60 },
  { id: 'craft-ssr-bot',  name: '永夜流袴', target: 'eq-bot-ssr1',  cost: { gold: 15000, mats: { '神鋼': 25, '永晶': 8,  '星鋼': 12 } }, requiredLv: 60 },
  { id: 'craft-ssr-feet', name: '幻月之履', target: 'eq-feet-ssr1', cost: { gold: 15000, mats: { '神鋼': 25, '永晶': 8,  '星鋼': 12 } }, requiredLv: 60 },
  // ★★★ Lv 90 上品 SSR 金裝（介於 SSR 與 UR 之間） ★★★
  { id: 'craft-ssr2-weap', name: '永夜·神煉真矛', target: 'eq-weap-ssr2', cost: { gold: 60000, mats: { '神鋼': 70, '永晶': 30 } }, requiredLv: 90 },
  // 終焉鎧神套（畢業 UR 防具，無盡塔材料製作）
  { id: 'craft-ruin-head', name: '蝕痕鎧神冠', target: 'eq-head-ruin', cost: { gold: 200000, mats: { '蝕痕碎片': 30, '蝕痕神核': 15, '終焉印石': 5, '夢晶': 5 } }, requiredLv: 99 },
  { id: 'craft-ruin-top',  name: '蝕痕鎧神甲', target: 'eq-top-ruin',  cost: { gold: 200000, mats: { '蝕痕碎片': 30, '蝕痕神核': 15, '終焉印石': 5, '夢晶': 5 } }, requiredLv: 99 },
  { id: 'craft-ruin-bot',  name: '蝕痕鎧神腿', target: 'eq-bot-ruin',  cost: { gold: 200000, mats: { '蝕痕碎片': 30, '蝕痕神核': 15, '終焉印石': 5, '夢晶': 5 } }, requiredLv: 99 },
  { id: 'craft-ruin-feet', name: '蝕痕鎧神履', target: 'eq-feet-ruin', cost: { gold: 200000, mats: { '蝕痕碎片': 30, '蝕痕神核': 15, '終焉印石': 5, '夢晶': 5 } }, requiredLv: 99 },
  // 雪羽靈鏡製作配方（同階成本與月凜對齊，只是 target 不同）
  { id: 'craft-r-mirror',    name: '寒霜鏡',         target: 'eq-mirror-r1',   cost: { gold: 1000, mats: { '精鋼': 15 } }, requiredLv: 15 },
  { id: 'craft-sr-mirror',   name: '星辰鏡',         target: 'eq-mirror-sr1',  cost: { gold: 4500, mats: { '星鋼': 25, '精鋼': 10 } }, requiredLv: 35 },
  { id: 'craft-ssr-mirror',  name: '月蝕真鏡',       target: 'eq-mirror-ssr1', cost: { gold: 18000, mats: { '神鋼': 30, '永晶': 10, '星鋼': 15 } }, requiredLv: 60 },
  { id: 'craft-ssr2-mirror', name: '月蝕·神煉鏡',    target: 'eq-mirror-ssr2', cost: { gold: 60000, mats: { '神鋼': 70, '永晶': 30 } }, requiredLv: 90 },
  // 璃安弓製作配方（同階成本對齊）
  { id: 'craft-r-bow',       name: '寒林弓',         target: 'eq-bow-r1',      cost: { gold: 1000, mats: { '精鋼': 15 } }, requiredLv: 15 },
  { id: 'craft-sr-bow',      name: '月華弓',         target: 'eq-bow-sr1',     cost: { gold: 4500, mats: { '星鋼': 25, '精鋼': 10 } }, requiredLv: 35 },
  { id: 'craft-ssr-bow',     name: '永光真弓',       target: 'eq-bow-ssr1',    cost: { gold: 18000, mats: { '神鋼': 30, '永晶': 10, '星鋼': 15 } }, requiredLv: 60 },
  { id: 'craft-ssr2-bow',    name: '永光·神煉真弓',  target: 'eq-bow-ssr2',    cost: { gold: 60000, mats: { '神鋼': 70, '永晶': 30 } }, requiredLv: 90 },
  { id: 'craft-ssr2-head', name: '星辰·神煉冕',   target: 'eq-head-ssr2', cost: { gold: 50000, mats: { '神鋼': 60, '永晶': 25 } }, requiredLv: 90 },
  { id: 'craft-ssr2-top',  name: '銀河·神煉戰袍', target: 'eq-top-ssr2',  cost: { gold: 50000, mats: { '神鋼': 60, '永晶': 25 } }, requiredLv: 90 },
  { id: 'craft-ssr2-bot',  name: '永夜·神煉流袴', target: 'eq-bot-ssr2',  cost: { gold: 50000, mats: { '神鋼': 60, '永晶': 25 } }, requiredLv: 90 },
  { id: 'craft-ssr2-feet', name: '幻月·神煉履',   target: 'eq-feet-ssr2', cost: { gold: 50000, mats: { '神鋼': 60, '永晶': 25 } }, requiredLv: 90 },
  // ★★★ Lv 95 核心套裝（烈日 / 永凍 / 神諭）— 比上品 SSR 更貴 ★★★
  // 烈日斷罪
  { id: 'craft-sun-head', name: '烈日·斷罪冠', target: 'eq-head-sun', cost: { gold: 80000, mats: { '神鋼': 80, '永晶': 35, '夢晶': 3 } }, requiredLv: 95 },
  { id: 'craft-sun-top',  name: '烈日·斷罪鎧', target: 'eq-top-sun',  cost: { gold: 90000, mats: { '神鋼': 90, '永晶': 40, '夢晶': 4 } }, requiredLv: 95 },
  { id: 'craft-sun-bot',  name: '烈日·斷罪袴', target: 'eq-bot-sun',  cost: { gold: 80000, mats: { '神鋼': 80, '永晶': 35, '夢晶': 3 } }, requiredLv: 95 },
  { id: 'craft-sun-feet', name: '烈日·斷罪靴', target: 'eq-feet-sun', cost: { gold: 80000, mats: { '神鋼': 80, '永晶': 35, '夢晶': 3 } }, requiredLv: 95 },
  // 永凍守魂
  { id: 'craft-frost-head', name: '永凍·守魂冠', target: 'eq-head-frost', cost: { gold: 80000, mats: { '神鋼': 80, '永晶': 35, '夢晶': 3 } }, requiredLv: 95 },
  { id: 'craft-frost-top',  name: '永凍·守魂袍', target: 'eq-top-frost',  cost: { gold: 90000, mats: { '神鋼': 90, '永晶': 40, '夢晶': 4 } }, requiredLv: 95 },
  { id: 'craft-frost-bot',  name: '永凍·守魂袴', target: 'eq-bot-frost',  cost: { gold: 80000, mats: { '神鋼': 80, '永晶': 35, '夢晶': 3 } }, requiredLv: 95 },
  { id: 'craft-frost-feet', name: '永凍·守魂履', target: 'eq-feet-frost', cost: { gold: 80000, mats: { '神鋼': 80, '永晶': 35, '夢晶': 3 } }, requiredLv: 95 },
  // 神諭織縷
  { id: 'craft-oracle-head', name: '神諭·織縷冠', target: 'eq-head-oracle', cost: { gold: 80000, mats: { '神鋼': 80, '永晶': 35, '夢晶': 3 } }, requiredLv: 95 },
  { id: 'craft-oracle-top',  name: '神諭·織縷袍', target: 'eq-top-oracle',  cost: { gold: 90000, mats: { '神鋼': 90, '永晶': 40, '夢晶': 4 } }, requiredLv: 95 },
  { id: 'craft-oracle-bot',  name: '神諭·織縷袴', target: 'eq-bot-oracle',  cost: { gold: 80000, mats: { '神鋼': 80, '永晶': 35, '夢晶': 3 } }, requiredLv: 95 },
  { id: 'craft-oracle-feet', name: '神諭·織縷履', target: 'eq-feet-oracle', cost: { gold: 80000, mats: { '神鋼': 80, '永晶': 35, '夢晶': 3 } }, requiredLv: 95 },
  // ===== 戒指（純詞綴，最高 SSR，可重抽券洗詞綴；通用無左右之分，裝備時自選格子）=====
  // 練習戒指 N 不開製作（僅創角時起始發），玩家從 R 開始做
  { id: 'craft-ring-r',   name: '寒鐵戒指', target: 'eq-ring-r',   cost: { gold: 1200,  mats: { '精鋼': 12 } },                         requiredLv: 15 },
  { id: 'craft-ring-sr',  name: '星辰戒指', target: 'eq-ring-sr',  cost: { gold: 5000,  mats: { '星鋼': 22, '精鋼': 10 } },             requiredLv: 35 },
  { id: 'craft-ring-ssr', name: '永夜戒指', target: 'eq-ring-ssr', cost: { gold: 20000, mats: { '神鋼': 28, '永晶': 10, '星鋼': 12 } }, requiredLv: 60 },
  // UR 只能襲擊戰掉，不開放製作
];

// ===== 魔法石（鑲嵌用）· 5 階分級 =====
// T1 粗糙 (N) → T2 初級 (R) → T3 高級 (SR) → T4 上品 (SSR) → T5 至高 (UR)
const GEM_TIER_NAMES = ['', '粗糙', '初級', '高級', '上品', '至高'];
const GEM_TIER_RARITY = ['', 'N', 'R', 'SR', 'SSR', 'UR'];
const GEM_FAMILIES = [
  { stat: 'atk',      base: '緋瑪瑙', label: '攻擊', values: [5, 18, 45, 100, 220], pct: false },
  { stat: 'def',      base: '青玉',   label: '防禦', values: [4, 12, 30, 70, 150], pct: false },
  { stat: 'hp',       base: '血玉',   label: '生命', values: [50, 180, 450, 1000, 2200], pct: false },
  { stat: 'crit',     base: '靈石',   label: '暴擊', values: [0.01, 0.025, 0.05, 0.085, 0.13], pct: true },
  { stat: 'spd',      base: '風石',   label: '速度', values: [0.02, 0.05, 0.10, 0.18, 0.30], pct: true },
  { stat: 'critDmg',  base: '凶玉',   label: '暴傷', values: [0.03, 0.07, 0.14, 0.25, 0.40], pct: true },
  { stat: 'dmgReduce',base: '鋼玉',   label: '減傷', values: [0.01, 0.02, 0.04, 0.07, 0.12], pct: true },
];
const GEMS = (() => {
  const arr = [];
  for (const f of GEM_FAMILIES) {
    for (let t = 1; t <= 5; t++) {
      arr.push({
        id: `gem-${f.stat}-${t}`,
        name: `${GEM_TIER_NAMES[t]}${f.base}`,
        tier: t,
        stat: f.stat,
        value: f.values[t - 1],
        rarity: GEM_TIER_RARITY[t],
        pct: f.pct,
      });
    }
  }
  return arr;
})();

// ===== 魔力石（賦予系統用） =====
// 跟既有 GEM（鑲嵌孔）完全分開：賦予是「武器內建槽位」、玩家可裝多顆同色
// 每件武器槽位：紅 10、藍 10、黃 10、巨型 3 = 共 33 槽
//
// 設計核心：每顆石頭只 roll 一條屬性，但**屬性本身是隨機的**
// - 紅石「專精」攻擊力 → 攻擊力 roll 機率較高，但仍可能洗到其他屬性
// - 同理藍石 = 技能傷害專精、黃石 = 暴擊傷害專精
// - 池子裡有玩家想要的（atk/skillDmg/critDmg）也有不太想要的（defPct/hpPct）
// - 想堆出完美武器要刷很多顆石頭
//
// 12 種屬性池（涵蓋面板所有屬性）、全部上限 5%、紅藍黃機率均等
const IMBUE_STAT_POOL = [
  // 攻擊組
  { stat: 'atk',       label: '攻擊力',     range: [0.01, 0.05] },
  { stat: 'crit',      label: '暴擊率',     range: [0.01, 0.04] },
  { stat: 'critDmg',   label: '暴擊傷害',   range: [0.01, 0.05] },
  // 防禦組
  { stat: 'def',       label: '防禦',       range: [0.01, 0.05] },
  { stat: 'hp',        label: '生命',       range: [0.01, 0.05] },
  { stat: 'dmgReduce', label: '減傷',       range: [0.01, 0.04] },
  // 機動組
  { stat: 'spd',       label: '速度',       range: [0.01, 0.03] },  // 上限 5/10、給小一點
  { stat: 'cdReduce',  label: 'CD 減',      range: [0.01, 0.03] },  // 上限 50%、給小一點
  { stat: 'vsBoss',    label: '對 BOSS',    range: [0.01, 0.05] },
  { stat: 'skillDmg',  label: '技能傷害',   range: [0.01, 0.05] },
  { stat: 'defPierce', label: '無視防禦',   range: [0.01, 0.04] },  // 上限 95%
  // 秘力組
  { stat: 'maxMp',     label: 'MP 上限',    range: [0.01, 0.05] },  // 走 maxMpPct multiplier
];

const MAGIC_STONES = {
  'mstone-red': {
    id: 'mstone-red', name: '紅魔力石', color: 'red', icon: '🔴',
    label: '紅色魔力結晶',
    desc: '蘊含烈火本能的赤紅結晶。賦予時從 8 種屬性池子隨機抽 1 條（上限 5%）。',
  },
  'mstone-blue': {
    id: 'mstone-blue', name: '藍魔力石', color: 'blue', icon: '🔵',
    label: '藍色魔力結晶',
    desc: '深海回響般的蔚藍核心。賦予時從 8 種屬性池子隨機抽 1 條（上限 5%）。',
  },
  'mstone-yellow': {
    id: 'mstone-yellow', name: '黃魔力石', color: 'yellow', icon: '🟡',
    label: '黃色魔力結晶',
    desc: '雷光凝練的金黃晶體。賦予時從 8 種屬性池子隨機抽 1 條（上限 5%）。',
  },
  'mstone-mega': {
    id: 'mstone-mega', name: '巨型魔力石', color: 'mega', icon: '💎',
    label: '巨型 · 單屬性雙倍',
    desc: '極稀有的巨型結晶。賦予方式同一般魔力石（隨機 1 條屬性），但數值為一般的兩倍（如攻擊 5%~10%）。暗影結晶塔極低機率產出。',
  },
};

// 賦予槽位設定：每件武器
const IMBUE_SLOT_CAPS = {
  red:    10,
  blue:   10,
  yellow: 10,
  mega:   3,
};

// 賦予花費（金幣）— 一次賦予 20 萬，相當昂貴
const IMBUE_COSTS = {
  red:    200_000,
  blue:   200_000,
  yellow: 200_000,
  mega:   2_000_000,
  remove: 50_000,   // 拆除單槽（石頭直接銷毀，不返還）— 5 萬金幣 = 1 場試煉境
};

// 取一顆魔力石 def
function findMagicStone(id) { return MAGIC_STONES[id]; }

// roll 出一顆石頭實際賦予的屬性
// 紅藍黃：從 IMBUE_STAT_POOL 均等隨機抽 1 條（三色機率完全一樣）
// 巨型：固定 3 條主屬性同賦
function rollImbueEffect(stoneId) {
  const def = MAGIC_STONES[stoneId];
  if (!def) return null;
  const round = v => Math.round(v * 1000) / 1000;
  // 均等從屬性池抽 1 條（紅藍黃機率完全一樣）
  const pick = IMBUE_STAT_POOL[Math.floor(Math.random() * IMBUE_STAT_POOL.length)];
  if (!pick) return null;
  const [lo, hi] = pick.range;
  // 巨型魔力石：同一條屬性，但數值為一般的兩倍（例：攻擊一般上限 5% → 巨型 5%~10% 隨機）
  if (def.color === 'mega') {
    return { [pick.stat]: round(hi + Math.random() * hi) };  // [hi, 2*hi]
  }
  // 紅藍黃：一般上限（例：攻擊 1%~5%）
  return { [pick.stat]: round(lo + Math.random() * (hi - lo)) };
}

// ===== 藥水 / 卷軸 =====
// type:
//   'hp_heal' - 立即回復 HP（value 為 max HP 比例 0.3-0.8）
//   'mp_heal' - 立即回復 MP（value 為 max MP 比例）
//   'buff'    - 持續時間內加成（stat / value / duration / kind: 'combat'|'global'）
// cost: { gold, mats?, shard? }
const POTIONS = [
  // ── HP 藥水（CD 統一 10s，不受 CD 縮減影響）──
  { id: 'pot-hp-s',  name: '小型治療藥水', type: 'hp_heal', value: 0.30, cd: 10, rarity: 'N',  cost: { gold: 80 },   desc: '回復 30% 最大生命 (CD 10s)', category: 'hp' },
  { id: 'pot-hp-m',  name: '中型治療藥水', type: 'hp_heal', value: 0.55, cd: 10, rarity: 'R',  cost: { gold: 350,  mats: { '精鋼': 1 } }, desc: '回復 55% 最大生命 (CD 10s)', category: 'hp' },
  { id: 'pot-hp-l',  name: '大型治療藥水', type: 'hp_heal', value: 0.90, cd: 10, rarity: 'SR', cost: { gold: 1500, mats: { '星鋼': 1 } }, desc: '回復 90% 最大生命 (CD 10s)', category: 'hp' },
  // ── MP 藥水（CD 統一 10s）──
  { id: 'pot-mp-s',  name: '小型秘力藥水', type: 'mp_heal', value: 0.40, cd: 10, rarity: 'N',  cost: { gold: 80 },   desc: '回復 40% 最大秘力 (CD 10s)', category: 'mp' },
  { id: 'pot-mp-m',  name: '中型秘力藥水', type: 'mp_heal', value: 0.70, cd: 10, rarity: 'R',  cost: { gold: 350,  mats: { '精鋼': 1 } }, desc: '回復 70% 最大秘力 (CD 10s)', category: 'mp' },
  { id: 'pot-mp-l',  name: '大型秘力藥水', type: 'mp_heal', value: 1.00, cd: 10, rarity: 'SR', cost: { gold: 1500, mats: { '星鋼': 1 } }, desc: '回復 100% 最大秘力 (CD 10s)', category: 'mp' },
  // ── 戰鬥 Buff（戰鬥中持續，自動再喝） ──
  { id: 'buff-fight',   name: '鬥志藥水',   type: 'buff', kind: 'combat', stat: 'atk',       value: 0.30, duration: 60,  rarity: 'R',  cost: { gold: 500, mats: { '精鋼': 2 } }, desc: '攻擊力 +30%，持續 60 秒', category: 'buff' },
  { id: 'buff-iron',    name: '鋼魂藥水',   type: 'buff', kind: 'combat', stat: 'dmgReduce', value: 0.20, duration: 60,  rarity: 'R',  cost: { gold: 500, mats: { '精鋼': 2 } }, desc: '減傷 +20%，持續 60 秒', category: 'buff' },
  { id: 'buff-frenzy',  name: '狂亂藥水',   type: 'buff', kind: 'combat', stat: 'crit',      value: 0.15, duration: 60,  rarity: 'SR', cost: { gold: 1200, mats: { '星鋼': 2 } }, desc: '暴擊 +15%，持續 60 秒', category: 'buff' },
  { id: 'buff-swift',   name: '疾風藥水',   type: 'buff', kind: 'combat', stat: 'spdMul',    value: 0.25, duration: 60,  rarity: 'SR', cost: { gold: 1200, mats: { '星鋼': 2 } }, desc: '速度 +25%，持續 60 秒', category: 'buff' },
  // ── 全域加成（戰鬥內外都計時） ──
  { id: 'scroll-exp-30',  name: '經驗加倍卷',   type: 'buff', kind: 'global', stat: 'expMul',  value: 1.0, duration: 1800, rarity: 'SR', cost: { gold: 2500, mats: { '精鋼': 3 } }, desc: '經驗 +100%，持續 30 分鐘', category: 'scroll' },
  { id: 'scroll-gold-30', name: '黃金加倍卷',   type: 'buff', kind: 'global', stat: 'goldMul', value: 0.5, duration: 1800, rarity: 'SR', cost: { gold: 2500, mats: { '精鋼': 3 } }, desc: '金錢 +50%，持續 30 分鐘', category: 'scroll' },
  { id: 'scroll-drop-30', name: '幸運神符',     type: 'buff', kind: 'global', stat: 'dropMul', value: 0.30, duration: 1800, rarity: 'SSR', cost: { gold: 6000, mats: { '星鋼': 3, '神鋼': 1 } }, desc: '裝備掉率與材料掉落 +30%，持續 30 分鐘', category: 'scroll' },
  // ── 強化保護卷（一次性消耗，敲極限強化時可選用；只能透過魂晶兌換取得，不在商店列表） ──
  { id: 'scroll-forge-protect', name: '強化保護卷', type: 'forge-protect', rarity: 'SR', cost: { shard: 50 }, desc: '極限強化 (+11 ~ +18) 時使用，失敗保護不會降級 (50 魂晶/張)', category: 'hidden' },
  // ── 高級加倍卷（魂晶兌換專屬，+300% 1 小時，可疊加普通卷軸）──
  { id: 'scroll-exp-60h',  name: '高級經驗加倍卷', type: 'buff', kind: 'global', stat: 'expMul',  value: 3.0, duration: 3600, rarity: 'SSR', cost: { shard: 200 }, desc: '經驗 +300%，持續 60 分鐘（可疊加普通加倍卷）', category: 'hidden' },
  { id: 'scroll-gold-60h', name: '高級黃金加倍卷', type: 'buff', kind: 'global', stat: 'goldMul', value: 3.0, duration: 3600, rarity: 'SSR', cost: { shard: 200 }, desc: '金錢 +300%，持續 60 分鐘（可疊加普通加倍卷）', category: 'hidden' },
];
function findPotion(id) { return POTIONS.find(p => p.id === id); }

// ===== 魂晶兌換 =====
// 用魂晶換取稀有材料、寶石、裝備等
const SHARD_EXCHANGE = [
  // 材料
  { id: 'sx-jingang', name: '神鋼 ×5',  cost: 50,  reward: { kind: 'material', name: '神鋼', qty: 5 }, desc: '少量補充強化材料' },
  { id: 'sx-yongjing', name: '永晶 ×3', cost: 120, reward: { kind: 'material', name: '永晶', qty: 3 }, desc: 'SSR 製作材料' },
  { id: 'sx-mengjing', name: '夢晶 ×1', cost: 250, reward: { kind: 'material', name: '夢晶', qty: 1 }, desc: '稀有材料，UR 強化用' },
  // 寶石
  { id: 'sx-gem-sr',  name: 'SR 寶石（隨機）', cost: 400,  reward: { kind: 'gem-random', tier: [3, 3] }, desc: '高級寶石，隨機屬性' },
  { id: 'sx-gem-ssr', name: 'SSR 寶石（隨機）', cost: 1200, reward: { kind: 'gem-random', tier: [4, 4] }, desc: '上品寶石，隨機屬性' },
  // 重抽詞綴
  { id: 'sx-reroll',  name: '詞綴重抽券 ×1', cost: 200, reward: { kind: 'reroll-token', qty: 1 }, desc: '重新隨機某件裝備的所有詞綴' },
  // 強化保護卷
  { id: 'sx-forge-protect', name: '強化保護卷 ×1', cost: 50, reward: { kind: 'potion', id: 'scroll-forge-protect', qty: 1 }, desc: '極限強化 (+11 ~ +18) 時可選用，失敗保護不會降級' },
  // 高級加倍卷（可疊加普通加倍卷）
  { id: 'sx-scroll-exp-elite',  name: '高級經驗加倍卷 ×1', cost: 200, reward: { kind: 'potion', id: 'scroll-exp-60h',  qty: 1 }, desc: '經驗 +300%、持續 60 分鐘，可疊加普通經驗卷' },
  { id: 'sx-scroll-gold-elite', name: '高級黃金加倍卷 ×1', cost: 200, reward: { kind: 'potion', id: 'scroll-gold-60h', qty: 1 }, desc: '金錢 +300%、持續 60 分鐘，可疊加普通黃金卷' },
];
function findShardExchange(id) { return SHARD_EXCHANGE.find(s => s.id === id); }

// ===== 寶箱系統 =====
// 四階寶箱：木 / 銀 / 金 / 神格
// 開箱時 roll 3-5 件獎勵，每個 slot 從對應 pool 隨機抽
// ===== 入場券（無盡塔等特殊副本用）=====
const PASSES = {
  'pass-endless': {
    id: 'pass-endless', name: '虛無通行證', rarity: 'SSR', icon: '✦',
    desc: '進入「無盡塔 · 鏡之終焉」需消耗 1 張。寶箱低機率掉落。',
    dungeonId: 'endless-tower',
  },
  'pass-crystal': {
    id: 'pass-crystal', name: '暗影結晶通行證', rarity: 'SSR', icon: '◈',
    desc: '進入「暗影結晶塔 · 霸主試煉」需消耗 1 張。金箱/神格箱低機率掉落。',
    dungeonId: 'endless-crystal',
  },
};
function findPass(id) { return PASSES[id]; }

const CHESTS = {
  'chest-wood': {
    id: 'chest-wood', name: '木製寶箱', rarity: 'N', color: '#a07050',
    desc: '常見小寶箱，內含基礎物資。',
    rolls: 3,  // 開箱抽 3 次
    pool: [
      { kind: 'gold', min: 200, max: 600, weight: 30 },
      { kind: 'material', name: '粗鋼', min: 5, max: 12, weight: 25 },
      { kind: 'material', name: '精鋼', min: 2, max: 5, weight: 15 },
      { kind: 'potion', id: 'pot-hp-s', min: 1, max: 2, weight: 12 },
      { kind: 'potion', id: 'pot-mp-s', min: 1, max: 2, weight: 12 },
      { kind: 'shard', min: 1, max: 3, weight: 6 },
    ],
  },
  'chest-silver': {
    id: 'chest-silver', name: '銀製寶箱', rarity: 'R', color: '#c0c8d8',
    desc: '中階寶箱，常有中型藥水與材料。極低機率掉虛無通行證。',
    rolls: 4,
    pool: [
      { kind: 'gold', min: 1000, max: 3000, weight: 25 },
      { kind: 'material', name: '精鋼', min: 5, max: 10, weight: 20 },
      { kind: 'material', name: '星鋼', min: 2, max: 5, weight: 15 },
      { kind: 'potion', id: 'pot-hp-m', min: 1, max: 2, weight: 12 },
      { kind: 'potion', id: 'pot-mp-m', min: 1, max: 2, weight: 12 },
      { kind: 'potion', id: 'buff-fight', min: 1, max: 1, weight: 5 },
      { kind: 'shard', min: 3, max: 8, weight: 8 },
      { kind: 'gem-random', tier: [1, 2], weight: 3 },
      { kind: 'pass', id: 'pass-endless', min: 1, max: 1, weight: 0.5 },  // 0.5%
      { kind: 'material', name: '異界之鎚', min: 1, max: 1, weight: 0.3 },  // 銀箱 0.3%
    ],
  },
  'chest-gold': {
    id: 'chest-gold', name: '金製寶箱', rarity: 'SR', color: '#ffd66e',
    desc: '高階寶箱，有機會獲得稀有裝備或寶石。',
    rolls: 5,
    pool: [
      { kind: 'gold', min: 4000, max: 10000, weight: 20 },
      { kind: 'material', name: '星鋼', min: 5, max: 10, weight: 18 },
      { kind: 'material', name: '神鋼', min: 2, max: 5, weight: 15 },
      { kind: 'material', name: '永晶', min: 1, max: 3, weight: 8 },
      { kind: 'potion', id: 'pot-hp-l', min: 1, max: 2, weight: 8 },
      { kind: 'potion', id: 'pot-mp-l', min: 1, max: 2, weight: 8 },
      { kind: 'potion', id: 'buff-frenzy', min: 1, max: 1, weight: 5 },
      { kind: 'potion', id: 'scroll-exp-30', min: 1, max: 1, weight: 4 },
      { kind: 'shard', min: 8, max: 20, weight: 8 },
      { kind: 'gem-random', tier: [2, 3], weight: 7 },
      { kind: 'equip-rarity', rarity: 'SR', weight: 7 },
      { kind: 'pass', id: 'pass-endless', min: 1, max: 1, weight: 2 },  // 2%
      { kind: 'pass', id: 'pass-crystal', min: 1, max: 1, weight: 2 },  // 2%
      { kind: 'material', name: '異界之鎚', min: 1, max: 1, weight: 1.5 },  // 金箱 1.5%
    ],
  },
  'chest-divine': {
    id: 'chest-divine', name: '神格寶箱', rarity: 'SSR', color: '#ff8a3c',
    desc: '災厄餘響中的神格寶箱。內含珍稀物資。',
    rolls: 5,
    pool: [
      { kind: 'gold', min: 15000, max: 40000, weight: 15 },
      { kind: 'material', name: '神鋼', min: 5, max: 12, weight: 18 },
      { kind: 'material', name: '永晶', min: 3, max: 8, weight: 15 },
      { kind: 'material', name: '夢晶', min: 1, max: 3, weight: 8 },
      { kind: 'potion', id: 'pot-hp-l', min: 2, max: 3, weight: 7 },
      { kind: 'potion', id: 'pot-mp-l', min: 2, max: 3, weight: 7 },
      { kind: 'potion', id: 'scroll-drop-30', min: 1, max: 1, weight: 5 },
      { kind: 'shard', min: 30, max: 80, weight: 6 },
      { kind: 'gem-random', tier: [3, 4], weight: 10 },
      { kind: 'equip-rarity', rarity: 'SSR', weight: 9 },
      { kind: 'pass', id: 'pass-endless', min: 1, max: 1, weight: 8 },  // 8%
      { kind: 'pass', id: 'pass-crystal', min: 1, max: 1, weight: 8 },  // 8%
      { kind: 'material', name: '異界之鎚', min: 1, max: 1, weight: 5 },  // 神箱 5%
    ],
  },
  // 魔力石寶箱：暗影結晶塔專屬，每箱開出 1 顆魔力石（紅/藍/黃隨機，極低機率巨型）
  'chest-mana': {
    id: 'chest-mana', name: '魔力石寶箱', rarity: 'SR', color: '#b46cff',
    desc: '暗影結晶塔的獎勵。每箱開出 1 顆魔力石（紅/藍/黃隨機），極低機率開出巨型魔力石。',
    rolls: 1,
    pool: [
      { kind: 'magicstone', id: 'mstone-red',    weight: 49 },
      { kind: 'magicstone', id: 'mstone-blue',   weight: 49 },
      { kind: 'magicstone', id: 'mstone-yellow', weight: 49 },
      { kind: 'magicstone', id: 'mstone-mega',   weight: 3 },  // 3/150 = 2% 巨型
    ],
  },
};
function findChest(id) { return CHESTS[id]; }
// 開箱：依 rolls 次數從 pool 加權抽，回傳 [{ kind, qty/id }, ...]
function rollChestRewards(chestId) {
  const c = CHESTS[chestId];
  if (!c) return [];
  const totalWeight = c.pool.reduce((a, p) => a + p.weight, 0);
  const results = [];
  for (let i = 0; i < c.rolls; i++) {
    let roll = Math.random() * totalWeight;
    let picked = null;
    for (const p of c.pool) {
      roll -= p.weight;
      if (roll <= 0) { picked = p; break; }
    }
    if (!picked) picked = c.pool[c.pool.length - 1];
    const qty = (picked.min != null && picked.max != null)
      ? picked.min + Math.floor(Math.random() * (picked.max - picked.min + 1))
      : 1;
    results.push({ ...picked, qty });
  }
  return results;
}

// ===== 材料升階配方 =====
// 用低階材料合成高階材料，給「粗鋼囤太多」一個出口
const MATERIAL_RECIPES = [
  { id: 'mat-r1', name: '粗鋼 → 精鋼', from: { '粗鋼': 12 }, to: '精鋼', toQty: 1, gold: 50,    requiredLv: 15 },
  { id: 'mat-r2', name: '精鋼 → 星鋼', from: { '精鋼': 10 }, to: '星鋼', toQty: 1, gold: 200,   requiredLv: 35 },
  { id: 'mat-r3', name: '星鋼 → 神鋼', from: { '星鋼': 8 },  to: '神鋼', toQty: 1, gold: 800,   requiredLv: 60 },
  { id: 'mat-r4', name: '神鋼 → 永晶', from: { '神鋼': 6 },  to: '永晶', toQty: 1, gold: 3000,  requiredLv: 80 },
  // 夢晶不開放合成（必須襲擊戰）
];
function findMaterialRecipe(id) { return MATERIAL_RECIPES.find(r => r.id === id); }

function findRecipe(id) { return RECIPES.find(r => r.id === id); }
function findGem(id) { return GEMS.find(g => g.id === id); }
function socketsForRarity(rarity) {
  return { N: 0, R: 1, SR: 2, SSR: 3, UR: 6 }[rarity] || 0;
}

// --------------------------------------------------------------------------
// 物品：5 部位裝備（武器/頭/上衣/下衣/腳）+ 材料 + 詞綴池
// --------------------------------------------------------------------------
const EQUIPMENT_SLOTS = ['weapon', 'head', 'top', 'bottom', 'feet', 'ring1', 'ring2'];
const SLOT_LABELS = { weapon: '武器', head: '頭', top: '上衣', bottom: '下衣', feet: '腳', ring1: '戒指(左)', ring2: '戒指(右)', ring: '戒指' };
// 戒指：單一 def.slot='ring'，可裝在 ring1 或 ring2 兩個格子
function isRingSlot(slot) { return slot === 'ring1' || slot === 'ring2'; }
function slotAcceptsItem(slot, defSlot) { return defSlot === slot || (isRingSlot(slot) && defSlot === 'ring'); }

const ITEMS = {
  materials: {
    '粗鋼': { tag: '材料', rarity: 'N',   icon: '◆' },
    '精鋼': { tag: '材料', rarity: 'R',   icon: '◆' },
    '星鋼': { tag: '材料', rarity: 'SR',  icon: '◆' },
    '神鋼': { tag: '材料', rarity: 'SSR', icon: '◆' },
    '永晶': { tag: '材料', rarity: 'SSR', icon: '◇' },
    '夢晶': { tag: '材料', rarity: 'UR',  icon: '◇' },
    // 無盡塔終焉材料（用於製作終焉套 + 兌換鎚子）
    '蝕痕碎片': { tag: '終焉', rarity: 'UR', icon: '✦' },
    '蝕痕神核': { tag: '終焉', rarity: 'UR', icon: '✦' },
    '終焉印石': { tag: '終焉', rarity: 'UR', icon: '✶' },
    '異界之鎚': { tag: '鍛造', rarity: 'UR', icon: '🔨' },
    // 星淵雙影獵討材料（雙階 BOSS RAID 專屬）
    '星淵碎片': { tag: '星淵', rarity: 'UR', icon: '★' },
    '星龍鱗片': { tag: '星淵', rarity: 'UR', icon: '★' },
    '永恆星辰': { tag: '星淵', rarity: 'UR', icon: '☆' },
  },
  // 5 部位 × 5 階品質
  equipment: [
    // ===== 練習裝（N · Tier 0 · 起始） =====
    { id: 'eq-weap-prac', slot: 'weapon', owner: 'tsukirin', name: '練習矛', rarity: 'N', tier: 0, stats: { atk: 6 }, fixed: { label: '初心者護祐：基礎攻擊 +2', effect: { atk: 2 } } },
    { id: 'eq-head-prac', slot: 'head', name: '練習髮帶', rarity: 'N', tier: 0, stats: { hp: 25, crit: 0.01 }, fixed: { label: '專注：暴擊 +1%', effect: { crit: 0.01 } } },
    { id: 'eq-top-prac',  slot: 'top',  name: '練習短衫', rarity: 'N', tier: 0, stats: { def: 5, hp: 40 }, fixed: { label: '堅韌：生命 +20', effect: { hp: 20 } } },
    { id: 'eq-bot-prac',  slot: 'bottom', name: '練習短袴', rarity: 'N', tier: 0, stats: { def: 4, spd: 0.02 }, fixed: { label: '輕盈：速度 +2%', effect: { spd: 0.02 } } },
    { id: 'eq-feet-prac', slot: 'feet', name: '練習鞋', rarity: 'N', tier: 0, stats: { spd: 0.04, hp: 15 }, fixed: { label: '穩步：減傷 +1%', effect: { dmgReduce: 0.01 } } },

    // ===== R · Tier 1 · 寒霜流套裝 =====
    { id: 'eq-weap-r1', slot: 'weapon', owner: 'tsukirin', name: '寒鐵矛', rarity: 'R', tier: 1, setId: 'set-frost', stats: { atk: 25, crit: 0.02 }, fixed: { label: '寒霜刃：攻擊 +(12+強化×1.5)', effect: { atk: 'forge:12+1.5' } } },
    { id: 'eq-head-r1', slot: 'head', name: '銀絲髮飾', rarity: 'R', tier: 1, setId: 'set-frost', stats: { hp: 90, crit: 0.03 }, fixed: { label: '明察：暴傷 +8%', effect: { critDmg: 0.08 } } },
    { id: 'eq-top-r1',  slot: 'top',  name: '霜葉袍', rarity: 'R', tier: 1, setId: 'set-frost', stats: { def: 14, hp: 100 }, fixed: { label: '霜葉護體：減傷 +5%', effect: { dmgReduce: 0.05 } } },
    { id: 'eq-bot-r1',  slot: 'bottom', name: '輕步袴', rarity: 'R', tier: 1, setId: 'set-frost', stats: { def: 10, spd: 0.06 }, fixed: { label: '輕功：速度 +7%', effect: { spd: 0.07 } } },
    { id: 'eq-feet-r1', slot: 'feet', name: '迅風靴', rarity: 'R', tier: 1, setId: 'set-frost', stats: { spd: 0.10, hp: 60 }, fixed: { label: '疾足：速度 +(6%+強化×0.7%)', effect: { spd: 'forge:0.06+0.007' } } },

    // ===== SR · Tier 2 · 銀霜流套裝 =====
    { id: 'eq-weap-sr1', slot: 'weapon', owner: 'tsukirin', name: '銀霜長矛', rarity: 'SR', tier: 2, setId: 'set-silvermoon', stats: { atk: 70, crit: 0.05 }, fixed: { label: '銀月鋒銳：暴擊 +(5%+強化×0.8%)', effect: { crit: 'forge:0.05+0.008' } } },
    { id: 'eq-head-sr1', slot: 'head', name: '星霜冠', rarity: 'SR', tier: 2, setId: 'set-silvermoon', stats: { hp: 260, crit: 0.05, atk: 18 }, fixed: { label: '星輝：所有屬性 +5%', effect: { allMul: 0.05 } } },
    { id: 'eq-top-sr1',  slot: 'top',  name: '霜雪戰袍', rarity: 'SR', tier: 2, setId: 'set-silvermoon', stats: { def: 34, hp: 280 }, fixed: { label: '雪盾：減傷 +(8%+強化×0.8%)', effect: { dmgReduce: 'forge:0.08+0.008' } } },
    { id: 'eq-bot-sr1',  slot: 'bottom', name: '霜風袴', rarity: 'SR', tier: 2, setId: 'set-silvermoon', stats: { def: 24, spd: 0.12 }, fixed: { label: '霜風：CD 縮減 +8%', effect: { cdReduce: 0.08 } } },
    { id: 'eq-feet-sr1', slot: 'feet', name: '寒月靴', rarity: 'SR', tier: 2, setId: 'set-silvermoon', stats: { spd: 0.22, hp: 130, def: 10 }, fixed: { label: '寒月舞：速度 +(15%+強化×1.5%)', effect: { spd: 'forge:0.15+0.015' } } },

    // ===== SSR · Tier 3 · 永夜流套裝 =====
    { id: 'eq-weap-ssr1', slot: 'weapon', owner: 'tsukirin', name: '永夜真矛', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { atk: 170, crit: 0.08, critDmg: 0.25 }, fixed: { label: '永夜鋒芒：暴擊傷害 +(25%+強化×1.8%)', effect: { critDmg: 'forge:0.25+0.018' } } },
    { id: 'eq-head-ssr1', slot: 'head', name: '星辰冠冕', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { hp: 720, crit: 0.10, atk: 50 }, fixed: { label: '神諭：對 BOSS 傷害 +(15%+強化×1.5%)', effect: { vsBoss: 'forge:0.15+0.015' } } },
    { id: 'eq-top-ssr1',  slot: 'top',  name: '銀河戰袍', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { def: 90, hp: 800 }, fixed: { label: '銀河庇佑：減傷 +(12%+強化×0.8%)', effect: { dmgReduce: 'forge:0.12+0.008' } } },
    { id: 'eq-bot-ssr1',  slot: 'bottom', name: '永夜流袴', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { def: 65, spd: 0.28 }, fixed: { label: '永夜飛舞：CD 縮減 +(12%+強化×0.8%)', effect: { cdReduce: 'forge:0.12+0.008' } } },
    { id: 'eq-feet-ssr1', slot: 'feet', name: '幻月之履', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { spd: 0.38, hp: 350, crit: 0.06 }, fixed: { label: '幻月：速度 +(22%+強化×1.5%)', effect: { spd: 'forge:0.22+0.015' } } },

    // ===== Lv 90 上品 SSR（介於 SSR 與 UR 之間，補主線斷層） =====
    { id: 'eq-weap-ssr2', slot: 'weapon', owner: 'tsukirin', name: '永夜·神煉真矛', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { atk: 320, crit: 0.13, critDmg: 0.4 }, fixed: { label: '神煉永夜：攻擊 +(45+強化×5)、暴擊 +4%', effect: { atk: 'forge:45+5', crit: 0.04 } } },
    { id: 'eq-head-ssr2', slot: 'head', name: '星辰·神煉冕', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { hp: 1200, crit: 0.14, atk: 100 }, fixed: { label: '神煉星諭：對 BOSS +(20%+強化×1.5%)、暴傷 +20%', effect: { vsBoss: 'forge:0.20+0.015', critDmg: 0.20 } } },
    { id: 'eq-top-ssr2',  slot: 'top',  name: '銀河·神煉戰袍', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { def: 160, hp: 1400 }, fixed: { label: '神煉庇佑：減傷 +(15%+強化×1%)、生命 +500', effect: { dmgReduce: 'forge:0.15+0.01', hp: 500 } } },
    { id: 'eq-bot-ssr2',  slot: 'bottom', name: '永夜·神煉流袴', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { def: 110, spd: 0.40 }, fixed: { label: '神煉飛舞：CD 縮減 +(15%+強化×1%)、技能傷害 +10%', effect: { cdReduce: 'forge:0.15+0.01', skillDmg: 0.10 } } },
    { id: 'eq-feet-ssr2', slot: 'feet', name: '幻月·神煉履', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { spd: 0.55, hp: 600, crit: 0.10 }, fixed: { label: '神煉幻月：速度 +(28%+強化×2%)、技能傷害 +8%', effect: { spd: 'forge:0.28+0.02', skillDmg: 0.08 } } },

    // ===== 烈日斷罪（核心套裝・攻擊型・Lv 95 製作） =====
    { id: 'eq-head-sun', slot: 'head', name: '烈日·斷罪冠', rarity: 'SSR', tier: 3, setId: 'set-sun', stats: { hp: 1500, crit: 0.16, atk: 130 }, fixed: { label: '烈日加冕：暴擊 +(12%+強化×1.5%)', effect: { crit: 'forge:0.12+0.015' } } },
    { id: 'eq-top-sun', slot: 'top', name: '烈日·斷罪鎧', rarity: 'SSR', tier: 3, setId: 'set-sun', stats: { def: 180, hp: 1700, atk: 80 }, fixed: { label: '烈日庇身：攻擊 +(50+強化×5)', effect: { atk: 'forge:50+5' } } },
    { id: 'eq-bot-sun', slot: 'bottom', name: '烈日·斷罪袴', rarity: 'SSR', tier: 3, setId: 'set-sun', stats: { def: 140, spd: 0.45, crit: 0.08 }, fixed: { label: '烈日疾步：速度 +(22%+強化×1.5%)', effect: { spd: 'forge:0.22+0.015' } } },
    { id: 'eq-feet-sun', slot: 'feet', name: '烈日·斷罪靴', rarity: 'SSR', tier: 3, setId: 'set-sun', stats: { spd: 0.55, hp: 800, atk: 60 }, fixed: { label: '烈日掠殺：暴傷 +(25%+強化×2%)', effect: { critDmg: 'forge:0.25+0.02' } } },

    // ===== 永凍守魂（核心套裝・防禦型・Lv 95 製作） =====
    { id: 'eq-head-frost', slot: 'head', name: '永凍·守魂冠', rarity: 'SSR', tier: 3, setId: 'set-frost', stats: { hp: 2000, def: 100, dmgReduce: 0.05 }, fixed: { label: '永凍庇佑：減傷 +(10%+強化×1%)', effect: { dmgReduce: 'forge:0.10+0.01' } } },
    { id: 'eq-top-frost', slot: 'top', name: '永凍·守魂袍', rarity: 'SSR', tier: 3, setId: 'set-frost', stats: { def: 250, hp: 2500 }, fixed: { label: '永凍護體：減傷 +(15%+強化×1.2%)、生命 +800', effect: { dmgReduce: 'forge:0.15+0.012', hp: 800 } } },
    { id: 'eq-bot-frost', slot: 'bottom', name: '永凍·守魂袴', rarity: 'SSR', tier: 3, setId: 'set-frost', stats: { def: 180, hp: 1500, dmgReduce: 0.04 }, fixed: { label: '永凍守備：防禦 +(60+強化×5)', effect: { def: 'forge:60+5' } } },
    { id: 'eq-feet-frost', slot: 'feet', name: '永凍·守魂履', rarity: 'SSR', tier: 3, setId: 'set-frost', stats: { spd: 0.35, hp: 1200, def: 80 }, fixed: { label: '永凍踏霜：生命 +(800+強化×60)', effect: { hp: 'forge:800+60' } } },

    // ===== 終焉鎧（UR 防具・無盡塔製作・畢業終極套裝） =====
    // 鑲嵌格 4 個（其他 SSR 是 3 個），數值平衡介於神煉與神話之間
    // 鍛造系統：每件可以鍛造 0-30 階，每 3 階解鎖一個效果（4 件鍛同樣效果疊加）
    { id: 'eq-head-ruin', slot: 'head', name: '蝕痕鎧神冠', rarity: 'UR', tier: 4, setId: 'set-ruination',
      stats: { hp: 2000, crit: 0.15, atk: 120, critDmg: 0.20 },
      fixed: { label: '鎧神之印：對 BOSS +(25%+強化×1.5%)、暴擊傷害 +25%', effect: { vsBoss: 'forge:0.25+0.015', critDmg: 0.25 } } },
    { id: 'eq-top-ruin', slot: 'top', name: '蝕痕鎧神甲', rarity: 'UR', tier: 4, setId: 'set-ruination',
      stats: { def: 220, hp: 2400, crit: 0.05 },
      fixed: { label: '鎧神守護：減傷 +(18%+強化×1%)、生命 +800、技能傷害 +10%', effect: { dmgReduce: 'forge:0.18+0.01', hp: 800, skillDmg: 0.10 } } },
    { id: 'eq-bot-ruin', slot: 'bottom', name: '蝕痕鎧神腿', rarity: 'UR', tier: 4, setId: 'set-ruination',
      stats: { def: 150, spd: 0.50, hp: 1000 },
      fixed: { label: '鎧神迅律：CD 縮減 +(18%+強化×1%)、技能傷害 +12%、速度 +15%', effect: { cdReduce: 'forge:0.18+0.01', skillDmg: 0.12, spd: 0.15 } } },
    { id: 'eq-feet-ruin', slot: 'feet', name: '蝕痕鎧神履', rarity: 'UR', tier: 4, setId: 'set-ruination',
      stats: { spd: 0.65, hp: 1000, crit: 0.12, atk: 50 },
      fixed: { label: '鎧神疾光：速度 +(30%+強化×2%)、技能傷害 +10%、暴擊 +5%', effect: { spd: 'forge:0.30+0.02', skillDmg: 0.10, crit: 0.05 } } },

    // ===== 神諭織縷（核心套裝・技能型・Lv 95 製作） =====
    { id: 'eq-head-oracle', slot: 'head', name: '神諭·織縷冠', rarity: 'SSR', tier: 3, setId: 'set-oracle', stats: { hp: 1500, crit: 0.10, atk: 100 }, fixed: { label: '神諭加冕：CD 縮減 +(6%+強化×0.5%)', effect: { cdReduce: 'forge:0.06+0.005' } } },
    { id: 'eq-top-oracle', slot: 'top', name: '神諭·織縷袍', rarity: 'SSR', tier: 3, setId: 'set-oracle', stats: { def: 150, hp: 1800 }, fixed: { label: '神諭法袍：技能傷害 +(8%+強化×0.6%)', effect: { skillDmg: 'forge:0.08+0.006' } } },
    { id: 'eq-bot-oracle', slot: 'bottom', name: '神諭·織縷袴', rarity: 'SSR', tier: 3, setId: 'set-oracle', stats: { def: 110, spd: 0.40 }, fixed: { label: '神諭旋舞：CD 縮減 +(7%+強化×0.5%)、技能傷害 +5%', effect: { cdReduce: 'forge:0.07+0.005', skillDmg: 0.05 } } },
    { id: 'eq-feet-oracle', slot: 'feet', name: '神諭·織縷履', rarity: 'SSR', tier: 3, setId: 'set-oracle', stats: { spd: 0.50, hp: 800, crit: 0.08 }, fixed: { label: '神諭迅縷：技能傷害 +(10%+強化×0.8%)', effect: { skillDmg: 'forge:0.10+0.008' } } },

    // ===== UR · Tier 4 · 唯一武器（襲擊戰掉落） =====
    // UR 不屬於任何套裝，純單件神器；只能襲擊戰掉，跨越所有核心套裝獨立發光
    { id: 'eq-weap-ur1', slot: 'weapon', owner: 'tsukirin', name: '永夜·狐神矛', rarity: 'UR', tier: 4,
      stats: { atk: 720, crit: 0.25, critDmg: 0.80 },
      fixed: {
        label: '狐神之意：攻擊 +(160+強化×16)、暴擊 +10%、暴傷 +30%、對王 +(20%+強化×1.2%)、技能傷害 +(20%+強化×1.2%)',
        effect: { atk: 'forge:160+16', crit: 0.10, critDmg: 0.30, vsBoss: 'forge:0.20+0.012', skillDmg: 'forge:0.20+0.012' },
      },
    },

    // ===== 雪羽 靈鏡系列 =====
    { id: 'eq-mirror-prac', slot: 'weapon', owner: 'eve', name: '練習鏡', rarity: 'N', tier: 0, stats: { atk: 6 }, fixed: { label: '初心者護祐：基礎攻擊 +2', effect: { atk: 2 } } },
    { id: 'eq-mirror-r1', slot: 'weapon', owner: 'eve', name: '寒霜鏡', rarity: 'R', tier: 1, setId: 'set-frost', stats: { atk: 25, crit: 0.02 }, fixed: { label: '凜光：攻擊 +(12+強化×1.5)', effect: { atk: 'forge:12+1.5' } } },
    { id: 'eq-mirror-sr1', slot: 'weapon', owner: 'eve', name: '星辰鏡', rarity: 'SR', tier: 2, setId: 'set-silvermoon', stats: { atk: 70, crit: 0.05 }, fixed: { label: '星屑光輝：暴擊 +(5%+強化×0.8%)', effect: { crit: 'forge:0.05+0.008' } } },
    { id: 'eq-mirror-ssr1', slot: 'weapon', owner: 'eve', name: '月蝕真鏡', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { atk: 170, crit: 0.08, critDmg: 0.25 }, fixed: { label: '月蝕之光：暴擊傷害 +(25%+強化×1.8%)', effect: { critDmg: 'forge:0.25+0.018' } } },
    { id: 'eq-mirror-ssr2', slot: 'weapon', owner: 'eve', name: '月蝕·神煉鏡', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { atk: 320, crit: 0.13, critDmg: 0.4 }, fixed: { label: '神煉月蝕：攻擊 +(45+強化×5)、暴擊 +4%', effect: { atk: 'forge:45+5', crit: 0.04 } } },
    { id: 'eq-mirror-ur1', slot: 'weapon', owner: 'eve', name: '永夜·虛無真鏡', rarity: 'UR', tier: 4,
      stats: { atk: 720, crit: 0.25, critDmg: 0.80 },
      fixed: {
        label: '虛無之眼：攻擊 +(160+強化×16)、暴擊 +10%、暴傷 +30%、對王 +(20%+強化×1.2%)、技能傷害 +(20%+強化×1.2%)',
        effect: { atk: 'forge:160+16', crit: 0.10, critDmg: 0.30, vsBoss: 'forge:0.20+0.012', skillDmg: 'forge:0.20+0.012' },
      },
    },

    // ===== 星淵之獵 UR 武器（雙影獵討專屬掉落 2%，畢業終極神器）=====
    { id: 'eq-weap-ur2', slot: 'weapon', owner: 'tsukirin', name: '星淵·噬月矛', rarity: 'UR', tier: 5,
      stats: { atk: 1500, crit: 0.35, critDmg: 1.20 },
      fixed: {
        label: '星淵噬月：攻擊 +(400+強化×40)、暴擊 +20%、暴傷 +90%、對王 +(40%+強化×2.5%)、技能傷害 +(40%+強化×2.5%)、減傷 +10%、無視防禦 +20%',
        effect: { atk: 'forge:400+40', crit: 0.20, critDmg: 0.90, vsBoss: 'forge:0.40+0.025', skillDmg: 'forge:0.40+0.025', dmgReduce: 0.10, defPierce: 0.20, atkPct: 0.15 },
      },
    },
    { id: 'eq-mirror-ur2', slot: 'weapon', owner: 'eve', name: '星龍·夢淵鏡', rarity: 'UR', tier: 5,
      stats: { atk: 1500, crit: 0.35, critDmg: 1.20 },
      fixed: {
        label: '夢淵星龍：攻擊 +(400+強化×40)、暴擊 +20%、暴傷 +90%、對王 +(40%+強化×2.5%)、技能傷害 +(40%+強化×2.5%)、減傷 +10%、無視防禦 +20%',
        effect: { atk: 'forge:400+40', crit: 0.20, critDmg: 0.90, vsBoss: 'forge:0.40+0.025', skillDmg: 'forge:0.40+0.025', dmgReduce: 0.10, defPierce: 0.20, atkPct: 0.15 },
      },
    },
    // ===== 璃安弓系武器（與月凜矛 / 雪羽鏡 同階對齊）=====
    { id: 'eq-bow-prac',    slot: 'weapon', owner: 'rean', name: '練習弓',     rarity: 'N',   tier: 0, stats: { atk: 6 }, fixed: { label: '初心者護祐：基礎攻擊 +2', effect: { atk: 2 } } },
    { id: 'eq-bow-r1',      slot: 'weapon', owner: 'rean', name: '寒林弓',     rarity: 'R',   tier: 1, setId: 'set-frost', stats: { atk: 25, crit: 0.02 }, fixed: { label: '寒霜弦：攻擊 +(12+強化×1.5)', effect: { atk: 'forge:12+1.5' } } },
    { id: 'eq-bow-sr1',     slot: 'weapon', owner: 'rean', name: '月華弓',     rarity: 'SR',  tier: 2, setId: 'set-silvermoon', stats: { atk: 70, crit: 0.05 }, fixed: { label: '月華光輝：暴擊 +(5%+強化×0.8%)', effect: { crit: 'forge:0.05+0.008' } } },
    { id: 'eq-bow-ssr1',    slot: 'weapon', owner: 'rean', name: '永光真弓',   rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { atk: 170, crit: 0.08, critDmg: 0.25 }, fixed: { label: '永光鋒芒：暴擊傷害 +(25%+強化×1.8%)', effect: { critDmg: 'forge:0.25+0.018' } } },
    { id: 'eq-bow-ssr2',    slot: 'weapon', owner: 'rean', name: '永光·神煉真弓', rarity: 'SSR', tier: 3, setId: 'set-eternalnight', stats: { atk: 320, crit: 0.13, critDmg: 0.4 }, fixed: { label: '神煉永光：攻擊 +(45+強化×5)、暴擊 +4%', effect: { atk: 'forge:45+5', crit: 0.04 } } },
    { id: 'eq-bow-ur1',     slot: 'weapon', owner: 'rean', name: '永光·神羽弓', rarity: 'UR', tier: 4,
      stats: { atk: 720, crit: 0.25, critDmg: 0.80 },
      fixed: {
        label: '神羽永光：攻擊 +(160+強化×16)、暴擊 +10%、暴傷 +30%、對王 +(20%+強化×1.2%)、技能傷害 +(20%+強化×1.2%)',
        effect: { atk: 'forge:160+16', crit: 0.10, critDmg: 0.30, vsBoss: 'forge:0.20+0.012', skillDmg: 'forge:0.20+0.012' },
      },
    },
    // ===== 璃安星淵 UR 弓（雙影獵討專屬掉落，與月凜矛 / Eve 鏡 UR2 同階）=====
    { id: 'eq-bow-ur2',     slot: 'weapon', owner: 'rean', name: '星淵·穿宙神羽弓', rarity: 'UR', tier: 5,
      stats: { atk: 1500, crit: 0.35, critDmg: 1.20 },
      fixed: {
        label: '穿宙神羽：攻擊 +(400+強化×40)、暴擊 +20%、暴傷 +90%、對王 +(40%+強化×2.5%)、技能傷害 +(40%+強化×2.5%)、減傷 +10%、無視防禦 +20%',
        effect: { atk: 'forge:400+40', crit: 0.20, critDmg: 0.90, vsBoss: 'forge:0.40+0.025', skillDmg: 'forge:0.40+0.025', dmgReduce: 0.10, defPierce: 0.20, atkPct: 0.15 },
      },
    },
    // ===== 戒指（純詞綴，無 stats / 無 fixed / 無 owner，N~SSR 製作取得，可用重抽券洗詞綴）=====
    { id: 'eq-ring-n',    slot: 'ring', name: '練習戒指', rarity: 'N',   tier: 0, stats: {} },
    { id: 'eq-ring-r',    slot: 'ring', name: '寒鐵戒指', rarity: 'R',   tier: 1, stats: {} },
    { id: 'eq-ring-sr',   slot: 'ring', name: '星辰戒指', rarity: 'SR',  tier: 2, stats: {} },
    { id: 'eq-ring-ssr',  slot: 'ring', name: '永夜戒指', rarity: 'SSR', tier: 3, stats: {} },
    // ===== UR 戒指（鏡夢縛魂 RAID 低機率掉，有觸發類固定效果 procId，左右不可同 procId）=====
    { id: 'eq-ring-ur-dream', slot: 'ring', name: '幻夢戒指', rarity: 'UR', tier: 4, stats: {},
      procId: 'cd-reset',
      proc: { cdResetChance: 0.30 },
      fixed: { label: '幻夢回響：釋放技能時 30% 機率重置該技能 CD' } },
    { id: 'eq-ring-ur-erosion', slot: 'ring', name: '蝕念戒指', rarity: 'UR', tier: 4, stats: {},
      procId: 'skill-stack-atk',
      proc: { skillStackAtk: { value: 0.05, maxStacks: 10 } },
      fixed: { label: '蝕念匯流：釋放技能時獲得 1 層「蝕念」（攻擊 +5%），最多 10 層，戰鬥結束重置' } },
  ],
};

// ===== 套裝系統 =====
const SETS = {
  'set-frost': {
    name: '寒霜流',
    color: '#7ec8ff',
    tagline: '霜月家入門護法。',
    bonuses: [
      { pieces: 2, label: '寒霜·二件套：攻擊 +25、生命 +120', effect: { atk: 25, hp: 120 } },
      { pieces: 4, label: '寒霜·四件套：暴擊 +5%', effect: { crit: 0.05 } },
      { pieces: 5, label: '寒霜·全套：所有屬性 +8%、減傷 +3%', effect: { allMul: 0.08, dmgReduce: 0.03 } },
    ],
  },
  'set-silvermoon': {
    name: '銀霜流',
    color: '#c084ff',
    tagline: '霜月家中傳，月光為刃。',
    bonuses: [
      { pieces: 2, label: '銀霜·二件套：攻擊 +80、生命 +400', effect: { atk: 80, hp: 400 } },
      { pieces: 4, label: '銀霜·四件套：暴傷 +20%', effect: { critDmg: 0.20 } },
      { pieces: 5, label: '銀霜·全套：所有屬性 +6%、CD 縮減 +5%', effect: { allMul: 0.06, cdReduce: 0.05 } },
    ],
  },
  'set-eternalnight': {
    name: '永夜流',
    color: '#ffb24a',
    tagline: '霜月家終極奧義，永夜不熄。',
    bonuses: [
      { pieces: 2, label: '永夜·二件套：攻擊 +200、暴擊 +5%', effect: { atk: 200, crit: 0.05 } },
      { pieces: 4, label: '永夜·四件套：CD 縮減 +12%', effect: { cdReduce: 0.12 } },
      { pieces: 5, label: '永夜·全套：對 BOSS 傷害 +25%、所有屬性 +8%', effect: { vsBoss: 0.25, allMul: 0.08 } },
    ],
  },
  // ===== 核心防具套裝（Lv 95 製作，只有 4 件防具，4 件套是事件觸發） =====
  'set-sun': {
    name: '烈日斷罪',
    color: '#ff8a3c',
    tagline: '炎獄盡頭鑄成的赤金鎧，掠殺者的徽印。',
    coreSet: true, armorOnly: true,
    bonuses: [
      { pieces: 2, label: '烈日·二件套：攻擊 +300、暴擊 +8%', effect: { atk: 300, crit: 0.08 } },
      { pieces: 4, label: '★烈日·四件套（核心）：擊殺敵人 → 6 秒內攻擊 +25%、速度 +25%、暴傷 +30%，最多疊 3 層', triggered: {
        event: 'on-kill', effect: { atk: 0.25, spdMul: 0.25, critDmg: 0.30 }, duration: 6, maxStacks: 3, name: '烈日掠殺',
      } },
    ],
  },
  'set-frost': {
    name: '永凍守魂',
    color: '#88c8ff',
    tagline: '冰封千年的雪山靈魂，將你護於最後一線生機。',
    coreSet: true, armorOnly: true,
    bonuses: [
      { pieces: 2, label: '永凍·二件套：生命 +1500、減傷 +8%', effect: { hp: 1500, dmgReduce: 0.08 } },
      { pieces: 4, label: '★永凍·四件套（核心）：HP < 30% → 觸發無敵 3 秒 + 回復 50% 最大 HP（戰鬥內 1 次）', triggered: {
        event: 'on-low-hp', threshold: 0.30, invulnDur: 3, healPct: 0.50, oncePerBattle: true, name: '永凍守護',
      } },
    ],
  },
  'set-oracle': {
    name: '神諭織縷',
    color: '#c084ff',
    tagline: '從預言之絲編織出的法衣，每次施咒都會收緊命運。',
    coreSet: true, armorOnly: true,
    bonuses: [
      { pieces: 2, label: '神諭·二件套：CD 縮減 +8%、技能傷害 +10%', effect: { cdReduce: 0.08, skillDmg: 0.10 } },
      { pieces: 4, label: '★神諭·四件套（核心）：每施放技能 → 技能傷害 +5%（戰鬥內可疊 10 層，持續整場），同時 MP 上限 +200', triggered: {
        event: 'on-skill-cast', effect: { skillDmg: 0.05 }, maxStacks: 10, persistInBattle: true, name: '神諭迴響',
      }, passive: { maxMp: 200 } },
    ],
  },
  // 終焉套（無盡塔製作・畢業終極）
  'set-ruination': {
    name: '蝕痕鎧神',
    color: '#ff5e7a',
    tagline: '殞落神靈的鎧甲，由無盡塔中的虛無印石鍛造而成。每多一件，自身潛能就再覺醒一分。',
    coreSet: true, armorOnly: true,
    bonuses: [
      { pieces: 2, label: '蝕痕·二件套：對 BOSS +15%、暴擊傷害 +15%', effect: { vsBoss: 0.15, critDmg: 0.15 } },
      { pieces: 4, label: '★蝕痕·四件套：所有屬性 +20%、技能傷害 +25%、減傷 +10%（畢業最終護持）', effect: { allMul: 0.20, skillDmg: 0.25, dmgReduce: 0.10 } },
    ],
  },
};
function findSet(id) { return SETS[id]; }

// ===== 鍛造系統（終焉套裝專屬，每件 0-30 階）=====
// 每 3 階解鎖一個效果，4 件穿戴時效果 ×4 累加
const SMITH_EFFECTS = [
  { stage: 3,  label: '暴擊傷害 +5%',  effect: { critDmg: 0.05 } },
  { stage: 6,  label: '技能傷害 +5%',  effect: { skillDmg: 0.05 } },
  { stage: 9,  label: '對 BOSS +5%',   effect: { vsBoss: 0.05 } },
  { stage: 12, label: '減傷 +3%',      effect: { dmgReduce: 0.03 } },
  { stage: 15, label: 'HP 上限 +300',  effect: { hp: 300 } },
  { stage: 18, label: 'MP 上限 +30',   effect: { maxMp: 30 } },
  { stage: 21, label: '速度 +3%',      effect: { spd: 0.03 } },
  { stage: 24, label: 'CD 縮減 +3%',   effect: { cdReduce: 0.03 } },
  { stage: 27, label: '無視防禦 +5%',  effect: { defPierce: 0.05 } },
  { stage: 30, label: '★攻擊力 +3%',   effect: { atkPct: 0.03 } },
];
const SMITH_MAX_STAGE = 30;

// ===== UR 武器成長系統（雙影獵討 ur2 系列專屬，獨立於鍛造）=====
// 10 階成長，每階一個攻擊向屬性，越來越強
const UR_GROWTH = [
  { stage: 1,  label: '攻擊力 +3%',     effect: { atkPct: 0.03 } },
  { stage: 2,  label: '暴擊傷害 +10%',  effect: { critDmg: 0.10 } },
  { stage: 3,  label: '對 BOSS +10%',   effect: { vsBoss: 0.10 } },
  { stage: 4,  label: '攻擊力 +6%',     effect: { atkPct: 0.06 } },
  { stage: 5,  label: '技能傷害 +20%',  effect: { skillDmg: 0.20 } },
  { stage: 6,  label: '攻擊速度 +30%',  effect: { spd: 0.30 } },
  { stage: 7,  label: '無視防禦 +10%',  effect: { defPierce: 0.10 } },
  { stage: 8,  label: '暴擊傷害 +20%',  effect: { critDmg: 0.20 } },
  { stage: 9,  label: '對 BOSS +20%',   effect: { vsBoss: 0.20 } },
  { stage: 10, label: '★神器：攻擊力 +10%', effect: { atkPct: 0.10 } },
];
const UR_GROWTH_COSTS = [
  { stage: 1,  gold: 100_000,    mats: { '星淵碎片': 10,  '星龍鱗片': 5 } },
  { stage: 2,  gold: 200_000,    mats: { '星淵碎片': 15,  '星龍鱗片': 8 } },
  { stage: 3,  gold: 400_000,    mats: { '星淵碎片': 20,  '星龍鱗片': 12 } },
  { stage: 4,  gold: 800_000,    mats: { '星淵碎片': 25,  '星龍鱗片': 15 } },
  { stage: 5,  gold: 1_500_000,  mats: { '星淵碎片': 30,  '星龍鱗片': 20 } },
  { stage: 6,  gold: 3_000_000,  mats: { '星淵碎片': 35,  '星龍鱗片': 25, '永恆星辰': 1 } },
  { stage: 7,  gold: 5_000_000,  mats: { '星淵碎片': 45,  '星龍鱗片': 30, '永恆星辰': 2 } },
  { stage: 8,  gold: 8_000_000,  mats: { '星淵碎片': 55,  '星龍鱗片': 40, '永恆星辰': 3 } },
  { stage: 9,  gold: 12_000_000, mats: { '星淵碎片': 70,  '星龍鱗片': 50, '永恆星辰': 4 } },
  { stage: 10, gold: 20_000_000, mats: { '星淵碎片': 100, '星龍鱗片': 75, '永恆星辰': 5 } },
];
const UR_GROWTH_MAX_STAGE = 10;
// 判斷裝備是否可用 UR 武器成長
function isUrGrowable(def) {
  return def && (def.id === 'eq-weap-ur2' || def.id === 'eq-mirror-ur2' || def.id === 'eq-bow-ur2');
}
function getUrGrowthCost(stage) {
  return UR_GROWTH_COSTS.find(c => c.stage === stage);
}
function getUrGrowthUnlocked(stage) {
  return UR_GROWTH.filter(e => e.stage <= stage);
}
const SMITH_GOLD_COST = 50000;        // 每次鍛造金幣成本
const SMITH_INITIAL_HITS = 100;       // 新裝備初始鍛造次數
const SMITH_HITS_PER_HAMMER = 20;     // 1 把異界之鎚恢復多少次
const SMITH_JUMP_CHANCE = 0.01;       // 每次鍛造直接跳階機率（1%）

// 階 N → N+1 所需保底次數（隨階級指數增長）
// 階 0→1 約 5 下、階 29→30 約 295 下，平滑曲線
function smithHitsToCap(stage) {
  if (stage >= SMITH_MAX_STAGE) return 0;
  const t = stage / (SMITH_MAX_STAGE - 1);  // 0 → 1
  return Math.max(5, Math.ceil(5 + t * t * 295));
}

function isSmithEligible(def) {
  return def && def.setId === 'set-ruination';
}
function getSmithUnlockedEffects(stage) {
  return SMITH_EFFECTS.filter(e => e.stage <= stage);
}

// 計算角色身上各套裝穿戴件數（每角色獨立背包：用 cs.bag）
function countSetPieces(cs) {
  const counts = {};
  if (!cs || !cs.equip) return counts;
  for (const slot of EQUIPMENT_SLOTS) {
    const instId = cs.equip[slot];
    if (!instId) continue;
    const inst = cs.bag && cs.bag.equipment ? cs.bag.equipment[instId] : null;
    if (!inst) continue;
    const def = findEquipment(inst.itemId);
    if (def && def.setId) counts[def.setId] = (counts[def.setId] || 0) + 1;
  }
  return counts;
}

// 解析固定效果的 forge:base+per 格式，回傳實際數值
function resolveFixedValue(value, forge) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.startsWith('forge:')) {
    const m = value.slice(6).match(/^(-?\d+(?:\.\d+)?)\+(-?\d+(?:\.\d+)?)$/);
    if (m) return parseFloat(m[1]) + parseFloat(m[2]) * (forge || 0);
  }
  return 0;
}

// 隨機詞綴池（裝備掉落時依稀有度給 N=0/R=1/SR=2/SSR=3/UR=4 條）
// 詞綴允許重複（同一裝備可能抽到 2 個神威）
const AFFIX_POOL = [
  { stat: 'atk',       label: '銳利',  min: 4,    max: 18,   integer: true },
  { stat: 'def',       label: '堅固',  min: 3,    max: 12,   integer: true },
  { stat: 'hp',        label: '強健',  min: 25,   max: 100,  integer: true },
  { stat: 'crit',      label: '靈巧',  min: 0.01, max: 0.04, integer: false },
  { stat: 'critDmg',   label: '凶險',  min: 0.05, max: 0.2,  integer: false },
  { stat: 'spd',       label: '迅捷',  min: 0.03, max: 0.10, integer: false },
  { stat: 'dmgReduce', label: '堅韌',  min: 0.01, max: 0.04, integer: false },
  { stat: 'skillDmg',  label: '兇猛',  min: 0.02, max: 0.08, integer: false },
  { stat: 'cdReduce',  label: '急進',  min: 0.01, max: 0.03, integer: false },
  { stat: 'vsBoss',    label: '獵首',  min: 0.02, max: 0.06, integer: false },
  { stat: 'defPierce', label: '破甲',  min: 0.01, max: 0.03, integer: false },
  { stat: 'maxMp',     label: '精魄',  min: 20,   max: 80,   integer: true },
  { stat: 'atkPct',    label: '神威',  min: 0.01, max: 0.03, integer: false },
];

// 戒指詞綴池（新最低 = 一般最高，新最高 = 一般最高 ×2，戒指詞綴永遠強於一般裝備上限）
// 戒指 N=1/R=2/SR=3/SSR=4 條
const RING_AFFIX_POOL = [
  { stat: 'atk',       label: '銳利',  min: 18,   max: 36,   integer: true },
  { stat: 'def',       label: '堅固',  min: 12,   max: 24,   integer: true },
  { stat: 'hp',        label: '強健',  min: 100,  max: 200,  integer: true },
  { stat: 'crit',      label: '靈巧',  min: 0.04, max: 0.08, integer: false },
  { stat: 'critDmg',   label: '凶險',  min: 0.20, max: 0.40, integer: false },
  { stat: 'spd',       label: '迅捷',  min: 0.10, max: 0.20, integer: false },
  { stat: 'dmgReduce', label: '堅韌',  min: 0.04, max: 0.08, integer: false },
  { stat: 'skillDmg',  label: '兇猛',  min: 0.08, max: 0.16, integer: false },
  { stat: 'cdReduce',  label: '急進',  min: 0.03, max: 0.06, integer: false },
  { stat: 'vsBoss',    label: '獵首',  min: 0.06, max: 0.12, integer: false },
  { stat: 'defPierce', label: '破甲',  min: 0.03, max: 0.06, integer: false },
  { stat: 'maxMp',     label: '精魄',  min: 80,   max: 160,  integer: true },
  { stat: 'atkPct',    label: '神威',  min: 0.03, max: 0.06, integer: false },
];

function rollAffixes(rarity, isRing = false) {
  // 戒指比一般裝備多 1 條詞綴（N=1/R=2/SR=3/SSR=4），UR 戒指 5 條（RAID 限定）
  const counts = isRing
    ? { N: 1, R: 2, SR: 3, SSR: 4, UR: 5 }
    : { N: 0, R: 1, SR: 2, SSR: 3, UR: 4 };
  const n = counts[rarity] || 0;
  const pool = isRing ? RING_AFFIX_POOL : AFFIX_POOL;
  const picks = [];
  for (let i = 0; i < n; i++) {
    // 允許重複：直接從 pool 隨機抽，不消除已抽過的條目
    const a = pool[Math.floor(Math.random() * pool.length)];
    const value = a.min + Math.random() * (a.max - a.min);
    const final = a.integer ? Math.round(value) : Math.round(value * 1000) / 1000;
    picks.push({ stat: a.stat, label: a.label, value: final });
  }
  return picks;
}

function findEquipment(id) { return ITEMS.equipment.find(e => e.id === id); }

// --------------------------------------------------------------------------
// 強化曲線
// --------------------------------------------------------------------------
// 強化曲線
// Lv 0~9：普通材料、純成功/失敗，不會降級
// Lv 10~17：用無盡塔材料、有降級機率（等級越高降級越大、成功越小），不能掉破 10
const FORGE_MAX = 18;
const FORGE_SAFE_LEVEL = 10;  // < 10 是「安全強化」，不會降級
function forgeCost(level) {
  // ===== Lv 0~9：普通強化（保留原邏輯） =====
  if (level < FORGE_SAFE_LEVEL) {
    const goldCost = Math.floor(40 * Math.pow(1.55, level));
    let mat = '粗鋼', matCost = 1;
    if (level < 3)       { mat = '粗鋼'; matCost = 2 + level; }
    else if (level < 6)  { mat = '精鋼'; matCost = 2 + (level - 3); }
    else                 { mat = '星鋼'; matCost = 2 + (level - 6); }
    const successRate = Math.max(0.55, 1 - level * 0.05);
    return {
      goldCost, mats: [{ name: mat, qty: matCost }],
      successRate, failRate: 1 - successRate, downgradeRate: 0,
      isAdvanced: false, canDowngrade: false,
    };
  }
  // ===== Lv 10~17：無盡塔材料 + 降級風險 =====
  // 機率曲線（成功 / 失敗 / 降級）
  const TABLE = {
    10: { s: 0.70, d: 0.05 },  // 10→11：成 70 / 失 25 / 降 5
    11: { s: 0.60, d: 0.10 },
    12: { s: 0.50, d: 0.15 },
    13: { s: 0.40, d: 0.25 },
    14: { s: 0.30, d: 0.35 },
    15: { s: 0.25, d: 0.40 },
    16: { s: 0.15, d: 0.50 },
    17: { s: 0.10, d: 0.60 },  // 17→18：成 10 / 失 30 / 降 60
  };
  const t = TABLE[level] || TABLE[17];
  // 材料配方（蝕痕碎片 / 蝕痕神核 / 終焉印石 / 異界之鎚）
  const RECIPES = {
    10: { gold: 500_000,   mats: [{ name: '蝕痕碎片', qty: 30 }, { name: '神鋼', qty: 5 }] },
    11: { gold: 800_000,   mats: [{ name: '蝕痕碎片', qty: 50 }, { name: '神鋼', qty: 8 }] },
    12: { gold: 1_200_000, mats: [{ name: '蝕痕碎片', qty: 80 }, { name: '蝕痕神核', qty: 5 }] },
    13: { gold: 1_800_000, mats: [{ name: '蝕痕碎片', qty: 100 }, { name: '蝕痕神核', qty: 10 }] },
    14: { gold: 2_500_000, mats: [{ name: '蝕痕神核', qty: 15 }, { name: '終焉印石', qty: 3 }] },
    15: { gold: 3_500_000, mats: [{ name: '蝕痕神核', qty: 25 }, { name: '終焉印石', qty: 5 }] },
    16: { gold: 5_000_000, mats: [{ name: '終焉印石', qty: 10 }, { name: '異界之鎚', qty: 2 }] },
    17: { gold: 7_000_000, mats: [{ name: '終焉印石', qty: 20 }, { name: '異界之鎚', qty: 5 }] },
  };
  const recipe = RECIPES[level] || RECIPES[17];
  return {
    goldCost: recipe.gold,
    mats: recipe.mats,
    successRate: t.s,
    downgradeRate: t.d,
    failRate: 1 - t.s - t.d,
    isAdvanced: true,
    canDowngrade: true,
  };
}
// 強化倍率曲線
// Lv 0~10：線性 +12% / 等（保留原曲線，安全強化區）
// Lv 11~18：高階指數增長（讓滿 +18 武器/裝備白值大幅提升，給玩家追求動力）
// 滿 +18 ≈ ×7.4（原本 ×3.16），主要拉武器白值
function forgeMultiplier(level) {
  if (level <= 10) return 1 + level * 0.12;
  const base = 1 + 10 * 0.12;        // Lv 10 起跳 ×2.2
  const extra = level - 10;
  // +18 = 2.2 + 8*0.25 + 64*0.05 = 7.4
  return base + extra * 0.25 + extra * extra * 0.05;
}

// --------------------------------------------------------------------------
// 經驗曲線：1 ~ 99 級
// 早期快、後期慢；99 級總時間長但不致於勸退
// --------------------------------------------------------------------------
const MAX_LEVEL = 99;
function expForLevel(lv) {
  if (lv >= MAX_LEVEL) return Infinity;
  // 1-99 是新手教學，前期超快、後期穩定
  if (lv <= 30) return Math.floor(40 + lv * 4);                       // Lv1=44, Lv30=160
  return Math.floor(160 * Math.pow(1.045, lv - 30));                  // Lv50≈386, Lv70≈924, Lv99≈3470
}

// 共鳴等級加成：每級 +2% 全屬性
function resonanceMultiplier(rl) { return 1 + rl * 0.02; }

// --------------------------------------------------------------------------
// 工具
// --------------------------------------------------------------------------
// 是否為主線副本（非特殊副本、非襲擊戰）
function isMainStoryDungeon(dungeonId) {
  for (const r of REGIONS) {
    if (r.isSpecial || r.isRaid) continue;
    for (const d of r.dungeons) if (d.id === dungeonId) return true;
  }
  return false;
}

// 主線下一關（沿 unlock 鏈往後找）
function getNextMainDungeon(currentId) {
  for (const r of REGIONS) {
    if (r.isSpecial || r.isRaid) continue;
    for (const d of r.dungeons) if (d.unlock === currentId) return d;
  }
  return null;
}

// 主線上一關（用當前 unlock 欄位）
function getPrevMainDungeon(currentId) {
  const d = getDungeon(currentId);
  if (!d || !d.unlock) return null;
  return getDungeon(d.unlock);
}

function getRegionByDungeon(dungeonId) {
  for (const r of REGIONS)
    for (const d of r.dungeons) if (d.id === dungeonId) return r;
  return REGIONS[0];
}
function getDungeon(dungeonId) {
  for (const r of REGIONS)
    for (const d of r.dungeons) if (d.id === dungeonId) return d;
  return null;
}
function getCharacterBlueprint(id) { return CHARACTERS.find(c => c.id === id); }

window.GAME_DATA = {
  CHARACTERS, REGIONS, ITEMS, SKILLS, PASSIVES, RECIPES, MATERIAL_RECIPES, GEMS, SETS, POTIONS, CHESTS, SHARD_EXCHANGE,
  EQUIPMENT_SLOTS, SLOT_LABELS, AFFIX_POOL, RING_AFFIX_POOL,
  isRingSlot, slotAcceptsItem,
  MAGIC_STONES, IMBUE_SLOT_CAPS, IMBUE_COSTS, findMagicStone, rollImbueEffect,
  MAX_LEVEL,
  forgeCost, forgeMultiplier, FORGE_MAX, FORGE_SAFE_LEVEL,
  expForLevel, resonanceMultiplier,
  getRegionByDungeon, getDungeon, getCharacterBlueprint,
  rollAffixes, findEquipment, resolveFixedValue,
  findRecipe, findMaterialRecipe, findGem, socketsForRarity,
  findSet, countSetPieces,
  SMITH_EFFECTS, SMITH_MAX_STAGE, SMITH_GOLD_COST, SMITH_INITIAL_HITS, SMITH_HITS_PER_HAMMER, SMITH_JUMP_CHANCE,
  UR_GROWTH, UR_GROWTH_COSTS, UR_GROWTH_MAX_STAGE, isUrGrowable, getUrGrowthCost, getUrGrowthUnlocked,
  smithHitsToCap, isSmithEligible, getSmithUnlockedEffects,
  findPotion, findChest, rollChestRewards, findShardExchange,
  PASSES, findPass,
  isMainStoryDungeon, getNextMainDungeon, getPrevMainDungeon,
};
