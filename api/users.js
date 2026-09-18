// Vercel Serverless Function：账号存档接口（Supabase 后端）
//
// 契约与本地开发用的 server.js 完全一致，前端 js/game.js 不需要感知差异：
//   GET    /api/users                                     -> { ok: true }，探活（判断该走在线接口还是本地存储）
//   GET    /api/users?username=<name>                    -> { user: { username, meta } }，不存在 404（刷新后恢复登录态）
//   POST   /api/users  { action:'login', username, password } -> 校验密码，成功返回 { ok, user: { username, meta } }
//   POST   /api/users  { user, createOnly }               -> 注册 / 改密；createOnly=true 时已存在返回 409
//   PATCH  /api/users  { username, meta }                 -> 只更新存档，不需要密码
//   DELETE /api/users?username=<name>                     -> 删除单个账号
//
// 密码只以 PBKDF2-SHA256 哈希形式落库，任何接口都不返回密码或哈希；
// 老账号（明文 password）在登录成功时原地升级为哈希。
// 写入一律按账号粒度，不做整表覆盖，避免多人同时在线互相删存档。
//
// 通过 Supabase 的 PostgREST 直连，不引入任何运行时依赖。
// 这里用的是 secret / service_role key，只能放在服务端环境变量里，绝不可下发到前端。

const crypto = require('crypto');

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TABLE = 'users';
const PBKDF2_ITER = 120000;   // 与前端 js/game.js 的本地哈希保持同一格式

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

function headers(extra) {
  return Object.assign({
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  }, extra || {});
}

async function sbFetch(path, init) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, init);
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`supabase ${r.status}: ${detail.slice(0, 300)}`);
  }
  return r;
}

const eq = v => encodeURIComponent(v);

// 只取对外可见的字段
async function getPublicUser(username) {
  const r = await sbFetch(`${TABLE}?select=username,meta&username=eq.${eq(username)}&limit=1`, { headers: headers() });
  return (await r.json())[0] || null;
}

// 登录校验专用：需要读到哈希与老明文口令
async function getAuthRow(username) {
  const r = await sbFetch(
    `${TABLE}?select=username,password,password_hash,meta&username=eq.${eq(username)}&limit=1`,
    { headers: headers() },
  );
  return (await r.json())[0] || null;
}

// 创建 / 改密。createOnly=true 时用 ignore-duplicates：账号已存在则原样保留并返回 false，
// 由数据库主键做原子判重，两个并发注册不会互相覆盖。
async function putUser(user, createOnly) {
  const row = {
    username: user.username,
    password: '',                              // 明文列清空，只留哈希
    password_hash: hashPassword(user.password),
    meta: user.meta || {},
  };
  const resolution = createOnly ? 'ignore-duplicates' : 'merge-duplicates';
  const r = await sbFetch(`${TABLE}?on_conflict=username`, {
    method: 'POST',
    headers: headers({ Prefer: `resolution=${resolution},return=representation` }),
    body: JSON.stringify(row),
  });
  return (await r.json()).length > 0;
}

async function updateMeta(username, meta) {
  await sbFetch(`${TABLE}?username=eq.${eq(username)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ meta: meta || {} }),
  });
}

// 登录成功且原先是明文口令：原地升级为哈希
async function upgradeToHash(username, password) {
  await sbFetch(`${TABLE}?username=eq.${eq(username)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ password_hash: hashPassword(password), password: '' }),
  });
}

async function deleteUser(username) {
  await sbFetch(`${TABLE}?username=eq.${eq(username)}`, {
    method: 'DELETE',
    headers: headers({ Prefer: 'return=minimal' }),
  });
}

function send(res, code, payload) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (!SB_URL || !SB_KEY) {
    send(res, 500, { ok: false, error: '缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 环境变量' });
    return;
  }
  try {
    const username = (new URL(req.url, 'http://localhost').searchParams.get('username') || '').trim();

    if (req.method === 'GET') {
      // 不带参数只做探活：前端用它判断该走在线接口还是退回本地存储
      if (!username) { send(res, 200, { ok: true, api: 'users' }); return; }
      const user = await getPublicUser(username);
      if (!user) { send(res, 404, { ok: false, error: '账号不存在' }); return; }
      send(res, 200, { user: { username: user.username, meta: user.meta || {} } });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      if (body.action === 'login') {
        const name = String(body.username || '').trim();
        const password = String(body.password || '');
        const row = name ? await getAuthRow(name) : null;
        if (!row) { send(res, 401, { ok: false, error: '用户名或密码错误' }); return; }
        if (row.password_hash) {
          if (!verifyPassword(password, row.password_hash)) { send(res, 401, { ok: false, error: '用户名或密码错误' }); return; }
        } else if (isLegacyPlain(row.password) && row.password === password) {
          await upgradeToHash(name, password);   // 老账号：登录成功即升级
        } else {
          send(res, 401, { ok: false, error: '用户名或密码错误' });
          return;
        }
        send(res, 200, { ok: true, user: { username: row.username, meta: row.meta || {} } });
        return;
      }

      const u = body.user;
      const name = (u && typeof u.username === 'string') ? u.username.trim() : '';
      if (!name) throw new Error('缺少 user.username');
      const password = String((u && u.password) || '');
      if (!password) { send(res, 400, { ok: false, error: '注册与改密必须提供密码' }); return; }
      const ok = await putUser({ username: name, password, meta: u.meta }, !!body.createOnly);
      if (!ok) { send(res, 409, { ok: false, error: '用户名已存在' }); return; }
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const name = String(body.username || '').trim();
      if (!name) throw new Error('缺少 username');
      await updateMeta(name, body.meta);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      if (!username) throw new Error('缺少 username');
      await deleteUser(username);
      send(res, 200, { ok: true });
      return;
    }

    send(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    send(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
};
