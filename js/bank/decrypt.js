// 잠긴(암호화된) 엑셀 복호화 — ECMA-376 "표준(v4.2)" 방식(AES + SHA-1).
// 토스·카카오 등이 주는 파일이 이 방식. 신식(agile, v4.4)은 아직 미지원.
// window.XLSX(SheetJS, CFB 포함)가 로드된 뒤 사용.
import { sha1, aesEcbDecrypt, deriveStandardKey, utf16le, bytesEqual } from './crypto-min.js';

const toU8 = (c) => (c instanceof Uint8Array ? c : new Uint8Array(c));

// bytes(Uint8Array) + 비밀번호 → 복호화된 xlsx(zip) bytes. 실패 시 code 붙은 에러.
export function decryptStandardXlsx(bytes, password) {
  const XLSX = window.XLSX;
  if (!XLSX || !XLSX.CFB) { const e = new Error('복호화 도구를 불러오지 못했어요.'); e.code = 'ENCRYPTED'; throw e; }
  const cfb = XLSX.CFB.read(bytes, { type: 'array' });
  const infoEntry = XLSX.CFB.find(cfb, 'EncryptionInfo');
  const pkgEntry = XLSX.CFB.find(cfb, 'EncryptedPackage');
  if (!infoEntry || !pkgEntry) { const e = new Error('암호화 정보를 찾지 못했어요.'); e.code = 'ENCRYPTED'; throw e; }

  const info = toU8(infoEntry.content);
  const dv = new DataView(info.buffer, info.byteOffset, info.byteLength);
  const vMaj = dv.getUint16(0, true), vMin = dv.getUint16(2, true);
  if (!(vMaj === 4 && (vMin === 2 || vMin === 3))) { const e = new Error('이 파일의 잠금 방식(신식)은 아직 못 풀어요.'); e.code = 'ENC_UNSUPPORTED'; throw e; }

  const hdrSize = dv.getUint32(8, true);
  const hStart = 12;
  const keySize = dv.getUint32(hStart + 16, true); // flags,sizeExtra,algId,algIdHash,keySize
  let o = hStart + hdrSize;
  const saltSize = dv.getUint32(o, true); o += 4;
  const salt = info.slice(o, o + saltSize); o += saltSize;
  const encVerifier = info.slice(o, o + 16); o += 16;
  const verifierHashSize = dv.getUint32(o, true); o += 4;
  const encHashLen = Math.ceil(verifierHashSize / 16) * 16;
  const encVerifierHash = info.slice(o, o + encHashLen);

  const keyBytes = keySize / 8;
  const key = deriveStandardKey(utf16le(password), salt, keyBytes);

  // 비밀번호 검증
  const verifier = aesEcbDecrypt(key, encVerifier);
  const vh = aesEcbDecrypt(key, encVerifierHash).slice(0, verifierHashSize);
  if (!bytesEqual(sha1(verifier), vh)) { const e = new Error('비밀번호가 맞지 않아요.'); e.code = 'PW_WRONG'; throw e; }

  // 패키지 복호화
  const pkg = toU8(pkgEntry.content);
  const total = new DataView(pkg.buffer, pkg.byteOffset, pkg.byteLength).getUint32(0, true);
  const dec = aesEcbDecrypt(key, pkg.slice(8)).slice(0, total);
  return dec;
}
