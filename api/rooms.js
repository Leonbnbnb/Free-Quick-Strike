// Vercel Serverless Function：合作房间接口（Supabase 后端）
//
// 契约与本地开发用的 server.js 完全一致，前端 js/game.js 不需要感知差异：
//   GET  /api/rooms?code=<code>                        -> { ok, room }（房间快照；不存在时 room:null）
//   GET  /api/rooms?invites=1                          -> { ok, invites:[{code,inviter,avatar,at}] }
//   POST /api/rooms { action:'create' }                -> 建房（房主 = 我）
//   POST /api/rooms { action:'join',   code }          -> 以访客身份进房
//   POST /api/rooms { action:'ready',  code, ready }   -> 切换我的就绪状态
//   POST /api/rooms { action:'invite', code, username }-> 邀请好友进房（需已是好友）
//   POST /api/rooms { action:'leave',  code }          -> 离开（房主离开 = 解散房间）
//   POST /api/rooms { action:'decline', code }         -> 忽略收到的邀请
//   全部需令牌，身份取自令牌，**不接受客户端传自己的用户名**。
//
// 本轮只做「房间系统」：**局内双人同步尚未实现**，room 里没有对局状态，
// 双方都点「准备」也只是大厅里的状态位。见 docs/需求方案.md 的「合作房间」一节。
//
// 数据模型见 supabase/migrations/0007_rooms.sql：
//   rooms(code pk, host, guest, host_ready, guest_ready, created_at, updated_at)
//   room_invites(code, inviter, invitee, created_at) 主键 (code, invitee)
// 两张表 RLS 开启且零策略、anon / authenticated 权限全收回，也不加入 Realtime 发布；
// 实时性用前端 3 秒轮询兜底（与好友 / 聊天同一套做法）。
//
// 通过 Supabase 的 PostgREST 直连，不引入任何运行时依赖。

const crypto = require('crypto');
const { verifyToken, passwordVersion, bearer } = require('./_auth');

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USERS = 'users';
const FRIENDS = 'friendships';
const ROOMS = 'rooms';
const INVITES = 'room_invites';

// 房间码字母表刻意去掉 I / O / 0 / 1：念给好友听、手打都不会认错
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;   // 2 小时没动静的房间在下次建房时被清掉

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
const nowIso = () => new Date().toISOString();
const minimal = { Prefer: 'return=minimal' };

function send(res, code, payload) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function requireAuth(req, res) {
  const data = verifyToken(bearer(req));
  if (!data) { send(res, 401, { ok: false, error: '登录已失效，请重新登录' }); return null; }
  const r = await sbFetch(`${USERS}?select=username,password,password_hash&username=eq.${eq(data.u)}&limit=1`, { headers: headers() });
  const row = (await r.json())[0] || null;
  if (!row) { send(res, 401, { ok: false, error: '账号不存在' }); return null; }
  if (passwordVersion(row) !== data.pv) { send(res, 401, { ok: false, error: '登录已失效，请重新登录' }); return null; }
  return row;
}

// PostgREST 的 in.() 列表：每个值用双引号包住，整体再做一次 URL 编码
function inList(names) {
  return encodeURIComponent('(' + names.map(n => `"${String(n).replace(/"/g, '\\"')}"`).join(',') + ')');
}

// 只读 username / avatar 两列（users.meta 是隐私，好友 / 房间里只显示头像）
async function avatarsOf(names) {
  const map = {};
  const list = [...new Set(names.filter(Boolean))];
  if (!list.length) return map;
  const r = await sbFetch(`${USERS}?select=username,avatar&username=in.${inList(list)}`, { headers: headers() });
  (await r.json()).forEach(row => { map[row.username] = row.avatar || null; });
  return map;
}

// 房间行 -> 给前端的快照（补上双方头像，字段名与 game.js 的 coopRoom 对齐）
async function shape(row) {
  if (!row) return null;
  const avatars = await avatarsOf([row.host, row.guest]);
  return {
    code: row.code,
    host: row.host,
    guest: row.guest || null,
    hostReady: !!row.host_ready,
    guestReady: !!row.guest_ready,
    hostAvatar: avatars[row.host] || null,
    guestAvatar: row.guest ? (avatars[row.guest] || null) : null,
    at: row.updated_at || row.created_at,
  };
}

