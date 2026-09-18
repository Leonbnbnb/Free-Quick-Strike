// ==================== 常量与配置 ====================
let W = 450, H = 800;               // 屏幕（视口）逻辑尺寸，默认竖屏 9:16，可切换横屏 16:9
const WORLD = { w: 1000, h: 2400 };   // 扩大后的世界尺寸

const CFG = {
  soldierCount: 1,     // 初始小兵数量
  soldierMaxHp: 100,   // 小兵初始生命
  moveSpeed: 240,      // 部队基础移速
  healAmount: 0.4,     // 医疗包回复比例
  pickupBase: 180,     // 基础拾取（磁吸）范围
  shieldRegenDelay: 3, // 破盾后恢复延迟（秒）
  shieldRegenRate: 10, // 护盾恢复速率（每秒）
};

const S = {
  soldierR: 14,
  spacing: 32, // 小兵编队间距
};

// ==================== 角色外观（首页预览与局内共用） ====================
const CHAR_FUR = [
  { name: '天蓝', color: '#4da3ff', dark: '#2c6bb0' },
  { name: '烈焰', color: '#ff6b6b', dark: '#c0392b' },
  { name: '青草', color: '#5fd07a', dark: '#2e8b4f' },
  { name: '暖阳', color: '#ffd166', dark: '#c9a227' },
  { name: '幻紫', color: '#b07cf0', dark: '#7d4fc0' },
  { name: '暗影', color: '#5a5a6e', dark: '#33333f' },
];

const CHAR_CLOTH = [
  { name: '战术蓝', color: '#3a7bd5' },
  { name: '暗红', color: '#c0392b' },
  { name: '军绿', color: '#4a7c3f' },
  { name: '沙黄', color: '#d4a017' },
  { name: '雪白', color: '#e8e8e8' },
  { name: '夜黑', color: '#22222a' },
];

const CHAR_HAT = [{ name: '无' }, { name: '头盔' }, { name: '头巾' }, { name: '皇冠' }, { name: '尖角' }];

const CHAR_EYE = [
  { name: '湛蓝', color: '#2c6bb0' },
  { name: '猩红', color: '#c0392b' },
  { name: '翠绿', color: '#2e8b4f' },
  { name: '赤金', color: '#d4a017' },
];

const CHAR_SIZE = [
  { name: '小巧', scale: 0.85 },
  { name: '标准', scale: 1 },
  { name: '魁梧', scale: 1.18 },
];

