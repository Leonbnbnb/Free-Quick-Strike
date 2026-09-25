// ==================== 模块边界（V1.32） ====================
// 单文件阶段先把边界立清楚，后续「逐步拆文件」就按这四块切（拆的时候照着下面的清单搬即可）。
// 分层的硬性约定（不是风格建议，是**可验证的不变量**，见 tests/visual-smoke.js 的边界断言）：
//   · **渲染层只读世界**：draw* / render() 不修改实体（squad / soldiers / enemies / bullets / squadHp…），
//     也不消耗世界流与战斗流（表现自己的随机一律走 fxRng）—— 这样「回放同一局」不会因为画面设置不同而跑偏。
//   · **UI 层只发起动作**：面板渲染与事件绑定只改 DOM 与调用逻辑层的入口，不直接改世界数据。
//   · **逻辑层不碰 DOM**：唯一的例外是状态机 setState()，它天生要负责遮罩显隐（那部分见 UI 层）。
//
// ┌ [数据 DATA]  只定义「是什么」，不含行为
// │   · 常量与配置（W / WORLD / ZOOM / CFG / S）      · 敌人与首领定义（ENEMY_TYPES / BOSS_KINDS / 词缀 / 曲线）
// │   · 四条线的基础数值（WEAPON / ELEMENT / SUMMON / PET_DEFS）  · 宠物技能与养成（PET_SKILLS / PET_TREES / PET_DEV_CFG）
// │   · 进化表（EVOLUTIONS）                          · 装备与词条表（GEAR_* / WEAPON_AFFIXES / ARMOR / TRINKET）
// │   · 卡池权重常量（W_LOW / W_MED / W_NORM / BOSS_BUFFS）      · 存档结构（defaultMeta / normalizeMeta / META_MIGRATIONS）
// │   · 表现常量（配色 / 火焰层 / 粒子参数）          · 模式表（GAME_MODES）
// ├ [逻辑 LOGIC] 规则与状态推进，改数据但不画
// │   · 状态机（STATE_DEFS / setState / isLive）      · 随机流（mulberry32 / seedRun / rngWorld|Combat|Fx）
// │   · 对局生命周期（reset / startGame / pauseGame / resumeGame / gameOver / winRun / 快照与读档）
// │   · 战斗（update* / hitEnemy / killEnemy / updateWeapons / 各条线行为 / Boss AI / 自爆怪 / 首王演出）
// │   · 养成与存档（petDev / gearBuff / refineGear / hatchEgg / saveMeta / loadMetaFor / 排行榜提交）
// │   · 输入（键盘 / 摇杆 → 只改 target 与状态机，不直接画）
// ├ [渲染 RENDER] 只读世界，往 canvas 上画
// │   · render() 与所有 draw*（角色 / 敌人 / 子弹 / 特效 / HUD / 地形缓存 buildTerrain）
// │   · 表现层自己的数据（particles / petFx / blasts / damageNumbers / 屏幕抖动）由渲染层自行推进
// └ [UI VIEW] DOM 与交互
//     · 主菜单各页渲染（renderMenu / renderEquipPage / renderPetDev / renderCharOptions / renderDisplaySettings）
//     · 局内面板（升级卡 / 首领奖励 / 暂停 / 结算 / 孵化界面）与遮罩显隐
//     · 事件绑定（按钮 / 输入框 / 快捷键）与开发者面板（devInitHud / renderDevMode）

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
  // V1.35：护盾恢复整体削弱（延迟 3→5s、速率 10→7/s）。后期「坚定守护」+ 多张护盾卡叠起来
  //   极易把恢复压到「刚破就满」，等于常驻无敌；抬高基础延迟让这条线永远留有真空期。
  shieldRegenDelay: 5, // 破盾后恢复延迟（秒）
  shieldRegenRate: 7,  // 护盾恢复速率（每秒）
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

// 角色物种（V1.31）：福瑞 = 原来的毛毛战士；牛来 = 电影《牛来》(2026) 里那只低模小牛犊。
// 两者共用同一套 毛色 / 服装 / 头饰 / 眼睛 / 体型 选项，只是身体与头型不同。
const CHAR_SPECIES = [
  { name: '福瑞' },
  { name: '牛来' },
];

function charScale() { return (CHAR_SIZE[meta.character.size] || CHAR_SIZE[1]).scale; }
// 绘制半径：角色设定体型 × 局内「巨人线」体型倍率（V1.35）
function charRadius() { return S.soldierR * charScale() * (stats.bodyMul || 1); }
function playerName() { return currentUser || '玩家'; }

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 宠物进化阶段（V1.31）：幼体 → 成体 → 究极体。
// 满级（Lv.20）或满星（★5）判为究极体；过半等级判为成体。只影响表现，不影响数值。
function petStage(d) {
  if (!d) return 0;
  if (d.lv >= PET_DEV_CFG.lvMax || d.star >= PET_DEV_CFG.starMax) return 2;
  if (d.lv >= Math.ceil(PET_DEV_CFG.lvMax / 2)) return 1;
  return 0;
}
const PET_STAGE_NAME = ['幼体', '成体', '究极体'];

// 究极体装饰：属性色光环 + 三枚反向自转符文 + 三尖王冠
const EVOLVE_COLOR = {
  dragon:  { glow0: 'rgba(255,170,80,0.34)', glow1: 'rgba(255,90,20,0)',  rune: 'rgba(255,214,120,0.9)', crown: '#ffd54f', crownEdge: 'rgba(120,60,10,0.65)' },
  fairy:   { glow0: 'rgba(255,206,96,0.34)', glow1: 'rgba(255,80,0,0)',   rune: 'rgba(255,236,160,0.9)', crown: '#ffe08a', crownEdge: 'rgba(140,70,10,0.65)' },
  thunder: { glow0: 'rgba(150,220,255,0.34)', glow1: 'rgba(40,120,255,0)', rune: 'rgba(200,240,255,0.9)', crown: '#bfe9ff', crownEdge: 'rgba(20,70,110,0.65)' },
  frost:   { glow0: 'rgba(190,240,255,0.34)', glow1: 'rgba(60,150,255,0)', rune: 'rgba(235,252,255,0.9)', crown: '#e6f8ff', crownEdge: 'rgba(30,80,120,0.65)' },
};
function drawPetEvolvedDecor(c, x, y, r, t, type) {
  const col = EVOLVE_COLOR[type] || EVOLVE_COLOR.dragon;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const glow = c.createRadialGradient(x, y, r * 0.6, x, y, r * 2.4);
  glow.addColorStop(0, col.glow0);
  glow.addColorStop(1, col.glow1);
  c.fillStyle = glow;
  c.beginPath(); c.arc(x, y, r * 2.4, 0, Math.PI * 2); c.fill();
  c.restore();

  c.save();                                  // 环绕符文（反向自转，与符文自身自转叠加）
  c.translate(x, y);
  c.rotate(-t * 0.8);
  c.fillStyle = col.rune;
  for (let i = 0; i < 3; i++) {
    const a = i * (Math.PI * 2 / 3);
    c.save();
    c.translate(Math.cos(a) * r * 1.75, Math.sin(a) * r * 1.6);
    c.rotate(t * 1.6);
    c.beginPath();
    c.moveTo(0, -r * 0.17); c.lineTo(r * 0.11, 0); c.lineTo(0, r * 0.17); c.lineTo(-r * 0.11, 0);
    c.closePath(); c.fill();
    c.restore();
  }
  c.restore();

  c.save();                                  // 三尖王冠
  c.fillStyle = col.crown;
  c.strokeStyle = col.crownEdge;
  c.lineWidth = Math.max(1, r * 0.05);
  const cy = y - r * (type === 'dragon' ? 1.62 : 1.3);
  c.beginPath();
  c.moveTo(x - r * 0.44, cy + r * 0.22);
  c.lineTo(x - r * 0.44, cy - r * 0.12);
  c.lineTo(x - r * 0.19, cy + r * 0.03);
  c.lineTo(x, cy - r * 0.28);
  c.lineTo(x + r * 0.19, cy + r * 0.03);
  c.lineTo(x + r * 0.44, cy - r * 0.12);
  c.lineTo(x + r * 0.44, cy + r * 0.22);
  c.closePath();
  c.fill(); c.stroke();
  c.restore();
}

// 宠物模型：龙蛋（蛋形躯体 + 小翼 + 角 + 尾焰）、火焰精灵（炽核 + 环绕火舌）、
//           雷电虫（分节虫体 + 电弧）、冰冻精灵（六角冰晶 + 霜环）
// 局内与养成预览共用，t 单位为秒；opt.flash 为开火闪光；opt.stage 为**进化阶段**（V1.31）
function drawPetModel(c, x, y, r, t, type, opt) {
  opt = opt || {};
  const blink = (t % 4.2) < 0.12 ? 0.15 : 1;
  const stage = Math.min(2, Math.max(0, opt.stage | 0));
  if (stage === 1) r *= 1.12;                 // 成体：整体放大一档
  else if (stage >= 2) r *= 1.26;             // 究极体：更明显的体格 + 下面追加的进化装饰

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

    for (let i = 0; i < (stage >= 2 ? 6 : 4); i++) {
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
  } else if (type === 'thunder') {
    // ---- 雷电虫：分节虫体 + 绕体电弧 + 触角天线 ----
    const yy = y + Math.sin(t * 3.4) * r * 0.1;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const halo = c.createRadialGradient(x, yy, 0, x, yy, r * 2.2);
    halo.addColorStop(0, 'rgba(220,250,255,0.65)');
    halo.addColorStop(0.35, 'rgba(120,200,255,0.32)');
    halo.addColorStop(1, 'rgba(60,140,255,0)');
    c.fillStyle = halo;
    c.beginPath(); c.arc(x, yy, r * 2.2 * (0.95 + 0.05 * Math.sin(t * 9)), 0, Math.PI * 2); c.fill();
    c.restore();

    for (let i = 3; i >= 0; i--) {                       // 分节虫体（尾巴在前）
      const sx = x - i * r * 0.42;
      const rr = r * (0.42 + i * 0.06);
      const seg = c.createLinearGradient(sx, yy - rr, sx, yy + rr);
      seg.addColorStop(0, i === 0 ? '#eafaff' : '#bfe9ff');
      seg.addColorStop(1, i === 0 ? '#4aa8e0' : '#2f7fc0');
      c.fillStyle = seg;
      c.beginPath(); c.ellipse(sx, yy + Math.sin(t * 4 + i * 0.7) * r * 0.08, rr, rr * 0.86, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(20,64,102,0.6)';
      c.lineWidth = Math.max(1, r * 0.06);
      c.stroke();
    }
    c.strokeStyle = 'rgba(230,250,255,0.9)';             // 绕体电弧
    c.lineWidth = 1.6;
    for (let i = 0; i < 2; i++) {
      const a = t * 7 + i * 2.6;
      c.beginPath();
      c.moveTo(x - r * 0.1, yy - r * 0.7);
      c.lineTo(x + Math.cos(a) * r * 0.9, yy + Math.sin(a) * r * 0.6);
      c.lineTo(x + r * 0.5, yy + r * 0.75);
      c.stroke();
    }
    c.strokeStyle = '#7fd8ff';                            // 触角
    c.lineWidth = Math.max(1, r * 0.08);
    [-1, 1].forEach(s => {
      c.beginPath();
      c.moveTo(x + r * 0.35, yy - r * 0.5);
      c.quadraticCurveTo(x + s * r * 0.8, yy - r * 1.25, x + s * r * 0.6, yy - r * 1.5);
      c.stroke();
    });
    c.fillStyle = `rgba(255,255,255,${0.6 + 0.4 * Math.sin(t * 12)})`;
    [-1, 1].forEach(s => { c.beginPath(); c.arc(x + s * r * 0.6, yy - r * 1.5, r * 0.13, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = '#eafaff';                             // 大眼睛
    c.beginPath(); c.ellipse(x + r * 0.42, yy - r * 0.16, r * 0.2, r * 0.24 * blink, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#123a5c';
    c.beginPath(); c.arc(x + r * 0.47, yy - r * 0.16, r * 0.1, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.beginPath(); c.arc(x + r * 0.44, yy - r * 0.22, r * 0.04, 0, Math.PI * 2); c.fill();
  } else if (type === 'frost') {
    // ---- 冰冻精灵：六角冰晶核 + 双圈反向霜环 + 飘雪 ----
    const pulse = 0.95 + 0.05 * Math.sin(t * 4.2);
    c.save();
    c.globalCompositeOperation = 'lighter';
    const glow = c.createRadialGradient(x, y, 0, x, y, r * 2.3 * pulse);
    glow.addColorStop(0, 'rgba(240,255,255,0.9)');
    glow.addColorStop(0.3, 'rgba(150,230,255,0.5)');
    glow.addColorStop(1, 'rgba(90,180,255,0)');
    c.fillStyle = glow;
    c.beginPath(); c.arc(x, y, r * 2.3 * pulse, 0, Math.PI * 2); c.fill();
    c.restore();

    for (let ring = 0; ring < (stage >= 2 ? 3 : 2); ring++) {   // 霜环（进化后多一圈）
      const rr = r * (1.15 + ring * 0.35);
      const dir = ring ? -1 : 1;
      c.strokeStyle = ring ? 'rgba(190,240,255,0.55)' : 'rgba(230,250,255,0.7)';
      c.lineWidth = Math.max(1, r * 0.05);
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = t * 1.6 * dir + i * (Math.PI / 3);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.9;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.closePath();
      c.stroke();
    }
    const core = c.createLinearGradient(x, y - r, x, y + r);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.5, '#cdf1ff');
    core.addColorStop(1, '#7cc9f5');
    c.fillStyle = core;                                  // 六角冰晶
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * (Math.PI / 3);
      const px = x + Math.cos(a) * r * 0.72, py = y + Math.sin(a) * r * 0.72;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(60,130,180,0.7)';
    c.lineWidth = Math.max(1, r * 0.06);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.75)';            // 内部棱线
    c.beginPath();
    c.moveTo(x, y - r * 0.72); c.lineTo(x, y + r * 0.72);
    c.moveTo(x - r * 0.62, y - r * 0.36); c.lineTo(x + r * 0.62, y + r * 0.36);
    c.stroke();
    c.fillStyle = '#1d4a6b';                             // 眼睛
    c.beginPath(); c.ellipse(x - r * 0.24, y - r * 0.02, r * 0.1, r * 0.16 * blink, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x + r * 0.24, y - r * 0.02, r * 0.1, r * 0.16 * blink, 0, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 4; i++) {                        // 飘雪
      const lp = (t * 0.5 + i * 0.25) % 1;
      c.fillStyle = `rgba(255,255,255,${(1 - lp) * 0.8})`;
      c.beginPath();
      c.arc(x + Math.sin(t * 1.6 + i * 2) * r * 0.7, y + r - lp * r * 2.2, r * 0.1 * (1 - lp) + 0.5, 0, Math.PI * 2);
      c.fill();
    }
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

  // 究极体：属性色光环 + 环绕符文 + 王冠（V1.31 进化个体模型）
  if (stage >= 2) drawPetEvolvedDecor(c, x, y, r, t, type);

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
  if (ch.species === 1) { drawCowCharacter(c, x, y, r, ang, ch, opt); return; }   // 物种「牛来」
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
  if (opt.weapon !== false) drawHoldWeapon(c, ang, opt.weaponType, detail);
  c.restore(); c.restore();
}

// 手持武器模型（V1.31 分模型，V1.32 重做）：四把枪各有自己的剪影与配色，并且**和角色一样带一圈墨线**。
// 之前只有色块、没有轮廓，而局内角色半径只有 14，缩到 0.7 倍后枪会糊成一团色块、分不出是哪把。
// type 取 WEAPON_DEFS 的 key（rifle / shotgun / laser / sniper），未知则退回步枪。
function drawHoldWeapon(c, ang, type, detail) {
  const ink = '#16262e';
  const GUN = '#18313b';      // 枪身主色（深）
  const MID = '#26434b';      // 中间调
  const STEEL = '#8fa8a0';    // 钢件
  const PALE = '#d0d9c5';     // 高光钢件
  const WOOD = '#7a4a24';     // 木质
  const WOOD2 = '#a2683a';    // 木质受光面
  const BRASS = '#d2ae69';    // 黄铜
  const ENERGY = '#ff4d8d';   // 能量（机枪）
  const GLASS = '#c8b3ff';    // 镜片
  const poly = (pts, color, outline = true) => {
    c.fillStyle = color;
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.fill();
    if (outline) { c.strokeStyle = ink; c.lineWidth = 1; c.stroke(); }
  };
  const box = (x, y, w, h, color, outline = true) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], color, outline);
  c.save(); c.rotate(ang); c.lineJoin = 'miter'; c.lineCap = 'butt';

  if (type === 'shotgun') {
    // —— 双管霰弹：上下两根粗管 + 木质泵柄 + 机匣侧挂三颗黄铜弹壳
    poly([[1, -5], [11, -5], [12, 5], [1, 7]], WOOD);            // 木质枪托
    poly([[1, -5], [11, -5], [11, -1], [1, -1]], WOOD2, false);  // 托面受光
    box(10, -6.5, 12, 13, GUN);                                  // 机匣
    box(21, -6.2, 20, 4.6, GUN);                                 // 上管
    box(21, 1.6, 20, 4.6, GUN);                                  // 下管
    box(22, -5.4, 18, 2.4, STEEL, false);                        // 上管内壁
    box(22, 2.4, 18, 2.4, STEEL, false);                         // 下管内壁
    box(41, -6.6, 3, 5.2, MID);                                  // 上枪口
    box(41, 1.4, 3, 5.2, MID);                                   // 下枪口
    box(23, 7, 12, 5, WOOD);                                     // 木质泵柄
    box(23, 7, 12, 1.8, WOOD2, false);
    if (detail) {
      for (let i = 0; i < 3; i++) box(11.5 + i * 3, -3.6, 2.4, 3.4, BRASS, false);   // 侧挂弹壳
      box(38, -5.2, 1.6, 1.6, PALE, false);                      // 上管准星
    }
  } else if (type === 'laser') {
    // —— 能量机枪：方盒机匣 + 发光能量核心 + 直弹匣 + 开槽散热套
    poly([[2, -5], [9, -5], [9, 5], [2, 6.5]], GUN);             // 后座托
    box(8, -6.5, 18, 13, GUN);                                   // 方盒机匣
    box(9, -4.2, 7, 8.4, MID, false);                            // 核心槽
    box(10, -3, 5, 6, ENERGY, false);                            // 发光能量核心
    box(11.4, -2, 2.2, 4, '#ffd7e8', false);                     // 核心高光
    box(12, 6.5, 7, 11, MID);                                    // 直弹匣
    box(25, -4.4, 17, 8.8, GUN);                                 // 散热套
    box(26, -3.2, 15, 6.4, STEEL, false);                        // 内管
    box(41, -3, 3.5, 6, MID);                                    // 枪口
    if (detail) {
      for (let i = 0; i < 3; i++) box(28 + i * 4, -5.6, 1.8, 11.2, MID, false);      // 散热孔
      box(42, -2, 2.4, 4, ENERGY, false);                        // 枪口能量
    }
  } else if (type === 'sniper') {
    // —— 狙击枪：超长枪管 + 瞄准镜 + 两脚架 + 制退器
    poly([[2, -4.5], [12, -4.5], [13, 4.5], [2, 7]], GUN);       // 枪托
    box(3, -7.6, 8, 3.2, MID);                                   // 腮托
    box(11, -5, 14, 10, GUN);                                    // 机匣
    box(25, -1.7, 21, 3.4, STEEL);                               // 长枪管
    box(44, -2.8, 5, 5.6, MID);                                  // 制退器
    box(9, -12.4, 19, 5.6, GUN);                                 // 瞄准镜筒
    box(27, -12, 2.6, 4.8, GLASS, false);                        // 物镜
    box(9.4, -11.6, 2, 4, GLASS, false);                         // 目镜
    box(14, 4.5, 5, 6, MID);                                     // 弹匣
    if (detail) {
      box(6, -13, 4, 1.4, PALE, false);                          // 镜面反光
      poly([[34, 4], [31, 12.5], [29.5, 12], [33, 4]], MID);     // 两脚架
      poly([[34, 4], [37, 12.5], [38.5, 12], [35, 4]], MID);
      box(20, -6.2, 3, 1.6, BRASS, false);                       // 拉栓
    }
  } else {
    // —— 步枪：木质枪托 + 长护木 + 直弹匣（默认造型）
    poly([[2, -4], [12, -4], [13, 4], [2, 6.5]], WOOD);          // 木质枪托
    poly([[2, -4], [12, -4], [12, 0], [2, 0]], WOOD2, false);    // 托面受光
    box(11, -5, 12, 10, GUN);                                    // 机匣
    poly([[12, 4], [17, 4], [15, 10.5], [11, 9.5]], WOOD);       // 握把
    poly([[19, 4], [25, 4], [25.5, 11], [18.5, 11]], MID);       // 弹匣
    box(23, -3.5, 11, 7, WOOD);                                  // 护木
    box(23, -3.5, 11, 2, WOOD2, false);
    box(34, -1.8, 9, 3.6, STEEL);                                // 枪管
    box(42, -3, 4, 6, MID);                                      // 枪口消焰器
    if (detail) {
      poly([[36, -1.8], [37, -5.2], [38.6, -1.8]], MID);         // 准星
      box(31, -2.6, 2.6, 5.2, MID, false);                       // 枪管箍
      box(14, 9.5, 5, 2.4, MID, false);                          // 弹匣底板
    }
  }
  c.restore();
}

// 低模调色（V1.32）：把一个颜色按系数调亮 / 调暗，用来画「同一个体块的不同朝面」。
// 低模造型不靠渐变，体积感全靠面与面之间的**硬边色差**。
function shadeHex(hex, k) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const cl = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${cl((n >> 16) & 255)},${cl((n >> 8) & 255)},${cl(n & 255)})`;
}

// ==================== 装备特写（V1.35） ====================
// 装备页「装备台」中间的实时人物模型、以及「词条洗练」页顶部的装备特写都用这套画法。
// 武器直接复用 drawHoldWeapon（和角色手里的是同一套模型），护甲 / 饰品另画两个低模剪影。
const GEAR_TINT = {
  armor: { none: '#8d97a1', cloth: '#d9c9a3', leather: '#b07a4a', iron: '#9fb0bd', scale: '#7fd0a8', aegis: '#c8b3ff' },
  trinket: {
    none: '#8d97a1', charm: '#ffcf6b', ring: '#ff7a6b', magnet: '#8fd0ff', blood: '#e0554f', vamp: '#c1476b',
    boots: '#8fdf9f', bramble: '#7fc47a', ward: '#9fd7ff', tonic: '#ff9ab0', orb: '#ff8f7a', kit: '#efe6d0',
    coin: '#ffd54f', greed: '#ffe08a', sage: '#b28aff',
  },
};
function gearTint(id) {
  const slot = gearSlotOf(id);
  return (GEAR_TINT[slot] || {})[id] || '#9fb6ae';
}

// 护甲特写：肩甲 + 胸甲 + 腰带（低模硬边，与角色美术同源）
function drawArmorModel(c, r, color) {
  const ink = '#16262e';
  c.save(); c.scale(r / 30, r / 30); c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = ink; c.lineWidth = 2;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-20, -20); c.lineTo(20, -20); c.lineTo(24, 6); c.lineTo(0, 26); c.lineTo(-24, 6);
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = shadeHex(color, 1.28); c.beginPath();
  c.moveTo(-20, -20); c.lineTo(0, -20); c.lineTo(0, 26); c.lineTo(-24, 6); c.closePath(); c.fill();
  c.fillStyle = shadeHex(color, 0.62); c.beginPath();
  c.moveTo(20, -20); c.lineTo(24, 6); c.lineTo(0, 26); c.lineTo(0, -20); c.closePath(); c.fill();
  c.fillStyle = shadeHex(color, 1.12); c.strokeStyle = ink; c.lineWidth = 2;
  for (const side of [-1, 1]) {
    c.beginPath(); c.ellipse(side * 27, -18, 13, 9, side * 0.35, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  c.strokeStyle = '#16262e88'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(0, -20); c.lineTo(0, 26); c.stroke();
  c.fillStyle = '#d2ae69'; c.strokeStyle = ink; c.lineWidth = 2;
  c.fillRect(-22, 10, 44, 9); c.strokeRect(-22, 10, 44, 9);
  c.fillStyle = '#8a6a2e'; c.fillRect(-5, 12, 10, 5);
  c.restore();
}

// 饰品特写：三类造型（戒指 / 宝石 / 护符），按 id 分派
const TRINKET_SHAPE = {
  ring: ['ring', 'ward', 'magnet'],
  gem: ['blood', 'orb', 'coin', 'greed', 'sage', 'charm'],
  amulet: ['vamp', 'bramble', 'tonic', 'kit', 'boots'],
};
function trinketShapeOf(id) {
  for (const k of Object.keys(TRINKET_SHAPE)) if (TRINKET_SHAPE[k].includes(id)) return k;
  return 'gem';
}
function drawTrinketModel(c, r, color, shape) {
  const ink = '#16262e';
  c.save(); c.scale(r / 30, r / 30); c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = ink; c.lineWidth = 2;
  if (shape === 'ring') {
    c.fillStyle = shadeHex(color, 0.72);
    c.beginPath(); c.arc(0, 4, 20, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#0d1f25';
    c.beginPath(); c.arc(0, 4, 11, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = color;
    c.beginPath(); c.moveTo(0, -29); c.lineTo(11, -17); c.lineTo(0, -5); c.lineTo(-11, -17); c.closePath();
    c.fill(); c.stroke();
    c.fillStyle = shadeHex(color, 1.4);
    c.beginPath(); c.moveTo(0, -29); c.lineTo(0, -5); c.lineTo(-11, -17); c.closePath(); c.fill();
  } else if (shape === 'amulet') {
    c.fillStyle = shadeHex(color, 0.6);
    c.beginPath();
    c.moveTo(-16, -26); c.lineTo(-4, -6); c.lineTo(4, -6); c.lineTo(16, -26);
    c.lineTo(10, -32); c.lineTo(0, -18); c.lineTo(-10, -32); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = color;
    c.beginPath(); c.ellipse(0, 8, 17, 20, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = shadeHex(color, 1.35);
    c.beginPath(); c.ellipse(-6, 2, 6, 9, 0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.arc(-7, 0, 3, 0, Math.PI * 2); c.fill();
  } else {
    c.fillStyle = color;
    c.beginPath(); c.moveTo(0, -27); c.lineTo(20, -4); c.lineTo(0, 25); c.lineTo(-20, -4); c.closePath();
    c.fill(); c.stroke();
    c.fillStyle = shadeHex(color, 1.4);
    c.beginPath(); c.moveTo(0, -27); c.lineTo(0, 25); c.lineTo(-20, -4); c.closePath(); c.fill();
    c.fillStyle = shadeHex(color, 0.6);
    c.beginPath(); c.moveTo(0, -27); c.lineTo(20, -4); c.lineTo(0, 25); c.closePath(); c.fill();
    c.strokeStyle = '#ffffff55'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-10, -6); c.lineTo(0, 2); c.stroke();
  }
  c.restore();
}

// 装备特写总入口：武器 → drawHoldWeapon；护甲 / 饰品 → 上面两个低模剪影
// r = 期望的「半尺寸」（像素）。武器按长度 ≈ 2.6r 反推缩放，剪影天然就是 r 的 ~1.8 倍。
function drawGearSolo(c, id, r) {
  const slot = gearSlotOf(id);
  const color = gearTint(id);
  if (slot === 'weapon' && WEAPON_DEFS[id]) {
    const k = r / 18;
    c.save();
    c.scale(k, k);
    c.translate(-24, -2);        // 枪的包围盒中心（x 1~47，y -13~17）
    drawHoldWeapon(c, 0, id, true);
    c.restore();
    return;
  }
  if (slot === 'armor' && ARMOR_DEFS[id]) drawArmorModel(c, r, color);
  else drawTrinketModel(c, r, color, trinketShapeOf(id));
}

// 物种「牛来」：按 2026 年那部《牛来》里的**低模小牛**造型画 —— 多边形体块、硬边、扁平色、圆点眼、
// 四肢僵直不带关节。电影设定是「现实段落四脚着地、梦境段落两脚站立」，游戏里自然是两脚站立。
// 与默认福瑞共用同一套 毛色 / 服装 / 头饰 / 眼睛 / 体型 选项：毛色 = 牛的体块主色。
function drawCowCharacter(c, x, y, r, ang, ch, opt = {}) {
  const fur = CHAR_FUR[ch.fur] || CHAR_FUR[0];
  const cloth = CHAR_CLOTH[ch.cloth] || CHAR_CLOTH[0];
  const eye = CHAR_EYE[ch.eye] || CHAR_EYE[0];
  const pose = characterPose(opt.time ?? gameTime, opt.phase || 0);
  const detail = r >= 22;
  const ink = '#16262e';
  const cBase = fur.color;                        // 体块主色
  const cLit = shadeHex(cBase, 1.26);             // 受光面
  const cMid = shadeHex(cBase, 1.0);              // 主面
  const cDim = shadeHex(cBase, 0.72);             // 背光面
  const cDark = fur.dark;                         // 蹄 / 角根 / 深斑
  const ellipse = (px, py, rx, ry, color) => {
    c.fillStyle = color; c.beginPath(); c.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); c.fill();
  };
  const shape = (points, color, outline = true) => {
    c.fillStyle = color; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p));
    c.closePath(); c.fill();
    if (outline) { c.strokeStyle = ink; c.lineWidth = 1.1; c.stroke(); }
  };
  const line = (points, color, width = .7) => {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath();
    points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.stroke();
  };
  // 只描一圈闭合轮廓（不填充）。用法：先把各个「面」无描边地填完，最后补这一圈 ——
  // 否则后填的受光面 / 背光面会把最外圈墨线的内半边盖掉，导致轮廓粗细不均。
  const edge = (points, width = 1.1) => {
    c.strokeStyle = ink; c.lineWidth = width; c.beginPath();
    points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.stroke();
  };
  c.save(); c.translate(x, y); c.scale(r / 20, r / 20); c.lineJoin = 'miter'; c.lineCap = 'butt';
  ellipse(0, 18, 21, 5, '#06191c55');

  // 牛尾：从**臀部**往左后下方垂的一根直尾杆 + 末端一块深色尾穗（低模不画曲线，两段折线即可）。
  // 起点放在臀部而不是绕点旋转：绕点旋转会把尾巴竖到左臂那一列，和胳膊连成一条同色竖块、看不出是尾巴。
  const sw = pose.tail * 2.5;
  shape([[-11, 6], [-15, 8], [-19 + sw, 14], [-14.5 + sw, 15.5]], cDim);
  shape([[-19 + sw, 14], [-14.5 + sw, 15.5], [-16 + sw, 20], [-20.5 + sw, 18.5]], cDark);

  // 两脚站立：僵直的方柱腿 + 布鞋（电影里那双旧布鞋）
  for (const side of [-1, 1]) {
    shape([[side * 4, 5], [side * 12, 5], [side * 11, 15], [side * 5, 15]], cDim);
    shape([[side * 5, 15], [side * 11, 15], [side * 13, 19], [side * 3, 19]], '#6f6a5c');
    shape([[side * 5, 15.4], [side * 11, 15.4], [side * 11, 17], [side * 5, 17]], '#8d8878', false);
    line([[side * 4, 5], [side * 12, 5]], ink, 1);                        // 髋部一条硬边，强调「方块腿」
  }

  c.save(); c.translate(0, pose.breath);
  // 躯干：**左右对称**的七边形低模体块 —— 顶面受光、主面中、右侧一块背光，体积全靠硬边色差。
  // 受光面 / 背光面都**不描边**、最后统一补一圈轮廓：低模的体积感只来自色块分界。
  const cowBody = [[-14, -13], [14, -13], [16, -5], [12, 8], [0, 10], [-12, 8], [-16, -5]];
  shape(cowBody, cMid, false);
  shape([[-14, -13], [14, -13], [11, -19], [-11, -19]], cLit, false);
  shape([[14, -13], [16, -5], [12, 8], [9, 6], [12, -3], [12, -12]], cDim, false);
  edge(cowBody);
  // 布衫（交领）：服装色的一块硬边梯形 + 深色斜襟（交领本来就不对称，这一处刻意保留）
  shape([[-12, -7], [12, -7], [11, 3], [-11, 3]], cloth.color);
  shape([[-12, -7], [1, -7], [-11, 3]], shadeHex(cloth.color, 0.7), false);
  shape([[-13, 2], [13, 2], [12, 8], [-12, 8]], '#31404a');               // 腰带
  shape([[-3, 1], [3, 1], [3, 8], [-3, 8]], '#d9b773');                   // 扣具
  c.fillStyle = '#6c694c'; c.fillRect(-1.4, 3, 2.8, 2);
  if (detail) line([[-10, -12], [10, -12]], '#ffffff44', 1);              // 肩线一道受光棱线
  // 手臂：一根硬边方柱 + 一块深色蹄（低模不做关节，整条手臂就是一根方块）
  for (const side of [-1, 1]) {
    shape([[side * 12, -5], [side * 19, -5], [side * 18, 6], [side * 13, 6]], cDim);
    shape([[side * 13, 6], [side * 18, 6], [side * 17, 10], [side * 14, 10]], cDark);
    line([[side * 12, -5], [side * 19, -5]], ink, 1);
  }
  // 下垂大耳：**先于头绘制**，耳根一路伸进头里由头盖住 —— 这样既不会露出接缝，也不会在脸内侧留下一道多余的描边。
  // 耳形是一块硬边梯形，整体绕耳根往外转 ~0.42rad，所以耳尖朝下外方垂（偶尔轻抖）。
  for (const side of [-1, 1]) {
    c.save(); c.translate(side * 11, -30); c.rotate(side * (0.42 + pose.ear * 0.6));
    shape([[0, -4], [side * 13, -2], [side * 12, 6], [0, 5]], cMid);
    shape([[side * 3, -1], [side * 11, 0], [side * 10, 5], [side * 3, 4]], '#d8a49a', false);
    c.restore();
  }
  // 头：一整块**左右对称**的八边形低模方头 —— 顶面受光、正面主色、右侧背光，体积全靠硬边色差；不画渐变
  const cowHead = [[-15, -24], [-13, -37], [13, -37], [15, -24], [15, -20], [9, -15], [-9, -15], [-15, -20]];
  shape(cowHead, cMid, false);
  shape([[-13, -37], [13, -37], [11, -33], [-11, -33]], cLit, false);
  shape([[11, -33], [13, -37], [15, -24], [15, -20], [12, -20], [12, -31]], cDim, false);
  edge(cowHead);
  // 一撮呆毛（硬边小三角，居中）
  shape([[-3, -37], [0, -44], [3, -37]], cDark, false);
  // 双角：两块硬边三角翻在头顶两侧（小牛犊的短角，不做弯曲）
  // 角是**深棕色**（原片描述：橘黄色的身体、肉色口鼻、两只深棕色的角），所以不能画成奶油色
  for (const side of [-1, 1]) {
    shape([[side * 7, -37], [side * 14, -45], [side * 11, -34]], '#5c3a26');
    shape([[side * 7, -37], [side * 11, -34], [side * 6, -33]], '#3d2517', false);
  }
  // 眼睛：低模的「木讷眼」—— 一块深色眼窝 + 一块**纯色方形瞳孔**，不画高光、不做瞳孔分层。
  // 原片就是这样（「瞳孔只是几个简单的几何色块」），所以这里刻意不画让眼睛「活起来」的反光。
  const look = Math.cos(ang) * 1.1;
  for (const side of [-1, 1]) {
    const ex = side * 6.5;
    c.save(); c.translate(ex + look, -26); c.scale(1, pose.blink);
    ellipse(0, 0, 2.9, 3, '#2b2b33');
    shape([[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]], eye.color, false);
    c.restore();
    line([[ex - 2.6, -31], [ex + 2.6, -31.4]], ink, 1);   // 平直一道眉，低模不做弧度
  }
  // 肉色口鼻（原片描述「肉色口鼻」）：一块硬边梯形 + 两个方鼻孔 + 嘴线
  shape([[-11, -19], [11, -19], [9, -9], [-9, -9]], '#dfa79c');
  shape([[3, -19], [11, -19], [9, -9], [2, -9]], '#c68c84', false);      // 右半块背光
  shape([[-5.5, -17], [-1.5, -17], [-1.5, -13.5], [-5.5, -13.5]], '#8d5b5c', false);
  shape([[1.5, -17], [5.5, -17], [5.5, -13.5], [1.5, -13.5]], '#8d5b5c', false);
  line([[-7, -10.8], [7, -10.8]], '#c98387', 1);
  // 围巾：一块硬边三角巾，不画飘带弧线
  shape([[9, -7], [18, pose.scarf], [21, 8 + pose.scarf], [13, 4]], '#bd824d');
  line([[14, -1], [17, 4 + pose.scarf]], '#f5cc84', 0.7);
  drawHat(c, 0, -30, 15, ch.hat);
  if (opt.weapon !== false) drawHoldWeapon(c, ang, opt.weaponType, detail);   // 武器与福瑞共用同一套模型
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

// 把画布按它的 CSS 尺寸（×DPR）配好并清空，返回逻辑尺寸 { c, w, h }。
// 装备台 / 宠物台 / 铁砧特写这些「容器自适应」的画布都走这里。
function prepCanvas(cv) {
  const dpr = canvasDpr();
  const w = Math.max(1, Math.round(cv.clientWidth || cv.width));
  const h = Math.max(1, Math.round(cv.clientHeight || cv.height));
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  return { c, w, h };
}

// 共用展示台背景：光环 + 地面阴影 + 符文圆台（人物 / 宠物特写都用它）。
// 台面锚在画布底部，所以人物只要按 h 反推 cy 就能「站」在台上。s = 整体缩放。
function paintStageBase(c, w, h, cy, s = 1, halo = null) {
  const g = c.createRadialGradient(w / 2, cy, 4, w / 2, cy, 92 * s);
  (halo || [['rgba(130,216,184,0.20)', 0], ['rgba(255,213,79,0)', 1]])
    .forEach(([col, at]) => g.addColorStop(at, col));
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);

  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath();
  c.ellipse(w / 2, h - 20, 32 * s, 8 * s, 0, 0, Math.PI * 2);
  c.fill();

  // 符文展示台：固定几何，不引入随机数影响玩法。
  c.strokeStyle = '#9fcdb75c'; c.lineWidth = 1;
  c.beginPath(); c.ellipse(w / 2, h - 19, 64 * s, 15 * s, 0, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#f2cc8359';
  c.beginPath(); c.ellipse(w / 2, h - 19, 51 * s, 11 * s, 0, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    c.fillStyle = '#b8d5ae';
    c.fillRect(w / 2 + Math.cos(a) * 64 * s - 1, h - 20 + Math.sin(a) * 15 * s, 2, 2);
  }
}

// 展示台缩放：越大的画布台面越大，但钳在 [0.8, 1.5] 之间，避免超大 / 超小屏走形
function stageScale(w, h) { return Math.max(0.8, Math.min(1.5, Math.min(w, h) / 200)); }

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

    const cy = h * 0.70;   // 脚底落地，呼吸和摇尾由模型自身驱动。
    paintStageBase(c, w, h, cy, 1);
    const r = item.r * charScale() * item.scale;
    drawCharacter(c, w / 2, cy, r, -0.25, meta.character, { weapon: true, time: t / 1000 });
  });
}

// 装备台：实时渲染人物（含当前出战的武器），画布随容器尺寸自适应
const GEAR_STAGE_CANVASES = [
  { id: 'gear-stage', rad: 0.30 },         // 装备台正中
];

function renderGearPreviews(t) {
  const wt = (meta.equipped.weapon && meta.equipped.weapon !== 'none') ? meta.equipped.weapon : 'rifle';
  GEAR_STAGE_CANVASES.forEach(item => {
    const cv = document.getElementById(item.id);
    if (!cv || !cv.offsetParent) return;
    const { c, w, h } = prepCanvas(cv);
    const r = Math.min(w, h) * item.rad * charScale();
    const cy = h - 26 - r * 0.95;
    paintStageBase(c, w, h, cy, stageScale(w, h));
    drawCharacter(c, w / 2, cy, r, -0.25, meta.character, { weapon: true, time: t / 1000, weaponType: wt });
  });
}

// 铁砧页上方：那一件装备自己的特写（武器 / 护甲 / 饰品各有自己的低模）
function renderGearSolo() {
  const cv = document.getElementById('gear-anvil-stage');
  if (!cv || !cv.offsetParent) return;
  const id = equipSelId;
  if (!id || !gearDef(id)) return;
  const { c, w, h } = prepCanvas(cv);
  const cy = h * 0.62;
  paintStageBase(c, w, h, cy, stageScale(w, h));
  c.save();
  c.translate(w / 2, cy);
  drawGearSolo(c, id, Math.min(w, h) * 0.36);      // 悬在展示台上方（cy 略高于台面）
  c.restore();
}

// 宠物台 / 铁砧特写：与局内共用 drawPetModel，附带等级 / 星级光环
let petPreviewSel = null;      // 当前预览的宠物 id
const PET_STAGE_CANVASES = [
  { id: 'pet-stage', rad: 0.16 },
  { id: 'pet-anvil-stage', rad: 0.15 },
];

function renderPetPreviews(t) {
  PET_STAGE_CANVASES.forEach(item => {
    const cv = document.getElementById(item.id);
    if (!cv || !cv.offsetParent) return;
    const { c, w, h } = prepCanvas(cv);
    const sel = petPreviewSel || meta.equipped.pet;
    const type = (sel && sel !== 'none' && PET_DEFS[sel]) ? sel : 'dragon';
    const d = petDev(type);
    const bob = Math.sin(t / 700) * 6;
    const cy = h * 0.52 + bob;
    const halo = d.star >= 3
      ? [['rgba(255,213,79,0.30)', 0], ['rgba(255,213,79,0)', 1]]
      : [['rgba(255,150,60,0.18)', 0], ['rgba(255,213,79,0)', 1]];
    paintStageBase(c, w, h, cy, stageScale(w, h), halo);
    if (d.star >= 3) {
      for (let i = 0; i < d.star; i++) {
        const ang = t / 900 + i * (Math.PI * 2 / d.star);
        c.fillStyle = 'rgba(255,236,150,0.9)';
        c.beginPath();
        c.arc(w / 2 + Math.cos(ang) * 52, cy + Math.sin(ang) * 34, 2.2, 0, Math.PI * 2);
        c.fill();
      }
    }
    drawPetModel(c, w / 2, cy, Math.min(w, h) * item.rad, t / 1000, type, { stage: petStage(d) });
  });
}

function charPreviewLoop(t) {
  const menu = document.getElementById('menu');
  if (menu && !menu.classList.contains('hidden')) {
    renderCharPreviews(t);
    renderPetPreviews(t);
    renderGearPreviews(t);
    renderGearSolo();
  }
  requestAnimationFrame(charPreviewLoop);
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
  return (MOB_TYPES.has(type) && rngCombat() >= MOB_COIN_CHANCE) ? 0 : base;
}

const ENEMY_TYPES = {
  grunt:  { hp: 52,  speed: 70,  r: 21, dmg: 11, color: '#e05555', xp: 12, coin: 1 },   // V1.35：小怪基础血量整体 +12% 左右（46 → 52）
  fast:   { hp: 30,  speed: 130, r: 19, dmg: 7,  color: '#f0a030', xp: 9,  coin: 1 },   // 速度最快的贴身怪：体型单独再放大，避免在拉远的视角下显得过小
  ranged: { hp: 50,  speed: 55,  r: 20, dmg: 10, color: '#d98bd0', xp: 15, coin: 1, range: 300, shootInterval: 1.4, bulletSpeed: 220 },
  elite:  { hp: 165, speed: 62,  r: 28, dmg: 16, color: '#b05fe0', xp: 55,  coin: 2 },   // V1.24：改为「低压成群」的小精英，强度交给词缀（见 AFFIX_DEFS）
  boss:   { hp: 2600, speed: 35, r: 46, dmg: 30, color: '#c0392b', xp: 320, coin: 25 },   // V1.25：体型 40 → 46；V1.26.1：接触 38 → 30（玩家初始血池只有 100）

  // ---- 特殊敌人 ----
  bomber:  { hp: 45, speed: 100, r: 20, dmg: 0,  color: '#8a4a2a', xp: 14, coin: 1, boomR: 72, boomDmg: 30 },
  hunter:  { hp: 58, speed: 48,  r: 21, dmg: 9,  color: '#d06a8a', xp: 17, coin: 1, range: 340, shootInterval: 2.4, bulletSpeed: 130, homing: true },
  healer:  { hp: 72, speed: 52,  r: 23, dmg: 6,  color: '#4dd07a', xp: 22, coin: 1, healR: 200, healAmount: 20, healInterval: 2.4 },
  shielder:{ hp: 78, speed: 62,  r: 24, dmg: 12, color: '#5fb0d0', xp: 20, coin: 1, giftR: 170, giftAmount: 20, giftInterval: 4 },
  summoner:{ hp: 98, speed: 44,  r: 25, dmg: 9,  color: '#a06cd0', xp: 24, coin: 1, summonInterval: 5 },

  // 树木被长时间靠近后苏醒的树怪（血量较厚，仅由场景树木转化而来）
  treant:  { hp: 265, speed: 34,  r: 36, dmg: 24, color: '#5f8b4c', xp: 90, coin: 3 },
};

// 「重装单位」：基础血量本来就高，如果吃满整条成长曲线，后期血量会反超首领。
// 这里把它们的曲线折半（倍率 = 1 + (全场倍率 - 1) × 系数），保留前期的基数优势。
const HEAVY_HP_CURVE = { elite: 0.5, treant: 0.5 };

// ---- 自爆怪（V1.31 重做）----
// 三条行为：① 靠近玩家到「引信距离」立刻点燃引信（短暂蓄爆后炸）；② 被击杀改为**延迟引信**爆炸
//          （留出拉开距离的窗口）；③ 爆炸**敌我不分**，对范围内的小兵与其它怪物都造成伤害。
const BOMBER_FUSE = {
  near: 0.5,      // 贴身引信时长（秒）
  death: 0.6,     // 被击杀后的延迟引信时长（秒）
  radius: 0.6,    // 触发引信的距离 = (boomR + 小兵半径) × 这个系数
};

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
    out.push(pool.splice(Math.floor(rngWorld() * pool.length), 1)[0]);
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

// ---- 首个 Boss 的出场演出（V1.31）----
// 开局第一只 Boss 不再「凭空出现」，而是先在玩家脚底画一个预警圈读秒，然后从空中砸下并造成一次高额范围伤害。
// 只对**本局第一只** Boss 生效（bossDropDone 标记），后续 Boss 保持原来的即时入场。
const BOSS_DROP = {
  wind: 2.6,       // 预警读秒时长（秒）
  r: 190,          // 落地范围伤害半径
  dmg: 45,         // 落地基础伤害（再乘 difficulty）
  from: 560,       // 从多高的「天上」砸下来（表现用）
};
let bossDrop = null;         // { x, y, t, maxT, pending } —— pending 是已构造好、等落地才入场的首领
let bossDropDone = false;    // 本局是否已经播过首王出场演出

// ---- 首领「灵活性」层（V1.25 新增）----
// 首领移速只有 28~40，而部队是 240 —— 直线追击毫无意义，首领实质是「站着放技能的炮台」。
// 所以这一层不加基础移速（数值不动），而是给它两件事：
//   ① 轨道走位：维持各自的中距离 + 横向绕圈（玩家不能再无脑绕背）；
//   ② 位移：冲锋者冲刺 / 分裂者突进（爆发式移动，比堆移速更可控、也更好读）。
// 旧版的「滑步闪避」已全部取消（V1.25.1）：首领横移一下会让技能前摇读不清、表现突兀。
// 弹幕者「后跃 180」与召唤者「闪现 340」（两种纯挪位置、无伤害的位移）也于 V1.25.1 注释停用，代码保留以便恢复。
// V1.26.2：径向修正改按偏差比例给（旧版是开关式，会停在死区边缘）。
// V1.26.3：不再周期性翻转绕行方向 —— 首领只有 28~40 移速（60 秒才走 168° 的弧），
//   每 6~11s 折返一次等于「走一小段就原路退回」，实测 60 秒净绕行只有 -26°，看着像走蛇形。
const BOSS_MOVE = {
  band: 45,          // 径向修正满速带宽：偏差达到这个量给满速，内部按比例缩放（不再是开关式的 0/±1）
  strafe: 0.9,       // 绕圈速度占基础移速的比例
  turnRate: 3.2,     // 朝向平滑角速度（rad/s），防止每帧抖动
};
// const BOSS_LEAP = { time: 0.3 };         // （V1.25.1 停用）通用位移时长（速度 = 距离 / 时长），仅弹幕者后跃用
const BOSS_SHOCK = { r: 150, dmg: 20 };     // 冲锋落点震波
const BOSS_SUMMON = { wind: 0.9, r: 150 };  // 召唤阵：预警时长 / 阵半径
const BOSS_BITE = { speed: 760, time: 0.26, dmg: 20 };   // 分裂者突进撕咬
// const BOSS_BLINK = { r: 340, cd: 6 };    // （V1.25.1 停用）召唤者贴身闪现

// ==================== 敌人出招预警（V1.35 第二阶段需求 3） ====================
// 验收标准：敌人技能在真正造成伤害之前，至少有 0.5 秒的可视前摇。
//   · 远程怪 / 猎手：开火前 0.55s 亮起蓄能光点并拉出瞄准线，之后才发射
//   · 首领八向弹幕：0.5s 蓄能环；首领冲锋本来就有 1.0s 蓄力指示带（连冲段夹到 0.5s）
//   · 精英近战：贴身后 0.5s 的挥击前摇（地面上画红色扇环）
// 普通小怪（grunt / fast）的贴身碰撞不算「技能」，保持即时结算 —— 否则前期手感会变得很钝。
const ENEMY_WARN_MIN = 0.5;
const ENEMY_WARN_SHOT = 0.55;


// 武器（局外携带，攻击间隔作为 CD）
// V1.31：武器也进入装备体系 —— `cost` / `desc` 供装备页展示，`affixCount` = 词条条数上限，
//        武器词条走**专属池** WEAPON_AFFIXES，伤害落在该武器自己的独立乘区 w.dmgMul。
const WEAPON_DEFS = {
  rifle:  { name: '步枪', cost: 0, desc: '单发直射', affixCount: 3, dmg: 17, reload: 0.9, speed: 640, range: 380, color: '#ffe066', baseCount: 1 },
  shotgun:{ name: '散弹', cost: 600, desc: '扇形多发弹丸', affixCount: 3, dmg: 7,  reload: 1.4, speed: 560, range: 300, color: '#9be060', baseCount: 6, spread: 0.28, offset: 5, falloff: { near: 110, far: 170, nearMul: 1.4, farMul: 0.35 } },   // 6 枚弹丸 · 弹道自枪口起就是发散扇形（V1.23 去掉 converge 收束，不再交叉）
  laser:  { name: '机枪', cost: 900, desc: '高速连射', affixCount: 3, dmg: 9,  reload: 0.35, speed: 900, range: 420, color: '#ff4d8d', baseCount: 1 },
  sniper: { name: '狙击枪', cost: 1200, desc: '高额单发伤害 · 自带穿透 · 射速很慢', affixCount: 3, dmg: 34, reload: 2.0, speed: 1150, range: 520, color: '#c8b3ff', baseCount: 1, pierce: 1, tracer: true },
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

// 宠物（4 只，各带一种元素与专属技能线）
// elem 决定普攻附带的状态：fire 点燃 / lightning 麻痹（短暂定身）/ ice 减速
// 局外养成路线见 PET_TREES：普攻强化 + 3 个技能节点（等级前置），技能本体在局内攒满能量才释放。
// V1.28：宠物定位为「辅助」—— 普攻与技能基础值整体下调约 40%（见 docs/需求方案.md 4.4 的实测 DPS）。
const PET_DEFS = {
  dragon:  { name: '龙蛋',     elem: 'fire',      dmg: 5, range: 360, shootInterval: 1.0,  bulletSpeed: 420, color: '#ff8a5c', burnDps: 4, burnTime: 1 },
  fairy:   { name: '火焰精灵', elem: 'fire',      dmg: 4, range: 340, shootInterval: 0.6,  bulletSpeed: 460, color: '#ffb347', burnDps: 3, burnTime: 0.8 },
  thunder: { name: '雷电虫',   elem: 'lightning', dmg: 4, range: 380, shootInterval: 0.85, bulletSpeed: 520, color: '#9de0ff', chainMax: 2, chainFalloff: 0.6, stunChance: 0.25, stunTime: 0.45 },
  frost:   { name: '冰冻精灵', elem: 'ice',       dmg: 4, range: 360, shootInterval: 0.9,  bulletSpeed: 440, color: '#8fe3ff', slowMul: 0.6, slowTime: 1.6, freezeChance: 0.12, freezeTime: 0.9 },
};

// 宠物技能（每只 3 个，局外「天赋树加点解锁」）
// V1.28 起**不再按 CD 到点就放**：宠物普攻命中会积攒「能量」，能量攒满后按「大招 → 技能2 → 技能1」的
//   优先级释放第一个不在 CD 的技能（CD 保留，作为「同一技能别连着放」的下限）。
// req = 解锁所需宠物等级；dmg 只是基准值，实际伤害走「宠物乘区」，所以不会抢武器的主输出
const PET_SKILLS = {
  dragon: [
    { id: 'breath',  name: '喷火',   req: 3,  cd: 7,  dmg: 3, burnDps: 4,  range: 240, arc: 0.62, dur: 2.4, tick: 0.3, desc: '宠物朝敌人持续喷出扇形火焰（跟着宠物与目标走）：2.4 秒内每 0.3 秒对范围内敌人造成火焰伤害并点燃' },
    { id: 'cyclone', name: '火龙卷', req: 6,  cd: 13, dmg: 17, burnDps: 5,  range: 300, r: 135, dur: 2.6, pull: 95, desc: '在敌人脚下卷起火焰漩涡：把周围敌人吸向中心（聚怪），并造成一次燃烧伤害与持续点燃' },
    { id: 'awe',     name: '龙威',   req: 10, cd: 30, r: 260, dur: 6, tick: 2, vuln: 0.5, desc: '大招：周期性威慑周围敌人并标记它们，宠物与玩家对被标记的敌人造成 1.5 倍伤害' },
  ],
  fairy: [
    { id: 'fireball', name: '火球',   req: 3,  cd: 5,  dmg: 13, burnDps: 4, aoe: 90, desc: '甩出一枚火球，落点小范围爆炸并点燃' },
    { id: 'lava',     name: '熔岩',   req: 6,  cd: 10, dmg: 4,  burnDps: 4, r: 95, dur: 6, tick: 0.5, desc: '在目标敌人脚下铺开熔岩，持续 6 秒：每 0.5 秒造成火焰伤害并点燃' },
    { id: 'meteor',   name: '豪火球', req: 10, cd: 30, dmg: 24, burnDps: 6, r: 165, desc: '大招：从空中砸下大火球，落点大范围一次性火焰爆炸并点燃' },
  ],
  thunder: [
    { id: 'chain', name: '连锁闪电', req: 3,  cd: 6,  dmg: 12, range: 340, jumps: 4, jumpFalloff: 0.7, stunChance: 0.4, stunTime: 0.6, desc: '向最近敌人放出一道连锁闪电，在最多 4 个敌人之间弹跳（每跳伤害 ×0.7），命中后 40% 概率麻痹 0.6s' },
    { id: 'field', name: '雷电场',   req: 6,  cd: 12, dmg: 4,  r: 160, dur: 4, tick: 0.5, slowMul: 0.5, slowTime: 0.8, stunChance: 0.25, stunTime: 0.4, desc: '自身周围张开电圈（跟着部队走），持续 4 秒：每 0.5 秒造成电击伤害并减速 50%，每次有 25% 概率麻痹 0.4s' },
    { id: 'storm', name: '雷暴',     req: 10, cd: 30, dmg: 14, r: 80, strikes: 10, span: 340, stunChance: 0.35, stunTime: 0.6, desc: '大招：在周围连续落下 10 道雷，每道小范围电击伤害并有 35% 概率麻痹 0.6s' },
  ],
  frost: [
    { id: 'nova',   name: '霜冻新星', req: 3,  cd: 8,  dmg: 10, r: 180, freezeTime: 1.5, desc: '自身周围炸开寒潮：范围冰霜伤害并冻结敌人 1.5s' },
    { id: 'chill',  name: '冰霜领域', req: 6,  cd: 12, dmg: 4,  r: 150, dur: 5, tick: 0.5, slowMul: 0.45, slowTime: 1.0, freezeChance: 0.12, freezeTime: 1.0, desc: '在敌人脚下铺开寒冰地带，持续 5 秒：每 0.5 秒造成冰霜伤害并减速 55%，每次有 12% 概率冻结 1s（≈每 1.5 秒 32%）' },
    { id: 'zero',   name: '绝对零度', req: 10, cd: 30, dmg: 18, r: 320, freezeTime: 2.5, vuln: 0.3, dur: 6, desc: '大招：大范围冻结敌人 2.5s，并让它们 6 秒内受到的伤害提高 30%' },
  ],
};

// ==================== 宠物养成（局外） ====================
const PET_DEV_CFG = {
  lvMax: 20,
  starMax: 5,
  shardPerStar: 10,     // 升 1 星所需碎片
  expPerDmg: 0.1,       // 宠物造成 10 点伤害 = 1 点熟练度
  skillMax: 3,          // 每个技能节点最多投 3 点
  cdPerPoint: 0.08,     // 技能节点：每点冷却 -8%
  powerPerPoint: 0.15,  // 技能节点：每点效果（伤害 / 范围 / 持续）+15%
  chargeMax: 100,       // 技能能量上限：攒满才释放（V1.28 充能制）
  chargePerHit: 10,     // 宠物普攻每命中 1 个敌人积攒的能量（弹跳 / 贯穿的多目标会攒得更快）
};
// 升到下一级所需熟练度
function petExpNeed(lv) { return 30 + (lv - 1) * 15; }

// 宠物蛋（V1.28）：开蛋**不保证出宠物** —— 有概率直接孵出，否则给该宠物的**能量碎片**；
//   能量攒满 PET_ENERGY_NEED 后可手动「合成」该宠物；已拥有该宠物时开对应蛋只给能量（拿去升星）。
const EGG_DIRECT = { random: 0.25, fixed: 0.30 };            // 直接孵出宠物的概率
const EGG_ENERGY = { random: [20, 30], fixed: [50, 70] };    // 没孵出时的能量碎片区间
const PET_ENERGY = { dragon: '龙魂', fairy: '火元素', thunder: '雷元素', frost: '冰元素' };
const PET_ENERGY_NEED = 100;                                 // 能量满 100 可合成该宠物
const EGGS = {
  normal:  { name: '宠物蛋',     cost: 200, kind: 'random', desc: '随机挑一只还没合成的宠物，25% 直接孵出，否则给它的能量碎片。' },
  dragon:  { name: '龙蛋',       cost: 480, pet: 'dragon',  desc: '30% 直接孵出龙蛋，否则给龙魂。已拥有则只给龙魂。' },
  fairy:   { name: '火焰精灵蛋', cost: 560, pet: 'fairy',   desc: '30% 直接孵出火焰精灵，否则给火元素。已拥有则只给火元素。' },
  thunder: { name: '雷电虫蛋',   cost: 560, pet: 'thunder', desc: '30% 直接孵出雷电虫，否则给雷元素。已拥有则只给雷元素。' },
  frost:   { name: '冰冻精灵蛋', cost: 560, pet: 'frost',   desc: '30% 直接孵出冰冻精灵，否则给冰元素。已拥有则只给冰元素。' },
};
// 该宠物当前的能量碎片（未拥有时用于合成；已拥有时用于升星）
function petEnergyOf(id) { return petDev(id).energy || 0; }

// 养成路线：普攻强化 + 3 个技能**专精**节点（每 2 级 1 点天赋，每节点最多 3 点）
// V1.29：技能本体改为**局内三选一**（见 buildUpgradePool 的 pet-skill 卡），
//         这里的技能节点只决定「选中那个技能后它有多强」——每点 冷却 -8% / 效果 +15%。
function petTree(id) {
  const atk = { id: 'atk', name: '基础强化', reqLv: 1, max: PET_DEV_CFG.skillMax, desc: '普攻伤害 +6% / 攻速 +5%（每点）' };
  const nodes = (PET_SKILLS[id] || []).map(sk => ({
    id: sk.id, name: sk.name, reqLv: sk.req, max: PET_DEV_CFG.skillMax, skill: sk,
    desc: `专精：每点 冷却 -8% / 效果 +15%（局内选中「${sk.name}」后生效）`,
  }));
  return [atk].concat(nodes);
}
const PET_TREES = { dragon: petTree('dragon'), fairy: petTree('fairy'), thunder: petTree('thunder'), frost: petTree('frost') };

// 升星词条池（3★ / 5★ 各解锁 1 个槽），带 elem 的只出给同元素宠物
const PET_AFFIXES = {
  ward:  { name: '守护', desc: '宠物击杀回复 1 点护盾', apply: b => { b.killShield += 1; } },
  rapid: { name: '迅捷', desc: '宠物攻速 +10%', apply: b => { b.rateMul *= 1.1; } },
  focus: { name: '聚焦', desc: '宠物伤害 +12%', apply: b => { b.dmgMul *= 1.12; } },
  chord: { name: '共鸣', desc: '宠物技能冷却 -10%', apply: b => { b.skillCdMul *= 0.9; } },
  blaze: { name: '烈焰之心', elem: 'fire', desc: '点燃伤害 +25%', apply: b => { b.burnMul *= 1.25; } },
  ember: { name: '余烬', elem: 'fire', desc: '点燃持续 +50%', apply: b => { b.burnTimeMul *= 1.5; } },
  volt:  { name: '电枢', elem: 'lightning', desc: '麻痹时长 +40%', apply: b => { b.stunMul *= 1.4; } },
  rime:  { name: '霜心', elem: 'ice', desc: '减速 / 冻结时长 +40%', apply: b => { b.slowTimeMul *= 1.4; b.freezeTimeMul *= 1.4; } },
};
function petAffixPool(id) {
  const elem = (PET_DEFS[id] || {}).elem;
  return Object.keys(PET_AFFIXES).filter(a => !PET_AFFIXES[a].elem || PET_AFFIXES[a].elem === elem);
}

// ==================== 局外装备（V1.31 装备体系换代：四槽位 + 主属性多元化） ====================
// 槽位：**武器**（输出本体）/ **护甲**（生存）/ **饰品 ×2**（输出 / 功能 / 续航）。
// V1.31 起「物品」槽取消，原本的回血宝珠 / 急救包 / 幸运币 / 生命药剂并入**饰品池**，
// 饰品槽因此扩为 2 个（trinket1 / trinket2），可以同时带两件特色饰品。
// 每件装备 = **固定主属性**（写在 def 里的字段，见 MAIN_STAT_KEYS）+ **随机词条**（最多 GEAR_MAX_AFFIX 条，逐条靠洗练解锁）。
// 词条在**解锁那一刻 roll 第 1 条**，之后花金币「洗练」（refineGear()）：累计 5 / 15 次解锁第 2 / 3 条，
// 每次重 roll 全部**未锁定**的词条，锁定的那条保留（每锁定 1 条费用 ×2）。
// 词条效果由 gearBuff() 汇总成一份 buff，再在 startGame 里一次性写进 stats。

// 护甲 / 饰品共用词条池（19 条）：带 `vals` 的是**三条数值档**（低 / 中 / 高），洗练时逐条 roll 档位；
// 带 `v` 的是**定值词条**（档位对它们没有意义）。
// 数值类词条（弹道 / 元素 / 召唤 / 兽伴 + 破甲）走**独立乘区**（`dmgMul` / `vulnGear`），
// 不与局内卡共用的加算区相加，所以 +8% 就是实打实的 +8%（不再被「强力子弹 +30%」稀释）。
const GEAR_AFFIXES = {
  hp:     { name: '健壮', vals: [0.05, 0.08, 0.12], desc: v => `生命上限 +${Math.round(v * 100)}%`, apply(b, v) { b.maxHp *= 1 + v; } },
  speed:  { name: '疾行', vals: [0.05, 0.08, 0.12], desc: v => `移速 +${Math.round(v * 100)}%`, apply(b, v) { b.moveSpeed *= 1 + v; } },
  regen:  { name: '再生', vals: [1, 2, 3], desc: v => `每秒回复 +${v}`, apply(b, v) { b.regen += v; } },
  pickup: { name: '磁吸', vals: [0.25, 0.4, 0.6], desc: v => `拾取范围 +${Math.round(v * 100)}%`, apply(b, v) { b.pickupRange *= 1 + v; } },
  shield: { name: '壁垒', vals: [10, 15, 22], desc: v => `护盾上限 +${v}`, apply(b, v) { b.shieldMax += v; } },
  immune: { name: '坚韧', vals: [0.1, 0.15, 0.22], desc: v => `受伤免疫 +${v}s`, apply(b, v) { b.invulnDuration += v; } },
  leech:  { name: '吸血', vals: [0.005, 0.01, 0.015], desc: v => `吸血 +${+(v * 100).toFixed(1)}%`, apply(b, v) { b.lifesteal += v; } },
  vuln:   { name: '破甲', vals: [0.05, 0.08, 0.12], desc: v => `敌人易伤 +${Math.round(v * 100)}%`, apply(b, v) { b.vulnGear += v; } },
  bullet: { name: '弹道', vals: [0.06, 0.08, 0.12], desc: v => `子弹伤害 +${Math.round(v * 100)}%`, apply(b, v) { b.dmgMul.bullet += v; } },
  ele:    { name: '元素', vals: [0.06, 0.08, 0.12], desc: v => `元素伤害 +${Math.round(v * 100)}%`, apply(b, v) { b.dmgMul.ele += v; } },
  summon: { name: '召唤', vals: [0.06, 0.08, 0.12], desc: v => `召唤物伤害 +${Math.round(v * 100)}%`, apply(b, v) { b.dmgMul.summon += v; } },
  pet:    { name: '兽伴', vals: [0.06, 0.08, 0.12], desc: v => `宠物伤害 +${Math.round(v * 100)}%`, apply(b, v) { b.dmgMul.pet += v; } },
  guard:  { name: '铁壁', vals: [0.95, 0.94, 0.92], desc: v => `受伤 ×${v}`, apply(b, v) { b.damageTaken *= v; } },
  xp:     { name: '学识', vals: [0.08, 0.12, 0.18], desc: v => `经验 +${Math.round(v * 100)}%`, apply(b, v) { b.xpMul *= 1 + v; } },
  coin:   { name: '财富', vals: [0.12, 0.2, 0.3], desc: v => `金币 +${Math.round(v * 100)}%`, apply(b, v) { b.coinMul *= 1 + v; } },
  luck:   { name: '灵巧', v: 1, desc: () => '开局重抽 +1', apply(b, v) { b.reroll += v; } },
  // ↓ 机制型词条（V1.30）：不吃数值稀释，靠机制本身生效
  pierce: { name: '破势', mech: true, v: 1, desc: () => '子弹穿透 +1', apply(b, v) { b.pierce += v; } },
  sunder: { name: '裂甲', mech: true, vals: [0.15, 0.25, 0.4], desc: v => `对带护盾的敌人伤害 +${Math.round(v * 100)}%`, apply(b, v) { b.sunder += v; } },
  thorns: { name: '荆棘', mech: true, vals: [0.5, 0.8, 1.2], desc: v => `受伤时对周围敌人造成该次伤害 ${Math.round(v * 100)}% 的伤害`, apply(b, v) { b.thorns += v; } },
};
// 武器专属词条池（V1.31 · 6 条；V1.34 收敛为 4 条）：只影响**出战的那把武器**。
// 与护甲 / 饰品池分开，是因为「射速 / 弹速 / 射程 / 弹丸数」对护甲毫无意义。
// V1.34 平衡：**去掉一切「直接加伤害」的词条**（`wpower` 武器伤害 +% / `wcount` 每轮弹丸 +1，
//   这两条都能直接抬 DPS，前期一 roll 到就没压力、容易滚雪球），并把剩下的数值整体压下来。
//   剩下的都是「手感 / 覆盖」类：射速 / 弹速 / 射程 / 穿透，不再凭空加伤害。
const WEAPON_AFFIXES = {
  wrate:  { name: '迅捷', vals: [0.03, 0.05, 0.08], desc: v => `武器射速 +${Math.round(v * 100)}%`, apply(b, v) { b.rate += v; } },
  wspeed: { name: '疾弹', vals: [0.06, 0.09, 0.14], desc: v => `弹速 +${Math.round(v * 100)}%`, apply(b, v) { b.speed += v; } },
  wrange: { name: '远射', vals: [0.05, 0.08, 0.12], desc: v => `射程 +${Math.round(v * 100)}%`, apply(b, v) { b.range += v; } },
  wpierce:{ name: '贯穿', mech: true, v: 1, desc: () => '子弹穿透 +1', apply(b, v) { b.pierce += v; } },
};
// 词条 id → 定义的总查找表（武器池与通用池 id 不重叠）
const ALL_AFFIXES = Object.assign({}, GEAR_AFFIXES, WEAPON_AFFIXES);
function affixPoolOf(id) { return WEAPON_DEFS[id] ? WEAPON_AFFIXES : GEAR_AFFIXES; }

const GEAR_REROLL_COST = 200;             // 护甲 / 饰品洗练基础花费（金币）；每锁定 1 条词条 ×2
const WEAPON_REROLL_COST = 400;           // V1.34：武器词条影响面更大，洗练单独抬价（200 → 400）
const GEAR_MAX_AFFIX = 3;                 // 每件装备最多 3 条词条
const GEAR_UNLOCK2 = 5;                   // 累计洗练 5 次解锁第 2 条
const GEAR_UNLOCK3 = 15;                  // 累计洗练 15 次解锁第 3 条
const GEAR_TIER_W = [0.55, 0.32, 0.13];   // 档位权重：低档常见、高档稀有

// 护甲：主属性覆盖 受伤减免 / 血池上限 / 护盾 / 有盾时减伤
const ARMOR_DEFS = {
  none:    { name: '无',       cost: 0,    affixCount: 0, desc: '无额外效果' },
  cloth:   { name: '布衣',     cost: 350,  maxHpMul: 1.15, affixCount: 3, desc: '队伍血池上限 +15%' },
  leather: { name: '皮甲',     cost: 300,  damageTaken: 0.85, affixCount: 3, desc: '受伤 -15%' },
  iron:    { name: '铁甲',     cost: 750,  damageTaken: 0.78, shieldMax: 10, affixCount: 3, desc: '受伤 -22%，护盾上限 +10' },
  scale:   { name: '龙鳞甲',   cost: 1400, damageTaken: 0.72, maxHpMul: 1.10, affixCount: 3, desc: '受伤 -28%，队伍血池上限 +10%' },
  aegis:   { name: '守誓盾铠', cost: 1800, shieldMax: 30, shieldDamageTaken: 0.6, affixCount: 3, desc: '护盾上限 +30；有护盾时受伤 -40%' },
};
// 饰品：主属性 = 输出 / 功能 / 续航 / 资源（原「物品」池已并入，V1.31）
// `damageDealt` 是**四类伤害通吃**的独立乘区。
const TRINKET_DEFS = {
  none:    { name: '无',       cost: 0,    affixCount: 0, desc: '无额外效果' },
  // ---- 输出 / 功能 ----
  charm:   { name: '力量护符', cost: 450,  damageDealt: 1.15, affixCount: 3, desc: '造成伤害 +15%' },
  ring:    { name: '狂战戒指', cost: 1500, damageDealt: 1.3, damageTakenMul: 1.15, affixCount: 3, desc: '造成伤害 +30%，但受伤 +15%' },
  magnet:  { name: '磁石护符', cost: 600,  pickupMul: 1.6, affixCount: 3, desc: '拾取范围 +60%' },
  blood:   { name: '血珠',     cost: 900,  bloodOrb: 0.05, affixCount: 3, desc: '造成伤害时 5% 概率回复该次伤害的 5%' },
  vamp:    { name: '嗜血符',   cost: 1100, lifesteal: 0.025, affixCount: 3, desc: '造成伤害的 2.5% 回复队伍生命' },
  boots:   { name: '疾风之靴', cost: 850,  moveSpeedMul: 1.15, affixCount: 3, desc: '移速 +15%' },
  bramble: { name: '荆棘图腾', cost: 900,  thorns: 0.6, affixCount: 3, desc: '受伤时对周围敌人造成该次伤害 60% 的伤害' },
  // ---- 生存 / 续航 ----
  ward:    { name: '守护徽记', cost: 800,  shieldMax: 25, affixCount: 3, desc: '护盾上限 +25' },
  tonic:   { name: '生命药剂', cost: 1200, maxHpMul: 1.25, affixCount: 3, desc: '队伍血池上限 +25%' },
  orb:     { name: '回血宝珠', cost: 600,  regen: 2, affixCount: 3, desc: '每秒回复 2 点队伍生命' },
  kit:     { name: '急救包',   cost: 700,  invulnDuration: 0.3, affixCount: 3, desc: '受伤免疫 +0.3s（冷却 3s）' },
  // ---- 资源 ----
  coin:    { name: '幸运币',   cost: 900,  coinMul: 1.3, affixCount: 3, desc: '局内金币 +30%' },
  greed:   { name: '贪婪之眼', cost: 1000, coinMul: 1.25, pickupMul: 1.25, affixCount: 3, desc: '局内金币 +25%，拾取范围 +25%' },
  sage:    { name: '贤者之石', cost: 1000, xpMul: 1.2, affixCount: 3, desc: '获得经验 +20%' },
};
const GEAR_DEFS = { weapon: WEAPON_DEFS, armor: ARMOR_DEFS, trinket1: TRINKET_DEFS, trinket2: TRINKET_DEFS };
const GEAR_SLOTS = ['weapon', 'armor', 'trinket1', 'trinket2'];        // 全部装备槽（= meta.equipped 的 key）
const GEAR_BODY_SLOTS = ['armor', 'trinket1', 'trinket2'];             // 走通用词条池的三个槽位（武器另算）
const GEAR_CAT = { weapon: 'weapons', armor: 'armor', trinket1: 'trinket', trinket2: 'trinket' };   // 槽位 → meta.unlocked 的分类名
const GEAR_SLOT_NAME = { weapon: '武器', armor: '护甲', trinket1: '饰品 1', trinket2: '饰品 2' };

// 装备**主属性**的字段名 → 累加器写法。字段名与词条 apply() 共用同一套累加器，
// 所以「主属性」和「随机词条」可以无缝叠在同一份 buff 里（加一个新主属性只要在这里加一行）。
const MAIN_STAT_KEYS = {
  damageDealt:      (b, v) => { b.damageDealt *= v; },
  damageTaken:      (b, v) => { b.damageTaken *= v; },
  damageTakenMul:   (b, v) => { b.damageTaken *= v; },
  maxHpMul:         (b, v) => { b.maxHp *= v; },
  moveSpeedMul:     (b, v) => { b.moveSpeed *= v; },
  pickupMul:        (b, v) => { b.pickupRange *= v; },
  shieldMax:        (b, v) => { b.shieldMax += v; },
  shieldDamageTaken:(b, v) => { b.shieldDamageTaken *= v; },
  regen:            (b, v) => { b.regen += v; },
  invulnDuration:   (b, v) => { b.invulnDuration += v; },
  bloodOrb:         (b, v) => { b.bloodOrb += v; },
  lifesteal:        (b, v) => { b.lifesteal += v; },
  coinMul:          (b, v) => { b.coinMul *= v; },
  xpMul:            (b, v) => { b.xpMul *= v; },
  thorns:           (b, v) => { b.thorns += v; },
};
function blankGearBuff() {
  return {
    maxHp: 1, moveSpeed: 1, pickupRange: 1, damageTaken: 1, shieldDamageTaken: 1,
    damageDealt: 1, coinMul: 1, xpMul: 1,
    regen: 0, shieldMax: 0, invulnDuration: 0, lifesteal: 0, bloodOrb: 0,
    vulnGear: 0, pierce: 0, sunder: 0, thorns: 0, reroll: 0,
    dmgMul: { bullet: 0, ele: 0, summon: 0, pet: 0 },
  };
}
function applyMainStats(def, b) {
  Object.keys(MAIN_STAT_KEYS).forEach(k => { const v = def[k]; if (v !== undefined) MAIN_STAT_KEYS[k](b, v); });
}

// ===== 词条存档结构（V1.30 洗练）=====
// meta.gear[装备 id] = { affixes: [{ id, t }], rolls: 累计洗练次数, lock: [bool, ...] }
//   affixes 只存**已解锁**的词条（1 ~ 3 条），条数由 rolls 决定（5 次解锁第 2 条 / 15 次解锁第 3 条）；
//   t = 档位（0 / 1 / 2）；lock[i] = 第 i 条是否锁定（锁定的洗练时不重 roll，但费用翻倍）。
function affixTier(t) { return Math.max(0, Math.min(2, t | 0)); }
function affixValue(def, t) { return def.vals ? def.vals[affixTier(t)] : def.v; }
function affixDesc(id, t) {
  const def = ALL_AFFIXES[id];
  return def ? def.desc(affixValue(def, t)) : String(id);
}
// 一条词条的展示文案与档位角标（定值词条没有角标）
function affixText(a) {
  const def = ALL_AFFIXES[a.id];
  return def ? `${def.name}（${affixDesc(a.id, a.t)}）` : String(a.id);
}
function affixTierText(a) {
  const def = ALL_AFFIXES[a.id];
  return def && def.vals ? `T${affixTier(a.t) + 1}` : '';
}
// 抽一条词条（可排除已有的，保证同一件装备内不重复）；数值档按 GEAR_TIER_W 加权（高档稀有）
function rollAffixTier() {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < GEAR_TIER_W.length; i++) { acc += GEAR_TIER_W[i]; if (r < acc) return i; }
  return 0;
}
// pool 由装备类型决定：武器走 WEAPON_AFFIXES，护甲 / 饰品走 GEAR_AFFIXES
function sampleAffix(existing, pool) {
  const src = pool || GEAR_AFFIXES;
  const used = new Set((existing || []).map(a => a.id));
  const cand = Object.keys(src).filter(id => !used.has(id));
  if (!cand.length) return null;
  const id = cand[Math.floor(Math.random() * cand.length)];
  const def = src[id];
  return { id, t: def.vals ? rollAffixTier() : 0 };
}
// 累计洗练次数 → 已解锁词条条数
function gearAffixCount(g) {
  return Math.min(GEAR_MAX_AFFIX, 1 + (g.rolls >= GEAR_UNLOCK2 ? 1 : 0) + (g.rolls >= GEAR_UNLOCK3 ? 1 : 0));
}
// 归一化一件装备的词条存档（兼容 V1.29 的纯 id 数组：旧值 = 现在的中档 t1，并按其条数补足洗练次数）
function gearStateOf(store, id) {
  let g = store[id];
  if (Array.isArray(g)) {
    const affixes = g.map(a => ({ id: a, t: 1 }));
    const rolls = affixes.length >= GEAR_MAX_AFFIX ? GEAR_UNLOCK3 : (affixes.length === 2 ? GEAR_UNLOCK2 : 0);
    g = { affixes, rolls, lock: affixes.map(() => false) };
    store[id] = g;
  }
  if (!g || typeof g !== 'object') g = { affixes: [], rolls: 0, lock: [] };
  if (!Array.isArray(g.affixes)) g.affixes = [];
  g.rolls = Math.max(0, Math.floor(g.rolls || 0));
  g.affixes = g.affixes.filter(a => a && ALL_AFFIXES[a.id]).map(a => ({ id: a.id, t: affixTier(a.t) }));
  if (!Array.isArray(g.lock)) g.lock = [];
  while (g.lock.length < g.affixes.length) g.lock.push(false);
  g.lock.length = g.affixes.length;
  store[id] = g;
  return g;
}
function gearState(id) {
  if (!meta.gear) meta.gear = {};
  return gearStateOf(meta.gear, id);
}
function gearDef(id) {
  for (const slot of GEAR_SLOTS) if (GEAR_DEFS[slot][id]) return GEAR_DEFS[slot][id];
  return null;
}
function gearAffixes(id) { return gearState(id).affixes; }
// 把已解锁条数补到「洗练进度」应有的数量（解锁 / 旧档迁移用；不会重 roll 已有词条）
function ensureGearAffixes(id) {
  const def = gearDef(id);
  if (!def || !def.affixCount) return null;
  const pool = affixPoolOf(id);
  const g = gearState(id);
  const n = gearAffixCount(g);
  while (g.affixes.length < n) {
    const a = sampleAffix(g.affixes, pool);
    if (!a) break;
    g.affixes.push(a);
  }
  while (g.lock.length < g.affixes.length) g.lock.push(false);
  return g;
}
// 解锁那一刻：给第 1 条词条，洗练次数从 0 开始
function rollGearAffixes(id) {
  const def = gearDef(id);
  if (!def || !def.affixCount) return null;
  const a = sampleAffix([], affixPoolOf(id));
  if (!meta.gear) meta.gear = {};
  meta.gear[id] = { affixes: a ? [a] : [], rolls: 0, lock: [false] };
  return meta.gear[id];
}
function gearAffixText(id) {
  const list = gearAffixes(id);
  if (!list.length) return '';
  return list.map(affixText).join('、');
}
// 当前出战**护甲 + 饰品 ×2** 的汇总 buff：主属性（MAIN_STAT_KEYS）与随机词条叠在同一份累加器里
function gearBuff() {
  const b = blankGearBuff();
  GEAR_BODY_SLOTS.forEach(slot => {
    const id = meta.equipped[slot];
    const def = GEAR_DEFS[slot][id];
    if (!def) return;
    applyMainStats(def, b);
    gearAffixes(id).forEach(a => {
      const d = GEAR_AFFIXES[a.id];
      if (d) d.apply(b, affixValue(d, a.t));
    });
  });
  return b;
}
// 出战**武器**的专属词条汇总（V1.31）：只在 startGame 里一次性写进该武器的实例字段
function weaponBuff() {
  const b = { dmg: 0, rate: 0, speed: 0, range: 0, pierce: 0, count: 0 };
  const id = meta.equipped.weapon;
  if (!WEAPON_DEFS[id]) return b;
  gearAffixes(id).forEach(a => {
    const d = WEAPON_AFFIXES[a.id];
    if (d) d.apply(b, affixValue(d, a.t));
  });
  return b;
}
function gearSlotOf(id) {
  for (const slot of GEAR_SLOTS) if (GEAR_DEFS[slot][id]) return slot;
  return null;
}
// 洗练费用：基础 200（武器 400），每锁定 1 条词条 ×2
function gearRollCost(id) {
  const base = WEAPON_DEFS[id] ? WEAPON_REROLL_COST : GEAR_REROLL_COST;
  return base * Math.pow(2, gearState(id).lock.filter(Boolean).length);
}
// 洗练：累加次数（够 5 / 15 次解锁第 2 / 3 条），重 roll 全部**未锁定**的词条
function refineGear(id) {
  const slot = gearSlotOf(id);
  const def = gearDef(id);
  if (!slot || !def || !def.affixCount || !isUnlocked(GEAR_CAT[slot], id)) return false;
  const cost = gearRollCost(id);
  if (meta.coins < cost) { toastNeedCoins(cost); return false; }
  meta.coins -= cost;
  const g = gearState(id);
  g.rolls += 1;
  const n = gearAffixCount(g);
  const old = g.affixes;
  const pool = affixPoolOf(id);
  const next = [];
  for (let i = 0; i < Math.max(n, old.length); i++) {
    if (old[i] && g.lock[i]) { next.push({ id: old[i].id, t: old[i].t }); continue; }
    const a = sampleAffix(next, pool);
    if (a) next.push(a);
  }
  g.affixes = next;
  g.lock = next.map((_, i) => !!(old[i] && g.lock[i]));
  saveMeta();
  renderMenu(true);          // 就地刷新：别把玩家从铁砧页弹回装备台
  return true;
}
// 锁定 / 解锁第 i 条词条（免费切换；只影响之后的洗练费用）
function toggleGearLock(id, i) {
  const slot = gearSlotOf(id);
  if (!slot || !isUnlocked(GEAR_CAT[slot], id)) return false;
  const g = gearState(id);
  if (i < 0 || i >= g.affixes.length) return false;
  g.lock[i] = !g.lock[i];
  saveMeta();
  renderMenu(true);          // 就地刷新：锁 / 解锁也留在铁砧页
  return true;
}
// 装备带来的全局倍率（经验 / 金币 / 开局重抽）—— startGame 与 restoreRun 共用
function refreshGearGlobals() {
  const gb = gearBuff();
  gearXpMul = gb.xpMul;
  gearCoinMul = gb.coinMul;
  gearRerollBonus = gb.reroll;
}

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
// ===== 协同技（V1.35）：全部只在首领奖励里出现，第一波首领不出 =====
// 这三个常量必须声明在 BOSS_BUFFS **之前** —— 卡面 desc 是模板字符串，数组定义时就求值了。
const OVERLOAD_DMG = 25;                             // 过载：闪电击中燃烧敌人时的爆炸伤害
const OVERLOAD_RADIUS = 60;                          // 过载：爆炸半径
const SYNERGY_SWORD_CHANCE = 0.4;                    // 金雷竹剑 / 火焰刀：飞剑命中时的触发概率
const SYNERGY_LIGHTNING_PCT = 0.7;                   // 金雷竹剑：追加雷击 = 雷击伤害的 70%

const BOSS_BUFFS = [
  { id: 'buff-rage', name: '狂暴', desc: '射速 +66%、子弹伤害 -50%（仅一次）', once: true, apply() { weapons.forEach(w => w.rateMul = (w.rateMul || 1) * 1.66); addDamageBonus('bullet', -0.5); } },
  { id: 'buff-might', name: '力量权柄', desc: '子弹伤害 +50%、元素伤害 -30%、射速 -20%（同类相加，与「元素亲和」二选一，仅一次）', once: true, exclusive: 'dmg-route', apply() { addDamageBonus('bullet', 0.5); addDamageBonus('ele', -0.3); weapons.forEach(w => w.rateMul = (w.rateMul || 1) * 0.8); } },
  { id: 'buff-ele-affinity', name: '元素亲和', desc: '子弹伤害 -50%、元素伤害 +35%、点燃/减速/冰冻的持续时间 +35%（同类相加，与「力量权柄」二选一，仅一次）', once: true, exclusive: 'dmg-route', apply() { addDamageBonus('bullet', -0.5); addDamageBonus('ele', 0.35); stats.statusDuration = (stats.statusDuration || 1) * 1.35; } },
  { id: 'buff-summon-power', name: '召唤之力', desc: '召唤物伤害 +50%、召唤物攻速 +50%（按各自机制生效，同类相加，仅一次）', once: true, apply() { addDamageBonus('summon', 0.5); summons.forEach(s => s.rateMul = (s.rateMul || 1) * 1.5); } },
  { id: 'buff-blink', name: '遁术', desc: '移动速度 +50%、闪避率 +30%（闪避上限仍为 60%，仅一次）', once: true, apply() { stats.moveSpeed *= 1.5; stats.dodge = Math.min(0.6, (stats.dodge || 0) + 0.3); } },
  // ===== 协同技（V1.35）：只在首领奖励池出现，**第一波首领不出**（见 openBossReward 的 bossKills 判断），
  //   且每张都有自己的前置（`req`）。全部为一次性（once），拿过就不再出现。=====
  {
    id: 'syn-frostfire', name: '冰霜火', synergy: true, once: true,
    desc: '施加霜冻（减速）或冰冻时同时点燃目标（点燃伤害为原本的一半）（需「火焰附魔」+「霜冻附魔」）',
    req: () => cardLv('enchant-fire') > 0 && cardLv('enchant-frost') > 0,
    apply() { stats.frostfire = true; },
  },
  {
    id: 'syn-overload', name: '过载', synergy: true, once: true,
    desc: `闪电击中燃烧中的敌人时引发 ${OVERLOAD_DMG} 点范围爆炸（需「元素：雷电」+「火焰附魔」）`,
    req: () => hasSummon('lightning') && cardLv('enchant-fire') > 0,
    apply() { stats.overload = true; },
  },
  {
    id: 'syn-summon-domain', name: '召唤领域', synergy: true, once: true,
    desc: '召唤物伤害 & 攻速 +35%，子弹伤害 -35%（需已有召唤物）（仅一次）',
    req: () => hasSummon('scythe') || hasSummon('sword'),
    apply() { addDamageBonus('summon', 0.35); summons.forEach(s => s.rateMul = (s.rateMul || 1) * 1.35); addDamageBonus('bullet', -0.35); },
  },
  {
    id: 'syn-thunder-sword', name: '金雷竹剑', synergy: true, once: true, exclusive: 'sword-enchant',
    desc: `飞剑攻击敌人时 ${Math.round(SYNERGY_SWORD_CHANCE * 100)}% 概率追加一次雷击（伤害为雷击的 ${Math.round(SYNERGY_LIGHTNING_PCT * 100)}%），刀身附带闪电特效（需「召唤：飞剑」+「元素：雷电」，与「火焰刀」二选一）`,
    req: () => hasSummon('sword') && hasSummon('lightning'),
    apply() { stats.swordLightning = true; },
  },
  {
    id: 'syn-fire-sword', name: '火焰刀', synergy: true, once: true, exclusive: 'sword-enchant',
    desc: `飞剑攻击敌人时 ${Math.round(SYNERGY_SWORD_CHANCE * 100)}% 概率点燃目标，刀身附带火焰特效（需「召唤：飞剑」+「火焰附魔」，与「金雷竹剑」二选一）`,
    req: () => hasSummon('sword') && cardLv('enchant-fire') > 0,
    apply() { stats.swordFire = true; },
  },
  {
    id: 'syn-all-in', name: '我摊牌了不装了', synergy: true, once: true,
    desc: '移速清零（原地不动）、子弹伤害 +100%、元素伤害 +50%、每秒回复清零（需已有元素伤害来源与武器）（仅一次）',
    req: () => hasElementalSource() && weapons.length > 0,
    apply() { stats.moveSpeed = 0; addDamageBonus('bullet', 1.0); addDamageBonus('ele', 0.5); stats.regen = 0; },
  },
  {
    id: 'syn-atomic-guard', name: '原子守护', synergy: true, once: true,
    desc: '拥有护盾时受伤 -50%，没有护盾时受伤 +100%；护盾破裂时触发大范围伤害，并附带一次性点燃与减速（需「护盾 +20」）',
    req: () => squad.shieldMax > 0,
    apply() { stats.atomicGuard = true; },
  },
  {
    id: 'syn-faster-faster', name: '快点快点再快点', synergy: true, once: true,
    desc: '镰刀体型 +50%、镰刀转速 +50%、移速 +20%（需「召唤：镰刀」）',
    req: () => hasSummon('scythe'),
    apply() { const s = getSummon('scythe'); if (s) { s.sizeMul = (s.sizeMul || 1) * 1.5; s.rateMul = (s.rateMul || 1) * 1.5; } stats.moveSpeed *= 1.2; },
  },
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
// V1.31：装备四槽位 —— 武器 / 护甲 / 饰品 ×2（「物品」槽取消，并入饰品池）
const SHOP = {
  weapons: WEAPON_DEFS,
  armor: ARMOR_DEFS,
  trinket: TRINKET_DEFS,
  // 宠物不走商店解锁（V1.27 起改为「买蛋孵化」，见 EGGS / 宠物养成页）
};
// ==================== 全局状态 ====================
// ==================== 状态机（V1.32 显式化） ====================
// 以前状态是散在各处的 `state = 'x'` 加上手工 `.hidden` 开关，漏一句就会出现
// 「状态已经是暂停、遮罩却没弹出来」这类不一致。现在全部状态写在一张表里：
//   overlay  = 该状态占用的遮罩（null 表示不占遮罩，比如对局中）
//   live     = 世界是否推进（只有 playing 为 true，其余状态 update() 直接返回）
//   pauseBtn = 是否显示右上角的暂停按钮
// 所有切换统一走 setState()，由它负责遮罩与按钮的显隐。
const STATE_DEFS = {
  menu:       { overlay: 'menu',     live: false, pauseBtn: false, label: '主菜单' },
  playing:    { overlay: null,       live: true,  pauseBtn: true,  label: '对局中' },
  paused:     { overlay: 'pause',    live: false, pauseBtn: false, label: '暂停' },
  upgrade:    { overlay: 'upgrade',  live: false, pauseBtn: false, label: '升级选卡' },
  bossreward: { overlay: 'upgrade',  live: false, pauseBtn: false, label: '首领奖励' },
  merchant:   { overlay: 'merchant', live: false, pauseBtn: false, label: '商人' },   // 预留：局内商人尚未接入玩法（见「11. 待开发」）
  gameover:   { overlay: 'gameover', live: false, pauseBtn: false, label: '结算' },
};
const STATES = Object.keys(STATE_DEFS);
// 允许的状态转移表：只用于开发期告警，**不做硬拦截** —— 避免某条正常流程被表漏掉后直接卡死。
const STATE_TRANSITIONS = {
  menu:       ['playing'],
  playing:    ['paused', 'upgrade', 'bossreward', 'merchant', 'gameover', 'menu'],
  paused:     ['playing', 'upgrade', 'menu'],
  upgrade:    ['playing', 'paused', 'menu'],
  bossreward: ['playing', 'menu'],
  merchant:   ['playing'],
  gameover:   ['playing', 'menu'],
};
let state = 'menu';
let statePrev = 'menu';

// 全部「被状态占用的遮罩」集合（用于一次性收干净）
function stateOverlays() {
  return Array.from(new Set(STATES.map(s => STATE_DEFS[s].overlay).filter(Boolean)));
}
function showOverlay(id) { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
function hideOverlay(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
function hideRunOverlays() { stateOverlays().forEach(hideOverlay); }
// 世界是否推进（对局中才算；升级 / 首领奖励 / 暂停 / 结算 / 菜单都冻结）
function isLive() { return !!(STATE_DEFS[state] || {}).live; }
function stateLabel() { return (STATE_DEFS[state] || {}).label || state; }
// 状态是否允许转移到 to（同状态恒为真）
function canTransition(to) {
  return to === state || (STATE_TRANSITIONS[state] || []).includes(to);
}
function setState(next, opts = {}) {
  const def = STATE_DEFS[next];
  if (!def) { console.warn(`[state] 未知状态：${next}`); return false; }
  if (!canTransition(next)) console.warn(`[state] 非法状态转移：${state} → ${next}`);
  const prevDef = STATE_DEFS[state];
  // 占用同一个遮罩的状态之间切换（upgrade ↔ bossreward）不收起不重开，避免遮罩闪一下
  if (prevDef && prevDef.overlay && prevDef.overlay !== def.overlay) hideOverlay(prevDef.overlay);
  if (opts.clean) hideRunOverlays();       // 开始 / 回到主菜单这类「重新开始」的切换，先把所有遮罩收干净
  statePrev = state;
  state = next;
  if (def.overlay) showOverlay(def.overlay);   // 预留状态（如 merchant）没有对应遮罩时静默跳过
  // 局内按钮（暂停 / 目标优先级）只在「可操作的对局」里出现，由状态表统一决定显隐
  ['btn-pause', 'btn-aim'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.toggle('hidden', !def.pauseBtn);
  });
  if (def.pauseBtn) screenAimLabel();
  renderGuide();       // 首局引导提示条只在「对局中」显示（V1.35）
  return true;
}
let runCoins = 0;   // 本局获得金币
// ==================== 随机流（V1.32） ====================
// 一条随机流 = 一条可复现的伪随机序列（mulberry32）。三条流**互不干扰**，各管一类随机：
//   world  —— 地图 / 障碍物 / 装饰 / 藤蔓，以及**刷怪**（位置、种类、精英词缀、首领种类、走位初始朝向）
//   combat —— 命中判定与概率触发（点燃 / 减速 / 冻结 / 麻痹 / 分裂 / 闪避 / 格挡）、AI 技能编排、抽卡与掉落
//   fx     —— 纯表现：粒子、屏幕抖动、闪电分叉形状、音效噪声（整条跳过也不影响战斗结果）
// 「复现同一局」只需要 world + combat 的种子，所以种子随存档写进 `meta.run.seed`。
// 局外养成（开蛋、装备洗练）**不进这三条流** —— 它们发生在对局之外，用系统随机数即可。
const RNG_SEED_MAX = 0xffffffff;
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const RNG_STREAMS = ['world', 'combat', 'fx'];
let runSeed = 0;                     // 本局种子（写进 meta.run.seed）
const rng = { world: mulberry32(1), combat: mulberry32(2), fx: mulberry32(3) };
const rngCount = { world: 0, combat: 0, fx: 0 };   // 每条流被取用的次数（复现时用来把流推到同一位置）
function rngWorld() { rngCount.world++; return rng.world(); }
function rngCombat() { rngCount.combat++; return rng.combat(); }
function rngFx() { rngCount.fx++; return rng.fx(); }
// 设定本局种子：三条流各自用「种子 ⊕ 固定常量」派生，保证「同一种子 → 同一条序列」
function seedRun(seed) {
  runSeed = (seed === undefined || seed === null) ? Math.floor(Math.random() * RNG_SEED_MAX) : (seed >>> 0);
  rng.world = mulberry32(runSeed ^ 0x9e3779b9);
  rng.combat = mulberry32(runSeed ^ 0x85ebca6b);
  rng.fx = mulberry32(runSeed ^ 0xc2b2ae35);
  RNG_STREAMS.forEach(s => { rngCount[s] = 0; });
  return runSeed;
}
// 随机流快照：种子 + 三条流已取用的次数（随存档一起保存，读档后能把流推回同一位置）
function rngRestore(snap) {
  if (!snap || typeof snap.seed !== 'number') return false;
  seedRun(snap.seed);
  RNG_STREAMS.forEach(s => {
    const n = Math.max(0, Math.min(1e9, ((snap.counts || {})[s] || 0) | 0));
    for (let i = 0; i < n; i++) rng[s]();     // 快进到同样的位置
    rngCount[s] = n;
  });
  return true;
}
// 存档结构版本（V1.32）：换存档结构就把这个 +1，并在下面「存档结构版本与迁移」一节里补一步迁移。
// 放在这里是因为 defaultMeta() 要带上它，而 defaultMeta() 在文件更早的位置就会被调用。
const META_SCHEMA = 4;   // v1 = V1.31 及更早（存档里没有 schemaVersion 字段）；v2 = V1.32；v3 = V1.34（头像）；v4 = V1.35（首局引导）

// ==================== 游戏模式（V1.32） ====================
// 标准模式：**固定 20 波**，打完第 20 波即通关结算。首领波会冻结波次计时，
//           所以一局实际时长在 15~20 分钟量级（不是 20 × 20s 的 6.7 分钟）。
// 无尽模式：**标准模式通关后开放**，没有波数上限，怪潮与首领一路变强，打到阵亡为止。
const STANDARD_WAVES = 20;
const GAME_MODES = [
  { id: 'standard', name: '标准', tag: '20 波结算 · 约 15~20 分钟', desc: '打完第 20 波就算通关。' },
  { id: 'endless',  name: '无尽', tag: '通关后开放 · 打到阵亡', desc: '没有波数上限，首领按 10 波节奏无限轮换。' },
];
function modeDef(id) { return GAME_MODES.find(m => m.id === id) || GAME_MODES[0]; }
function endlessUnlocked(m) { return !!(m || meta).standardCleared; }
function modeSelectable(id) { return id === 'standard' || (id === 'endless' && endlessUnlocked()); }
let runMode = 'standard';    // 本局模式（写进对局快照，读档时一并恢复）
// 局外装备词条带来的全局倍率（V1.29）：经验 / 金币 / 开局额外重抽
let gearXpMul = 1, gearCoinMul = 1, gearRerollBonus = 0;
let soundTapCount = 0;        // 开发者模式入口：音效开关的连续切换计数
let devPanelShown = false;    // 开发者面板是否已填充（避免覆盖正在输入的值）
const SOUND_TAP_UNLOCK = 10;  // 连续切换多少次弹出密码验证
// 进入开发者模式的密码只存 SHA-256，仓库与文档都不写明文；改密码时用新的 sha256 替换这个值即可。
const DEV_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

// 局外进度（按用户持久化到 localStorage）
let users = [];
let currentUser = null;
let meta = defaultMeta();

let squad = { x: WORLD.w / 2, y: WORLD.h / 2, tx: WORLD.w / 2, ty: WORLD.h / 2, moving: false, shield: 0, shieldMax: 0, shieldRegenTimer: 0, invulnT: 0, invulnCdT: 0, aimAng: -Math.PI / 2 };
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
let bombs = [];      // 自爆怪的引信（V1.31）：{ x, y, t, r, dmg } —— 延迟到 t 用完才引爆
let drops = [];      // 经验光球
let particles = [];
let decorations = [];
let lightningBolts = [];
let iceSpikes = [];  // 冰刺命中特效（碎冰炸裂）
let petFx = [];      // 宠物技能特效与持续判定（喷火 / 火龙卷 / 熔岩 / 静电场 / 龙威…）
let blasts = [];     // 火球爆炸特效
let swordSlashes = [];  // 飞剑贯穿斩痕
let hitStop = 0;     // 顿帧剩余时间（贯穿命中时短暂冻结逻辑，渲染照常）
let lastHitStopT = -1;
// 唯一的顿帧入口：逻辑侧冻结由 hitStop 走 loop()，客机侧靠 netHitStopPulse 随 fx 下发。
//   **下发的是「脉冲」而不是剩余时长** —— 顿帧只有 0.02s，而快照节拍是 55ms，
//   等下一拍去读 hitStop 时多半已经衰减到 0 了（实测只能撞上约 1/3 的概率）；
//   记「这一拍触发过、时长多少」，客机整段照收，才能稳定打出手感。
function triggerHitStop(d) {
  hitStop = Math.max(hitStop, d);
  if (netRole === 'host') netHitStopPulse = Math.max(netHitStopPulse, d);
}
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
  pickupRange: 1, invulnDuration: 0, damageTaken: 1, shieldDamageTaken: 1, dodge: 0, bulletKnockback: 0,
  burnDamage: 0,             // 点燃伤害加成（「严重灼伤」）
  statusDuration: 1,         // 异常元素效果（点燃/减速/冰冻）的持续时间倍率（「元素亲和」）
  vuln: 0,             // 易伤：敌人受到的伤害加成（同类加算）
  lifesteal: 0,        // 吸血：造成伤害后按比例回复队伍血池（同类加算）
  regen: 0,            // 每秒回复队伍血池（回血宝珠）
  bloodOrb: 0,         // 血珠：造成伤害时触发回血的概率
  // ===== 四线专精（V1.33）：全是「固定值 / 独立倍率」，与上面四路百分比乘区互不干扰 =====
  fireFlat: 0,             // 火焰专精：固定火焰伤害（加在点燃基础 dps 上，再加乘区）
  fireBurnTime: 0,         // 火焰专精：点燃时长 +N 秒（加在基础时长上，再吃状态时长倍率）
  lightningMastery: 0,     // 闪电专精：闪电伤害加成（累加百分比，乘在落雷伤害最后）
  lightningSplashR: 0,     // 闪电专精：落雷范围伤害半径（0 = 没有范围伤害）
  lightningSplashPct: 0,   // 闪电专精：范围伤害占本次雷击伤害的比例
  swordFlat: 0,            // 飞剑专精：固定伤害
  swordHitCdMul: 1,        // 飞剑专精：命中冷却倍率（<1 更快）
  scytheFlat: 0,           // 镰刀专精：固定伤害
  scytheHitCdMul: 1,       // 镰刀专精：命中冷却倍率（<1 更快）
  // ===== 守护线 / 巨人线 / 协同技（V1.35）=====
  guardianShieldAdd: 0,    // 「守护」：已累计加到护盾上限的值（只补差值，避免重复选卡反复加满）
  guardianMove: 0,         // 「守护」：拥有护盾时的移速加成（条件倍率，见 moveSpeed()）
  shieldThornsPct: 0,      // 「盾反」：护盾激活时受击反弹的比例
  shieldBurstPct: 0,       // 「盾反」：护盾被击穿时炸开的伤害比例
  shieldRegenCut: 0,       // 「坚定守护」：护盾恢复冷却 -N 秒
  bodyMul: 1,              // 巨人线：体型倍率（同时影响绘制大小与受伤碰撞体积）
  frostfire: false,        // 协同「冰霜火」
  overload: false,         // 协同「过载」
  swordLightning: false,   // 协同「金雷竹剑」
  swordFire: false,        // 协同「火焰刀」
  atomicGuard: false,      // 协同「原子守护」
};

// ==================== 伤害乘区 ====================
// 参考主流做法（PoE 的「增加 / 更多」、Vampire Survivors 的同类加算）：
//   最终伤害 = 基础值 × (1 + 同类加成之和) × 独立乘区
// 同类百分比一律「加算」，避免同类加成反复相乘造成指数爆炸（或把某一路直接压到 0）；
// 只有局外装备、进化这类独立来源才进乘算区。减益同样进加算区，并留下限。
// 下限只作用在「加算区」这一层（不给独立乘区加下限），四路统一：
//   子弹 / 召唤 / 宠物：0.3（最低保留 30%）；元素：0（保留「可被归零」这一设计杠杆）
const DMG_FLOOR = 0.3;                                     // 单路伤害最低保留 30%
const INVULN_CD = 5;                                       // 受伤免疫的冷却（触发时刻起算；V1.35：3 → 5，且只认「扣血」）
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
let devNoSpawn = false;        // 停止刷怪（V1.31：连波次计时一起停）
let devGod = { mob: false, elite: false, boss: false };   // 怪物无敌（V1.31：分小怪 / 精英 / BOSS，伤害数字照常弹）
let devAllowPauseUpgrade = false;   // 允许在暂停状态下打开升级面板（V1.31）
let devUpgradeFromPause = false;    // 本次升级面板是从「暂停」里打开的
let devSelectedCardId = '';         // 卡牌页当前选中的卡（V1.31：点一下选中，再点一下取消）

// 怪物无敌判定：按类型分档（树怪归到精英档）
function devGodBlocks(e) {
  if (e.type === 'boss') return devGod.boss;
  if (e.type === 'elite' || e.type === 'treant') return devGod.elite;
  return devGod.mob;
}

// ---- 实时 DPS（V1.31 调试）：统计玩家最近 5 秒打出的伤害 ----
const DPS_WINDOW = 5;
let dpsHits = [];        // { t, dmg }
let dpsValue = 0;        // 实时 DPS
let dpsPeak = 0;         // 本局峰值
function addDps(dmg) {
  if (dmg > 0) dpsHits.push({ t: gameTime, dmg });
}
function updateDps() {
  const cut = gameTime - DPS_WINDOW;
  while (dpsHits.length && dpsHits[0].t < cut) dpsHits.shift();
  let sum = 0;
  for (const h of dpsHits) sum += h.dmg;
  dpsValue = sum / DPS_WINDOW;
  if (dpsValue > dpsPeak) dpsPeak = dpsValue;
}

function poolGate(ok) { return devForcePool || ok; }
function canPick(id, max) { return devForcePool || (pickCount[id] || 0) < max; }
function markPick(id) { pickCount[id] = (pickCount[id] || 0) + 1; }

let camera = { x: 0, y: 0 };
let wave = 1;
let kills = 0;
let level = 1;
let xp = 0;
// 升级所需经验（V1.35 重调曲线）：基础值 22 → 26、成长系数 1.32 / +6 → 1.23 / +6。
//   目的：**前期略微抬高**（1 级 22 → 26），**后期明显放缓**（10 级 465 → 293），避免后期卡等级。
// 递增序列：26 / 37 / 51 / 68 / 89 / 115 / 147 / 186 / 234 / 293 …（V1.11 旧序列 22 / 35 / 52 / 74 / 103 / 141 / 192 / 259 / 348 / 465）
const XP_BASE = 26;
let xpToNext = XP_BASE;
let choiceCount = 3;
let gameTime = 0;
let difficulty = 1;
let bossKills = 0;   // 已击败 Boss 数（决定世界成长：新怪物 / 出怪量 / 经验加成）
let dividers = [];   // 世界内的随机分块虚线

let spawnTimer = 1;
let waveT = 0;              // 本波已进行的时长（V1.18 起波次由计时驱动）

// ==================== 首局引导（V1.35 第二阶段） ====================
// 只在「这台设备上的第一次冒险」出现：五步各绑一个真实动作，做到就推进一步，走完写 meta.guide.done = true。
// 不做阻塞式教学（不锁操作、不弹窗），只在屏幕下方给一条提示条 —— 玩家随时可以点 ✕ 跳过整段。
const GUIDE_STEPS = [
  { id: 'move',    tip: '移动：W A S D / 方向键，触屏直接拖动屏幕' },
  { id: 'pickup',  tip: '拾取经验：走到绿色光球上把经验吃掉' },
  { id: 'levelup', tip: '第一次升级：经验条满了会自动弹出三选一，选一张变强' },
  { id: 'pause',   tip: '暂停：按 Esc / P，或点屏幕顶部的暂停键' },
  { id: 'skill',   tip: '主动技能：按 Q 或点右下角技能键，让敌人减速' },
];
let guideStep = 0;             // 当前第几步
let guideOn = false;           // 本局是否正在走引导
let guideMoved = 0;            // 累计移动距离（第一步的判据）
let runLearned = [];           // 本局学到的机制（结算页展示）
let eliteIntroDone = false;    // 本局是否播过「第一次精英怪」的登场提示

// 记一条「本局学到的机制」（重复不记）
function learnTag(t) { if (t && !runLearned.includes(t)) runLearned.push(t); }

function guideCur() { return guideOn ? (GUIDE_STEPS[guideStep] || null) : null; }

// 做到某一步就推进（id 与当前步不符时什么都不做）
function guideAdvance(id) {
  const cur = guideCur();
  if (!cur || cur.id !== id) return;
  meta.guide.seen[id] = true;
  guideStep++;
  if (guideStep >= GUIDE_STEPS.length) {       // 五步走完：整段引导以后不再出现
    guideOn = false;
    meta.guide.done = true;
    learnTag('首局引导已完成');
    saveMeta();
  }
  renderGuide();
}

function skipGuide() {
  guideOn = false;
  if (!meta.guide.done) { meta.guide.done = true; saveMeta(); }
  renderGuide();
}

// 引导提示条：只在「对局中」显示（升级 / 暂停面板会盖住它，收起来更干净）
function renderGuide() {
  const el = document.getElementById('guide-tip');
  if (!el) return;
  const cur = guideCur();
  if (!cur || state !== 'playing') { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const txt = document.getElementById('guide-text');
  const prog = document.getElementById('guide-prog');
  if (txt) txt.textContent = cur.tip;
  if (prog) prog.textContent = `${guideStep + 1}/${GUIDE_STEPS.length}`;
}

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

// 头像（V1.34）：存档里只存「用哪种模型」，不存图片。
//   kind = 'char'    -> 用当前「角色外观」（meta.character）渲染，永远跟着外观走
//   kind = 'monster' -> 用某个怪物模型渲染，type 取 ENEMY_TYPES 的 key
// 这份数据会被同步到服务端的公开头像列（好友列表要读别人的头像，而 meta 是隐私）。
function defaultAvatar() { return { kind: 'char' }; }
function validAvatar(a) {
  if (!a || typeof a !== 'object') return false;
  if (a.kind === 'char') return true;
  // 只认「头像可选列表」里的怪物（AVATAR_MONSTERS）—— 树怪有独立绘制函数、不吃 context，不在列内
  return a.kind === 'monster' && avatarIndex(a) > 0;
}

function defaultMeta() {
  return {
    schemaVersion: META_SCHEMA,   // 存档结构版本（V1.32）：读档时按版本逐步迁移
    mode: 'standard',             // 上次选择的游戏模式（V1.32）
    standardCleared: false,       // 是否通关过标准模式（通关后开放无尽模式）
    coins: 0,
    unlocked: { weapons: ['rifle'], armor: ['none'], trinket: ['none'], pets: ['none'] },
    equipped: { weapon: 'rifle', armor: 'none', trinket1: 'none', trinket2: 'none', pet: 'none' },
    gear: {},            // 装备词条：{ 装备 id: [词条 id…] }（V1.29）
    petDev: {},          // 宠物养成：{ 龙蛋/精灵: { lv, exp, energy, star, affixes, talents } }
    character: defaultCharacter(),
    avatar: defaultAvatar(),   // 头像（V1.34）
    settings: { sound: true, orient: 'portrait', fps: 0, effects: 'full', theme: 'forest' },
    bestWave: 0,
    devMode: false,      // 开发者模式：设置页连续切换音效 10 次后输入密码进入
    guide: { done: false, seen: {} },   // V1.35 首局引导：done = 五步全走完；seen = 各步是否已触发过
    run: null,           // 上把未结束的进度快照（返回主菜单时保存）
  };
}

// 兼容旧存档：补齐新增字段
function normalizeMeta(m) {
  if (typeof m.coins !== 'number') m.coins = 0;
  if (typeof m.bestWave !== 'number') m.bestWave = 0;
  if (!modeSelectable(m.mode)) m.mode = 'standard';       // V1.32：模式只认 standard / endless
  if (typeof m.standardCleared !== 'boolean') m.standardCleared = false;
  if (m.run === undefined) m.run = null;
  if (m.devMode === undefined) m.devMode = false;
  // V1.35 首局引导：老档没有这个字段就当作「还没引导过」（下次开局会走一遍五步）
  if (!m.guide || typeof m.guide !== 'object') m.guide = { done: false, seen: {} };
  if (typeof m.guide.done !== 'boolean') m.guide.done = false;
  if (!m.guide.seen || typeof m.guide.seen !== 'object') m.guide.seen = {};
  if (!m.character) m.character = defaultCharacter();
  if (!m.character.species) m.character.species = 0;      // V1.31：物种（0 福瑞 / 1 牛来）
  if (!validAvatar(m.avatar)) m.avatar = defaultAvatar(); // V1.34：头像（非法值一律退回「用角色外观」）
  if (!m.settings) m.settings = { sound: true, orient: 'portrait', fps: 0 };
  if (!m.settings.effects) m.settings.effects = 'full';
  if (!Object.hasOwn(UI_THEMES, m.settings.theme)) m.settings.theme = 'forest';
  if (!m.settings.orient) m.settings.orient = 'portrait';
  if (m.settings.fps === undefined) m.settings.fps = 0;
  if (!m.unlocked) m.unlocked = { weapons: ['rifle'], armor: ['none'], trinket: ['none'], pets: ['none'] };
  if (!m.equipped) m.equipped = { weapon: 'rifle', armor: 'none', trinket1: 'none', trinket2: 'none', pet: 'none' };
  // ===== V1.29 装备系统换代：旧的单一「装备」槽拆成 护甲 / 饰品 =====
  // 旧 unlocked.equipment / equipped.equipment 分别按 id 归到 armor 或 trinket，归不到的丢弃
  if (!m.gear) m.gear = {};
  if (!Array.isArray(m.unlocked.armor)) m.unlocked.armor = ['none'];
  if (!Array.isArray(m.unlocked.trinket)) m.unlocked.trinket = ['none'];
  if (!Array.isArray(m.unlocked.weapons)) m.unlocked.weapons = ['rifle'];
  if (!m.unlocked.weapons.includes('rifle')) m.unlocked.weapons.unshift('rifle');
  if (!m.equipped.armor) m.equipped.armor = 'none';
  const oldEqUnlocked = m.unlocked.equipment;
  if (Array.isArray(oldEqUnlocked)) {
    oldEqUnlocked.forEach(id => {
      const slot = gearSlotOf(id);
      if (slot === 'armor' && !m.unlocked.armor.includes(id)) m.unlocked.armor.push(id);
      if ((slot === 'trinket1' || slot === 'trinket2') && !m.unlocked.trinket.includes(id)) m.unlocked.trinket.push(id);
    });
    delete m.unlocked.equipment;
  }
  const oldEq = m.equipped.equipment;
  if (oldEq !== undefined) {
    const slot = gearSlotOf(oldEq);
    if (slot === 'armor' || slot === 'trinket1' || slot === 'trinket2') m.equipped[slot] = oldEq;
    delete m.equipped.equipment;
  }
  // ===== V1.31 装备体系换代：三槽 → 四槽（武器 / 护甲 / 饰品 ×2），「物品」槽取消并并入饰品池 =====
  // 旧 equipped.trinket → trinket1；旧 equipped.item（若在饰品池里）挪到空的 trinket2；unlocked.items 整体并入 unlocked.trinket
  if (!m.equipped.trinket1) m.equipped.trinket1 = m.equipped.trinket || 'none';
  if (!m.equipped.trinket2) m.equipped.trinket2 = 'none';
  const oldItem = m.equipped.item;
  if (oldItem && oldItem !== 'none' && TRINKET_DEFS[oldItem] && m.equipped.trinket2 === 'none') m.equipped.trinket2 = oldItem;
  delete m.equipped.item;
  delete m.equipped.trinket;
  if (Array.isArray(m.unlocked.items)) {
    m.unlocked.items.forEach(id => {
      if (id && id !== 'none' && TRINKET_DEFS[id] && !m.unlocked.trinket.includes(id)) m.unlocked.trinket.push(id);
    });
    delete m.unlocked.items;
  }
  // 装备合法性兜底：id 已不存在（旧版本删掉的装备 / 手改存档）就退回空槽
  GEAR_SLOTS.forEach(slot => {
    const empty = slot === 'weapon' ? 'rifle' : 'none';
    if (!m.equipped[slot] || !GEAR_DEFS[slot][m.equipped[slot]]) m.equipped[slot] = empty;
  });
  // 装备词条（V1.30 / V1.31）：归一化结构（兼容 V1.29 的纯 id 数组），并按洗练进度补齐已解锁条数
  GEAR_SLOTS.forEach(slot => {
    const cat = GEAR_CAT[slot];
    (m.unlocked[cat] || []).forEach(id => {
      if (id === 'none') return;
      const def = gearDef(id);
      if (!def || !def.affixCount) return;
      const g = gearStateOf(m.gear, id);
      const n = gearAffixCount(g);
      const pool = affixPoolOf(id);
      while (g.affixes.length < n) {
        const a = sampleAffix(g.affixes, pool);
        if (!a) break;
        g.affixes.push(a);
      }
      while (g.lock.length < g.affixes.length) g.lock.push(false);
    });
  });
  if (!m.petDev) m.petDev = {};
  if (!m.eggs) m.eggs = { opened: 0 };               // V1.27 孵蛋：累计开蛋数
  delete m.eggs.pity;                                // V1.28 起没有「必出宠物」保底了（合成靠能量满 100）
  Object.keys(PET_DEFS).forEach(id => {
    const d = m.petDev[id];
    if (!d) { m.petDev[id] = { lv: 1, exp: 0, energy: 0, star: 1, affixes: [], talents: {} }; return; }
    if (!d.lv) d.lv = 1;
    if (!d.exp) d.exp = 0;
    // V1.28：旧「碎片」整体并入该宠物的能量碎片（1:1）。能量未拥有时用于合成、已拥有时用于升星
    if (d.energy === undefined) d.energy = d.shards || 0;
    delete d.shards;
    if (!d.star) d.star = 1;
    if (!Array.isArray(d.affixes)) d.affixes = [];
    if (!d.talents) d.talents = {};
    // V1.27 天赋树换代：丢掉旧版分支（flame / might / scale…），只保留新树的节点并夹在合法范围内
    const tree = PET_TREES[id] || [];
    const kept = {};
    tree.forEach(n => {
      const p = Math.max(0, Math.min(n.max, Math.floor(d.talents[n.id] || 0)));
      if (p > 0) kept[n.id] = p;
    });
    d.talents = kept;
  });
  // 装备了却不在已解锁列表（旧存档 / 手改存档）：补回解锁，避免界面上无法操作
  const catOf = { weapon: 'weapons', armor: 'armor', trinket1: 'trinket', trinket2: 'trinket', pet: 'pets' };
  Object.entries(catOf).forEach(([k, cat]) => {
    const id = m.equipped[k];
    if (id && Array.isArray(m.unlocked[cat]) && !m.unlocked[cat].includes(id)) m.unlocked[cat].push(id);
  });
  return m;
}

// ==================== 存档结构版本与迁移（V1.32） ====================
// 改存档结构时：① 把 META_SCHEMA +1；② 在 META_MIGRATIONS 里补一步「从上一版升到本版」。
// 读取存档一律走 migrateMeta()：**校验 → 按版本逐步迁移 → 补齐字段（normalizeMeta）→ 再校验 + 盖版本号**。
// 这样「旧档自动迁移」是版本驱动的：没有 schemaVersion 的老存档按 v1 处理，会依次跑完所有升级步骤。
// （META_SCHEMA 在文件上方「随机流」一节之后声明，因为 defaultMeta() 需要它。）
// 每一步只负责「从上一版升到本版」；normalizeMeta 永远是最后那道「补齐字段 / 兜底」，两者分工不重叠。
const META_MIGRATIONS = [
  {
    to: 2,
    name: 'v1 → v2：对局快照补上随机流种子（V1.32）与「有护盾时受伤」字段（V1.31）',
    migrate(m) {
      // V1.32 新增的游戏模式：老玩家只要最高波次已经到过 20，就直接视为「标准模式已通关」
      if (typeof m.standardCleared !== 'boolean') m.standardCleared = (m.bestWave || 0) >= STANDARD_WAVES;
      const r = m.run;
      if (!r || typeof r !== 'object') return;
      // 旧快照没有种子：显式置为 null（读档时保持当前随机流，不假装可复现）
      if (typeof r.seed !== 'number') { r.seed = null; r.rngCounts = null; }
      if (r.stats && r.stats.shieldDamageTaken === undefined) r.stats.shieldDamageTaken = 1;
    },
  },
  {
    to: 3,
    name: 'v2 → v3：新增头像（V1.34，默认「用角色外观」）',
    migrate(m) {
      if (!m.avatar || typeof m.avatar !== 'object') m.avatar = { kind: 'char' };
    },
  },
  {
    to: 4,
    name: 'v3 → v4：新增首局引导状态（V1.35，未引导过）',
    migrate(m) {
      if (!m.guide || typeof m.guide !== 'object') m.guide = { done: false, seen: {} };
    },
  },
];

function schemaVersionOf(m) {
  const v = m && m.schemaVersion;
  return (typeof v === 'number' && Number.isFinite(v) && v > 0) ? Math.floor(v) : 1;
}

// 存档校验：宽松档只查「致命」问题（读档第一道门，老存档缺字段是正常的）；
// 严格档在迁移 + 补齐之后再查一次（此时字段该齐了），只告警不丢档。
function validateMeta(m, opts = {}) {
  const strict = !!opts.strict;
  const problems = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, problems: ['存档不是一个对象'] };
  const has = k => m[k] !== undefined && m[k] !== null;
  if (has('coins') && !(typeof m.coins === 'number' && Number.isFinite(m.coins))) problems.push('coins 不是数字');
  if (has('bestWave') && !(typeof m.bestWave === 'number' && Number.isFinite(m.bestWave))) problems.push('bestWave 不是数字');
  if (has('unlocked') && (typeof m.unlocked !== 'object' || Array.isArray(m.unlocked))) problems.push('unlocked 不是对象');
  if (has('equipped') && (typeof m.equipped !== 'object' || Array.isArray(m.equipped))) problems.push('equipped 不是对象');
  if (has('gear') && (typeof m.gear !== 'object' || Array.isArray(m.gear))) problems.push('gear 不是对象');
  if (has('petDev') && (typeof m.petDev !== 'object' || Array.isArray(m.petDev))) problems.push('petDev 不是对象');
  if (has('schemaVersion') && !(typeof m.schemaVersion === 'number' && Number.isFinite(m.schemaVersion))) problems.push('schemaVersion 不是数字');
  if (has('run') && (typeof m.run !== 'object' || Array.isArray(m.run))) problems.push('run 快照不是对象');
  if (strict) {
    if (!m.unlocked || typeof m.unlocked !== 'object') problems.push('unlocked 缺失');
    else ['weapons', 'armor', 'trinket', 'pets'].forEach(k => {
      if (!Array.isArray(m.unlocked[k])) problems.push('unlocked.' + k + ' 不是数组');
    });
    if (!m.equipped || typeof m.equipped !== 'object') problems.push('equipped 缺失');
    else GEAR_SLOTS.concat('pet').forEach(k => {
      if (typeof m.equipped[k] !== 'string') problems.push('equipped.' + k + ' 不是字符串');
    });
    if (!(typeof m.coins === 'number' && m.coins >= 0)) problems.push('金币非法');
    if (!(typeof m.bestWave === 'number' && m.bestWave >= 0)) problems.push('最佳波数非法');
  }
  return { ok: problems.length === 0, problems };
}

// 读档主入口：坏档返回 null（调用方负责另存备份 + 走新建流程），不认识的「未来版本」也一律拒绝
function migrateMeta(raw) {
  const scan = validateMeta(raw);
  if (!scan.ok) { console.warn('[save] 存档校验未通过：' + scan.problems.join('、')); return null; }
  const from = schemaVersionOf(raw);
  if (from > META_SCHEMA) { console.warn(`[save] 存档版本 v${from} 高于当前程序 v${META_SCHEMA}（降级过？）`); return null; }
  // 逐步迁移：只要步骤的目标版本比存档当前版本新，就按顺序执行
  META_MIGRATIONS.filter(s => s.to > from).sort((a, b) => a.to - b.to).forEach(step => {
    try { step.migrate(raw); } catch (e) { console.warn('[save] 迁移步骤失败：' + step.name, e); }
  });
  normalizeMeta(raw);
  raw.schemaVersion = META_SCHEMA;
  const after = validateMeta(raw, { strict: true });
  if (!after.ok) console.warn('[save] 迁移后自检仍有问题（不丢档，仅告警）：' + after.problems.join('、'));
  return raw;
}

// ==================== 宠物养成：数据与结算 ====================
function petDev(id) {
  if (!meta.petDev) meta.petDev = {};
  if (!meta.petDev[id]) meta.petDev[id] = { lv: 1, exp: 0, energy: 0, star: 1, affixes: [], talents: {} };
  if (meta.petDev[id].energy === undefined) meta.petDev[id].energy = 0;
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
  if (d.lv < (br.reqLv || 1)) return;                    // 等级没到，不能投（技能节点有等级前置）
  if ((d.talents[br.id] || 0) >= br.max) return;
  if (petTalentFree(d) <= 0) return;
  d.talents[br.id] = (d.talents[br.id] || 0) + 1;
  saveMeta();
  renderMenu(true);      // 就地刷新：加点后留在宠物养成页
}

// 局外加成汇总：等级 + 升星 + 天赋树（普攻强化 + 技能节点）+ 词条
function petBonus(id) {
  const d = petDev(id);
  const b = {
    dmgMul: (1 + 0.02 * (d.lv - 1)) * (1 + 0.06 * (d.star - 1)),
    rateMul: 1 + 0.03 * Math.floor((d.lv - 1) / 3),
    extraShots: 0, rangeMul: 1, hitHeal: 0, killShield: 0, burnMul: 1, burnTimeMul: 1, igniteSpread: false,
    skillCdMul: 1, stunMul: 1, slowTimeMul: 1, freezeTimeMul: 1,
    skills: {},                                          // 已解锁技能：id → { lv, cdMul, power }
  };
  const atk = d.talents.atk || 0;
  if (atk > 0) { b.dmgMul *= 1 + 0.06 * atk; b.rateMul *= 1 + 0.05 * atk; }
  (PET_SKILLS[id] || []).forEach(sk => {
    const p = d.talents[sk.id] || 0;                     // 0 点 = 该技能没有专精加成（技能本体在局内三选一）
    b.skills[sk.id] = {
      lv: p,
      cdMul: Math.max(0.35, 1 - PET_DEV_CFG.cdPerPoint * p),
      power: 1 + PET_DEV_CFG.powerPerPoint * p,
    };
  });
  (d.affixes || []).forEach(a => { if (PET_AFFIXES[a]) PET_AFFIXES[a].apply(b); });
  Object.values(b.skills).forEach(s => { s.cdMul = Math.max(0.35, s.cdMul * b.skillCdMul); });
  return b;
}

// 升星：消耗该宠物的能量碎片（10/星），3★ / 5★ 各解锁一个随机词条
function starUpPet(id) {
  const d = petDev(id);
  if (d.star >= PET_DEV_CFG.starMax || d.energy < PET_DEV_CFG.shardPerStar) return;
  d.energy -= PET_DEV_CFG.shardPerStar;
  d.star++;
  if (d.star === 3 || d.star === 5) {
    const pool = petAffixPool(id).filter(a => !d.affixes.includes(a));
    if (pool.length) d.affixes.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  saveMeta();
  renderMenu(true);      // 就地刷新：升星后留在宠物养成页
}

// 合成（V1.28）：能量碎片攒满 PET_ENERGY_NEED 就能把该宠物直接合成出来
function synthesizePet(id) {
  if (!PET_DEFS[id]) return false;
  if (meta.unlocked.pets.includes(id)) return false;
  const d = petDev(id);
  if (d.energy < PET_ENERGY_NEED) return false;
  d.energy -= PET_ENERGY_NEED;
  meta.unlocked.pets.push(id);
  if (!meta.equipped.pet || meta.equipped.pet === 'none') meta.equipped.pet = id;   // 第一只自动出战
  saveMeta();
  renderMenu(true);      // 就地刷新：合成后留在宠物页
  return true;
}

// 孵蛋（V1.28）：扣金币 → 决定「直接孵出」还是「给能量碎片」→ 存档。返回结果给开蛋动画用，本身不改 UI。
//   fixed  ：指定蛋，目标就是它；已拥有时一定只给能量（拿去升星）
//   random ：普通蛋，目标 = 还没合成的宠物里能量最高的那只（并列随机），保证进度会收敛到「攒满一只」
function eggTarget(egg) {
  if (egg.pet) return egg.pet;
  const all = Object.keys(PET_DEFS);
  const missing = all.filter(id => !meta.unlocked.pets.includes(id));
  const from = missing.length ? missing : all;
  let best = -Infinity, pool = [];
  from.forEach(id => {
    const e = petDev(id).energy;
    if (e > best) { best = e; pool = [id]; } else if (e === best) pool.push(id);
  });
  return pool[Math.floor(Math.random() * pool.length)];
}

function hatchEgg(eggId) {
  const egg = EGGS[eggId];
  if (!egg) return null;
  if (meta.coins < egg.cost) return { ok: false, reason: 'coins', egg: eggId };
  const pet = eggTarget(egg);
  const owned = meta.unlocked.pets.includes(pet);
  const key = egg.pet ? 'fixed' : 'random';
  meta.coins -= egg.cost;
  meta.eggs.opened = (meta.eggs.opened || 0) + 1;
  let energy = 0, newPet = false;
  if (!owned && Math.random() < EGG_DIRECT[key]) {
    meta.unlocked.pets.push(pet);
    newPet = true;
  } else {
    const [lo, hi] = EGG_ENERGY[key];
    energy = lo + Math.floor(Math.random() * (hi - lo + 1));
    petDev(pet).energy += energy;
  }
  if (!meta.equipped.pet || meta.equipped.pet === 'none') meta.equipped.pet = pet;   // 第一只自动出战
  saveMeta();
  return {
    ok: true, egg: eggId, pet, newPet, energy,
    name: PET_DEFS[pet].name, elem: PET_DEFS[pet].elem, energyName: PET_ENERGY[pet],
    total: petDev(pet).energy, need: PET_ENERGY_NEED,
    star: petDev(pet).star, lv: petDev(pet).lv, coins: meta.coins,
  };
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
    if (window.furyStore && window.furyStore.save) {
      try { window.furyStore.save(users); }
      catch (e) { console.warn('[save] 本地文件写入失败：' + ((e && e.message) || e)); setSaveFailHint(); }
    }
    return;
  }
  try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
  catch (e) { console.warn('[save] 本地存档写入失败：' + ((e && e.message) || e)); setSaveFailHint(); }
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
// V1.32：写入前把「上一份好档」留成备份；解析失败 / 校验不过的坏档原样留档（不覆盖备份）
function metaBackupKey(username) { return metaCacheKey(username) + '__backup'; }
function metaBrokenKey(username) { return metaCacheKey(username) + '__broken'; }

function readMetaCache(username) {
  try { return JSON.parse(localStorage.getItem(metaCacheKey(username)) || 'null'); } catch (e) { return null; }
}

function readMetaBackup(username) {
  try { return JSON.parse(localStorage.getItem(metaBackupKey(username)) || 'null'); } catch (e) { return null; }
}

// 原子写：先写临时键并回读校验，确认完整了才替换主键。
// 中途失败（配额满 / 隐私模式 / 序列化异常）时临时键会被清掉，**主键保持上一份好档不变**，
// 不会留下「写了一半」的存档 —— 这就是「写入失败回滚」。
function writeMetaCache(text) {
  const key = metaCacheKey();
  const tmp = key + '__tmp';
  try {
    localStorage.setItem(tmp, text);
    if (localStorage.getItem(tmp) !== text) throw new Error('回读校验不一致');
    localStorage.setItem(key, text);
    localStorage.removeItem(tmp);
    return true;
  } catch (e) {
    try { localStorage.removeItem(tmp); } catch (_) {}
    console.warn('[save] 本机存档写入失败：' + ((e && e.message) || e));
    return false;
  }
}

// 服务端存档比本机镜像旧（上次没同步上去）时，问用户要不要用本机这份
function reconcileMeta(serverMeta, username) {
  const cached = readMetaCache(username);
  const mine = serverMeta || {};
  if (!cached || !(cached.savedAt > (mine.savedAt || 0))) return mine;
  if (confirm('本机有一份更新的存档（上次没能同步到云端），要用它覆盖云端吗？')) return cached;
  return mine;
}

let hintText = '';

// 存档状态提示（同一条浮层：既报「没同步到云端」，也报「本机写不进去」）
function setHint(text) {
  if (text === hintText) return;
  hintText = text;
  const el = document.getElementById('sync-hint');
  if (!el) return;
  el.classList.toggle('hidden', !text);
  if (text) el.textContent = text;
}

function setSyncHint(on) {
  setHint(on ? '存档暂未同步到云端，已存在本机，联网后自动重试' : '');
}

function setSaveFailHint() {
  setHint('本机存档写入失败：本次进度没有保存，上一份存档仍然可用');
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
// 注册时顺带把头像写进公开头像列（好友列表要读，而 meta 是隐私、不能下发）。
function registerAccount(user) {
  return fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: { username: user.username, password: user.password, meta: user.meta, avatar: (user.meta && user.meta.avatar) || null },
      createOnly: true,
    }),
  }).then(r => {
    if (r.ok) return r.json().catch(() => ({}));
    if (r.status === 409) return { conflict: true };
    return apiFail(r).then(e => Promise.reject(e));
  });
}

// HTTP 通道：只提交存档（需令牌），不带密码。
// V1.34：连同 `avatar` 一起提交 —— 它是存档里 meta.avatar 的**公开副本**，只放渲染头像要用的字段。
function patchMeta(username, nextMeta) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  return fetch('/api/users', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ username, meta: nextMeta, avatar: (nextMeta && nextMeta.avatar) || null }),
  }).then(r => (r.ok ? true : apiFail(r).then(e => Promise.reject(e))));
}

// 存档：先写本机镜像（原子写 + 回读校验），成功后再同步到后端。
// V1.32：写之前把「上一份好档」留成备份；写失败保留旧档并提示，绝不产生半写状态的存档。
function saveMeta() {
  if (!currentUser) return false;
  meta.schemaVersion = META_SCHEMA;    // 每次保存都盖当前结构版本号（配合 migrateMeta 的逐步迁移）
  meta.savedAt = Date.now();
  let text;
  try { text = JSON.stringify(meta); }
  catch (e) { console.warn('[save] 存档序列化失败：' + ((e && e.message) || e)); setSaveFailHint(); return false; }
  let prev = null;
  try { prev = localStorage.getItem(metaCacheKey()); } catch (e) {}
  if (!writeMetaCache(text)) { setSaveFailHint(); return false; }
  if (prev) { try { localStorage.setItem(metaBackupKey(), prev); } catch (e) {} }
  const u = users.find(x => x.username === currentUser);
  if (u) u.meta = meta;
  if (usesHttpStore()) pushMeta(currentUser, meta, 0);
  else saveUsers();
  return true;
}

// 坏档处理：① 原始内容另存备查（不覆盖任何东西）；② 有备份就问一句要不要恢复；
// ③ 都没有就交给调用方新建存档。`autoRestore` 供自动化测试跳过询问。
function handleBrokenMeta(username, source, opts = {}) {
  try {
    const raw = JSON.stringify(source);
    if (raw && raw !== '{}') localStorage.setItem(metaBrokenKey(username), raw);
  } catch (e) {}
  const backup = readMetaBackup(username);
  if (backup && (opts.autoRestore || confirm('检测到存档损坏。\n要用「上一份备份」恢复吗？\n（选「取消」将以新存档开始，损坏的原档已另存备查）'))) {
    const restored = migrateMeta(backup);
    if (restored) return restored;
  }
  if (backup) setHint('存档损坏：已另存备查，可在开发者面板点「恢复上次备份」找回');
  return null;
}

// 读档：挑来源 → 校验 + 迁移 → 坏档另存备查并回退（不覆盖任何东西）
function loadMetaFor(username, rawMeta) {
  const source = usesHttpStore() ? reconcileMeta(rawMeta, username) : (rawMeta || {});
  const migrated = migrateMeta(source);
  if (migrated) return migrated;
  return handleBrokenMeta(username, source) || defaultMeta();
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
  meta = loadMetaFor(username, rawMeta);
  renderMenu();
  showMenu();
  renderCoop();    // 房间面板初始状态（不在房里 → 显示「生成房间码 / 加入房间」）
  // 带 ?room=<code> 的邀请链接：自动打开好友面板并把房间码填进输入框（整次会话只处理一次）
  if (!coopUrlHandled) { coopUrlHandled = true; coopHandleUrl(); }
  loadFriends();   // 主页好友入口要显示「未处理申请 + 收到的房间邀请」的红点
}

function logout() {
  currentUser = null;
  meta = defaultMeta();
  friendData.friends = []; friendData.incoming = []; friendData.outgoing = [];   // 换账号，别把上一个人的好友带过来
  coopRoom = null; coopInvites = [];   // 同理，房间与房间邀请也不能留给下一个账号
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
  setState('menu', { clean: true });
  applyTheme();
  document.getElementById('login').classList.add('hidden');
  document.getElementById('intro').classList.add('hidden');
  applyOrientation();
  playIntro();
  showHome();
}

// ==================== 主页 / 子页面 ====================
function showHome() {
  closeBoard();
  closeFriends();
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
// 移速：「守护」的「有盾加速」是条件倍率，放在最终值上乘（不写回 stats.moveSpeed，
// 这样破盾/回盾会实时切换，不需要反复增减）
function moveSpeed() {
  const g = squad.shield > 0 ? 1 + (stats.guardianMove || 0) : 1;
  return CFG.moveSpeed * stats.moveSpeed * g;
}
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
  pool.push({ id: 'shield', name: '护盾 +20', desc: '护盾抵挡伤害，破盾 5 秒后恢复', weight: W_NORM, apply() { squad.shieldMax += 20; squad.shield += 20; learnTag('护盾：受伤先扣盾，破盾 5 秒后恢复'); } });
  // ===== 守护线（V1.35）：守护 → 盾反 → 坚定守护，严格按顺序解锁 =====
  if (poolGate(squad.shieldMax > 0)) {
    const gLv = cardLv('guardian');
    if (poolGate(gLv < 3)) {
      pool.push({
        id: 'guardian', name: '守护',
        desc: `护盾上限 +${GUARDIAN_SHIELD[gLv]}（累计）、拥有护盾时移速 +${Math.round(GUARDIAN_MOVE[gLv] * 100)}%（累计）（共 3 次，需先选「护盾 +20」）`,
        weight: W_NORM,
        apply() {
          markPick('guardian');
          const lv = cardLv('guardian') - 1;
          const add = GUARDIAN_SHIELD[lv] - (stats.guardianShieldAdd || 0);   // 累计值 → 只补差值
          stats.guardianShieldAdd = GUARDIAN_SHIELD[lv];
          stats.guardianMove = GUARDIAN_MOVE[lv];
          squad.shieldMax += add; squad.shield += add;
        },
      });
    }
    if (gLv >= 1 && poolGate(cardLv('shield-thorns') < 3)) {
      const tLv = cardLv('shield-thorns');
      pool.push({
        id: 'shield-thorns', name: '盾反',
        desc: `护盾激活时，受到伤害反弹 ${Math.round(SHIELD_THORNS[tLv] * 100)}% 给周围敌人；若伤害超出护盾量，护盾炸开对四周造成 ${Math.round(SHIELD_BURST[tLv] * 100)}% 伤害并击退（共 3 次，需先选「守护」）`,
        weight: W_NORM,
        apply() {
          markPick('shield-thorns');
          const lv = cardLv('shield-thorns') - 1;
          stats.shieldThornsPct = SHIELD_THORNS[lv];
          stats.shieldBurstPct = SHIELD_BURST[lv];
        },
      });
    }
    if (cardLv('shield-thorns') >= 1 && poolGate(cardLv('guardian-steady') < 3)) {
      const sLv = cardLv('guardian-steady');
      pool.push({
        id: 'guardian-steady', name: '坚定守护',
        desc: `护盾恢复冷却 -${STEADY_CUT[sLv]}s（共 3 次，需先选「盾反」）`,
        weight: W_NORM,
        apply() { markPick('guardian-steady'); stats.shieldRegenCut = STEADY_CUT[cardLv('guardian-steady') - 1]; },
      });
    }
  }
  if (poolGate(stats.invulnDuration < 1.0)) {
    pool.push({ id: 'invuln', name: '受伤免疫 +0.5s', desc: '受击后 0.5 秒内免疫伤害（冷却 5s，仅扣血触发）', weight: W_NORM, apply() { stats.invulnDuration = Math.min(1.0, stats.invulnDuration + 0.5); } });
  }
  // ===== 巨人线（V1.35）：需先「增加部队生命」；小小巨人 / 大大巨人互斥（体型影响受伤碰撞体积）=====
  if (cardLv('hp') > 0 && poolGate(!appliedIds.has('giant-lite') && !appliedIds.has('giant-big'))) {
    pool.push({
      id: 'giant-lite', name: '小小巨人',
      desc: '体型 -50%、移速 +20%、生命上限 -40%、每秒回复 +5（需先选「生命上限 +20%」，与「大大巨人」二选一）',
      weight: W_NORM,
      apply() {
        stats.bodyMul = bodyMul() * 0.5;
        stats.moveSpeed *= 1.2;
        stats.maxHp *= 0.6;
        refreshSquadPool();
        squadHp = Math.min(squadHp, squadMaxHp);
        stats.regen = (stats.regen || 0) + 5;
      },
    });
    pool.push({
      id: 'giant-big', name: '大大巨人',
      desc: '体型 +50%、移速 -20%、生命上限 +30%（需先选「生命上限 +20%」，与「小小巨人」二选一）',
      weight: W_NORM,
      apply() {
        stats.bodyMul = bodyMul() * 1.5;
        stats.moveSpeed *= 0.8;
        stats.maxHp *= 1.3;
        const before = squadMaxHp;
        refreshSquadPool();
        squadHp += Math.max(0, squadMaxHp - before);
      },
    });
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
    // 闪电专精（V1.33）：三段纯数值成长 —— 第 1 段就把落雷从单体变成范围伤害
    const lmLv = cardLv('lightning-mastery');
    if (poolGate(lmLv < 3)) {
      pool.push({
        id: 'lightning-mastery', name: '闪电专精',
        desc: `雷击附带 ${Math.round(LIGHTNING_SPLASH_PCT[lmLv] * 100)}% 范围伤害（半径 ${LIGHTNING_SPLASH_R[lmLv]}），闪电伤害 +${Math.round(LIGHTNING_MASTERY_DMG[lmLv] * 100)}%（共 3 次，数值为累计）`,
        weight: W_NORM,
        apply() {
          markPick('lightning-mastery');
          const lv = cardLv('lightning-mastery') - 1;
          stats.lightningMastery = LIGHTNING_MASTERY_DMG[lv];
          stats.lightningSplashR = LIGHTNING_SPLASH_R[lv];
          stats.lightningSplashPct = LIGHTNING_SPLASH_PCT[lv];
        },
      });
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
  // 火焰专精（V1.33）：三段纯数值成长 —— 固定火焰伤害直接加在点燃的基础 dps 上，点燃时长同理。
  // V1.34：门槛只看**玩家自己的点燃来源**「火焰附魔」。**宠物元素伤害不算拥有前置**
  //（龙蛋的火伤不提供本体点燃基础值，拿在手里是空的），所以不再接受 `petElem() === 'fire'`。
  const fmLv = cardLv('fire-mastery');
  if (poolGate(cardLv('enchant-fire') > 0) && poolGate(fmLv < 3)) {
    pool.push({
      id: 'fire-mastery', name: '火焰专精',
      desc: `火焰伤害 +${FIRE_MASTERY_DMG[fmLv]}（固定值）、点燃时间 +${FIRE_MASTERY_TIME[fmLv]}s（共 3 次，数值为累计）`,
      weight: W_NORM,
      apply() {
        markPick('fire-mastery');
        const lv = cardLv('fire-mastery') - 1;
        stats.fireFlat = FIRE_MASTERY_DMG[lv];
        stats.fireBurnTime = FIRE_MASTERY_TIME[lv];
      },
    });
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
    // 镰刀专精（V1.33）：固定伤害 + 命中冷却，与飞剑专精同一套结构
    const smLv = cardLv('scythe-mastery');
    if (poolGate(smLv < 3)) {
      pool.push({
        id: 'scythe-mastery', name: '镰刀专精',
        desc: `镰刀伤害 +${SCYTHE_MASTERY_DMG[smLv]}（固定值）、命中冷却 -${Math.round(SCYTHE_MASTERY_CD[smLv] * 100)}%（共 3 次，数值为累计）`,
        weight: W_NORM,
        apply() {
          markPick('scythe-mastery');
          const lv = cardLv('scythe-mastery') - 1;
          stats.scytheFlat = SCYTHE_MASTERY_DMG[lv];
          stats.scytheHitCdMul = 1 - SCYTHE_MASTERY_CD[lv];
        },
      });
    }

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
    // 飞剑专精（V1.33）：固定伤害 + 命中冷却（命中冷却就是飞剑输出被「每趟 0.6s」锁死的那道闸）
    const wmLv = cardLv('sword-mastery');
    if (poolGate(wmLv < 3)) {
      pool.push({
        id: 'sword-mastery', name: '飞剑专精',
        desc: `飞剑伤害 +${SWORD_MASTERY_DMG[wmLv]}（固定值）、命中冷却 -${Math.round(SWORD_MASTERY_CD[wmLv] * 100)}%（共 3 次，数值为累计）`,
        weight: W_NORM,
        apply() {
          markPick('sword-mastery');
          const lv = cardLv('sword-mastery') - 1;
          stats.swordFlat = SWORD_MASTERY_DMG[lv];
          stats.swordHitCdMul = 1 - SWORD_MASTERY_CD[lv];
        },
      });
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
    // 技能三选一（V1.29）：携带宠物的 3 个技能各出一张**互斥**卡，选一张才能释放（且只能选一个）
    const skills = PET_SKILLS[pet.type] || [];
    if (!pet.skillPick) {
      skills.forEach(sk => {
        const st = pet.skills && pet.skills[sk.id];
        const own = st && st.lv > 0 ? `（已专精 ${st.lv}/3）` : '';
        pool.push({
          id: `pet-skill-${sk.id}`, name: `宠物技能 · ${sk.name}`,
          desc: `${sk.desc}（CD ${sk.cd}s · **三选一**，选定后本局只能放这一个）${own}`,
          weight: W_NORM,
          apply() { pet.skillPick = sk.id; pet.skillName = sk.name; pet.energy = 0; },
        });
      });
    } else {
      // 已选定 → 才出针对**这一个技能**的强化卡（升级靠局内）
      const sk = skills.find(s => s.id === pet.skillPick);
      if (sk) {
        const mods = pet.skillMods[sk.id] || (pet.skillMods[sk.id] = { cd: 0, power: 0 });
        if (poolGate(mods.cd < 3)) {
          pool.push({
            id: `pet-skill-cd-${sk.id}`, name: `${sk.name}·冷却 -20%`, desc: `${sk.name}冷却更短（每级 -20%，最多 3 级）`, weight: W_NORM,
            apply() { mods.cd++; },
          });
        }
        if (poolGate(mods.power < 3)) {
          pool.push({
            id: `pet-skill-pow-${sk.id}`, name: `${sk.name}·强化 +25%`, desc: `${sk.name}的伤害 / 范围 / 持续 +25%（每级，最多 3 级）`, weight: W_NORM,
            apply() { mods.power++; },
          });
        }
      }
    }
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
  // V1.37：带上归属。敌人索敌会跨两名玩家找「最近的那个兵」，扣血要能找回自己的血池。
  // **存的是玩家 id（数字），不是玩家对象引用** —— 引用会让 soldiers ⇄ player 成环，
  // snapshotRun() / saveRun() 的 JSON.stringify 会直接抛「Converting circular structure to JSON」，
  // 结果是「返回主菜单后继续」静默失效。见 playerOf()。
  return { x: squad.x, y: squad.y, owner: activePlayer ? activePlayer.id : 0 };
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

// 吸血回复：按伤害比例回队伍血池（V1.31：提示统一成红色，且显示**实际**回血量）
// 旧版固定绿色 + 直接用请求量显示，血池将满时提示会明显大于真实回血，这里改成按实际差值报数。
const LEECH_COLOR = '#ff8f9a';
let lastLeechText = 0;
function leechHeal(amount) {
  if (!(amount > 0) || !soldiers.length) return;
  const before = squadHp;
  healSquad(amount);
  const healed = squadHp - before;              // 真实回血（被血池上限截断后的值）
  if (healed <= 0) return;                      // 已经满血：不再弹「吸血 +N」，免得与实际不符
  if (gameTime - lastLeechText > 0.5) {
    lastLeechText = gameTime;
    spawnFloatText(squad.x, squad.y - 38, '吸血 +' + Math.max(1, Math.round(healed)), LEECH_COLOR);
  }
}

function initDecorations() {
  decorations = [];
  terrainCache = null;
  const types = ['grass', 'grass', 'grass', 'rock', 'rock', 'flower'];
  // 数量随世界面积同步（V1.10 地图扩大后保持原有植被密度）
  const count = Math.round(90 * AREA_SCALE);
  for (let i = 0; i < count; i++) {
    decorations.push({ x: rngWorld() * WORLD.w, y: rngWorld() * WORLD.h, type: types[Math.floor(rngWorld() * types.length)] });
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
    const type = kinds[Math.floor(rngWorld() * kinds.length)];
    const def = OBSTACLE_DEFS[type];
    const x = 60 + rngWorld() * (WORLD.w - 120);
    const y = 60 + rngWorld() * (WORLD.h - 120);
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
    runCoins += def.coin * (gearCoinMul || 1);
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
// V1.37 双人：**每名玩家的小兵**都要把敌人推开（否则敌人会叠在客机身上）。
// 单人局与改动前完全等价（players 只有 P1，循环退化成 for e { for s }）。
function separateEnemiesFromSquad() {
  for (const p of players) {
    const arr = soldiersOf(p);
    if (!arr.length) continue;
    const br = withCtx(p, () => bodyR());
    for (const e of enemies) {
      if (e.dead || e.devStatic) continue;                              // 调试：站桩敌人也不被玩家推开
      for (const s of arr) {
        const dx = e.x - s.x, dy = e.y - s.y;
        const minD = e.r + br;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD) continue;
        const d = Math.sqrt(d2);
        if (d < 0.001) { e.x = s.x + minD; e.y = s.y; continue; }   // 完全重合：沿 +x 推开
        e.x = s.x + (dx / d) * minD;
        e.y = s.y + (dy / d) * minD;
      }
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
    vines.push({ x: p.x, y: p.y, state: 'grow', t: c.growTime, life: c.minLife + rngWorld() * (c.maxLife - c.minLife), cool: 0 });
    spawnParticles(p.x, p.y, '#5fae3a', 8);
    added++;
  }
}

// 生成点：60% 落在玩家视野附近（距离 minD~maxD 的环带），其余在世界内随机
function floraSpot(minD, maxD) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (rngWorld() < 0.6) {
    const a = rngWorld() * Math.PI * 2;
    const d = minD + rngWorld() * (maxD - minD);
    return {
      x: clamp(squad.x + Math.cos(a) * d, 60, WORLD.w - 60),
      y: clamp(squad.y + Math.sin(a) * d, 60, WORLD.h - 60),
    };
  }
  return { x: 60 + rngWorld() * (WORLD.w - 120), y: 60 + rngWorld() * (WORLD.h - 120) };
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
    // 本局随机种子 + 三条流已取用的次数（V1.32）：读出这份存档就能复现同一张地图与同一套战斗判定
    seed: runSeed,
    rngCounts: { world: rngCount.world, combat: rngCount.combat, fx: rngCount.fx },
    mode: runMode,                 // V1.32：本局模式（标准 / 无尽），读档后继续同一模式
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
    // 存档只保存「当前生效玩家」那套上下文（见 snapshotRun），读档一律回到单人槽位 ——
    // 否则上一局联机残留的双人槽位（players[1] 还是旧对象）会被带进来
    players = [P1];
    activePlayer = P1;
    P1.pendingPick = null;
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
    stats.vulnGear = stats.vulnGear || 0;      // V1.30：装备「破甲」独立乘区
    stats.sunder = stats.sunder || 0;          // V1.30：「裂甲」
    stats.thorns = stats.thorns || 0;          // V1.30：「荆棘」
    stats.shieldDamageTaken = stats.shieldDamageTaken || 1;   // V1.31：「有护盾时受伤倍率」
    stats.lifesteal = stats.lifesteal || 0;
    stats.regen = stats.regen || 0;
    stats.bloodOrb = stats.bloodOrb || 0;
    stats.burnDamage = stats.burnDamage || 0;
    stats.statusDuration = stats.statusDuration || 1;
    // V1.33：四线专精（旧快照缺字段，给回默认值；倍率类默认 1，其余默认 0）
    stats.fireFlat = stats.fireFlat || 0;
    stats.fireBurnTime = stats.fireBurnTime || 0;
    stats.lightningMastery = stats.lightningMastery || 0;
    stats.lightningSplashR = stats.lightningSplashR || 0;
    stats.lightningSplashPct = stats.lightningSplashPct || 0;
    stats.swordFlat = stats.swordFlat || 0;
    stats.swordHitCdMul = stats.swordHitCdMul || 1;
    stats.scytheFlat = stats.scytheFlat || 0;
    stats.scytheHitCdMul = stats.scytheHitCdMul || 1;
    // V1.35：守护线 / 巨人线 / 协同技（旧快照缺字段时补默认值）
    stats.guardianShieldAdd = stats.guardianShieldAdd || 0;
    stats.guardianMove = stats.guardianMove || 0;
    stats.shieldThornsPct = stats.shieldThornsPct || 0;
    stats.shieldBurstPct = stats.shieldBurstPct || 0;
    stats.shieldRegenCut = stats.shieldRegenCut || 0;
    stats.bodyMul = stats.bodyMul || 1;
    stats.frostfire = !!stats.frostfire;
    stats.overload = !!stats.overload;
    stats.swordLightning = !!stats.swordLightning;
    stats.swordFire = !!stats.swordFire;
    stats.atomicGuard = !!stats.atomicGuard;
    refreshGearGlobals();                      // 倍率不进快照：按当前装备重算
    rngRestore({ seed: s.seed, counts: s.rngCounts });   // 随机流推回存档时的位置（旧档没有 seed 则保持当前流）
    runMode = s.mode === 'endless' ? 'endless' : 'standard';   // V1.32：接着原来的模式打
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
    petFx = [];
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
    captureCtx(activePlayer);   // V1.37：读档直接改写了那些全局，同步一次槽位镜像
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
  setState('playing', { clean: true });
  updateCamera();
  last = performance.now();
  fpsAccum = 0;
  pauseGame();
}

// 一名玩家开局时的 build 数值（V1.37：抽成函数，双人时 P2 也要一份独立的）。
// **新增机制字段时这里和 makePlayer 的注释要一起看** —— 每名玩家各持一份，不能共享。
function defaultStats() {
  return {
    moveSpeed: 1, maxHp: 1,
    bulletDamage: 1, elementalDamage: 1, summonDamage: 1, petDamage: 1,
    pickupRange: 1, invulnDuration: 0, damageTaken: 1, shieldDamageTaken: 1, dodge: 0, bulletKnockback: 0,
    burnDamage: 0,
    statusDuration: 1,
    vuln: 0, lifesteal: 0, regen: 0, bloodOrb: 0,
    // 四线专精（V1.33）：默认无加成
    fireFlat: 0, fireBurnTime: 0,
    lightningMastery: 0, lightningSplashR: 0, lightningSplashPct: 0,
    swordFlat: 0, swordHitCdMul: 1,
    scytheFlat: 0, scytheHitCdMul: 1,
    // 守护线 / 巨人线 / 协同技（V1.35）
    guardianShieldAdd: 0, guardianMove: 0, shieldThornsPct: 0, shieldBurstPct: 0, shieldRegenCut: 0,
    bodyMul: 1,
    frostfire: false, overload: false, swordLightning: false, swordFire: false, atomicGuard: false,
  };
}

// ==================== 双人对战 · 玩家槽位与 build 上下文（V1.37） ====================
// 单人局只有 players[0]（本机）。联机时房主额外持有 players[1] = 客机的整套状态。
//
// **三条硬性约定，改之前先读**：
//
// 1) `squad` / `soldiers` / `squadHp` / `squadMaxHp` / `squadRootedT` / `stats` / `weapons` /
//    `summons` / `pet` / `skills` / `pickCount` / `routePicks` / `appliedIds` / `dmgBonus` /
//    `dmgBase` / `lightningCdT` / `lightningPending` / `hurtBy` / `lastHurt` / `petRunExp`
//    这些全局，**始终代表「当前生效的那个玩家」**，不再等于「本机玩家」。
//    单人局里两者恰好相同，所以老代码照常工作。
//    （后 5 个是 V1.37 补进来的 —— 它们原本是全局单份，双人下会互相干扰：
//      客机打出的雷会卡住房主的雷、两人的受伤混进同一份阵亡原因。）
//
// 2) 每帧按槽位循环：进入某槽位前把它的字段换进全局，跑完恢复（`switchTo`）。
//    这样现有 40+ 个「只认全局」的战斗函数一行都不用改 —— 这是这套设计存在的唯一理由。
//    **单人局 `switchTo(P1)` 是空操作**（`p === activePlayer` 直接返回），因此零开销、零行为变化。
//
// 3) **跨帧 / 跨玩家的延迟效果必须带 owner**（飞行中的子弹、延迟落雷、宠物持续技），
//    命中时用 `withCtx(owner, fn)` 切回主人的上下文再结算。否则 B 打出的子弹会吃 A 的
//    易伤、给 A 回血，命中触发的火球也会用错人的召唤物 —— 静默算错，极难查。
//
// 渲染层不受影响：`render()` 只读全局，本机玩家渲染前把槽位切回自己即可。

let players = [];          // [本机, 客机?]；单人局长度 1。槽位顺序即渲染顺序
let activePlayer = null;   // 当前全局状态属于谁

// 一名玩家「与别人无关」的全部状态。id：0 = 本机 / 1 = 客机。
function makePlayer(id) {
  return {
    id,
    name: '',
    squad: { x: 0, y: 0, shield: 0, shieldMax: 0, shieldRegenTimer: 0, invulnT: 0, invulnCdT: 0, aimAng: -Math.PI / 2 },
    soldiers: [],
    hp: 0, hpMax: 0,
    rootedT: 0,
    weapons: [], summons: [], pet: null, skills: {},
    stats: defaultStats(),
    dmgBonus: 0, dmgBase: 0,
    pickCount: {}, routePicks: {}, appliedIds: new Set(),
    // 对局内的「按玩家分」的零散状态（V1.37）：雷电那条线的硬性触发间隔、受伤来源统计、宠物熟练度。
    // 这些原本是全局单份，双人下会互相干扰（客机打出的雷会卡住房主的雷、两人的受伤混进同一份阵亡原因）。
    lightningCdT: 0, lightningPending: false,
    hurtBy: {}, lastHurt: '',
    petRunExp: 0,
    // V1.37：本次升级待选的卡（各自选卡用）。**不要塞进网络快照** —— 卡对象里带 apply 闭包，
    // 序列化不了；客机那边只需要房主抽好的 id + 文案（见 netGuestPick）。
    pendingPick: null,
  };
}

const P1 = makePlayer(0);

// 把当前全局状态存回某个玩家的槽位（引用式，对象身份保持不变 —— `soldier.owner === P1` 因此成立）
function captureCtx(p) {
  if (!p) return;
  p.squad = squad; p.soldiers = soldiers; p.hp = squadHp; p.hpMax = squadMaxHp; p.rootedT = squadRootedT;
  p.weapons = weapons; p.summons = summons; p.pet = pet; p.skills = skills; p.stats = stats;
  p.dmgBonus = dmgBonus; p.dmgBase = dmgBase;
  p.pickCount = pickCount; p.routePicks = routePicks; p.appliedIds = appliedIds;
  p.lightningCdT = lightningCdT; p.lightningPending = lightningPending;
  p.hurtBy = hurtBy; p.lastHurt = lastHurt; p.petRunExp = petRunExp;
}

function loadCtx(p) {
  squad = p.squad; soldiers = p.soldiers; squadHp = p.hp; squadMaxHp = p.hpMax; squadRootedT = p.rootedT;
  weapons = p.weapons; summons = p.summons; pet = p.pet; skills = p.skills; stats = p.stats;
  dmgBonus = p.dmgBonus; dmgBase = p.dmgBase;
  pickCount = p.pickCount; routePicks = p.routePicks; appliedIds = p.appliedIds;
  lightningCdT = p.lightningCdT; lightningPending = p.lightningPending;
  hurtBy = p.hurtBy; lastHurt = p.lastHurt; petRunExp = p.petRunExp;
}

// 切换「全局代表谁」。已是目标玩家时是空操作（单人局恒为这条路径）。
function switchTo(p) {
  if (!p || p === activePlayer) return false;
  if (activePlayer) captureCtx(activePlayer);
  loadCtx(p);
  activePlayer = p;
  return true;
}

// 在某个玩家的上下文里执行 fn（跨玩家边界的唯一入口：命中结算、按 owner 扣血等）
function withCtx(p, fn) {
  if (!p || p === activePlayer) return fn();
  const prev = activePlayer;
  switchTo(p);
  try { return fn(); } finally { switchTo(prev); }
}

// 小兵 / 子弹 / 特效上的 owner 是**玩家 id**；这里解析回玩家对象。
// 解析不到（单人局的旧快照、或该玩家已离场）一律退回 P1，绝不返回 undefined。
function playerOf(s) { return (s && players[s.owner]) || P1; }
function idOfActive() { return activePlayer ? activePlayer.id : 0; }

// 取某个玩家的字段。**当前生效玩家的存储就是那些全局变量本身** —— 直接改全局的地方
// （reset / restoreRun）不会回头同步对象字段，所以对 activePlayer 一律走全局，避免读到陈旧值。
function soldiersOf(p) { return p === activePlayer ? soldiers : p.soldiers; }
function squadOf(p) { return p === activePlayer ? squad : p.squad; }
function hpOf(p) { return p === activePlayer ? squadHp : p.hp; }

// 跨全部玩家找最近的小兵（敌人索敌、范围伤害都从这里进）
function nearestSoldier(x, y) {
  let best = null, bd = Infinity;
  for (const p of players) {
    for (const s of soldiersOf(p)) {
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
  }
  return best;
}

// 半径内是否有**任意玩家**的小兵（V1.37 双人）：返回第一个命中的，用于扣血与特效定位。
// 判半径要用**那名玩家自己的**体型（`bodyR()` 读当前上下文的 stats.bodyMul），所以逐个切上下文取。
// 单人局走快路径，与改动前完全等价。
function anySoldierIn(x, y, r) {
  if (players.length <= 1) return soldiers.find(s => Math.hypot(s.x - x, s.y - y) < r + bodyR()) || null;
  for (const p of players) {
    const arr = soldiersOf(p);
    if (!arr.length) continue;
    const br = withCtx(p, () => bodyR());
    for (const s of arr) if (Math.hypot(s.x - x, s.y - y) < r + br) return s;
  }
  return null;
}

// 跨全部玩家遍历小兵（站位分离、敌弹命中这类「对每个兵都过一遍」的地方用）
function forEachSoldierAll(fn) {
  for (const p of players) {
    for (const s of soldiersOf(p)) if (fn(s, p) === false) return;
  }
}

// 造一名「队友」玩家（槽位 1）。两个入口共用：
//   · 联机开局时由房主调用（netHostBegin）—— 客机的整套状态就挂在这里；
//   · 回归台 / 调试里直接调用，用于在不联机的情况下验证「两名玩家各自独立」。
function coopSpawnLocalAlly() {
  if (players.length > 1) return players[1];
  const p2 = makePlayer(1);
  p2.squad = {
    x: Math.min(WORLD.w - 40, squad.x + 120), y: squad.y + 70,
    shield: 0, shieldMax: 0, shieldRegenTimer: 0, invulnT: 0, invulnCdT: 0, aimAng: -Math.PI / 2,
  };
  p2.skills = { slow: { owned: false, cd: 0, cdMax: SKILL_DEFS.slow.cd, duration: SKILL_DEFS.slow.duration } };
  players.push(p2);
  // 在 P2 自己的上下文里造小兵与武器 —— owner / build 才会落在它身上
  const prev = activePlayer;
  switchTo(p2);
  try {
    for (let i = 0; i < CFG.soldierCount; i++) addSoldier();
    addWeapon(meta.equipped.weapon);
  } finally {
    switchTo(prev);
  }
  return p2;
}

function reset(seed) {
  seedRun(seed);      // 新对局：重掷本局种子（随机流从零开始，种子随存档写进 meta.run.seed）；传 seed 可复现同一局
  runMode = modeSelectable(meta.mode) ? meta.mode : 'standard';   // V1.32：本局模式（未解锁的无尽模式一律退回标准）
  squad = { x: WORLD.w / 2, y: WORLD.h / 2, tx: WORLD.w / 2, ty: WORLD.h / 2, moving: false, shield: 0, shieldMax: 0, shieldRegenTimer: 0, invulnT: 0, invulnCdT: 0, aimAng: -Math.PI / 2 };
  soldiers = [];
  squadHp = 0;
  squadMaxHp = 0;
  weapons = [];
  summons = [];
  pet = null;
  enemies = [];
  bullets = [];
  enemyBullets = [];
  bombs = [];
  drops = [];
  particles = [];
  lightningBolts = [];
  iceSpikes = [];
  petFx = [];
  blasts = [];
  swordSlashes = [];
  pendingLightning = [];
  lightningCdT = 0;
  lightningPending = false;
  hitStop = 0;
  obstacles = [];
  vines = [];
  squadRootedT = 0;
  stats = defaultStats();
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
  // 首局引导（V1.35）：没引导过就这次走一遍；结算页的「本局学到的机制」也在这里清空
  guideStep = 0;
  guideMoved = 0;
  guideOn = !meta.guide.done;
  runLearned = [];
  hurtBy = {};             // 死亡原因统计也按局清零
  lastHurt = '';
  eliteIntroDone = false;  // 第一次精英怪的登场提示每局重播一次
  resumeT = 0;             // 新对局不带走上一局的续玩倒计时
  bossDrop = null;
  bossDropDone = false;    // 首王出场演出每局播一次（V1.31）
  bombs = [];
  aimMode = 'nearest';     // 目标优先级每局回到默认（V1.31）
  devResetTransient();     // 调试：新对局把「无敌 / 秒杀 / 冻结波次 / 速度」恢复默认，避免带进正常游玩

  // 双人对战（V1.37）：重建玩家槽位。单人局就是 [P1]；联机时由握手流程再补上 P2。
  // 先把 activePlayer 指到 P1，下面的 addSoldier() / addWeapon() 才知道新兵属于谁。
  players = [P1];
  activePlayer = P1;
  P1.pendingPick = null;    // 新对局不留上一局的待选（P1 是复用对象，会跨局带过来）

  // 应用局外装备（V1.31：武器 / 护甲 / 饰品 ×2 的**主属性** + **随机词条**）
  // gearBuff() 已经把「主属性」与「词条」叠进同一份累加器（见 MAIN_STAT_KEYS），这里只是把它写进 stats。
  // 词条里的数值类（弹道 / 元素 / 召唤 / 兽伴 + 破甲）走**独立乘区**，不与局内卡的加算区相加，
  // 所以「子弹伤害 +8%」就是实打实的 +8%；饰品主属性 damageDealt 也是**四类伤害通吃**的独立乘区。
  const gb = gearBuff();
  const gm = gb.dmgMul;
  dmgBonus = { bullet: 0, ele: 0, summon: 0, pet: 0 };
  dmgBase = {
    bullet: gb.damageDealt * (1 + gm.bullet),
    ele:    gb.damageDealt * (1 + gm.ele),
    summon: gb.damageDealt * (1 + gm.summon),
    pet:    gb.damageDealt * (1 + gm.pet),
  };
  pickCount = {};
  recalcDamage();
  stats.damageTaken = gb.damageTaken;
  stats.shieldDamageTaken = gb.shieldDamageTaken;   // 「有护盾时受伤 ×0.6」这类主属性
  stats.bloodOrb = gb.bloodOrb;                     // 血珠
  stats.regen = gb.regen;                           // 回血宝珠 + 「再生」词条
  stats.maxHp = gb.maxHp;                           // 生命药剂 / 布衣 / 龙鳞甲 + 「健壮」词条
  stats.moveSpeed = gb.moveSpeed;
  stats.pickupRange = gb.pickupRange;
  stats.invulnDuration = gb.invulnDuration;         // 急救包 + 「坚韧」词条
  stats.lifesteal = gb.lifesteal;                   // 嗜血符 + 「吸血」词条
  stats.vuln = 0;
  stats.vulnGear = gb.vulnGear;        // 「破甲」词条：独立乘区
  stats.sunder = gb.sunder;            // 「裂甲」词条：对带护盾的敌人加伤
  stats.thorns = gb.thorns;            // 「荆棘」词条 / 荆棘图腾：受伤时反伤
  gearXpMul = gb.xpMul;
  gearCoinMul = gb.coinMul;
  gearRerollBonus = gb.reroll;
  squad.shieldMax += gb.shieldMax;                              // 守护徽记 / 铁甲 + 「壁垒」词条
  squad.shield = squad.shieldMax;

  dividers = [];
  const dn = 2 + Math.floor(rngWorld() * 2);
  for (let i = 0; i < dn; i++) dividers.push(rngWorld() * WORLD.h);

  for (let i = 0; i < CFG.soldierCount; i++) addSoldier();

  // 携带武器 + 武器专属词条（V1.31：伤害 / 射速 / 弹速 / 射程 / 穿透 / 弹丸，都只作用在这把武器上）
  addWeapon(meta.equipped.weapon);
  const wb = weaponBuff();
  const w0 = weapons[0];
  if (w0) {
    w0.dmgMul *= 1 + wb.dmg;
    w0.rateMul *= 1 + wb.rate;
    w0.speedMul *= 1 + wb.speed;
    w0.rangeMul = (w0.rangeMul || 1) * (1 + wb.range);
    w0.pierce = (w0.pierce || 0) + wb.pierce;
    w0.extraCount = (w0.extraCount || 0) + wb.count;
  }
  if (gb.pierce) weapons.forEach(w => { w.pierce = (w.pierce || 0) + gb.pierce; });   // 「破势」词条：子弹穿透 +1

  // 宠物（唯一）：把局外养成（等级 / 升星 / 天赋树 / 词条）折算成局内基础值
  if (meta.equipped.pet && meta.equipped.pet !== 'none') {
    const pb = petBonus(meta.equipped.pet);
    const skills = {};
    Object.entries(pb.skills).forEach(([id, s]) => { skills[id] = { lv: s.lv, cdMul: s.cdMul, power: s.power, cd: 1.5 }; });
    pet = {
      type: meta.equipped.pet, dmgMul: pb.dmgMul, dmgAdd: 0, rateMul: pb.rateMul, shootCd: 0,
      baseMul: pb.dmgMul, baseRate: pb.rateMul, extraShots: pb.extraShots, rangeMul: pb.rangeMul,
      hitHeal: pb.hitHeal, killShield: pb.killShield, burnMul: pb.burnMul, burnTimeMul: pb.burnTimeMul,
      igniteSpread: pb.igniteSpread, skills, skillMods: {}, energy: 0,
      skillPick: null, skillName: '',        // V1.29：技能本体由局内三选一决定（见 buildUpgradePool）
      stunMul: pb.stunMul, slowTimeMul: pb.slowTimeMul, freezeTimeMul: pb.freezeTimeMul,
      star: petDev(meta.equipped.pet).star, lv: petDev(meta.equipped.pet).lv, flashT: 0,
    };
  } else {
    pet = null;
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
  rerollLeft = 3 + (gearRerollBonus || 0);   // 基础 3 次 + 装备「灵巧」词条
  updateCamera();

  // 开局这一通全局写入之后，把 P1 的槽位同步一次（P1 的存储就是这些全局变量的镜像）
  captureCtx(P1);
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
    if (k === 'tab') { cycleAimMode(); return true; }     // 切换自动攻击目标优先级（V1.31）
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
// 边界视角（V1.35）：镜头允许**在四边越界**一小段（0.3 × 可视范围，且不超过 300 世界像素）。
//   旧版把镜头严格夹在世界内，贴到边缘时角色会被顶到屏幕最角落、被边角 UI（摇杆 / 技能键 / HUD）挡住视野；
//   越界后角色始终留在屏幕中央区（约 30% ~ 70%），代价是边缘外露出一条深色「世界之外」的边框。
const CAM_OVERSCAN = 0.3;
const CAM_OVERSCAN_MAX = 300;
function updateCamera() {
  const ox = Math.min(viewW() * CAM_OVERSCAN, CAM_OVERSCAN_MAX);
  const oy = Math.min(viewH() * CAM_OVERSCAN, CAM_OVERSCAN_MAX);
  camera.x = Math.max(-ox, Math.min(WORLD.w - viewW() + ox, squad.x - viewW() / 2));
  camera.y = Math.max(-oy, Math.min(WORLD.h - viewH() + oy, squad.y - viewH() / 2));
}

// 本机的移动意图（单位向量）。键盘与虚拟摇杆合在一处 —— `updateSquad` 与联机的输入上行共用它，
// 保证「客机自己按的手感」与「房主看到客机怎么走」完全同源。
function joyVec() {
  let mx = 0, my = 0;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (keys['w'] || keys['arrowup']) my -= 1;
  if (keys['s'] || keys['arrowdown']) my += 1;
  // 虚拟摇杆（保留 WASD）
  if (joystick.active && (joystick.dx || joystick.dy)) {
    const jl = Math.hypot(joystick.dx, joystick.dy);
    if (jl > 8) { mx += joystick.dx / jl; my += joystick.dy / jl; }
  }
  const l = Math.hypot(mx, my);
  if (l > 1) { mx /= l; my /= l; }
  return { x: mx, y: my };
}

function updateSquad(dt) {
  if (squadRootedT > 0) squadRootedT = Math.max(0, squadRootedT - dt);

  // 输入（V1.37）：槽位 0 是本机，读键盘 / 摇杆；其余槽位（联机时 = 客机）读 remoteInput，
  // 那份意图由联机通道下行（见 netOn 的 'in'）。
  let mx = 0, my = 0;
  if (!activePlayer || activePlayer.id === 0) {
    const v = joyVec();
    mx = v.x; my = v.y;
  } else {
    mx = remoteInput.x; my = remoteInput.y;
  }

  if (squadRootedT > 0) { mx = 0; my = 0; }   // 被藤蔓缠住时无法移动

  if (mx || my) {
    const l = Math.hypot(mx, my);
    const dx = mx / l, dy = my / l;
    const step = moveSpeed() * dt;
    squad.x += dx * step;
    squad.y += dy * step;
    // 首局引导第 1 步：累计走出一小段就算「会移动了」
    if (guideOn && guideStep === 0) {
      guideMoved += step;
      if (guideMoved > 90) { learnTag('移动：WASD / 方向键 / 拖动屏幕'); guideAdvance('move'); }
    }
  }

  // 枪口朝向（V1.35）：只在**武器射程内**取靶 —— 与 updateWeapons 真正开火的目标同一口径，
  // 避免「枪死盯着打不到的优先目标、子弹却打身边的敌人」的错位感。
  // 射程内没有目标时：移动则朝移动方向，静止则保持上一帧朝向。
  const wAim = weapons[0];
  const wAimDef = wAim && WEAPON_DEFS[wAim.type];
  const aimT = wAimDef ? pickTarget(squad.x, squad.y, wAimDef.range * (wAim.rangeMul || 1)) : null;
  if (aimT) squad.aimAng = Math.atan2(aimT.y - squad.y, aimT.x - squad.x);
  else if (mx || my) squad.aimAng = Math.atan2(my, mx);

  resolveObstacleCollision(squad, S.soldierR);   // 木桶 / 箱子 / 石柱 / 树木阻挡
  clampToBossArena(squad, 0);                    // 首领战中禁止走出竞技场
  squad.x = Math.max(S.soldierR, Math.min(WORLD.w - S.soldierR, squad.x));
  squad.y = Math.max(S.soldierR, Math.min(WORLD.h - S.soldierR, squad.y));
  // V1.37：镜头不在这里更新了 —— 双人时这个函数会对两名玩家各跑一遍，而镜头只能跟**本机**，
  // 所以改成由 update() 在玩家循环之后统一算一次（见 updateCamera 的调用处）。
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

// ==================== 自动攻击的目标优先级（V1.31） ====================
// 默认仍是「最近」，但可切换到「最强 / 首领优先 / 精英优先」。
// 起因：解除波次限制后小怪数量爆炸且移速快，「最近」会把火力全吸在小怪上，
//       弹幕者那类躲在后排的 Boss 永远吃不到输出。
const AIM_MODES = [
  { id: 'nearest', name: '最近' },
  { id: 'strong',  name: '最强' },
  { id: 'boss',    name: '首领优先' },
  { id: 'elite',   name: '精英优先' },
];
// 「优先」档的权重表：先按权重挑大档，同档再比距离（权重差乘 1e9，远到足够压过距离项）
const AIM_WEIGHT = {
  boss:  { boss: 8, elite: 3, treant: 2 },
  elite: { elite: 8, boss: 3, treant: 2 },
};
let aimMode = 'nearest';

function aimModeName() {
  const m = AIM_MODES.find(x => x.id === aimMode);
  return m ? m.name : AIM_MODES[0].name;
}
function cycleAimMode() {
  const i = AIM_MODES.findIndex(x => x.id === aimMode);
  aimMode = AIM_MODES[(i + 1) % AIM_MODES.length].id;
  syncAimButton();
}
function syncAimButton() {
  const btn = document.getElementById('btn-aim');
  if (btn) btn.textContent = aimModeName();
}

// 取自动攻击目标：近战/远程的普攻都用这一处，保证「切了档位立刻生效」
function pickTarget(x, y, maxDist) {
  if (aimMode === 'nearest') return nearestEnemy(x, y, maxDist);
  const md = maxDist * maxDist;
  let best = null, bestScore = -Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d2 > md) continue;
    const score = aimMode === 'strong'
      ? e.maxHp
      : ((AIM_WEIGHT[aimMode] || {})[e.type] || 0) * 1e9 - d2;
    if (score > bestScore) { bestScore = score; best = e; }
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
  if (!isLive()) return;
  const s = skills[name];
  if (!s || !s.owned || s.cd > 0) return;

  enemySlowT = s.duration;
  s.cd = s.cdMax;
  spawnParticles(squad.x, squad.y, '#9de0ff', 18);
  shake = Math.min(10, shake + 2);
  sfxSlow();
  learnTag('主动技能：时缓（Q / 技能键）');
  guideAdvance('skill');       // 首局引导第 5 步
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
      // 自动攻击取目标统一走 pickTarget()：这样「最近 / 最强 / 首领优先 / 精英优先」对武器也生效
      const target = pickTarget(squad.x, squad.y, def.range * (w.rangeMul || 1));
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
  const volley = spread ? baseAng + (rngCombat() - 0.5) * spread : baseAng;   // 整轮共用一次散布
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
    let ang = volley + t * spread + (rngCombat() - 0.5) * gap * 0.8;   // 锥内固定角 + 少量抖动
    const b = { x: bx, y: by, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg, r: def.tracer ? 4 : 3, aoe: 0, burnDps: 0, burnTime: 0, color: def.color, pierce, split, splitCount, hit: null, tracer: !!def.tracer, volley: volleyTag, wtype: w.type };
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
  // V1.33「镰刀专精」：固定伤害加在基础值上（割裂 / 噬魂都基于这同一份 dmg）
  const dmg = def.dmg * s.dmgMul * powerBaseDamage(s) + (stats.scytheFlat || 0);
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
      if (!e.scytheT || gameTime - e.scytheT > def.hitCd * (stats.scytheHitCdMul || 1)) {
        // 质变链：先 roll 割裂（同一刀挂上的出血也能吃到下面的噬魂加成），再按是否有割裂结算噬魂加伤 / 吸血
        const bleedLv = cardLv('scythe-bleed');
        if (bleedLv > 0 && rngCombat() < SCYTHE_BLEED_CHANCE[bleedLv - 1]) {
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
  const target = pickTarget(squad.x, squad.y, Infinity);
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
  if (rngCombat() >= lightningChance(s)) return;
  lightningCdT = LIGHTNING_MIN_INTERVAL;
  // V1.37：带 owner —— 延迟落雷是在世界相位里结算的，那时全局已经不是这位玩家了
  pendingLightning.push({ t: LIGHTNING_DELAY, owner: idOfActive() });
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
    const it = pendingLightning[i];
    it.t -= dt;
    if (it.t <= 0) {
      pendingLightning.splice(i, 1);
      withCtx(players[it.owner], () => triggerLightning());   // V1.37：切回落雷主人的上下文再结算
    }
  }
}

function triggerLightning() {
  const s = getSummon('lightning');
  if (!s) return;
  if (enemies.every(e => e.dead)) return;
  const def = ELEMENT_DEFS.lightning;
  const lv = Math.min(4, s.chainLv || 0);
  // V1.33「闪电专精」：闪电伤害加成乘在最后，与 s.dmgMul / 链倍率都是独立的一层
  const dmg = def.dmg * s.dmgMul * powerBaseDamage(s) * (1 + LIGHTNING_EXTRA_DMG[lv]) * (1 + (stats.lightningMastery || 0));
  const strikes = 1 + lv;
  const hit = new Set();
  const alive = () => enemies.filter(e => !e.dead && !hit.has(e));   // 尚未被劈到的敌人（优先）
  const any = () => enemies.filter(e => !e.dead);

  for (let i = 0; i < strikes; i++) {
    // 目标不够时重复劈已命中的敌人，保证「额外闪电」在单体战里也有收益
    let pool = alive();
    if (!pool.length) pool = any();
    if (!pool.length) break;
    const cur = pool[Math.floor(rngCombat() * pool.length)];
    strikeEnemy(cur, dmg, hit);
  }
}

function strikeEnemy(e, dmg, hit) {
  if (stats.vuln > 0) dmg *= 1 + stats.vuln;      // 易伤同样作用于雷电
  e.hp -= dmg;
  spawnDamageNumber(e.x, e.y, dmg, '#9de0ff');
  sfxThunder();
  spawnLightningBolt(e.x, e.y, stats.lightningSplashR || 0);
  if (stats.lifesteal > 0) leechHeal(dmg * stats.lifesteal);
  if (e.hp <= 0) killEnemy(e);
  hit.add(e);
  lightningSplash(e, dmg);
  // 协同「过载」（V1.35）：闪电击中燃烧中的敌人时引发爆炸
  if (stats.overload && e.burnT > 0 && !e.dead) overloadBlast(e);
}

// 协同「过载」：以被击中的燃烧敌人为中心炸开一圈固定伤害
function overloadBlast(src) {
  spawnBlast(src.x, src.y, OVERLOAD_RADIUS);
  spawnParticles(src.x, src.y, '#c6a2ff', 14);
  sfxExplode();
  for (const o of enemies) {
    if (o.dead || o === src) continue;
    if (Math.hypot(o.x - src.x, o.y - src.y) > OVERLOAD_RADIUS + o.r) continue;
    hitEnemy(o, OVERLOAD_DMG, 0, 0);
  }
}

// V1.33「闪电专精」：落雷的范围伤害。没点专精时半径 0 → 直接返回（行为与 V1.32 完全一致）。
// 溅射走 hitEnemy（吃易伤 / 剑印 / 护盾 / 吸血那一整套），而不是像直击那样裸减血。
function lightningSplash(src, dmg) {
  const r = stats.lightningSplashR || 0;
  if (!(r > 0)) return;
  const pct = stats.lightningSplashPct || 0;
  if (!(pct > 0)) return;
  const s = dmg * pct;
  for (const o of enemies) {
    if (o === src || o.dead) continue;
    if (Math.hypot(o.x - src.x, o.y - src.y) > r + o.r) continue;
    hitEnemy(o, s, 0, 0);
  }
}

// 落雷：预生成锯齿路径 + 分叉，配合命中闪光与地面冲击环（短促的一劈）
// radius > 0 时额外画一圈范围圈（V1.33 闪电专精），让「这一劈打到了多大一片」一眼可见
function spawnLightningBolt(x, y, radius = 0) {
  const top = y - 118;
  const n = 5;
  const segs = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const jitter = (i === 0 || i === n) ? 0 : (rngFx() - 0.5) * 18;
    segs.push({ x: x + jitter, y: top + (y - top) * t });
  }
  const fi = 1 + Math.floor(rngFx() * 3);
  const forks = [{
    x1: segs[fi].x, y1: segs[fi].y,
    x2: segs[fi].x + (rngFx() - 0.5) * 46,
    y2: segs[fi].y + 14 + rngFx() * 20,
  }];
  const life = 0.26;
  lightningBolts.push({ x, y, segs, forks, life, maxLife: life, seed: rngFx() * 100, radius });
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
  if (b.frost.chance > 0 && rngCombat() < b.frost.chance) tryApplyFreeze(e, b.frost.freezeTime);
  iceSpikes.push({ x: b.x, y: b.y, r: Math.max(11, e.r * 1.05), life: 0.42, maxLife: 0.42, seed: rngFx() * 10 });
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
  // 协同「冰霜火」（V1.35 修订）：**施加霜冻（减速）时也同时点燃**。它的前置是「霜冻附魔」，而那张卡
  //   给的是减速、不是冰冻 —— 只挂在 tryApplyFreeze 上的话，凑齐前置也看不到任何效果（除非另外拿到
  //   冻伤 / 凛冬 / 带冰冻的宠物），这才是「前置看起来有问题」的真正原因。
  if (stats.frostfire) applyBurn(e, BURN_DPS * 0.5, BURN_TIME);
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

// 协同「金雷竹剑」：以闪电召唤物的当前伤害为基准取一定比例（吃闪电专精 / 元素乘区）
function lightningBoltDamage(pct) {
  const s = getSummon('lightning');
  if (!s) return 0;
  return ELEMENT_DEFS.lightning.dmg * s.dmgMul * powerBaseDamage(s) * (1 + (stats.lightningMastery || 0)) * pct;
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

  // V1.33「飞剑专精」：固定伤害加在基础值上（后续的剑气 / 剑印都基于这同一份 dmg）
  const dmg = def.dmg * s.dmgMul * powerBaseDamage(s) + (stats.swordFlat || 0);
  const speed = def.speed * (s.speedMul || 1);
  const range = def.range * (s.rangeMul || 1);
  const hitCd = def.hitCd / ((s.rateMul || 1) * (stats.swordHitCdMul || 1));   // 专精的「命中冷却 -%」也在这里
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
      // 协同「金雷竹剑」/「火焰刀」（V1.35）：飞剑命中时按概率追加雷击 / 点燃（二选一，见 exclusive）
      if (e.hp > 0 && stats.swordLightning && rngCombat() < SYNERGY_SWORD_CHANCE) {
        strikeEnemy(e, lightningBoltDamage(SYNERGY_LIGHTNING_PCT), new Set());
      }
      if (e.hp > 0 && stats.swordFire && rngCombat() < SYNERGY_SWORD_CHANCE) {
        applyBurn(e, BURN_DPS, BURN_TIME);
      }
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
    if (gameTime - lastHitStopT > 0.25) { lastHitStopT = gameTime; triggerHitStop(def.hitStop); }
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
    const target = pickTarget(squad.x, squad.y, def.range * (pet.rangeMul || 1));
    if (target) {
      const p = petPos();
      firePetBullet(p.x, p.y, target);
      pet.flashT = 0.14;               // 开火闪光
      pet.shootCd = def.shootInterval / pet.rateMul;
    }
  }
  updatePetSkills(dt);                 // 技能：由局外天赋树解锁，局内按 CD 自动放
}

function firePetBullet(x, y, target) {
  const def = PET_DEFS[pet.type];
  // 宠物喷吐为元素伤害：吃宠物乘区 + 元素乘区（元素乘区不再单独保底，与元素线同规则 ——
  // 元素加成能放大它，元素减益同样作用于它）+ **元素线独占增伤**（V1.32 需求 8：雷电虫的普攻
  // 也吃「雷电伤害 +30%」，与它的技能统一口径；弹跳段继承同一个 dmg，自然一起放大）
  const dmg = def.dmg * pet.dmgMul * stats.petDamage * stats.elementalDamage * petEleLineMul();
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
      petShot: true, elem: def.elem, igniteSpread: !!pet.igniteSpread,
    });
  }
}

// 宠物命中回馈：累积熟练度与技能能量、天赋回血/回盾、点燃扩散、元素特性（雷电弹跳 / 冰霜减速）
// charge = 是否给技能攒能量：**只有普攻命中才攒**（V1.35 修订）。技能自己打到的敌人不再回充，
//   否则喷火这类「持续多段 + 多目标」的技能会把自己瞬间充满，触发频率高到失去节奏。
function petOnHit(b, e, dmg, charge = true) {
  petRunExp += dmg * PET_DEV_CFG.expPerDmg;
  // V1.28 充能制：每命中一个敌人给技能攒能量（弹跳 / 多目标会攒得更快）；V1.29 起要先在局内选中技能
  if (charge && pet.skillPick) {
    pet.energy = Math.min(PET_DEV_CFG.chargeMax, (pet.energy || 0) + PET_DEV_CFG.chargePerHit);
  }
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
  if (b.elem) petBasicElement(b, e, dmg);
}

// ==================== 宠物技能（V1.27，局内） ====================
// 技能由局外天赋树解锁（PET_TREES），局内按 CD 自动释放；升级靠局内卡（见 buildUpgradePool）。
// 伤害与普攻同乘区（宠物 × 元素 × 技能倍率），量级压在「辅助输出」这一档，不抢武器的主输出。
// 特效与持续判定都存在 petFx 里：cone / vortex / lava / field / nova / bolt / meteor / storm / awe / arc

function petPowerOf(sk, st) {
  const mod = (pet.skillMods && pet.skillMods[sk.id]) || {};
  return st.power * (1 + 0.25 * (mod.power || 0));
}
function petCdOf(sk, st) {
  const mod = (pet.skillMods && pet.skillMods[sk.id]) || {};
  return sk.cd * st.cdMul * Math.pow(0.8, mod.cd || 0);
}
// 宠物 ≫ 元素线的协同（V1.32 · 需求 8）：宠物自带元素（`PET_DEFS[].elem`），所以它理应也吃得到
// 「该元素线自己的增伤」。元素伤害乘区（`stats.elementalDamage`）本来就在乘，这里补的是元素线**独占**的那部分：
//   · 闪电线独占「雷电伤害 +30%」（`summonMul` → `s.dmgMul`，同类相加且**无上限**）。
// 直接乘满会让「投电系 = 白赚一条武器线」（雷电虫满技能实测 8.22 → ×1.9 = 15.6，已等于一条武器线），
// 与「宠物 = 辅助」的定位冲突 —— 所以按 ELE_SHARE 折半、再用 ELE_SHARE_CAP 封顶。
// 冰冻线没有对应的独占增伤（宠物技能的减速本来就强过「霜冻附魔」），只有**时长**在 `chill` 里单独取 max。
const ELE_SHARE = 0.5;         // 宠物从元素线增伤里吃到的比例
const ELE_SHARE_CAP = 0.5;     // 上限：宠物从元素线最多拿到 +50%
// 当前出战宠物的元素（'fire' / 'lightning' / 'ice'，没带宠物则空串）。
// 元素的归属永远从 PET_DEFS 读，不要在技能对象上重复标一份。
function petElem() { return (pet && PET_DEFS[pet.type] && PET_DEFS[pet.type].elem) || ''; }
function petEleLineMul() {
  if (petElem() !== 'lightning') return 1;
  const s = getSummon('lightning');
  if (!s) return 1;
  return 1 + Math.min(ELE_SHARE_CAP, ELE_SHARE * ((s.dmgMul || 1) - 1));
}
function petSkillDmg(base, power) {
  return base * pet.dmgMul * stats.petDamage * stats.elementalDamage * power * petEleLineMul();
}
function petBurnDps(base) { return base * (pet.burnMul || 1) * pet.dmgMul; }
function petBurnTime(base) { return base * (pet.burnTimeMul || 1); }

// 技能命中：走 hitEnemy（吃易伤 / 护盾 / 各种乘区），再结算熟练度与天赋回馈
function petSkillHit(e, dmg, burnDps, burnTime) {
  if (e.dead) return;
  hitEnemy(e, dmg, burnDps, burnTime);
  // 技能伤害不回充技能能量（V1.35 修订，见 petOnHit）
  petOnHit({ burnDps: burnDps || 0, burnTime: burnTime || 0, igniteSpread: pet.igniteSpread }, e, dmg, false);
}

// 标记易伤（龙威 / 绝对零度）：与剑印、嗜血共用同一个加算区，取更强的那个
function applyPetVuln(e, vuln, time) {
  if (!(vuln > 0) || !(time > 0)) return;
  if ((e.aweT || 0) > 0 && (e.aweVuln || 0) >= vuln) { e.aweT = Math.max(e.aweT, time); return; }
  e.aweVuln = vuln;
  e.aweT = time;
}
function petVulnOf(e) { return e.aweT > 0 ? (e.aweVuln || 0) : 0; }

function nearestEnemyExcept(x, y, maxDist, exclude) {
  let best = null, bd = maxDist * maxDist;
  for (const e of enemies) {
    if (e.dead || (exclude && exclude.has(e))) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// 落雷视觉：一小段折线闪电
function petBoltFx(x, y, color) {
  petFx.push({ kind: 'bolt', x, y, life: 0.2, maxLife: 0.2, color, owner: idOfActive() });
  spawnParticles(x, y, color, 10);
  shake = Math.min(10, shake + 2);
}

// 普攻的元素特性（由 bullet.elem 触发）：雷电弹跳 / 冰霜减速
function petBasicElement(b, e, dmg) {
  if (!pet || e.dead) return;
  const def = PET_DEFS[pet.type];
  if (b.elem === 'lightning') {
    let from = e, mul = 1;
    const hit = new Set([e]);
    for (let i = 0; i < (def.chainMax || 0); i++) {
      mul *= def.chainFalloff || 0.6;
      const next = nearestEnemyExcept(from.x, from.y, 150, hit);
      if (!next) break;
      hit.add(next);
      petFx.push({ kind: 'arc', x1: from.x, y1: from.y, x2: next.x, y2: next.y, life: 0.15, maxLife: 0.15 });
      petSkillHit(next, dmg * mul, 0, 0);
      from = next;
    }
    if (def.stunChance > 0 && !e.dead && rngCombat() < def.stunChance) {
      tryApplyFreeze(e, (def.stunTime || 0.4) * (pet.stunMul || 1));   // 麻痹 = 极短冰冻
    }
  } else if (b.elem === 'ice') {
    tryApplyFrost(e, def.slowMul, (def.slowTime || 1.5) * (pet.slowTimeMul || 1));
    if (def.freezeChance > 0 && rngCombat() < def.freezeChance) {
      tryApplyFreeze(e, (def.freezeTime || 0.8) * (pet.freezeTimeMul || 1));
    }
  }
}

// 每帧推进技能冷却；能量攒满且该技能不在 CD 时释放。
// V1.28 充能制：技能的节奏跟着「宠物打了多少下」走，而不是到点自动放。
// V1.29 三选一：本局释放哪个技能由**局内选中的技能卡**决定（`pet.skillPick`），没选就不放。
function updatePetSkills(dt) {
  if (!pet || !pet.skillPick) return;
  const st = pet.skills && pet.skills[pet.skillPick];
  if (!st) return;
  if (st.cd > 0) st.cd = Math.max(0, st.cd - dt);
  if ((pet.energy || 0) < PET_DEV_CFG.chargeMax || st.cd > 0) return;
  const sk = (PET_SKILLS[pet.type] || []).find(s => s.id === pet.skillPick);
  if (!sk) return;
  if (!castPetSkill(sk, st)) return;
  st.cd = petCdOf(sk, st);
  pet.energy = 0;                                        // 放完清零，重新攒
}

function castPetSkill(sk, st) {
  const p = petPos();
  const power = petPowerOf(sk, st);
  const reach = (sk.range || 320) * (pet.rangeMul || 1);
  const self = { x: squad.x, y: squad.y };
  // 宠物技能的落点也跟随目标优先级（和普攻一致），否则切了档位只有普攻听话
  const target = pickTarget(squad.x, squad.y, reach);

  if (sk.id === 'breath') {                                  // 龙蛋：喷火（V1.34 改为持续型扇形）
    if (!target) return false;
    const a = Math.atan2(target.y - p.y, target.x - p.x);
    // V1.35 修订：**喷火是宠物喷的**，所以扇形跟着宠物走（onPet），不再跟玩家（follow 会把原点拉回玩家中心）。
    petFx.push({
      kind: 'cone', x: p.x, y: p.y, a, r: reach, arc: sk.arc,
      life: sk.dur, maxLife: sk.dur, tick: 0, tickEvery: sk.tick || 0.3,
      dmg: petSkillDmg(sk.dmg, power), burnDps: petBurnDps(sk.burnDps), burnTime: petBurnTime(1.6),
      onPet: true, aim: true, color: '#ff9d3b',
    });
    spawnParticles(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, '#ffb347', 16);
    sfxFireball();
    return true;
  }

  if (sk.id === 'cyclone') {                                 // 龙蛋：火龙卷（聚怪 + 持续点燃）
    if (!target) return false;
    petSkillHit(target, petSkillDmg(sk.dmg, power), petBurnDps(sk.burnDps), petBurnTime(2));
    petFx.push({
      kind: 'vortex', x: target.x, y: target.y, r: sk.r, life: sk.dur, maxLife: sk.dur,
      tick: 0, tickEvery: 0.4, dmg: petSkillDmg(sk.dmg * 0.18, power),
      burnDps: petBurnDps(sk.burnDps * 0.5), burnTime: petBurnTime(1.2), pull: sk.pull, color: '#ff8a5c',
    });
    spawnBlast(target.x, target.y, sk.r * 0.7);
    sfxExplode();
    return true;
  }

  if (sk.id === 'awe') {                                     // 龙蛋大招：龙威（标记易伤）
    petFx.push({ kind: 'awe', x: self.x, y: self.y, r: sk.r, life: sk.dur, maxLife: sk.dur, tick: 0, tickEvery: sk.tick, vuln: sk.vuln, pulse: 1, follow: true, color: '#ffd54f' });
    spawnBlast(self.x, self.y, sk.r * 0.55);
    spawnParticles(self.x, self.y, '#ffd54f', 26);
    spawnFloatText(self.x, self.y - 44, '龙威', '#ffd54f');
    sfxExplode();
    return true;
  }

  if (sk.id === 'fireball') {                                // 火焰精灵：火球（落点爆炸）
    if (!target) return false;
    const dmg = petSkillDmg(sk.dmg, power);
    const a = Math.atan2(target.y - p.y, target.x - p.x);
    bullets.push({
      x: p.x, y: p.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, r: 7, sx: p.x, sy: p.y,
      dmg, aoe: sk.aoe, burnDps: petBurnDps(sk.burnDps), burnTime: petBurnTime(2),
      color: '#ff9d3b', pierce: 0, split: 0, hit: null, fireball: true, petShot: true, skillShot: true,
    });
    sfxFireball();
    return true;
  }

  if (sk.id === 'lava') {                                    // 火焰精灵：熔岩（6 秒持续）
    if (!target) return false;
    petFx.push({
      kind: 'lava', x: target.x, y: target.y, r: sk.r, life: sk.dur, maxLife: sk.dur,
      tick: 0, tickEvery: sk.tick, dmg: petSkillDmg(sk.dmg, power),
      burnDps: petBurnDps(sk.burnDps), burnTime: petBurnTime(1.5), color: '#ff7a2f',
    });
    spawnParticles(target.x, target.y, '#ff9d3b', 14);
    sfxFireball();
    return true;
  }

  if (sk.id === 'meteor') {                                  // 火焰精灵大招：豪火球（延迟砸落）
    if (!target) return false;
    petFx.push({
      kind: 'meteor', x: target.x, y: target.y, r: sk.r, life: 0.55, maxLife: 0.55,
      dmg: petSkillDmg(sk.dmg, power), burnDps: petBurnDps(sk.burnDps), burnTime: petBurnTime(2.5), color: '#ff7a2f',
    });
    return true;
  }

  if (sk.id === 'chain') {                                   // 雷电虫：连锁闪电（弹跳 + 概率麻痹）
    if (!target) return false;
    const dmg = petSkillDmg(sk.dmg, power);
    let from = target, mul = 1;
    const seen = new Set();
    for (let i = 0; i < (sk.jumps || 3) && from; i++) {
      seen.add(from);
      petSkillHit(from, dmg * mul, 0, 0);
      if (!from.dead && rngCombat() < (sk.stunChance || 0)) {
        tryApplyFreeze(from, (sk.stunTime || 0.5) * (pet.stunMul || 1));
      }
      const nxt = nearestEnemyExcept(from.x, from.y, 200, seen);
      if (nxt) petFx.push({ kind: 'arc', x1: from.x, y1: from.y, x2: nxt.x, y2: nxt.y, life: 0.18, maxLife: 0.18 });
      from = nxt;
      mul *= (sk.jumpFalloff || 0.7);
    }
    petBoltFx(target.x, target.y, '#9de0ff');
    sfxThunder();
    return true;
  }

  if (sk.id === 'field') {                                   // 雷电虫：雷电场（跟随小队的电圈）
    petFx.push({
      kind: 'field', x: self.x, y: self.y, r: sk.r, life: sk.dur, maxLife: sk.dur,
      tick: 0, tickEvery: sk.tick, dmg: petSkillDmg(sk.dmg, power),
      slowMul: sk.slowMul, slowTime: sk.slowTime,
      stunChance: sk.stunChance, stunTime: sk.stunTime,
      follow: true, color: '#9de0ff',
    });
    sfxThunder();
    return true;
  }

  if (sk.id === 'storm') {                                   // 雷电虫大招：雷暴（多道落雷）
    if (!nearestEnemy(squad.x, squad.y, 620)) return false;
    petFx.push({
      kind: 'storm', x: self.x, y: self.y, span: sk.span, r: sk.r, life: 1.5, maxLife: 1.5,
      next: 0, every: 0.13, left: sk.strikes, dmg: petSkillDmg(sk.dmg, power),
      stunChance: sk.stunChance, stunTime: sk.stunTime, color: '#9de0ff',
    });
    sfxThunder();
    return true;
  }

  if (sk.id === 'nova') {                                    // 冰冻精灵：冰霜新星（周圈冻结）
    const dmg = petSkillDmg(sk.dmg, power);
    let any = false;
    for (const e of enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - self.x, e.y - self.y) > sk.r + e.r) continue;
      any = true;
      petSkillHit(e, dmg, 0, 0);
      if (!e.dead) tryApplyFreeze(e, sk.freezeTime * (pet.freezeTimeMul || 1));
    }
    if (!any) return false;
    petFx.push({ kind: 'nova', x: self.x, y: self.y, r: sk.r, life: 0.45, maxLife: 0.45, color: '#8fe3ff' });
    spawnParticles(self.x, self.y, '#dff6ff', 20);
    sfxIce();
    return true;
  }

  if (sk.id === 'chill') {                                   // 冰冻精灵：冰霜领域（敌人脚下的寒冰地带）
    if (!target) return false;
    // 需求 8：冰霜领域也吃「霜冻附魔」。减速**强度**取大不叠乘（领域本来就更强 0.45 vs 附魔 0.6，
    // 实际是 no-op），真正受益的是**时长** —— 附魔 2s 比领域的 1.0s 长，所以取 max。
    // 刻意**不套**附魔的概率门（10~50%）：领域的减速本来必中，套上概率门反而是负体验。
    const frostEnch = cardLv('enchant-frost') > 0;
    petFx.push({
      kind: 'field', x: target.x, y: target.y, r: sk.r, life: sk.dur, maxLife: sk.dur,
      tick: 0, tickEvery: sk.tick, dmg: petSkillDmg(sk.dmg, power),
      slowMul: frostEnch ? Math.min(sk.slowMul, FROST_MUL) : sk.slowMul,
      slowTime: frostEnch ? Math.max(sk.slowTime, FROST_TIME) : sk.slowTime,
      freezeChance: sk.freezeChance, freezeTime: sk.freezeTime,
      color: '#8fe3ff',
    });
    spawnParticles(target.x, target.y, '#dff6ff', 14);
    sfxIce();
    return true;
  }

  if (sk.id === 'zero') {                                    // 冰冻精灵大招：绝对零度
    const dmg = petSkillDmg(sk.dmg, power);
    let any = false;
    for (const e of enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - self.x, e.y - self.y) > sk.r + e.r) continue;
      any = true;
      petSkillHit(e, dmg, 0, 0);
      if (e.dead) continue;
      tryApplyFreeze(e, sk.freezeTime * (pet.freezeTimeMul || 1));
      applyPetVuln(e, sk.vuln, sk.dur);
    }
    if (!any) return false;
    petFx.push({ kind: 'nova', x: self.x, y: self.y, r: sk.r, life: 0.7, maxLife: 0.7, color: '#bfe8ff' });
    spawnParticles(self.x, self.y, '#dff6ff', 30);
    spawnFloatText(self.x, self.y - 44, '绝对零度', '#8fe3ff');
    sfxIce();
    return true;
  }

  return false;
}

// 持续型技能的周期结算（火龙卷 / 熔岩 / 雷电场 / 冰霜领域）
function petFxTick(f) {
  for (const e of enemies) {
    if (e.dead) continue;
    if (Math.hypot(e.x - f.x, e.y - f.y) > f.r + e.r) continue;
    if (f.arc) {                                            // 扇形（喷火）：只结算锥形范围内的敌人
      let df = Math.atan2(e.y - f.y, e.x - f.x) - f.a;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      if (Math.abs(df) > f.arc / 2) continue;
    }
    if (f.dmg) petSkillHit(e, f.dmg, f.burnDps, f.burnTime);
    if (f.slowMul && !e.dead) tryApplyFrost(e, f.slowMul, (f.slowTime || 0.8) * (pet.slowTimeMul || 1));
    if (f.stunChance && !e.dead && rngCombat() < f.stunChance) {
      tryApplyFreeze(e, (f.stunTime || 0.4) * (pet.stunMul || 1));       // 雷电场：概率麻痹
    }
    if (f.freezeChance && !e.dead && rngCombat() < f.freezeChance) {
      tryApplyFreeze(e, (f.freezeTime || 1) * (pet.freezeTimeMul || 1));  // 冰霜领域：概率冻结
    }
  }
}

function updatePetFx(dt) {
  if (!petFx.length) return;
  for (let i = petFx.length - 1; i >= 0; i--) {
    const f = petFx[i];
    // V1.37：特效条目带着主人 id（见 updatePlayerCompanions 的打戳）。这里要读 pet / squad / stats
    // 来结算持续伤害与减速，必须切回主人的上下文 —— 单人局 f.owner 恒为本机，直接执行。
    withCtx(players[f.owner], () => petFxStep(f, i, dt));
  }
}

// 单个宠物特效条目的一帧（原 updatePetFx 的循环体）
function petFxStep(f, i, dt) {
    f.life -= dt;
    if (f.onPet) { const pp = petPos(); f.x = pp.x; f.y = pp.y; }   // 宠物技能（喷火）：原点跟着宠物
    else if (f.follow) { f.x = squad.x; f.y = squad.y; }
    if (f.aim) {                                             // 喷火：扇形每帧跟随宠物朝向当前目标
      const t = pickTarget(f.x, f.y, f.r);
      if (t) f.a = Math.atan2(t.y - f.y, t.x - f.x);
    }
    if (f.kind === 'awe') {                                  // 龙威：持续标记范围内的敌人（易伤 1.5 倍）
      for (const e of enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - f.x, e.y - f.y) < f.r + e.r) applyPetVuln(e, f.vuln, 0.35);
      }
    }
    if (f.kind === 'vortex' && f.pull > 0) {                 // 火龙卷：把敌人吸向中心（首领 / 站桩不吃）
      for (const e of enemies) {
        if (e.dead || e.type === 'boss' || e.devStatic) continue;
        const dx = f.x - e.x, dy = f.y - e.y, d = Math.hypot(dx, dy);
        if (d > f.r || d < 1) continue;
        const step = Math.min(f.pull * dt, d);
        e.x += (dx / d) * step;
        e.y += (dy / d) * step;
      }
    }
    if (f.kind === 'storm') {                                // 雷暴：按间隔连续落雷
      f.next -= dt;
      while (f.next <= 0 && f.left > 0) {
        f.next += f.every;
        f.left--;
        const pick = enemies.filter(e => !e.dead && Math.hypot(e.x - f.x, e.y - f.y) < f.span)[Math.floor(rngCombat() * 4)] || null;
        const tx = pick ? pick.x : f.x + (rngCombat() - 0.5) * f.span;
        const ty = pick ? pick.y : f.y + (rngCombat() - 0.5) * f.span;
        petBoltFx(tx, ty, f.color);
        for (const e of enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - tx, e.y - ty) > f.r + e.r) continue;
          petSkillHit(e, f.dmg, 0, 0);
          if (!e.dead && rngCombat() < (f.stunChance || 0.4)) {
            tryApplyFreeze(e, (f.stunTime || 0.45) * (pet.stunMul || 1));
          }
        }
      }
    }
    if (f.tickEvery) {
      f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = f.tickEvery;
        petFxTick(f);
        if (f.kind === 'awe') f.pulse = 1;
      }
    }
    if (f.life <= 0) {
      if (f.kind === 'meteor') {                             // 豪火球砸地：大范围一次性爆炸
        explodeAt(f.x, f.y, f.r, f.dmg, f.burnDps, f.burnTime);
        shake = Math.min(10, shake + 5);
        sfxExplode();
      }
      petFx.splice(i, 1);
    }
}

// 技能特效绘制（在敌人之下、地面上，所以画在 drawPet 之后、drawEnemies 之前）
// 宠物技能特效分两层绘制（V1.31 修复：此前 drawPetFx() 从未被 render() 调用，
//   导致熔岩 / 领域 / 新星 / 喷火 / 陨石等**所有**宠物技能特效都不可见）：
//   · ground 层（熔岩池 / 领域 / 漩涡 / 龙威 / 新星 / 雷暴范围）画在敌人与角色**下方**，像铺在地上；
//   · air 层（喷火 / 闪电 / 落雷 / 陨石 / 冰爆）画在所有单位**上方**，保证可读性。
const PET_FX_GROUND = new Set(['lava', 'field', 'vortex', 'awe', 'nova', 'storm']);
function drawPetFx(layer) {
  const air = layer !== 'ground';
  for (const f of petFx) {
    if (air && f.pulse > 0) f.pulse = Math.max(0, f.pulse - 0.05);   // 每帧只衰减一次（放在 air 通道）
    if (air === PET_FX_GROUND.has(f.kind)) continue;
    const k = Math.max(0, f.life / f.maxLife);
    const fa = f.maxLife ? Math.min(1, f.life / f.maxLife) : 1;
    ctx.save();
    if (f.kind === 'cone') {
      // V1.35 修订：改成**真的在喷火** —— 三层火焰（外橙 / 中橙黄 / 内白热）叠加发光 + 沿轴线的火舌
      //   + 嘴部高光。原点取宠物「嘴」的位置（宠物外推 13px），所以看起来是宠物在喷，不是玩家在喷。
      //   抖动全部用 gameTime 的确定性正弦（渲染层不取任何随机流）。
      const fade = k > 0.25 ? 1 : k / 0.25;
      const wob = Math.sin(gameTime * 24 + f.x * 0.7);
      const mx = f.x + Math.cos(f.a) * 13, my = f.y + Math.sin(f.a) * 13;
      ctx.globalAlpha = fade;
      ctx.globalCompositeOperation = 'lighter';
      const layers = [
        { wk: 1.00, len: 1.00, c0: 'rgba(255,96,26,0.42)', c1: 'rgba(255,74,14,0.26)', c2: 'rgba(255,60,10,0)' },
        { wk: 0.66, len: 0.95, c0: 'rgba(255,170,58,0.62)', c1: 'rgba(255,132,28,0.34)', c2: 'rgba(255,110,20,0)' },
        { wk: 0.34, len: 0.88, c0: 'rgba(255,250,222,0.92)', c1: 'rgba(255,214,110,0.42)', c2: 'rgba(255,180,60,0)' },
      ];
      for (let i = 0; i < layers.length; i++) {
        const L = layers[i];
        const rr = f.r * L.len * (1 + 0.035 * Math.sin(gameTime * 20 + i * 2.3));
        const g = ctx.createRadialGradient(mx, my, 3, mx, my, rr);
        g.addColorStop(0, L.c0);
        g.addColorStop(0.5, L.c1);
        g.addColorStop(1, L.c2);
        ctx.fillStyle = g;
        const hw = (f.arc / 2) * L.wk + 0.05 * (1 + wob * 0.12);
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.arc(mx, my, rr, f.a - hw, f.a + hw);
        ctx.closePath();
        ctx.fill();
      }
      for (let i = 1; i <= 4; i++) {                     // 火舌：沿轴线的跳动亮斑，看起来是流动的
        const t = i / 5;
        const jit = Math.sin(gameTime * 15 + i * 2.7) * 0.16;
        const bx = mx + Math.cos(f.a + jit) * f.r * t;
        const by = my + Math.sin(f.a + jit) * f.r * t;
        const br = 6 + 13 * t + Math.sin(gameTime * 26 + i * 1.9) * 2;
        const g2 = ctx.createRadialGradient(bx, by, 1, bx, by, br);
        g2.addColorStop(0, 'rgba(255,238,190,0.7)');
        g2.addColorStop(0.5, 'rgba(255,150,48,0.4)');
        g2.addColorStop(1, 'rgba(255,110,30,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      }
      const gc = ctx.createRadialGradient(mx, my, 0, mx, my, 9);   // 嘴部高光：明确「火从宠物嘴里出来」
      gc.addColorStop(0, 'rgba(255,255,244,0.95)');
      gc.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = gc;
      ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (f.kind === 'vortex') {
      ctx.globalAlpha = 0.75 * fa;
      ctx.translate(f.x, f.y);
      ctx.rotate(gameTime * 5);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i % 2 ? 'rgba(255,178,66,0.85)' : 'rgba(255,110,40,0.8)';
        ctx.lineWidth = 4 - i;
        ctx.beginPath();
        for (let s = 0; s <= 18; s++) {
          const t = s / 18;
          const rr = f.r * (0.25 + 0.75 * t);
          const a = t * 4.2 + i * 2.1;
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 0.35 * fa;
      ctx.fillStyle = 'rgba(255,140,40,0.5)';
      ctx.beginPath(); ctx.arc(0, 0, f.r * 0.9, 0, Math.PI * 2); ctx.fill();
    } else if (f.kind === 'lava') {
      // 熔岩池：焦黑地壳 + 熔融岩浆 + 流动裂纹 + 冒泡（快结束时收干）
      const swell = 0.86 + 0.14 * Math.min(1, (1 - k) * 6);
      const rr = f.r * swell;
      ctx.globalAlpha = Math.min(1, fa * 1.7);
      ctx.fillStyle = 'rgba(46,20,10,0.6)';
      ctx.beginPath(); ctx.arc(f.x, f.y, rr * 1.07, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, rr);
      g.addColorStop(0, 'rgba(255,246,206,0.98)');
      g.addColorStop(0.35, 'rgba(255,168,52,0.94)');
      g.addColorStop(0.7, 'rgba(226,86,20,0.82)');
      g.addColorStop(1, 'rgba(110,30,8,0.4)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,234,156,0.5)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {                 // 流动裂纹
        const a0 = i * 2.1 + Math.sin(gameTime * 0.7 + i) * 0.3;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a0) * rr * 0.22, f.y + Math.sin(a0) * rr * 0.22);
        for (let s = 1; s <= 4; s++) {
          const a = a0 + Math.sin(gameTime * 1.3 + i + s) * 0.3;
          const d = rr * (0.22 + 0.62 * s / 4);
          ctx.lineTo(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d);
        }
        ctx.stroke();
      }
      for (let i = 0; i < 7; i++) {                 // 冒泡
        const ph = (gameTime * 0.55 + i * 0.37) % 1;
        const a = i * 1.9 + gameTime * 0.4;
        const d = rr * (0.12 + 0.72 * ((i * 0.37 + 0.13) % 1));
        ctx.globalAlpha = Math.min(1, fa * (1 - ph) * 2.2);
        ctx.fillStyle = 'rgba(255,240,178,0.95)';
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, (1 - ph) * rr * 0.13 + 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (f.kind === 'field') {
      const fc = f.color || '#9de0ff';               // 雷电场蓝 / 冰霜领域青
      ctx.globalAlpha = 0.5 * fa;
      ctx.strokeStyle = fc;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.28 * fa;
      ctx.fillStyle = fc;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(230,250,255,0.85)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        const a = gameTime * 2.2 + i * 1.57;
        const rr = f.r * (0.45 + 0.5 * Math.abs(Math.sin(gameTime * 3 + i)));
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a) * f.r * 0.25, f.y + Math.sin(a) * f.r * 0.25);
        ctx.lineTo(f.x + Math.cos(a + 0.3) * rr * 0.7, f.y + Math.sin(a + 0.3) * rr * 0.7);
        ctx.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
        ctx.stroke();
      }
    } else if (f.kind === 'storm') {
      // 雷暴区域：落雷本身走 bolt 特效，这里只画一片电云覆盖圈
      ctx.globalAlpha = 0.14 * fa;
      ctx.fillStyle = '#9de0ff';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.span, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.42 * fa;
      ctx.strokeStyle = 'rgba(157,224,255,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.span, gameTime * 1.5, gameTime * 1.5 + Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    } else if (f.kind === 'nova') {
      const grow = 1 - k;
      ctx.globalAlpha = 0.85 * fa;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 4 * k + 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.25 + 0.75 * grow), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.28 * fa;
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * grow, 0, Math.PI * 2); ctx.fill();
    } else if (f.kind === 'bolt') {
      ctx.globalAlpha = fa;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const segs = 6, top = f.y - 240;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const jitter = i === 0 || i === segs ? 0 : (rngFx() - 0.5) * 22;
        const px = f.x + jitter, py = top + (f.y - top) * t;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.5 * fa;
      ctx.lineWidth = 8;
      ctx.stroke();
    } else if (f.kind === 'arc') {
      ctx.globalAlpha = fa;
      ctx.strokeStyle = '#9de0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(f.x1, f.y1);
      const mx = (f.x1 + f.x2) / 2 + (rngFx() - 0.5) * 24;
      const my = (f.y1 + f.y2) / 2 + (rngFx() - 0.5) * 24;
      ctx.lineTo(mx, my);
      ctx.lineTo(f.x2, f.y2);
      ctx.stroke();
    } else if (f.kind === 'meteor') {
      const t = 1 - k;
      const fy = f.y - 300 * k;
      ctx.globalAlpha = 0.9;
      const g = ctx.createRadialGradient(f.x, fy, 2, f.x, fy, 34);
      g.addColorStop(0, 'rgba(255,255,230,1)');
      g.addColorStop(0.4, 'rgba(255,160,50,0.9)');
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, fy, 34, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'rgba(255,140,40,0.5)';
      ctx.beginPath(); ctx.ellipse(f.x, fy + 40, 14, 34, 0, 0, Math.PI * 2); ctx.fill();
      if (t > 0.2) {                                        // 地面落点预警圈
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = 'rgba(255,140,60,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (f.kind === 'awe') {
      const pulse = f.pulse || 0;
      ctx.globalAlpha = (0.28 + 0.4 * pulse) * fa;
      ctx.strokeStyle = 'rgba(255,213,79,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.75 + 0.25 * pulse), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.12 * fa;
      ctx.fillStyle = 'rgba(255,213,79,0.6)';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

function updateBullets(dt) {
  for (const b of bullets) {
    // V1.37：命中结算要算在**子弹主人**的账上（易伤 / 吸血 / 命中触发的火球都读全局 build），
    // 所以按 owner 切上下文。同一主人的子弹（单人局即全部）直接走原路径，不额外开销。
    const ow = players[b.owner];
    if (ow && ow !== activePlayer) withCtx(ow, () => stepBullet(b, dt));
    else stepBullet(b, dt);
  }
  bullets = bullets.filter(b => !b.dead);
}

// 单颗子弹的一帧（原 updateBullets 的循环体，`continue` 改成 `return`）
function stepBullet(b, dt) {
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

  if (hitObstacle(b)) return;                // 被木桶 / 箱子 / 石柱挡下

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

function applyBulletKnockback(e, b) {
  if (e.type === 'boss') return;                     // Boss 免疫击退
  if (stats.bulletKnockback <= 0 || e.kbT > 0) return;
  if (rngCombat() >= stats.bulletKnockback) return;
  const vl = Math.hypot(b.vx, b.vy) || 1;
  e.kbx += (b.vx / vl) * 150;
  e.kby += (b.vy / vl) * 150;
  e.kbT = 0.5;
}

function tryShotgunSplit(e, b) {
  if (!b.split || rngCombat() >= b.split) return;
  const def = WEAPON_DEFS.shotgun;
  const t = nearestEnemy(e.x, e.y, 220);
  if (!t) return;
  const n = b.splitCount || 2;
  for (let i = 0; i < n; i++) {
    const ang = Math.atan2(t.y - e.y, t.x - e.x) + (rngCombat() - 0.5) * 0.5;
    bullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * def.speed, vy: Math.sin(ang) * def.speed, dmg: b.dmg, r: 3, aoe: 0, burnDps: 0, burnTime: 0, color: def.color, pierce: 0, split: 0, hit: null });
  }
}

// 火球爆炸：记录特效（膨胀火团 + 冲击环）并抛出火星
function spawnBlast(x, y, r) {
  blasts.push({ x, y, r, life: 0.36, maxLife: 0.36, seed: rngFx() * 6.283 });
  for (let i = 0; i < 10; i++) {
    const a = rngFx() * Math.PI * 2;
    const sp = 60 + rngFx() * 190;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75 - 30,
      r: 2.5 + rngFx() * 4, life: 0.45 + rngFx() * 0.25,
      color: rngFx() < 0.5 ? '#ffd166' : '#ff7a2f',
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
      // 宠物子弹有两类：普攻（攒能量）与技能（火球，skillShot —— 不攒，口径同 petSkillHit）
      if (b.petShot && pet && !e.dead) petOnHit({ burnDps: b.burnDps || 0, burnTime: b.burnTime || 0, elem: b.elem, igniteSpread: pet.igniteSpread }, e, b.dmg, !b.skillShot);
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
let thornsDepth = 0;                                  // 装备「荆棘」反伤的递归深度（反伤再引发受伤时不再触发）
const THORNS_RADIUS = 90;                             // 「荆棘」反伤半径

// ===== 四线「专精」（V1.33）：火焰 / 雷电 / 飞剑 / 镰刀各一条**三段纯数值成长** =====
// 与「质变链」的分工：质变链是**概率触发的机制**（割裂 / 剑印 / 冻伤），专精是**确定的数值成长**。
// 前面所有伤害都是「基础值 × 倍率」，专精补的是**固定值直接加在基础伤害上**（加完再吃该线原有乘区，
// 所以中期不会失效）；三段给的是**累计值**，卡面显示的也是「这次选完之后的累计值」。
const FIRE_MASTERY_DMG = [3, 6, 12];                 // 火焰专精：固定火焰伤害（加到点燃的每秒基础值上）
const FIRE_MASTERY_TIME = [0.3, 0.8, 1.5];           // 火焰专精：点燃时长 +N 秒
const LIGHTNING_MASTERY_DMG = [0.10, 0.20, 0.35];    // 闪电专精：闪电伤害 +10% / +20% / +35%
const LIGHTNING_SPLASH_R = [90, 130, 180];           // 闪电专精：落雷范围伤害的半径（第 1 段就开出范围）
const LIGHTNING_SPLASH_PCT = [0.30, 0.45, 0.60];     // 闪电专精：范围伤害 = 本次雷击伤害 × 该比例
const SWORD_MASTERY_DMG = [2, 5, 9];                 // 飞剑专精：固定伤害
const SWORD_MASTERY_CD = [0.08, 0.15, 0.25];         // 飞剑专精：命中冷却 -8% / -15% / -25%
const SCYTHE_MASTERY_DMG = [2, 5, 9];                // 镰刀专精：固定伤害
const SCYTHE_MASTERY_CD = [0.08, 0.15, 0.25];        // 镰刀专精：命中冷却 -8% / -15% / -25%

// ===== 守护线（V1.35）：护盾 → 守护 → 盾反 → 坚定守护，四级严格前置 =====
const GUARDIAN_SHIELD = [5, 15, 30];                 // 守护：护盾上限 +N（累计值）
const GUARDIAN_MOVE = [0.05, 0.10, 0.15];            // 守护：拥有护盾时移速 +N%（累计值）
const SHIELD_THORNS = [0.10, 0.25, 0.40];            // 盾反：护盾激活时受击反弹伤害的比例
const SHIELD_BURST = [0.40, 0.50, 0.70];             // 盾反：护盾被击穿时炸开的伤害比例
const SHIELD_BURST_R = 70;                           // 盾反：炸开半径
const SHIELD_BURST_KNOCK = 240;                      // 盾反：炸开击退初速（与镰刀击退同级）
const STEADY_CUT = [0.2, 0.5, 1.0];                  // 坚定守护：护盾恢复冷却 -N 秒
const ATOMIC_BURST_R = 150;                          // 原子守护：护盾破裂时的大范围半径

// 护盾恢复延迟（受「坚定守护」削减，最低 0.5s）
function shieldRegenDelay() { return Math.max(0.5, CFG.shieldRegenDelay - (stats.shieldRegenCut || 0)); }
// 受伤碰撞体积倍率（巨人线：体型影响被命中的判定半径）
function bodyMul() { return stats.bodyMul || 1; }
function bodyR() { return S.soldierR * bodyMul(); }

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
  // V1.33「火焰专精」：固定伤害加在**基础值**上（加完再吃点燃的百分比乘区，中期不失效），
  // 时长同理加在基础时长上（再吃「元素亲和」的 statusDur）。注意点燃是**施加瞬间的快照**，
  // 所以后天拿到的专精只对之后新挂上的点燃生效。
  e.burnDps = (burnDps + (stats.fireFlat || 0)) * (1 + (stats.burnDamage || 0)) * stats.elementalDamage * f;
  e.burnT = ((burnTime || BURN_TIME) + (stats.fireBurnTime || 0)) * f * statusDur();
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
  if (rngCombat() < SWORD_MARK_CHANCE[lv - 1]) e.markT = SWORD_MARK_TIME;
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
  // 协同「冰霜火」（V1.35）：施加冰冻时同时点燃（点燃伤害为原本的一半）；霜冻（减速）那条路见 tryApplyFrost
  if (stats.frostfire) applyBurn(e, BURN_DPS * 0.5, BURN_TIME);
  return true;
}

// 冻伤：减速成功后按概率冰冻，并立即扣除当前生命的百分比
function rollFrostbite(e) {
  const lv = cardLv('frostbite');
  if (lv <= 0) return;
  if (rngCombat() >= FROSTBITE_CHANCE[lv - 1]) return;
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
  if (fa > 0 && rngCombat() < ENCH_FIRE_CHANCE[fa - 1]) applyBurn(e, BURN_DPS, BURN_TIME);
  const fb = cardLv('enchant-frost');
  if (fb > 0 && rngCombat() < ENCH_FROST_CHANCE[fb - 1]) tryApplyFrost(e, FROST_MUL, FROST_TIME);
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
  // 易伤：敌人受到的伤害加成（同类加算，只乘一次）。剑印（被飞剑标记）、嗜血、宠物标记（龙威 / 绝对零度）共用这个加算区
  const markLv = e.markT > 0 ? cardLv('sword-mark') : 0;
  const markVuln = markLv > 0 ? SWORD_MARK_VULN[markLv - 1] : 0;
  const petVuln = petVulnOf(e);
  if (stats.vuln > 0 || markVuln > 0 || petVuln > 0) dmg *= 1 + stats.vuln + markVuln + petVuln;
  if (stats.vulnGear > 0) dmg *= 1 + stats.vulnGear;    // 装备「破甲」：独立乘区（不被加算区稀释）
  // 敌方护盾优先吸收（破盾后 3 秒开始恢复）
  const shielded = e.shieldMax > 0 && e.shield > 0;
  if (shielded && stats.sunder > 0) dmg *= 1 + stats.sunder;   // 装备「裂甲」：对带护盾的敌人加伤
  addDps(dmg);                                                 // 实时 DPS（V1.31 调试）：按结算前伤害统计
  const god = devGodBlocks(e);                                 // 调试：怪物无敌
  if (shielded && !god) {
    const absorb = Math.min(e.shield, dmg);
    e.shield -= absorb;
    e.shieldRegenT = CFG.shieldRegenDelay;
    dmg -= absorb;
    spawnDamageNumber(e.x, e.y - e.r - 12, absorb, '#7fd8ff');
    sfxHit();
    if (e.shield <= 0) spawnParticles(e.x, e.y, '#7fd8ff', 10);
    if (dmg <= 0) return;
  }
  // 调试：怪物无敌 —— 伤害数字与打击反馈照常，但不掉血也不破盾（用来核对数值）
  if (god) {
    spawnDamageNumber(e.x, e.y - e.r, dmg, '#ffe066');
    sfxHit();
    spawnParticles(e.x, e.y, '#ffffff', 2);
    return;
  }
  e.hp -= dmg;
  spawnDamageNumber(e.x, e.y - e.r, dmg, '#ffe066');
  sfxHit();
  if (stats.lifesteal > 0) leechHeal(dmg * stats.lifesteal);   // 嗜血：造成伤害的 1% 回血
  if (stats.bloodOrb > 0 && rngCombat() < stats.bloodOrb) leechHeal(dmg * 0.05);   // 血珠
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
  runCoins += coinDrop(e.type) * (gearCoinMul || 1);   // 装备「财富」词条 / 幸运币在此放大
  shake = Math.min(10, shake + (e.type === 'boss' ? 8 : 1.5));
  sfxKill();
  spawnParticles(e.x, e.y, ENEMY_TYPES[e.type].color, 8);
  if (e.type === 'bomber') bomberFuseOnDeath(e);   // 自爆怪：死亡改挂**延迟引信**（V1.31）
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

// 自爆怪爆炸结算（V1.31）：对小兵与**其它怪物**都造成范围伤害（敌我不分）
// 共享血池：对小兵一侧只结算一次伤害（不随命中士兵人数翻倍）；bomberDepth 防止敌人互相引爆无限连锁
let bomberDepth = 0;
function bomberBlast(x, y, r, dmg, peaceful) {
  shake = Math.min(10, shake + 4);
  sfxExplode();
  spawnBlast(x, y, r * 0.8);
  spawnParticles(x, y, '#ff9d3b', 22);
  const hit = anySoldierIn(x, y, r);                     // V1.37：跨两名玩家判定
  if (hit && !peaceful) damageSoldier(hit, dmg, 'aoe');            // 调试：停手的敌人爆炸不掉血
  if (bomberDepth > 0) return;                              // 连锁爆炸只结算一层，避免递归爆炸
  bomberDepth++;
  for (const o of enemies.slice()) {
    if (o.dead) continue;
    if (Math.hypot(o.x - x, o.y - y) > r + o.r) continue;
    hitEnemy(o, dmg, 0, 0);
  }
  bomberDepth--;
}
// 被击杀：不再立即爆炸，改为挂一个**延迟引信**（炸之前还会原地闪烁预警）
function bomberFuseOnDeath(e) {
  const def = ENEMY_TYPES.bomber;
  bombs.push({ x: e.x, y: e.y, t: BOMBER_FUSE.death, maxT: BOMBER_FUSE.death, r: def.boomR, dmg: def.boomDmg * difficulty, peaceful: e.devPeaceful });
}
// 引信推进：到点引爆。先把待处理表摘出来，避免爆炸炸死其它自爆怪时污染正在遍历的数组
function updateBombs(dt) {
  if (!bombs.length) return;
  const pending = bombs;
  bombs = [];
  for (const b of pending) {
    b.t -= dt;
    if (b.t <= 0) bomberBlast(b.x, b.y, b.r, b.dmg, b.peaceful);
    else bombs.push(b);
  }
}
// 引信预警：地面上的红圈随剩余时间收拢（给玩家「快炸了」的读数）
function drawBombs() {
  for (const b of bombs) {
    const p = 1 - Math.max(0, b.t) / (b.maxT || 1);          // 0 → 1
    ctx.save();
    ctx.globalAlpha = 0.30 + 0.35 * Math.abs(Math.sin(gameTime * 14));
    ctx.fillStyle = 'rgba(255,90,50,0.35)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#ff7a3c';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1.15 - 0.35 * p), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
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
  const base = target ? Math.atan2(target.y - e.y, target.x - e.x) : rngCombat() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = base + (i - (count - 1) / 2) * spread;
    enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, r: 5 });
  }
}

// 弹幕墙：整圈铺满并随机留一个缺口，必须从缺口穿过去
function fireBarrageWall(e) {
  const n = 16, gap = Math.floor(rngCombat() * n);
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
        const hit = anySoldierIn(e.x, e.y, e.r);       // V1.37：跨两名玩家判定
        if (hit) { e.skillHit.add('squad'); damageSoldier(hit, e.dashDamage * difficulty, 'skill'); }
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
    if (d < e.r + bodyR() + CONTACT_PAD && e.atkCd <= 0) {
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
    if (e.burstWarnT > 0) {
      e.burstWarnT -= dt;                                  // V1.35：先亮 0.5s 蓄能环再放弹幕
      if (e.burstWarnT <= 0) {
        fireBossBurst(e);
        e.burstCd = e.kind === 'summoner' ? 3.5 : (e.phase2 ? 2 : 2.5);
      }
    } else {
      e.burstCd -= dt;
      if (e.burstCd <= 0) e.burstWarnT = ENEMY_WARN_MIN;
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

// 轨道走位：维持各自的中距离（orbitR）+ 横向绕圈。
// 绕行方向在出场时随机定一次就不再改（V1.26.3）：首领移速远低于部队，来回折返只会看着像走蛇形。
// 朝向做平滑处理，避免每帧改向导致的抖动；减速 / 冰冻沿用与小怪一致的规则。
function moveBoss(e, target, dt) {
  if (e.devStatic) return;                       // 调试：站桩首领不做轨道走位
  if (e.freezeT > 0) return;

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
// 每次都把方向清空，让 aimBossCharge 在蓄力第一帧直接朝向玩家：否则方向会从「上一次冲刺的方向」
// 继续转，而连冲段前摇只有 0.45s（追踪窗口 0.18s × 6 rad/s ≈ 62°），玩家跑到背后就再也转不过来 ——
// 实测连冲段平均偏 68°、最差 120°，等于冲着空气冲。
function enterBossCharge(e, wind) {
  e.skillState = 'charge';
  const w = Math.max(wind || BOSS_SKILL.chargeTime, ENEMY_WARN_MIN);   // 连冲段也保证 ≥0.5s 预警
  e.skillT = w;
  e.chargeWind = w;
  e.skillDirX = 0;
  e.skillDirY = 0;
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
    const a = target ? Math.atan2(target.y - e.y, target.x - e.x) : rngCombat() * Math.PI * 2;
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
  const hit = anySoldierIn(e.x, e.y, BOSS_SHOCK.r);      // V1.37：跨两名玩家判定
  if (hit) damageSoldier(hit, BOSS_SHOCK.dmg * difficulty, 'skill');
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
  //   e.orbitDir = -e.orbitDir;                          // 换个绕行方向，免得刚落地又绕回去（V1.26.3 起绕行方向不再自动翻转）
  //   return;
  // }
  e.sumCd -= dt;
  if (e.sumCd <= 0) {
    e.sumCd = e.phase2 ? 3.8 : 5.4;
    e.castType = 'summon';
    e.castT = BOSS_SUMMON.wind;
    const a = rngWorld() * Math.PI * 2, rr = rngWorld() * 120;
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
    const type = rngWorld() < 0.5 ? 'grunt' : 'fast';
    const a = rngWorld() * Math.PI * 2, rr = rngWorld() * BOSS_SUMMON.r * 0.65;
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
  // V1.35：突进撕咬前先摆 0.5s 前摇（原地蓄势、地面画锯齿预警），时间到才真正扑出去
  if (e.biteWind > 0) {
    e.biteWind -= dt;
    if (e.biteWind <= 0) {
      const a = Math.atan2(target.y - e.y, target.x - e.x);
      e.skillDirX = Math.cos(a);
      e.skillDirY = Math.sin(a);
      e.dashSpd = BOSS_BITE.speed;
      e.dashT = BOSS_BITE.time;
      e.dashDamage = BOSS_BITE.dmg;
      e.dashKind = 'bite';
      e.skillHit = new Set();
    }
    return;
  }
  e.skillCd -= dt;
  if (e.skillCd > 0) return;
  const d = Math.hypot(target.x - e.x, target.y - e.y);
  // 已经贴到身上（接触伤害范围内）就不必突进，1.2s 后再判断。
  // V1.26.2：阈值从 e.r + 70（116）改成真正的接触距离（66）—— 它自己就停在 orbitR = 110，
  // 旧阈值把它一直判成「贴脸」，撕咬从来没触发过。
  if (d <= e.r + bodyR() + CONTACT_PAD) { e.skillCd = 1.2; return; }
  e.skillCd = e.phase2 ? 3.2 : 4.6;
  e.biteWind = ENEMY_WARN_MIN;
}

// 分裂者的被动：血量每损失一档（80% / 60%）原地裂出一只低血分身，上限 2 只（避免越打越多）
function tryBossSplitOff(e) {
  if (e.splitLeft <= 0) return;
  if (e.hp > e.maxHp * e.splitAt) return;
  e.splitLeft--;
  e.splitAt -= 0.2;
  const a = rngWorld() * Math.PI * 2, d = e.r + 50;
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

  // V1.35：技能预警（0.5s 蓄能环）走完才真正甩招
  if (e.burstWarnT > 0) {
    e.burstWarnT -= dt;
    if (e.burstWarnT > 0) return;
    fireBarrageSkill(e, target);
    return;
  }

  e.burstCd -= dt;
  if (e.burstCd > 0) return;

  // V1.35：选中技能后先亮 0.5s 蓄能环（可视化预警），时间到才真正甩出去
  e.burstWarnT = ENEMY_WARN_MIN;
}

// 弹幕者真正放招（由上面的 0.5s 预警倒计时到点后调用）
function fireBarrageSkill(e, target) {
  e.skillIdx = ((e.skillIdx || 0) + 1) % (e.phase2 ? 5 : 4);
  e.spiralDual = false;
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
  } else if (e.skillIdx === 3) {
    fireBarrageWall(e);                                      // 弹幕墙（V1.25：一阶段即开放）
    e.burstCd = e.phase2 ? 3.0 : 3.8;
  } else {
    e.spiralT = 1.8;                                         // 二阶段专属：交叉双螺旋
    e.spiralFireT = 0;
    e.spiralDual = true;
    e.burstCd = 3.6;
  }
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

    // 宠物标记（龙威 / 绝对零度）：计时递减，归零后不再提供易伤
    if (e.aweT > 0) {
      e.aweT = Math.max(0, e.aweT - dt);
      if (e.aweT <= 0) e.aweVuln = 0;
    }

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
        e.warnT = 0;                                  // 目标走出射程：取消蓄能
        moveEnemy(e, t, dt);
      } else if (e.warnT > 0) {
        e.warnT -= dt;                                // 蓄能中站定（地面 / 头顶有可视化预警）
        if (e.warnT <= 0) { fireEnemyBullet(e, t); e.shootCd = def.shootInterval; }
      } else {
        e.shootCd -= dt;
        if (e.shootCd <= 0) e.warnT = ENEMY_WARN_SHOT;   // V1.35：先预警 0.55s 再开火
      }
    } else if (e.type === 'bomber') {
      // 自爆怪（V1.31）：① 靠近玩家到引信距离 → 点燃引信，蓄爆期间原地不动，倒计时结束起爆
      const def2 = ENEMY_TYPES.bomber;
      if (e.bomberT > 0) {
        e.bomberT -= dt;
        if (e.bomberT <= 0) { e.dead = true; bomberBlast(e.x, e.y, def2.boomR, def2.boomDmg * difficulty, e.devPeaceful); continue; }
      } else {
        const b = nearestSoldier(e.x, e.y);
        if (b) {
          const d = Math.hypot(b.x - e.x, b.y - e.y);
          if (d < (def2.boomR + bodyR()) * BOMBER_FUSE.radius) {
            e.bomberT = BOMBER_FUSE.near;                     // 点燃引信，站定蓄爆（给玩家拉开的机会）
            spawnFloatText(e.x, e.y - e.r - 16, '引信！', '#ff9d3b');
            spawnParticles(e.x, e.y, '#ff9d3b', 6);
          } else {
            moveEnemy(e, b, dt);
          }
        }
      }
    } else if (e.type === 'hunter' && t) {
      // 追踪弹：保持距离并发射缓慢追踪弹
      const d = Math.hypot(t.x - e.x, t.y - e.y);
      if (d > def.range) { e.warnT = 0; moveEnemy(e, t, dt); }
      else if (e.warnT > 0) {
        e.warnT -= dt;                                // V1.35：同样先预警 0.55s 再开火
        if (e.warnT <= 0) { fireEnemyBullet(e, t); e.shootCd = def.shootInterval; }
      } else {
        e.shootCd -= dt;
        if (e.shootCd <= 0) e.warnT = ENEMY_WARN_SHOT;
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
        if (d < e.r + bodyR() + CONTACT_PAD && e.atkCd <= 0) {
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
        spawnMinionsAround(e, rngWorld() < 0.6 ? 'grunt' : 'fast', 1 + (difficulty > 1.5 ? 1 : 0));
      }
    } else if (e.type === 'elite') {
      // 精英：本体就是普通近战怪，威胁全在词缀上
      moveEnemy(e, target, dt);
      const inReach = target !== squad && !e.devPeaceful
        && Math.hypot(e.x - target.x, e.y - target.y) < e.r + bodyR() + CONTACT_PAD;
      // V1.35：贴身之后先摆 0.5s 的攻击前摇（地面上画红色扇环），再结算伤害 —— 给玩家反应窗口。
      //   前摇 + 冷却合计仍是 1.0s，DPS 与旧版一致，只是从「瞬间扣血」改成「看得见的一击」。
      if (e.swingT > 0) {
        e.swingT -= dt;
        if (e.swingT <= 0) {
          if (inReach) damageSoldier(target, e.dmg, 'melee');
          e.atkCd = ENEMY_WARN_MIN;
        }
      } else {
        e.atkCd -= dt;
        if (inReach && e.atkCd <= 0) e.swingT = ENEMY_WARN_MIN;
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
        if (d < e.r + bodyR() + CONTACT_PAD && e.atkCd <= 0) {
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

    // V1.37：跨两名玩家判定 —— 打中谁就扣谁的血池
    const victim = anySoldierIn(b.x, b.y, b.r);
    if (victim) { damageSoldier(victim, b.dmg, 'shot'); b.dead = true; }
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
        if (rngCombat() < chance) return true;
      }
    }
  }
  return false;
}

// ==================== 死亡原因（V1.35 第二阶段需求 5） ====================
// 小兵共享血池归零就结算。结算页要能说清「这一下是什么打死的」，所以每次掉血都带一个来源标签：
//   melee 近战接触 / aoe 范围爆炸 / shot 敌弹 / skill 首领技能 / env 藤蔓等环境机制
const HURT_CAUSES = {
  melee: { kill: '被近战伤害击杀', from: '近战伤害' },
  aoe:   { kill: '被范围爆炸命中阵亡', from: '范围爆炸' },
  shot:  { kill: '被敌弹击中阵亡', from: '敌方子弹' },
  skill: { kill: '被首领技能命中阵亡', from: '首领技能' },
  env:   { kill: '被藤蔓 / 环境机制拖住阵亡', from: '藤蔓 / 环境机制' },
};
let hurtBy = {};          // 本局各类来源累计造成的扣血（结算页排序用）
let lastHurt = '';        // 最后一次「扣到血」的来源

function damageSoldier(s, dmg, cause) {
  if (!s) return;
  // V1.37：伤害一律记在**这个小兵的主人**头上。敌人 / 敌方子弹是在全局上下文（= 本机玩家）
  // 里跑的，直接扣会把客机挨的打算到房主身上 —— 所以先切到主人的上下文再走原来的逻辑。
  const owner = playerOf(s);
  if (owner !== activePlayer) { withCtx(owner, () => damageSoldier(s, dmg, cause)); return; }
  if (!soldiers.length) return;
  if (squad.invulnT > 0) return;
  if (stats.dodge > 0 && rngCombat() < stats.dodge) {
    spawnParticles(s.x, s.y, '#9fe0ff', 4);
    return;
  }
  dmg *= stats.damageTaken;
  // 原子守护（V1.35）：有护盾时受到的伤害 ×0.5，没有护盾时 ×2
  if (stats.atomicGuard) dmg *= squad.shield > 0 ? 0.5 : 2;
  if (squad.shield > 0) {
    if (stats.shieldDamageTaken < 1) dmg *= stats.shieldDamageTaken;   // V1.31「有护盾时受伤 ×0.6」这类主属性
    const raw = dmg;                                  // 「受到伤害」：护盾吸收前的这一份 —— 盾反 / 炸开的计算基准
    const shieldBefore = squad.shield;
    const absorb = Math.min(squad.shield, dmg);
    squad.shield -= absorb;
    squad.shieldRegenTimer = shieldRegenDelay();      // V1.35：延迟受「坚定守护」削减
    dmg -= absorb;
    // 盾反（V1.35）：护盾激活期间，受到伤害反弹一部分给周围敌人
    if (stats.shieldThornsPct > 0 && thornsDepth === 0) {
      thornsDepth++;
      for (const e of enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) > SHIELD_BURST_R + e.r) continue;
        hitEnemy(e, raw * stats.shieldThornsPct, 0, 0);
      }
      thornsDepth--;
    }
    // 伤害超出护盾量 → 护盾炸开：对四周小范围造成爆炸伤害与击退
    if (raw > shieldBefore) {
      if (stats.shieldBurstPct > 0) shieldBurstAt(s, raw * stats.shieldBurstPct);
      if (stats.atomicGuard) atomicShieldBurst(s, raw);   // 原子守护：大范围伤害 + 一次性点燃 / 减速
    }
    if (dmg <= 0) return;
  }
  squadHp -= dmg;                                   // 伤害统一进共享血池
  // 记死亡原因（只统计真正扣到血的那部分，扣盾不算）
  const ck = HURT_CAUSES[cause] ? cause : 'melee';
  hurtBy[ck] = (hurtBy[ck] || 0) + dmg;
  lastHurt = ck;
  // 装备「荆棘」：受伤时对周围敌人反伤（伤害量按本次受伤比例，随敌人强度自然成长）
  if (stats.thorns > 0 && thornsDepth === 0) {
    thornsDepth++;
    for (const e of enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - s.x, e.y - s.y) > THORNS_RADIUS + e.r) continue;
      hitEnemy(e, dmg * stats.thorns, 0, 0);
    }
    thornsDepth--;
  }
  spawnDamageNumber(s.x, s.y - bodyR(), dmg, '#ff5555');
  sfxHurt();
  // 受伤免疫：冷却好了才触发，触发后同时进入免疫与冷却（冷却从触发时刻起算）
  if (stats.invulnDuration > 0 && squad.invulnCdT <= 0) {
    squad.invulnT = stats.invulnDuration;
    squad.invulnCdT = INVULN_CD;
  }
  spawnParticles(s.x, s.y, '#ff5555', 4);
  dropSoldiersToFitPool();                          // 血池不足一格就少一个小人
}

// 盾反 · 护盾炸开（V1.35）：伤害超出护盾量时对四周小范围造成爆炸伤害并击退
function shieldBurstAt(s, dmg) {
  spawnBlast(s.x, s.y, SHIELD_BURST_R);
  spawnParticles(s.x, s.y, '#8fdcff', 16);
  sfxExplode();
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.x - s.x, dy = e.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d > SHIELD_BURST_R + e.r) continue;
    hitEnemy(e, dmg, 0, 0);
    if (e.type !== 'boss' && e.kbT <= 0) {       // Boss 免疫击退
      const kl = d || 1;
      e.kbx = (dx / kl) * SHIELD_BURST_KNOCK;
      e.kby = (dy / kl) * SHIELD_BURST_KNOCK;
      e.kbT = 1;
    }
  }
}

// 原子守护（V1.35）：护盾破裂时触发大范围伤害，并附带一次性点燃与减速
function atomicShieldBurst(s, dmg) {
  spawnBlast(s.x, s.y, ATOMIC_BURST_R);
  spawnParticles(s.x, s.y, '#c8f0ff', 24);
  sfxExplode();
  for (const e of enemies) {
    if (e.dead) continue;
    if (Math.hypot(e.x - s.x, e.y - s.y) > ATOMIC_BURST_R + e.r) continue;
    hitEnemy(e, dmg, 0, 0);
    applyBurn(e, BURN_DPS, BURN_TIME);                 // 一次性点燃
    tryApplyFrost(e, 0.55, FROST_TIME);                // 一次性减速
  }
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
      learnTag('经验光球：走过去自动吸取');
      guideAdvance('pickup');
    }
  }
  drops = drops.filter(d => !d.dead);
}

// 世界成长：每击败一个 Boss，经验获取量与出怪量按比例提升
function xpScale() { return 1 + 0.2 * bossKills; }      // 每个 Boss +20% 经验

// 新手阶段减负（V1.35 第二阶段需求 2）：**前 3 波**出怪更稀、伤害更低。
//   经验值刻意**不动** —— 前 3 波少刷的怪正好把「首次升级」推到 20 秒上下（自动走位打法实测 17~22 秒），
//   落在需求要求的「20 秒左右 / 不晚于 30 秒」，又不会像加经验那样把首升提前到 10 秒出头。
const EARLY_WAVES = 3;
function earlyEase() { return wave <= EARLY_WAVES && bossKills === 0; }
function earlySpawnMul() { return earlyEase() ? 1.3 : 1; }
function earlyDmgMul() { return earlyEase() ? 0.7 : 1; }
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
    beginLevelUp();     // V1.37：升级入口统一走这里（单人局等价于原来的「升级 + 弹面板」）
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

// 波次目标（V1.35 第二阶段需求 4）：算出「距下一次精英 / 下一个首领」还有多少秒。
//   精英出现在 5 / 15 / 25… 波（10 的倍数波是首领，跳过），首领出现在 10 / 20 / 30… 波，每波固定 WAVE_TIME 秒。
//   当前波剩余 + 中间整波 × 波数；标准模式超过 20 波就没有了，返回 Infinity 由 waveEta() 显示成「—」。
function waveGoalInfo() {
  const remain = Math.max(0, WAVE_TIME - waveT);
  const eta = target => remain + Math.max(0, target - wave - 1) * WAVE_TIME;
  let eW = wave + 1;
  while (eW % 5 !== 0 || eW % 10 === 0) eW++;
  let bW = wave + 1;
  while (bW % 10 !== 0) bW++;
  const capped = runMode === 'standard';
  return {
    eliteWave: eW,
    bossWave: bW,
    elite: (capped && eW > STANDARD_WAVES) ? Infinity : eta(eW),
    boss: (capped && bW > STANDARD_WAVES) ? Infinity : eta(bW),
  };
}

function waveEta(sec) { return Number.isFinite(sec) ? fmtTime(sec) : '—'; }

// 出怪间隔：随波次线性收紧（`4.8 / pace`），`spawnScale()`（Boss 数）再乘一档加速（封顶 2 倍）；
// 下限 0.10s。标定后每波出怪量约为：波 1 ≈ 4 只、波 10 ≈ 17、波 20 ≈ 55、波 30 ≈ 93、波 50 ≈ 151。
// 基数 4.8 是按「12 局自动走位的存活测试」扫出来的：与旧版清场制（平均存活 127s / 等级 6.7 /
// 同屏峰值 13）基本持平（125s / 6.7 / 12），既去掉了「等清场」的死节奏，难度又没有额外飙升。
function spawnInterval() {
  const pace = (1 + 0.35 * (wave - 1)) * Math.min(2.0, spawnScale());
  return Math.max(0.10, (4.8 / pace) * earlySpawnMul());
}

function updateSpawning(dt) {
  if (devNoSpawn) return;                      // 调试：停止刷怪（波次计时一并停住，避免空转推进波次）
  const bossAlive = !!bossArena || enemies.some(e => e.type === 'boss');

  if (!bossAlive && !devFreezeWave) {          // 调试：冻结波次计时（勾选后不再自动推进波次）
    waveT += dt;
    if (waveT >= WAVE_TIME) {
      waveT -= WAVE_TIME;
      wave++;
      // V1.32：标准模式打完第 20 波即通关（波次推进到 21 的那一刻结算）；无尽模式没有上限
      if (runMode === 'standard' && wave > STANDARD_WAVES) { winRun(); return; }
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
  const placed = px !== undefined;        // 调用方指定了落点（分裂 / 召唤 / 调试）→ 不做出屏兜底
  let x, y;
  if (px !== undefined) {
    x = px; y = py;
  } else {
    const side = rngWorld();
    if (side < 0.5) { x = camera.x + rngWorld() * viewW(); y = camera.y - m; }
    else if (side < 0.75) { x = camera.x - m; y = camera.y + rngWorld() * viewH(); }
    else if (side < 0.9) { x = camera.x + viewW() + m; y = camera.y + rngWorld() * viewH(); }
    else { x = camera.x + rngWorld() * viewW(); y = camera.y + viewH() + m; }
  }

  x = Math.max(10, Math.min(WORLD.w - 10, x));
  y = Math.max(10, Math.min(WORLD.h - 10, y));

  // V1.35：镜头允许越界（见 updateCamera）后，世界边缘会落进视野里，上面的夹取可能把出怪点
  //   拽回屏幕内，造成敌人「凭空出现在眼前」。这里兜底：若夹取后的落点仍在可视范围内，
  //   就沿最近的一边把它推出可视范围，保证出怪永远在屏幕外。
  //   只对「随机出怪」生效 —— 分裂 / 召唤 / 调试这类显式落点是就地出生，推出屏反而会瞬移。
  if (!placed) {
    const svx0 = camera.x - 12, svy0 = camera.y - 12;
    const svx1 = camera.x + viewW() + 12, svy1 = camera.y + viewH() + 12;
    if (x > svx0 && x < svx1 && y > svy0 && y < svy1) {
      const dl = x - svx0, dr = svx1 - x, dtp = y - svy0, db = svy1 - y;
      const mn = Math.min(dl, dr, dtp, db);
      if (mn === dl) x = svx0;
      else if (mn === dr) x = svx1;
      else if (mn === dtp) y = svy0;
      else y = svy1;
    }
  }

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
    dmg: t === 'boss' ? def.dmg * difficulty : def.dmg * difficulty * enemyDmgScale() * earlyDmgMul(),
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
    warnT: 0, burstWarnT: 0, swingT: 0, biteWind: 0,   // 出招预警倒计时（V1.35：远程 / 弹幕 / 精英近战 / 撕咬）
    // 首领「灵活性」层（V1.25）：轨道走位 / 短距位移 / 施法读条
    orbitDir: rngWorld() < 0.5 ? 1 : -1, moveAng: null,
    dashT: 0, dashSpd: 0, dashDamage: 0, dashKind: '', chargeCombo: 0,
    castT: 0, castType: '', castX: 0, castY: 0,   // blinkCd: 2,  ← V1.25.1 停用（召唤者闪现的冷却）
    splitAt: 0.8, splitLeft: 2,
    affixes: [], affixSplit: false, affixVolatile: false, affixBerserk: false, affixWard: false,
    berserkOn: false, wardCd: 0,
    // 调试标记（V1.26 局内调试面板）：站桩 = 不移动 / 不吃击退，停手 = 不造成任何伤害
    devStatic: !!opts.devStatic, devPeaceful: !!opts.devPeaceful,
    bomberT: 0,      // 自爆怪引信倒计时（V1.31）
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
    // 首王（本局第一只·由波次系统自然刷出的那只）：先在玩家脚底读秒预警，再从空中砸下（V1.31）
    // 显式给了坐标的（调试面板 / 测试）与 opts.noDrop 的直接即时入场，避免演出打断调试与断言
    const natural = px === undefined;
    if (natural && !bossDropDone && !opts.noDrop) {
      bossDropDone = true;
      const at = enemies.indexOf(e);
      if (at >= 0) enemies.splice(at, 1);          // 先不入场，等砸落那一刻再放进来
      const dx = Math.max(60, Math.min(WORLD.w - 60, squad.x + (rngWorld() - 0.5) * 70));
      const dy = Math.max(60, Math.min(WORLD.h - 60, squad.y + (rngWorld() - 0.5) * 70));
      e.x = dx; e.y = dy;
      openBossArena(e);                            // 场地中心 = 玩家当前位置
      e.x = dx; e.y = dy;                          // 覆盖 openBossArena 的「拉远到 220」：首王就是砸在玩家头顶
      showBanner(`BOSS · ${BOSS_KINDS[kind].name}`, 2.4);
      bossDrop = { x: dx, y: dy, t: BOSS_DROP.wind, maxT: BOSS_DROP.wind, pending: e };
      return;                                    // 暂不入场，等砸落那一刻才 push 进 enemies
    }
    openBossArena(e);
    showBanner(`BOSS · ${BOSS_KINDS[kind].name} · 场地封锁`, 2.4);
  }
}

// 首王砸落（V1.31）：读秒结束 → 落地结算一次高额范围伤害（对小兵与怪物），再把首领正式放进场
function updateBossDrop(dt) {
  if (!bossDrop) return;
  bossDrop.t -= dt;
  if (bossDrop.t > 0) return;
  const d = bossDrop;
  bossDrop = null;
  spawnBlast(d.x, d.y, BOSS_DROP.r * 0.9);
  spawnParticles(d.x, d.y, '#ff9d3b', 30);
  spawnParticles(d.x, d.y, '#c0392b', 22);
  shake = Math.min(18, shake + 12);
  sfxExplode();
  const dmg = BOSS_DROP.dmg * difficulty;
  const hit = anySoldierIn(d.x, d.y, BOSS_DROP.r);       // V1.37：跨两名玩家判定
  if (hit) damageSoldier(hit, dmg, 'aoe');               // 共享血池：只结算一次伤害（首领落地砸击）
  for (const o of enemies.slice()) {              // 先结算场上敌人，再把首领放进场（免得它被自己的落地砸到）
    if (o.dead) continue;
    if (Math.hypot(o.x - d.x, o.y - d.y) > BOSS_DROP.r + o.r) continue;
    hitEnemy(o, dmg, 0, 0);
  }
  d.pending.x = d.x; d.pending.y = d.y;             // 首领就落在预警圈的位置
  enemies.push(d.pending);
  showBanner(`BOSS · ${BOSS_KINDS[d.pending.kind].name} · 场地封锁`, 2.0);
}

// 首王落点预警圈（地面层）：外圈 + 半透明范围 + 随读秒收缩的金色内圈
function drawBossDropRing() {
  if (!bossDrop) return;
  const p = 1 - Math.max(0, bossDrop.t) / bossDrop.maxT;
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#ff5a3c';
  ctx.beginPath(); ctx.arc(bossDrop.x, bossDrop.y, BOSS_DROP.r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#ff5a3c';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(bossDrop.x, bossDrop.y, BOSS_DROP.r, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.2 + 0.6 * Math.abs(Math.sin(gameTime * 9));
  ctx.strokeStyle = '#ffd54f';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(bossDrop.x, bossDrop.y, BOSS_DROP.r * (1 - p), 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// 首王下落中的身影（空中层）：从天上加速砸下来
function drawBossDropFall() {
  if (!bossDrop) return;
  const p = 1 - Math.max(0, bossDrop.t) / bossDrop.maxT;
  const yy = bossDrop.y - BOSS_DROP.from * (1 - p) * (1 - p);
  const r = ENEMY_TYPES.boss.r;
  ctx.save();
  ctx.globalAlpha = 0.22 + 0.25 * (1 - p);
  ctx.fillStyle = '#c0392b';
  ctx.beginPath(); ctx.ellipse(bossDrop.x, yy - 52, r * 0.42, r * 1.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(bossDrop.x, yy, 2, bossDrop.x, yy, r * 1.6);
  g.addColorStop(0, '#e8553f');
  g.addColorStop(1, '#7a1d12');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(bossDrop.x, yy, r * 0.62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a0b06';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

// 精英成群刷新：一波精英从一个屏幕外基准点成簇出现（低压成群定位，见 ENEMY_TYPES.elite）
// 体量：第 5 波 2 只起，之后每 10 波 +1，封顶 5 只。
function eliteGroupSize() { return Math.min(5, 2 + Math.floor((wave - 5) / 10)); }
function spawnEliteGroup(n) {
  const first = !eliteIntroDone;      // V1.35：第一次遇到精英给一段更清楚的登场提示
  eliteIntroDone = true;
  const m = 60;
  const side = rngWorld();
  let bx, by;
  if (side < 0.5) { bx = camera.x + rngWorld() * viewW(); by = camera.y - m; }
  else if (side < 0.75) { bx = camera.x - m; by = camera.y + rngWorld() * viewH(); }
  else if (side < 0.9) { bx = camera.x + viewW() + m; by = camera.y + rngWorld() * viewH(); }
  else { bx = camera.x + rngWorld() * viewW(); by = camera.y + viewH() + m; }
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 / n) * i;
    spawnEnemy('elite', bx + Math.cos(a) * 70, by + Math.sin(a) * 70);
  }
  showBanner(first ? '精英怪来袭！它们贴身时会先亮起红圈再出手' : `精英来袭 ×${n}`, first ? 3.0 : 1.6);
}

// 分裂词缀：死亡时裂成 2 只「无词缀的残血小精英」（不再带分裂，避免无限递归）
function spawnSplitElites(e) {
  for (let i = 0; i < 2; i++) {
    const a = rngWorld() * Math.PI * 2;
    const d = 40 + rngWorld() * 30;
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
  const hit = anySoldierIn(e.x, e.y, ELITE_BOOM_R);      // V1.37：跨两名玩家判定
  if (hit) damageSoldier(hit, ELITE_BOOM_DMG * difficulty, 'aoe');
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
    const a = rngWorld() * Math.PI * 2;
    const d = 45 + rngWorld() * 45;
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
  let r = rngWorld() * total;
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
    const a = rngFx() * Math.PI * 2;
    const sp = 40 + rngFx() * 120;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + rngFx() * 3, life: 0.5, color });
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
    for (let i = 0; i < n; i++) d[i] = rngFx() * 2 - 1;
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

// 房主：把「这一刻发生的打击事件」记下来，随快照节拍下发给客机（客机不跑逻辑，音效无从产生）。
//   **在「事件层」记，不在「播放层」记**（放在 audioReady / sfxReady 之前）：
//   客机听不听得到该由**客机自己的音效设置**决定，不该被房主关没关声音带着走；
//   而节流那一套客机自己也会做一遍（它调的就是下面这些函数），所以不会变成噪音墙。
//   一拍之内同类只留一条 —— 音效本来就有 40~120ms 的节流，快照间隔是 55ms，一条正好。
function netSfxTap(key) {
  if (netRole !== 'host') return;
  if (netSfxQueue.indexOf(key) >= 0 || netSfxQueue.length >= NET_SFX_MAX) return;
  netSfxQueue.push(key);
}

// 音效 key → 播放函数（客机照着重放房主播过的音效）
const SFX_BY_KEY = {
  shoot: sfxShoot, hit: sfxHit, kill: sfxKill, explode: sfxExplode,
  fireball: sfxFireball, thunder: sfxThunder, ice: sfxIce, hurt: sfxHurt,
};

function sfxShoot() {
  netSfxTap('shoot');
  if (!audioReady()) return;
  beep(540, 0.04, 'square', 0.015);
  noiseHit(0.06, 0.012, 'highpass', 1400, 700);
}
function sfxHit() {
  netSfxTap('hit');
  if (!audioReady() || !sfxReady('hit', 40)) return;
  noiseHit(0.07, 0.03, 'bandpass', 1100, 320, 1.1);
  beep(190, 0.05, 'sawtooth', 0.02);
}
function sfxKill() {
  netSfxTap('kill');
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
  netSfxTap('explode');
  if (!audioReady() || !sfxReady('boom', 70)) return;
  sweep(170, 42, 0.34, 'sine', 0.085);
  noiseHit(0.38, 0.065, 'lowpass', 1500, 130);
}
// 火球：呼啸的火焰声（带通由低扫到高，像火球破空）
function sfxFireball() {
  netSfxTap('fireball');
  if (!audioReady() || !sfxReady('fire', 80)) return;
  noiseHit(0.32, 0.05, 'bandpass', 260, 1100, 0.9);
  sweep(190, 65, 0.3, 'sawtooth', 0.028);
}
// 雷击：先脆裂的电弧，再跟一声滚动的低频雷声
function sfxThunder() {
  netSfxTap('thunder');
  if (!audioReady() || !sfxReady('thunder', 90)) return;
  noiseHit(0.07, 0.1, 'highpass', 2600, 1200);
  sweep(920, 90, 0.26, 'square', 0.045);
  noiseHit(0.5, 0.055, 'lowpass', 600, 110);
}
// 冰刺：清脆的晶体破空与碎裂
function sfxIce() {
  netSfxTap('ice');
  if (!audioReady() || !sfxReady('ice', 70)) return;
  beep(2280, 0.05, 'triangle', 0.03);
  sweep(1800, 780, 0.13, 'sine', 0.022);
  noiseHit(0.12, 0.028, 'highpass', 3200, 1600);
}
function sfxHurt() {
  netSfxTap('hurt');
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
  // V1.37 双人：房主把打击反馈攒起来，随快照一起下发（客机不跑模拟，否则它看不到任何伤害数字）
  if (netRole === 'host') netFxQueue.push([r1(x), r1(y), Math.round(value), color, 0]);
}

// 浮动文字（提示类，如「树怪苏醒！」）
function spawnFloatText(x, y, text, color) {
  damageNumbers.push({ x, y, text, color, life: 1.4, vy: -40 });
  if (netRole === 'host') netFxQueue.push([r1(x), r1(y), text, color, 1]);
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

// ==================== 升级 · 各自选卡（V1.37 双人） ====================
// 等级与经验是**共享**的（谁捡到经验都算），但**候选卡各抽各的** —— 用各自那份
// pickCount / routePicks / appliedIds 建池（见 buildUpgradePool）。世界在**所有人都选完之前**保持冻结。
//
// 房主权威：候选由房主替两个人各抽一份；客机那份通过 `pick` 消息发过去（带上 id 与文案，
// 客机就不必为了显示卡片而重建一套卡池），客机选完回 `pick:choose`，房主在客机的上下文里落地。
//
// 单人局：players 只有 P1，流程与改动前完全一致（一条 pendingPick，选完立刻解冻）。

// 本机操控的是哪个槽位：房主 = 0，客机 = 1
function localPlayer() {
  if (netRole === 'guest') return players[1] || P1;
  return players[0] || P1;
}

// 给某名玩家抽一份候选（在他的上下文里建池，卡池因此属于那一名玩家）
function rollPickFor(p) {
  return withCtx(p, () => pickUpgrades(choiceCount));
}

// 升级入口：给每名玩家各挂一份待选；客机那份发过去，本机那份弹面板
function beginLevelUp() {
  level++;
  xpToNext = Math.floor(xpToNext * 1.23 + 6);
  // 每名玩家各抽一份候选；抽空了就置 null（**不能用空数组**：空数组是真值，会让「等所有人选完」永远判不成立）
  players.forEach(p => { const c = rollPickFor(p); p.pendingPick = (c && c.length) ? c : null; });
  if (!players.some(p => p.pendingPick)) return;      // 全员都没得选：当作没升级，世界不冻结
  const guest = players.find(p => p.id !== 0);
  if (guest && guest.pendingPick) {
    netSend('pick', {
      level,
      cards: guest.pendingPick.map(c => ({ id: c.id, name: c.name, desc: c.desc })),
    });
  }
  openLocalPick();
}

// **候选是同一条数组引用**：面板（upgrades）与待选槽位（pendingPick）必须指向同一份，
// 否则重掷之后 resolvePick 会拿着旧数组按 id 找不到卡（选了等于没选）。本机候选的赋值一律走这里。
function setLocalCards(cards) {
  upgrades = cards;
  const me = localPlayer();
  if (me) me.pendingPick = cards;
  return cards;
}

// 弹出「本机那一份」候选（单人局就是原来的 openUpgrade）
function openLocalPick() {
  const mine = localPlayer();
  if (!mine || !mine.pendingPick || !mine.pendingPick.length) { renderPickWaiting(); return; }
  setLocalCards(mine.pendingPick);
  sfxLevelup();
  renderUpgradeCards();
  document.getElementById('upgrade-title').textContent = '选择升级';
  // 客机不给重掷：rerollLeft 是房主那边的共享计数，客机按了没有意义
  document.getElementById('btn-reroll').classList.toggle('hidden', rerollLeft <= 0 || netRole === 'guest');
  updateRerollButton();
  guideAdvance('levelup');
  setState('upgrade');
}

// 冻结世界、显示「等待队友」：本机已选完，或本机这轮没得选但队友还挂着待选
function renderPickWaiting() {
  upgrades = [];
  const box = document.getElementById('upgrade-cards');
  if (box) box.innerHTML = '<p class="pick-wait">已选好，等待队友…</p>';
  document.getElementById('upgrade-title').textContent = '等待队友';
  document.getElementById('btn-reroll').classList.add('hidden');
  setState('upgrade');
}

// 某名玩家选定了某张卡：在他的上下文里落地，然后看是不是所有人都选完了
function resolvePick(p, id) {
  if (!p || !p.pendingPick) return;
  const card = p.pendingPick.find(c => c.id === id);
  p.pendingPick = null;
  if (card) withCtx(p, () => applyUpgradeCard(card));
  // 只要还有人挂着待选，世界继续冻结；本机先选完就先给个「等待队友」的提示
  if (players.some(q => q.pendingPick)) { if (p === localPlayer()) renderPickWaiting(); return; }
  finishUpgrade();
}

// 升级面板收场：回到对局（这次升级若是从暂停里打开的，选完回到暂停）
function finishUpgrade() {
  upgrades = [];
  setState('playing');
  if (devUpgradeFromPause) { devUpgradeFromPause = false; pauseGame(); }
}

// 把一张卡落到「当前上下文所属的那名玩家」身上（调用前上下文必须已经切到该玩家）
function applyUpgradeCard(card) {
  if (!card) return;
  card.apply();
  appliedIds.add(card.id);
  if (card.route) routePicks[card.route] = (routePicks[card.route] || 0) + 1;   // 累计本路线强化次数（进化门槛）
  // 结算页的「本局学到的机制」：记下这次选了什么（最多记 4 张，避免列表过长）
  if (runLearned.filter(t => t.startsWith('升级卡：')).length < 4) learnTag('升级卡：' + card.name);
  if (card.evo) learnTag('终极进化：' + card.name);
}

// 面板上点了一张卡 / 按了数字键 / 测试台直接调用
function applyUpgrade(id) {
  if (netRole === 'guest') {           // 客机：把选择回给房主，由房主在客机的上下文里落地
    finishUpgrade();
    netSend('pick:choose', { id });
    return;
  }
  const me = localPlayer();
  if (me && me.pendingPick) resolvePick(me, id);   // 没待选就忽略（等队友 / 面板残留的重复点击）
}

// 客机收到「你该选卡了」：直接把房主抽好的候选摆出来（客机本地没有卡池，也不需要）
function netGuestPick(p) {
  const cards = Array.isArray(p.cards) ? p.cards : [];
  if (!cards.length) return;
  const box = document.getElementById('upgrade-cards');
  box.innerHTML = '';
  const panel = document.querySelector('#upgrade .panel');
  if (panel) panel.scrollTop = 0;
  cards.forEach((c, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'card';
    const name = document.createElement('strong');
    name.textContent = (i + 1) + '. ' + (c.name || '升级');   // 文案来自房主，一律 textContent
    const desc = document.createElement('p');
    desc.className = 'dim';
    desc.textContent = c.desc || '';
    el.append(name, desc);
    el.onclick = () => applyUpgrade(c.id);
    box.appendChild(el);
  });
  setLocalCards(cards.map(c => ({ id: c.id })));
  sfxLevelup();
  document.getElementById('upgrade-title').textContent = '选择升级';
  document.getElementById('btn-reroll').classList.add('hidden');
  setState('upgrade');
}

// ==================== 升级 ====================
// 只给「本机」抽一份并弹面板（测试台 / 开发者工具用）；正式流程走 beginLevelUp，会给每名玩家各抽一份
function openUpgrade() {
  setLocalCards(rollPickFor(localPlayer()));
  openLocalPick();
}

// 重掷：重新抽一次当前升级选项（每局 3 次，击败 Boss +1）
function rerollUpgrades() {
  if (rerollLeft <= 0) return;
  rerollLeft--;
  setLocalCards(pickUpgrades(choiceCount));   // 候选换了数组，待选槽位要跟着换（见 setLocalCards）
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
    let r = rngCombat() * total;
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

// Boss 奖励：候选全部来自首领专属奖励池（不混入普通升级卡），且只选 1 项
function openBossReward() {
  const cap = choiceCount;                                         // 面板张数跟随升级选项数（3~6）
  const pool = BOSS_BUFFS.filter(b => {
    if (b.repeat) return false;                                     // 可重复卡不参与首轮筛选，只用来补位
    if (b.synergy && bossKills <= 1) return false;                  // V1.35：协同技从第 2 个首领起才进池（第一波首领奖励不出）
    if (b.req && !b.req()) return false;                            // 前置不满足（如没有元素伤害来源）则不出现
    if (b.once && appliedIds.has(b.id)) return false;               // 一次性奖励：拿过就不再出现
    if (b.exclusive && hasExclusivePicked(b.exclusive)) return false; // 二选一奖励：同组已选过则不再出现
    return true;
  });
  for (let i = pool.length - 1; i > 0; i--) {                       // 打乱一次性候选
    const j = Math.floor(rngCombat() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  bossRewardOptions = pool.slice(0, cap);
  learnTag('首领奖励：击败首领后二选一');
  // 一次性奖励会被拿空，此时候选少于面板张数；用可重复的补位卡补满，避免留出空格子。
  // （补位卡不够时允许在同一面板内重复出现，保证一定填满。）
  if (bossRewardOptions.length < cap) {
    const fillers = BOSS_BUFFS.filter(b => b.repeat);
    for (let i = fillers.length - 1; i > 0; i--) {
      const j = Math.floor(rngCombat() * (i + 1));
      [fillers[i], fillers[j]] = [fillers[j], fillers[i]];
    }
    for (let i = 0; bossRewardOptions.length < cap; i++) {
      bossRewardOptions.push(fillers[i % fillers.length]);
    }
  }
  if (!bossRewardOptions.length) {
    showBanner('首领奖励已全部获得', 2.2);
    setState('playing');
    return;
  }
  renderBossRewardCards();
  document.getElementById('upgrade-title').textContent = 'BOSS 奖励：选择 1 项';
  document.getElementById('btn-reroll').classList.add('hidden');
  setState('bossreward');
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
  setState('playing');     // 收起首领奖励面板
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
  // V1.35：镜头可越界，先在可视范围铺一层「世界之外」的暗色，再叠上世界地形。
  //   这样贴边时露出的边框是刻意的深色，而不是 stage 底色漏出来的生硬色块。
  ctx.fillStyle = '#0b1f1f';
  ctx.fillRect(camera.x, camera.y, viewW(), viewH());
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
    if (o.hitT > 0) ctx.translate((rngFx() - 0.5) * 3, (rngFx() - 0.5) * 3);

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

// 点燃（V1.31 重做）：改成「从**脚底**烧起来」的真实火焰观感
// 层次（自下而上）：地面焦痕 → 贴地火池 → 一圈从脚底向上舔的火舌（外焰 / 内焰 / 白心）→ 火星 → 余烟
// 与旧版的差别：旧版光晕罩住整个身体、火舌只从腹部冒出、全程 addivite 叠加，看起来像一团发光贴纸；
// 现在火焰的**根部固定在脚底椭圆**上，人物像站在一片火里。
const BURN_FLAME_LAYERS = [
  { w: 0.60, h: 1.55, sw: 1.0, c0: [255, 84, 16, 0.74], c1: [255, 150, 40, 0.00] },   // 外焰
  { w: 0.32, h: 0.98, sw: 0.7, c0: [255, 178, 60, 0.80], c1: [255, 214, 110, 0.10] },  // 内焰
  { w: 0.16, h: 0.52, sw: 0.5, c0: [255, 248, 216, 0.88], c1: [255, 255, 240, 0.00] },  // 白心
];
const BURN_TONGUES = 6;

function drawBurning(e) {
  const t = gameTime;
  const seed = (e.x * 0.13 + e.y * 0.07) % 6.283;
  const fade = Math.min(1, e.burnT / 0.6);          // 快烧完时整体淡出
  const r = e.r;
  const fx = e.x;
  const fy = e.y + r * 0.7;                         // 脚底（碰撞圆下沿）

  // ① 地面焦痕（不发光，压在最底层）
  ctx.save();
  ctx.fillStyle = `rgba(26,12,4,${0.32 * fade})`;
  ctx.beginPath(); ctx.ellipse(fx, fy, r * 1.02, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  // ② 贴地火池（火光的来源，让脚底"亮起来"）
  ctx.globalCompositeOperation = 'lighter';
  const pool = ctx.createRadialGradient(fx, fy, 0, fx, fy, r * 1.3);
  pool.addColorStop(0, `rgba(255,164,52,${0.42 * fade})`);
  pool.addColorStop(0.55, `rgba(226,80,14,${0.22 * fade})`);
  pool.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = pool;
  ctx.beginPath(); ctx.ellipse(fx, fy, r * 1.3, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ③ 火舌：沿脚底椭圆一圈，每根独立抖动；外焰用渐变，内焰 / 白心用纯色（省下每帧的渐变构造）
  for (let i = 0; i < BURN_TONGUES; i++) {
    const a = (Math.PI * 2 / BURN_TONGUES) * i + seed;
    const bx = fx + Math.cos(a) * r * 0.86;
    const by = fy + Math.sin(a) * r * 0.34;
    const jitter = 0.7 + 0.55 * (0.5 + 0.5 * Math.sin(t * 8.5 + i * 2.17 + seed));
    const sway = Math.sin(t * 4.4 + i * 1.31) * r * 0.3;
    const L0 = BURN_FLAME_LAYERS[0];
    const h0 = r * L0.h * jitter;
    const g = ctx.createLinearGradient(bx, by, bx + sway, by - h0);
    g.addColorStop(0, `rgba(${L0.c0[0]},${L0.c0[1]},${L0.c0[2]},${L0.c0[3] * fade})`);
    g.addColorStop(1, `rgba(${L0.c1[0]},${L0.c1[1]},${L0.c1[2]},0)`);
    ctx.fillStyle = g;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawFlameTongue(bx, by, r * L0.w, h0, sway);
    ctx.restore();
    for (let li = 1; li < BURN_FLAME_LAYERS.length; li++) {
      const L = BURN_FLAME_LAYERS[li];
      const h = r * L.h * jitter;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${L.c0[0]},${L.c0[1]},${L.c0[2]},${L.c0[3] * fade})`;
      drawFlameTongue(bx, by - r * 0.03, r * L.w, h, sway * L.sw);
      ctx.restore();
    }
  }

  // ④ 火星：大部分顺着火焰往上飘，少量横着甩出去（更像有热气流）
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const lp = (t * 0.95 + i * 0.21 + seed * 0.5) % 1;
    const a = seed + i * 1.9;
    const drift = Math.sin(t * 2.4 + i * 2.1) * r * 0.5;
    const px = fx + Math.cos(a) * r * 0.5 + drift * lp;
    const py = fy - lp * r * 1.9;
    ctx.fillStyle = `rgba(255,${Math.round(198 - lp * 96)},${Math.round(96 - lp * 70)},${(1 - lp) * 0.9 * fade})`;
    ctx.beginPath(); ctx.arc(px, py, 2.1 * (1 - lp) + 0.7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // ⑤ 余烟：从火焰顶端飘散的暗色烟团
  ctx.save();
  for (let i = 0; i < 2; i++) {
    const lp = (t * 0.55 + i * 0.5 + seed) % 1;
    const sx = fx + Math.sin(t * 1.6 + i * 2.4) * r * 0.45;
    const sy = fy - r * (1.1 + lp * 1.9);
    ctx.fillStyle = `rgba(70,64,60,${(1 - lp) * 0.22 * fade})`;
    ctx.beginPath(); ctx.arc(sx, sy, r * (0.24 + lp * 0.45), 0, Math.PI * 2); ctx.fill();
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
function drawSoldiers(nameOverride) {
  const r = charRadius();
  // 朝向与 updateWeapons 同一口径：只瞄**武器射程内**真正会开火的目标；
  // 射程内没敌人就退回 squad.aimAng（移动方向 / 上一帧朝向），不再死盯打不到的优先目标。
  const dw0 = weapons[0];
  const dwDef = dw0 && WEAPON_DEFS[dw0.type];
  const aimT = dwDef ? pickTarget(squad.x, squad.y, dwDef.range * (dw0.rangeMul || 1)) : null;
  soldiers.forEach((s, i) => {
    const ang = aimT ? Math.atan2(aimT.y - s.y, aimT.x - s.x) : squad.aimAng;

    // 手持模型跟着**当前主武器**走（局内捡到别的武器时剪影也会跟着换）
    drawCharacter(ctx, s.x, s.y, r, ang, meta.character, { time: gameTime, phase: i * .73, weaponType: (weapons[0] && weapons[0].type) || meta.equipped.weapon });

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

  // 局内显示玩家名称（双人时由调用方传对方的名字，见 drawAllPlayers）
  if (soldiers.length) {
    const nm = nameOverride || playerName();
    const s = soldiers[0];
    const ny = s.y - r - 30;
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(nm, s.x, ny);
    ctx.fillStyle = '#9fe0ff';
    ctx.fillText(nm, s.x, ny);
    ctx.lineWidth = 1;
  }
}

// 画全部玩家（V1.37）：单人局就是原来的 drawSoldiers()；
// 双人时逐个切槽位画 —— 每名玩家的手持武器、护盾、血条都取他自己那份 build。
function drawAllPlayers() {
  if (players.length <= 1) { drawSoldiers(); return; }
  const prev = activePlayer;
  for (const p of players) {
    switchTo(p);
    drawSoldiers(p.name || undefined);
    switchTo(prev);
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
      // 挥砍残影：贴着轨道的一小段弧
      ctx.strokeStyle = s.evolved ? '#efb4d655' : '#a0dac455'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(anchor.x, anchor.y, rad, a - .7, a); ctx.stroke();
      // 刀杆：从轨道内侧指向刀刃（辐条式），末端有金属箍
      ctx.strokeStyle = s.evolved ? '#6d3f5c' : '#3f5f58'; ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx - Math.cos(a) * 14, by - Math.sin(a) * 14); ctx.lineTo(bx + Math.cos(a) * 4, by + Math.sin(a) * 4); ctx.stroke();
      ctx.restore();
      drawScytheBlade(bx, by, a, size, s.evolved);
    }
  });
}

// 镰刀刀刃（V1.35 重画）：月牙形刀身（金属渐变 + 外刃高光 + 收尖），沿轨道切线展开，
// 看上去像在「横扫」。旧版只是「一个粗圆弧 + 一个灰圆」，更像甜甜圈而不是刀。
function drawScytheBlade(bx, by, a, size, evolved) {
  const steelHi = evolved ? '#ffe6f6' : '#f2fffa';
  const steelMid = evolved ? '#e39ac9' : '#9bdcc4';
  const steelLo = evolved ? '#7d3f68' : '#2f5c52';
  const edge = evolved ? 'rgba(120,40,95,0.75)' : 'rgba(22,52,48,0.75)';
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(a + Math.PI / 2);                     // +x 指向刀刃展开方向（轨道切线）
  const R = size * 1.25, r = size * 0.52;
  // 月牙刀身：外缘大弧 + 内缘小弧，两端自然收成尖
  ctx.beginPath();
  ctx.arc(0, 0, R, -1.25, 1.25);
  ctx.arc(0, 0, r, 1.05, -1.05, true);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -R, 0, R);
  g.addColorStop(0, steelHi); g.addColorStop(0.55, steelMid); g.addColorStop(1, steelLo);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 1.3; ctx.stroke();
  // 外刃高光（一条亮线，强化「锋利」）
  ctx.beginPath();
  ctx.arc(0, 0, R - 1.2, -0.95, 0.95);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
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

  drawPetModel(ctx, p.x, p.y, 11, gameTime, pet.type, { flash: pet.flashT > 0, stage: petStage(pet) });

  // 技能能量条（V1.28 充能制）：局内选中技能后才显示，攒满即放
  if (pet.skillPick) {
    const w = 26, h = 3, x = p.x - w / 2, y = p.y + 24;
    const pct = Math.min(1, (pet.energy || 0) / PET_DEV_CFG.chargeMax);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = pct >= 1 ? '#fff3b0' : 'rgba(120,220,255,0.85)';
    ctx.fillRect(x, y, w * pct, h);
  }
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
    if (e.bomberT > 0) {                 // 引信已点燃：外圈高频闪烁（V1.31）
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(gameTime * 16));
      ctx.strokeStyle = '#ff6a30';
      ctx.lineWidth = Math.max(1.5, r * 0.16);
      ctx.beginPath(); ctx.arc(0, 1, r * 1.14, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
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
// 怪物模型。V1.34 起多了一个可选的 `avatarCtx`：传了就画到那张 context 上（做方形头像用），
// 不传就画到主画布 —— 函数体一行没改，只是把全局 ctx 通过 `paint` 的参数**同名遮蔽**掉。
function drawEnemyModel(e, enemyColor, avatarCtx) {
  const paint = (ctx) => {
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
  };
  paint(avatarCtx || ctx);   // 这里的 ctx 是模块级主画布（外层没被遮蔽）
}

// 头像（V1.34）：把「角色外观」或某个怪物模型画成一个小方块头像。
// 角色侧 drawCharacter / drawCowCharacter 第一参数本来就是 context，直接能用；
// 怪物侧因为 drawEnemyModel 读的是全局 ctx，所以走上面那个 avatarCtx 参数。
// av 为假值 -> 用当前角色外观；monster 的 id 非法 -> 退回角色外观。
function drawAvatar(c, x, y, r, av, character, opt = {}) {
  const kind = avatarIndex(av) > 0 ? 'monster' : 'char';
  c.save();
  c.beginPath(); c.rect(x - r, y - r, r * 2, r * 2); c.clip();
  if (kind === 'monster') {
    // 假单位：只喂给 drawEnemyModel 真正用到的字段（type / kind / r / x / y / hitFlashUntil）。
    // 体型给 0.72r —— 怪物模型带尖角 / 耳朵会超出本体半径，留一圈余量免得贴边框。
    const def = ENEMY_TYPES[av.type];
    const fake = { type: av.type, kind: def.bossKind || 'charge', r: r * 0.72, x: 0, y: 0, hitFlashUntil: -1 };
    c.translate(x, y);
    drawEnemyModel(fake, def.color, c);
  } else {
    // 角色模型的原点在「身体中心」，本体纵向约 -45 ~ +19，所以缩放后要往上偏一点才居中
    const ch = character || (typeof meta !== 'undefined' && meta.character) || defaultCharacter();
    drawCharacter(c, x, y + r * 0.29, r * 0.44, 0, ch, { time: opt.time || 0, weapon: false });
  }
  c.restore();
}

// ==================== 敌人出招预警的可视化（V1.35 第二阶段需求 3） ====================
// 纯读取（不写任何实体字段、不消耗随机流），符合「渲染层只读世界」的不变量。
//   warnT      远程怪开火前的蓄能：枪口亮起 + 一条拉向目标的虚线瞄准线
//   burstWarnT 首领八向弹幕 / 弹幕者技能前摇：向外扩张的蓄能环
//   swingT     精英近战前摇：地面上的一圈红色扇环（半径 = 实际命中距离）
//   biteWind   分裂者撕咬前摇：更宽的外圈警示
function drawEnemyWarnings(e) {
  if (e.warnT > 0 && (e.type === 'ranged' || e.type === 'hunter')) {
    const k = 1 - Math.max(0, Math.min(1, e.warnT / ENEMY_WARN_SHOT));   // 0 → 1 越来越亮
    const t = nearestSoldier(e.x, e.y);
    if (t) {
      ctx.strokeStyle = `rgba(255,110,110,${0.16 + k * 0.4})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(t.x, t.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = `rgba(255,140,120,${0.3 + k * 0.6})`;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.45 + k * 0.7), 0, Math.PI * 2); ctx.fill();
  }
  if (e.burstWarnT > 0) {
    const k = 1 - Math.max(0, Math.min(1, e.burstWarnT / ENEMY_WARN_MIN));
    ctx.strokeStyle = `rgba(255,120,180,${0.32 + k * 0.5})`;
    ctx.lineWidth = 2 + k * 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10 + k * 26, 0, Math.PI * 2); ctx.stroke();
  }
  if (e.swingT > 0) {
    const k = 1 - Math.max(0, Math.min(1, e.swingT / ENEMY_WARN_MIN));
    const rr = e.r + bodyR() + CONTACT_PAD;
    ctx.fillStyle = `rgba(224,85,85,${0.10 + k * 0.22})`;
    ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,120,110,${0.4 + k * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, rr * (0.45 + k * 0.55), 0, Math.PI * 2); ctx.stroke();
  }
  if (e.biteWind > 0) {
    const k = 1 - Math.max(0, Math.min(1, e.biteWind / ENEMY_WARN_MIN));
    ctx.strokeStyle = `rgba(255,150,90,${0.35 + k * 0.5})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 12 + k * 30, 0, Math.PI * 2); ctx.stroke();
  }
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

    drawEnemyWarnings(e);   // 出招预警（V1.35）：蓄能光点 / 瞄准线 / 蓄能环 / 近战扇环

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
    // 各武器自己的子弹造型（V1.31）：不再统一是「白点 + 尾巴」
    if (b.wtype) {
      const ang = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      if (b.wtype === 'shotgun') {                   // 散弹：小圆弹丸 + 短拖尾
        ctx.strokeStyle = 'rgba(155,224,96,0.45)';
        ctx.lineWidth = b.r * 1.1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, 0); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(155,224,96,0.5)';
        ctx.beginPath(); ctx.arc(0, 0, b.r * 2.1, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#e9ffd0';
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
      } else if (b.wtype === 'laser') {              // 机枪：粉色能量束
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,77,141,0.5)';
        ctx.beginPath(); ctx.arc(0, 0, b.r * 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createLinearGradient(-16, 0, 6, 0);
        g.addColorStop(0, 'rgba(255,77,141,0)');
        g.addColorStop(1, 'rgba(255,190,220,0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(-16, -1.4, 22, 2.8);
        ctx.fillStyle = '#fff0f6';
        ctx.fillRect(-1, -1, 5, 2);
      } else {                                       // 步枪：黄铜尖头弹
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,224,102,0.42)';
        ctx.beginPath(); ctx.arc(0, 0, b.r * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.moveTo(b.r * 1.9, 0); ctx.lineTo(-b.r * 0.5, -b.r); ctx.lineTo(-b.r * 1.6, 0); ctx.lineTo(-b.r * 0.5, b.r);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fffbe6';
        ctx.beginPath(); ctx.arc(b.r * 0.4, 0, b.r * 0.42, 0, Math.PI * 2); ctx.fill();
      }
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
    // k 钳在 [0, 1]：渲染层不允许被数据异常打死（曾经因为 life 反涨到 maxLife 之上，
    // 算出负半径的地面环 → ellipse 抛 IndexSizeError → 整帧渲染中断）
    const k = Math.max(0, Math.min(1, b.life / b.maxLife));          // 1 → 0
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

    // 范围圈（V1.33 闪电专精）：从半径处往外淡出，标示这一劈实际波及多大一片
    if (b.radius > 0) {
      const grow = b.radius * (0.82 + 0.18 * (1 - k));
      ctx.strokeStyle = `rgba(150,225,255,${0.5 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(b.x, b.y + 4, grow, grow * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(140,215,255,${0.10 * k})`;
      ctx.beginPath(); ctx.ellipse(b.x, b.y + 4, grow, grow * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    }

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
  hudPanel(10, 10, W - 20, 110);
  ctx.textAlign = 'left'; ctx.font = 'bold 16px "Microsoft YaHei", sans-serif'; ctx.fillStyle = theme.accent;
  // 标准模式显示「7/20 波」进度；无尽模式标出「无尽」（V1.32）
  const waveText = runMode === 'standard'
    ? `第 ${String(Math.min(wave, STANDARD_WAVES)).padStart(2, '0')}/${STANDARD_WAVES} 波`
    : `第 ${String(wave).padStart(2, '0')} 波 无尽`;
  ctx.fillText(waveText, 24, 34);
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
  // 本波目标（V1.35 第二阶段需求 4）：剩余敌人 / 距下一次精英 / 距下一个首领
  //   波次计时在首领存活时冻结，所以这三个数字在首领战里会自然停住，与实际节奏一致。
  const bossNow = enemies.find(e => e.type === 'boss' && !e.dead);
  const goal = waveGoalInfo();
  ctx.font = '10px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left'; ctx.fillStyle = theme.muted;
  ctx.fillText('剩余敌人 ' + enemies.length, 24, 100);
  ctx.textAlign = 'center'; ctx.fillStyle = bossNow ? theme.muted : theme.text;
  ctx.fillText('精英 ' + waveEta(goal.elite), W / 2, 100);
  ctx.textAlign = 'right'; ctx.fillStyle = bossNow ? theme.accent : theme.text;
  ctx.fillText(bossNow ? '首领 交战中' : '首领 ' + waveEta(goal.boss), W - 24, 100);
  const boss = bossNow;
  if (boss) {
    const bw = Math.min(W - 60, 480), bx = (W - bw) / 2;
    hudPanel(bx, 124, bw, 44);
    ctx.textAlign = 'center'; ctx.fillStyle = theme.accent; ctx.font = 'bold 11px sans-serif';
    ctx.fillText('首领 / ' + (BOSS_KINDS[boss.kind]?.name || 'BOSS'), W / 2, 142);
    drawBar(W / 2, 152, bw - 24, 5, boss.hp / boss.maxHp, '#e98d7c');
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
  if (gameTime < 7 && isLive()) {
    ctx.textAlign = 'center'; ctx.fillStyle = '#c5d5c1'; ctx.font = '11px sans-serif';
    ctx.fillText('WASD / 方向键 / 拖动移动 · 自动攻击', W/2, H-78);
  }
  ctx.restore();
}
function drawAtmosphere() {
  // 屏幕边缘表现不会改变世界坐标或碰撞。
  const low = squadMaxHp > 0 && squadHp / squadMaxHp < .3 && isLive();
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
  const sx = shake > 0 && !reducedMotion.matches ? (rngFx() - 0.5) * shake : 0;
  const sy = shake > 0 && !reducedMotion.matches ? (rngFx() - 0.5) * shake : 0;
  ctx.save();
  ctx.scale(ZOOM, ZOOM);                    // 镜头拉远：可见的世界范围 = W/ZOOM × H/ZOOM
  ctx.translate(-camera.x + sx, -camera.y + sy);
  drawBackground();
  drawBossArena();
  drawDrops();
  drawObstacles();
  drawPetFx('ground');            // 宠物技能的地面层：熔岩池 / 领域 / 漩涡 / 新星…（压在单位下方）
  drawBombs();                    // 自爆怪的引信预警圈（V1.31）
  drawBossDropRing();             // 首王落点预警圈（V1.31）
  drawAllPlayers();   // V1.37：双人时两名玩家都画（各自的手持武器 / 护盾 / 血条）
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
  drawPetFx('air');               // 宠物技能的空中层：喷火 / 闪电 / 落雷 / 陨石（盖在单位上方）
  drawBossDropFall();             // 首王下落中的身影（V1.31）
  drawSwordSlashes();
  drawParticles();
  drawDamageNumbers();
  ctx.restore();
  drawAtmosphere();
  drawHUD();
  drawBanner();
  drawResumeCountdown();      // 继续游戏的 3 秒倒计时（V1.31）
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

// 继续游戏的 3 秒倒计时（V1.31）：暂停面板点「继续」后先读秒，读完才解除逻辑冻结
const RESUME_COUNTDOWN = 3;
let resumeT = 0;

// 给「这一段里新产生的」子弹盖上归属戳。
// 依赖：`bullets` 是**世界级**数组（不属于任何玩家），且只有在 updateBullets 里才会被过滤掉，
// 所以在本函数同步执行期间，数组只会追加 —— 按长度差打戳是可靠的。
function stampNewBullets(p, from) {
  for (let i = from; i < bullets.length; i++) bullets[i].owner = p.id;
}

// 玩家侧相位一（V1.37）：小队移动、护盾、主动技能、开火 —— 全程跑在「这个玩家」的全局上下文里
function updatePlayerCombat(p, dt) {
  const prev = activePlayer;
  switchTo(p);
  const bulletFrom = bullets.length;
  try {
    updateSquad(dt);
    updateSoldiers(dt);
    updateShield(dt);
    if (stats.regen > 0) healSquad(stats.regen * dt);   // 回血宝珠：每秒回血
    updateSkills(dt);
    updateWeapons(dt);
  } finally {
    stampNewBullets(p, bulletFrom);
    switchTo(prev);
  }
}

// 玩家侧相位二（V1.37）：召唤物与宠物。刻意放在「延迟落雷」之后 ——
// 单人局的执行顺序是 weapons → pendingLightning → summons → pet，拆两个相位才能保持一致。
function updatePlayerCompanions(p, dt) {
  const prev = activePlayer;
  switchTo(p);
  const bulletFrom = bullets.length;
  const fxFrom = petFx.length;
  try {
    updateSummons(dt);
    updatePet(dt);
  } finally {
    stampNewBullets(p, bulletFrom);
    // 宠物持续技（喷火 / 熔岩 / 领域…）会在之后的世界相位里逐帧结算伤害，
    // 所以条目本身要记住是谁的 —— 见 updatePetFx 里的 withCtx。
    for (let i = fxFrom; i < petFx.length; i++) petFx[i].owner = p.id;
    switchTo(prev);
  }
}

function update(dt) {
  if (!isLive()) return;                 // 非对局状态（菜单 / 暂停 / 升级 / 首领奖励 / 商人 / 结算）世界一律静止
  // V1.37 客机：**不跑模拟** —— 世界完全由房主的快照驱动，这里只把快照贴回全局
  if (netRole === 'guest') { netGuestTick(dt); return; }
  if (resumeT > 0) { resumeT = Math.max(0, resumeT - dt); return; }   // 读秒期间世界静止
  if (devInvuln) squad.invulnT = Math.max(squad.invulnT, 0.2);   // 调试：无敌（复用受伤免疫）
  gameTime += dt;
  // 玩家侧（V1.37）：单人局这里只循环一次，与改动前完全等价；双人时每名玩家各跑一遍自己的 build。
  for (const p of players) updatePlayerCombat(p, dt);
  updateCamera();               // 镜头只跟本机玩家（玩家循环结束后全局已切回本机）
  updatePendingLightning(dt);   // 延迟落雷
  for (const p of players) updatePlayerCompanions(p, dt);
  updatePetFx(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateBombs(dt);              // 自爆怪的延迟引信（V1.31）
  updateBossDrop(dt);           // 首王砸落读秒（V1.31）
  updateDps();                  // 实时 DPS 窗口滚动（V1.31 调试）
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
  // V1.37：双人时**两人都倒**才结算；单人局等价于原来的 soldiers.length === 0
  if (!players.some(p => p.soldiers.length)) gameOver();
}

// 把 rAF 的原始帧间隔（毫秒）换算成逻辑 dt（秒），钳到 [0, 0.05]（V1.35 修正）：
//   startGame / resumeGame / applyOrientation 会把 last 设成 performance.now()，而 rAF 回调拿到的是
//   **本帧开始**的时间戳 —— 若这一帧中途执行了长任务（测试台的同步检查、卡顿），now 就可能小于 last，
//   raw 变负数。负 dt 会让所有 `x -= dt` 的计时器倒着走（实测：落雷特效 life 反涨到 maxLife 的 1.4 倍，
//   画出负半径的地面环，直接抛 IndexSizeError 打断这一帧的渲染）。上限则是原有的「单帧最多推进 50ms」。
function frameDt(raw) { return Math.max(0, Math.min(0.05, raw / 1000)); }

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
    dt = frameDt(raw);
  }

  // 贯穿命中顿帧：极短地冻结逻辑（渲染照常），强化打击感
  if (hitStop > 0) hitStop = Math.max(0, hitStop - dt);
  else update(dt * devSpeed);          // 调试：devSpeed 为游戏速度倍率（默认 1，不改变正常玩法）
  if (netRole === 'guest' && isLive()) netSendInput();   // V1.37 客机：把移动意图上行给房主（非对局态不必发）
  render();
  devTickHud(raw / 1000);              // 调试面板：刷新读数 / 信息浮层 / 入口按钮显隐

  // 自动攻击目标按钮（V1.31）：显隐已由状态机（setState）负责，这里只同步档位文案
  screenAimLabel();
  renderSkillButtons();
}

// 只在文案变了才写 DOM，避免每帧触发重排
let lastAimLabel = '';
function screenAimLabel() {
  const aimBtn = document.getElementById('btn-aim');
  if (!aimBtn || aimBtn.classList.contains('hidden')) return;
  const label = aimModeName();
  if (label !== lastAimLabel) { aimBtn.textContent = label; lastAimLabel = label; }
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
  document.getElementById('pause-stats').textContent =
    `${modeDef(runMode).name}模式 · 对局时长 ${fmtTime(gameTime)} · 波次 ${wave}`
    + (runMode === 'standard' ? `/${STANDARD_WAVES}` : '')
    + ` · 击杀 ${kills}` +
    (bossKills > 0 ? ` · 经验 +${Math.round((xpScale() - 1) * 100)}% · 出怪 +${Math.round((spawnScale() - 1) * 100)}%` : '');
  learnTag('暂停 / 继续（Esc / P）');
  guideAdvance('pause');       // 首局引导第 4 步
  setState('paused');
}

function resumeGame() {
  if (state !== 'paused') return;
  setState('playing');
  resumeT = RESUME_COUNTDOWN;     // 先读 3 秒，读完才恢复世界（V1.31）
  last = performance.now();
  fpsAccum = 0;
}

// 继续游戏的倒计时：暗幕 + 居中大数字（每秒跳一次，数字带一次缩放脉冲）
function drawResumeCountdown() {
  if (!isLive() || resumeT <= 0) return;
  const n = Math.ceil(resumeT);
  const frac = 1 - (resumeT - Math.floor(resumeT));      // 0 → 1
  ctx.save();
  ctx.fillStyle = 'rgba(6,20,26,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.35 + 0.65 * (1 - frac);
  ctx.fillStyle = activeTheme().accent;
  ctx.font = `bold ${Math.round(76 + 18 * (1 - frac))}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(String(n), W / 2, H / 2);
  ctx.globalAlpha = 1;
  ctx.font = '13px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#cfe3d8';
  ctx.fillText('准备', W / 2, H / 2 + 68);
  ctx.restore();
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

// 头像可选的怪物（V1.34）：复用已有的怪物模型，每个只给一个中文短名 + 描边色块。
// 树怪 treant 不在列表里 —— 它有自己的绘制函数 `drawTreant()`，不吃 context 参数。
const AVATAR_MONSTERS = [
  { id: 'grunt', name: '杂兵' },
  { id: 'fast', name: '疾行怪' },
  { id: 'ranged', name: '远程怪' },
  { id: 'bomber', name: '自爆怪' },
  { id: 'hunter', name: '猎人' },
  { id: 'healer', name: '治疗兵' },
  { id: 'shielder', name: '护盾兵' },
  { id: 'summoner', name: '召唤兵' },
  { id: 'elite', name: '精英' },
  { id: 'boss', name: '首领' },
].map(m => ({ id: m.id, name: m.name, color: ENEMY_TYPES[m.id].color }));
const AVATAR_ITEMS = [{ name: '角色外观' }].concat(AVATAR_MONSTERS);
function avatarIndex(av) {
  if (!av || av.kind !== 'monster') return 0;
  const i = AVATAR_MONSTERS.findIndex(m => m.id === av.type);
  return i < 0 ? 0 : i + 1;
}
function avatarAt(i) {
  return i > 0 && AVATAR_MONSTERS[i - 1] ? { kind: 'monster', type: AVATAR_MONSTERS[i - 1].id } : { kind: 'char' };
}
// 头像上的短标签（好友列表里显示「用什么当的头像」）
function avatarLabel(av) {
  const i = avatarIndex(av);
  return AVATAR_ITEMS[i] ? AVATAR_ITEMS[i].name : '角色外观';
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
  const av = avatarIndex(meta.avatar);
  const avChips = AVATAR_ITEMS.map((it, i) => {
    const sw = it.color ? `<span class="swatch" style="background:${it.color}"></span>` : '';
    return `<button class="chip${av === i ? ' active' : ''}" data-group="avatar" data-index="${i}">${sw}${it.name}</button>`;
  }).join('');
  document.getElementById('char-opts').innerHTML =
    group('物种', 'species', CHAR_SPECIES) +
    group('毛色', 'fur', CHAR_FUR) +
    group('服装', 'cloth', CHAR_CLOTH) +
    group('头饰', 'hat', CHAR_HAT) +
    group('眼睛', 'eye', CHAR_EYE) +
    group('体型', 'size', CHAR_SIZE) +
    `<div class="opt-group"><div class="opt-name">头像</div>
       <div class="avatar-pick">
         <div class="avatar-slot" id="avatar-preview"></div>
         <div class="chip-row">${avChips}</div>
       </div>
     </div>`;
  // 选中的头像长什么样，直接画出来（chip 上只有色块，看不出模型细节）
  const slot = document.getElementById('avatar-preview');
  if (slot) slot.appendChild(avatarCanvasOf(72, meta.avatar, meta.character));
}

// 角色 / 显示设置的选择（事件委托）
document.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const g = chip.dataset.group;
  if (g === 'char') {
    meta.character[chip.dataset.key] = Number(chip.dataset.index);
  } else if (g === 'avatar') {
    meta.avatar = avatarAt(Number(chip.dataset.index));   // V1.34：头像只存「用哪种模型」
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
  last = performance.now();
  fpsAccum = 0;
  setState('playing', { clean: true });
}

// 通关（V1.32）：标准模式打完第 20 波。给一个明显的结算演出，然后走共用结算面板。
function winRun() {
  if (state !== 'playing') return;
  showBanner(`第 ${STANDARD_WAVES} 波完成 · 通关！`, 2.6);
  sfxLevelup();
  shake = Math.min(12, shake + 6);
  spawnParticles(squad.x, squad.y, '#ffe066', 40);
  gameOver(true);
}

function gameOver(won) {
  stopMusic();
  const win = !!won;
  if (win) meta.standardCleared = true;   // 通关标准模式 → 开放无尽模式
  meta.coins += Math.round(runCoins);    // 装备金币加成会带小数，结算时取整
  // 通关那一帧波次已经推进到 21，成绩按「实际打完的波数」上报，不给排行榜白算一波
  const cleared = win ? STANDARD_WAVES : wave;
  if (cleared > meta.bestWave) meta.bestWave = cleared;
  submitScore(cleared, gameTime);   // 上报本局成绩（只增不减与合理性校验由服务端保证）
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
  renderGameOverPanel({ win, wave, kills, level, time: gameTime, coins: Math.round(runCoins), petText, causeKey: lastHurt });
  setState('gameover');     // 数字填好后再切状态，避免闪一下空结算面板
  // 双人（V1.37）：把结果下发给客机 —— 客机不跑模拟，没有这一步它只会停在冻结的战场上。
  // **账号结算只在房主这一侧做**（金币 / 成绩 / 宠物熟练度都是房主那份数据）。
  if (netRole === 'host') {
    const foe = players[1];
    netSend('run:end', {
      won: win, wave: cleared, kills, level, time: gameTime, coins: Math.round(runCoins),
      cause: lastHurt || '',                     // 房主自己的阵亡原因
      peerCause: (foe && foe.lastHurt) || '',    // 客机自己的（扣血按 owner 记在各人账上，见 damageSoldier）
    });
  }
}

// 结算页的统一渲染（房主侧传实测数据；客机侧用房主下发的数据，`fromNet: true`）
//   阵亡原因：房主侧取最后一次扣到血的来源（`lastHurt`）；若本局重开过 / 读档续玩导致统计为空，就说「力竭而亡」。
//   学到的机制：本局实际触发过的系统（移动 / 拾取 / 升级卡 / 首领奖励…），最多列 6 条 —— 这份统计只有房主侧有。
//   联机局的两处差异：金币与成绩由房主那侧结算（客机不重复结算）；出口只留「回到大厅」（「再来一局」要房主在房间里重新开局）。
function renderGameOverPanel(res) {
  const win = !!res.win;
  const net = !!netRole;
  document.getElementById('go-eyebrow').textContent = win ? 'MISSION COMPLETE' : 'ADVENTURE PAUSED';
  document.getElementById('go-title').textContent = win ? '通关！' : '冒险暂告一段落';
  document.getElementById('go-stats').textContent =
    `波次 ${res.wave} · 击杀 ${res.kills} · 等级 ${res.level} · 时长 ${fmtTime(res.time)}${res.petText || ''}`
    + (win ? `（标准模式 ${STANDARD_WAVES} 波全清，无尽模式已开放）` : '');
  const causeEl = document.getElementById('go-cause');
  if (win) {
    causeEl.textContent = '';
    causeEl.classList.add('hidden');
  } else {
    causeEl.classList.remove('hidden');
    const label = (HURT_CAUSES[res.causeKey] || {}).kill || '力竭而亡';
    // 再把「扣血最多」的那一类附上，避免玩家只看到致死一击、看不到主要压力来源（客机没有这份统计）
    const top = Object.entries(hurtBy).sort((a, b) => b[1] - a[1])[0];
    const extra = (!res.fromNet && top && top[0] !== res.causeKey && HURT_CAUSES[top[0]])
      ? ` · 本局掉血主要来自 ${HURT_CAUSES[top[0]].from}`
      : '';
    causeEl.textContent = `阵亡原因：${label}${extra}`;
  }
  const box = document.getElementById('go-learned');
  const learned = res.fromNet ? [] : runLearned;
  if (!learned.length) {
    box.innerHTML = '';
    box.classList.add('hidden');
  } else {
    box.classList.remove('hidden');
    const list = learned.slice(0, 6).map(t => `<li>${t}</li>`).join('');
    const more = learned.length > 6 ? `<p class="dim">还有 ${learned.length - 6} 条机制在下一局里等你发现</p>` : '';
    box.innerHTML = `<div class="go-learned-title">本局学到的机制</div><ul class="go-learned-list">${list}</ul>${more}`;
  }
  const coinsLine = document.getElementById('go-coins-line');
  if (coinsLine) {
    if (res.fromNet) coinsLine.textContent = '联机局：本局金币与成绩由房主那一侧结算';
    else coinsLine.innerHTML = `本局获得金币：<span id="go-coins">${Math.round(res.coins)}</span>`;
  }
  const restart = document.getElementById('btn-restart');
  const change = document.getElementById('btn-change');
  if (net) {
    restart.textContent = '回到大厅';
    change.classList.add('hidden');
  } else {
    restart.textContent = '再来一局';
    change.textContent = '返回主菜单';
    change.classList.remove('hidden');
  }
}

// ==================== 主菜单 ====================
function isUnlocked(cat, id) { return meta.unlocked[cat].includes(id); }

// 轻提示（V1.34）：底部浮出、2 秒后自动收起。msg 允许带 HTML（金币用 .t-gold 高亮）
let toastTimer = 0;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); toastTimer = 0; }, 2000);
}

// 金币不足的统一提示（解锁 / 洗练 / 孵蛋共用）：说清「差多少 + 需要多少 + 现在多少」
function toastNeedCoins(need) {
  const have = Math.floor(meta.coins);
  const lack = Math.max(0, Math.ceil(need - meta.coins));
  showToast(`金币不足：还差 <span class="t-gold">${lack}🪙</span>（需要 ${need} · 现有 ${have}）`);
}

function equip(cat, key, id) {
  meta.equipped[key] = id;
  saveMeta();
  renderMenu(true);          // 就地刷新：换装后留在候选列表
}

function unlock(cat, key, id, cost) {
  if (meta.coins < cost) { toastNeedCoins(cost); return; }
  meta.coins -= cost;
  meta.unlocked[cat].push(id);
  meta.equipped[key] = id;
  if (gearDef(id)) rollGearAffixes(id);        // 装备：解锁那一刻 roll 一次词条（V1.29）
  saveMeta();
  renderMenu(true);          // 就地刷新：解锁后留在候选列表（可直接接着点铁砧）
}

// 词条明细行（装备台列表只读、铁砧页带锁定按钮）
function gearAffixLines(id, withLock) {
  const g = gearState(id);
  return g.affixes.map((a, i) => {
    const tier = affixTierText(a);
    const on = !!g.lock[i];
    return `<div class="gear-affix${on ? ' on' : ''}">`
      + `<span class="gear-affix-name">${affixText(a)}</span>`
      + (tier ? `<span class="gear-affix-tier">${tier}</span>` : '')
      + (withLock ? `<button class="item-btn gear-lock${on ? ' on' : ''}" data-act="lock" data-id="${id}" data-i="${i}">${on ? '已锁定' : '锁定'}</button>` : '')
      + `</div>`;
  }).join('');
}

// 装备候选行（四个槽位通用）：主属性 + 词条进度 + 解锁 / 装备 / 进铁砧
function renderGearRows(containerId, cat, defs, key) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = '';
  Object.entries(defs).forEach(([id, def]) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const unlocked = isUnlocked(cat, id);
    const equipped = meta.equipped[key] === id;
    let affixLine = '';
    if (def.affixCount > 0) {
      if (!unlocked) {
        affixLine = `<div class="item-desc">词条：解锁后随机 roll（最多 ${GEAR_MAX_AFFIX} 条，靠洗练逐条解锁）</div>`;
      } else {
        const g = gearState(id);
        const n = g.affixes.length;
        const need = n === 1 ? GEAR_UNLOCK2 : GEAR_UNLOCK3;
        const progress = n >= GEAR_MAX_AFFIX
          ? `词条 ${n}/${GEAR_MAX_AFFIX}（已满）· 累计洗练 ${g.rolls} 次`
          : `词条 ${n}/${GEAR_MAX_AFFIX} · 再洗练 ${Math.max(0, need - g.rolls)} 次解锁第 ${n + 1} 条（累计 ${g.rolls}）`;
        affixLine = `<div class="item-desc">${progress}</div><div class="gear-affixes">${gearAffixLines(id, false)}</div>`;
      }
    }
    let btns = '';
    if (equipped) {
      btns = `<button class="item-btn equipped" disabled>已装备</button>`;
    } else if (unlocked) {
      btns = `<button class="item-btn" data-act="equip" data-cat="${cat}" data-key="${key}" data-id="${id}">装备</button>`;
    } else {
      const afford = meta.coins >= def.cost;
      btns = `<button class="item-btn${afford ? '' : ' locked'}" data-act="unlock" data-cat="${cat}" data-key="${key}" data-id="${id}" data-cost="${def.cost}">解锁 ${def.cost}🪙</button>`;
    }
    if (unlocked && def.affixCount > 0) {
      btns += `<button class="item-btn gear-anvil-btn" data-nav="anvil" data-id="${id}">${ANVIL_ICON}铁砧</button>`;
    }
    row.innerHTML = `<div class="item-info"><div class="item-name">${def.name}</div><div class="item-desc">${def.desc}</div>${affixLine}</div><div class="item-btns">${btns}</div>`;
    box.appendChild(row);
  });
}

// ==================== 装备页（V1.35：装备台 → 挑选装备 → 铁砧洗练 三级视图） ====================
// 与首页「你的冒险者」同一套实时渲染：中间站人，两侧四个空栏位，点栏位进候选列表，
// 候选里点「铁砧」进入词条洗练（上方装备特写 + 下方洗练面板）。
let equipLv = 'stage';         // stage | list | anvil
let equipSelSlot = 'weapon';
let equipSelId = null;         // 铁砧页正在洗的装备 id
const EQUIP_BACK_TO = { list: 'stage', anvil: 'list' };
const SHOP_KEY_OF_SLOT = { weapon: 'weapons', armor: 'armor', trinket1: 'trinket', trinket2: 'trinket' };

// 栏位 / 铁砧图标（内联 SVG，跟着文字色走）
const GEAR_SLOT_ICON = {
  weapon: '<svg viewBox="0 0 24 24"><path d="M14.6 3.4 20.6 9.4l-8.9 8.9-1.7-1.7-3 3-3.4-3.4 3-3-1.6-1.6z"/></svg>',
  armor: '<svg viewBox="0 0 24 24"><path d="M12 3l7 2.8V12c0 4.4-2.9 7.6-7 9-4.1-1.4-7-4.6-7-9V5.8z"/></svg>',
  trinket: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.6" r="4.6"/><path d="M9.7 12.8 7.2 21l4.8-2.3L16.8 21l-2.5-8.2"/></svg>',
};
const ANVIL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.6h10.6c2.6 0 4.7-1 5.7-2.9.4 2.8-.9 5.6-3.4 6.6h-2.2v1.6h2.2v1.8H6.7v-1.8h2.3v-1.6H3z"/><path d="M8.6 19.4h6.8"/></svg>';

// 装备台上的一个栏位：图标 + 槽位名 + 已装备的名字 + 词条进度
function gearSlotCard(slot) {
  const id = meta.equipped[slot];
  const def = GEAR_DEFS[slot][id];
  const ico = slot === 'weapon' ? GEAR_SLOT_ICON.weapon : (slot === 'armor' ? GEAR_SLOT_ICON.armor : GEAR_SLOT_ICON.trinket);
  const n = def ? gearAffixes(id).length : 0;
  return `<button class="gear-slot${def ? '' : ' empty'}" data-nav="slot" data-slot="${slot}" type="button">`
    + `<span class="gear-slot-ico">${ico}</span>`
    + `<span class="gear-slot-kind">${GEAR_SLOT_NAME[slot]}</span>`
    + `<span class="gear-slot-item">${def ? def.name : '空'}</span>`
    + (def && def.affixCount ? `<span class="gear-slot-affix">词条 ${n}/${GEAR_MAX_AFFIX}</span>` : '')
    + `</button>`;
}

function renderEquipPage() {
  const body = document.getElementById('equip-body');
  const title = document.getElementById('equip-title');
  if (!body) return;
  if (!GEAR_SLOTS.includes(equipSelSlot)) equipSelSlot = GEAR_SLOTS[0];
  const anvilDef = (equipLv === 'anvil' && equipSelId) ? gearDef(equipSelId) : null;

  if (equipLv === 'anvil' && anvilDef) {
    if (title) title.textContent = `装备 · ${anvilDef.name}`;
    body.innerHTML = gearAnvilHtml(equipSelId, anvilDef);
  } else if (equipLv === 'list') {
    if (title) title.textContent = `装备 · ${GEAR_SLOT_NAME[equipSelSlot]}`;
    body.innerHTML = `<div class="gear-list-head"><strong>${GEAR_SLOT_NAME[equipSelSlot]}</strong>`
      + `<span class="dim">已解锁的装备可以点「铁砧」洗练词条</span></div><div id="gear-list"></div>`;
    renderGearRows('gear-list', GEAR_CAT[equipSelSlot], SHOP[SHOP_KEY_OF_SLOT[equipSelSlot]], equipSelSlot);
  } else {
    equipLv = 'stage';
    if (title) title.textContent = '装备';
    body.innerHTML = `<div class="gear-stage-wrap">
        <div class="gear-side">${gearSlotCard('weapon')}${gearSlotCard('armor')}</div>
        <div class="gear-stage-mid"><canvas id="gear-stage"></canvas><span class="gear-stage-cap">${playerName()}</span></div>
        <div class="gear-side">${gearSlotCard('trinket1')}${gearSlotCard('trinket2')}</div>
      </div>
      <p class="dim gear-tip">点击两侧栏位挑选装备 · 铁砧处可洗练词条</p>`;
  }
  renderGearPreviews(performance.now());
}

// 铁砧页：上方装备特写（画布 #gear-anvil-stage）+ 下方词条洗练面板
function gearAnvilHtml(id, def) {
  const g = gearState(id);
  const cost = gearRollCost(id);
  const locked = g.lock.filter(Boolean).length;
  const afford = meta.coins >= cost;
  const n = g.affixes.length;
  const progress = n >= GEAR_MAX_AFFIX
    ? `词条 ${n}/${GEAR_MAX_AFFIX}（已满）`
    : `词条 ${n}/${GEAR_MAX_AFFIX} · 再洗练 ${Math.max(0, (n === 1 ? GEAR_UNLOCK2 : GEAR_UNLOCK3) - g.rolls)} 次解锁第 ${n + 1} 条`;
  return `<div class="gear-anvil-wrap"><canvas id="gear-anvil-stage"></canvas></div>
    <div class="gear-anvil">
      <div class="anvil-head">
        <span class="anvil-ico-wrap">${ANVIL_ICON}</span>
        <div class="item-info"><div class="item-name">${def.name}</div><div class="item-desc">${def.desc}</div></div>
      </div>
      <div class="item-desc">${progress} · 累计洗练 ${g.rolls} 次 · 当前 ${meta.coins}🪙</div>
      <div class="gear-affixes">${gearAffixLines(id, true)}</div>
      <button class="item-btn${afford ? '' : ' locked'} gear-refine" data-act="refine" data-id="${id}"${afford ? '' : ' disabled'}>洗练 ${cost}🪙${locked ? ` · 锁 ${locked} 条` : ''}</button>
      <p class="dim gear-tip">洗练会重 roll 未锁定的词条；每锁定 1 条，费用翻倍</p>
    </div>`;
}

// 宠物养成面板：抽蛋 / 等级熟练度 / 升星词条 / 天赋加点
// 宠物普攻的元素特性说明
const PET_ELEM_LABEL = {
  fire: '火焰：命中点燃',
  lightning: '雷电：弹跳 2 个目标、概率麻痹',
  ice: '冰霜：命中减速、概率冻结',
};

// 技能一行摘要（含冷却）
function petSkillLine(sk) {
  const bits = [`CD ${sk.cd}s`];
  if (sk.dmg) bits.push(`伤害 ${sk.dmg}`);
  if (sk.burnDps) bits.push(`点燃 ${sk.burnDps}/s`);
  if (sk.r) bits.push(`半径 ${sk.r}`);
  if (sk.dur) bits.push(`持续 ${sk.dur}s`);
  if (sk.freezeTime) bits.push(`冻结 ${sk.freezeTime}s`);
  if (sk.vuln) bits.push(`易伤 +${Math.round(sk.vuln * 100)}%`);
  return bits.join(' · ');
}

// 宠物蛋列表（孵化视图）：每颗蛋一行，点「孵化」打开开蛋界面
function renderEggRows(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = '';
  Object.entries(EGGS).forEach(([id, egg]) => {
    const afford = meta.coins >= egg.cost;
    const own = egg.pet && isUnlocked('pets', egg.pet);
    let extra = '';
    if (egg.pet) {
      const d = petDev(egg.pet);
      extra = own
        ? `（已拥有：只给${PET_ENERGY[egg.pet]}，当前 ${d.energy}）`
        : `（${PET_ENERGY[egg.pet]} ${d.energy}/${PET_ENERGY_NEED}）`;
    }
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `<div class="item-info"><div class="item-name">${egg.name}</div><div class="item-desc">${egg.desc}${extra}</div></div>
      <button class="item-btn${afford ? '' : ' locked'}" data-act="egg" data-egg="${id}"${afford ? '' : ' disabled'}>孵化 ${egg.cost}🪙</button>`;
    box.appendChild(row);
  });
}

// ==================== 宠物页（V1.35：宠物台 → 挑选宠物 → 铁砧养成 三级视图） ====================
let petLv = 'stage';        // stage | list | anvil | egg
const PET_BACK_TO = { list: 'stage', anvil: 'list', egg: 'stage' };

const PET_SLOT_ICON = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="13.6" rx="5.6" ry="7.4"/><circle cx="5.6" cy="8" r="2.6"/><circle cx="18.4" cy="8" r="2.6"/></svg>';
const EGG_SLOT_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3c3.6 0 6.4 4.6 6.4 8.9 0 4-2.9 7.1-6.4 7.1s-6.4-3.1-6.4-7.1C5.6 7.6 8.4 3 12 3z"/><path d="M9.4 12.4l2.6 2.4 2.6-2.4"/></svg>';

// 宠物台上的两个栏位：出战宠物 / 孵化龙蛋
function petSlotCard() {
  const id = meta.equipped.pet;
  const def = PET_DEFS[id];
  return `<button class="gear-slot${def ? '' : ' empty'}" data-nav="list" type="button">`
    + `<span class="gear-slot-ico">${PET_SLOT_ICON}</span>`
    + `<span class="gear-slot-kind">出战宠物</span>`
    + `<span class="gear-slot-item">${def ? def.name : '未出战'}</span>`
    + (def ? `<span class="gear-slot-affix">Lv.${petDev(id).lv} · ${'★'.repeat(petDev(id).star) || '☆'}</span>` : '')
    + `</button>`;
}

function petEggCard() {
  return `<button class="gear-slot" data-nav="egg" type="button">`
    + `<span class="gear-slot-ico">${EGG_SLOT_ICON}</span>`
    + `<span class="gear-slot-kind">龙蛋</span>`
    + `<span class="gear-slot-item">孵化</span>`
    + `</button>`;
}

// 宠物选择卡（复用 .pet-slot 样式：小头像 + 名字 + 等级 / 星级 / 阶段）
function petSelectCards(allIds) {
  return allIds.map(id => {
    const own = isUnlocked('pets', id);
    const dd = petDev(id);
    const st = petStage(dd);
    const cls = ['pet-slot'];
    if (id === petPreviewSel) cls.push('cur');
    if (meta.equipped.pet === id) cls.push('on');
    if (!own) cls.push('locked');
    const sub = own ? `Lv.${dd.lv} · ${'★'.repeat(dd.star)}` : '未合成';
    return `<button class="${cls.join(' ')}" data-nav="pet" data-id="${id}" type="button">`
      + `<canvas class="pet-slot-face" data-pet="${id}"></canvas>`
      + `<span class="pet-slot-name">${PET_DEFS[id].name}</span>`
      + `<span class="pet-slot-sub">${sub}</span>`
      + `<span class="pet-slot-stage">${own ? PET_STAGE_NAME[st] : '—'}</span>`
      + (meta.equipped.pet === id ? '<span class="pet-slot-on">出战</span>' : '')
      + `</button>`;
  }).join('');
}

// 小头像：一次性静态绘制（不参与每帧刷新，故这里手动画一次）
function paintPetFaces(root) {
  root.querySelectorAll('canvas.pet-slot-face').forEach(cv => {
    const id = cv.dataset.pet;
    const dpr = canvasDpr();
    cv.width = Math.round(60 * dpr);
    cv.height = Math.round(60 * dpr);
    const cc = cv.getContext('2d');
    cc.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!isUnlocked('pets', id)) cc.globalAlpha = 0.32;
    drawPetModel(cc, 30, 33, 11, 0.9, id, { stage: petStage(petDev(id)) });
  });
}

// 宠物台中间下方的主按钮：未合成 → 合成；已拥有 → 出战 / 不出战 + 养成入口
function petMainBtns(showId) {
  if (!PET_DEFS[showId]) return '';
  if (!isUnlocked('pets', showId)) {
    const d = petDev(showId);
    const canCombine = d.energy >= PET_ENERGY_NEED;
    return `<button class="item-btn${canCombine ? '' : ' locked'}" data-act="combine" data-id="${showId}"${canCombine ? '' : ' disabled'}>合成（${PET_ENERGY_NEED} ${PET_ENERGY[showId]}）</button>`;
  }
  const isEquipped = meta.equipped.pet === showId;
  return `<button class="item-btn" data-act="equip" data-cat="pets" data-key="pet" data-id="${isEquipped ? 'none' : showId}">${isEquipped ? '不出战' : '出战'}</button>`
    + `<button class="item-btn gear-anvil-btn" data-nav="anvil" data-id="${showId}">${ANVIL_ICON}养成</button>`;
}

function renderPetDev() {
  const body = document.getElementById('pet-body');
  if (!body) return;
  const title = document.getElementById('pet-title');
  const allIds = Object.keys(PET_DEFS);
  const unlockedIds = allIds.filter(id => isUnlocked('pets', id));
  if (!petPreviewSel || !PET_DEFS[petPreviewSel]) {
    petPreviewSel = unlockedIds.includes(meta.equipped.pet) ? meta.equipped.pet : (unlockedIds[0] || allIds[0]);
  }
  if (!PET_BACK_TO[petLv]) petLv = 'stage';
  const showId = petPreviewSel;
  const def = PET_DEFS[showId];

  if (petLv === 'list') {
    if (title) title.textContent = '宠物 · 选择';
    body.innerHTML = `<div class="gear-list-head"><strong>选择宠物</strong><span class="dim">点一张卡进入它的养成面板</span></div>`
      + `<div class="pet-slots">${petSelectCards(allIds)}</div>`;
    paintPetFaces(body);
    return;
  }
  if (petLv === 'egg') {
    if (title) title.textContent = '宠物 · 孵化';
    body.innerHTML = `<div class="gear-list-head"><strong>孵化龙蛋</strong><span class="dim">买蛋当场孵化；已有宠物则只给能量碎片</span></div><div id="pet-eggs"></div>`;
    renderEggRows('pet-eggs');
    return;
  }
  if (petLv === 'anvil' && showId) {
    if (title) title.textContent = `宠物 · ${def.name}`;
    body.innerHTML = `<div class="gear-anvil-wrap"><canvas id="pet-anvil-stage"></canvas></div>`
      + `<div class="gear-anvil">${petAnvilInner(showId)}</div>`;
    renderPetPreviews(performance.now());
    return;
  }

  petLv = 'stage';
  if (title) title.textContent = '宠物';
  const d = petDev(showId);
  const cap = isUnlocked('pets', showId)
    ? `${def.name} · Lv.${d.lv} · ${PET_STAGE_NAME[petStage(d)]}`
    : `${def.name} · 未合成`;
  body.innerHTML = `<div class="gear-stage-wrap">
      <div class="gear-side">${petSlotCard()}</div>
      <div class="gear-stage-mid"><canvas id="pet-stage"></canvas><span class="gear-stage-cap">${cap}</span></div>
      <div class="gear-side">${petEggCard()}</div>
    </div>
    <div class="pet-stage-actions">${petMainBtns(showId)}</div>
    <p class="dim gear-tip">点击两侧栏位挑宠物 / 开蛋 · 「养成」里加点天赋、升星</p>`;
  renderPetPreviews(performance.now());
}

// 铁砧页（宠物养成）：能量碎片 / 熟练度 / 词条 / 天赋树 / 升星
function petAnvilInner(showId) {
  const def = PET_DEFS[showId];
  const d = petDev(showId);
  const owned = isUnlocked('pets', showId);
  const en = PET_ENERGY[showId];
  const free = petTalentFree(d);
  const maxed = d.lv >= PET_DEV_CFG.lvMax;
  const need = maxed ? 0 : petExpNeed(d.lv);
  const pct = need ? Math.min(100, (d.exp / need) * 100) : 100;
  const affixText = d.affixes.length
    ? d.affixes.map(a => `${PET_AFFIXES[a].name}（${PET_AFFIXES[a].desc}）`).join('、')
    : '无（3★ / 5★ 各解锁 1 个）';
  // 能量碎片：未合成时是「合成进度」，已拥有时是「升星材料」
  const ePct = owned ? 100 : Math.min(100, (d.energy / PET_ENERGY_NEED) * 100);
  const eText = owned
    ? `${en} ${d.energy}（升星每星 ${PET_DEV_CFG.shardPerStar}）`
    : `${en} ${d.energy}/${PET_ENERGY_NEED}${d.energy >= PET_ENERGY_NEED ? '（可合成！）' : ''}`;
  let html = `<div class="item-name">${def.name} <span class="dim">${owned ? `Lv.${d.lv}${maxed ? '（满级）' : ''} · ${'★'.repeat(d.star)} · ${PET_STAGE_NAME[petStage(d)]}` : '未合成'}</span></div>
    <div class="item-desc">普攻：${PET_ELEM_LABEL[def.elem] || ''}（每 ${def.shootInterval}s 一次）</div>
    <div class="item-desc">${eText}</div>
    <div style="margin-top:4px;height:6px;background:#222;border-radius:3px;overflow:hidden"><div style="height:100%;width:${ePct}%;background:#7fd8ff"></div></div>`;
  if (owned) {
    html += `<div class="item-desc" style="margin-top:6px">熟练度 ${Math.floor(d.exp)}/${maxed ? '—' : need}</div>
    <div style="margin-top:4px;height:6px;background:#222;border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#ffd54f"></div></div>
    <div class="item-desc" style="margin-top:6px">词条：${affixText}</div>
    <div class="item-desc">天赋点：剩余 ${free} / 共 ${petTalentTotal(d)}（每 2 级 1 点）</div>`;
  } else {
    html += `<div class="item-desc" style="margin-top:6px">攒满 ${PET_ENERGY_NEED} ${en} 就能合成它；也可以开蛋直接孵出。</div>`;
  }
  // 养成路线：基础强化 + 3 个技能节点（技能节点有等级前置，投第 1 点解锁技能）
  (PET_TREES[showId] || []).forEach(n => {
    const p = d.talents[n.id] || 0;
    const can = owned && d.lv >= (n.reqLv || 1) && p < n.max && free > 0;
    const state = !owned
      ? '<span class="dim">未合成</span>'
      : (!(d.lv >= (n.reqLv || 1))
        ? `<span class="dim">需 Lv.${n.reqLv}</span>`
        : (p <= 0 ? '<span class="dim">未专精</span>'
          : `<span style="color:#7ef07e">已专精 ${p}/3${n.skill ? ` · ${petSkillLine(n.skill)}` : ''}</span>`));
    html += `<div style="display:flex;align-items:center;gap:8px;margin-top:6px">
      <div style="flex:1;min-width:0">
        <div class="item-name">${n.name} ${p}/${n.max}</div>
        <div class="item-desc">${n.desc}</div>
        <div class="item-desc">${n.skill ? n.skill.desc + ' · ' : ''}${state}</div>
      </div>
      <button class="item-btn${can ? '' : ' locked'}" data-act="talent" data-id="${showId}" data-branch="${n.id}"${can ? '' : ' disabled'}>+</button>
    </div>`;
  });
  if (!owned) {
    const canCombine = d.energy >= PET_ENERGY_NEED;
    html += `<div style="margin-top:8px"><button class="item-btn${canCombine ? '' : ' locked'}" data-act="combine" data-id="${showId}"${canCombine ? '' : ' disabled'}>合成（${PET_ENERGY_NEED} ${en}）</button></div>`;
  } else {
    const isEquipped = meta.equipped.pet === showId;
    const canStar = d.star < PET_DEV_CFG.starMax && d.energy >= PET_DEV_CFG.shardPerStar;
    const starTip = d.star >= PET_DEV_CFG.starMax ? '已满星' : `升星（${PET_DEV_CFG.shardPerStar} ${en}）`;
    html += `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="item-btn" data-act="equip" data-cat="pets" data-key="pet" data-id="${isEquipped ? 'none' : showId}">${isEquipped ? '不出战' : '出战'}</button>
      <button class="item-btn${canStar ? '' : ' locked'}" data-act="star" data-id="${showId}"${canStar ? '' : ' disabled'}>${starTip}</button>
    </div>`;
  }
  return html;
}

// ==================== 宠物蛋孵化界面（V1.27） ====================
// 买蛋当场孵化：晃动 → 裂纹 → 爆开 → 揭晓。动画全部画在 #egg-canvas 上（与局内美术同源）。
let eggSel = 'normal';
let eggAnim = null;          // null | { phase, t, result, cracks, done }
let eggRaf = 0;

function petTypeOfEgg(id) { return (EGGS[id] || {}).pet || null; }

function eggEl(id) { return document.getElementById(id); }

function renderEggChips() {
  const box = eggEl('egg-chips');
  if (!box) return;
  box.innerHTML = Object.entries(EGGS).map(([id, egg]) => {
    const afford = meta.coins >= egg.cost;
    const own = egg.pet && isUnlocked('pets', egg.pet);
    const cls = ['egg-chip'];
    if (id === eggSel) cls.push('active');
    if (!afford) cls.push('locked');
    if (own) cls.push('owned');
    return `<button class="${cls.join(' ')}" data-egg="${id}"${afford || id === eggSel ? '' : ' disabled'}>
      <span class="egg-chip-name">${egg.name}</span><span class="egg-chip-cost">${egg.cost}🪙</span></button>`;
  }).join('');
  const coins = eggEl('egg-coins');
  if (coins) coins.textContent = meta.coins;
  const hatch = eggEl('egg-hatch');
  const egg = EGGS[eggSel];
  if (hatch && egg) {
    const afford = meta.coins >= egg.cost;
    hatch.textContent = eggAnim && eggAnim.done ? `再来一颗 ${egg.cost}🪙` : `孵化 ${egg.cost}🪙`;
    // V1.34：金币不够时不再 disable（那样点了没反应），保留 locked 外观，点一下给「金币不足」提示
    hatch.classList.toggle('locked', !afford);
  }
  const nm = eggEl('egg-name');
  const ds = eggEl('egg-desc');
  if (nm && egg && !(eggAnim && eggAnim.done)) {
    nm.className = 'egg-readout-name';
    nm.textContent = egg.name;
    ds.textContent = egg.desc;
  }
}

function openEggHud(eggId) {
  if (EGGS[eggId]) eggSel = eggId;
  eggAnim = null;
  const ov = eggEl('egg-overlay');
  if (!ov) return;
  ov.classList.remove('hidden');
  renderEggChips();
  const nm = eggEl('egg-name');
  const ds = eggEl('egg-desc');
  if (nm) { nm.className = 'egg-readout-name'; nm.textContent = EGGS[eggSel].name; }
  if (ds) ds.textContent = EGGS[eggSel].desc;
  if (!eggRaf) eggRaf = requestAnimationFrame(eggFrame);
}

function closeEggHud() {
  const ov = eggEl('egg-overlay');
  if (ov) ov.classList.add('hidden');
  if (eggRaf) { cancelAnimationFrame(eggRaf); eggRaf = 0; }
  eggAnim = null;
  renderMenu(true);      // 就地在宠物页刷新（从孵化列表进来的，关掉还留在孵化列表）
}

// 开蛋：扣金币 + 结算 + 起动画
function startHatch() {
  const egg = EGGS[eggSel];
  if (!egg) return;
  if (eggAnim && !eggAnim.done) return;                 // 动画中不重复触发
  const res = hatchEgg(eggSel);
  if (!res) return;
  if (!res.ok) { toastNeedCoins(egg.cost); renderEggChips(); return; }            // 金币不够
  eggAnim = { phase: 'shake', t: 0, start: performance.now() / 1000, result: res, cracks: 0, boomed: false, done: false };
  sfxHit();
  renderEggChips();
}

// 动画阶段按时长推进（用绝对时间，不累计帧间隔：切后台再回来不会卡在半路）
const EGG_SHAKE = 1.0, EGG_BURST = 0.45;

function finishEggAnim() {
  eggAnim.phase = 'reveal';
  eggAnim.done = true;
  sfxLevelup();
  const r = eggAnim.result;
  const nm = eggEl('egg-name');
  const ds = eggEl('egg-desc');
  if (nm) {
    nm.className = 'egg-readout-name ' + (r.newPet ? 'new' : 'dup');
    nm.textContent = r.newPet ? `新宠物 · ${r.name}` : `${r.energyName} +${r.energy}`;
  }
  if (ds) {
    ds.textContent = r.newPet
      ? '已加入宠物列表，可在上方选择出战。'
      : (isUnlocked('pets', r.pet)
        ? `${r.energyName} ${r.total}，可用于升星。`
        : `${r.energyName} ${r.total}/${r.need}，攒满可合成${r.name}。`);
  }
  renderEggChips();
}

function eggFrame(ts) {
  eggRaf = requestAnimationFrame(eggFrame);
  const cv = eggEl('egg-canvas');
  if (!cv || !cv.getContext) return;
  const ov = eggEl('egg-overlay');
  if (!ov || ov.classList.contains('hidden')) return;
  drawEggStage(cv, ts / 1000);
}

// 蛋与宠物都画在这块 canvas 上：晃动/裂纹/爆开 → 揭晓宠物（复用 drawPetModel）
function drawEggStage(cv, now) {
  const c = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  c.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2 + 6;

  const anim = eggAnim;
  if (anim) {
    anim.t = now - anim.start;
    if (!anim.done) {
      if (anim.t < EGG_SHAKE) {
        anim.phase = 'shake';
        anim.cracks = Math.min(3, Math.floor(anim.t / (EGG_SHAKE / 3.2)));
      } else if (anim.t < EGG_SHAKE + EGG_BURST) {
        anim.phase = 'burst';
        if (!anim.boomed) { anim.boomed = true; sfxExplode(); }
      } else {
        finishEggAnim();
      }
    }
  }
  const shaking = anim && anim.phase === 'shake';
  const burst = anim && anim.phase === 'burst';
  const reveal = anim && anim.phase === 'reveal';
  const bt = burst ? (anim.t - EGG_SHAKE) / EGG_BURST : 0;      // 爆开进度 0→1
  const rt = reveal ? Math.min(1, (anim.t - EGG_SHAKE - EGG_BURST) / 0.5) : 0;

  // 蛋
  if (!reveal) {
    const wob = shaking ? Math.sin(anim.t * 34) * (0.06 + anim.t * 0.16) : Math.sin(now * 2.2) * 0.03;
    const hop = shaking ? Math.abs(Math.sin(anim.t * 17)) * 6 * (0.3 + anim.t) : Math.sin(now * 2.6) * 2;
    c.save();
    c.translate(cx, cy - hop);
    c.rotate(wob);
    drawEggShape(c, 46, anim ? anim.cracks : 0);
    c.restore();
  }

  // 爆开：碎片 + 冲击环 + 白光
  if (burst || (reveal && rt < 0.5)) {
    const k = burst ? bt : rt;                                  // 0→1 的过渡量
    c.save();
    c.globalAlpha = Math.max(0, 1 - k);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 / n) * i + 0.3;
      const d = 30 + k * 150;
      c.fillStyle = i % 2 ? '#ffe6a8' : '#fff3d0';
      c.beginPath();
      c.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d - k * 30, 5 * (1 - k * 0.6), 8 * (1 - k * 0.6), a, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = `rgba(255,236,170,${0.8 * (1 - k)})`;
    c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, 30 + k * 130, 0, Math.PI * 2); c.stroke();
    if (burst) {
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, 130);
      g.addColorStop(0, `rgba(255,255,235,${0.85 * (1 - bt)})`);
      g.addColorStop(1, 'rgba(255,220,140,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(cx, cy, 130, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  // 揭晓：宠物 + 光晕
  if (reveal) {
    const pop = 0.7 + 0.3 * Math.min(1, rt * 1.6) + Math.sin(rt * Math.PI) * 0.08;
    c.save();
    c.globalAlpha = Math.min(1, rt * 1.5);
    c.translate(cx, cy - 4 - (1 - rt) * 14);
    c.scale(pop, pop);
    const elem = (anim.result || {}).elem || 'fire';
    const tint = elem === 'lightning' ? '150,225,255' : elem === 'ice' ? '150,230,255' : '255,205,120';
    const glow = c.createRadialGradient(0, 0, 0, 0, 0, 90);
    glow.addColorStop(0, `rgba(${tint},0.5)`);
    glow.addColorStop(1, `rgba(${tint},0)`);
    c.fillStyle = glow;
    c.beginPath(); c.arc(0, 0, 90, 0, Math.PI * 2); c.fill();
    drawPetModel(c, 0, 0, 34, now, anim.result.pet, {});
    c.restore();
  }
}

// 蛋壳本体：底纹 + 斑点 + 按阶段出现的裂纹
function drawEggShape(c, r, cracks) {
  const g = c.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#fdf6e6');
  g.addColorStop(0.55, '#e8dcc4');
  g.addColorStop(1, '#c9b795');
  c.fillStyle = g;
  c.strokeStyle = '#9c8a6a';
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(0, 0, r * 0.78, r, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  // 斑点
  c.fillStyle = 'rgba(160,140,105,0.35)';
  [[-0.3, -0.35], [0.32, -0.1], [-0.12, 0.34], [0.24, 0.42], [-0.4, 0.1]].forEach(([sx, sy]) => {
    c.beginPath();
    c.arc(sx * r, sy * r, r * 0.11, 0, Math.PI * 2);
    c.fill();
  });
  // 高光
  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.beginPath();
  c.ellipse(-r * 0.26, -r * 0.42, r * 0.16, r * 0.26, -0.5, 0, Math.PI * 2);
  c.fill();
  // 裂纹（按阶段逐条出现）
  const lines = [
    [[-0.1, -0.9], [0.06, -0.66], [-0.05, -0.5]],
    [[0.5, 0.2], [0.28, 0.06], [0.34, -0.12]],
    [[-0.52, 0.28], [-0.3, 0.18], [-0.34, 0.02]],
  ];
  c.strokeStyle = '#6d5c42';
  c.lineWidth = 2.4;
  for (let i = 0; i < Math.min(cracks, lines.length); i++) {
    c.beginPath();
    lines[i].forEach(([px, py], k) => k ? c.lineTo(px * r, py * r) : c.moveTo(px * r, py * r));
    c.stroke();
  }
}

document.addEventListener('click', e => {
  const chip = e.target.closest('.egg-chip');
  if (chip) {
    eggSel = chip.dataset.egg;
    eggAnim = null;
    const nm = eggEl('egg-name');
    const ds = eggEl('egg-desc');
    if (nm) { nm.className = 'egg-readout-name'; nm.textContent = EGGS[eggSel].name; }
    if (ds) ds.textContent = EGGS[eggSel].desc;
    renderEggChips();
    return;
  }
  if (e.target.closest('#egg-hatch')) { startHatch(); return; }
  if (e.target.closest('#egg-close')) { closeEggHud(); return; }
});

function renderBag() {
  const box = document.getElementById('list-bag');
  box.innerHTML = '';
  const groups = [['weapons', '武器', SHOP.weapons], ['armor', '护甲', SHOP.armor], ['trinket', '饰品', SHOP.trinket]];
  let any = false;
  groups.forEach(([cat, label, defs]) => {
    Object.entries(defs).forEach(([id, def]) => {
      if (!isUnlocked(cat, id) || id === 'none') return;
      any = true;
      const row = document.createElement('div');
      row.className = 'item-row';
      const affix = def.affixCount > 0 ? `<div class="item-desc">词条：${gearAffixText(id) || '—'}</div>` : '';
      row.innerHTML = `<div class="item-info"><div class="item-name">${def.name} <span class="dim">${label}</span></div><div class="item-desc">${def.desc}</div>${affix}</div>`;
      box.appendChild(row);
    });
  });
  if (!any) box.innerHTML = '<p class="dim">背包为空</p>';
}

// 主页的模式选择（V1.32）：标准 / 无尽；无尽要「标准模式通关」之后才可点。
function renderModePick() {
  const box = document.getElementById('mode-pick');
  if (!box) return;
  box.innerHTML = '';
  GAME_MODES.forEach(def => {
    const locked = !modeSelectable(def.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mode-chip' + (meta.mode === def.id ? ' on' : '') + (locked ? ' locked' : '');
    b.dataset.mode = def.id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', meta.mode === def.id ? 'true' : 'false');
    b.innerHTML = `<span class="mode-name">${def.name}</span>`
      + `<span class="mode-tag">${locked ? '标准通关后开放' : def.tag}</span>`;
    b.onclick = () => selectMode(def.id);
    box.appendChild(b);
  });
}

function selectMode(id) {
  if (!modeSelectable(id)) return false;      // 无尽未解锁：置灰的卡点了不生效
  if (meta.mode === id) return true;
  meta.mode = id;
  saveMeta();
  renderModePick();
  return true;
}

// keepView = 保留装备页 / 宠物页当前所在的那一层（V1.35 修复）：
//   洗练词条、锁定词条、装备 / 解锁装备都是从「三级视图」的里层发起的，
//   如果这里把 equipLv / petLv 复位到 'stage'，点一次洗练就会被弹回装备台。
function renderMenu(keepView) {
  applyTheme();
  renderThemeOptions();
  document.getElementById('btn-play').textContent = meta.run ? '继续冒险' : `开始游戏 · ${modeDef(meta.mode).name}`;
  renderModePick();
  document.getElementById('coin-count').textContent = meta.coins;
  document.getElementById('coin-count2').textContent = meta.coins;
  document.getElementById('best-wave').textContent = meta.bestWave;
  // 主页：用户名
  document.getElementById('home-user').textContent = playerName();
  renderCharOptions();
  renderDisplaySettings();
  if (!keepView) {
    equipLv = 'stage';
    petLv = 'stage';
  }
  renderEquipPage();
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

// ==================== 好友与头像（V1.34） ====================
// 好友关系存在服务端（`/api/friends`，见 api/friends.js），前端只管渲染与发起操作。
// 身份一律由令牌决定，请求体里只带「对方的用户名」。
//
// 头像：存档里只存 { kind:'char' } 或 { kind:'monster', type }，**不存图片**。
// 保存存档时把它作为公开副本同步到服务端（users.avatar），好友列表读的就是这份副本。
// 别人的 kind:'char'（= 用他自己的角色外观）我们还原不了 —— 他们的 meta 是隐私 ——
// 所以统一退回默认外观渲染，靠旁边的用户名区分是谁。
const FRIEND_LISTS = {
  incoming: { boxId: 'friend-incoming', empty: '暂无新的好友申请', acts: [{ act: 'accept', label: '同意' }, { act: 'decline', label: '拒绝', danger: true }] },
  outgoing: { boxId: 'friend-outgoing', empty: '没有等待回应的申请', acts: [{ act: 'decline', label: '撤回' }] },
  friends: { boxId: 'friend-list', empty: '还没有好友，输入用户名加一个吧', acts: [{ act: 'remove', label: '删除', danger: true }] },
};

const friendData = { friends: [], incoming: [], outgoing: [] };
let friendsOpen = false;
let friendsPollTimer = null;
const FRIENDS_POLL_MS = 10000;

function friendsAvailable() { return usesHttpStore(); }

function friendStatus(msg) {
  const el = document.getElementById('friends-status');
  if (el) el.textContent = msg;
}

// 生成一个「已经画好头像」的 canvas。size 是 CSS 边长，内部按设备像素比放大保证清晰。
function avatarCanvasOf(size, av, character) {
  const cv = document.createElement('canvas');
  cv.className = 'avatar-canvas';
  const dpr = canvasDpr();
  cv.width = Math.round(size * dpr);
  cv.height = Math.round(size * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawAvatar(c, size / 2, size / 2, size / 2, av, character, { time: 0 });
  return cv;
}

function friendsApi(action, username) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const init = { headers };
  if (action) {
    init.method = 'POST';
    init.body = JSON.stringify({ action, username });
  }
  return fetch('/api/friends', init).then(r => (r.ok ? r.json() : apiFail(r).then(e => Promise.reject(e))));
}

function applyFriends(d) {
  if (!d) return;
  friendData.friends = Array.isArray(d.friends) ? d.friends : [];
  friendData.incoming = Array.isArray(d.incoming) ? d.incoming : [];
  friendData.outgoing = Array.isArray(d.outgoing) ? d.outgoing : [];
  renderFriends();
}

function loadFriends() {
  if (!friendsAvailable()) {
    friendStatus('好友功能需要联网账号，当前是离线存档');
    renderFriends();
    return Promise.resolve(false);
  }
  return friendsApi()
    .then(d => {
      applyFriends(d);
      friendStatus('');
      loadCoopInvites();   // 房间邀请也算首页红点，跟着好友一起刷
      return true;
    })
    .catch(err => {
      if (err && err.status === 401) { sessionExpired(); return false; }
      friendStatus(`好友列表加载失败：${(err && err.message) || err}`);
      return false;
    });
}

function friendAction(action, username) {
  if (!friendsAvailable()) { friendStatus('好友功能需要联网账号'); return; }
  friendStatus('处理中…');
  friendsApi(action, username)
    .then(d => { applyFriends(d); friendStatus(''); })
    .catch(err => {
      if (err && err.status === 401) { sessionExpired(); return; }
      friendStatus((err && err.message) || '操作失败');
    });
}

// 发好友申请。双方互相申请时服务端会直接变成「已是好友」，这里跟着提示。
function addFriendFromInput() {
  const el = document.getElementById('friend-input');
  const name = ((el && el.value) || '').trim();
  if (!name) { friendStatus('请输入对方的用户名'); return; }
  if (name === currentUser) { friendStatus('不能加自己为好友'); return; }
  if (!friendsAvailable()) { friendStatus('好友功能需要联网账号'); return; }
  friendStatus('处理中…');
  friendsApi('request', name)
    .then(d => {
      applyFriends(d);
      if (el) el.value = '';
      const nowFriend = friendData.friends.some(f => f.username === name);
      friendStatus(nowFriend ? `你和 ${name} 已成为好友` : `已向 ${name} 发送好友申请`);
    })
    .catch(err => {
      if (err && err.status === 401) { sessionExpired(); return; }
      friendStatus((err && err.message) || '发送失败');
    });
}

// 好友名来自别的账号，一律 textContent 赋值，不拼 HTML。
// 外观传 defaultCharacter()：对方若用「角色外观」当头像，我们还原不出他自己的配色（meta 是隐私），
// 只能退回默认外观 —— 传 null 会落到「我自己的 meta.character」，那是错的。
function friendRowEl(row, acts) {
  const el = document.createElement('div');
  el.className = 'friend-row';
  el.appendChild(avatarCanvasOf(38, row.avatar, defaultCharacter()));
  const name = document.createElement('span');
  name.className = 'friend-name';
  name.textContent = row.username;
  el.appendChild(name);
  const box = document.createElement('span');
  box.className = 'friend-acts';
  acts.forEach(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = a.danger ? 'ghost danger' : 'ghost';
    b.dataset.friendAct = a.act;
    b.dataset.friendName = row.username;
    b.textContent = a.label;
    box.appendChild(b);
  });
  el.appendChild(box);
  return el;
}

// 首页好友入口上的红点：未处理的好友申请条数 + 收到的房间邀请条数（V1.36）
function renderFriendBadge() {
  const badge = document.getElementById('friend-badge');
  if (!badge) return;
  const n = friendData.incoming.length + coopInvites.length;
  badge.textContent = n;
  badge.classList.toggle('hidden', n === 0);
}

function renderMeAvatar() {
  const cv = document.getElementById('me-avatar');
  if (!cv) return;
  const size = 66;
  const dpr = canvasDpr();
  cv.width = Math.round(size * dpr);
  cv.height = Math.round(size * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, size, size);
  drawAvatar(c, size / 2, size / 2, size / 2, meta.avatar, meta.character, { time: 0 });
  const label = document.getElementById('me-avatar-label');
  if (label) label.textContent = `头像 · ${avatarLabel(meta.avatar)}`;
}

function renderFriends() {
  const nameEl = document.getElementById('me-name');
  if (nameEl) nameEl.textContent = playerName();
  renderMeAvatar();
  renderFriendBadge();
  Object.keys(FRIEND_LISTS).forEach(kind => {
    const cfg = FRIEND_LISTS[kind];
    const box = document.getElementById(cfg.boxId);
    if (!box) return;
    box.innerHTML = '';
    const rows = friendData[kind] || [];
    if (!rows.length) {
      const p = document.createElement('p');
      p.className = 'friend-empty';
      p.textContent = cfg.empty;
      box.appendChild(p);
      return;
    }
    rows.forEach(row => box.appendChild(friendRowEl(row, friendActsOf(kind))));
  });
}

function openFriends() {
  friendsOpen = true;
  const el = document.getElementById('friends');
  if (el) el.classList.remove('hidden');
  renderFriends();
  renderCoop();
  if (friendsAvailable()) { friendStatus('加载中…'); loadFriends(); refreshCoop(); }
  else {
    friendStatus('好友功能需要联网账号，当前是离线存档');
    coopStatusSet('合作房间需要联网账号，当前是离线存档');
  }
  startFriendsPolling();
  startCoopPolling();
}

function closeFriends() {
  friendsOpen = false;
  const el = document.getElementById('friends');
  if (el) el.classList.add('hidden');
  stopFriendsPolling();
  stopCoopPolling();
  closeChat();
  renderFriendBadge();
}

// 面板开着时低频轮询：好友通过申请 / 别人加你，不用手动刷新就能看到
function startFriendsPolling() {
  stopFriendsPolling();
  if (!friendsAvailable()) return;
  friendsPollTimer = setInterval(() => {
    if (!friendsOpen) return;
    friendsApi().then(applyFriends).catch(() => {});
  }, FRIENDS_POLL_MS);
}

function stopFriendsPolling() {
  if (friendsPollTimer) { clearInterval(friendsPollTimer); friendsPollTimer = null; }
}

// ==================== 聊天（V1.35） ====================
// 与好友 1 对 1 私聊，同样走服务端（`/api/chat`）。双击好友行打开。
// 界面里不弹大列表：只显示当前这位好友的往来消息，对方名字在标题上。
let chatPeer = null;
let chatPollTimer = null;
const CHAT_POLL_MS = 3000;

function chatStatusSet(msg) {
  const el = document.getElementById('chat-status');
  if (el) el.textContent = msg || '';
}

function chatApi(peer) {
  const headers = {};
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const qs = peer ? `?with=${encodeURIComponent(peer)}` : '';
  return fetch(`/api/chat${qs}`, { headers })
    .then(r => (r.ok ? r.json() : apiFail(r).then(e => Promise.reject(e))));
}

function chatSendApi(peer, text) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  return fetch('/api/chat', { method: 'POST', headers, body: JSON.stringify({ to: peer, text }) })
    .then(r => (r.ok ? r.json() : apiFail(r).then(e => Promise.reject(e))));
}

function chatStamp(ms) {
  const d = new Date(ms || Date.now());
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 名字来自别的账号，一律 textContent 赋值，不拼 HTML。
function renderChat(msgs) {
  const box = document.getElementById('chat-log');
  if (!box) return;
  box.innerHTML = '';
  if (!msgs || !msgs.length) {
    const p = document.createElement('p');
    p.className = 'chat-empty';
    p.textContent = '还没有消息，打个招呼吧';
    box.appendChild(p);
    return;
  }
  msgs.forEach(m => {
    const d = document.createElement('div');
    d.className = 'chat-msg ' + (m.from === currentUser ? 'me' : 'them');
    d.textContent = m.text;
    const tm = document.createElement('span');
    tm.className = 'chat-time';
    tm.textContent = chatStamp(m.t);
    d.appendChild(tm);
    box.appendChild(d);
  });
  box.scrollTop = box.scrollHeight;
}

function loadChat() {
  if (!chatPeer || !friendsAvailable()) return Promise.resolve(false);
  return chatApi(chatPeer)
    .then(d => { renderChat(d && d.messages); chatStatusSet(''); return true; })
    .catch(err => {
      if (err && err.status === 401) { sessionExpired(); return false; }
      chatStatusSet(`聊天加载失败：${(err && err.message) || err}`);
      return false;
    });
}

function openChat(username) {
  if (!username) return;
  if (!friendsAvailable()) { friendStatus('好友功能需要联网账号'); return; }
  chatPeer = username;
  const el = document.getElementById('chat');
  const title = document.getElementById('chat-title');
  if (title) title.textContent = `与 ${username} 聊天`;
  if (el) el.classList.remove('hidden');
  renderChat([]);
  chatStatusSet('加载中…');
  loadChat();
  stopChatPolling();
  chatPollTimer = setInterval(() => { if (chatPeer) loadChat(); }, CHAT_POLL_MS);
}

function closeChat() {
  chatPeer = null;
  stopChatPolling();
  const el = document.getElementById('chat');
  if (el) el.classList.add('hidden');
}

function stopChatPolling() {
  if (chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null; }
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const text = ((input && input.value) || '').trim();
  if (!chatPeer) return;
  if (!text) return;
  if (input) input.value = '';
  chatSendApi(chatPeer, text)
    .then(() => loadChat())
    .catch(err => {
      if (err && err.status === 401) { sessionExpired(); return; }
      chatStatusSet((err && err.message) || '发送失败');
    });
}

// ==================== 合作房间（V1.36） ====================
// 本轮只做「房间系统」：建房 / 邀请好友 / 输入房间码加入 / 双方就绪。
// **局内双人同步尚未实现** —— 双方都点「准备」也只是大厅里的状态位，不会真的开局。
// 房间状态存在服务端（`/api/rooms`，见 api/rooms.js），前端只管渲染与发起操作；
// 实时性用 3 秒轮询（面板开着才轮询），与好友 / 聊天同一套做法。
//
// 两个不变量，改之前先读：
//   · **一个账号同时只在一个房间里** —— 建房 / 进房前服务端会先腾出我在别处的席位；
//   · 房间码是 6 位、字母表已去掉 I / O / 0 / 1，前端只负责「去空白 + 大写」再校验。
const COOP_CODE_LEN = 6;
const COOP_CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COOP_POLL_MS = 3000;

let coopRoom = null;      // 我当前所在房间的快照；null = 不在任何房间
let coopInvites = [];     // 我收到的房间邀请
let coopPollTimer = null;
let coopUrlHandled = false;   // 邀请链接只处理一次，别每次回主页都把好友面板弹出来

function coopAvailable() { return usesHttpStore(); }

// 房间码统一「去空白 + 大写」：从聊天里粘贴过来、或手打带空格也能用
function normCoopCode(v) { return String(v || '').replace(/\s+/g, '').toUpperCase(); }
function coopCodeOk(v) {
  const s = normCoopCode(v);
  if (s.length !== COOP_CODE_LEN) return false;
  for (const ch of s) if (COOP_CODE_ALPHA.indexOf(ch) < 0) return false;
  return true;
}

function coopStatusSet(msg) {
  const el = document.getElementById('coop-status');
  if (el) el.textContent = msg || '';
}

function roomsApi(method, payload) {
  const headers = {};
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const init = { headers };
  let qs = '';
  if (method === 'POST') {
    init.method = 'POST';
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(payload || {});
  } else if (payload) {
    qs = '?' + new URLSearchParams(payload).toString();
  }
  return fetch(`/api/rooms${qs}`, init).then(r => (r.ok ? r.json() : apiFail(r).then(e => Promise.reject(e))));
}

function coopFail(err, fallback) {
  if (err && err.status === 401) { sessionExpired(); return; }
  coopStatusSet((err && err.message) || fallback);
}

function applyRoom(room) {
  coopRoom = room || null;
  renderCoop();
}

// 邀请链接：带上 ?room=<code>，对方点开就在好友面板里看到房间码
function coopInviteLink(code) {
  return `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`;
}

function coopCreate() {
  if (!coopAvailable()) { coopStatusSet('合作房间需要联网账号，当前是离线存档'); return; }
  coopStatusSet('正在生成房间码…');
  roomsApi('POST', { action: 'create' })
    .then(d => {
      applyRoom(d.room);
      coopStatusSet(`房间已创建，把房间码 ${d.room.code} 发给好友，或点「复制邀请」发链接`);
      netConnect(d.room.code, 'host');   // 提前把联机通道接好，开局时才发得出去
    })
    .catch(err => coopFail(err, '生成房间码失败'));
}

function coopJoin(code) {
  const c = normCoopCode(code);
  if (!coopCodeOk(c)) { coopStatusSet('请输入 6 位房间码'); return; }
  if (!coopAvailable()) { coopStatusSet('合作房间需要联网账号，当前是离线存档'); return; }
  coopStatusSet('正在加入房间…');
  roomsApi('POST', { action: 'join', code: c })
    .then(d => {
      applyRoom(d.room);
      coopInvites = coopInvites.filter(i => i.code !== c);
      coopStatusSet('已加入房间，等房主开局');
      // 客机也要自己接通道 —— 房主的 run:start 是靠广播发的，没连上就永远收不到
      netConnect(c, 'guest');
    })
    .catch(err => coopFail(err, '加入失败'));
}

function coopLeave() {
  if (!coopRoom) return;
  const code = coopRoom.code;
  const host = coopRoom.host === currentUser;
  coopStatusSet('正在离开房间…');
  roomsApi('POST', { action: 'leave', code })
    .then(() => { netClose(); applyRoom(null); coopStatusSet(host ? '已解散房间' : '已离开房间'); })
    .catch(err => coopFail(err, '离开失败'));
}

function coopToggleReady() {
  if (!coopRoom) return;
  const mineReady = coopRoom.host === currentUser ? coopRoom.hostReady : coopRoom.guestReady;
  roomsApi('POST', { action: 'ready', code: coopRoom.code, ready: !mineReady })
    .then(d => { applyRoom(d.room); })
    .catch(err => coopFail(err, '操作失败'));
}

// 复制邀请：优先写剪贴板（失败就退化成提示手工转发房间码，没有剪贴板 API 的浏览器同理）
function coopCopyInvite() {
  if (!coopRoom) return;
  const link = coopInviteLink(coopRoom.code);
  const manual = () => coopStatusSet(`复制失败，请手动转发房间码 ${coopRoom.code}`);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(
      () => coopStatusSet('邀请链接已复制，发给好友即可进房'),
      manual,
    );
  } else manual();
}

// 邀请好友进房：只能邀已经是好友的人，且房间还空着（服务端还会再判一次）
function coopInvite(username) {
  if (!coopRoom) { coopStatusSet('先创建或加入一个房间，再邀请好友'); return; }
  if (coopRoom.guest) { coopStatusSet('房间已经满了'); return; }
  const code = coopRoom.code;
  roomsApi('POST', { action: 'invite', code, username })
    .then(() => coopStatusSet(`已邀请 ${username} 进入房间 ${code}`))
    .catch(err => coopFail(err, '邀请失败'));
}

function coopDecline(code) {
  roomsApi('POST', { action: 'decline', code })
    .then(() => {
      coopInvites = coopInvites.filter(i => i.code !== code);
      renderCoop();
      coopStatusSet('已忽略该邀请');
    })
    .catch(err => coopFail(err, '操作失败'));
}

// 一个席位（房主 / 访客）。空席位给一句话占位，别让面板看起来是坏的。
function coopSlotEl(name, avatar, mine, ready, isHost) {
  const el = document.createElement('div');
  el.className = 'coop-slot' + (name ? '' : ' empty');
  if (!name) { el.textContent = '等待好友加入…'; return el; }
  el.appendChild(avatarCanvasOf(34, avatar, defaultCharacter()));
  const info = document.createElement('div');
  info.className = 'coop-slot-info';
  const nm = document.createElement('strong');
  nm.textContent = name + (mine ? '（我）' : '');     // 名字来自别的账号，一律 textContent
  const sub = document.createElement('span');
  sub.className = 'coop-slot-sub';
  sub.textContent = (isHost ? '房主 · ' : '') + (ready ? '已准备' : '未准备');
  info.appendChild(nm);
  info.appendChild(sub);
  el.appendChild(info);
  return el;
}

function coopInviteEl(inv) {
  const el = document.createElement('div');
  el.className = 'coop-invite';
  el.appendChild(avatarCanvasOf(30, inv.avatar, defaultCharacter()));
  const txt = document.createElement('span');
  txt.className = 'coop-invite-text';
  txt.textContent = `${inv.inviter} 邀请你加入房间 ${inv.code}`;
  el.appendChild(txt);
  [{ act: 'accept', label: '加入' }, { act: 'decline', label: '忽略', danger: true }].forEach(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = a.danger ? 'ghost danger' : 'ghost';
    b.dataset.coopAct = a.act;
    b.dataset.coopCode = inv.code;
    b.textContent = a.label;
    el.appendChild(b);
  });
  return el;
}

function renderCoop() {
  const inRoom = !!coopRoom;
  const joinBox = document.getElementById('coop-join');
  const roomBox = document.getElementById('coop-room');
  if (joinBox) joinBox.classList.toggle('hidden', inRoom);
  if (roomBox) roomBox.classList.toggle('hidden', !inRoom);

  const codeEl = document.getElementById('coop-code');
  if (codeEl) codeEl.textContent = inRoom ? coopRoom.code : '------';

  const players = document.getElementById('coop-players');
  if (players) {
    players.innerHTML = '';
    if (inRoom) {
      const mineHost = coopRoom.host === currentUser;
      players.appendChild(coopSlotEl(coopRoom.host, coopRoom.hostAvatar, mineHost, coopRoom.hostReady, true));
      players.appendChild(coopSlotEl(coopRoom.guest, coopRoom.guestAvatar, !mineHost, coopRoom.guestReady, false));
    }
  }

  const readyBtn = document.getElementById('coop-ready');
  if (readyBtn) {
    const mineReady = inRoom && (coopRoom.host === currentUser ? coopRoom.hostReady : coopRoom.guestReady);
    readyBtn.textContent = mineReady ? '取消准备' : '准备';
    readyBtn.disabled = !inRoom;
  }

  // 「开始双人对战」（V1.37）：只有房主、且好友已进房时才点得动
  const fightBtn = document.getElementById('coop-fight');
  if (fightBtn) {
    const isHost = inRoom && coopRoom.host === currentUser;
    const canFight = isHost && !!coopRoom.guest;
    fightBtn.disabled = !canFight;
    fightBtn.textContent = !inRoom ? '等好友进房'
      : (isHost ? (coopRoom.guest ? '开始双人对战' : '等好友进房') : '等房主开局');
  }

  const invBox = document.getElementById('coop-invites');
  if (invBox) {
    invBox.innerHTML = '';
    coopInvites.forEach(inv => invBox.appendChild(coopInviteEl(inv)));
    invBox.classList.toggle('hidden', !coopInvites.length);
  }

  renderFriendBadge();   // 房间邀请也算红点
  renderFriends();       // 在房间里且还有空位时，好友行多一个「邀请进房」
}

// 在房间里、且还没坐满时才能邀请（与 api/rooms.js 的判定一致）
function coopCanInvite() { return !!(coopRoom && !coopRoom.guest); }

function friendActsOf(kind) {
  const cfg = FRIEND_LISTS[kind];
  if (kind === 'friends' && coopCanInvite()) return [{ act: 'coopInvite', label: '邀请进房' }].concat(cfg.acts);
  return cfg.acts;
}

function applyCoop(d) {
  coopInvites = (d && Array.isArray(d.invites)) ? d.invites : [];
  renderCoop();
}

// 只拉「我收到的邀请」：进主页时也要红点，不必等面板打开
function loadCoopInvites() {
  if (!coopAvailable()) { coopInvites = []; renderCoop(); return Promise.resolve(false); }
  return roomsApi('GET', { invites: '1' })
    .then(d => { applyCoop(d); return true; })
    .catch(err => {
      if (err && err.status === 401) { sessionExpired(); return false; }
      return false;
    });
}

// 面板开着时的轮询：好友进房 / 房间被解散 / 收到邀请，都不用手动刷新
function refreshCoop() {
  if (!coopAvailable()) return Promise.resolve(false);
  const jobs = [roomsApi('GET', { invites: '1' }).then(applyCoop).catch(() => {})];
  if (coopRoom) {
    const code = coopRoom.code;
    jobs.push(roomsApi('GET', { code }).then(d => {
      if (!d || !d.room) {
        if (coopRoom && coopRoom.code === code) { applyRoom(null); coopStatusSet('房间已解散'); }
      } else applyRoom(d.room);
    }).catch(() => {}));
  }
  return Promise.all(jobs);
}

function startCoopPolling() {
  stopCoopPolling();
  if (!coopAvailable()) return;
  coopPollTimer = setInterval(() => { if (friendsOpen) refreshCoop(); }, COOP_POLL_MS);
}

function stopCoopPolling() {
  if (coopPollTimer) { clearInterval(coopPollTimer); coopPollTimer = null; }
}

// 邀请链接 `?room=ABCD23`：登录进主页时自动打开好友面板、把房间码填进输入框
function coopHandleUrl() {
  let raw = '';
  try { raw = new URLSearchParams(location.search).get('room') || ''; } catch (e) { raw = ''; }
  const code = normCoopCode(raw);
  if (!coopCodeOk(code)) return false;
  const input = document.getElementById('coop-input');
  if (input) input.value = code;
  if (coopAvailable()) openFriends();
  coopStatusSet(`邀请链接：房间码 ${code}，点「加入房间」进入`);
  return true;
}

// ==================== 双人对战 · 联机内核（V1.37） ====================
// 传输：Supabase Realtime 的 **public broadcast 频道** `room:<房间码>`，协议按 Phoenix 裸 WebSocket 手写
//   （与排行榜那个订阅同一套写法）。实测两个客户端 join 同一频道能互相收到 broadcast，
//   且 **public 频道不走 realtime.messages 的授权策略，因此不需要任何 DB 迁移**。
//
// 权威模型：**房主权威**
//   · 房主：跑完整模拟 —— 槽位 0 = 自己，槽位 1 = 客机；按固定频率广播世界快照，并接收客机的输入意图。
//   · 客机：**不跑 update()**，只上行输入、按快照回放渲染（渲染层只读世界，所以能直接复用 render()）。
//
// 消息（都是 broadcast，除 phx_join / heartbeat 外）：
//   run:start { seed, mode, host, guest }  房主开局。**只带种子与模式**，世界各自 reset(seed) 生成 ——
//              把 obstacles / vines / decorations 塞进来体积能到上百 KB，broadcast 会静默丢弃
//   run:go    {}                           客机就位，房主可以开始喂快照了
//   in        { x, y }                     客机 -> 房主：移动意图（单位向量，值变了才发）
//   snap      {...}                        房主 -> 客机：世界快照（约 18Hz）
//   fx        { shake, f }                 房主 -> 客机：打击反馈（伤害数字 / 浮动文字 / 震屏，纯表现、可丢）
//   pick      { level, cards }             房主 -> 客机：这一轮给客机抽到的候选（id + 文案）
//   pick:choose { id }                     客机 -> 房主：我选了哪张（由房主落地）
//   run:end   { won, wave, kills, level, time, coins, cause, peerCause }  房主 -> 客机：这一局的结果
//             （客机据此摆结算页；cause = 房主自己的阵亡原因，peerCause = 客机自己的）
//   run:end   { left: true }               任一方 -> 对方：我中途收场了（对方退回大厅）
// **通道的存活周期是「在房间里」，不是「这一局」**：一局结束后两边都还在房间，房主重新开局即可再打一局。
let netSocket = null;
let netTopic = '';
let netJoined = false;
let netRef = 1;
let netJoinRef = '';            // 本次 phx_join 用的 ref（服务端按它回执；**不能写死 '1'**，见 netConnect）
let netHbTimer = null;
let netJoinTimer = null;
let netRole = null;             // 'host' | 'guest'
let netPeer = '';
let netInfo = null;             // 后端下发的 Realtime 连接信息
let netStatusText = '';
let netSnap = null;             // 客机：最近一次快照（渲染目标）
let netSnapAt = 0;
let netSnapTimer = null;
let remoteInput = { x: 0, y: 0 };   // 房主：客机的移动意图
let netFxQueue = [];                // 房主：待下发的打击反馈（伤害数字 / 浮动文字）
let netSfxQueue = [];               // 房主：待下发的打击音效 key（去重后最多 NET_SFX_MAX 条）
let netHitStopPulse = 0;            // 房主：这一拍触发过的顿帧时长（**脉冲**，不是剩余时长 —— 见 triggerHitStop）
const NET_HB_MS = 25000;
const NET_JOIN_TIMEOUT = 9000;
const NET_SNAP_MS = 55;             // 约 18Hz：世界快照 + 打击反馈都挂在这个节拍上
const NET_FX_MAX = 12;              // 一次最多带多少条反馈（纯表现，超出的直接丢，不值得为它排队）
const NET_SFX_MAX = 8;              // 一次最多带多少条打击音效（同上，去重后基本用不满）
const NET_SNAP_JUMP = 200;          // 客机贴位时，旧实体离新目标超过这个距离就认定「下标错位」→ 吸附而不平滑

function netStatus(msg) {
  netStatusText = msg;
  const el = document.getElementById('coop-status');
  if (el && friendsOpen) el.textContent = msg;
}

// 拉 Realtime 连接信息（同一个接口排行榜也在用，这里只取 realtime 字段）
function netFetchInfo() {
  if (netInfo) return Promise.resolve(netInfo);
  return fetch('/api/leaderboard?limit=1')
    .then(r => (r.ok ? r.json() : {}))
    .then(d => { netInfo = d.realtime || null; return netInfo; })
    .catch(() => null);
}

// 发一条原始消息。**返回这条消息用的 ref**（'' = 没发出去）—— 调用方需要靠它认服务端的回执。
function netSendRaw(event, payload, join) {
  if (!netSocket || netSocket.readyState !== 1) return '';
  const ref = String(netRef++);
  const msg = { topic: netTopic, event, payload, ref };
  if (join) msg.join_ref = ref;
  netSocket.send(JSON.stringify(msg));
  return ref;
}

// 广播一条业务消息（对方通过 netOn 收到）
function netSend(event, payload) {
  return netSendRaw('broadcast', { type: 'broadcast', event, payload: payload || {} });
}

function netClose(reason) {
  if (netHbTimer) { clearInterval(netHbTimer); netHbTimer = null; }
  if (netJoinTimer) { clearTimeout(netJoinTimer); netJoinTimer = null; }
  if (netSnapTimer) { clearInterval(netSnapTimer); netSnapTimer = null; }
  if (netSocket) {
    const s = netSocket;
    netSocket = null;
    s.onopen = s.onmessage = s.onerror = s.onclose = null;
    try { s.close(); } catch (e) {}
  }
  const wasJoined = netJoined;
  netJoined = false;
  netRole = null;
  netSnap = null;
  if (reason && wasJoined) netStatus(reason);
  else if (wasJoined) netStatus('联机已结束');
}

// 断线 / 收场：关掉通道，双方都退回房间大厅（房间还在，能再来一局）
function netAbort(reason) {
  const inMatch = players.length > 1 || (state === 'playing' && netRole);
  netClose(reason || '联机已断开');
  if (!inMatch) return;
  netBackToLobby(true);        // 断线时保留结算页：这一局已经结束，没必要把结算数据收走
}

// 退回房间大厅（**不关通道** —— 通道的存活周期是「在房间里」，不是「这一局」：
//   这一局结束后双方都还在房间，房主点「开始双人对战」就能直接再来一局，不必重新进房）。
// 单人的暂停 / 结算态也要能退：把槽位还原成单人，免得残留的双人槽位被后面的单人局带进去。
// keepResult = true 时结算页保持不动（队友断线不该把正在看的结算数据收走）。
function netBackToLobby(keepResult) {
  if (netSnapTimer) { clearInterval(netSnapTimer); netSnapTimer = null; }
  players = [P1];
  activePlayer = null;
  switchTo(P1);
  P1.id = 0;                   // 客机那条会把 P1 的 id 改成 1（自己才是槽位 1），退回单人时归一
  P1.pendingPick = null;
  if (state !== 'menu' && !(keepResult && state === 'gameover')) { renderMenu(); showMenu(); }
  renderCoop();
}

// 我方主动收场（暂停里「返回主菜单 / 新游戏」、结算页的「回到大厅」）：先告诉对方再退
function netLeaveMatch() {
  // 结算页离开不用再通知：这一局的结果（run:end 结果广播）早就发过了
  if (netRole && state !== 'gameover') netSend('run:end', { left: true });
  netBackToLobby();
}

// 建立频道连接。role ∈ 'host' | 'guest'
// **resolve 的时机是 `phx_join` 被服务端确认之后，不是 WebSocket 刚连上** ——
// 早于确认就发广播会被服务端直接丢掉（实测：房主的 run:start 就是这么丢的），
// 这是个很容易踩的坑，改这里务必保留「等 join 确认」这一条。
function netConnect(code, role) {
  const topic = `realtime:room:${code}`;
  if (netJoined && netSocket && netTopic === topic && netRole === role) return Promise.resolve(true);
  netClose();
  if (!code || !coopAvailable()) return Promise.resolve(false);
  return netFetchInfo().then(rt => new Promise(resolve => {
    if (!rt || typeof WebSocket !== 'function') {
      netStatus('联机通道不可用（缺 Realtime 配置）');
      resolve(false);
      return;
    }
    netRole = role;
    netTopic = topic;
    let settled = false;
    const finish = ok => { if (!settled) { settled = true; resolve(ok); } };
    const ws = new WebSocket(`${rt.url}?apikey=${encodeURIComponent(rt.key)}&vsn=1.0.0`);
    netSocket = ws;

    ws.onopen = () => {
      if (netSocket !== ws) return;
      // **记住这次 join 用的 ref**：服务端的回执按它回来。**不能写死 '1'** ——
      // netRef 是全局自增且不随 netClose 清零，写死 '1' 会导致「退出房间后再建一次 / 之前发过任何广播」
      // 时回执永远对不上 → 卡满 NET_JOIN_TIMEOUT → 误报「联机通道未响应」。（V1.37 修）
      netJoinRef = netSendRaw('phx_join', { config: { broadcast: { self: false } } }, true);
      netHbTimer = setInterval(() => {
        if (netSocket === ws) netSocket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' }));
      }, NET_HB_MS);
      netJoinTimer = setTimeout(() => {
        if (netSocket === ws && !netJoined) { netAbort('联机通道未响应（可能是网络或 Realtime 配置问题）'); finish(false); }
      }, NET_JOIN_TIMEOUT);
    };

    ws.onmessage = ev => {
      if (netSocket !== ws) return;
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.event === 'phx_reply') {
        if (m.ref === netJoinRef) {          // 只认「本次 join」的回执（见 netJoinRef 的注释）
          netJoined = !!(m.payload && m.payload.status === 'ok');
          if (netJoinTimer) { clearTimeout(netJoinTimer); netJoinTimer = null; }
          if (!netJoined) netAbort('联机频道加入失败');
          finish(netJoined);
        }
        return;
      }
      if (m.event === 'phx_error' || m.event === 'phx_close') { netAbort('联机连接被关闭'); finish(false); return; }
      if (m.event !== 'broadcast') return;
      const p = m.payload || {};
      netOn(p.event, p.payload || {});
    };

    ws.onerror = () => { if (netSocket === ws) { netAbort('联机连接出错'); finish(false); } };
    ws.onclose = () => { if (netSocket === ws) { netAbort('联机连接已断开'); finish(false); } };
  }));
}

// 收到对方消息
function netOn(event, p) {
  if (event === 'run:start') { netGuestBegin(p); return; }
  if (event === 'run:go') { if (netRole === 'host') netStartSnapshots(); return; }
  if (event === 'in') { remoteInput.x = Number(p.x) || 0; remoteInput.y = Number(p.y) || 0; return; }
  if (event === 'snap') { netSnap = p; netSnapAt = performance.now(); return; }
  if (event === 'fx') { netGuestFx(p); return; }   // 打击反馈（纯表现）
  // 各自选卡（V1.37）：房主把给客机抽好的候选发过来 / 客机把选择回给房主
  if (event === 'pick') { netGuestPick(p); return; }
  if (event === 'pick:choose') { resolvePick(players[1], p.id); return; }
  if (event === 'run:end') { netOnEnd(p); return; }
}

// 「这一局结束了」两类消息共用一个事件名：
//   · 房主 → 客机：**结果广播**（带 won / wave / kills / level / time / coins / cause）→ 客机摆出结算页
//   · 任一方 → 对方：**中途收场**（`left: true`）→ 对方退回大厅
// 注意这里**都不关通道** —— 通道跟着「在房间里」走（见 netBackToLobby），所以随时能再来一局。
function netOnEnd(p) {
  const left = !p || !!p.left;
  if (netRole === 'host') {
    // 客机提前收场：房主也回大厅（已在结算页就只提示，不打断他看结算）
    if (left) {
      coopStatusSet(`${netPeer || '队友'} 结束了这一局`);
      if (state !== 'gameover') netBackToLobby(true);
    }
    return;
  }
  if (left) {
    coopStatusSet(`${netPeer || '房主'} 结束了这一局`);
    netBackToLobby(true);
    return;
  }
  // 客机侧：房主下发的这一局结果 —— 客机自己的模拟没跑过，所以数字全用房主那份；
  // 阵亡原因优先用「客机自己那一份」（房主替它记着，扣血按 owner 分账）
  renderGameOverPanel({
    win: !!p.won, wave: Number(p.wave) || 0, kills: Number(p.kills) || 0, level: Number(p.level) || 0,
    time: Number(p.time) || 0, coins: Number(p.coins) || 0, causeKey: p.peerCause || p.cause || '', fromNet: true,
  });
  setState('gameover');
  coopStatusSet(`这一局结束了（房主 ${netPeer} 结算）`);
}

// ==================== 房主侧 ====================

// 开局演出：生成世界 -> 建客机槽位 -> 广播 run:start
function netHostBegin() {
  if (!coopRoom || coopRoom.host !== currentUser) return;
  if (!coopRoom.guest) { coopStatusSet('等好友进房才能开局'); return; }
  netPeer = coopRoom.guest;
  const code = coopRoom.code;
  coopStatusSet('正在建立联机通道…');
  startGame();                                  // 房主先按正常流程开一局（世界在这里生成）
  const seed = runSeed, mode = runMode;
  coopSpawnLocalAlly();                         // 槽位 1 = 客机
  players[1].name = netPeer;
  players[0].name = currentUser;
  netConnect(code, 'host').then(ok => {
    if (!ok) return;
    setState('playing');
    closeFriends();                             // 开局后收起好友 / 房间面板，别盖住战场
    // **开局消息只带种子，不带整张世界** —— 把 obstacles / vines / decorations 塞进去体积能到上百 KB，
    // Supabase 的 broadcast 会直接丢弃超限消息（实测：收不到、也不报错，非常难查）。
    // 两边各自 reset(seed) 即可得到同一张地图：世界的生成只走 rngWorld，与账号的装备 / 外观无关。
    const sent = netSend('run:start', { seed, mode, host: currentUser, guest: netPeer });
    netStartSnapshots();
    coopStatusSet(sent
      ? `对局开始：${currentUser} vs 关卡（队友 ${netPeer}）`
      : '开局广播发送失败（联机通道可能已断开）');
  });
}

// 房主按固定频率把世界快照广播给客机（顺带把这一拍的打击反馈带上）
function netStartSnapshots() {
  if (netSnapTimer) clearInterval(netSnapTimer);
  netFxQueue.length = 0;      // 新的一局：别把上一局没发完的反馈带过来
  netSfxQueue.length = 0;
  netHitStopPulse = 0;
  netSnapTimer = setInterval(() => {
    if (!netJoined || !isLive()) return;
    netSend('snap', netSnapshot());
    netSendFx();
  }, NET_SNAP_MS);
}

// 打击反馈：伤害数字 / 浮动文字 / 屏幕抖动 / 打击音效 / 顿帧。**纯表现** —— 丢了不影响判定，所以不重发、不排队。
//   客机不跑模拟，这些数据在它那边永远不会产生，没有这一条它打怪就是「怪默默掉血、静音、也不顿帧」。
function netSendFx() {
  const f = netFxQueue.splice(0, NET_FX_MAX);
  netFxQueue.length = 0;                       // 超出的直接丢
  const snd = netSfxQueue.splice(0, NET_SFX_MAX);
  netSfxQueue.length = 0;
  const stop = netHitStopPulse;
  netHitStopPulse = 0;
  const s = Math.round(shake * 10) / 10;
  if (!f.length && !snd.length && !stop && s < 0.5) return;   // 什么都没发生：不发
  netSend('fx', { shake: s, f, snd, stop: Math.round(stop * 1000) / 1000 });
}

// 客机：把房主下发的打击反馈摆到自己的表现层上（伤害数字 / 浮动文字 / 震屏 / 音效 / 顿帧）。
//   写的是 damageNumbers / shake / hitStop —— 前两个是纯表现数据，hitStop 走 loop() 那条既有的
//   「冻结逻辑、渲染照常」通道（客机那边冻结的就是「贴快照 + 推表现层」，效果与房主一致）。
function netGuestFx(p) {
  const list = Array.isArray(p && p.f) ? p.f : [];
  for (const a of list) {
    if (!a || a.length < 5) continue;
    if (a[4]) damageNumbers.push({ x: a[0], y: a[1], text: a[2], color: a[3], life: 1.4, vy: -40 });
    else damageNumbers.push({ x: a[0], y: a[1], value: a[2], color: a[3], life: 0.8, vy: -55 });
  }
  const s = Number(p && p.shake) || 0;
  if (s > shake) shake = s;
  // 打击音效：照房主报过来的事件重放一遍（客机自己的音效设置与节流照常生效）
  const snd = Array.isArray(p && p.snd) ? p.snd : [];
  for (const k of snd) {
    const fn = SFX_BY_KEY[k];
    if (fn) fn();
  }
  // 顿帧：只收「触发过」的脉冲，不会与本地已有的顿帧互相抵消（取较长者）
  const stop = Number(p && p.stop) || 0;
  if (stop > hitStop) hitStop = stop;
}

// 把渲染需要的字段挑出来（不传判定用的计时器/集合，省带宽；坐标压到 1 位小数）
const r1 = v => Math.round(v * 10) / 10;
function netSnapshot() {
  return {
    t: r1(gameTime), wave, level, xp: r1(xp), xpToNext,
    kills, runCoins, difficulty: r1(difficulty), bossKills,
    players: players.map(p => ({
      id: p.id, name: p.name || '',
      x: r1(p.squad.x), y: r1(p.squad.y), aim: r1(p.squad.aimAng),
      hp: r1(p.hp), hpMax: r1(p.hpMax),
      shield: r1(p.squad.shield), shieldMax: p.squad.shieldMax,
      soldiers: p.soldiers.map(s => [r1(s.x), r1(s.y)]),
      weapon: (p.weapons[0] && p.weapons[0].type) || null,
    })),
    enemies: enemies.map(e => [e.type, r1(e.x), r1(e.y), r1(e.hp), r1(e.maxHp), e.r, r1(e.facing || 0),
      (e.frostT > 0 ? 1 : 0) | (e.burnT > 0 ? 2 : 0) | (e.freezeT > 0 ? 4 : 0),
      e.kind || '', e.elite ? 1 : 0]),
    bullets: bullets.map(b => [r1(b.x), r1(b.y), b.r, b.color]),
    drops: drops.map(d => [r1(d.x), r1(d.y), d.value, d.r]),
    enemyBullets: enemyBullets.map(b => [r1(b.x), r1(b.y), b.r, b.color]),
  };
}

// ==================== 客机侧 ====================

// 收到房主的开局消息：按同一份世界数据进对局
function netGuestBegin(p) {
  if (netRole && netRole !== 'guest') return;
  netPeer = p.host || '';
  netRole = 'guest';
  reset(p.seed);                                // 同一 seed -> 两边生成同一张地图（世界只走 rngWorld）
  runMode = p.mode || runMode;
  terrainCache = null;
  // 槽位重排：0 = 房主（远端），1 = 我（本机）。reset() 之后 P1 就是「我」，所以改它的 id 落到槽位 1，
  // 前面补一个空壳的房主槽位；小兵身上的 owner 也要跟着改，否则会被算到房主头上。
  const me = P1;
  me.id = 1;
  me.name = currentUser;
  me.soldiers.forEach(s => { s.owner = 1; });
  const host = makePlayer(0);
  host.name = p.host || '房主';
  host.squad = {
    x: WORLD.w / 2, y: WORLD.h / 2,
    shield: 0, shieldMax: 0, shieldRegenTimer: 0, invulnT: 0, invulnCdT: 0, aimAng: -Math.PI / 2,
  };
  players = [host, me];
  activePlayer = me;                            // 全局仍然代表「我」
  captureCtx(me);
  netSnap = null;
  netLastInput = '';
  setState('playing');
  initAudio();
  startMusic();
  applyOrientation();
  closeFriends();                               // 开局后收起面板，别盖住战场
  netSend('run:go', {});                        // 告诉房主「我到位了」
  coopStatusSet(`对局开始：房主 ${netPeer}`);
}

// 客机的时间片：**不跑模拟**，只把最新快照贴回全局，然后照常渲染
function netGuestTick(dt) {
  netApplySnap(dt);
  // 客机不跑 update()，但**表现层的寿命仍然要减**：伤害数字 / 屏幕抖动都是在 update() 尾部推进的，
  // 少了这一步它们会永远留在屏幕上，而且越积越多 —— 表现就是「伤害数字不消失 + 越玩越卡」。（V1.37 修）
  // （粒子 / 冲击波 / 波次横幅这些同上，但它们只由房主的模拟产生、没进快照，客机这边本来就是空的。）
  updateDamageNumbers(dt);
  shake = Math.max(0, shake - dt * 50);
  updateCamera();
}

// 客机：每帧按最新快照把世界「贴」回全局（渲染层只读，所以贴完直接 render() 即可）
//   两条要点：
//   · **位置平滑逼近，不硬吸附** —— 快照只有约 18Hz，直接吸附看着就是一顿一顿的；
//     `k` 按帧长算（与刷新率无关），高刷屏不会因此追得更快。
//   · **复用同一批对象** —— 每帧重建上百个敌人 / 子弹对象会让 GC 频繁介入，这是客机发卡的主因之一。
function netApplySnap(dt) {
  if (!netSnap) return;
  const s = netSnap;
  const lerp = (cur, want, k) => cur + (want - cur) * k;
  const k = Math.min(1, dt * 18);              // ≈ 0.30 @60fps
  (s.players || []).forEach(sp => {
    const p = players[sp.id];
    if (!p) return;
    const isLocal = p === activePlayer;
    const sq = isLocal ? squad : p.squad;
    const wasFirst = sq.__net;
    if (wasFirst) { sq.x = lerp(sq.x, sp.x, k); sq.y = lerp(sq.y, sp.y, k); }
    else { sq.x = sp.x; sq.y = sp.y; sq.__net = true; }
    sq.aimAng = sp.aim;
    p.hp = sp.hp; p.hpMax = sp.hpMax;
    if (isLocal) { squadHp = sp.hp; squadMaxHp = sp.hpMax; } else { p.hp = sp.hp; p.hpMax = sp.hpMax; }
    sq.shield = sp.shield; sq.shieldMax = sp.shieldMax;
    const arr = isLocal ? soldiers : p.soldiers;
    const want = sp.soldiers || [];
    if (arr.length !== want.length) {
      arr.length = 0;
      want.forEach(() => arr.push({ x: 0, y: 0, owner: sp.id }));
    }
    arr.forEach((sd, i) => {
      const t = want[i];
      if (!t) return;
      if (sd.__net) { sd.x = lerp(sd.x, t[0], k); sd.y = lerp(sd.y, t[1], k); }
      else { sd.x = t[0]; sd.y = t[1]; sd.__net = true; }
      sd.owner = sp.id;
    });
  });
  // 敌人 / 掉落：慢速、被盯着的实体 → 平滑逼近（下标的旧实体离新目标太远就直接吸附，见 applySnapList）
  applySnapList(enemies, s.enemies || [], k, true, (e, a) => {
    e.type = a[0]; e.hp = a[3]; e.maxHp = a[4]; e.r = a[5]; e.facing = a[6];
    e.frostT = (a[7] & 1) ? 1 : 0; e.burnT = (a[7] & 2) ? 1 : 0; e.freezeT = (a[7] & 4) ? 1 : 0;
    e.kind = a[8] || undefined; e.elite = !!a[9]; e.dead = false;
  });
  applySnapList(drops, s.drops || [], k, true, (e, a) => { e.value = a[2]; e.r = a[3]; });
  // 子弹：数量多、寿命短、下标错位频繁 → 只复用对象、位置仍吸附（平滑反而会「滑向旁边的子弹」）
  applySnapList(bullets, s.bullets || [], k, false, (e, a) => { e.r = a[2]; e.color = a[3]; e.vx = 0; e.vy = 0; });
  applySnapList(enemyBullets, s.enemyBullets || [], k, false, (e, a) => { e.r = a[2]; e.color = a[3]; });
  gameTime = s.t; wave = s.wave; kills = s.kills; runCoins = s.runCoins;
  level = s.level; xp = s.xp; xpToNext = s.xpToNext;
}

// 把一个快照数组贴回本地实体数组：**复用对象**（不重新分配），位置按 `smooth` 决定「平滑逼近」还是「直接吸附」。
// 下标匹配的硬伤是「数组中间少了一个，后面整体错位一格」—— 所以旧实体离新目标超过 NET_SNAP_JUMP 时一律吸附，
// 这样错位只会闪一下，不会整排滑过去。
function applySnapList(arr, list, k, smooth, take) {
  arr.length = list.length;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const e = arr[i] || (arr[i] = {});
    take(e, a);
    const tx = a[1], ty = a[2];
    if (smooth && e.__snap && Math.hypot(tx - e.x, ty - e.y) <= NET_SNAP_JUMP) {
      e.x += (tx - e.x) * k;
      e.y += (ty - e.y) * k;
    } else {
      e.x = tx;
      e.y = ty;
    }
    e.__snap = true;
  }
}

// 客机：把本机的移动意图上行（只在值变化时才发，省流量）
let netLastInput = '';
function netSendInput() {
  const v = { x: Math.round(joyVec().x * 100) / 100, y: Math.round(joyVec().y * 100) / 100 };
  const key = v.x + ',' + v.y;
  if (key === netLastInput) return;
  netLastInput = key;
  netSend('in', v);
}

document.getElementById('btn-friends').onclick = openFriends;
document.getElementById('chat-close').onclick = () => {
  closeChat();
  if (friendsOpen) renderFriends();
};
document.getElementById('chat-send').onclick = sendChat;
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat();
});

// 双击好友行 → 打开聊天（行里的按钮不算）
const friendListBox = document.getElementById('friend-list');
if (friendListBox) {
  friendListBox.addEventListener('dblclick', e => {
    if (e.target.closest('button')) return;
    const row = e.target.closest('.friend-row');
    if (!row) return;
    const name = row.querySelector('.friend-name');
    if (name) openChat(name.textContent);
  });
}
document.getElementById('friends-close').onclick = closeFriends;
document.getElementById('friend-add-btn').onclick = addFriendFromInput;
document.getElementById('friend-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addFriendFromInput();
});

// 好友 / 房间这类「别人发起、我这边要看到」的行：事件委托（行都是动态生成的）
// 邀请进房（好友行）与 加入 / 忽略（收到的房间邀请）都走这里，其余交给 friendAction。
document.getElementById('friends').addEventListener('click', e => {
  const coop = e.target.closest('button[data-coop-act]');
  if (coop) {
    if (coop.dataset.coopAct === 'accept') coopJoin(coop.dataset.coopCode);
    else coopDecline(coop.dataset.coopCode);
    return;
  }
  const btn = e.target.closest('button[data-friend-act]');
  if (!btn) return;
  if (btn.dataset.friendAct === 'coopInvite') { coopInvite(btn.dataset.friendName); return; }
  friendAction(btn.dataset.friendAct, btn.dataset.friendName);
});

// 合作房间：建房 / 加入 / 复制邀请 / 准备 / 离开
document.getElementById('coop-create').onclick = coopCreate;
document.getElementById('coop-copy').onclick = coopCopyInvite;
document.getElementById('coop-join-btn').onclick = () => coopJoin(document.getElementById('coop-input').value);
document.getElementById('coop-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') coopJoin(document.getElementById('coop-input').value);
});
document.getElementById('coop-ready').onclick = coopToggleReady;
document.getElementById('coop-leave').onclick = coopLeave;
document.getElementById('coop-fight').onclick = netHostBegin;   // V1.37：房主开局（双人对战）

// 标签切换
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    // 装备 / 宠物页的「返回」：先逐层回退（铁砧 → 候选列表 → 装备台），到顶层才回主页
    if (btn.id === 'equip-back' && equipLv !== 'stage') {
      equipLv = EQUIP_BACK_TO[equipLv] || 'stage';
      renderEquipPage();
      return;
    }
    if (btn.id === 'pet-back' && petLv !== 'stage') {
      petLv = PET_BACK_TO[petLv] || 'stage';
      renderPetDev();
      return;
    }
    closeFriends();      // 从好友面板里点「更换头像」等入口时，先把面板收起来
    soundTapCount = 0;   // 离开设置页即打断「连续切换」计数
    document.querySelector('#menu .menu-panel').scrollTop = 0;
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    // 每次进入装备 / 宠物页都回到最外层（装备台 / 宠物台）
    if (btn.dataset.tab === 'equip') { equipLv = 'stage'; renderEquipPage(); }
    else if (btn.dataset.tab === 'pet') { petLv = 'stage'; renderPetDev(); }
    if (btn.dataset.tab === 'board') openBoard();
    else closeBoard();
  });
});

// 装备页 / 宠物页的三级视图跳转（V1.35）：栏位 → 候选列表 → 铁砧
function bindGearNav(boxId, onNav) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (!nav || !box.contains(nav)) return;
    onNav(nav);
  });
}

bindGearNav('equip-body', nav => {
  const to = nav.dataset.nav;
  if (to === 'slot') {
    equipSelSlot = nav.dataset.slot;
    equipLv = 'list';
  } else if (to === 'anvil') {
    equipSelId = nav.dataset.id;
    equipLv = 'anvil';
  } else {
    return;
  }
  renderEquipPage();
});

bindGearNav('pet-body', nav => {
  const to = nav.dataset.nav;
  if (to === 'list') {
    petLv = 'list';
  } else if (to === 'egg') {
    petLv = 'egg';
  } else if (to === 'anvil') {
    petPreviewSel = nav.dataset.id;
    petLv = 'anvil';
  } else if (to === 'pet') {
    petPreviewSel = nav.dataset.id;      // 仅切换预览 / 养成对象，不写存档
    petLv = 'anvil';
  } else {
    return;
  }
  renderPetDev();
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
    openEggHud(btn.dataset.egg || 'normal');
  } else if (btn.dataset.act === 'star') {
    starUpPet(btn.dataset.id);
  } else if (btn.dataset.act === 'combine') {
    synthesizePet(btn.dataset.id);
  } else if (btn.dataset.act === 'refine') {
    refineGear(btn.dataset.id);
  } else if (btn.dataset.act === 'lock') {
    toggleGearLock(btn.dataset.id, Number(btn.dataset.i));
  } else if (btn.dataset.act === 'talent') {
    addPetTalent(btn.dataset.id, btn.dataset.branch);
  }
});

document.getElementById('btn-play').onclick = () => {
  if (meta.run) continueRun();      // 有上把进度：回到当时的暂停 / 设置界面
  else startGame();
};
document.getElementById('btn-restart').onclick = () => {
  if (netRole) { netLeaveMatch(); return; }    // 联机局：回大厅（「再来一局」要房主在房间里重新开局）
  startGame();
};
document.getElementById('btn-pause').onclick = pauseGame;
const guideSkipBtn = document.getElementById('guide-skip');
if (guideSkipBtn) guideSkipBtn.onclick = skipGuide;      // 首局引导：一键跳过整段（V1.35）

// ==================== 移动端防误触（V1.35 第二阶段验收） ====================
// 面板可以拖动滚动，拇指「按下 → 拖着走 → 松手」时 pointerdown / pointerup 常落在同一个按钮上，
// 浏览器会照常派发一次 click —— 于是滑一下就误选了升级卡、误按了返回键。
// 这里做一个全局手势守卫（捕获阶段，早于元素自己的 onclick）：本次手势位移超过 TAP_SLOP 的一律不算点击。
// 只对「点错代价大」的元素生效：升级三选一卡牌、各页返回键、局内暂停 / 目标优先级 / 结算按钮。
const TAP_SLOP = 12;
const TAP_GUARD_SEL = '.card, .nav-back, #btn-pause, #btn-aim, #btn-restart, #btn-change, #btn-resume, #btn-quit';
let tapStartX = 0, tapStartY = 0, tapDown = false, tapMoved = 0;
document.addEventListener('pointerdown', e => { tapDown = true; tapMoved = 0; tapStartX = e.clientX; tapStartY = e.clientY; }, true);
document.addEventListener('pointerup', e => {
  if (tapDown) tapMoved = Math.hypot(e.clientX - tapStartX, e.clientY - tapStartY);
  tapDown = false;
}, true);
document.addEventListener('click', e => {
  if (tapMoved <= TAP_SLOP) return;
  const el = e.target && e.target.closest && e.target.closest(TAP_GUARD_SEL);
  if (!el) return;
  e.stopPropagation();
  e.preventDefault();
}, true);
document.getElementById('btn-aim').onclick = cycleAimMode;      // 自动攻击目标优先级（V1.31）
document.getElementById('btn-resume').onclick = resumeGame;
document.getElementById('btn-newgame').onclick = () => {
  if (netRole) { netLeaveMatch(); return; }    // 联机局：回大厅，不在这儿新开一局单人
  startGame();
};
document.getElementById('btn-reroll').onclick = rerollUpgrades;
document.getElementById('skill-slow').onclick = () => useSkill('slow');
document.getElementById('btn-quit').onclick = () => {
  // 联机局不能「存进度后回主菜单」（对局快照只存当前生效玩家那套上下文，双人局本来就不能续玩）：
  // 改成通知队友并回大厅。
  if (netRole) { netLeaveMatch(); return; }
  saveRun();                        // 返回主菜单：保留上把进度
  stopMusic();
  renderMenu();
  showMenu();
};
document.getElementById('btn-change').onclick = () => {
  if (netRole) { netLeaveMatch(); return; }
  stopMusic();
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
  document.getElementById('dev-pet-shards').value = d.energy;
}

function devInfo() {
  const el = document.getElementById('dev-info');
  if (!el) return;
  const size = new Blob([JSON.stringify(meta)]).size;
  const channel = usesHttpStore() ? '在线接口' : (window.furyStore ? 'Electron 本地文件' : '浏览器本地存储');
  // V1.32：把「存档结构版本 / 是否有备份 / 是否有坏档」摆在明面上，方便自查
  let backup = false, broken = false;
  try {
    backup = !!localStorage.getItem(metaBackupKey());
    broken = !!localStorage.getItem(metaBrokenKey());
  } catch (e) {}
  el.textContent = `${playerName()} · ${channel} · 存档 ${(size / 1024).toFixed(1)} KB`
    + ` · 结构 v${schemaVersionOf(meta)}`
    + (meta.run ? ' · 有未结束对局' : '')
    + (backup ? ' · 有备份' : '')
    + (broken ? ' · 有坏档备查' : '');
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
  meta.unlocked.pets = ['none'].concat(Object.keys(PET_DEFS));   // 宠物走孵蛋，不在商店里
  GEAR_SLOTS.forEach(slot => meta.unlocked[GEAR_CAT[slot]].forEach(id => { if (id !== 'none') ensureGearAffixes(id); }));
  saveMeta();
  renderMenu();
  devStatus('已解锁全部武器 / 护甲 / 饰品 / 物品 / 宠物（含随机词条）');
};

document.getElementById('dev-apply-pet').onclick = () => {
  const id = document.getElementById('dev-pet').value;
  const d = petDev(id);
  d.lv = clampInt(document.getElementById('dev-pet-lv').value, 1, PET_DEV_CFG.lvMax);
  d.star = clampInt(document.getElementById('dev-pet-star').value, 1, PET_DEV_CFG.starMax);
  d.energy = clampInt(document.getElementById('dev-pet-shards').value, 0, 999);
  d.exp = 0;
  saveMeta();
  renderMenu();
  devStatus(`${PET_DEFS[id].name}：Lv.${d.lv} · ★${d.star} · ${PET_ENERGY[id]} ${d.energy}`);
};

document.getElementById('dev-max-pet').onclick = () => {
  Object.keys(PET_DEFS).forEach(id => {
    const d = petDev(id);
    d.lv = PET_DEV_CFG.lvMax;
    d.star = PET_DEV_CFG.starMax;
    d.energy = 0;
    d.exp = 0;
    // 天赋点均摊到整棵技能树：保证三个技能都解锁，方便直接测技能
    d.talents = {};
    let left = petTalentTotal(d);
    const tree = PET_TREES[id] || [];
    for (let guard = 0; left > 0 && guard < 60; guard++) {
      let placed = false;
      for (const n of tree) {
        if (left <= 0) break;
        if ((d.talents[n.id] || 0) >= n.max) continue;
        d.talents[n.id] = (d.talents[n.id] || 0) + 1;
        left--;
        placed = true;
      }
      if (!placed) break;
    }
  });
  meta.unlocked.pets = ['none'].concat(Object.keys(PET_DEFS));   // 顺带把 4 只都解锁
  saveMeta();
  renderMenu();
  devStatus(`所有宠物已拉满并解锁（Lv.${PET_DEV_CFG.lvMax} · ★${PET_DEV_CFG.starMax} · 技能全解锁）`);
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
  const imported = migrateMeta(parsed);        // V1.32：导入也要过校验 + 迁移，坏档直接拒绝
  if (!imported) { devStatus('存档校验未通过（结构不合法），已拒绝导入'); return; }
  meta = imported;
  meta.devMode = true;      // 导入的存档若不带该字段，保持开发者模式可用
  saveMeta();
  renderMenu();
  devPanelShown = false;
  renderDevMode();
  devStatus('存档已导入并保存');
};

// V1.32：用「上一次保存前的存档」覆盖当前档（坏档救援入口）
document.getElementById('dev-restore-backup').onclick = () => {
  const backup = readMetaBackup(currentUser);
  if (!backup) { devStatus('没有可用的备份（每次保存都会刷新这份备份，至少先正常保存一次）'); return; }
  if (!confirm('用「上一次保存前的存档」覆盖当前存档？')) return;
  const backupText = (() => { try { return localStorage.getItem(metaBackupKey()); } catch (e) { return null; } })();
  const restored = migrateMeta(backup);
  if (!restored) { devStatus('备份也无法通过校验，未做改动'); return; }
  meta = restored;
  meta.devMode = true;
  saveMeta();
  // 备份本身不能被这次保存覆盖掉，否则就再也回不去了
  try { if (backupText) localStorage.setItem(metaBackupKey(), backupText); } catch (e) {}
  renderMenu();
  devPanelShown = false;
  renderDevMode();
  devStatus('已恢复到上一次保存前的存档');
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
  devNoSpawn = false;
  devGod = { mob: false, elite: false, boss: false };
  devAllowPauseUpgrade = false;
  devUpgradeFromPause = false;
  devSelectedCardId = '';
  dpsHits = [];
  dpsValue = 0;
  dpsPeak = 0;
  ['dev-freeze-wave', 'dev-invuln', 'dev-oneshot', 'dev-no-spawn',
    'dev-god-mob', 'dev-god-elite', 'dev-god-boss', 'dev-pause-upgrade']
    .forEach(id => { const el = devQ(id); if (el) el.checked = false; });
  renderDevSpeedChips();
}

function devAvailable() { return devModeOn(); }

function setDevHud(open) {
  devHudOpen = !!open && devAvailable();
  const el = devQ('dev-hud');
  if (el) el.classList.toggle('hidden', !devHudOpen);
  // V1.35：横屏下面板贴右侧，会盖住右上角的「切换攻击目标」按钮 —— 面板展开时让按钮躲到左上
  const stage = document.getElementById('stage');
  if (stage) stage.classList.toggle('dev-open', devHudOpen);
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
  const dpsEl = devQ('dev-self-dps');
  if (dpsEl) dpsEl.textContent = `${Math.round(dpsValue)}/s`;
  const peakEl = devQ('dev-self-dps-peak');
  if (peakEl) peakEl.textContent = `峰值 ${Math.round(dpsPeak)}/s`;
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
    `DPS ${Math.round(dpsValue)}/s（峰值 ${Math.round(dpsPeak)}/s）`,
  ];
  if (devInvuln) lines.push('无敌 ON');
  if (devOneShot) lines.push('秒杀 ON');
  if (devFreezeWave) lines.push('波次计时已冻结');
  if (devNoSpawn) lines.push('停止刷怪 ON');
  const god = [];
  if (devGod.mob) god.push('小怪');
  if (devGod.elite) god.push('精英');
  if (devGod.boss) god.push('BOSS');
  if (god.length) lines.push(`怪物无敌：${god.join(' / ')}`);
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
  const a = (Math.PI * 2 / cnt) * i + rngWorld() * 0.35;
  if (mode === 'random') return { x: 60 + rngWorld() * (WORLD.w - 120), y: 60 + rngWorld() * (WORLD.h - 120) };
  if (mode === 'center') {
    const rr = 60 + rngWorld() * 90;
    return { x: camera.x + viewW() / 2 + Math.cos(a) * rr, y: camera.y + viewH() / 2 + Math.sin(a) * rr };
  }
  if (mode === 'edge') {                // 屏幕外一圈，像正常刷怪那样走进来
    const side = rngWorld();
    if (side < 0.5) return { x: camera.x + rngWorld() * viewW(), y: camera.y - 60 };
    if (side < 0.75) return { x: camera.x - 60, y: camera.y + rngWorld() * viewH() };
    if (side < 0.9) return { x: camera.x + viewW() + 60, y: camera.y + rngWorld() * viewH() };
    return { x: camera.x + rngWorld() * viewW(), y: camera.y + viewH() + 60 };
  }
  const rr = 130 + rngWorld() * 90;   // near：玩家周围一圈，保证在视野里
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
  // 选中项被过滤掉 / 已经不在了就自动取消选中
  if (devSelectedCardId && !list.some(c => c.id === devSelectedCardId)) devSelectedCardId = '';
  box.innerHTML = '';
  list.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    const picked = c.id === devSelectedCardId;
    b.className = 'dev-card' + (c.evo ? ' evo' : '') + (c.boss ? ' boss' : '') + (picked ? ' picked' : '');
    b.innerHTML = '<span class="dev-card-name">' + c.name + '</span>'
      + '<span class="dev-card-desc">' + (c.desc || '') + '</span>'
      + (picked ? '<span class="dev-card-got">选中</span>' : (appliedIds.has(c.id) ? '<span class="dev-card-got">已选</span>' : ''));
    // V1.31：改「点一下就应用」为「点一下选中、再点一下取消」，避免误点直接改构筑
    b.onclick = () => {
      devSelectedCardId = picked ? '' : c.id;
      devRenderCards();
    };
    box.appendChild(b);
  });
  devQ('dev-card-count').textContent = `显示 ${list.length} / 共 ${all.length} 张`
    + (devQ('dev-card-strict').checked ? '（严格：只列当前可选）' : '（已忽略前置）')
    + (devSelectedCardId ? ` · 已选中「${(list.find(c => c.id === devSelectedCardId) || {}).name || devSelectedCardId}」` : '');
  devSyncCardButtons();
}

function devSyncCardButtons() {
  const apply = devQ('dev-card-apply');
  const clear = devQ('dev-card-clear');
  if (apply) apply.disabled = !devSelectedCardId;
  if (clear) clear.disabled = !devSelectedCardId;
}

// 应用当前选中的卡（卡牌页的「应用选中」按钮）
function devApplySelectedCard() {
  if (!devSelectedCardId) { devHudStatus('先点一张卡把它选中'); return; }
  const card = devCardCatalog().find(c => c.id === devSelectedCardId);
  devSelectedCardId = '';
  if (!card) { devRenderCards(); devHudStatus('这张卡当前不在列表里'); return; }
  devRenderCards();     // 先把选中态清掉再应用，避免应用过程中的重绘把状态带错
  devApplyCard(card);
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
  setState('playing');
  resumeT = 0;                                   // 单步要真的推进一帧，不能被「继续倒计时」挡住
  update(1 / 60);
  if (state === 'playing') setState('paused');   // update 可能把状态改掉（升级 / 结算），那就保持它
  devRefreshReadout();
  devHudStatus('已推进 1 帧（1/60s）');
}

function devSyncControls() {
  const set = (id, v) => { const el = devQ(id); if (el) el.checked = !!v; };
  set('dev-freeze-wave', devFreezeWave);
  set('dev-invuln', devInvuln);
  set('dev-oneshot', devOneShot);
  set('dev-info-toggle', devInfoOn);
  set('dev-no-spawn', devNoSpawn);
  set('dev-god-mob', devGod.mob);
  set('dev-god-elite', devGod.elite);
  set('dev-god-boss', devGod.boss);
  set('dev-pause-upgrade', devAllowPauseUpgrade);
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
  change('dev-no-spawn', v => { devNoSpawn = v; devHudStatus(v ? '停止刷怪（波次计时也停）' : '恢复刷怪'); });
  change('dev-god-mob', v => { devGod.mob = v; devGodStatus('小怪'); });
  change('dev-god-elite', v => { devGod.elite = v; devGodStatus('精英'); });
  change('dev-god-boss', v => { devGod.boss = v; devGodStatus('BOSS'); });
  on('dev-elite-group', () => {
    const n = eliteGroupSize();
    spawnEliteGroup(n);
    devHudStatus(`已刷出 ${n} 只精英`);
    devRefreshReadout();
  });
  on('dev-boss-now', () => {
    spawnEnemy('boss', undefined, undefined, { noDrop: true });   // 调试：跳过首王出场演出，立刻入场
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
  on('dev-card-apply', devApplySelectedCard);
  on('dev-card-clear', () => { devSelectedCardId = ''; devRenderCards(); devHudStatus('已取消选择'); });

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
    // V1.31：勾了「允许暂停中升级」后，暂停态也能直接开升级面板，选完卡自动回到暂停
    const fromPause = state === 'paused' && devAllowPauseUpgrade;
    if (state !== 'playing' && !fromPause) {
      devHudStatus(devAllowPauseUpgrade ? '对局中或暂停中才能升级' : '对局进行中才能升级（先继续游戏；也可勾「允许暂停中升级」）');
      return;
    }
    devUpgradeFromPause = fromPause;
    beginLevelUp();    // 与「经验满级」同一条入口：双人时会给每名玩家各抽一份（含客机）
    devHudStatus(fromPause ? '已从暂停中打开升级（选完自动回到暂停）' : '已触发升级选卡');
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
  change('dev-pause-upgrade', v => {
    devAllowPauseUpgrade = v;
    devHudStatus(v ? '已允许在暂停中打开升级面板' : '暂停中不再允许升级');
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
