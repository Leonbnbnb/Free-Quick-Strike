const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const W = 256, H = 256;

function inCircle(px, py, cx, cy, r) {
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

// 简单的士兵图标：深绿底 + 蓝色头 + 头盔 + 眼睛
function colorAt(x, y) {
  let r = 0x1f, g = 0x2a, b = 0x1f; // 背景
  if (inCircle(x, y, 128, 134, 74)) { r = 0x4d; g = 0xa3; b = 0xff; }        // 头
  if (inCircle(x, y, 128, 92, 52)) { r = 0x3a; g = 0x7b; b = 0xd5; }         // 头盔
  if (inCircle(x, y, 106, 130, 11) || inCircle(x, y, 150, 130, 11)) { r = 255; g = 255; b = 255; } // 眼白
  if (inCircle(x, y, 108, 132, 5) || inCircle(x, y, 148, 132, 5)) { r = 0x11; g = 0x11; b = 0x11; } // 瞳孔
  return [r, g, b, 255];
}

// 构造原始扫描线（每行前置 filter=0）
const raw = Buffer.alloc(H * (1 + W * 4));
let off = 0;
for (let y = 0; y < H; y++) {
  raw[off++] = 0;
  for (let x = 0; x < W; x++) {
    const [r, g, b, a] = colorAt(x, y);
    raw[off++] = r; raw[off++] = g; raw[off++] = b; raw[off++] = a;
  }
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // 位深
ihdr[9] = 6;  // 颜色类型 RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const idat = zlib.deflateSync(raw);

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = path.join(__dirname, 'build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
console.log('icon.png written to build/icon.png');
