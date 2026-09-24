// 极简静态文件服务器（开发用）
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { issueToken, verifyToken, passwordVersion, bearer } = require('./api/_auth');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

// 用户存档落盘位置（本地文件夹）
const DATA_DIR = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PBKDF2_ITER = 120000;   // 与线上 api/users.js、前端本地哈希同一格式

// 哈希格式：pbkdf2$sha256$<迭代次数>$<盐base64>$<哈希base64>
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITER, 32, 'sha256');
  return `pbkdf2$sha256$${PBKDF2_ITER}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false;
  const iter = Number(parts[2]) || PBKDF2_ITER;
  const salt = Buffer.from(parts[3], 'base64');
  const expect = Buffer.from(parts[4], 'base64');
  if (!salt.length || !expect.length) return false;
  const actual = crypto.pbkdf2Sync(password, salt, iter, expect.length, 'sha256');
  return crypto.timingSafeEqual(actual, expect);
}

// 老账号：还没有哈希、但有非空明文口令
function isLegacyPlain(stored) {
  return typeof stored === 'string' && stored.length > 0 && !stored.startsWith('pbkdf2$');
}

function readUsers() {
  try {
    const list = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function writeUsers(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => {
      body += c;
      if (body.length > 1e6) req.destroy();   // 存档不会这么大
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve(null); }
    });
  });
}

// 用户数据接口：按账号粒度读写（契约与线上 api/users.js 完全一致）
//   GET    /api/users?username=<name>                    单个账号（需令牌）；只返回 username / meta / avatar
//   POST   /api/users  { action:'login', username, password }  校验密码，返回令牌
//   POST   /api/users  { user, createOnly:true }         注册（无需令牌），返回令牌
//   POST   /api/users  { user }                          改密（需令牌，只动密码列）
//   PATCH  /api/users  { username, meta, avatar }        更新存档 + 公开头像（需令牌）
//   DELETE /api/users?username=<name>                    删除账号（需令牌，只能删自己）
//
// `avatar` 是**公开头像的副本**：好友列表要读别人的头像，而 meta 是整个存档（隐私），
// 所以前端在保存存档时把 meta.avatar 的副本一并写进这一列，好友接口只读这一列。
//
// 除注册与探活外都要求 Authorization: Bearer <token>；令牌含密码版本，改密后旧令牌失效。
// 密码只存 PBKDF2 哈希，任何接口都不返回密码或哈希；老账号登录成功时原地升级。
// 不做整表覆盖：多人同时在线时整表写入会互相删掉对方的账号。
async function handleUsersApi(req, res) {
  const username = (new URL(req.url, 'http://localhost').searchParams.get('username') || '').trim();
  const list = readUsers();

  // 令牌有效且属于目标账号（顺带校验密码版本）
  const requireAuth = target => {
    const data = verifyToken(bearer(req));
    if (!data) { sendJson(res, 401, { ok: false, error: '登录已失效，请重新登录' }); return null; }
    if (target && data.u !== target) { sendJson(res, 403, { ok: false, error: '不能操作其他账号' }); return null; }
    const row = list.find(x => x.username === data.u);
    if (!row) { sendJson(res, 401, { ok: false, error: '账号不存在' }); return null; }
    if (passwordVersion(row) !== data.pv) { sendJson(res, 401, { ok: false, error: '登录已失效，请重新登录' }); return null; }
    return row;
  };

  if (req.method === 'GET') {
    // 不带参数只做探活：前端用它判断该走在线接口还是退回本地存储
    if (!username) { sendJson(res, 200, { ok: true, api: 'users' }); return; }
    const row = requireAuth(username);
    if (!row) return;
    sendJson(res, 200, { user: { username: row.username, meta: row.meta || {}, avatar: row.avatar || null } });
    return;
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (!body) { sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }

    if (body.action === 'login') {
      const name = String(body.username || '').trim();
      const password = String(body.password || '');
      const row = list.find(x => x.username === name);
      if (!row) { sendJson(res, 401, { ok: false, error: '用户名或密码错误' }); return; }
      if (row.password_hash) {
        if (!verifyPassword(password, row.password_hash)) { sendJson(res, 401, { ok: false, error: '用户名或密码错误' }); return; }
      } else if (isLegacyPlain(row.password) && row.password === password) {
        row.password_hash = hashPassword(password);   // 老账号：登录成功即升级
        row.password = '';
        writeUsers(list);
      } else {
        sendJson(res, 401, { ok: false, error: '用户名或密码错误' });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        user: { username: row.username, meta: row.meta || {} },
        token: issueToken(row),
      });
      return;
    }

    const u = body.user;
    const name = (u && typeof u.username === 'string') ? u.username.trim() : '';
    if (!name) { sendJson(res, 400, { ok: false, error: '缺少 user.username' }); return; }
    const password = String((u && u.password) || '');
    if (!password) { sendJson(res, 400, { ok: false, error: '注册与改密必须提供密码' }); return; }

    if (body.createOnly) {
      // 注册：不需要令牌，靠账号名判重保证不会覆盖已有账号
      const i = list.findIndex(x => x.username === name);
      if (i >= 0) { sendJson(res, 409, { ok: false, error: '用户名已存在' }); return; }
      const row = { username: name, password: '', password_hash: hashPassword(password), meta: u.meta || {}, avatar: (u && u.avatar) || null };
      list.push(row);
      writeUsers(list);
      sendJson(res, 200, { ok: true, token: issueToken(row) });
      return;
    }

    // 改密：必须是本账号已登录，且只动密码两列
    const row = requireAuth(name);
    if (!row) return;
    row.password = '';
    row.password_hash = hashPassword(password);
    writeUsers(list);
    sendJson(res, 200, { ok: true, token: issueToken(row) });
    return;
  }

  if (req.method === 'PATCH') {
    const body = await readBody(req);
    const name = body ? String(body.username || '').trim() : '';
    if (!name) { sendJson(res, 400, { ok: false, error: '缺少 username' }); return; }
    const row = requireAuth(name);
    if (!row) return;
    row.meta = body.meta || {};
    if (body.avatar !== undefined) row.avatar = body.avatar || null;   // 不传就保持原值
    writeUsers(list);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    if (!username) { sendJson(res, 400, { ok: false, error: '缺少 username' }); return; }
    const row = requireAuth(username);
    if (!row) return;
    writeUsers(list.filter(x => x.username !== username));
    // 顺带清掉榜单记录，避免删号后还挂在排行榜上
    writeScores(readScores().filter(x => x.username !== username));
    // 以及好友关系（两个方向），避免留下指向已删账号的孤儿行
    writeFriends(readFriends().filter(x => x.requester !== username && x.addressee !== username));
    sendJson(res, 200, { ok: true });
    return;
  }

  res.writeHead(405).end();
}

// 排行榜接口（契约与线上 api/leaderboard.js 一致）
//   GET  /api/leaderboard?limit=50   取榜单
//   POST /api/leaderboard            提交成绩 { bestWave, duration }（需令牌），只增不减
// 提交者身份取自令牌；并做与线上一致的合理性校验（每 2 秒最多 1 波、时长上限 12 小时、波次上限 5000）。
// 本地没有 Supabase Realtime，realtime 固定返回 null，前端会自动降级为轮询。
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const LB_MAX_LIMIT = 100;
const LB_MAX_WAVE = 5000;
const LB_MAX_DURATION = 12 * 3600;

function readScores() {
  try {
    const list = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function writeScores(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SCORES_FILE, JSON.stringify(list, null, 2), 'utf8');
}

async function handleLeaderboardApi(req, res) {
  const list = readScores();

  if (req.method === 'GET') {
    const raw = Number(new URL(req.url, 'http://localhost').searchParams.get('limit'));
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), LB_MAX_LIMIT) : 50;
    const top = list
      .slice()
      .sort((a, b) => (b.best_wave - a.best_wave) || String(a.updated_at).localeCompare(String(b.updated_at)))
      .slice(0, limit)
      .map((row, i) => ({ rank: i + 1, username: row.username, bestWave: row.best_wave, updatedAt: row.updated_at }));
    sendJson(res, 200, { ok: true, top, realtime: null });
    return;
  }

  if (req.method === 'POST') {
    const auth = verifyToken(bearer(req));
    if (!auth) { sendJson(res, 401, { ok: false, error: '登录已失效，请重新登录' }); return; }
    const body = await readBody(req);
    if (!body) { sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
    const wave = Math.floor(Number(body.bestWave));
    if (!Number.isFinite(wave) || wave < 0) { sendJson(res, 400, { ok: false, error: 'bestWave 必须是非负整数' }); return; }
    if (wave > LB_MAX_WAVE) { sendJson(res, 400, { ok: false, error: '波次超出合理范围，已拒绝' }); return; }
    const duration = Math.floor(Number(body.duration));
    if (!Number.isFinite(duration) || duration < 0 || duration > LB_MAX_DURATION) {
      sendJson(res, 400, { ok: false, error: '对局时长无效（需为 0 ~ 43200 秒）' });
      return;
    }
    if (wave > (duration / 2) + 30) { sendJson(res, 400, { ok: false, error: '成绩与对局时长不符，已拒绝' }); return; }

    const name = auth.u;
    const i = list.findIndex(x => x.username === name);
    if (i < 0) {
      list.push({ username: name, best_wave: wave, updated_at: new Date().toISOString() });
    } else if (wave > list[i].best_wave) {
      list[i].best_wave = wave;                                  // 只增不减：波次更小就完全不动
      list[i].updated_at = new Date().toISOString();
    }
    writeScores(list);
    const row = list.find(x => x.username === name);
    sendJson(res, 200, { ok: true, bestWave: row.best_wave, updatedAt: row.updated_at });
    return;
  }

  res.writeHead(405).end();
}

// 好友接口（契约与线上 api/friends.js 一致）
//   GET  /api/friends                                好友 / 收到的申请 / 我发出的申请（需令牌）
//   POST /api/friends { action, username }           request / accept / decline / remove（需令牌）
// 身份一律取自令牌，不接受客户端传自己的用户名。
// 关系存在 data/friends.json，一行一条**有向**关系：requester -> addressee，status = pending | accepted。
// 「互为好友」= 存在 accepted 的一行（方向不敏感）；双方互相申请 → 第二次直接变 accepted。
const FRIENDS_FILE = path.join(DATA_DIR, 'friendships.json');

function readFriends() {
  try {
    const list = JSON.parse(fs.readFileSync(FRIENDS_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function writeFriends(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FRIENDS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

async function handleFriendsApi(req, res) {
  const list = readUsers();

  const auth = () => {
    const data = verifyToken(bearer(req));
    if (!data) { sendJson(res, 401, { ok: false, error: '登录已失效，请重新登录' }); return null; }
    const row = list.find(x => x.username === data.u);
    if (!row) { sendJson(res, 401, { ok: false, error: '账号不存在' }); return null; }
    if (passwordVersion(row) !== data.pv) { sendJson(res, 401, { ok: false, error: '登录已失效，请重新登录' }); return null; }
    return row;
  };

  const payload = me => {
    const rows = readFriends().filter(r => r.requester === me || r.addressee === me);
    const friends = [], incoming = [], outgoing = [];
    for (const row of rows) {
      const other = row.requester === me ? row.addressee : row.requester;
      if (row.status === 'accepted') friends.push({ username: other, at: row.updated_at || row.created_at });
      else if (row.addressee === me) incoming.push({ username: other, at: row.created_at });
      else outgoing.push({ username: other, at: row.created_at });
    }
    const avatarOf = name => {
      const u = list.find(x => x.username === name);
      return (u && u.avatar) || null;
    };
    const fill = arr => arr
      .map(x => ({ username: x.username, avatar: avatarOf(x.username), at: x.at }))
      .sort((a, b) => String(a.username).localeCompare(String(b.username)));
    return { ok: true, friends: fill(friends), incoming: fill(incoming), outgoing: fill(outgoing) };
  };

  const me = auth();
  if (!me) return;

  if (req.method === 'GET') { sendJson(res, 200, payload(me.username)); return; }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (!body) { sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
    const action = String(body.action || '');
    const target = String(body.username || '').trim();
    if (!target) { sendJson(res, 400, { ok: false, error: '缺少 username' }); return; }
    if (target === me.username) { sendJson(res, 400, { ok: false, error: '不能加自己为好友' }); return; }
    if (!list.some(x => x.username === target)) { sendJson(res, 404, { ok: false, error: '这个账号不存在' }); return; }

    const all = readFriends();
    const find = (from, to) => all.find(r => r.requester === from && r.addressee === to);
    const now = new Date().toISOString();
    const keep = all.filter(r => !(r.requester === me.username && r.addressee === target)
      && !(r.requester === target && r.addressee === me.username));

    if (action === 'request') {
      const mine = find(me.username, target);
      const theirs = find(target, me.username);
      if (mine && mine.status === 'accepted') { sendJson(res, 200, payload(me.username)); return; }
      if (theirs && theirs.status === 'pending') {
        keep.push({ requester: target, addressee: me.username, status: 'accepted', created_at: theirs.created_at, updated_at: now });
      } else if (!mine) {
        keep.push({ requester: me.username, addressee: target, status: 'pending', created_at: now, updated_at: now });
      } else {
        keep.push(mine);
      }
    } else if (action === 'accept') {
      const theirs = find(target, me.username);
      keep.push({ requester: target, addressee: me.username, status: 'accepted', created_at: (theirs && theirs.created_at) || now, updated_at: now });
    } else if (action === 'decline' || action === 'remove') {
      // decline = 删掉 pending（拒绝对方 / 撤回自己）；remove = 删好友。两者在这里都是「两向都不留」
    } else {
      sendJson(res, 400, { ok: false, error: '未知的 action' });
      return;
    }

    writeFriends(keep);
    sendJson(res, 200, payload(me.username));
    return;
  }

  res.writeHead(405).end();
}

// 聊天接口（契约与线上 api/chat.js 一致）
//   GET  /api/chat?with=<name>   取我和某位好友的往来消息（需令牌）
//   POST /api/chat { to, text }  发一条消息（需令牌）
// 身份一律取自令牌；只有**互为好友**的两人之间才能收发。
// 消息落盘 data/messages.json，一行一条 { from, to, text, t }；总量封顶，超出丢最旧的。
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const CHAT_MAX_TEXT = 200;
const CHAT_MAX_ROWS = 5000;

function readMessages() {
  try {
    const list = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function writeMessages(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function areFriends(a, b) {
  return readFriends().some(r => r.status === 'accepted'
    && ((r.requester === a && r.addressee === b) || (r.requester === b && r.addressee === a)));
}

async function handleChatApi(req, res) {
  const list = readUsers();
  const data = verifyToken(bearer(req));
  if (!data) { sendJson(res, 401, { ok: false, error: '登录已失效，请重新登录' }); return; }
  const row = list.find(x => x.username === data.u);
  if (!row) { sendJson(res, 401, { ok: false, error: '账号不存在' }); return; }
  if (passwordVersion(row) !== data.pv) { sendJson(res, 401, { ok: false, error: '登录已失效，请重新登录' }); return; }
  const me = row.username;

  if (req.method === 'GET') {
    const peer = (new URL(req.url, 'http://localhost').searchParams.get('with') || '').trim();
    if (!peer) { sendJson(res, 400, { ok: false, error: '缺少 with' }); return; }
    if (!areFriends(me, peer)) { sendJson(res, 403, { ok: false, error: '你们还不是好友' }); return; }
    const messages = readMessages()
      .filter(m => (m.from === me && m.to === peer) || (m.from === peer && m.to === me))
      .sort((a, b) => a.t - b.t);
    sendJson(res, 200, { ok: true, messages });
    return;
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (!body) { sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
    const to = String(body.to || '').trim();
    const text = String(body.text || '').trim().slice(0, CHAT_MAX_TEXT);
    if (!to) { sendJson(res, 400, { ok: false, error: '缺少 to' }); return; }
    if (!text) { sendJson(res, 400, { ok: false, error: '消息不能为空' }); return; }
    if (!list.some(x => x.username === to)) { sendJson(res, 404, { ok: false, error: '这个账号不存在' }); return; }
    if (!areFriends(me, to)) { sendJson(res, 403, { ok: false, error: '你们还不是好友' }); return; }
    const message = { from: me, to, text, t: Date.now() };
    const all = readMessages();
    all.push(message);
    writeMessages(all.slice(-CHAT_MAX_ROWS));   // 只留最近的一批，避免无限增长
    sendJson(res, 200, { ok: true, message });
    return;
  }

  res.writeHead(405).end();
}

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/api/users') { handleUsersApi(req, res); return; }
  if (urlPath === '/api/leaderboard') { handleLeaderboardApi(req, res); return; }
  if (urlPath === '/api/friends') { handleFriendsApi(req, res); return; }
  if (urlPath === '/api/chat') { handleChatApi(req, res); return; }
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath.startsWith('/data/')) {                    // 存档目录不对外暴露
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }
  const filePath = path.join(ROOT, urlPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    // 本地开发服务器：静态资源一律 no-store。否则浏览器会启发式缓存 js/game.js 与 tests/visual-smoke.js，
    // 改完代码刷新页面仍跑旧脚本（回归台会读到过期的断言文案与数值）。
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