function charScale() { return (CHAR_SIZE[meta.character.size] || CHAR_SIZE[1]).scale; }
function charRadius() { return S.soldierR * charScale(); }
function playerName() { return currentUser || '玩家'; }

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 宠物模型：龙蛋（蛋形躯体 + 小翼 + 角 + 尾焰）与火焰精灵（炽核 + 环绕火舌）
// 局内与养成预览共用，t 单位为秒；opt.flash 为开火闪光
function drawPetModel(c, x, y, r, t, type, opt) {
  opt = opt || {};
  const blink = (t % 4.2) < 0.12 ? 0.15 : 1;

  if (type === 'fairy') {
    // ---- 火焰精灵：炽热核心 + 环绕火舌 ----
    const pulse = 0.92 + 0.08 * Math.sin(t * 6);
    c.save();
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(x, y, 0, x, y, r * 2.5 * pulse);
    g.addColorStop(0, 'rgba(255,248,220,0.95)');
    g.addColorStop(0.22, 'rgba(255,204,96,0.7)');
    g.addColorStop(0.55, 'rgba(255,124,34,0.3)');
    g.addColorStop(1, 'rgba(255,80,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r * 2.5 * pulse, 0, Math.PI * 2); c.fill();

    for (let i = 0; i < 4; i++) {
      const a = t * 2.1 + i * (Math.PI / 2);
      const rr = r * (1.05 + 0.14 * Math.sin(t * 4.5 + i * 1.7));
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.82;
      const sway = Math.sin(t * 7 + i * 2.1) * r * 0.3;
      c.fillStyle = i % 2 ? 'rgba(255,178,66,0.7)' : 'rgba(255,232,158,0.75)';
      c.beginPath();
      c.moveTo(px, py - r * 0.62);
      c.quadraticCurveTo(px + r * 0.42 + sway * 0.4, py, px + sway * 0.3, py + r * 0.5);
      c.quadraticCurveTo(px - r * 0.42 + sway * 0.4, py, px, py - r * 0.62);
      c.fill();
    }
    // 上升火星
    for (let i = 0; i < 3; i++) {
      const lp = (t * 0.8 + i * 0.33) % 1;
      c.fillStyle = `rgba(255,${Math.round(210 - lp * 90)},120,${(1 - lp) * 0.8})`;
      c.beginPath();
      c.arc(x + Math.sin(t * 2 + i * 2) * r * 0.5, y - lp * r * 2 - r * 0.2, r * 0.14 * (1 - lp) + 0.6, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();

    // 核心与眼睛
    const core = c.createRadialGradient(x - r * 0.15, y - r * 0.15, 0, x, y, r * 0.72);
    core.addColorStop(0, 'rgba(255,255,250,1)');
    core.addColorStop(0.6, 'rgba(255,226,150,0.96)');
    core.addColorStop(1, 'rgba(255,150,50,0.85)');
    c.fillStyle = core;
    c.beginPath(); c.arc(x, y, r * 0.7, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a2408';
    c.beginPath(); c.ellipse(x - r * 0.22, y - r * 0.05, r * 0.1, r * 0.17 * blink, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x + r * 0.22, y - r * 0.05, r * 0.1, r * 0.17 * blink, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(x - r * 0.25, y - r * 0.11, r * 0.045, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + r * 0.19, y - r * 0.11, r * 0.045, 0, Math.PI * 2); c.fill();
  } else {
    // ---- 龙蛋：蛋形躯体 + 小翼 + 角 + 尾焰 ----
    const bob = Math.sin(t * 2.6) * r * 0.09;
    const yy = y + bob;
    const flap = Math.sin(t * 8.5) * 0.45;

    // 尾焰
    c.save();
    c.globalCompositeOperation = 'lighter';
    const fg = c.createRadialGradient(x - r * 0.85, yy + r * 0.55, 0, x - r * 0.85, yy + r * 0.55, r * 0.8);
    fg.addColorStop(0, 'rgba(255,236,180,0.85)');
    fg.addColorStop(0.5, 'rgba(255,140,40,0.45)');
    fg.addColorStop(1, 'rgba(255,80,0,0)');
    c.fillStyle = fg;
    c.beginPath(); c.arc(x - r * 0.85, yy + r * 0.55, r * 0.8, 0, Math.PI * 2); c.fill();
    c.restore();

    // 小翼（身体后方）
    c.fillStyle = '#d9743d';
    [-1, 1].forEach(sx => {
      c.save();
      c.translate(x + sx * r * 0.7, yy - r * 0.2);
      c.rotate(sx * (0.45 + flap * 0.4));
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(sx * r * 0.95, -r * 0.85, sx * r * 1.2, -r * 0.12);
      c.quadraticCurveTo(sx * r * 0.72, r * 0.2, 0, r * 0.22);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(120,48,16,0.5)';
      c.lineWidth = Math.max(1, r * 0.06);
      c.stroke();
      c.restore();
    });

    // 蛋形躯体
    const bg = c.createLinearGradient(x, yy - r * 1.1, x, yy + r * 1.1);
    bg.addColorStop(0, '#ffcd9c');
    bg.addColorStop(0.45, '#f0894a');
    bg.addColorStop(1, '#b3441d');
    c.fillStyle = bg;
    c.beginPath(); c.ellipse(x, yy, r * 0.92, r * 1.08, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(110,36,10,0.55)';
    c.lineWidth = Math.max(1, r * 0.08);
    c.stroke();

    // 鳞纹
    c.strokeStyle = 'rgba(255,228,196,0.45)';
    c.lineWidth = Math.max(1, r * 0.07);
    for (let i = 0; i < 3; i++) {
      const ly = yy - r * 0.3 + i * r * 0.42;
      c.beginPath();
      c.arc(x, ly, r * 0.6, Math.PI * 0.18, Math.PI * 0.82);
      c.stroke();
    }

    // 角
    c.fillStyle = '#ffe6bc';
    [-1, 1].forEach(sx => {
      c.beginPath();
      c.moveTo(x + sx * r * 0.3, yy - r * 0.92);
      c.lineTo(x + sx * r * 0.5, yy - r * 1.42);
      c.lineTo(x + sx * r * 0.62, yy - r * 0.88);
      c.closePath(); c.fill();
    });

    // 眼睛 + 高光
    c.fillStyle = '#3a1c08';
    c.beginPath(); c.ellipse(x - r * 0.32, yy - r * 0.12, r * 0.12, r * 0.2 * blink, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x + r * 0.32, yy - r * 0.12, r * 0.12, r * 0.2 * blink, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.beginPath(); c.arc(x - r * 0.35, yy - r * 0.19, r * 0.05, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + r * 0.29, yy - r * 0.19, r * 0.05, 0, Math.PI * 2); c.fill();

    // 小嘴 + 腮红
    c.strokeStyle = '#7a3312';
    c.lineWidth = Math.max(1, r * 0.07);
    c.beginPath(); c.arc(x, yy + r * 0.22, r * 0.2, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
    c.fillStyle = 'rgba(255,150,120,0.4)';
    c.beginPath(); c.ellipse(x - r * 0.6, yy + r * 0.18, r * 0.16, r * 0.1, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x + r * 0.6, yy + r * 0.18, r * 0.16, r * 0.1, 0, 0, Math.PI * 2); c.fill();

    // 腹部亮斑
    const belly = c.createRadialGradient(x, yy + r * 0.5, 0, x, yy + r * 0.5, r * 0.6);
    belly.addColorStop(0, 'rgba(255,236,206,0.7)');
    belly.addColorStop(1, 'rgba(255,236,206,0)');
    c.fillStyle = belly;
    c.beginPath(); c.ellipse(x, yy + r * 0.5, r * 0.55, r * 0.45, 0, 0, Math.PI * 2); c.fill();
  }

  // 开火闪光
  if (opt.flash) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const fg2 = c.createRadialGradient(x, y, 0, x, y, r * 2.1);
    fg2.addColorStop(0, 'rgba(255,248,214,0.75)');
    fg2.addColorStop(1, 'rgba(255,150,40,0)');
    c.fillStyle = fg2;
    c.beginPath(); c.arc(x, y, r * 2.1, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}

function drawCharacter(c, x, y, r, ang, ch, opt) {
  const fur = CHAR_FUR[ch.fur] || CHAR_FUR[0];
  const cloth = CHAR_CLOTH[ch.cloth] || CHAR_CLOTH[0];
  const eye = CHAR_EYE[ch.eye] || CHAR_EYE[0];

  // 枪管
  if (!opt || opt.weapon !== false) {
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.fillStyle = '#2b2b2b';
    c.fillRect(r * 0.5, -2.5, r * 1.6, 5);
    c.restore();
  }

  // 身体
  c.fillStyle = fur.color;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();

  // 服装腰带（裁剪在身体轮廓内）
  c.save();
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
  c.translate(x, y);
  c.rotate(ang);
  c.fillStyle = cloth.color;
  c.fillRect(-r, -r * 0.22, r * 2, r * 0.44);
  c.restore();

  c.strokeStyle = fur.dark;
  c.lineWidth = Math.max(1.5, r * 0.14);
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();

  // 头
  const hr = r * 0.52;
  const hy = y - r - hr * 0.85;
  c.fillStyle = fur.color;
  c.beginPath(); c.arc(x, hy, hr, 0, Math.PI * 2); c.fill();

  // 耳朵
  c.fillStyle = fur.dark;
  c.beginPath();
  c.moveTo(x - hr * 0.78, hy - hr * 0.5);
  c.lineTo(x - hr * 0.38, hy - hr * 1.35);
  c.lineTo(x - hr * 0.05, hy - hr * 0.6);
  c.closePath(); c.fill();
  c.beginPath();
  c.moveTo(x + hr * 0.78, hy - hr * 0.5);
  c.lineTo(x + hr * 0.38, hy - hr * 1.35);
  c.lineTo(x + hr * 0.05, hy - hr * 0.6);
  c.closePath(); c.fill();

  // 眼睛（瞳孔朝向移动方向）
  const ex = Math.cos(ang) * hr * 0.22, ey = Math.sin(ang) * hr * 0.22;
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(x + ex - hr * 0.32, hy + ey, hr * 0.24, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(x + ex + hr * 0.32, hy + ey, hr * 0.24, 0, Math.PI * 2); c.fill();
  c.fillStyle = eye.color;
  c.beginPath(); c.arc(x + ex - hr * 0.32 + ex * 0.5, hy + ey + ey * 0.5, hr * 0.13, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(x + ex + hr * 0.32 + ex * 0.5, hy + ey + ey * 0.5, hr * 0.13, 0, Math.PI * 2); c.fill();

  drawHat(c, x, hy, hr, ch.hat);
}

function drawHat(c, x, y, hr, hat) {
  if (hat === 1) {           // 头盔
    c.fillStyle = '#8a8f98';
    c.beginPath(); c.arc(x, y - hr * 0.15, hr * 1.05, Math.PI, Math.PI * 2); c.fill();
    c.fillStyle = '#c0392b';
    c.fillRect(x - hr * 0.14, y - hr * 1.5, hr * 0.28, hr * 0.7);
  } else if (hat === 2) {    // 头巾
    c.fillStyle = '#e74c3c';
    c.fillRect(x - hr * 0.95, y - hr * 0.72, hr * 1.9, hr * 0.46);
    c.beginPath();
    c.moveTo(x + hr * 0.85, y - hr * 0.5);
    c.lineTo(x + hr * 1.9, y - hr * 0.1);
    c.lineTo(x + hr * 0.95, y + hr * 0.15);
    c.closePath(); c.fill();
  } else if (hat === 3) {    // 皇冠
    c.fillStyle = '#f1c40f';
    c.beginPath();
    c.moveTo(x - hr * 0.9, y - hr * 0.55);
    c.lineTo(x - hr * 0.6, y - hr * 1.5);
    c.lineTo(x - hr * 0.3, y - hr * 0.8);
    c.lineTo(x, y - hr * 1.75);
    c.lineTo(x + hr * 0.3, y - hr * 0.8);
    c.lineTo(x + hr * 0.6, y - hr * 1.5);
    c.lineTo(x + hr * 0.9, y - hr * 0.55);
    c.closePath(); c.fill();
  } else if (hat === 4) {    // 尖角
    c.fillStyle = '#9b59b6';
    c.beginPath();
    c.moveTo(x - hr * 0.9, y - hr * 0.4);
    c.lineTo(x - hr * 1.3, y - hr * 1.6);
    c.lineTo(x - hr * 0.4, y - hr * 0.85);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(x + hr * 0.9, y - hr * 0.4);
    c.lineTo(x + hr * 1.3, y - hr * 1.6);
    c.lineTo(x + hr * 0.4, y - hr * 0.85);
    c.closePath(); c.fill();
  }
}

// 首页悬浮预览 & 个性化实时预览（逻辑尺寸固定，按设备像素比放大绘制更清晰）
const CHAR_PREVIEWS = [
  { el: document.getElementById('char-preview'), lw: 240, lh: 200, r: 34, scale: 1 },
  { el: document.getElementById('char-preview2'), lw: 260, lh: 190, r: 42, scale: 1.05 },
];

function renderCharPreviews(t) {
  const dpr = canvasDpr();
  CHAR_PREVIEWS.forEach(item => {
    const cv = item.el;
    if (!cv || !cv.offsetParent) return;   // 面板不可见时跳过
    const bw = Math.round(item.lw * dpr);
    const bh = Math.round(item.lh * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = item.lw, h = item.lh;
    c.clearRect(0, 0, w, h);

    const bob = Math.sin(t / 700) * 5;
    const cy = h * 0.62 + bob;

    // 光环
    const g = c.createRadialGradient(w / 2, cy, 4, w / 2, cy, 92);
    g.addColorStop(0, 'rgba(255,213,79,0.26)');
    g.addColorStop(1, 'rgba(255,213,79,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    // 地面阴影
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    c.ellipse(w / 2, h - 20 - bob * 0.35, 32 - bob * 0.8, 8, 0, 0, Math.PI * 2);
    c.fill();

    const ang = -Math.PI / 2 + Math.sin(t / 1100) * 0.18;
    const r = item.r * charScale() * item.scale;
    drawCharacter(c, w / 2, cy, r, ang, meta.character, { weapon: true });
  });
}

function charPreviewLoop(t) {
  const menu = document.getElementById('menu');
  if (menu && !menu.classList.contains('hidden')) {
    renderCharPreviews(t);
    renderPetPreview(t);
  }
  requestAnimationFrame(charPreviewLoop);
}

// 宠物养成预览：与局内共用 drawPetModel，附带等级 / 星级光环
let petPreviewSel = null;      // 当前预览的宠物 id
function renderPetPreview(t) {
  const cv = document.getElementById('pet-preview');
  if (!cv || !cv.offsetParent) return;          // 面板不可见时跳过
  const lw = 240, lh = 180;
  const dpr = canvasDpr();
  const bw = Math.round(lw * dpr), bh = Math.round(lh * dpr);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, lw, lh);

  const sel = petPreviewSel || meta.equipped.pet;
  const type = (sel && sel !== 'none' && PET_DEFS[sel]) ? sel : 'dragon';
  const d = petDev(type);
  const bob = Math.sin(t / 700) * 6;
  const cy = lh * 0.55 + bob;

  // 光环
  const halo = c.createRadialGradient(lw / 2, cy, 4, lw / 2, cy, 86);
  halo.addColorStop(0, d.star >= 3 ? 'rgba(255,213,79,0.30)' : 'rgba(255,150,60,0.18)');
  halo.addColorStop(1, 'rgba(255,213,79,0)');
  c.fillStyle = halo;
  c.fillRect(0, 0, lw, lh);

  // 地面阴影（随浮动收缩）
  c.fillStyle = 'rgba(0,0,0,0.26)';
  c.beginPath();
  c.ellipse(lw / 2, lh - 26 - bob * 0.35, 26 - bob * 0.7, 7, 0, 0, Math.PI * 2);
  c.fill();

  // 星级星点
  if (d.star >= 3) {
    for (let i = 0; i < d.star; i++) {
      const ang = t / 900 + i * (Math.PI * 2 / d.star);
      c.fillStyle = 'rgba(255,236,150,0.9)';
      c.beginPath();
      c.arc(lw / 2 + Math.cos(ang) * 52, cy + Math.sin(ang) * 34, 2.2, 0, Math.PI * 2);
      c.fill();
    }
  }

  drawPetModel(c, lw / 2, cy, 30, t / 1000, type, {});

  // 底部信息
  const tag = document.getElementById('pet-tag');
  if (tag) {
    tag.textContent = `${PET_DEFS[type].name} · Lv.${d.lv} · ${'★'.repeat(d.star)}`;
  }
}

const ENEMY_TYPES = {
  grunt:  { hp: 30,  speed: 70,  r: 14, dmg: 8,  color: '#e05555', xp: 12, coin: 1 },
  fast:   { hp: 16,  speed: 130, r: 10, dmg: 5,  color: '#f0a030', xp: 9,  coin: 1 },
  ranged: { hp: 28,  speed: 55,  r: 13, dmg: 7,  color: '#d98bd0', xp: 15, coin: 1, range: 300, shootInterval: 1.4, bulletSpeed: 220 },
  elite:  { hp: 220, speed: 45,  r: 26, dmg: 20, color: '#b05fe0', xp: 130, coin: 5 },
  boss:   { hp: 1400, speed: 35, r: 40, dmg: 30, color: '#c0392b', xp: 320, coin: 50 },

  // ---- 特殊敌人 ----
  bomber:  { hp: 26, speed: 100, r: 13, dmg: 0,  color: '#8a4a2a', xp: 14, coin: 2, boomR: 72, boomDmg: 22 },
  hunter:  { hp: 34, speed: 48,  r: 14, dmg: 6,  color: '#d06a8a', xp: 17, coin: 1, range: 340, shootInterval: 2.4, bulletSpeed: 130, homing: true },
  healer:  { hp: 42, speed: 52,  r: 15, dmg: 4,  color: '#4dd07a', xp: 22, coin: 3, healR: 200, healAmount: 14, healInterval: 2.4 },
  shielder:{ hp: 46, speed: 62,  r: 16, dmg: 9,  color: '#5fb0d0', xp: 20, coin: 2, giftR: 170, giftAmount: 14, giftInterval: 4 },
  summoner:{ hp: 58, speed: 44,  r: 17, dmg: 6,  color: '#a06cd0', xp: 24, coin: 3, summonInterval: 5 },

  // 树木被长时间靠近后苏醒的树怪（血量较厚，仅由场景树木转化而来）
  treant:  { hp: 180, speed: 34,  r: 24, dmg: 18, color: '#5f8b4c', xp: 90, coin: 6 },
};

// 场景植物（第一波 Boss 之后随世界变化出现）
const FLORA_CFG = {
  tree: { r: 24, nearR: 80, aggroTime: 3.5, decay: 0.6, growTime: 2.6 },   // 破土长出 2.6s；靠近 3.5s 变树怪
  vine: { triggerR: 110, grabR: 62, windTime: 0.9, holdTime: 1.8, minLife: 25, maxLife: 40, cooldown: 2.5, growTime: 1.0 },
};

// Boss 冲刺技能参数
const BOSS_SKILL = { chargeTime: 1.0, dashSpeed: 880, dashTime: 0.42, cooldown: 6, firstDelay: 4 };

// Boss 种类（每 10 波轮换）
const BOSS_KINDS = {
  charge:   { name: '冲锋者', color: '#c0392b', hp: 1400, speed: 35 },
  barrage:  { name: '弹幕者', color: '#8e44ad', hp: 1300, speed: 28 },
  summoner: { name: '召唤者', color: '#16a085', hp: 1500, speed: 30 },
  splitter: { name: '分裂者', color: '#d35400', hp: 1600, speed: 40 },
};
const BOSS_ORDER = ['charge', 'barrage', 'summoner', 'splitter'];


// 武器（局外携带，攻击间隔作为 CD）
const WEAPON_DEFS = {
  rifle:  { name: '步枪', dmg: 15, reload: 0.9, speed: 640, range: 380, color: '#ffe066', baseCount: 1 },
  shotgun:{ name: '散弹', dmg: 6,  reload: 1.4, speed: 560, range: 300, color: '#9be060', baseCount: 5, spread: 0.28, converge: 110, offset: 5, falloff: { near: 110, far: 170, nearMul: 1.4, farMul: 0.35 } },
  laser:  { name: '机枪', dmg: 7,  reload: 0.35, speed: 900, range: 420, color: '#ff4d8d', baseCount: 1 },
  sniper: { name: '狙击枪', dmg: 38, reload: 2.0, speed: 1150, range: 520, color: '#c8b3ff', baseCount: 1, pierce: 1, tracer: true },
};

// 元素类（局内获得，走「元素伤害」乘区，不吃召唤物加成）
const ELEMENT_DEFS = {
  fireball: {
    cls: 'ele', name: '火球', dmg: 21, cd: 1.2, speed: 340, aoe: 70, burnDps: 7, color: '#ff9d3b',
    init: { aoeMul: 1, ignite: false, burnTime: 1, killExplode: false, killDmg: 15, killRadius: 60 },
  },
  lightning: {
    cls: 'ele', name: '雷电', dmg: 18, cd: 1.5, color: '#9de0ff',
    init: { chain: 0, strikes: 1 },
  },
  ice: {
    cls: 'ele', name: '冰刺', dmg: 18, cd: 1.6, targets: 1, range: 260, speed: 470, spikeR: 7, slowMul: 0.55, slowTime: 2.2, color: '#8fe3ff',
    init: { extraTargets: 0, slowMul: 1, slowTime: 1, freezeChance: 0, freezeTime: 1.2, rangeMul: 1 },
  },
};

// 召唤物（局内获得，走「召唤物伤害」乘区）
const SUMMON_DEFS = {
  scythe: {
    cls: 'summon', name: '镰刀', dmg: 10, orbitSpeed: 3.5, orbitRadius: 52, size: 12, hitR: 24, hitCd: 0.16, color: '#e8e8e8', baseCount: 1,
    init: { orbitAngle: 0, sizeMul: 1, blockChance: 0.10, knockback: false, lifesteal: 0 },
  },
  sword: {
    cls: 'summon', name: '飞剑', dmg: 9, hitCd: 0.6, speed: 380, range: 300, color: '#dff3ff', baseCount: 1,
    orbitRadius: 48, orbitSpeed: 2.0,   // 无敌人时绕角色环绕的半径与角速度
    exitTime: 0.22,                     // 贯穿敌人后惯性滑行的时长（滑出去一段再冲下一个目标）
    awayDist: 60,                       // 滑行后若还没拉开这个距离，就再补一点再折返
    softAvoid: 0.35,                    // 软避让：这段时间内被穿过的敌人，优先让给别的飞剑
    guardRadius: 80,                    // 护身剑阵：小队这个范围内出现敌人，待机的剑立刻回身斩击
    hitStop: 0.02,                      // 贯穿命中时的极短顿帧，强化打击感
    init: { pierce: 0, rangeMul: 1, speedMul: 1, orbitAng: 0, exit: 0, sizeMul: 1, giant: false },
  },
};
const POWER_DEFS = Object.assign({}, ELEMENT_DEFS, SUMMON_DEFS);

// 宠物（龙蛋，宠物伤害类型，附带火焰点燃）
const PET_DEFS = {
  dragon: { name: '龙蛋', dmg: 8, range: 360, shootInterval: 1.0, bulletSpeed: 420, color: '#ff8a5c', burnDps: 6, burnTime: 1 },
  fairy:  { name: '火焰精灵', dmg: 6, range: 340, shootInterval: 0.6, bulletSpeed: 460, color: '#ffb347', burnDps: 4, burnTime: 0.8 },
};

// ==================== 宠物养成（局外） ====================
const PET_DEV_CFG = {
  lvMax: 20,
  starMax: 5,
  eggCost: 60,          // 抽一次宠物蛋
  shardPerStar: 10,     // 升 1 星所需碎片
  expPerDmg: 0.1,       // 宠物造成 10 点伤害 = 1 点熟练度
};
// 升到下一级所需熟练度
function petExpNeed(lv) { return 30 + (lv - 1) * 15; }

// 天赋树：每只宠物定制（每 2 级 1 点，分支满 unlockAt 点解锁特效）
const PET_TREES = {
  dragon: [
    { id: 'flame', name: '烈焰', desc: '点燃伤害 +15%/点', kind: 'burn', val: 0.15, max: 5, unlockAt: 3, unlockDesc: '点燃扩散到周围 60px 的敌人', unlock: b => { b.igniteSpread = true; } },
    { id: 'might', name: '龙威', desc: '直击伤害 +5%/点', kind: 'dmg', val: 0.05, max: 5, unlockAt: 5, unlockDesc: '宠物弹丸 +1', unlock: b => { b.extraShots += 1; } },
    { id: 'scale', name: '鳞甲', desc: '宠物击杀回护盾 1/点', kind: 'killShield', val: 1, max: 5, unlockAt: 3, unlockDesc: '宠物命中回复队伍 0.5 生命', unlock: b => { b.hitHeal += 0.5; } },
  ],
  fairy: [
    { id: 'rapid', name: '连射', desc: '宠物攻速 +4%/点', kind: 'rate', val: 0.04, max: 5, unlockAt: 5, unlockDesc: '宠物弹丸 +1', unlock: b => { b.extraShots += 1; } },
    { id: 'scorch', name: '灼烧', desc: '点燃伤害 +15%/点', kind: 'burn', val: 0.15, max: 5, unlockAt: 3, unlockDesc: '点燃扩散到周围 60px 的敌人', unlock: b => { b.igniteSpread = true; } },
    { id: 'agile', name: '灵巧', desc: '索敌范围 +8%/点', kind: 'range', val: 0.08, max: 5, unlockAt: 3, unlockDesc: '宠物击杀回 1 点护盾', unlock: b => { b.killShield += 1; } },
  ],
};

// 升星词条池（3★ / 5★ 各解锁 1 个槽）
const PET_AFFIXES = {
  blaze: { name: '烈焰之心', desc: '点燃伤害 +25%', apply: b => { b.burnMul *= 1.25; } },
  ember: { name: '余烬', desc: '点燃持续 +50%', apply: b => { b.burnTimeMul *= 1.5; } },
  ward:  { name: '守护', desc: '宠物击杀回复 1 点护盾', apply: b => { b.killShield += 1; } },
  rapid: { name: '迅捷', desc: '宠物攻速 +10%', apply: b => { b.rateMul *= 1.1; } },
  focus: { name: '聚焦', desc: '宠物伤害 +12%', apply: b => { b.dmgMul *= 1.12; } },
};

// 装备（局外选择）
const EQUIPMENT_DEFS = {
  none:   { name: '无', damageTaken: 1, damageDealt: 1 },
  leather:{ name: '皮甲', damageTaken: 0.85, damageDealt: 1 },
  charm:  { name: '力量护符', damageTaken: 1, damageDealt: 1.15 },
  blood:  { name: '血珠', damageTaken: 1, damageDealt: 1, bloodOrb: 0.05 },   // 造成伤害时 5% 概率回复该次伤害的 5%
};

// 物品（局外选择）
const ITEM_DEFS = {
  none: { name: '无' },
  orb:  { name: '回血宝珠', regen: 2 },   // 每秒回复 2 点队伍血池
};

// Boss 击败后的强力 Buff（概率出现）
// 元素类奖励只在拥有元素伤害来源时出现，避免出现纯减益的选项
const BOSS_BUFFS = [
  { id: 'buff-dmg50', name: '伤害 +50%', desc: '子弹伤害 +50%（同类加成相加）', apply() { addDamageBonus('bullet', 0.5); } },
  { id: 'buff-reload100', name: '射速 +100%', desc: '攻击速度翻倍', apply() { weapons.forEach(w => w.rateMul = (w.rateMul || 1) * 2); } },
  { id: 'buff-ele100', name: '元素伤害 +100%（子弹 -50%）', desc: '元素加成 +100%、子弹加成 -50%（同类相加）', req: hasElementalSource, apply() { addDamageBonus('ele', 1); addDamageBonus('bullet', -0.5); } },
  { id: 'buff-bullet50-ele0', name: '子弹伤害 +50%（元素归零）', desc: '子弹加成 +50%，已累积的元素加成清零', req: hasElementalSource, apply() { dmgBonus.ele = -1; addDamageBonus('bullet', 0.5); } },
  { id: 'buff-ele-trigger', name: '元素触发频率 +50%', desc: '火球/雷电/冰刺冷却更短（同类相加）', req: () => hasSummon('fireball') || hasSummon('lightning') || hasSummon('ice'), apply() { eleRateBonus += 0.5; recalcDamage(); } },
];

// 进化（终极形态）：需要本路线强化达到一定次数 + 满足专属前置，之后以低权重随机出现
const EVOLUTIONS = [
  {
    id: 'evo-rifle', name: '进化 · 穿甲连射', desc: '步枪：穿透 +3、伤害 +50%、弹速 +25%',
    route: 'rifle', need: 3,
    req: () => { const w = getWeapon('rifle'); return !!w && (w.pierce || 0) >= 3; },
    apply() { const w = getWeapon('rifle'); w.pierce = (w.pierce || 0) + 3; w.dmgMul *= 1.5; w.speedMul = (w.speedMul || 1) * 1.25; },
  },
  {
    id: 'evo-shotgun', name: '进化 · 霰弹风暴', desc: '散弹：击杀分裂弹丸 2 → 4 枚、伤害 +30%',
    route: 'shotgun', need: 3,
    req: () => { const w = getWeapon('shotgun'); return !!w && (w.splitChance || 0) >= 0.3; },
    apply() { const w = getWeapon('shotgun'); w.splitCount = 4; w.dmgMul *= 1.3; },
  },
  {
    id: 'evo-shotgun-guard', name: '进化 · 铁壁霰弹', desc: '散弹：近距离（110px 内）击杀敌人时回复 3 点队伍生命与 2 点护盾',
    route: 'shotgun', need: 3,
    req: () => { const w = getWeapon('shotgun'); return !!w && (w.extraCount || 0) > 0 && (w.spreadMul || 1) < 1; },
    apply() { getWeapon('shotgun').closeGuard = true; },
  },
  {
    id: 'evo-laser', name: '进化 · 死亡射线', desc: '机枪：攻速 +80%、穿透 +2',
    route: 'laser', need: 3,
    req: () => !!getWeapon('laser') && appliedIds.has('laser-special'),
    apply() { const w = getWeapon('laser'); if (w) { w.rateMul = (w.rateMul || 1) * 1.8; w.pierce = (w.pierce || 0) + 2; } },
  },
  {
    id: 'evo-sniper', name: '进化 · 湮灭狙击', desc: '狙击枪：穿透 +3、伤害 +70%、弹速 +30%',
    route: 'sniper', need: 3,
    req: () => { const w = getWeapon('sniper'); return !!w && (w.pierce || 0) >= 3; },
    apply() { const w = getWeapon('sniper'); w.pierce = (w.pierce || 0) + 3; w.dmgMul *= 1.7; w.speedMul = (w.speedMul || 1) * 1.3; },
  },
  {
    id: 'evo-fireball', name: '进化 · 烈焰风暴', desc: '火球：数量 +2、爆炸范围 +50%、点燃 +1s、伤害 +30%',
    route: 'fireball', need: 3,
    req: () => { const s = getSummon('fireball'); return !!s && !!s.ignite && !!s.killExplode; },
    apply() { const s = getSummon('fireball'); s.extraCount += 2; s.aoeMul *= 1.5; s.burnTime += 1; summonMore('fireball', 1.3); },
  },
  {
    id: 'evo-lightning', name: '进化 · 苍穹雷暴', desc: '雷电：次数 +2、链式上限 +2、伤害 +30%',
    route: 'lightning', need: 3,
    req: () => { const s = getSummon('lightning'); return !!s && (s.chain || 0) >= 3; },
    apply() { const s = getSummon('lightning'); s.extraCount += 2; s.chain += 2; summonMore('lightning', 1.3); },
  },
  {
    id: 'evo-ice', name: '进化 · 绝对零度', desc: '冰刺：目标 +2、范围 +40%、霜冻更强、冰冻概率 +25%',
    route: 'ice', need: 3,
    req: () => { const s = getSummon('ice'); return !!s && (s.freezeChance || 0) > 0; },
    apply() {
      const s = getSummon('ice');
      s.extraTargets += 2;
      s.rangeMul = (s.rangeMul || 1) * 1.4;
      s.slowMul = Math.max(0.45, (s.slowMul || 1) * 0.7);
      s.freezeChance = Math.min(0.6, (s.freezeChance || 0) + 0.25);
      summonMore('ice', 1.3);
    },
  },
  {
    id: 'evo-scythe', name: '进化 · 死神镰刀', desc: '镰刀：数量 +2、伤害 +40%、吸血 30%、子弹碰到刀刃即被斩落',
    route: 'scythe', need: 3,
    req: () => { const s = getSummon('scythe'); return !!s && (s.lifesteal || 0) >= 0.10 && (s.blockChance || 0.10) > 0.10; },
    apply() { const s = getSummon('scythe'); s.extraCount += 2; summonMore('scythe', 1.4); s.blockChance = 1; s.lifesteal = 0.30; },
  },
  {
    id: 'evo-sword', name: '进化 · 万剑归宗', desc: '飞剑：数量 +2、连斩 +2、伤害 +40%',
    route: 'sword', need: 3,
    req: () => { const s = getSummon('sword'); return !!s && (s.pierce || 0) >= 1; },
    apply() { const s = getSummon('sword'); s.extraCount += 2; s.pierce = (s.pierce || 0) + 2; summonMore('sword', 1.4); },
  },
];

// 主动技能（时缓由局内升级解锁）
const SKILL_DEFS = {
  slow: { name: '时缓', cd: 16, duration: 3, mul: 0.45 },
};

// 可破坏物 / 掩体 / 树木
const OBSTACLE_DEFS = {
  barrel: { r: 15, hp: 40, coin: 3, xp: 8, color: '#9c6a35', dark: '#7d5327' },
  crate: { r: 17, hp: 60, coin: 5, xp: 12, color: '#b3813f', dark: '#8f6832' },
  pillar: { r: 20, hp: Infinity, coin: 0, xp: 0, color: '#8d97a1', dark: '#6f7883' },
  tree: { r: FLORA_CFG.tree.r, hp: Infinity, coin: 0, xp: 0, color: '#4e7a3a', dark: '#2f4a22' },
};

// 商店 / 局外解锁配置
const SHOP = {
  weapons: {
    rifle: { name: '步枪', cost: 0, desc: '单发直射' },
    shotgun: { name: '散弹', cost: 200, desc: '扇形多发弹丸' },
    laser: { name: '机枪', cost: 300, desc: '高速连射' },
    sniper: { name: '狙击枪', cost: 400, desc: '高额单发伤害 · 自带穿透 · 射速很慢' },
  },
  equipment: {
    none: { name: '无', cost: 0, desc: '无额外效果' },
    leather: { name: '皮甲', cost: 100, desc: '受伤 -15%' },
    charm: { name: '力量护符', cost: 150, desc: '伤害 +15%' },
    blood: { name: '血珠', cost: 260, desc: '造成伤害时 5% 概率回复该次伤害的 5%' },
  },
  items: {
    none: { name: '无', cost: 0, desc: '无额外效果' },
    orb: { name: '回血宝珠', cost: 200, desc: '每秒回复 2 点队伍生命' },
  },
  pets: {
    none: { name: '无', cost: 0, desc: '无宠物' },
    dragon: { name: '龙蛋', cost: 150, desc: '悬浮右上方攻击并点燃' },
    fairy: { name: '火焰精灵', cost: 250, desc: '快速连射并点燃' },
  },
};

// ==================== 全局状态 ====================
let state = 'menu'; // menu | playing | upgrade | bossreward | gameover
let runCoins = 0;   // 本局获得金币
let petMsg = '';    // 宠物养成页的最近一次操作反馈（抽蛋/升星）

// 局外进度（按用户持久化到 localStorage）
let users = [];
let currentUser = null;
let meta = defaultMeta();

let squad = { x: WORLD.w / 2, y: WORLD.h / 2, tx: WORLD.w / 2, ty: WORLD.h / 2, moving: false, shield: 0, shieldMax: 0, shieldRegenTimer: 0, invulnT: 0 };
let soldiers = [];
// 小兵共享血池：总量 = 小兵数 × 单个小兵血量；掉掉一格血就少一个小人
let squadHp = 0;
let squadMaxHp = 0;
let weapons = [];   // 携带武器
let summons = [];   // 局内能力：元素类（火球/雷电/冰刺）+ 召唤物（镰刀/飞剑）
let pet = null;     // 宠物（唯一）
let petRunExp = 0;  // 本局宠物熟练度（结算时写入局外养成）
let enemies = [];
let bullets = [];
let enemyBullets = [];
let drops = [];      // 经验光球
let particles = [];
let decorations = [];
let lightningBolts = [];
let iceSpikes = [];  // 冰刺命中特效（碎冰炸裂）
let blasts = [];     // 火球爆炸特效
let swordSlashes = [];  // 飞剑贯穿斩痕
let hitStop = 0;     // 顿帧剩余时间（贯穿命中时短暂冻结逻辑，渲染照常）
let lastHitStopT = -1;
let obstacles = [];  // 木桶 / 箱子 / 石柱 / 树木
let vines = [];      // 藤蔓陷阱
let squadRootedT = 0; // 被藤蔓缠住的剩余时间

// 主动技能状态
let skills = { slow: { owned: false, cd: 0, cdMax: 16, duration: 3 } };
let enemySlowT = 0;  // 时缓剩余时间

// 本局已获得的升级 id（用于进化/前置判断）与重掷次数
let appliedIds = new Set();
let rerollLeft = 0;
// 本局各路线（武器 / 元素 / 召唤物）获得的强化次数：进化需要攒够次数才有概率出现
let routePicks = {};

// 成长属性（伤害类型分列）
let stats = {
  moveSpeed: 1, maxHp: 1,
  bulletDamage: 1,     // 子弹伤害（武器）
  elementalDamage: 1,  // 元素伤害（火球/雷电/冰刺/燃烧）
  summonDamage: 1,     // 召唤物伤害（镰刀/飞剑）
  petDamage: 1,        // 宠物伤害（龙蛋）
  pickupRange: 1, invulnDuration: 0, damageTaken: 1, dodge: 0, bulletKnockback: 0, elementalCd: 1,
  vuln: 0,             // 易伤：敌人受到的伤害加成（同类加算）
  lifesteal: 0,        // 吸血：造成伤害后按比例回复队伍血池（同类加算）
  regen: 0,            // 每秒回复队伍血池（回血宝珠）
  bloodOrb: 0,         // 血珠：造成伤害时触发回血的概率
};

// ==================== 伤害乘区 ====================
// 参考主流做法（PoE 的「增加 / 更多」、Vampire Survivors 的同类加算）：
//   最终伤害 = 基础值 × (1 + 同类加成之和) × 独立乘区
// 同类百分比一律「加算」，避免同类加成反复相乘造成指数爆炸（或把某一路直接压到 0）；
// 只有局外装备、进化这类独立来源才进乘算区。减益同样进加算区，并留下限。
const DMG_FLOOR = 0.3;                                     // 单路伤害最低保留 30%
let dmgBonus = { bullet: 0, ele: 0, summon: 0, pet: 0 };    // 加算区（0.3 = +30%）
let dmgBase = { bullet: 1, ele: 1, summon: 1, pet: 1 };     // 独立乘区（局外装备）
let eleRateBonus = 0;                                       // 元素触发频率（加算）
let pickCount = {};                                         // 可重复卡的已获取次数（用于限次）

function addDamageBonus(type, pct) {
  dmgBonus[type] = (dmgBonus[type] || 0) + pct;
  recalcDamage();
}

function recalcDamage() {
  stats.bulletDamage = Math.max(DMG_FLOOR, dmgBase.bullet * (1 + dmgBonus.bullet));
  stats.elementalDamage = Math.max(0, dmgBase.ele * (1 + dmgBonus.ele));   // 元素可被「清零」
  stats.summonDamage = Math.max(DMG_FLOOR, dmgBase.summon * (1 + dmgBonus.summon));
  stats.petDamage = Math.max(DMG_FLOOR, dmgBase.pet * (1 + dmgBonus.pet));
  stats.elementalCd = 1 / (1 + eleRateBonus);
}

function canPick(id, max) { return (pickCount[id] || 0) < max; }
function markPick(id) { pickCount[id] = (pickCount[id] || 0) + 1; }

let camera = { x: 0, y: 0 };
let wave = 1;
let kills = 0;
let level = 1;
let xp = 0;
let xpToNext = 15;
let choiceCount = 3;
let gameTime = 0;
let difficulty = 1;
let bossKills = 0;   // 已击败 Boss 数（决定世界成长：新怪物 / 出怪量 / 经验加成）
let dividers = [];   // 世界内的随机分块虚线

let spawnTimer = 1;
let waveSpawned = 0;
let waveSize = 5;

let upgrades = []; // 当前待选的升级
let bossRewardOptions = [];
let bossRewardPicked = 0;
let keys = {};
let damageNumbers = [];
let shake = 0;
let banner = { text: '', t: 0 };   // 居中提示（Boss 出场 / 狂暴）
let joystick = { active: false, ox: 0, oy: 0, dx: 0, dy: 0, id: null };
let audioCtx = null;
let musicTimer = null;
let musicStep = 0;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function defaultCharacter() { return { fur: 0, cloth: 0, hat: 0, eye: 0, size: 1 }; }

function defaultMeta() {
  return {
    coins: 0,
    unlocked: { weapons: ['rifle'], equipment: ['none'], items: ['none'], pets: ['none'] },
    equipped: { weapon: 'rifle', equipment: 'none', item: 'none', pet: 'none' },
    petDev: {},          // 宠物养成：{ 龙蛋/精灵: { lv, exp, shards, star, affixes, talents } }
    character: defaultCharacter(),
    settings: { sound: true, orient: 'portrait', fps: 0 },
    bestWave: 0,
    run: null,           // 上把未结束的进度快照（返回主菜单时保存）
  };
}

// 兼容旧存档：补齐新增字段
function normalizeMeta(m) {
  if (!m.character) m.character = defaultCharacter();
  if (!m.settings) m.settings = { sound: true, orient: 'portrait', fps: 0 };
  if (!m.settings.orient) m.settings.orient = 'portrait';
  if (m.settings.fps === undefined) m.settings.fps = 0;
  if (!m.unlocked) m.unlocked = { weapons: ['rifle'], equipment: ['none'], items: ['none'], pets: ['none'] };
  if (!m.unlocked.items) m.unlocked.items = ['none'];
  if (!m.equipped) m.equipped = { weapon: 'rifle', equipment: 'none', item: 'none', pet: 'none' };
  if (!m.equipped.item) m.equipped.item = 'none';
  if (!m.petDev) m.petDev = {};
  Object.keys(PET_DEFS).forEach(id => {
    const d = m.petDev[id];
    if (!d) { m.petDev[id] = { lv: 1, exp: 0, shards: 0, star: 1, affixes: [], talents: {} }; return; }
    if (!d.lv) d.lv = 1;
    if (!d.exp) d.exp = 0;
    if (!d.shards) d.shards = 0;
    if (!d.star) d.star = 1;
    if (!Array.isArray(d.affixes)) d.affixes = [];
    if (!d.talents) d.talents = {};
  });
  // 装备了却不在已解锁列表（旧存档 / 手改存档）：补回解锁，避免界面上无法操作
  const catOf = { weapon: 'weapons', equipment: 'equipment', item: 'items', pet: 'pets' };
  Object.entries(catOf).forEach(([k, cat]) => {
    const id = m.equipped[k];
    if (id && Array.isArray(m.unlocked[cat]) && !m.unlocked[cat].includes(id)) m.unlocked[cat].push(id);
  });
  return m;
}

// ==================== 宠物养成：数据与结算 ====================
function petDev(id) {
  if (!meta.petDev) meta.petDev = {};
  if (!meta.petDev[id]) meta.petDev[id] = { lv: 1, exp: 0, shards: 0, star: 1, affixes: [], talents: {} };
  return meta.petDev[id];
}

// 熟练度 → 升级（返回升了几级）
function gainPetExp(id, amount) {
  const d = petDev(id);
  if (!(amount > 0)) return 0;
  let up = 0;
  d.exp += amount;
  while (d.lv < PET_DEV_CFG.lvMax && d.exp >= petExpNeed(d.lv)) {
    d.exp -= petExpNeed(d.lv);
    d.lv++;
    up++;
  }
  if (d.lv >= PET_DEV_CFG.lvMax) d.exp = 0;
  return up;
}

// 天赋点：每 2 级 1 点
function petTalentTotal(d) { return Math.floor((d.lv - 1) / 2); }
function petTalentUsed(d) { return Object.values(d.talents || {}).reduce((s, v) => s + v, 0); }
function petTalentFree(d) { return petTalentTotal(d) - petTalentUsed(d); }

function addPetTalent(id, branchId) {
  const d = petDev(id);
  const br = (PET_TREES[id] || []).find(x => x.id === branchId);
  if (!br) return;
  if ((d.talents[br.id] || 0) >= br.max) return;
  if (petTalentFree(d) <= 0) return;
  d.talents[br.id] = (d.talents[br.id] || 0) + 1;
  saveMeta();
  renderMenu();
}

// 局外加成汇总：等级 + 升星 + 天赋 + 词条
function petBonus(id) {
  const d = petDev(id);
  const b = {
    dmgMul: (1 + 0.02 * (d.lv - 1)) * (1 + 0.06 * (d.star - 1)),
    rateMul: 1 + 0.03 * Math.floor((d.lv - 1) / 3),
    extraShots: 0, rangeMul: 1, hitHeal: 0, killShield: 0, burnMul: 1, burnTimeMul: 1, igniteSpread: false,
  };
  (PET_TREES[id] || []).forEach(br => {
    const p = d.talents[br.id] || 0;
    if (p <= 0) return;
    if (br.kind === 'dmg') b.dmgMul *= 1 + br.val * p;
    else if (br.kind === 'burn') b.burnMul *= 1 + br.val * p;
    else if (br.kind === 'rate') b.rateMul *= 1 + br.val * p;
    else if (br.kind === 'range') b.rangeMul *= 1 + br.val * p;
    else if (br.kind === 'killShield') b.killShield += br.val * p;
    else if (br.kind === 'hitHeal') b.hitHeal += br.val * p;
    if (p >= br.unlockAt && br.unlock) br.unlock(b);
  });
  (d.affixes || []).forEach(a => { if (PET_AFFIXES[a]) PET_AFFIXES[a].apply(b); });
  return b;
}

// 升星：消耗碎片，3★ / 5★ 各解锁一个随机词条
function starUpPet(id) {
  const d = petDev(id);
  if (d.star >= PET_DEV_CFG.starMax || d.shards < PET_DEV_CFG.shardPerStar) return;
  d.shards -= PET_DEV_CFG.shardPerStar;
  d.star++;
  if (d.star === 3 || d.star === 5) {
    const pool = Object.keys(PET_AFFIXES).filter(a => !d.affixes.includes(a));
    if (pool.length) d.affixes.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  saveMeta();
  renderMenu();
}

// 抽宠物蛋：抽到未解锁的直接解锁，重复则转碎片
function drawPetEgg() {
  if (meta.coins < PET_DEV_CFG.eggCost) return;
  meta.coins -= PET_DEV_CFG.eggCost;
  const ids = Object.keys(PET_DEFS);
  const id = ids[Math.floor(Math.random() * ids.length)];
  if (!meta.unlocked.pets.includes(id)) {
    meta.unlocked.pets.push(id);
    petMsg = `孵化出新的宠物：${PET_DEFS[id].name}！`;
  } else {
    const n = 8 + Math.floor(Math.random() * 8);
    petDev(id).shards += n;
    petMsg = `${PET_DEFS[id].name}碎片 +${n}（当前 ${petDev(id).shards} / ${PET_DEV_CFG.shardPerStar}）`;
  }
  saveMeta();
  renderMenu();
}

// 用户存档：优先落盘到本地文件（Electron 主进程 / 开发服务器 /api/users），无后端时退回浏览器存储
const USERS_KEY = 'fury_users';
let userStoreMode = 'local';   // 'file' | 'local'

function loadUsersFromFile() {
  if (window.furyStore && window.furyStore.load) return Promise.resolve(window.furyStore.load());
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return fetch('/api/users')
      .then(r => (r.ok ? r.json() : null))
      .then(d => (d && Array.isArray(d.users) ? d.users : null))
      .catch(() => null);
  }
  return Promise.resolve(null);
}

function loadUsers() {
  return loadUsersFromFile().then(list => {
    if (list) {
      userStoreMode = 'file';
      users = list;
      if (!users.length) {
        // 首次启用文件存档：把浏览器里的旧账号迁移过来
        try {
          const s = localStorage.getItem(USERS_KEY);
          const old = s ? JSON.parse(s) : null;
          if (Array.isArray(old) && old.length) { users = old; saveUsers(); }
        } catch (e) {}
      }
      return;
    }
    userStoreMode = 'local';
    try {
      const s = localStorage.getItem(USERS_KEY);
      if (s) users = JSON.parse(s);
    } catch (e) { users = []; }
  });
}

function saveUsers() {
  if (userStoreMode === 'file') {
    if (window.furyStore && window.furyStore.save) window.furyStore.save(users);
    else fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users }),
    }).catch(() => {});
    return;
  }
  try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch (e) {}
}

function saveMeta() {
  if (!currentUser) return;
  const u = users.find(x => x.username === currentUser);
  if (u) { u.meta = meta; saveUsers(); }
}

function register(username, password) {
  username = (username || '').trim();
  if (!username || !password) { loginError('请输入用户名和密码'); return false; }
  if (users.some(u => u.username === username)) { loginError('用户名已存在'); return false; }
  const u = { username, password, meta: defaultMeta() };
  users.push(u);
  saveUsers();
  currentUser = username;
  localStorage.setItem('fury_current_user', username);
  meta = u.meta;
  renderMenu();
  showMenu();
  return true;
}

function login(username, password) {
  const u = users.find(x => x.username === (username || '').trim() && x.password === password);
  if (!u) { loginError('用户名或密码错误'); return false; }
  currentUser = u.username;
  localStorage.setItem('fury_current_user', u.username);
  meta = normalizeMeta(u.meta);
  renderMenu();
  showMenu();
  return true;
}

function logout() {
  currentUser = null;
  meta = defaultMeta();
  localStorage.removeItem('fury_current_user');
  showLogin();
}

function showLogin() {
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('login').classList.remove('hidden');
  setLoginMode(false);
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

function showMenu() {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  document.getElementById('intro').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('btn-pause').classList.add('hidden');
  applyOrientation();
  playIntro();
  showHome();
}

// ==================== 主页 / 子页面 ====================
function showHome() {
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-home').classList.add('active');
}

// ==================== 开场动画 ====================
let introPlayed = false;
let introTimer = null;

function playIntro() {
  const el = document.getElementById('intro');
  if (introPlayed) return;
  introPlayed = true;
  const inner = el.querySelector('.intro-inner');
  el.classList.remove('hidden');
  inner.classList.remove('play');
  void inner.offsetWidth; // 强制重排以重播动画
  inner.classList.add('play');
  clearTimeout(introTimer);
  introTimer = setTimeout(endIntro, 2600);
}

function endIntro() {
  clearTimeout(introTimer);
  introTimer = null;
  document.getElementById('intro').classList.add('hidden');
}

document.getElementById('intro').addEventListener('pointerdown', endIntro);

// ==================== 登录 / 注册切换 ====================
let registerMode = false;

function loginError(msg) {
  const el = document.getElementById('login-error');
  if (el) el.textContent = msg || '';
}

function setLoginMode(on) {
  registerMode = on;
  document.getElementById('login-pass2').classList.toggle('hidden', !on);
  document.getElementById('btn-login').classList.toggle('hidden', on);
  document.getElementById('btn-back').classList.toggle('hidden', !on);
  document.getElementById('btn-register').textContent = on ? '确认注册' : '注册';
  document.getElementById('login-pass2').value = '';
  loginError('');
}

// ==================== 属性派生 ====================
function soldierMaxHp() { return CFG.soldierMaxHp * stats.maxHp; }
function moveSpeed() { return CFG.moveSpeed * stats.moveSpeed; }
function pickupRange() { return CFG.pickupBase * stats.pickupRange; }

// ==================== 武器 / 召唤物工具 ====================
function makeWeapon(type) { return { type, dmgMul: 1, extraCount: 0, rateMul: 1, speedMul: 1, spreadMul: 1, cd: 0, pierce: WEAPON_DEFS[type].pierce || 0 }; }
function addWeapon(type) { weapons.push(makeWeapon(type)); }
function getWeapon(type) { return weapons.find(w => w.type === type); }
function weaponMul(type, mul) { const w = getWeapon(type); if (w) w.dmgMul *= mul; }
function weaponRate(type, mul) { const w = getWeapon(type); if (w) w.rateMul = (w.rateMul || 1) * mul; }

function addSummon(type) {
  const def = POWER_DEFS[type];
  if (!def) return;
  summons.push(Object.assign({
    type, cls: def.cls, dmgMul: 1, dmgAdd: 0, dmgMore: 1, rateMul: 1, cd: 0, extraCount: 0,
  }, def.init || {}));
}
function hasSummon(type) { return summons.some(s => s.type === type); }
function getSummon(type) { return summons.find(s => s.type === type); }
// 是否拥有元素伤害来源（火球 / 雷电 / 冰刺 / 带点燃的宠物）
function hasElementalSource() {
  return hasSummon('fireball') || hasSummon('lightning') || hasSummon('ice') || !!pet;
}
// 局内能力（元素类 / 召唤物）伤害：升级卡走「加算区」，进化走「独立乘区」，
// 最终折算成 dmgMul；元素类只吃元素伤害，召唤物只吃召唤物伤害
function refreshSummonMul(s) {
  s.dmgMul = Math.max(DMG_FLOOR, (1 + (s.dmgAdd || 0)) * (s.dmgMore || 1));
}
function powerBaseDamage(s) {
  return s.cls === 'ele' ? stats.elementalDamage : stats.summonDamage;
}
function summonMul(type, mul) {
  const s = getSummon(type);
  if (!s) return;
  s.dmgAdd = (s.dmgAdd || 0) + (mul - 1);
  refreshSummonMul(s);
}
function summonMore(type, mul) {
  const s = getSummon(type);
  if (!s) return;
  s.dmgMore = (s.dmgMore || 1) * mul;
  refreshSummonMul(s);
}
function summonRate(type, mul) { const s = getSummon(type); if (s) s.rateMul = (s.rateMul || 1) * mul; }

// ==================== 升级池（动态生成） ====================
function buildUpgradePool() {
  const pool = [];
  const W_LOW = 0.35, W_MED = 0.6, W_NORM = 1;

  // 生存 / 功能型选项
  pool.push({ id: 'speed', name: '移速 +12%', desc: '部队移动更快', weight: W_LOW, apply() { stats.moveSpeed *= 1.12; } });
  pool.push({ id: 'hp', name: '生命上限 +20%', desc: '小兵更抗打（血池上限同步提升）', weight: W_MED, apply() { stats.maxHp *= 1.2; const before = squadMaxHp; refreshSquadPool(); squadHp += Math.max(0, squadMaxHp - before); } });
  pool.push({ id: 'heal', name: '医疗包', desc: '全队回复 40% 生命', weight: W_LOW, apply() { healAll(CFG.healAmount); } });
  pool.push({ id: 'add', name: '增援 +1（子弹加成 -10%）', desc: '新增一名小兵，子弹加成 -10%（同类相加）', weight: 0.8, apply() { addSoldier(); addDamageBonus('bullet', -0.1); } });
  pool.push({ id: 'pickup', name: '拾取范围 +30%', desc: '经验光球磁吸更远', weight: W_NORM, apply() { stats.pickupRange *= 1.3; } });
  pool.push({ id: 'shield', name: '护盾 +20', desc: '护盾抵挡伤害，破盾 3 秒后恢复', weight: W_NORM, apply() { squad.shieldMax += 20; squad.shield += 20; } });
  if (stats.invulnDuration < 1.5) {
    pool.push({ id: 'invuln', name: '受伤免疫 +1s', desc: '受击后 1 秒内免疫伤害', weight: W_NORM, apply() { stats.invulnDuration = Math.min(1.5, stats.invulnDuration + 1); } });
  }
  if (choiceCount < 6) {
    pool.push({ id: 'choices', name: '升级选项 +1', desc: '每次升级多 1 个选项（最多 6 个）', weight: 1.1, apply() { choiceCount = Math.min(6, choiceCount + 1); } });
  }

  // 特殊选项
  pool.push({ id: 'power-bullet', name: '强力子弹', desc: '子弹伤害 +30%（同类加成相加），击退 +10%', weight: W_NORM, apply() { addDamageBonus('bullet', 0.3); stats.bulletKnockback = Math.min(1, stats.bulletKnockback + 0.1); } });
  // 元素法师（子弹→元素 转换卡）：走加算区，且每局最多 2 次，避免反复相乘把子弹伤害压没
  if (hasElementalSource() && canPick('elemental-mage', 2)) {
    pool.push({ id: 'elemental-mage', name: '元素法师', desc: '子弹加成 -30%、元素加成 +20%（同类相加，最多 2 次）', weight: W_NORM, apply() { markPick('elemental-mage'); addDamageBonus('bullet', -0.3); addDamageBonus('ele', 0.2); } });
  }
  if (stats.dodge < 0.6) {
    pool.push({ id: 'dodge', name: '闪避 +20%', desc: '概率规避伤害（最多 60%）', weight: W_NORM, apply() { stats.dodge = Math.min(0.6, stats.dodge + 0.2); } });
  }
  // 嗜血：易伤与吸血都进各自的「同类加算区」（易伤只在最终伤害上乘一次）
  pool.push({ id: 'bloodthirst', name: '嗜血', desc: '敌人受到的伤害 +20%（易伤，同类相加）；造成伤害的 1% 回复队伍生命', weight: W_MED, apply() { stats.vuln = (stats.vuln || 0) + 0.2; stats.lifesteal = (stats.lifesteal || 0) + 0.01; } });

  // 主动技能（时缓需解锁）
  if (!skills.slow.owned) {
    pool.push({ id: 'skill-slow', name: '主动技能：时缓', desc: '让所有敌人减速 3 秒（技能位 · 冷却 16s）', weight: 1.4, apply() { skills.slow.owned = true; skills.slow.cd = 0; } });
  } else {
    if (skills.slow.duration < 6) {
      pool.push({ id: 'slow-time', name: '时缓：时长 +1s', desc: '减速持续时间延长', weight: W_NORM, apply() { skills.slow.duration += 1; } });
    }
    if (skills.slow.cdMax > 8) {
      pool.push({ id: 'slow-cd', name: '时缓：冷却 -20%', desc: '技能转得更快', weight: W_NORM, apply() { skills.slow.cdMax = Math.max(8, Math.round(skills.slow.cdMax * 0.8)); } });
    }
  }

  // 携带武器：射速 / 弹丸 / 弹速（伤害成长走「强力子弹」，各卡均为无限次）
  weapons.forEach(w => {
    const def = WEAPON_DEFS[w.type];
    pool.push({ id: `${w.type}-rate`, name: `${def.name}：射速 +25%`, desc: '攻击速度提升', weight: W_NORM, route: w.type, apply() { weaponRate(w.type, 1.25); } });
    // 弹丸 +1 组：多射出一组原弹丸（散弹一次 3 发），代价是子弹伤害 ×0.9（独立乘区，不与其它子弹加成互抵）
    pool.push({ id: `${w.type}-pellet`, name: `${def.name}：弹丸 +${def.baseCount}`, desc: `每次攻击多射出一组弹丸（${def.baseCount} 发），子弹伤害 ×0.9（独立乘算）`, weight: W_NORM, route: w.type, apply() { getWeapon(w.type).extraCount += def.baseCount; weaponMul(w.type, 0.9); } });
    pool.push({ id: `${w.type}-bulletSpeed`, name: `${def.name}：弹速 +20%`, desc: '子弹飞得更快，更容易命中移动中的敌人', weight: W_NORM, route: w.type, apply() { const ww = getWeapon(w.type); ww.speedMul = (ww.speedMul || 1) * 1.2; } });
  });

  // 武器特殊选项
  const wtype = weapons[0] && weapons[0].type;
  if (wtype === 'rifle') {
    const w = getWeapon('rifle');
    if ((w.pierce || 0) < 3) {
      pool.push({ id: 'rifle-pierce', name: '步枪：穿透 +1', desc: '子弹穿透敌人（最多 3 次）', weight: W_NORM, route: 'rifle', apply() { const w = getWeapon('rifle'); w.pierce = Math.min(3, (w.pierce || 0) + 1); } });
    }
  } else if (wtype === 'shotgun') {
    const w = getWeapon('shotgun');
    if ((w.splitChance || 0) < 0.3) {
      pool.push({ id: 'shotgun-split', name: '散弹：击杀分裂 +10%', desc: '击杀敌人概率分裂 2 枚弹丸（最多 30%）', weight: W_NORM, route: 'shotgun', apply() { const w = getWeapon('shotgun'); w.splitChance = Math.min(0.3, (w.splitChance || 0) + 0.1); } });
    }
    if ((w.spreadMul || 1) > 0.45) {
      pool.push({ id: 'shotgun-focus', name: '散弹：散布 -15%', desc: '弹丸更集中，单体命中更高（最多收紧到 45%）', weight: W_NORM, route: 'shotgun', apply() { const w = getWeapon('shotgun'); w.spreadMul = Math.max(0.45, (w.spreadMul || 1) * 0.85); } });
    }
  } else if (wtype === 'laser') {
    // 狂暴：高风险高攻速，全局只出现一次
    if (!appliedIds.has('laser-special')) {
      pool.push({ id: 'laser-special', name: '机枪：狂暴', desc: '射速 +50%、移速 -15%、伤害 -30%（仅一次）', weight: 0.3, route: 'laser', apply() { weaponRate('laser', 1.5); stats.moveSpeed *= 0.85; weaponMul('laser', 0.7); } });
    }
  } else if (wtype === 'sniper') {
    const w = getWeapon('sniper');
    if ((w.pierce || 0) < 4) {
      pool.push({ id: 'sniper-pierce', name: '狙击枪：穿透 +1', desc: '子弹可多穿透 1 名敌人（最多 4）', weight: W_NORM, route: 'sniper', apply() { const w = getWeapon('sniper'); w.pierce = Math.min(4, (w.pierce || 0) + 1); } });
    }
    pool.push({ id: 'sniper-range', name: '狙击枪：射程 +20%', desc: '可以在更远处开火', weight: W_NORM, route: 'sniper', apply() { const w = getWeapon('sniper'); w.rangeMul = (w.rangeMul || 1) * 1.2; } });
    if (!appliedIds.has('sniper-charge')) {
      pool.push({ id: 'sniper-charge', name: '狙击枪：蓄力弹', desc: '子弹伤害加成 +30%（同类相加），射速 -25%（仅一次）', weight: 0.5, route: 'sniper', apply() { addDamageBonus('bullet', 0.3); weaponRate('sniper', 0.75); } });
    }
  }

  // ===== 元素类（走元素伤害，不吃召唤物加成） =====
  // 火球：命中敌人时触发
  if (!hasSummon('fireball')) {
    pool.push({ id: 'unlock-fireball', name: '元素：火球', desc: '命中敌人时召唤火球打最近敌人，带冷却（元素伤害）', weight: 1.2, route: 'fireball', apply() { addSummon('fireball'); } });
  } else {
    const fb = getSummon('fireball');
    pool.push({ id: 'fireball-dmg', name: '火球伤害 +30%', desc: '火球伤害提升（同类相加）', weight: W_NORM, route: 'fireball', apply() { summonMul('fireball', 1.3); } });
    pool.push({ id: 'fireball-cd', name: '火球冷却 -20%', desc: '召唤火球更频繁', weight: W_NORM, route: 'fireball', apply() { summonRate('fireball', 1.2); } });
    pool.push({ id: 'fireball-aoe', name: '火球爆炸范围 +20%', desc: '爆炸范围更大', weight: W_NORM, route: 'fireball', apply() { getSummon('fireball').aoeMul = (getSummon('fireball').aoeMul || 1) * 1.2; } });
    if (!fb.ignite) {
      pool.push({ id: 'fireball-ignite', name: '火球：点燃', desc: '命中点燃目标，火焰伤害持续 1s', weight: W_NORM, route: 'fireball', apply() { getSummon('fireball').ignite = true; } });
    } else {
      // 点燃后才能延长火焰时间
      pool.push({ id: 'fireball-burnTime', name: '火球：火焰持续时间 +0.5s', desc: '点燃持续时间延长', weight: W_NORM, route: 'fireball', apply() { getSummon('fireball').burnTime += 0.5; } });
    }
    pool.push({ id: 'fireball-more', name: '火球数量 +1', desc: '每次多召唤 1 颗火球，火球伤害 ×0.9（独立乘算）', weight: W_NORM, route: 'fireball', apply() { getSummon('fireball').extraCount += 1; summonMore('fireball', 0.9); } });
    if (!fb.killExplode) {
      pool.push({ id: 'fireball-killExplode', name: '火球：击杀爆炸', desc: '击杀怪物时爆炸造成范围伤害', weight: W_NORM, route: 'fireball', apply() { getSummon('fireball').killExplode = true; } });
    } else {
      // 击杀爆炸后才能强化爆炸
      pool.push({ id: 'fireball-killRadius', name: '击杀爆炸范围 +25%', desc: '击杀爆炸范围更大', weight: W_NORM, route: 'fireball', apply() { const s = getSummon('fireball'); s.killRadius = Math.round((s.killRadius || 60) * 1.25); } });
      pool.push({ id: 'fireball-killDmg', name: '击杀爆炸伤害 +30%', desc: '击杀爆炸伤害提升', weight: W_NORM, route: 'fireball', apply() { const s = getSummon('fireball'); s.killDmg = Math.round((s.killDmg || 15) * 1.3); } });
    }
  }

  // 雷电：命中敌人时随机劈一名敌人
  if (!hasSummon('lightning')) {
    pool.push({ id: 'unlock-lightning', name: '元素：雷电', desc: '命中敌人时召唤雷电随机攻击一名敌人（元素伤害）', weight: 1.2, route: 'lightning', apply() { addSummon('lightning'); } });
  } else {
    pool.push({ id: 'lightning-dmg', name: '雷电伤害 +30%', desc: '雷电伤害提升（同类相加）', weight: W_NORM, route: 'lightning', apply() { summonMul('lightning', 1.3); } });
    pool.push({ id: 'lightning-cd', name: '雷电冷却 -20%', desc: '召唤雷电更频繁', weight: W_NORM, route: 'lightning', apply() { summonRate('lightning', 1.2); } });
    pool.push({ id: 'lightning-more', name: '闪电 +1', desc: '每次多劈一道闪电（目标不足时重复劈同一敌人），雷电伤害 ×0.9（独立乘算）', weight: W_NORM, route: 'lightning', apply() { getSummon('lightning').extraCount += 1; summonMore('lightning', 0.9); } });
    if ((getSummon('lightning').chain || 0) < 3) {
      pool.push({ id: 'lightning-chain', name: '闪电：链式反应 +1', desc: '闪电延伸至附近敌人（最多 3）', weight: W_NORM, route: 'lightning', apply() { const s = getSummon('lightning'); s.chain = Math.min(3, (s.chain || 0) + 1); } });
    }
  }

  // 冰刺：定期向附近敌人射出冰刺，造成伤害并霜冻减速
  if (!hasSummon('ice')) {
    pool.push({ id: 'unlock-ice', name: '元素：冰刺', desc: '定期向附近敌人射出冰刺，造成伤害并被霜冻减速', weight: 1.2, route: 'ice', apply() { addSummon('ice'); } });
  } else {
    const ic = getSummon('ice');
    pool.push({ id: 'ice-dmg', name: '冰刺伤害 +30%', desc: '冰刺伤害提升（同类相加）', weight: W_NORM, route: 'ice', apply() { summonMul('ice', 1.3); } });
    pool.push({ id: 'ice-cd', name: '冰刺冷却 -20%', desc: '射出冰刺更频繁', weight: W_NORM, route: 'ice', apply() { summonRate('ice', 1.2); } });
    pool.push({ id: 'ice-targets', name: '冰刺目标 +1', desc: '多射出一发冰刺（敌人不足时重复命中同一目标），冰刺伤害 ×0.9（独立乘算）', weight: W_NORM, route: 'ice', apply() { getSummon('ice').extraTargets += 1; summonMore('ice', 0.9); } });
    pool.push({ id: 'ice-slow', name: '冰刺：霜冻更强', desc: '减速幅度更大（移速最低压到 25%）', weight: W_NORM, route: 'ice', apply() { const s = getSummon('ice'); s.slowMul = Math.max(0.45, (s.slowMul || 1) * 0.85); } });
    pool.push({ id: 'ice-slowTime', name: '冰刺：霜冻 +0.6s', desc: '减速持续时间延长', weight: W_NORM, route: 'ice', apply() { getSummon('ice').slowTime += 0.6; } });
    pool.push({ id: 'ice-range', name: '冰刺：范围 +20%', desc: '索敌范围更大', weight: W_NORM, route: 'ice', apply() { const s = getSummon('ice'); s.rangeMul = (s.rangeMul || 1) * 1.2; } });
    if (!ic.freezeChance) {
      pool.push({ id: 'ice-freeze', name: '冰刺：冰冻', desc: '命中时有 20% 概率把敌人冻成冰块（短暂无法移动）', weight: W_MED, route: 'ice', apply() { getSummon('ice').freezeChance = 0.2; } });
    } else {
      if ((ic.freezeChance || 0) < 0.6) {
        pool.push({ id: 'ice-freezeChance', name: '冰冻：概率 +15%', desc: '冰冻触发概率提升（最多 60%）', weight: W_NORM, route: 'ice', apply() { const s = getSummon('ice'); s.freezeChance = Math.min(0.6, (s.freezeChance || 0) + 0.15); } });
      }
      pool.push({ id: 'ice-freezeTime', name: '冰冻：时长 +0.4s', desc: '冰块持续更久', weight: W_NORM, route: 'ice', apply() { const s = getSummon('ice'); s.freezeTime = (s.freezeTime || 1.2) + 0.4; } });
    }
  }

  // ===== 召唤物（走召唤物伤害） =====
  // 镰刀：环绕自身旋转
  if (!hasSummon('scythe')) {
    pool.push({ id: 'unlock-scythe', name: '召唤：镰刀', desc: '环绕自身旋转，接触造成伤害', weight: 1.2, route: 'scythe', apply() { addSummon('scythe'); } });
  } else {
    const sc = getSummon('scythe');
    pool.push({ id: 'scythe-more', name: '镰刀数量 +1', desc: '多一把环绕的镰刀（额外刀刃只扩大覆盖面，不降低伤害）', weight: W_NORM, route: 'scythe', apply() { getSummon('scythe').extraCount += 1; } });
    pool.push({ id: 'scythe-speed', name: '镰刀飞行速度 +20%', desc: '镰刀转得更快', weight: W_NORM, route: 'scythe', apply() { summonRate('scythe', 1.2); } });
    pool.push({ id: 'scythe-dmg', name: '镰刀伤害 +30%', desc: '镰刀伤害提升（同类相加）', weight: W_NORM, route: 'scythe', apply() { summonMul('scythe', 1.3); } });
    pool.push({ id: 'scythe-size', name: '镰刀变大', desc: '刀刃体积与判定 +30%（环半径不变，更容易扫到贴身敌人）', weight: W_NORM, route: 'scythe', apply() { getSummon('scythe').sizeMul = (getSummon('scythe').sizeMul || 1) * 1.3; } });
    if ((sc.lifesteal || 0) < 0.20) {
      pool.push({ id: 'scythe-leech', name: '镰刀：饮血 +10%', desc: '镰刀造成伤害的 10% 回复队伍生命（最多叠 2 次）', weight: W_NORM, route: 'scythe', apply() { const s = getSummon('scythe'); s.lifesteal = Math.min(0.20, (s.lifesteal || 0) + 0.10); } });
    }
    // 阻挡子弹为递进升级：先 +15%，之后才出现 +20%（最高 45%）
    if ((sc.blockChance || 0.10) < 0.25) {
      pool.push({ id: 'scythe-block1', name: '镰刀阻挡子弹 +15%', desc: '概率挡掉敌方子弹', weight: W_NORM, route: 'scythe', apply() { const s = getSummon('scythe'); s.blockChance = Math.min(0.45, (s.blockChance || 0.10) + 0.15); } });
    } else if ((sc.blockChance || 0.10) < 0.45) {
      pool.push({ id: 'scythe-block2', name: '镰刀阻挡子弹 +20%', desc: '进一步概率挡掉敌方子弹', weight: W_NORM, route: 'scythe', apply() { const s = getSummon('scythe'); s.blockChance = Math.min(0.45, (s.blockChance || 0.10) + 0.20); } });
    }
    pool.push({ id: 'scythe-knockback', name: '镰刀：击退', desc: '命中击退敌人', weight: W_NORM, route: 'scythe', apply() { getSummon('scythe').knockback = true; } });
  }

  // 飞剑：常驻实体，在视野内的敌人之间穿梭斩击，无敌人时剑尖朝下绕角色环绕
  if (!hasSummon('sword')) {
    pool.push({ id: 'unlock-sword', name: '召唤：飞剑', desc: '召唤一柄飞剑在敌人之间穿梭贯穿；视野内没有敌人时剑尖朝下绕你环绕', weight: 1.2, route: 'sword', apply() { addSummon('sword'); } });
  } else {
    const sw = getSummon('sword');
    pool.push({ id: 'sword-dmg', name: '飞剑伤害 +30%', desc: '飞剑伤害提升（同类相加）', weight: W_NORM, route: 'sword', apply() { summonMul('sword', 1.3); } });
    pool.push({ id: 'sword-cd', name: '飞剑攻速 +20%', desc: '穿梭斩击更频繁', weight: W_NORM, route: 'sword', apply() { summonRate('sword', 1.2); } });
    pool.push({ id: 'sword-more', name: '飞剑 +1', desc: '多一柄飞剑同时穿梭，飞剑伤害 ×0.9（独立乘算）', weight: W_NORM, route: 'sword', apply() { getSummon('sword').extraCount += 1; summonMore('sword', 0.9); } });
    pool.push({ id: 'sword-range', name: '飞剑：索敌范围 +20%', desc: '视野更远，敌人一进视野就出剑', weight: W_NORM, route: 'sword', apply() { const s = getSummon('sword'); s.rangeMul = (s.rangeMul || 1) * 1.2; } });
    pool.push({ id: 'sword-speed', name: '飞剑：飞行速度 +20%', desc: '飞剑穿梭得更快', weight: W_NORM, route: 'sword', apply() { const s = getSummon('sword'); s.speedMul = (s.speedMul || 1) * 1.2; } });
    if ((sw.pierce || 0) < 2) {
      pool.push({ id: 'sword-pierce', name: '飞剑：连斩 +1', desc: '斩击时额外波及命中点附近的敌人（最多 2）', weight: W_NORM, route: 'sword', apply() { const s = getSummon('sword'); s.pierce = Math.min(2, (s.pierce || 0) + 1); } });
    }
    if (!sw.giant) {                         // 巨剑术：整条线只能拿一次
      pool.push({ id: 'sword-giant', name: '巨剑术', desc: '飞剑体型 +50%、伤害 +30%；剑身变长变宽，碰到它的敌人都会受伤（仅此一张）', weight: 0.8, route: 'sword', apply() { const s = getSummon('sword'); s.giant = true; s.sizeMul = 1.5; summonMul('sword', 1.3); } });
    }
  }

  // 宠物（唯一，若选择）
  if (pet) {
    const pd = PET_DEFS[pet.type];
    pool.push({ id: 'pet-dmg', name: `${pd.name}伤害 +30%`, desc: `${pd.name}伤害提升（同类相加）`, weight: W_NORM, apply() { pet.dmgAdd = (pet.dmgAdd || 0) + 0.3; pet.dmgMul = (pet.baseMul || 1) * Math.max(DMG_FLOOR, 1 + pet.dmgAdd); } });
    pool.push({ id: 'pet-speed', name: `${pd.name}攻速 +20%`, desc: `${pd.name}攻击更快`, weight: W_NORM, apply() { pet.rateMul *= 1.2; } });
  }

  // 进化：需「本路线强化次数」达标 + 专属前置满足，之后以低权重随机出现（不再保底）
  EVOLUTIONS.forEach(ev => {
    if (appliedIds.has(ev.id)) return;
    const need = ev.need || 3;
    if ((routePicks[ev.route] || 0) < need) return;
    if (!ev.req()) return;
    pool.push({ id: ev.id, name: ev.name, desc: `${ev.desc}（本路线强化需满 ${need} 次）`, weight: ev.weight || 0.8, evo: true, apply: ev.apply });
  });

  return pool;
}

// ==================== 初始化 / 重置 ====================
function makeSoldier() {
  return { x: squad.x, y: squad.y };
}

function addSoldier() {
  soldiers.push(makeSoldier());
  squadMaxHp = soldiers.length * soldierMaxHp();
  squadHp = Math.min(squadMaxHp, squadHp + soldierMaxHp());   // 新兵自带一整格血
}

// 共享血池上限（小兵数 / 生命上限变化后重算）
function refreshSquadPool() {
  squadMaxHp = soldiers.length * soldierMaxHp();
  squadHp = Math.max(0, Math.min(squadHp, squadMaxHp));
}

// 血池掉掉一格（= 一个小兵的血量）就消失一个小人
function dropSoldiersToFitPool() {
  const per = soldierMaxHp();
  const want = Math.max(0, Math.ceil(squadHp / per - 1e-6));
  while (soldiers.length > want) {
    const gone = soldiers.pop();
    spawnParticles(gone.x, gone.y, '#ff8f8f', 14);
    sfxHurt();
  }
  refreshSquadPool();
}

function healSquad(amount) {
  if (!(amount > 0) || !soldiers.length) return;
  squadHp = Math.min(squadMaxHp, squadHp + amount);
}

function healAll(ratio) {
  healSquad(squadMaxHp * ratio);
}

// 吸血回复：按伤害比例回队伍血池（数值提示做节流，避免刷屏）
let lastLeechText = 0;
function leechHeal(amount, color) {
  if (!(amount > 0) || !soldiers.length) return;
  healSquad(amount);
  if (gameTime - lastLeechText > 0.5) {
    lastLeechText = gameTime;
    spawnFloatText(squad.x, squad.y - 38, '吸血 +' + Math.max(1, Math.round(amount)), color || '#7ef07e');
  }
}

function initDecorations() {
  decorations = [];
  const types = ['grass', 'grass', 'grass', 'rock', 'rock', 'flower'];
  for (let i = 0; i < 90; i++) {
    decorations.push({ x: Math.random() * WORLD.w, y: Math.random() * WORLD.h, type: types[Math.floor(Math.random() * types.length)] });
  }
}

// 木桶 / 箱子（打碎掉金币与经验）与石柱（挡子弹的掩体）
function initObstacles() {
  obstacles = [];
  const kinds = ['barrel', 'barrel', 'barrel', 'crate', 'crate', 'pillar', 'pillar'];
  let guard = 0;
  while (obstacles.length < 18 && guard++ < 400) {
    const type = kinds[Math.floor(Math.random() * kinds.length)];
    const def = OBSTACLE_DEFS[type];
    const x = 60 + Math.random() * (WORLD.w - 120);
    const y = 60 + Math.random() * (WORLD.h - 120);
    if (Math.hypot(x - squad.x, y - squad.y) < 170) continue;              // 不挡出生点
    if (obstacles.some(o => Math.hypot(o.x - x, o.y - y) < o.r + def.r + 60)) continue;
    obstacles.push({ x, y, r: def.r, type, hp: def.hp, maxHp: def.hp, dead: false, hitT: 0 });
  }
}

function damageObstacle(o, dmg) {
  o.hitT = 0.15;
  spawnParticles(o.x, o.y, OBSTACLE_DEFS[o.type].color, 3);
  if (!isFinite(o.hp)) return;                                            // 石柱 / 树木不可破坏
  o.hp -= dmg;
  if (o.hp <= 0) {
    o.dead = true;
    const def = OBSTACLE_DEFS[o.type];
    runCoins += def.coin;
    drops.push({ x: o.x, y: o.y, r: 6, value: def.xp });
    spawnParticles(o.x, o.y, def.color, 14);
    sfxKill();
  }
}

// 障碍物阻挡：把圆形单位（玩家 / 小兵 / 敌人）从木桶 · 箱子 · 石柱 · 树木里推出来
function resolveObstacleCollision(ent, radius) {
  for (let pass = 0; pass < 2; pass++) {
    let hit = false;
    for (const o of obstacles) {
      if (o.dead) continue;
      const or = o.type === 'tree' ? ((o.grow || 0) < 1 ? 0 : o.r) : o.r;
      if (or <= 0) continue;                                 // 还没长成的树不挡路（与挡子弹一致）
      const dx = ent.x - o.x, dy = ent.y - o.y;
      const min = radius + or;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 0.001) {
        ent.x = o.x + min;                                   // 完全重合时随便推开
      } else {
        ent.x = o.x + (dx / d) * min;
        ent.y = o.y + (dy / d) * min;
      }
      hit = true;
    }
    if (!hit) break;
  }
}

function resolveEnemyCollisions() {
  for (const e of enemies) {
    if (e.dead) continue;
    resolveObstacleCollision(e, e.r);
  }
}

// 世界变化：Boss 被击败后，地图上长出树木与藤蔓（有总量上限，避免过密）
function spawnFlora(treeCount, vineCount) {
  const c = FLORA_CFG.vine;
  const treeCap = 36, vineCap = 20;
  treeCount = Math.min(treeCount, Math.max(0, treeCap - obstacles.filter(o => o.type === 'tree').length));
  vineCount = Math.min(vineCount, Math.max(0, vineCap - vines.length));
  let guard = 0, added = 0;
  while (added < treeCount && guard++ < 400) {
    const p = floraSpot(170, 400);                                             // 多数长在视野附近，便于看到生长过程
    if (Math.hypot(p.x - squad.x, p.y - squad.y) < 150) continue;              // 不在玩家脚下生成
    if (obstacles.some(o => Math.hypot(o.x - p.x, o.y - p.y) < o.r + FLORA_CFG.tree.r + 50)) continue;
    // grow: 0→1 生长动画，长成前不挡子弹、不积累苏醒进度
    obstacles.push({ x: p.x, y: p.y, r: FLORA_CFG.tree.r, type: 'tree', hp: Infinity, maxHp: Infinity, dead: false, hitT: 0, aggro: 0, grow: 0 });
    spawnParticles(p.x, p.y + FLORA_CFG.tree.r * 0.9, '#6b8f4a', 8);
    added++;
  }
  guard = 0; added = 0;
  while (added < vineCount && guard++ < 400) {
    const p = floraSpot(250, 460);
    if (Math.hypot(p.x - squad.x, p.y - squad.y) < 220) continue;              // 与玩家保持安全距离
    if (vines.some(v => Math.hypot(v.x - p.x, v.y - p.y) < 150)) continue;
    // state 'grow'：长出动画，长成后才可触发缠绕
    vines.push({ x: p.x, y: p.y, state: 'grow', t: c.growTime, life: c.minLife + Math.random() * (c.maxLife - c.minLife), cool: 0 });
    spawnParticles(p.x, p.y, '#5fae3a', 8);
    added++;
  }
}

// 生成点：60% 落在玩家视野附近（距离 minD~maxD 的环带），其余在世界内随机
function floraSpot(minD, maxD) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (Math.random() < 0.6) {
    const a = Math.random() * Math.PI * 2;
    const d = minD + Math.random() * (maxD - minD);
    return {
      x: clamp(squad.x + Math.cos(a) * d, 60, WORLD.w - 60),
      y: clamp(squad.y + Math.sin(a) * d, 60, WORLD.h - 60),
    };
  }
  return { x: 60 + Math.random() * (WORLD.w - 120), y: 60 + Math.random() * (WORLD.h - 120) };
}

// 树木被长时间靠近 → 苏醒为树怪
function awakenTree(o) {
  o.dead = true;
  shake = Math.min(10, shake + 3);
  sfxExplode();
  spawnParticles(o.x, o.y, '#4e7a3a', 24);
  spawnParticles(o.x, o.y, '#8a6a3a', 10);
  spawnFloatText(o.x, o.y - o.r - 16, '树怪苏醒！', '#8fe06a');
  spawnEnemy('treant', o.x, o.y);
}

// ==================== 上把进度（返回主菜单时保留） ====================
// 把整局状态存进账号存档；再次点「开始游戏」直接回到当时的暂停 / 设置界面
function snapshotRun() {
  return {
    v: 1,
    squad, soldiers, weapons, summons, pet,
    enemies: enemies.map(e => Object.assign({}, e, { skillHit: null })),
    bullets: bullets.map(b => Object.assign({}, b, { hit: null, target: null })),
    enemyBullets, drops, obstacles, vines,
    stats, camera, skills,
    dmgBonus, dmgBase, eleRateBonus, pickCount,
    appliedIds: [...appliedIds],
    routePicks,
    squadRootedT, enemySlowT, squadHp, squadMaxHp,
    wave, kills, runCoins, level, xp, xpToNext, choiceCount, gameTime,
    difficulty, bossKills, spawnTimer, waveSpawned, waveSize,
    dividers, decorations,
  };
}

function saveRun() {
  try {
    meta.run = JSON.parse(JSON.stringify(snapshotRun()));
  } catch (e) {
    meta.run = null;
  }
  saveMeta();
}

function restoreRun(s) {
  if (!s || !s.squad || !Array.isArray(s.obstacles)) return false;
  try {
    squad = s.squad;
    soldiers = s.soldiers || [];
    weapons = s.weapons || [];
    summons = s.summons || [];
    pet = s.pet || null;
    enemies = s.enemies || [];
    bullets = s.bullets || [];
    enemyBullets = s.enemyBullets || [];
    drops = s.drops || [];
    obstacles = s.obstacles || [];
    vines = s.vines || [];
    stats = s.stats;
    stats.vuln = stats.vuln || 0;              // 兼容旧快照（缺字段会算出 NaN）
    stats.lifesteal = stats.lifesteal || 0;
    stats.regen = stats.regen || 0;
    stats.bloodOrb = stats.bloodOrb || 0;
    camera = s.camera || { x: 0, y: 0 };
    skills = s.skills;
    if (s.dmgBonus) {
      dmgBonus = s.dmgBonus;
      dmgBase = s.dmgBase || dmgBase;
      eleRateBonus = s.eleRateBonus || 0;
      pickCount = s.pickCount || {};
      recalcDamage();                       // 乘区与 stats 保持一致
    }
    appliedIds = new Set(s.appliedIds || []);
    routePicks = s.routePicks || {};
    squadRootedT = s.squadRootedT || 0;
    enemySlowT = s.enemySlowT || 0;
    squadHp = s.squadHp || 0;
    squadMaxHp = s.squadMaxHp || 0;
    if (squadMaxHp <= 0) refreshSquadPool();          // 兼容旧快照
    if (!(squadHp > 0)) squadHp = squadMaxHp;
    if (!squad.invulnT) squad.invulnT = 0;
    wave = s.wave || 1;
    kills = s.kills || 0;
    runCoins = s.runCoins || 0;
    level = s.level || 1;
    xp = s.xp || 0;
    xpToNext = s.xpToNext || 15;
    choiceCount = s.choiceCount || 3;
    gameTime = s.gameTime || 0;
    difficulty = s.difficulty || 1;
    bossKills = s.bossKills || 0;
    spawnTimer = s.spawnTimer || 1;
    waveSpawned = s.waveSpawned || 0;
    waveSize = s.waveSize || 5;
    dividers = s.dividers || [];
    decorations = s.decorations || [];
    particles = [];
    lightningBolts = [];
    iceSpikes = [];
    blasts = [];
    swordSlashes = [];
    hitStop = 0;
    banner = { text: '', t: 0 };

    // 修正 JSON 存不下 / 会丢类型的字段
    enemies.forEach(e => { if (!e.skillHit || typeof e.skillHit.has !== 'function') e.skillHit = null; });
    bullets.forEach(b => { if (!b.hit || typeof b.hit.has !== 'function') b.hit = null; });
    // 兼容旧快照：补齐局内能力的类别与新增字段（否则元素类会错吃召唤物加成）
    summons.forEach(s => {
      const def = POWER_DEFS[s.type];
      if (!def) return;
      if (!s.cls) s.cls = def.cls;
      Object.entries(def.init || {}).forEach(([k, v]) => { if (s[k] === undefined) s[k] = v; });
      if (s.dmgMul === undefined) refreshSummonMul(s);
    });
    obstacles.forEach(o => {
      if (o.type === 'pillar' || o.type === 'tree') { o.hp = Infinity; o.maxHp = Infinity; }
    });
    return true;
  } catch (e) {
    return false;
  }
}

// 开始游戏：有存档回到上把的暂停界面，没有就开始新局
function continueRun() {
  if (!restoreRun(meta.run)) { startGame(); return; }
  initAudio();
  startMusic();
  applyOrientation();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('btn-pause').classList.remove('hidden');
  state = 'playing';
  updateCamera();
  last = performance.now();
  fpsAccum = 0;
  pauseGame();
}

function reset() {
  squad = { x: WORLD.w / 2, y: WORLD.h / 2, tx: WORLD.w / 2, ty: WORLD.h / 2, moving: false, shield: 0, shieldMax: 0, shieldRegenTimer: 0, invulnT: 0 };
  soldiers = [];
  squadHp = 0;
  squadMaxHp = 0;
  weapons = [];
  summons = [];
  pet = null;
  enemies = [];
  bullets = [];
  enemyBullets = [];
  drops = [];
  particles = [];
  lightningBolts = [];
  iceSpikes = [];
  blasts = [];
  swordSlashes = [];
  hitStop = 0;
  obstacles = [];
  vines = [];
  squadRootedT = 0;
  stats = {
    moveSpeed: 1, maxHp: 1,
    bulletDamage: 1, elementalDamage: 1, summonDamage: 1, petDamage: 1,
    pickupRange: 1, invulnDuration: 0, damageTaken: 1, dodge: 0, bulletKnockback: 0, elementalCd: 1,
    vuln: 0, lifesteal: 0, regen: 0, bloodOrb: 0,
  };
  camera = { x: 0, y: 0 };
  wave = 1;
  kills = 0;
  runCoins = 0;
  level = 1;
  xp = 0;
  xpToNext = 15;
  choiceCount = 3;
  gameTime = 0;
  difficulty = 1;
  bossKills = 0;
  spawnTimer = 1;
  waveSpawned = 0;
  waveSize = 5;

  // 应用局外装备（伤害加成 / 受伤减免）
  const eq = EQUIPMENT_DEFS[meta.equipped.equipment] || EQUIPMENT_DEFS.none;
  dmgBonus = { bullet: 0, ele: 0, summon: 0, pet: 0 };
  dmgBase = { bullet: eq.damageDealt, ele: 1, summon: 1, pet: 1 };
  eleRateBonus = 0;
  pickCount = {};
  recalcDamage();
  stats.damageTaken = eq.damageTaken;
  stats.bloodOrb = eq.bloodOrb || 0;                       // 血珠
  const it = ITEM_DEFS[meta.equipped.item] || ITEM_DEFS.none;
  stats.regen = it.regen || 0;                             // 回血宝珠

  dividers = [];
  const dn = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < dn; i++) dividers.push(Math.random() * WORLD.h);

  for (let i = 0; i < CFG.soldierCount; i++) addSoldier();

  // 携带武器
  addWeapon(meta.equipped.weapon);

  // 宠物（唯一）：把局外养成（等级 / 升星 / 天赋 / 词条）折算成局内基础值
  if (meta.equipped.pet && meta.equipped.pet !== 'none') {
    const pb = petBonus(meta.equipped.pet);
    pet = {
      type: meta.equipped.pet, dmgMul: pb.dmgMul, dmgAdd: 0, rateMul: pb.rateMul, shootCd: 0,
      baseMul: pb.dmgMul, baseRate: pb.rateMul, extraShots: pb.extraShots, rangeMul: pb.rangeMul,
      hitHeal: pb.hitHeal, killShield: pb.killShield, burnMul: pb.burnMul, burnTimeMul: pb.burnTimeMul,
      igniteSpread: pb.igniteSpread,
      star: petDev(meta.equipped.pet).star, lv: petDev(meta.equipped.pet).lv, flashT: 0,
    };
  }
  petRunExp = 0;

  initDecorations();
  initObstacles();

  // 主动技能 / 重掷 / 已获升级
  skills = {
    slow: { owned: false, cd: 0, cdMax: SKILL_DEFS.slow.cd, duration: SKILL_DEFS.slow.duration },
  };
  enemySlowT = 0;
  appliedIds = new Set();
  routePicks = {};
  rerollLeft = 3;
  updateCamera();
}

// ==================== 输入 ====================
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  initAudio();
  if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
  if (e.key.toLowerCase() === 'q') useSkill('slow');
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function screenPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top) * (H / rect.height),
  };
}

canvas.addEventListener('pointerdown', e => {
  initAudio();
  if (state !== 'playing') return;
  const p = screenPoint(e);
  joystick.active = true;
  joystick.ox = p.x; joystick.oy = p.y;
  joystick.dx = 0; joystick.dy = 0;
  joystick.id = e.pointerId;
});
canvas.addEventListener('pointermove', e => {
  if (state !== 'playing' || !joystick.active || e.pointerId !== joystick.id) return;
  const p = screenPoint(e);
  let dx = p.x - joystick.ox, dy = p.y - joystick.oy;
  const len = Math.hypot(dx, dy);
  const max = 50;
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  joystick.dx = dx; joystick.dy = dy;
});
canvas.addEventListener('pointerup', e => { if (e.pointerId === joystick.id) joystick.active = false; });
canvas.addEventListener('pointercancel', () => { joystick.active = false; });

// ==================== 更新逻辑 ====================
function updateCamera() {
  camera.x = Math.max(0, Math.min(WORLD.w - W, squad.x - W / 2));
  camera.y = Math.max(0, Math.min(WORLD.h - H, squad.y - H / 2));
}

function updateSquad(dt) {
  if (squadRootedT > 0) squadRootedT = Math.max(0, squadRootedT - dt);

  let mx = 0, my = 0;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (keys['w'] || keys['arrowup']) my -= 1;
  if (keys['s'] || keys['arrowdown']) my += 1;

  // 虚拟摇杆（保留 WASD）
  if (joystick.active && (joystick.dx || joystick.dy)) {
    const jl = Math.hypot(joystick.dx, joystick.dy);
    if (jl > 8) {
      mx += joystick.dx / jl;
      my += joystick.dy / jl;
    }
  }

  if (squadRootedT > 0) { mx = 0; my = 0; }   // 被藤蔓缠住时无法移动

  if (mx || my) {
    const l = Math.hypot(mx, my);
    const dx = mx / l, dy = my / l;
    squad.x += dx * moveSpeed() * dt;
    squad.y += dy * moveSpeed() * dt;
  }

  resolveObstacleCollision(squad, S.soldierR);   // 木桶 / 箱子 / 石柱 / 树木阻挡
  squad.x = Math.max(S.soldierR, Math.min(WORLD.w - S.soldierR, squad.x));
  squad.y = Math.max(S.soldierR, Math.min(WORLD.h - S.soldierR, squad.y));
  updateCamera();
}

function updateShield(dt) {
  if (squad.shieldMax <= 0) return;
  if (squad.shieldRegenTimer > 0) {
    squad.shieldRegenTimer -= dt;
  } else if (squad.shield < squad.shieldMax) {
    squad.shield = Math.min(squad.shieldMax, squad.shield + CFG.shieldRegenRate * dt);
  }
}

function formationOffset(i, n) {
  const perRow = 4;
  const row = Math.floor(i / perRow);
  const col = i % perRow;
  const inRow = Math.min(n - row * perRow, perRow);
  const startX = -(inRow - 1) * S.spacing / 2;
  return { ox: startX + col * S.spacing, oy: -row * S.spacing };
}

function nearestEnemy(x, y, maxDist) {
  let best = null, bd = maxDist * maxDist;
  for (const e of enemies) {
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function nearestSoldier(x, y) {
  let best = null, bd = Infinity;
  for (const s of soldiers) {
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function updateSoldiers(dt) {
  soldiers.forEach((s, i) => {
    const off = formationOffset(i, soldiers.length);
    const tx = squad.x + off.ox;
    const ty = squad.y + off.oy;
    s.x += (tx - s.x) * Math.min(1, dt * 10);
    s.y += (ty - s.y) * Math.min(1, dt * 10);
    resolveObstacleCollision(s, S.soldierR * 0.85);
  });
  if (squad.invulnT > 0) squad.invulnT = Math.max(0, squad.invulnT - dt);
}

// ==================== 主动技能 ====================
function updateSkills(dt) {
  if (skills.slow.cd > 0) skills.slow.cd = Math.max(0, skills.slow.cd - dt);
  if (enemySlowT > 0) enemySlowT = Math.max(0, enemySlowT - dt);
}

function useSkill(name) {
  if (state !== 'playing') return;
  const s = skills[name];
  if (!s || !s.owned || s.cd > 0) return;

  enemySlowT = s.duration;
  s.cd = s.cdMax;
  spawnParticles(squad.x, squad.y, '#9de0ff', 18);
  shake = Math.min(10, shake + 2);
  sfxSlow();
}

// 技能按钮（DOM）：显示冷却进度
function setSkillBtn(btn, key) {
  const s = skills[key];
  const label = s.cd > 0 ? String(Math.ceil(s.cd)) : SKILL_DEFS[key].name;
  if (btn.dataset.txt !== label) { btn.dataset.txt = label; btn.textContent = label; }
  const p = s.cdMax > 0 ? Math.max(0, Math.min(1, s.cd / s.cdMax)).toFixed(2) : '0';
  if (btn.dataset.p !== p) { btn.dataset.p = p; btn.style.setProperty('--p', p); }
}

function renderSkillButtons() {
  const slowBtn = document.getElementById('skill-slow');
  const playing = state === 'playing';
  slowBtn.classList.toggle('hidden', !playing || !skills.slow.owned);
  if (!playing) return;
  if (skills.slow.owned) setSkillBtn(slowBtn, 'slow');
}

// 武器系统：攻击间隔作为 CD
function updateWeapons(dt) {
  weapons.forEach(w => {
    const def = WEAPON_DEFS[w.type];
    w.cd -= dt;
    const reload = def.reload / (w.rateMul || 1);
    if (w.cd <= 0) {
      const target = nearestEnemy(squad.x, squad.y, def.range * (w.rangeMul || 1));
      if (target) {
        soldiers.forEach(s => fireWeapon(w, s.x, s.y, target));
        w.cd = reload;
      }
    }
  });
}

function fireWeapon(w, x, y, target) {
  const def = WEAPON_DEFS[w.type];
  const cnt = def.baseCount + w.extraCount;
  const dmg = def.dmg * w.dmgMul * stats.bulletDamage;
  const pierce = w.pierce || 0;
  const split = w.splitChance || 0;
  const splitCount = w.splitCount || 2;
  const speed = def.speed * (w.speedMul || 1);
  const spread = (def.spread || 0) * (w.spreadMul === undefined ? 1 : w.spreadMul);
  sfxShoot();
  const baseAng = Math.atan2(target.y - y, target.x - x);
  const volley = spread ? baseAng + (Math.random() - 0.5) * spread : baseAng;   // 整轮共用一次散布
  const offStep = def.offset || 8;
  const conv = def.converge || 0;
  for (let i = 0; i < cnt; i++) {
    // 多发弹道：沿垂直方向错开枪口位置；有 converge 的武器（散弹）在 converge 距离处收束，
    // 于是「弹丸越多 = 总伤害越高」在近距成立，超出收束距离才散开
    const off = (i - (cnt - 1) / 2) * offStep;
    const bx = x + Math.cos(volley + Math.PI / 2) * off;
    const by = y + Math.sin(volley + Math.PI / 2) * off;
    let ang = volley;
    if (conv > 0) {
      const tx = x + Math.cos(volley) * conv, ty = y + Math.sin(volley) * conv;
      ang = Math.atan2(ty - by, tx - bx);
    }
    if (spread) ang += (Math.random() - 0.5) * spread * (conv > 0 ? 0.3 : 1);   // 收束弹丸只留少量抖动
    const b = { x: bx, y: by, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg, r: def.tracer ? 4 : 3, aoe: 0, burnDps: 0, burnTime: 0, color: def.color, pierce, split, splitCount, hit: null, tracer: !!def.tracer };
    if (def.falloff) {                 // 距离衰减：命中时按飞行距离结算（贴脸增伤、远距减伤）
      b.sx = bx; b.sy = by;
      b.fo = def.falloff;
    }
    if (w.closeGuard) b.guard = true;  // 进化 · 铁壁霰弹：近距离击杀回馈
    bullets.push(b);
  }
}

// 距离衰减倍率：near 内 ×nearMul，far 外 ×farMul，中间线性
function falloffMul(b) {
  const f = b.fo;
  const d = Math.hypot(b.x - b.sx, b.y - b.sy);
  const t = Math.min(1, Math.max(0, (d - f.near) / (f.far - f.near)));
  return f.nearMul + (f.farMul - f.nearMul) * t;
}

// 进化 · 铁壁霰弹：近距离击杀回复队伍生命与护盾（提示做节流，避免刷屏）
let lastGuardText = 0;
function closeKillReward() {
  healSquad(3);
  if (squad.shieldMax > 0) squad.shield = Math.min(squad.shieldMax, squad.shield + 2);
  if (gameTime - lastGuardText > 0.5) {
    lastGuardText = gameTime;
    spawnFloatText(squad.x, squad.y - 38, '抵近 +3', '#9be060');
  }
}

// 局内能力系统：元素类（火球 / 雷电 / 冰刺）+ 召唤物（镰刀 / 飞剑）
function updateSummons(dt) {
  summons.forEach(s => {
    if (s.type === 'scythe') {
      const def = SUMMON_DEFS.scythe;
      s.orbitAngle = (s.orbitAngle || 0) + def.orbitSpeed * (s.rateMul || 1) * dt;
      updateScythe(s);
    } else if (s.type === 'sword') {
      updateSword(s, dt);
    } else if (s.type === 'ice') {
      s.cd -= dt;
      updateIce(s);
    } else {
      s.cd -= dt;                    // 火球 / 雷电：由攻击命中时触发
    }
  });
}

function updateScythe(s) {
  const def = SUMMON_DEFS.scythe;
  const cnt = def.baseCount + s.extraCount;
  const dmg = def.dmg * s.dmgMul * powerBaseDamage(s);
  const rad = def.orbitRadius;                    // 环半径固定：变大只放大刀刃，不会把刀推远
  const hitR = def.hitR * (s.sizeMul || 1);       // 判定半径（含刀刃容差），贴身敌人也能扫到
  for (let i = 0; i < cnt; i++) {
    const a = (s.orbitAngle || 0) + (Math.PI * 2 / cnt) * i;
    const bx = squad.x + Math.cos(a) * rad;
    const by = squad.y + Math.sin(a) * rad;
    for (const e of enemies) {
      if (Math.hypot(bx - e.x, by - e.y) < hitR + e.r) {
        if (!e.scytheT || gameTime - e.scytheT > def.hitCd) {
          hitEnemy(e, dmg, 0, 0);
          if (s.lifesteal > 0) leechHeal(dmg * s.lifesteal);       // 吸血（饮血卡 / 进化 · 死神镰刀）
          if (s.knockback && e.kbT <= 0 && e.type !== 'boss') {   // Boss 免疫击退
            const kx = e.x - bx, ky = e.y - by;
            const kl = Math.hypot(kx, ky) || 1;
            e.kbx = (kx / kl) * 240;
            e.kby = (ky / kl) * 240;
            e.kbT = 1; // 1 秒击退抗性
          }
          e.scytheT = gameTime;
        }
      }
    }
  }
}

// 火球：攻击命中敌人时召唤，带冷却（元素伤害）
function triggerFireball() {
  const s = getSummon('fireball');
  if (!s) return;
  const def = ELEMENT_DEFS.fireball;
  const cd = def.cd / (s.rateMul || 1) * (stats.elementalCd || 1);
  if (s.cd > 0) return;
  const target = nearestEnemy(squad.x, squad.y, Infinity);
  if (!target) return;
  const origin = soldiers[0] || squad;
  const cnt = 1 + (s.extraCount || 0);
  for (let i = 0; i < cnt; i++) {
    fireFireballBullet(origin.x, origin.y, target, s, (i - (cnt - 1) / 2) * 0.15);
  }
  s.cd = cd;
}

function fireFireballBullet(x, y, target, s, jitter = 0) {
  const def = ELEMENT_DEFS.fireball;
  const dmg = def.dmg * s.dmgMul * powerBaseDamage(s);
  const aoe = def.aoe * (s.aoeMul || 1);
  const burnDps = s.ignite ? def.burnDps : 0;
  const burnTime = s.ignite ? (s.burnTime || 1) : 0;
  const base = Math.atan2(target.y - y, target.x - x) + jitter;
  bullets.push({ x, y, vx: Math.cos(base) * def.speed, vy: Math.sin(base) * def.speed, dmg, r: 6, aoe, burnDps, burnTime, color: def.color, pierce: 0, split: 0, hit: null, fireball: true });
}

// 雷电：攻击命中敌人时随机劈一名敌人，带冷却（元素伤害）
function triggerLightning() {
  const s = getSummon('lightning');
  if (!s) return;
  const def = ELEMENT_DEFS.lightning;
  const cd = def.cd / (s.rateMul || 1) * (stats.elementalCd || 1);
  if (s.cd > 0) return;
  if (enemies.length === 0) return;
  const dmg = def.dmg * s.dmgMul * powerBaseDamage(s);
  const strikes = (def.strikes || 1) + (s.extraCount || 0);
  const chain = s.chain || 0;
  const hit = new Set();
  const alive = () => enemies.filter(e => !e.dead && !hit.has(e));   // 尚未被劈到的敌人（优先）
  const any = () => enemies.filter(e => !e.dead);

  let pool = alive();
  if (!pool.length) return;
  let cur = pool[Math.floor(Math.random() * pool.length)];
  strikeEnemy(cur, dmg, hit);

  for (let i = 1; i < strikes; i++) {
    // 目标不够时重复劈已命中的敌人，保证「闪电 +1」在单体战里也有收益
    pool = alive();
    if (!pool.length) pool = any();
    if (!pool.length) break;
    cur = pool[Math.floor(Math.random() * pool.length)];
    strikeEnemy(cur, dmg, hit);
  }

  for (let c = 0; c < chain; c++) {
    const next = nearestUnstruck(cur.x, cur.y, hit, 200);
    if (!next) break;
    strikeEnemy(next, dmg, hit);
    cur = next;
  }
  s.cd = cd;
}

function strikeEnemy(e, dmg, hit) {
  if (stats.vuln > 0) dmg *= 1 + stats.vuln;      // 易伤同样作用于雷电
  e.hp -= dmg;
  spawnDamageNumber(e.x, e.y, dmg, '#9de0ff');
  sfxThunder();
  spawnLightningBolt(e.x, e.y);
  if (stats.lifesteal > 0) leechHeal(dmg * stats.lifesteal);
  if (e.hp <= 0) killEnemy(e);
  hit.add(e);
}

function nearestUnstruck(x, y, hit, radius) {
  let best = null, bd = radius * radius;
  for (const e of enemies) {
    if (hit.has(e) || e.dead) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// 落雷：预生成锯齿路径 + 分叉，配合命中闪光与地面冲击环（短促的一劈）
function spawnLightningBolt(x, y) {
  const top = y - 118;
  const n = 5;
  const segs = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const jitter = (i === 0 || i === n) ? 0 : (Math.random() - 0.5) * 18;
    segs.push({ x: x + jitter, y: top + (y - top) * t });
  }
  const fi = 1 + Math.floor(Math.random() * 3);
  const forks = [{
    x1: segs[fi].x, y1: segs[fi].y,
    x2: segs[fi].x + (Math.random() - 0.5) * 46,
    y2: segs[fi].y + 14 + Math.random() * 20,
  }];
  const life = 0.26;
  lightningBolts.push({ x, y, segs, forks, life, maxLife: life, seed: Math.random() * 100 });
  spawnParticles(x, y, '#9de0ff', 12);
}

function updateLightningBolts(dt) {
  for (const b of lightningBolts) b.life -= dt;
  lightningBolts = lightningBolts.filter(b => b.life > 0);
}

function updateIceSpikes(dt) {
  for (const s of iceSpikes) s.life -= dt;
  iceSpikes = iceSpikes.filter(s => s.life > 0);
}

function updateBlasts(dt) {
  for (const b of blasts) b.life -= dt;
  blasts = blasts.filter(b => b.life > 0);
}

// 冰刺：周期性向附近敌人射出冰刺，命中造成元素伤害并附带霜冻减速（可升级冰冻）
function updateIce(s) {
  if (s.cd > 0) return;
  const def = ELEMENT_DEFS.ice;
  const range = def.range * (s.rangeMul || 1);
  const targets = [];
  for (const e of enemies) {
    if (e.dead) continue;
    if (Math.hypot(e.x - squad.x, e.y - squad.y) <= range) targets.push(e);
  }
  if (!targets.length) return;
  targets.sort((a, b) => Math.hypot(a.x - squad.x, a.y - squad.y) - Math.hypot(b.x - squad.x, b.y - squad.y));
  // 目标不够时循环取用（重复命中同一敌人），保证「冰刺目标 +1」在单体战里也有收益
  const cnt = (def.targets || 1) + (s.extraTargets || 0);
  const dmg = def.dmg * s.dmgMul * powerBaseDamage(s);
  const origin = soldiers[0] || squad;
  const frost = {
    mul: def.slowMul * (s.slowMul || 1),
    time: def.slowTime * (s.slowTime || 1),
    chance: s.freezeChance || 0,
    freezeTime: s.freezeTime || 1.2,
  };
  for (let i = 0; i < cnt; i++) {
    const e = targets[i % targets.length];
    const ang = Math.atan2(e.y - origin.y, e.x - origin.x);
    bullets.push({
      x: origin.x, y: origin.y - 6,
      vx: Math.cos(ang) * def.speed, vy: Math.sin(ang) * def.speed,
      dmg, r: def.spikeR, aoe: 0, burnDps: 0, burnTime: 0, color: def.color,
      pierce: 0, split: 0, hit: null, ice: true, frost, homing: 3.2, target: e,
    });
  }
  sfxIce();
  s.cd = def.cd / (s.rateMul || 1) * (stats.elementalCd || 1);
}

// 冰刺命中：霜冻减速 + 概率冰冻，并在命中处炸开碎冰
function applyIceHit(b, e) {
  applyFrost(e, b.frost.mul, b.frost.time);
  if (b.frost.chance > 0 && Math.random() < b.frost.chance) {
    e.freezeT = Math.max(e.freezeT || 0, b.frost.freezeTime * (e.type === 'boss' ? 0.5 : 1));
  }
  iceSpikes.push({ x: b.x, y: b.y, r: Math.max(11, e.r * 1.05), life: 0.42, maxLife: 0.42, seed: Math.random() * 10 });
  spawnParticles(b.x, b.y, '#8fe3ff', 10);
  spawnParticles(b.x, b.y, '#dff6ff', 5);
}

// 霜冻：减速（Boss 元素效果减半：时长与减速幅度都减半）
function applyFrost(e, mul, time) {
  const boss = e.type === 'boss';
  const t = time * (boss ? 0.5 : 1);
  const m = boss ? 1 - (1 - mul) * 0.5 : mul;
  e.frostT = Math.max(e.frostT || 0, t);
  e.frostMul = Math.min(e.frostMul === undefined ? 1 : e.frostMul, Math.max(0.15, m));
}

// 飞剑索敌：视野（以小队为中心）内优先选「短时间内没被任何飞剑穿过」的最近敌人
// 软避让，不做硬性占位 —— 优先级：刚没被穿过的 > 只有自己刚穿过的那个 > 刚被别的剑穿过的
function pickSwordTarget(bx, by, range, avoid) {
  let best = null, bd = Infinity;         // 近期没被穿过、也不是自己刚穿过的
  let fresh = null, fd = Infinity;        // 近期没被穿过，但正是自己刚穿过的那个
  let alt = null, ad = Infinity;          // 刚被别的飞剑穿过（都刚被打过时才一起上）
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    if (Math.hypot(e.x - squad.x, e.y - squad.y) > range) continue;
    const d = Math.hypot(e.x - bx, e.y - by);
    if (gameTime - (e.swordT || -1e9) < SUMMON_DEFS.sword.softAvoid) {
      if (d < ad) { ad = d; alt = e; }
      continue;
    }
    if (e === avoid) {
      if (d < fd) { fd = d; fresh = e; }
      continue;
    }
    if (d < bd) { bd = d; best = e; }
  }
  return best || fresh || alt;
}

// 飞剑：召唤一柄持续存在的飞剑，径直贯穿敌人造成伤害；视野内无敌人时剑尖朝下绕角色环绕
function updateSword(s, dt) {
  const def = SUMMON_DEFS.sword;
  const cnt = def.baseCount + s.extraCount;
  if (!s.blades) s.blades = [];
  while (s.blades.length < cnt) {
    const i = s.blades.length;
    const a = (Math.PI * 2 / cnt) * i;      // 直接落在环绕轨道上，多柄均匀分布
    s.blades.push({
      x: squad.x + Math.cos(a) * def.orbitRadius, y: squad.y + Math.sin(a) * def.orbitRadius,
      // 初始冷却按柄序等分错峰，多柄不会同一时刻一起撞上去
      ang: Math.PI / 2, cool: (i / cnt) * def.hitCd, tgt: null, last: null, bob: a, exit: 0, spd: 0,
      hot: false, hitSet: [], guardT: 0,
    });
  }
  if (s.blades.length > cnt) s.blades.length = cnt;

  const dmg = def.dmg * s.dmgMul * powerBaseDamage(s);
  const speed = def.speed * (s.speedMul || 1);
  const range = def.range * (s.rangeMul || 1);
  const hitCd = def.hitCd / (s.rateMul || 1);
  const chain = s.pierce || 0;
  const bladeR = 10 * (s.sizeMul || 1);         // 剑身判定半径：巨剑术放大体型后，碰到它的单位都会受伤
  s.orbitAng = (s.orbitAng || 0) + def.orbitSpeed * dt;   // 回收状态的环绕相位

  // 沿途贯穿：把本帧位移线段上扫到的敌人全部结算（同一趟每只只吃一次）；
  // 冷却没走完时只穿身不结算，但同样会结束这一趟，避免贴着敌人反复穿刺
  const pierce = (b, x0, y0) => {
    const dx = b.x - x0, dy = b.y - y0;
    const L2 = dx * dx + dy * dy || 1;
    let first = null, ft = 2;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      let t = ((e.x - x0) * dx + (e.y - y0) * dy) / L2;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const nx = x0 + dx * t, ny = y0 + dy * t;
      if (Math.hypot(e.x - nx, e.y - ny) > bladeR + e.r) continue;
      if (t < ft) { ft = t; first = e; }
      if (b.cool > 0 && !b.hot) continue;          // 冷却中：穿过去，不结算
      if (b.hitSet.indexOf(e) >= 0) continue;      // 同一趟已经吃过伤害
      b.hitSet.push(e);
      hitEnemy(e, dmg, 0, 0);
      e.swordT = gameTime;                         // 软避让标记
      spawnSwordSlash(e.x, e.y, b.ang);
    }
    if (!first || b.hot) return;                   // 已经在贯穿中：继续冲过去
    // 本趟首次撞上敌人：进入惯性滑行，冷却就绪则同时结算这一趟
    b.last = first;
    b.tgt = null;
    b.exit = def.exitTime;
    if (b.cool > 0) return;
    b.hot = true;
    b.cool = hitCd;
    sfxHit();
    shake = Math.min(10, shake + 1.2);
    if (gameTime - lastHitStopT > 0.25) { lastHitStopT = gameTime; hitStop = Math.max(hitStop, def.hitStop); }
    if (chain > 0) {                               // 连斩：波及命中点附近的敌人
      let n = 0;
      for (const o of enemies) {
        if (o === first || o.hp <= 0 || b.hitSet.indexOf(o) >= 0) continue;
        if (Math.hypot(o.x - first.x, o.y - first.y) < 46 + o.r) {
          b.hitSet.push(o);
          hitEnemy(o, dmg, 0, 0);
          if (++n >= chain) break;
        }
      }
    }
  };

  s.blades.forEach((b, i) => {
    if (b.cool > 0) b.cool -= dt;
    if (b.exit > 0) b.exit -= dt;
    if (b.guardT > 0) b.guardT -= dt;
    // 目标死亡或跑出视野 → 放弃
    if (b.tgt && (b.tgt.hp <= 0 || Math.hypot(b.tgt.x - squad.x, b.tgt.y - squad.y) > range * 1.1)) b.tgt = null;

    // 贯穿惯性段：刚穿过敌人，沿剑尖继续滑行一段（不索敌、不转向），
    // 滑出去后再回头冲下一个目标 —— 惯性大、有「一剑贯穿后余势未消」的观感
    if (b.exit > 0) {
      const x0 = b.x, y0 = b.y;
      const k = b.exit / def.exitTime;            // 1 → 0
      const sp = speed * (0.72 + 0.28 * k);       // 起始满速，滑行末段才稍微收住
      b.spd = sp;
      b.x += Math.cos(b.ang) * sp * dt;
      b.y += Math.sin(b.ang) * sp * dt;
      pierce(b, x0, y0);                          // 滑行途中继续贯穿后面的敌人
      return;
    }

    // 护身剑阵：有敌人逼近小队时，在外追击的剑立刻回身护主（不打断正在进行的贯穿滑行）
    if (b.exit <= 0) {
      let near = null, nd = def.guardRadius;
      for (const o of enemies) {
        if (o.hp <= 0) continue;
        const dd = Math.hypot(o.x - squad.x, o.y - squad.y);
        if (dd < nd) { nd = dd; near = o; }
      }
      if (near && b.tgt !== near) {
        const curD = b.tgt ? Math.hypot(b.tgt.x - squad.x, b.tgt.y - squad.y) : Infinity;
        if (curD > nd + 20) {                    // 当前目标比贴身的威胁更远 → 回护
          b.tgt = near; b.hot = false; b.hitSet.length = 0;
          if (b.guardT <= 0) b.guardT = 0.3;
        }
      }
    }

    // 脱离段：刚穿过的敌人就是唯一目标时，先背离飞离到 awayDist 外，
    // 再等到「剩余冷却刚好够冲回去」时折返（用冲到接触范围的距离估算），
    // 于是到达瞬间冷却必然结束 —— 每次贯穿都能结算伤害，也不会贴着敌人反复穿刺
    if (!b.tgt && b.last && b.last.hp > 0) {
      const dl = Math.hypot(b.last.x - b.x, b.last.y - b.y);
      const reach = Math.max(0, dl - 10 - b.last.r);          // 冲到接触范围还差多远
      const inSight = Math.hypot(b.x - squad.x, b.y - squad.y) < range;
      if (inSight && (dl < def.awayDist || b.cool > reach / speed)) {
        let other = false;
        for (const o of enemies) {
          if (o === b.last || o.hp <= 0) continue;
          if (Math.hypot(o.x - squad.x, o.y - squad.y) > range) continue;
          if (gameTime - (o.swordT || -1e9) < def.softAvoid) continue;   // 别的剑刚穿过，先让它
          other = true; break;
        }
        if (!other) {
          const x0 = b.x, y0 = b.y;
          const awayAng = Math.atan2(b.y - b.last.y, b.x - b.last.x);
          const fd = Math.atan2(Math.sin(awayAng - b.ang), Math.cos(awayAng - b.ang));
          b.ang += fd * Math.min(1, dt * 12);
          b.turn = Math.abs(fd);
          b.spd = speed;
          b.x += Math.cos(b.ang) * speed * dt;
          b.y += Math.sin(b.ang) * speed * dt;
          pierce(b, x0, y0);
          return;
        }
      }
    }

    // 开始新一趟冲刺：清空本趟命中名单
    if (!b.tgt) {
      b.tgt = pickSwordTarget(b.x, b.y, range, b.last);
      b.hot = false;
      b.hitSet.length = 0;
    }

    // 目标点：直冲敌人身上（穿身而过）/ 无敌人时回到角色身边的环绕轨道
    let tx, ty;
    if (b.tgt) {
      tx = b.tgt.x; ty = b.tgt.y;
    } else {
      const oa = s.orbitAng + (Math.PI * 2 / cnt) * i;
      tx = squad.x + Math.cos(oa) * def.orbitRadius;
      ty = squad.y + Math.sin(oa) * def.orbitRadius;
    }

    const x0 = b.x, y0 = b.y;                     // 位移前坐标，用于线段穿身判定
    const dx = tx - b.x, dy = ty - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const moveAng = Math.atan2(dy, dx);
    // 剑尖朝向：出击时顺行进方向（转向带惯性，出手有弧线感）；
    // 回收到身侧后转为剑尖朝下轻摆
    const faceWant = (b.tgt || d > def.orbitRadius * 1.2)
      ? moveAng
      : (Math.PI / 2 + Math.sin(gameTime * 2.2 + b.bob) * 0.12);
    const faceDiff = Math.atan2(Math.sin(faceWant - b.ang), Math.cos(faceWant - b.ang));
    b.ang += faceDiff * Math.min(1, dt * (b.tgt ? 13 : 9));
    b.turn = Math.abs(faceDiff);
    // 出击全程保持满速直接贯穿；回收时随距离减速，稳稳贴到环绕轨道上
    const sp = b.tgt ? speed : Math.min(speed * 0.9, 60 + d * 7);
    b.spd = sp;
    b.x += Math.cos(moveAng) * sp * dt;
    b.y += Math.sin(moveAng) * sp * dt;
    pierce(b, x0, y0);
  });
}

// 宠物系统：龙蛋悬浮在角色右上方，轻微晃动，发射子弹并点燃
function petPos() {
  return {
    x: squad.x + 45 + Math.sin(gameTime * 2.5) * 3,
    y: squad.y - 50 + Math.sin(gameTime * 3.5) * 5,
  };
}

function updatePet(dt) {
  if (!pet) return;
  const def = PET_DEFS[pet.type];
  if (pet.flashT > 0) pet.flashT = Math.max(0, pet.flashT - dt);
  pet.shootCd -= dt;
  if (pet.shootCd <= 0) {
    const target = nearestEnemy(squad.x, squad.y, def.range * (pet.rangeMul || 1));
    if (target) {
      const p = petPos();
      firePetBullet(p.x, p.y, target);
      pet.flashT = 0.14;               // 开火闪光
      pet.shootCd = def.shootInterval / pet.rateMul;
    }
  }
}

function firePetBullet(x, y, target) {
  const def = PET_DEFS[pet.type];
  // 宠物喷吐为元素伤害：吃宠物乘区 + 元素乘区；元素乘区下限为 1，
  // 因此「元素归零」类效果不会把宠物伤害清空，但元素加成仍能放大它
  const eleMul = Math.max(1, stats.elementalDamage);
  const dmg = def.dmg * pet.dmgMul * stats.petDamage * eleMul;
  // 点燃同样吃宠物乘区与「灼烧」加成（此前是固定值，完全不吃宠物伤害卡）
  const burnDps = (def.burnDps || 0) * (pet.burnMul || 1) * pet.dmgMul;
  const burnTime = (def.burnTime || 0) * (pet.burnTimeMul || 1);
  const cnt = 1 + (pet.extraShots || 0);
  const base = Math.atan2(target.y - y, target.x - x);
  for (let i = 0; i < cnt; i++) {
    const a = base + (i - (cnt - 1) / 2) * 0.12;
    bullets.push({
      x, y, vx: Math.cos(a) * def.bulletSpeed, vy: Math.sin(a) * def.bulletSpeed,
      dmg, r: 4, aoe: 0, burnDps, burnTime, color: def.color,
      petShot: true, igniteSpread: !!pet.igniteSpread,
    });
  }
}

// 宠物命中回馈：累积熟练度、天赋回血/回盾、点燃扩散
function petOnHit(b, e, dmg) {
  petRunExp += dmg * PET_DEV_CFG.expPerDmg;
  if (pet.hitHeal > 0) healSquad(pet.hitHeal);
  if (e.dead && pet.killShield > 0 && squad.shieldMax > 0) {
    squad.shield = Math.min(squad.shieldMax, squad.shield + pet.killShield);
  }
  if (b.igniteSpread && b.burnDps > 0) {
    for (const o of enemies) {
      if (o === e || o.dead) continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) > 60) continue;
      applyBurn(o, b.burnDps * 0.5, b.burnTime);      // 扩散点燃强度减半
    }
  }
}

function updateBullets(dt) {
  for (const b of bullets) {
    // 追踪：冰刺会缓慢修正方向，保证高速移动的敌人也能命中
    if (b.homing && b.target && !b.target.dead) {
      const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
      const cur = Math.atan2(b.vy, b.vx);
      let d = want - cur;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const turn = Math.min(Math.abs(d), b.homing * dt) * Math.sign(d);
      const sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(cur + turn) * sp;
      b.vy = Math.sin(cur + turn) * sp;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (hitObstacle(b)) continue;              // 被木桶 / 箱子 / 石柱挡下

    for (const e of enemies) {
      if (e.dead) continue;
      if (Math.hypot(b.x - e.x, b.y - e.y) < b.r + e.r) {
        // 同一发子弹不重复命中同一敌人（否则穿透后仍会被同一目标拦下）
        if (!b.hit) b.hit = new Set();
        if (b.hit.has(e)) continue;
        b.hit.add(e);
        const dmg = b.fo ? b.dmg * falloffMul(b) : b.dmg;   // 距离衰减（散弹）
        const near = b.guard && b.fo && Math.hypot(b.x - b.sx, b.y - b.sy) <= b.fo.near;
        if (b.pierce > 0) {
          b.pierce--;                       // 消耗一次穿透，子弹继续飞行
          applyBulletKnockback(e, b);
          hitEnemy(e, dmg, b.burnDps, b.burnTime);
          if (near && e.dead) closeKillReward();
          if (b.frost) applyIceHit(b, e);
          if (e.dead && b.split) tryShotgunSplit(e, b);
        } else {
          if (b.aoe > 0) {
            explode(b);
          } else {
            applyBulletKnockback(e, b);
            hitEnemy(e, dmg, b.burnDps, b.burnTime);
            if (b.petShot) petOnHit(b, e, dmg);
            if (near && e.dead) closeKillReward();
            if (b.frost) applyIceHit(b, e);
            if (e.dead && b.split) tryShotgunSplit(e, b);
          }
          b.dead = true;
          break;
        }
      }
    }
    if (!b.dead && (b.x < -20 || b.x > WORLD.w + 20 || b.y < -20 || b.y > WORLD.h + 20)) b.dead = true;
  }
  bullets = bullets.filter(b => !b.dead);
}

function applyBulletKnockback(e, b) {
  if (e.type === 'boss') return;                     // Boss 免疫击退
  if (stats.bulletKnockback <= 0 || e.kbT > 0) return;
  if (Math.random() >= stats.bulletKnockback) return;
  const vl = Math.hypot(b.vx, b.vy) || 1;
  e.kbx += (b.vx / vl) * 150;
  e.kby += (b.vy / vl) * 150;
  e.kbT = 0.5;
}

function tryShotgunSplit(e, b) {
  if (!b.split || Math.random() >= b.split) return;
  const def = WEAPON_DEFS.shotgun;
  const t = nearestEnemy(e.x, e.y, 220);
  if (!t) return;
  const n = b.splitCount || 2;
  for (let i = 0; i < n; i++) {
    const ang = Math.atan2(t.y - e.y, t.x - e.x) + (Math.random() - 0.5) * 0.5;
    bullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * def.speed, vy: Math.sin(ang) * def.speed, dmg: b.dmg, r: 3, aoe: 0, burnDps: 0, burnTime: 0, color: def.color, pierce: 0, split: 0, hit: null });
  }
}

// 火球爆炸：记录特效（膨胀火团 + 冲击环）并抛出火星
function spawnBlast(x, y, r) {
  blasts.push({ x, y, r, life: 0.36, maxLife: 0.36, seed: Math.random() * 6.283 });
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 190;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75 - 30,
      r: 2.5 + Math.random() * 4, life: 0.45 + Math.random() * 0.25,
      color: Math.random() < 0.5 ? '#ffd166' : '#ff7a2f',
    });
  }
}

