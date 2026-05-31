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
    desc: '八段舞踏狀態：總 850% 攻擊力（末段 250% 暴擊強擊）。CD 10s。',
    mult: [0.7, 0.7, 0.8, 0.8, 1.0, 1.2, 1.3, 2.5], cd: 10.0, mpCost: 270, costTier: 'heavy',
  },
  'endless-night': {
    name: '永夜千華舞', tag: '★大招★', kind: 'physical', path: 'A', requireTier: 3,
    desc: '【終極奧義】十二段月華舞踏 AOE，全段必爆，總 1500% 攻擊力（末段 300% 強擊）。施放後自身攻擊 +40% 持續 8 秒。CD 25s。',
    mult: [0.7, 0.7, 0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 1.3, 1.5, 2.0, 3.0],
    aoe: true, alwaysCrit: true, buff: { atk: 0.4, dur: 8 },
    cd: 25, mpCost: 270, costTier: 'heavy',
  },

  // ── 路線 B：靈契禦狐 ──
  'fox-mirage': {
    name: '狐影分身', tag: '召喚', kind: 'arcane', path: 'B',
    desc: '召喚雪狐分身：即發 80% + 持續 8 秒每秒 80% 攻擊力（合計 720%）。CD 10s。',
    mult: 0.8, summon: { dps: 0.8, dur: 8 }, cd: 10, mpCost: 90, costTier: 'light',
  },
  'frostfall': {
    name: '凝霜降臨', tag: '冰封', kind: 'frost', path: 'B',
    desc: '霜氣降下：250% 攻擊力 AOE 傷害 + 凍結敵人 2.5 秒（敵方停止行動）。CD 9s。',
    mult: 2.5, aoe: true, freeze: 2.5, cd: 9, mpCost: 90, costTier: 'light',
  },
  'mist-seal': {
    name: '白霧封印', tag: '弱化', kind: 'arcane', path: 'B', requireTier: 2,
    desc: '撕裂霧封印：450% 攻擊力，對 BOSS 額外 +80%（合計 810% vs BOSS）。CD 12s。',
    mult: 4.5, vsBossBonus: 0.8, cd: 12, mpCost: 180, costTier: 'medium',
  },
  'fox-god-descend': {
    name: '狐神降世', tag: '★大招★', kind: 'arcane', path: 'B', requireTier: 3,
    desc: '【終極奧義】九尾狐神降臨：即發 500% 攻擊力 AOE 傷害 + 持續 12 秒每秒 200% 攻擊力召喚（總 2900%）。對 BOSS 額外 +50%。CD 30s。',
    mult: 5.0, aoe: true, summon: { dps: 2.0, dur: 12 }, vsBossBonus: 0.5,
    cd: 30, mpCost: 270, costTier: 'heavy',
  },

};

// --------------------------------------------------------------------------
// 被動定義
// --------------------------------------------------------------------------
const PASSIVES = {
  'fox-eye':    { name: '狐眼',       desc: '暴擊 +5%、攻擊速度 +5%。',                 apply: s => { s.crit += 0.05; s.spd *= 1.05; } },
  'wind-seal':  { name: '疾風之印',   desc: '攻擊力 +10%（戰鬥中常駐生效）。',           apply: s => { s.atk *= 1.10; } },
  'pact-seal':  { name: '契約之印',   desc: '召喚物傷害 +50%。',                         apply: s => { s.summonMul = (s.summonMul || 1) * 1.5; } },
  'traceless':  { name: '無痕',       desc: '受到傷害 -15%。',                           apply: s => { s.dmgReduce = (s.dmgReduce || 0) + 0.15; } },
  'oracle':     { name: '神諭',       desc: '所有技能冷卻 -15%。',                       apply: s => { s.cdReduce = (s.cdReduce || 0) + 0.15; } },
  'silver-soul':{ name: '銀月之魂',   desc: '全屬性 +50%。',                             apply: s => { s.atk *= 1.5; s.def *= 1.5; s.hp *= 1.5; } },
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
        special: 'exp', baseTime: 35, expBase: 12000, goldBase: 500,
        difficultyMul: 1.4, dropMats: ['神鋼', '永晶', '星鋼'],
        enemies: ['幻影修者', '虛靈試煉者'], boss: '修行至尊（神格）' },
      { id: 'sp-mat', name: '材料神窟', cp: 18000, unlock: 'abyss-mirror', requiredLv: 99,
        special: 'mat', baseTime: 40, expBase: 600, goldBase: 6000,
        difficultyMul: 1.4, dropMats: ['神鋼', '永晶', '星鋼', '精鋼', '粗鋼'],
        bonusMengjingChance: 0.12,  // 額外 12% 機率掉夢晶 ×1（不吃任何加成）
        enemies: ['神鋼巨人', '永晶守衛'], boss: '神鋼巨像（神格）' },
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
        difficultyMul: 3.5,  // 敵人 HP / atk × 3.5
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
          { label: 'UR 武器', value: '永夜·狐神矛系列（3% 機率）', color: 'var(--hp-enemy)' },
        ],
        bossPortrait: 'assets/portraits/raid-calamity.png',
        enemies: ['虛影侍從（災厄）', '夢魘碎片（災厄）', '鏡面碎魂（災厄）', '逆世執事（災厄）'],
        boss: '災厄·虛影鏡之主宰' },
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
];
function findShardExchange(id) { return SHARD_EXCHANGE.find(s => s.id === id); }

