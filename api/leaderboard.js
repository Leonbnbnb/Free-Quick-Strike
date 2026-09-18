// Vercel Serverless Function：最久波次排行榜（Supabase 后端）
//
//   GET  /api/leaderboard?limit=50   -> { top: [{ rank, username, bestWave, updatedAt }], realtime: {...} }
//   POST /api/leaderboard            <- { username, bestWave }   提交成绩（只增不减）
//
// 写入走 rpc/submit_score：由数据库在一条语句里做「取较大值」，多人同时提交不会互相覆盖。
// GET 顺带把 Realtime 的连接信息下发给前端（形如 wss://<ref>.supabase.co/realtime/v1/websocket
// + publishable key），前端用它订阅 scores 表变更实现秒级刷新；没配 key 时返回 null，
// 前端自动降级为轮询。
//
// 通过 Supabase 的 PostgREST 直连，不引入任何运行时依赖。
// service 密钥只存在于服务端环境变量，绝不下发前端。

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SB_ANON = process.env.SUPABASE_ANON_KEY || '';
const TABLE = 'scores';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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

async function topScores(limit) {
  const r = await sbFetch(
    `${TABLE}?select=username,best_wave,updated_at&order=best_wave.desc,updated_at.asc&limit=${limit}`,
    { headers: headers() },
  );
  const rows = await r.json();
  return rows.map((row, i) => ({
    rank: i + 1,
    username: row.username,
    bestWave: row.best_wave,
    updatedAt: row.updated_at,
  }));
}

async function submitScore(username, bestWave) {
  const r = await sbFetch('rpc/submit_score', {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify({ p_username: username, p_wave: bestWave }),
  });
  const rows = await r.json();
  return rows[0] || null;
}

// 只下发 publishable / anon key：这个 key 设计上就是公开的，且 scores 表只开放了只读。
function realtimeInfo() {
  if (!SB_URL || !SB_ANON) return null;
  return {
    url: `${SB_URL.replace(/^http/, 'ws')}/realtime/v1/websocket`,
    key: SB_ANON,
    table: TABLE,
  };
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
      const raw = Number(new URL(req.url, 'http://localhost').searchParams.get('limit'));
      const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_LIMIT) : DEFAULT_LIMIT;
      send(res, 200, { ok: true, top: await topScores(limit), realtime: realtimeInfo() });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const username = String(body.username || '').trim();
      if (!username) { send(res, 400, { ok: false, error: '缺少 username' }); return; }
      const wave = Math.floor(Number(body.bestWave));
      if (!Number.isFinite(wave) || wave < 0) { send(res, 400, { ok: false, error: 'bestWave 必须是非负整数' }); return; }
      const row = await submitScore(username, wave);
      send(res, 200, { ok: true, bestWave: row ? row.best_wave : wave, updatedAt: row ? row.updated_at : null });
      return;
    }

    send(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    send(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
};
