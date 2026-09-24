# AGENTS.md · 项目协作约定（AI 助手 / 协作者必读）

本文件是《福瑞快打》的协作硬性约定。**任何一次改动收尾前，请先确认本文件的「文档同步」是否已执行。**

## 1. 文档同步（硬性要求）

改完代码后，以下两个文档必须与实现保持一致，缺一不可：

| 文档 | 定位 | 什么时候改 |
|---|---|---|
| [docs/需求方案.md](docs/需求方案.md) | **当前实现的权威说明**：机制、数值、卡池全表、进化前置与效果、平衡与实测数据 | 只要机制或数值变了，就改对应章节；标题版本号要跟更新日志对齐 |
| [docs/更新日志.md](docs/更新日志.md) | **版本更新简要叙述**：这次加强了什么、削弱了什么、新增了什么 | 每次「较大改动」在文件顶部追加一节 |

- 「较大改动」= 新增/重做机制、新卡牌或新进化、新系统、成批数值调整、表现大改 —— 这类才新开一节。
  小改动（增删某个选项、局部数值调整、文案修正、修错别字等）**直接并入最新一节**，不要每次改动都新开版本。
- 每一节的写法（版本号、日期、新增/调整/修复三类、旧 → 新数值）见 `docs/更新日志.md` 顶部的「维护约定」。
- `README.md` 的「玩法概览 / 目录结构」若涉及被改动的系统，也一并同步。

## 2. 数值改动要实测

- 改数值/平衡时，优先在浏览器里跑一次测试台（`node server.js` → 打开 `http://localhost:8080`，用 `browser_evaluate` 调 `startGame()` / `addSummon()` / `addWeapon()` / `update()` 做定量测量），**把实测值写进文档**，不要写估算值。
- 改动后至少自查：`node --check js/game.js` 无语法错误、浏览器控制台无报错。

## 3. 提交约定

- 提交信息用中文，首行 `类型: 概要`（`feat` / `fix` / `balance` / `docs` / `perf`），正文按系统分条列要点，写清「旧 → 新」。
- 不要提交 `node_modules/`、`dist/`、`data/`（已由 `.gitignore` 排除）。
- 推送前跑一遍 `git status` 确认没有多余的运行期文件被带进去。

## 4. 外部服务操作（Supabase / Vercel）

- ⚠️ **不要调用会拉起 Supabase 浏览器授权的工具**（IDE 里的 Supabase 集成、需要 OAuth 的 MCP）。本项目环境下这条路径**拉不起浏览器，调用会一直无响应**，不是报错，是卡住，很浪费时间。
- 需要读写 Supabase 时，一律走**带访问令牌（`sbp_`）的方式**：本地挂载配了 `SUPABASE_ACCESS_TOKEN` 的官方 `@supabase/mcp-server-supabase`，或直接用 Management API（`POST https://api.supabase.com/v1/projects/<ref>/database/query`）。两种做法与注意事项见 [docs/部署流程.md](docs/部署流程.md) 的 2.1。
- **Vercel 侧没有这个问题**：本项目的 Vercel MCP 可以直接调用，查环境变量、触发重新部署等都正常，用法见 [docs/部署流程.md](docs/部署流程.md) 的 3.1。
- 访问令牌只放在**本机的 MCP 配置或环境变量**里，绝不写进仓库、也不写进任何文档。同理，线上密钥只存在于 Vercel 环境变量。

## 5. 代码结构速查

