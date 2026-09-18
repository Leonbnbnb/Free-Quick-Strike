// 会话令牌：签名、签发与校验（api/ 下以 _ 开头的文件不会被 Vercel 暴露成接口）
//
// 令牌是无状态的：`<payloadBase64Url>.<HMAC-SHA256Base64Url>`，payload 为
// { u: 用户名, pv: 密码版本, exp: 过期时间戳 }。服务端不需要额外建表。
//
// pv 取当前密码哈希的摘要前 16 位：**改密后旧令牌立即失效**。
// 令牌只能证明「请求方登录过这个账号」，不能替代服务端记账 —— 详见 docs/需求方案.md 的 2.3。

const crypto = require('crypto');

const TTL_MS = 30 * 24 * 3600 * 1000;   // 30 天

// 生产环境建议显式配置 SESSION_SECRET；没配就退到服务密钥派生（同样只在服务端存在）
const SECRET = process.env.SESSION_SECRET
  || crypto.createHash('sha256')
    .update('fury-strike|' + (process.env.SUPABASE_SERVICE_ROLE_KEY || 'fury-strike-dev-secret'))
    .digest();

const b64 = buf => Buffer.from(buf).toString('base64url');
const sign = payload => crypto.createHmac('sha256', SECRET).update(payload).digest();

// 账号行 -> 密码版本。老账号还没升级成哈希时用明文列参与，升级后版本自动变化。
function passwordVersion(row) {
  const src = (row && row.password_hash) || ('legacy:' + ((row && row.password) || ''));
  return crypto.createHash('sha256').update(src).digest('hex').slice(0, 16);
}

function issueToken(row) {
  const payload = b64(JSON.stringify({
    u: row.username,
    pv: passwordVersion(row),
    exp: Date.now() + TTL_MS,
  }));
  return `${payload}.${b64(sign(payload))}`;
}

// 返回 { u, pv, exp } 或 null（签名不对 / 过期 / 格式错误）
function verifyToken(token) {
  if (typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expect = sign(payload);
  let got;
  try { got = Buffer.from(sig, 'base64url'); } catch (e) { return null; }
  if (got.length !== expect.length || !crypto.timingSafeEqual(got, expect)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!data || typeof data.u !== 'string' || !(data.exp > Date.now())) return null;
  return data;
}

function bearer(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

module.exports = { issueToken, verifyToken, passwordVersion, bearer, TTL_MS };
