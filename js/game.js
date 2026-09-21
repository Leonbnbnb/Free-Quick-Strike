// ==================== 常量与配置 ====================
let W = 450, H = 800;               // 屏幕（视口）逻辑尺寸，默认竖屏 9:16，可切换横屏 16:9
const WORLD = { w: 1800, h: 4200 };   // 世界尺寸（V1.10 两轮扩大：1000×2400 → 1400×3200 → 1800×4200）
const ZOOM = 0.75;                    // 镜头缩放：视角拉远，可见范围 ≈ ×1.33
function viewW() { return W / ZOOM; }  // 当前可见的世界宽 / 高（会随显示方向变化）
function viewH() { return H / ZOOM; }
// 相对原始地图（1000 × 2400）的面积倍率：地图扩大后，场景物件数量按它等比同步，保持原有密度
const AREA_SCALE = (WORLD.w * WORLD.h) / (1000 * 2400);

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

// 主题只控制界面与 HUD；世界绘制不读取这些颜色。
const UI_THEMES = {
  classic: { name: '原始精简', desc: '原版灰黑 · 明黄按钮', scene: '无尽模式', panel: '#232323ee', line: '#ffffff44', text: '#ffffff', muted: '#bbbbbb', accent: '#ffd54f' },
  forest: { name: '暮色森林', desc: '林间月色 · 青绿暖金', scene: '暮色森林', panel: '#0c242bdd', line: '#a5c9b733', text: '#e7efdb', muted: '#b6cfc0', accent: '#f2cc83' },
  neon: { name: '霓虹街机', desc: '电光网格 · 紫粉撞色', scene: '霓虹行动', panel: '#17142bee', line: '#8af4ef66', text: '#f6eaff', muted: '#c9bce1', accent: '#ff8ecb' },
  paper: { name: '暖纸手绘', desc: '浅色纸纹 · 棕墨朱红', scene: '冒险手记', panel: '#f6ecd9f2', line: '#84634877', text: '#40392f', muted: '#705f4e', accent: '#a43f32' },
  midnight: { name: '深海星夜', desc: '靛蓝星轨 · 银白冰蓝', scene: '星夜远征', panel: '#111e3bee', line: '#8faee955', text: '#e5eeff', muted: '#acbfdf', accent: '#b6d3ff' },
};

function activeTheme() { return UI_THEMES[meta.settings.theme] || UI_THEMES.forest; }
function applyTheme() {
  const id = Object.hasOwn(UI_THEMES, meta.settings.theme) ? meta.settings.theme : 'forest';
  document.documentElement.dataset.theme = id;
  const scene = document.querySelector('.mission-strip strong');
  if (scene) scene.textContent = UI_THEMES[id].scene;
}
function renderThemeOptions() {
  const box = document.getElementById('theme-options');
  if (!box) return;
  box.innerHTML = Object.entries(UI_THEMES).map(([id, theme]) =>
    `<button type="button" class="theme-choice" data-theme-choice="${id}" aria-pressed="${meta.settings.theme === id}"><span class="theme-sample theme-sample-${id}" aria-hidden="true"><i></i><b>✦</b></span><span class="theme-name">${theme.name}</span><span class="theme-desc">${theme.desc}</span><span class="theme-selected" aria-hidden="true">✓</span></button>`
  ).join('');
  document.getElementById('theme-status').textContent = '当前主题：' + activeTheme().name + ' · 已随账号保存';
}
function selectTheme(id) {
  // 从暂停、升级或结算中无法切换；已有对局快照不限制回到局外后修改。
  if (!currentUser || state !== 'menu' || document.getElementById('menu').classList.contains('hidden') || !Object.hasOwn(UI_THEMES, id)) return false;
  meta.settings.theme = id;
  applyTheme(); saveMeta(); renderThemeOptions();
  return true;
}
document.addEventListener('click', e => {
  const button = e.target.closest('[data-theme-choice]');
  if (button) selectTheme(button.dataset.themeChoice);
});

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

// 待机姿态仅参与绘制；不同队员错开节奏，不使用游戏随机数。
function characterPose(time, phase = 0, still = reducedMotion.matches) {
  if (still) return { tail: 0, breath: 0, ear: 0, blink: 1, scarf: 0 };
  const t = time + phase;
  const blinkTime = ((t % 4.8) + 4.8) % 4.8;
  const blink = blinkTime > 4.5 && blinkTime < 4.72 ? 1 - Math.sin((blinkTime - 4.5) / .22 * Math.PI) * .95 : 1;
  return { tail: Math.sin(t * 2.3) * .24, breath: Math.sin(t * 1.9) * .65,
    ear: Math.pow(Math.max(0, Math.sin(t * .85)), 14) * .14, blink,
    scarf: Math.sin(t * 2.3 + .8) * 1.5 };
}

