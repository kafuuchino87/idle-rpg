// ===========================================================================
// 像素渲染器：用 Canvas 畫角色、怪物、技能特效
// ===========================================================================
const PIX = {};
PIX.canvas = null;
PIX.ctx = null;
PIX.W = 640;
PIX.H = 240;
PIX.SCALE = 4;
PIX.tick = 0;
PIX.fx = [];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function seededRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// ============================================================================
// 月凜 sprite（20 寬 x 32 高，原創設計：銀髮、黑藍和服、銀月矛）
// k = 線稿黑、s = 膚、h = 髮(銀)、c = 衣(黑藍)、a = 強調(雪藍)
// ============================================================================
const SPRITE_TSUKIRIN = [
  '........kkkk........',
  '......khhhhhhhk.....',
  '.....khhhhhhhhhk....',
  '....khhhhhhhhhhhk...',
  '....khhhssssshhhhk..',
  '...khhssssssssshhk..',
  '...khsssssssssssh...',
  '...khsskk.ss.kkssh..',
  '...khsskk.ss.kkssh..',
  '...khssss.kk.ssssh..',
  '...khsssss..ssssh...',
  '....khssskkkksssh...',
  '....khsssssssssh....',
  '.....khhsssssshk....',
  '......khaaaaahk.....',
  '.....khcaaaaaack....',
  '....akhcccccccchka..',
  '...akhccccccccccchka',
  '..akhccaaaaaaaaccchk',
  '..akhcaaaccaaaaccchk',
  '..akhcaaaccaaaaccchk',
  '..akhccaaaaaaaaccchk',
  '..akhcccccccccccchka',
  '..akhcccccccccccchka',
  '...akcccccccccccka..',
  '...akcccccccccccka..',
  '....akccccccccccka..',
  '....akccccccccccka..',
  '....akccccccccccka..',
  '....akccccccccccka..',
  '.....kassssssssak...',
  '.....k.kk....kk.k...',
];

// 銀月矛（小型，顯示於立繪旁）
const SPEAR_SPRITE = [
  '..k.',
  '.kak',
  '.aak',
  '.akk',
  '.akk',
  '.akk',
  '.akk',
  '.aak',
  '.kak',
  '..k.',
  '..k.',
  '..k.',
  '..k.',
  '..k.',
  '..k.',
  '..k.',
];

const WEAPON_SPRITES = {
  tsukirin: SPEAR_SPRITE,
};

