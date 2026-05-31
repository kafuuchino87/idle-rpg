// ===========================================================================
// 程序化角色渲染：高解析平滑繪製 → 下採樣 → 上採樣（像素風流水線）
// ===========================================================================
const PROC = {};
PROC._high = null;
PROC._small = null;

PROC._initCanvases = function() {
  if (!PROC._high) {
    PROC._high = document.createElement('canvas');
    PROC._high.width = 192;
    PROC._high.height = 288;
  }
  if (!PROC._small) {
    PROC._small = document.createElement('canvas');
    PROC._small.width = 64;
    PROC._small.height = 96;
  }
};

// 對外接口：把月凜畫到 ctx 上，(x, y) 是顯示左上角，drawW/drawH 是顯示尺寸
PROC.renderTsukirin = function(ctx, x, y, drawW, drawH, opts) {
  opts = opts || {};
  PROC._initCanvases();

  const hctx = PROC._high.getContext('2d');
  const sctx = PROC._small.getContext('2d');

  // 1. 高解析平滑繪製
  hctx.clearRect(0, 0, PROC._high.width, PROC._high.height);
  hctx.imageSmoothingEnabled = true;
  PROC._drawTsukirin(hctx, PROC._high.width, PROC._high.height, opts);

  // 2. 平滑下採樣（讓抗鋸齒邊緣壓進像素）
  sctx.clearRect(0, 0, PROC._small.width, PROC._small.height);
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(PROC._high, 0, 0, PROC._small.width, PROC._small.height);

  // 3. 用 nearest-neighbor 放大到目標尺寸（保持硬像素邊）
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(PROC._small, x, y, drawW, drawH);
};