function explode(b) {
  shake = Math.min(10, shake + 3);
  sfxExplode();
  sfxFireball();
  spawnBlast(b.x, b.y, b.aoe);
  spawnParticles(b.x, b.y, '#ff9d3b', 18);
  for (const e of enemies) {
    if (Math.hypot(e.x - b.x, e.y - b.y) < b.aoe + e.r) {
      hitEnemy(e, b.dmg, b.burnDps, b.burnTime);
    }
  }
}

// 点燃：Boss 元素效果减半；强度取较高者、时长取较长者
function applyBurn(e, burnDps, burnTime) {
  if (!(burnDps > 0)) return;
  const f = e.type === 'boss' ? 0.5 : 1;
  const dps = burnDps * stats.elementalDamage * f;
  if (!e.burnT || dps > e.burnDps) e.burnDps = dps;
  e.burnT = Math.max(e.burnT || 0, (burnTime || 3) * f);
}

function hitEnemy(e, dmg, burnDps, burnTime) {
  // 易伤：敌人受到的伤害加成（同类加算，只乘一次）
  if (stats.vuln > 0) dmg *= 1 + stats.vuln;
  // 敌方护盾优先吸收（破盾后 3 秒开始恢复）
  if (e.shieldMax > 0 && e.shield > 0) {
    const absorb = Math.min(e.shield, dmg);
    e.shield -= absorb;
    e.shieldRegenT = CFG.shieldRegenDelay;
    dmg -= absorb;
    spawnDamageNumber(e.x, e.y - e.r - 12, absorb, '#7fd8ff');
    sfxHit();
    if (e.shield <= 0) spawnParticles(e.x, e.y, '#7fd8ff', 10);
    if (dmg <= 0) return;
  }
  e.hp -= dmg;
  spawnDamageNumber(e.x, e.y - e.r, dmg, '#ffe066');
  sfxHit();
  if (stats.lifesteal > 0) leechHeal(dmg * stats.lifesteal);   // 嗜血：造成伤害的 1% 回血
  if (stats.bloodOrb > 0 && Math.random() < stats.bloodOrb) leechHeal(dmg * 0.05, '#ff9db5');   // 血珠
  if (burnDps > 0) applyBurn(e, burnDps, burnTime);
  spawnParticles(e.x, e.y, '#ffffff', 2);
  triggerFireball();
  triggerLightning();
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  kills++;
  runCoins += ENEMY_TYPES[e.type].coin || 0;
  shake = Math.min(10, shake + (e.type === 'boss' ? 8 : 1.5));
  sfxKill();
  spawnParticles(e.x, e.y, ENEMY_TYPES[e.type].color, 8);
  if (e.type === 'bomber') enemyExplode(e);      // 自爆怪：死亡也炸
  dropXp(e);
  killExplosionAt(e.x, e.y);
  if (e.type === 'boss') {
    bossKills++;
    difficulty = Math.min(3, difficulty + 0.25);
    rerollLeft++;
    // 世界变化：地图上长出树木与藤蔓，并提升经验与出怪
    spawnFlora(6 + Math.min(4, bossKills), 4 + Math.min(3, Math.floor(bossKills / 2)));
    showBanner(`世界异变：经验 +${Math.round((xpScale() - 1) * 100)}% · 出怪 +${Math.round((spawnScale() - 1) * 100)}%`, 2.4);
    openBossReward();
  }
}

