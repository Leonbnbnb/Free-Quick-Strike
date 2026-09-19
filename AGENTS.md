# AGENTS.md · 项目协作约定（AI 助手 / 协作者必读）

本文件是《福瑞快打》的协作硬性约定。**任何一次改动收尾前，请先确认本文件的「文档同步」是否已执行。**

## 1. 文档同步（硬性要求）

改完代码后，以下两个文档必须与实现保持一致，缺一不可：

| 文档 | 定位 | 什么时候改 |
|---|---|---|
| [docs/需求方案.md](docs/需求方案.md) | **当前实现的权威说明**：机制、数值、卡池全表、进化前置与效果、平衡与实测数据 | 只要机制或数值变了，就改对应章节；标题版本号要跟更新日志对齐 |
| [docs/更新日志.md](docs/更新日志.md) | **版本更新简要叙述**：这次加强了什么、削弱了什么、新增了什么 | 每次「较大改动」在文件顶部追加一节 |

- 「较大改动」= 新增/重做机制、新卡牌或新进化、新系统、成批数值调整、表现大改。
  只调一两个数字或修错别字，可并入当天已有的一节。
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

- `js/game.js`：全部游戏逻辑与渲染（单文件）。关键区块：
  - `WEAPON_DEFS` / `ELEMENT_DEFS` / `SUMMON_DEFS` / `PET_DEFS`：四条线的**基础数值定义**（改数值先看这里）
  - `EVOLUTIONS`：进化（前置 `req()` + 效果 `apply()`）
  - `DEV_PASSWORD_HASH` / `SOUND_TAP_UNLOCK`：**开发者模式**（设置页连按音效若干次后需输入密码）的口令哈希与触发次数。改密码就换这个 SHA-256 常量，**不要把明文写进任何文件**；机制说明见 `docs/需求方案.md` 的 10.6
  - `buildUpgradePool()`：升级卡池（动态生成，含所有前置条件与权重）
  - `updateWeapons` / `triggerFireball` / `triggerLightning` / `updateIce` / `updateScythe` / `updateSword`：各条线的行为与命中判定
  - `draw*` 系列：表现层（视觉改动集中在这里）
- `index.html` / `style.css`：UI 骨架与样式
- `api/users.js`：线上账号存档接口（Vercel Serverless Function，读写 Supabase `users` 表）；`server.js` 是本地开发用的等价实现，两者 `/api/users` 契约一致
- `docs/`：需求方案与更新日志（部署相关的改动同步到 [docs/部署流程.md](docs/部署流程.md)）
