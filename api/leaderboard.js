// Vercel Serverless Function：最久波次排行榜（Supabase 后端）
//
//   GET  /api/leaderboard?limit=50   -> { top: [{ rank, username, bestWave, updatedAt }], realtime: {...} }
//   POST /api/leaderboard            <- { bestWave, duration }（需 Authorization: Bearer <token>）
//
// 写入走 rpc/submit_score：由数据库在一条语句里做「取较大值」，并在服务端做合理性校验
// （一局最多每 2 秒推进一步、单局时长上限 12 小时、波次上限 5000），多人同时提交不会互相覆盖。
// 提交者身份取自令牌而不是请求体，因此无法替别人上报成绩。
//
// 注意：本游戏是纯前端客户端，服务端只能校验「上报的数字自不自洽」，无法证明这一局真的打过。
// 这道校验能挡住随手 POST 一个 9999，挡不住刻意伪造 duration 的人；要真正防住需要服务端复盘对局。
//
// GET 顺带把 Realtime 的连接信息下发给前端（形如 wss://<ref>.supabase.co/realtime/v1/websocket
// + publishable key），前端用它订阅 scores 表变更实现秒级刷新；没配 key 时返回 null，
// 前端自动降级为轮询。
//
// 通过 Supabase 的 PostgREST 直连，不引入任何运行时依赖。
// service 密钥只存在于服务端环境变量，绝不下发前端。

const { verifyToken, bearer } = require('./_auth');

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SB_ANON = process.env.SUPABASE_ANON_KEY || '';
const TABLE = 'scores';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_WAVE = 5000;
const MAX_DURATION = 12 * 3600;

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

// 只增不减与合理性校验都在 submit_score 里完成，这里把数据库抛出的原因翻成人话
const SUBMIT_REASONS = {
  wave_too_fast: '成绩与对局时长不符，已拒绝',
  wave_out_of_range: '波次超出合理范围，已拒绝',
  duration_out_of_range: '对局时长超出合理范围，已拒绝',
};

async function submitScore(username, bestWave, duration) {
  try {
    const r = await sbFetch('rpc/submit_score', {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ p_username: username, p_wave: bestWave, p_duration: duration }),
    });
    const rows = await r.json();
    return { ok: true, row: rows[0] || null };
  } catch (e) {
    const msg = String((e && e.message) || e);
    const key = Object.keys(SUBMIT_REASONS).find(k => msg.includes(k));
    if (key) return { ok: false, reason: SUBMIT_REASONS[key] };
    throw e;
  }
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
      // 身份只认令牌：不能替别人上报成绩
      const auth = verifyToken(bearer(req));
      if (!auth) { send(res, 401, { ok: false, error: '登录已失效，请重新登录' }); return; }

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const wave = Math.floor(Number(body.bestWave));
      if (!Number.isFinite(wave) || wave < 0) { send(res, 400, { ok: false, error: 'bestWave 必须是非负整数' }); return; }
      if (wave > MAX_WAVE) { send(res, 400, { ok: false, error: '波次超出合理范围，已拒绝' }); return; }
      const duration = Math.floor(Number(body.duration));
      if (!Number.isFinite(duration) || duration < 0 || duration > MAX_DURATION) {
        send(res, 400, { ok: false, error: '对局时长无效（需为 0 ~ 43200 秒）' });
        return;
      }

      const result = await submitScore(auth.u, wave, duration);
      if (!result.ok) { send(res, 400, { ok: false, error: result.reason }); return; }
      send(res, 200, {
        ok: true,
        bestWave: result.row ? result.row.best_wave : wave,
        updatedAt: result.row ? result.row.updated_at : null,
      });
      return;
    }

    send(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    send(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
};