function explodeAt(x, y, radius, dmg, burnDps, burnTime) {
  spawnBlast(x, y, radius * 0.85);
  spawnParticles(x, y, '#ff9d3b', 14);
  for (const e of enemies) {
    if (e.dead) continue;
    if (Math.hypot(e.x - x, e.y - y) < radius + e.r) {
      hitEnemy(e, dmg, burnDps, burnTime);
    }
  }
}

function killExplosionAt(x, y) {
  const fb = getSummon('fireball');
  if (!fb || !fb.killExplode) return;
  const dmg = (fb.killDmg || 15) * stats.elementalDamage;
  const radius = fb.killRadius || 60;
  const burnDps = fb.ignite ? ELEMENT_DEFS.fireball.burnDps : 0;
  const burnTime = fb.ignite ? (fb.burnTime || 1) : 0;
  explodeAt(x, y, radius, dmg, burnDps, burnTime);
}

function dropXp(e) {
  drops.push({ x: e.x, y: e.y, r: 6, value: ENEMY_TYPES[e.type].xp });
}

// 自爆怪爆炸：范围伤害小兵（不是被击杀触发时不给击杀奖励）
function enemyExplode(e) {
  const def = ENEMY_TYPES.bomber;
  const dmg = def.boomDmg * difficulty;
  shake = Math.min(10, shake + 4);
  sfxExplode();
  spawnBlast(e.x, e.y, def.boomR * 0.8);
  spawnParticles(e.x, e.y, '#ff9d3b', 20);
  // 共享血池：一次爆炸只结算一次伤害（不随命中人数翻倍）
  const hit = soldiers.find(s => Math.hypot(s.x - e.x, s.y - e.y) < def.boomR + S.soldierR);
  if (hit) damageSoldier(hit, dmg);
  e.dead = true;
}