async function getRoom(code) {
  const r = await sbFetch(`${ROOMS}?select=*&code=eq.${eq(code)}&limit=1`, { headers: headers() });
  return (await r.json())[0] || null;
}

function newCode() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHA[crypto.randomInt(0, CODE_ALPHA.length)];
  return s;
}

async function patchRoom(code, patch) {
  await sbFetch(`${ROOMS}?code=eq.${eq(code)}`, {
    method: 'PATCH',
    headers: headers(minimal),
    body: JSON.stringify(Object.assign({ updated_at: nowIso() }, patch)),
  });
}

// 解散房间：连带把它的邀请清掉（不然好友那边会一直挂着一个进不去的邀请）
async function dropRoom(code) {
  await sbFetch(`${ROOMS}?code=eq.${eq(code)}`, { method: 'DELETE', headers: headers(minimal) });
  await sbFetch(`${INVITES}?code=eq.${eq(code)}`, { method: 'DELETE', headers: headers(minimal) });
}

async function clearInvite(code, invitee) {
  await sbFetch(`${INVITES}?code=eq.${eq(code)}&invitee=eq.${eq(invitee)}`, { method: 'DELETE', headers: headers(minimal) });
}

// 一个账号同时只在一个房间里：建房 / 进房前先把自己在别处的席位清掉
async function clearMySeats(me) {
  const r = await sbFetch(`${ROOMS}?select=code,host,guest&or=(host.eq.${eq(me)},guest.eq.${eq(me)})`, { headers: headers() });
  for (const row of await r.json()) {
    if (row.host === me) await dropRoom(row.code);
    else await patchRoom(row.code, { guest: null, guest_ready: false });
  }
}

// 过期房间在「建房」时顺手清一遍 —— 没有定时任务，也不需要为一个大厅表上 cron
async function purgeStale() {
  const cutoff = new Date(Date.now() - ROOM_TTL_MS).toISOString();
  await sbFetch(`${ROOMS}?updated_at=lt.${eq(cutoff)}`, { method: 'DELETE', headers: headers(minimal) });
  await sbFetch(`${INVITES}?created_at=lt.${eq(cutoff)}`, { method: 'DELETE', headers: headers(minimal) });
}

async function areFriends(a, b) {
  const r = await sbFetch(
    `${FRIENDS}?select=status&status=eq.accepted&limit=1`
    + `&or=(and(requester.eq.${eq(a)},addressee.eq.${eq(b)}),and(requester.eq.${eq(b)},addressee.eq.${eq(a)}))`,
    { headers: headers() },
  );
  return (await r.json()).length > 0;
}

async function userExists(username) {
  const r = await sbFetch(`${USERS}?select=username&username=eq.${eq(username)}&limit=1`, { headers: headers() });
  return (await r.json()).length > 0;
}

// 我收到的邀请：只保留「房间还在、我还有空位、而且我还没在里面」的那些
async function myInvites(me) {
  const r = await sbFetch(`${INVITES}?select=code,inviter,created_at&invitee=eq.${eq(me)}`, { headers: headers() });
  const rows = await r.json();
  if (!rows.length) return [];
  const codes = [...new Set(rows.map(x => x.code))];
  const rr = await sbFetch(`${ROOMS}?select=code,host,guest&code=in.${inList(codes)}`, { headers: headers() });
  const open = {};
  (await rr.json()).forEach(x => {
    if (x.host === me) return;                 // 我自己建的房，不用提示
    if (x.guest && x.guest !== me) return;     // 已经满了
    open[x.code] = x;
  });
  const avatars = await avatarsOf(rows.map(x => x.inviter));
  return rows
    .filter(x => open[x.code])
    .map(x => ({ code: x.code, inviter: x.inviter, avatar: avatars[x.inviter] || null, at: x.created_at }))
    .sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1));
}

