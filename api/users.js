// Vercel Serverless Function：账号存档接口（Supabase 后端）
//
// 契约与本地开发用的 server.js 完全一致，前端 js/game.js 不需要任何改动：
//   GET  /api/users  -> { users: [{ username, password, meta }] }
//   POST /api/users  <- { users: [...] }   整表覆盖：不在列表里的账号会被删除
//
// 通过 Supabase 的 PostgREST 直连，不引入任何运行时依赖。
// 这里用的是 secret / service_role key，只能放在服务端环境变量里，绝不可下发到前端。

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TABLE = 'users';

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

async function listUsers() {
  const r = await sbFetch(`${TABLE}?select=username,password,meta&order=username.asc`, { headers: headers() });
  return r.json();
}

async function listUsernames() {
  const r = await sbFetch(`${TABLE}?select=username`, { headers: headers() });
  return (await r.json()).map(row => row.username);
}

// 整表覆盖：先 upsert 传入的全部账号，再删掉库里多余的账号
async function syncUsers(users) {
  const rows = users.map(u => ({ username: u.username, password: u.password, meta: u.meta || {} }));
  if (rows.length) {
    await sbFetch(`${TABLE}?on_conflict=username`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(rows),
    });
  }
  const keep = rows.map(r => r.username);
  for (const name of (await listUsernames()).filter(n => !keep.includes(n))) {
    await sbFetch(`${TABLE}?username=eq.${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: headers({ Prefer: 'return=minimal' }),
    });
  }
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
    if (req.method === 'GET') {
      send(res, 200, { users: await listUsers() });
      return;
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (!Array.isArray(body.users)) throw new Error('bad payload');
      await syncUsers(body.users);
      send(res, 200, { ok: true });
      return;
    }
    send(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    send(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
};