function moveEnemy(e, target, dt) {
  if (e.freezeT > 0) return;                                        // 冰冻：完全无法移动
  const dx = target.x - e.x, dy = target.y - e.y;
  const len = Math.hypot(dx, dy) || 1;
  const slow = (enemySlowT > 0 ? SKILL_DEFS.slow.mul : 1) * (e.frostT > 0 ? (e.frostMul || 1) : 1);
  const sp = e.speed * slow;
  e.x += (dx / len) * sp * dt;
  e.y += (dy / len) * sp * dt;
}

function fireEnemyBullet(e, target) {
  const def = ENEMY_TYPES[e.type];
  const dx = target.x - e.x, dy = target.y - e.y;
  const len = Math.hypot(dx, dy) || 1;
  enemyBullets.push({
    x: e.x, y: e.y,
    vx: (dx / len) * def.bulletSpeed,
    vy: (dy / len) * def.bulletSpeed,
    speed: def.bulletSpeed,
    homing: !!def.homing,
    dmg: def.dmg,
    r: 5,
  });
}

function fireBossBurst(e) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 / n) * i;
    enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, dmg: 10, r: 5 });
  }
}

// 环形弹幕（可指定发数 / 速度 / 起始角度）
function fireBossRing(e, count, speed, dmg, offset) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 / count) * i + (offset || 0);
    enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, r: 5 });
  }
}

// 瞄准扇射：朝小兵方向铺开一排子弹
function fireBossFan(e, target, count, spread, speed, dmg) {
  const base = target ? Math.atan2(target.y - e.y, target.x - e.x) : Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = base + (i - (count - 1) / 2) * spread;
    enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, r: 5 });
  }
}

// 弹幕墙：整圈铺满并随机留一个缺口，必须从缺口穿过去
function fireBarrageWall(e) {
  const n = 16, gap = Math.floor(Math.random() * n);
  for (let i = 0; i < n; i++) {
    if (i === gap || i === (gap + 1) % n) continue;
    const a = (Math.PI * 2 / n) * i;
    enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, dmg: 11, r: 5 });
  }
  spawnParticles(e.x, e.y, '#c08bff', 16);
}

// 弹幕者技能模组：环形弹幕 → 瞄准扇射 → 螺旋扫射 →（二阶段）弹幕墙，按顺序轮换
function updateBarrageBoss(e, target, dt) {
  // 螺旋扫射进行中：连续甩出旋转弹幕
  if (e.spiralT > 0) {
    e.spiralT -= dt;
    e.spiralFireT = (e.spiralFireT || 0) - dt;
    if (e.spiralFireT <= 0) {
      e.spiralFireT = 0.13;
      e.spiral = (e.spiral || 0) + 0.5;
      fireBossRing(e, 4, 170, 7, e.spiral);
    }
  }

  e.burstCd -= dt;
  if (e.burstCd > 0) return;

  e.skillIdx = ((e.skillIdx || 0) + 1) % (e.phase2 ? 4 : 3);
  if (e.skillIdx === 0) {
    fireBossRing(e, e.phase2 ? 14 : 10, 175, 9, 0);          // 环形弹幕
    spawnParticles(e.x, e.y, '#c08bff', 12);
    e.burstCd = e.phase2 ? 1.6 : 2.4;
  } else if (e.skillIdx === 1) {
    fireBossFan(e, target, e.phase2 ? 7 : 5, 0.22, 200, 10); // 瞄准扇射
    e.burstCd = e.phase2 ? 1.5 : 2.3;
  } else if (e.skillIdx === 2) {
    e.spiralT = e.phase2 ? 1.6 : 1.2;                        // 螺旋扫射（持续输出）
    e.spiralFireT = 0;
    e.burstCd = e.phase2 ? 3.4 : 4.4;
  } else {
    fireBarrageWall(e);                                      // 二阶段专属：弹幕墙
    e.burstCd = 3.6;
  }
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.burnT > 0) {
      e.hp -= e.burnDps * dt;
      e.burnT -= dt;
      if (e.hp <= 0) { killEnemy(e); continue; }
    }

    // 霜冻减速 / 冰冻计时
    if (e.frostT > 0) {
      e.frostT -= dt;
      if (e.frostT <= 0) { e.frostT = 0; e.frostMul = 1; }
    }
    if (e.freezeT > 0) e.freezeT = Math.max(0, e.freezeT - dt);

    // 击退平滑位移 + 衰减 + 抗性计时
    e.x += e.kbx * dt;
    e.y += e.kby * dt;
    const damp = Math.max(0, 1 - 6 * dt);
    e.kbx *= damp;
    e.kby *= damp;
    if (e.kbT > 0) e.kbT -= dt;

    // 敌方护盾自动恢复（破盾后延迟开始）
    if (e.shieldMax > 0 && e.shield < e.shieldMax) {
      if (e.shieldRegenT > 0) e.shieldRegenT -= dt;
      else e.shield = Math.min(e.shieldMax, e.shield + CFG.shieldRegenRate * dt);
    }

    const def = ENEMY_TYPES[e.type];
    const t = nearestSoldier(e.x, e.y);
    const target = t || squad;

    if (e.type === 'ranged' && t) {
      const d = Math.hypot(t.x - e.x, t.y - e.y);
      if (d > def.range) {
        moveEnemy(e, t, dt);
      } else {
        e.shootCd -= dt;
        if (e.shootCd <= 0) {
          fireEnemyBullet(e, t);
          e.shootCd = def.shootInterval;
        }
      }
    } else if (e.type === 'bomber') {
      // 自爆怪：贴身后引爆
      const b = nearestSoldier(e.x, e.y);
      if (b) {
        moveEnemy(e, b, dt);
        if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + S.soldierR + 6) { enemyExplode(e); continue; }
      }
    } else if (e.type === 'hunter' && t) {
      // 追踪弹：保持距离并发射缓慢追踪弹
      const d = Math.hypot(t.x - e.x, t.y - e.y);
      if (d > def.range) moveEnemy(e, t, dt);
      else {
        e.shootCd -= dt;
        if (e.shootCd <= 0) {
          fireEnemyBullet(e, t);
          e.shootCd = def.shootInterval;
        }
      }
    } else if (e.type === 'healer') {
      // 治疗兵：维持中距离，周期性治疗附近敌人
      if (t) {
        const d = Math.hypot(t.x - e.x, t.y - e.y);
        if (d > def.healR * 0.8) moveEnemy(e, t, dt);
        else if (d < def.healR * 0.45) {
          const ax = e.x - t.x, ay = e.y - t.y, al = Math.hypot(ax, ay) || 1;
          e.x += (ax / al) * e.speed * dt;
          e.y += (ay / al) * e.speed * dt;
        }
      }
      e.healCd -= dt;
      if (e.healCd <= 0) {
        e.healCd = def.healInterval;
        const amount = def.healAmount * difficulty;
        let healed = 0;
        for (const o of enemies) {
          if (o === e || o.dead || o.hp >= o.maxHp) continue;
          if (Math.hypot(o.x - e.x, o.y - e.y) > def.healR) continue;
          o.hp = Math.min(o.maxHp, o.hp + amount);
          spawnDamageNumber(o.x, o.y - o.r - 8, amount, '#6f6');
          healed++;
          if (healed >= 3) break;
        }
        if (healed > 0) spawnParticles(e.x, e.y, '#4dd07a', 8);
      }
    } else if (e.type === 'shielder') {
      // 护盾兵：近战推进，并周期给周围敌人套小护盾
      moveEnemy(e, target, dt);
      e.atkCd -= dt;
      if (target !== squad) {
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d < e.r + S.soldierR && e.atkCd <= 0) {
          damageSoldier(target, e.dmg);
          e.atkCd = 1.0;
        }
      }
      e.giftCd -= dt;
      if (e.giftCd <= 0) {
        e.giftCd = def.giftInterval;
        const gain = def.giftAmount * difficulty;
        let given = 0;
        for (const o of enemies) {
          if (o.dead || o.shieldMax >= o.maxHp * 0.4) continue;
          if (Math.hypot(o.x - e.x, o.y - e.y) > def.giftR) continue;
          o.shieldMax = Math.min(o.maxHp * 0.4, o.shieldMax + gain);
          o.shield = Math.min(o.shieldMax, o.shield + gain);
          given++;
          if (given >= 4) break;
        }
        if (given > 0) spawnParticles(e.x, e.y, '#7fd8ff', 10);
      }
    } else if (e.type === 'summoner') {
      // 召唤兵：远处放小怪，靠近则后撤
      if (t) {
        const d = Math.hypot(t.x - e.x, t.y - e.y);
        if (d > 320) moveEnemy(e, t, dt);
        else if (d < 200) {
          const ax = e.x - t.x, ay = e.y - t.y, al = Math.hypot(ax, ay) || 1;
          e.x += (ax / al) * e.speed * dt;
          e.y += (ay / al) * e.speed * dt;
        }
      }
      e.sumCd -= dt;
      if (e.sumCd <= 0) {
        e.sumCd = def.summonInterval;
        spawnMinionsAround(e, Math.random() < 0.6 ? 'grunt' : 'fast', 1 + (difficulty > 1.5 ? 1 : 0));
      }
    } else if (e.type === 'boss') {
      // 二阶段：血量降到一半后狂暴
      if (!e.phase2 && e.hp <= e.maxHp * 0.5) {
        e.phase2 = true;
        shake = Math.min(12, shake + 6);
        spawnParticles(e.x, e.y, '#ffd54f', 28);
        showBanner('BOSS 狂暴化！', 1.6);
        sfxExplode();
        if (e.kind === 'splitter') {
          spawnMinionsAround(e, 'elite', 2);            // 分裂者：分裂出两个精英
        } else if (e.kind === 'summoner') {
          spawnMinionsAround(e, 'fast', 4);
        } else if (e.kind === 'charge') {
          e.skillCd = 0.5;                              // 冲锋者：立刻开始蓄力
        }
      }

      if (e.skillState === 'charge') {
        // 蓄力：原地不动，地面显示冲刺指示条
        e.skillT -= dt;
        if (e.skillT <= 0) {
          e.skillState = 'dash';
          e.skillT = BOSS_SKILL.dashTime;
          e.skillHit = new Set();
          sfxExplode();
          shake = Math.min(10, shake + 3);
        }
      } else if (e.skillState === 'dash') {
        // 冲刺：高速前进并撞击小兵
        e.skillT -= dt;
        const step = BOSS_SKILL.dashSpeed * dt;
        e.x = Math.max(e.r, Math.min(WORLD.w - e.r, e.x + e.skillDirX * step));
        e.y = Math.max(e.r, Math.min(WORLD.h - e.r, e.y + e.skillDirY * step));
        spawnParticles(e.x, e.y, '#ff9d3b', 2);
        // 共享血池：一次冲刺只结算一次伤害（不随命中人数翻倍）
        if (!e.skillHit.has('squad')) {
          const hit = soldiers.find(s => Math.hypot(s.x - e.x, s.y - e.y) < e.r + S.soldierR);
          if (hit) { e.skillHit.add('squad'); damageSoldier(hit, e.dmg * 1.5); }
        }
        if (e.skillT <= 0) { e.skillState = 'idle'; e.skillCd = BOSS_SKILL.cooldown; }
      } else {
        moveEnemy(e, target, dt);
        e.atkCd -= dt;
        if (target !== squad) {
          const d = Math.hypot(e.x - target.x, e.y - target.y);
          if (d < e.r + S.soldierR && e.atkCd <= 0) {
            damageSoldier(target, e.dmg);
            e.atkCd = 1.0;
          }
        }
        if (e.kind === 'barrage') {
          updateBarrageBoss(e, target, dt);                  // 弹幕者：技能轮换模组
        } else {
          e.burstCd -= dt;
          if (e.burstCd <= 0) {
            fireBossBurst(e);
            e.burstCd = e.kind === 'summoner' ? 3.5 : (e.phase2 ? 2 : 2.5);
          }
        }
        if (e.kind === 'summoner') {
          // 召唤者：周期性召唤小怪
          e.sumCd -= dt;
          if (e.sumCd <= 0) {
            e.sumCd = e.phase2 ? 3.5 : 5;
            spawnMinionsAround(e, Math.random() < 0.5 ? 'grunt' : 'fast', e.phase2 ? 3 : 2);
          }
        }
        if (e.kind === 'charge') {
          e.skillCd -= dt;
          if (e.skillCd <= 0) {
            const dx = target.x - e.x, dy = target.y - e.y;
            const l = Math.hypot(dx, dy);
            const a = l > 1 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
            e.skillDirX = Math.cos(a);
            e.skillDirY = Math.sin(a);
            e.skillState = 'charge';
            e.skillT = BOSS_SKILL.chargeTime;
          }
        }
      }
    } else {
      moveEnemy(e, target, dt);
      e.atkCd -= dt;
      if (target !== squad) {
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d < e.r + S.soldierR && e.atkCd <= 0) {
          damageSoldier(target, e.dmg);
          e.atkCd = 1.0;
        }
      }
    }
  }
  enemies = enemies.filter(e => !e.dead);
  // 小兵不再单独阵亡：数量由共享血池决定（见 dropSoldiersToFitPool）
}

