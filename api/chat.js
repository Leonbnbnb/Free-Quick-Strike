// Vercel Serverless Function：好友聊天接口（Supabase 后端）
//
// 契约与本地开发用的 server.js 完全一致，前端 js/game.js 不需要感知差异：
//   GET  /api/chat?with=<name>   -> { ok, messages:[{ from, to, text, t }] }（需令牌）
//   POST /api/chat { to, text }  -> { ok, message }（需令牌）
//
// 身份一律取自令牌，**不接受客户端传自己的用户名**（避免冒充）。
// 只有**互为好友**的两人之间才能收发 —— 判断依据是 friendships 里存在 status='accepted' 的一行。
//
// 消息存在 public.messages：from_user / to_user / text / created_at。
// 表 RLS 开启且零策略，anon / authenticated 权限全部收回，只有本函数持有的 service 密钥能访问；
// 也刻意没把它加进 Realtime 发布（前端用轮询）。
//
// 通过 Supabase 的 PostgREST 直连，不引入任何运行时依赖。

const { verifyToken, passwordVersion, bearer } = require('./_auth');

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USERS = 'users';
const FRIENDS = 'friendships';
const MESSAGES = 'messages';

const CHAT_MAX_TEXT = 200;
const CHAT_PAGE = 200;   // 一次最多取最近 200 条

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

async function areFriends(a, b) {
  const r = await sbFetch(
    `${FRIENDS}?select=requester,addressee,status&status=eq.accepted&or=(and(requester.eq.${eq(a)},addressee.eq.${eq(b)}),and(requester.eq.${eq(b)},addressee.eq.${eq(a)}))&limit=1`,
    { headers: headers() },
  );
  return (await r.json()).length > 0;
}

// created_at -> 毫秒时间戳，前端直接 new Date(t) 用
const toMs = v => { const n = Date.parse(v); return Number.isFinite(n) ? n : Date.now(); };
const shape = row => ({ from: row.from_user, to: row.to_user, text: row.text, t: toMs(row.created_at) });

module.exports = async function handler(req, res) {
  if (!SB_URL || !SB_KEY) {
    send(res, 500, { ok: false, error: '缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 环境变量' });
    return;
  }
  try {
    const me = await requireAuth(req, res);
    if (!me) return;

    if (req.method === 'GET') {
      const peer = String((req.query && req.query.with) || '').trim();
      if (!peer) { send(res, 400, { ok: false, error: '缺少 with' }); return; }
      if (!(await areFriends(me.username, peer))) { send(res, 403, { ok: false, error: '你们还不是好友' }); return; }
      const r = await sbFetch(
        `${MESSAGES}?select=from_user,to_user,text,created_at&or=(and(from_user.eq.${eq(me.username)},to_user.eq.${eq(peer)}),and(from_user.eq.${eq(peer)},to_user.eq.${eq(me.username)}))&order=created_at.desc&limit=${CHAT_PAGE}`,
        { headers: headers() },
      );
      const rows = await r.json();
      send(res, 200, { ok: true, messages: rows.reverse().map(shape) });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const to = String(body.to || '').trim();
      const text = String(body.text || '').trim().slice(0, CHAT_MAX_TEXT);
      if (!to) { send(res, 400, { ok: false, error: '缺少 to' }); return; }
      if (!text) { send(res, 400, { ok: false, error: '消息不能为空' }); return; }
      if (!(await userExists(to))) { send(res, 404, { ok: false, error: '这个账号不存在' }); return; }
      if (!(await areFriends(me.username, to))) { send(res, 403, { ok: false, error: '你们还不是好友' }); return; }
      const r = await sbFetch(`${MESSAGES}?select=from_user,to_user,text,created_at`, {
        method: 'POST',
        headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ from_user: me.username, to_user: to, text }),
      });
      const row = (await r.json())[0];
      send(res, 200, { ok: true, message: shape(row) });
      return;
    }

    send(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    send(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
};
