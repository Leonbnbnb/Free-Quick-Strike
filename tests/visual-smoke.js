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
    else if (scene === 'devhud') { visualCombat(); meta.devMode = true; setDevHud(true); devTickHud(0.016); }
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
    // V1.34：好友与头像
    // 存档结构 v2 → v3：老档自动补上头像，默认「用角色外观」
    assert(META_SCHEMA === 4 && migrateMeta({ schemaVersion: 2 }).avatar.kind === 'char',
      'v2 老档迁移到 v3 时补上头像，默认「用角色外观」');
    assert(normalizeMeta({ avatar: { kind: 'monster', type: '不存在' } }).avatar.kind === 'char'
      && normalizeMeta({ avatar: 'oops' }).avatar.kind === 'char'
      && normalizeMeta({ avatar: { kind: 'monster', type: 'treant' } }).avatar.kind === 'char',
      '非法头像（不存在的怪物 / 树怪 / 非对象）一律退回「用角色外观」');
    assert(AVATAR_ITEMS[0].name === '角色外观' && AVATAR_ITEMS.length === AVATAR_MONSTERS.length + 1
      && AVATAR_MONSTERS.every((m, i) => {
        const av = { kind: 'monster', type: m.id };
        return validAvatar(av) && avatarIndex(av) === i + 1
          && JSON.stringify(avatarAt(i + 1)) === JSON.stringify(av) && avatarLabel(av) === m.name;
      }),
      '头像选项 = 「角色外观」+ 各款怪物模型，且每一项都能与存档值往返');
    // 头像渲染：两种来源都要真的画出内容，而不是一个空白方块。
    // 每次测量都新开一张画布 —— headless Chrome 的画布抗锯齿与「这块画布第几次被画」有关，
    // 同一画布上第 3 次起会比前两次多出几十个半透明边缘像素（纯 canvas 椭圆也能复现，
    // 与本项目代码无关：transform / globalAlpha / save-restore 栈 / clip 实测都是干净的）。
    const inkOf = av => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const c = cv.getContext('2d');
      drawAvatar(c, 32, 32, 32, av, defaultCharacter(), { time: 0 });
      const d = c.getImageData(0, 0, 64, 64).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    };
    const inkChar = inkOf({ kind: 'char' });
    assert(inkChar > 100 && inkOf({ kind: 'monster', type: 'boss' }) > 100,
      '头像两种来源（角色外观 / 怪物模型）都能画出内容');
    assert(inkOf({ kind: 'monster', type: '不存在' }) === inkChar
      && inkOf({ kind: 'monster', type: 'treant' }) === inkChar,
      '非法怪物头像（不存在的 id / 树怪）按「角色外观」渲染');
    // 好友面板：空数据时三块列表都给出占位提示，红点按未处理申请数显隐
    visualSetup();
    assert(!!document.getElementById('btn-friends')
      && !!document.querySelector('.head-stack #btn-friends'), '主页右上角（设置齿轮正下方）有好友入口');
    friendData.friends = []; friendData.incoming = []; friendData.outgoing = [];
    renderFriends();
    assert(document.querySelectorAll('#friends .friend-empty').length === 3, '没有好友时三块列表都显示占位提示');
    assert(document.getElementById('friend-badge').classList.contains('hidden'), '没有新申请时不显示红点');
    friendData.friends = [{ username: '老队友', avatar: { kind: 'char' } }];
    friendData.incoming = [{ username: '小伙伴', avatar: { kind: 'monster', type: 'elite' } }];
    renderFriends();
    assert(document.querySelectorAll('#friend-list .friend-row').length === 1
      && document.querySelectorAll('#friend-incoming .friend-row').length === 1
      && document.querySelectorAll('#friend-outgoing .friend-empty').length === 1,
      '好友 / 申请按类别分别渲染');
    assert(document.querySelectorAll('#friend-list .avatar-canvas').length === 1,
      '好友列表用「头像 + 名字」渲染好友');
    assert(!document.getElementById('friend-badge').classList.contains('hidden')
      && document.getElementById('friend-badge').textContent === '1', '有未处理的申请时红点显示数量');
    assert(!!document.querySelector('#friend-incoming button[data-friend-act="accept"][data-friend-name="小伙伴"]')
      && !!document.querySelector('#friend-incoming button[data-friend-act="decline"]')
      && !!document.querySelector('#friend-list button[data-friend-act="remove"]'),
      '申请行给出「同意 / 拒绝」，好友行给出「删除」');
    openFriends();
    assert(friendsOpen && !document.getElementById('friends').classList.contains('hidden'), '好友面板能打开');
    closeFriends();
    assert(!friendsOpen && document.getElementById('friends').classList.contains('hidden'), '好友面板能关闭');
    // 聊天框：默认收起；打开后按「我 / 对方」分左右气泡
    assert(!!document.getElementById('chat') && document.getElementById('chat').classList.contains('hidden'),
      '聊天框默认收起');
    renderChat([
      { from: '视觉测试', to: '老队友', text: '你好', t: Date.now() },
      { from: '老队友', to: '视觉测试', text: '在的', t: Date.now() },
    ]);
    assert(document.querySelectorAll('#chat-log .chat-msg.me').length === 1
      && document.querySelectorAll('#chat-log .chat-msg.them').length === 1,
      '聊天记录按「我 / 对方」分左右气泡');
    assert(document.querySelectorAll('#chat-log .chat-time').length === 2, '每条消息带时间戳');
    openChat('老队友');
    closeChat();
    // V1.36：合作房间 —— 房间码校验、房间面板渲染、好友行「邀请进房」、邀请红点
    visualSetup();
    coopRoom = null; coopInvites = [];
    renderCoop();
    assert(!document.getElementById('coop-join').classList.contains('hidden')
      && document.getElementById('coop-room').classList.contains('hidden'),
      '不在房间里时显示「生成房间码 / 加入房间」');
    assert(document.getElementById('coop-code').textContent === '------', '不在房间里时房间码是占位符');
    assert(normCoopCode(' ab cd 23 ') === 'ABCD23' && coopCodeOk(' ab cd 23 '),
      '房间码统一「去空白 + 大写」后再校验（从聊天里粘贴过来也能用）');
    assert(coopCodeOk('ABCD23') && !coopCodeOk('ABCD2') && !coopCodeOk('ABCDE0')
      && !coopCodeOk('ABCDEI') && !coopCodeOk('ab-cd23'),
      '房间码必须是 6 位、字母表内（0 / I 等易混淆字符一律不合法）');
    assert(coopInviteLink('ABCD23').indexOf('room=ABCD23') > 0, '邀请链接带上 ?room=<房间码>');
    // 房主视角：两个席位，空席位有占位文案，好友行多一个「邀请进房」
    friendData.friends = [{ username: '老队友', avatar: { kind: 'char' } }];
    friendData.incoming = []; friendData.outgoing = [];
    coopRoom = { code: 'ABCD23', host: '视觉测试', guest: null, hostReady: false, guestReady: false, hostAvatar: null, guestAvatar: null };
    renderCoop();
    assert(document.getElementById('coop-code').textContent === 'ABCD23', '房间码显示在房间面板上');
    assert(document.querySelectorAll('#coop-players .coop-slot').length === 2
      && !!document.querySelector('#coop-players .coop-slot.empty'), '房间面板给出两个席位，空席位有占位文案');
    assert(document.getElementById('coop-ready').textContent === '准备'
      && document.getElementById('coop-ready').disabled === false, '准备按钮可用');
    assert(!!document.querySelector('#friend-list button[data-friend-act="coopInvite"]'),
      '在房间里且还有空位时，好友行多一个「邀请进房」');
    // 好友进房后：空席位消失，也不再显示「邀请进房」
    coopRoom = { code: 'ABCD23', host: '视觉测试', guest: '老队友', hostReady: false, guestReady: true, hostAvatar: null, guestAvatar: null };
    renderCoop();
    assert(!document.querySelector('#coop-players .coop-slot.empty'), '好友进房后不再有空席位');
    assert(!document.querySelector('#friend-list button[data-friend-act="coopInvite"]'),
      '房间满了就不再显示「邀请进房」');
    assert(document.getElementById('coop-ready').textContent === '准备', '自己还没准备时按钮显示「准备」');
    // 收到的邀请：带「加入 / 忽略」，并计入首页红点
    coopRoom = null;
    coopInvites = [{ code: 'ZZZZ99', inviter: '老队友', avatar: null }];
    renderCoop();
    assert(document.querySelectorAll('#coop-invites .coop-invite').length === 1
      && !!document.querySelector('#coop-invites button[data-coop-act="accept"]')
      && !!document.querySelector('#coop-invites button[data-coop-act="decline"]'),
      '收到的房间邀请带「加入 / 忽略」');
    assert(!document.getElementById('friend-badge').classList.contains('hidden')
      && document.getElementById('friend-badge').textContent === '1', '房间邀请也算首页红点');
    coopRoom = null; coopInvites = [];
    friendData.friends = []; friendData.incoming = []; friendData.outgoing = [];
    renderCoop();
    assert(document.getElementById('friend-badge').classList.contains('hidden'), '房间与邀请都清掉后红点隐藏');
    assert(document.getElementById('coop-invites').classList.contains('hidden'), '没有邀请时邀请区收起');
    // V1.37：双人槽位内核 —— 两名玩家各自独立（build / 小兵 / 血池），命中按 owner 记账
    visualCombat();
    const ally = coopSpawnLocalAlly();
    assert(players.length === 2 && ally.id === 1 && ally.soldiers.length > 0
      && ally.soldiers.every(s => s.owner === ally.id),
      '能追加一名玩家 P2，且他的小兵都归他（soldier.owner === P2.id）');
    // owner 必须存 id 而不是对象引用：引用会让 soldiers ⇄ player 成环，
    // saveRun() 的 JSON.stringify 抛错后静默把 meta.run 置空 ——「返回主菜单后继续」会失效。
    assert(!!JSON.parse(JSON.stringify(snapshotRun())),
      '双人局的对局快照仍可 JSON 序列化（owner 是玩家 id，不成环）');
    assert(ally.stats !== stats && ally.weapons !== weapons && ally.stats.bulletDamage === 1
      && ally.weapons.length === 1,
      'P2 持有自己独立的一份 build（stats / weapons 都不是本机那份）');
    assert(activePlayer === P1 && squad === P1.squad && soldiers === P1.soldiers,
      '世界相位里全局仍代表本机玩家');
    // 零散对局态也要按玩家分：雷电硬性间隔 / 受伤来源统计 / 宠物熟练度（否则双人下互相干扰）
    P1.lightningCdT = 0; P1.lastHurt = ''; P1.petRunExp = 0;
    withCtx(ally, () => { lightningCdT = 2; lastHurt = 'boss'; hurtBy = { boss: 5 }; petRunExp = 7; });
    assert(lightningCdT === 0 && lastHurt === '' && petRunExp === 0 && P1.petRunExp === 0,
      '切到客机槽位只改它自己那份（本机的雷电 CD / 受伤来源 / 宠物熟练度不受影响）');
    assert(ally.lightningCdT === 2 && ally.lastHurt === 'boss' && ally.hurtBy.boss === 5 && ally.petRunExp === 7,
      '客机槽位里存的是它自己的雷电 CD / 受伤来源 / 宠物熟练度');
    withCtx(ally, () => { lightningCdT = 0; lastHurt = ''; hurtBy = {}; petRunExp = 0; });   // 还原，别影响后面
    assert(Math.abs(hpOf(ally) - ally.hp) < 1e-9, 'hpOf 对非本机玩家走它自己的血池');
    // 敌人索敌跨两名玩家
    const nearAlly = nearestSoldier(ally.squad.x, ally.squad.y);
    assert(!!nearAlly && nearAlly.owner === ally.id, '敌人索敌能找到客机最近的兵（跨玩家）');
    const nearMine = nearestSoldier(squad.x, squad.y);
    assert(!!nearMine && nearMine.owner === P1.id, '本机附近仍然锁到本机自己的兵');
    // 扣血按 owner 走：打客机的兵不能扣到本机头上
    const p1HpBefore = squadHp, p2HpBefore = ally.hp;
    damageSoldier(ally.soldiers[0], 10, 'melee');
    assert(Math.abs(ally.hp - (p2HpBefore - 10)) < 1e-6 && Math.abs(squadHp - p1HpBefore) < 1e-9,
      '打客机的兵只扣客机的血池，本机血池一点不动');
    assert(activePlayer === P1, '按 owner 扣血之后全局切回本机');
    // V1.37：范围伤害 / 站位分离必须跨两名玩家（否则客机在小怪与首领面前是「隐形人」）
    const p1PosBackup = soldiers.map(s => ({ x: s.x, y: s.y }));
    const p2PosBackup = ally.soldiers.map(s => ({ x: s.x, y: s.y }));
    soldiers.forEach(s => { s.x = 0; s.y = 0; });                            // 把本机的兵挪开
    ally.soldiers.forEach(s => { s.x = ally.squad.x; s.y = ally.squad.y; });
    assert(anySoldierIn(ally.squad.x, ally.squad.y, 10) === ally.soldiers[0],
      '半径判定能命中客机的小兵（范围内只有它）');
    const allyHpBefore2 = ally.hp;
    bomberBlast(ally.squad.x, ally.squad.y, 60, 10);
    assert(Math.abs(ally.hp - (allyHpBefore2 - 10)) < 1e-6, '自爆怪的爆炸打到客机上（跨玩家范围伤害）');
    const enemiesBackup = enemies.slice();
    enemies = [];
    spawnEnemy('grunt', ally.soldiers[0].x + 2, ally.soldiers[0].y + 2);
    const allyFoe = enemies[0];
    const allyGap0 = Math.hypot(allyFoe.x - ally.soldiers[0].x, allyFoe.y - ally.soldiers[0].y);
    separateEnemiesFromSquad();
    const allyGap1 = Math.hypot(allyFoe.x - ally.soldiers[0].x, allyFoe.y - ally.soldiers[0].y);
    assert(allyGap1 > allyGap0, '叠在客机身上的敌人会被推开（跨玩家站位分离）');
    enemies = enemiesBackup;
    soldiers.forEach((s, i) => { s.x = p1PosBackup[i].x; s.y = p1PosBackup[i].y; });
    ally.soldiers.forEach((s, i) => { s.x = p2PosBackup[i].x; s.y = p2PosBackup[i].y; });
    // 开火产生的子弹带 owner（命中结算时才知道该用谁的 build）
    const bulletFrom = bullets.length;
    spawnEnemy('grunt', ally.squad.x + 44, ally.squad.y);
    updatePlayerCombat(ally, 1 / 60);
    const allyBullets = bullets.slice(bulletFrom);
    assert(allyBullets.length > 0 && allyBullets.every(b => b.owner === ally.id),
      '客机开火产生的子弹带上 owner（命中时会算在客机账上）');
    assert(activePlayer === P1 && squad === P1.squad, '玩家相位跑完，全局切回本机');
    // V1.37：升级「各自选卡」—— 等级共享，但候选各抽各的、落点也各归各的 build
    beginLevelUp();
    const p1Picks = players[0].pendingPick, p2Picks = players[1].pendingPick;
    assert(Array.isArray(p1Picks) && p1Picks.length > 0 && Array.isArray(p2Picks) && p2Picks.length > 0
      && p1Picks !== p2Picks, '每名玩家各抽一份候选（两份数组互相独立）');
    assert(upgrades === p1Picks, '面板摆的是本机那一份候选（与待选槽位是同一份引用）');
    setLocalCards(pickUpgrades(choiceCount));               // 模拟重掷：候选换成新数组
    assert(players[0].pendingPick === upgrades, '重掷后待选槽位跟着换（否则会按旧 id 找不到卡，选了等于没选）');
    const p1Applied = P1.appliedIds.size, p2Applied = players[1].appliedIds.size;
    applyUpgrade(players[0].pendingPick[0].id);
    assert(P1.appliedIds.size === p1Applied + 1, '本机选完的卡落在本机玩家的 build 上');
    assert(state === 'upgrade' && players[1].pendingPick, '队友还没选完，世界继续冻结');
    resolvePick(players[1], players[1].pendingPick[0].id);  // 等效于房主收到客机的 pick:choose
    assert(players[1].appliedIds.size === p2Applied + 1 && P1.appliedIds.size === p1Applied + 1,
      '客机选的卡落在客机的 build 上（不串到本机）');
    assert(state === 'playing' && !players.some(p => p.pendingPick), '所有人都选完才解冻');
    // 客机侧的面板：候选由房主下发（只有 id + 文案），点一下就把选择回给房主
    const savedRole = netRole;
    netRole = 'guest';
    netGuestPick({ level: 2, cards: [{ id: 'fake-1', name: '<b>假卡</b>', desc: '<img src=x>' }, { id: 'fake-2', name: '第二张', desc: '说明' }] });
    const guestCards = document.querySelectorAll('#upgrade-cards .card');
    assert(guestCards.length === 2 && guestCards[0].querySelector('strong').textContent.includes('<b>假卡</b>')
      && !guestCards[0].querySelector('b') && !guestCards[0].querySelector('img'),
      '客机按房主下发的候选渲染卡片，文案一律按纯文本处理（不解析 HTML）');
    guestCards[1].click();
    assert(state === 'playing', '客机点一张卡就收起面板（选择回给房主落地）');
    netRole = savedRole;
    // 全灭判据：两人都倒才算结束
    const keepSoldiers = soldiers.slice();
    soldiers.length = 0;
    state = 'playing';
    update(1 / 60);
    assert(state === 'playing', '只有本机倒下时不算全灭（队友还活着）');
    soldiers.push(...keepSoldiers);
    players = [P1]; activePlayer = P1; captureCtx(P1);   // 还原成单人，别影响后面的断言
    assert(players.length === 1 && activePlayer === P1, '能还原回单人局');
    // 单人局的正式升级入口（经验满 → collectXp → beginLevelUp）与改动前一致：弹面板 + 选完立刻解冻
    state = 'playing';
    xpToNext = 1;
    collectXp(200);
    assert(state === 'upgrade' && P1.pendingPick === upgrades && upgrades.length > 0,
      '单人局经验满级照常弹出三选一（走 beginLevelUp）');
    applyUpgrade(upgrades[0].id);
    assert(state === 'playing' && !P1.pendingPick, '单人局选完立刻解冻，不残留待选');
    xp = 0; xpToNext = 999;
    // V1.37：双人收场链路 —— 房主把结果下发、客机摆结算页、两边都退得回大厅
    coopSpawnLocalAlly();
    state = 'playing';
    const sentEnd = [];
    const sentFx = [];
    const savedSend = netSend;
    netSend = (ev, pl) => {
      if (ev === 'run:end') sentEnd.push(pl);
      if (ev === 'fx') sentFx.push(pl);
      return true;
    };
    netRole = 'host'; netPeer = '客机乙';
    gameOver(false);
    assert(state === 'gameover' && sentEnd.length === 1 && sentEnd[0].won === false
      && typeof sentEnd[0].wave === 'number' && typeof sentEnd[0].cause === 'string',
      '房主收场时把这一局的波次 / 战绩 / 阵亡原因广播给客机（run:end）');
    assert(document.getElementById('btn-restart').textContent === '回到大厅'
      && document.getElementById('btn-change').classList.contains('hidden'),
      '联机局的结算页只留「回到大厅」（「再来一局」要由房主在房间里重新开局）');
    // 客机侧：收到房主的结果 → 用**房主那份**数字摆结算页（客机不跑模拟，也没有「学到的机制」统计）
    netRole = 'guest';
    runLearned = ['这条不该出现在客机的结算页'];
    netOnEnd({ won: false, wave: 7, kills: 42, level: 5, time: 96, coins: 123, cause: 'melee', peerCause: 'shot' });
    const guestStats = document.getElementById('go-stats').textContent;
    assert(state === 'gameover' && document.getElementById('go-title').textContent === '冒险暂告一段落'
      && guestStats.includes('波次 7') && guestStats.includes('击杀 42') && guestStats.includes('01:36'),
      '客机的结算页用房主下发的数字（波次 / 击杀 / 时长）');
    assert(document.getElementById('go-cause').textContent.includes('敌弹')
      && !document.getElementById('go-cause').textContent.includes('近战')
      && !document.getElementById('go-cause').textContent.includes('掉血主要来自'),
      '客机的阵亡原因用它自己那一份（peerCause），不是房主的，也不拼「掉血主要来自」');
    assert(document.getElementById('go-learned').classList.contains('hidden'),
      '客机的结算页不显示「本局学到的机制」（那是房主侧的统计）');
    assert(document.getElementById('go-coins-line').textContent.includes('由房主那一侧结算'),
      '联机局的金币与成绩只在房主那侧结算，客机不重复结算');
    // 看结算页时对方收场：不把结算数据收走
    netOnEnd({ left: true });
    assert(state === 'gameover' && players.length === 1 && P1.id === 0,
      '看结算页时对方收场，结算页保持不动（只还原槽位）');
    // 对局进行中对方收场：退回大厅
    coopSpawnLocalAlly();
    state = 'playing';
    netOnEnd({ left: true });
    assert(state === 'menu' && players.length === 1 && P1.id === 0 && !P1.pendingPick,
      '对局中对方收场 → 退回大厅，槽位还原成单人、待选清空');
    // V1.37：结算页按玩家拆 —— 伤害 / 击杀记在「出手的那个人」头上（客机这才看得到自己打了多少）
    visualSetup(); startGame(); state = 'playing';
    coopSpawnLocalAlly();
    players[0].name = '房主甲'; players[1].name = '客机乙';
    players[0].dmgDealt = 0; players[1].dmgDealt = 0;
    players[0].killsCount = 0; players[1].killsCount = 0;
    enemies = []; enemyBullets = [];
    spawnEnemy('grunt', squad.x + 60, squad.y);
    const dummy = enemies[enemies.length - 1];
    dummy.hp = dummy.maxHp = 1e6;
    hitEnemy(dummy, 100, 0, 0);
    const dHp0 = players[0].dmgDealt;
    assert(dHp0 > 0 && players[1].dmgDealt === 0, '直击伤害记在「当前生效玩家」头上（不串到队友）');
    withCtx(players[1], () => hitEnemy(dummy, 250, 0, 0));
    assert(players[1].dmgDealt > 0 && players[0].dmgDealt === dHp0, '在客机上下文里打出的伤害记在客机头上');
    withCtx(players[1], () => { dummy.hp = 1; hitEnemy(dummy, 500, 0, 0); });
    assert(players[1].killsCount === 1 && players[0].killsCount === 0, '击杀也记在出手的人头上');
    // DoT（点燃 / 割裂）在世界相位按 dt 结算，那时没有上下文 —— 靠施加时记在敌人身上的 burnBy 归属
    enemies = []; enemyBullets = [];
    spawnEnemy('grunt', squad.x + 60, squad.y);
    const dot = enemies[enemies.length - 1];
    dot.hp = dot.maxHp = 1e6;
    players[0].dmgDealt = 0; players[1].dmgDealt = 0;
    players[1].killsCount = 0;
    withCtx(players[1], () => applyBurn(dot, 10, 3));
    assert(dot.burnBy === 1, '点燃记下了施加者（世界相位结算时才知道该算谁的）');
    for (let i = 0; i < 30; i++) { gameTime += 1 / 60; updateEnemies(1 / 60); }
    assert(players[1].dmgDealt > 0 && players[0].dmgDealt === 0, '点燃的持续伤害记在挂点燃的那位玩家头上');
    // 结算页：联机局分「你 / 队友」两行；房主把这份战绩随 run:end 一起下发
    players[0].dmgDealt = 12345; players[0].killsCount = 20;
    players[1].dmgDealt = 6789; players[1].killsCount = 7;
    netRole = 'host';
    gameOver(false);
    const vsHost = document.getElementById('go-versus');
    assert(!vsHost.classList.contains('hidden') && vsHost.textContent.includes('你')
      && vsHost.textContent.includes('12,345') && vsHost.textContent.includes('客机乙')
      && vsHost.textContent.includes('6,789'), '联机结算页按玩家拆出「你 / 队友」两行（伤害带千分位）');
    assert(sentEnd.some(e => Array.isArray(e.stats) && e.stats.length === 2 && e.stats[1].k === 7),
      '房主把按玩家拆的战绩随 run:end 一起下发（客机自己算不出来）');
    // 客机侧：用房主下发的 stats 渲染，且「我」认的是 id 1 那条（客机 players[1].id === 1）
    netRole = 'guest';
    netOnEnd({
      won: false, wave: 7, kills: 42, level: 5, time: 96, coins: 123, cause: 'melee', peerCause: 'shot',
      stats: [{ id: 0, name: '房主甲', d: 900, k: 9 }, { id: 1, name: '客机乙', d: 400, k: 4 }],
    });
    const vsGuest = document.getElementById('go-versus');
    const vsGuestText = vsGuest.textContent;
    assert(!vsGuest.classList.contains('hidden') && vsGuestText.indexOf('400') >= 0 && vsGuestText.indexOf('900') >= 0
      && vsGuestText.indexOf('房主甲') >= 0, '客机的结算页也按玩家拆（用房主下发的战绩，队友那行写名字）');
    netOnEnd({ left: true });
    // V1.37：打击反馈同步 —— 房主攒伤害数字，客机摆到自己那边（客机不跑模拟，否则打怪没有任何反馈）
    netRole = 'host';
    netFxQueue.length = 0;
    spawnDamageNumber(100, 200, 37, '#fff');
    spawnFloatText(110.4, 210, '树怪苏醒！', '#8fe06a');
    assert(netFxQueue.length === 2 && netFxQueue[0][2] === 37 && netFxQueue[0][4] === 0
      && netFxQueue[1][2] === '树怪苏醒！' && netFxQueue[1][4] === 1,
      '房主侧：伤害数字与浮动文字都进了「待下发」的反馈队列');
    shake = 6;
    netSendFx();
    assert(sentFx.length === 1 && sentFx[0].f.length === 2 && sentFx[0].f[0][0] === 100
      && Math.abs(sentFx[0].shake - 6) < 1e-9 && netFxQueue.length === 0,
      '房主把攒下的反馈连同震屏一起发出去（发完清空队列，不重发）');
    netRole = 'guest';
    damageNumbers = []; shake = 0;
    netGuestFx({ shake: 5, f: [[100, 200, 37, '#fff', 0], [110, 210, '树怪苏醒！', '#8fe06a', 1]] });
    assert(damageNumbers.length === 2 && damageNumbers[0].value === 37 && damageNumbers[1].text === '树怪苏醒！'
      && damageNumbers[1].life > damageNumbers[0].life && shake === 5,
      '客机把房主下发的反馈摆到自己的表现层（伤害数字 / 浮动文字 / 震屏）');
    // V1.37：顿帧与打击音效同步 —— 客机不跑逻辑，命中音效与「飞剑贯穿顿帧」都无从产生，只能由房主报过来
    sentFx.length = 0;
    netRole = 'host'; hitStop = 0; netSfxQueue.length = 0; netHitStopPulse = 0;
    sfxHit(); sfxHit(); sfxHit(); sfxThunder();
    assert(netSfxQueue.join(',') === 'hit,thunder',
      '房主侧：同类的打击音效一拍之内只记一条（去重，客机那边还有它自己的节流）');
    triggerHitStop(0.02);
    assert(Math.abs(hitStop - 0.02) < 1e-9 && Math.abs(netHitStopPulse - 0.02) < 1e-9,
      '顿帧走 triggerHitStop 这个统一入口，房主侧照常冻结、同时记下脉冲');
    hitStop = 0;
    netSendFx();
    assert(sentFx.length === 1 && sentFx[0].snd && sentFx[0].snd.join(',') === 'hit,thunder'
      && Math.abs(sentFx[0].stop - 0.02) < 1e-9 && netSfxQueue.length === 0 && netHitStopPulse === 0,
      '房主把打击音效与顿帧脉冲随反馈一起发出去（发完清空，不重发）');
    netRole = 'guest';
    const realHitSfx = SFX_BY_KEY.hit, realThunderSfx = SFX_BY_KEY.thunder;
    const playedSnd = [];
    SFX_BY_KEY.hit = () => playedSnd.push('hit');
    SFX_BY_KEY.thunder = () => playedSnd.push('thunder');
    netGuestFx({ snd: ['hit', 'thunder', 'nope'], stop: 0.02 });
    SFX_BY_KEY.hit = realHitSfx; SFX_BY_KEY.thunder = realThunderSfx;
    assert(playedSnd.join(',') === 'hit,thunder' && Math.abs(hitStop - 0.02) < 1e-9,
      '客机照房主报来的事件重放打击音效，并把顿帧脉冲接到自己的冻结通道（未知 key 直接忽略）');
    // 客机那次顿帧走的就是 loop() 里那条既有通道：hitStop > 0 时跳过 update()（= 不贴快照、不推表现层），
    // 渲染照常 —— 观感与房主那边那一下一致。
    hitStop = 0;
    damageNumbers = []; shake = 0;
    netSend = savedSend;
    netRole = null; netPeer = '';
    // V1.37 修复：客机不跑 update()，所以**表现层的寿命得在它自己的时间片里减**。
    //   漏了这一步的表现就是「伤害数字永远留在屏幕上 + 越积越多、越玩越卡」+「画面一直在抖」。
    netRole = 'guest';
    state = 'playing';
    netSnap = { t: 1, wave: 1, level: 1, xp: 0, xpToNext: 10, kills: 0, runCoins: 0, difficulty: 1, bossKills: 0, players: [], enemies: [], bullets: [], drops: [], enemyBullets: [] };
    damageNumbers = []; shake = 0;
    netGuestFx({ shake: 6, f: [[100, 100, 5, '#fff', 0]] });
    assert(damageNumbers.length === 1 && shake === 6, '客机把房主下发的打击反馈摆上自己的表现层');
    for (let i = 0; i < 60; i++) update(1 / 60);        // 客机时间片跑一秒
    assert(damageNumbers.length === 0 && shake === 0,
      '客机自己也会把伤害数字的寿命与屏幕抖动减掉（不会永远留在屏幕上、也不会一直抖）');
    // 贴快照要复用实体对象、位置平滑逼近（每帧重建上百个对象是客机发卡的主因之一）
    const snapAt = (ex, ey) => ({ t: 2, wave: 1, level: 1, xp: 0, xpToNext: 10, kills: 0, runCoins: 0, difficulty: 1, bossKills: 0, players: [], bullets: [], drops: [], enemyBullets: [],
      enemies: [['grunt', ex, ey, 10, 10, 14, 0, 0, '', 0]] });
    netSnap = snapAt(100, 100); update(1 / 60);
    const eRef = enemies[0];
    netSnap = snapAt(110, 100); update(1 / 60);
    assert(enemies[0] === eRef, '客机贴快照时复用同一批实体对象（不再每帧重建）');
    assert(enemies[0].x > 100 && enemies[0].x < 110, '敌人位置是平滑逼近，不是硬吸附', 'x=' + enemies[0].x);
    netSnap = snapAt(900, 100); update(1 / 60);
    assert(enemies[0].x === 900, '旧实体离新目标太远（下标错位）时直接吸附，不会整排滑过去');
    netSnap = null; damageNumbers = []; shake = 0;
    enemies = []; bullets = []; drops = []; enemyBullets = [];
    netRole = null; state = 'menu';
    // V1.37 修复：`phx_join` 的回执必须按**本次 join 用的 ref** 认，不能写死 '1'。
    //   （netRef 全局自增且不随 netClose 清零 —— 写死 '1' 时，第 2 次及以后的连接会卡满
    //    NET_JOIN_TIMEOUT 才失败，表现为「退出房间后再建一次就连不上」。）
    const savedWS = window.WebSocket, savedAvail = coopAvailable, savedInfo = netInfo;
    const fakes = [];
    class FakeWS {
      constructor() { this.readyState = 1; this.sent = []; fakes.push(this); }
      send(raw) { this.lastMsg = JSON.parse(raw); this.sent.push(this.lastMsg); }
      close() { this.readyState = 3; }
    }
    window.WebSocket = FakeWS;
    coopAvailable = () => true;
    netInfo = { url: 'ws://fake.invalid/realtime', key: 'k', table: 'scores' };
    const shakeHand = async code => {
      const p = netConnect(code, 'host');
      await new Promise(r => setTimeout(r, 0));
      const ws = fakes[fakes.length - 1];
      ws.onopen();
      const ref = ws.sent[0].ref;
      // 服务端按发出去的 ref 回执 —— 这里故意只回「真实的那个 ref」
      ws.onmessage({ data: JSON.stringify({ event: 'phx_reply', ref, payload: { status: 'ok' } }) });
      return { ok: await p, ref };
    };
    const hs1 = await shakeHand('TSTAAA');
    netClose();
    const hs2 = await shakeHand('TSTAAA');
    assert(hs1.ok && hs2.ok && hs1.ref !== hs2.ref,
      '反复连接都能握手成功（join 回执按本次 join 的 ref 认，不是写死的 1）');
    netClose();
    window.WebSocket = savedWS;
    coopAvailable = savedAvail;
    netInfo = savedInfo;
    // 上面 visualCombat() 重掷了世界，terrainCache 因此失效；紧随其后的「主题不改变地形」断言
    // 会读 terrainCache，所以这里先渲染一帧把它重建出来（这不是游戏行为，只是补齐测试前置）。
    render();
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
    // 冲锋伤害独立于普通接触伤害，100 点初始血池命中一次应明显削减（V1.25 起冲刺 70 → 80）。
    squadHp = squadMaxHp = 100; damageSoldier(soldiers[0], BOSS_SKILL.damage);
    assert(Math.round(squadHp) === 100 - BOSS_SKILL.damage, 'Boss 冲刺一次造成 80 点伤害');
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
    // 真实执行一次冲刺碰撞：初始 100 血池应承受独立的 80 点重击。
    // （V1.25 起冲刺改走 dashT / dashSpd / dashDamage / dashKind 这套位移字段，不再是 skillState = 'dash'）
    visualSetup(); reset(); state = 'playing';
    enemies = []; spawnEnemy('boss', squad.x + 300, squad.y, { noDrop: true });
    const chargeBoss = enemies[0];
    // 首领出场会被竞技场拉到玩家 220 距离外，这里把队伍搬到它身上，保证这次冲刺一定命中
    soldiers.forEach(s => { s.x = chargeBoss.x; s.y = chargeBoss.y; });
    chargeBoss.skillDirX = 0; chargeBoss.skillDirY = 0; chargeBoss.skillHit = new Set();
    chargeBoss.dashSpd = 0; chargeBoss.dashT = BOSS_SKILL.dashTime;
    chargeBoss.dashDamage = BOSS_SKILL.damage; chargeBoss.dashKind = 'charge';
    squadHp = 100; squadMaxHp = 100; updateEnemies(1 / 60);
    assert(squadHp === 100 - BOSS_SKILL.damage, 'Boss 冲刺造成 80 点明确伤害');
    // V1.26.2：首领走位应收敛到 orbitR（旧版是「出死区才修正」的开关式，会停在死区边缘）。
    visualSetup(); reset(); state = 'playing';
    enemies = []; enemyBullets = [];
    const bossAnchor = { x: squad.x, y: squad.y };
    spawnEnemy('boss', bossAnchor.x + 260, bossAnchor.y, { bossKind: 'barrage' });   // orbitR = 300
    const orbitBoss = enemies[0];
    const pinSquad = () => { soldiers.forEach(s => { s.x = bossAnchor.x; s.y = bossAnchor.y; }); squad.x = bossAnchor.x; squad.y = bossAnchor.y; squadHp = squadMaxHp; };
    for (let i = 0; i < 900; i++) {
      if (state === 'upgrade') applyUpgrade(upgrades[0].id);
      pinSquad(); update(1 / 60); pinSquad();
    }
    const orbitD = Math.hypot(orbitBoss.x - bossAnchor.x, orbitBoss.y - bossAnchor.y);
    assert(Math.abs(orbitD - 300) < 15, '首领走位收敛到目标距离（orbitR）');
    // V1.26.2：蓄力方向前 40% 追踪、之后锁定 —— 指示带不再一直对着玩家转。
    visualSetup(); reset(); state = 'playing';
    enemies = []; enemyBullets = [];
    spawnEnemy('boss', squad.x + 300, squad.y, { bossKind: 'charge' });
    const aimBoss = enemies[0];
    aimBoss.skillState = 'charge'; aimBoss.skillT = BOSS_SKILL.chargeTime; aimBoss.chargeWind = BOSS_SKILL.chargeTime;
    aimBoss.skillDirX = 0; aimBoss.skillDirY = 0;
    const aimAt = {};
    for (let i = 0; i < 58; i++) {
      // 玩家绕着首领转圈，追踪窗口内方向应该跟着改，窗口外应该一动不动
      const a = Math.PI + i * 0.05;
      const px = aimBoss.x + Math.cos(a) * 300, py = aimBoss.y + Math.sin(a) * 300;
      soldiers.forEach(s => { s.x = px; s.y = py; }); squad.x = px; squad.y = py; squadHp = squadMaxHp;
      update(1 / 60);
      if ([5, 18, 34, 52].includes(i)) aimAt[i] = Math.atan2(aimBoss.skillDirY, aimBoss.skillDirX);
    }
    assert(Math.abs(aimAt[5] - aimAt[18]) > 1e-4, '蓄力前段仍在追踪玩家');
    assert(aimAt[34] === aimAt[52], '蓄力方向在追踪窗口后锁定');
    // V1.26.2：分裂者的突进撕咬真的会触发（旧阈值 116 比它自己的 orbitR 110 还大，一直被误判为「贴脸」）。
    visualSetup(); reset(); state = 'playing';
    enemies = []; enemyBullets = [];
    spawnEnemy('boss', bossAnchor.x + 300, bossAnchor.y, { bossKind: 'splitter' });
    const biteBoss = enemies[0];
    let biteFrames = 0;
    for (let i = 0; i < 600; i++) {
      if (state === 'upgrade') applyUpgrade(upgrades[0].id);
      pinSquad(); update(1 / 60); pinSquad();
      if (biteBoss.dashKind === 'bite') biteFrames++;
    }
    assert(biteFrames > 0, '分裂者会突进撕咬');
    // V1.26.3：连冲段也要能对准玩家 —— 玩家以 240 的速度绕首领跑（最难对准的情形），
    // 每次蓄力在「锁定瞬间」都必须已经指向玩家（旧版从上次冲刺方向继续转，连冲段会偏 68°~120°）。
    visualSetup(); reset(); state = 'playing';
    enemies = []; enemyBullets = [];
    spawnEnemy('boss', bossAnchor.x + 300, bossAnchor.y, { bossKind: 'charge' });
    const comboBoss = enemies[0];
    comboBoss.hp = comboBoss.maxHp * 0.45;
    let lockErrMax = 0, comboSegs = 0, aimLocked = false;
    for (let i = 0; i < 2400; i++) {
      if (state === 'upgrade') applyUpgrade(upgrades[0].id);
      if (enemies.includes(comboBoss)) comboBoss.hp = Math.max(comboBoss.hp, comboBoss.maxHp * 0.45);   // 维持在二阶段
      const a = i / 60 * 1.6;
      const px = comboBoss.x + Math.cos(a) * 150, py = comboBoss.y + Math.sin(a) * 150;
      soldiers.forEach(s => { s.x = px; s.y = py; }); squad.x = px; squad.y = py; squadHp = squadMaxHp;
      const wasCharge = comboBoss.skillState === 'charge';
      update(1 / 60);
      // 只看「锁定瞬间」那一帧的方向误差；锁定之后玩家跑开造成的偏差是设计好的躲避窗口，不算误差。
      if (wasCharge && comboBoss.skillState === 'charge' && !aimLocked) {
        if (comboBoss.chargeWind - comboBoss.skillT >= comboBoss.chargeWind * BOSS_SKILL.trackFrac) {
          aimLocked = true;
          let df = Math.atan2(comboBoss.skillDirY, comboBoss.skillDirX) - Math.atan2(py - comboBoss.y, px - comboBoss.x);
          while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
          lockErrMax = Math.max(lockErrMax, Math.abs(df) * 180 / Math.PI);
          if (comboBoss.chargeCombo > 0) comboSegs++;
        }
      } else if (comboBoss.skillState !== 'charge') aimLocked = false;
    }
    assert(comboSegs > 0, '二阶段连冲段被执行到');
    assert(lockErrMax < 12, '蓄力锁定瞬间方向已对准玩家（含连冲段）');
    // V1.26.3：绕行方向不再周期性翻转 —— 净绕行应等于绝对绕行（旧版来回折返，净绕行≈0）。
    visualSetup(); reset(); state = 'playing';
    enemies = []; enemyBullets = [];
    spawnEnemy('boss', bossAnchor.x + 240, bossAnchor.y, { bossKind: 'barrage' });
    const orbitOnly = enemies[0];
    let net = 0, abs = 0, lastBear = Math.atan2(orbitOnly.y - bossAnchor.y, orbitOnly.x - bossAnchor.x);
    for (let i = 0; i < 1800; i++) {
      if (state === 'upgrade') applyUpgrade(upgrades[0].id);
      pinSquad(); update(1 / 60); pinSquad();
      const bear = Math.atan2(orbitOnly.y - bossAnchor.y, orbitOnly.x - bossAnchor.x);
      let df = bear - lastBear;
      while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
      net += df; abs += Math.abs(df); lastBear = bear;
    }
    assert(Math.abs(net) > Math.abs(abs) * 0.85 && Math.abs(net) > 0.5,
      '首领绕行方向不再来回折返（净 ' + (net * 180 / Math.PI).toFixed(0) + '° / 绝对 ' + (abs * 180 / Math.PI).toFixed(0) + '°）');
    // 宠物蛋（V1.28）：开蛋不保证出宠物 —— 有概率直接孵出，否则给该宠物的能量碎片；满 100 手动合成
    visualSetup(); state = 'menu';
    const realRandom = Math.random;
    meta.coins = 5000; meta.unlocked.pets = ['none']; meta.petDev = {}; meta.eggs = { opened: 0 };
    Math.random = () => 0.01;                                     // 概率判定命中 → 直接孵出
    const luckyEgg = hatchEgg('dragon');
    assert(luckyEgg.ok && luckyEgg.newPet && luckyEgg.pet === 'dragon' && meta.unlocked.pets.includes('dragon'), '指定蛋有概率直接孵出对应宠物');
    assert(meta.coins === 5000 - EGGS.dragon.cost, '孵蛋扣除金币');
    Math.random = () => 0.9;                                      // 概率判定失败 → 给能量碎片
    meta.coins = 5000; meta.unlocked.pets = ['none']; meta.petDev = {};
    const dryEgg = hatchEgg('dragon');
    assert(!dryEgg.newPet && dryEgg.energy > 0 && petDev('dragon').energy === dryEgg.energy, '没孵出时给对应的能量碎片');
    const dryEgg2 = hatchEgg('dragon');
    assert(petDev('dragon').energy === dryEgg.energy + dryEgg2.energy, '能量碎片会累加');
    petDev('dragon').energy = PET_ENERGY_NEED;
    assert(synthesizePet('dragon') && meta.unlocked.pets.includes('dragon') && petDev('dragon').energy === 0, '能量满 100 可手动合成宠物');
    const ownedEgg = hatchEgg('dragon');
    assert(!ownedEgg.newPet && ownedEgg.energy > 0 && petDev('dragon').energy === ownedEgg.energy, '已拥有时开蛋只给能量碎片');
    meta.coins = 0;
    assert(hatchEgg('dragon').ok === false && hatchEgg('dragon').reason === 'coins', '金币不足时不孵化');
    Math.random = realRandom;
    // 宠物选择 / 出战（V1.28 补回）
    visualSetup(); state = 'menu';
    meta.unlocked.pets = ['none', 'dragon', 'fairy'];
    meta.equipped.pet = 'none';
    renderMenu();
    const equipBtn = document.querySelector('#tab-pet [data-act="equip"]');
    assert(!!equipBtn, '宠物页有「出战」按钮');
    equipBtn.click();
    assert(meta.equipped.pet !== 'none', '点击后切换出战宠物');
    meta.coins = 1000;
    openEggHud('dragon');
    assert(!document.getElementById('egg-overlay').classList.contains('hidden'), '孵蛋界面可打开');
    assert(document.querySelectorAll('.egg-chip').length === Object.keys(EGGS).length, '孵蛋界面列出全部蛋种');
    startHatch();
    assert(!!eggAnim && !eggAnim.done, '开蛋动画已启动');
    const eggCv = document.getElementById('egg-canvas');
    for (let i = 1; i <= 36; i++) drawEggStage(eggCv, eggAnim.start + i * 0.05);   // 手动推进（无头环境 rAF 不跑）
    assert(eggAnim.done && eggAnim.phase === 'reveal', '开蛋动画走完并揭晓');
    const eggData = eggCv.getContext('2d').getImageData(0, 0, eggCv.width, eggCv.height).data;
    let eggPainted = 0;
    for (let i = 3; i < eggData.length; i += 4) if (eggData[i] > 8) eggPainted++;
    assert(eggPainted > 1000, '揭晓画面已绘制到 canvas');
    assert(/新宠物|龙魂/.test(document.getElementById('egg-name').textContent), '揭晓文案显示宠物名或能量碎片');
    closeEggHud();
    assert(document.getElementById('egg-overlay').classList.contains('hidden'), '孵蛋界面可关闭');
    // 宠物技能（V1.29）：技能本体改为**局内三选一** —— 选一张才能放；充能制 + 专精加成
    visualSetup(); state = 'playing';
    meta.unlocked.pets = ['none', 'dragon', 'thunder', 'frost'];
    meta.equipped.pet = 'dragon';
    meta.petDev.dragon = { lv: 12, exp: 0, energy: 0, star: 1, affixes: [], talents: { atk: 1, breath: 1, cyclone: 1, awe: 1 } };
    assert(Object.keys(petBonus('dragon').skills).length === 3, '天赋树的三个技能专精节点都在');
    assert(petBonus('fairy').skills.meteor && petBonus('fairy').skills.meteor.power === 1, '没投点的技能没有专精加成');
    startGame(); state = 'playing';
    assert(pet && !pet.skillPick, '局内开局还没有选定宠物技能');
    enemies = []; enemyBullets = [];
    spawnEnemy('elite', squad.x + 200, squad.y, { affixes: [] });
    const markTarget = enemies[enemies.length - 1];
    const petSkillCards = buildUpgradePool().filter(u => /^pet-skill-/.test(u.id));
    assert(petSkillCards.length === 3, '升级池里出现携带宠物的三个技能卡（三选一）');
    // 没选技能 → 攒不起能量也放不出技能
    pet.energy = 0;
    petOnHit({ elem: null }, markTarget, 1);
    const fxBefore = petFx.length;
    updatePetSkills(1 / 60);
    assert(pet.energy === 0 && petFx.length === fxBefore, '没选技能时不攒能量也不释放');
    // 选「龙威」→ 其余两张不再出现
    petSkillCards.find(u => u.id === 'pet-skill-awe').apply();
    assert(pet.skillPick === 'awe', '选中一张宠物技能卡后记录所选项');
    assert(buildUpgradePool().filter(u => /^pet-skill-[a-z]+$/.test(u.id)).length === 0, '选定后其余技能卡不再出现');
    pet.energy = 0;
    petOnHit({ elem: null }, markTarget, 1);
    assert(pet.energy === PET_DEV_CFG.chargePerHit, '宠物普攻命中积攒技能能量');
    pet.skills.awe.cd = 0;
    pet.energy = PET_DEV_CFG.chargeMax;
    updatePetSkills(1 / 60);
    assert(pet.energy === 0 && pet.skills.awe.cd > 0, '能量攒满后释放已选定的技能并清空能量');
    pet.skills.awe.cd = petCdOf(PET_SKILLS.dragon[2], pet.skills.awe);
    const aweCd = pet.skills.awe.cd;
    updatePetSkills(0.5);
    assert(pet.skills.awe.cd < aweCd, '技能冷却随时间推进');
    assert(buildUpgradePool().some(u => u.id === 'pet-skill-cd-awe'), '选定后升级池只出该技能的强化卡');
    const hpPlain = markTarget.hp;
    hitEnemy(markTarget, 100, 0, 0);
    const plainDmg = hpPlain - markTarget.hp;
    const hpMarked = markTarget.hp;
    applyPetVuln(markTarget, 0.5, 6);
    hitEnemy(markTarget, 100, 0, 0);
    assert(Math.abs((hpMarked - markTarget.hp) / plainDmg - 1.5) < 0.01, '龙威标记的敌人受到 1.5 倍伤害');
    enemies = []; enemyBullets = [];
    const breathTargets = [];
    for (let i = 0; i < 3; i++) { spawnEnemy('elite', squad.x + 140 + i * 10, squad.y, { affixes: [] }); breathTargets.push(enemies[enemies.length - 1]); }
    const hpBeforeBreath = breathTargets.map(e => e.hp);
    const breathOk = castPetSkill(PET_SKILLS.dragon[0], pet.skills.breath);
    assert(breathOk, '喷火能释放');
    // 喷火是**持续型**技能：扇形火焰挂在场上按 tick 跳伤，先让时间走够两个 tick
    for (let i = 0; i < 40; i++) { squadHp = squadMaxHp; update(1 / 60); }
    assert(breathTargets.every((e, i) => e.hp < hpBeforeBreath[i]), '喷火随时间持续命中扇形内的全部敌人');
    assert(breathTargets.every(e => e.burnT > 0), '喷火点燃敌人');
    // V1.35 修订：喷火是**宠物**在喷 —— 扇形原点绑宠物（onPet），不再被 follow 拉回玩家中心
    const coneFx = petFx.find(f => f.kind === 'cone');
    assert(!!coneFx && !!coneFx.onPet && !coneFx.follow, '喷火的原点绑在宠物身上（onPet，不再 follow 玩家）');
    squad.x += 120; squad.y += 90;
    updatePetFx(1 / 60);
    const petAt = petPos();
    assert(Math.abs(coneFx.x - petAt.x) < 1e-6 && Math.abs(coneFx.y - petAt.y) < 1e-6
      && Math.abs(coneFx.x - squad.x) > 20 && Math.abs(coneFx.y - squad.y) > 20,
      '喷火跟着宠物走，不再从玩家身上喷出');
    // V1.35 修订：技能自己打到的敌人**不回充技能能量**。喷火是多段 + 多目标，会把自己瞬间充满 ——
    //   这就是「喷火触发频率高得离谱」的根因，能量只认普攻命中。
    pet.energy = 0;
    petSkillHit(breathTargets[0], 5, 0, 0);
    assert(pet.energy === 0, '技能伤害不给技能回充能量（只有普攻命中才攒）');
    explode({ x: breathTargets[0].x, y: breathTargets[0].y, aoe: 70, dmg: 5, burnDps: 0, burnTime: 0, petShot: true, skillShot: true });
    assert(pet.energy === 0, '技能子弹（火球）爆炸回充同样不算能量');
    enemies = [breathTargets[0]];
    pet.energy = 0;
    explode({ x: breathTargets[0].x, y: breathTargets[0].y, aoe: 70, dmg: 5, burnDps: 0, burnTime: 0, petShot: true });
    assert(pet.energy === PET_DEV_CFG.chargePerHit, '普攻子弹的范围爆炸仍然攒能量');
    // 雷电虫：连锁闪电弹跳 + 雷电场；冰冻精灵：霜冻新星冻结 + 冰霜领域
    meta.equipped.pet = 'thunder';
    meta.petDev.thunder = { lv: 12, exp: 0, energy: 0, star: 1, affixes: [], talents: {} };
    startGame(); state = 'playing';
    enemies = []; enemyBullets = [];
    spawnEnemy('elite', squad.x + 150, squad.y, { affixes: [] });
    const chainA = enemies[enemies.length - 1];
    spawnEnemy('elite', squad.x + 230, squad.y, { affixes: [] });
    const chainB = enemies[enemies.length - 1];
    const chainHb = chainB.hp;
    firePetBullet(petPos().x, petPos().y, chainA);
    let sawArc = false;
    for (let i = 0; i < 30 && !sawArc; i++) { squadHp = squadMaxHp; update(1 / 60); if (petFx.some(f => f.kind === 'arc')) sawArc = true; }
    assert(sawArc && chainB.hp < chainHb, '雷电虫普攻弹跳到相邻敌人');
    meta.equipped.pet = 'frost';
    meta.petDev.frost = { lv: 12, exp: 0, energy: 0, star: 1, affixes: [], talents: {} };
    startGame(); state = 'playing';
    enemies = []; enemyBullets = [];
    spawnEnemy('elite', squad.x + 150, squad.y, { affixes: [] });
    const frostTarget = enemies[enemies.length - 1];
    const realRandom2 = Math.random;
    Math.random = () => 0;
    firePetBullet(petPos().x, petPos().y, frostTarget);
    for (let i = 0; i < 20; i++) { squadHp = squadMaxHp; update(1 / 60); }
    Math.random = realRandom2;
    assert(frostTarget.frostT > 0 && frostTarget.frostMul < 1, '冰冻精灵普攻减速敌人');
    // 新技能（V1.29）：雷电虫连锁闪电弹跳 4 段 / 冰冻精灵霜冻新星冻结
    meta.equipped.pet = 'thunder';
    meta.petDev.thunder = { lv: 12, exp: 0, energy: 0, star: 1, affixes: [], talents: {} };
    startGame(); state = 'playing';
    enemies = []; enemyBullets = [];
    const chainHp = [];
    for (let i = 0; i < 4; i++) { spawnEnemy('elite', squad.x + 120 + i * 70, squad.y, { affixes: [] }); chainHp.push(enemies[enemies.length - 1].hp); }
    const realRandom3 = Math.random;
    Math.random = () => 0;                                  // 弹跳判定必中（nearestEnemyExcept 不看随机，这里只是固定麻痹判定）
    const chainOk = castPetSkill(PET_SKILLS.thunder[0], pet.skills.chain);
    Math.random = realRandom3;
    assert(chainOk && enemies.every((e, i) => e.hp < chainHp[i]), '连锁闪电在 4 个敌人之间弹跳');
    meta.equipped.pet = 'frost';
    meta.petDev.frost = { lv: 12, exp: 0, energy: 0, star: 1, affixes: [], talents: {} };
    startGame(); state = 'playing';
    enemies = []; enemyBullets = [];
    spawnEnemy('elite', squad.x + 120, squad.y, { affixes: [] });
    const novaTarget = enemies[enemies.length - 1];
    const novaOk = castPetSkill(PET_SKILLS.frost[0], pet.skills.nova);
    assert(novaOk && novaTarget.freezeT > 0, '霜冻新星冻结周围敌人');
    enemies = []; enemyBullets = []; petFx = [];
    spawnEnemy('elite', squad.x + 150, squad.y, { affixes: [] });
    const chillTarget = enemies[enemies.length - 1];
    const chillOk = castPetSkill(PET_SKILLS.frost[1], pet.skills.chill);
    assert(chillOk && petFx.some(f => f.kind === 'field' && f.freezeChance > 0), '冰霜领域铺在敌人脚下（带冻结判定）');
    // 需求 8（V1.32）：宠物吃「自己那条元素线」的**独占增伤**。元素伤害乘区本来就在乘，这里测的是
    // 闪电线独占的「雷电伤害 +30%」（s.dmgMul，无上限 → 所以折半 + 封顶）。
    // 冰霜领域：吃「霜冻附魔」，减速时长取 max（强度仍取更强的宠物自身值，不被削弱）。
    const chillNoEnch = petFx.filter(f => f.kind === 'field').pop();
    petFx = [];
    markPick('enchant-frost');
    castPetSkill(PET_SKILLS.frost[1], pet.skills.chill);
    const chillEnch = petFx.filter(f => f.kind === 'field').pop();
    assert(chillNoEnch.slowTime === 1 && chillEnch.slowTime === 2 && chillEnch.slowMul === chillNoEnch.slowMul,
      '冰霜领域吃「霜冻附魔」：减速时长 1s → 2s，强度仍取更强的宠物自身值（0.45）');
    // V1.35 修订：协同「冰霜火」的触发条件要跟着它的前置走 —— 前置是「霜冻附魔」，而那张卡给的是
    //   **减速**而不是冰冻；只把效果挂在 tryApplyFreeze 上的话，凑齐前置也看不到任何效果。
    visualSetup(); reset(); state = 'playing';
    enemies = []; enemyBullets = []; drops = [];
    spawnEnemy('grunt', squad.x + 80, squad.y);
    const ffTarget = enemies[enemies.length - 1];
    tryApplyFrost(ffTarget, FROST_MUL, FROST_TIME);
    assert(!(ffTarget.burnT > 0), '没拿「冰霜火」时施加霜冻不会点燃');
    ffTarget.burnT = 0; ffTarget.burnDps = 0; ffTarget.resistFrostT = 0;
    stats.frostfire = true;
    assert(tryApplyFrost(ffTarget, FROST_MUL, FROST_TIME) && ffTarget.burnT > 0
      && Math.abs(ffTarget.burnDps - BURN_DPS * 0.5) < 1e-9,
      '拿到「冰霜火」后施加霜冻（减速）同时点燃，点燃 dps 为原本的一半');
    const ffDef = BOSS_BUFFS.find(b => b.id === 'syn-frostfire');
    pickCount['enchant-fire'] = 1; pickCount['enchant-frost'] = 1;
    assert(!!ffDef && ffDef.req(), '「冰霜火」前置：火焰附魔 + 霜冻附魔 都拿到才进首领奖励池');
    pickCount['enchant-frost'] = 0;
    assert(!ffDef.req(), '缺「霜冻附魔」时「冰霜火」不出现');
    pickCount['enchant-frost'] = 1; pickCount['enchant-fire'] = 0;
    assert(!ffDef.req(), '缺「火焰附魔」时「冰霜火」不出现');
    meta.equipped.pet = 'thunder';
    meta.petDev.thunder = { lv: 1, exp: 0, energy: 0, star: 1, affixes: [], talents: {} };
    startGame(); state = 'playing';
    summons = [];
    const dmgNoLine = petSkillDmg(100, 1);
    addSummon('lightning'); summonMul('lightning', 1.3);
    const dmgCard1 = petSkillDmg(100, 1);
    summonMul('lightning', 1.3); summonMul('lightning', 1.3);
    const dmgCard3 = petSkillDmg(100, 1);
    for (let i = 0; i < 3; i++) summonMul('lightning', 1.3);
    const dmgCard6 = petSkillDmg(100, 1);
    assert(Math.abs(dmgCard1 / dmgNoLine - 1.15) < 1e-9 && Math.abs(dmgCard3 / dmgNoLine - 1.45) < 1e-9,
      '雷电虫技能吃「雷电伤害 +30%」：1 张 ×1.15 / 3 张 ×1.45（按 ELE_SHARE 折半）');
    assert(Math.abs(dmgCard6 / dmgNoLine - 1.5) < 1e-9, '宠物从元素线拿到的增伤封顶 +50%');
    meta.equipped.pet = 'frost';
    meta.petDev.frost = { lv: 1, exp: 0, energy: 0, star: 1, affixes: [], talents: {} };
    startGame(); state = 'playing';
    summons = [];
    const frostNoLine = petSkillDmg(100, 1);
    addSummon('lightning'); summonMul('lightning', 1.3);
    assert(Math.abs(petSkillDmg(100, 1) / frostNoLine - 1) < 1e-9, '非雷电宠物不吃闪电线（冰冻精灵技能伤害不变）');
    // V1.33：四条「专精」链（火焰 / 雷电 / 飞剑 / 镰刀）—— 三段纯数值成长，
    // `desc` 显示的是**这次选完之后的累计值**（不是本次增量）。
    visualSetup(); meta.equipped.pet = 'none';
    startGame(); state = 'playing';
    summons = []; enemies = []; enemyBullets = [];
    const cardOf = id => buildUpgradePool().find(u => u.id === id);
    assert(!cardOf('fire-mastery') && !cardOf('lightning-mastery') && !cardOf('sword-mastery') && !cardOf('scythe-mastery'),
      '四条专精卡都要先有对应线（点燃来源 / 雷电 / 飞剑 / 镰刀）才出现');
    markPick('enchant-fire');                                    // 火焰专精需要先有点燃来源
    const fm1 = cardOf('fire-mastery');
    assert(fm1 && fm1.desc.indexOf('+3（固定值）') > 0 && fm1.desc.indexOf('+0.3s') > 0,
      '火焰专精卡面显示第 1 段的累计值（+3 / +0.3s）');
    fm1.apply();
    assert(stats.fireFlat === 3 && stats.fireBurnTime === 0.3, '火焰专精第 1 段落地：+3 火焰伤害 / 点燃 +0.3s');
    const fm2 = cardOf('fire-mastery');
    assert(fm2.desc.indexOf('+6（固定值）') > 0, '火焰专精第 2 段显示累计 +6（不是增量 +3）');
    fm2.apply(); cardOf('fire-mastery').apply();
    assert(stats.fireFlat === 12 && stats.fireBurnTime === 1.5 && !cardOf('fire-mastery'),
      '火焰专精三段累计 +12 / +1.5s，选满后不再出现');
    spawnEnemy('grunt', squad.x + 40, squad.y);
    const burnTarget = enemies[enemies.length - 1];
    applyBurn(burnTarget, 0, 0);
    assert(burnTarget.burnDps === 0, '没有点燃来源时「火焰专精」不会凭空挂上点燃');
    applyBurn(burnTarget, BURN_DPS, BURN_TIME);
    assert(Math.abs(burnTarget.burnDps - (BURN_DPS + 12)) < 1e-6 && Math.abs(burnTarget.burnT - (BURN_TIME + 1.5)) < 1e-6,
      '固定值加进了点燃的每秒伤害与时长');
    addSummon('lightning');
    const lm1 = cardOf('lightning-mastery');
    assert(lm1.desc.indexOf('30% 范围伤害（半径 90）') > 0 && stats.lightningSplashR === 0,
      '闪电专精第 1 段卡面：30% 范围伤害 / 半径 90');
    lm1.apply();
    assert(stats.lightningMastery === 0.10 && stats.lightningSplashR === 90 && stats.lightningSplashPct === 0.30,
      '闪电专精第 1 段落地：+10% 闪电伤害 + 半径 90 的 30% 范围伤害');
    cardOf('lightning-mastery').apply(); cardOf('lightning-mastery').apply();
    assert(stats.lightningMastery === 0.35 && stats.lightningSplashR === 180 && stats.lightningSplashPct === 0.60,
      '闪电专精三段累计：+35% 闪电伤害 / 半径 180 / 60% 范围伤害');
    enemies = []; enemyBullets = [];
    spawnEnemy('elite', squad.x + 300, squad.y); const boltHit = enemies[enemies.length - 1];
    spawnEnemy('elite', squad.x + 380, squad.y); const boltNear = enemies[enemies.length - 1];
    spawnEnemy('elite', squad.x + 700, squad.y); const boltFar = enemies[enemies.length - 1];
    // 精英有概率随机带护盾，而护盾会先把溅射伤害吸收掉、hp 一点不掉 —— 这条断言测的是「溅射半径」，
    // 所以把三个靶子的护盾清掉，否则测试会随刷新随机挂（实测约 1/10 概率）。
    [boltHit, boltNear, boltFar].forEach(e => { e.hp = e.maxHp = 1e6; e.shield = 0; e.shieldMax = 0; });
    const nearHp0 = boltNear.hp, farHp0 = boltFar.hp;
    strikeEnemy(boltHit, 100, new Set());
    assert(boltNear.hp < nearHp0 && boltFar.hp === farHp0, '落雷范围伤害只波及半径内的敌人（半径外不掉血）');
    addSummon('sword'); addSummon('scythe');
    cardOf('sword-mastery').apply();
    cardOf('scythe-mastery').apply();
    assert(stats.swordFlat === 2 && Math.abs(stats.swordHitCdMul - 0.92) < 1e-9, '飞剑专精第 1 段：+2 固定伤害 / 命中冷却 -8%');
    assert(stats.scytheFlat === 2 && Math.abs(stats.scytheHitCdMul - 0.92) < 1e-9, '镰刀专精第 1 段：+2 固定伤害 / 命中冷却 -8%');
    cardOf('sword-mastery').apply(); cardOf('scythe-mastery').apply();
    cardOf('sword-mastery').apply(); cardOf('scythe-mastery').apply();
    assert(stats.swordFlat === 9 && Math.abs(stats.swordHitCdMul - 0.75) < 1e-9
      && stats.scytheFlat === 9 && Math.abs(stats.scytheHitCdMul - 0.75) < 1e-9,
      '飞剑 / 镰刀专精三段累计：+9 固定伤害 / 命中冷却 -25%');
    // V1.31：宠物技能特效分层绘制（此前 drawPetFx 从未被 render 调用，特效全不可见）+ 进化阶段
    meta.equipped.pet = 'fairy';
    meta.petDev.fairy = { lv: 12, exp: 0, energy: 0, star: 1, affixes: [], talents: {} };
    startGame(); state = 'playing';
    enemies = []; enemyBullets = []; petFx = [];
    spawnEnemy('elite', squad.x + 120, squad.y, { affixes: [] });
    const lavaOk = castPetSkill(PET_SKILLS.fairy[1], pet.skills.lava);
    assert(lavaOk && petFx.some(f => f.kind === 'lava' && f.maxLife === PET_SKILLS.fairy[1].dur), '熔岩在目标脚下铺开 6 秒熔岩池');
    assert(PET_FX_GROUND.has('lava') && PET_FX_GROUND.has('field') && PET_FX_GROUND.has('nova')
      && !PET_FX_GROUND.has('meteor') && !PET_FX_GROUND.has('cone'), '宠物特效按地面 / 空中两层分派绘制');
    assert(petStage({ lv: 1, star: 1 }) === 0 && petStage({ lv: 10, star: 1 }) === 1
      && petStage({ lv: 20, star: 1 }) === 2 && petStage({ lv: 1, star: 5 }) === 2, '宠物进化分幼体 / 成体 / 究极体三档');
    // 装备系统（V1.31）：四槽位（武器 / 护甲 / 饰品 ×2）+ 主属性多元化 + 武器专属词条 + 洗练
    visualSetup(); state = 'menu';
    meta.coins = 99999;
    meta.unlocked.armor = ['none']; meta.unlocked.trinket = ['none']; meta.unlocked.weapons = ['rifle'];
    meta.equipped.armor = 'none'; meta.equipped.trinket1 = 'none'; meta.equipped.trinket2 = 'none';
    meta.gear = {};
    unlock('armor', 'armor', 'scale', 1400);
    assert(meta.equipped.armor === 'scale' && gearAffixes('scale').length === 1, '解锁装备只给 1 条词条（其余靠洗练解锁）');
    // 洗练：累计 5 次解锁第 2 条、15 次解锁第 3 条，每次扣基础 200
    let costSum = 0;
    for (let i = 0; i < 4; i++) { costSum += gearRollCost('scale'); refineGear('scale'); }
    assert(gearAffixes('scale').length === 1 && gearState('scale').rolls === 4, '累计洗练 4 次还没解锁第 2 条');
    costSum += gearRollCost('scale'); refineGear('scale');
    assert(gearAffixes('scale').length === 2, '累计洗练 5 次解锁第 2 条词条');
    for (let i = 0; i < 10; i++) { costSum += gearRollCost('scale'); refineGear('scale'); }
    assert(gearAffixes('scale').length === 3 && meta.coins === 99999 - 1400 - costSum, '累计洗练 15 次解锁第 3 条（每次扣 200）');
    assert(new Set(gearAffixes('scale').map(a => a.id)).size === 3, '同一件装备的词条不重复');
    assert(gearAffixes('scale').every(a => a.t >= 0 && a.t <= 2), '每条数值词条都带 0~2 的档位');
    // 锁定：费用翻倍，且锁定那一条不会被洗练换掉
    const keptId = gearAffixes('scale')[0].id;
    toggleGearLock('scale', 0);
    assert(gearRollCost('scale') === GEAR_REROLL_COST * 2, '锁定 1 条后洗练费用翻倍');
    refineGear('scale');
    assert(gearAffixes('scale')[0].id === keptId, '锁定后的词条不会被洗练换掉');
    toggleGearLock('scale', 0);
    assert(gearRollCost('scale') === GEAR_REROLL_COST, '解除锁定后洗练费用恢复');
    // V1.35 修订：洗练 / 锁定 / 换装 都要**留在当前那一层**。此前这几处都调 renderMenu()，
    //   而它会把 equipLv / petLv 复位到 'stage' —— 在铁砧页点一次洗练就被弹回装备台。
    equipLv = 'anvil'; equipSelSlot = 'armor'; equipSelId = 'scale';
    refineGear('scale');
    assert(equipLv === 'anvil', '洗练后仍停在铁砧页（不会被弹回装备台）');
    toggleGearLock('scale', 1);
    assert(equipLv === 'anvil', '锁定词条后仍停在铁砧页');
    toggleGearLock('scale', 1);
    equipLv = 'list';
    equip('armor', 'armor', 'scale');
    assert(equipLv === 'list', '换装后仍停在候选列表');
    // 两个饰品槽：分别装备不同的饰品（物品池已并入饰品池）
    unlock('trinket', 'trinket1', 'ring', 1500);
    unlock('trinket', 'trinket2', 'tonic', 1200);
    assert(meta.equipped.trinket1 === 'ring' && meta.equipped.trinket2 === 'tonic', '饰品 1 / 饰品 2 可各装一件');
    assert(equipLv === 'list', '解锁装备后仍停在候选列表');
    equipLv = 'stage'; equipSelId = '';
    // 武器也进装备体系：解锁别的武器会自动装备并 roll 1 条武器专属词条
    unlock('weapons', 'weapon', 'sniper', 1200);
    assert(meta.equipped.weapon === 'sniper' && gearAffixes('sniper').length === 1, '解锁武器会自动装备并给 1 条词条');
    assert(WEAPON_AFFIXES[gearAffixes('sniper')[0].id] !== undefined, '武器词条取自专属池 WEAPON_AFFIXES');
    meta.equipped.weapon = 'rifle';
    // 词条生效：数值类走独立乘区（不再与局内卡共用加算区），机制型各走自己的钩子
    meta.gear = {
      scale: { affixes: [{ id: 'bullet', t: 2 }, { id: 'ele', t: 0 }, { id: 'hp', t: 1 }], rolls: 15, lock: [false, false, false] },
      ring: { affixes: [{ id: 'vuln', t: 1 }, { id: 'pierce', t: 0 }, { id: 'sunder', t: 1 }], rolls: 15, lock: [false, false, false] },
      tonic: { affixes: [{ id: 'thorns', t: 1 }, { id: 'speed', t: 0 }, { id: 'immune', t: 1 }], rolls: 15, lock: [false, false, false] },
      rifle: { affixes: [{ id: 'wrange', t: 1 }, { id: 'wrate', t: 0 }], rolls: 5, lock: [false, false] },
    };
    meta.coins = 0;
    startGame(); state = 'playing';
    assert(Math.abs(stats.damageTaken - 0.72 * 1.15) < 1e-6, '龙鳞甲的受伤减免与狂战戒指的受伤代价共同生效');
    assert(Math.abs(stats.maxHp - 1.10 * 1.25 * 1.08) < 1e-6, '龙鳞甲 / 生命药剂 / 「健壮」词条一起抬高血池上限');
    assert(Math.abs(stats.vulnGear - 0.08) < 1e-6 && stats.vuln === 0, '「破甲」走独立乘区（不写进加算区）');
    assert(Math.abs(dmgBonus.bullet) < 1e-6 && Math.abs(dmgBase.bullet - 1.3 * 1.12) < 1e-6, '「弹道」高档词条乘进独立乘区（×1.12）');
    assert(Math.abs(dmgBase.ele - 1.3 * 1.06) < 1e-6, '饰品主属性与「元素」词条一起作用于元素乘区');
    assert(Math.abs(stats.sunder - 0.25) < 1e-6 && Math.abs(stats.thorns - 0.8) < 1e-6, '「裂甲 / 荆棘」机制词条写进 stats');
    assert(Math.abs(stats.moveSpeed - 1.05) < 1e-6 && Math.abs(stats.invulnDuration - 0.15) < 1e-6, '「疾行 / 坚韧」词条生效');
    assert(weapons[0].pierce === (WEAPON_DEFS.rifle.pierce || 0) + 1, '「破势」词条给武器 +1 穿透');
    assert(Math.abs(weapons[0].rangeMul - 1.08) < 1e-6, '武器专属词条「远射」中档只作用在这把武器上（×1.08）');
    assert(Math.abs(weapons[0].rateMul - 1.03) < 1e-6, '武器专属词条「迅捷」低档抬升该武器射速（×1.03，V1.35 已削弱）');
    assert(WEAPON_AFFIXES.wpower === undefined && WEAPON_AFFIXES.wcount === undefined, '武器词条池不含直接增伤 / 增弹丸词条（防滚雪球）');
    // 「裂甲」：对带护盾的敌人加伤（同一发伤害的实际掉血+掉盾比无盾时高 25%）
    enemies.length = 0;
    spawnEnemy('grunt', squad.x + 120, squad.y);
    const foe = enemies[enemies.length - 1];
    foe.shieldMax = 0; foe.shield = 0;
    const plain0 = { hp: foe.hp, shield: foe.shield };
    hitEnemy(foe, 10, 0, 0);
    const effPlain = (plain0.hp - foe.hp) + (plain0.shield - foe.shield);
    foe.hp = foe.maxHp; foe.shieldMax = 10; foe.shield = 10;
    const shield0 = { hp: foe.hp, shield: foe.shield };
    hitEnemy(foe, 10, 0, 0);
    const effShielded = (shield0.hp - foe.hp) + (shield0.shield - foe.shield);
    assert(effShielded > effPlain * 1.2, '「裂甲」对带护盾的敌人提高伤害');
    // 「荆棘」：受伤时对周围敌人反伤（按本次伤害的比例）
    enemies.length = 0;
    spawnEnemy('grunt', squad.x + 30, squad.y);
    const thornFoe = enemies[enemies.length - 1];
    const thornHp = thornFoe.hp;
    squad.invulnT = 0; squad.shield = 0; squadHp = squadMaxHp;
    damageSoldier(soldiers[0], 20);
    assert(thornFoe.hp <= thornHp - 10 || thornFoe.dead, '「荆棘」受伤时对周围敌人反伤');
    assert(WEAPON_DEFS.sniper.dmg === 34, '狙击枪单发伤害已下调到 34');
    // 旧存档迁移：旧「装备」槽按 id 分流到 护甲 / 饰品，旧纯 id 词条数组升级为新结构
    const migrated = normalizeMeta({ coins: 0, unlocked: { weapons: ['rifle'], equipment: ['none', 'leather', 'charm'], items: ['none'] }, equipped: { weapon: 'rifle', equipment: 'charm', item: 'none' } });
    assert(migrated.unlocked.armor.includes('leather') && migrated.unlocked.trinket.includes('charm'), '旧「装备」解锁项分流到护甲 / 饰品');
    assert(migrated.equipped.trinket1 === 'charm' && migrated.equipped.armor === 'none' && migrated.equipped.equipment === undefined, '旧出战装备迁移到饰品 1 槽');
    assert(migrated.gear.leather.affixes.length === 1 && migrated.gear.leather.rolls === 0, '迁移时给已解锁装备补 1 条词条（洗练 0 次）');
    const oldThree = normalizeMeta({ coins: 0, unlocked: { weapons: ['rifle'], armor: ['none', 'scale'], items: ['none'] }, equipped: { weapon: 'rifle', armor: 'scale', item: 'none' }, gear: { scale: ['hp', 'bullet', 'guard'] } });
    assert(oldThree.gear.scale.affixes.length === 3 && oldThree.gear.scale.rolls === 15, '旧纯 id 词条数组升级为新结构并补足洗练次数');
    assert(oldThree.gear.scale.affixes.every(a => a.t === 1) && oldThree.gear.scale.affixes[0].id === 'hp', '旧词条数值映射到中档（t1）');
    // V1.31 迁移：物品槽取消并入饰品池，饰品扩为 2 槽
    const mig31 = normalizeMeta({ coins: 0, unlocked: { weapons: ['rifle'], armor: ['none'], trinket: ['none', 'charm'], items: ['none', 'orb'] }, equipped: { weapon: 'rifle', armor: 'none', trinket: 'charm', item: 'orb' } });
    assert(mig31.equipped.trinket1 === 'charm' && mig31.equipped.trinket2 === 'orb', '旧「饰品 / 物品」两槽迁移到饰品 1 / 饰品 2');
    assert(mig31.equipped.item === undefined && mig31.equipped.trinket === undefined, '旧的 item / trinket 键已清理');
    assert(mig31.unlocked.trinket.includes('orb') && mig31.unlocked.items === undefined, '旧 unlocked.items 并入 unlocked.trinket');
    const migBad = normalizeMeta({ coins: 0, unlocked: { weapons: ['rifle'], armor: ['none'], trinket: ['none'] }, equipped: { weapon: 'ghost', armor: 'nope', trinket1: 'none', trinket2: 'none' }, gear: {} });
    assert(migBad.equipped.weapon === 'rifle' && migBad.equipped.armor === 'none', '存档里已不存在的装备 id 会退回空槽');
    // V1.31：首个 Boss 的出场演出（玩家脚底预警圈 → 读秒 → 空中砸落）
    visualSetup(); meta.equipped.pet = 'none';
    startGame(); state = 'playing';
    enemies = []; enemyBullets = []; bombs = [];
    spawnEnemy('boss');                                   // 自然刷出（不给坐标）→ 触发演出
    assert(bossDrop && !enemies.some(e => e.type === 'boss'), '首王先读秒预警，暂不入场');
    assert(Math.hypot(bossDrop.x - squad.x, bossDrop.y - squad.y) < 70, '预警圈落在玩家脚底附近');
    const dropKind = bossDrop.pending.kind;
    updateBossDrop(BOSS_DROP.wind);                       // 把读秒走完
    assert(!bossDrop && enemies.some(e => e.type === 'boss' && e.kind === dropKind), '读秒结束后首领从空中砸落入场');
    assert(bossDropDone, '首王出场演出每局只播一次');
    // V1.31：自动攻击目标优先级（最近 / 最强 / 首领优先 / 精英优先）
    enemies = []; enemyBullets = []; bossArena = null;
    spawnEnemy('grunt', squad.x + 60, squad.y);
    const nearFoe = enemies[enemies.length - 1];
    spawnEnemy('boss', squad.x + 300, squad.y, { noDrop: true });
    const farBoss = enemies[enemies.length - 1];
    aimMode = 'nearest';
    assert(pickTarget(squad.x, squad.y, Infinity) === nearFoe, '「最近」档打最近的小怪');
    aimMode = 'boss';
    assert(pickTarget(squad.x, squad.y, Infinity) === farBoss, '「首领优先」档会越过小怪打首领');
    aimMode = 'strong';
    assert(pickTarget(squad.x, squad.y, Infinity) === farBoss, '「最强」档打血量上限最高的敌人');
    aimMode = 'nearest'; cycleAimMode();
    assert(aimMode === 'strong', '点按钮 / Tab 可循环切换目标优先级');
    aimMode = 'nearest';
    // V1.32 体检补的断言：目标优先级必须真的作用在**武器**上（此前只有宠物接了 pickTarget，武器还在打最近的）
    // 先把两个候选摆到明显不同的方向，避免「角度太接近 → 分不清打的是谁」
    nearFoe.x = squad.x + 40; nearFoe.y = squad.y - 120;      // 贴脸小怪（左上）
    farBoss.x = squad.x + 300; farBoss.y = squad.y + 120;     // 后排首领（右下），距离 323 仍在步枪射程 380 内
    const firedAt = (mode) => {
      aimMode = mode;
      bullets = [];
      weapons.forEach(w => { w.cd = 0; });
      updateWeapons(1 / 60);
      const b = bullets[0];
      if (!b) return 'none';
      const from = soldiers[0] || squad;
      const angTo = (e) => Math.atan2(e.y - from.y, e.x - from.x);
      const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
      const ang = Math.atan2(b.vy, b.vx);
      const dMob = wrap(ang - angTo(nearFoe)), dBoss = wrap(ang - angTo(farBoss));
      if (Math.min(dMob, dBoss) > 0.2) return 'other';
      return dMob < dBoss ? 'mob' : 'boss';
    };
    assert(firedAt('nearest') === 'mob', '「最近」档：武器打的是贴脸小怪');
    assert(firedAt('boss') === 'boss', '「首领优先」档：武器越过小怪打后排首领');
    assert(firedAt('strong') === 'boss', '「最强」档：武器打血量上限最高的首领');
    aimMode = 'nearest';
    // V1.31：自爆怪三改 —— 靠近点引信 / 被击杀挂延迟引信 / 爆炸敌我不分
    visualSetup(); meta.equipped.pet = 'none';
    startGame(); state = 'playing';
    enemies = []; enemyBullets = []; bombs = []; squad.invulnT = 0;
    spawnEnemy('bomber', squad.x + 40, squad.y);
    const bomber = enemies[enemies.length - 1];
    spawnEnemy('grunt', squad.x + 52, squad.y);
    const bystander = enemies[enemies.length - 1];
    updateEnemies(1 / 60);
    assert(bomber.bomberT > 0, '自爆怪靠近玩家会立刻点燃引信');
    bomber.dead = true;                                   // 模拟被击杀（killEnemy 先置 dead 再挂引信）
    bomberFuseOnDeath(bomber);
    assert(bombs.length === 1 && Math.abs(bombs[0].t - BOMBER_FUSE.death) < 1e-9, '被击杀的自爆怪改挂延迟引信（不再立即爆炸）');
    const gHp = bystander.hp, sHp = squadHp;
    updateBombs(BOMBER_FUSE.death - 0.1);
    assert(bombs.length === 1, '引信没走完不会提前爆炸');
    updateBombs(0.2);
    assert(bombs.length === 0 && bystander.hp < gHp, '引信走完爆炸，并对**其它怪物**造成伤害');
    assert(squadHp < sHp, '同一次爆炸也伤害玩家小兵（共享血池）');
    // V1.31：暂停后继续要先走 3 秒倒计时，倒计时期间世界静止
    visualSetup(); meta.equipped.pet = 'none';
    startGame(); state = 'playing';
    pauseGame();
    assert(state === 'paused', '暂停生效');
    resumeGame();
    assert(state === 'playing' && resumeT === RESUME_COUNTDOWN, '继续游戏先进入 3 秒倒计时');
    const frozenT = gameTime;
    update(1);
    assert(resumeT === RESUME_COUNTDOWN - 1 && gameTime === frozenT, '倒计时期间世界静止（gameTime 不推进）');
    update(RESUME_COUNTDOWN);
    assert(resumeT === 0, '读秒结束，解除冻结');
    update(1 / 60);
    assert(gameTime > frozenT, '倒计时结束后世界恢复推进');
    // V1.31：吸血提示统一红色，且显示的是「实际回血」而不是请求量
    visualSetup(); meta.equipped.pet = 'none';
    startGame(); state = 'playing';
    const leechOf = () => damageNumbers.filter(n => typeof n.text === 'string' && n.text.startsWith('吸血'));
    damageNumbers.length = 0; gameTime = 10; lastLeechText = 0; squadHp = squadMaxHp * 0.5;
    leechHeal(20);
    assert(leechOf().length === 1 && leechOf()[0].color === LEECH_COLOR, '吸血提示统一为红色');
    assert(leechOf()[0].text === '吸血 +20', '吸血提示数值与实际回血一致');
    damageNumbers.length = 0; gameTime = 20; lastLeechText = 0; squadHp = squadMaxHp - 5;
    leechHeal(20);
    assert(leechOf().length === 1 && leechOf()[0].text === '吸血 +5', '回血被血池上限截断时按实际差值报数');
    damageNumbers.length = 0; gameTime = 30; lastLeechText = 0; squadHp = squadMaxHp;
    leechHeal(20);
    assert(leechOf().length === 0, '满血时不再弹吸血提示（否则与实际不符）');
    // V1.31：新增物种「牛来」+ 各武器 / 子弹分模型
    visualSetup(); meta.character.species = 0; renderCharOptions();
    assert(CHAR_SPECIES.length === 2 && meta.character.species === 0, '角色新增「牛来」物种，默认仍是福瑞');
    const spBtns = document.querySelectorAll('#char-opts .chip[data-key="species"]');
    assert(spBtns.length === CHAR_SPECIES.length, '角色个性化页出现「物种」选项');
    spBtns[1].click();
    assert(meta.character.species === 1, '可以切换到「牛来」');
    const cv = document.createElement('canvas'); cv.width = cv.height = 140;
    const cvx = cv.getContext('2d');
    let drawErr = '';
    try {
      for (const sp of [0, 1]) {
        for (const wt of Object.keys(WEAPON_DEFS)) {
          drawCharacter(cvx, 70, 70, 26, 0.4, Object.assign({}, meta.character, { species: sp }), { weapon: true, weaponType: wt, time: 1 });
        }
      }
    } catch (err) { drawErr = String(err); }
    assert(!drawErr, '福瑞 / 牛来 × 四把武器都能正常绘制' + drawErr);
    meta.character.species = 0;
    // 子弹携带发射它的武器类型（决定子弹模型）
    visualSetup(); meta.equipped.pet = 'none'; meta.equipped.weapon = 'shotgun';
    startGame(); state = 'playing';
    enemies = []; enemyBullets = []; bullets = [];
    spawnEnemy('grunt', squad.x + 80, squad.y);
    updateWeapons(1);
    assert(bullets.length === WEAPON_DEFS.shotgun.baseCount && bullets.every(b => b.wtype === 'shotgun'), '子弹记录发射它的武器类型（用于分模型绘制）');
    // 局内调试面板（V1.26）：分页、卡池全量、站桩/停手开关与入口显隐。
    meta.devMode = true;
    assert(devAvailable(), '开发者模式下调试面板可用');
    toggleDevHud();
    assert(devHudOpen && getComputedStyle(document.getElementById('dev-hud')).display !== 'none', '调试面板可展开');
    devTickHud(0.016);
    assert(getComputedStyle(document.getElementById('dev-toggle')).display !== 'none', '对局中显示调试入口按钮');
    // V1.35：横屏下面板贴右侧，必须让开右上角的「切换攻击目标」按钮
    assert(document.getElementById('stage').classList.contains('dev-open'), '调试面板展开时给舞台打上 dev-open');
    visualOrientation(true);
    {
      const aim = document.getElementById('btn-aim');
      aim.classList.remove('hidden');
      const a = aim.getBoundingClientRect();
      const d = document.getElementById('dev-hud').getBoundingClientRect();
      const covered = a.left < d.right && a.right > d.left && a.top < d.bottom && a.bottom > d.top;
      assert(!covered, '横屏 + 面板展开时「切换攻击目标」按钮不被调试面板盖住');
      aim.classList.add('hidden');
    }
    visualOrientation(false);
    assert(document.querySelectorAll('.dev-tab').length === 4, '调试面板有四个分页');
    assert(devCardCatalog().length > 60, '忽略前置时列出全量卡牌');
    document.querySelector('.dev-tab[data-devtab="card"]').click();
    assert(document.getElementById('dev-card-list').children.length > 20, '卡牌页渲染卡牌按钮');
    devClearEnemies();
    document.getElementById('dev-spawn-type').value = 'boss:charge';
    document.getElementById('dev-spawn-static').checked = true;
    document.getElementById('dev-spawn-peace').checked = true;
    devDoSpawn();
    const devDummy = enemies[enemies.length - 1];
    assert(devDummy && devDummy.kind === 'charge' && devDummy.devStatic && devDummy.devPeaceful, '刷出站桩 · 停手的首领');
    const dummyX = devDummy.x, dummyY = devDummy.y;
    let devDashFrames = 0;
    for (let i = 0; i < 120; i++) { squadHp = squadMaxHp; update(1 / 60); if (devDummy.dashKind) devDashFrames++; }
    assert(Math.hypot(devDummy.x - dummyX, devDummy.y - dummyY) < 0.5 && devDashFrames === 0, '站桩 · 停手的首领不动也不出招');
    devJumpWave(20);
    assert(wave === 20, '调试面板跳波');
    devClearEnemies();
    assert(!enemies.length && !bossArena, '清空场上敌人并解除竞技场');
    setDevHud(false);
    assert(!devHudOpen && getComputedStyle(document.getElementById('dev-hud')).display === 'none', '调试面板可关闭（隐藏类不被同优先级规则盖掉）');
    devSpeed = 4; devInvuln = true; devOneShot = true; devFreezeWave = true;
    devResetTransient();
    assert(devSpeed === 1 && !devInvuln && !devOneShot && !devFreezeWave, '新对局复位调试开关');
    meta.devMode = false;
    devTickHud(0.016);
    assert(document.getElementById('dev-toggle').classList.contains('hidden'), '非开发者模式隐藏调试入口');
    // V1.31：调试面板增强 —— 停止刷怪 / 分档怪物无敌 / 实时 DPS / 暂停中升级 / 卡牌点选取消
    ['dev-no-spawn', 'dev-god-mob', 'dev-god-elite', 'dev-god-boss', 'dev-pause-upgrade',
      'dev-self-dps', 'dev-self-dps-peak', 'dev-card-apply', 'dev-card-clear']
      .forEach(id => assert(!!document.getElementById(id), '调试面板新增控件存在：' + id));
    visualSetup(); meta.equipped.pet = 'none';
    startGame(); state = 'playing';
    devOneShot = false; devInvuln = false;
    // 停止刷怪：刷怪计时与波次计时一并停住
    enemies = []; devNoSpawn = false; spawnTimer = 0; waveT = 0;
    updateSpawning(5);
    assert(enemies.length === 1 && spawnTimer > 0 && waveT > 0, '正常时波次会出怪并推进计时');
    enemies = []; devNoSpawn = true; spawnTimer = 0; waveT = 0;
    updateSpawning(5);
    assert(enemies.length === 0 && spawnTimer === 0 && waveT === 0, '勾选「停止刷怪」后不出怪，波次计时也停住');
    devNoSpawn = false;
    // 分档怪物无敌：伤害数字照常，血量与护盾不动
    enemies = []; enemyBullets = []; damageNumbers.length = 0;
    spawnEnemy('grunt', squad.x + 60, squad.y);
    const godMob = enemies[enemies.length - 1];
    spawnEnemy('elite', squad.x + 100, squad.y, { affixes: [] });
    const godElite = enemies[enemies.length - 1];
    spawnEnemy('boss', squad.x + 260, squad.y, { noDrop: true });
    const godBoss = enemies[enemies.length - 1];
    devGod = { mob: true, elite: true, boss: true };
    const godBefore = [godMob.hp, godElite.hp, godBoss.hp];
    damageNumbers.length = 0;
    hitEnemy(godMob, 50, 0, 0); hitEnemy(godElite, 50, 0, 0); hitEnemy(godBoss, 50, 0, 0);
    assert(godMob.hp === godBefore[0] && godElite.hp === godBefore[1] && godBoss.hp === godBefore[2],
      '小怪 / 精英 / Boss 勾选无敌后都不掉血');
    assert(damageNumbers.length >= 3, '无敌时伤害数字照常弹出（数值可核对）');
    assert(devGodBlocks({ type: 'treant' }) === true && devGodBlocks({ type: 'grunt' }) === true,
      '树怪按精英档、普通怪按小怪档判定无敌');
    dpsHits = [];
    devGod = { mob: false, elite: true, boss: true };
    hitEnemy(godMob, 50, 0, 0);
    assert(godMob.hp < godBefore[0] && godElite.hp === godBefore[1] && dpsHits.length > 0,
      '无敌分档生效：只保护被勾选的那一档（关掉小怪档后照常掉血）');
    devGod = { mob: false, elite: false, boss: false };
    // 实时 DPS：5 秒滑动窗口 + 峰值
    dpsHits = []; dpsValue = 0; dpsPeak = 0;
    gameTime = 100; addDps(50); updateDps();
    assert(Math.abs(dpsValue - 10) < 1e-6 && Math.abs(dpsPeak - 10) < 1e-6, '实时 DPS = 窗口内总伤害 / 5 秒');
    gameTime = 105; updateDps();
    assert(Math.abs(dpsValue - 10) < 1e-6, '5 秒窗口内的伤害仍在统计');
    gameTime = 105.2; updateDps();
    assert(dpsValue === 0 && dpsPeak === 10, '超出窗口的伤害被剔除，峰值保留');
    devRefreshReadout();
    assert(/\/s$/.test(document.getElementById('dev-self-dps').textContent)
      && /峰值/.test(document.getElementById('dev-self-dps-peak').textContent), '调试面板写出实时 DPS 与峰值');
    // 暂停中升级：勾选后可在暂停里开面板，选完卡自动回到暂停
    visualSetup(); meta.equipped.pet = 'none';
    startGame(); state = 'playing';
    devAllowPauseUpgrade = false; devUpgradeFromPause = false;
    document.getElementById('dev-pause').click();
    assert(state === 'paused', '调试面板按钮可暂停对局');
    document.getElementById('dev-levelup').click();
    assert(state === 'paused', '未勾选时暂停中不能升级');
    devAllowPauseUpgrade = true;
    document.getElementById('dev-levelup').click();
    assert(state === 'upgrade' && devUpgradeFromPause, '勾选后可在暂停中打开升级面板');
    const pauseCard = upgrades.find(u => !u.route) || upgrades[0];
    applyUpgrade(pauseCard.id);
    assert(state === 'paused', '暂停中升级选完卡自动回到暂停');
    document.getElementById('dev-pause').click();
    assert(state === 'playing', '再点一次调试暂停按钮可继续对局');
    devAllowPauseUpgrade = false; devUpgradeFromPause = false;
    // 卡牌页：点一下选中、再点一下取消
    meta.devMode = true;
    toggleDevHud();
    devTickHud(0.016);
    document.querySelector('.dev-tab[data-devtab="card"]').click();
    devSelectedCardId = '';
    devRenderCards();
    assert(document.querySelectorAll('#dev-card-list .dev-card').length > 20, '卡牌页渲染卡牌按钮');
    assert(document.getElementById('dev-card-apply').disabled, '没选中时「应用选中」不可用');
    document.querySelectorAll('#dev-card-list .dev-card')[0].click();
    assert(devSelectedCardId !== '' && document.querySelectorAll('#dev-card-list .dev-card.picked').length === 1,
      '点一下卡牌即选中（并有选中高亮）');
    assert(!document.getElementById('dev-card-apply').disabled, '选中后「应用选中」可用');
    document.querySelectorAll('#dev-card-list .dev-card')[0].click();
    assert(devSelectedCardId === '' && document.querySelectorAll('#dev-card-list .dev-card.picked').length === 0,
      '再点一下取消选中（不会误加卡）');
    assert(document.getElementById('dev-card-apply').disabled, '取消后「应用选中」再次不可用');
    devSelectedCardId = ''; meta.devMode = false;
    // V1.32：显式状态机 —— 全部状态写在一张表里，遮罩与局内按钮的显隐统一由 setState() 负责
    assert(STATES.join(',') === 'menu,playing,paused,upgrade,bossreward,merchant,gameover', '状态机声明了全部 7 个状态');
    assert(STATES.filter(s => STATE_DEFS[s].live).join(',') === 'playing', '只有「对局中」让世界推进');
    assert(typeof stateLabel() === 'string' && stateLabel().length > 0, '每个状态都有可读标签');
    visualSetup(); meta.equipped.pet = 'none';
    startGame();
    assert(state === 'playing' && isLive(), '开局进入「对局中」');
    assert(document.getElementById('pause').classList.contains('hidden')
      && !document.getElementById('btn-pause').classList.contains('hidden'), '对局中：收起暂停遮罩并显示暂停按钮');
    pauseGame();
    assert(state === 'paused' && !isLive() && statePrev === 'playing', '暂停：世界冻结并记录上一个状态');
    assert(!document.getElementById('pause').classList.contains('hidden')
      && document.getElementById('btn-pause').classList.contains('hidden'), '暂停中：弹出暂停遮罩并隐藏暂停按钮');
    assert(canTransition('playing') && canTransition('upgrade') && !canTransition('bossreward'),
      '状态转移表可用于校验（暂停 → 对局中 / 升级选卡 合法，暂停 → 首领奖励 非法）');
    // 非法转移只告警、不阻断（避免某条正常流程被表漏掉后直接卡死）
    const warnSpy = [], realWarn = console.warn;
    try {
      console.warn = msg => warnSpy.push(String(msg));
      setState('menu');                                        // paused → menu 合法
      setState('upgrade');                                     // menu → upgrade 非法
    } finally { console.warn = realWarn; }
    assert(state === 'upgrade' && warnSpy.some(m => m.includes('非法状态转移')), '非法转移只告警、不阻断切换');
    assert(document.getElementById('menu').classList.contains('hidden')
      && !document.getElementById('upgrade').classList.contains('hidden'), '切状态时旧遮罩收起、新遮罩弹出');
    // 未知状态不改变现状
    try {
      console.warn = msg => warnSpy.push(String(msg));
      assert(setState('nope') === false && state === 'upgrade', '未知状态被拒绝且不改变当前状态');
    } finally { console.warn = realWarn; }
    // 预留状态 merchant：没有对应遮罩也不报错，世界同样静止
    setState('playing');
    assert(setState('merchant') && state === 'merchant' && !isLive()
      && document.getElementById('btn-pause').classList.contains('hidden'), '预留状态「商人」可用且世界静止');
    setState('playing');
    assert(document.getElementById('upgrade').classList.contains('hidden')
      && !document.getElementById('btn-pause').classList.contains('hidden'), '离开选卡状态后遮罩收起、局内按钮恢复');
    // V1.32：三条随机流（世界 / 战斗 / 表现）互相独立，且同种子可复现地图与战斗
    assert(RNG_STREAMS.join(',') === 'world,combat,fx', '声明了世界 / 战斗 / 表现三条随机流');
    seedRun(4242);
    const seqA = [rngWorld(), rngWorld(), rngCombat(), rngFx()];
    seedRun(4242);
    const seqB = [rngWorld(), rngWorld(), rngCombat(), rngFx()];
    assert(JSON.stringify(seqA) === JSON.stringify(seqB), '同一种子得到同一条随机序列');
    seedRun(4242);
    const sW = rngWorld(), sC = rngCombat(), sF = rngFx();
    assert(sW !== sC && sC !== sF, '三条随机流各自独立（同种子下取值不同）');
    // 只取用其中一条流，不应扰动另外两条
    seedRun(7); rngCombat(); rngCombat(); rngCombat();
    const wAfter = rngWorld(), fAfter = rngFx();
    seedRun(7);
    assert(rngWorld() === wAfter && rngFx() === fAfter, '取用战斗流不影响世界 / 表现流的序列');
    // 同种子 → 同一张地图（障碍物 / 装饰 / 地形分区都由世界流决定）
    visualSetup(); meta.equipped.pet = 'none';
    const worldSig = () => obstacles.map(o => o.type + Math.round(o.x) + ',' + Math.round(o.y)).join('|')
      + '#' + decorations.map(d => d.type).join('') + '#' + dividers.map(n => Math.round(n)).join(',');
    reset(20240923); const sig1 = worldSig();
    reset(20240923); const sig2 = worldSig();
    assert(sig1.length > 20 && sig1 === sig2, '同一种子生成同一张地图（障碍物 / 装饰 / 地形分区）');
    reset();
    assert(runSeed !== 20240923, '不传种子时每局重新掷一个种子');
    // 存档带「种子 + 三条流的位置」，读档后接着走同一条序列
    reset(99); rngCombat();
    const countsBefore = { world: rngCount.world, combat: rngCount.combat, fx: rngCount.fx };
    const rngSnap = snapshotRun();
    const nextCombat = rngCombat();
    assert(rngSnap.seed === 99 && JSON.stringify(rngSnap.rngCounts) === JSON.stringify(countsBefore)
      && rngSnap.rngCounts.combat > 0, '本局种子与随机流位置写进存档快照');
    assert(restoreRun(rngSnap) && rngCombat() === nextCombat, '读档后随机流接回同一位置（战斗序列可续）');
    // 实战中三条流都在被使用（把靶子放在身边，保证 5 秒内真的打起来）
    reset(5); state = 'playing';
    enemies = [];
    for (let i = 0; i < 6; i++) spawnEnemy('grunt', squad.x + 90 + i * 22, squad.y + 10);
    enemies.forEach(e => { e.hp = e.maxHp = 1e6; });          // 别让靶子被打死，否则后半段就没命中了
    const rng0 = { world: rngCount.world, combat: rngCount.combat, fx: rngCount.fx };
    for (let i = 0; i < 300; i++) { squadHp = squadMaxHp; if (state === 'upgrade') applyUpgrade(upgrades[0].id); update(1 / 60); }
    assert(rngCount.world > rng0.world && rngCount.combat > rng0.combat && rngCount.fx > rng0.fx,
      '一局实战里世界 / 战斗 / 表现三条流都被取用（+'
      + (rngCount.world - rng0.world) + ' / +' + (rngCount.combat - rng0.combat) + ' / +' + (rngCount.fx - rng0.fx) + '）');
    // V1.32：存档结构版本 + 迁移流程（旧档自动迁移，不需要用户做任何事）
    assert(META_SCHEMA === 4 && schemaVersionOf({}) === 1 && schemaVersionOf({ schemaVersion: 3 }) === 3,
      '存档结构版本：没有版本号的老档按 v1 处理');
    const oldSave = migrateMeta({ coins: 5, run: { v: 1, squad: {}, stats: {} } });
    assert(!!oldSave && oldSave.schemaVersion === META_SCHEMA, '旧档读入时自动盖上当前结构版本号');
    assert(oldSave.run.seed === null && oldSave.run.rngCounts === null,
      'v1 → v2 迁移：旧对局快照补上随机流字段（没有种子就记 null，不假装可复现）');
    assert(oldSave.run.stats.shieldDamageTaken === 1, 'v1 → v2 迁移：旧快照补上「有护盾时受伤」字段');
    assert(oldSave.unlocked.weapons.includes('rifle') && oldSave.equipped.weapon === 'rifle'
      && oldSave.equipped.trinket2 === 'none', '迁移之后仍会补齐缺失字段（老档不会因为缺字段读不出来）');
    // V1.32：存档校验
    assert(!validateMeta(null).ok && !validateMeta([1]).ok && !validateMeta({ coins: '很多' }).ok,
      '坏档校验：非对象 / 关键字段类型错误会被拒绝');
    assert(validateMeta(migrateMeta({}), { strict: true }).ok, '迁移 + 补齐之后的存档能通过严格校验');
    assert(!validateMeta({ coins: -1, bestWave: 0, unlocked: {}, equipped: {} }, { strict: true }).ok,
      '严格校验会挑出非法数值（负金币）');
    assert(migrateMeta(null) === null && migrateMeta({ schemaVersion: 99 }) === null,
      '坏档与「来自未来版本」的存档都不被接受');
    // V1.32：写入前留备份 + 写入失败保持旧档不变（不产生半写状态）
    visualSetup(); meta.coins = 111; saveMeta();
    meta.coins = 222; saveMeta();
    assert(JSON.parse(localStorage.getItem(metaCacheKey())).coins === 222, '存档写入本机镜像');
    const backupCoins = JSON.parse(localStorage.getItem(metaBackupKey())).coins;
    assert(backupCoins === 111, '每次保存前都把「上一份好档」留成备份');
    const realSetItem = localStorage.setItem.bind(localStorage);
    let failOk = null;
    localStorage.setItem = (k, v) => { if (String(k).includes('__tmp')) throw new Error('配额满'); realSetItem(k, v); };
    try { meta.coins = 333; failOk = saveMeta(); } finally { localStorage.setItem = realSetItem; }
    assert(failOk === false && JSON.parse(localStorage.getItem(metaCacheKey())).coins === 222,
      '写入失败时如实返回失败，且本机旧档仍是上一份好档（写入失败不回滚出半截存档）');
    assert(JSON.parse(localStorage.getItem(metaCacheKey())).schemaVersion === META_SCHEMA, '保存时会盖上结构版本号');
    // V1.32：坏档另存备查 + 从备份恢复
    localStorage.removeItem(metaBrokenKey());
    const revived = handleBrokenMeta('视觉测试', { coins: 'oops' }, { autoRestore: true });
    assert(!!revived && revived.coins === backupCoins, '坏档可以从「上一份备份」恢复');
    assert(!!localStorage.getItem(metaBrokenKey()), '坏档的原始内容会另存备查（不覆盖任何东西）');
    const realConfirm = window.confirm;
    window.confirm = () => false;            // 用户选择「不恢复」→ 走新建流程
    const fallback = loadMetaFor('视觉测试', { coins: 'oops' });
    window.confirm = realConfirm;
    assert(!!fallback && typeof fallback.coins === 'number' && fallback.schemaVersion === META_SCHEMA,
      '坏档且不恢复备份时回退到全新存档（不会卡在坏档上）');
    // V1.32：两种基础模式 —— 标准（20 波结算）/ 无尽（标准通关后开放）
    assert(STANDARD_WAVES === 20 && GAME_MODES.map(m => m.id).join(',') === 'standard,endless',
      '声明了标准 / 无尽两种基础模式，标准为 20 波');
    assert(migrateMeta({ coins: 0, bestWave: 24 }).standardCleared === true
      && migrateMeta({ coins: 0, bestWave: 3 }).standardCleared === false,
      '老存档按最高波次判断是否通关过标准模式（≥20 波视为已通关）');
    visualSetup(); meta.standardCleared = false; meta.mode = 'standard'; renderMenu();
    assert(document.querySelectorAll('#mode-pick .mode-chip').length === 2
      && document.querySelector('#mode-pick .mode-chip[data-mode="endless"]').classList.contains('locked'),
      '主页出现模式选择，未通关时「无尽」置灰');
    assert(selectMode('endless') === false && meta.mode === 'standard', '未通关时选不了无尽模式');
    meta.standardCleared = true; renderModePick();
    assert(document.querySelector('#mode-pick .mode-chip[data-mode="endless"]').classList.contains('on') === false
      && selectMode('endless') === true && meta.mode === 'endless', '通关后可以切到无尽模式');
    startGame();
    assert(runMode === 'endless' && snapshotRun().mode === 'endless', '开局沿用所选模式，并写进对局快照');
    // 手改存档把无尽塞进来（未解锁）→ 一律退回标准
    meta.mode = 'endless'; meta.standardCleared = false; reset();
    assert(runMode === 'standard' && normalizeMeta({ mode: '诡异模式' }).mode === 'standard',
      '未解锁 / 非法的模式一律退回标准模式');
    // 标准模式：第 20 波打完即通关结算 + 解锁无尽模式
    visualSetup(); meta.mode = 'standard'; meta.standardCleared = false; meta.equipped.pet = 'none';
    startGame(); state = 'playing';
    enemies = []; enemyBullets = []; wave = STANDARD_WAVES; waveT = 0;
    updateSpawning(WAVE_TIME + 0.01);
    assert(state === 'gameover' && meta.standardCleared === true, '标准模式打完第 20 波即通关，并解锁无尽模式');
    assert(document.getElementById('go-title').textContent.includes('通关'), '通关走的是「通关」结算文案');
    assert(document.getElementById('go-stats').textContent.includes('无尽模式已开放'), '通关结算提示无尽模式已开放');
    // 无尽模式：走到同样的波次不会结算，继续往下推
    visualSetup(); meta.mode = 'endless'; meta.standardCleared = true; meta.equipped.pet = 'none';
    startGame(); state = 'playing';
    enemies = []; enemyBullets = []; wave = STANDARD_WAVES; waveT = 0;
    updateSpawning(WAVE_TIME + 0.01);
    assert(state !== 'gameover' && wave === STANDARD_WAVES + 1, '无尽模式第 20 波之后继续推进，不结算');
    const modeSnap = snapshotRun();
    runMode = 'standard'; restoreRun(modeSnap);
    assert(runMode === 'endless', '读档后接着原来的模式继续打');
    // V1.32：模块边界 —— 渲染层只读世界，也不消耗世界 / 战斗随机流
    visualSetup(); meta.mode = 'standard'; meta.standardCleared = false; meta.equipped.pet = 'none';
    startGame(); state = 'playing';
    enemies = []; enemyBullets = [];
    spawnEnemy('grunt', squad.x + 90, squad.y);
    spawnEnemy('elite', squad.x + 150, squad.y, { affixes: [] });
    enemies.forEach(e => { e.hp = e.maxHp = 1e5; });
    for (let i = 0; i < 60; i++) { squadHp = squadMaxHp; update(1 / 60); }   // 先跑出一批子弹 / 粒子 / 特效
    const worldSnap = () => JSON.stringify({
      squad, soldiers, enemies, bullets, squadHp, gameTime, wave, weapons, summons, drops, obstacles, vines, stats,
    });
    const paintBefore = worldSnap();
    const paintRng = { world: rngCount.world, combat: rngCount.combat };
    for (let i = 0; i < 5; i++) render();
    assert(worldSnap() === paintBefore, '渲染只读世界：连续绘制不改动实体与对局数据');
    assert(rngCount.world === paintRng.world && rngCount.combat === paintRng.combat,
      '渲染不消耗世界 / 战斗随机流（画面设置不会影响同一局的结果）');

    // ==================== V1.35 第二阶段：新手引导 / 节奏 / 预警 / 结算信息 ====================
    // 首局引导（需求 1）：五步各绑一个真实动作，做到就推进一步；走完写档（meta.guide.done），之后不再出现
    visualSetup(); state = 'menu';
    assert(meta.guide.done === false && meta.schemaVersion === META_SCHEMA,
      '全新存档默认还没走过首局引导，且档案已经盖上 v4');
    startGame(); state = 'playing';
    assert(guideOn && guideStep === 0 && GUIDE_STEPS.length === 5, '首局开局进入引导第 1 步（共 5 步）');
    assert(getComputedStyle(document.getElementById('guide-tip')).display !== 'none', '对局中引导提示条可见');
    setState('paused');
    assert(document.getElementById('guide-tip').classList.contains('hidden')
      && getComputedStyle(document.getElementById('guide-tip')).display === 'none',
      '暂停 / 升级时引导提示条真正隐藏（.hidden 压过 .guide-tip 的 display:flex）');
    setState('playing');
    keys['d'] = true;
    for (let i = 0; i < 40 && guideStep === 0; i++) update(1 / 60);      // 走出一小段 → 第 1 步完成
    keys['d'] = false;
    assert(guideStep === 1, '移动后推进到「拾取经验」');
    drops = [{ x: squad.x, y: squad.y, r: 6, value: 1 }];
    update(1 / 60);
    assert(guideStep === 2, '吃到经验球后推进到「第一次升级」');
    openUpgrade();
    assert(guideStep === 3 && state === 'upgrade', '弹出升级面板后推进到「暂停」');
    setState('playing');
    pauseGame();
    assert(guideStep === 4 && state === 'paused', '暂停一次后推进到「主动技能」');
    state = 'playing';
    skills.slow.owned = true; skills.slow.cd = 0;
    useSkill('slow');
    assert(guideStep === 5 && !guideOn && meta.guide.done === true, '用完时缓后五步走完，引导写档收尾');
    reset();
    assert(!guideOn, '走过一次引导后，新对局不再出现引导');
    // 前 3 波减负（需求 2）：出怪更稀 / 伤害更低（经验值不动，靠少刷怪把首升推到 20 秒上下）
    visualSetup(); reset(); state = 'playing';
    wave = 1; bossKills = 0;
    assert(earlyEase() && earlySpawnMul() > 1 && earlyDmgMul() < 1,
      '前 3 波进入减负档（出怪间隔 ×' + earlySpawnMul() + ' / 伤害 ×' + earlyDmgMul() + '）');
    const ivEarly = spawnInterval();
    wave = 4;
    assert(!earlyEase() && spawnInterval() < ivEarly, '第 4 波起恢复正常出怪节奏');
    // 首次升级的节奏保证：第 1 波按出怪间隔推算，最早也要 6 秒、最晚不超过 30 秒
    wave = 1; bossKills = 0; waveT = 0;
    const needKills = Math.ceil(XP_BASE / ENEMY_TYPES.grunt.xp);
    const lvSeconds = 1 + (needKills - 1) * spawnInterval();
    assert(needKills <= 3 && lvSeconds >= 6 && lvSeconds <= 30,
      '第 1 波首次升级只需 ' + needKills + ' 只怪（按出怪间隔约 ' + lvSeconds.toFixed(1) + ' 秒，落在 6~30 秒区间）');
    // 实测：开局自动走位吃球（朝最近的球走）+ 自动开火，量出第一次升级真正发生在第几秒
    visualSetup(); meta.mode = 'standard'; meta.equipped.pet = 'none';
    startGame(); state = 'playing';
    enemies = []; drops = []; wave = 1; bossKills = 0; waveT = 0; spawnTimer = 1;
    let firstLvT = 0;
    let spawned = 0;
    for (let i = 0; i < 60 * 60 && !firstLvT; i++) {
      const near = drops[0];
      if (near) { joystick.active = true; joystick.dx = near.x - squad.x; joystick.dy = near.y - squad.y; }
      else joystick.active = false;
      squadHp = squadMaxHp;                       // 只测节奏，不计伤亡
      const before = enemies.length;
      update(1 / 60);
      if (enemies.length > before) spawned++;
      if (state === 'upgrade') firstLvT = gameTime;
    }
    joystick.active = false;
    assert(firstLvT > 0 && firstLvT <= 30,
      '实测第 1 波开局自动打法，第一次升级发生在第 ' + firstLvT.toFixed(1) + ' 秒（本波已出怪 ' + spawned + ' 只 · ≤30 秒）');
    // 出招预警（需求 3 / 验收）：远程与精英在真正造成伤害前至少有 0.5 秒可视化前摇
    assert(ENEMY_WARN_MIN >= 0.5 && ENEMY_WARN_SHOT >= 0.5, '预警时长常量都不少于 0.5 秒');
    visualSetup(); reset(); state = 'playing';
    enemies = []; enemyBullets = []; drops = [];
    spawnEnemy('ranged', squad.x + 120, squad.y);
    const ranger = enemies[0];
    ranger.hp = ranger.maxHp = 1e5; ranger.shootCd = 0;
    update(1 / 60);
    assert(ranger.warnT > 0 && enemyBullets.length === 0, '远程怪先亮蓄能（warnT > 0），这一帧不会立刻出弹');
    const warnFrames = [];
    for (let i = 0; i < 60 && ranger.warnT > 0; i++) { squadHp = squadMaxHp; update(1 / 60); warnFrames.push(1); }
    assert(enemyBullets.length > 0 && warnFrames.length * (1 / 60) >= ENEMY_WARN_MIN - 1e-6,
      '蓄能满 ' + (warnFrames.length / 60).toFixed(2) + ' 秒后才真正发射敌弹');
    // 精英贴身：先摆前摇再扣血，前摇期间不掉血
    visualSetup(); reset(); state = 'playing';
    enemies = []; enemyBullets = [];
    spawnEnemy('elite', squad.x + 30, squad.y, { affixes: [] });
    const eliteE = enemies[0];
    eliteE.hp = eliteE.maxHp = 1e5;
    const hpBefore = squadHp;
    update(1 / 60);
    assert(eliteE.swingT > 0 && squadHp === hpBefore, '精英贴身先起手（swingT > 0），这一帧不掉血');
    let swingFrames = 0;
    while (eliteE.swingT > 0 && swingFrames < 120) { update(1 / 60); swingFrames++; }
    assert(swingFrames * (1 / 60) >= ENEMY_WARN_MIN - 1e-6, '精英挥击前摇不少于 0.5 秒（' + (swingFrames / 60).toFixed(2) + ' 秒）');
    // 首领八向弹幕：先亮蓄能环再放
    visualSetup(); reset(); state = 'playing';
    enemies = []; enemyBullets = [];
    spawnEnemy('boss', squad.x + 260, squad.y, { bossKind: 'summoner' });
    const burstBoss = enemies[0];
    burstBoss.burstCd = 0; burstBoss.hp = burstBoss.maxHp = 1e6;
    update(1 / 60);
    assert(burstBoss.burstWarnT > 0 && enemyBullets.length === 0, '首领弹幕先亮蓄能环，这一帧不出弹');
    for (let i = 0; i < 60 && burstBoss.burstWarnT > 0; i++) { squadHp = squadMaxHp; update(1 / 60); }
    assert(enemyBullets.length > 0, '蓄能环走完后才甩出八向弹幕');
    // 第一只精英与「波次目标」HUD（需求 3 / 4）
    wave = 1; waveT = 0; runMode = 'standard';
    let g = waveGoalInfo();
    assert(g.eliteWave === 5 && g.bossWave === 10, '波次目标：第 1 波时下一个精英在第 5 波、首领在第 10 波');
    assert(Math.abs(g.elite - (WAVE_TIME - 0 + 3 * WAVE_TIME)) < 1e-6,
      '波次目标倒计时 = 本波剩余 + 中间整波（精英 ' + waveEta(g.elite) + '）');
    wave = 21; g = waveGoalInfo();
    assert(waveEta(g.elite) === '—' && waveEta(g.boss) === '—', '标准模式超过 20 波后不再显示精英 / 首领倒计时');
    wave = 1; eliteIntroDone = false;
    spawnEliteGroup(2);
    assert(eliteIntroDone && banner.text.includes('精英怪来袭'), '第一只精英出现时有明确的登场提示');
    // 死亡原因 + 本局学到的机制（需求 5 / 6）
    visualSetup(); reset(); state = 'playing';
    hurtBy = {}; lastHurt = '';
    const probe = soldiers[0];
    damageSoldier(probe, 999, 'shot');
    assert(lastHurt === 'shot' && HURT_CAUSES.shot.kill.includes('敌弹'), '扣血时记录来源（敌弹）');
    runLearned = [];
    learnTag('移动：WASD / 方向键 / 拖动屏幕');
    learnTag('经验光球：走过去自动吸取');
    gameOver(false);
    assert(document.getElementById('go-cause').textContent.includes('敌弹'), '结算页写出具体阵亡原因');
    assert(!document.getElementById('go-learned').classList.contains('hidden')
      && document.getElementById('go-learned').textContent.includes('经验光球'),
      '结算页列出「本局学到的机制」');
    assert(document.getElementById('go-cause').textContent.length > 0, '阵亡原因文案非空');
    // 渲染层抗数据异常（V1.35 修正）：落雷 life 一旦超过 maxLife，旧版会算出负半径的地面环并抛错
    visualSetup(); reset(); state = 'playing';
    enemies = []; enemyBullets = []; lightningBolts = [];
    spawnLightningBolt(squad.x + 30, squad.y, 90);
    lightningBolts[0].life = lightningBolts[0].maxLife * 1.6;
    let renderThrew = false;
    try { render(); } catch (err) { renderThrew = true; }
    assert(!renderThrew, '落雷 life 超过 maxLife 时渲染不再抛负半径错误');
    // 同理：负 dt 不再让计时器倒着走（长任务后 rAF 时间戳可能早于 last）
    assert(frameDt(-500) === 0 && Math.abs(frameDt(1e9) - 0.05) < 1e-12 && Math.abs(frameDt(16) - 0.016) < 1e-9,
      '单帧 dt 被钳在 [0, 0.05] 秒（负帧间隔不会倒着走计时器）');
    // 收尾：把调试面板关掉再回首页。
    //   上面那条「调试面板可展开」是 toggle 语义 —— 面板若是开着的，这里再 toggle 一次就变成「可关闭」，断言必挂。
    //   平时靠 loop() 里的 devTickHud（非对局态自动收起）兜底，但**同一页面里连着跑两遍**时，
    //   两次之间不一定夹得到一个 rAF 帧，于是第二遍会莫名其妙挂 —— 收尾显式关掉，让这套检查可重复运行。
    setDevHud(false);
    visualScene('home');
    passed.push('完成：' + frames + ' 帧，' + passed.length + ' 项检查通过');
    parent.reportVisual(passed.join(' / '));
  } catch (e) { parent.reportVisual('FAIL: ' + e.stack + '\n通过：' + passed.join(' / ')); }
}
// 等待原有异步存档初始化完成。
setTimeout(() => visualScene('home'), 100);