// ============================================================================
// SVG 立繪生成（給左欄與創角畫面）
// ============================================================================
function spriteToSvg(sprite, palette, weaponSprite, opts) {
  opts = opts || {};
  const W = sprite[0].length, H = sprite.length;
  const padR = weaponSprite ? 8 : 4;
  const cell = 6;
  const cw = (W + padR + 4) * cell, ch = H * cell + 12;

  let cells = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = sprite[y][x];
      const color = paletteColor(c, palette);
      if (color) cells += `<rect x="${(x + 4) * cell}" y="${y * cell + 6}" width="${cell}" height="${cell}" fill="${color}"/>`;
    }
  }
  if (weaponSprite) {
    const ww = weaponSprite[0].length, wh = weaponSprite.length;
    const ox = (W + 4) * cell - 4, oy = 30;
    for (let y = 0; y < wh; y++) {
      for (let x = 0; x < ww; x++) {
        const c = weaponSprite[y][x];
        const color = paletteColor(c, palette);
        if (color) cells += `<rect x="${ox + x * cell}" y="${oy + y * cell}" width="${cell}" height="${cell}" fill="${color}"/>`;
      }
    }
  }
  const bg = palette.bg || '#0a0c18';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cw} ${ch}" style="image-rendering:pixelated">
    <rect width="100%" height="100%" fill="${bg}"/>
    ${cells}
  </svg>`;
}

function paletteColor(c, palette) {
  switch (c) {
    case '.': return null;
    case 'k': return '#0a0a14';
    case 's': return palette.skin;
    case 'h': return palette.hair;
    case 'c': return palette.cloth;
    case 'a': return palette.accent;
    default:  return null;
  }
}

function getCharSprite(charId) {
  if (charId === 'tsukirin') return SPRITE_TSUKIRIN;
  return SPRITE_TSUKIRIN;
}

window.PIXEL_PORTRAIT = function(charId, bgGradient) {
  const cs = (window.GAME_STATE && GAME_STATE.state.characters || {})[charId];
  const bpId = cs ? cs.blueprintId : charId;
  const bp = GAME_STATE.getCharacterBlueprint(bpId);
  const pal = { ...bp.palette, bg: bgGradient ? '#0a0c18' : '#161a2d' };
  return spriteToSvg(getCharSprite(bpId), pal, WEAPON_SPRITES[bpId]);
};

// 立繪去背 + 快取
const PORTRAIT_DATAURL_CACHE = {};
function ensurePortraitProcessed(path, callback) {
  const cached = PORTRAIT_DATAURL_CACHE[path];
  if (cached === 'loading') { setTimeout(() => ensurePortraitProcessed(path, callback), 100); return; }
  if (cached !== undefined) { callback(cached); return; }
  PORTRAIT_DATAURL_CACHE[path] = 'loading';
  const img = new Image();
  img.onload = () => {
    try {
      const canvas = removeBackgroundFloodFill(img, 35);
      const url = canvas.toDataURL('image/png');
      PORTRAIT_DATAURL_CACHE[path] = url;
      callback(url);
    } catch (e) {
      console.warn('portrait bg removal failed', e);
      PORTRAIT_DATAURL_CACHE[path] = path;  // 退回原圖
      callback(path);
    }
  };
  img.onerror = () => {
    // 載入失敗（如 server 暫時無回應）→ 不快取 null，下次重試
    delete PORTRAIT_DATAURL_CACHE[path];
    callback(null);
  };
  img.src = path;
}

// 對外：載入外部 PNG 立繪，自動去背，失敗時退回 SVG 像素圖
window.CHAR_PORTRAIT = function(charId, opts) {
  opts = opts || {};
  const cs = (window.GAME_STATE && GAME_STATE.state.characters || {})[charId];
  const bpId = cs ? cs.blueprintId : (charId || '').split('#')[0];
  let tierKey = 'base';
  // opts.forceBase = true 時強制顯示初始形態（如創角畫面），不抓現有角色的進化形態
  // opts.tierKey 顯式指定（如多人連線時取得隊友的 jobPath/jobTier）
  if (opts.tierKey) tierKey = opts.tierKey;
  else if (!opts.forceBase && cs && cs.jobPath && cs.jobTier > 0) tierKey = `${cs.jobPath}${cs.jobTier}`;
  const path = `assets/portraits/${bpId}-${tierKey}.png`;
  // 載入中佔位（純色塊，不再顯示手繪像素圖）
  const bg = opts.bg ? '#0a0c18' : '#161a2d';
  const placeholder = `<div style="width:100%;height:100%;background:${bg};display:flex;align-items:center;justify-content:center;color:#5a6080;font-size:11px;letter-spacing:2px;">…</div>`;
  const uid = 'cp_' + Math.random().toString(36).slice(2);

  setTimeout(() => {
    ensurePortraitProcessed(path, (url) => {
      const wrap = document.getElementById(uid);
      if (!wrap) return;
      if (url) wrap.innerHTML = `<img class="char-img" src="${url}" alt="${charId}">`;
    });
  }, 0);

  return `<div id="${uid}" class="char-portrait-wrap" style="width:100%;height:100%">${placeholder}</div>`;
};

// ============================================================================
// 自動去背：四角採樣 → 邊緣 flood fill，把連通背景變透明
// ============================================================================
function removeBackgroundFloodFill(img, threshold) {
  threshold = threshold !== undefined ? threshold : 35;
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;

  const pix = (x, y) => {
    const idx = (y * W + x) * 4;
    return [data[idx], data[idx+1], data[idx+2], data[idx+3]];
  };

  // 採樣四角 + 四邊中點
  const sampleCoords = [
    [0, 0], [W-1, 0], [0, H-1], [W-1, H-1],
    [Math.floor(W/2), 0], [Math.floor(W/2), H-1],
    [0, Math.floor(H/2)], [W-1, Math.floor(H/2)],
  ];
  const rawSamples = sampleCoords.map(([x, y]) => pix(x, y));
  // 已透明的像素跳過（已有 alpha 通道圖直接放行）
  const opaqueSamples = rawSamples.filter(s => s[3] > 240);
  if (opaqueSamples.length === 0) {
    return canvas;  // 已是透明圖，不處理
  }

  // 去掉重複相似的樣本（保留不同色）
  const bgColors = [];
  for (const s of opaqueSamples) {
    let dup = false;
    for (const b of bgColors) {
      if (Math.abs(s[0]-b[0]) + Math.abs(s[1]-b[1]) + Math.abs(s[2]-b[2]) < 30) { dup = true; break; }
    }
    if (!dup) bgColors.push(s);
  }

  function isBg(r, g, b) {
    for (const [br, bg, bb] of bgColors) {
      if (Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb) < threshold) return true;
    }
    return false;
  }

  const visited = new Uint8Array(W * H);
  const stack = [];
  function tryQueue(x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = y * W + x;
    if (visited[i]) return;
    const idx = i * 4;
    if (!isBg(data[idx], data[idx+1], data[idx+2])) return;
    visited[i] = 1;
    stack.push(x, y);
  }
  for (let x = 0; x < W; x++) { tryQueue(x, 0); tryQueue(x, H-1); }
  for (let y = 0; y < H; y++) { tryQueue(0, y); tryQueue(W-1, y); }
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    data[(y * W + x) * 4 + 3] = 0;
    tryQueue(x-1, y);
    tryQueue(x+1, y);
    tryQueue(x, y-1);
    tryQueue(x, y+1);
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// ============================================================================
// 戰鬥用圖片快取
// 優先序：assets/sprites/{key}.png（純像素風）→ assets/portraits/{key}.png（立繪風）
// 立繪會自動開啟平滑縮放（保留插畫質感），sprite 則用 nearest-neighbor
// ============================================================================
const SPRITE_IMG_CACHE = {};

function getCharSpriteImage(charId, cs) {
  let tierKey = 'base';
  if (cs && cs.jobPath && cs.jobTier > 0) tierKey = `${cs.jobPath}${cs.jobTier}`;
  const key = `${charId}-${tierKey}`;

  if (SPRITE_IMG_CACHE[key] === undefined) {
    SPRITE_IMG_CACHE[key] = { state: 'loading' };
    const tryLoad = (path, smooth, onFail) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = removeBackgroundFloodFill(img, 50);
          SPRITE_IMG_CACHE[key] = { img: canvas, smooth, state: 'ok' };
        } catch (e) {
          SPRITE_IMG_CACHE[key] = { img, smooth, state: 'ok' };
        }
      };
      img.onerror = () => { if (onFail) onFail(); else SPRITE_IMG_CACHE[key] = { state: 'fail' }; };
      img.src = path;
    };
    // 先試 sprite，失敗才退回 portrait
    tryLoad(`assets/sprites/${key}.png`, false, () => {
      tryLoad(`assets/portraits/${key}.png`, true);
    });
  }
  return SPRITE_IMG_CACHE[key];
}

// ============================================================================
// 戰鬥畫面（Canvas）
// ============================================================================
PIX.init = function() {
  PIX.canvas = document.getElementById('battleCanvas');
  if (!PIX.canvas) return;
  PIX.ctx = PIX.canvas.getContext('2d');
  PIX.ctx.imageSmoothingEnabled = false;
  requestAnimationFrame(PIX.loop);
};

PIX.loop = function() {
  PIX.tick++;
  PIX.draw();
  requestAnimationFrame(PIX.loop);
};

PIX.currentScene = {
  regionId: 'lumen',
  charId: 'tsukirin',
  enemyName: null,
  enemyShake: 0,
  playerAttack: 0,
  foxMode: false,    // 狐覺形態（Lv50 後切換用）
};

PIX.setScene = function(opts) {
  Object.assign(PIX.currentScene, opts);
};

PIX.spawnFx = function(type, x, y, color) {
  PIX.fx.push({ type, x, y, color, life: 24, max: 24 });
};

PIX.draw = function() {
  if (!PIX.ctx) return;
  const ctx = PIX.ctx;
  const region = GAME_DATA.REGIONS.find(r => r.id === PIX.currentScene.regionId) || GAME_DATA.REGIONS[0];

  ctx.clearRect(0, 0, PIX.W, PIX.H);

  const grd = ctx.createLinearGradient(0, 0, 0, PIX.H * 0.6);
  grd.addColorStop(0, region.palette.sky);
  grd.addColorStop(1, shadeColor(region.palette.sky, -20));
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, PIX.W, PIX.H * 0.65);

  drawMountains(ctx, region.palette.sky);

  ctx.fillStyle = region.palette.ground;
  ctx.fillRect(0, PIX.H * 0.65, PIX.W, PIX.H * 0.35);
  ctx.fillStyle = shadeColor(region.palette.ground, -15);
  for (let i = 0; i < 30; i++) {
    const x = (i * 23) % PIX.W;
    ctx.fillRect(x, PIX.H * 0.7 + (i * 13) % 50, 4, 2);
  }
  ctx.fillStyle = shadeColor(region.palette.ground, 15);
  ctx.fillRect(0, PIX.H * 0.65, PIX.W, 2);

  // 玩家
  const playerX = 80;
  const playerY = PIX.H * 0.65 - 128;
  // 從 charId 推 blueprint id（去掉 #2 / #3 之類 slot 後綴）
  const sceneBpId = (PIX.currentScene.charId || '').split('#')[0] || 'tsukirin';
  const bp = GAME_STATE.getCharacterBlueprint(sceneBpId);
  const lunge = PIX.currentScene.playerAttack > 0 ? Math.sin((1 - PIX.currentScene.playerAttack / 12) * Math.PI) * 14 : 0;
  let palette = bp.palette;
  if (PIX.currentScene.foxMode) {
    palette = { ...palette, hair: '#ffffff', accent: '#aef2ff' };
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(PIX.tick * 0.2);
    ctx.fillStyle = '#aef2ff';
    ctx.beginPath();
    ctx.arc(playerX + 40 + lunge, playerY + 64, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 優先序：外部圖（sprite 或 portrait）→ 程序化渲染（PROC）→ 手繪 sprite
  const cs = (window.GAME_STATE && GAME_STATE.state.characters || {})[PIX.currentScene.charId];
  const entry = getCharSpriteImage(PIX.currentScene.charId, cs);
  const battleImg = entry && entry.state === 'ok' ? entry.img : null;
  const intrW = battleImg ? (battleImg.naturalWidth || battleImg.width || 0) : 0;
  const intrH = battleImg ? (battleImg.naturalHeight || battleImg.height || 0) : 0;

  if (battleImg && intrW > 0 && intrH > 0) {
    const targetH = entry.smooth ? 152 : 160;   // 立繪略小一些
    const ratio = targetH / intrH;
    const targetW = intrW * ratio;

    // 呼吸縮放（±1.5% 慢循環）
    const breath = 1 + Math.sin(PIX.tick * 0.04) * 0.015;
    const sH = targetH * breath;
    const sW = targetW * breath;

    // 受擊抖動
    const shakeAmp = PIX.currentScene.playerShake || 0;
    const shakeX = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp * 2 : 0;

    const cxAnchor = playerX + 40 + lunge + shakeX;
    const groundY = PIX.H * 0.65;
    const drawX = cxAnchor - sW / 2;
    const drawY = groundY - sH;

    // 角色腳下橢圓陰影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(playerX + 40 + lunge, groundY + 4, sW * 0.22, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 角色本體
    ctx.imageSmoothingEnabled = entry.smooth;
    ctx.imageSmoothingQuality = entry.smooth ? 'high' : 'low';
    ctx.drawImage(battleImg, drawX, drawY, sW, sH);
    ctx.imageSmoothingEnabled = false;

    // 抖動衰減
    if (shakeAmp > 0) PIX.currentScene.playerShake = Math.max(0, shakeAmp - 0.5);
  } else if (PIX.currentScene.charId === 'tsukirin' && typeof PROC !== 'undefined') {
    const drawW = 128, drawH = 192;
    const drawX = playerX + lunge + 40 - drawW / 2;
    const drawY = PIX.H * 0.65 - drawH + 8;
    const attackPhase = PIX.currentScene.playerAttack > 0
      ? 1 - PIX.currentScene.playerAttack / 14
      : 0;
    PROC.renderTsukirin(ctx, drawX, drawY, drawW, drawH, {
      tickMs: PIX.tick * 16.67,
      action: PIX.currentScene.playerAttack > 0 ? 'attack' : 'idle',
      attackPhase,
      foxMode: PIX.currentScene.foxMode,
      tier: cs ? cs.jobTier : 0,
      path: cs ? cs.jobPath : null,
    });
  } else {
    drawPixelSprite(ctx, getCharSprite(PIX.currentScene.charId), playerX + lunge, playerY, 4, palette);
  }

  // 怪
  if (PIX.currentScene.enemyName) {
    const enemyX = PIX.W - 200;
    const enemyY = PIX.H * 0.65 - 80;
    const shake = PIX.currentScene.enemyShake > 0 ? (Math.sin(PIX.tick * 0.8) * PIX.currentScene.enemyShake) : 0;
    const enemySprite = generateEnemySprite(PIX.currentScene.enemyName);
    drawPixelSprite(ctx, enemySprite.shape, enemyX + shake, enemyY, 4, enemySprite.palette);
  }

  if (PIX.currentScene.enemyShake > 0) PIX.currentScene.enemyShake -= 0.4;
  if (PIX.currentScene.playerAttack > 0) PIX.currentScene.playerAttack -= 1;

  PIX.fx = PIX.fx.filter(fx => {
    fx.life--;
    drawFx(ctx, fx);
    return fx.life > 0;
  });
};

function drawPixelSprite(ctx, sprite, x, y, scale, palette) {
  for (let dy = 0; dy < sprite.length; dy++) {
    const row = sprite[dy];
    for (let dx = 0; dx < row.length; dx++) {
      const c = row[dx];
      const color = paletteColor(c, palette);
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x + dx * scale, y + dy * scale, scale, scale);
      }
    }
  }
}

function drawMountains(ctx, skyColor) {
  ctx.fillStyle = shadeColor(skyColor, -35);
  ctx.beginPath();
  ctx.moveTo(0, PIX.H * 0.55);
  for (let i = 0; i < 7; i++) {
    const x = (i / 6) * PIX.W;
    const peak = PIX.H * 0.55 - 20 - (i % 2) * 25;
    ctx.lineTo(x - PIX.W / 12, peak + 10);
    ctx.lineTo(x, peak);
  }
  ctx.lineTo(PIX.W, PIX.H * 0.65);
  ctx.lineTo(0, PIX.H * 0.65);
  ctx.closePath();
  ctx.fill();
}

function drawFx(ctx, fx) {
  const t = fx.life / fx.max;
  ctx.globalAlpha = Math.max(0, t);
  if (fx.type === 'slash') {
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 3;
    const r = (1 - t) * 40 + 10;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, r, -0.6, 2.2);
    ctx.stroke();
  } else if (fx.type === 'burst') {
    for (let i = 0; i < 8; i++) {
      const ang = i * Math.PI / 4;
      const d = (1 - t) * 28 + 4;
      ctx.fillStyle = fx.color;
      ctx.fillRect(fx.x + Math.cos(ang) * d - 2, fx.y + Math.sin(ang) * d - 2, 4, 4);
    }
  } else if (fx.type === 'wave') {
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const r = (1 - t) * 50;
    ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
    ctx.stroke();
  } else if (fx.type === 'crit') {
    ctx.fillStyle = fx.color;
    ctx.font = 'bold 16px Consolas';
    const lift = (1 - t) * 24;
    ctx.fillText('CRIT!', fx.x - 18, fx.y - lift);
  } else if (fx.type === 'spark') {
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + PIX.tick * 0.3;
      const d = (1 - t) * 16;
      ctx.fillStyle = fx.color;
      ctx.fillRect(fx.x + Math.cos(ang) * d, fx.y + Math.sin(ang) * d, 3, 3);
    }
  } else if (fx.type === 'frost') {
    for (let i = 0; i < 6; i++) {
      const ang = i * Math.PI / 3 + PIX.tick * 0.1;
      const d = (1 - t) * 24 + 4;
      ctx.fillStyle = fx.color;
      ctx.fillRect(fx.x + Math.cos(ang) * d - 1, fx.y + Math.sin(ang) * d - 1, 3, 3);
    }
  }
  ctx.globalAlpha = 1;
}

function generateEnemySprite(name) {
  const seed = hashStr(name);
  const rng = seededRng(seed);
  const palettes = [
    { skin: '#6a4628', hair: '#3a2614', cloth: '#5a2828', accent: '#d04848' },
    { skin: '#7a8c6a', hair: '#2a3a1a', cloth: '#3a4a2a', accent: '#88c83a' },
    { skin: '#8888a8', hair: '#3a3a4a', cloth: '#4a4a6a', accent: '#a0b8ff' },
    { skin: '#9a6a4a', hair: '#4a2a1a', cloth: '#6a3a2a', accent: '#ffb060' },
    { skin: '#aa8888', hair: '#5a3a3a', cloth: '#6a4a4a', accent: '#ff80a0' },
    { skin: '#7a6a8a', hair: '#3a2a4a', cloth: '#4a3a5a', accent: '#a070ff' },
  ];
  const palette = palettes[seed % palettes.length];
  const W = 14, H = 18;
  const shape = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W / 2; x++) {
      const r = rng();
      let c = '.';
      if (y < 3) c = (r > 0.65 && x > 0) ? 'k' : '.';
      else if (y < 6) c = r > 0.45 ? 'h' : (r > 0.2 ? 'k' : '.');
      else if (y < 9) c = r > 0.35 ? 's' : (r > 0.15 ? 'k' : '.');
      else if (y < 13) c = r > 0.3 ? 'c' : (r > 0.1 ? 'a' : '.');
      else if (y < 16) c = r > 0.4 ? 'c' : 'k';
      else c = r > 0.6 ? 'k' : '.';
      row += c;
    }
    row = row + row.split('').reverse().join('');
    shape.push(row);
  }
  shape[0] = '.'.repeat(W);
  shape[1] = '.'.repeat(W);
  return { shape, palette };
}

function shadeColor(hex, percent) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const k = 1 + percent / 100;
  const clamp = v => Math.max(0, Math.min(255, Math.floor(v * k)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// BOSS 立繪映射：怪物名稱 → 圖檔路徑
// 命中時用 <img> 取代程序化像素 sprite
const ENEMY_PORTRAITS = {
  '災厄·虛影鏡之主宰': 'assets/portraits/raid-calamity.png',
};

// 對外：把怪物像素圖渲染成 canvas（給卡片式戰鬥用）
window.renderEnemyPortrait = function(name, size) {
  size = size || 140;
  // 優先使用真實立繪：撐滿整個卡片框
  if (ENEMY_PORTRAITS[name]) {
    const wrapper = document.createElement('div');
    wrapper.className = 'boss-portrait';
    wrapper.style.cssText = `width:100%;height:100%;position:relative;background:radial-gradient(circle at 50% 60%, rgba(120,30,80,0.45), #08091a 75%);overflow:hidden`;
    const img = document.createElement('img');
    img.src = ENEMY_PORTRAITS[name];
    img.alt = name;
    img.className = 'char-img';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;object-position:center 20%;filter:drop-shadow(0 0 14px rgba(180,80,255,0.7))';
    wrapper.appendChild(img);
    return wrapper;
  }
  const sprite = generateEnemySprite(name);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // 漸層底
  const bg = ctx.createRadialGradient(size/2, size/2, 10, size/2, size/2, size/1.4);
  bg.addColorStop(0, sprite.palette.cloth);
  bg.addColorStop(1, '#08091a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // 怪物 sprite 14x18，放大置中
  const cell = Math.floor(Math.min(size / 16, size / 20));
  const sw = sprite.shape[0].length * cell;
  const sh = sprite.shape.length * cell;
  const ox = (size - sw) / 2;
  const oy = (size - sh) / 2 + cell;
  for (let y = 0; y < sprite.shape.length; y++) {
    for (let x = 0; x < sprite.shape[y].length; x++) {
      const c = sprite.shape[y][x];
      const color = paletteColor(c, sprite.palette);
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      }
    }
  }
  return canvas;
};

window.PIXEL = PIX;