// ===== 寶箱系統 =====
// 四階寶箱：木 / 銀 / 金 / 神格
// 開箱時 roll 3-5 件獎勵，每個 slot 從對應 pool 隨機抽
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
    desc: '中階寶箱，常有中型藥水與材料。',
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
const EQUIPMENT_SLOTS = ['weapon', 'head', 'top', 'bottom', 'feet'];
const SLOT_LABELS = { weapon: '武器', head: '頭', top: '上衣', bottom: '下衣', feet: '腳' };

const ITEMS = {
  materials: {
    '粗鋼': { tag: '材料', rarity: 'N',   icon: '◆' },
    '精鋼': { tag: '材料', rarity: 'R',   icon: '◆' },
    '星鋼': { tag: '材料', rarity: 'SR',  icon: '◆' },
    '神鋼': { tag: '材料', rarity: 'SSR', icon: '◆' },
    '永晶': { tag: '材料', rarity: 'SSR', icon: '◇' },
    '夢晶': { tag: '材料', rarity: 'UR',  icon: '◇' },
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
};
function findSet(id) { return SETS[id]; }

// 計算角色身上各套裝穿戴件數
function countSetPieces(cs) {
  const counts = {};
  if (!cs || !cs.equip) return counts;
  for (const slot of EQUIPMENT_SLOTS) {
    const instId = cs.equip[slot];
    if (!instId) continue;
    const inst = window.GAME_STATE && GAME_STATE.state.bag.equipment[instId];
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
const AFFIX_POOL = [
  { stat: 'atk',       label: '銳利',  min: 4,    max: 18,   integer: true },
  { stat: 'def',       label: '堅固',  min: 3,    max: 12,   integer: true },
  { stat: 'hp',        label: '強健',  min: 25,   max: 100,  integer: true },
  { stat: 'crit',      label: '靈巧',  min: 0.01, max: 0.04, integer: false },
  { stat: 'critDmg',   label: '凶險',  min: 0.05, max: 0.2,  integer: false },
  { stat: 'spd',       label: '迅捷',  min: 0.03, max: 0.10, integer: false },
  { stat: 'dmgReduce', label: '堅韌',  min: 0.01, max: 0.04, integer: false },
  { stat: 'skillDmg',  label: '兇猛',  min: 0.02, max: 0.08, integer: false },
];

function rollAffixes(rarity) {
  const counts = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4 };
  const n = counts[rarity] || 0;
  const pool = [...AFFIX_POOL];
  const picks = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const a = pool.splice(idx, 1)[0];
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
function forgeCost(level) {
  const goldCost = Math.floor(40 * Math.pow(1.55, level));
  let mat = '粗鋼', matCost = 1;
  if (level < 3)       { mat = '粗鋼'; matCost = 2 + level; }
  else if (level < 6)  { mat = '精鋼'; matCost = 2 + (level - 3); }
  else if (level < 10) { mat = '星鋼'; matCost = 2 + (level - 6); }
  else if (level < 13) { mat = '神鋼'; matCost = 2 + (level - 10); }
  else                 { mat = '夢晶'; matCost = 1 + (level - 13); }
  const successRate = Math.max(0.25, 1 - level * 0.05);
  return { goldCost, mat, matCost, successRate };
}
function forgeMultiplier(level) { return 1 + level * 0.12; }

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
  EQUIPMENT_SLOTS, SLOT_LABELS, AFFIX_POOL,
  MAX_LEVEL,
  forgeCost, forgeMultiplier, expForLevel, resonanceMultiplier,
  getRegionByDungeon, getDungeon, getCharacterBlueprint,
  rollAffixes, findEquipment, resolveFixedValue,
  findRecipe, findMaterialRecipe, findGem, socketsForRarity,
  findSet, countSetPieces,
  findPotion, findChest, rollChestRewards, findShardExchange,
  isMainStoryDungeon, getNextMainDungeon, getPrevMainDungeon,
};
