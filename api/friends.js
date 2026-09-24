// Vercel Serverless Function：好友接口（Supabase 后端）
//
// 契约与本地开发用的 server.js 完全一致，前端 js/game.js 不需要感知差异：
//   GET    /api/friends                                     -> { ok, friends, incoming, outgoing }（需令牌）
//   POST   /api/friends { action:'request', username }      -> 发送好友申请
//   POST   /api/friends { action:'accept',  username }      -> 同意（对方发给我的那条）
//   POST   /api/friends { action:'decline', username }      -> 拒绝 / 撤回（删掉 pending 那一行）
//   POST   /api/friends { action:'remove',  username }      -> 删除好友（两向都删）
//
// 身份一律取自令牌，**不接受客户端传自己的用户名**（避免冒充）。
//
// 好友关系存在 public.friendships（一行一条有向关系）：
//   · 「互为好友」= 存在 status='accepted' 的一行（方向不敏感，查询时两向都查）；
//   · 「我的申请对方还没处理」= requester=我 and status='pending'；
//   · 「别人申请我还没处理」= addressee=我 and status='pending'；
//   · 双方互相申请 → 第二次申请直接变成 accepted（省掉一次来回）。
//
// 头像：好友列表要显示别人的头像，而 users.meta 是隐私（整个存档），
// 所以头像单独存在 users.avatar 列，这里只读 `username, avatar` 两列。
//
// 安全：friendships 表 RLS 开启且零策略，anon / authenticated 权限全部收回，
// 只有本函数持有的 service 密钥能访问；也刻意没把它加进 Realtime 发布。
//
// 通过 Supabase 的 PostgREST 直连，不引入任何运行时依赖。

const { verifyToken, passwordVersion, bearer } = require('./_auth');

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USERS = 'users';
const FRIENDS = 'friendships';

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

function send(res, code, payload) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

// 令牌 -> 账号行（顺带校验密码版本，改密后旧令牌立即失效）
async function requireAuth(req, res) {
  const data = verifyToken(bearer(req));
  if (!data) { send(res, 401, { ok: false, error: '登录已失效，请重新登录' }); return null; }
  const r = await sbFetch(`${USERS}?select=username,password,password_hash&username=eq.${eq(data.u)}&limit=1`, { headers: headers() });
  const row = (await r.json())[0] || null;
  if (!row) { send(res, 401, { ok: false, error: '账号不存在' }); return null; }
  if (passwordVersion(row) !== data.pv) { send(res, 401, { ok: false, error: '登录已失效，请重新登录' }); return null; }
  return row;
}

async function userExists(username) {
  const r = await sbFetch(`${USERS}?select=username&username=eq.${eq(username)}&limit=1`, { headers: headers() });
  return (await r.json()).length > 0;
}

// PostgREST 的 in.() 列表：每个值用双引号包住，整体再做一次 URL 编码
function inList(names) {
  return encodeURIComponent('(' + names.map(n => `"${String(n).replace(/"/g, '\\"')}"`).join(',') + ')');
}

// 取这批账号的公开头像（只读 username / avatar 两列）
async function avatarsOf(names) {
  const map = {};
  if (!names.length) return map;
  const r = await sbFetch(`${USERS}?select=username,avatar&username=in.${inList(names)}`, { headers: headers() });
  (await r.json()).forEach(row => { map[row.username] = row.avatar || null; });
  return map;
}

// 我这个账号参与的全部关系行
async function myRows(me) {
  const r = await sbFetch(
    `${FRIENDS}?select=requester,addressee,status,created_at,updated_at&or=(requester.eq.${eq(me)},addressee.eq.${eq(me)})`,
    { headers: headers() },
  );
  return await r.json();
}

async function upsertPending(from, to) {
  await sbFetch(`${FRIENDS}?on_conflict=requester,addressee`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify({ requester: from, addressee: to, status: 'pending' }),
  });
}

async function setStatus(from, to, status) {
  await sbFetch(`${FRIENDS}?requester=eq.${eq(from)}&addressee=eq.${eq(to)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  });
}

async function deleteRow(from, to) {
  await sbFetch(`${FRIENDS}?requester=eq.${eq(from)}&addressee=eq.${eq(to)}`, {
    method: 'DELETE',
    headers: headers({ Prefer: 'return=minimal' }),
  });
}

async function listPayload(me) {
  const rows = await myRows(me);
  const friends = [], incoming = [], outgoing = [];
  for (const row of rows) {
    const other = row.requester === me ? row.addressee : row.requester;
    if (row.status === 'accepted') {
      friends.push({ username: other, at: row.updated_at || row.created_at });
    } else if (row.addressee === me) {
      incoming.push({ username: other, at: row.created_at });
    } else {
      outgoing.push({ username: other, at: row.created_at });
    }
  }
  const names = [...new Set([...friends, ...incoming, ...outgoing].map(x => x.username))];
  const avatars = await avatarsOf(names);
  const withAvatar = list => list
    .map(x => ({ username: x.username, avatar: avatars[x.username] || null, at: x.at }))
    .sort((a, b) => String(a.username).localeCompare(String(b.username)));
  return { ok: true, friends: withAvatar(friends), incoming: withAvatar(incoming), outgoing: withAvatar(outgoing) };
}

module.exports = async function handler(req, res) {
  if (!SB_URL || !SB_KEY) {
    send(res, 500, { ok: false, error: '缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 环境变量' });
    return;
  }
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (req.method === 'GET') {
      send(res, 200, await listPayload(me.username));
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const action = String(body.action || '');
      const target = String(body.username || '').trim();
      if (!target) { send(res, 400, { ok: false, error: '缺少 username' }); return; }
      if (target === me.username) { send(res, 400, { ok: false, error: '不能加自己为好友' }); return; }
      if (!(await userExists(target))) { send(res, 404, { ok: false, error: '这个账号不存在' }); return; }

      if (action === 'request') {
        const rows = await myRows(me.username);
        const mine = rows.find(r => r.requester === me.username && r.addressee === target);
        const theirs = rows.find(r => r.requester === target && r.addressee === me.username);
        if (mine && mine.status === 'accepted') { send(res, 200, await listPayload(me.username)); return; }
        if (theirs && theirs.status === 'pending') {
          await setStatus(target, me.username, 'accepted');   // 对方也申请过我：直接成为好友
        } else if (!mine) {
          await upsertPending(me.username, target);
        }
        send(res, 200, await listPayload(me.username));
        return;
      }

      if (action === 'accept') {
        await setStatus(target, me.username, 'accepted');
        send(res, 200, await listPayload(me.username));
        return;
      }

      if (action === 'decline') {
        await deleteRow(target, me.username);   // 对方申请我 -> 拒绝
        await deleteRow(me.username, target);   // 我申请对方 -> 撤回
        send(res, 200, await listPayload(me.username));
        return;
      }

      if (action === 'remove') {
        await deleteRow(me.username, target);
        await deleteRow(target, me.username);
        send(res, 200, await listPayload(me.username));
        return;
      }

      send(res, 400, { ok: false, error: '未知的 action' });
      return;
    }

    send(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    send(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
};