function drawCharacter(c, x, y, r, ang, ch, opt = {}) {
  const fur = CHAR_FUR[ch.fur] || CHAR_FUR[0];
  const cloth = CHAR_CLOTH[ch.cloth] || CHAR_CLOTH[0];
  const eye = CHAR_EYE[ch.eye] || CHAR_EYE[0];
  const pose = characterPose(opt.time ?? gameTime, opt.phase || 0);
  const detail = r >= 22;
  const ellipse = (px, py, rx, ry, color) => {
    c.fillStyle = color; c.beginPath(); c.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); c.fill();
  };
  const shape = (points, color, outline = true) => {
    c.fillStyle = color; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p));
    c.closePath(); c.fill();
    if (outline) { c.strokeStyle = '#162c36'; c.lineWidth = 1.1; c.stroke(); }
  };
  const line = (points, color, width = .7) => {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath();
    points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.stroke();
  };
  c.save(); c.translate(x, y); c.scale(r / 20, r / 20); c.lineJoin = 'round'; c.lineCap = 'round';
  ellipse(0, 18, 20, 5, '#06191c55');
  // 尾根固定，整条蓬松尾巴轻摆；奶油色尾尖和顺毛纹理随之运动。
  c.save(); c.translate(-10, 8); c.rotate(pose.tail); c.translate(10, -8);
  const tail = c.createLinearGradient(-33,-20,-12,12);
  tail.addColorStop(0,fur.color); tail.addColorStop(1,fur.dark);
  c.fillStyle = tail; c.strokeStyle = '#19313b'; c.lineWidth = 1.1;
  c.beginPath(); c.moveTo(-9,10); c.bezierCurveTo(-29,20,-39,3,-31,-22);
  c.bezierCurveTo(-28,-11,-26,-6,-17,-5); c.bezierCurveTo(-10,-4,-7,1,-9,10); c.fill(); c.stroke();
  c.fillStyle = '#f0efdc'; c.beginPath(); c.moveTo(-31,-22); c.quadraticCurveTo(-30,-11,-25,-7);
  c.lineTo(-29,-7); c.lineTo(-25,-1); c.quadraticCurveTo(-32,-1,-34,-6); c.quadraticCurveTo(-34,-15,-31,-22); c.fill();
  if (detail) { line([[-28,4],[-24,8],[-17,10]], '#d8e8e033'); line([[-30,1],[-28,5]], '#e8f1dd66'); }
  c.restore();
  // 靴底与脚尖高光。呼吸仅作用于躯干，脚底始终落地。
  for (const side of [-1,1]) {
    ellipse(side*8, 15, 6.5, 6, '#172e38');
    ellipse(side*8, 14, 5.2, 3.8, '#34505a');
    line([[side*8-4,18],[side*8+4,18]], '#10232c', 1.5);
    if (detail) line([[side*8-3,13],[side*8+2,12]], '#abc4bc88');
  }
  c.save(); c.translate(0,pose.breath);
  const jacket = c.createLinearGradient(-12,-13,14,18);
  jacket.addColorStop(0,cloth.color); jacket.addColorStop(.65,cloth.color); jacket.addColorStop(1,'#253b42');
  ellipse(0,1,16,16,jacket);
  shape([[-9,-10],[0,-5],[9,-10],[8,5],[-8,5]], '#203c4877', false);
  line([[0,-4],[0,6]], '#c3dcd888');
  shape([[-14,6],[14,6],[13,11],[-13,11]], '#314044');
  shape([[-3,5],[3,5],[3,11],[-3,11]], '#d9b773');
  c.fillStyle = '#6c694c'; c.fillRect(-1.4,7,2.8,2);
  if (detail) {
    line([[-11,-1],[-6,0],[-6,4],[-11,3],[-11,-1]], '#b7d5d177');
    line([[6,0],[11,-1],[11,3],[6,4]], '#b7d5d177');
    ellipse(0,-1,.7,.7,'#ebd6a3');
  }
  for (const side of [-1,1]) {
    ellipse(side*14,-1,5.8,8,fur.dark);
    ellipse(side*14,-4,6,4.4,cloth.color);
    line([[side*14-4,-5],[side*14+3,-6]], '#e5eee166');
    ellipse(side*15,5,4,3.5,fur.color);
    if (detail) { line([[side*15-1,4],[side*15-1,6]],fur.dark); line([[side*15+1,4],[side*15+1,6]],fur.dark); }
  }
  // 耳廓有厚度和内耳，偶尔轻抖；脸部与帽子共同呼吸。
  for (const side of [-1,1]) {
    c.save(); c.translate(side*12,-29); c.rotate(side*pose.ear); c.translate(-side*12,29);
    shape([[side*17,-22],[side*18,-43],[side*4,-33]],fur.color);
    shape([[side*14,-28],[side*16,-37],[side*8,-31]], '#deb4a9',false);
    line([[side*17,-39],[side*17,-31]], '#daeaf199',.8);
    c.restore();
  }
  const head = c.createLinearGradient(-10,-35,8,-6);
  head.addColorStop(0,fur.color); head.addColorStop(.65,fur.color); head.addColorStop(1,fur.dark);
  c.fillStyle = head; c.strokeStyle = '#19313b'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-17,-24); c.quadraticCurveTo(-16,-34,-7,-34);
  c.lineTo(-2,-36); c.lineTo(0,-33); c.lineTo(5,-35);
  c.quadraticCurveTo(16,-34,17,-24); c.lineTo(18,-20); c.lineTo(22,-17); c.lineTo(17,-14);
  c.lineTo(18,-11); c.quadraticCurveTo(0,-3,-18,-11); c.lineTo(-17,-14); c.lineTo(-22,-17); c.lineTo(-18,-20); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#eff0dc'; c.beginPath(); c.moveTo(-17,-21);
  c.quadraticCurveTo(-8,-18,0,-14); c.quadraticCurveTo(8,-18,17,-21);
  c.quadraticCurveTo(17,-9,0,-8); c.quadraticCurveTo(-17,-9,-17,-21); c.fill();
  const look = Math.cos(ang)*1.1;
  for (const side of [-1,1]) {
    const ex = side*7;
    ellipse(ex,-22.5,5.2,5.9,fur.dark);
    c.save(); c.translate(ex,-22.5); c.scale(1,pose.blink);
    ellipse(0,0,4.5,5.2,'#fff9e9');
    const iris = c.createLinearGradient(0,-4,0,4); iris.addColorStop(0,eye.color); iris.addColorStop(1,'#19323b');
    ellipse(look,.5,2.8,4,iris); ellipse(look,.7,1.25,2.7,'#102934');
    ellipse(look-1,-1.7,1.1,1.2,'#ffffff');
    if (detail) ellipse(look+1,2,.5,.5,'#d9ffff');
    c.restore();
    line([[ex-3,-29],[ex+2,-29.5]],fur.dark,1.2);
  }
  ellipse(0,-14.5,3,1.9,'#18303a'); ellipse(-.7,-15.2,1.1,.4,'#b5c9c9');
  c.strokeStyle = '#607d7b'; c.lineWidth = .7; c.beginPath(); c.moveTo(0,-13); c.lineTo(0,-11.5);
  c.quadraticCurveTo(-2,-10,-3,-11); c.moveTo(0,-11.5); c.quadraticCurveTo(2,-10,3,-11); c.stroke();
  if (detail) {
    for (const side of [-1,1]) {
      ellipse(side*8,-14,.55,.55,'#9aa89a'); ellipse(side*10,-15,.45,.45,'#9aa89a');
      line([[side*12,-15],[side*18,-16]],'#536e6b66',.5);
      line([[side*12,-13],[side*17,-12]],'#536e6b55',.5);
    }
    line([[-11,-32],[-7,-32]],'#eaf4ef66',1);
  }
  shape([[-12,-8],[12,-8],[10,-3],[-10,-3]],'#e5bd75');
  line([[-9,-6],[9,-6]],'#fff0ba88');
  shape([[9,-5],[18,pose.scarf],[21,8+pose.scarf],[13,5]],'#bd824d');
  line([[14,-1],[17,4+pose.scarf]],'#f5cc84',.7);
  drawHat(c,0,-23,16,ch.hat);
  if (opt.weapon !== false) {
    c.save(); c.rotate(ang);
    shape([[7,-4],[26,-4],[26,-3],[38,-3],[38,3],[26,3],[26,4],[7,4]],'#18313b');
    c.fillStyle = '#8fa8a0'; c.fillRect(13,-3,15,3); c.fillStyle = '#d0d9c5'; c.fillRect(32,-2,5,4);
    c.fillStyle = '#d2ae69'; c.fillRect(18,-2,3,5);
    if (detail) { line([[23,-1],[27,-1]],'#e2ece0'); c.fillStyle='#26434b'; c.fillRect(29,-2,1,4); }
    c.restore();
  }
  c.restore(); c.restore();
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
  { el: document.getElementById('char-preview2'), lw: 260, lh: 190, r: 36, scale: 1 },
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

    const bob = 0; // 脚底落地，呼吸和摇尾由模型自身驱动。
    const cy = h * 0.70 + bob;

    // 光环
    const g = c.createRadialGradient(w / 2, cy, 4, w / 2, cy, 92);
    g.addColorStop(0, 'rgba(130,216,184,0.20)');
    g.addColorStop(1, 'rgba(255,213,79,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    // 地面阴影
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    c.ellipse(w / 2, h - 20 - bob * 0.35, 32 - bob * 0.8, 8, 0, 0, Math.PI * 2);
    c.fill();

    // 符文展示台：固定几何，不引入随机数影响玩法。
    c.strokeStyle = '#9fcdb75c'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(w / 2, h - 19, 64, 15, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#f2cc8359';
    c.beginPath(); c.ellipse(w / 2, h - 19, 51, 11, 0, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      c.fillStyle = '#b8d5ae'; c.fillRect(w / 2 + Math.cos(a) * 64 - 1, h - 20 + Math.sin(a) * 15, 2, 2);
    }
    const ang = -0.25;
    const r = item.r * charScale() * item.scale;
    drawCharacter(c, w / 2, cy, r, ang, meta.character, { weapon: true, time: t / 1000 });
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

// 局内金币（V1.21：整体砍到约一半，配合局外价格 ×3）
// —— 普通杂兵（grunt / fast / ranged / hunter）只有 50% 概率掉 1 枚（期望 0.5），它们占了绝大多数击杀；
// —— 其余来源直接把基数下调：精英 5→3、Boss 50→25、树怪 6→3、木桶 3→1、箱子 5→2、特殊小怪 2~3 → 1。
// 大额来源保持「必掉」，避免击杀首领 / 精英时偶尔颗粒无收的观感。
const MOB_COIN_CHANCE = 0.5;
const MOB_TYPES = new Set(['grunt', 'fast', 'ranged', 'hunter']);
function coinDrop(type) {
  const base = (ENEMY_TYPES[type] || {}).coin || 0;
  if (!base) return 0;
  return (MOB_TYPES.has(type) && Math.random() >= MOB_COIN_CHANCE) ? 0 : base;
}

const ENEMY_TYPES = {
  grunt:  { hp: 46,  speed: 70,  r: 21, dmg: 11, color: '#e05555', xp: 12, coin: 1 },
  fast:   { hp: 26,  speed: 130, r: 19, dmg: 7,  color: '#f0a030', xp: 9,  coin: 1 },   // 速度最快的贴身怪：体型单独再放大，避免在拉远的视角下显得过小
  ranged: { hp: 44,  speed: 55,  r: 20, dmg: 10, color: '#d98bd0', xp: 15, coin: 1, range: 300, shootInterval: 1.4, bulletSpeed: 220 },
  elite:  { hp: 150, speed: 62,  r: 28, dmg: 16, color: '#b05fe0', xp: 55,  coin: 2 },   // V1.24：改为「低压成群」的小精英，强度交给词缀（见 AFFIX_DEFS）
  boss:   { hp: 2600, speed: 35, r: 46, dmg: 30, color: '#c0392b', xp: 320, coin: 25 },   // V1.25：体型 40 → 46；V1.26.1：接触 38 → 30（玩家初始血池只有 100）

  // ---- 特殊敌人 ----
  bomber:  { hp: 40, speed: 100, r: 20, dmg: 0,  color: '#8a4a2a', xp: 14, coin: 1, boomR: 72, boomDmg: 30 },
  hunter:  { hp: 52, speed: 48,  r: 21, dmg: 9,  color: '#d06a8a', xp: 17, coin: 1, range: 340, shootInterval: 2.4, bulletSpeed: 130, homing: true },
  healer:  { hp: 64, speed: 52,  r: 23, dmg: 6,  color: '#4dd07a', xp: 22, coin: 1, healR: 200, healAmount: 20, healInterval: 2.4 },
  shielder:{ hp: 70, speed: 62,  r: 24, dmg: 12, color: '#5fb0d0', xp: 20, coin: 1, giftR: 170, giftAmount: 20, giftInterval: 4 },
  summoner:{ hp: 88, speed: 44,  r: 25, dmg: 9,  color: '#a06cd0', xp: 24, coin: 1, summonInterval: 5 },

  // 树木被长时间靠近后苏醒的树怪（血量较厚，仅由场景树木转化而来）
  treant:  { hp: 240, speed: 34,  r: 36, dmg: 24, color: '#5f8b4c', xp: 90, coin: 3 },
};

// 「重装单位」：基础血量本来就高，如果吃满整条成长曲线，后期血量会反超首领。
// 这里把它们的曲线折半（倍率 = 1 + (全场倍率 - 1) × 系数），保留前期的基数优势。
const HEAVY_HP_CURVE = { elite: 0.5, treant: 0.5 };

// ---- 精英词缀（V1.24）----
// 精英本体很弱（见 ENEMY_TYPES.elite），威胁全部来自随机词缀：每只精英必带 1 个，
// 第 25 波起带 2 个（互不重复）。词缀尽量复用已有机制（护盾 / 光环 / 爆炸 / 分裂）。
// color 用于血条上方的标识圆点，方便一眼分辨这波精英要怎么打。
const ELITE_AFFIX_TWO_WAVE = 25;      // 从这一波起，精英带 2 个词缀
const ELITE_SPLIT_HP = 0.35;          // 分裂出的子精英血量倍率
const ELITE_BOOM_R = 95;              // 殉爆半径
const ELITE_BOOM_DMG = 22;            // 殉爆伤害（基础值，实伤再乘 difficulty）
const ELITE_WARD_R = 200;             // 守卫光环半径
const ELITE_WARD_AMOUNT = 15;         // 守卫每次给出的护盾
const ELITE_WARD_INTERVAL = 3;        // 守卫施放间隔（秒）

const AFFIX_DEFS = {
  shield:   { name: '护盾', color: '#7fd8ff', desc: '额外一层护盾', apply(e) { e.shieldMax = Math.round(e.maxHp * 0.8); e.shield = e.shieldMax; } },
  swift:    { name: '迅捷', color: '#f0e05a', desc: '移速 +45%', apply(e) { e.speed *= 1.45; } },
  berserk:  { name: '狂暴', color: '#ff6b4a', desc: '半血后移速与伤害 +50%', apply(e) { e.affixBerserk = true; } },
  split:    { name: '分裂', color: '#c07bff', desc: '死亡时裂成 2 只残血小精英', apply(e) { e.affixSplit = true; } },
  volatile: { name: '殉爆', color: '#ff9d3b', desc: '死亡时原地爆炸', apply(e) { e.affixVolatile = true; } },
  ward:     { name: '守卫', color: '#5fb0d0', desc: '周期给附近小怪套护盾', apply(e) { e.affixWard = true; e.wardCd = ELITE_WARD_INTERVAL; } },
};

// 随机抽取 n 个不重复词缀（n 由当前波次决定）
function rollAffixes() {
  const n = wave >= ELITE_AFFIX_TWO_WAVE ? 2 : 1;
  const pool = Object.keys(AFFIX_DEFS);
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

// 场景植物（第一波 Boss 之后随世界变化出现）
const FLORA_CFG = {
  tree: { r: 24, nearR: 80, aggroTime: 3.5, decay: 0.6, growTime: 2.6, bossAggroMul: 3.5 },   // 破土长出 2.6s；靠近 3.5s 变树怪；首领撞上按 3.5 倍速积累（1s 苏醒）
  vine: { triggerR: 110, grabR: 62, windTime: 0.9, holdTime: 1.8, minLife: 25, maxLife: 40, cooldown: 2.5, growTime: 1.0 },
};

// Boss 冲刺技能参数
// 冲刺是首领的高威胁技能，单独定义伤害，避免误用普通接触伤害。
// 初始队伍血池为 100，命中一次约削减 65%（V1.26.1：80 → 65，配合接触伤害下调），仍受护甲、护盾和闪避影响。
const BOSS_SKILL = { chargeTime: 1.0, dashSpeed: 880, dashTime: 0.42, cooldown: 6, firstDelay: 4, damage: 65, aimRate: 6, trackFrac: 0.4 };
// aimRate = 蓄力期间转身瞄准的速度（rad/s），保证追踪阶段内能转到目标身上
// trackFrac = 蓄力前多大比例用来「继续转身瞄准」（V1.26.2），之后方向锁死、指示带停住 ——
//   否则指示带每帧都精确指着玩家（实测误差恒为 0°），既读不出该往哪躲，看起来又像原地打转。
//   用比例而不是固定秒数：二阶段连冲的前摇只有 0.45s，固定 0.4s 等于几乎不锁定。

// Boss 种类（每 10 波轮换）
// 血量基准只在「第 1 个 Boss」生效，之后由 bossHpScale() 按已击败首领数放大
// orbitR = 走位想维持的「与玩家的距离」（V1.25 起不再直线追击，见 moveBoss）
const BOSS_KINDS = {
  charge:   { name: '冲锋者', color: '#c0392b', hp: 2600, speed: 35, orbitR: 150 },
  barrage:  { name: '弹幕者', color: '#8e44ad', hp: 2400, speed: 28, orbitR: 300 },
  summoner: { name: '召唤者', color: '#16a085', hp: 2800, speed: 30, orbitR: 300 },
  splitter: { name: '分裂者', color: '#d35400', hp: 3000, speed: 40, orbitR: 110 },
};

// 首领竞技场：出场时以玩家当前位置为场心划一块圆形场地，**只禁止玩家走出**；
// 首领与小怪可以自由进出（否则首领冲刺出去后玩家就被困在打不到它的圈里）。首领阵亡即解除。
const BOSS_ARENA_R = 600;    // 场地半径（世界单位，直径 1200 = 屏幕可见宽度的 2 倍）
let bossArena = null;        // { x, y, r } —— 场心取首领出场时的玩家位置
const BOSS_ORDER = ['charge', 'barrage', 'summoner', 'splitter'];

// ---- 首领「灵活性」层（V1.25 新增）----
// 首领移速只有 28~40，而部队是 240 —— 直线追击毫无意义，首领实质是「站着放技能的炮台」。
// 所以这一层不加基础移速（数值不动），而是给它两件事：
//   ① 轨道走位：维持各自的中距离 + 横向绕圈（玩家不能再无脑绕背）；
//   ② 位移：冲锋者冲刺 / 分裂者突进（爆发式移动，比堆移速更可控、也更好读）。
// 旧版的「滑步闪避」已全部取消（V1.25.1）：首领横移一下会让技能前摇读不清、表现突兀。
// 弹幕者「后跃 180」与召唤者「闪现 340」（两种纯挪位置、无伤害的位移）也于 V1.25.1 注释停用，代码保留以便恢复。
// V1.26.2：径向修正改按偏差比例给（旧版是开关式，会停在死区边缘）、绕行方向翻转间隔拉长（旧版走不完一段弧就折返）。
const BOSS_MOVE = {
  band: 45,          // 径向修正满速带宽：偏差达到这个量给满速，内部按比例缩放（不再是开关式的 0/±1）
  strafe: 0.9,       // 绕圈速度占基础移速的比例
  flipMin: 6,        // 绕行方向翻转间隔（秒，随机区间）。太短会「一段弧都没走完就折返」，看起来像原地抖
  flipMax: 11,
  turnRate: 3.2,     // 朝向平滑角速度（rad/s），防止每帧抖动
};
// const BOSS_LEAP = { time: 0.3 };         // （V1.25.1 停用）通用位移时长（速度 = 距离 / 时长），仅弹幕者后跃用
const BOSS_SHOCK = { r: 150, dmg: 20 };     // 冲锋落点震波
const BOSS_SUMMON = { wind: 0.9, r: 150 };  // 召唤阵：预警时长 / 阵半径
const BOSS_BITE = { speed: 760, time: 0.26, dmg: 20 };   // 分裂者突进撕咬
// const BOSS_BLINK = { r: 340, cd: 6 };    // （V1.25.1 停用）召唤者贴身闪现


// 武器（局外携带，攻击间隔作为 CD）
const WEAPON_DEFS = {
  rifle:  { name: '步枪', dmg: 17, reload: 0.9, speed: 640, range: 380, color: '#ffe066', baseCount: 1 },
  shotgun:{ name: '散弹', dmg: 7,  reload: 1.4, speed: 560, range: 300, color: '#9be060', baseCount: 6, spread: 0.28, offset: 5, falloff: { near: 110, far: 170, nearMul: 1.4, farMul: 0.35 } },   // 6 枚弹丸 · 弹道自枪口起就是发散扇形（V1.23 去掉 converge 收束，不再交叉）
  laser:  { name: '机枪', dmg: 9,  reload: 0.35, speed: 900, range: 420, color: '#ff4d8d', baseCount: 1 },
  sniper: { name: '狙击枪', dmg: 38, reload: 2.0, speed: 1150, range: 520, color: '#c8b3ff', baseCount: 1, pierce: 1, tracer: true },
};

// 元素类（局内获得，走「元素伤害」乘区，不吃召唤物加成）
const ELEMENT_DEFS = {
  fireball: {
    cls: 'ele', name: '火球', dmg: 21, cd: 1.2, speed: 340, aoe: 70, burnDps: 7, color: '#ff9d3b',
    init: { aoeMul: 1, ignite: false, burnTime: 1, killExplode: false, killDmg: 15, killRadius: 60 },
  },
  lightning: {
    cls: 'ele', name: '雷电', dmg: 18, color: '#9de0ff',
    init: { chainLv: 0 },
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
  eggCost: 180,         // 抽一次宠物蛋（V1.21：60 → 180，随全局价格 ×3）
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

// Boss 击败后的强力 Buff（首领专属，池子里不会有普通升级卡）
// 「力量权柄 / 元素亲和」是一对**互斥的路线取舍卡**：一次性（once）且二选一（exclusive），
// 选了一张另一张本局不再出现。代价只走加算区，所以另一条线之后仍可继续投资把它补回来
// （参考 20 Minutes Till Dawn 的取舍型 Synergy）。
// V1.16：一次性奖励**全部去掉前置**（原本元素线要 `hasElementalSource`、闪电 / 召唤之力要
// 已解锁对应召唤物），改成任何时候都能被抽到与选择——选到对自己当前 Build 无用的卡由玩家自负。
// 奖励分两类：
//   ① 一次性奖励（`once`）：机制级质变卡，每张只能拿一次，靠 appliedIds 去重。
//      **不带前置**：任何一张任何时候都能被抽到、被选择（代价自负，见各卡 desc）；
//      只有「力量权柄 / 元素亲和」保留互斥（`exclusive`），二者选一张另一张本局不再出现。
//   ② 可重复补位卡（`repeat`）：通用数值成长卡。**平时不出现在面板上**，只有当一次性奖励
//      被拿空、候选凑不满面板张数时，才拿来补满（见 `openBossReward()`），避免出现空格子。
//      它们的数值刻意高于普通升级卡（普通卡：移速 +12% / 生命 +20% / 拾取 +30%），
//      作为后期的「无限成长出口」。
const BOSS_BUFFS = [
  { id: 'buff-rage', name: '狂暴', desc: '射速 +66%、子弹伤害 -50%（仅一次）', once: true, apply() { weapons.forEach(w => w.rateMul = (w.rateMul || 1) * 1.66); addDamageBonus('bullet', -0.5); } },
  { id: 'buff-might', name: '力量权柄', desc: '子弹伤害 +50%、元素伤害 -30%、射速 -20%（同类相加，与「元素亲和」二选一，仅一次）', once: true, exclusive: 'dmg-route', apply() { addDamageBonus('bullet', 0.5); addDamageBonus('ele', -0.3); weapons.forEach(w => w.rateMul = (w.rateMul || 1) * 0.8); } },
  { id: 'buff-ele-affinity', name: '元素亲和', desc: '子弹伤害 -50%、元素伤害 +35%、点燃/减速/冰冻的持续时间 +35%（同类相加，与「力量权柄」二选一，仅一次）', once: true, exclusive: 'dmg-route', apply() { addDamageBonus('bullet', -0.5); addDamageBonus('ele', 0.35); stats.statusDuration = (stats.statusDuration || 1) * 1.35; } },
  { id: 'buff-summon-power', name: '召唤之力', desc: '召唤物伤害 +50%、召唤物攻速 +50%（按各自机制生效，同类相加，仅一次）', once: true, apply() { addDamageBonus('summon', 0.5); summons.forEach(s => s.rateMul = (s.rateMul || 1) * 1.5); } },
  { id: 'buff-blink', name: '遁术', desc: '移动速度 +50%、闪避率 +30%（闪避上限仍为 60%，仅一次）', once: true, apply() { stats.moveSpeed *= 1.5; stats.dodge = Math.min(0.6, (stats.dodge || 0) + 0.3); } },
  // ↓ 以下 5 张是**可重复补位卡**（数值高于普通升级卡），只在一次性奖励凑不满面板时补位
  { id: 'buff-hp', name: '生命上限 +50%', desc: '队伍血池上限提升，并立刻回复等量生命（可重复获得）', repeat: true, apply() { stats.maxHp *= 1.5; const before = squadMaxHp; refreshSquadPool(); squadHp += Math.max(0, squadMaxHp - before); } },
  { id: 'buff-vuln', name: '易伤 +30%', desc: '敌人受到的所有伤害 +30%（同类相加，可重复获得）', repeat: true, apply() { stats.vuln = (stats.vuln || 0) + 0.3; } },
  { id: 'buff-regen', name: '每秒回复 +5', desc: '队伍血池每秒额外回复 5 点（可重复获得）', repeat: true, apply() { stats.regen = (stats.regen || 0) + 5; } },
  { id: 'buff-move', name: '移速 +30%', desc: '部队移动更快（可重复获得）', repeat: true, apply() { stats.moveSpeed *= 1.3; } },
  { id: 'buff-pickup', name: '拾取范围 +100%', desc: '经验光球磁吸更远（可重复获得）', repeat: true, apply() { stats.pickupRange *= 2; } },
];

// 某个互斥组是否已经有卡被选过（用于 Boss 奖励的去重与二选一）
function hasExclusivePicked(group) {
  return BOSS_BUFFS.some(b => b.exclusive === group && appliedIds.has(b.id));
}

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
    id: 'evo-lightning', name: '进化 · 苍穹雷暴', desc: '雷电：额外闪电 +2、伤害 +30%',
    route: 'lightning', need: 3,
    req: () => { const s = getSummon('lightning'); return !!s && (s.chainLv || 0) >= 3; },
    apply() { const s = getSummon('lightning'); s.chainLv = Math.min(4, (s.chainLv || 0) + 2); summonMul('lightning', 1.3); },
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
  barrel: { r: 15, hp: 40, coin: 1, xp: 8, color: '#9c6a35', dark: '#7d5327' },
  crate: { r: 17, hp: 60, coin: 2, xp: 12, color: '#b3813f', dark: '#8f6832' },
  pillar: { r: 20, hp: Infinity, coin: 0, xp: 0, color: '#8d97a1', dark: '#6f7883' },
  tree: { r: FLORA_CFG.tree.r, hp: Infinity, coin: 0, xp: 0, color: '#4e7a3a', dark: '#2f4a22' },
};

// 商店 / 局外解锁配置（V1.21：价格统一 ×3，配合局内金币减半，拉长局外养成周期）
const SHOP = {
  weapons: {
    rifle: { name: '步枪', cost: 0, desc: '单发直射' },
    shotgun: { name: '散弹', cost: 600, desc: '扇形多发弹丸' },
    laser: { name: '机枪', cost: 900, desc: '高速连射' },
    sniper: { name: '狙击枪', cost: 1200, desc: '高额单发伤害 · 自带穿透 · 射速很慢' },
  },
  equipment: {
    none: { name: '无', cost: 0, desc: '无额外效果' },
    leather: { name: '皮甲', cost: 300, desc: '受伤 -15%' },
    charm: { name: '力量护符', cost: 450, desc: '伤害 +15%' },
    blood: { name: '血珠', cost: 780, desc: '造成伤害时 5% 概率回复该次伤害的 5%' },
  },
  items: {
    none: { name: '无', cost: 0, desc: '无额外效果' },
    orb: { name: '回血宝珠', cost: 600, desc: '每秒回复 2 点队伍生命' },
  },
  pets: {
    none: { name: '无', cost: 0, desc: '无宠物' },
    dragon: { name: '龙蛋', cost: 450, desc: '悬浮右上方攻击并点燃' },
    fairy: { name: '火焰精灵', cost: 750, desc: '快速连射并点燃' },
  },
};

// ==================== 全局状态 ====================
let state = 'menu'; // menu | playing | upgrade | bossreward | gameover
let runCoins = 0;   // 本局获得金币
let petMsg = '';    // 宠物养成页的最近一次操作反馈（抽蛋/升星）
let soundTapCount = 0;        // 开发者模式入口：音效开关的连续切换计数
let devPanelShown = false;    // 开发者面板是否已填充（避免覆盖正在输入的值）
const SOUND_TAP_UNLOCK = 10;  // 连续切换多少次弹出密码验证
// 进入开发者模式的密码只存 SHA-256，仓库与文档都不写明文；改密码时用新的 sha256 替换这个值即可。
const DEV_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

// 局外进度（按用户持久化到 localStorage）
let users = [];
let currentUser = null;
let meta = defaultMeta();

let squad = { x: WORLD.w / 2, y: WORLD.h / 2, tx: WORLD.w / 2, ty: WORLD.h / 2, moving: false, shield: 0, shieldMax: 0, shieldRegenTimer: 0, invulnT: 0, invulnCdT: 0 };
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
  elementalDamage: 1,  // 元素伤害（雷电/点燃）
  summonDamage: 1,     // 召唤物伤害（镰刀/飞剑）
  petDamage: 1,        // 宠物伤害（龙蛋）
  pickupRange: 1, invulnDuration: 0, damageTaken: 1, dodge: 0, bulletKnockback: 0,
  burnDamage: 0,             // 点燃伤害加成（「严重灼伤」）
  statusDuration: 1,         // 异常元素效果（点燃/减速/冰冻）的持续时间倍率（「元素亲和」）
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
// 下限只作用在「加算区」这一层（不给独立乘区加下限），四路统一：
//   子弹 / 召唤 / 宠物：0.3（最低保留 30%）；元素：0（保留「可被归零」这一设计杠杆）
const DMG_FLOOR = 0.3;                                     // 单路伤害最低保留 30%
const INVULN_CD = 3;                                       // 受伤免疫的冷却（触发时刻起算）
const WEAPON_RATE_CAP = 2;                                 // 武器射速上限：rateMul 最多 +100%（卡片可以继续拿，但不再加速）
let dmgBonus = { bullet: 0, ele: 0, summon: 0, pet: 0 };    // 加算区（0.3 = +30%）
let dmgBase = { bullet: 1, ele: 1, summon: 1, pet: 1 };     // 独立乘区（局外装备）
let pickCount = {};                                         // 可重复卡的已获取次数（用于限次）

function addDamageBonus(type, pct) {
  dmgBonus[type] = (dmgBonus[type] || 0) + pct;
  recalcDamage();
}

function recalcDamage() {
  // 下限只罩住「1 + 加算区」，不罩局外装备（否则装备加成会被极端减益一起压掉）
  stats.bulletDamage = dmgBase.bullet * Math.max(DMG_FLOOR, 1 + dmgBonus.bullet);
  stats.elementalDamage = dmgBase.ele * Math.max(0, 1 + dmgBonus.ele);   // 元素可被「归零」
  stats.summonDamage = dmgBase.summon * Math.max(DMG_FLOOR, 1 + dmgBonus.summon);
  stats.petDamage = dmgBase.pet * Math.max(DMG_FLOOR, 1 + dmgBonus.pet);
}

// 调试开关（局内调试面板，V1.26）
// devForcePool 为 true 时升级池放行全部「前置 / 上限 / 二选一」门控；它只被卡牌页临时打开（用于列出全部卡牌），
// 其余开关默认都是「不改变正常玩法」的状态，且每局重开时由 devResetTransient() 复位。
let devForcePool = false;      // 卡池忽略前置
let devSpeed = 1;              // 游戏速度倍率（乘在主循环的 dt 上）
let devFreezeWave = false;     // 冻结波次计时
let devInvuln = false;         // 玩家无敌
let devOneShot = false;        // 一击必杀
let devHudOpen = false;        // 调试面板是否展开
let devInfoOn = false;         // 是否显示信息浮层
let devCardCat = 'all';        // 卡牌页当前分类

function poolGate(ok) { return devForcePool || ok; }
function canPick(id, max) { return devForcePool || (pickCount[id] || 0) < max; }
function markPick(id) { pickCount[id] = (pickCount[id] || 0) + 1; }

let camera = { x: 0, y: 0 };
let wave = 1;
let kills = 0;
let level = 1;
let xp = 0;
// 升级所需经验（V1.11 提高）：基础值 15 → 22，成长系数 1.25 / +5 → 1.32 / +6
// 递增序列：22 / 35 / 52 / 74 / 103 / 141 / 192 / 259 / 348 / 465 …（旧版 15 / 23 / 33 / 46 / 62 / 82 / 107 / 138 / 177 / 226）
const XP_BASE = 22;
let xpToNext = XP_BASE;
let choiceCount = 3;
let gameTime = 0;
let difficulty = 1;
let bossKills = 0;   // 已击败 Boss 数（决定世界成长：新怪物 / 出怪量 / 经验加成）
let dividers = [];   // 世界内的随机分块虚线

let spawnTimer = 1;
let waveT = 0;              // 本波已进行的时长（V1.18 起波次由计时驱动）

let upgrades = []; // 当前待选的升级
let bossRewardOptions = [];
let keys = {};
let damageNumbers = [];
let shake = 0;
// 仅表现数据，不进入伤害计算或存档。
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let terrainCache = null;
function richEffects() { return meta.settings.effects !== 'lite'; }
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
    settings: { sound: true, orient: 'portrait', fps: 0, effects: 'full', theme: 'forest' },
    bestWave: 0,
    devMode: false,      // 开发者模式：设置页连续切换音效 10 次后输入密码进入
    run: null,           // 上把未结束的进度快照（返回主菜单时保存）
  };
}

// 兼容旧存档：补齐新增字段
function normalizeMeta(m) {
  if (typeof m.coins !== 'number') m.coins = 0;
  if (typeof m.bestWave !== 'number') m.bestWave = 0;
  if (m.run === undefined) m.run = null;
  if (m.devMode === undefined) m.devMode = false;
  if (!m.character) m.character = defaultCharacter();
  if (!m.settings) m.settings = { sound: true, orient: 'portrait', fps: 0 };
  if (!m.settings.effects) m.settings.effects = 'full';
  if (!Object.hasOwn(UI_THEMES, m.settings.theme)) m.settings.theme = 'forest';
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

// 用户存档：优先走后端（Electron 主进程 / 开发服务器 /api/users），无后端时退回浏览器存储。
// 后端写入一律按账号粒度提交，不整表覆盖，避免多人同时在线互相删存档。
const USERS_KEY = 'fury_users';
let userStoreMode = 'local';   // 'file' | 'local'

// 是否走 HTTP 后端（浏览器 + 开发服务器 / Vercel）。Electron 有 IPC 通道，不算在内。
function usesHttpStore() {
  return userStoreMode === 'file' && !(window.furyStore && window.furyStore.save);
}

// 本地通道（Electron / localStorage）自行算哈希，格式与服务端一致：
// pbkdf2$sha256$<迭代次数>$<盐base64>$<哈希base64>
const PBKDF2_ITER = 120000;
const toB64 = bytes => btoa(String.fromCharCode.apply(null, bytes));

function isHashed(v) { return /^pbkdf2\$/.test(String(v || '')); }

async function pbkdf2Bits(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$sha256$${PBKDF2_ITER}$${toB64(salt)}$${toB64(await pbkdf2Bits(password, salt, PBKDF2_ITER))}`;
}

// 'ok' 哈希匹配 / 'legacy' 老存档的明文口令（调用方负责升级）/ 'bad' 不匹配
async function checkPassword(password, stored) {
  if (isHashed(stored)) {
    const parts = String(stored).split('$');
    const salt = Uint8Array.from(atob(parts[3]), c => c.charCodeAt(0));
    const hash = toB64(await pbkdf2Bits(password, salt, Number(parts[2]) || PBKDF2_ITER));
    return hash === parts[4] ? 'ok' : 'bad';
  }
  return (typeof stored === 'string' && stored.length > 0 && stored === password) ? 'legacy' : 'bad';
}

// 账号数据来源：Electron 走 IPC，网页探活后端接口，都没有才退回 localStorage。
// HTTP 通道下 users 只作为当前账号的内存缓存，不再是全表。
function loadLocalUsers() {
  userStoreMode = 'local';
  try {
    const s = localStorage.getItem(USERS_KEY);
    users = s ? JSON.parse(s) : [];
  } catch (e) { users = []; }
}

function loadUsers() {
  if (window.furyStore && window.furyStore.load) {
    return Promise.resolve(window.furyStore.load()).then(list => {
      userStoreMode = 'file';
      users = Array.isArray(list) ? list : [];
    });
  }
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return fetch('/api/users')
      .then(r => { if (!r.ok) throw new Error('no api'); userStoreMode = 'file'; users = []; })
      .catch(() => loadLocalUsers());
  }
  loadLocalUsers();
  return Promise.resolve();
}

// Electron IPC 与 localStorage 通道：按整表落盘（本地单机无并发问题）
function saveUsers() {
  if (userStoreMode === 'file') {
    if (window.furyStore && window.furyStore.save) window.furyStore.save(users);
    return;
  }
  try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch (e) {}
}

// ==================== 会话令牌与在线存档同步 ====================
// 令牌由服务端在登录 / 注册时下发，存在浏览器里；存档写入与成绩提交都靠它证明身份。
const TOKEN_KEY = 'fury_token';

function token() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
}

function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
}

function apiError(status, message) {
  const e = new Error(message || `HTTP ${status}`);
  e.status = status;
  return e;
}

function apiFail(r) {
  return r.json().catch(() => ({})).then(d => apiError(r.status, d && d.error));
}

// 令牌失效（改密、过期、被换过）：退回登录页
function sessionExpired(msg) {
  setToken('');
  currentUser = null;
  meta = defaultMeta();
  try { localStorage.removeItem('fury_current_user'); } catch (e) {}
  showLogin();
  loginError(msg || '登录已失效，请重新登录');
}

// 本机存档镜像：每次 saveMeta 都会先写这里，云端同步失败时用它兜底
function metaCacheKey(username) { return `fury_meta_${username || currentUser}`; }

function readMetaCache(username) {
  try { return JSON.parse(localStorage.getItem(metaCacheKey(username)) || 'null'); } catch (e) { return null; }
}

// 服务端存档比本机镜像旧（上次没同步上去）时，问用户要不要用本机这份
function reconcileMeta(serverMeta, username) {
  const cached = readMetaCache(username);
  const mine = serverMeta || {};
  if (!cached || !(cached.savedAt > (mine.savedAt || 0))) return mine;
  if (confirm('本机有一份更新的存档（上次没能同步到云端），要用它覆盖云端吗？')) return cached;
  return mine;
}

let syncHintOn = false;

function setSyncHint(on) {
  if (on === syncHintOn) return;
  syncHintOn = on;
  const el = document.getElementById('sync-hint');
  if (!el) return;
  el.classList.toggle('hidden', !on);
  if (on) el.textContent = '存档暂未同步到云端，已存在本机，联网后自动重试';
}

// 同步存档到后端；失败按 0.8s / 1.6s 退避重试两次，仍失败就提示（本机镜像已存好）
function pushMeta(username, nextMeta, attempt) {
  patchMeta(username, nextMeta)
    .then(() => setSyncHint(false))
    .catch(err => {
      if (err && err.status === 401) { sessionExpired(); return; }
      if (attempt < 2) { setTimeout(() => pushMeta(username, nextMeta, attempt + 1), 800 * (attempt + 1)); return; }
      setSyncHint(true);
    });
}

// HTTP 通道：注册。明文口令只在 HTTPS 上传输一次，哈希由服务端负责；
// 重名由数据库主键原子判重（两处并发注册不会互相覆盖），返回 { conflict: true }。
function registerAccount(user) {
  return fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: { username: user.username, password: user.password, meta: user.meta },
      createOnly: true,
    }),
  }).then(r => {
    if (r.ok) return r.json().catch(() => ({}));
    if (r.status === 409) return { conflict: true };
    return apiFail(r).then(e => Promise.reject(e));
  });
}

// HTTP 通道：只提交存档（需令牌），不带密码
function patchMeta(username, nextMeta) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  return fetch('/api/users', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ username, meta: nextMeta }),
  }).then(r => (r.ok ? true : apiFail(r).then(e => Promise.reject(e))));
}

// 存档：先写本机镜像（不依赖网络，必然成功），再同步到后端
function saveMeta() {
  if (!currentUser) return;
  const u = users.find(x => x.username === currentUser);
  if (u) u.meta = meta;
  meta.savedAt = Date.now();
  try { localStorage.setItem(metaCacheKey(), JSON.stringify(meta)); } catch (e) {}
  if (usesHttpStore()) pushMeta(currentUser, meta, 0);
  else saveUsers();
}

async function register(username, password) {
  username = (username || '').trim();
  if (!username || !password) { loginError('请输入用户名和密码'); return false; }
  const u = { username, password, meta: defaultMeta() };

  // 在线通道：服务端负责哈希并下发令牌
  if (usesHttpStore()) {
    let res;
    try {
      res = await registerAccount(u);
    } catch (e) {
      loginError(`注册失败：${(e && e.message) || e}`);
      return false;
    }
    if (res.conflict) { loginError('用户名已存在'); return false; }
    setToken(res.token || '');
    users.push({ username, password: '', meta: u.meta });
    enterGame(username, u.meta);
    return true;
  }

  // 本地通道（Electron / localStorage）：口令先哈希再落盘
  u.password = await hashPassword(password);
  users.push(u);
  saveUsers();
  enterGame(username, u.meta);
  return true;
}

async function login(username, password) {
  username = (username || '').trim();
  if (!username || !password) { loginError('请输入用户名和密码'); return false; }

  // 在线通道：密码比对在服务端完成，口令不出服务端
  if (usesHttpStore()) {
    let r;
    try {
      r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username, password }),
      });
    } catch (e) {
      loginError(`登录失败：${(e && e.message) || e}`);
      return false;
    }
    if (!r.ok) { loginError('用户名或密码错误'); return false; }
    const d = await r.json().catch(() => null);
    if (!d || !d.user) { loginError('登录失败：返回数据异常'); return false; }
    setToken(d.token || '');
    enterGame(d.user.username, d.user.meta);
    return true;
  }

  // 本地通道：自行比对；老存档里的明文口令在登录成功后升级为哈希
  const u = users.find(x => x.username === username);
  const verdict = u ? await checkPassword(password, u.password) : 'bad';
  if (verdict === 'bad') { loginError('用户名或密码错误'); return false; }
  if (verdict === 'legacy') { u.password = await hashPassword(password); saveUsers(); }
  setToken('');
  enterGame(u.username, u.meta);
  return true;
}

// 登录成功后的统一入口
function enterGame(username, rawMeta) {
  currentUser = username;
  localStorage.setItem('fury_current_user', username);
  // 在线通道：若本机镜像比云端新（上次同步失败），先问用户要不要用本机的
  meta = normalizeMeta(usesHttpStore() ? reconcileMeta(rawMeta, username) : (rawMeta || {}));
  renderMenu();
  showMenu();
}

function logout() {
  currentUser = null;
  meta = defaultMeta();
  setToken('');
  localStorage.removeItem('fury_current_user');
  showLogin();
}

function showLogin() {
  applyTheme();
  applyOrientation();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('login').classList.remove('hidden');
  setLoginMode(false);
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

function showMenu() {
  state = 'menu';
  applyTheme();
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
  closeBoard();
  document.querySelector('#menu .menu-panel').scrollTop = 0;
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
// 是否拥有元素伤害来源（雷电 / 带点燃的宠物）
function hasElementalSource() {
  return hasSummon('lightning') || !!pet;
}
// 局内能力（元素类 / 召唤物）伤害：升级卡走「加算区」，进化走「独立乘区」，
// 最终折算成 dmgMul；元素类只吃元素伤害，召唤物只吃召唤物伤害。
// 独立乘区只做纯乘、不带下限（下限统一留在 stats.elementalDamage / summonDamage 的加算区那层），
// 否则数量卡叠到 0.9ⁿ 触底后惩罚会失效，进化乘区也会被一起截断。
function refreshSummonMul(s) {
  s.dmgMul = (1 + (s.dmgAdd || 0)) * (s.dmgMore || 1);
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
  if (canPick('add', 4)) {
    pool.push({ id: 'add', name: '增援 +1（子弹加成 -10%）', desc: '新增一名小兵，子弹加成 -10%（同类相加，最多 4 次）', weight: 0.8, apply() { markPick('add'); addSoldier(); addDamageBonus('bullet', -0.1); } });
  }
  pool.push({ id: 'pickup', name: '拾取范围 +30%', desc: '经验光球磁吸更远', weight: W_NORM, apply() { stats.pickupRange *= 1.3; } });
  pool.push({ id: 'shield', name: '护盾 +20', desc: '护盾抵挡伤害，破盾 3 秒后恢复', weight: W_NORM, apply() { squad.shieldMax += 20; squad.shield += 20; } });
  if (poolGate(stats.invulnDuration < 1.0)) {
    pool.push({ id: 'invuln', name: '受伤免疫 +0.5s', desc: '受击后 0.5 秒内免疫伤害（冷却 3s）', weight: W_NORM, apply() { stats.invulnDuration = Math.min(1.0, stats.invulnDuration + 0.5); } });
  }
  if (poolGate(choiceCount < 6)) {
    pool.push({ id: 'choices', name: '升级选项 +1', desc: '每次升级多 1 个选项（最多 6 个）', weight: 1.1, apply() { choiceCount = Math.min(6, choiceCount + 1); } });
  }

  // 特殊选项
  pool.push({ id: 'power-bullet', name: '强力子弹', desc: '子弹伤害 +30%（同类相加），击退 +10%，射速 -20%', weight: W_NORM, apply() { addDamageBonus('bullet', 0.3); stats.bulletKnockback = Math.min(1, stats.bulletKnockback + 0.1); weapons.forEach(w => w.rateMul = (w.rateMul || 1) * 0.8); } });
  // 元素法师（子弹→元素 转换卡）：走加算区，且每局最多 2 次，避免反复相乘把子弹伤害压没
  if (poolGate(hasElementalSource()) && canPick('elemental-mage', 2)) {
    pool.push({ id: 'elemental-mage', name: '元素法师', desc: '子弹加成 -30%、元素加成 +20%（同类相加，最多 2 次）', weight: W_NORM, apply() { markPick('elemental-mage'); addDamageBonus('bullet', -0.3); addDamageBonus('ele', 0.2); } });
  }
  if (poolGate(stats.dodge < 0.6)) {
    pool.push({ id: 'dodge', name: '闪避 +20%', desc: '概率规避伤害（最多 60%）', weight: W_NORM, apply() { stats.dodge = Math.min(0.6, stats.dodge + 0.2); } });
  }
  // 嗜血：易伤与吸血都进各自的「同类加算区」（易伤只在最终伤害上乘一次）
  pool.push({ id: 'bloodthirst', name: '嗜血', desc: '敌人受到的伤害 +20%（易伤，同类相加）；造成伤害的 1% 回复队伍生命', weight: W_MED, apply() { stats.vuln = (stats.vuln || 0) + 0.2; stats.lifesteal = (stats.lifesteal || 0) + 0.01; } });

  // 主动技能（时缓需解锁）
  if (poolGate(!skills.slow.owned)) {
    pool.push({ id: 'skill-slow', name: '主动技能：时缓', desc: '让所有敌人减速 3 秒（技能位 · 冷却 16s）', weight: 1.4, apply() { skills.slow.owned = true; skills.slow.cd = 0; } });
  }
  if (poolGate(skills.slow.owned)) {
    if (poolGate(skills.slow.duration < 6)) {
      pool.push({ id: 'slow-time', name: '时缓：时长 +1s', desc: '减速持续时间延长', weight: W_NORM, apply() { skills.slow.duration += 1; } });
    }
    if (poolGate(skills.slow.cdMax > 8)) {
      pool.push({ id: 'slow-cd', name: '时缓：冷却 -20%', desc: '技能转得更快', weight: W_NORM, apply() { skills.slow.cdMax = Math.max(8, Math.round(skills.slow.cdMax * 0.8)); } });
    }
  }

  // 携带武器：射速 / 弹丸 / 弹速（伤害成长走「强力子弹」，各卡均为无限次）
  // 调试（devForcePool）：把全部武器线都列出来，方便测未携带武器的卡
  const poolWtypes = devForcePool ? Object.keys(WEAPON_DEFS) : weapons.map(w => w.type);
  poolWtypes.forEach(wtype => {
    const def = WEAPON_DEFS[wtype];
    pool.push({ id: `${wtype}-rate`, name: `${def.name}：射速 +25%`, desc: '攻击速度提升', weight: W_NORM, route: wtype, apply() { weaponRate(wtype, 1.25); } });
    // 弹丸 +1 组：多射出一组原弹丸（数量 = def.baseCount，如散弹 6 发），代价是子弹伤害 ×0.9（独立乘区，不与其它子弹加成互抵）
    if (canPick(`${wtype}-pellet`, 4)) {
      pool.push({ id: `${wtype}-pellet`, name: `${def.name}：弹丸 +${def.baseCount}`, desc: `每次攻击多射出一组弹丸（${def.baseCount} 发），子弹伤害 ×0.9（独立乘算，最多 4 次）`, weight: W_NORM, route: wtype, apply() { markPick(`${wtype}-pellet`); getWeapon(wtype).extraCount += def.baseCount; weaponMul(wtype, 0.9); } });
    }
    pool.push({ id: `${wtype}-bulletSpeed`, name: `${def.name}：弹速 +20%`, desc: '子弹飞得更快，更容易命中移动中的敌人', weight: W_NORM, route: wtype, apply() { const ww = getWeapon(wtype); ww.speedMul = (ww.speedMul || 1) * 1.2; } });
  });

  // 武器特殊选项
  const wtype = weapons[0] && weapons[0].type;
  const devW = t => poolGate(wtype === t);   // 调试：三条武器专属分支都列出来
  // 子弹穿透 +1（V1.22）：通用卡，替换掉原来只对步枪 / 狙击枪生效的「武器穿透 +1」。
  // 代价与「弹丸 +1 组」同一套算法——子弹伤害 ×0.9（独立乘区，不与其它子弹加成互抵），最多 4 次。
  if (canPick('bullet-pierce', 4)) {
    pool.push({
      id: 'bullet-pierce', name: '子弹穿透 +1',
      desc: '子弹可多穿透 1 名敌人，子弹伤害 ×0.9（独立乘算，最多 4 次）',
      weight: W_NORM, route: wtype,
      apply() { markPick('bullet-pierce'); weapons.forEach(w => { w.pierce = (w.pierce || 0) + 1; weaponMul(w.type, 0.9); }); },
    });
  }
  if (devW('shotgun')) {
    const w = getWeapon('shotgun') || {};
    if (poolGate((w.splitChance || 0) < 0.3)) {
      pool.push({ id: 'shotgun-split', name: '散弹：击杀分裂 +10%', desc: '击杀敌人概率分裂 2 枚弹丸（最多 30%）', weight: W_NORM, route: 'shotgun', apply() { const w = getWeapon('shotgun'); if (!w) return; w.splitChance = Math.min(0.3, (w.splitChance || 0) + 0.1); } });
    }
    if (poolGate((w.spreadMul || 1) > 0.45)) {
      pool.push({ id: 'shotgun-focus', name: '散弹：散布 -15%', desc: '弹丸更集中，单体命中更高（最多收紧到 45%）', weight: W_NORM, route: 'shotgun', apply() { const w = getWeapon('shotgun'); if (!w) return; w.spreadMul = Math.max(0.45, (w.spreadMul || 1) * 0.85); } });
    }
  }
  if (devW('laser')) {
    // 狂暴：高风险高攻速，全局只出现一次
    if (!appliedIds.has('laser-special')) {
      pool.push({ id: 'laser-special', name: '机枪：狂暴', desc: '射速 +50%、移速 -15%、伤害 -30%（仅一次）', weight: 0.3, route: 'laser', apply() { weaponRate('laser', 1.5); stats.moveSpeed *= 0.85; weaponMul('laser', 0.7); } });
    }
  }
  if (devW('sniper')) {
    pool.push({ id: 'sniper-range', name: '狙击枪：射程 +20%', desc: '可以在更远处开火', weight: W_NORM, route: 'sniper', apply() { const w = getWeapon('sniper'); if (!w) return; w.rangeMul = (w.rangeMul || 1) * 1.2; } });
    if (!appliedIds.has('sniper-charge')) {
      pool.push({ id: 'sniper-charge', name: '狙击枪：蓄力弹', desc: '子弹伤害加成 +30%（同类相加），射速 -25%（仅一次）', weight: 0.5, route: 'sniper', apply() { addDamageBonus('bullet', 0.3); weaponRate('sniper', 0.75); } });
    }
  }

  // ===== 元素类（走元素伤害，不吃召唤物加成） =====
  // 火球 / 冰刺已下架（定义与实现保留，后续交给宠物用），当前元素线只有雷电。
  // 雷电：子弹「开火」时按概率召唤闪电，无冷却；额外闪电走 chainLv（1~4 道，覆盖式）
  if (poolGate(!hasSummon('lightning'))) {
    pool.push({ id: 'unlock-lightning', name: '元素：雷电', desc: '子弹开火时 50% 概率召唤闪电攻击 1 名敌人（元素伤害）', weight: 1.2, route: 'lightning', apply() { addSummon('lightning'); } });
  }
  if (poolGate(hasSummon('lightning'))) {
    pool.push({ id: 'lightning-dmg', name: '雷电伤害 +30%', desc: '雷电伤害提升（同类相加）', weight: W_NORM, route: 'lightning', apply() { summonMul('lightning', 1.3); } });
    if (canPick('lightning-chain', 4)) {
      pool.push({ id: 'lightning-chain', name: '闪电：额外闪电 +1', desc: '额外召唤 1/2/3/4 道闪电，总伤害 -10%/-20%/-30%/-40%；满 4 层触发概率翻倍（100%）', weight: W_NORM, route: 'lightning', apply() { markPick('lightning-chain'); const s = getSummon('lightning'); s.chainLv = Math.min(4, (s.chainLv || 0) + 1); } });
    }
  }

  // ===== 子弹附魔与状态（V1.10） =====
  // 附魔为「子弹命中时 roll 概率」，各 4 层、覆盖式递进；点燃 / 减速 / 冰冻受各自抗性限制
  const fireLv = cardLv('enchant-fire');
  if (poolGate(fireLv < 4)) {
    pool.push({ id: 'enchant-fire', name: '火焰附魔', desc: `子弹命中时 ${Math.round(ENCH_FIRE_CHANCE[fireLv] * 100)}% 概率点燃敌人 ${BURN_TIME}s（最多 4 次）`, weight: W_NORM, apply() { markPick('enchant-fire'); } });
  }
  const frostLv = cardLv('enchant-frost');
  if (poolGate(frostLv < 4)) {
    pool.push({ id: 'enchant-frost', name: '霜冻附魔', desc: `子弹命中时 ${Math.round(ENCH_FROST_CHANCE[frostLv] * 100)}% 概率减速敌人 ${FROST_TIME}s（最多 4 次）`, weight: W_NORM, apply() { markPick('enchant-frost'); } });
  }
  const burnLv = cardLv('burn-boost');
  if (poolGate(cardLv('enchant-fire') > 0) && poolGate(burnLv < 4)) {
    pool.push({ id: 'burn-boost', name: '严重灼伤', desc: `点燃伤害 +${Math.round(SEVERE_BURN[burnLv] * 100)}%（最多 4 次，需先选「火焰附魔」）`, weight: W_NORM, apply() { markPick('burn-boost'); stats.burnDamage = SEVERE_BURN[Math.max(0, cardLv('burn-boost') - 1)]; } });
  }
  if (poolGate(burnLv > 0) && poolGate(cardLv('blast') < 1)) {
    pool.push({ id: 'blast', name: '爆裂', desc: `被点燃的敌人死亡时小范围爆炸（伤害 = 其生命上限 ${Math.round(BLAST_HP * 100)}%），被波及的敌人再挂 2 层点燃（仅一次，需先选「严重灼伤」）`, weight: 0.8, apply() { markPick('blast'); } });
  }
  const biteLv = cardLv('frostbite');
  if (poolGate(cardLv('enchant-frost') > 0) && poolGate(biteLv < 4)) {
    pool.push({ id: 'frostbite', name: '冻伤', desc: `被减速的敌人 ${Math.round(FROSTBITE_CHANCE[biteLv] * 100)}% 概率被冰冻 ${FREEZE_TIME}s，并立即扣除当前生命的 ${Math.round(FROSTBITE_HP[biteLv] * 100)}%（精英 5% / Boss 1%；需先选「霜冻附魔」）`, weight: W_NORM, apply() { markPick('frostbite'); } });
  }
  if (poolGate(biteLv > 0) && poolGate(cardLv('winter') < 1)) {
    pool.push({ id: 'winter', name: '凛冬', desc: `被冰冻的敌人阵亡后造成小范围冰冻爆炸，伤害 = 其生命上限 ${Math.round(WINTER_HP * 100)}%（仅一次，需先选「冻伤」）`, weight: 0.8, apply() { markPick('winter'); } });
  }

  // ===== 召唤物（走召唤物伤害） =====
  // 镰刀：环绕自身旋转
  if (poolGate(!hasSummon('scythe'))) {
    pool.push({ id: 'unlock-scythe', name: '召唤：镰刀', desc: '环绕自身旋转，接触造成伤害', weight: 1.2, route: 'scythe', apply() { addSummon('scythe'); } });
  }
  if (poolGate(hasSummon('scythe'))) {
    const sc = getSummon('scythe') || {};
    if (canPick('scythe-more', 4)) {
      pool.push({ id: 'scythe-more', name: '镰刀数量 +1', desc: '多一把环绕的镰刀（额外刀刃只扩大覆盖面，不降低伤害，最多 4 次）', weight: W_NORM, route: 'scythe', apply() { markPick('scythe-more'); getSummon('scythe').extraCount += 1; } });
    }
    pool.push({ id: 'scythe-speed', name: '镰刀飞行速度 +20%', desc: '镰刀转得更快', weight: W_NORM, route: 'scythe', apply() { summonRate('scythe', 1.2); } });
    pool.push({ id: 'scythe-dmg', name: '镰刀伤害 +30%', desc: '镰刀伤害提升（同类相加）', weight: W_NORM, route: 'scythe', apply() { summonMul('scythe', 1.3); } });
    pool.push({ id: 'scythe-size', name: '镰刀变大', desc: '刀刃体积与判定 +30%（环半径不变，更容易扫到贴身敌人）', weight: W_NORM, route: 'scythe', apply() { getSummon('scythe').sizeMul = (getSummon('scythe').sizeMul || 1) * 1.3; } });
    if (poolGate((sc.lifesteal || 0) < 0.20)) {
      pool.push({ id: 'scythe-leech', name: '镰刀：饮血 +10%', desc: '镰刀造成伤害的 10% 回复队伍生命（最多叠 2 次）', weight: W_NORM, route: 'scythe', apply() { const s = getSummon('scythe'); s.lifesteal = Math.min(0.20, (s.lifesteal || 0) + 0.10); } });
    }
    // 阻挡子弹为递进升级：先 +15%，之后才出现 +20%（最高 45%）
    if (poolGate((sc.blockChance || 0.10) < 0.25)) {
      pool.push({ id: 'scythe-block1', name: '镰刀阻挡子弹 +15%', desc: '概率挡掉敌方子弹', weight: W_NORM, route: 'scythe', apply() { const s = getSummon('scythe'); s.blockChance = Math.min(0.45, (s.blockChance || 0.10) + 0.15); } });
    }
    if (poolGate((sc.blockChance || 0.10) >= 0.25 && (sc.blockChance || 0.10) < 0.45)) {
      pool.push({ id: 'scythe-block2', name: '镰刀阻挡子弹 +20%', desc: '进一步概率挡掉敌方子弹', weight: W_NORM, route: 'scythe', apply() { const s = getSummon('scythe'); s.blockChance = Math.min(0.45, (s.blockChance || 0.10) + 0.20); } });
    }
    pool.push({ id: 'scythe-knockback', name: '镰刀：击退', desc: '命中击退敌人', weight: W_NORM, route: 'scythe', apply() { getSummon('scythe').knockback = true; } });

    // 质变链（V1.22）：割裂 → 噬魂 → 死神降临（结构与附魔线一致：基础 4 层 → 进阶 4 层 → 一次性大招）
    const bleed = cardLv('scythe-bleed');
    if (poolGate(bleed < 4)) {
      pool.push({
        id: 'scythe-bleed', name: '镰刀：割裂',
        desc: `镰刀命中时 ${Math.round(SCYTHE_BLEED_CHANCE[bleed] * 100)}% 概率使敌人割裂 ${BLEED_TIME}s，割裂期间每秒受到镰刀单次伤害的 ${Math.round(SCYTHE_BLEED_PCT[bleed] * 100)}%（最多 4 次）`,
        weight: W_NORM, route: 'scythe', apply() { markPick('scythe-bleed'); },
      });
    }
    const reap = cardLv('scythe-reap');
    if (poolGate(bleed > 0) && poolGate(reap < 4)) {
      pool.push({
        id: 'scythe-reap', name: '镰刀：噬魂',
        desc: `对已被割裂的敌人伤害 +${Math.round(SCYTHE_REAP_DMG[reap] * 100)}%，并把该次伤害的 ${Math.round(SCYTHE_REAP_LEECH[reap] * 100)}% 转化为队伍生命（最多 4 次，需先选「割裂」）`,
        weight: W_NORM, route: 'scythe', apply() { markPick('scythe-reap'); },
      });
    }
    if (poolGate(reap > 0) && poolGate(cardLv('scythe-execute') < 1)) {
      pool.push({
        id: 'scythe-execute', name: '镰刀：死神降临',
        desc: `被割裂的敌人生命低于 ${Math.round(EXECUTE_HP * 100)}% 时，镰刀掠过直接处决；精英 / Boss 改为额外受到生命上限 ${Math.round(EXECUTE_HEAVY_HP * 100)}% 的伤害（同一敌人 ${EXECUTE_CD}s 一次，仅一次，需先选「噬魂」）`,
        weight: 0.8, route: 'scythe', apply() { markPick('scythe-execute'); },
      });
    }
  }

  // 飞剑：常驻实体，在视野内的敌人之间穿梭斩击，无敌人时剑尖朝下绕角色环绕
  if (poolGate(!hasSummon('sword'))) {
    pool.push({ id: 'unlock-sword', name: '召唤：飞剑', desc: '召唤一柄飞剑在敌人之间穿梭贯穿；视野内没有敌人时剑尖朝下绕你环绕', weight: 1.2, route: 'sword', apply() { addSummon('sword'); } });
  }
  if (poolGate(hasSummon('sword'))) {
    const sw = getSummon('sword') || {};
    pool.push({ id: 'sword-dmg', name: '飞剑伤害 +30%', desc: '飞剑伤害提升（同类相加）', weight: W_NORM, route: 'sword', apply() { summonMul('sword', 1.3); } });
    pool.push({ id: 'sword-cd', name: '飞剑攻速 +20%', desc: '穿梭斩击更频繁', weight: W_NORM, route: 'sword', apply() { summonRate('sword', 1.2); } });
    if (canPick('sword-more', 4)) {
      pool.push({ id: 'sword-more', name: '飞剑 +1', desc: '多一柄飞剑同时穿梭，飞剑伤害 ×0.9（独立乘算，最多 4 次）', weight: W_NORM, route: 'sword', apply() { markPick('sword-more'); getSummon('sword').extraCount += 1; summonMore('sword', 0.9); } });
    }
    pool.push({ id: 'sword-range', name: '飞剑：索敌范围 +20%', desc: '视野更远，敌人一进视野就出剑', weight: W_NORM, route: 'sword', apply() { const s = getSummon('sword'); s.rangeMul = (s.rangeMul || 1) * 1.2; } });
    pool.push({ id: 'sword-speed', name: '飞剑：飞行速度 +20%', desc: '飞剑穿梭得更快', weight: W_NORM, route: 'sword', apply() { const s = getSummon('sword'); s.speedMul = (s.speedMul || 1) * 1.2; } });
    if (poolGate((sw.pierce || 0) < 2)) {
      pool.push({ id: 'sword-pierce', name: '飞剑：连斩 +1', desc: '斩击时额外波及命中点附近的敌人（最多 2）', weight: W_NORM, route: 'sword', apply() { const s = getSummon('sword'); s.pierce = Math.min(2, (s.pierce || 0) + 1); } });
    }
    if (poolGate(!sw.giant)) {               // 巨剑术：整条线只能拿一次
      pool.push({ id: 'sword-giant', name: '巨剑术', desc: '飞剑体型 +50%、伤害 +30%；剑身变长变宽，碰到它的敌人都会受伤（仅此一张）', weight: 0.8, route: 'sword', apply() { const s = getSummon('sword'); s.giant = true; s.sizeMul = 1.5; summonMul('sword', 1.3); } });
    }

    // 质变链（V1.22）：剑印 → 剑气 → 剑冢（结构与附魔线一致：基础 4 层 → 进阶 4 层 → 一次性大招）
    const mark = cardLv('sword-mark');
    if (poolGate(mark < 4)) {
      pool.push({
        id: 'sword-mark', name: '飞剑：剑印',
        desc: `飞剑命中时 ${Math.round(SWORD_MARK_CHANCE[mark] * 100)}% 概率留下剑印 ${SWORD_MARK_TIME}s，被剑印标记的敌人受到的伤害 +${Math.round(SWORD_MARK_VULN[mark] * 100)}%（与「嗜血」同类相加，最多 4 次）`,
        weight: W_NORM, route: 'sword', apply() { markPick('sword-mark'); },
      });
    }
    const qi = cardLv('sword-qi');
    if (poolGate(mark > 0) && poolGate(qi < 4)) {
      pool.push({
        id: 'sword-qi', name: '飞剑：剑气',
        desc: `飞剑命中时向四周溅射剑气，对 ${SWORD_QI_RADIUS}px 内最多 4 名其他敌人造成本次斩击伤害的 ${Math.round(SWORD_QI_PCT[qi] * 100)}%（最多 4 次，需先选「剑印」）`,
        weight: W_NORM, route: 'sword', apply() { markPick('sword-qi'); },
      });
    }
    if (poolGate(qi > 0) && poolGate(cardLv('sword-tomb') < 1)) {
      pool.push({
        id: 'sword-tomb', name: '飞剑：剑冢',
        desc: `带剑印的敌人阵亡时原地落下幻影剑，对 ${TOMB_RADIUS}px 内敌人造成其生命上限 ${Math.round(TOMB_HP * 100)}% 的伤害并重新挂上剑印（仅一次，需先选「剑气」）`,
        weight: 0.8, route: 'sword', apply() { markPick('sword-tomb'); },
      });
    }
  }

  // 宠物（唯一，若选择）
  if (pet) {
    const pd = PET_DEFS[pet.type];
    pool.push({ id: 'pet-dmg', name: `${pd.name}伤害 +30%`, desc: `${pd.name}伤害提升（同类相加）`, weight: W_NORM, apply() { pet.dmgAdd = (pet.dmgAdd || 0) + 0.3; pet.dmgMul = (pet.baseMul || 1) * (1 + pet.dmgAdd); } });
    pool.push({ id: 'pet-speed', name: `${pd.name}攻速 +20%`, desc: `${pd.name}攻击更快`, weight: W_NORM, apply() { pet.rateMul *= 1.2; } });
  }

  // 进化：需「本路线强化次数」达标 + 专属前置满足，之后以低权重随机出现（不再保底）
  EVOLUTIONS.forEach(ev => {
    if (appliedIds.has(ev.id)) return;
    const need = ev.need || 3;
    if (!poolGate((routePicks[ev.route] || 0) >= need)) return;
    if (!poolGate(ev.req())) return;
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
  terrainCache = null;
  const types = ['grass', 'grass', 'grass', 'rock', 'rock', 'flower'];
  // 数量随世界面积同步（V1.10 地图扩大后保持原有植被密度）
  const count = Math.round(90 * AREA_SCALE);
  for (let i = 0; i < count; i++) {
    decorations.push({ x: Math.random() * WORLD.w, y: Math.random() * WORLD.h, type: types[Math.floor(Math.random() * types.length)] });
  }
}

// 木桶 / 箱子（打碎掉金币与经验）与石柱（挡子弹的掩体）
function initObstacles() {
  obstacles = [];
  const kinds = ['barrel', 'barrel', 'barrel', 'crate', 'crate', 'pillar', 'pillar'];
  // 数量与尝试次数都随面积等比（V1.10 地图扩大后保持原有掩体密度）
  const target = Math.round(18 * AREA_SCALE);
  let guard = 0;
  while (obstacles.length < target && guard++ < target * 30) {
    const type = kinds[Math.floor(Math.random() * kinds.length)];
    const def = OBSTACLE_DEFS[type];
    const x = 60 + Math.random() * (WORLD.w - 120);
    const y = 60 + Math.random() * (WORLD.h - 120);
    if (Math.hypot(x - squad.x, y - squad.y) < 170) continue;              // 不挡出生点
    if (obstacles.some(o => Math.hypot(o.x - x, o.y - y) < o.r + def.r + 60)) continue;
    obstacles.push({ x, y, r: def.r, type, hp: def.hp, maxHp: def.hp, dead: false, hitT: 0 });
  }
}

function damageObstacle(o, dmg, crushed) {
  o.hitT = 0.15;
  spawnParticles(o.x, o.y, OBSTACLE_DEFS[o.type].color, 3);
  if (!crushed && !isFinite(o.hp)) return;                                // 石柱 / 树木不可破坏（首领碾压走 crushed）
  o.hp -= dmg;
  if (!crushed && o.hp > 0) return;
  o.dead = true;
  const def = OBSTACLE_DEFS[o.type];
  if (!crushed) {                                                         // 首领碾碎的残骸不给奖励：金币与经验都不掉
    runCoins += def.coin;
    if (def.xp > 0) drops.push({ x: o.x, y: o.y, r: 6, value: def.xp });
  }
  spawnParticles(o.x, o.y, def.color, 14);
  sfxKill();
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

// 首领碾压（V1.20）：首领体型大、走位由 AI 驱动，一旦抵住木桶 / 箱子 / 石柱就只能靠冲刺脱身，
// 所以让它在接触时直接碾碎这些「建筑」。树木特殊——不碾碎，改为**加速苏醒**：同样要读条，
// 只是按 bossAggroMul 倍速积累（3.5 倍 → 约 1s 苏醒；无小兵在旁时被自然消退拖到约 1.2s），撞完变树怪，首领自然脱身。
// 必须在 resolveEnemyCollisions() 的推出之前判定：否则首领先被推开，这一帧就不再接触了。
function crushObstaclesByBosses(dt) {
  for (const e of enemies) {
    if (e.dead || e.type !== 'boss') continue;
    for (const o of obstacles) {
      if (o.dead) continue;
      const or = o.type === 'tree' ? ((o.grow || 0) < 1 ? 0 : o.r) : o.r;   // 没长成的树不挡路，也不被撞醒
      if (or <= 0) continue;
      if (Math.hypot(e.x - o.x, e.y - o.y) >= e.r + or) continue;
      if (o.type === 'tree') o.aggro = (o.aggro || 0) + dt * FLORA_CFG.tree.bossAggroMul;
      else damageObstacle(o, 0, true);                                     // crushed：无视血量直接摧毁，且不给金币与经验
    }
  }
}

// 敌人之间的碰撞体积：互不重叠。
// 首领不被小怪推动（否则冲刺轨迹会被一堆小怪挤歪），其余按半径反比分配推开量（体型越大被推得越少）。
function separateEnemies() {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dead) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const minD = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) continue;
      let d = Math.sqrt(d2);
      if (d < 0.001) { dx = 1; dy = 0; d = 1; }          // 完全重合：沿 +x 随便推开
      const ux = dx / d, uy = dy / d;
      const aBoss = a.type === 'boss', bBoss = b.type === 'boss';
      const wa = (aBoss && bBoss) ? b.r / minD : aBoss ? 0 : bBoss ? 1 : b.r / minD;
      const push = minD - d;
      a.x -= ux * push * wa;          a.y -= uy * push * wa;
      b.x += ux * push * (1 - wa);    b.y += uy * push * (1 - wa);
    }
  }
}

// 敌人不能与小兵（玩家）重叠：把敌人逐个推出小兵的碰撞圈。
// 分离正好把它停在「相切」，所以接触伤害的判定要多留 CONTACT_PAD 的余量（见 updateEnemies）。
const CONTACT_PAD = 6;
function separateEnemiesFromSquad() {
  for (const e of enemies) {
    if (e.dead || e.devStatic) continue;                              // 调试：站桩敌人也不被玩家推开
    for (const s of soldiers) {
      const dx = e.x - s.x, dy = e.y - s.y;
      const minD = e.r + S.soldierR;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) continue;
      const d = Math.sqrt(d2);
      if (d < 0.001) { e.x = s.x + minD; e.y = s.y; continue; }   // 完全重合：沿 +x 推开
      e.x = s.x + (dx / d) * minD;
      e.y = s.y + (dy / d) * minD;
    }
  }
}

function resolveEnemyCollisions() {
  const solveObstacles = () => {
    for (const e of enemies) {
      if (e.dead || e.devStatic) continue;      // 调试：站桩敌人不被障碍物推动，保证待在放下的位置
      resolveObstacleCollision(e, e.r);
    }
  };
  solveObstacles();
  // 「敌人互推」与「推出玩家圈」交替迭代：两者会互相破坏对方的结果（小兵把敌人压成一层壳、
  // 壳上装不下就得往外挤），各跑各的收敛不彻底，交替投影能把密集堆叠理得更干净。
  for (let pass = 0; pass < 2; pass++) {
    separateEnemies();
    separateEnemiesFromSquad();
  }
  // 收尾再解一次障碍物：上面的推挤可能把敌人挤进树木 / 石柱里（穿障比轻微重叠更显眼）
  solveObstacles();
}

// 世界变化：Boss 被击败后，地图上长出树木与藤蔓（有总量上限，避免过密）
function spawnFlora(treeCount, vineCount) {
  const c = FLORA_CFG.vine;
  // 上限随世界面积等比（V1.10 地图扩大后保持原有植物密度）
  const treeCap = Math.round(36 * AREA_SCALE), vineCap = Math.round(20 * AREA_SCALE);
  treeCount = Math.min(treeCount, Math.max(0, treeCap - obstacles.filter(o => o.type === 'tree').length));
  vineCount = Math.min(vineCount, Math.max(0, vineCap - vines.length));
  let guard = 0, added = 0;
  while (added < treeCount && guard++ < 1200) {
    const p = floraSpot(170, 400);                                             // 多数长在视野附近，便于看到生长过程
    if (Math.hypot(p.x - squad.x, p.y - squad.y) < 150) continue;              // 不在玩家脚下生成
    if (obstacles.some(o => Math.hypot(o.x - p.x, o.y - p.y) < o.r + FLORA_CFG.tree.r + 50)) continue;
    // grow: 0→1 生长动画，长成前不挡子弹、不积累苏醒进度
    obstacles.push({ x: p.x, y: p.y, r: FLORA_CFG.tree.r, type: 'tree', hp: Infinity, maxHp: Infinity, dead: false, hitT: 0, aggro: 0, grow: 0 });
    spawnParticles(p.x, p.y + FLORA_CFG.tree.r * 0.9, '#6b8f4a', 8);
    added++;
  }
  guard = 0; added = 0;
  while (added < vineCount && guard++ < 1200) {
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
    stats, camera, skills, bossArena,
    dmgBonus, dmgBase, pickCount,
    appliedIds: [...appliedIds],
    routePicks,
    squadRootedT, enemySlowT, squadHp, squadMaxHp,
    wave, kills, runCoins, level, xp, xpToNext, choiceCount, gameTime,
    difficulty, bossKills, spawnTimer, waveT,
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
    stats.burnDamage = stats.burnDamage || 0;
    stats.statusDuration = stats.statusDuration || 1;
    camera = s.camera || { x: 0, y: 0 };
    bossArena = s.bossArena || null;      // 首领战途中存档：场地封锁一并恢复
    skills = s.skills;
    if (s.dmgBonus) {
      dmgBonus = s.dmgBonus;
      // 旧版「子弹 +50%（元素归零）」把元素加算区写成 -1，改成对称的 -30% 后把这类旧值抬回来，
      // 否则该存档的元素线会被永久压在 0
      if (dmgBonus.ele <= -1) dmgBonus.ele = -0.3;
      dmgBase = s.dmgBase || dmgBase;
      pickCount = s.pickCount || {};
      recalcDamage();                       // 乘区与 stats 保持一致
    }
    appliedIds = new Set(s.appliedIds || []);
    // 旧版 Boss 卡的 id 迁移：旧 id 直接映射到新 id，避免同名奖励被重复获取
    if (appliedIds.delete('buff-bullet50-ele0')) appliedIds.add('buff-might');       // 子弹 +50% / 元素归零
    if (appliedIds.delete('buff-ele100')) appliedIds.add('buff-ele-affinity');       // 旧「元素 +100%」
    if (appliedIds.delete('buff-bullet-mastery')) appliedIds.add('buff-might');      // 实弹专精 → 力量权柄
    if (appliedIds.delete('buff-ele-mastery')) appliedIds.add('buff-ele-affinity');  // 元素专精 → 元素亲和
    if (appliedIds.delete('buff-reload100')) appliedIds.add('buff-rage');            // 射速 +100% → 狂暴
    routePicks = s.routePicks || {};
    squadRootedT = s.squadRootedT || 0;
    enemySlowT = s.enemySlowT || 0;
    squadHp = s.squadHp || 0;
    squadMaxHp = s.squadMaxHp || 0;
    if (squadMaxHp <= 0) refreshSquadPool();          // 兼容旧快照
    if (!(squadHp > 0)) squadHp = squadMaxHp;
    if (!squad.invulnT) squad.invulnT = 0;
    if (!squad.invulnCdT) squad.invulnCdT = 0;
    wave = s.wave || 1;
    kills = s.kills || 0;
    runCoins = s.runCoins || 0;
    level = s.level || 1;
    xp = s.xp || 0;
    xpToNext = s.xpToNext || XP_BASE;
    choiceCount = s.choiceCount || 3;
    gameTime = s.gameTime || 0;
    difficulty = s.difficulty || 1;
    bossKills = s.bossKills || 0;
    spawnTimer = s.spawnTimer || 1;
    waveT = s.waveT || 0;
    dividers = s.dividers || [];
    decorations = s.decorations || [];
    terrainCache = null;
    particles = [];
    lightningBolts = [];
    iceSpikes = [];
    blasts = [];
    swordSlashes = [];
    pendingLightning = [];
    lightningCdT = 0;
    lightningPending = false;
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
      // 旧版雷电用 chain（链式反应，最多 3）描述额外闪电，迁移到新的 chainLv（1~4 道）
      if (s.type === 'lightning' && s.chain !== undefined && !s.chainLv) s.chainLv = Math.min(4, s.chain);
      refreshSummonMul(s);          // 旧快照的 dmgMul 里带着旧下限，统一重算
    });
    if (pet && pet.baseMul) pet.dmgMul = pet.baseMul * (1 + (pet.dmgAdd || 0));   // 同上
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
  squad = { x: WORLD.w / 2, y: WORLD.h / 2, tx: WORLD.w / 2, ty: WORLD.h / 2, moving: false, shield: 0, shieldMax: 0, shieldRegenTimer: 0, invulnT: 0, invulnCdT: 0 };
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
  pendingLightning = [];
  lightningCdT = 0;
  lightningPending = false;
  hitStop = 0;
  obstacles = [];
  vines = [];
  squadRootedT = 0;
  stats = {
    moveSpeed: 1, maxHp: 1,
    bulletDamage: 1, elementalDamage: 1, summonDamage: 1, petDamage: 1,
    pickupRange: 1, invulnDuration: 0, damageTaken: 1, dodge: 0, bulletKnockback: 0,
    burnDamage: 0,
    statusDuration: 1,
    vuln: 0, lifesteal: 0, regen: 0, bloodOrb: 0,
  };
  camera = { x: 0, y: 0 };
  bossArena = null;
  wave = 1;
  kills = 0;
  runCoins = 0;
  level = 1;
  xp = 0;
  xpToNext = XP_BASE;
  choiceCount = 3;
  gameTime = 0;
  difficulty = 1;
  bossKills = 0;
  spawnTimer = 1;
  waveT = 0;
  devResetTransient();     // 调试：新对局把「无敌 / 秒杀 / 冻结波次 / 速度」恢复默认，避免带进正常游玩

  // 应用局外装备（伤害加成 / 受伤减免）
  const eq = EQUIPMENT_DEFS[meta.equipped.equipment] || EQUIPMENT_DEFS.none;
  dmgBonus = { bullet: 0, ele: 0, summon: 0, pet: 0 };
  dmgBase = { bullet: eq.damageDealt, ele: 1, summon: 1, pet: 1 };
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
// 输入框（登录 / 注册 / 开发者口令）里不拦截快捷键，否则输密码时会误触暂停、选卡等
function isTypingTarget(t) {
  if (!t || !t.tagName) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

// 键盘快捷键。返回 true 表示这次按键被快捷键消费掉。
//   卡牌面板（升级 / 首领奖励）：1~6 直接选第 N 张；升级面板另有 R 重掷
//   对局中：Esc / P 暂停、Q 时缓
//   暂停中：Esc / P / 回车 / 空格 继续
//   结算中：R / 回车 再来一局
function handleHotkey(e) {
  const k = e.key.toLowerCase();
  // 开发者模式：` / F1 开关局内调试面板（对局内外都可以切，方便快速对照）
  if (devModeOn() && (k === '`' || k === 'f1')) { toggleDevHud(); return true; }
  if (state === 'upgrade' || state === 'bossreward') {
    const idx = '123456'.indexOf(e.key);
    if (idx >= 0) {
      if (state === 'upgrade') {
        if (upgrades[idx]) applyUpgrade(upgrades[idx].id);
      } else if (bossRewardOptions[idx]) {
        pickBossReward(bossRewardOptions[idx]);
      }
      return true;   // 超出卡数也吃掉按键，避免落回移动键
    }
    if (k === 'r' && state === 'upgrade') { rerollUpgrades(); return true; }
    return false;
  }
  if (state === 'paused') {
    if (k === 'escape' || k === 'p' || k === 'enter' || k === ' ') { resumeGame(); return true; }
    return false;
  }
  if (state === 'gameover') {
    if (k === 'r' || k === 'enter') { startGame(); return true; }
    return false;
  }
  if (state === 'playing') {
    if (k === 'escape' || k === 'p') { pauseGame(); return true; }
    if (k === 'q') { useSkill('slow'); return true; }
  }
  return false;
}

window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  initAudio();
  if (isTypingTarget(e.target)) return;
  if (handleHotkey(e)) e.preventDefault();
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
  camera.x = Math.max(0, Math.min(WORLD.w - viewW(), squad.x - viewW() / 2));
  camera.y = Math.max(0, Math.min(WORLD.h - viewH(), squad.y - viewH() / 2));
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
  clampToBossArena(squad, 0);                    // 首领战中禁止走出竞技场
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
  if (squad.invulnCdT > 0) squad.invulnCdT = Math.max(0, squad.invulnCdT - dt);
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
// 射速加成封顶 +100%（`WEAPON_RATE_CAP`）：超过上限的射速卡不再加速，但减益仍照常生效
function weaponRateMul(w) { return Math.min(WEAPON_RATE_CAP, w.rateMul || 1); }

function updateWeapons(dt) {
  weapons.forEach(w => {
    const def = WEAPON_DEFS[w.type];
    w.cd -= dt;
    const reload = def.reload / weaponRateMul(w);
    if (w.cd <= 0) {
      const target = nearestEnemy(squad.x, squad.y, def.range * (w.rangeMul || 1));
      if (target) {
        // 「一轮」= 武器的一次开火，而不是每个小兵各一轮：所有小兵共用同一个 volley 标记，
        // 于是「增援」提高的是总弹量，而不是闪电的判定次数
        const volleyTag = { spent: false };
        soldiers.forEach(s => fireWeapon(w, s.x, s.y, target, volleyTag));
        w.cd = reload;
      }
    }
  });
}

function fireWeapon(w, x, y, target, volleyTag) {
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
  // 相邻弹丸的角间隔。抖动幅度必须小于它的一半，否则远处会出现「顺序反转」＝弹道交叉
  const gap = cnt > 1 ? spread / (cnt - 1) : 0;
  for (let i = 0; i < cnt; i++) {
    // 多发弹道：每颗弹丸在散布锥里占一个**固定角度**（按编号从一侧排到另一侧），同时沿垂直方向错开枪口位置，
    // 两者同号 → 弹丸自枪口起就是发散的扇形，编号顺序永远不变、**彼此不会交叉**。
    // （V1.23 修：旧版每颗弹丸都瞄向 converge 距离处的一个点，弹道会「先交叉再分散」，
    //   收束距离内 5 颗挤成一束、贴脸必吃满伤害，观感上也像子弹互相穿过。）
    const t = cnt > 1 ? (i / (cnt - 1)) - 0.5 : 0;               // -0.5 ~ +0.5
    const off = (i - (cnt - 1) / 2) * offStep;
    const bx = x + Math.cos(volley + Math.PI / 2) * off;
    const by = y + Math.sin(volley + Math.PI / 2) * off;
    let ang = volley + t * spread + (Math.random() - 0.5) * gap * 0.8;   // 锥内固定角 + 少量抖动
    const b = { x: bx, y: by, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg, r: def.tracer ? 4 : 3, aoe: 0, burnDps: 0, burnTime: 0, color: def.color, pierce, split, splitCount, hit: null, tracer: !!def.tracer, volley: volleyTag };
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
      const prevAngle = s.orbitAngle || 0;
      s.orbitAngle = prevAngle + def.orbitSpeed * (s.rateMul || 1) * dt;
      updateScythe(s, prevAngle);
    } else if (s.type === 'sword') {
      updateSword(s, dt);
    } else if (s.type === 'ice') {
      s.cd -= dt;
      updateIce(s);
    } else {
      s.cd -= dt;                    // 火球：由攻击命中时触发（雷电改为开火判定，不用 cd）
    }
  });
}

// 召唤物以可见角色编队中心为锚点。队伍移动时，小兵会有短暂跟随插值，
// 直接使用 squad 会让镰刀轨道相对角色滑开；取编队几何中心可保持轨道稳定。
function scytheAnchor() {
  if (!soldiers.length) return { x: squad.x, y: squad.y };
  let x = 0, y = 0;
  for (const s of soldiers) { x += s.x; y += s.y; }
  return { x: x / soldiers.length, y: y / soldiers.length };
}

function updateScythe(s, prevAngle) {
  const def = SUMMON_DEFS.scythe;
  const cnt = def.baseCount + s.extraCount;
  const dmg = def.dmg * s.dmgMul * powerBaseDamage(s);
  const rad = def.orbitRadius;                    // 环半径固定：变大只放大刀刃，不会把刀推远
  const hitR = def.hitR * (s.sizeMul || 1);       // 判定半径（含刀刃容差），贴身敌人也能扫到
  const anchor = scytheAnchor();
  const a0 = prevAngle === undefined ? (s.orbitAngle || 0) : prevAngle;
  const a1 = s.orbitAngle || 0;
  for (let i = 0; i < cnt; i++) {
    const step = (Math.PI * 2 / cnt) * i;
    const x0 = anchor.x + Math.cos(a0 + step) * rad;
    const y0 = anchor.y + Math.sin(a0 + step) * rad;
    const x1 = anchor.x + Math.cos(a1 + step) * rad;
    const y1 = anchor.y + Math.sin(a1 + step) * rad;
    // 掠过判定：这一帧刀刃从 (x0,y0) 扫到 (x1,y1)，判定线段到敌人的距离。
    // 只判当前点的话，转速拉满 / 帧率低时刀刃会「跳过」一段弧而漏掉敌人。
    const sx = x1 - x0, sy = y1 - y0;
    const seg2 = sx * sx + sy * sy || 1;
    for (const e of enemies) {
      if (e.dead) continue;
      let t = ((e.x - x0) * sx + (e.y - y0) * sy) / seg2;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const nx = x0 + sx * t, ny = y0 + sy * t;      // 线段上离敌人最近的点
      if (Math.hypot(e.x - nx, e.y - ny) >= hitR + e.r) continue;
      if (!e.scytheT || gameTime - e.scytheT > def.hitCd) {
        // 质变链：先 roll 割裂（同一刀挂上的出血也能吃到下面的噬魂加成），再按是否有割裂结算噬魂加伤 / 吸血
        const bleedLv = cardLv('scythe-bleed');
        if (bleedLv > 0 && Math.random() < SCYTHE_BLEED_CHANCE[bleedLv - 1]) {
          applyBleed(e, dmg * SCYTHE_BLEED_PCT[bleedLv - 1], BLEED_TIME);
        }
        const reapLv = e.bleedT > 0 ? cardLv('scythe-reap') : 0;
        const dealt = reapLv > 0 ? dmg * (1 + SCYTHE_REAP_DMG[reapLv - 1]) : dmg;
        hitEnemy(e, dealt, 0, 0);
        if (s.lifesteal > 0) leechHeal(dmg * s.lifesteal);       // 吸血（饮血卡 / 进化 · 死神镰刀）
        if (reapLv > 0) leechHeal(dealt * SCYTHE_REAP_LEECH[reapLv - 1], '#ff8f9a');   // 噬魂：割裂目标额外回血
        tryExecute(e);                                          // 死神降临：处决线以下直接斩落
        if (s.knockback && e.kbT <= 0 && e.type !== 'boss') {   // Boss 免疫击退
          const kx = e.x - nx, ky = e.y - ny;
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

// 火球：攻击命中敌人时召唤，带冷却（元素伤害）
function triggerFireball() {
  const s = getSummon('fireball');
  if (!s) return;
  const def = ELEMENT_DEFS.fireball;
  const cd = def.cd / (s.rateMul || 1);
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

// 雷电：子弹「命中敌人」时按概率召唤闪电（元素伤害），无冷却。
// 额外闪电数 = chainLv（1~4 道，覆盖式），总伤害随层数 -10%~-40%；满 4 层触发概率翻倍。
// V1.13：概率保持原样（基础 50%，满层 ×2 = 100%），改用**调高硬性间隔**来压频率 ——
// 高射速武器（机枪 0.175s 一轮）会长期顶在间隔上限上，这才是「闪电刷屏」的真正来源。
const LIGHTNING_BASE_CHANCE = 0.5;
const LIGHTNING_EXTRA_DMG = [0, -0.1, -0.2, -0.3, -0.4];   // 索引 = chainLv
const LIGHTNING_DELAY = 0.15;                              // 落雷延迟：让子弹先出膛，视觉顺序更自然
const LIGHTNING_MIN_INTERVAL = 0.30;                       // 硬性触发间隔：两次落雷之间至少 0.30s（上限 ≈3.33 次/秒）
let pendingLightning = [];                                 // 已判定成功、等待落雷的剩余倒计时
let lightningCdT = 0;                                      // 硬性触发间隔的剩余时间

// 触发概率只由「额外闪电」层数决定：0~3 层 50%，满 4 层翻倍到 100%。
// V1.20 去掉了所有「触发概率加成」类选项（Boss 奖励「闪电触发概率 +20%」整张卡、
// 进化「苍穹雷暴」的 ×1.5），概率这条线不再有任何可叠加的加成。
function lightningChance(s) {
  const lv = Math.min(4, s.chainLv || 0);
  return lv >= 4 ? 1 : LIGHTNING_BASE_CHANCE;
}

// 触发判定在「子弹命中敌人」时进行（而不是开火时）：先确认这一轮真的打到了人再落雷。
// 「一轮」= 武器的一次开火（所有小兵共用同一个标记），所以每轮最多只记一次。
//
// V1.19 改成「窗口制」：一次落雷之后的 LIGHTNING_MIN_INTERVAL 秒算一个窗口，
// 窗口内只要有子弹命中过敌人，就在窗口结束时判定一次。于是落雷频率 = max(硬间隔, 武器开火间隔)，
// 可以连续调；旧规则是「命中时判定 + cd 拦截」，cd 还没走完的那次命中机会被白白浪费，
// 频率被量化成「开火间隔的整数倍」——机枪开火 0.175s，硬间隔只要落在 (0.175, 0.35] 里
// 一律等效 0.35s（2.72 次/秒），改 0.30 / 0.25 / 0.20 全都一样。
let lightningPending = false;                              // 当前窗口内是否有过命中（等窗口结束再判定）

function tryLightning() {
  const s = getSummon('lightning');
  lightningPending = false;
  if (!s) return;
  if (Math.random() >= lightningChance(s)) return;
  lightningCdT = LIGHTNING_MIN_INTERVAL;
  pendingLightning.push(LIGHTNING_DELAY);
}

function rollLightningOnHit(v) {
  if (!v || v.spent) return;
  v.spent = true;
  if (!getSummon('lightning')) return;
  if (lightningCdT > 0) { lightningPending = true; return; }   // 窗口未结束：先记下「这轮打到了人」
  tryLightning();                                              // 窗口刚过：立刻判定
}

function updatePendingLightning(dt) {
  if (lightningCdT > 0) lightningCdT = Math.max(0, lightningCdT - dt);
  if (lightningCdT <= 0 && lightningPending) tryLightning();   // 窗口结束：用窗口内的命中补一次判定
  if (!pendingLightning.length) return;
  for (let i = pendingLightning.length - 1; i >= 0; i--) {
    pendingLightning[i] -= dt;
    if (pendingLightning[i] <= 0) {
      pendingLightning.splice(i, 1);
      triggerLightning();
    }
  }
}

function triggerLightning() {
  const s = getSummon('lightning');
  if (!s) return;
  if (enemies.every(e => e.dead)) return;
  const def = ELEMENT_DEFS.lightning;
  const lv = Math.min(4, s.chainLv || 0);
  const dmg = def.dmg * s.dmgMul * powerBaseDamage(s) * (1 + LIGHTNING_EXTRA_DMG[lv]);
  const strikes = 1 + lv;
  const hit = new Set();
  const alive = () => enemies.filter(e => !e.dead && !hit.has(e));   // 尚未被劈到的敌人（优先）
  const any = () => enemies.filter(e => !e.dead);

  for (let i = 0; i < strikes; i++) {
    // 目标不够时重复劈已命中的敌人，保证「额外闪电」在单体战里也有收益
    let pool = alive();
    if (!pool.length) pool = any();
    if (!pool.length) break;
    const cur = pool[Math.floor(Math.random() * pool.length)];
    strikeEnemy(cur, dmg, hit);
  }
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
  s.cd = def.cd / (s.rateMul || 1);
}

// 冰刺命中：霜冻减速 + 概率冰冻，并在命中处炸开碎冰
function applyIceHit(b, e) {
  tryApplyFrost(e, b.frost.mul, b.frost.time);
  if (b.frost.chance > 0 && Math.random() < b.frost.chance) tryApplyFreeze(e, b.frost.freezeTime);
  iceSpikes.push({ x: b.x, y: b.y, r: Math.max(11, e.r * 1.05), life: 0.42, maxLife: 0.42, seed: Math.random() * 10 });
  spawnParticles(b.x, b.y, '#8fe3ff', 10);
  spawnParticles(b.x, b.y, '#dff6ff', 5);
}

// 霜冻（减速）：不可叠加（覆盖式），受独立抗性拦截；Boss 元素效果减半（时长与幅度都减半）
// 减速成功后再由「冻伤」roll 冰冻
function tryApplyFrost(e, mul, time) {
  if (e.resistFrostT > 0) return false;
  const boss = e.type === 'boss';
  const t = (time || FROST_TIME) * (boss ? 0.5 : 1) * statusDur();
  const m = boss ? 1 - (1 - mul) * 0.5 : mul;
  e.frostT = t;
  e.frostMul = Math.max(0.15, m);
  e.resistFrostT = statusResistTime(e);
  rollFrostbite(e);
  return true;
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
      rollSwordMark(e);                            // 剑印：命中留印，被标记的敌人吃更多伤害
      swordQi(e, dmg);                            // 剑气：向四周溅射
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
          rollSwordMark(o);
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
  // 宠物喷吐为元素伤害：吃宠物乘区 + 元素乘区（元素乘区不再单独保底，
  // 与元素线同规则——元素加成能放大它，元素减益同样作用于它）
  const dmg = def.dmg * pet.dmgMul * stats.petDamage * stats.elementalDamage;
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
        rollLightningOnHit(b.volley);   // 闪电：本轮子弹打到敌人时才判定（每轮一次）
        const dmg = b.fo ? b.dmg * falloffMul(b) : b.dmg;   // 距离衰减（散弹）
        const near = b.guard && b.fo && Math.hypot(b.x - b.sx, b.y - b.sy) <= b.fo.near;
        if (b.pierce > 0) {
          b.pierce--;                       // 消耗一次穿透，子弹继续飞行
          applyBulletKnockback(e, b);
          hitEnemy(e, dmg, b.burnDps, b.burnTime);
          if (!b.petShot) rollEnchants(e);  // 子弹附魔：命中时按概率挂点燃 / 减速
          if (near && e.dead) closeKillReward();
          if (b.frost) applyIceHit(b, e);
          if (e.dead && b.split) tryShotgunSplit(e, b);
        } else {
          if (b.aoe > 0) {
            explode(b);
          } else {
            applyBulletKnockback(e, b);
            hitEnemy(e, dmg, b.burnDps, b.burnTime);
            if (!b.petShot) rollEnchants(e);
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

// ==================== 状态与抗性（V1.10） ====================
// 点燃 / 减速 / 冰冻三类**各自独立**计时抗性：施加成功即进入抗性，抗性期间免疫同类施加。
// 抗性时长：普通 0.5s、精英 1.0s、Boss 1.5s。点燃与减速不可叠加（覆盖式），
// 只有「爆裂」的额外点燃层可单独叠加。
const BURN_DPS = 6;                                   // 火焰附魔的点燃基础伤害（每秒）
const BURN_TIME = 3;                                  // 火焰附魔点燃持续（V1.23：2s → 3s）
const FROST_MUL = 0.6;                                // 霜冻附魔减速后的移速倍率（= 减速 40%）
const FROST_TIME = 2;                                 // 霜冻附魔减速持续（V1.23：1s → 2s）
const FREEZE_TIME = 3;                                // 冻伤的冰冻持续
const ENCH_FIRE_CHANCE = [0.10, 0.25, 0.40, 0.60];    // 火焰附魔 1~4 层
const ENCH_FROST_CHANCE = [0.10, 0.20, 0.35, 0.50];   // 霜冻附魔 1~4 层
const SEVERE_BURN = [0.10, 0.20, 0.35, 0.50];         // 严重灼伤：点燃伤害加成（覆盖式）
const FROSTBITE_CHANCE = [0.10, 0.20, 0.35, 0.50];    // 冻伤：冰冻概率（覆盖式）
const FROSTBITE_HP = [0.05, 0.10, 0.15, 0.25];        // 冻伤：扣除当前生命（精英 5% / Boss 1%）
const BLAST_RADIUS = 70, BLAST_HP = 0.05;             // 爆裂：范围与按生命上限的百分比伤害
const WINTER_RADIUS = 90, WINTER_HP = 0.25;           // 凛冬：同上

// ===== 召唤物质变链（V1.22）：镰刀「出血斩杀」 / 飞剑「剑印剑气」 =====
// 结构照搬附魔线：基础卡可叠 4 层 → 进阶卡（需先选基础卡）可叠 4 层 → 一次性大招（需先选进阶卡）
const BLEED_TIME = 3;                                   // 割裂持续（每次命中刷新）
const SCYTHE_BLEED_CHANCE = [0.20, 0.35, 0.50, 0.70];   // 割裂 1~4 层：命中触发概率
const SCYTHE_BLEED_PCT = [0.50, 1.00, 1.50, 2.00];      // 割裂每秒伤害 = 镰刀单次伤害 × 该比例
const SCYTHE_REAP_DMG = [0.20, 0.35, 0.50, 0.70];       // 噬魂 1~4 层：对被割裂目标的额外伤害
const SCYTHE_REAP_LEECH = [0.03, 0.05, 0.07, 0.10];     // 噬魂：命中被割裂目标的吸血比例
const EXECUTE_HP = 0.15;                                // 死神降临：处决线（生命低于上限的该比例）
const EXECUTE_HEAVY_HP = 0.06;                          // 精英 / Boss 在处决线以下改吃「生命上限 6%」的伤害
const EXECUTE_CD = 2;                                   // 同一敌人两次处决判定的最小间隔
const SWORD_MARK_TIME = 3;                              // 剑印持续
const SWORD_MARK_CHANCE = [0.20, 0.35, 0.50, 0.70];     // 剑印 1~4 层：命中触发概率
const SWORD_MARK_VULN = [0.08, 0.14, 0.20, 0.28];       // 被剑印标记的敌人受到的伤害 +N%（与嗜血同类加算）
const SWORD_QI_RADIUS = 70;                             // 剑气溅射半径
const SWORD_QI_PCT = [0.25, 0.40, 0.55, 0.75];          // 剑气：溅射伤害 = 本次斩击伤害 × 该比例（最多波及 4 名）
const TOMB_RADIUS = 80, TOMB_HP = 0.08;                 // 剑冢：带剑印的敌人阵亡时的范围伤害（按生命上限）
let burstDepth = 0;                                   // 死亡爆炸递归深度（>0 时不再触发，防连锁）

function statusResistTime(e) {
  return e.type === 'boss' ? 1.5 : (e.type === 'elite' ? 1.0 : 0.5);
}
// 已选层数（上限 4）；爆裂 / 凛冬这类一次性卡用 > 0 判断是否拥有
function cardLv(id) { return Math.min(4, pickCount[id] || 0); }

// 异常元素效果的持续时间倍率（「元素亲和」+35%）；抗性计时不受它影响
function statusDur() { return stats.statusDuration || 1; }

// 点燃：不可叠加（覆盖旧层），受抗性拦截；Boss 元素效果减半
function applyBurn(e, burnDps, burnTime) {
  if (!(burnDps > 0)) return false;
  if (e.resistBurnT > 0) return false;
  const f = e.type === 'boss' ? 0.5 : 1;
  e.burnDps = burnDps * (1 + (stats.burnDamage || 0)) * stats.elementalDamage * f;
  e.burnT = (burnTime || BURN_TIME) * f * statusDur();
  e.resistBurnT = statusResistTime(e);
  return true;
}

// 爆裂的额外点燃层：单独叠加、无视抗性（即卡面写的「双倍点燃伤害」）
function pushBurnStacks(e, n) {
  const f = e.type === 'boss' ? 0.5 : 1;
  const dps = BURN_DPS * (1 + (stats.burnDamage || 0)) * stats.elementalDamage * f;
  if (!e.burnExtra) e.burnExtra = [];
  for (let i = 0; i < n; i++) e.burnExtra.push({ dps, t: BURN_TIME * f * statusDur() });
}

// 当前点燃总伤害（主层 + 爆裂的额外层）
function burnTotalDps(e) {
  let d = (e.burnT > 0 && e.burnDps > 0) ? e.burnDps : 0;
  if (e.burnExtra) for (const b of e.burnExtra) d += b.dps;
  return d;
}

// ===== 镰刀：割裂 / 斩杀（V1.22） =====
// 割裂是 DoT：覆盖式刷新（不叠层），伤害直接快照「镰刀单次伤害 × 比例」，Boss 减半（与点燃一致）。
// 不给抗性——镰刀命中频率高，割裂本来就是要靠投资把它顶成常驻。
function applyBleed(e, dps, time) {
  if (!(dps > 0)) return false;
  const f = e.type === 'boss' ? 0.5 : 1;
  e.bleedDps = dps * f;
  e.bleedT = time || BLEED_TIME;
  return true;
}

// 死神降临：被割裂的目标进入处决线后，镰刀掠过直接斩落。
// 普通怪直接处决；精英 / Boss 改为额外吃一次「生命上限 6%」的伤害（同样不进任何伤害乘区），
// 同一敌人 2s 内只判一次，避免多把镰刀在同一帧反复结算。
function tryExecute(e) {
  if (cardLv('scythe-execute') <= 0) return false;
  if (e.dead) return false;
  if ((e.bleedT || 0) <= 0) return false;
  if (e.hp > e.maxHp * EXECUTE_HP) return false;
  if ((e.execT || 0) > gameTime - EXECUTE_CD) return false;
  e.execT = gameTime;
  if (e.type === 'boss' || e.type === 'elite') {
    const dmg = e.maxHp * EXECUTE_HEAVY_HP;
    e.hp -= dmg;
    spawnDamageNumber(e.x, e.y - e.r - 10, dmg, '#ff6b6b');
    spawnFloatText(e.x, e.y - e.r - 26, '死神降临', '#ff8080');
    if (e.hp <= 0) killEnemy(e);
  } else {
    spawnFloatText(e.x, e.y - e.r - 16, '处决', '#ff6b6b');
    spawnParticles(e.x, e.y, '#ff6b6b', 12);
    e.hp = 0;
    killEnemy(e);
  }
  return true;
}

// ===== 飞剑：剑印 / 剑气 / 剑冢（V1.22） =====
// 剑印：命中时按概率留印，被标记的敌人受到的伤害提高（在 hitEnemy 的加算区里结算）
function rollSwordMark(e) {
  const lv = cardLv('sword-mark');
  if (lv <= 0 || e.dead) return;
  if (Math.random() < SWORD_MARK_CHANCE[lv - 1]) e.markT = SWORD_MARK_TIME;
}

// 剑气：斩击命中时向四周溅射，对附近其他敌人造成本次伤害的一部分（最多波及 4 名，避免怪群爆炸）
function swordQi(src, dmg) {
  const lv = cardLv('sword-qi');
  if (lv <= 0 || !src || src.dead) return;
  const pct = SWORD_QI_PCT[lv - 1];
  let n = 0;
  for (const o of enemies) {
    if (o === src || o.dead || o.hp <= 0) continue;
    if (Math.hypot(o.x - src.x, o.y - src.y) > SWORD_QI_RADIUS + o.r) continue;
    hitEnemy(o, dmg * pct, 0, 0);
    rollSwordMark(o);
    if (++n >= 4) break;
  }
  if (n > 0) spawnParticles(src.x, src.y, '#dff3ff', 6);
}

// 剑冢：带剑印的敌人阵亡时原地落下一柄幻影剑，对范围内敌人造成其生命上限的伤害并重新挂印
function tombBurst(src) {
  spawnBlast(src.x, src.y, TOMB_RADIUS);
  spawnParticles(src.x, src.y, '#dff3ff', 14);
  sfxExplode();
  for (const o of enemies) {
    if (o.dead || o === src) continue;
    if (Math.hypot(o.x - src.x, o.y - src.y) > TOMB_RADIUS + o.r) continue;
    hitEnemy(o, o.maxHp * TOMB_HP, 0, 0);
    if (!o.dead) o.markT = SWORD_MARK_TIME;
  }
}

// 冰冻（硬控）：与点燃 / 减速各自独立抗性
function tryApplyFreeze(e, time) {
  if (e.resistFreezeT > 0) return false;
  e.freezeT = Math.max(e.freezeT || 0, (time || FREEZE_TIME) * (e.type === 'boss' ? 0.5 : 1) * statusDur());
  e.resistFreezeT = statusResistTime(e);
  return true;
}

// 冻伤：减速成功后按概率冰冻，并立即扣除当前生命的百分比
function rollFrostbite(e) {
  const lv = cardLv('frostbite');
  if (lv <= 0) return;
  if (Math.random() >= FROSTBITE_CHANCE[lv - 1]) return;
  if (!tryApplyFreeze(e, FREEZE_TIME)) return;
  const pct = e.type === 'boss' ? 0.01 : (e.type === 'elite' ? 0.05 : FROSTBITE_HP[lv - 1]);
  const dmg = e.hp * pct;
  e.hp -= dmg;
  spawnDamageNumber(e.x, e.y - e.r - 10, dmg, '#bfe8ff');
  spawnFloatText(e.x, e.y - e.r - 26, '冻伤', '#8fe3ff');
  if (e.hp <= 0) killEnemy(e);
}

// 子弹附魔：命中时按概率挂点燃 / 减速（召唤物命中不触发）
function rollEnchants(e) {
  const fa = cardLv('enchant-fire');
  if (fa > 0 && Math.random() < ENCH_FIRE_CHANCE[fa - 1]) applyBurn(e, BURN_DPS, BURN_TIME);
  const fb = cardLv('enchant-frost');
  if (fb > 0 && Math.random() < ENCH_FROST_CHANCE[fb - 1]) tryApplyFrost(e, FROST_MUL, FROST_TIME);
}

// 状态死亡爆炸：爆裂（被点燃的敌人）/ 凛冬（被冰冻的敌人）/ 剑冢（带剑印的敌人）
// 百分比伤害不进任何伤害乘区；被爆炸杀死的不再触发死亡爆炸（burstDepth 防连锁）
function statusDeathBurst(e) {
  if (burstDepth > 0) return;
  const blast = cardLv('blast') > 0 && (e.burnT || 0) > 0;
  const winter = cardLv('winter') > 0 && (e.freezeT || 0) > 0;
  const tomb = cardLv('sword-tomb') > 0 && (e.markT || 0) > 0;
  if (!blast && !winter && !tomb) return;
  burstDepth++;
  if (blast) burstArea(e, BLAST_RADIUS, e.maxHp * BLAST_HP, true);
  if (winter) burstArea(e, WINTER_RADIUS, e.maxHp * WINTER_HP, false);
  if (tomb) tombBurst(e);
  burstDepth--;
}

function burstArea(src, radius, dmg, refuel) {
  spawnBlast(src.x, src.y, radius);
  spawnParticles(src.x, src.y, refuel ? '#ff9d3b' : '#8fe3ff', 14);
  sfxExplode();
  for (const o of enemies) {
    if (o.dead || o === src) continue;
    if (Math.hypot(o.x - src.x, o.y - src.y) > radius + o.r) continue;
    hitEnemy(o, dmg, 0, 0);
    if (refuel) pushBurnStacks(o, 2);     // 爆裂：被波及的敌人再挂 2 层点燃
  }
}

function hitEnemy(e, dmg, burnDps, burnTime) {
  if (devOneShot) dmg = e.hp + (e.shield || 0) + 1;   // 调试：秒杀（连盾一起打穿）
  e.hitFlashUntil = gameTime + 0.09;
  // 易伤：敌人受到的伤害加成（同类加算，只乘一次）。剑印（被飞剑标记）与嗜血共用这个加算区
  const markLv = e.markT > 0 ? cardLv('sword-mark') : 0;
  const markVuln = markLv > 0 ? SWORD_MARK_VULN[markLv - 1] : 0;
  if (stats.vuln > 0 || markVuln > 0) dmg *= 1 + stats.vuln + markVuln;
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
  // 分裂者被动：血量每损失一档就裂出一只分身（见 tryBossSplitOff）
  if (e.type === 'boss' && e.kind === 'splitter' && e.hp > 0) tryBossSplitOff(e);
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  kills++;
  runCoins += coinDrop(e.type);
  shake = Math.min(10, shake + (e.type === 'boss' ? 8 : 1.5));
  sfxKill();
  spawnParticles(e.x, e.y, ENEMY_TYPES[e.type].color, 8);
  if (e.type === 'bomber') enemyExplode(e);      // 自爆怪：死亡也炸
  if (e.affixVolatile) affixExplode(e);          // 殉爆词缀：死亡原地爆炸
  if (e.affixSplit) spawnSplitElites(e);         // 分裂词缀：死亡裂成 2 只残血小精英
  dropXp(e);
  killExplosionAt(e.x, e.y);
  statusDeathBurst(e);                           // 爆裂 / 凛冬：状态死亡爆炸
  if (e.type === 'boss') {
    bossKills++;
    difficulty = Math.min(3, difficulty + 0.25);
    rerollLeft++;
    bossArena = null;                              // 首领阵亡：解除场地封锁
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
  if (hit && !e.devPeaceful) damageSoldier(hit, dmg);              // 调试：停手的敌人爆炸不掉血
  e.dead = true;
}

function moveEnemy(e, target, dt) {
  if (e.devStatic) return;                                           // 调试：站桩敌人不移动
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

// ==================== 首领 AI（V1.25） ====================
// 行为总入口。状态优先级：位移中 > 蓄力 > 施法中 > 常规走位 + 技能模组。
// 「灵活性」由通用层提供（轨道走位 / 位移），各 Boss 只负责自己的招牌技能。
function updateBoss(e, target, dt) {
  // if (e.blinkCd > 0) e.blinkCd -= dt;   // （V1.25.1 停用）召唤者闪现的冷却，随闪现一起注释

  // 二阶段：血量降到一半后狂暴（各 Boss 的追加效果不同）
  if (!e.phase2 && e.hp <= e.maxHp * 0.5) enterBossPhase2(e);

  // ---- 调试：停手的首领只走位（不出招、不放弹幕、不撞人）----
  if (e.devPeaceful) {
    if (e.dashT > 0) e.dashT = 0;                    // 取消进行中的位移，避免停在半路
    e.skillState = 'idle';
    e.castT = 0;
    moveBoss(e, target, dt);
    return;
  }

  // ---- 位移中（冲锋冲刺 / 分裂突进）：完全接管移动 ----
  // 位移距离严格按「速度 × 时长」结算（末帧只走剩余时间），不多走一帧的余量；
  // 且位移期间只吃世界边界、不吃竞技场软限制 —— 否则会被边界顶住提前停下，
  // 与地面上按 bossDashReach 画出的预警条长度对不上。
  if (e.dashT > 0) {
    const stepT = Math.min(dt, e.dashT);
    e.dashT -= dt;
    const step = e.dashSpd * stepT;
    if (!e.devStatic) {                              // 调试：站桩首领原地完成位移（伤害与表现照常）
      e.x += e.skillDirX * step;
      e.y += e.skillDirY * step;
      clampBossWorld(e);
    }
    spawnParticles(e.x, e.y, e.dashKind === 'charge' ? '#ff9d3b' : '#ffd0a0', 2);
    if (e.dashDamage > 0) {
      // 共享血池：一次位移只结算一次伤害（不随命中人数翻倍）
      if (!e.skillHit) e.skillHit = new Set();
      if (!e.skillHit.has('squad')) {
        const hit = soldiers.find(s => Math.hypot(s.x - e.x, s.y - e.y) < e.r + S.soldierR);
        if (hit) { e.skillHit.add('squad'); damageSoldier(hit, e.dashDamage * difficulty); }
      }
    }
    if (e.dashT <= 0) onBossDashEnd(e);
    return;
  }

  // ---- 蓄力（冲刺前摇）：原地不动，地面显示指示条 ----
  // 蓄力前 trackFrac 比例持续把方向转向目标，之后锁定：地面上画的那条指示带与实际冲刺用的是
  // 同一个方向向量，因此「指示带指哪儿 = 首领就冲哪儿」，不会出现玩家按指示躲避却仍被撞中的误判。
  if (e.skillState === 'charge') {
    aimBossCharge(e, target, dt);
    e.skillT -= dt;
    if (e.skillT <= 0) startBossDash(e, target);
    return;
  }

  // ---- 施法中（召唤阵）：站桩读条，位置由预警圈提前告诉玩家 ----
  if (e.castT > 0) {
    e.castT -= dt;
    if (e.castT <= 0) resolveBossCast(e);
    return;
  }

  // ---- 常规：维持距离 + 绕圈 ----
  moveBoss(e, target, dt);
  e.atkCd -= dt;
  if (target !== squad) {
    const d = Math.hypot(e.x - target.x, e.y - target.y);
    if (d < e.r + S.soldierR + CONTACT_PAD && e.atkCd <= 0) {
      damageSoldier(target, e.dmg);
      e.atkCd = 1.0;
    }
  }

  if (e.kind === 'barrage') updateBarrageBoss(e, target, dt);
  else if (e.kind === 'summoner') updateSummonerBoss(e, target, dt);
  else if (e.kind === 'splitter') updateSplitterBoss(e, target, dt);
  else updateChargeBoss(e, target, dt);

  // 通用八向弹幕：给不走「技能模组」的 Boss 兜底（弹幕者已经有完整轮换，不需要）
  if (e.kind !== 'barrage') {
    e.burstCd -= dt;
    if (e.burstCd <= 0) {
      fireBossBurst(e);
      e.burstCd = e.kind === 'summoner' ? 3.5 : (e.phase2 ? 2 : 2.5);
    }
  }
}

// 首领位置约束：不越出世界；有竞技场时不跑出「场地 + 220」。
// 它是「维持距离」型 AI，不做约束会绕着玩家一路漂到玩家够不到的地方。
function clampBossInWorld(e) {
  clampBossWorld(e);
  if (!bossArena) return;
  const dx = e.x - bossArena.x, dy = e.y - bossArena.y;
  const d = Math.hypot(dx, dy);
  const lim = bossArena.r + 220;
  if (d > lim) { e.x = bossArena.x + (dx / d) * lim; e.y = bossArena.y + (dy / d) * lim; }
}

// 仅世界边界。冲刺 / 突进期间用它：位移是短促的爆发，允许短暂越出竞技场软范围，
// 换来的好处是「位移距离 = 预警条长度」，玩家能按指示带准确读出落点。
function clampBossWorld(e) {
  e.x = Math.max(e.r, Math.min(WORLD.w - e.r, e.x));
  e.y = Math.max(e.r, Math.min(WORLD.h - e.r, e.y));
}

// 轨道走位：维持各自的中距离（orbitR）+ 横向绕圈，并周期性翻转绕行方向。
// 朝向做平滑处理，避免每帧改向导致的抖动；减速 / 冰冻沿用与小怪一致的规则。
function moveBoss(e, target, dt) {
  if (e.devStatic) return;                       // 调试：站桩首领不做轨道走位
  if (e.freezeT > 0) return;
  e.orbitFlipT -= dt;
  if (e.orbitFlipT <= 0) {
    e.orbitDir = -e.orbitDir;
    e.orbitFlipT = BOSS_MOVE.flipMin + Math.random() * (BOSS_MOVE.flipMax - BOSS_MOVE.flipMin);
  }

  const orbitR = (BOSS_KINDS[e.kind] || {}).orbitR || 250;
  const dx = target.x - e.x, dy = target.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;

  // 径向修正按偏差比例给：越接近 orbitR 修正越小，首领真正停在目标距离上。
  // 旧版是「出死区就给满速」的开关式，落点会停在死区边缘（实测冲锋者停在 206、分裂者停在 60），
  // 叠上频繁折返，看起来就是「原地打转」。
  const radial = Math.max(-1, Math.min(1, (d - orbitR) / BOSS_MOVE.band));

  const vx = ux * radial + (-uy * e.orbitDir) * BOSS_MOVE.strafe;
  const vy = uy * radial + (ux * e.orbitDir) * BOSS_MOVE.strafe;
  const slow = (enemySlowT > 0 ? SKILL_DEFS.slow.mul : 1) * (e.frostT > 0 ? (e.frostMul || 1) : 1);
  const sp = e.speed * slow;

  const want = Math.atan2(vy, vx);
  if (e.moveAng == null) e.moveAng = want;
  let diff = want - e.moveAng;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = BOSS_MOVE.turnRate * dt;
  e.moveAng += Math.max(-maxTurn, Math.min(maxTurn, diff));

  e.x += Math.cos(e.moveAng) * sp * dt;
  e.y += Math.sin(e.moveAng) * sp * dt;
  clampBossInWorld(e);
}

// （V1.25.1 停用）通用位移（后跃 / 突进）：速度 = 距离 / 固定时长，走「爆发式移动」而不是堆基础移速。
// 现在没有调用方（唯一的调用者「弹幕者后跃」已注释），整段保留以便恢复。
// function bossLeap(e, angle, dist) {
//   e.skillDirX = Math.cos(angle);
//   e.skillDirY = Math.sin(angle);
//   e.dashSpd = dist / BOSS_LEAP.time;
//   e.dashT = BOSS_LEAP.time;
//   e.dashDamage = 0;
//   e.dashKind = 'leap';
// }

// 进入冲刺蓄力。wind 可缩短（二阶段连冲用）
function enterBossCharge(e, wind) {
  e.skillState = 'charge';
  e.skillT = wind;
  e.chargeWind = wind;
}

// 蓄力期间的瞄准：前 trackFrac 比例按 aimRate 把冲刺方向逐渐转到目标身上，之后**锁定方向**。
// 追踪阶段让指示带先指向玩家（冲刺不至于白放），锁定阶段留出明确的躲避窗口。
// 画在地面上的指示带读的就是 e.skillDirX/Y，冲刺也用它 —— 两者天然一致（锁定后一起停住）。
function aimBossCharge(e, target, dt) {
  if (!target) return;
  const dx = target.x - e.x, dy = target.y - e.y;
  if (Math.hypot(dx, dy) < 1) return;
  const want = Math.atan2(dy, dx);
  if (!e.skillDirX && !e.skillDirY) {              // 首次冲刺：直接朝向目标
    e.skillDirX = Math.cos(want);
    e.skillDirY = Math.sin(want);
    return;
  }
  // 追踪窗口结束 → 方向锁定（前摇越短，窗口也越短）
  const wind = e.chargeWind || BOSS_SKILL.chargeTime;
  if (wind - e.skillT >= wind * BOSS_SKILL.trackFrac) return;
  let cur = Math.atan2(e.skillDirY, e.skillDirX);
  let diff = want - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = BOSS_SKILL.aimRate * dt;
  cur += Math.max(-maxTurn, Math.min(maxTurn, diff));
  e.skillDirX = Math.cos(cur);
  e.skillDirY = Math.sin(cur);
}

// 一次冲刺实际能走的距离：撞到世界边界就缩短（与位移时的 clampBossWorld 一致）。
// 指示带的长度也用它，这样箭头尖端画在哪儿，首领就停在哪儿。
function bossDashReach(e, ax, ay) {
  const want = BOSS_SKILL.dashSpeed * BOSS_SKILL.dashTime;
  let lim = want;
  const pad = 2;
  if (ax > 1e-4) lim = Math.min(lim, (WORLD.w - e.r - pad - e.x) / ax);
  else if (ax < -1e-4) lim = Math.min(lim, (e.r + pad - e.x) / ax);
  if (ay > 1e-4) lim = Math.min(lim, (WORLD.h - e.r - pad - e.y) / ay);
  else if (ay < -1e-4) lim = Math.min(lim, (e.r + pad - e.y) / ay);
  return Math.max(0, lim);
}

// 蓄力结束 → 真的冲出去（方向沿用蓄力期间瞄准好的 e.skillDirX/Y）
function startBossDash(e, target) {
  if (!e.skillDirX && !e.skillDirY) {              // 兜底：没有瞄准数据时朝目标
    const a = target ? Math.atan2(target.y - e.y, target.x - e.x) : Math.random() * Math.PI * 2;
    e.skillDirX = Math.cos(a);
    e.skillDirY = Math.sin(a);
  }
  e.skillState = 'idle';
  e.dashSpd = bossDashReach(e, e.skillDirX, e.skillDirY) / BOSS_SKILL.dashTime;
  e.dashT = BOSS_SKILL.dashTime;
  e.dashDamage = BOSS_SKILL.damage;
  e.dashKind = 'charge';
  e.skillHit = new Set();
  sfxExplode();
  shake = Math.min(10, shake + 3);
}

// 位移结束：冲锋要结算落点震波，并决定要不要接下一段连冲
function onBossDashEnd(e) {
  const kind = e.dashKind;
  e.dashDamage = 0;
  e.dashKind = '';
  if (kind !== 'charge') return;
  bossShockwave(e);
  if (e.phase2 && e.chargeCombo < 2) {                 // 二阶段：最多三段连冲
    e.chargeCombo++;
    enterBossCharge(e, BOSS_SKILL.chargeTime * 0.45);  // 后续段前摇缩短
  } else {
    e.chargeCombo = 0;
    e.skillCd = BOSS_SKILL.cooldown;
  }
}

// 冲锋落点震波：冲刺结束原地炸一圈，逼玩家不要在落点站桩
function bossShockwave(e) {
  spawnBlast(e.x, e.y, BOSS_SHOCK.r * 0.8);
  spawnParticles(e.x, e.y, '#ff9d3b', 16);
  sfxExplode();
  shake = Math.min(10, shake + 3);
  const hit = soldiers.find(s => Math.hypot(s.x - e.x, s.y - e.y) < BOSS_SHOCK.r + S.soldierR);
  if (hit) damageSoldier(hit, BOSS_SHOCK.dmg * difficulty);
}

function enterBossPhase2(e) {
  e.phase2 = true;
  shake = Math.min(12, shake + 6);
  spawnParticles(e.x, e.y, '#ffd54f', 28);
  showBanner('BOSS 狂暴化！', 1.6);
  sfxExplode();
  if (e.kind === 'splitter') spawnMinionsAround(e, 'elite', 2);      // 分裂者：再裂出两个精英
  else if (e.kind === 'summoner') spawnMinionsAround(e, 'fast', 4);
  else if (e.kind === 'charge') enterBossCharge(e, BOSS_SKILL.chargeTime * 0.5);  // 冲锋者：立刻起手
  else if (e.kind === 'barrage') e.burstCd = 0.4;                    // 弹幕者：立刻开一轮
}

// 冲锋者：蓄力 → 冲刺（二阶段三段连冲）→ 落点震波
function updateChargeBoss(e, target, dt) {
  e.skillCd -= dt;
  if (e.skillCd <= 0) enterBossCharge(e, BOSS_SKILL.chargeTime);
}

// 召唤者：在玩家附近画召唤阵读条（0.9s 预警）后冒出小怪
function updateSummonerBoss(e, target, dt) {
  // （V1.25.1 停用）玩家贴近 150 内时闪现到距玩家 340 的另一侧。
  // 理由：纯挪位置、无伤害，瞬移表现为「突然消失再出现」，不易读；代码保留以便恢复。
  // const d = Math.hypot(target.x - e.x, target.y - e.y);
  // if (e.blinkCd <= 0 && d < 150) {
  //   const a = Math.atan2(e.y - target.y, e.x - target.x) + (Math.random() - 0.5) * 1.4;
  //   spawnParticles(e.x, e.y, '#16a085', 16);
  //   e.x = target.x + Math.cos(a) * BOSS_BLINK.r;
  //   e.y = target.y + Math.sin(a) * BOSS_BLINK.r;
  //   clampBossInWorld(e);
  //   spawnParticles(e.x, e.y, '#16a085', 16);
  //   e.blinkCd = BOSS_BLINK.cd;
  //   e.orbitFlipT = 1;                                  // 换个绕行方向，免得刚落地又绕回去
  //   return;
  // }
  e.sumCd -= dt;
  if (e.sumCd <= 0) {
    e.sumCd = e.phase2 ? 3.8 : 5.4;
    e.castType = 'summon';
    e.castT = BOSS_SUMMON.wind;
    const a = Math.random() * Math.PI * 2, rr = Math.random() * 120;
    e.castX = Math.max(40, Math.min(WORLD.w - 40, target.x + Math.cos(a) * rr));
    e.castY = Math.max(40, Math.min(WORLD.h - 40, target.y + Math.sin(a) * rr));
    spawnParticles(e.castX, e.castY, '#4dd07a', 8);
  }
}

// 召唤阵落成：从阵里冒出小怪，并给它们套一层护盾（随 difficulty 缩放）
function resolveBossCast(e) {
  if (e.castType !== 'summon') return;
  e.castType = '';
  const n = e.phase2 ? 3 : 2;
  const gain = 18 * difficulty;
  for (let i = 0; i < n; i++) {
    const type = Math.random() < 0.5 ? 'grunt' : 'fast';
    const a = Math.random() * Math.PI * 2, rr = Math.random() * BOSS_SUMMON.r * 0.65;
    const before = enemies.length;
    spawnEnemy(type, e.castX + Math.cos(a) * rr, e.castY + Math.sin(a) * rr);
    for (let j = before; j < enemies.length; j++) {
      const o = enemies[j];
      o.shieldMax = Math.min(o.maxHp * 0.5, o.shieldMax + gain);
      o.shield = o.shieldMax;
    }
  }
  spawnBlast(e.castX, e.castY, BOSS_SUMMON.r * 0.8);
  spawnParticles(e.castX, e.castY, '#4dd07a', 18);
  sfxExplode();
  shake = Math.min(10, shake + 2);
}

// 分裂者：向前突进撕咬（带伤害的位移）；血量每掉一档还会裂出一只分身（见 tryBossSplitOff）
function updateSplitterBoss(e, target, dt) {
  e.skillCd -= dt;
  if (e.skillCd > 0) return;
  const d = Math.hypot(target.x - e.x, target.y - e.y);
  // 已经贴到身上（接触伤害范围内）就不必突进，1.2s 后再判断。
  // V1.26.2：阈值从 e.r + 70（116）改成真正的接触距离（66）—— 它自己就停在 orbitR = 110，
  // 旧阈值把它一直判成「贴脸」，撕咬从来没触发过。
  if (d <= e.r + S.soldierR + CONTACT_PAD) { e.skillCd = 1.2; return; }
  e.skillCd = e.phase2 ? 3.2 : 4.6;
  const a = Math.atan2(target.y - e.y, target.x - e.x);
  e.skillDirX = Math.cos(a);
  e.skillDirY = Math.sin(a);
  e.dashSpd = BOSS_BITE.speed;
  e.dashT = BOSS_BITE.time;
  e.dashDamage = BOSS_BITE.dmg;
  e.dashKind = 'bite';
  e.skillHit = new Set();
}

// 分裂者的被动：血量每损失一档（80% / 60%）原地裂出一只低血分身，上限 2 只（避免越打越多）
function tryBossSplitOff(e) {
  if (e.splitLeft <= 0) return;
  if (e.hp > e.maxHp * e.splitAt) return;
  e.splitLeft--;
  e.splitAt -= 0.2;
  const a = Math.random() * Math.PI * 2, d = e.r + 50;
  spawnEnemy('elite', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, { affixes: [], hpMul: 0.5 });
  spawnParticles(e.x, e.y, '#d35400', 14);
}

// 弹幕者技能模组：环形弹幕 → 瞄准扇射 → 螺旋扫射 → 弹幕墙（V1.25：弹幕墙提前到一阶段）
// 二阶段追加第 5 招「交叉双螺旋」
function updateBarrageBoss(e, target, dt) {
  // 螺旋扫射进行中：连续甩出旋转弹幕（双螺旋 = 同时甩出一股反向的）
  if (e.spiralT > 0) {
    e.spiralT -= dt;
    e.spiralFireT = (e.spiralFireT || 0) - dt;
    if (e.spiralFireT <= 0) {
      e.spiralFireT = 0.13;
      e.spiral = (e.spiral || 0) + 0.5;
      fireBossRing(e, 4, 170, 7, e.spiral);
      if (e.spiralDual) fireBossRing(e, 4, 170, 7, -e.spiral);
    }
  }

  e.burstCd -= dt;
  if (e.burstCd > 0) return;

  e.skillIdx = ((e.skillIdx || 0) + 1) % (e.phase2 ? 5 : 4);
  e.spiralDual = false;
  let instant = false;                                       // 是否是「瞬发技」（可以接后跃；后跃停用后暂无人读取，保留以便恢复）
  if (e.skillIdx === 0) {
    fireBossRing(e, e.phase2 ? 14 : 10, 175, 9, 0);          // 环形弹幕
    spawnParticles(e.x, e.y, '#c08bff', 12);
    e.burstCd = e.phase2 ? 1.6 : 2.4;
    instant = true;
  } else if (e.skillIdx === 1) {
    fireBossFan(e, target, e.phase2 ? 7 : 5, 0.22, 200, 10); // 瞄准扇射
    e.burstCd = e.phase2 ? 1.5 : 2.3;
    instant = true;
  } else if (e.skillIdx === 2) {
    e.spiralT = e.phase2 ? 1.6 : 1.2;                        // 螺旋扫射（持续输出）
    e.spiralFireT = 0;
    e.burstCd = e.phase2 ? 3.4 : 4.4;
  } else if (e.skillIdx === 3) {
    fireBarrageWall(e);                                      // 弹幕墙（V1.25：一阶段即开放）
    e.burstCd = e.phase2 ? 3.0 : 3.8;
    instant = true;
  } else {
    e.spiralT = 1.8;                                         // 二阶段专属：交叉双螺旋
    e.spiralFireT = 0;
    e.spiralDual = true;
    e.burstCd = 3.6;
  }

  // （V1.25.1 停用）放完瞬发技若玩家贴太近，会后跃 180 拉开距离。
  // 理由：纯挪位置、无伤害，与召唤者闪现同理，不易读；代码保留以便恢复（配套的 bossLeap 也一并没有删）。
  // const orbitR = (BOSS_KINDS.barrage || {}).orbitR || 300;
  // if (instant && Math.hypot(target.x - e.x, target.y - e.y) < orbitR * 0.7) {
  //   bossLeap(e, Math.atan2(e.y - target.y, e.x - target.x), 180);
  // }
}

function updateEnemies(dt) {
  for (const e of enemies) {
    const burn = burnTotalDps(e);
    if (burn > 0) {
      e.hp -= burn * dt;
      if (e.burnT > 0) e.burnT = Math.max(0, e.burnT - dt);
      if (e.burnExtra && e.burnExtra.length) {
        for (const b of e.burnExtra) b.t -= dt;
        e.burnExtra = e.burnExtra.filter(b => b.t > 0);
      }
      if (e.hp <= 0) { killEnemy(e); continue; }
    }

    // 割裂（镰刀）：每秒结算一次 DoT，不进任何伤害乘区
    if (e.bleedT > 0) {
      e.hp -= (e.bleedDps || 0) * dt;
      e.bleedT = Math.max(0, e.bleedT - dt);
      if (e.bleedT <= 0) e.bleedDps = 0;
      if (e.hp <= 0) { killEnemy(e); continue; }
    }

    // 剑印（飞剑）：计时递减，归零后不再提供易伤
    if (e.markT > 0) e.markT = Math.max(0, e.markT - dt);

    // 状态抗性递减（点燃 / 减速 / 冰冻三类各自独立）
    if (e.resistBurnT > 0) e.resistBurnT = Math.max(0, e.resistBurnT - dt);
    if (e.resistFrostT > 0) e.resistFrostT = Math.max(0, e.resistFrostT - dt);
    if (e.resistFreezeT > 0) e.resistFreezeT = Math.max(0, e.resistFreezeT - dt);

    // 霜冻减速 / 冰冻计时
    if (e.frostT > 0) {
      e.frostT -= dt;
      if (e.frostT <= 0) { e.frostT = 0; e.frostMul = 1; }
    }
    if (e.freezeT > 0) e.freezeT = Math.max(0, e.freezeT - dt);

    // 击退平滑位移 + 衰减 + 抗性计时
    if (e.devStatic) { e.kbx = 0; e.kby = 0; }                     // 调试：站桩敌人不吃击退
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
        if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + S.soldierR + CONTACT_PAD) { enemyExplode(e); continue; }
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
        if (d < e.r + S.soldierR + CONTACT_PAD && e.atkCd <= 0) {
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
    } else if (e.type === 'elite') {
      // 精英：本体就是普通近战怪，威胁全在词缀上
      moveEnemy(e, target, dt);
      e.atkCd -= dt;
      if (target !== squad && !e.devPeaceful) {
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d < e.r + S.soldierR + CONTACT_PAD && e.atkCd <= 0) {
          damageSoldier(target, e.dmg);
          e.atkCd = 1.0;
        }
      }
      // 狂暴词缀：血量降到一半后移速与伤害 +50%
      if (e.affixBerserk && !e.berserkOn && e.hp <= e.maxHp * 0.5) {
        e.berserkOn = true;
        e.speed *= 1.5;
        e.dmg *= 1.5;
        spawnParticles(e.x, e.y, '#ff6b4a', 14);
        shake = Math.min(8, shake + 2);
      }
      // 守卫词缀：周期性给附近小怪套小护盾
      if (e.affixWard) {
        e.wardCd -= dt;
        if (e.wardCd <= 0) {
          e.wardCd = ELITE_WARD_INTERVAL;
          const gain = ELITE_WARD_AMOUNT * difficulty;
          let given = 0;
          for (const o of enemies) {
            if (o === e || o.dead || o.shieldMax >= o.maxHp * 0.4) continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) > ELITE_WARD_R) continue;
            o.shieldMax = Math.min(o.maxHp * 0.4, o.shieldMax + gain);
            o.shield = Math.min(o.shieldMax, o.shield + gain);
            given++;
            if (given >= 4) break;
          }
          if (given > 0) spawnParticles(e.x, e.y, '#7fd8ff', 8);
        }
      }
    } else if (e.type === 'boss') {
      updateBoss(e, target, dt);
    } else {
      moveEnemy(e, target, dt);
      e.atkCd -= dt;
      if (target !== squad && !e.devPeaceful) {
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d < e.r + S.soldierR + CONTACT_PAD && e.atkCd <= 0) {
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
    const anchor = scytheAnchor();
    for (let i = 0; i < cnt; i++) {
      const a = (s.orbitAngle || 0) + (Math.PI * 2 / cnt) * i;
      const bx = anchor.x + Math.cos(a) * rad;
      const by = anchor.y + Math.sin(a) * rad;
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
  // 受伤免疫：冷却好了才触发，触发后同时进入免疫与冷却（冷却从触发时刻起算）
  if (stats.invulnDuration > 0 && squad.invulnCdT <= 0) {
    squad.invulnT = stats.invulnDuration;
    squad.invulnCdT = INVULN_CD;
  }
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
// 小怪血量倍率（V1.11 加强）：分三段成长
//   前期（未击败首个 Boss）：随波次温和成长，不再是一路平推的固定血量
//   中期（已击败首个 Boss）：波次线性项 + 每个 Boss 的固定抬升
//   后期：叠加二次项 0.008·m²，追上玩家乘区（多张卡相乘）的成长速度
function enemyHpScale() {
  const w = Math.max(0, wave - 1);
  let s = 1 + 0.06 * w;
  if (bossKills >= 1) {
    const m = Math.max(0, wave - 10);
    s += 0.10 * m + 0.55 * (bossKills - 1) + 0.008 * m * m;
  }
  return s;
}
// 小怪伤害倍率（V1.11 加强）：与 difficulty 相乘，随波次温和成长（避免后期血量涨了伤害没涨）
function enemyDmgScale() {
  let s = 1 + 0.015 * Math.max(0, wave - 1);
  if (bossKills >= 1) s += 0.025 * Math.max(0, wave - 10) + 0.10 * (bossKills - 1);
  return s;
}
// 首领血量倍率（V1.11 大幅加强）：第 1 个首领为基准，之后每个 +100%（后期血量是旧版的数倍）
function bossHpScale() { return 1 + bossKills; }
// 单只小怪的最终基础血量（精英 / 树怪走折半曲线，见 HEAVY_HP_CURVE）
function scaledEnemyHp(t) {
  const s = enemyHpScale();
  const heavy = HEAVY_HP_CURVE[t];
  return ENEMY_TYPES[t].hp * (heavy ? 1 + (s - 1) * heavy : s);
}

function collectXp(v) {
  xp += v * xpScale();
  if (xp >= xpToNext) {
    xp -= xpToNext;
    level++;
    xpToNext = Math.floor(xpToNext * 1.32 + 6);
    openUpgrade();
  }
}

// 波次推进（V1.18 改）：**固定时长**驱动，不再等「本波刷完 + 场上清空」。
//   · 每波 `WAVE_TIME` 秒，到点即 wave++ 并重算出怪节奏，**不看场上还剩多少**；
//   · 出怪走纯速率：波次越深间隔越短（`spawnInterval()`），刷到同屏上限 `MAX_ALIVE` 就先停手。
//     旧版「清空才进下一波」会把节奏完全交给玩家的清怪速度（清得快越推越快、清不干净就永远卡住），
//     现在节奏由时间决定，玩家强度体现在「能不能压住不断累积的怪」；
//   · **首领存活 / 场地封锁期间波次计时暂停**：否则上一只首领还没死就会刷出下一只，
//     两个竞技场还会互相覆盖。
const WAVE_TIME = 20;      // 每波时长（秒）
const MAX_ALIVE = 180;     // 同屏敌人上限：到顶就先停刷，等玩家清掉一批再继续（防止后期堆积到卡顿）

// 出怪间隔：随波次线性收紧（`4.8 / pace`），`spawnScale()`（Boss 数）再乘一档加速（封顶 2 倍）；
// 下限 0.10s。标定后每波出怪量约为：波 1 ≈ 4 只、波 10 ≈ 17、波 20 ≈ 55、波 30 ≈ 93、波 50 ≈ 151。
// 基数 4.8 是按「12 局自动走位的存活测试」扫出来的：与旧版清场制（平均存活 127s / 等级 6.7 /
// 同屏峰值 13）基本持平（125s / 6.7 / 12），既去掉了「等清场」的死节奏，难度又没有额外飙升。
function spawnInterval() {
  const pace = (1 + 0.35 * (wave - 1)) * Math.min(2.0, spawnScale());
  return Math.max(0.10, 4.8 / pace);
}

function updateSpawning(dt) {
  const bossAlive = !!bossArena || enemies.some(e => e.type === 'boss');

  if (!bossAlive && !devFreezeWave) {          // 调试：冻结波次计时（勾选后不再自动推进波次）
    waveT += dt;
    if (waveT >= WAVE_TIME) {
      waveT -= WAVE_TIME;
      wave++;
      if (wave % 10 === 0) spawnEnemy('boss');                 // 第 10 / 20 / 30… 波：开局就上首领
      else if (wave % 5 === 0) spawnEliteGroup(eliteGroupSize());  // 第 5 / 15 / 25… 波：开局上一群精英
    }
  }

  spawnTimer -= dt;
  if (spawnTimer > 0 || enemies.length >= MAX_ALIVE) return;
  spawnEnemy();
  spawnTimer = spawnInterval();
}

function spawnEnemy(type, px, py, opts = {}) {
  const m = 50;
  let x, y;
  if (px !== undefined) {
    x = px; y = py;
  } else {
    const side = Math.random();
    if (side < 0.5) { x = camera.x + Math.random() * viewW(); y = camera.y - m; }
    else if (side < 0.75) { x = camera.x - m; y = camera.y + Math.random() * viewH(); }
    else if (side < 0.9) { x = camera.x + viewW() + m; y = camera.y + Math.random() * viewH(); }
    else { x = camera.x + Math.random() * viewW(); y = camera.y + viewH() + m; }
  }

  x = Math.max(10, Math.min(WORLD.w - 10, x));
  y = Math.max(10, Math.min(WORLD.h - 10, y));

  const t = type || pickType();
  const def = ENEMY_TYPES[t];

  // Boss 种类：每 10 波轮换（冲锋 → 弹幕 → 召唤 → 分裂）；调试面板可直接指定 opts.bossKind
  const kind = t === 'boss'
    ? (opts.bossKind || BOSS_ORDER[Math.max(0, Math.floor(wave / 10 - 1)) % BOSS_ORDER.length])
    : null;
  const bossDef = kind ? BOSS_KINDS[kind] : null;

  // 血量：小怪走 scaledEnemyHp（前 / 中 / 后三段曲线，精英与树怪折半），首领走「种类血量 × bossHpScale」
  // hpMul 供分裂出的子精英使用（同一套曲线，只按比例缩水）
  const hp = (bossDef ? bossDef.hp * bossHpScale() : scaledEnemyHp(t)) * (opts.hpMul || 1);
  // 护盾：护盾兵 50%；精英的护盾改为「护盾词缀」提供（见 AFFIX_DEFS）
  const shield = t === 'shielder' ? Math.round(hp * 0.5) : 0;

  const e = {
    x, y, hp, maxHp: hp,
    speed: (bossDef ? bossDef.speed : def.speed) * Math.min(1.6, 1 + (difficulty - 1) * 0.5),
    r: def.r,
    // 接触伤害：首领只吃 difficulty（避免与竞技场内的持续贴身叠加过头），小怪再乘波次成长
    dmg: t === 'boss' ? def.dmg * difficulty : def.dmg * difficulty * enemyDmgScale(),
    type: t, kind,
    atkCd: 0, shootCd: def.shootInterval || 0, burstCd: t === 'boss' ? 2.5 : 0,
    burnDps: 0, burnT: 0, burnExtra: [], scytheT: 0, kbx: 0, kby: 0, kbT: 0,
    bleedDps: 0, bleedT: 0, execT: -1e9, markT: 0,
    frostT: 0, frostMul: 1, freezeT: 0,
    resistBurnT: 0, resistFrostT: 0, resistFreezeT: 0,
    shield, shieldMax: shield, shieldRegenT: 0,
    healCd: def.healInterval || 0, giftCd: def.giftInterval || 0, sumCd: t === 'boss' ? 4 : 0,
    phase2: false, spiral: 0, spiralT: 0, spiralFireT: 0, spiralDual: false, skillIdx: 0,
    skillCd: t === 'boss' ? (kind === 'charge' ? BOSS_SKILL.firstDelay : 2) : 0,   // 非冲锋者给 2s 起手缓冲（分裂者靠它）
    skillState: 'idle', skillT: 0, chargeWind: BOSS_SKILL.chargeTime, skillDirX: 0, skillDirY: 0, skillHit: null,
    // 首领「灵活性」层（V1.25）：轨道走位 / 短距位移 / 施法读条
    orbitDir: Math.random() < 0.5 ? 1 : -1, orbitFlipT: 1.5 + Math.random() * 2, moveAng: null,
    dashT: 0, dashSpd: 0, dashDamage: 0, dashKind: '', chargeCombo: 0,
    castT: 0, castType: '', castX: 0, castY: 0,   // blinkCd: 2,  ← V1.25.1 停用（召唤者闪现的冷却）
    splitAt: 0.8, splitLeft: 2,
    affixes: [], affixSplit: false, affixVolatile: false, affixBerserk: false, affixWard: false,
    berserkOn: false, wardCd: 0,
    // 调试标记（V1.26 局内调试面板）：站桩 = 不移动 / 不吃击退，停手 = 不造成任何伤害
    devStatic: !!opts.devStatic, devPeaceful: !!opts.devPeaceful,
  };
  enemies.push(e);

  // 精英：生成时一次性挂上词缀（护盾 / 迅捷 直接改面板，其余在行为与死亡逻辑里生效）
  if (t === 'elite') {
    for (const id of (opts.affixes || rollAffixes())) {
      const a = AFFIX_DEFS[id];
      if (!a) continue;
      e.affixes.push(id);
      a.apply(e);
    }
  }

  if (t === 'boss') {
    openBossArena(e);
    showBanner(`BOSS · ${BOSS_KINDS[kind].name} · 场地封锁`, 2.4);
  }
}

// 精英成群刷新：一波精英从一个屏幕外基准点成簇出现（低压成群定位，见 ENEMY_TYPES.elite）
// 体量：第 5 波 2 只起，之后每 10 波 +1，封顶 5 只。
function eliteGroupSize() { return Math.min(5, 2 + Math.floor((wave - 5) / 10)); }
function spawnEliteGroup(n) {
  const m = 60;
  const side = Math.random();
  let bx, by;
  if (side < 0.5) { bx = camera.x + Math.random() * viewW(); by = camera.y - m; }
  else if (side < 0.75) { bx = camera.x - m; by = camera.y + Math.random() * viewH(); }
  else if (side < 0.9) { bx = camera.x + viewW() + m; by = camera.y + Math.random() * viewH(); }
  else { bx = camera.x + Math.random() * viewW(); by = camera.y + viewH() + m; }
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 / n) * i;
    spawnEnemy('elite', bx + Math.cos(a) * 70, by + Math.sin(a) * 70);
  }
  showBanner(`精英来袭 ×${n}`, 1.6);
}

// 分裂词缀：死亡时裂成 2 只「无词缀的残血小精英」（不再带分裂，避免无限递归）
function spawnSplitElites(e) {
  for (let i = 0; i < 2; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 40 + Math.random() * 30;
    spawnEnemy('elite', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, { affixes: [], hpMul: ELITE_SPLIT_HP });
  }
  spawnParticles(e.x, e.y, '#c07bff', 16);
}

// 殉爆词缀：死亡时原地爆炸（与自爆怪同款结算，一次只结算一次伤害）
function affixExplode(e) {
  shake = Math.min(10, shake + 3);
  sfxExplode();
  spawnBlast(e.x, e.y, ELITE_BOOM_R * 0.8);
  spawnParticles(e.x, e.y, '#ff9d3b', 18);
  const hit = soldiers.find(s => Math.hypot(s.x - e.x, s.y - e.y) < ELITE_BOOM_R + S.soldierR);
  if (hit) damageSoldier(hit, ELITE_BOOM_DMG * difficulty);
}

// 首领出场：以玩家当前位置为场心划出竞技场，并把首领从屏幕外拉到场内（首领本身不受场地限制）
function openBossArena(boss) {
  const r = BOSS_ARENA_R;
  bossArena = { x: squad.x, y: squad.y, r };
  // 出场位置按首领相对玩家的方向放到面前，距离取「0.62r」与 220 中的较小值（半径变大后仍要落在视野内）
  const a = Math.atan2(boss.y - squad.y, boss.x - squad.x);
  const dist = Math.min(r * 0.62, 220);
  const bx = squad.x + Math.cos(a) * dist;
  const by = squad.y + Math.sin(a) * dist;
  boss.x = Math.max(boss.r, Math.min(WORLD.w - boss.r, bx));
  boss.y = Math.max(boss.r, Math.min(WORLD.h - boss.r, by));
  spawnParticles(boss.x, boss.y, '#d64c3a', 18);
  shake = Math.min(10, shake + 6);
}

// 把实体限制在首领竞技场内（pad 为该实体的半径，贴边时留出余量）
// 只在 `updateSquad` 里对玩家调用：首领与小怪不调用，可以自由进出场地
function clampToBossArena(e, pad) {
  if (!bossArena) return;
  const dx = e.x - bossArena.x, dy = e.y - bossArena.y;
  const d = Math.hypot(dx, dy);
  const lim = Math.max(0, bossArena.r - (pad || 0));
  if (d > lim) {
    e.x = bossArena.x + dx / d * lim;
    e.y = bossArena.y + dy / d * lim;
  }
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
  btn.textContent = `重掷（剩余 ${rerollLeft} 次 · R）`;
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

function upgradeCardHtml(u, hotkey) {
  const tag = u.evo ? '<span class="evo-tag">终极进化</span>' : '';
  const text = u.name + ' ' + (u.route || '');
  const icon = u.evo ? '✦' : /火|焰|灼/.test(text) ? '♨' : /雷|电/.test(text) ? 'ϟ' : /冰|霜|冻|凛/.test(text) ? '❄' : /爆/.test(text) ? '✹' : /剑|镰/.test(text) ? '⚔' : /生命|医疗|回复/.test(text) ? '✚' : /枪|弹/.test(text) ? '⌁' : /宠|龙/.test(text) ? '♧' : '◇';
  // 数字角标：提示「按这个数字键可以直接选这张卡」
  const key = hotkey ? '<i class="card-key">' + hotkey + '</i>' : '';
  return '<span class="card-icon" aria-hidden="true">' + icon + key + '</span><span class="card-copy">' + tag + '<span class="name">' + u.name + '</span><span class="desc">' + u.desc + '</span></span><span class="card-arrow" aria-hidden="true">›</span>';
}

function renderUpgradeCards() {
  document.querySelector('#upgrade .panel').scrollTop = 0;
  const box = document.getElementById('upgrade-cards');
  box.innerHTML = '';
  upgrades.forEach((u, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'card' + (u.evo ? ' evo' : '');
    el.innerHTML = upgradeCardHtml(u, i + 1);
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

// Boss 奖励：候选全部来自首领专属奖励池（不混入普通升级卡），且只选 1 项
function openBossReward() {
  const cap = choiceCount;                                         // 面板张数跟随升级选项数（3~6）
  const pool = BOSS_BUFFS.filter(b => {
    if (b.repeat) return false;                                     // 可重复卡不参与首轮筛选，只用来补位
    if (b.req && !b.req()) return false;                            // 前置不满足（如没有元素伤害来源）则不出现
    if (b.once && appliedIds.has(b.id)) return false;               // 一次性奖励：拿过就不再出现
    if (b.exclusive && hasExclusivePicked(b.exclusive)) return false; // 二选一奖励：同组已选过则不再出现
    return true;
  });
  for (let i = pool.length - 1; i > 0; i--) {                       // 打乱一次性候选
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  bossRewardOptions = pool.slice(0, cap);
  // 一次性奖励会被拿空，此时候选少于面板张数；用可重复的补位卡补满，避免留出空格子。
  // （补位卡不够时允许在同一面板内重复出现，保证一定填满。）
  if (bossRewardOptions.length < cap) {
    const fillers = BOSS_BUFFS.filter(b => b.repeat);
    for (let i = fillers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fillers[i], fillers[j]] = [fillers[j], fillers[i]];
    }
    for (let i = 0; bossRewardOptions.length < cap; i++) {
      bossRewardOptions.push(fillers[i % fillers.length]);
    }
  }
  if (!bossRewardOptions.length) {
    showBanner('首领奖励已全部获得', 2.2);
    state = 'playing';
    return;
  }
  renderBossRewardCards();
  document.getElementById('upgrade-title').textContent = 'BOSS 奖励：选择 1 项';
  document.getElementById('btn-reroll').classList.add('hidden');
  document.getElementById('upgrade').classList.remove('hidden');
  state = 'bossreward';
}

function renderBossRewardCards() {
  document.querySelector('#upgrade .panel').scrollTop = 0;
  const box = document.getElementById('upgrade-cards');
  box.innerHTML = '';
  bossRewardOptions.forEach((u, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'card' + (u.evo ? ' evo' : '');
    el.innerHTML = upgradeCardHtml(u, i + 1);
    el.onclick = () => pickBossReward(u);
    box.appendChild(el);
  });
}

function pickBossReward(u) {
  u.apply();
  appliedIds.add(u.id);
  if (u.route) routePicks[u.route] = (routePicks[u.route] || 0) + 1;
  bossRewardOptions = [];
  document.getElementById('upgrade').classList.add('hidden');
  state = 'playing';
}

// ==================== 渲染 ====================
// 地形只在新地图生成时烘焙一次；逐帧仅拷贝当前视口。
function buildTerrain() {
  terrainCache = document.createElement('canvas');
  terrainCache.width = WORLD.w; terrainCache.height = WORLD.h;
  const c = terrainCache.getContext('2d');
  c.fillStyle = '#203a36'; c.fillRect(0, 0, WORLD.w, WORLD.h);
  // 确定性纹理不消耗游戏随机数。
  for (let i = 0; i < 950; i++) {
    const x = (i * 173.31 + 31) % WORLD.w, y = (i * 397.73) % WORLD.h;
    c.fillStyle = i % 3 ? '#9ca87b07' : '#0b282a19';
    c.beginPath(); c.ellipse(x, y, 14 + i % 41, 6 + i % 19, i, 0, Math.PI * 2); c.fill();
  }
  // 遗迹石板和远离中央活动区的苔藓。
  for (let y = 60; y < WORLD.h; y += 120) {
    for (let x = 55; x < WORLD.w; x += 112) {
      const k = Math.floor(x / 112 + y / 120);
      if (k % 4 === 0) continue;
      const w = 65 + k % 17;
      c.fillStyle = '#91a88d06'; c.strokeStyle = '#8fa89214'; c.lineWidth = 1;
      c.beginPath(); c.roundRect(x, y, w, 64, 5); c.fill(); c.stroke();
      c.strokeStyle = '#071e252e'; c.beginPath(); c.moveTo(x + 12, y); c.lineTo(x + 21, y + 13); c.lineTo(x + 16, y + 22); c.stroke();
    }
  }
  decorations.forEach(d => {
    if (d.type === 'grass') {
      c.strokeStyle = '#658e6380'; c.lineWidth = 1.5;
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(d.x, d.y); c.quadraticCurveTo(d.x + i * 5, d.y - 10, d.x + i * 6, d.y - 12 + Math.abs(i) * 2); c.stroke(); }
    } else if (d.type === 'rock') {
      c.fillStyle = '#0b25274d'; c.beginPath(); c.ellipse(d.x + 2, d.y + 3, 9, 5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#587166'; c.beginPath(); c.moveTo(d.x-7,d.y+2); c.lineTo(d.x-4,d.y-5); c.lineTo(d.x+4,d.y-6); c.lineTo(d.x+8,d.y+1); c.closePath(); c.fill();
      c.fillStyle = '#93a082'; c.fillRect(d.x-3,d.y-5,5,2);
    } else {
      c.fillStyle = '#91b990'; c.beginPath(); c.arc(d.x,d.y,2,0,Math.PI*2); c.fill();
      c.fillStyle = '#e4d393'; c.fillRect(d.x-1,d.y-1,2,2);
    }
  });
  c.strokeStyle = '#8fbfa524'; c.lineWidth = 1;
  dividers.forEach(y => {
    c.beginPath(); c.moveTo(20,y); c.lineTo(WORLD.w-20,y); c.stroke();
    for (let x = 40; x < WORLD.w; x += 80) {
      c.fillStyle = '#a9c69c38'; c.save(); c.translate(x,y); c.rotate(Math.PI/4); c.fillRect(-2,-2,4,4); c.restore();
    }
  });
  c.strokeStyle = '#a5b98a66'; c.lineWidth = 8; c.strokeRect(4,4,WORLD.w-8,WORLD.h-8);
}
function drawBackground() {
  if (!terrainCache) buildTerrain();
  const x = Math.max(0, camera.x - 12), y = Math.max(0, camera.y - 12);
  const w = Math.min(viewW() + 24, WORLD.w - x), h = Math.min(viewH() + 24, WORLD.h - y);
  ctx.drawImage(terrainCache, x, y, w, h, x, y, w, h);
  if (!richEffects()) return;
  // 低对比萤火只作环境点缀，不覆盖敌人的危险预警。
  for (let i = 0; i < 18; i++) {
    const t = reducedMotion.matches ? 0 : gameTime;
    const px = (i * 137.7) % WORLD.w + Math.sin(t * .4 + i) * 14;
    const py = (i * 293.3) % WORLD.h + Math.cos(t * .3 + i) * 12;
    ctx.fillStyle = '#d2e8a359'; ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBar(x, y, w, h, ratio, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, ratio)), h);
}

// 首领竞技场：地面红环 + 呼吸脉冲，明确「能走到哪里」
function drawBossArena() {
  if (!bossArena) return;
  const { x, y, r } = bossArena;
  const pulse = reducedMotion.matches ? 0.5 : 0.5 + 0.5 * Math.sin(gameTime * 2.2);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(208, 70, 58, 0.07)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = `rgba(214, 76, 58, ${0.45 + 0.3 * pulse})`;
  ctx.shadowColor = 'rgba(214, 76, 58, 0.9)';
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 12]);
  ctx.lineDashOffset = -gameTime * 24;
  ctx.strokeStyle = `rgba(255, 176, 120, ${0.3 + 0.3 * pulse})`;
  ctx.beginPath(); ctx.arc(x, y, r - 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawDrops() {
  ctx.save();
  drops.forEach(d => {
    if (d.x < camera.x - 20 || d.x > camera.x + viewW() + 20 || d.y < camera.y - 20 || d.y > camera.y + viewH() + 20) return;
    const r = d.r + 1;
    if (richEffects()) { ctx.fillStyle = '#69d8cd18'; ctx.beginPath(); ctx.arc(d.x,d.y,r*2.5,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle = '#7dddd0'; ctx.beginPath(); ctx.moveTo(d.x,d.y-r); ctx.lineTo(d.x+r*.75,d.y); ctx.lineTo(d.x,d.y+r); ctx.lineTo(d.x-r*.75,d.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d9f8d6'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(d.x,d.y-r+1); ctx.lineTo(d.x-r*.5,d.y); ctx.stroke();
  });
  ctx.restore();
}
// 木桶 / 箱子 / 石柱

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

// 割裂（镰刀的出血）：暗红血雾 + 滴落的血珠 + 地面血渍
function drawBleed(e) {
  const t = gameTime;
  const seed = (e.x * 0.13 + e.y * 0.07) % 6.283;
  const fade = Math.min(1, e.bleedT / 0.6);
  const r = e.r;

  ctx.save();
  const g = ctx.createRadialGradient(e.x, e.y, r * 0.2, e.x, e.y, r * 1.35);
  g.addColorStop(0, `rgba(220,40,60,${0.20 * fade})`);
  g.addColorStop(1, 'rgba(160,20,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.35, 0, Math.PI * 2); ctx.fill();

  // 地面血渍：一直铺在脚下，随时间脉动
  ctx.fillStyle = `rgba(120,16,28,${(0.24 + 0.08 * Math.sin(t * 4 + seed)) * fade})`;
  ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.85, r * 0.85, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();

  // 滴落的血珠：循环下落，接近地面时淡出
  for (let i = 0; i < 3; i++) {
    const lp = (t * 1.1 + i * 0.34 + seed) % 1;
    const px = e.x + Math.sin(seed + i * 2.1) * r * 0.7;
    const py = e.y + r * 0.2 + lp * r * 1.1;
    ctx.fillStyle = `rgba(235,60,80,${(1 - lp) * 0.9 * fade})`;
    ctx.beginPath(); ctx.arc(px, py, 2.0 * (1 - lp * 0.5) + 0.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// 剑印：敌人身上一圈青色剑环 + 头顶悬浮的剑形印记（旋转 + 呼吸）
function drawSwordMark(e) {
  const t = gameTime;
  const fade = Math.min(1, e.markT / 0.5);
  const s = 1 + 0.08 * Math.sin(t * 5);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 身上的剑环：让「被标记」在怪群里一眼可辨
  ctx.strokeStyle = `rgba(150,225,255,${(0.34 + 0.14 * Math.sin(t * 4)) * fade})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.75, e.r * 1.25, e.r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
  // 头顶印记
  ctx.translate(e.x, e.y - e.r - 16 + Math.sin(t * 3) * 2);
  ctx.rotate(Math.sin(t * 1.6) * 0.5);
  ctx.scale(s, s);
  ctx.fillStyle = `rgba(190,240,255,${0.9 * fade})`;
  ctx.beginPath();                                   // 剑身（细长菱形）
  ctx.moveTo(0, -9); ctx.lineTo(2.4, -2); ctx.lineTo(0, 7); ctx.lineTo(-2.4, -2);
  ctx.closePath(); ctx.fill();
  ctx.fillRect(-5, -1, 10, 1.8);                     // 护手
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
  soldiers.forEach((s, i) => {
    const e = nearestEnemy(s.x, s.y, Infinity);
    const ang = e ? Math.atan2(e.y - s.y, e.x - s.x) : -Math.PI / 2;

    drawCharacter(ctx, s.x, s.y, r, ang, meta.character, { time: gameTime, phase: i * .73 });

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

// 飞剑贯穿斩痕：只保留短促剑光，禁止留下圆形光团。
function spawnSwordSlash(x, y, ang) {
  swordSlashes.push({ x, y, ang, t: 0.2, life: 0.2, expiresAt: performance.now() + 200 });
  if (swordSlashes.length > 60) swordSlashes.shift();
}
function updateSwordSlashes(now = performance.now()) {
  for (const s of swordSlashes) s.t = Math.max(0, (s.expiresAt - now) / 1000);
  swordSlashes = swordSlashes.filter(s => s.t > 0);
}
function drawSwordSlashes() {
  // 后台页面可能暂停 requestAnimationFrame，恢复绘制时也按实时时钟检查过期。
  updateSwordSlashes();
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
    const anchor = scytheAnchor();
    for (let i = 0; i < cnt; i++) {
      const a = (s.orbitAngle || 0) + (Math.PI * 2 / cnt) * i;
      const bx = anchor.x + Math.cos(a) * rad;
      const by = anchor.y + Math.sin(a) * rad;
      ctx.save();
      ctx.strokeStyle = s.evolved ? '#efb4d655' : '#a0dac455'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(anchor.x,anchor.y,rad,a-.7,a); ctx.stroke();
      ctx.strokeStyle = '#274b4e'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(bx-Math.cos(a)*12,by-Math.sin(a)*12); ctx.lineTo(bx+Math.cos(a)*10,by+Math.sin(a)*10); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = s.evolved ? '#f5c6e6' : '#c6ecdb';
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

// Boss 地面指示 + 读条（V1.25：冲刺蓄力 / 召唤阵 / 位移拖影）
function drawBossTelegraph() {
  for (const e of enemies) {
    if (e.type !== 'boss') continue;

    // 召唤阵：先画预警圈，读条结束才冒怪（位置提前告知，可以提前走开或准备清场）
    if (e.castT > 0) {
      const prog = Math.min(1, Math.max(0, 1 - e.castT / BOSS_SUMMON.wind));
      const hot = prog > 0.72;
      ctx.save();
      ctx.fillStyle = `rgba(77,208,122,${0.10 + prog * 0.22})`;
      ctx.beginPath(); ctx.arc(e.castX, e.castY, BOSS_SUMMON.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hot ? 'rgba(160,255,190,0.95)' : 'rgba(77,208,122,0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(e.castX, e.castY, BOSS_SUMMON.r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(e.castX, e.castY, BOSS_SUMMON.r * prog, 0, Math.PI * 2); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.fillStyle = hot ? '#c8ffd8' : '#8fe8a8';
      ctx.strokeText('召唤阵', e.castX, e.castY - BOSS_SUMMON.r - 6);
      ctx.fillText('召唤阵', e.castX, e.castY - BOSS_SUMMON.r - 6);
      ctx.restore();
    }

    if (e.skillState === 'charge') {
      const wind = e.chargeWind || BOSS_SKILL.chargeTime;         // 连冲的后续段前摇更短
      const prog = Math.min(1, Math.max(0, 1 - e.skillT / wind));
      // 指示带长度 = 这次冲刺真实能走的距离（撞边界 / 场地限制会缩短），箭头尖端就是落点
      const len = bossDashReach(e, e.skillDirX, e.skillDirY);
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
      const txt = hot ? '即将冲刺！' : (e.chargeCombo > 0 ? `连冲 ${e.chargeCombo + 1}/3` : '冲刺蓄力');
      ctx.strokeText(txt, e.x, by - 5);
      ctx.fillText(txt, e.x, by - 5);
      ctx.restore();
    } else if (e.dashT > 0) {
      // 位移中：拖影 + 冲击环（冲锋用暖橙，其它位移用淡金，便于区分是不是伤害技）
      const hotDash = e.dashKind === 'charge';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 4; i++) {
        const d = i * e.r * 0.75;
        ctx.fillStyle = hotDash
          ? `rgba(255,${170 - i * 25},60,${0.26 - i * 0.05})`
          : `rgba(255,215,160,${0.22 - i * 0.045})`;
        ctx.beginPath();
        ctx.arc(e.x - e.skillDirX * d, e.y - e.skillDirY * d, Math.max(2, e.r * (1 - i * 0.14)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = hotDash ? 'rgba(255,180,90,0.9)' : 'rgba(255,225,175,0.7)';
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

// 敌人模型：保持圆润、粗描边和高对比眼部，但用轮廓与道具区分职责。
// 新增敌人优先复用这些几何语言，不使用写实贴图，保证 Canvas 小尺寸仍清晰。
function drawEnemyModelLegacy(e, color) {
  const r = e.r;
  const t = nearestSoldier(e.x, e.y);
  const ang = t ? Math.atan2(t.y - e.y, t.x - e.x) : 0;
  const grad = ctx.createLinearGradient(0, -r, 0, r);
  grad.addColorStop(0, color); grad.addColorStop(1, '#263942');
  const fill = (style, path) => { ctx.fillStyle = style; ctx.beginPath(); path(); ctx.closePath(); ctx.fill(); };
  const stroke = () => { ctx.strokeStyle = '#102b35'; ctx.lineWidth = Math.max(1.4, r * .1); ctx.stroke(); };
  const ellipse = (x, y, rx, ry, style) => { ctx.fillStyle = style; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
  const eye = (x, y, scale = 1) => {
    ellipse(x, y, r * .18 * scale, r * .22 * scale, '#fff8e9');
    ellipse(x + Math.cos(ang) * r * .05, y + Math.sin(ang) * r * .05, r * .075 * scale, r * .105 * scale, '#182532');
  };
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.max(-.25, Math.min(.25, ang)));
  ellipse(2, r * .82, r * 1.02, r * .3, '#06191c55');
  if (e.type === 'bomber') {
    fill(grad, () => { ctx.arc(0, 1, r, 0, Math.PI * 2); }); stroke();
    ctx.strokeStyle = '#e4b15d'; ctx.lineWidth = Math.max(1.5, r * .12); ctx.beginPath(); ctx.moveTo(0, -r + 2); ctx.quadraticCurveTo(r * .18, -r * 1.45, r * .5, -r * 1.32); ctx.stroke();
    ellipse(r * .56, -r * 1.3, r * .12, r * .12, '#ffdf6e');
    ellipse(-r * .32, -r * .1, r * .13, r * .12, '#ffdb83'); ellipse(r * .32, -r * .1, r * .13, r * .12, '#ffdb83');
  } else if (e.type === 'fast') {
    fill(grad, () => { ctx.ellipse(0, 2, r * .72, r * 1.05, 0, 0, Math.PI * 2); }); stroke();
    fill(color, () => { ctx.moveTo(-r * .62, -r * .45); ctx.lineTo(-r * .35, -r * 1.45); ctx.lineTo(-r * .02, -r * .7); ctx.lineTo(r * .15, -r * .7); ctx.lineTo(r * .48, -r * 1.35); ctx.lineTo(r * .68, -.35 * r); }); stroke();
    eye(-r * .22, -.25 * r, .8); eye(r * .22, -.25 * r, .8);
    ctx.strokeStyle = '#f6cd79'; ctx.lineWidth = Math.max(1, r * .12); ctx.beginPath(); ctx.moveTo(-r * .4, r * .55); ctx.lineTo(-r * .85, r * .85); ctx.moveTo(r * .35, r * .55); ctx.lineTo(r * .8, r * .35); ctx.stroke();
  } else if (e.type === 'ranged') {
    fill(grad, () => { ctx.moveTo(-r * .9, r * .72); ctx.quadraticCurveTo(-r * .62, -r * .35, 0, -r * 1.05); ctx.quadraticCurveTo(r * .62, -r * .35, r * .9, r * .72); }); stroke();
    ctx.fillStyle = '#f4c6e9'; ctx.beginPath(); ctx.arc(0, -r * .7, r * .28, 0, Math.PI * 2); ctx.fill();
    eye(-r * .22, -.58 * r, .7); eye(r * .22, -.58 * r, .7);
    ctx.strokeStyle = '#f1c8ff'; ctx.lineWidth = Math.max(1.2, r * .1); ctx.beginPath(); ctx.moveTo(r * .72, r * .55); ctx.lineTo(r * 1.35, -r * .95); ctx.stroke();
    ellipse(r * 1.35, -r * .98, r * .2, r * .2, '#e4a9ff');
  } else if (e.type === 'hunter') {
    fill(grad, () => { ctx.ellipse(0, 2, r * .95, r * .78, 0, 0, Math.PI * 2); }); stroke();
    fill(color, () => { ctx.moveTo(-r * .7, -.25 * r); ctx.lineTo(-r * .95, -r * 1.35); ctx.lineTo(-r * .25, -.72 * r); ctx.lineTo(r * .35, -.72 * r); ctx.lineTo(r * .95, -r * 1.2); ctx.lineTo(r * .72, -.12 * r); }); stroke();
    eye(-r * .3, -.15 * r, .75); eye(r * .3, -.15 * r, .75);
    ctx.strokeStyle = '#f2b1bd'; ctx.lineWidth = Math.max(1.2, r * .11); ctx.beginPath(); ctx.arc(r * .48, .1 * r, r * .45, -.9, .9); ctx.stroke();
  } else if (e.type === 'healer') {
    fill(grad, () => { ctx.moveTo(-r * .9, r * .7); ctx.quadraticCurveTo(-r * .65, -r * .2, 0, -r * .9); ctx.quadraticCurveTo(r * .65, -.2 * r, r * .9, r * .7); }); stroke();
    ellipse(0, -r * .65, r * .35, r * .25, '#d7f7d0'); eye(-r * .22, -.58 * r, .65); eye(r * .22, -.58 * r, .65);
    ctx.strokeStyle = '#f1ffe6'; ctx.lineWidth = Math.max(1.5, r * .15); ctx.beginPath(); ctx.moveTo(0, -.65 * r); ctx.lineTo(0, -.18 * r); ctx.moveTo(-.24 * r, -.42 * r); ctx.lineTo(.24 * r, -.42 * r); ctx.stroke();
  } else if (e.type === 'shielder') {
    fill(grad, () => { ctx.roundRect(-r * .82, -r * .76, r * 1.64, r * 1.65, r * .28); }); stroke();
    eye(-r * .22, -.25 * r, .7); eye(r * .22, -.25 * r, .7);
    ctx.fillStyle = '#b9e8fa'; ctx.strokeStyle = '#163a4a'; ctx.lineWidth = Math.max(1.2, r * .1); ctx.beginPath(); ctx.moveTo(r * .62, -.45 * r); ctx.lineTo(r * 1.22, -.15 * r); ctx.lineTo(r * 1.08, r * .7); ctx.lineTo(r * .62, r * .48); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (e.type === 'summoner') {
    fill(grad, () => { ctx.moveTo(-r * .85, r * .75); ctx.lineTo(-r * .58, -.55 * r); ctx.lineTo(0, -r * 1.25); ctx.lineTo(r * .58, -.55 * r); ctx.lineTo(r * .85, r * .75); }); stroke();
    eye(-r * .22, -.25 * r, .65); eye(r * .22, -.25 * r, .65);
    ctx.strokeStyle = '#e6b8ff'; ctx.lineWidth = Math.max(1.2, r * .1); ctx.beginPath(); ctx.arc(0, r * .42, r * .3, 0, Math.PI * 2); ctx.stroke(); ellipse(0, r * .42, r * .12, r * .12, '#efc7ff');
  } else if (e.type === 'elite') {
    fill(grad, () => { ctx.roundRect(-r * .9, -r * .72, r * 1.8, r * 1.42, r * .28); }); stroke();
    ctx.fillStyle = '#d9a6ff'; ctx.beginPath(); ctx.moveTo(-r * .85, -.55 * r); ctx.lineTo(-r * 1.2, -r * 1.05); ctx.lineTo(-r * .35, -.78 * r); ctx.moveTo(r * .85, -.55 * r); ctx.lineTo(r * 1.2, -r * 1.05); ctx.lineTo(r * .35, -.78 * r); ctx.fill();
    eye(-r * .25, -.2 * r, .85); eye(r * .25, -.2 * r, .85);
  } else if (e.type === 'boss') {
    fill(grad, () => { ctx.roundRect(-r * 1.05, -r * .88, r * 2.1, r * 1.72, r * .4); }); stroke();
    ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.moveTo(-r * .74, -r * .7); ctx.lineTo(-r * .45, -r * 1.35); ctx.lineTo(0, -.88 * r); ctx.lineTo(r * .45, -r * 1.35); ctx.lineTo(r * .74, -.7 * r); ctx.closePath(); ctx.fill();
    eye(-r * .3, -.2 * r, 1.15); eye(r * .3, -.2 * r, 1.15);
    ctx.fillStyle = BOSS_KINDS[e.kind]?.color || color; ctx.beginPath(); ctx.arc(0, r * .46, r * .18, 0, Math.PI * 2); ctx.fill();
  } else {
    fill(grad, () => { ctx.ellipse(0, 0, r, r * .92, 0, 0, Math.PI * 2); }); stroke();
    fill(color, () => { ctx.moveTo(-r * .68, -.48 * r); ctx.lineTo(-r * .5, -r * 1.2); ctx.lineTo(-r * .05, -.7 * r); ctx.lineTo(r * .1, -.7 * r); ctx.lineTo(r * .58, -r * 1.18); ctx.lineTo(r * .72, -.42 * r); }); stroke();
    eye(-r * .3, -.18 * r, .8); eye(r * .3, -.18 * r, .8);
  }
  ctx.restore();
}

// 敌人模型：每种敌人先用轮廓表达行为，再用颜色和标记补充状态。
// 统一采用深色描边、柔和渐变和少量高光，确保小尺寸下仍能一眼区分。
function drawEnemyModel(e, enemyColor) {
  const r = e.r;
  const flash = e.hitFlashUntil > gameTime;
  const body = flash ? '#fff0cf' : enemyColor;
  const dark = flash ? '#8f7259' : '#263942';
  const line = '#102a31';
  const grad = ctx.createLinearGradient(0, -r, 0, r);
  grad.addColorStop(0, body); grad.addColorStop(1, dark);
  const poly = (points, fill = grad, stroke = line, width = 1.5) => {
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = width;
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  const ellipse = (x, y, rx, ry, fill = grad, stroke = line, width = 1.5) => {
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = width;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };
  const eye = (x, y, color = '#fff1d3', pupil = '#18272c') => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * .14), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pupil; ctx.beginPath(); ctx.arc(x + r * .035, y, Math.max(.7, r * .065), 0, Math.PI * 2); ctx.fill();
  };
  const face = (look = 0) => {
    eye(-r * .28 + look, -r * .16); eye(r * .28 + look, -r * .16);
    ctx.strokeStyle = '#1b3035'; ctx.lineWidth = Math.max(1, r * .07);
    ctx.beginPath(); ctx.moveTo(-r * .16, r * .16); ctx.quadraticCurveTo(0, r * .28, r * .16, r * .16); ctx.stroke();
  };
  ctx.save(); ctx.translate(e.x, e.y); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (e.type === 'grunt') {
    ellipse(0, 0, r * 1.02, r * .9);
    poly([[-r*.72,-r*.52],[-r*.95,-r*1.18],[-r*.28,-r*.82]], body);
    poly([[r*.72,-r*.52],[r*.95,-r*1.18],[r*.28,-r*.82]], body);
    face();
    ctx.fillStyle = '#e8c98b';
    poly([[-r*.72,r*.2],[-r*.45,r*.58],[-r*.18,r*.18]], '#e8c98b', line, 1);
    poly([[r*.72,r*.2],[r*.45,r*.58],[r*.18,r*.18]], '#e8c98b', line, 1);
  } else if (e.type === 'fast') {
    poly([[-r*1.15,r*.35],[-r*.65,-r*.55],[-r*.05,-r*.78],[r*.7,-r*.45],[r*1.2,r*.1],[r*.5,r*.72],[-r*.55,r*.7]], grad);
    poly([[-r*.45,-r*.55],[-r*.2,-r*1.35],[r*.05,-r*.7]], body, line, 1.2);
    poly([[r*.42,-r*.48],[r*.68,-r*1.18],[r*.78,-r*.35]], body, line, 1.2);
    eye(r*.1, -r*.08, '#fff7e7', '#1e2630');
    ctx.strokeStyle = '#ffe39b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r*1.1,r*.5); ctx.lineTo(-r*1.45,r*.78); ctx.stroke();
  } else if (e.type === 'ranged') {
    ellipse(0, r*.08, r*.95, r*.82);
    poly([[-r*.94,-r*.2],[-r*.38,-r*1.22],[r*.44,-r*1.1],[r*.95,-r*.2],[r*.5,-r*.42],[-r*.45,-r*.42]], body);
    ctx.fillStyle = '#f4cde4'; ctx.beginPath(); ctx.arc(-r*.28,-r*.13,r*.1,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(r*.28,-r*.13,r*.1,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#e8b8df'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-r*1.18,-r*.4); ctx.lineTo(-r*1.18,r*.75); ctx.stroke();
    ctx.beginPath(); ctx.arc(-r*1.18,-r*.5,r*.36,0,Math.PI*2); ctx.stroke();
  } else if (e.type === 'bomber') {
    ellipse(0, 0, r*.92, r*.92);
    ctx.fillStyle = '#c9a06a'; ctx.beginPath(); ctx.arc(-r*.28,-r*.15,r*.12,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(r*.28,-r*.15,r*.12,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0,-r*.9); ctx.quadraticCurveTo(r*.65,-r*1.35,r*.42,-r*1.7); ctx.stroke();
    const blink = .55 + .45 * Math.sin(gameTime * 14); ctx.fillStyle = `rgba(255,70,45,${blink})`; ctx.beginPath(); ctx.arc(r*.42,-r*1.7,Math.max(2,r*.18),0,Math.PI*2); ctx.fill();
  } else if (e.type === 'hunter') {
    ellipse(0, r*.1, r*.86, r*.7);
    poly([[-r*.9,-r*.15],[-r*.2,-r*.75],[r*.88,-r*.2],[r*.2,r*.18],[-r*.8,r*.22]], body);
    ctx.fillStyle = '#1b2730'; ctx.fillRect(-r*.55,-r*.18,r*1.1,r*.2); eye(-r*.26,-r*.08,'#ffcad6','#541e39'); eye(r*.26,-r*.08,'#ffcad6','#541e39');
    ctx.strokeStyle = '#f3a0bf'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(r*.5,r*.15,r*.62,-.9,.9); ctx.stroke();
  } else if (e.type === 'healer') {
    poly([[-r*.78,r*.68],[-r*.58,-r*.55],[0,-r*.95],[r*.58,-r*.55],[r*.78,r*.68]], grad);
    ctx.fillStyle = '#d9f5c8'; ctx.fillRect(-r*.12,-r*.45,r*.24,r*.8); ctx.fillRect(-r*.4,-r*.18,r*.8,r*.24);
    eye(-r*.25,-r*.52,'#efffe8','#285a3a'); eye(r*.25,-r*.52,'#efffe8','#285a3a');
  } else if (e.type === 'shielder') {
    ellipse(0, 0, r*.82, r*.86);
    face();
    ctx.fillStyle = '#bdefff'; ctx.strokeStyle = '#276d8b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-r*.9,r*.05,r*.78,-1.2,1.2); ctx.lineTo(-r*.9,r*.75); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-r*.9,-r*.48); ctx.lineTo(-r*.9,r*.5); ctx.stroke();
  } else if (e.type === 'summoner') {
    poly([[-r*.75,r*.78],[-r*.6,-r*.35],[0,-r*.92],[r*.6,-r*.35],[r*.75,r*.78]], grad);
    face();
    ctx.strokeStyle = '#d9b4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r*.85,r*.78); ctx.lineTo(r*1.1,-r*1.1); ctx.stroke();
    ctx.fillStyle = '#e8c6ff'; ctx.beginPath(); ctx.arc(r*1.1,-r*1.2,r*.2,0,Math.PI*2); ctx.fill();
  } else if (e.type === 'elite') {
    ellipse(0, 0, r*.9, r*.9);
    for (let i=0;i<8;i++) { const a=i*Math.PI/4; poly([[Math.cos(a)*r*.65,Math.sin(a)*r*.65],[Math.cos(a+.18)*(r+9),Math.sin(a+.18)*(r+9)],[Math.cos(a-.18)*(r+9),Math.sin(a-.18)*(r+9)]], '#8e4fd0', '#35214a', 1); }
    face();
  } else if (e.type === 'boss') {
    ellipse(0, 0, r*.98, r*.92);
    const kind = e.kind || 'charge';
    if (kind === 'charge') {
      poly([[-r*.72,-r*.48],[-r*1.05,-r*1.25],[-r*.25,-r*.85]], '#eec386');
      poly([[r*.72,-r*.48],[r*1.05,-r*1.25],[r*.25,-r*.85]], '#eec386');
      face();
    } else if (kind === 'barrage') {
      ctx.strokeStyle = '#e7b9ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0,0,r*.72,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle = '#f4dcff'; ctx.beginPath(); ctx.arc(0,0,r*.22,0,Math.PI*2); ctx.fill(); face();
    } else if (kind === 'summoner') {
      poly([[-r*.8,r*.82],[-r*.65,-r*.4],[0,-r*1.1],[r*.65,-r*.4],[r*.8,r*.82]], grad);
      ctx.strokeStyle = '#bceee5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r*.8,r*.8); ctx.lineTo(r*1.1,-r*1.2); ctx.stroke(); ctx.fillStyle='#d7fff4'; ctx.beginPath(); ctx.arc(r*1.1,-r*1.28,r*.2,0,Math.PI*2); ctx.fill(); face();
    } else {
      poly([[-r*.72,-r*.5],[0,-r*1.35],[r*.72,-r*.5],[r*.45,r*.75],[-r*.45,r*.75]], grad);
      ctx.strokeStyle = '#ffd0a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r*.4,0); ctx.lineTo(r*.4,0); ctx.stroke(); face();
    }
  } else {
    ellipse(0, 0, r, r); face();
  }
  ctx.restore();
}

function drawEnemies() {
  enemies.forEach(e => {
    if (e.dead) return;
    const def = ENEMY_TYPES[e.type];
    if (e.x < camera.x - 110 || e.x > camera.x + viewW() + 110 || e.y < camera.y - 110 || e.y > camera.y + viewH() + 110) return;
    ctx.fillStyle = '#06191c55'; ctx.beginPath(); ctx.ellipse(e.x + 2, e.y + e.r * .8, e.r * 1.1, e.r * .4, 0, 0, Math.PI * 2); ctx.fill();
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
      const enemyColor = e.type === 'boss' ? BOSS_KINDS[e.kind].color : def.color;
      ctx.save();
      if (e.hitFlashUntil > gameTime) {
        ctx.globalAlpha = .92;
        drawEnemyModel(e, '#fff0cf');
      } else {
        drawEnemyModel(e, enemyColor);
      }
      ctx.restore();
    }

    // 点燃：身上着火的动态火焰特效
    if (burnTotalDps(e) > 0) drawBurning(e);

    // 冰刺：霜冻减速 / 冰冻的冰雪特效
    if (e.freezeT > 0) drawIceBlock(e);
    else if (e.frostT > 0) drawFrost(e);

    // 镰刀割裂：出血特效；飞剑剑印：头顶印记
    if (e.bleedT > 0) drawBleed(e);
    if (e.markT > 0) drawSwordMark(e);

    // 护盾环（护盾词缀 / 护盾兵 / 守卫给的盾）
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

    // 守卫词缀：把光环范围画出来，方便判断该先切谁
    if (e.affixWard) {
      ctx.strokeStyle = 'rgba(95,176,208,0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, ELITE_WARD_R, 0, Math.PI * 2); ctx.stroke();
    }

    // 树怪整体更高，血条抬到树冠上方
    const barY = e.type === 'treant' ? e.y - e.r * 2.05 - 6 : e.y - e.r - 6;

    // 精英词缀标识：血条上方一排彩色圆点，颜色对应 AFFIX_DEFS
    if (e.type === 'elite' && e.affixes && e.affixes.length) {
      const gap = 12;
      const sx = e.x - (e.affixes.length - 1) * gap / 2;
      e.affixes.forEach((id, i) => {
        const a = AFFIX_DEFS[id];
        if (!a) return;
        ctx.fillStyle = a.color;
        ctx.beginPath(); ctx.arc(sx + i * gap, barY - 11, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0b1e24'; ctx.lineWidth = 1.2; ctx.stroke();
      });
    }

    // 狂暴词缀触发后：套一层红环（与 Boss 二阶段同款提示）
    if (e.type === 'elite' && e.berserkOn) {
      ctx.strokeStyle = 'rgba(255,107,74,0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 7, 0, Math.PI * 2); ctx.stroke();
    }

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
    ctx.save();
    const speed = Math.hypot(b.vx, b.vy) || 1;
    ctx.strokeStyle = b.color; ctx.lineWidth = b.r * 1.4; ctx.lineCap = 'round'; ctx.globalAlpha = .4;
    ctx.beginPath(); ctx.moveTo(b.x - b.vx / speed * 14, b.y - b.vy / speed * 14); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff3cd';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  });
}

function drawEnemyBullets() {
  ctx.save();
  enemyBullets.forEach(b => {
    ctx.fillStyle = '#ff705d33'; ctx.beginPath(); ctx.arc(b.x,b.y,b.r+4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#e46b62'; ctx.strokeStyle = '#ffc8a0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff1d1'; ctx.beginPath(); ctx.arc(b.x-1,b.y-1,b.r*.35,0,Math.PI*2); ctx.fill();
  });
  ctx.restore();
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
  ctx.save();
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life);
    if (richEffects()) {
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(.7, p.r * .65);
      ctx.beginPath(); ctx.moveTo(p.x - p.vx * .025, p.y - p.vy * .025); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

function hudPanel(x, y, w, h) {
  const theme = activeTheme();
  ctx.fillStyle = theme.panel; ctx.strokeStyle = theme.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x,y,w,h,12); ctx.fill(); ctx.stroke();
}
function drawHUD() {
  ctx.save();
  const theme = activeTheme();
  hudPanel(10, 10, W - 20, 92);
  ctx.textAlign = 'left'; ctx.font = 'bold 16px "Microsoft YaHei", sans-serif'; ctx.fillStyle = theme.accent;
  ctx.fillText('第 ' + String(wave).padStart(2, '0') + ' 波', 24, 34);
  ctx.textAlign = 'center'; ctx.fillStyle = theme.text; ctx.font = 'bold 14px monospace'; ctx.fillText(fmtTime(gameTime), W / 2, 32);
  ctx.textAlign = 'right'; ctx.fillStyle = theme.muted; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText('击杀 ' + kills + '  ·  金币 ' + runCoins, W - 24, 33);
  ctx.textAlign = 'left'; ctx.fillStyle = theme.muted; ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillText('小队 ' + soldiers.length + ' 人', 24, 58);
  ctx.textAlign = 'right'; ctx.fillStyle = theme.text;
  ctx.fillText('生命 ' + Math.ceil(squadHp) + ' / ' + Math.ceil(squadMaxHp), W - 24, 58);
  const barW = (W - 48) * .43;
  drawBar(W - 24 - barW / 2, 65, barW, 4, squadMaxHp ? squadHp / squadMaxHp : 0, squadHp < squadMaxHp * .3 ? '#ed9681' : '#8bdabd');
  ctx.textAlign = 'left'; ctx.fillStyle = theme.muted; ctx.font = '10px monospace'; ctx.fillText('LV.' + String(level).padStart(2,'0'), 24, 88);
  drawBar((W + 65 - 24) / 2, 81, W - 89, 5, xp / xpToNext, '#b5d4a1');
  if (squad.shieldMax > 0) {
    ctx.fillStyle = theme.muted; ctx.font = '10px sans-serif'; ctx.fillText('护盾 ' + Math.ceil(squad.shield) + '/' + squad.shieldMax, 100, 58);
  }
  const boss = enemies.find(e => e.type === 'boss' && !e.dead);
  if (boss) {
    const bw = Math.min(W - 60, 480), bx = (W - bw) / 2;
    hudPanel(bx, 112, bw, 44);
    ctx.textAlign = 'center'; ctx.fillStyle = theme.accent; ctx.font = 'bold 11px sans-serif';
    ctx.fillText('首领 / ' + (BOSS_KINDS[boss.kind]?.name || 'BOSS'), W / 2, 130);
    drawBar(W / 2, 140, bw - 24, 5, boss.hp / boss.maxHp, '#e98d7c');
  }
  // 已获得的武器与能力，让当前构筑随时可查。
  const loadout = [...weapons.map(w => WEAPON_DEFS[w.type].name), ...summons.map(p => POWER_DEFS[p.type].name)];
  if (pet) loadout.push(PET_DEFS[pet.type].name);
  const rowWidth = W - 110;
  ctx.font = '10px "Microsoft YaHei", sans-serif';
  const slots = []; let px = 0, row = 0;
  loadout.forEach(name => {
    const width = ctx.measureText(name).width + 18;
    if (px + width > rowWidth) { px = 0; row++; }
    slots.push({ name, x: px, row, width }); px += width + 5;
  });
  slots.forEach(slot => {
    const x = 12 + slot.x, y = H - 32 - (row - slot.row) * 27;
    ctx.fillStyle = theme.panel; ctx.strokeStyle = theme.line; ctx.beginPath(); ctx.roundRect(x,y,slot.width,22,6); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = theme.text; ctx.fillText(slot.name,x+9,y+15);
  });
  if (gameTime < 7 && state === 'playing') {
    ctx.textAlign = 'center'; ctx.fillStyle = '#c5d5c1'; ctx.font = '11px sans-serif';
    ctx.fillText('WASD / 方向键 / 拖动移动 · 自动攻击', W/2, H-78);
  }
  ctx.restore();
}
function drawAtmosphere() {
  // 屏幕边缘表现不会改变世界坐标或碰撞。
  const low = squadMaxHp > 0 && squadHp / squadMaxHp < .3 && state === 'playing';
  const g = ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.3,W/2,H/2,Math.max(W,H)*.7);
  g.addColorStop(0,'#00000000'); g.addColorStop(1,low ? '#b6403655' : '#061c243b');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  if (enemySlowT > 0) { ctx.strokeStyle = '#a3e5e755'; ctx.lineWidth = 5; ctx.strokeRect(3,3,W-6,H-6); }
}

function render() {
  // 每帧重置基准变换（dpr 缩放），避免任何 save/restore 失衡导致错位
  const dpr = canvasDpr();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const sx = shake > 0 && !reducedMotion.matches ? (Math.random() - 0.5) * shake : 0;
  const sy = shake > 0 && !reducedMotion.matches ? (Math.random() - 0.5) * shake : 0;
  ctx.save();
  ctx.scale(ZOOM, ZOOM);                    // 镜头拉远：可见的世界范围 = W/ZOOM × H/ZOOM
  ctx.translate(-camera.x + sx, -camera.y + sy);
  drawBackground();
  drawBossArena();
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
  drawAtmosphere();
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
  ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
  const size = Math.min(22, 22 * (W - 68) / Math.max(1, ctx.measureText(banner.text).width));
  ctx.font = 'bold ' + size + 'px "Microsoft YaHei", sans-serif';
  const width = Math.min(W - 30, ctx.measureText(banner.text).width + 38);
  hudPanel((W - width) / 2, H * .24 - 29, width, 44);
  ctx.fillStyle = activeTheme().accent;
  ctx.fillText(banner.text, W / 2, H * 0.24);
  ctx.restore();
}

// ==================== 主循环 ====================
let last = performance.now();
let fpsAccum = 0;

function update(dt) {
  if (state !== 'playing') return;
  if (devInvuln) squad.invulnT = Math.max(squad.invulnT, 0.2);   // 调试：无敌（复用受伤免疫）
  gameTime += dt;
  updateSquad(dt);
  updateSoldiers(dt);
  updateShield(dt);
  if (stats.regen > 0) healSquad(stats.regen * dt);   // 回血宝珠：每秒回血
  updateSkills(dt);
  updateWeapons(dt);
  updatePendingLightning(dt);   // 延迟落雷
  updateSummons(dt);
  updatePet(dt);
  updateBullets(dt);
  updateEnemies(dt);
  crushObstaclesByBosses(dt);   // 首领碾碎挡路的建筑 / 撞醒树木（要赶在下面的推出之前）
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
  // 表现计时独立于游戏逻辑：顿帧、暂停和升级时也按实际时间清理斩痕。
  updateSwordSlashes(now);

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
  else update(dt * devSpeed);          // 调试：devSpeed 为游戏速度倍率（默认 1，不改变正常玩法）
  render();
  devTickHud(raw / 1000);              // 调试面板：刷新读数 / 信息浮层 / 入口按钮显隐

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
  document.getElementById('btn-pause').style.top = (42 / H * 100) + '%';
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
  const effects = meta.settings.effects || 'full';
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
      <div class="opt-name">环境特效</div>
      <div class="chip-row">
        ${chip('effects', 'full', '完整', effects === 'full')}
        ${chip('effects', 'lite', '精简', effects === 'lite')}
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
  } else if (g === 'effects') {
    meta.settings.effects = chip.dataset.value;
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
  submitScore(wave, gameTime);   // 上报本局成绩（只增不减与合理性校验由服务端保证）
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
  applyTheme();
  renderThemeOptions();
  document.getElementById('btn-play').textContent = meta.run ? '继续冒险' : '开始游戏';
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
  renderDevMode();
}

// ==================== 排行榜（最久波次） ====================
// 读取走 /api/leaderboard（服务端用 service 密钥读 scores 表），
// 实时优先用 Supabase Realtime 的原生 WebSocket 订阅，不可用时降级为轮询。
let boardTop = [];
let boardRealtime = null;      // 后端下发的 Realtime 连接信息；null 表示只能轮询
let boardSocket = null;
let boardHeartbeat = null;
let boardFallbackTimer = null;
let boardPollTimer = null;
let boardRefreshTimer = null;
let boardOpen = false;

const BOARD_LIMIT = 50;
const BOARD_POLL_MS = 8000;
const BOARD_JOIN_TIMEOUT = 8000;
const BOARD_HEARTBEAT_MS = 25000;

function boardStatus(msg) {
  const el = document.getElementById('board-status');
  if (el) el.textContent = msg;
}

// 榜首皇冠：静态 SVG 模板（不含任何玩家数据，可以安全地走 innerHTML）
const CROWN_SVG = '<svg viewBox="0 0 24 19" aria-hidden="true">'
  + '<path class="crown-body" d="M3.2 16.6 2.4 5.6 8 10.3 12 2.9 16 10.3 21.6 5.6 20.8 16.6Z"/>'
  + '<path class="crown-band" d="M4.2 13.2h15.6"/>'
  + '</svg>';

function boardCrown() {
  const el = document.createElement('span');
  el.className = 'board-crown';
  el.innerHTML = CROWN_SVG;
  return el;
}

function renderBoard() {
  const box = document.getElementById('board-list');
  if (!box) return;
  box.innerHTML = '';
  if (!boardTop.length) {
    const p = document.createElement('p');
    p.className = 'dim';
    p.textContent = '还没有人上榜，去打一局吧';
    box.appendChild(p);
    return;
  }
  // 玩家名来自其他账号，一律走 textContent，不拼 HTML
  boardTop.forEach(row => {
    const el = document.createElement('div');
    el.className = 'board-row'
      + (row.rank <= 3 ? ` rank-${row.rank}` : '')
      + (row.username === currentUser ? ' me' : '');
    const rank = document.createElement('span');
    rank.className = 'board-rank';
    rank.textContent = row.rank;
    const user = document.createElement('span');
    user.className = 'board-user';
    if (row.rank === 1) user.appendChild(boardCrown());
    const name = document.createElement('span');
    name.className = 'board-name';
    name.textContent = row.username;
    user.appendChild(name);
    const wave = document.createElement('span');
    wave.className = 'board-wave';
    wave.textContent = row.bestWave;
    el.append(rank, user, wave);
    box.appendChild(el);
  });
}

function fetchBoard() {
  return fetch(`/api/leaderboard?limit=${BOARD_LIMIT}`)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(d => {
      if (!d || !Array.isArray(d.top)) throw new Error('bad payload');
      boardTop = d.top;
      boardRealtime = d.realtime || null;
      renderBoard();
      boardStatus(boardRealtime ? '实时同步中' : `每 ${BOARD_POLL_MS / 1000} 秒刷新一次`);
      return true;
    })
    .catch(() => { boardStatus('排行榜暂时不可用'); return false; });
}

// 提交本局成绩。身份由令牌决定（服务端不信任请求体里的用户名），
// 只增不减与合理性校验（波次 vs 对局时长）都在服务端完成，这里不需要先比较。
function submitScore(wave, duration) {
  if (!currentUser || !usesHttpStore() || !(wave > 0)) return Promise.resolve();
  const headers = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  return fetch('/api/leaderboard', {
    method: 'POST',
    headers,
    body: JSON.stringify({ bestWave: wave, duration: Math.max(0, Math.floor(duration || 0)) }),
  }).catch(() => {});
}

function stopBoardPolling() {
  if (boardPollTimer) { clearInterval(boardPollTimer); boardPollTimer = null; }
}

function startBoardPolling() {
  if (boardPollTimer) return;
  boardPollTimer = setInterval(fetchBoard, BOARD_POLL_MS);
}

function closeBoardRealtime() {
  if (boardFallbackTimer) { clearTimeout(boardFallbackTimer); boardFallbackTimer = null; }
  if (boardHeartbeat) { clearInterval(boardHeartbeat); boardHeartbeat = null; }
  if (boardSocket) {
    const s = boardSocket;
    boardSocket = null;
    s.onopen = s.onmessage = s.onerror = s.onclose = null;
    try { s.close(); } catch (e) {}
  }
  if (boardRefreshTimer) { clearTimeout(boardRefreshTimer); boardRefreshTimer = null; }
}

// 实时通道断开：清掉连接并转轮询兜底，保证榜单不会停在旧数据上
function fallbackToPolling() {
  closeBoardRealtime();
  if (boardOpen) startBoardPolling();
}

// 返回是否已建立订阅（失败会自动转轮询）
function connectBoardRealtime() {
  if (!boardRealtime || typeof WebSocket !== 'function') return false;
  const { url, key, table } = boardRealtime;
  let ws;
  try {
    ws = new WebSocket(`${url}?apikey=${encodeURIComponent(key)}&vsn=1.0.0`);
  } catch (e) {
    return false;
  }
  boardSocket = ws;

  ws.onopen = () => {
    if (boardSocket !== ws) return;
    ws.send(JSON.stringify({
      topic: 'realtime:board',
      event: 'phx_join',
      payload: { config: { postgres_changes: [{ event: '*', schema: 'public', table }] } },
      ref: '1',
      join_ref: '1',
    }));
    boardHeartbeat = setInterval(() => {
      if (boardSocket === ws) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' }));
    }, BOARD_HEARTBEAT_MS);
    // 服务端一直没回 phx_reply 就转轮询
    boardFallbackTimer = setTimeout(() => {
      if (boardSocket === ws && boardStatus) boardStatus('实时通道未响应');
      fallbackToPolling();
    }, BOARD_JOIN_TIMEOUT);
  };

  ws.onmessage = ev => {
    if (boardSocket !== ws) return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.event === 'phx_reply') {
      if (msg.payload && msg.payload.status === 'ok') {
        if (boardFallbackTimer) { clearTimeout(boardFallbackTimer); boardFallbackTimer = null; }
        boardStatus('实时同步中');
      } else {
        fallbackToPolling();
      }
      return;
    }
    if (msg.event === 'postgres_changes') {
      // 有人提交了新成绩：短防抖后重新拉榜
      if (boardRefreshTimer) clearTimeout(boardRefreshTimer);
      boardRefreshTimer = setTimeout(fetchBoard, 400);
      return;
    }
    if (msg.event === 'phx_error' || msg.event === 'phx_close') fallbackToPolling();
  };

  ws.onerror = () => { if (boardSocket === ws) fallbackToPolling(); };
  ws.onclose = () => { if (boardSocket === ws) fallbackToPolling(); };
  return true;
}

function openBoard() {
  if (boardOpen) return;
  boardOpen = true;
  boardTop = [];
  renderBoard();
  if (!usesHttpStore()) {
    boardStatus('当前离线游玩，排行榜需要联网');
    return;
  }
  boardStatus('加载中…');
  fetchBoard().then(() => {
    if (!boardOpen) return;
    if (!connectBoardRealtime()) startBoardPolling();
  });
}

function closeBoard() {
  boardOpen = false;
  closeBoardRealtime();
  stopBoardPolling();
}

// 标签切换
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    soundTapCount = 0;   // 离开设置页即打断「连续切换」计数
    document.querySelector('#menu .menu-panel').scrollTop = 0;
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'board') openBoard();
    else closeBoard();
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
// ==================== 开发者模式 ====================
// 入口：设置页「音效」连续切换 SOUND_TAP_UNLOCK 次 → 弹出密码验证 → 通过后解锁。
// 解锁状态写进账号（meta.devMode），换设备也保留；改动即时保存，仅对当前账号生效。
function devModeOn() { return !!meta.devMode; }

function devStatus(msg) {
  const el = document.getElementById('dev-status');
  if (el) el.textContent = msg;
}

function devGateStatus(msg) {
  const el = document.getElementById('dev-gate-status');
  if (el) el.textContent = msg;
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

async function sha256Hex(text) {
  const bits = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function setDevGate(show) {
  const gate = document.getElementById('dev-gate');
  if (!gate) return;
  gate.classList.toggle('hidden', !show);
  devGateStatus('');
  if (show) {
    document.getElementById('dev-pass').value = '';
    document.getElementById('dev-pass').focus();
  }
}

function fillPetDevFields() {
  const id = document.getElementById('dev-pet').value || Object.keys(PET_DEFS)[0];
  const d = petDev(id);
  document.getElementById('dev-pet-lv').value = d.lv;
  document.getElementById('dev-pet-star').value = d.star;
  document.getElementById('dev-pet-shards').value = d.shards;
}

function devInfo() {
  const el = document.getElementById('dev-info');
  if (!el) return;
  const size = new Blob([JSON.stringify(meta)]).size;
  const channel = usesHttpStore() ? '在线接口' : (window.furyStore ? 'Electron 本地文件' : '浏览器本地存储');
  el.textContent = `${playerName()} · ${channel} · 存档 ${(size / 1024).toFixed(1)} KB${meta.run ? ' · 有未结束对局' : ''}`;
}

function renderDevMode() {
  const box = document.getElementById('dev-mode');
  if (!box) return;
  if (!devModeOn()) {
    box.classList.add('hidden');
    setDevGate(false);
    devPanelShown = false;
    return;
  }
  box.classList.remove('hidden');
  setDevGate(false);
  if (devPanelShown) return;   // 已填充过就不覆盖，避免打断正在输入的值
  devPanelShown = true;
  document.getElementById('dev-coins').value = meta.coins;
  document.getElementById('dev-bestwave').value = meta.bestWave;
  document.getElementById('dev-pet').innerHTML =
    Object.keys(PET_DEFS).map(id => `<option value="${id}">${PET_DEFS[id].name}</option>`).join('');
  fillPetDevFields();
  devInfo();
}

document.getElementById('opt-sound').addEventListener('change', e => {
  meta.settings.sound = e.target.checked;
  saveMeta();
  if (devModeOn()) return;
  soundTapCount++;
  if (soundTapCount >= SOUND_TAP_UNLOCK) {
    soundTapCount = 0;
    setDevGate(true);   // 不直接解锁：先要密码
  }
});

async function tryEnterDevMode() {
  const pass = document.getElementById('dev-pass').value;
  if (!pass) { devGateStatus('请输入密码'); return; }
  if (await sha256Hex(pass) !== DEV_PASSWORD_HASH) {
    document.getElementById('dev-pass').value = '';
    devGateStatus('密码不正确');
    return;
  }
  meta.devMode = true;
  saveMeta();
  renderDevMode();
  devStatus('已进入开发者模式');
}
document.getElementById('dev-enter').onclick = tryEnterDevMode;
document.getElementById('dev-cancel').onclick = () => { setDevGate(false); soundTapCount = 0; };
document.getElementById('dev-pass').addEventListener('keydown', e => {
  if (e.key === 'Enter') tryEnterDevMode();
});

document.getElementById('dev-exit').onclick = () => {
  meta.devMode = false;
  saveMeta();
  renderDevMode();          // 隐藏面板
  soundTapCount = 0;
};

document.getElementById('dev-pet').onchange = fillPetDevFields;

document.getElementById('dev-apply-basic').onclick = () => {
  const coins = clampInt(document.getElementById('dev-coins').value, 0, 9999999);
  const wave = clampInt(document.getElementById('dev-bestwave').value, 0, 9999);
  meta.coins = coins;
  meta.bestWave = wave;
  saveMeta();
  submitScore(meta.bestWave, meta.bestWave * 2 + 60);    // 开发者模式改动同样计入排行榜（声明足够的对局时长以通过合理性校验）
  renderMenu();
  devStatus(`已应用：金币 ${coins} · 最佳波次 ${wave}`);
};

document.getElementById('dev-unlock-all').onclick = () => {
  Object.keys(SHOP).forEach(cat => { meta.unlocked[cat] = Object.keys(SHOP[cat]); });
  saveMeta();
  renderMenu();
  devStatus('已解锁全部武器 / 护甲 / 物品 / 宠物');
};

document.getElementById('dev-apply-pet').onclick = () => {
  const id = document.getElementById('dev-pet').value;
  const d = petDev(id);
  d.lv = clampInt(document.getElementById('dev-pet-lv').value, 1, PET_DEV_CFG.lvMax);
  d.star = clampInt(document.getElementById('dev-pet-star').value, 1, PET_DEV_CFG.starMax);
  d.shards = clampInt(document.getElementById('dev-pet-shards').value, 0, 999);
  d.exp = 0;
  saveMeta();
  renderMenu();
  devStatus(`${PET_DEFS[id].name}：Lv.${d.lv} · ★${d.star} · 碎片 ${d.shards}`);
};

document.getElementById('dev-max-pet').onclick = () => {
  Object.keys(PET_DEFS).forEach(id => {
    const d = petDev(id);
    d.lv = PET_DEV_CFG.lvMax;
    d.star = PET_DEV_CFG.starMax;
    d.shards = 0;
    d.exp = 0;
  });
  saveMeta();
  renderMenu();
  devStatus(`所有宠物已拉满（Lv.${PET_DEV_CFG.lvMax} · ★${PET_DEV_CFG.starMax}）`);
};

document.getElementById('dev-clear-run').onclick = () => {
  meta.run = null;
  saveMeta();
  renderMenu();
  devInfo();
  devStatus('已清空未结束对局，主按钮回到「开始游戏」');
};

document.getElementById('dev-export').onclick = () => {
  const box = document.getElementById('dev-json');
  box.value = JSON.stringify(meta, null, 2);
  devStatus(`已导出存档（${(new Blob([box.value]).size / 1024).toFixed(1)} KB），可复制备份`);
};

document.getElementById('dev-import').onclick = () => {
  const raw = document.getElementById('dev-json').value.trim();
  if (!raw) { devStatus('请先把存档 JSON 粘贴到上面的输入框'); return; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { devStatus('JSON 解析失败：' + e.message); return; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { devStatus('存档必须是一个 JSON 对象'); return; }
  meta = normalizeMeta(parsed);
  meta.devMode = true;      // 导入的存档若不带该字段，保持开发者模式可用
  saveMeta();
  renderMenu();
  devPanelShown = false;
  renderDevMode();
  devStatus('存档已导入并保存');
};

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
document.getElementById('btn-register').onclick = async () => {
  if (!registerMode) { setLoginMode(true); return; }
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const p2 = document.getElementById('login-pass2').value;
  if (!u || !p) { loginError('请输入用户名和密码'); return; }
  if (p !== p2) { loginError('两次输入的密码不一致'); return; }
  // 本地列表可能落后于服务端（好友刚注册过同名），最终以 register() 里的服务端判重为准
  if (users.some(x => x.username === u)) { loginError('用户名已存在'); return; }
  if (await register(u, p)) setLoginMode(false);
};
document.getElementById('btn-back').onclick = () => setLoginMode(false);
document.getElementById('btn-logout').onclick = logout;

// ==================== 局内调试面板（V1.26） ====================
// 把以前只能开控制台手敲的测试动作做成按钮：调波次、刷 Boss / 精英 / 小怪（可站桩、可停手）、
// 任选升级卡（默认忽略前置，可切回严格）、玩家侧开关、游戏速度与单步、以及一个实时读数浮层。
// 只在开发者模式（meta.devMode）下可见；所有开关默认都不改变正常玩法，且每局重开时由 devResetTransient() 复位。
const DEV_SPEEDS = [0.25, 0.5, 1, 2, 4];
const DEV_CARD_CATS = [
  ['all', '全部'], ['basic', '生存功能'], ['weapon', '武器'], ['element', '元素'],
  ['summon', '召唤'], ['pet', '宠物'], ['evo', '进化'], ['boss', '首领奖励'],
];
const DEV_SPAWN_LABELS = {
  grunt: '普通怪', fast: '快速怪', ranged: '远程怪', elite: '精英', bomber: '自爆怪',
  hunter: '猎人', healer: '治疗兵', shielder: '护盾兵', summoner: '召唤兵', treant: '树怪',
  barrel: '木桶', crate: '箱子', pillar: '石柱', tree: '树木',
};
let devFps = 60, devReadTick = 0;

function devQ(id) { return document.getElementById(id); }
function devHudStatus(msg) { const el = devQ('dev-hud-status'); if (el) el.textContent = msg; }

// 新对局：把会影响对局本身的开关复位（面板偏好，如当前分类 / 搜索词，保留）
function devResetTransient() {
  devSpeed = 1;
  devFreezeWave = false;
  devInvuln = false;
  devOneShot = false;
  ['dev-freeze-wave', 'dev-invuln', 'dev-oneshot'].forEach(id => { const el = devQ(id); if (el) el.checked = false; });
  renderDevSpeedChips();
}

function devAvailable() { return devModeOn(); }

function setDevHud(open) {
  devHudOpen = !!open && devAvailable();
  const el = devQ('dev-hud');
  if (el) el.classList.toggle('hidden', !devHudOpen);
  if (devHudOpen) {
    devSyncControls();
    devRenderCatChips();
    devRenderCards();
    devRefreshReadout();
    devHudStatus('');
  }
}

function toggleDevHud() {
  if (!devAvailable()) return;
  setDevHud(!devHudOpen);
}

// 每帧调用（loop 里）：入口按钮显隐 + 读数刷新 + 信息浮层
function devTickHud(rawDt) {
  if (rawDt > 0) devFps = devFps * 0.9 + (1 / rawDt) * 0.1;
  const usable = devAvailable() && (state === 'playing' || state === 'paused');
  const tgl = devQ('dev-toggle');
  if (tgl && tgl.classList.contains('hidden') !== !usable) tgl.classList.toggle('hidden', !usable);
  if (devHudOpen && !usable) setDevHud(false);           // 回到菜单 / 结算时自动收起
  if (devInfoOn && !usable) { devInfoOn = false; const el = devQ('dev-info-toggle'); if (el) el.checked = false; }
  const info = devQ('dev-info-hud');
  if (info) {
    if (info.classList.contains('hidden') !== !(devInfoOn && usable)) info.classList.toggle('hidden', !(devInfoOn && usable));
    info.classList.toggle('pushed', devHudOpen);      // 面板展开时把浮层挪到左下，避免被面板盖住
  }
  devReadTick -= rawDt;
  if (devReadTick > 0) return;
  devReadTick = 0.2;
  if (devHudOpen) devRefreshReadout();
  if (devInfoOn && usable) renderDevInfo();
}

function devRefreshReadout() {
  const waveEl = devQ('dev-wave-now');
  if (!waveEl) return;
  waveEl.textContent = wave;
  devQ('dev-wave-t').textContent = `${waveT.toFixed(1)}s / ${WAVE_TIME}s` + (devFreezeWave ? ' · 已冻结' : '');
  devQ('dev-self-hp').textContent = `${Math.ceil(squadHp)}/${Math.ceil(squadMaxHp)}`;
  devQ('dev-self-sum').textContent = `LV${level} · 敌 ${enemies.length} · 弹 ${bullets.length}/${enemyBullets.length}`;
}

function renderDevInfo() {
  const el = devQ('dev-info-hud');
  if (!el) return;
  const boss = enemies.find(e => e.type === 'boss');
  const bossText = boss
    ? `${(BOSS_KINDS[boss.kind] || {}).name || boss.kind} ${Math.max(0, Math.round(boss.hp))}/${Math.round(boss.maxHp)}${boss.phase2 ? ' P2' : ''}`
    : '无';
  const lines = [
    `fps ${devFps.toFixed(0)} · 速度 x${devSpeed}`,
    `波 ${wave} (${waveT.toFixed(1)}/${WAVE_TIME}s) · 时长 ${fmtTime(gameTime)}`,
    `敌 ${enemies.length} · 弹 ${bullets.length}/${enemyBullets.length} · 召唤 ${summons.length} · 掉落 ${drops.length}`,
    `血 ${Math.ceil(squadHp)}/${Math.ceil(squadMaxHp)} · LV${level} · Boss ${bossText}`,
  ];
  if (devInvuln) lines.push('无敌 ON');
  if (devOneShot) lines.push('秒杀 ON');
  if (devFreezeWave) lines.push('波次计时已冻结');
  el.textContent = lines.join('\n');
}

// ---- 波次 ----
function devJumpWave(n) {
  wave = Math.max(1, Math.min(9999, Math.floor(n) || 1));
  waveT = 0;
  devHudStatus(`已跳到第 ${wave} 波（难度倍率不变，敌人血量按波次曲线重算）`);
  devRefreshReadout();
}

function devEndWave() {
  wave++;
  waveT = 0;
  if (wave % 10 === 0) spawnEnemy('boss');
  else if (wave % 5 === 0) spawnEliteGroup(eliteGroupSize());
  devHudStatus(`已进入第 ${wave} 波`);
  devRefreshReadout();
}

function devClearEnemies() {
  const n = enemies.length;
  enemies = [];
  enemyBullets = [];
  bossArena = null;                    // 首领被清掉，竞技场一并解除
  devHudStatus(n ? `已清空场上 ${n} 个敌人` : '场上本来就没有敌人');
  devRefreshReadout();
}

// ---- 刷怪 ----
function devSpawnPoint(mode, i, n) {
  const cnt = Math.max(1, n);
  const a = (Math.PI * 2 / cnt) * i + Math.random() * 0.35;
  if (mode === 'random') return { x: 60 + Math.random() * (WORLD.w - 120), y: 60 + Math.random() * (WORLD.h - 120) };
  if (mode === 'center') {
    const rr = 60 + Math.random() * 90;
    return { x: camera.x + viewW() / 2 + Math.cos(a) * rr, y: camera.y + viewH() / 2 + Math.sin(a) * rr };
  }
  if (mode === 'edge') {                // 屏幕外一圈，像正常刷怪那样走进来
    const side = Math.random();
    if (side < 0.5) return { x: camera.x + Math.random() * viewW(), y: camera.y - 60 };
    if (side < 0.75) return { x: camera.x - 60, y: camera.y + Math.random() * viewH() };
    if (side < 0.9) return { x: camera.x + viewW() + 60, y: camera.y + Math.random() * viewH() };
    return { x: camera.x + Math.random() * viewW(), y: camera.y + viewH() + 60 };
  }
  const rr = 130 + Math.random() * 90;   // near：玩家周围一圈，保证在视野里
  return { x: squad.x + Math.cos(a) * rr, y: squad.y + Math.sin(a) * rr };
}

function devSpawnObstacle(type, p) {
  const def = OBSTACLE_DEFS[type];
  if (!def) return;
  if (type === 'tree') {
    obstacles.push({ x: p.x, y: p.y, r: FLORA_CFG.tree.r, type: 'tree', hp: Infinity, maxHp: Infinity, dead: false, hitT: 0, aggro: 0, grow: 1 });
  } else {
    obstacles.push({ x: p.x, y: p.y, r: def.r, type, hp: def.hp, maxHp: def.hp, dead: false, hitT: 0 });
  }
}

function devDoSpawn() {
  const sel = devQ('dev-spawn-type').value;
  const n = Math.max(1, Math.min(40, parseInt(devQ('dev-spawn-n').value, 10) || 1));
  const pos = devQ('dev-spawn-pos').value;
  const flags = { devStatic: devQ('dev-spawn-static').checked, devPeaceful: devQ('dev-spawn-peace').checked };

  if (sel.startsWith('ob:')) {          // 建筑：木桶 / 箱子 / 石柱 / 树木
    const type = sel.slice(3);
    for (let i = 0; i < n; i++) devSpawnObstacle(type, devSpawnPoint(pos, i, n));
    devHudStatus(`已刷出 ${n} 个建筑（${(OBSTACLE_DEFS[type] || {}).name || type}）`);
    return;
  }

  let type = sel, bossKind = null, affixes;
  if (sel.startsWith('boss:')) { type = 'boss'; bossKind = sel.slice(5); }
  if (sel === 'elite:0') { type = 'elite'; affixes = []; }      // 无词缀精英

  for (let i = 0; i < n; i++) {
    const p = devSpawnPoint(pos, i, n);
    spawnEnemy(type, p.x, p.y, Object.assign({ bossKind }, flags, affixes ? { affixes } : {}));
  }
  const label = bossKind ? `BOSS · ${(BOSS_KINDS[bossKind] || {}).name || bossKind}` : (DEV_SPAWN_LABELS[type] || type);
  devHudStatus(`已刷出 ${n} × ${label}${flags.devStatic ? '（站桩）' : ''}${flags.devPeaceful ? '（停手）' : ''}`);
  devRefreshReadout();
}

// 把「站桩 / 停手」一键套到场上所有敌人（有一个没开就全开）
function devMarkAll(field) {
  if (!enemies.length) { devHudStatus('场上没有敌人'); return; }
  const on = !enemies.every(e => e[field]);
  enemies.forEach(e => {
    e[field] = on;
    if (field === 'devStatic') { e.kbx = 0; e.kby = 0; }
  });
  devHudStatus(`${on ? '已开启' : '已关闭'}「${field === 'devStatic' ? '站桩' : '停手'}」· 共 ${enemies.length} 只`);
}

// ---- 卡牌任选 ----
// 收集卡牌：临时放行全部前置（devForcePool）看一遍升级池，再补上首领奖励；
// 严格模式则直接读当前真实可选的池子。
function devCardCatalog() {
  if (devQ('dev-card-strict').checked) {
    return buildUpgradePool().map(u => Object.assign({}, u, { boss: false }));
  }
  const savedIds = appliedIds, savedPicks = pickCount;
  appliedIds = new Set();
  pickCount = {};
  let pool = [];
  try {
    devForcePool = true;
    pool = buildUpgradePool();
  } finally {
    devForcePool = false;
    appliedIds = savedIds;
    pickCount = savedPicks;
  }
  const cards = pool.map(u => Object.assign({}, u, { boss: false }));
  BOSS_BUFFS.forEach(b => cards.push(Object.assign({}, b, { route: null, evo: false, boss: true })));
  return cards;
}

function devCardCategory(c) {
  if (c.boss) return 'boss';
  if (c.evo) return 'evo';
  if (c.route === 'scythe' || c.route === 'sword') return 'summon';
  if (c.route === 'lightning' || /^(enchant|burn|frost|elemental|blast|winter)/.test(c.id)) return 'element';
  if (['rifle', 'shotgun', 'laser', 'sniper'].includes(c.route)) return 'weapon';
  if (/^pet-/.test(c.id)) return 'pet';
  return 'basic';
}

function devRenderCatChips() {
  const box = devQ('dev-card-cats');
  if (!box) return;
  box.innerHTML = '';
  DEV_CARD_CATS.forEach(([val, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (devCardCat === val) b.classList.add('active');
    b.onclick = () => { devCardCat = val; devRenderCatChips(); devRenderCards(); };
    box.appendChild(b);
  });
}

function devRenderCards() {
  const box = devQ('dev-card-list');
  if (!box) return;
  const all = devCardCatalog();
  const q = (devQ('dev-card-search').value || '').trim().toLowerCase();
  const list = all.filter(c => (devCardCat === 'all' || devCardCategory(c) === devCardCat)
    && (!q || (c.name + ' ' + c.id + ' ' + (c.desc || '')).toLowerCase().includes(q)));
  box.innerHTML = '';
  list.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dev-card' + (c.evo ? ' evo' : '') + (c.boss ? ' boss' : '');
    b.innerHTML = '<span class="dev-card-name">' + c.name + '</span>'
      + '<span class="dev-card-desc">' + (c.desc || '') + '</span>'
      + (appliedIds.has(c.id) ? '<span class="dev-card-got">已选</span>' : '');
    b.onclick = () => devApplyCard(c);
    box.appendChild(b);
  });
  devQ('dev-card-count').textContent = `显示 ${list.length} / 共 ${all.length} 张`
    + (devQ('dev-card-strict').checked ? '（严格：只列当前可选）' : '（已忽略前置）');
}

function devApplyCard(card) {
  // 进化卡在卡池里没带 route，回表里取；缺「容器」的先补上，否则武器 / 召唤物的卡取不到对象会报错
  const route = card.route || ((EVOLUTIONS.find(ev => ev.id === card.id) || {}).route);
  if (route) {
    if (WEAPON_DEFS[route] && !getWeapon(route)) addWeapon(route);
    if (POWER_DEFS[route] && !getSummon(route)) addSummon(route);
  }
  try {
    card.apply();
  } catch (err) {
    devHudStatus(`「${card.name}」暂时加不上：${err.message}`);
    return;
  }
  appliedIds.add(card.id);
  if (route) routePicks[route] = (routePicks[route] || 0) + 1;
  devHudStatus(`已获得「${card.name}」`);
  devRenderCards();
  devRefreshReadout();
}

// ---- 玩家 / 时间 ----
function renderDevSpeedChips() {
  const box = devQ('dev-speed');
  if (!box) return;
  box.innerHTML = '';
  DEV_SPEEDS.forEach(v => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'x' + v;
    if (devSpeed === v) b.classList.add('active');
    b.onclick = () => { devSpeed = v; renderDevSpeedChips(); devHudStatus(`游戏速度 x${v}`); };
    box.appendChild(b);
  });
}

function devStepFrame() {
  if (state !== 'paused') { devHudStatus('先暂停（暂停 / 继续），再单步'); return; }
  state = 'playing';
  update(1 / 60);
  if (state === 'playing') state = 'paused';     // update 可能把状态改掉（升级 / 结算），那就保持它
  devRefreshReadout();
  devHudStatus('已推进 1 帧（1/60s）');
}

function devSyncControls() {
  const set = (id, v) => { const el = devQ(id); if (el) el.checked = !!v; };
  set('dev-freeze-wave', devFreezeWave);
  set('dev-invuln', devInvuln);
  set('dev-oneshot', devOneShot);
  set('dev-info-toggle', devInfoOn);
  const wi = devQ('dev-wave-input');
  if (wi) wi.value = wave;
  renderDevSpeedChips();
}

function devInitHud() {
  const on = (id, fn) => { const el = devQ(id); if (el) el.onclick = fn; };
  const change = (id, fn) => { const el = devQ(id); if (el) el.onchange = () => fn(el.checked); };

  on('dev-toggle', toggleDevHud);
  on('dev-hud-close', () => setDevHud(false));

  document.querySelectorAll('.dev-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.dev-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.dev-pane').forEach(p => p.classList.toggle('active', p.dataset.devpane === btn.dataset.devtab));
      if (btn.dataset.devtab === 'card') devRenderCards();
    };
  });

  // 波次
  on('dev-wave-prev', () => devJumpWave(wave - 1));
  on('dev-wave-next', () => devJumpWave(wave + 1));
  on('dev-wave-jump', () => devJumpWave(parseInt(devQ('dev-wave-input').value, 10)));
  on('dev-wave-end', devEndWave);
  on('dev-clear', devClearEnemies);
  change('dev-freeze-wave', v => { devFreezeWave = v; devHudStatus(v ? '波次计时已冻结' : '波次计时已恢复'); });
  on('dev-elite-group', () => {
    const n = eliteGroupSize();
    spawnEliteGroup(n);
    devHudStatus(`已刷出 ${n} 只精英`);
    devRefreshReadout();
  });
  on('dev-boss-now', () => {
    spawnEnemy('boss');
    devHudStatus(`已刷出本波对应的首领（第 ${wave} 波）`);
    devRefreshReadout();
  });

  // 刷怪
  on('dev-spawn-go', devDoSpawn);
  on('dev-mark-static', () => devMarkAll('devStatic'));
  on('dev-mark-peace', () => devMarkAll('devPeaceful'));

  // 卡牌
  const search = devQ('dev-card-search');
  if (search) search.oninput = devRenderCards;
  change('dev-card-strict', () => devRenderCards());

  // 玩家 / 时间
  change('dev-invuln', v => { devInvuln = v; devHudStatus(v ? '无敌已开启' : '无敌已关闭'); });
  change('dev-oneshot', v => { devOneShot = v; devHudStatus(v ? '秒杀已开启' : '秒杀已关闭'); });
  on('dev-soldier-add', () => {
    addSoldier();
    devHudStatus(`士兵 +1（当前 ${soldiers.length} 名）`);
    devRefreshReadout();
  });
  on('dev-soldier-del', () => {
    if (soldiers.length <= 1) { devHudStatus('至少保留 1 名士兵'); return; }
    squadHp = Math.max(1, squadHp - soldierMaxHp());    // 掉一格血池 → 少一个小人
    dropSoldiersToFitPool();
    devHudStatus(`士兵 −1（当前 ${soldiers.length} 名）`);
    devRefreshReadout();
  });
  on('dev-heal', () => { squadHp = squadMaxHp; devHudStatus('血池已回满'); devRefreshReadout(); });
  on('dev-levelup', () => {
    if (state !== 'playing') { devHudStatus('对局进行中才能升级（先继续游戏）'); return; }
    level++;
    openUpgrade();
    devHudStatus('已触发升级选卡');
  });
  on('dev-xp-add', () => {
    if (state !== 'playing') { devHudStatus('对局进行中才能加经验（先继续游戏）'); return; }
    collectXp(200);
    devHudStatus('经验 +200（按当前经验倍率结算）');
    devRefreshReadout();
  });
  on('dev-reroll-add', () => {
    rerollLeft += 3;
    updateRerollButton();
    devHudStatus(`重掷次数 +3（当前 ${rerollLeft} 次）`);
  });
  on('dev-pause', () => {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
    else devHudStatus('当前状态不能暂停');
  });
  on('dev-step', devStepFrame);
  change('dev-info-toggle', v => {
    devInfoOn = v;
    const el = devQ('dev-info-hud');
    if (el) el.classList.toggle('hidden', !v);
    if (v) renderDevInfo();
  });

  renderDevSpeedChips();
  devRenderCatChips();
}

devInitHud();

// 启动：先确定账号数据来源并恢复登录态，再决定进主菜单还是登录页
loadUsers().then(() => {
  const savedUser = localStorage.getItem('fury_current_user');
  if (!savedUser) { showLogin(); return; }

  // 在线通道：凭令牌取回自己的存档（令牌失效则要求重新登录）
  if (usesHttpStore()) {
    const t = token();
    if (!t) { localStorage.removeItem('fury_current_user'); showLogin(); return; }
    return fetch(`/api/users?username=${encodeURIComponent(savedUser)}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d && d.user) enterGame(d.user.username, d.user.meta);
        else { setToken(''); localStorage.removeItem('fury_current_user'); showLogin(); }
      })
      .catch(() => showLogin());
  }

  const u = users.find(x => x.username === savedUser);
  if (u) enterGame(u.username, u.meta);
  else showLogin();
});
requestAnimationFrame(loop);
requestAnimationFrame(charPreviewLoop);
requestAnimationFrame(charPreviewLoop);
