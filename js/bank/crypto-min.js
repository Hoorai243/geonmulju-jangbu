// 최소 암호 도구 — SHA-1 + AES(ECB). 잠긴 은행 엑셀(표준 암호화) 복호화용.
// 순수 JS(외부 라이브러리 없음, 오프라인 동작). Node 기본 암호기와 대조 검증됨.

/* ---------------- SHA-1 (동기) ---------------- */
export function sha1(bytes) {
  const ml = bytes.length * 8;
  // 패딩
  const withOne = bytes.length + 1;
  const total = ((withOne + 8 + 63) & ~63);
  const msg = new Uint8Array(total);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  // 길이(비트) 빅엔디안 64비트 — 상위 32비트는 0 가정(파일 크기 범위 내)
  const dv = new DataView(msg.buffer);
  dv.setUint32(total - 4, ml >>> 0, false);
  dv.setUint32(total - 8, Math.floor(ml / 0x100000000), false);

  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
  const w = new Int32Array(80);
  const rol = (x, n) => (x << n) | (x >>> (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const t = (rol(a, 5) + f + e + k + w[i]) | 0;
      e = d; d = c; c = rol(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  ov.setInt32(0, h0, false); ov.setInt32(4, h1, false); ov.setInt32(8, h2, false); ov.setInt32(12, h3, false); ov.setInt32(16, h4, false);
  return out;
}

/* ---------------- AES (ECB) ---------------- */
const SBOX = new Uint8Array(256), INV = new Uint8Array(256);
(function () {
  let p = 1, q = 1;
  do {
    p = p ^ (p << 1) ^ (p & 0x80 ? 0x11B : 0);
    p &= 0xFF;
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xFF;
    if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4)) ^ 0x63;
    SBOX[p] = x & 0xFF;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
})();
const xtime = (a) => ((a << 1) ^ (a & 0x80 ? 0x11B : 0)) & 0xFF;
const mul = (a, b) => { let r = 0; for (let i = 0; i < 8; i++) { if (b & 1) r ^= a; const hi = a & 0x80; a = (a << 1) & 0xFF; if (hi) a ^= 0x1B; b >>= 1; } return r & 0xFF; };
const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B, 0x36, 0x6C, 0xD8, 0xAB, 0x4D];

function expandKey(key) {
  const Nk = key.length / 4, Nr = Nk + 6;
  const w = new Array(4 * (Nr + 1));
  for (let i = 0; i < Nk; i++) w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
  for (let i = Nk; i < w.length; i++) {
    let t = w[i - 1].slice();
    if (i % Nk === 0) {
      t = [t[1], t[2], t[3], t[0]].map((b) => SBOX[b]);
      t[0] ^= RCON[i / Nk - 1];
    } else if (Nk > 6 && i % Nk === 4) {
      t = t.map((b) => SBOX[b]);
    }
    w[i] = w[i - Nk].map((b, j) => b ^ t[j]);
  }
  return { w, Nr };
}

function decryptBlock(inp, ks) {
  const { w, Nr } = ks;
  let s = [];
  for (let i = 0; i < 16; i++) s[i] = inp[i];
  const addRK = (r) => { for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) s[c * 4 + row] ^= w[r * 4 + c][row]; };
  const invSub = () => { for (let i = 0; i < 16; i++) s[i] = INV[s[i]]; };
  const invShift = () => {
    const t = s.slice();
    for (let r = 1; r < 4; r++) for (let c = 0; c < 4; c++) s[c * 4 + r] = t[((c - r + 4) % 4) * 4 + r];
  };
  const invMix = () => {
    for (let c = 0; c < 4; c++) {
      const a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
      s[c * 4] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
      s[c * 4 + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
      s[c * 4 + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
      s[c * 4 + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
    }
  };
  addRK(Nr);
  for (let r = Nr - 1; r >= 1; r--) { invShift(); invSub(); addRK(r); invMix(); }
  invShift(); invSub(); addRK(0);
  return s;
}

export function aesEcbDecrypt(key, data) {
  const ks = expandKey(key);
  const out = new Uint8Array(data.length);
  const block = new Uint8Array(16);
  for (let off = 0; off < data.length; off += 16) {
    for (let i = 0; i < 16; i++) block[i] = data[off + i];
    const d = decryptBlock(block, ks);
    for (let i = 0; i < 16; i++) out[off + i] = d[i];
  }
  return out;
}

// 표준(v4.2) 암호 키 유도 (MS-OFFCRYPTO)
const le4 = (n) => { const b = new Uint8Array(4); b[0] = n & 255; b[1] = (n >>> 8) & 255; b[2] = (n >>> 16) & 255; b[3] = (n >>> 24) & 255; return b; };
const cat = (...arrs) => { let n = 0; arrs.forEach((a) => n += a.length); const o = new Uint8Array(n); let p = 0; arrs.forEach((a) => { o.set(a, p); p += a.length; }); return o; };
export function deriveStandardKey(passwordUtf16le, salt, keyBytes) {
  let h = sha1(cat(salt, passwordUtf16le));
  for (let i = 0; i < 50000; i++) h = sha1(cat(le4(i), h));
  h = sha1(cat(h, le4(0)));
  const b1 = new Uint8Array(64).fill(0x36), b2 = new Uint8Array(64).fill(0x5c);
  for (let i = 0; i < h.length; i++) { b1[i] ^= h[i]; b2[i] ^= h[i]; }
  return cat(sha1(b1), sha1(b2)).slice(0, keyBytes);
}
export function utf16le(str) {
  const o = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); o[i * 2] = c & 255; o[i * 2 + 1] = (c >> 8) & 255; }
  return o;
}
export const bytesEqual = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
