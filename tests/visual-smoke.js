// 开发测试专用：由隔离 iframe 加载，存档写入由内存适配器接管。
function visualOrientation(land) {
  meta.settings.orient = land ? 'landscape' : 'portrait'; applyOrientation(); renderDisplaySettings();
}
function visualSetup() {
  const orient = meta.settings.orient;
  const theme = meta.settings.theme;
  meta = normalizeMeta(defaultMeta()); meta.settings.sound = false; meta.settings.orient = orient; meta.settings.theme = theme;
  currentUser = '视觉测试'; introPlayed = true;
  meta.coins = 680; meta.bestWave = 24;
  ['login','menu','upgrade','pause','gameover','intro'].forEach(id => document.getElementById(id).classList.add('hidden'));
  applyOrientation();
}
function visualCombat() {
  visualSetup(); meta.equipped.pet = 'dragon'; startGame();
  ['fireball','lightning','ice','scythe','sword'].forEach(addSummon);
  addWeapon('shotgun'); addWeapon('sniper'); addWeapon('laser');
  squad.shield = squad.shieldMax = 40;
  const kinds = Object.keys(ENEMY_TYPES).filter(k => k !== 'boss' && k !== 'treant');
  kinds.forEach((kind, i) => spawnEnemy(kind, squad.x + Math.cos(i * 1.7) * 160, squad.y + Math.sin(i * 1.7) * 240));
  spawnEnemy('boss', squad.x + 110, squad.y - 220);
  skills.slow.owned = true;
  state = 'playing';
}
window.visualScene = scene => {
  try {
    if (scene === 'home') { visualSetup(); state = 'menu'; renderMenu(); showMenu(); }
    else if (scene === 'combat') visualCombat();
    else if (scene === 'upgrade') { visualCombat(); choiceCount = 6; openUpgrade(); }
    else if (scene === 'boss') { visualCombat(); openBossReward(); }
    else if (scene === 'pause') { visualCombat(); pauseGame(); }
    else if (scene === 'gameover') { visualCombat(); gameOver(); }
    else if (scene === 'checks') return visualChecks();
    parent.reportVisual('场景：' + scene + ' · 使用内存存档，未写入账号文件');
  } catch (e) { parent.reportVisual('FAIL: ' + e.stack); }
};
async function visualChecks() {
  const passed = [];
  const assert = (value, label) => { if (!value) throw new Error(label); passed.push(label); };
  try {
    visualCombat();
    // 镰刀轨道跟随可见队伍中心：移动目标点暂时领先时，刀环仍贴着角色。
    const anchorBase = { x: squad.x, y: squad.y };
    soldiers[0].x = anchorBase.x - 18; soldiers[0].y = anchorBase.y + 12;
    const visibleAnchor = scytheAnchor();
    assert(Math.abs(visibleAnchor.x - soldiers[0].x) < 0.001 && Math.abs(visibleAnchor.y - soldiers[0].y) < 0.001, '镰刀轨道以可见角色为中心');
    soldiers[0].x = anchorBase.x; soldiers[0].y = anchorBase.y;
    // 实际执行模拟与绘制，覆盖所有元素、召唤物与敌方状态。
    let frames = 0;
    for (; frames < 180; frames++) {
      if (state === 'upgrade') applyUpgrade(upgrades[0].id);
      if (state === 'bossreward') { document.getElementById('upgrade').classList.add('hidden'); state = 'playing'; }
      squadHp = squadMaxHp; update(1/60); render();
    }
    assert(frames === 180 && Number.isFinite(squadHp), '180 帧混合战斗模拟与渲染');
    assert(terrainCache && terrainCache.width === WORLD.w, '地形缓存已生成');
    enemies.forEach(e => { e.frostT = 1; e.freezeT = 1; e.burnT = 1; }); render();
    assert(true, '冰冻、点燃叠加绘制');
    choiceCount = 6; openUpgrade();
    assert(document.querySelectorAll('#upgrade-cards button').length === 6, '六张升级卡支持键盘操作');
    document.querySelector('#upgrade-cards button').click();
    assert(state === 'playing', '升级后继续战斗');
    openBossReward();
    document.querySelector('#upgrade-cards button').click(); document.querySelector('#upgrade-cards button').click();
    assert(state === 'playing', '首领奖励选择两项');
    pauseGame(); assert(state === 'paused', '暂停'); resumeGame(); assert(state === 'playing', '恢复');
    meta.settings.effects = 'lite'; render(); assert(!richEffects(), '精简环境特效');
    const snapshot = snapshotRun(); restoreRun(snapshot); render(); assert(Number.isFinite(squadHp), '战斗快照恢复');
    gameOver(); assert(state === 'gameover', '结算页');
    visualScene('home');
    const hero = document.getElementById('char-preview');
    assert(hero.getBoundingClientRect().width > 0, '首页角色预览');
    // 切换主题必须落盘到模拟存储，但不得触碰世界数据或地形缓存。
    const worldBefore = JSON.stringify({ obstacles, decorations, vines });
    const cacheBefore = terrainCache;
    const terrainBefore = terrainCache.toDataURL();
    for (const id of Object.keys(UI_THEMES)) {
      assert(selectTheme(id) && document.documentElement.dataset.theme === id, '主题切换：' + UI_THEMES[id].name);
      assert(window.visualSavedUsers.find(u => u.username === currentUser).meta.settings.theme === id, '主题写入存档：' + id);
    }
    assert(JSON.stringify({ obstacles, decorations, vines }) === worldBefore && terrainCache === cacheBefore && terrainCache.toDataURL() === terrainBefore, '主题不改变地形、植物和建筑');
    await loadUsers();
    meta = normalizeMeta(users.find(u => u.username === currentUser).meta); applyTheme();
    assert(meta.settings.theme === 'midnight' && document.documentElement.dataset.theme === 'midnight', '主题存档读取还原');
    for (const mode of ['playing', 'paused', 'upgrade', 'bossreward', 'gameover']) {
      state = mode;
      assert(!selectTheme('paper') && meta.settings.theme === 'midnight', '局内拒绝切主题：' + mode);
    }
    state = 'menu'; selectTheme('forest');
    assert(!document.querySelector('#pause [data-theme-choice]'), '暂停页无主题入口');
    assert(normalizeMeta({ settings: {} }).settings.theme === 'forest' && normalizeMeta({ settings: { theme: 'unknown' } }).settings.theme === 'forest', '旧存档与未知主题兼容');
    const at0 = characterPose(0, 0, false), at1 = characterPose(.7, 0, false);
    assert(at0.tail !== at1.tail && at0.breath !== at1.breath && characterPose(4.61,0,false).blink < .1, '摇尾、呼吸与眨眼姿态');
    assert(JSON.stringify(characterPose(0,0,true)) === JSON.stringify(characterPose(10,2,true)), '减少动态效果时姿态静止');
    const poseCanvas = document.createElement('canvas'); poseCanvas.width = 260; poseCanvas.height = 190;
    for (let hat = 0; hat < CHAR_HAT.length; hat++) for (let size = 0; size < CHAR_SIZE.length; size++) {
      drawCharacter(poseCanvas.getContext('2d'),130,130,36*CHAR_SIZE[size].scale,-.25,{...meta.character,hat,size},{time:4.61});
    }
    assert(true, '全部头饰与体型绘制');
    // 镰刀轨道必须以可见编队中心为锚点，移动跟随插值时不能漂离角色。
    visualSetup(); startGame(); weapons = []; summons = []; enemies = [];
    addSummon('scythe'); squad.x += 120; squad.y += 40; updateSoldiers(1 / 60);
    const anchor = scytheAnchor();
    const centerX = soldiers.reduce((sum, s) => sum + s.x, 0) / soldiers.length;
    const centerY = soldiers.reduce((sum, s) => sum + s.y, 0) / soldiers.length;
    assert(Math.hypot(anchor.x - centerX, anchor.y - centerY) < 0.01, '镰刀以可见角色编队中心环绕');
    // 冲锋伤害独立于普通接触伤害，100 点初始血池命中一次应明显削减。
    squadHp = squadMaxHp = 100; damageSoldier(soldiers[0], BOSS_SKILL.damage);
    assert(Math.round(squadHp) === 30, 'Boss 冲刺一次造成 70 点伤害');
    // 通过真正的飞剑命中产生斩痕，再让主循环在暂停状态清理。
    visualSetup(); startGame(); weapons = []; summons = []; pet = null; enemies = []; obstacles = [];
    addSummon('sword'); spawnEnemy('grunt', squad.x+45, squad.y);
    enemies[0].hp = 1; spawnTimer = 100;
    for (let i=0; i<180 && !swordSlashes.length; i++) { update(1/60); }
    assert(swordSlashes.length > 0 && kills > 0, '飞剑击杀生成短斩痕');
    // 捡走经验后仍要独立清理特效；不会依赖下一次命中挤掉旧条目。
    drops.forEach(d => { d.x=squad.x; d.y=squad.y; }); updateDrops(0);
    pauseGame();
    await new Promise(resolve => setTimeout(resolve, 350));
    render();
    assert(swordSlashes.length === 0, '经验拾取后斩痕自动清零（暂停亦清理）');
    // 真实执行一次冲刺碰撞：初始 100 血池应承受独立的 70 点重击。
    visualSetup(); reset(); state = 'playing';
    enemies = []; spawnEnemy('boss', soldiers[0].x, soldiers[0].y);
    const chargeBoss = enemies[0];
    chargeBoss.skillState = 'dash'; chargeBoss.skillT = .1;
    chargeBoss.skillDirX = 0; chargeBoss.skillDirY = 0; chargeBoss.skillHit = new Set();
    squadHp = 100; squadMaxHp = 100; updateEnemies(1 / 60);
    assert(squadHp === 30, 'Boss 冲刺造成 70 点明确伤害');
    visualScene('home');
    passed.push('完成：' + frames + ' 帧，' + passed.length + ' 项检查通过');
    parent.reportVisual(passed.join(' / '));
  } catch (e) { parent.reportVisual('FAIL: ' + e.stack + '\n通过：' + passed.join(' / ')); }
}
// 等待原有异步存档初始化完成。
setTimeout(() => visualScene('home'), 100);
