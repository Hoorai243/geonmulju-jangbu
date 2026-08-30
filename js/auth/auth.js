// 로그인/보안 — 백업 비밀번호(안전하게 해싱 저장) + 지문/생체(WebAuthn).
// 통신은 HTTPS 전제. 비밀번호 원문은 절대 저장하지 않는다.
import * as db from '../db.js';

const b64 = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  dec: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

/* ---------- 비밀번호 (PBKDF2-SHA256 해싱) ---------- */
const ITER = 200000;
async function derive(pw, saltBytes, iter = ITER) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: iter, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

export async function hasAccount() {
  return !!(await db.metaGet('auth'));
}

export async function setPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pw, salt);
  await db.metaSet('auth', { salt: b64.enc(salt), hash: b64.enc(hash), iter: ITER, createdAt: new Date().toISOString() });
}

export async function verifyPassword(pw) {
  const rec = await db.metaGet('auth');
  if (!rec) return false;
  const salt = b64.dec(rec.salt);
  const hash = await derive(pw, salt, rec.iter || ITER);
  const stored = b64.dec(rec.hash);
  if (hash.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ stored[i]; // 상수시간 비교
  return diff === 0;
}

export async function changePassword(oldPw, newPw) {
  if (!(await verifyPassword(oldPw))) return false;
  await setPassword(newPw);
  return true;
}

/* ---------- 세션 ---------- */
const SESSION_KEY = 'jangbu.unlocked';
export function isUnlocked() { return sessionStorage.getItem(SESSION_KEY) === '1'; }
export function unlock() { sessionStorage.setItem(SESSION_KEY, '1'); }
export function lock() { sessionStorage.removeItem(SESSION_KEY); }

/* ---------- 지문/생체 ---------- */
// 서버 없이 "이 기기에서 생체확인이 되면 잠금 해제"로 사용.
// 웹/홈화면(PWA): WebAuthn. 안드로이드 앱(WebView): 네이티브 지문(BiometricPrompt) — WebView 는 WebAuthn 미지원.

// 안드로이드 앱에서만 BiometricAuth 플러그인(브리지) 반환, 아니면 falsy
function nativeBio() {
  const c = typeof window !== 'undefined' ? window.Capacitor : undefined;
  if (!(c && c.isNativePlatform && c.isNativePlatform())) return null;
  // 브리지에 등록된 네이티브 플러그인 이름은 'BiometricAuthNative' (JS 래퍼 없이 직접 호출)
  return (c.Plugins && c.Plugins.BiometricAuthNative) || null;
}
const nativeAuthOpts = (reason) => ({
  reason,
  androidTitle: '건물주 장부',
  androidSubtitle: reason,
  cancelTitle: '취소',
  allowDeviceCredential: true, // 지문 실패 시 폰 잠금(PIN/패턴)으로도 확인 가능
});

export function biometricSupported() {
  if (nativeBio()) return true;
  return !!(window.PublicKeyCredential && navigator.credentials);
}
export async function biometricAvailable() {
  const nb = nativeBio();
  if (nb) { try { const r = await nb.checkBiometry(); return !!(r && (r.isAvailable || r.strongBiometryIsAvailable)); } catch { return false; } }
  if (!biometricSupported()) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch { return false; }
}
export async function hasBiometric() {
  if (nativeBio()) return !!(await db.metaGet('biometric-native'));
  return !!(await db.metaGet('webauthn'));
}

export async function registerBiometric(displayName = '건물주') {
  const nb = nativeBio();
  if (nb) {
    const r = await nb.checkBiometry();
    if (!(r && (r.isAvailable || r.strongBiometryIsAvailable))) throw new Error('이 기기에서 지문/생체를 쓸 수 없어요. 휴대폰 설정에서 지문을 먼저 등록해 주세요.');
    await nb.internalAuthenticate(nativeAuthOpts('앱 잠금 해제에 쓸 지문을 등록해요'));
    await db.metaSet('biometric-native', { createdAt: new Date().toISOString() });
    return true;
  }
  if (!biometricSupported()) throw new Error('이 기기는 지문/생체 등록을 지원하지 않아요.');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: '건물주 장부' },
      user: { id: userId, name: displayName, displayName },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!cred) throw new Error('등록이 취소됐어요.');
  await db.metaSet('webauthn', { id: b64.enc(cred.rawId), createdAt: new Date().toISOString() });
  return true;
}

export async function loginBiometric() {
  const nb = nativeBio();
  if (nb) {
    if (!(await db.metaGet('biometric-native'))) throw new Error('등록된 지문/생체가 없어요.');
    await nb.internalAuthenticate(nativeAuthOpts('앱 잠금을 풀어요')); // 실패/취소 시 예외
    unlock();
    return true;
  }
  const rec = await db.metaGet('webauthn');
  if (!rec) throw new Error('등록된 지문/생체가 없어요.');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type: 'public-key', id: b64.dec(rec.id) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  if (!assertion) throw new Error('확인에 실패했어요.');
  unlock();
  return true;
}

export async function removeBiometric() {
  if (nativeBio()) { await db.del('meta', 'biometric-native'); return; }
  await db.del('meta', 'webauthn');
}
