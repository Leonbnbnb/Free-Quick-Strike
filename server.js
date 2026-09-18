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
//   GET    /api/users?username=<name>                    单个账号（需令牌）；只返回 username / meta
//   POST   /api/users  { action:'login', username, password }  校验密码，返回令牌
//   POST   /api/users  { user, createOnly:true }         注册（无需令牌），返回令牌
//   POST   /api/users  { user }                          改密（需令牌，只动密码列）
//   PATCH  /api/users  { username, meta }                只更新存档（需令牌）
//   DELETE /api/users?username=<name>                    删除账号（需令牌，只能删自己）
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
    sendJson(res, 200, { user: { username: row.username, meta: row.meta || {} } });
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
      const row = { username: name, password: '', password_hash: hashPassword(password), meta: u.meta || {} };
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

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/api/users') { handleUsersApi(req, res); return; }
  if (urlPath === '/api/leaderboard') { handleLeaderboardApi(req, res); return; }
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
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