module.exports = async function handler(req, res) {
  if (!SB_URL || !SB_KEY) {
    send(res, 500, { ok: false, error: '缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 环境变量' });
    return;
  }
  try {
    const me = await requireAuth(req, res);
    if (!me) return;
    const who = me.username;

    if (req.method === 'GET') {
      const params = new URL(req.url, 'http://localhost').searchParams;
      if (params.get('invites')) { send(res, 200, { ok: true, invites: await myInvites(who) }); return; }
      const code = String(params.get('code') || '').trim().toUpperCase();
      if (!code) { send(res, 400, { ok: false, error: '缺少 code' }); return; }
      send(res, 200, { ok: true, room: await shape(await getRoom(code)) });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const action = String(body.action || '');
      const code = String(body.code || '').trim().toUpperCase();

      if (action === 'create') {
        await purgeStale();
        await clearMySeats(who);           // 一个账号同时只在一个房间里
        let row = null;
        for (let i = 0; i < 8 && !row; i++) {
          const c = newCode();
          if (await getRoom(c)) continue;  // 撞码就重摇（32^6 的空间，实际几乎不会发生）
          const r = await sbFetch(ROOMS, {
            method: 'POST',
            headers: headers({ Prefer: 'return=representation' }),
            body: JSON.stringify({ code: c, host: who }),
          });
          row = (await r.json())[0] || null;
        }
        if (!row) { send(res, 500, { ok: false, error: '房间码生成失败，请再试一次' }); return; }
        send(res, 200, { ok: true, room: await shape(row) });
        return;
      }

      if (!code) { send(res, 400, { ok: false, error: '缺少 code' }); return; }

      if (action === 'join') {
        const room = await getRoom(code);
        if (!room) { send(res, 404, { ok: false, error: '房间不存在或已解散' }); return; }
        if (room.host === who) { send(res, 400, { ok: false, error: '这是你自己创建的房间' }); return; }
        if (room.guest && room.guest !== who) { send(res, 409, { ok: false, error: '房间已经满了' }); return; }
        if (room.guest !== who) {
          await clearMySeats(who);
          await patchRoom(code, { guest: who, guest_ready: false });
          await sbFetch(`${INVITES}?code=eq.${eq(code)}`, { method: 'DELETE', headers: headers(minimal) });
        }
        send(res, 200, { ok: true, room: await shape(await getRoom(code)) });
        return;
      }

      if (action === 'ready') {
        const room = await getRoom(code);
        if (!room) { send(res, 404, { ok: false, error: '房间不存在或已解散' }); return; }
        if (room.host !== who && room.guest !== who) { send(res, 403, { ok: false, error: '你不在这个房间里' }); return; }
        await patchRoom(code, room.host === who ? { host_ready: !!body.ready } : { guest_ready: !!body.ready });
        send(res, 200, { ok: true, room: await shape(await getRoom(code)) });
        return;
      }

      if (action === 'invite') {
        const target = String(body.username || '').trim();
        if (!target) { send(res, 400, { ok: false, error: '缺少 username' }); return; }
        if (target === who) { send(res, 400, { ok: false, error: '不能邀请自己' }); return; }
        const room = await getRoom(code);
        if (!room) { send(res, 404, { ok: false, error: '房间不存在或已解散' }); return; }
        if (room.host !== who && room.guest !== who) { send(res, 403, { ok: false, error: '你不在这个房间里' }); return; }
        if (room.guest && room.guest !== target) { send(res, 409, { ok: false, error: '房间已经满了' }); return; }
        if (!(await userExists(target))) { send(res, 404, { ok: false, error: '这个账号不存在' }); return; }
        if (!(await areFriends(who, target))) { send(res, 403, { ok: false, error: '只能邀请已经是好友的人' }); return; }
        await sbFetch(`${INVITES}?on_conflict=code,invitee`, {
          method: 'POST',
          headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify({ code, inviter: who, invitee: target, created_at: nowIso() }),
        });
        send(res, 200, { ok: true });
        return;
      }

      if (action === 'decline') {
        await clearInvite(code, who);
        send(res, 200, { ok: true });
        return;
      }

      if (action === 'leave') {
        await clearInvite(code, who);      // 顺手把「我收到的这条邀请」也清掉
        const room = await getRoom(code);
        if (room && room.host === who) await dropRoom(code);          // 房主离开 = 解散
        else if (room && room.guest === who) await patchRoom(code, { guest: null, guest_ready: false });
        send(res, 200, { ok: true, room: null });
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
