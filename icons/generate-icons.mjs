// 앱 아이콘 생성기 — 외부 라이브러리 없이 순수 Node(zlib)로 PNG를 그린다.
// 실행: node icons/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = dirname(fileURLToPath(import.meta.url));

// ---- 색 (DESIGN.md 토큰과 일치) ----
const C = {
  paper: [0xf6, 0xf4, 0xef, 255],
  primary: [0x1f, 0x5f, 0xa8, 255],
  primaryDark: [0x17, 0x49, 0x7f, 255],
  white: [0xff, 0xff, 0xff, 255],
  ink2: [0x9a, 0x96, 0x8e, 255],
  green: [0x2e, 0x9e, 0x48, 255],
  amber: [0xe0, 0xa4, 0x00, 255],
};

// ---- 캔버스 ----
function canvas(size) {
  return { size, data: new Uint8Array(size * size * 4) };
}
function blend(cv, x, y, [r, g, b, a]) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= cv.size || y >= cv.size) return;
  const i = (y * cv.size + x) * 4;
  const af = a / 255, ia = 1 - af;
  cv.data[i] = r * af + cv.data[i] * ia;
  cv.data[i + 1] = g * af + cv.data[i + 1] * ia;
  cv.data[i + 2] = b * af + cv.data[i + 2] * ia;
  cv.data[i + 3] = Math.max(cv.data[i + 3], a);
}
function fillRect(cv, x0, y0, w, h, color) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) blend(cv, x0 + x, y0 + y, color);
}
// 라운드 사각형 (안티에일리어싱 살짝)
function roundRect(cv, x0, y0, w, h, r, color) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inside = 1;
      const corners = [[r, r], [w - r, r], [r, h - r], [w - r, h - r]];
      const px = x + 0.5, py = y + 0.5;
      if (px < r && py < r) inside = cornerA(px, py, corners[0], r);
      else if (px > w - r && py < r) inside = cornerA(px, py, corners[1], r);
      else if (px < r && py > h - r) inside = cornerA(px, py, corners[2], r);
      else if (px > w - r && py > h - r) inside = cornerA(px, py, corners[3], r);
      if (inside <= 0) continue;
      blend(cv, x0 + x, y0 + y, [color[0], color[1], color[2], color[3] * inside]);
    }
  }
}
function cornerA(px, py, [cx, cy], r) {
  const d = Math.hypot(px - cx, py - cy);
  if (d <= r - 1) return 1;
  if (d >= r + 1) return 0;
  return (r + 1 - d) / 2;
}
function fillCircle(cv, cx, cy, r, color) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      let a = 0;
      if (d <= r - 1) a = 1; else if (d < r + 1) a = (r + 1 - d) / 2;
      if (a > 0) blend(cv, x, y, [color[0], color[1], color[2], color[3] * a]);
    }
  }
}
// 두꺼운 선(체크마크용)
function thickLine(cv, x1, y1, x2, y2, width, color) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) * 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    fillCircle(cv, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, width / 2, color);
  }
}

function drawIcon(size, { maskable }) {
  const cv = canvas(size);
  const S = size;
  // 배경: 파랑. maskable이면 꽉 채우고, 아니면 라운드 사각형.
  if (maskable) fillRect(cv, 0, 0, S, S, C.primary);
  else roundRect(cv, 0, 0, S, S, S * 0.22, C.primary);

  // 안전 영역 안에 장부(흰 책) 배치
  const safe = maskable ? 0.72 : 0.86; // maskable은 여백 더
  const bw = S * 0.5 * (safe / 0.86);
  const bh = bw * 1.18;
  const bx = (S - bw) / 2;
  const by = (S - bh) / 2 - S * 0.02;

  // 책 그림자
  roundRect(cv, bx + S * 0.015, by + S * 0.02, bw, bh, S * 0.04, [0, 0, 0, 40]);
  // 책 본체(흰색)
  roundRect(cv, bx, by, bw, bh, S * 0.04, C.white);
  // 왼쪽 제본선
  fillRect(cv, bx + bw * 0.14, by, Math.max(2, S * 0.008), bh, [0xe0, 0xdc, 0xd4, 255]);

  // 장부 줄들
  const lineX = bx + bw * 0.26;
  const lineW = bw * 0.56;
  const lh = Math.max(2, S * 0.018);
  const rows = [0.24, 0.42, 0.60];
  const rowColors = [C.ink2, C.ink2, C.amber];
  rows.forEach((ry, i) => {
    roundRect(cv, lineX, by + bh * ry, lineW, lh, lh / 2, rowColors[i]);
  });

  // 완납 체크(초록 원 + 흰 체크) — 오른쪽 아래
  const cr = S * 0.13;
  const ccx = bx + bw * 0.86;
  const ccy = by + bh * 0.86;
  fillCircle(cv, ccx, ccy, cr * 1.12, C.white); // 흰 테두리
  fillCircle(cv, ccx, ccy, cr, C.green);
  const w = Math.max(3, S * 0.028);
  thickLine(cv, ccx - cr * 0.45, ccy + cr * 0.05, ccx - cr * 0.08, ccy + cr * 0.42, w, C.white);
  thickLine(cv, ccx - cr * 0.08, ccy + cr * 0.42, ccx + cr * 0.5, ccy - cr * 0.4, w, C.white);

  return cv;
}

// ---- PNG 인코딩 ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(cv) {
  const { size, data } = cv;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    data.copy ? null : null;
    Buffer.from(data.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function save(name, cv) {
  const p = join(outDir, name);
  writeFileSync(p, encodePNG(cv));
  console.log('만듦:', name);
}

save('icon-192.png', drawIcon(192, { maskable: false }));
save('icon-512.png', drawIcon(512, { maskable: false }));
save('icon-maskable-512.png', drawIcon(512, { maskable: true }));
save('apple-touch-icon-180.png', drawIcon(180, { maskable: false }));
save('favicon-64.png', drawIcon(64, { maskable: false }));
console.log('완료.');
