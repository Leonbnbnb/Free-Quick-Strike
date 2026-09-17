// 极简静态文件服务器（开发用）
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

// 用户存档落盘位置（本地文件夹）
const DATA_DIR = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

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

// 用户数据接口：GET 读取，POST 覆盖保存
function handleUsersApi(req, res) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ users: readUsers() }));
    return;
  }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => {
      body += c;
      if (body.length > 1e6) req.destroy();   // 存档不会这么大
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!Array.isArray(data.users)) throw new Error('bad payload');
        writeUsers(data.users);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
    });
    return;
  }
  res.writeHead(405).end();
}

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/api/users') { handleUsersApi(req, res); return; }
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