// ============================================================================
// 月凜：原創設計，銀髮藍黑和服雪狐契約少女武者
// ============================================================================
PROC._drawTsukirin = function(ctx, W, H, opts) {
  const t = opts.tickMs || 0;
  const action = opts.action || 'idle';
  const foxMode = opts.foxMode || false;
  const tier = opts.tier || 0;
  const path = opts.path || null;

  // 配色（依路線變主色：A 維持原 silver/blue, B 偏紫青, C 偏紅金）
  const palette = PROC._paletteFor(path, tier, foxMode);

  // 動畫參數
  const idleBob = Math.sin(t * 0.003) * 1.5;
  const hairSwayL = Math.sin(t * 0.0025) * 3;
  const hairSwayR = Math.sin(t * 0.0025 + 0.8) * 3;
  const blink = (Math.floor(t / 3500) % 4 === 0 && (t % 3500) < 120) ? 0.2 : 1;
  const atk = opts.attackPhase || 0;       // 0~1
  const armSwing = Math.sin(atk * Math.PI);

  const cx = W / 2;
  const headY = 50 + idleBob;

  // ========== 雪狐光環（最底層） ==========
  if (foxMode) {
    const a = 0.4 + 0.2 * Math.sin(t * 0.005);
    ctx.globalAlpha = a;
    const grad = ctx.createRadialGradient(cx, 140, 20, cx, 140, 130);
    grad.addColorStop(0, palette.accent);
    grad.addColorStop(0.5, palette.accent + '88');
    grad.addColorStop(1, palette.accent + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // ========== 後層長髮 ==========
  ctx.fillStyle = palette.hairShade;
  ctx.beginPath();
  ctx.moveTo(cx - 32, headY + 5);
  ctx.bezierCurveTo(cx - 58, headY + 50, cx - 52 + hairSwayL, headY + 150, cx - 35 + hairSwayL, headY + 220);
  ctx.bezierCurveTo(cx - 25 + hairSwayL, headY + 240, cx - 10 + hairSwayL, headY + 245, cx, headY + 245);
  ctx.bezierCurveTo(cx + 10 + hairSwayR, headY + 245, cx + 25 + hairSwayR, headY + 240, cx + 35 + hairSwayR, headY + 220);
  ctx.bezierCurveTo(cx + 52 + hairSwayR, headY + 150, cx + 58, headY + 50, cx + 32, headY + 5);
  ctx.closePath();
  ctx.fill();

  // 後層高光髮絲
  ctx.fillStyle = palette.hair;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(cx - 42 + hairSwayL, headY + 100, 5, 35, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 42 + hairSwayR, headY + 100, 5, 35, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // ========== 下半身（袴 hakama） ==========
  // 主體
  ctx.fillStyle = palette.clothShade;
  ctx.beginPath();
  ctx.moveTo(cx - 28, 160 + idleBob);
  ctx.lineTo(cx + 28, 160 + idleBob);
  ctx.bezierCurveTo(cx + 35, 200, cx + 45, 230, cx + 46, 248);
  ctx.lineTo(cx - 46, 248);
  ctx.bezierCurveTo(cx - 45, 230, cx - 35, 200, cx - 28, 160 + idleBob);
  ctx.closePath();
  ctx.fill();

  // 中央摺
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, 168 + idleBob);
  ctx.lineTo(cx, 246);
  ctx.stroke();

  // 兩側深色摺
  ctx.strokeStyle = palette.cloth;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - 16, 170 + idleBob);
  ctx.lineTo(cx - 26, 246);
  ctx.moveTo(cx + 16, 170 + idleBob);
  ctx.lineTo(cx + 26, 246);
  ctx.stroke();

  // ========== 上半身（和服） ==========
  ctx.fillStyle = palette.cloth;
  ctx.beginPath();
  ctx.moveTo(cx - 30, 108 + idleBob);
  ctx.lineTo(cx + 30, 108 + idleBob);
  ctx.lineTo(cx + 32, 162 + idleBob);
  ctx.lineTo(cx - 32, 162 + idleBob);
  ctx.closePath();
  ctx.fill();

  // V 字領（白邊 + 深底）
  ctx.fillStyle = palette.cloth;
  ctx.beginPath();
  ctx.moveTo(cx - 16, 106 + idleBob);
  ctx.lineTo(cx, 134 + idleBob);
  ctx.lineTo(cx + 16, 106 + idleBob);
  ctx.lineTo(cx + 14, 108 + idleBob);
  ctx.lineTo(cx, 132 + idleBob);
  ctx.lineTo(cx - 14, 108 + idleBob);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.collarEdge;
  ctx.beginPath();
  ctx.moveTo(cx - 16, 106 + idleBob);
  ctx.lineTo(cx - 12, 110 + idleBob);
  ctx.lineTo(cx, 138 + idleBob);
  ctx.lineTo(cx + 12, 110 + idleBob);
  ctx.lineTo(cx + 16, 106 + idleBob);
  ctx.lineTo(cx + 14, 105 + idleBob);
  ctx.lineTo(cx, 130 + idleBob);
  ctx.lineTo(cx - 14, 105 + idleBob);
  ctx.closePath();
  ctx.fill();

  // ========== 腰帶 ==========
  ctx.fillStyle = palette.accentShade;
  ctx.fillRect(cx - 32, 148 + idleBob, 64, 18);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(cx - 32, 148 + idleBob, 64, 12);

  // 腰帶結
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.ellipse(cx, 156 + idleBob, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.accentShade;
  ctx.beginPath();
  ctx.ellipse(cx - 2, 159 + idleBob, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 腰帶垂帶
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.moveTo(cx - 8, 162 + idleBob);
  ctx.lineTo(cx - 12, 200);
  ctx.lineTo(cx - 6, 200);
  ctx.closePath();
  ctx.fill();

  // ========== 臉 ==========
  // 臉部基底
  ctx.fillStyle = palette.skin;
  ctx.beginPath();
  ctx.ellipse(cx, 80 + idleBob, 28, 34, 0, 0, Math.PI * 2);
  ctx.fill();

  // 臉部陰影
  ctx.fillStyle = palette.skinShade;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(cx + 10, 86 + idleBob, 14, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // ========== 前髮 ==========
  ctx.fillStyle = palette.hair;
  ctx.beginPath();
  ctx.moveTo(cx - 32, headY + 35);
  ctx.bezierCurveTo(cx - 40, headY - 8, cx - 20, headY - 20, cx, headY - 22);
  ctx.bezierCurveTo(cx + 20, headY - 20, cx + 40, headY - 8, cx + 32, headY + 35);
  ctx.lineTo(cx + 32, headY + 48);
  ctx.bezierCurveTo(cx + 30, headY + 60, cx + 22, headY + 58, cx + 20, headY + 50);
  ctx.bezierCurveTo(cx + 14, headY + 38, cx + 4, headY + 36, cx, headY + 28);
  ctx.bezierCurveTo(cx - 4, headY + 36, cx - 14, headY + 38, cx - 20, headY + 50);
  ctx.bezierCurveTo(cx - 22, headY + 58, cx - 30, headY + 60, cx - 32, headY + 48);
  ctx.closePath();
  ctx.fill();

  // 髮頂高光
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.ellipse(cx - 8, headY + 0, 7, 14, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 右側髮絲
  ctx.fillStyle = palette.hairShade;
  ctx.beginPath();
  ctx.moveTo(cx + 26, headY + 36);
  ctx.bezierCurveTo(cx + 32, headY + 55, cx + 30, headY + 78, cx + 26, headY + 95);
  ctx.lineTo(cx + 20, headY + 92);
  ctx.bezierCurveTo(cx + 24, headY + 70, cx + 22, headY + 55, cx + 20, headY + 38);
  ctx.closePath();
  ctx.fill();

  // 左側髮絲
  ctx.beginPath();
  ctx.moveTo(cx - 26, headY + 36);
  ctx.bezierCurveTo(cx - 32, headY + 55, cx - 30, headY + 78, cx - 26, headY + 95);
  ctx.lineTo(cx - 20, headY + 92);
  ctx.bezierCurveTo(cx - 24, headY + 70, cx - 22, headY + 55, cx - 20, headY + 38);
  ctx.closePath();
  ctx.fill();

  // ========== 五官 ==========
  const eyeY = 86 + idleBob;
  const eyeOpenH = 7 * blink;

  // 眼線外框
  ctx.fillStyle = palette.outline;
  ctx.fillRect(cx - 17, eyeY - eyeOpenH/2, 10, eyeOpenH);
  ctx.fillRect(cx + 7, eyeY - eyeOpenH/2, 10, eyeOpenH);

  if (blink > 0.5) {
    // 虹膜
    ctx.fillStyle = palette.eye;
    ctx.fillRect(cx - 15, eyeY - 2, 6, 5);
    ctx.fillRect(cx + 9, eyeY - 2, 6, 5);

    // 高光
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 13, eyeY - 2, 2, 2);
    ctx.fillRect(cx + 11, eyeY - 2, 2, 2);
  }

  // 眉
  ctx.fillStyle = palette.hairOutline;
  ctx.fillRect(cx - 17, 76 + idleBob, 11, 2);
  ctx.fillRect(cx + 6, 76 + idleBob, 11, 2);

  // 嘴
  ctx.fillStyle = palette.lip;
  ctx.fillRect(cx - 3, 100 + idleBob, 6, 2);

  // 腮紅
  ctx.fillStyle = palette.lip;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.ellipse(cx - 18, 93 + idleBob, 5, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 18, 93 + idleBob, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // ========== 雙臂 ==========
  // 右臂（持矛，會揮）
  const shR = { x: cx - 26, y: 115 + idleBob };
  const angleR_base = Math.PI * 0.45;
  const angleR = angleR_base - armSwing * Math.PI * 0.55;
  const armLen = 50;
  const handR = {
    x: shR.x + Math.cos(angleR) * armLen,
    y: shR.y + Math.sin(angleR) * armLen,
  };

  // 袖（袴外袖）
  ctx.strokeStyle = palette.cloth;
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shR.x, shR.y);
  ctx.lineTo(handR.x, handR.y);
  ctx.stroke();

  // 袖高光
  ctx.strokeStyle = palette.clothHi;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(shR.x - 2, shR.y - 2);
  ctx.lineTo(handR.x - 3, handR.y - 2);
  ctx.stroke();

  // 手
  ctx.fillStyle = palette.skin;
  ctx.beginPath();
  ctx.arc(handR.x, handR.y, 6, 0, Math.PI * 2);
  ctx.fill();

  // 左臂（自然放下）
  ctx.strokeStyle = palette.cloth;
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(cx + 26, 115 + idleBob);
  ctx.lineTo(cx + 36, 162 + idleBob);
  ctx.stroke();
  ctx.strokeStyle = palette.clothHi;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx + 26 - 2, 115 + idleBob);
  ctx.lineTo(cx + 36 - 2, 162 + idleBob);
  ctx.stroke();
  ctx.fillStyle = palette.skin;
  ctx.beginPath();
  ctx.arc(cx + 36, 165 + idleBob, 6, 0, Math.PI * 2);
  ctx.fill();

  // ========== 銀月矛 ==========
  const spearAngle = angleR - Math.PI / 2;
  const spearFwdLen = 140;
  const spearBackLen = 28;
  const tip = {
    x: handR.x + Math.cos(spearAngle) * spearFwdLen,
    y: handR.y + Math.sin(spearAngle) * spearFwdLen,
  };
  const butt = {
    x: handR.x - Math.cos(spearAngle) * spearBackLen,
    y: handR.y - Math.sin(spearAngle) * spearBackLen,
  };

  // 矛桿（深底 + 淺面）
  ctx.strokeStyle = palette.spearDark;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(butt.x, butt.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

  ctx.strokeStyle = palette.spear;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(butt.x, butt.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

  // 矛尖
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(spearAngle);
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(2, -9);
  ctx.lineTo(-4, 0);
  ctx.lineTo(2, 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.accentShade;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(2, -5);
  ctx.lineTo(-2, 0);
  ctx.lineTo(2, 5);
  ctx.closePath();
  ctx.fill();
  // 矛刃中線高光
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, -1, 18, 2);
  ctx.restore();

  // 握把纏帶
  ctx.strokeStyle = palette.accentShade;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(handR.x - Math.cos(spearAngle) * 4, handR.y - Math.sin(spearAngle) * 4);
  ctx.lineTo(handR.x + Math.cos(spearAngle) * 14, handR.y + Math.sin(spearAngle) * 14);
  ctx.stroke();

  // ========== 攻擊光跡 ==========
  if (atk > 0.05 && atk < 0.9) {
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.4 * (1 - Math.abs(atk - 0.5) * 2);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(shR.x + 20, shR.y + 30, 80, angleR_base - Math.PI * 0.5, angleR_base + Math.PI * 0.2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ========== 足袋 ==========
  ctx.fillStyle = palette.tabi;
  ctx.fillRect(cx - 26, 250, 18, 13);
  ctx.fillRect(cx + 8, 250, 18, 13);
  ctx.fillStyle = palette.outline;
  ctx.fillRect(cx - 26, 261, 18, 2);
  ctx.fillRect(cx + 8, 261, 18, 2);
};

// ============================================================================
// 配色：依路線變主色（A 雪藍、B 月紫、C 朱紅金）
// ============================================================================
PROC._paletteFor = function(path, tier, foxMode) {
  // 基底（A 路線 / 一階弟子預設）
  let accent = '#7fd9ff', accentShade = '#3a8ec0';
  let cloth = '#1a1f33', clothShade = '#0a0e1f', clothHi = '#2e3658';

  if (path === 'B') {
    accent = '#c084ff'; accentShade = '#6a3aaf';
    cloth = '#231a33'; clothShade = '#120a1f'; clothHi = '#3a2858';
  } else if (path === 'C') {
    accent = '#ffd66e'; accentShade = '#b07a1a';
    cloth = '#331a1a'; clothShade = '#1a0a0a'; clothHi = '#582828';
  }

  // 三轉時加更鮮豔重色
  if (tier >= 3) {
    accent = brighten(accent, 1.15);
  }

  return {
    skin: '#f0d8be',
    skinShade: '#c8a888',
    hair: foxMode ? '#ffffff' : '#dde0ea',
    hairShade: foxMode ? '#b0d0e8' : '#8a92ad',
    hairOutline: '#5a607a',
    cloth, clothShade, clothHi,
    accent, accentShade,
    collarEdge: '#e8ebf2',
    outline: '#0a0a14',
    eye: '#3a5c9e',
    lip: '#a86268',
    spear: '#c0c4d0',
    spearDark: '#5a5e72',
    tabi: '#f8f8ff',
  };
};

function brighten(hex, factor) {
  const r = Math.min(255, Math.floor(parseInt(hex.slice(1, 3), 16) * factor));
  const g = Math.min(255, Math.floor(parseInt(hex.slice(3, 5), 16) * factor));
  const b = Math.min(255, Math.floor(parseInt(hex.slice(5, 7), 16) * factor));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

window.PROC = PROC;
