# 福瑞快打 · Furry Strike

一款 Canvas 2D 无尽波次生存 Roguelite。你指挥一支小兵小队自动开火，靠局内升级把武器、元素、召唤物、宠物四条路线组合成 Build，一路抵挡不断增强的怪潮与 Boss。

支持三种运行方式：Electron 桌面版、浏览器开发版，以及部署到 Vercel 的线上版（账号存档走 Supabase）。

## 玩法概览

- **战斗**：手动操控小队移动（摇杆 / WASD），武器全程自动索敌开火；小队共享血池，掉血会减少小兵数量
- **局内成长**：每次升级三选一（可升级到 6 选），重掷每局 3 次、击败 Boss 额外 +1
- **四条 Build 路线**
  - 武器：步枪 / 散弹 / 机枪 / 狙击枪（射速、弹丸、弹速、各自专属卡）
  - 元素：火球 / 雷电 / 冰刺（走元素伤害乘区，附带点燃、链式、霜冻与冰冻）
  - 召唤物：镰刀（环绕）/ 飞剑（穿梭）
  - 宠物：龙蛋 / 火焰精灵（喷吐并点燃，吃宠物与元素双重乘区）
- **进化**：每条路线攒够 3 次强化并满足专属前置后，才会以低权重出现终极形态
- **敌人**：普通 / 快速 / 远程 / 精英 / 自爆 / 猎人 / 治疗 / 护盾 / 召唤 等十余种；每 5 波出现带护盾的精英，每 10 波出现 Boss（冲锋者 / 弹幕者 / 召唤者 / 分裂者 轮换）
- **世界异变**：击败 Boss 后地图会长出树木与藤蔓，靠近过久会被苏醒的树怪袭击
- **局外养成**：金币解锁武器 / 护甲 / 物品 / 宠物；宠物另有等级（熟练度）、升星（碎片）、随机词条与专属天赋树
- **美术与界面**：主菜单设置内可选择原始精简、暮色森林、霓虹街机、暖纸手绘、深海星夜五种主题，随账号保存，仅局外可改，不影响局内花草建筑；精细福瑞角色带摇尾、呼吸、眨眼和抖耳动画，怪物按职能使用专属轮廓与道具，支持横屏双栏、精简环境特效及减少动态效果偏好

## 运行

### 桌面版（Electron）

```bash
npm install
npm start        # 开发运行
npm run dist     # 打包 Windows 安装包，输出到 dist/
```

### 浏览器版（开发用）

```bash
node server.js
# 浏览器打开 http://localhost:8080
```

`server.js` 同时提供 `/api/users` 账号存档接口（落盘到 `data/users.json`）；若只是纯静态托管，存档会自动退回浏览器 localStorage。

### 线上版（Vercel + Supabase）

前端静态资源托管在 Vercel，账号存档由 Serverless Function `api/users.js` 写入 Supabase。

1. 在 Supabase 建项目，执行 [supabase/migrations/0001_users.sql](supabase/migrations/0001_users.sql) 建表（`users` 表 + RLS）。
2. 在 Vercel 项目的 Settings → Environment Variables 配置（**不要**提交到仓库）：
   - `SUPABASE_URL`：Supabase 项目 URL，形如 `https://<project-ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`：secret / service_role 密钥，仅服务端使用
3. 部署：仓库连到 Vercel 后 `main` 分支自动构建，或本地执行 `vercel --prod`。

> 存档安全：前端从不直连数据库，`anon` / `authenticated` 角色已被收回权限，只有服务端密钥能读写。
>
> 环境变量变更后需要重新部署才会生效。

## 目录结构

```
index.html                 单页 UI（登录 / 主菜单 / 各面板 / 局内 HUD 容器）
style.css                  基础样式与响应式布局
themes.css                 五种界面主题、局外主题预览卡
js/game.js                 全部游戏逻辑与渲染（单文件，约 5000 行）
assets/forest.svg          原创暮色森林矢量场景（离线可用）
tests/visual-smoke.html    浏览器视觉回归测试台（内存存档，不写入账号文件）
tests/visual-smoke.js      战斗、主题存档、动画与飞剑残影回归检查
server.js                  开发用静态服务器 + 账号存档 API
electron/main.js           主进程入口
electron/preload.js        存档读写桥接
data/users.json            账号存档（运行时生成）
AGENTS.md                  协作约定：改完代码必须同步下面两个文档
docs/需求方案.md           需求文档：当前实现的权威说明（机制 / 数值 / 卡池 / 进化 / 平衡）
docs/更新日志.md           更新日志：每次较大改动的简要叙述（加强了什么、削弱了什么）
docs/美术协作规范.md       建模、角色、怪物、场景与特效的统一风格参考
build/  icon.svg           图标与打包资源
```

## 技术要点

- 纯前端 Canvas 2D，**无运行时第三方依赖**；渲染按设备像素比缩放，适配竖屏 / 横屏
- 音效全部由 WebAudio 实时合成（噪声 + 滤波扫频 + 包络），不依赖任何音频素材
- 伤害分为子弹 / 元素 / 召唤物 / 宠物四个独立乘区，每个乘区内部是「加算区 × 独立乘区」
- 存档三通道：Electron 文件读写 → `/api/users` → localStorage，逐级降级；`/api/users` 线上由 Vercel + Supabase 实现，本地由 `server.js` + 文件实现

界面回归：启动开发服务器后访问 `http://localhost:8080/tests/visual-smoke.html`，点击「运行检查」；可切换手机、小屏和横屏尺寸，以及首页、战斗、六选升级、首领奖励、暂停与结算场景。

## 文档与约定

| 文档 | 作用 |
|---|---|
| [AGENTS.md](AGENTS.md) | 协作约定（AI 助手 / 协作者必读）：文档同步要求、提交规范、代码结构速查 |
| [docs/需求方案.md](docs/需求方案.md) | 当前实现的权威说明：机制、数值、卡池全表、进化前置与效果、平衡与实测数据 |
| [docs/更新日志.md](docs/更新日志.md) | 版本更新简要叙述：每次较大改动加强了什么、削弱了什么 |
| [docs/美术协作规范.md](docs/美术协作规范.md) | 协作者参考：角色、怪物、场景、UI 与特效的统一画风和验收标准 |

> **约定：每次较大改动（新机制 / 新卡 / 新系统 / 成批数值调整）完成后，必须同步这两个文档** ——
> 需求文档改对应章节、更新日志在顶部追加一节。写法与判断标准见 `docs/更新日志.md` 顶部的「维护约定」。

## 已知事项

- 仓库已通过 `.gitignore` 排除 `node_modules/`、`dist/`、`dist-new/`、`游戏本体/` 与运行期存档 `data/users.json`。
  克隆后需自行执行 `npm install` 安装 Electron（游戏本体运行不需要任何依赖，直接用 `node server.js` 即可）。