function updateEnemyBullets(dt) {
  for (const b of enemyBullets) {
    // 追踪弹：缓慢转向最近的小兵
    if (b.homing) {
      const t = nearestSoldier(b.x, b.y);
      if (t) {
        const want = Math.atan2(t.y - b.y, t.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const a = cur + Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
        b.vx = Math.cos(a) * b.speed;
        b.vy = Math.sin(a) * b.speed;
      }
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (tryBlockEnemyBullet(b)) {
      b.dead = true;
      spawnParticles(b.x, b.y, '#ffffff', 6);
      continue;
    }

    if (hitObstacle(b)) continue;

    for (const s of soldiers) {
      if (Math.hypot(b.x - s.x, b.y - s.y) < b.r + S.soldierR) {
        damageSoldier(s, b.dmg);
        b.dead = true;
        break;
      }
    }
    if (!b.dead && (b.x < -20 || b.x > WORLD.w + 20 || b.y < -20 || b.y > WORLD.h + 20)) b.dead = true;
  }
  enemyBullets = enemyBullets.filter(b => !b.dead);
}

// 子弹撞到可破坏物 / 掩体：石柱无限挡，木桶箱子被打破
function hitObstacle(b) {
  for (const o of obstacles) {
    if (o.dead) continue;
    if (o.type === 'tree' && (o.grow || 0) < 1) continue;   // 还没长成的树不挡子弹
    if (Math.hypot(b.x - o.x, b.y - o.y) < b.r + o.r) {
      damageObstacle(o, b.dmg || 10);
      b.dead = true;
      return true;
    }
  }
  return false;
}

// 镰刀阻挡敌方子弹
function tryBlockEnemyBullet(b) {
  for (const s of summons) {
    if (s.type !== 'scythe') continue;
    const chance = s.blockChance || 0;
    if (chance <= 0) continue;
    const def = SUMMON_DEFS.scythe;
    const cnt = def.baseCount + s.extraCount;
    const rad = def.orbitRadius;                    // 与伤害判定一致：环半径固定，不随体型推远
    const size = def.size * (s.sizeMul || 1);       // 变大只放大刀刃本身
    for (let i = 0; i < cnt; i++) {
      const a = (s.orbitAngle || 0) + (Math.PI * 2 / cnt) * i;
      const bx = squad.x + Math.cos(a) * rad;
      const by = squad.y + Math.sin(a) * rad;
      if (Math.hypot(b.x - bx, b.y - by) < size + b.r) {
        if (Math.random() < chance) return true;
      }
    }
  }
  return false;
}

function damageSoldier(s, dmg) {
  if (!soldiers.length) return;
  if (squad.invulnT > 0) return;
  if (stats.dodge > 0 && Math.random() < stats.dodge) {
    spawnParticles(s.x, s.y, '#9fe0ff', 4);
    return;
  }
  dmg *= stats.damageTaken;
  if (squad.shield > 0) {
    const absorb = Math.min(squad.shield, dmg);
    squad.shield -= absorb;
    squad.shieldRegenTimer = CFG.shieldRegenDelay;
    dmg -= absorb;
    if (dmg <= 0) return;
  }
  squadHp -= dmg;                                   // 伤害统一进共享血池
  spawnDamageNumber(s.x, s.y - S.soldierR, dmg, '#ff5555');
  sfxHurt();
  if (stats.invulnDuration > 0) squad.invulnT = stats.invulnDuration;
  spawnParticles(s.x, s.y, '#ff5555', 4);
  dropSoldiersToFitPool();                          // 血池不足一格就少一个小人
}

function updateDrops(dt) {
  const pr = pickupRange();
  for (const d of drops) {
    const dx = squad.x - d.x, dy = squad.y - d.y;
    const dist = Math.hypot(dx, dy);
    if (dist < pr && dist > 0) {
      d.x += (dx / dist) * 360 * dt;
      d.y += (dy / dist) * 360 * dt;
    }
    if (dist < 28) {
      d.dead = true;
      collectXp(d.value);
    }
  }
  drops = drops.filter(d => !d.dead);
}

// 世界成长：每击败一个 Boss，经验获取量与出怪量按比例提升
function xpScale() { return 1 + 0.2 * bossKills; }      // 每个 Boss +20% 经验
// 出怪倍率：每个 Boss +12%；第一个 Boss 后基础值再抬一档，并随波次持续增长
function spawnScale() {
  let s = 1 + 0.12 * bossKills;
  if (bossKills >= 1) s += 0.10 + 0.05 * Math.max(0, wave - 10);
  return s;
}
// 小怪血量倍率：第一个 Boss 之后才开始随波次成长（Boss 自身另有难度成长）
function enemyHpScale() {
  if (bossKills < 1) return 1;
  return 1 + 0.05 * Math.max(0, wave - 10) + 0.25 * (bossKills - 1);
}

function collectXp(v) {
  xp += v * xpScale();
  if (xp >= xpToNext) {
    xp -= xpToNext;
    level++;
    xpToNext = Math.floor(xpToNext * 1.25 + 5);
    openUpgrade();
  }
}

function updateSpawning(dt) {
  if (waveSpawned >= waveSize) {
    if (enemies.length === 0) {
      wave++;
      waveSize = Math.round((5 + wave * 2) * spawnScale());   // 出怪量随 Boss 数增长
      waveSpawned = 0;
      spawnTimer = 0.6;
    }
    return;
  }

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    if (wave % 10 === 0 && waveSpawned === 0) spawnEnemy('boss');
    else if (wave % 5 === 0 && waveSpawned === 0) spawnEnemy('elite');
    else spawnEnemy();
    waveSpawned++;
    spawnTimer = Math.max(0.2, (0.8 - wave * 0.03) / Math.min(1.6, spawnScale()));
  }
}

function spawnEnemy(type, px, py) {
  const m = 50;
  let x, y;
  if (px !== undefined) {
    x = px; y = py;
  } else {
    const side = Math.random();
    if (side < 0.5) { x = camera.x + Math.random() * W; y = camera.y - m; }
    else if (side < 0.75) { x = camera.x - m; y = camera.y + Math.random() * H; }
    else if (side < 0.9) { x = camera.x + W + m; y = camera.y + Math.random() * H; }
    else { x = camera.x + Math.random() * W; y = camera.y + H + m; }
  }

  x = Math.max(10, Math.min(WORLD.w - 10, x));
  y = Math.max(10, Math.min(WORLD.h - 10, y));

  const t = type || pickType();
  const def = ENEMY_TYPES[t];

  // Boss 种类：每 10 波轮换（冲锋 → 弹幕 → 召唤 → 分裂）
  const kind = t === 'boss'
    ? BOSS_ORDER[Math.max(0, Math.floor(wave / 10 - 1)) % BOSS_ORDER.length]
    : null;
  const bossDef = kind ? BOSS_KINDS[kind] : null;

  // 血量：第一个 Boss 后小怪基础血量随波次成长（Boss 走自己的种类血量）
  const hp = (bossDef ? bossDef.hp : def.hp * enemyHpScale()) * difficulty;
  // 护盾：精英 60% / 护盾兵 50%
  const shield = t === 'elite' ? Math.round(hp * 0.6) : (t === 'shielder' ? Math.round(hp * 0.5) : 0);

  enemies.push({
    x, y, hp, maxHp: hp,
    speed: (bossDef ? bossDef.speed : def.speed) * Math.min(1.6, 1 + (difficulty - 1) * 0.5),
    r: def.r, dmg: def.dmg * difficulty, type: t, kind,
    atkCd: 0, shootCd: def.shootInterval || 0, burstCd: t === 'boss' ? 2.5 : 0,
    burnDps: 0, burnT: 0, scytheT: 0, kbx: 0, kby: 0, kbT: 0,
    frostT: 0, frostMul: 1, freezeT: 0,
    shield, shieldMax: shield, shieldRegenT: 0,
    healCd: def.healInterval || 0, giftCd: def.giftInterval || 0, sumCd: t === 'boss' ? 4 : 0,
    phase2: false, spiral: 0, spiralT: 0, spiralFireT: 0, skillIdx: 0,
    skillCd: t === 'boss' && kind === 'charge' ? BOSS_SKILL.firstDelay : 0,
    skillState: 'idle', skillT: 0, skillDirX: 0, skillDirY: 0, skillHit: null,
  });

  if (t === 'boss') showBanner(`BOSS · ${BOSS_KINDS[kind].name}`, 2);
}

// 在指定敌人周围召唤小兵（召唤兵 / 召唤型 Boss）
function spawnMinionsAround(e, type, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 45 + Math.random() * 45;
    spawnEnemy(type, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d);
  }
  spawnParticles(e.x, e.y, '#a06cd0', 12);
}

// 特殊敌人随「击败 Boss 数」逐步开放：打完第一个 Boss 开始出现新怪物
function pickType() {
  const table = [['grunt', 62], ['fast', 20], ['ranged', 18]];
  if (bossKills >= 1) table.push(['bomber', 12]);
  if (bossKills >= 2) table.push(['hunter', 10]);
  if (bossKills >= 3) table.push(['healer', 8]);
  if (bossKills >= 4) table.push(['shielder', 8]);
  if (bossKills >= 5) table.push(['summoner', 6]);
  let total = 0;
  for (const [, w] of table) total += w;
  let r = Math.random() * total;
  for (const [t, w] of table) { r -= w; if (r <= 0) return t; }
  return 'grunt';
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt * 2;
  }
  particles = particles.filter(p => p.life > 0);
}

function updateObstacles(dt) {
  const c = FLORA_CFG.tree;
  for (const o of obstacles) {
    if (o.hitT > 0) o.hitT -= dt;
    if (o.type !== 'tree') continue;
    // 生长动画期间不积累进度（长成后才可被「靠近」触发）
    if ((o.grow || 0) < 1) {
      o.grow = Math.min(1, (o.grow || 0) + dt / c.growTime);
      if (o.grow >= 1) spawnParticles(o.x, o.y - o.r * 0.6, '#8fd06a', 10);
      continue;
    }
    // 树木：被长时间靠近会苏醒为树怪（离开则逐步消退）
    const near = nearestSoldier(o.x, o.y);
    const d = near ? Math.hypot(near.x - o.x, near.y - o.y) : Infinity;
    if (d < c.nearR) o.aggro = (o.aggro || 0) + dt;
    else o.aggro = Math.max(0, (o.aggro || 0) - dt * c.decay);
    if (o.aggro >= c.aggroTime) awakenTree(o);
  }
  obstacles = obstacles.filter(o => !o.dead);
}

// 藤蔓：靠近后有前摇（可躲避），命中则缠住玩家；存在一段时间后自行消失
function updateVines(dt) {
  const c = FLORA_CFG.vine;
  for (const v of vines) {
    v.life -= dt;
    if (v.cool > 0) v.cool -= dt;
    if (v.life <= 0) { v.state = 'dead'; continue; }
    const d = Math.hypot(squad.x - v.x, squad.y - v.y);

    if (v.state === 'grow') {
      // 长出动画期间不可触发
      v.t -= dt;
      if (v.t <= 0) { v.state = 'idle'; spawnParticles(v.x, v.y, '#6fd04a', 8); }
    } else if (v.state === 'idle') {
      if (v.cool <= 0 && squadRootedT <= 0 && d < c.triggerR) { v.state = 'wind'; v.t = c.windTime; }
    } else if (v.state === 'wind') {
      v.t -= dt;
      if (v.t <= 0) {
        if (d < c.grabR) {
          v.state = 'hold';
          v.t = c.holdTime;
          squadRootedT = Math.max(squadRootedT, c.holdTime);
          shake = Math.min(10, shake + 2);
          sfxHurt();
          spawnParticles(squad.x, squad.y, '#5fae3a', 12);
          spawnFloatText(squad.x, squad.y - 34, '被缠住！', '#9be060');
        } else {
          v.state = 'idle';        // 被躲开
          v.cool = c.cooldown;
          spawnParticles(v.x, v.y, '#5fae3a', 6);
        }
      }
    } else if (v.state === 'hold') {
      v.t -= dt;
      if (v.t <= 0) { v.state = 'dead'; spawnParticles(v.x, v.y, '#5fae3a', 10); }
    }
  }
  vines = vines.filter(v => v.state !== 'dead');
}

function spawnParticles(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 120;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + Math.random() * 3, life: 0.5, color });
  }
}

// ==================== 音效 / 打击反馈 ====================
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function soundEnabled() { return meta.settings.sound; }

function beep(freq, dur, type, vol) {
  if (!audioCtx || !soundEnabled()) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type || 'square';
  o.frequency.value = freq;
  g.gain.value = vol || 0.05;
  o.connect(g); g.connect(audioCtx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
  o.stop(audioCtx.currentTime + dur);
}

function audioReady() { return !!audioCtx && soundEnabled(); }

// 噪声源：只生成一次并循环复用，避免每次音效都重新填充缓冲区
let noiseBuf = null;
function noiseSource() {
  if (!noiseBuf) {
    const n = Math.floor(audioCtx.sampleRate * 1.5);
    noiseBuf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

// 噪声 + 滤波扫频：用于雷击炸裂、火焰呼啸、冰晶碎响等质感
function noiseHit(dur, vol, type, f0, f1, q) {
  const t = audioCtx.currentTime;
  const src = noiseSource();
  const flt = audioCtx.createBiquadFilter();
  const g = audioCtx.createGain();
  flt.type = type || 'lowpass';
  flt.frequency.setValueAtTime(Math.max(30, f0), t);
  if (f1 && f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  if (q) flt.Q.value = q;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.015, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt); flt.connect(g); g.connect(audioCtx.destination);
  src.start(t); src.stop(t + dur + 0.03);
}

// 频率下滑音：用于低频轰隆、下坠感
function sweep(f0, f1, dur, type, vol) {
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(Math.max(30, f0), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + dur + 0.03);
}

// 同类音效节流：一次命中多名敌人时不至于叠成噪音墙
const sfxLast = {};
function sfxReady(key, gap) {
  const t = performance.now();
  if ((sfxLast[key] || 0) + gap > t) return false;
  sfxLast[key] = t;
  return true;
}

function sfxShoot() {
  if (!audioReady()) return;
  beep(540, 0.04, 'square', 0.015);
  noiseHit(0.06, 0.012, 'highpass', 1400, 700);
}
function sfxHit() {
  if (!audioReady() || !sfxReady('hit', 40)) return;
  noiseHit(0.07, 0.03, 'bandpass', 1100, 320, 1.1);
  beep(190, 0.05, 'sawtooth', 0.02);
}
function sfxKill() {
  if (!audioReady() || !sfxReady('kill', 60)) return;
  sweep(320, 70, 0.22, 'square', 0.045);
  noiseHit(0.2, 0.028, 'lowpass', 900, 220);
}
function sfxPickup() {
  if (!audioReady() || !sfxReady('pickup', 40)) return;
  beep(880, 0.05, 'sine', 0.032);
  setTimeout(() => audioReady() && beep(1318, 0.07, 'sine', 0.026), 45);
}
function sfxLevelup() {
  if (!audioReady()) return;
  beep(660, 0.09, 'triangle', 0.045);
  setTimeout(() => audioReady() && beep(990, 0.12, 'triangle', 0.045), 90);
  setTimeout(() => audioReady() && beep(1320, 0.16, 'triangle', 0.04), 190);
}
// 爆炸：低频冲击 + 轰鸣噪声
function sfxExplode() {
  if (!audioReady() || !sfxReady('boom', 70)) return;
  sweep(170, 42, 0.34, 'sine', 0.085);
  noiseHit(0.38, 0.065, 'lowpass', 1500, 130);
}
// 火球：呼啸的火焰声（带通由低扫到高，像火球破空）
function sfxFireball() {
  if (!audioReady() || !sfxReady('fire', 80)) return;
  noiseHit(0.32, 0.05, 'bandpass', 260, 1100, 0.9);
  sweep(190, 65, 0.3, 'sawtooth', 0.028);
}
// 雷击：先脆裂的电弧，再跟一声滚动的低频雷声
function sfxThunder() {
  if (!audioReady() || !sfxReady('thunder', 90)) return;
  noiseHit(0.07, 0.1, 'highpass', 2600, 1200);
  sweep(920, 90, 0.26, 'square', 0.045);
  noiseHit(0.5, 0.055, 'lowpass', 600, 110);
}
// 冰刺：清脆的晶体破空与碎裂
function sfxIce() {
  if (!audioReady() || !sfxReady('ice', 70)) return;
  beep(2280, 0.05, 'triangle', 0.03);
  sweep(1800, 780, 0.13, 'sine', 0.022);
  noiseHit(0.12, 0.028, 'highpass', 3200, 1600);
}
function sfxHurt() {
  if (!audioReady() || !sfxReady('hurt', 120)) return;
  sweep(250, 95, 0.2, 'sawtooth', 0.05);
  noiseHit(0.16, 0.03, 'lowpass', 800, 260);
}
// 时缓：时间被拉长的下坠音
function sfxSlow() {
  if (!audioReady()) return;
  sweep(880, 180, 0.55, 'sine', 0.045);
  noiseHit(0.5, 0.02, 'lowpass', 900, 200);
}

const SCALE = [220, 262, 294, 330, 392, 440];
function startMusic() {
  stopMusic();
  if (!soundEnabled()) return;
  musicStep = 0;
  musicTimer = setInterval(() => {
    if (!audioCtx || !soundEnabled()) return;
    beep(SCALE[musicStep % SCALE.length], 0.35, 'triangle', 0.028);
    musicStep++;
  }, 420);
}
function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

function spawnDamageNumber(x, y, value, color) {
  damageNumbers.push({ x, y, value: Math.round(value), color, life: 0.8, vy: -55 });
}

// 浮动文字（提示类，如「树怪苏醒！」）
function spawnFloatText(x, y, text, color) {
  damageNumbers.push({ x, y, text, color, life: 1.4, vy: -40 });
}

// 居中横幅提示
function showBanner(text, dur) { banner.text = text; banner.t = dur || 1.6; }
function updateDamageNumbers(dt) {
  for (const d of damageNumbers) { d.life -= dt; d.y += d.vy * dt; }
  damageNumbers = damageNumbers.filter(d => d.life > 0);
}
function drawDamageNumbers() {
  damageNumbers.forEach(d => {
    ctx.globalAlpha = Math.max(0, Math.min(1, d.life));
    ctx.fillStyle = d.color;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.text !== undefined ? d.text : d.value, d.x, d.y);
  });
  ctx.globalAlpha = 1;
}

function drawJoystick() {
  if (!joystick.active) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(joystick.ox, joystick.oy, 50, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.arc(joystick.ox + joystick.dx, joystick.oy + joystick.dy, 20, 0, Math.PI * 2); ctx.fill();
}

// ==================== 升级 ====================
function openUpgrade() {
  upgrades = pickUpgrades(choiceCount);
  sfxLevelup();
  renderUpgradeCards();
  document.getElementById('upgrade-title').textContent = '选择升级';
  document.getElementById('btn-reroll').classList.toggle('hidden', rerollLeft <= 0);
  updateRerollButton();
  state = 'upgrade';
  document.getElementById('upgrade').classList.remove('hidden');
}

// 重掷：重新抽一次当前升级选项（每局 3 次，击败 Boss +1）
function rerollUpgrades() {
  if (rerollLeft <= 0) return;
  rerollLeft--;
  upgrades = pickUpgrades(choiceCount);
  renderUpgradeCards();
  updateRerollButton();
  sfxPickup();
}

function updateRerollButton() {
  const btn = document.getElementById('btn-reroll');
  btn.textContent = `重掷（剩余 ${rerollLeft} 次）`;
  btn.disabled = rerollLeft <= 0;
}

function pickUpgrades(n) {
  const pool = buildUpgradePool();
  const copy = pool.slice();
  const picked = [];
  while (picked.length < n && copy.length > 0) {
    const total = copy.reduce((s, u) => s + (u.weight || 1), 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < copy.length; i++) {
      r -= (copy[i].weight || 1);
      if (r <= 0) { idx = i; break; }
    }
    picked.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return picked;
}

function upgradeCardHtml(u) {
  const tag = u.evo ? '<span class="evo-tag">进化</span>' : '';
  return `${tag}<div class="name">${u.name}</div><div class="desc">${u.desc}</div>`;
}

function renderUpgradeCards() {
  const box = document.getElementById('upgrade-cards');
  box.innerHTML = '';
  upgrades.forEach(u => {
    const el = document.createElement('div');
    el.className = 'card' + (u.evo ? ' evo' : '');
    el.innerHTML = upgradeCardHtml(u);
    el.onclick = () => applyUpgrade(u.id);
    box.appendChild(el);
  });
}

function applyUpgrade(id) {
  const u = upgrades.find(x => x.id === id);
  if (u) {
    u.apply();
    appliedIds.add(u.id);
    if (u.route) routePicks[u.route] = (routePicks[u.route] || 0) + 1;   // 累计本路线强化次数（进化门槛）
  }
  document.getElementById('upgrade').classList.add('hidden');
  state = 'playing';
}

// Boss 奖励：从 4 项中选 2 项
function openBossReward() {
  bossRewardOptions = [];
  BOSS_BUFFS.forEach(b => {
    if (b.req && !b.req()) return;          // 前置不满足（如没有元素伤害来源）则不出现
    if (Math.random() < 0.6) bossRewardOptions.push(b);
  });
  let guard = 0;
  while (bossRewardOptions.length < 4 && guard++ < 20) {
    const u = pickUpgrades(1)[0];
    if (u && !bossRewardOptions.some(x => x.id === u.id)) bossRewardOptions.push(u);
  }
  for (let i = bossRewardOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bossRewardOptions[i], bossRewardOptions[j]] = [bossRewardOptions[j], bossRewardOptions[i]];
  }
  bossRewardPicked = 0;
  renderBossRewardCards();
  document.getElementById('upgrade-title').textContent = 'BOSS 奖励：选择 2 项';
  document.getElementById('btn-reroll').classList.add('hidden');
  document.getElementById('upgrade').classList.remove('hidden');
  state = 'bossreward';
}

function renderBossRewardCards() {
  const box = document.getElementById('upgrade-cards');
  box.innerHTML = '';
  bossRewardOptions.forEach(u => {
    const el = document.createElement('div');
    el.className = 'card' + (u.evo ? ' evo' : '');
    el.innerHTML = upgradeCardHtml(u);
    el.onclick = () => pickBossReward(u, el);
    box.appendChild(el);
  });
}

function pickBossReward(u, el) {
  u.apply();
  appliedIds.add(u.id);
  if (u.route) routePicks[u.route] = (routePicks[u.route] || 0) + 1;
  bossRewardPicked++;
  el.remove();
  if (bossRewardPicked >= 2) {
    document.getElementById('upgrade').classList.add('hidden');
    state = 'playing';
  }
}

// ==================== 渲染 ====================
function drawBackground() {
  ctx.fillStyle = '#243024';
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  const ys = [0, ...dividers.slice().sort((a, b) => a - b), WORLD.h];
  for (let i = 0; i < ys.length - 1; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)';
    ctx.fillRect(0, ys[i], WORLD.w, ys[i + 1] - ys[i]);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  const g = 80;
  for (let x = 0; x <= WORLD.w; x += g) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke();
  }
  for (let y = 0; y <= WORLD.h; y += g) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke();
  }

  decorations.forEach(d => {
    if (d.type === 'grass') {
      ctx.strokeStyle = '#4a8a4a';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(d.x + i * 3, d.y); ctx.lineTo(d.x + i * 5, d.y - 7); ctx.stroke();
      }
    } else if (d.type === 'rock') {
      ctx.fillStyle = '#5b5b5b';
      ctx.beginPath(); ctx.ellipse(d.x, d.y, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#ff9de0';
      ctx.beginPath(); ctx.arc(d.x, d.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe066';
      ctx.beginPath(); ctx.arc(d.x, d.y, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  });

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.setLineDash([10, 10]);
  dividers.forEach(y => {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke();
  });
  ctx.setLineDash([]);
}

function drawBar(x, y, w, h, ratio, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, ratio)), h);
}

function drawDrops() {
  drops.forEach(d => {
    ctx.fillStyle = '#4dd0ff';
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
  });
}

// 木桶 / 箱子 / 石柱
// 木桶：木色桶身 + 顶面桶盖 + 两道金属箍
function drawBarrel(r) {
  const w = r * 0.82, top = -r * 0.72, bot = r * 0.9;
  ctx.fillStyle = '#9c6a35';
  ctx.beginPath();
  ctx.moveTo(-w, top);
  ctx.quadraticCurveTo(-w * 1.2, (top + bot) / 2, -w, bot);
  ctx.lineTo(w, bot);
  ctx.quadraticCurveTo(w * 1.2, (top + bot) / 2, w, top);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 桶盖
  ctx.fillStyle = '#b8813f';
  ctx.beginPath();
  ctx.ellipse(0, top, w, r * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 盖板缝
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-w * 0.62, top + r * 0.02);
  ctx.lineTo(-w * 0.22, top - r * 0.16);
  ctx.moveTo(w * 0.62, top + r * 0.02);
  ctx.lineTo(w * 0.22, top - r * 0.16);
  ctx.stroke();
  // 金属箍
  ctx.fillStyle = '#5f6469';
  ctx.fillRect(-w * 1.1, top + r * 0.44, w * 2.2, r * 0.15);
  ctx.fillRect(-w * 1.14, bot - r * 0.42, w * 2.28, r * 0.15);
}

// 箱子：方箱 + 外框木条 + 交叉斜条 + 四角铁钉
function drawCrate(r) {
  const s = r * 0.9;
  ctx.fillStyle = '#b3813f';
  ctx.beginPath();
  ctx.rect(-s, -s * 0.92, s * 2, s * 1.84);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = '#7a5a30';
  ctx.lineWidth = 3;
  ctx.strokeRect(-s * 0.76, -s * 0.7, s * 1.52, s * 1.4);
  ctx.beginPath();
  ctx.moveTo(-s * 0.76, -s * 0.7);
  ctx.lineTo(s * 0.76, s * 0.7);
  ctx.moveTo(s * 0.76, -s * 0.7);
  ctx.lineTo(-s * 0.76, s * 0.7);
  ctx.stroke();
  ctx.fillStyle = '#cfd4d8';
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
    ctx.beginPath();
    ctx.arc(sx * s * 0.76, sy * s * 0.7, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });
}

// 石柱：柱身 + 柱头 + 底座 + 竖向凹槽
function drawPillar(r) {
  const w = r * 0.6, top = -r * 1.0, bot = r * 0.86;
  ctx.fillStyle = '#8d97a1';
  ctx.beginPath();
  ctx.rect(-w, top, w * 2, bot - top);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';           // 受光面
  ctx.fillRect(-w, top, w * 0.7, bot - top);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';                // 竖向凹槽
  ctx.lineWidth = 1.5;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * w * 0.5, top + r * 0.28);
    ctx.lineTo(i * w * 0.5, bot - r * 0.3);
    ctx.stroke();
  }
  ctx.fillStyle = '#a7b1ba';                           // 柱头
  ctx.beginPath(); ctx.rect(-w * 1.35, top - r * 0.2, w * 2.7, r * 0.3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#6f7883';                           // 底座
  ctx.beginPath(); ctx.rect(-w * 1.5, bot - r * 0.12, w * 3, r * 0.34); ctx.fill(); ctx.stroke();
}

function drawObstacles() {
  obstacles.forEach(o => {
    const def = OBSTACLE_DEFS[o.type];
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.hitT > 0) ctx.translate((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);

    if (o.type === 'tree') {          // 树木单独绘制（无血条、无敌）
      drawTree(o, def);
      ctx.restore();
      return;
    }

    // 地面阴影
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, o.r * 0.8, o.r * 0.95, o.r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    if (o.type === 'barrel') drawBarrel(o.r);
    else if (o.type === 'crate') drawCrate(o.r);
    else drawPillar(o.r);

    ctx.restore();

    if (isFinite(o.hp) && o.hp < o.maxHp) {
      drawBar(o.x, o.y - o.r - 6, o.r * 2, 3, o.hp / o.maxHp, '#ffd54f');
    }
  });
}

// ==================== 场景植物绘制 ====================
// 二次贝塞尔取点（用于把一条曲线画成由粗到细的锥形条带）
function bezierPoint(x0, y0, cx, cy, x1, y1, t) {
  const u = 1 - t;
  return { x: u * u * x0 + 2 * u * t * cx + t * t * x1, y: u * u * y0 + 2 * u * t * cy + t * t * y1 };
}

// 锥形条带：树干 / 藤须
function drawTaper(x0, y0, cx, cy, x1, y1, w0, w1, color) {
  const N = 7;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  let prev = { x: x0, y: y0 };
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const p = bezierPoint(x0, y0, cx, cy, x1, y1, t);
    ctx.lineWidth = Math.max(0.8, w0 + (w1 - w0) * (t - 0.5 / N));
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    prev = p;
  }
}