- `js/game.js`：全部游戏逻辑与渲染（单文件）。**文件顶部有一份「模块边界」清单（数据 DATA / 逻辑 LOGIC / 渲染 RENDER / UI VIEW），加东西时按层归位**；另外「渲染层只读世界、且不消耗 world / combat 随机流」是可验证的不变量（回归台有断言），改渲染时别破坏它。关键区块：
  - `STATE_DEFS` / `STATES` / `STATE_TRANSITIONS` / `setState()` / `isLive()`：**状态机**（V1.32：7 个状态写在一张表里，遮罩与局内按钮显隐统一由 `setState()` 负责；`merchant` 为预留状态，`isLive()` 是「世界是否推进」的唯一判据）
  - `mulberry32()` / `RNG_STREAMS` / `seedRun()` / `rngWorld()` / `rngCombat()` / `rngFx()` / `rngRestore()`：**三条随机流**（V1.32：世界 / 战斗 / 表现互不干扰，**新代码取随机数要按语义选流**，别再用 `Math.random()`；局外养成不进这三条流）
  - `STANDARD_WAVES` / `GAME_MODES` / `runMode` / `modeSelectable()` / `endlessUnlocked()` / `selectMode()` / `winRun()`：**游戏模式**（V1.32：标准 = 20 波通关结算 / 无尽 = 通关后开放）
  - `META_SCHEMA` / `META_MIGRATIONS` / `migrateMeta()` / `validateMeta()` / `defaultMeta()` / `normalizeMeta()`：**存档结构与迁移**（V1.32：读档 = 校验 → 按版本逐步迁移 → 补齐字段 → 再校验并盖版本号；**改存档结构就 `META_SCHEMA + 1` 并在 `META_MIGRATIONS` 里补一步**，老档自动升级）
  - `saveMeta()` / `writeMetaCache()` / `loadMetaFor()` / `handleBrokenMeta()` / `metaBackupKey()` / `metaBrokenKey()`：**存档写入与坏档保护**（原子写 + 回读校验、写前留备份、坏档另存备查、写入失败提示）
  - `WEAPON_DEFS` / `ELEMENT_DEFS` / `SUMMON_DEFS` / `PET_DEFS`：四条线的**基础数值定义**（改数值先看这里）
  - `PET_SKILLS` / `petTree()`（生成 `PET_TREES`）/ `PET_DEV_CFG` / `petSkillDmg()` / `petEleLineMul()`：**宠物技能与养成路线**（每只 3 技能、节点上限、每点冷却 -8% / 效果 +15%，节点只提供「专精」加成；`chargeMax` / `chargePerHit` = 技能充能制）。技能本体由**局内三选一**决定（`pet.skillPick`，见 `buildUpgradePool()`）。**V1.32 需求 8**：宠物吃「自己那条元素线」的**独占增伤** —— 元素归属读 `PET_DEFS[].elem`（不要在技能上重复标），闪电线走 `petEleLineMul()`（`ELE_SHARE = 0.5` 折半 + `ELE_SHARE_CAP = 0.5` 封顶，因为「雷电伤害 +30%」无上限）；**新加吃元素线的宠物收益时，都从 `petSkillDmg()` 这一处进**（持续技的 `f.dmg` 在释放瞬间就存好了）
  - `EGGS` / `EGG_DIRECT` / `EGG_ENERGY` / `PET_ENERGY` / `PET_ENERGY_NEED` / `hatchEgg()` / `synthesizePet()`：**开蛋 + 能量碎片合成宠物**（有概率直接孵出，否则给龙魂 / 火元素 / 雷元素 / 冰元素，满 100 手动合成）；开蛋界面与动画见 `startHatch()` / `drawEggStage()`
  - `WEAPON_DEFS` / `ARMOR_DEFS` / `TRINKET_DEFS` / `GEAR_DEFS` / `GEAR_SLOTS` / `GEAR_BODY_SLOTS` / `GEAR_CAT` / `GEAR_SLOT_NAME` / `GEAR_MAX_AFFIX` / `GEAR_UNLOCK2` / `GEAR_UNLOCK3` / `GEAR_TIER_W` / `GEAR_REROLL_COST`：**装备系统**（V1.31 四槽位 `weapon / armor / trinket1 / trinket2`，共 4 件武器 + 5 件护甲 + 14 件饰品；「物品」槽已取消并入饰品池。槽位名与 `meta.unlocked` 分类名不一致，靠 `GEAR_CAT` 映射）
  - `GEAR_AFFIXES`（护甲 / 饰品共用，19 条）/ `WEAPON_AFFIXES`（武器专属，6 条）/ `ALL_AFFIXES`（合并查找表）/ `affixPoolOf(id)`：**词条池**（带 `vals` 的是 T1/T2/T3 三档数值、带 `v` 的是定值、`mech` 是机制型；武器池只作用于出战的那把武器）
  - `MAIN_STAT_KEYS` / `applyMainStats()` / `blankGearBuff()` / `weaponBuff()`：**装备主属性**（把 def 上的主属性字段映射到与词条 `apply()` 相同的累加器，所以「固定主属性 + 随机词条」叠进同一份 buff；加新主属性就在这张表里加一行）
  - `gearBuff()` / `affixValue()` / `sampleAffix()` / `gearStateOf()` / `ensureGearAffixes()` / `rollGearAffixes()` / `refineGear()` / `toggleGearLock()` / `gearRollCost()` / `refreshGearGlobals()`：**装备词条与洗练**（V1.30：`meta.gear[装备 id] = { affixes: [{ id, t }], rolls, lock }`；解锁只给第 1 条，累计洗练 **5 / 15** 次解锁第 2 / 3 条，洗练重 roll 全部未锁定项、**每锁定 1 条费用 ×2**。`gearBuff()` 汇总进 `stats`：数值类词条走独立乘区 `dmgMul` + `vulnGear`，机制型走 `stats.pierce / sunder / thorns`）
  - `renderEquipPage()` / `equipSelSlot` / `renderPetDev()` / `petStage()` / `drawPetEvolvedDecor()` / `CHAR_SPECIES` / `drawCowCharacter()` / `shadeHex()` / `drawHoldWeapon()`：**装备栏 / 宠物页 UI、宠物三档进化外观、角色物种与武器模型**（V1.32：`牛来` 走**低模硬边 + 扁平色**，`shadeHex(color, k)` 生成「受光 / 主面 / 背光」三档色替代渐变，面与面之间靠硬边色差做体积；面块**只填色不描边**，最后用 `edge()` 统一补一圈外轮廓）
  - `BOMBER_FUSE` / `bomberBlast()` / `bomberFuseOnDeath()` / `updateBombs()` / `drawBombs()`：**自爆怪引信制**（贴身点引信 / 被击杀延迟引信 / 爆炸敌我不分）
  - `BOSS_DROP` / `bossDrop` / `updateBossDrop()` / `drawBossDropRing()` / `drawBossDropFall()`：**首王出场演出**（玩家脚底预警圈 → 读秒 → 空中砸落）
  - `AIM_MODES` / `AIM_WEIGHT` / `aimMode` / `pickTarget()` / `cycleAimMode()`：**自动攻击目标优先级**（最近 / 最强 / 首领优先 / 精英优先）
  - `RESUME_COUNTDOWN` / `resumeT` / `drawResumeCountdown()`：**继续游戏 3 秒倒计时**（读秒期间 `update()` 直接返回）；`DPS_WINDOW` / `addDps()` / `updateDps()`：**调试用实时 DPS**
  - `EVOLUTIONS`：进化（前置 `req()` + 效果 `apply()`）
  - `DEV_PASSWORD_HASH` / `SOUND_TAP_UNLOCK`：**开发者模式**（设置页连按音效若干次后需输入密码）的口令哈希与触发次数。改密码就换这个 SHA-256 常量，**不要把明文写进任何文件**；机制说明见 `docs/需求方案.md` 的 10.6
  - `buildUpgradePool()`：升级卡池（动态生成，含所有前置条件与权重）。**V1.33 四线「专精」**：`FIRE_MASTERY_*` / `LIGHTNING_MASTERY_DMG` + `LIGHTNING_SPLASH_R/PCT` / `SWORD_MASTERY_*` / `SCYTHE_MASTERY_*`，三段累计值、卡面显示的也是累计值；落地字段是 `stats.fireFlat` / `fireBurnTime` / `lightningMastery` / `lightningSplashR` / `lightningSplashPct` / `swordFlat` / `swordHitCdMul` / `scytheFlat` / `scytheHitCdMul`（**都是「固定值 / 独立倍率」，与四路百分比乘区互不干扰**；新增同类字段时记得同步 `stats` 字面量、`resetRun`、`restoreRun` 三处）。四张专精卡**刻意不带 `route`**，以免改动进化门槛
  - `AVATAR_MONSTERS` / `AVATAR_ITEMS` / `avatarIndex()` / `avatarAt()` / `avatarLabel()` / `drawAvatar()` / `drawEnemyModel(e, color, avatarCtx)`：**头像系统**（V1.34：头像只存 `{kind:'char'}` 或 `{kind:'monster', type}`，**复用已有怪物模型** —— `drawEnemyModel` 新增可选第三参数 `avatarCtx`，靠同名参数遮蔽全局 `ctx`；方形裁剪后再画，非法值退回「角色外观」。`users.avatar` 是**公开副本**，因为 `meta` 是隐私不下发，好友列表只读 `username, avatar`）
  - `FRIEND_LISTS` / `friendData` / `FRIENDS_POLL_MS` / `friendsApi()` / `applyFriends()` / `loadFriends()` / `friendAction()` / `addFriendFromInput()` / `renderFriendRail()` / `renderFriends()` / `renderMeAvatar()` / `avatarCanvasOf()` / `startFriendsPolling()`：**好友系统**（V1.34：主页右侧常驻好友栏，红点徽章 = 收到申请条数；好友表**刻意不进 Realtime 发布**，用 8 秒轮询兜底；好友列表渲染一律传 `defaultCharacter()`，因为**还原不出对方的角色配色**）
  - `updateWeapons` / `triggerFireball` / `triggerLightning` / `updateIce` / `updateScythe` / `updateSword` / `updatePetSkills`（`castPetSkill` + `updatePetFx`）：各条线的行为与命中判定
  - `draw*` 系列：表现层（视觉改动集中在这里）
- `index.html` / `style.css`：UI 骨架与样式
- `api/users.js`：线上账号存档接口（Vercel Serverless Function，读写 Supabase `users` 表）；`server.js` 是本地开发用的等价实现，两者 `/api/users` 契约一致
- `api/friends.js`：线上好友接口（`GET` 返回 `friends/incoming/outgoing`，`POST {action, username}`，action ∈ `request/accept/decline/remove`；身份取自令牌；`users.avatar` 随账号一并下发公开副本）。`server.js` 的 `handleFriendsApi` 是本地等价实现（落盘 `data/friendships.json`），契约一致；建表见 `supabase/migrations/0005_friends.sql`（RLS 零策略、不进 Realtime）
- `docs/`：需求方案与更新日志（部署相关的改动同步到 [docs/部署流程.md](docs/部署流程.md)）