function drawLeaf(x, y, ang, len, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(len * 0.5, 0, len * 0.5, len * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 单条火舌：底部宽、顶端收成尖，带左右摆动
function drawFlameTongue(x, y, w, h, sway) {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.6 + sway * 0.5, y - h * 0.55, x + sway, y - h);
  ctx.quadraticCurveTo(x + w * 0.6 + sway * 0.5, y - h * 0.55, x + w / 2, y);
  ctx.closePath();
  ctx.fill();
}

// 身上着火：热浪光晕 + 炽热火芯 + 多条跳动火舌 + 上升火星与余烟
function drawBurning(e) {
  const t = gameTime;
  const seed = (e.x * 0.13 + e.y * 0.07) % 6.283;
  const fade = Math.min(1, e.burnT / 0.6);
  const r = e.r;
  const bx0 = e.x, by0 = e.y + r * 0.35;
  const pulse = 0.85 + 0.15 * Math.sin(t * 11 + seed);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 1.9);
  glow.addColorStop(0, `rgba(255,158,58,${0.34 * fade * pulse})`);
  glow.addColorStop(0.55, `rgba(255,96,20,${0.16 * fade})`);
  glow.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.9, 0, Math.PI * 2); ctx.fill();

  // 底部炽热火芯（像被烧红的炭床）
  const core = ctx.createRadialGradient(bx0, by0, 0, bx0, by0, r * 0.75);
  core.addColorStop(0, `rgba(255,244,196,${0.75 * fade * pulse})`);
  core.addColorStop(0.45, `rgba(255,170,60,${0.5 * fade})`);
  core.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.ellipse(bx0, by0, r * 0.75, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();

  const n = 6;
  for (let i = 0; i < n; i++) {
    const base = seed + (Math.PI * 2 / n) * i;
    const ph = base + t * 6;
    const h = r * (0.9 + 0.6 * (0.5 + 0.5 * Math.sin(ph * 1.6)));
    const sway = Math.sin(ph) * r * 0.45;
    const x = bx0 + Math.cos(base) * r * 0.8;
    // 外焰（偏红橙）
    const g = ctx.createLinearGradient(x, by0, x + sway, by0 - h);
    g.addColorStop(0, `rgba(255,74,16,${0.68 * fade})`);
    g.addColorStop(0.5, `rgba(255,152,36,${0.52 * fade})`);
    g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g;
    drawFlameTongue(x, by0, r * 0.5, h, sway);
    // 内焰（更亮更短，叠出层次）
    const g2 = ctx.createLinearGradient(x, by0, x + sway * 0.6, by0 - h * 0.55);
    g2.addColorStop(0, `rgba(255,238,170,${0.55 * fade})`);
    g2.addColorStop(1, 'rgba(255,255,220,0)');
    ctx.fillStyle = g2;
    drawFlameTongue(x, by0, r * 0.26, h * 0.55, sway * 0.6);
  }

  for (let i = 0; i < 4; i++) {
    const lp = (t * 0.9 + i * 0.25 + seed) % 1;
    const a = seed + i * 1.7 + t * 2.2;
    const px = e.x + Math.cos(a) * r * (0.55 + lp * 0.5);
    const py = e.y - r * 0.1 - lp * r * 1.6;
    const alpha = (1 - lp) * 0.85 * fade;
    ctx.fillStyle = `rgba(255,${Math.round(190 - lp * 110)},${Math.round(80 - lp * 60)},${alpha})`;
    ctx.beginPath(); ctx.arc(px, py, 2.2 * (1 - lp) + 0.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // 余烟：从火焰顶端飘散的暗色烟团
  ctx.save();
  for (let i = 0; i < 2; i++) {
    const lp = (t * 0.55 + i * 0.5 + seed) % 1;
    const sx = e.x + Math.sin(t * 1.6 + i * 2.4) * r * 0.35;
    const sy = e.y - r * (0.9 + lp * 1.8);
    ctx.fillStyle = `rgba(70,64,60,${(1 - lp) * 0.22 * fade})`;
    ctx.beginPath(); ctx.arc(sx, sy, r * (0.28 + lp * 0.5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// 霜冻：寒气光晕 + 环绕冰晶 + 地面霜圈（减速中）
function drawFrost(e) {
  const t = gameTime;
  const k = Math.min(1, e.frostT / 1.2);
  const r = e.r;
  ctx.save();
  const g = ctx.createRadialGradient(e.x, e.y, r * 0.3, e.x, e.y, r * 1.5);
  g.addColorStop(0, `rgba(160,230,255,${0.22 * k})`);
  g.addColorStop(1, 'rgba(160,230,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.5, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = `rgba(150,225,255,${0.55 * k})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.8, r * 1.05, r * 0.38, 0, 0, Math.PI * 2); ctx.stroke();

  for (let i = 0; i < 5; i++) {
    const a = t * 1.2 + i * 1.26;
    const rr = r * (1.0 + 0.12 * Math.sin(t * 3 + i));
    const px = e.x + Math.cos(a) * rr;
    const py = e.y + Math.sin(a) * rr * 0.75;
    ctx.fillStyle = `rgba(215,245,255,${0.75 * k})`;
    ctx.beginPath();
    ctx.moveTo(px, py - 3.4); ctx.lineTo(px + 2.4, py); ctx.lineTo(px, py + 3.4); ctx.lineTo(px - 2.4, py);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// 冰冻：把敌人整个封进一块冰里（外层霜雾 + 冰棱块体 + 内部折射面 + 底部冰凌）
function drawIceBlock(e) {
  const r = e.r * 1.5;
  const seed = (e.x * 0.13 + e.y * 0.07) % 6.283;
  const n = 7;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 / n) * i;
    const rr = r * (0.9 + 0.13 * Math.sin(i * 2.7 + seed));
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 1.06]);
  }
  const trace = k => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = e.x + p[0] * k, py = e.y + p[1] * k;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
  };

  ctx.save();

  // 外层霜雾
  const halo = ctx.createRadialGradient(e.x, e.y, r * 0.5, e.x, e.y, r * 1.55);
  halo.addColorStop(0, 'rgba(150,225,255,0.28)');
  halo.addColorStop(1, 'rgba(150,225,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.55, 0, Math.PI * 2); ctx.fill();

  // 冰体
  const g = ctx.createLinearGradient(e.x - r, e.y - r, e.x + r * 0.5, e.y + r);
  g.addColorStop(0, 'rgba(216,246,255,0.78)');
  g.addColorStop(0.45, 'rgba(136,212,250,0.55)');
  g.addColorStop(1, 'rgba(228,250,255,0.8)');
  ctx.fillStyle = g;
  trace(1);
  ctx.fill();

  // 内部折射面与裂纹
  ctx.save();
  trace(1);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(e.x - r * 0.75, e.y - r * 0.15);
  ctx.lineTo(e.x + r * 0.1, e.y - r * 0.8);
  ctx.lineTo(e.x + r * 0.45, e.y + r * 0.05);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.moveTo(e.x - r * 0.1, e.y + r * 0.9);
  ctx.lineTo(e.x + r * 0.7, e.y + r * 0.05);
  ctx.lineTo(e.x + r * 0.05, e.y - r * 0.1);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(e.x - r * 0.55, e.y - r * 0.5); ctx.lineTo(e.x - r * 0.15, e.y - r * 0.05); ctx.lineTo(e.x - r * 0.5, e.y + r * 0.42);
  ctx.moveTo(e.x + r * 0.08, e.y - r * 0.72); ctx.lineTo(e.x + r * 0.42, e.y + r * 0.02); ctx.lineTo(e.x + r * 0.12, e.y + r * 0.58);
  ctx.stroke();
  ctx.restore();

  // 冰块厚度
  ctx.strokeStyle = 'rgba(110,190,235,0.55)';
  ctx.lineWidth = 3;
  trace(0.88);
  ctx.stroke();

  // 棱边高光（轻微呼吸感）
  const rim = 0.75 + 0.25 * Math.sin(gameTime * 4 + seed);
  ctx.strokeStyle = `rgba(240,252,255,${0.85 * rim})`;
  ctx.lineWidth = 2;
  trace(1);
  ctx.stroke();

  // 底部冰凌
  ctx.fillStyle = 'rgba(200,242,255,0.8)';
  for (let i = -1; i <= 1; i++) {
    const bx = e.x + i * r * 0.5;
    const by = e.y + r * 0.95;
    const bl = r * (0.18 + 0.12 * Math.abs(Math.sin(i * 2.3 + seed)));
    ctx.beginPath();
    ctx.moveTo(bx - r * 0.09, by - r * 0.05);
    ctx.lineTo(bx, by + bl);
    ctx.lineTo(bx + r * 0.09, by - r * 0.05);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// 树木：根系 + 锥形树干 + 分层树冠；破土生长动画；长成后被靠近过久出现苏醒进度环
function drawTree(o, def) {
  const g = Math.min(1, o.grow === undefined ? 1 : o.grow);
  const s = Math.max(0.02, g * g * (3 - 2 * g));      // smoothstep：整段生长都在放大，不早早定住
  const base = o.r * 1.05;                            // 从根部向上长
  const ag = g < 1 ? 0 : Math.min(1, (o.aggro || 0) / FLORA_CFG.tree.aggroTime);
  const sway = Math.sin(gameTime * 1.4 + o.x * 0.02) * (1.2 + ag * 2.4);

  // 地面阴影（不随生长缩放，避免「缩成一个点」）
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath();
  ctx.ellipse(0, base * 0.62, o.r * 0.9 * s + 2, o.r * 0.3 * s + 1, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(0, base);
  ctx.scale(s, s);
  ctx.translate(0, -base);

  // 根系
  ctx.fillStyle = '#4a3320';
  ctx.beginPath();
  ctx.moveTo(-o.r * 0.52, -o.r * 0.02);
  ctx.quadraticCurveTo(-o.r * 0.34, -o.r * 0.5, -o.r * 0.15, -o.r * 0.58);
  ctx.lineTo(o.r * 0.15, -o.r * 0.58);
  ctx.quadraticCurveTo(o.r * 0.34, -o.r * 0.5, o.r * 0.52, -o.r * 0.02);
  ctx.lineTo(o.r * 0.22, o.r * 0.1);
  ctx.lineTo(-o.r * 0.22, o.r * 0.1);
  ctx.closePath();
  ctx.fill();

  // 树干：底部粗、顶部细，顶端随树冠摆动
  drawTaper(0, -o.r * 0.06, sway * 0.3, -o.r * 0.55, sway * 0.55, -o.r * 1.0, o.r * 0.4, o.r * 0.24, '#5d3f24');
  drawTaper(-o.r * 0.09, -o.r * 0.12, sway * 0.3 - o.r * 0.07, -o.r * 0.55, sway * 0.5 - o.r * 0.07, -o.r * 0.92, o.r * 0.1, o.r * 0.05, '#8a6338');

  // 树冠：暗色底 → 主体 → 受光面（苏醒过程中逐渐枯黄）
  const cy = -o.r * 1.38;
  const live = ag > 0 ? (ag > 0.5 ? '#8f7a2e' : def.color) : def.color;
  const canopy = (fill, k, dx, dy) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(sway * 0.55 + dx, cy + dy, o.r * 0.6 * k, 0, Math.PI * 2);
    ctx.arc(sway * 0.55 + dx - o.r * 0.5 * k, cy + dy + o.r * 0.32 * k, o.r * 0.46 * k, 0, Math.PI * 2);
    ctx.arc(sway * 0.55 + dx + o.r * 0.52 * k, cy + dy + o.r * 0.28 * k, o.r * 0.44 * k, 0, Math.PI * 2);
    ctx.arc(sway * 0.55 + dx, cy + dy - o.r * 0.44 * k, o.r * 0.44 * k, 0, Math.PI * 2);
    ctx.fill();
  };
  canopy(def.dark, 1.08, 0, o.r * 0.07);
  canopy(live, 1, 0, 0);
  canopy('#b7e07a', 0.42, -o.r * 0.26, -o.r * 0.3);

  // 苏醒中：树冠深处透出红光
  if (ag > 0.35) {
    ctx.fillStyle = `rgba(255,86,60,${(ag - 0.35) * 1.1})`;
    ctx.beginPath();
    ctx.arc(sway * 0.55 - o.r * 0.26, cy + o.r * 0.08, o.r * 0.12, 0, Math.PI * 2);
    ctx.arc(sway * 0.55 + o.r * 0.28, cy + o.r * 0.08, o.r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (g < 1) return;                                  // 生长中：不显示苏醒进度环
  if (ag > 0.02) {
    ctx.strokeStyle = `rgba(255,${Math.round(210 - ag * 170)},60,${0.35 + ag * 0.55})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, o.r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ag);
    ctx.stroke();
  }
}

// 藤蔓：待机藤丛 / 前摇伸出 / 缠绕玩家
function drawVines() {
  const c = FLORA_CFG.vine;
  vines.forEach(v => {
    const growing = v.state === 'grow';
    const g = growing ? 1 - Math.max(0, v.t) / c.growTime : 1;
    const s = Math.max(0.02, 1 - Math.pow(1 - g, 3));

    ctx.save();
    ctx.translate(v.x, v.y);

    // 地面阴影
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 7, 19 * s + 2, 8 * s + 1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(s, s);

    // 藤丛底座
    ctx.fillStyle = '#2c5a1c';
    ctx.beginPath(); ctx.ellipse(0, 2, 15, 9.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3f7a2a';
    ctx.beginPath(); ctx.ellipse(-1, -1, 11.5, 7.5, 0, 0, Math.PI * 2); ctx.fill();

    const idleSway = Math.sin(gameTime * 1.8 + v.x * 0.03) * 0.14;
    if (v.state === 'wind') {
      // 前摇：藤须朝玩家方向伸出，红色虚线为抓取范围（可跑出躲避）
      const prog = 1 - Math.max(0, v.t) / c.windTime;
      const ta = Math.atan2(squad.y - v.y, squad.x - v.x);
      for (let i = 0; i < 5; i++) {
        const a = ta + (i - 2) * 0.3;
        const reach = 14 + c.grabR * prog;
        const ex = Math.cos(a) * reach, ey = Math.sin(a) * reach;
        drawTaper(0, 0, Math.cos(a) * reach * 0.45, Math.sin(a) * reach * 0.45 - 9, ex, ey, 5, 1.8, i % 2 ? '#6fd04a' : '#4c8c2c');
        drawLeaf(ex, ey, a, 8, '#9be060');
      }
      ctx.strokeStyle = `rgba(255,90,90,${0.25 + prog * 0.5})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(0, 0, Math.max(6, c.grabR * prog), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // 待机：一圈带叶片的藤须
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i + 0.5 + idleSway;
        const len = 14 + (i % 2) * 6;
        const ex = Math.cos(a) * len, ey = Math.sin(a) * len - 4;
        drawTaper(0, 0, Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5 - 7, ex, ey, 4.4, 1.5, i % 2 ? '#4c8c2c' : '#3f7a2a');
        drawLeaf(ex, ey, a, 7, '#5fae3a');
      }
    }
    ctx.restore();

    if (v.state === 'hold') {
      // 缠住玩家：几股藤条从陷阱拉到玩家身上
      for (let i = 0; i < 3; i++) {
        const a = gameTime * 4 + i * 2.1;
        const mx = (v.x + squad.x) / 2 + Math.cos(a) * 16;
        const my = (v.y + squad.y) / 2 + Math.sin(a) * 16;
        drawTaper(v.x, v.y, mx, my, squad.x, squad.y, 5.5, 2.5, '#4c8c2c');
      }
      ctx.strokeStyle = 'rgba(155,224,96,0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(squad.x, squad.y, 22, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = gameTime * 2 + i * 1.05;
        drawLeaf(squad.x + Math.cos(a) * 22, squad.y + Math.sin(a) * 22, a + Math.PI / 2, 8, '#9be060');
      }
    }
  });
}
function drawSoldiers() {
  const r = charRadius();
  soldiers.forEach(s => {
    const e = nearestEnemy(s.x, s.y, Infinity);
    const ang = e ? Math.atan2(e.y - s.y, e.x - s.x) : -Math.PI / 2;

    drawCharacter(ctx, s.x, s.y, r, ang, meta.character);

    if (squad.shield > 0) {
      ctx.strokeStyle = 'rgba(126,224,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2); ctx.stroke();
    } else if (squad.invulnT > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2); ctx.stroke();
    }

    // 血条共享：所有小兵显示同一份队伍血池
    drawBar(s.x, s.y - r - 20, 26, 4, squadMaxHp > 0 ? squadHp / squadMaxHp : 0, '#6f6');
  });

  // 局内显示玩家名称
  if (soldiers.length) {
    const s = soldiers[0];
    const ny = s.y - r - 30;
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(playerName(), s.x, ny);
    ctx.fillStyle = '#9fe0ff';
    ctx.fillText(playerName(), s.x, ny);
    ctx.lineWidth = 1;
  }
}

// 飞剑贯穿斩痕：沿剑身方向的一道细长白光 + 一圈扩散冲击
function spawnSwordSlash(x, y, ang) {
  swordSlashes.push({ x, y, ang, t: 0.2, life: 0.2 });
  if (swordSlashes.length > 60) swordSlashes.shift();
}
function updateSwordSlashes(dt) {
  for (const s of swordSlashes) s.t -= dt;
  swordSlashes = swordSlashes.filter(s => s.t > 0);
}
function drawSwordSlashes() {
  if (!swordSlashes.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of swordSlashes) {
    const k = s.t / s.life;                      // 1 → 0
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ang);
    const L = 15 + 26 * (1 - k);
    const g = ctx.createLinearGradient(-L, 0, L, 0);
    g.addColorStop(0, 'rgba(190,235,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,' + (0.85 * k).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(190,235,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-L, 0); ctx.lineTo(0, -2.8 * k); ctx.lineTo(L, 0); ctx.lineTo(0, 2.8 * k);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(200,240,255,' + (0.45 * k).toFixed(3) + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, 7 + 20 * (1 - k), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// 飞剑剑身：剑气光晕 + 速度拖尾 + 残影 + 剑刃 / 剑脊 / 护手 / 剑柄 / 剑首
function drawSwordBlade(b, sizeMul) {
  const sc = sizeMul || 1;
  const fast = Math.min(1, (b.spd || 0) / 380);          // 0~1：速度归一化，拖尾与残影都跟着它变化
  const roll = Math.min(0.28, (b.turn || 0) * 0.3);      // 急转侧倾（压窄剑身），像真的在拐弯

  // 剑身轮廓（剑尖朝 +x）
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(17, 0); ctx.lineTo(6, -2.6); ctx.lineTo(-8.5, -2.2);
    ctx.lineTo(-11, 0); ctx.lineTo(-8.5, 2.2); ctx.lineTo(6, 2.6);
    ctx.closePath();
  };

  ctx.save();
  ctx.translate(b.x, b.y);
  if (sc !== 1) ctx.scale(sc, sc);      // 巨剑术：整体放大（剑气、拖尾、剑身一起变大）

  // 护身剑阵激活：剑身外圈闪一下
  if (b.guardT > 0) {
    const gk = b.guardT / 0.3;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(150,230,255,' + (0.55 * gk).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 12 + 10 * (1 - gk), 0, Math.PI * 2); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  // 剑气光晕：飞得越快越亮
  ctx.globalCompositeOperation = 'lighter';
  const gr = 16 + 14 * fast;
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, gr);
  glow.addColorStop(0, 'rgba(190,235,255,' + (0.20 + 0.28 * fast).toFixed(3) + ')');
  glow.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, gr, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.rotate(b.ang);

  // 速度拖尾：长度与亮度随手速变化，慢速回收时几乎看不到
  const tl = 20 + 48 * fast;
  const trail = ctx.createLinearGradient(-tl, 0, 2, 0);
  trail.addColorStop(0, 'rgba(150,215,255,0)');
  trail.addColorStop(0.6, 'rgba(180,228,255,' + (0.08 + 0.16 * fast).toFixed(3) + ')');
  trail.addColorStop(1, 'rgba(216,242,255,' + (0.26 + 0.30 * fast).toFixed(3) + ')');
  ctx.fillStyle = trail;
  ctx.beginPath();
  ctx.moveTo(2, -3.4); ctx.lineTo(-tl, -0.7); ctx.lineTo(-tl, 0.7); ctx.lineTo(2, 3.4);
  ctx.closePath(); ctx.fill();

  // 残影：高速滑行时身后拖两道淡影，强化「惯性」
  if (fast > 0.45) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#bfe8ff';
    for (let k = 1; k <= 2; k++) {
      ctx.globalAlpha = (0.16 / k) * fast;
      ctx.save();
      ctx.translate(-k * (9 + 16 * fast), 0);
      ctx.scale(0.95, 1 - roll);
      body(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 剑身本体
  ctx.save();
  ctx.scale(1, 1 - roll);
  const blade = ctx.createLinearGradient(-11, -3, 10, 3);
  blade.addColorStop(0, '#9ecbe8');
  blade.addColorStop(0.42, '#ffffff');
  blade.addColorStop(1, '#dff3ff');
  body();
  ctx.fillStyle = blade;
  ctx.fill();
  ctx.strokeStyle = 'rgba(86,146,186,0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 剑脊高光
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-7, 0); ctx.stroke();
  // 剑尖
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.arc(14.5, 0, 1.5, 0, Math.PI * 2); ctx.fill();
  // 护手
  ctx.strokeStyle = '#74a9cd';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-9, -5.4); ctx.quadraticCurveTo(-11.6, 0, -9, 5.4); ctx.stroke();
  // 剑柄与缠绳
  ctx.strokeStyle = '#4d6f8c';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-10.5, 0); ctx.lineTo(-17, 0); ctx.stroke();
  ctx.strokeStyle = 'rgba(190,225,245,0.7)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 2; k++) {
    const hx = -12 - k * 2.4;
    ctx.beginPath(); ctx.moveTo(hx, -1.2); ctx.lineTo(hx, 1.2); ctx.stroke();
  }
  // 剑首宝石
  ctx.fillStyle = '#bfe8ff';
  ctx.beginPath(); ctx.arc(-18, 0, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawSummons() {
  summons.forEach(s => {
    if (s.type === 'sword') {
      (s.blades || []).forEach(b => drawSwordBlade(b, s.sizeMul || 1));
      return;
    }
    if (s.type !== 'scythe') return;
    const def = SUMMON_DEFS.scythe;
    const cnt = def.baseCount + s.extraCount;
    const size = def.size * (s.sizeMul || 1);
    const rad = def.orbitRadius;                    // 与伤害判定一致：环半径固定
    for (let i = 0; i < cnt; i++) {
      const a = (s.orbitAngle || 0) + (Math.PI * 2 / cnt) * i;
      const bx = squad.x + Math.cos(a) * rad;
      const by = squad.y + Math.sin(a) * rad;
      ctx.strokeStyle = '#e8e8e8';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(bx, by, size, a + 0.6, a + 3.4); ctx.stroke();
      ctx.fillStyle = '#9a9a9a';
      ctx.beginPath(); ctx.arc(bx, by, size * 0.33, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function drawPet() {
  if (!pet) return;
  const p = petPos();
  const star = pet.star || 1;

  // 地面阴影
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 17, 11, 4, 0, 0, Math.PI * 2); ctx.fill();

  // 3★ 起带上星级光环，5★ 更亮
  if (star >= 3) {
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 30);
    const a = star >= 5 ? 0.34 : 0.22;
    glow.addColorStop(0, `rgba(255,213,79,${a})`);
    glow.addColorStop(1, 'rgba(255,213,79,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, Math.PI * 2); ctx.fill();
    // 环绕星点
    for (let i = 0; i < star; i++) {
      const ang = gameTime * 1.6 + i * (Math.PI * 2 / star);
      ctx.fillStyle = 'rgba(255,236,150,0.9)';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(ang) * 20, p.y + Math.sin(ang) * 12, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPetModel(ctx, p.x, p.y, 11, gameTime, pet.type, { flash: pet.flashT > 0 });
}

// Boss 冲刺地面指示 + 读条
function drawBossTelegraph() {
  for (const e of enemies) {
    if (e.type !== 'boss') continue;
    if (e.skillState === 'charge') {
      const prog = Math.min(1, Math.max(0, 1 - e.skillT / BOSS_SKILL.chargeTime));
      const len = BOSS_SKILL.dashSpeed * BOSS_SKILL.dashTime;
      const w = e.r * 2.4;
      const hot = prog > 0.72;                                  // 临近释放：警示加强
      const pulse = hot ? 0.5 + 0.5 * Math.sin(gameTime * 26) : 0;

      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(Math.atan2(e.skillDirY, e.skillDirX));

      // 危险区域底色（随蓄力变亮）
      ctx.fillStyle = `rgba(255,${hot ? 40 : 80},70,${0.10 + prog * 0.26})`;
      ctx.fillRect(0, -w / 2, len, w);

      // 由内向外推进的蓄力填充
      if (prog > 0) {
        const g = ctx.createLinearGradient(0, 0, len * prog, 0);
        g.addColorStop(0, `rgba(255,205,70,${0.45 * prog})`);
        g.addColorStop(1, `rgba(255,90,45,${0.55 * prog})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, -w / 2, len * prog, w);
      }

      // 边框：快释放时闪烁
      ctx.strokeStyle = hot ? `rgba(255,${60 + 130 * pulse},70,1)` : 'rgba(255,115,90,0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, -w / 2, len, w);

      // 两侧流动虚线（指示冲刺方向）
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -gameTime * 90;
      ctx.strokeStyle = 'rgba(255,225,150,0.7)';
      ctx.beginPath();
      ctx.moveTo(0, -w / 2); ctx.lineTo(len, -w / 2);
      ctx.moveTo(0, w / 2); ctx.lineTo(len, w / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 冲刺终点的箭头
      ctx.fillStyle = hot ? `rgba(255,${80 + 130 * pulse},70,0.95)` : 'rgba(255,125,95,0.7)';
      ctx.beginPath();
      ctx.moveTo(len, -w / 2 - 9);
      ctx.lineTo(len + 22, 0);
      ctx.lineTo(len, w / 2 + 9);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      // 蓄力环：随进度向 Boss 收紧
      ctx.strokeStyle = hot ? `rgba(255,${70 + 130 * pulse},70,0.95)` : 'rgba(255,195,85,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 26 - 22 * prog, 0, Math.PI * 2); ctx.stroke();

      // 头顶读条 + 阶段文字
      ctx.save();
      const bw = Math.max(56, e.r * 3), bh = 7;
      const bx = e.x - bw / 2, by = e.y - e.r - 32;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      const bar = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      bar.addColorStop(0, '#ffd24a');
      bar.addColorStop(0.6, '#ff9a3b');
      bar.addColorStop(1, '#ff4a4a');
      ctx.fillStyle = bar;
      ctx.fillRect(bx, by, bw * prog, bh);
      ctx.strokeStyle = hot ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.fillStyle = hot ? '#ff8a5c' : '#ffd98a';
      const txt = hot ? '即将冲刺！' : '冲刺蓄力';
      ctx.strokeText(txt, e.x, by - 5);
      ctx.fillText(txt, e.x, by - 5);
      ctx.restore();
    } else if (e.skillState === 'dash') {
      // 冲刺中：拖影 + 冲击环
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 4; i++) {
        const d = i * e.r * 0.75;
        ctx.fillStyle = `rgba(255,${170 - i * 25},60,${0.26 - i * 0.05})`;
        ctx.beginPath();
        ctx.arc(e.x - e.skillDirX * d, e.y - e.skillDirY * d, Math.max(2, e.r * (1 - i * 0.14)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,180,90,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 8, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

// 树怪：以树木的造型为基础，加上发光的眼睛、锯齿嘴与四肢
function drawTreant(e) {
  const r = e.r;
  const sway = Math.sin(gameTime * 2.2) * r * 0.08;
  const walk = Math.sin(gameTime * 7);            // 双腿交替
  const swing = Math.sin(gameTime * 5);           // 双臂摆动
  const t = nearestSoldier(e.x, e.y);
  const ang = t ? Math.atan2(t.y - e.y, t.x - e.x) : Math.PI / 2;
  const face = Math.cos(ang) >= 0 ? 1 : -1;       // 朝向（眼睛/瞳孔偏移）

  ctx.save();
  ctx.translate(e.x, e.y);

  // 地面阴影
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.8, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();

  // 双腿
  drawTaper(-r * 0.24, r * 0.3, -r * 0.5, r * 0.68, -r * 0.46 + walk * r * 0.12, r * 0.98, r * 0.24, r * 0.13, '#4a3320');
  drawTaper(r * 0.24, r * 0.3, r * 0.5, r * 0.68, r * 0.46 - walk * r * 0.12, r * 0.98, r * 0.24, r * 0.13, '#4a3320');

  // 下摆根系
  ctx.fillStyle = '#4a3320';
  ctx.beginPath();
  ctx.moveTo(-r * 0.52, r * 0.4);
  ctx.quadraticCurveTo(-r * 0.36, -r * 0.05, -r * 0.16, -r * 0.12);
  ctx.lineTo(r * 0.16, -r * 0.12);
  ctx.quadraticCurveTo(r * 0.36, -r * 0.05, r * 0.52, r * 0.4);
  ctx.lineTo(r * 0.2, r * 0.5);
  ctx.lineTo(-r * 0.2, r * 0.5);
  ctx.closePath();
  ctx.fill();

  // 双臂 + 手指
  drawTaper(-r * 0.2, -r * 0.6, -r * 0.8, -r * 0.78 - swing * r * 0.3, -r * 1.12, -r * 0.34 + swing * r * 0.45, r * 0.22, r * 0.11, '#4a3320');
  drawTaper(r * 0.2, -r * 0.6, r * 0.8, -r * 0.78 + swing * r * 0.3, r * 1.12, -r * 0.34 - swing * r * 0.45, r * 0.22, r * 0.11, '#4a3320');
  for (let i = -1; i <= 1; i++) {
    drawTaper(-r * 1.12, -r * 0.34 + swing * r * 0.45, -r * 1.3, -r * 0.46 + swing * r * 0.5, -r * 1.48, -r * 0.54 + swing * r * 0.5 + i * r * 0.18, r * 0.09, r * 0.05, '#3c2a18');
    drawTaper(r * 1.12, -r * 0.34 - swing * r * 0.45, r * 1.3, -r * 0.46 - swing * r * 0.5, r * 1.48, -r * 0.54 - swing * r * 0.5 + i * r * 0.18, r * 0.09, r * 0.05, '#3c2a18');
  }

  // 树干
  drawTaper(0, r * 0.4, sway * 0.3, -r * 0.4, sway * 0.5, -r * 1.0, r * 0.42, r * 0.3, '#5d3f24');
  drawTaper(-r * 0.09, r * 0.3, sway * 0.3 - r * 0.08, -r * 0.4, sway * 0.5 - r * 0.08, -r * 0.95, r * 0.09, r * 0.05, '#8a6338');

  // 眼睛（红光呼吸）+ 锯齿嘴
  const fx = sway * 0.5 + face * r * 0.04, fy = -r * 0.36;
  ctx.fillStyle = '#241408';
  ctx.beginPath(); ctx.ellipse(fx - r * 0.18, fy, r * 0.14, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(fx + r * 0.18, fy, r * 0.14, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  const glow = 0.7 + 0.3 * Math.sin(gameTime * 6);
  ctx.fillStyle = `rgba(255,86,60,${glow})`;
  ctx.beginPath(); ctx.arc(fx - r * 0.18 + face * r * 0.04, fy - r * 0.01, r * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(fx + r * 0.18 + face * r * 0.04, fy - r * 0.01, r * 0.07, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = '#241408';
  ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.beginPath();
  ctx.moveTo(fx - r * 0.2, fy + r * 0.3);
  for (let i = 1; i <= 4; i++) {
    ctx.lineTo(fx - r * 0.2 + r * 0.4 * (i / 4), fy + r * 0.3 + (i % 2 ? r * 0.1 : 0));
  }
  ctx.stroke();

  // 树冠（暗底 → 主体 → 受光面）
  const cy = -r * 1.38;
  const canopy = (fill, k, dx, dy) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(sway * 0.55 + dx, cy + dy, r * 0.6 * k, 0, Math.PI * 2);
    ctx.arc(sway * 0.55 + dx - r * 0.5 * k, cy + dy + r * 0.32 * k, r * 0.46 * k, 0, Math.PI * 2);
    ctx.arc(sway * 0.55 + dx + r * 0.52 * k, cy + dy + r * 0.28 * k, r * 0.44 * k, 0, Math.PI * 2);
    ctx.arc(sway * 0.55 + dx, cy + dy - r * 0.44 * k, r * 0.44 * k, 0, Math.PI * 2);
    ctx.fill();
  };
  canopy('#2f4a22', 1.08, 0, r * 0.07);
  canopy('#5f8b4c', 1, 0, 0);
  canopy('#8fbf6a', 0.42, -r * 0.26, -r * 0.3);

  ctx.restore();
}

function drawEnemies() {
  enemies.forEach(e => {
    const def = ENEMY_TYPES[e.type];

    if (e.type === 'elite') {
      ctx.fillStyle = '#8e4fd0';
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i + 0.3;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r);
        ctx.lineTo(e.x + Math.cos(a + 0.4) * (e.r + 8), e.y + Math.sin(a + 0.4) * (e.r + 8));
        ctx.lineTo(e.x + Math.cos(a - 0.4) * (e.r + 8), e.y + Math.sin(a - 0.4) * (e.r + 8));
        ctx.closePath(); ctx.fill();
      }
    }

    if (e.type === 'boss') {
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.moveTo(e.x - 14, e.y - e.r);
      ctx.lineTo(e.x - 7, e.y - e.r - 14);
      ctx.lineTo(e.x, e.y - e.r - 4);
      ctx.lineTo(e.x + 7, e.y - e.r - 16);
      ctx.lineTo(e.x + 14, e.y - e.r);
      ctx.closePath();
      ctx.fill();
    }

    // 特殊敌人的标识光环
    if (e.type === 'healer') {
      ctx.strokeStyle = 'rgba(77,208,122,0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, def.healR * 0.5, 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === 'summoner') {
      ctx.strokeStyle = 'rgba(160,108,208,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === 'hunter') {
      ctx.strokeStyle = 'rgba(208,106,138,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4, -0.6, 0.6); ctx.stroke();
    } else if (e.type === 'bomber') {
      const blink = 0.5 + 0.5 * Math.sin(gameTime * 14);
      ctx.fillStyle = `rgba(255,90,60,${0.4 + blink * 0.6})`;
      ctx.beginPath(); ctx.arc(e.x, e.y - e.r * 0.9, 3.5, 0, Math.PI * 2); ctx.fill();
    }

    if (e.type === 'treant') {
      drawTreant(e);                                       // 树怪：用树的造型 + 眼睛手脚
    } else {
      ctx.fillStyle = e.type === 'boss' ? BOSS_KINDS[e.kind].color : def.color;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();

      const t = nearestSoldier(e.x, e.y);
      const ang = t ? Math.atan2(t.y - e.y, t.x - e.x) : 0;
      const ex = Math.cos(ang) * e.r * 0.35, ey = Math.sin(ang) * e.r * 0.35;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(e.x + ex - 3, e.y + ey - 2, e.r * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e.x + ex + 3, e.y + ey - 2, e.r * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(e.x + ex - 3 + ex * 0.4, e.y + ey - 2 + ey * 0.4, e.r * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e.x + ex + 3 + ex * 0.4, e.y + ey - 2 + ey * 0.4, e.r * 0.12, 0, Math.PI * 2); ctx.fill();
    }

    // 点燃：身上着火的动态火焰特效
    if (e.burnT > 0) drawBurning(e);

    // 冰刺：霜冻减速 / 冰冻的冰雪特效
    if (e.freezeT > 0) drawIceBlock(e);
    else if (e.frostT > 0) drawFrost(e);

    // 护盾环（精英怪被动）
    if (e.shieldMax > 0 && e.shield > 0) {
      ctx.strokeStyle = 'rgba(120,210,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5, 0, Math.PI * 2); ctx.stroke();
    }

    // 时缓：减速标记
    if (enemySlowT > 0) {
      ctx.strokeStyle = 'rgba(157,224,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 8, 0, Math.PI * 2); ctx.stroke();
    }

    // Boss 二阶段：狂暴红环
    if (e.type === 'boss' && e.phase2) {
      ctx.strokeStyle = 'rgba(255,80,80,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 11, 0, Math.PI * 2); ctx.stroke();
    }

    // 树怪整体更高，血条抬到树冠上方
    const barY = e.type === 'treant' ? e.y - e.r * 2.05 - 6 : e.y - e.r - 6;
    drawBar(e.x, barY, e.r * 2, 4, e.hp / e.maxHp, '#f66');
    if (e.shieldMax > 0) {
      drawBar(e.x, barY - 5, e.r * 2, 3, e.shield / e.shieldMax, '#7fd8ff');
    }
  });
}

function drawBullets() {
  bullets.forEach(b => {
    if (b.petShot) {                    // 宠物弹丸：炽热小火球 + 短拖尾
      const ang = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r * 3.2);
      g.addColorStop(0, 'rgba(255,248,220,0.95)');
      g.addColorStop(0.35, 'rgba(255,186,86,0.5)');
      g.addColorStop(1, 'rgba(255,90,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, b.r * 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(ang);
      const lg = ctx.createLinearGradient(-b.r * 4.5, 0, 0, 0);
      lg.addColorStop(0, 'rgba(255,90,0,0)');
      lg.addColorStop(1, 'rgba(255,204,120,0.5)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(0, -b.r * 0.8); ctx.lineTo(-b.r * 4.5, 0); ctx.lineTo(0, b.r * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      return;
    }
    if (b.fireball) {                   // 火球：炽白核心 + 翻卷火舌 + 火焰拖尾
      const t = gameTime;
      const ang = Math.atan2(b.vy, b.vx);
      const flick = 0.86 + 0.14 * Math.sin(t * 36 + b.x * 0.12);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.globalCompositeOperation = 'lighter';
      // 外层火光晕
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r * 4.4 * flick);
      halo.addColorStop(0, 'rgba(255,196,96,0.55)');
      halo.addColorStop(0.42, 'rgba(255,116,32,0.28)');
      halo.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(0, 0, b.r * 4.4 * flick, 0, Math.PI * 2); ctx.fill();
      // 后方拖尾火舌（沿飞行方向）
      ctx.rotate(ang);
      for (let i = 0; i < 3; i++) {
        const len = b.r * (2.4 + i * 1.6) * flick;
        const wj = Math.sin(t * 24 + i * 2.1) * b.r * 0.55;
        const lg = ctx.createLinearGradient(-len, 0, 0, 0);
        lg.addColorStop(0, 'rgba(255,60,0,0)');
        lg.addColorStop(0.5, `rgba(255,${110 + i * 25},22,0.3)`);
        lg.addColorStop(1, 'rgba(255,206,110,0.5)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(0, -b.r * 0.9 * (1 - i * 0.2));
        ctx.quadraticCurveTo(-len * 0.5, -b.r * 0.45 + wj, -len, wj * 0.6);
        ctx.quadraticCurveTo(-len * 0.5, b.r * 0.45 + wj, 0, b.r * 0.9 * (1 - i * 0.2));
        ctx.closePath(); ctx.fill();
      }
      ctx.rotate(-ang);
      // 橙焰球体 + 炽白核心
      ctx.fillStyle = 'rgba(255,148,52,0.95)';
      ctx.beginPath(); ctx.arc(0, 0, b.r * 1.05, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,246,206,0.95)';
      ctx.beginPath(); ctx.arc(0, 0, b.r * 0.54, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (b.ice) {                        // 冰刺：锐利冰晶 + 寒气拖尾
      const ang = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      const tg = ctx.createLinearGradient(-30, 0, 4, 0);
      tg.addColorStop(0, 'rgba(143,227,255,0)');
      tg.addColorStop(1, 'rgba(205,246,255,0.5)');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(-30, -2.4); ctx.lineTo(4, -4.6); ctx.lineTo(4, 4.6); ctx.lineTo(-30, 2.4);
      ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createLinearGradient(-9, 0, 14, 0);
      g.addColorStop(0, 'rgba(206,246,255,0.95)');
      g.addColorStop(1, 'rgba(118,203,245,0.95)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(15, 0); ctx.lineTo(-1, -5.2); ctx.lineTo(-9, 0); ctx.lineTo(-1, 5.2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(12, 0); ctx.stroke();
      ctx.restore();
      return;
    }
    if (b.tracer) {                     // 狙击枪：细长弹道
      const ang = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      const g = ctx.createLinearGradient(-34, 0, 8, 0);
      g.addColorStop(0, 'rgba(200,179,255,0)');
      g.addColorStop(1, b.color);
      ctx.fillStyle = g;
      ctx.fillRect(-34, -1.6, 44, 3.2);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  });
}

function drawEnemyBullets() {
  ctx.fillStyle = '#ff5f5f';
  enemyBullets.forEach(b => {
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  });
}

// 闪电路径（可整体轻微抖动，模拟电弧闪动）
function strokeBoltPath(b, dx) {
  ctx.beginPath();
  ctx.moveTo(b.segs[0].x + dx * 0.4, b.segs[0].y);
  for (let i = 1; i < b.segs.length; i++) ctx.lineTo(b.segs[i].x + dx, b.segs[i].y);
  ctx.stroke();
}

function drawLightningBolts() {
  lightningBolts.forEach(b => {
    const k = Math.max(0, b.life / b.maxLife);          // 1 → 0
    const flash = k > 0.6 ? 1 : k / 0.6;

    // 落点闪光
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 44);
    g.addColorStop(0, `rgba(225,250,255,${0.55 * flash})`);
    g.addColorStop(1, 'rgba(140,220,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, 44, 0, Math.PI * 2); ctx.fill();

    // 地面冲击环
    const ringR = 10 + (1 - k) * 30;
    ctx.strokeStyle = `rgba(190,240,255,${0.75 * k})`;
    ctx.lineWidth = 3 * k + 0.6;
    ctx.beginPath(); ctx.ellipse(b.x, b.y + 4, ringR, ringR * 0.42, 0, 0, Math.PI * 2); ctx.stroke();

    const dx = Math.sin(gameTime * 70 + b.seed) * 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // 外发光 → 中层 → 白色内核
    ctx.strokeStyle = `rgba(110,200,255,${0.30 * k})`;
    ctx.lineWidth = 10;
    strokeBoltPath(b, dx);
    ctx.strokeStyle = `rgba(180,235,255,${0.65 * k})`;
    ctx.lineWidth = 5;
    strokeBoltPath(b, dx);
    ctx.strokeStyle = `rgba(255,255,255,${0.95 * k})`;
    ctx.lineWidth = 1.8;
    strokeBoltPath(b, dx);

    // 分叉
    ctx.strokeStyle = `rgba(200,240,255,${0.7 * k})`;
    ctx.lineWidth = 2;
    (b.forks || []).forEach(f => {
      ctx.beginPath();
      ctx.moveTo(f.x1, f.y1);
      ctx.lineTo((f.x1 + f.x2) / 2 + dx * 2, (f.y1 + f.y2) / 2);
      ctx.lineTo(f.x2, f.y2);
      ctx.stroke();
    });
  });
}

// 冰刺命中：碎冰炸裂（向外飞散的锋利冰晶 + 外扩霜圈 + 中心寒芒）
function drawIceSpikes() {
  iceSpikes.forEach(s => {
    const k = Math.max(0, s.life / s.maxLife);   // 1 → 0
    const grow = 1 - k;                          // 0 → 1
    ctx.save();
    ctx.globalAlpha = k;

    // 外扩霜圈
    const ringR = s.r * (0.45 + grow * 1.15);
    ctx.strokeStyle = 'rgba(200,240,255,0.7)';
    ctx.lineWidth = 2.6 * k + 0.6;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, ringR, ringR * 0.44, 0, 0, Math.PI * 2); ctx.stroke();

    // 中心寒芒
    const cg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 1.15);
    cg.addColorStop(0, `rgba(240,252,255,${0.8 * k})`);
    cg.addColorStop(1, 'rgba(140,220,255,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.15, 0, Math.PI * 2); ctx.fill();

    // 四散碎冰：向外飞散并逐渐缩短
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = s.seed + (Math.PI * 2 / n) * i;
      const d = s.r * (0.25 + grow * 0.9);
      const px = s.x + Math.cos(a) * d;
      const py = s.y + Math.sin(a) * d * 0.72 - (1 - grow) * s.r * 0.25;
      const len = s.r * 0.72 * (1 - grow * 0.5);
      const w = s.r * 0.17 * (1 - grow * 0.35);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, 'rgba(120,200,240,0.95)');
      g.addColorStop(1, 'rgba(240,252,255,0.95)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(len, 0); ctx.lineTo(0, -w); ctx.lineTo(0, w);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  });
}

// 火球爆炸：中心闪光 + 膨胀火环 + 上飘火团
function drawBlasts() {
  blasts.forEach(b => {
    const k = Math.max(0, b.life / b.maxLife);   // 1 → 0
    const grow = 1 - k;                          // 0 → 1
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const flash = Math.max(0, k - 0.45) / 0.55;
    if (flash > 0) {
      const fr = b.r * (0.35 + grow * 0.45);
      const fg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, fr);
      fg.addColorStop(0, `rgba(255,250,222,${0.85 * flash})`);
      fg.addColorStop(0.42, `rgba(255,180,72,${0.5 * flash})`);
      fg.addColorStop(1, 'rgba(255,90,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(b.x, b.y, fr, 0, Math.PI * 2); ctx.fill();
    }

    const rr = b.r * (0.32 + grow * 0.95);
    const rg = ctx.createRadialGradient(b.x, b.y, rr * 0.45, b.x, b.y, rr);
    rg.addColorStop(0, 'rgba(255,120,20,0)');
    rg.addColorStop(0.72, `rgba(255,142,32,${0.42 * k})`);
    rg.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, Math.PI * 2); ctx.fill();

    for (let i = 0; i < 5; i++) {
      const a = b.seed + i * 1.257 + grow * 1.6;
      const d = b.r * grow * (0.5 + 0.35 * Math.sin(i * 3.1 + b.seed));
      const px = b.x + Math.cos(a) * d;
      const py = b.y + Math.sin(a) * d * 0.7 - grow * b.r * 0.5;
      const pr = b.r * 0.34 * k + 2;
      const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
      pg.addColorStop(0, `rgba(255,212,124,${0.42 * k})`);
      pg.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawHUD() {
  // 对局时长（顶部居中）
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`对局 ${fmtTime(gameTime)}`, W / 2, 22);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`波次 ${wave}`, 12, 22);
  ctx.fillText(`小兵 ${soldiers.length}`, 12, 44);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.fillText(`击杀 ${kills}`, W - 12, 22);
  ctx.fillText(`金币 ${runCoins}`, W - 12, 44);
  if (squad.shieldMax > 0) {
    ctx.fillStyle = '#7ee0ff';
    ctx.fillText(`护盾 ${Math.ceil(squad.shield)}/${squad.shieldMax}`, W - 12, 66);
  }

  // BOSS 血条
  const boss = enemies.find(e => e.type === 'boss');
  if (boss) {
    const bw = W - 60, bx = 30, by = 96, bh = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, boss.hp / boss.maxHp)), bh);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(boss.kind ? `BOSS · ${BOSS_KINDS[boss.kind].name}` : 'BOSS', W / 2, by - 6);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`Lv.${level}`, 12, 74);
  const bx = 12, by = 80, bw = W - 24, bh = 10;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#4dd0ff';
  ctx.fillRect(bx, by, bw * Math.min(1, xp / xpToNext), bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.strokeRect(bx, by, bw, bh);
}

function render() {
  // 每帧重置基准变换（dpr 缩放），避免任何 save/restore 失衡导致错位
  const dpr = canvasDpr();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  ctx.save();
  ctx.translate(-camera.x + sx, -camera.y + sy);
  drawBackground();
  drawDrops();
  drawObstacles();
  drawSoldiers();
  drawVines();
  drawSummons();
  drawPet();
  drawBossTelegraph();
  drawIceSpikes();
  drawEnemies();
  drawBullets();
  drawEnemyBullets();
  drawLightningBolts();
  drawBlasts();
  drawSwordSlashes();
  drawParticles();
  drawDamageNumbers();
  ctx.restore();
  drawHUD();
  drawBanner();
  drawJoystick();
}

// 居中横幅（Boss 出场 / 狂暴）
function drawBanner() {
  if (banner.t <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, banner.t * 1.6);
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px sans-serif';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(banner.text, W / 2, H * 0.24);
  ctx.fillStyle = '#ffd54f';
  ctx.fillText(banner.text, W / 2, H * 0.24);
  ctx.restore();
}

// ==================== 主循环 ====================
let last = performance.now();
let fpsAccum = 0;

function update(dt) {
  if (state !== 'playing') return;
  gameTime += dt;
  updateSquad(dt);
  updateSoldiers(dt);
  updateShield(dt);
  if (stats.regen > 0) healSquad(stats.regen * dt);   // 回血宝珠：每秒回血
  updateSkills(dt);
  updateWeapons(dt);
  updateSummons(dt);
  updatePet(dt);
  updateBullets(dt);
  updateEnemies(dt);
  resolveEnemyCollisions();   // 敌人也被障碍物挡住
  updateEnemyBullets(dt);
  updateLightningBolts(dt);
  updateIceSpikes(dt);
  updateBlasts(dt);
  updateDrops(dt);
  updateSpawning(dt);
  updateObstacles(dt);
  updateVines(dt);
  updateParticles(dt);
  updateDamageNumbers(dt);
  if (banner.t > 0) banner.t -= dt;
  shake = Math.max(0, shake - dt * 50);
  if (soldiers.length === 0) gameOver();
}

function loop(now) {
  requestAnimationFrame(loop);
  const raw = now - last;
  last = now;

  const cap = meta.settings.fps || 0;   // 0 = 不限制
  let dt;
  if (cap > 0) {
    const frame = 1000 / cap;
    fpsAccum += raw;
    if (fpsAccum < frame) return;
    fpsAccum = Math.min(fpsAccum - frame, frame);   // 限制追帧，避免卡顿后爆发
    dt = frame / 1000;
  } else {
    fpsAccum = 0;
    dt = Math.min(0.05, raw / 1000);
  }

  // 贯穿命中顿帧：极短地冻结逻辑（渲染照常），强化打击感
  if (hitStop > 0) hitStop = Math.max(0, hitStop - dt);
  else update(dt);
  render();

  // 暂停按钮只在可操作的对局中显示（升级 / Boss 奖励面板打开时隐藏）
  const btn = document.getElementById('btn-pause');
  const shouldHide = state !== 'playing';
  if (btn.classList.contains('hidden') !== shouldHide) btn.classList.toggle('hidden', shouldHide);
  renderSkillButtons();
}

// ==================== 暂停 / 显示设置 ====================
// 按设备像素比渲染，保证手机高清屏不模糊（上限 2 倍，兼顾性能）
function canvasDpr() { return Math.min(window.devicePixelRatio || 1, 2); }

// 竖屏允许的宽高比区间：16:9(1.78) ~ 22:9(2.44) 覆盖主流手机；横屏为倒数区间
const ASPECT_PORTRAIT = [9 / 22, 9 / 16];
const ASPECT_LANDSCAPE = [16 / 9, 22 / 9];

function applyOrientation() {
  const land = meta.settings.orient === 'landscape';
  const doc = document.documentElement;
  const vw = doc.clientWidth || window.innerWidth || 1;
  const vh = doc.clientHeight || window.innerHeight || 1;
  const [lo, hi] = land ? ASPECT_LANDSCAPE : ASPECT_PORTRAIT;
  const ar = Math.min(Math.max(vw / vh, lo), hi);

  // 逻辑分辨率跟随屏幕比例，手机屏内满屏显示且不变形
  if (land) { H = 450; W = Math.round(H * ar); }
  else { W = 450; H = Math.round(W / ar); }

  const stage = document.getElementById('stage');
  stage.classList.toggle('landscape', land);
  stage.style.setProperty('--arw', String(W / H));
  const dpr = canvasDpr();
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateCamera();
}

// 屏幕尺寸/方向变化时重新适配（含手机旋转、桌面窗口缩放）
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyOrientation, 120);
});

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  document.getElementById('pause-stats').textContent =
    `对局时长 ${fmtTime(gameTime)} · 波次 ${wave} · 击杀 ${kills}` +
    (bossKills > 0 ? ` · 经验 +${Math.round((xpScale() - 1) * 100)}% · 出怪 +${Math.round((spawnScale() - 1) * 100)}%` : '');
  document.getElementById('pause').classList.remove('hidden');
  document.getElementById('btn-pause').classList.add('hidden');
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('btn-pause').classList.remove('hidden');
  last = performance.now();
  fpsAccum = 0;
}

function renderDisplaySettings() {
  const orient = meta.settings.orient || 'portrait';
  const fps = meta.settings.fps || 0;
  const chip = (group, value, label, active) =>
    `<button class="chip${active ? ' active' : ''}" data-group="${group}" data-value="${value}">${label}</button>`;
  const html = `
    <div class="opt-group">
      <div class="opt-name">显示方向</div>
      <div class="chip-row">
        ${chip('orient', 'portrait', '竖屏', orient === 'portrait')}
        ${chip('orient', 'landscape', '横屏', orient === 'landscape')}
      </div>
    </div>
    <div class="opt-group">
      <div class="opt-name">帧率上限</div>
      <div class="chip-row">
        ${chip('fps', 30, '30', fps === 30)}
        ${chip('fps', 60, '60', fps === 60)}
        ${chip('fps', 120, '120', fps === 120)}
        ${chip('fps', 0, '不限', fps === 0)}
      </div>
    </div>`;
  document.querySelectorAll('.disp-settings').forEach(el => { el.innerHTML = html; });
}

function renderCharOptions() {
  const ch = meta.character;
  const group = (name, key, items) => {
    const chips = items.map((it, i) => {
      const sw = it.color ? `<span class="swatch" style="background:${it.color}"></span>` : '';
      return `<button class="chip${ch[key] === i ? ' active' : ''}" data-group="char" data-key="${key}" data-index="${i}">${sw}${it.name}</button>`;
    }).join('');
    return `<div class="opt-group"><div class="opt-name">${name}</div><div class="chip-row">${chips}</div></div>`;
  };
  document.getElementById('char-opts').innerHTML =
    group('毛色', 'fur', CHAR_FUR) +
    group('服装', 'cloth', CHAR_CLOTH) +
    group('头饰', 'hat', CHAR_HAT) +
    group('眼睛', 'eye', CHAR_EYE) +
    group('体型', 'size', CHAR_SIZE);
}

// 角色 / 显示设置的选择（事件委托）
document.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const g = chip.dataset.group;
  if (g === 'char') {
    meta.character[chip.dataset.key] = Number(chip.dataset.index);
  } else if (g === 'petSel') {
    petPreviewSel = chip.dataset.id;     // 仅切换预览/养成对象，不写存档
    renderPetDev();
    return;
  } else if (g === 'orient') {
    meta.settings.orient = chip.dataset.value;
    applyOrientation();
  } else if (g === 'fps') {
    meta.settings.fps = Number(chip.dataset.value);
    fpsAccum = 0;
    last = performance.now();
  } else {
    return;
  }
  saveMeta();
  renderCharOptions();
  renderDisplaySettings();
});

// ==================== 流程控制 ====================
function startGame() {
  if (meta.run) { meta.run = null; saveMeta(); }   // 开新局：丢弃上把进度
  reset();
  initAudio();
  startMusic();
  applyOrientation();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('btn-pause').classList.remove('hidden');
  last = performance.now();
  fpsAccum = 0;
  state = 'playing';
}

function gameOver() {
  state = 'gameover';
  stopMusic();
  meta.coins += runCoins;
  if (wave > meta.bestWave) meta.bestWave = wave;
  meta.run = null;               // 本局结束，不再保留进度
  // 宠物熟练度结算：局内造成的伤害折算成养成经验
  let petText = '';
  if (pet && petRunExp > 0) {
    const id = pet.type;
    const up = gainPetExp(id, petRunExp);
    const d = petDev(id);
    petText = ` · 宠物熟练度 +${Math.round(petRunExp)}` + (up > 0 ? `（${PET_DEFS[id].name} 升到 Lv.${d.lv}）` : '');
  }
  saveMeta();
  document.getElementById('btn-pause').classList.add('hidden');
  document.getElementById('go-stats').textContent =
    `波次 ${wave} · 击杀 ${kills} · 等级 ${level} · 时长 ${fmtTime(gameTime)}${petText}`;
  document.getElementById('go-coins').textContent = runCoins;
  document.getElementById('gameover').classList.remove('hidden');
}

// ==================== 主菜单 ====================
function isUnlocked(cat, id) { return meta.unlocked[cat].includes(id); }

function equip(cat, key, id) {
  meta.equipped[key] = id;
  saveMeta();
  renderMenu();
}

function unlock(cat, key, id, cost) {
  if (meta.coins < cost) return;
  meta.coins -= cost;
  meta.unlocked[cat].push(id);
  meta.equipped[key] = id;
  saveMeta();
  renderMenu();
}

function renderItemRows(containerId, cat, defs, key) {
  const box = document.getElementById(containerId);
  box.innerHTML = '';
  Object.entries(defs).forEach(([id, def]) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const unlocked = isUnlocked(cat, id);
    const equipped = meta.equipped[key] === id;
    let btn;
    if (equipped) {
      btn = `<button class="item-btn equipped" disabled>已装备</button>`;
    } else if (unlocked) {
      btn = `<button class="item-btn" data-act="equip" data-cat="${cat}" data-key="${key}" data-id="${id}">装备</button>`;
    } else {
      const afford = meta.coins >= def.cost;
      btn = `<button class="item-btn${afford ? '' : ' locked'}" data-act="unlock" data-cat="${cat}" data-key="${key}" data-id="${id}" data-cost="${def.cost}">解锁 ${def.cost}🪙</button>`;
    }
    row.innerHTML = `<div class="item-info"><div class="item-name">${def.name}</div><div class="item-desc">${def.desc}</div></div>${btn}`;
    box.appendChild(row);
  });
}

// 宠物养成面板：抽蛋 / 等级熟练度 / 升星词条 / 天赋加点
function renderPetDev() {
  const box = document.getElementById('pet-dev');
  if (!box) return;
  box.innerHTML = '';

  const egg = document.createElement('div');
  egg.className = 'item-row';
  const affordEgg = meta.coins >= PET_DEV_CFG.eggCost;
  egg.innerHTML = `<div class="item-info"><div class="item-name">宠物蛋</div><div class="item-desc">随机孵化一只宠物；重复获得转化为碎片（${PET_DEV_CFG.shardPerStar} 碎片升 1 星）</div></div>
    <button class="item-btn${affordEgg ? '' : ' locked'}" data-act="egg">孵化 ${PET_DEV_CFG.eggCost}🪙</button>`;
  box.appendChild(egg);

  if (petMsg) {
    const m = document.createElement('p');
    m.className = 'dim';
    m.textContent = petMsg;
    box.appendChild(m);
  }

  // 宠物选择（与角色个性化一致：先选，再养成）
  const selBox = document.getElementById('pet-select');
  const unlockedIds = Object.keys(PET_DEFS).filter(id => isUnlocked('pets', id));
  if (!petPreviewSel || !unlockedIds.includes(petPreviewSel)) {
    petPreviewSel = unlockedIds.includes(meta.equipped.pet) ? meta.equipped.pet : unlockedIds[0] || null;
  }
  if (selBox) {
    selBox.innerHTML = unlockedIds.length
      ? unlockedIds.map(id => `<button class="chip${id === petPreviewSel ? ' active' : ''}" data-group="petSel" data-id="${id}">${PET_DEFS[id].name}${meta.equipped.pet === id ? ' · 出战' : ''}</button>`).join('')
      : '<span class="dim">还没有宠物，先在下方孵化或解锁一只</span>';
  }

  // 仅渲染当前选中宠物的养成面板（未选中则提示）
  const showId = petPreviewSel;
  if (!showId) return;
  const def = PET_DEFS[showId];
  const d = petDev(showId);
  const wrap = document.createElement('div');
  wrap.className = 'item-row';
  wrap.style.cssText = 'display:block;';
  const free = petTalentFree(d);
  const maxed = d.lv >= PET_DEV_CFG.lvMax;
  const need = maxed ? 0 : petExpNeed(d.lv);
  const pct = need ? Math.min(100, (d.exp / need) * 100) : 100;
  const affixText = d.affixes.length
    ? d.affixes.map(a => `${PET_AFFIXES[a].name}（${PET_AFFIXES[a].desc}）`).join('、')
    : '无（3★ / 5★ 各解锁 1 个）';
  let html = `<div class="item-name">${def.name} <span class="dim">Lv.${d.lv}${maxed ? '（满级）' : ''} · ${'★'.repeat(d.star)} · 碎片 ${d.shards}/${PET_DEV_CFG.shardPerStar}</span></div>
    <div class="item-desc">熟练度 ${Math.floor(d.exp)}/${maxed ? '—' : need}</div>
    <div style="margin-top:4px;height:6px;background:#222;border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#ffd54f"></div></div>
    <div class="item-desc" style="margin-top:6px">词条：${affixText}</div>
    <div class="item-desc">天赋点：剩余 ${free} / 共 ${petTalentTotal(d)}（每 2 级 1 点）</div>`;
  (PET_TREES[showId] || []).forEach(br => {
    const p = d.talents[br.id] || 0;
    const can = p < br.max && free > 0;
    const unlock = p >= br.unlockAt
      ? `<span style="color:#7ef07e">已解锁：${br.unlockDesc}</span>`
      : `${br.unlockAt} 点解锁：${br.unlockDesc}`;
    html += `<div style="display:flex;align-items:center;gap:8px;margin-top:6px">
      <div style="flex:1;min-width:0">
        <div class="item-name">${br.name} ${p}/${br.max}</div>
        <div class="item-desc">${br.desc} · ${unlock}</div>
      </div>
      <button class="item-btn${can ? '' : ' locked'}" data-act="talent" data-id="${showId}" data-branch="${br.id}"${can ? '' : ' disabled'}>+</button>
    </div>`;
  });
  const canStar = d.star < PET_DEV_CFG.starMax && d.shards >= PET_DEV_CFG.shardPerStar;
  const starTip = d.star >= PET_DEV_CFG.starMax ? '已满星' : `升星（${PET_DEV_CFG.shardPerStar} 碎片）`;
  html += `<div style="margin-top:8px"><button class="item-btn${canStar ? '' : ' locked'}" data-act="star" data-id="${showId}"${canStar ? '' : ' disabled'}>${starTip}</button></div>`;
  wrap.innerHTML = html;
  box.appendChild(wrap);
}

function renderBag() {
  const box = document.getElementById('list-bag');
  box.innerHTML = '';
  const groups = [['weapons', SHOP.weapons], ['equipment', SHOP.equipment], ['items', SHOP.items], ['pets', SHOP.pets]];
  let any = false;
  groups.forEach(([cat, defs]) => {
    Object.entries(defs).forEach(([id, def]) => {
      if (isUnlocked(cat, id)) {
        any = true;
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `<div class="item-info"><div class="item-name">${def.name}</div><div class="item-desc">${def.desc}</div></div>`;
        box.appendChild(row);
      }
    });
  });
  if (!any) box.innerHTML = '<p class="dim">背包为空</p>';
}

function renderMenu() {
  document.getElementById('coin-count').textContent = meta.coins;
  document.getElementById('coin-count2').textContent = meta.coins;
  document.getElementById('best-wave').textContent = meta.bestWave;
  // 主页：用户名
  document.getElementById('home-user').textContent = playerName();
  renderCharOptions();
  renderDisplaySettings();
  renderItemRows('list-weapons', 'weapons', SHOP.weapons, 'weapon');
  renderItemRows('list-equipment', 'equipment', SHOP.equipment, 'equipment');
  renderItemRows('list-items', 'items', SHOP.items, 'item');
  renderItemRows('list-pets', 'pets', SHOP.pets, 'pet');
  renderPetDev();
  renderBag();
  document.getElementById('opt-sound').checked = !!meta.settings.sound;
}

// 标签切换
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// 物品按钮（事件委托）
document.addEventListener('click', e => {
  const btn = e.target.closest('.item-btn');
  if (!btn || btn.disabled) return;
  const cat = btn.dataset.cat, key = btn.dataset.key, id = btn.dataset.id;
  if (btn.dataset.act === 'equip') {
    equip(cat, key, id);
  } else if (btn.dataset.act === 'unlock') {
    unlock(cat, key, id, Number(btn.dataset.cost));
  } else if (btn.dataset.act === 'egg') {
    drawPetEgg();
  } else if (btn.dataset.act === 'star') {
    starUpPet(btn.dataset.id);
  } else if (btn.dataset.act === 'talent') {
    addPetTalent(btn.dataset.id, btn.dataset.branch);
  }
});

document.getElementById('btn-play').onclick = () => {
  if (meta.run) continueRun();      // 有上把进度：回到当时的暂停 / 设置界面
  else startGame();
};
document.getElementById('btn-restart').onclick = startGame;
document.getElementById('btn-pause').onclick = pauseGame;
document.getElementById('btn-resume').onclick = resumeGame;
document.getElementById('btn-newgame').onclick = startGame;
document.getElementById('btn-reroll').onclick = rerollUpgrades;
document.getElementById('skill-slow').onclick = () => useSkill('slow');
document.getElementById('btn-quit').onclick = () => {
  saveRun();                        // 返回主菜单：保留上把进度
  state = 'menu';
  stopMusic();
  renderMenu();
  showMenu();
};
document.getElementById('btn-change').onclick = () => {
  stopMusic();
  document.getElementById('gameover').classList.add('hidden');
  renderMenu();
  showMenu();
};
document.getElementById('opt-sound').addEventListener('change', e => {
  meta.settings.sound = e.target.checked;
  saveMeta();
});
document.getElementById('btn-reset').onclick = () => {
  if (confirm('确定重置当前账号进度？')) {
    meta = defaultMeta();
    saveMeta();
    applyOrientation();
    renderMenu();
  }
};
document.getElementById('btn-login').onclick = () => {
  loginError('');
  login(document.getElementById('login-user').value, document.getElementById('login-pass').value);
};
document.getElementById('btn-register').onclick = () => {
  if (!registerMode) { setLoginMode(true); return; }
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const p2 = document.getElementById('login-pass2').value;
  if (!u || !p) { loginError('请输入用户名和密码'); return; }
  if (p !== p2) { loginError('两次输入的密码不一致'); return; }
  if (users.some(x => x.username === u)) { loginError('用户名已存在'); return; }
  if (register(u, p)) setLoginMode(false);
};
document.getElementById('btn-back').onclick = () => setLoginMode(false);
document.getElementById('btn-logout').onclick = logout;

// 启动：先读本地存档文件，再决定进主菜单还是登录页
loadUsers().then(() => {
  const savedUser = localStorage.getItem('fury_current_user');
  if (savedUser && users.some(u => u.username === savedUser)) {
    currentUser = savedUser;
    meta = normalizeMeta(users.find(u => u.username === savedUser).meta);
    renderMenu();
    showMenu();
  } else {
    showLogin();
  }
});
requestAnimationFrame(loop);
requestAnimationFrame(charPreviewLoop);
